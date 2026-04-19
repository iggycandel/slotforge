// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/ai-single
// Generates (or regenerates) a single asset.
// Used by:
//   1. The "Regenerate" button on individual asset tiles in AssetsPanel
//   2. The right-click "Generate with AI" context menu in the Canvas editor
//
// Request body:
//   { asset_type: AssetType, theme: string, project_id: string,
//     style_id?: string, custom_prompt?: string }
//
// Response:
//   { asset: GeneratedAsset }  on success
//   { error: string }          on failure
// ─────────────────────────────────────────────────────────────────────────────

import { auth }               from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z }                  from 'zod'
import { buildPrompt }        from '@/lib/ai/promptBuilder'
import { generateImage }      from '@/lib/ai'
import { uploadGeneratedAsset } from '@/lib/storage/assets'
import type { AssetType, ProjectMeta } from '@/types/assets'
import { getOrgPlan, canUseAI,
         getOrgCreditStatus,
         consumeCredits }       from '@/lib/billing/subscription'
import { assertProjectAccess } from '@/lib/supabase/authz'

// Extend timeout for single-asset generation (~15-30 s)
export const maxDuration = 60

// ─── Valid asset type list (matches types/assets.ts) ────────────────────────

const VALID_ASSET_TYPES: AssetType[] = [
  'background_base', 'background_bonus',
  'symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4', 'symbol_high_5',
  'symbol_low_1',  'symbol_low_2',  'symbol_low_3',  'symbol_low_4',  'symbol_low_5',
  'symbol_wild', 'symbol_scatter',
  'logo', 'character',
  'reel_frame', 'spin_button', 'jackpot_label',
]

// ─── Request schema ──────────────────────────────────────────────────────────

const RequestSchema = z.object({
  asset_type:    z.enum(VALID_ASSET_TYPES as [AssetType, ...AssetType[]]),
  theme:         z.string().max(200).trim().default(''),
  project_id:    z.string().uuid(),
  provider:      z.enum(['runway', 'openai', 'auto']).optional().default('auto'),
  style_id:      z.string().optional(),
  // If provided, overrides the assembled prompt entirely (user-edited prompt from the Prompt Editor)
  custom_prompt: z.string().max(2000).optional(),
  // Rich project meta from the Theme panel — fed into prompt building
  project_meta:  z.record(z.unknown()).optional(),
})

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Plan gate — AI generation requires Freelancer or Studio.
  // NOTE: The app routes by userId (no Clerk orgs), so orgId is always null.
  // Use effectiveId = orgId ?? userId so the gate always runs.
  const effectiveId = orgId ?? userId
  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan, message: 'AI generation requires a Freelancer or Studio plan.' },
      { status: 403 }
    )
  }
  const credits = await getOrgCreditStatus(effectiveId)
  if (!credits.canGenerate) {
    return NextResponse.json(
      { error: 'credits_exhausted', remaining: 0, message: 'No AI credits remaining this month.' },
      { status: 402 }
    )
  }

  // Parse and validate
  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { asset_type, theme, project_id, provider, style_id, custom_prompt, project_meta } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    // ── Build prompt ──────────────────────────────────────────────────────────
    // Normal path: buildPrompt assembles the full prompt from templates + style + meta.
    const built = buildPrompt(asset_type, theme, style_id, project_meta as ProjectMeta | undefined)
    if (custom_prompt) {
      // Replace the template portion with the user's custom prompt while still
      // applying the master quality requirements (handled inside buildPrompt).
      // We override the prompt field directly.
      built.prompt = custom_prompt
    }

    // ── Generate image ────────────────────────────────────────────────────────
    const generated = await generateImage(asset_type, built, provider)

    // ── Upload to Supabase Storage + insert DB record ─────────────────────────
    const asset = await uploadGeneratedAsset(
      project_id,
      asset_type,
      generated.url,
      theme,
      built.prompt,
      generated.provider
    )

    // Consume 1 credit for the successfully generated image.
    // If this fails (DB outage etc.) we surface the error instead of silently
    // granting a free generation — the asset is already created, so the user
    // sees a 500 but support can reconcile from logs.
    try {
      await consumeCredits(effectiveId, 1)
    } catch (err) {
      console.error('[ai-single] Failed to consume credit after generation:', err)
      return NextResponse.json(
        { error: 'credit_tracking_failed', asset, message: 'Asset generated but credit tracking failed. Contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ asset })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    console.error(`[ai-single] ${asset_type} failed:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
