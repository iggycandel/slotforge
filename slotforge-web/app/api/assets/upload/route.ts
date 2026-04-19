import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { assertProjectAccess } from '@/lib/supabase/authz'

// Use the service role key so uploads bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

// ── GET /api/assets/upload?project_id=... ─────────────────────────────────────
// List all user-uploaded assets for a project from Supabase Storage
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })

  if (!(await assertProjectAccess(userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error } = await supabaseAdmin.storage
    .from('project-assets')
    .list(projectId, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  // Reject path-traversal attempts. assetKey may contain dots (feature slot
  // namespacing like "bonuspick.bg") but never `..` segments or slashes.
  if (assetKey.includes('..') || assetKey.includes('/') || assetKey.includes('\\') || assetKey.length > 80) {
    return NextResponse.json({ error: 'Invalid assetKey' }, { status: 400 })
  }

  if (!(await assertProjectAccess(userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Sanitise the key for the storage filename (no dots in filename — keeps
  // bonuspick.bg → bonuspick_bg.png on disk). The DB record below preserves
  // the ORIGINAL assetKey so the editor can look it up by namespaced key.
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

  // Save asset record to generated_assets so it shows up in the asset grid.
  // Use the ORIGINAL assetKey (with dots, e.g. "bonuspick.bg") as the type
  // so feature-namespaced slots round-trip correctly. Storage filename is
  // sanitized but the DB key is preserved.
  const theme = (formData.get('theme') as string | null) || 'custom'
  const assetRecord = {
    id:         crypto.randomUUID(),
    project_id: projectId,
    type:       assetKey,  // original key — preserves feature namespace dots
    url:        publicUrl,
    prompt:     'User uploaded image',
    theme,
    provider:   'upload',
    created_at: new Date().toISOString(),
  }
  // Save to DB — non-fatal if it fails
  try {
    const { error: upsertErr } = await supabaseAdmin
      .from('generated_assets')
      .upsert(assetRecord, { onConflict: 'project_id,type' })
    if (upsertErr) {
      // Fallback: plain insert
      await supabaseAdmin.from('generated_assets').insert(assetRecord)
    }
  } catch (e) {
    console.warn('[upload] DB save failed (non-fatal):', e)
  }

  return NextResponse.json({ url: publicUrl, asset: assetRecord })
}

// ── DELETE /api/assets/upload ─────────────────────────────────────────────────
// Body: { project_id: string, file_name: string }
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const projectId = body?.project_id as string | undefined
  const fileName  = body?.file_name  as string | undefined

  if (!projectId || !fileName) {
    return NextResponse.json({ error: 'Missing project_id or file_name' }, { status: 400 })
  }

  if (!(await assertProjectAccess(userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Safety: only allow removing files within this project's folder
  const storagePath = `${projectId}/${fileName.replace(/^\/+/, '')}`

  const { error } = await supabaseAdmin.storage
    .from('project-assets')
    .remove([storagePath])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
