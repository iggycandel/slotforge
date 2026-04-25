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

// Per-slot custom-prompt override entry. v119 unified shape; legacy
// callers can still pass a bare string per key (treated as mode='replace').
const OverrideEntrySchema = z.union([
  z.string().max(2000),
  z.object({
    text: z.string().max(2000),
    mode: z.enum(['append', 'replace']).optional(),
  }),
])

const RequestSchema = z.object({
  project_id:   z.string().uuid(),
  asset_keys:   z.array(z.string()).min(1).max(200),
  theme:        z.string().max(200).trim().default(''),
  style_id:     z.string().optional(),
  project_meta: z.record(z.unknown()).optional(),
  /** Per-slot custom-prompt overrides. When present, the preview applies
   *  the override at compose time (replace-mode replaces, append-mode
   *  rides as a context line) so the modal shows the FINAL prompt that
   *  will fire — not the composed-without-override that the v107 modal
   *  silently displayed. */
  custom_prompts: z.record(OverrideEntrySchema).optional(),
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

  const { project_id, asset_keys, theme, style_id, project_meta, custom_prompts } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const meta = project_meta as ProjectMeta | undefined

  /** Normalise the per-slot override into the BuildPromptOptions
   *  fields the prompt builder honours. Returns undefined when the
   *  slot has no override or when the text is empty. */
  function optsForKey(key: string): { customPrompt?: string; customPromptMode?: 'append' | 'replace' } | undefined {
    const entry = custom_prompts?.[key]
    if (!entry) return undefined
    if (typeof entry === 'string') {
      const text = entry.trim()
      // Legacy string entries → replace mode (matches the pre-v119
      // pipeline behaviour so old saved overrides keep firing the
      // way they used to).
      return text ? { customPrompt: text, customPromptMode: 'replace' } : undefined
    }
    const text = entry.text?.trim()
    if (!text) return undefined
    return { customPrompt: text, customPromptMode: entry.mode ?? 'append' }
  }

  // Compose sequentially (not parallel) — we're CPU-bound on simple string
  // concatenation, no I/O, so parallelism buys nothing and keeps the log
  // timeline readable when debugging. 200 keys × ~1 ms each stays well
  // under the 15 s maxDuration.
  const prompts: Record<string, unknown> = {}
  for (const key of asset_keys) {
    try {
      const opts = optsForKey(key)
      if (isFeatureSlotKey(key)) {
        const built = buildFeatureSlotPrompt(key, theme, style_id, meta, opts)
        prompts[key] = {
          prompt:         built.prompt,
          negativePrompt: built.negativePrompt,
          sections:       built.sections ?? null,
        }
      } else if (VALID_ASSET_TYPE_SET.has(key)) {
        const built = buildPrompt(key as AssetType, theme, style_id, meta, opts)
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
