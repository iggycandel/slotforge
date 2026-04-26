// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/marketing/render-all
// Marketing Workspace v1 / Day 9
//
// Bulk render across every (or category-filtered) template × every shipped
// size for a project. Streams SSE so the user sees progress in real time
// — large kits are 30+ files and ~60-90s end-to-end on a cold cache.
//
// Request body:
//   {
//     project_id:  uuid,
//     categories?: ('promo'|'social'|'store'|'press')[]   // default = all
//   }
//
// Stream events:
//   start     { total: number }                  — total renders coming
//   progress  { completed, total, lastTemplate }  — per-render heartbeat
//   render    { template_id, size_label, format, url, cached }
//   error     { template_id?, size_label?, message }
//   complete  { renders: [...] }                 — final list
//
// Plan-gated; assertProjectAccess; ai_metadata rate-limit (composition is
// cheap on cache hit, costly on miss — limiter prevents repeat calls
// from rate-limited clients hammering us).
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                         from '@clerk/nextjs/server'
import { NextRequest, NextResponse }    from 'next/server'
import { z }                            from 'zod'

import { getOrgPlan, canUseMarketing }         from '@/lib/billing/subscription'
import { assertProjectAccess }          from '@/lib/supabase/authz'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

import { listTemplatesByCategory }      from '@/lib/marketing/registry'
import { ensureKit }                    from '@/lib/marketing/kits'
import { loadMarketingProject }         from '@/lib/marketing/project'
import { loadMarketingAssets }          from '@/lib/marketing/assets'
import { resolveVars }                  from '@/lib/marketing/vars'
import { ensureRender }                 from '@/lib/marketing/render'
import type { TemplateCategory }        from '@/lib/marketing/types'

// 19 templates × ~2 sizes avg × ~2-3s per cache miss = ~80-100s worst case.
// Vercel Pro allots up to 300s on this route per vercel.json.
export const maxDuration = 300

const RequestSchema = z.object({
  project_id: z.string().uuid(),
  categories: z.array(z.enum(['promo','social','store','press'])).optional(),
})

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const effectiveId = orgId ?? userId

  const plan = await getOrgPlan(effectiveId)
  if (!canUseMarketing(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Marketing kit requires a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }

  const rl = await rateLimit(effectiveId, 'ai_metadata')
  if (!rl.ok) return rateLimitResponse(rl)

  const body   = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { project_id, categories } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const project = await loadMarketingProject(project_id)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { assets, assetVersions, readiness } = await loadMarketingAssets(project_id)
  if (!readiness.hasBackground || !readiness.hasLogo || !readiness.hasCharacter) {
    return NextResponse.json(
      { error: 'assets_missing', readiness,
        message: 'Marketing renders need a background, logo, and character. Generate them first.' },
      { status: 412 },
    )
  }

  // Resolve which templates to render.
  const grouped = listTemplatesByCategory()
  const wanted: TemplateCategory[] = (categories && categories.length
    ? categories
    : ['promo','social','store','press']) as TemplateCategory[]
  const templates = wanted.flatMap(c => grouped[c])

  // Total = sum of all (template, size) pairs we're about to render.
  const total = templates.reduce((acc, t) => acc + t.sizes.length, 0)

  const enc = (s: string) => new TextEncoder().encode(s)

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try { controller.enqueue(enc(sseEvent(event, data))) }
        catch { /* client disconnected */ }
      }

      try {
        emit('start', { total, categories: wanted, templates: templates.length })

        const allRenders: Array<{ template_id: string; size_label: string; format: string; url: string; bytes: number; cached: boolean }> = []
        let completed = 0

        // Sequential per (template, size). Composition is CPU-bound;
        // parallelising fights for the same single Vercel CPU. The
        // SSE viewer wants incremental events anyway.
        for (const tpl of templates) {
          // Idempotent kit row per template; gives us a kitId to anchor
          // cache rows against.
          const kit = await ensureKit(project_id, tpl.id)
          // Pull stored vars, resolve once per template — same vars
          // across all this template's sizes.
          const resolved = resolveVars(tpl, project.meta, kit.vars ?? {})

          for (const size of tpl.sizes) {
            try {
              const r = await ensureRender({
                kitId:        kit.id,
                projectId:    project_id,
                template:     tpl,
                size,
                vars:         resolved,
                assets,
                assetVersions,
                project,
              })
              const evt = {
                template_id: tpl.id,
                size_label:  size.label,
                format:      size.format,
                url:         r.url,
                bytes:       r.bytes,
                cached:      !r.rendered,
              }
              allRenders.push(evt)
              emit('render',   evt)
              completed++
              emit('progress', { completed, total, lastTemplate: tpl.id })
            } catch (e) {
              const message = e instanceof Error ? e.message : 'render failed'
              console.error(`[marketing/render-all] ${tpl.id}@${size.label} failed:`, message)
              emit('error', { template_id: tpl.id, size_label: size.label, message })
              completed++   // count the failure so progress still advances
              emit('progress', { completed, total, lastTemplate: tpl.id })
            }
          }
        }

        emit('complete', { renders: allRenders, succeeded: allRenders.length, total })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'render-all stream failed'
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
