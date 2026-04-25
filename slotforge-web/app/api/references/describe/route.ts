// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/references/describe
//
// The user uploads a reference image ("match this aesthetic"). We can't
// feed gpt-image-1 an image directly — the Images API only takes a text
// prompt — so instead we hand the image to GPT-4o vision and ask for a
// concise STYLE description (palette, material, lighting, composition,
// form language) with NO subject matter. That description is then injected
// into the prompt builder's context layer on every generation for this
// project (or for a single asset, in the popup path).
//
// Why "no subject matter"? If a user drops a reference of a red dragon,
// every symbol in their slot would come back with a red dragon in it.
// We only want the aesthetic properties of the image to carry over. The
// prompt we send GPT-4o is tuned heavily for this.
//
// Costs 1 AI credit, same gate as /api/ai-single. Descriptions are
// deterministic enough that callers can safely cache them client-side,
// keyed by a content hash — we don't maintain a server-side cache here.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                       from '@clerk/nextjs/server'
import { NextRequest, NextResponse }  from 'next/server'
import { z }                          from 'zod'
import { callOpenAIVision }           from '@/lib/ai/openaiVision'
import { getOrgPlan,
         canUseAI,
         getOrgCreditStatus,
         consumeCredits }             from '@/lib/billing/subscription'
import { assertProjectAccess }        from '@/lib/supabase/authz'

// Vision on a single small image is snappy (~3-6 s). Short ceiling
// because this runs while the user is watching the upload spinner.
export const maxDuration = 20

// Same validator as /api/typography/generate — data URLs or https:// URLs.
const IMAGE_URL_RE = /^(data:image\/(?:png|jpe?g|webp|gif)(?:;base64)?,|https:\/\/)/

const RequestSchema = z.object({
  project_id: z.string().uuid(),
  image:      z.string().regex(IMAGE_URL_RE, { message: 'image must be https:// or data:image URL' }),
  /** Optional seed — lets the caller pass extra context like "this is a
   *  logo", "this is a background", so the description biases toward
   *  palette / depth / detail-density appropriate to that kind of asset.
   *  Free text, capped to 80 chars server-side to limit injection surface. */
  hint:       z.string().max(80).optional(),
  /** Which describe-pass tuning to use. 'reference' is the original
   *  per-image style-snapshot used for moodboard refs (focus on a single
   *  image's properties). 'art_bible' tunes the prompt for a project's
   *  ANCHOR asset — the description should read as "this is the visual
   *  contract every other asset must match", which calls for slightly
   *  more authoritative + comprehensive language. */
  kind:       z.enum(['reference', 'art_bible']).optional(),
})

function buildSystemPrompt(kind: 'reference' | 'art_bible'): string {
  if (kind === 'art_bible') {
    return (
      `You are an expert art director writing a one-paragraph "art bible" ` +
      `for a multi-asset slot game project. The image you are given is the ` +
      `ANCHOR asset — every other asset in the project needs to match it. ` +
      `Your description becomes the visual contract: it is injected into ` +
      `every subsequent image-generation prompt for this project, so it ` +
      `must capture the project's signature visual language with enough ` +
      `specificity that a different artist could reproduce the look without ` +
      `seeing this image. ` +
      `DO NOT describe the subject matter, characters, props, or narrative ` +
      `of the anchor image. Focus strictly on TRANSFERABLE aesthetic ` +
      `qualities: palette, material response, lighting language, detail ` +
      `density, edge / line treatment, rendering technique, and mood.`
    )
  }
  return (
    `You are an expert art director analysing a reference image to extract its ` +
    `STYLISTIC properties only. Your output is a short concrete description ` +
    `that another artist could use to produce NEW artwork in the same visual ` +
    `language — DO NOT describe the subject matter, the characters, the props ` +
    `or the narrative of the image. Focus strictly on aesthetic qualities: ` +
    `palette, material response, lighting quality and direction, level of ` +
    `detail, edge treatment, line weight, composition conventions, rendering ` +
    `technique, and overall mood.`
  )
}

