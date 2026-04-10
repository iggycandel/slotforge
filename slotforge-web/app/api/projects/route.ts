import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS, auth is enforced here in the route
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Ensure a personal workspace exists for this user and return its id. */
async function ensurePersonalWorkspace(userId: string): Promise<string | null> {
  // Check if workspace already exists (slug = userId for personal accounts)
  const { data: existing } = await supabase
    .from('workspaces')
    .select('id')
    .eq('slug', userId)
    .single()

  if (existing) return existing.id

  // Create personal workspace
  const { data: created, error } = await supabase
    .from('workspaces')
    .insert({
      clerk_org_id: userId,
      name: 'Personal',
      slug: userId,
      plan: 'free',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[ensurePersonalWorkspace]', error)
    return null
  }
  return created.id
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at, thumbnail_path')
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json([], { status: 500 })

  // Map thumbnail_path → thumbnail_url for the dashboard component
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const projects = (data ?? []).map((row) => ({
    ...row,
    thumbnail_url: row.thumbnail_path
      ? `${supabaseUrl}/storage/v1/object/public/thumbnails/${row.thumbnail_path}`
      : null,
  }))

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  // Ensure a workspace exists for this user
  const workspaceId = await ensurePersonalWorkspace(userId)
  if (!workspaceId) {
    return NextResponse.json({ error: 'Could not find or create workspace — check SUPABASE_SERVICE_ROLE_KEY env var' }, { status: 500 })
  }

  // Build a URL-safe slug from the name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled'
  // Make it unique with a short timestamp suffix
  const uniqueSlug = `${slug}-${Date.now().toString(36)}`

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
