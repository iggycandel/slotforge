// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST/GET /api/project-context
//
// GET  ?project_id=<uuid>            → { context: { theme, style_id, provider } }
// POST { project_id, theme, style_id?, provider? } → { ok: true }
//
// Stores the last-used generation settings for a project so the ASSETS
// workspace can pre-fill the control bar on next visit.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }               from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z }                  from 'zod'
import { createAdminClient }  from '@/lib/supabase/admin'
import { assertProjectAccess } from '@/lib/supabase/authz'

const UpsertSchema = z.object({
  project_id: z.string().uuid(),
  theme:      z.string().max(200).trim().default(''),
  style_id:   z.string().optional(),
  provider:   z.enum(['openai', 'mock', 'auto']).optional().default('openai'),
})

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  if (!(await assertProjectAccess(userId, projectId))) {
    return NextResponse.json({ context: null })
  }

  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('project_context')
      .select('theme, style_id, provider')
      .eq('project_id', projectId)
      .maybeSingle()

    return NextResponse.json({ context: data ?? null })
  } catch {
    return NextResponse.json({ context: null })
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = UpsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { project_id, theme, style_id, provider } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('project_context')
      .upsert(
        { project_id, theme, style_id: style_id ?? null, provider, updated_at: new Date().toISOString() },
        { onConflict: 'project_id' }
      )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
