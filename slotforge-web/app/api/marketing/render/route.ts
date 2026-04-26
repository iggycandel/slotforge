// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/marketing/render
// Marketing Workspace v1 / Day 4
//
// Renders one template at one or more sizes, streaming per-size events
// over SSE. Mirrors the SSE shape of /api/generate so the client-side
// EventSource patterns can be reused with minor tweaks.
//
// Request body:
//   {
//     project_id:  string (uuid)
//     template_id: string                  // 'promo.square_lobby_tile'
//     size_labels: string[]                // ['1024x1024', '512x512']
//     vars?:       Record<string, unknown> // optional overrides; merged on
//                                          //   top of the kit row's stored
//                                          //   vars before resolving
//   }
//
// Stream events:
//   event: start    data: { total: number, template_id, kit_id }
//   event: render   data: { size_label, format, url, bytes, cached }
//   event: error    data: { size_label?, message }
//   event: complete data: { renders: [{ size_label, format, url, bytes, cached }] }
//
// Plan-gated (Freelancer+/Studio). assertProjectAccess on the project.
// No credit deduction — composition is essentially free.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                         from '@clerk/nextjs/server'
import { NextRequest, NextResponse }    from 'next/server'
import { z }                            from 'zod'

import { getOrgPlan, canUseAI }         from '@/lib/billing/subscription'
import { assertProjectAccess }          from '@/lib/supabase/authz'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

import { getTemplate }                  from '@/lib/marketing/registry'
import { ensureKit }                    from '@/lib/marketing/kits'
import { loadMarketingProject }         from '@/lib/marketing/project'
import { loadMarketingAssets }          from '@/lib/marketing/assets'
import { resolveVars }                  from '@/lib/marketing/vars'
import { ensureRender }                 from '@/lib/marketing/render'

// 12 sizes × ~1-2s per render = comfortable inside 60s. Day 9's bulk
// endpoint gets the 300s allotment.
export const maxDuration = 60

// ─── Request schema ──────────────────────────────────────────────────────────

const RequestSchema = z.object({
  project_id:  z.string().uuid(),
  template_id: z.string().min(1).max(100),
  size_labels: z.array(z.string().min(1).max(40)).min(1).max(20),
  vars:        z.record(z.unknown()).optional(),
})

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const effectiveId = orgId ?? userId

  // Plan gate — same flag as AI generation for v1; lib/billing/plans.ts
  // gets a marketingEnabled boolean in Day 10 polish.
  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Marketing kit requires a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }

  // Rate limit. Composition is cheap but still spends CPU + a Storage
  // upload per size — defensive cap so a runaway client can't DoS us.
  // ai_metadata bucket (30/min) matches the cost profile.
  const rl = await rateLimit(effectiveId, 'ai_metadata')
  if (!rl.ok) return rateLimitResponse(rl)

  // Parse + validate body
  const body   = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { project_id, template_id, size_labels, vars: varsOverride } = parsed.data

  // Project access (uses service-role under the hood — but verifies the
  // workspace ownership against the Clerk userId).
  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Resolve template + sizes
  const template = getTemplate(template_id)
  if (!template) {
    return NextResponse.json({ error: 'Unknown template_id' }, { status: 404 })
  }
  const sizes = size_labels
    .map(label => template.sizes.find(s => s.label === label))
    .filter((s): s is NonNullable<typeof s> => !!s)
  if (sizes.length === 0) {
    return NextResponse.json({ error: 'No matching sizes for template' }, { status: 400 })
  }

  // Load everything we need before opening the stream — failures here
  // surface as plain JSON errors which the client handles uniformly.
  const project = await loadMarketingProject(project_id)
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { assets, assetVersions, readiness } = await loadMarketingAssets(project_id)
  // Hard-require the three core assets. The Day 5 UI gates on a readiness
  // probe before exposing the Render button, but defending here closes
  // the race where a user deletes an asset between probe and click.
  if (!readiness.hasBackground || !readiness.hasLogo || !readiness.hasCharacter) {
    return NextResponse.json(
      { error: 'assets_missing', readiness,
        message: 'Marketing renders need a background, logo, and character. Generate them first.' },
      { status: 412 },   // Precondition Failed
    )
  }

  const kit = await ensureKit(project_id, template_id)
  const mergedVars = { ...(kit.vars ?? {}), ...(varsOverride ?? {}) }
  const resolved = resolveVars(template, project.meta, mergedVars)

  // ── SSE stream ─────────────────────────────────────────────────────────────
  const enc = (s: string) => new TextEncoder().encode(s)

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try { controller.enqueue(enc(sseEvent(event, data))) }
        catch { /* client disconnected */ }
      }

      try {
        emit('start', { total: sizes.length, template_id, kit_id: kit.id })

        const all: Array<{ size_label: string; format: string; url: string; bytes: number; cached: boolean }> = []

        // Sequential per-size — composition is already CPU-bound and
        // running in parallel just contends for the same single Vercel
        // function CPU. SSE viewers want incremental events anyway.
        for (const size of sizes) {
          try {
            const r = await ensureRender({
              kitId:         kit.id,
              projectId:     project_id,
              template,
              size,
              vars:          resolved,
              assets,
              assetVersions,
            })
            const evt = {
              size_label: size.label,
              format:     size.format,
              url:        r.url,
              bytes:      r.bytes,
              cached:     !r.rendered,
            }
            all.push(evt)
            emit('render', evt)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'render failed'
            console.error(`[marketing/render] ${template_id}@${size.label} failed:`, message)
            emit('error', { size_label: size.label, message })
            // Continue rendering the other sizes — one bad apple shouldn't
            // kill the whole batch, same UX policy as /api/generate.
          }
        }

        emit('complete', { renders: all })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'render stream failed'
        emit('error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':       'text/event-stream',
      'Cache-Control':      'no-cache',
      'Connection':         'keep-alive',
      'X-Accel-Buffering':  'no',
    },
  })
}
