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

// Maximum upload size — 5 MB. v120 / H2: route handlers don't honour
// next.config.js's serverActions.bodySizeLimit, so without an explicit
// check a large blob could still be POSTed and burn Storage credit
// before failing on Supabase's own 50 MB cap. AI-generated assets at
// 1024x1024 PNG land in the 0.5–2 MB range; user uploads (logos,
// references) are typically smaller. 5 MB leaves headroom for the
// occasional high-res reference image without becoming a vector for
// abuse.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Sniff magic bytes to determine the actual file type. The Browser-
 *  supplied file.type is trivially spoofable — claiming "image/png"
 *  while shipping an .exe lets us write arbitrary content into a
 *  public Supabase bucket. Returns the verified extension or null
 *  when bytes don't match any supported image format.
 *  Refs:
 *    PNG  — first 8 bytes: 89 50 4E 47 0D 0A 1A 0A
 *    JPEG — first 3 bytes: FF D8 FF (JFIF / Exif both start this way)
 *    WebP — bytes 0-3: 52 49 46 46 ('RIFF'); bytes 8-11: 57 45 42 50 ('WEBP')
 *    GIF  — first 6 bytes: 47 49 46 38 (37|39) 61 ('GIF87a' / 'GIF89a') */
function detectImageType(buffer: Buffer): 'png' | 'jpg' | 'webp' | 'gif' | null {
  if (buffer.length < 12) return null
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
   && buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) return 'png'
  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg'
  // WebP — RIFF....WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
   && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'webp'
  // GIF — GIF87a or GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38
   && (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61) return 'gif'
  return null
}

const EXT_TO_MIME: Record<'png' | 'jpg' | 'webp' | 'gif', string> = {
  png:  'image/png',
  jpg:  'image/jpeg',
  webp: 'image/webp',
  gif:  'image/gif',
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

  // v120 / H2: enforce size cap BEFORE reading the body into memory.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'File too large', message: `Upload exceeds ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    )
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

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // v120 / H2: sniff actual file bytes — file.type comes from the browser
  // and is trivially spoofable. Reject anything that isn't a recognised
  // image format. This stops the "I'll claim image/png and ship anything"
  // attack vector that combined with the public bucket would let an
  // attacker host arbitrary content under the *.supabase.co domain.
  const sniffed = detectImageType(buffer)
  if (!sniffed) {
    return NextResponse.json(
      { error: 'Unsupported file type', message: 'Only PNG, JPEG, WebP, and GIF images are accepted.' },
      { status: 415 },
    )
  }
  const ext         = sniffed
  const contentType = EXT_TO_MIME[sniffed]
  const storagePath = `${projectId}/${safeName}.${ext}`

  const { error } = await supabaseAdmin.storage
    .from('project-assets')
    .upload(storagePath, buffer, {
      // Force the SNIFFED content type, not the browser-supplied one,
      // so storage serves the file with a header that matches its
      // actual bytes.
      contentType,
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
