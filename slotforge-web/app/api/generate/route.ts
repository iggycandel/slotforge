// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — POST /api/generate
// Accepts { theme, project_id, provider? } and streams generation progress
// via Server-Sent Events (SSE) so the UI can update in real time.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                  from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z }                     from 'zod'
import { generateSlotAssets }    from '@/lib/generation/pipeline'
import type { AssetType }        from '@/types/assets'

// ─── Request schema ──────────────────────────────────────────────────────────

const RequestSchema = z.object({
  theme:      z.string().min(2).max(200).trim(),
  project_id: z.string().uuid(),
  provider:   z.enum(['runway', 'openai', 'auto']).optional().default('auto'),
})

// ─── SSE helper ─────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const { theme, project_id, provider } = parsed.data
  const TOTAL = 15 // total assets to generate

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
        emit('start', { total: TOTAL, theme })

        const pipelineResult = await generateSlotAssets(
          { theme, project_id, provider },
          {
            onProgress: (completed, total, lastType) => {
              emit('progress', { completed, total, lastType })
            },
          }
        )

        emit('complete', {
          success: pipelineResult.success,
          result:  pipelineResult.result,
          partial: pipelineResult.partial,
          failed:  pipelineResult.failed,
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

  try {
    const { getProjectAssets } = await import('@/lib/storage/assets')
    const assets = await getProjectAssets(projectId)
    return NextResponse.json({ assets })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch assets'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
