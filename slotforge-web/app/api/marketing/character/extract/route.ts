// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/marketing/character/extract
// Marketing Workspace v1 / Day 7
//
// Idempotent character cutout. Given a project id, returns the URL of
// the project's `character.transparent` asset:
//   • If one already exists in generated_assets → returns it (no
//     Replicate call, instant)
//   • Otherwise, fetches the project's `character` URL, runs Replicate
//     `cjwbw/rembg`, downloads the result, uploads to project-assets
//     bucket, persists the new generated_assets row, returns the URL
//
// Plan-gated (Freelancer+/Studio). assertProjectAccess on every call.
// No marketing_kits credit deduction; bg-removal is part of the
// workspace's one-time-per-project setup cost.
//
// Request body:  { project_id: string }
// Response 200:  { url: string, cached: boolean }
// Response 412:  { error: 'no_character', message } — character asset missing
// Response 503:  { error: 'replicate_unavailable', message } — env / API down
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                       from '@clerk/nextjs/server'
import { NextRequest, NextResponse }  from 'next/server'
import { z }                          from 'zod'

import { getOrgPlan, canUseMarketing }       from '@/lib/billing/subscription'
import { assertProjectAccess }        from '@/lib/supabase/authz'
import { createAdminClient }          from '@/lib/supabase/admin'
import { uploadGeneratedAsset }       from '@/lib/storage/assets'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { removeBackground }           from '@/lib/marketing/bgremove'
import type { AssetType }             from '@/types/assets'

// rembg on Replicate runs ~5-30s end-to-end. 60s ceiling matches the
// /api/ai-single budget — same provider class.
export const maxDuration = 60

const RequestSchema = z.object({
  project_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const effectiveId = orgId ?? userId

  // Plan gate
  const plan = await getOrgPlan(effectiveId)
  if (!canUseMarketing(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Marketing kit requires a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }

  // Rate limit. Vision-class bucket — single API call per request, but
  // rebuilding a cutout is a real cost so we keep the throttle tight.
  const rl = await rateLimit(effectiveId, 'ai_vision')
  if (!rl.ok) return rateLimitResponse(rl)

  // Parse + validate
  const body   = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { project_id } = parsed.data

  // Project access
  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Idempotency check — bail with the cached URL if we've already done
  // this. Returns the most recent character.transparent row in case a
  // previous run got partially recorded.
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: existing } = await sb
    .from('generated_assets')
    .select('url, created_at')
    .eq('project_id', project_id)
    .eq('type',       'character.transparent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.url) {
    return NextResponse.json({ url: existing.url as string, cached: true })
  }

  // Need the source character URL to feed Replicate.
  const { data: charRow } = await sb
    .from('generated_assets')
    .select('url')
    .eq('project_id', project_id)
    .eq('type',       'character')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!charRow?.url) {
    return NextResponse.json(
      { error: 'no_character',
        message: 'Generate a character asset before requesting a cutout.' },
      { status: 412 },
    )
  }

  // Run Replicate. Surface a clean 503 if the env isn't configured —
  // the workspace can keep working with the regular character asset
  // (engine falls back automatically).
  let cutoutUrl: string
  try {
    cutoutUrl = await removeBackground(charRow.url as string)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'bgremove failed'
    console.error('[marketing/character/extract] Replicate call failed:', message)
    const status = /REPLICATE_API_TOKEN/.test(message) ? 503 : 500
    return NextResponse.json({ error: 'replicate_unavailable', message }, { status })
  }

  // Re-host in our own bucket and persist the row. Replicate URLs are
  // short-lived; the generated_assets URL must outlive a single browser
  // session. The 'as AssetType' cast accommodates the magic dotted key
  // — generated_assets.type is just text in the DB.
  let stored
  try {
    stored = await uploadGeneratedAsset(
      project_id,
      'character.transparent' as AssetType,
      cutoutUrl,
      ''  /* theme — empty; bg-removal isn't theme-bound */,
      'rembg cutout from character asset',
      // 'replicate' isn't in the GeneratedAsset['provider'] union, but
      // production has no CHECK on the column (verified via mcp). Cast
      // around the type to record the real source — useful for any
      // future cost-attribution dashboard.
      'replicate' as unknown as 'openai',
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'storage failed'
    console.error('[marketing/character/extract] storage upload failed:', message)
    return NextResponse.json({ error: 'storage_failed', message }, { status: 500 })
  }

  return NextResponse.json({ url: stored.url, cached: false })
}
