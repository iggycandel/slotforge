// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 3
// Marketing-renders Storage helpers. The bucket is PRIVATE — there is no
// public URL surface. Every read either:
//   • happens server-side (download Buffer → re-process), or
//   • is mediated by /api/marketing/render-url which re-signs on demand
//     with a short TTL.
//
// This module is the only place that talks to storage.from('marketing-
// renders'). Routes import these helpers; they don't reach into the
// bucket directly. Single owner = single source of truth for naming
// conventions, content-type handling, and cache TTLs.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'marketing-renders'

/** How long signed URLs live. 1h is enough for a customer to download
 *  their kit zip without exposing a long-lived URL. The render-url
 *  endpoint re-issues on every call so refreshing the page produces
 *  a fresh URL — there's no staleness window the client has to manage. */
const SIGNED_URL_TTL_SEC = 60 * 60

/** Map our format token to the Content-Type Storage should serve. The
 *  service-role client doesn't auto-sniff, so this is the source of
 *  truth that downstream signed URLs honour. */
const CONTENT_TYPES: Record<string, string> = {
  png:  'image/png',
  jpg:  'image/jpeg',
  webp: 'image/webp',
  pdf:  'application/pdf',
  mp4:  'video/mp4',
  webm: 'video/webm',
}

/**
 * Upload a freshly-rendered creative to the marketing-renders bucket.
 * Overwrites any existing object at `storagePath` — caching is keyed
 * on vars_hash, which is encoded into the path, so a path collision
 * means the inputs are identical and overwriting is a no-op.
 */
export async function uploadRender(
  storagePath: string,
  buffer:      Buffer,
  format:      string,
): Promise<{ bytes: number }> {
  const supabase = createAdminClient()
  const contentType = CONTENT_TYPES[format] ?? 'application/octet-stream'

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      // Aggressive long-lived cache OK because the path itself is
      // content-addressed (vars_hash in the filename). A new render
      // gets a new path; nothing here is mutable in place.
      cacheControl: 'public, max-age=31536000, immutable',
      upsert: true,
    })

  if (error) {
    throw new Error(`[marketing/storage] upload failed for ${storagePath}: ${error.message}`)
  }
  return { bytes: buffer.length }
}

/**
 * Re-sign a stored render path. Returns a 1h-TTL URL the client can
 * download from. No DB hit — the caller already pulled the path from
 * marketing_renders and verified ownership via assertProjectAccess.
 */
export async function signRenderUrl(storagePath: string): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC)
  if (error || !data?.signedUrl) {
    throw new Error(`[marketing/storage] signing failed for ${storagePath}: ${error?.message ?? 'no signedUrl'}`)
  }
  return data.signedUrl
}

/**
 * Server-side download — used by the zip endpoint (Day 9) to bundle
 * cached renders into an archive without round-tripping through the
 * client. Returns the raw Buffer; caller decides what to do with it.
 */
export async function downloadRender(storagePath: string): Promise<Buffer> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
  if (error || !data) {
    throw new Error(`[marketing/storage] download failed for ${storagePath}: ${error?.message ?? 'no data'}`)
  }
  // Supabase returns a Blob; convert to Buffer so the rest of the
  // server pipeline (sharp, archiver, pdf-lib) works unchanged.
  const arrayBuf = await data.arrayBuffer()
  return Buffer.from(arrayBuf)
}

/**
 * Delete renders by path. Used when a kit is deleted or when cache
 * pruning becomes a thing (not yet — current strategy is keep-forever
 * since paths are content-addressed and renders are tiny).
 */
export async function deleteRenders(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(BUCKET).remove(storagePaths)
  if (error) {
    throw new Error(`[marketing/storage] delete failed: ${error.message}`)
  }
}
