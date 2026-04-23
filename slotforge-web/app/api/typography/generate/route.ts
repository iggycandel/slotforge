// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/typography/generate
//
// Given one or more game screenshots (data URLs or CDN URLs) plus target
// locales, asks GPT-4o(-mini) to pick a font pairing from the curated
// library and emit a structured typography spec. Consumes 1 AI credit on
// success (same cost model as /api/ai-single; vision calls are ~1 ¢ each
// at gpt-4o-mini, so this comfortably lives inside the existing credit
// bucket).
//
// Why not server-compose the pairing from deterministic rules? The whole
// point is aesthetic matching — the model's job is to *see* the art. We
// could make a toy keyword matcher, but a stylised western-themed screen
// and a cartoon-western screen want different pairings; colour, texture,
// and line style matter.  The pairing choice is constrained to ids from
// FONT_LIBRARY so the model can't invent families that don't exist on
// Google Fonts.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                       from '@clerk/nextjs/server'
import { NextRequest, NextResponse }  from 'next/server'
import { z }                          from 'zod'
import { callOpenAIVision }           from '@/lib/ai/openaiVision'
import { FONT_LIBRARY,
         PAIRING_IDS,
         DEFAULT_PAIRING_ID }         from '@/lib/typography/pairings'
import { getOrgPlan,
         canUseAI,
         getOrgCreditStatus,
         consumeCredits }             from '@/lib/billing/subscription'
import { assertProjectAccess }        from '@/lib/supabase/authz'
import type { TypographySpec,
              TypographyLocale,
              PopupStyleKey }         from '@/types/typography'
import { POPUP_STYLE_KEYS }           from '@/types/typography'

// Vision calls can be slower than text-only (~8–15 s for ~3 screenshots
// at detail:low). Give headroom but don't exceed what Vercel's paid tier
// allows on the same pool as /api/ai-single.
export const maxDuration = 45

// ─── Request schema ──────────────────────────────────────────────────────────
//
// `images` accepts either:
//   - data URLs: "data:image/png;base64,…"
//   - https URLs to existing project assets (OpenAI fetches them server-side)
//
// We validate only that the string starts with data:image/ OR https:// —
// the model tolerates a mix. Cap to 6 images so cost / latency stays
// bounded; more than that doesn't add information for a single game.

const IMAGE_URL_RE = /^(data:image\/(?:png|jpe?g|webp|gif)(?:;base64)?,|https:\/\/)/

const LOCALES = ['en','es','tr','pt','de','fr','it','pl','ru'] as const

const RequestSchema = z.object({
  project_id: z.string().uuid(),
  images:     z.array(z.string().regex(IMAGE_URL_RE, { message: 'image must be https:// or data:image URL' })).min(1).max(6),
  locales:    z.array(z.enum(LOCALES)).min(1).max(9),
  /** Game name — optional, defaults to whatever the model reads off
   *  the screenshot. Stored in the returned spec for the HTML header. */
  game_name:  z.string().max(120).optional(),
  /** Free-text notes — "volatility high, brand = blue+gold, use cursive
   *  for subtitle only". Passed through to the prompt verbatim. */
  notes:      z.string().max(1000).optional(),
  /** Whether to use the cheaper gpt-4o-mini (default) or full gpt-4o.
   *  Exposed so we can A/B without a redeploy; UI may expose a toggle
   *  later but for now every call uses 'mini'. */
  model:      z.enum(['gpt-4o', 'gpt-4o-mini']).optional(),
})

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return (
    `You are an expert slot-game art director and typography specialist. ` +
    `Given one or more game screenshots, identify the visual aesthetic ` +
    `and pick the single best font pairing from a CURATED library. ` +
    `Then emit a structured typography spec with six popup text styles ` +
    `whose colours, gradients, and glows are derived from the art. ` +
    `Return ONLY a JSON object — no prose, no markdown.`
  )
}

