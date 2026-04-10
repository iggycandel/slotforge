import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const BUCKET = 'project-assets'

// ─── Asset upload ─────────────────────────────────────────────────────────────

/**
 * Given an EL_ASSETS map (keyed by layer key → data URI or URL), upload any
 * base64 data URIs to Supabase Storage and return a new map with storage URLs.
 *
 * Already-uploaded URLs (starting with "http") are passed through unchanged.
 * On upload failure the original value is kept (graceful degradation).
 */
export async function uploadProjectAssets(
  supabase: SupabaseClient<Database>,
  projectId: string,
  assets: Record<string, string>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}

  await Promise.all(
    Object.entries(assets).map(async ([key, value]) => {
      if (!value) { result[key] = value; return }

      // Already a remote URL — skip upload
      if (value.startsWith('http')) { result[key] = value; return }

      // Must be a data URI: data:<mime>;base64,<data>
      const match = value.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) { result[key] = value; return }

      const [, mimeType, b64] = match
      const ext  = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin'
      const path = `${projectId}/${key}.${ext}`

      try {
        const buffer = Buffer.from(b64, 'base64')

        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, buffer, { contentType: mimeType, upsert: true })

        if (uploadErr) throw uploadErr

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
        result[key] = data.publicUrl
      } catch (err) {
        console.warn(`[storage] Failed to upload asset "${key}":`, err)
        result[key] = value // fall back to base64
      }
    })
  )

  return result
}

/**
 * Build a slimmed payload: extract EL_ASSETS, upload to storage, substitute
 * URLs back in, return the payload safe to write to Postgres.
 */
export async function stripAndUploadAssets(
  supabase: SupabaseClient<Database>,
  projectId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const assets = payload.assets as Record<string, string> | undefined
  if (!assets || Object.keys(assets).length === 0) return payload

  const uploadedAssets = await uploadProjectAssets(supabase, projectId, assets)
  return { ...payload, assets: uploadedAssets }
}
