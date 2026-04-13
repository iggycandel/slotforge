import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

// Use the service role key so uploads bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── GET /api/assets/upload?project_id=... ─────────────────────────────────────
// List all user-uploaded assets for a project from Supabase Storage
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })

  const { data, error } = await supabaseAdmin.storage
    .from('project-assets')
    .list(projectId, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const files = (data ?? [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => ({
      name: f.name,
      url:  `${supabaseUrl}/storage/v1/object/public/project-assets/${projectId}/${f.name}`,
      created_at: f.created_at ?? '',
    }))

  return NextResponse.json({ files })
}

// ── POST /api/assets/upload ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const projectId = formData.get('projectId') as string | null
  const assetKey = formData.get('assetKey') as string | null

  if (!file || !projectId || !assetKey) {
    return NextResponse.json({ error: 'Missing file, projectId or assetKey' }, { status: 400 })
  }

  // Sanitise the key so it's safe as a file path
  const safeName = assetKey.replace(/[^a-zA-Z0-9_\-]/g, '_')
  const ext = file.type === 'image/webp' ? 'webp'
    : file.type === 'image/jpeg' ? 'jpg'
    : file.type === 'image/gif' ? 'gif'
    : 'png'
  const storagePath = `${projectId}/${safeName}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error } = await supabaseAdmin.storage
    .from('project-assets')
    .upload(storagePath, buffer, {
      contentType: file.type || 'image/png',
      upsert: true,
    })

  if (error) {
    console.error('Supabase Storage upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('project-assets')
    .getPublicUrl(storagePath)

  return NextResponse.json({ url: publicUrl })
}
