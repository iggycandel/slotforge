// ─────────────────────────────────────────────────────────────────────────────
// Spinative — GET /api/marketing/zip?project_id=<uuid>&render_ids=<csv>
// Marketing Workspace v1 / Day 9
//
// Streams a zip archive of the requested marketing_renders rows. Each
// entry is named with the convention
//   <slug(gameName)>_<template_id>_<size_label>.<ext>
// so an editor / operator looking at the unpacked folder gets a
// self-describing filename without us emitting a manifest.
//
// Request:
//   GET /api/marketing/zip?project_id=...&render_ids=id1,id2,...
//
// Response: 200 application/zip, streamed.
//
// Authz chain: every render id resolves render → kit → project, and we
// assertProjectAccess once on the project_id query param. We then
// filter the SELECT to that project_id so a malicious caller can't
// inject ids from a different tenant — even if they own a project,
// they can't bundle renders that aren't theirs.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                       from '@clerk/nextjs/server'
import { NextRequest, NextResponse }  from 'next/server'
import archiver                       from 'archiver'
import sharp                          from 'sharp'
import { Readable }                   from 'stream'

import { createAdminClient }          from '@/lib/supabase/admin'
import { assertProjectAccess }        from '@/lib/supabase/authz'
import { getOrgPlan, canUseMarketing }       from '@/lib/billing/subscription'
import { downloadRender }             from '@/lib/marketing/storage'
import { loadMarketingProject }       from '@/lib/marketing/project'

// Zip streaming reuses cached storage objects — no compose calls. Even
// 30+ files compress in well under 60s, but allow headroom on a slow
// Storage day.
export const maxDuration = 120

export async function GET(req: NextRequest) {
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

  const projectId = req.nextUrl.searchParams.get('project_id')
  const idsCsv    = req.nextUrl.searchParams.get('render_ids')
  // Optional re-encode pass: when `?format=jpg` is present, every entry is
  // transcoded to JPEG via sharp before being appended to the archive.
  // Game studios share these in WhatsApp / Slack / Discord where uniform
  // file extensions matter more than original-format fidelity. PNG alpha
  // flattens onto white. PDF entries are left untouched (sharp can't
  // rasterise them and the press one-pager only ships as PDF).
  const formatParam = (req.nextUrl.searchParams.get('format') || '').toLowerCase()
  const transcode   = formatParam === 'jpg' || formatParam === 'jpeg'
  // 70 / 85 / 95 are the offered presets (export menu UI). Validated as
  // an integer in [50, 100]; out-of-range falls back to a balanced 85.
  const qParam      = parseInt(req.nextUrl.searchParams.get('quality') || '85', 10)
  const quality     = Number.isFinite(qParam) && qParam >= 50 && qParam <= 100 ? qParam : 85

  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })

  if (!(await assertProjectAccess(userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Resolve which renders to bundle. When render_ids isn't supplied,
  // bundle every render the project has — common UX from the
  // "Export all kit" topbar dropdown.
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  // Build the query in two steps so the optional id-filter chains cleanly.
  let query = sb
    .from('marketing_renders')
    .select('id, storage_path, size_label, format, kit:marketing_kits!inner(template_id, project_id)')
    .eq('kit.project_id', projectId)
    .order('created_at', { ascending: false })

  if (idsCsv) {
    const ids = idsCsv.split(',').map(s => s.trim()).filter(Boolean)
    // UUID shape check; reject malformed early so we don't ship a
    // 500 from supabase-js on a typo.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const safeIds = ids.filter(s => uuidRe.test(s))
    if (safeIds.length === 0) {
      return NextResponse.json({ error: 'No valid render_ids' }, { status: 400 })
    }
    query = query.in('id', safeIds)
  }

  const { data: rows, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = (rows ?? []) as Array<{
    id: string; storage_path: string; size_label: string; format: string;
    kit: { template_id: string; project_id: string }
  }>
  if (list.length === 0) {
    return NextResponse.json(
      { error: 'no_renders',
        message: 'Render at least one creative before exporting.' },
      { status: 412 },
    )
  }

  // gameName powers the archive's filename and each entry's prefix.
  const project   = await loadMarketingProject(projectId)
  const slug      = slugify(project?.meta.gameName ?? project?.name ?? 'spinative')
  // Suffix the archive when transcoding so users with both kits in their
  // Downloads can tell them apart at a glance.
  const variantTag = transcode ? `_jpeg-q${quality}` : ''
  const zipName    = `${slug}_marketing-kit_v1${variantTag}.zip`

  // Stream the archive. We pipe archiver into a Node Readable, then
  // wrap that as a Web ReadableStream for the Next.js Response. This
  // keeps memory bounded — files are streamed in one at a time as
  // they're downloaded from Storage.
  const archive = archiver('zip', { zlib: { level: 6 } })

  archive.on('error', err => {
    console.error('[marketing/zip] archive error:', err.message)
  })

  // Push each render. We don't await the downloads serially via the
  // archive's append (it runs internally), but we DO need to kick off
  // each download and feed its Buffer in.
  ;(async () => {
    for (const row of list) {
      try {
        const raw = await downloadRender(row.storage_path)
        // Transcoding decision per entry. PDFs always pass through (sharp
        // can't read them; the press one-pager is meant to be a PDF
        // anyway). Other formats convert to JPEG when ?format=jpg is set.
        let buf: Buffer = raw
        let ext: string = row.format
        if (transcode && row.format !== 'pdf') {
          // flatten:white forces alpha channels onto a white backdrop —
          // JPEG has no alpha. mozjpeg buys ~10% smaller files for free.
          buf = await sharp(raw)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer()
          ext = 'jpg'
        }
        const name = `${slug}_${row.kit.template_id}_${row.size_label}.${ext}`
        archive.append(buf, { name })
      } catch (e) {
        console.warn(`[marketing/zip] skipped ${row.id} (${row.storage_path}):`, e instanceof Error ? e.message : e)
        // Continue — one missing object shouldn't kill the bundle.
      }
    }
    archive.finalize()
  })()

  // Convert Node stream to Web stream for Next.js Response.
  const webStream = Readable.toWeb(archive) as ReadableStream<Uint8Array>

  return new Response(webStream, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control':       'no-cache',
    },
  })
}

function slugify(s: string): string {
  return (s || 'spinative')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'spinative'
}
