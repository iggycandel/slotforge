import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS, auth is enforced here in the route
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Look up (or provision) the workspace row owned by this clerk principal.
 *
 *  Every other authz path in the app keys workspaces by `clerk_org_id = userId`
 *  (see app/(app)/[orgSlug]/layout.tsx), so we must match that lookup here —
 *  otherwise existing workspaces (with a slug like "test-team") are invisible
 *  to this route, the fallback INSERT collides on the UNIQUE clerk_org_id
 *  constraint, and the POST silently 500s. */
async function ensureWorkspace(userId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('workspaces')
    .select('id')
    .eq('clerk_org_id', userId)
    .maybeSingle()

  if (existing) return existing.id

  // No workspace yet — create one with a deterministic slug so the user can
  // be redirected to /<userId>/dashboard. The onboarding flow normally
  // handles this; this is the safety net for old accounts that somehow
  // skipped it.
  const { data: created, error } = await supabase
    .from('workspaces')
    .insert({
      clerk_org_id: userId,
      name: 'Personal',
      slug:  userId,
      plan:  'free',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[ensureWorkspace] provision failed', error)
    return null
  }
  return created.id
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at, thumbnail_path, payload')
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json([], { status: 500 })

  // Map thumbnail_path → thumbnail_url. The editor stores JPEG data URLs
  // directly in thumbnail_path; legacy rows may still contain a Supabase
  // Storage path, so handle both.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const projects = (data ?? []).map((row) => ({
    ...row,
    thumbnail_url: row.thumbnail_path
      ? (row.thumbnail_path.startsWith('data:')
          ? row.thumbnail_path
          : `${supabaseUrl}/storage/v1/object/public/thumbnails/${row.thumbnail_path}`)
      : null,
  }))

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  // Resolve the user's workspace — matches the clerk_org_id lookup used
  // everywhere else. Returns the existing row for normal users and
  // provisions a new one as a safety net for accounts that skipped
  // onboarding.
  const workspaceId = await ensureWorkspace(userId)
  if (!workspaceId) {
    return NextResponse.json({ error: 'Could not find or create workspace' }, { status: 500 })
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
