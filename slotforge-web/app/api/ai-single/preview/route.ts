// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/ai-single/preview
//
// Returns the *composed* prompt + its structured section breakdown for a
// given (asset_type, theme, style_id, project_meta) without calling the
// image model or consuming credits. Powers the "Prompt composition" panel
// in SingleGeneratePopup so the user can see the 5-layer hierarchy the
// model will receive before hitting Generate.
//
// Intentionally light: plan gate + auth are required (same as /ai-single)
// but we skip the credit-exhausted / upload steps since no image is
// produced. The shape of the response is:
//
//   {
//     prompt:         string       // final concatenated prompt
//     negativePrompt: string
//     sections:       PromptSections
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                          from '@clerk/nextjs/server'
import { NextRequest, NextResponse }     from 'next/server'
import { z }                             from 'zod'
import { buildPrompt,
         buildFeatureSlotPrompt,
         isFeatureSlotKey }              from '@/lib/ai/promptBuilder'
import { ASSET_TYPES }                   from '@/types/assets'
import type { AssetType, ProjectMeta }   from '@/types/assets'
import { getOrgPlan, canUseAI }          from '@/lib/billing/subscription'
import { assertProjectAccess }           from '@/lib/supabase/authz'

export const maxDuration = 15

const VALID_ASSET_TYPE_SET = new Set<string>(ASSET_TYPES as readonly string[])

const RequestSchema = z.object({
  asset_type:    z.string().refine(
    v => VALID_ASSET_TYPE_SET.has(v) || isFeatureSlotKey(v),
    { message: 'Unknown asset_type (not a legacy AssetType or registry feature slot)' }
  ),
  theme:         z.string().max(200).trim().default(''),
  project_id:    z.string().uuid(),
  style_id:      z.string().optional(),
  project_meta:  z.record(z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  // Auth + plan gate (same as /ai-single — if the user can't generate
  // they shouldn't be able to peek at the composed prompt either, since
  // it encodes project data they might share externally).
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const effectiveId = orgId ?? userId
  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan, message: 'Prompt preview requires a Freelancer or Studio plan.' },
      { status: 403 }
    )
  }

  // Parse + validate
  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { asset_type, theme, project_id, style_id, project_meta } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const isFeature = isFeatureSlotKey(asset_type)
    const built = isFeature
      ? buildFeatureSlotPrompt(asset_type, theme, style_id, project_meta as ProjectMeta | undefined)
      : buildPrompt(asset_type as AssetType, theme, style_id, project_meta as ProjectMeta | undefined)

    return NextResponse.json({
      prompt:         built.prompt,
      negativePrompt: built.negativePrompt,
      sections:       built.sections ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed'
    console.error(`[ai-single/preview] ${asset_type} failed:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
