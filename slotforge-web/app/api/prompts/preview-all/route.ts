// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/prompts/preview-all
//
// Composes the prompt + sections for a list of asset slot keys in a single
// round-trip. Powers the "Review Prompts" modal so users can scan every
// prompt the model will receive before spending credits, and edit per-slot
// overrides if they spot something off.
//
// Request:
//   {
//     project_id:   string (uuid)
//     asset_keys:   string[]          // legacy types + feature slot keys
//     theme:        string
//     style_id?:    string
//     project_meta?: ProjectMeta
//   }
//
// Response:
//   {
//     prompts: Record<string, { prompt, negativePrompt, sections } | { error }>
//   }
//
// Unknown or invalid keys are returned as individual { error } entries so
// one bad key doesn't fail the whole batch.
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
  project_id:   z.string().uuid(),
  asset_keys:   z.array(z.string()).min(1).max(200),
  theme:        z.string().max(200).trim().default(''),
  style_id:     z.string().optional(),
  project_meta: z.record(z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const effectiveId = orgId ?? userId
  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan, message: 'Prompt review requires a Freelancer or Studio plan.' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { project_id, asset_keys, theme, style_id, project_meta } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const meta = project_meta as ProjectMeta | undefined

  // Compose sequentially (not parallel) — we're CPU-bound on simple string
  // concatenation, no I/O, so parallelism buys nothing and keeps the log
  // timeline readable when debugging. 200 keys × ~1 ms each stays well
  // under the 15 s maxDuration.
  const prompts: Record<string, unknown> = {}
  for (const key of asset_keys) {
    try {
      if (isFeatureSlotKey(key)) {
        const built = buildFeatureSlotPrompt(key, theme, style_id, meta)
        prompts[key] = {
          prompt:         built.prompt,
          negativePrompt: built.negativePrompt,
          sections:       built.sections ?? null,
        }
      } else if (VALID_ASSET_TYPE_SET.has(key)) {
        const built = buildPrompt(key as AssetType, theme, style_id, meta)
        prompts[key] = {
          prompt:         built.prompt,
          negativePrompt: built.negativePrompt,
          sections:       built.sections ?? null,
        }
      } else {
        prompts[key] = { error: 'Unknown asset key' }
      }
    } catch (err) {
      prompts[key] = { error: err instanceof Error ? err.message : 'Compose failed' }
    }
  }

  return NextResponse.json({ prompts })
}