function buildUserPrompt(
  locales:   readonly TypographyLocale[],
  gameName?: string,
  notes?:    string,
): string {
  const pairingList = FONT_LIBRARY
    .map(p => `  - "${p.id}" — ${p.name}: ${p.description}`)
    .join('\n')

  return (
`TASK
  1. Analyse the visual aesthetic, theme, palette, and mood of the
     attached screenshot(s).
  2. Pick ONE font pairing from the list below that best matches.
  3. Return a typography JSON spec with six popup text styles tuned
     to the screenshot's actual colours.

FONT PAIRINGS — you MUST pick one of these ids, verbatim:
${pairingList}

LOCALES: ${locales.join(', ')}
${gameName ? `GAME NAME: ${gameName}`  : ''}
${notes    ? `EXTRA NOTES: ${notes}`   : ''}

RETURN ONLY a JSON object of this exact shape (fill every field):

{
  "pairingId": "<one-of-the-ids-above>",
  "rationale": "2–3 sentences explaining why this pairing fits the screenshot",
  "gameTitle": "<the game's apparent title, or a generic label>",
  "baseResolution": { "w": 1920, "h": 1080 },
  "supportedLocales": [${locales.map(l => `"${l}"`).join(', ')}],
  "styles": {
    "popup.title": {
      "size": 72, "letterSpacing": 0.03, "lineHeight": 1.0, "case": "upper",
      "fillGradient": ["#hex","#hex","#hex"], "strokeColor": "#hex", "strokeWidth": 3,
      "dropShadow": { "color": "#000000", "alpha": 0.85, "blur": 4, "offsetY": 3 },
      "glow": [
        { "color": "#hex", "blur": 8,  "alpha": 1.0 },
        { "color": "#hex", "blur": 22, "alpha": 0.75 }
      ],
      "localeOverrides": { "tr": { "letterSpacing": 0.01 }, "es": { "letterSpacing": 0.02 } }
    },
    "popup.subtitle": {
      "size": 34, "letterSpacing": 0.12, "lineHeight": 1.2, "case": "upper",
      "fillColor": "#hex",
      "dropShadow": { "color": "#000000", "alpha": 0.9, "blur": 4, "offsetY": 2 },
      "glow": [
        { "color": "#hex", "blur": 4,  "alpha": 1.0 },
        { "color": "#hex", "blur": 12, "alpha": 0.7 }
      ],
      "localeOverrides": { "tr": { "size": 30, "letterSpacing": 0.08 }, "es": { "size": 32 } }
    },
    "popup.cta": {
      "size": 24, "letterSpacing": 0.22, "lineHeight": 1.2, "case": "upper",
      "fillColor": "#hex",
      "dropShadow": { "color": "#000000", "alpha": 0.85, "blur": 3, "offsetY": 2 },
      "glow": [
        { "color": "#hex", "blur": 3,  "alpha": 1.0 },
        { "color": "#hex", "blur": 12, "alpha": 0.7 }
      ],
      "animation": { "type": "pulseAlpha", "from": 0.65, "to": 1.0, "durationMs": 1600 },
      "localeOverrides": { "tr": { "size": 20 }, "es": { "size": 22 } }
    },
    "popup.body": {
      "size": 22, "letterSpacing": 0.04, "lineHeight": 1.35, "case": "sentence",
      "fillColor": "#hex",
      "dropShadow": { "color": "#000000", "alpha": 0.85, "blur": 3, "offsetY": 1 },
      "glow": [{ "color": "#hex", "blur": 3, "alpha": 0.6 }]
    },
    "popup.numeric": {
      "size": 56, "letterSpacing": 0, "lineHeight": 1.0, "case": "asis",
      "fillGradient": ["#hex","#hex","#hex"], "strokeColor": "#hex", "strokeWidth": 3,
      "dropShadow": { "color": "#000000", "alpha": 0.9, "blur": 4, "offsetY": 3 },
      "glow": [
        { "color": "#hex", "blur": 10, "alpha": 0.9 },
        { "color": "#hex", "blur": 22, "alpha": 0.55 }
      ]
    },
    "popup.smallLabel": {
      "size": 16, "letterSpacing": 0.15, "lineHeight": 1.2, "case": "upper",
      "fillColor": "#hex",
      "dropShadow": { "color": "#000000", "alpha": 0.85, "blur": 2, "offsetY": 1 },
      "glow": [{ "color": "#hex", "blur": 3, "alpha": 0.8 }]
    }
  }
}

COLOUR GUIDANCE
  - Derive colours from the screenshot, not from the pairing's nominal
    genre — a pink-and-mint candy slot should still get pink-and-mint
    gradients even if you pick a "candy-kids" pairing.
  - Title + numeric gradients: bright → mid → dark, vertical top-to-bottom.
  - Drop shadows stay black for contrast. Glow colours match the
    dominant accent/neon hue of the UI.
  - If the screenshot background is bright, raise dropShadow blur to
    6–8 and alpha to 0.95 so copy stays legible.

RETURN ONLY the JSON object, nothing else.`)
}

// ─── Validation + defaults ──────────────────────────────────────────────────

/** Fallback style for each popup key — used when the model omits a
 *  style entirely. Values mirror the shape in buildUserPrompt so the
 *  final spec is always fully populated. */
