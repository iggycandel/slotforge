// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Generated Asset Storage Service
// Downloads remote AI URLs → uploads to Supabase Storage → returns public URLs
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeAssetKey } from '@/lib/storage/asset-keys'
import type { AssetType, GeneratedAsset } from '@/types/assets'

const BUCKET = 'project-assets'

// ─── Upload a single AI-generated image to Supabase Storage ─────────────────

export async function uploadGeneratedAsset(
  projectId: string,
  type:       AssetType,
  sourceUrl:  string,
  theme:      string,
  prompt:     string,
  provider:   GeneratedAsset['provider']
): Promise<GeneratedAsset> {
  const supabase = createAdminClient()
  const id       = crypto.randomUUID()
  const path     = `${projectId}/generated/${type}-${Date.now()}.png`

  // Get image bytes — either decode base64 data URL directly or fetch remote URL.
  // Respect the source content-type: providers sometimes return SVG/JPEG/WebP
  // even when the URL ends in `.png`. Uploading SVG bytes with a hardcoded
  // `image/png` header produced broken-image tiles in the UI (the browser
  // can't decode SVG as PNG). We sniff the MIME from the source and preserve
  // it on upload.
  let buffer: Buffer
  let contentType = 'image/png'
  if (sourceUrl.startsWith('data:')) {
    const mimeMatch = sourceUrl.match(/^data:([^;]+);base64,/)
    if (mimeMatch?.[1]) contentType = mimeMatch[1]
    const base64 = sourceUrl.split(',')[1]
    if (!base64) throw new Error('[storage] Invalid data URL')
    buffer = Buffer.from(base64, 'base64')
  } else {
    const imageRes = await fetch(sourceUrl)
    if (!imageRes.ok) throw new Error(`[storage] Failed to download image: ${imageRes.status}`)
    const ct = imageRes.headers.get('content-type')?.split(';')[0]?.trim()
    if (ct && ct.startsWith('image/')) contentType = ct
    buffer = Buffer.from(await imageRes.arrayBuffer())
  }

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert:      true,
    })

  if (uploadErr) {
    throw new Error(`[storage] Upload failed for ${type}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  // Persist metadata to DB
  const record: Omit<GeneratedAsset, 'created_at'> & { created_at?: string } = {
    id,
    project_id: projectId,
    type,
    url:        urlData.publicUrl,
    prompt,
    theme,
    provider,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = await (supabase as any)
    .from('generated_assets')
    .insert(record)

  if (insertErr) {
    // Non-fatal — asset is already in storage, just log
    console.warn(`[storage] DB insert failed for ${type}:`, insertErr.message)
  }

  return {
    ...record,
    created_at: new Date().toISOString(),
  }
}

// ─── Batch upload (parallel with concurrency limit) ──────────────────────────

interface UploadJob {
  type:      AssetType
  sourceUrl: string
  prompt:    string
  provider:  GeneratedAsset['provider']
}

export async function uploadGeneratedAssets(
  projectId: string,
  theme:     string,
  jobs:      UploadJob[],
  concurrency = 4
): Promise<Array<GeneratedAsset | { type: AssetType; error: string }>> {
  const results: Array<GeneratedAsset | { type: AssetType; error: string }> = []

  // Process in batches to avoid hammering storage
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch  = jobs.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(job =>
        uploadGeneratedAsset(
          projectId,
          job.type,
          job.sourceUrl,
          theme,
          job.prompt,
          job.provider
        )
      )
    )

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j]
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        results.push({
          type:  batch[j].type,
          error: result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        })
      }
    }
  }

  return results
}

// ─── Fetch all generated assets for a project ───────────────────────────────

export async function getProjectAssets(projectId: string): Promise<GeneratedAsset[]> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('generated_assets')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`[storage] Failed to fetch assets: ${error.message}`)
  const rows = (data ?? []) as GeneratedAsset[]

  // Translate any rows that landed under a legacy editor PSD key (`bg`,
  // `char`, `reelFrame`, `sym_H1`, …) to the canonical AssetType the
  // Art workspace and downstream consumers index by. Without this,
  // assets uploaded via the old Flow-side right-click path stayed
  // invisible to the Art grid even though the bytes were in Storage.
  // Pure pass-through for rows whose `type` is already canonical, so
  // the cost is one Map lookup per row.
  //
  // We dedupe by canonical type when both a legacy and a canonical row
  // exist for the same project — the canonical row wins (it represents
  // the more recent or more deliberately-tagged upload). If only the
  // legacy row exists we expose it under its canonical type so Art's
  // type-keyed grouping picks it up.
  const seenCanonical = new Set<string>()
  const out: GeneratedAsset[] = []
  // First pass: keep canonical-typed rows verbatim.
  for (const r of rows) {
    const canon = normalizeAssetKey(r.type)
    if (canon === r.type) {
      out.push(r)
      seenCanonical.add(r.type)
    }
  }
  // Second pass: relabel orphaned legacy rows to their canonical type.
  for (const r of rows) {
    const canon = normalizeAssetKey(r.type)
    if (canon === r.type) continue   // already handled above
    if (seenCanonical.has(canon)) continue   // canonical row wins
    out.push({ ...r, type: canon as AssetType })
    seenCanonical.add(canon)
  }
  return out
}
