import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(`Missing env vars: ${!url ? 'NEXT_PUBLIC_SUPABASE_URL ' : ''}${!key ? 'SUPABASE_SERVICE_ROLE_KEY' : ''}`.trim())
  }
  return createClient(url, key)
}

async function ensurePersonalWorkspace(userId: string): Promise<string | null> {
  const supabase = getSupabase()
  const { data: existing } = await supabase
    .from('workspaces')
    .select('id')
    .eq('slug', userId)
    .single()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('workspaces')
    .insert({ clerk_org_id: userId, name: 'Personal', slug: userId, plan: 'free' })
    .select('id')
    .single()

  if (error) { console.error('[ensurePersonalWorkspace]', error); return null }
  return created.id
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json([], { status: 401 })

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, updated_at, thumbnail_path')
      .eq('created_by', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[GET /api/projects]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const projects = (data ?? []).map((row) => ({
      ...row,
      thumbnail_url: row.thumbnail_path
        ? `${supabaseUrl}/storage/v1/object/public/thumbnails/${row.thumbnail_path}`
        : null,
    }))

    return NextResponse.json(projects)
  } catch (err) {
    console.error('[GET /api/projects] uncaught:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name } = await req.json()
    if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

    const workspaceId = await ensurePersonalWorkspace(userId)
    if (!workspaceId) {
      return NextResponse.json({ error: 'Could not find or create workspace' }, { status: 500 })
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled'
    const uniqueSlug = `${slug}-${Date.now().toString(36)}`

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('projects')
      .insert({
        workspace_id: workspaceId,
        name,
        slug: uniqueSlug,
        theme: 'other',
        reelset: '5x3',
        status: 'draft',
        created_by: userId,
        payload: {},
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/projects]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[POST /api/projects] uncaught:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
