// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Generated Asset Storage Service
// Downloads remote AI URLs → uploads to Supabase Storage → returns public URLs
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
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

  // Download image from AI provider URL
  const imageRes = await fetch(sourceUrl)
  if (!imageRes.ok) {
    throw new Error(`[storage] Failed to download image from AI: ${imageRes.status}`)
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer())

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: 'image/png',
      upsert:      true,
    })

  // If storage fails, fall back to the original AI URL so images still display
  // (OpenAI URLs expire ~1h but are usable immediately — user should fix bucket permissions)
  if (uploadErr) {
    console.warn(`[storage] Upload failed for ${type}, falling back to source URL: ${uploadErr.message}`)
    return {
      id,
      project_id: projectId,
      type,
      url:        sourceUrl,
      prompt,
      theme,
      provider,
      created_at: new Date().toISOString(),
    }
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
  return (data ?? []) as GeneratedAsset[]
}