function buildUserPrompt(kind: 'reference' | 'art_bible', hint?: string): string {
  const isBible = kind === 'art_bible'
  const lengthHint = isBible ? '90–130 words' : '70–110 words'
  const opener    = isBible
    ? `Write a one-paragraph "art bible" (${lengthHint}) capturing the visual
language of the attached anchor image. This will be injected verbatim into
every subsequent image-generation prompt for this project — so it needs to
be self-contained, transferable, and concrete enough that another artist
working blind could reproduce the look.`
    : `Analyse the attached reference image and return ONE paragraph (${lengthHint})
describing its STYLE only. No subject matter, no character names, no
narrative — only aesthetic properties a different artist could copy.`
  return (
`${opener}

Cover these dimensions with concrete, specific language:
  • Palette — dominant hues, temperature, saturation range, accent colours.
  • Material + surface — matte vs glossy, PBR vs painterly vs flat, any
    distinguishing texture language.
  • Lighting — key direction, hardness, contrast ratio, notable highlights
    and shadow behaviour.
  • Detail + line — density of ornament, presence / weight of outlines,
    edge softness or hardness.
  • Rendering technique — e.g. cel-shaded, photorealistic PBR, low-poly
    facets, watercolour washes, pixel-perfect grid, vector flats. Do NOT
    use the phrase "brush strokes".
  • Composition + mood — framing conventions, negative space, overall tone
    (opulent / gritty / whimsical / cinematic / etc).

${hint ? `CONTEXT: ${hint}.` : ''}

Return PLAIN PROSE. No bullets, no markdown, no JSON. Start with a colour
or material observation — do not begin with "This image shows…".`)
}

export async function POST(req: NextRequest) {
  // Auth + plan + credits — same contract as /api/ai-single so a user who
  // can't generate can't burn cycles on reference descriptions either.
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const effectiveId = orgId ?? userId

  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Reference descriptions require a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }
  const credits = await getOrgCreditStatus(effectiveId)
  if (!credits.canGenerate) {
    return NextResponse.json(
      { error: 'credits_exhausted', remaining: 0,
        message: 'No AI credits remaining this month.' },
      { status: 402 },
    )
  }

  // Parse + validate
  const body   = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { project_id, image, hint, kind: rawKind } = parsed.data
  const kind = rawKind ?? 'reference'

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const vision = await callOpenAIVision({
      // Full gpt-4o here — this is a one-shot style summariser and we want
      // the description to be strong. The call's small (~100 output tokens
      // on a detail:low input image) so the cost stays close to
      // gpt-4o-mini at typography-spec volumes.
      model:    'gpt-4o',
      system:   buildSystemPrompt(kind),
      prompt:   buildUserPrompt(kind, hint),
      images:   [{ url: image, detail: 'low' }],
      // art_bible runs slightly longer (90-130 words vs 70-110). 320
      // tokens is comfortable headroom for the longer flavour without
      // letting the reference flavour drift over budget.
      maxTokens: kind === 'art_bible' ? 320 : 260,
      // Plain prose output — JSON mode would force the model to wrap the
      // paragraph in a useless object. Keep it flat.
      jsonMode: false,
    })

    const description = (vision.text || '').trim()
    if (!description) {
      return NextResponse.json({ error: 'empty_description' }, { status: 500 })
    }

    // Consume credit on success.
    try {
      await consumeCredits(effectiveId, 1)
    } catch (err) {
      console.error('[references/describe] Failed to consume credit:', err)
      return NextResponse.json(
        { error: 'credit_tracking_failed', description,
          message: 'Description generated but credit tracking failed. Contact support.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      description,
      meta: {
        model: vision.model,
        usage: vision.usage,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reference describe failed'
    console.error('[references/describe] failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
