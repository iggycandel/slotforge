// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/generate
// Accepts { theme, project_id, provider? } and streams generation progress
// via Server-Sent Events (SSE) so the UI can update in real time.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                  from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z }                     from 'zod'
import { generateSlotAssets, ALL_TYPES } from '@/lib/generation/pipeline'
import type { AssetType, ProjectMeta }  from '@/types/assets'
import { getOrgPlan, canUseAI,
         getOrgCreditStatus,
         consumeCredits }        from '@/lib/billing/subscription'
import { assertProjectAccess, assertAssetAccess } from '@/lib/supabase/authz'

// ─── Vercel function timeout ─────────────────────────────────────────────────
// 15 assets × ~25 s each (in batches of 3) ≈ 125 s.
// Raise the limit so the stream isn't cut mid-generation.
// Vercel Pro allows up to 300 s; adjust to 60 for Hobby plans.
export const maxDuration = 300

// ─── Request schema ──────────────────────────────────────────────────────────

const RATIO_VALUES = ['1:1','3:2','2:3','16:9','9:16','3:1','4:1','1:4'] as const

const RequestSchema = z.object({
  theme:        z.string().max(200).trim().default(''),
  project_id:   z.string().uuid(),
  provider:     z.enum(['runway', 'openai', 'auto']).optional().default('auto'),
  style_id:     z.string().optional(),
  project_meta: z.record(z.unknown()).optional(),
  /** Subset of asset types to generate (fill-gaps mode). All types when omitted. */
  asset_types:  z.array(z.string()).optional(),
  /** Optional batch-wide aspect ratio override. */
  ratio:        z.enum(RATIO_VALUES).optional(),
})

// ─── SSE helper ─────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
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
  // Credit gate — check remaining credits before starting a batch
  const credits = await getOrgCreditStatus(effectiveId)
  if (!credits.canGenerate) {
    return NextResponse.json(
      { error: 'credits_exhausted', remaining: 0, message: 'No AI credits remaining this month. Top up from the billing page.' },
      { status: 402 }
    )
  }

  // Parse body
  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { theme, project_id, provider, style_id, project_meta, asset_types, ratio } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const activeTypes = asset_types?.length
    ? asset_types.filter(t => (ALL_TYPES as string[]).includes(t)) as AssetType[]
    : ALL_TYPES
  const TOTAL = activeTypes.length

  // ── SSE stream ─────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = (s: string) => new TextEncoder().encode(s)

      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc(sseEvent(event, data)))
        } catch {
          // Client disconnected
        }
      }

      try {
        emit('start', { total: TOTAL, theme, fillGaps: !!asset_types?.length })

        const pipelineResult = await generateSlotAssets(
          { theme, project_id, provider, style_id, project_meta: project_meta as ProjectMeta | undefined, asset_types: activeTypes, ratio },
          {
            onProgress: (completed, total, lastType) => {
              emit('progress', { completed, total, lastType })
            },
            // Stream each asset the moment it's generated + uploaded.
            // The client handles 'asset' events to show tiles progressively
            // instead of waiting for the full 'complete' event.
            onAssetComplete: (asset) => {
              emit('asset', asset)
              // Consume 1 credit per successfully generated image.
              // Callback is invoked synchronously by the pipeline, so we can't
              // block on the promise here — but we MUST surface failures instead
              // of silently granting free generations. Emit a stream event on
              // error; the client shows a warning and support reconciles from logs.
              consumeCredits(effectiveId, 1).catch(err => {
                console.error('[generate] Failed to consume credit for', asset.type, err)
                emit('credit_error', { assetType: asset.type, message: 'Credit tracking failed' })
              })
            },
          }
        )

        // Flatten all succeeded assets into a flat array for easy consumption
        const allAssets = pipelineResult.succeeded ?? []

        emit('complete', {
          success: pipelineResult.success,
          result:  pipelineResult.result,
          partial: pipelineResult.partial,
          failed:  pipelineResult.failed,
          assets:  allAssets,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed'
        emit('error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  })
}

// ─── DELETE /api/generate — remove a generated asset (DB + Storage) ──────────

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const assetId = body?.id as string | undefined
  if (!assetId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const access = await assertAssetAccess(userId, assetId)
    if (!access) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Reconstruct storage path from the public URL
    // URL format: https://<ref>.supabase.co/storage/v1/object/public/project-assets/<path>
    const pathMatch = access.assetUrl.match(/\/object\/public\/project-assets\/(.+)$/)
    if (pathMatch?.[1]) {
      await supabase.storage.from('project-assets').remove([pathMatch[1]])
    }

    // Delete the DB record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('generated_assets').delete().eq('id', assetId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── GET /api/generate — fetch existing assets for a project ─────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  }

  if (!(await assertProjectAccess(userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const { getProjectAssets } = await import('@/lib/storage/assets')
    const assets = await getProjectAssets(projectId)
    return NextResponse.json({ assets })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch assets'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
