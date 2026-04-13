// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Asset Generation Pipeline
// Orchestrates: prompt building → AI generation → storage upload
// ─────────────────────────────────────────────────────────────────────────────

import { buildPrompt }              from '@/lib/ai/promptBuilder'
import { generateImage }            from '@/lib/ai'
import { uploadGeneratedAssets }    from '@/lib/storage/assets'
import type { AssetType, GeneratedAsset, GenerationResult, GenerateRequest } from '@/types/assets'
import type { AIProvider }          from '@/lib/ai'

// ─── All asset types in generation order ────────────────────────────────────
// Ordered from largest → smallest to surface failures early

const ALL_TYPES: AssetType[] = [
  'background_base',
  'background_bonus',
  'symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4', 'symbol_high_5',
  'symbol_low_1',  'symbol_low_2',  'symbol_low_3',  'symbol_low_4',  'symbol_low_5',
  'symbol_wild',
  'symbol_scatter',
  'logo',
]

// ─── Generation concurrency ──────────────────────────────────────────────────
// Runway and OpenAI both have rate limits — keep this conservative

const GENERATION_CONCURRENCY = 3

// ─── Main pipeline ───────────────────────────────────────────────────────────

export interface PipelineOptions {
  provider?:      AIProvider
  onProgress?:    (completed: number, total: number, lastType: AssetType) => void
}

export interface PipelineResult {
  result?:  GenerationResult
  partial:  Partial<GenerationResult>
  failed:   Array<{ type: AssetType; error: string }>
  success:  boolean
}

export async function generateSlotAssets(
  req:  GenerateRequest,
  opts: PipelineOptions = {}
): Promise<PipelineResult> {
  const { theme, project_id } = req
  const provider = (req.provider ?? opts.provider ?? 'auto') as AIProvider
  const { onProgress } = opts

  const total    = ALL_TYPES.length
  let completed  = 0

  // ── Step 1: Generate all images in parallel batches ───────────────────────

  const generatedUrls: Map<AssetType, { url: string; provider: 'runway' | 'openai' | 'mock' }> = new Map()
  const generationErrors: Map<AssetType, string> = new Map()

  for (let i = 0; i < ALL_TYPES.length; i += GENERATION_CONCURRENCY) {
    const batch = ALL_TYPES.slice(i, i + GENERATION_CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map(async type => {
        const built = buildPrompt(type, theme)
        const result = await generateImage(type, built, provider)
        return { type, ...result, prompt: built.prompt }
      })
    )

    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      const t = batch[j]
      if (r.status === 'fulfilled') {
        generatedUrls.set(t, { url: r.value.url, provider: r.value.provider })
      } else {
        generationErrors.set(t, r.reason instanceof Error ? r.reason.message : String(r.reason))
        console.error(`[pipeline] Generation failed for ${t}:`, r.reason)
      }
      completed++
      onProgress?.(completed, total, t)
    }
  }

  // ── Step 2: Upload successful images to Supabase Storage ──────────────────

  const uploadJobs = Array.from(generatedUrls.entries()).map(([type, val]) => ({
    type,
    sourceUrl: val.url,
    prompt:    buildPrompt(type, theme).prompt,
    provider:  val.provider,
  }))

  const uploadResults = await uploadGeneratedAssets(project_id, theme, uploadJobs)

  // ── Step 3: Assemble result structure ─────────────────────────────────────

  const assetMap = new Map<AssetType, GeneratedAsset>()
  const failedStorage: Array<{ type: AssetType; error: string }> = []

  for (const r of uploadResults) {
    if ('error' in r) {
      failedStorage.push(r)
    } else {
      assetMap.set(r.type, r)
    }
  }

  const allFailed: Array<{ type: AssetType; error: string }> = [
    ...Array.from(generationErrors.entries()).map(([type, error]) => ({ type, error })),
    ...failedStorage,
  ]

  const get = (t: AssetType) => assetMap.get(t)

  const partial: Partial<GenerationResult> = {}

  if (get('background_base') && get('background_bonus')) {
    partial.backgrounds = { base: get('background_base')!, bonus: get('background_bonus')! }
  }

  const highs = [
    get('symbol_high_1'), get('symbol_high_2'), get('symbol_high_3'),
    get('symbol_high_4'), get('symbol_high_5'),
  ]
  const lows = [
    get('symbol_low_1'), get('symbol_low_2'), get('symbol_low_3'),
    get('symbol_low_4'), get('symbol_low_5'),
  ]
  if (highs.every(Boolean) && lows.every(Boolean) && get('symbol_wild') && get('symbol_scatter')) {
    partial.symbols = {
      high:    highs    as GeneratedAsset[],
      low:     lows     as GeneratedAsset[],
      wild:    get('symbol_wild')!,
      scatter: get('symbol_scatter')!,
    }
  }

  if (get('logo')) {
    partial.logo = get('logo')!
  }

  const isComplete =
    !!partial.backgrounds &&
    !!partial.symbols &&
    !!partial.logo &&
    allFailed.length === 0

  return {
    result:  isComplete ? partial as GenerationResult : undefined,
    partial,
    failed:  allFailed,
    success: allFailed.length < ALL_TYPES.length, // at least some succeeded
  }
}