function defaultStyle(key: PopupStyleKey): Record<string, unknown> {
  const base = {
    'popup.title':      { size: 72, letterSpacing: 0.03, lineHeight: 1.0,  case: 'upper' },
    'popup.subtitle':   { size: 34, letterSpacing: 0.12, lineHeight: 1.2,  case: 'upper' },
    'popup.cta':        { size: 24, letterSpacing: 0.22, lineHeight: 1.2,  case: 'upper' },
    'popup.body':       { size: 22, letterSpacing: 0.04, lineHeight: 1.35, case: 'sentence' },
    'popup.numeric':    { size: 56, letterSpacing: 0,    lineHeight: 1.0,  case: 'asis' },
    'popup.smallLabel': { size: 16, letterSpacing: 0.15, lineHeight: 1.2,  case: 'upper' },
  }[key]
  return {
    ...base,
    fillColor:  '#ffffff',
    dropShadow: { color: '#000000', alpha: 0.85, blur: 3, offsetY: 2 },
  }
}

/** Coerce the model's raw object into a validated TypographySpec. We
 *  accept partials — missing fields get defaults, unknown pairingIds
 *  fall back to DEFAULT_PAIRING_ID — but the shape is guaranteed. */
function normaliseSpec(
  raw:     Record<string, unknown>,
  locales: TypographyLocale[],
): TypographySpec {
  const pairingId = typeof raw.pairingId === 'string' && PAIRING_IDS.has(raw.pairingId)
    ? raw.pairingId
    : DEFAULT_PAIRING_ID

  const rationale = typeof raw.rationale === 'string' ? raw.rationale.trim() : ''
  const gameTitle = typeof raw.gameTitle === 'string' ? raw.gameTitle.trim() : ''

  const baseResolution = (
    raw.baseResolution && typeof raw.baseResolution === 'object'
      ? raw.baseResolution as { w?: unknown; h?: unknown }
      : {}
  )
  const w = typeof baseResolution.w === 'number' ? baseResolution.w : 1920
  const h = typeof baseResolution.h === 'number' ? baseResolution.h : 1080

  // Re-emit supportedLocales in the REQUEST order — clients key on this
  // for the language-switcher tab sequence.
  const supportedLocales = locales

  const rawStyles = (raw.styles && typeof raw.styles === 'object' ? raw.styles : {}) as Record<string, unknown>
  const styles = {} as TypographySpec['styles']
  for (const key of POPUP_STYLE_KEYS) {
    const entry = rawStyles[key]
    styles[key] = (entry && typeof entry === 'object'
      ? entry
      : defaultStyle(key)) as TypographySpec['styles'][typeof key]
  }

  return {
    pairingId,
    rationale,
    gameTitle,
    baseResolution: { w, h },
    supportedLocales,
    styles,
  }
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth — same pattern as /api/ai-single. No Clerk orgs → userId is
  // the effective tenant id for plan/credit lookups.
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const effectiveId = orgId ?? userId

  // Plan gate
  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Typography generation requires a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }

  // Credit gate (1 credit per generation, consumed on success only)
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
  const { project_id, images, locales, game_name, notes, model } = parsed.data

  // Project access
  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── Call OpenAI vision ────────────────────────────────────────────────────
  try {
    const vision = await callOpenAIVision({
      model:    model ?? 'gpt-4o-mini',
      system:   buildSystemPrompt(),
      prompt:   buildUserPrompt(locales as TypographyLocale[], game_name, notes),
      images:   images.map(url => ({ url, detail: 'low' })),
      maxTokens: 3500,
      jsonMode: true,
    })

    // JSON mode guarantees a parseable object — but the model can still
    // emit malformed JSON if it runs into a token cap mid-object. Wrap
    // to convert that into a readable 500 rather than a stack trace.
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(vision.text) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { error: 'Model returned non-JSON',
          // Helps debugging without leaking the full transcript; the
          // user can retry with a clearer screenshot or shorter notes.
          details: vision.text.slice(0, 200) },
        { status: 500 },
      )
    }

    const spec = normaliseSpec(raw, locales as TypographyLocale[])

    // Consume 1 credit on success. Same error handling as /api/ai-single —
    // return 500 if the DB write fails so support can reconcile from logs.
    try {
      await consumeCredits(effectiveId, 1)
    } catch (err) {
      console.error('[typography/generate] Failed to consume credit:', err)
      return NextResponse.json(
        { error: 'credit_tracking_failed', spec,
          message: 'Spec generated but credit tracking failed. Contact support.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      spec,
      // Returning the model + token usage is purely informational —
      // helpful for the UI to show "generated by gpt-4o-mini · 1,842 tokens"
      // under the pairing, and lets us spot unexpected cost spikes.
      meta: {
        model: vision.model,
        usage: vision.usage,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Typography generation failed'
    console.error('[typography/generate] failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
