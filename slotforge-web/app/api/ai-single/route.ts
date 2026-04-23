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
import { buildPrompt, buildFeatureSlotPrompt, isFeatureSlotKey } from '@/lib/ai/promptBuilder'
import { generateImage }      from '@/lib/ai'
import { uploadGeneratedAsset } from '@/lib/storage/assets'
import { ASSET_TYPES } from '@/types/assets'
import type { AssetType, ProjectMeta } from '@/types/assets'
import { getOrgPlan, canUseAI,
         getOrgCreditStatus,
         consumeCredits }       from '@/lib/billing/subscription'
import { assertProjectAccess } from '@/lib/supabase/authz'

// Extend timeout for single-asset generation (~15-30 s)
export const maxDuration = 60

// ─── Request schema ──────────────────────────────────────────────────────────
// asset_type accepts either:
//   - a legacy AssetType from types/assets.ts (symbol_high_1 through _8,
//     symbol_low_1 through _8, symbol_wild, symbol_scatter, symbol_special_3
//     through _6, background_base/bonus, logo, character, reel_frame,
//     spin_button, jackpot_label). The canonical list lives in ASSET_TYPES
//     — previously this route had its own hand-maintained copy that got
//     stale (capped at _5) and rejected legit 6/7/8 tiers as "Invalid".
//   - a feature slot key like "bonuspick.bg" / "freespins.intro_banner"
// The prompt path branches on isFeatureSlotKey().

const VALID_ASSET_TYPE_SET = new Set<string>(ASSET_TYPES as readonly string[])

const RATIO_VALUES = ['1:1','3:2','2:3','16:9','9:16','3:1','4:1','1:4'] as const

const RequestSchema = z.object({
  asset_type:    z.string().refine(
    v => VALID_ASSET_TYPE_SET.has(v) || isFeatureSlotKey(v),
    { message: 'Unknown asset_type (not a legacy AssetType or registry feature slot)' }
  ),
  theme:         z.string().max(200).trim().default(''),
  project_id:    z.string().uuid(),
  provider:      z.enum(['runway', 'openai', 'auto']).optional().default('auto'),
  style_id:      z.string().optional(),
  // User-supplied prompt text. Mode controls how it merges with the
  // composed layers:
  //   replace (default, legacy): replaces layers 1-5 wholesale, negatives
  //                              still fire. Used by Review-Prompts overrides.
  //   append: composes normally, inserts custom_prompt as an extra
  //           context line (§3.3). Preserves project identity + template.
  custom_prompt:      z.string().max(2000).optional(),
  custom_prompt_mode: z.enum(['replace', 'append']).optional(),
  // Rich project meta from the Theme panel — fed into prompt building
  project_meta:  z.record(z.unknown()).optional(),
  // Optional aspect ratio override. When omitted, lib/ai/index.ts chooses
  // the natural default for this asset type (symbols 1:1, logo 3:1, etc.)
  ratio:         z.enum(RATIO_VALUES).optional(),
  // Image quality tier. Defaults to 'medium' when omitted — ~4× cheaper
  // than 'high' and significantly faster (high was hitting Vercel's 60s
  // function cap). Promote to 'high' only for final delivery renders.
  quality:       z.enum(['low','medium','high']).optional(),
  // Symbol-only hints — see BuildPromptOptions. Server ignores them for
  // non-symbol asset types so passing them unconditionally from the
  // popup is safe.
  symbol_frame:  z.boolean().optional(),
  symbol_color:  z.string().max(60).optional(),
  /** Text label to render on a wild / scatter / special symbol. Only
   *  honoured for those categories — high/low symbols are always
   *  text-free. Capped at 20 chars to fit the casino-symbol lettering. */
  symbol_label:  z.string().max(20).optional(),
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

  const { asset_type, theme, project_id, provider, style_id, custom_prompt, custom_prompt_mode, project_meta, ratio, quality, symbol_frame, symbol_color, symbol_label } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    // ── Build prompt ──────────────────────────────────────────────────────────
    // Branches on asset_type: legacy AssetType → buildPrompt; feature slot
    // key ("bonuspick.bg") → buildFeatureSlotPrompt which reuses the same
    // identity anchor + style + meta helpers so feature art stays consistent.
    const isFeature = isFeatureSlotKey(asset_type)
    // All per-call options (symbol hints + custom prompt) flow into the
    // builder via BuildPromptOptions now. buildPrompt / buildFeatureSlot-
    // Prompt handle custom_prompt + mode internally so sections stay
    // coherent (append mode inserts the user's line into the context
    // array; replace mode bypasses layers 1-5). The route no longer
    // post-mutates built.prompt.
    const promptOpts = {
      hasFrame:         symbol_frame,
      primaryColor:     symbol_color || null,
      symbolLabel:      symbol_label || undefined,
      customPrompt:     custom_prompt,
      customPromptMode: custom_prompt_mode,
    }
    const built = isFeature
      ? buildFeatureSlotPrompt(asset_type, theme, style_id, project_meta as ProjectMeta | undefined, promptOpts)
      : buildPrompt(asset_type as AssetType, theme, style_id, project_meta as ProjectMeta | undefined, promptOpts)

    // ── Generate image ────────────────────────────────────────────────────────
    // generateImage / uploadGeneratedAsset both type their asset-key param as
    // AssetType, but they operate on the string underneath. Cast is safe for
    // feature slot keys — the storage layer preserves whatever key we pass.
    const generated = await generateImage(asset_type as AssetType, built, provider, { ratio, quality })

    // ── Upload to Supabase Storage + insert DB record ─────────────────────────
    const asset = await uploadGeneratedAsset(
      project_id,
      asset_type as AssetType,
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
