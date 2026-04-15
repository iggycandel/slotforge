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
  provider?:        AIProvider
  onProgress?:      (completed: number, total: number, lastType: AssetType) => void
  /** Called immediately after each asset is generated AND uploaded — enables per-asset SSE streaming */
  onAssetComplete?: (asset: GeneratedAsset) => void
}

export interface PipelineResult {
  result?:    GenerationResult
  partial:    Partial<GenerationResult>
  succeeded:  GeneratedAsset[]                         // flat list of all succeeded assets
  failed:     Array<{ type: AssetType; error: string }>
  success:    boolean
}

export async function generateSlotAssets(
  req:  GenerateRequest,
  opts: PipelineOptions = {}
): Promise<PipelineResult> {
  const { theme, project_id } = req
  const provider = (req.provider ?? opts.provider ?? 'auto') as AIProvider
  const { onProgress, onAssetComplete } = opts

  const total    = ALL_TYPES.length
  let completed  = 0

  const generationErrors: Map<AssetType, string> = new Map()
  const failedStorage: Array<{ type: AssetType; error: string }> = []
  const assetMap = new Map<AssetType, GeneratedAsset>()

  // ── Generate + upload in interleaved batches ───────────────────────────────
  // Each batch: generate in parallel → upload immediately → notify via onAssetComplete
  // This lets the SSE stream deliver assets one-by-one instead of all-at-once,
  // avoiding Vercel's 60 s function timeout on large generations.

  for (let i = 0; i < ALL_TYPES.length; i += GENERATION_CONCURRENCY) {
    const batch = ALL_TYPES.slice(i, i + GENERATION_CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map(async type => {
        const built = buildPrompt(type, theme)
        const result = await generateImage(type, built, provider)
        return { type, ...result, prompt: built.prompt }
      })
    )

    // Separate successes from failures and report progress
    const batchUploads: Array<{
      type:      AssetType
      sourceUrl: string
      prompt:    string
      provider:  'runway' | 'openai' | 'mock'
    }> = []

    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      const t = batch[j]
      if (r.status === 'fulfilled') {
        batchUploads.push({
          type:      t,
          sourceUrl: r.value.url,
          prompt:    r.value.prompt,
          provider:  r.value.provider,
        })
      } else {
        generationErrors.set(t, r.reason instanceof Error ? r.reason.message : String(r.reason))
        console.error(`[pipeline] Generation failed for ${t}:`, r.reason)
      }
      completed++
      onProgress?.(completed, total, t)
    }

    // Upload this batch to Supabase Storage immediately (don't wait for all 15)
    if (batchUploads.length > 0) {
      const batchResults = await uploadGeneratedAssets(project_id, theme, batchUploads)
      for (const r of batchResults) {
        if ('error' in r) {
          failedStorage.push(r)
        } else {
          assetMap.set(r.type, r)
          // Fire per-asset callback so the route can emit an SSE 'asset' event immediately
          onAssetComplete?.(r)
        }
      }
    }
  }

  // ── Assemble result structure ─────────────────────────────────────────────

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
    result:    isComplete ? partial as GenerationResult : undefined,
    partial,
    succeeded: Array.from(assetMap.values()),       // every asset that made it through
    failed:    allFailed,
    success:   allFailed.length < ALL_TYPES.length, // at least some succeeded
  }
}
