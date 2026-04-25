// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Asset Generation Pipeline
// Orchestrates: prompt building → AI generation → storage upload
// ─────────────────────────────────────────────────────────────────────────────

import { buildPrompt }              from '@/lib/ai/promptBuilder'
import { generateImage }            from '@/lib/ai'
import { uploadGeneratedAssets }    from '@/lib/storage/assets'
import type { AssetType, GeneratedAsset, GenerationResult, GenerateRequest, ProjectMeta } from '@/types/assets'
import type { AIProvider }          from '@/lib/ai'

// ─── All asset types in generation order ────────────────────────────────────
// Ordered from largest → smallest to surface failures early.
// Exported so route.ts can derive the total count dynamically.

export const ALL_TYPES: AssetType[] = [
  'background_base',
  'background_bonus',
  'symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4', 'symbol_high_5',
  'symbol_low_1',  'symbol_low_2',  'symbol_low_3',  'symbol_low_4',  'symbol_low_5',
  'symbol_wild',
  'symbol_scatter',
  'logo',
  'reel_frame',
  'spin_button',
  'jackpot_label',
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
  /** v121 / C2 — atomically reserve a credit BEFORE the provider call.
   *  Returns true when reserved (caller proceeds), false when the user
   *  hit their monthly quota (caller short-circuits with a `quota_hit`
   *  failure entry). When omitted the pipeline behaves as before with
   *  no reserve step — used by code paths that bill outside the loop. */
  reserveCredit?:   () => Promise<boolean>
  /** v121 / C2 — refund a previously-reserved credit when the provider
   *  call or upload fails. Best-effort: pipeline doesn't await this in
   *  hot paths because a refund DB hiccup shouldn't surface as the
   *  user-visible failure. */
  refundCredit?:    () => Promise<void>
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
  const meta     = req.project_meta
  const provider = (req.provider ?? opts.provider ?? 'auto') as AIProvider
  const { onProgress, onAssetComplete, reserveCredit, refundCredit } = opts

  // Honour caller-specified subset (for "fill gaps" mode) or fall back to all types
  const typesToGenerate = req.asset_types?.length ? req.asset_types : ALL_TYPES
  const total    = typesToGenerate.length
  let completed  = 0

  const generationErrors: Map<AssetType, string> = new Map()
  const failedStorage: Array<{ type: AssetType; error: string }> = []
  const assetMap = new Map<AssetType, GeneratedAsset>()

  // ── Generate + upload in interleaved batches ───────────────────────────────
  // Each batch: generate in parallel → upload immediately → notify via onAssetComplete
  // This lets the SSE stream deliver assets one-by-one instead of all-at-once,
  // avoiding Vercel's 60 s function timeout on large generations.

  for (let i = 0; i < typesToGenerate.length; i += GENERATION_CONCURRENCY) {
    const batch = typesToGenerate.slice(i, i + GENERATION_CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map(async type => {
        // v121 / C2 — reserve a credit BEFORE the provider call. When the
        // user has hit their quota mid-batch the rest of the batch is
        // skipped via a sentinel "quota_hit" rejection so the route can
        // surface a clean 402-equivalent stream event without burning
        // more provider cost. reserveCredit is optional: tests and any
        // future caller that bills outside the loop pass nothing here.
        if (reserveCredit) {
          const ok = await reserveCredit()
          if (!ok) throw new Error('quota_hit')
        }
        try {
          // Per-slot override from the Review Prompts modal. v119: the
          // override now carries a mode ({text, mode}) — append rides
          // alongside the composed prompt as a context line, replace
          // takes over the whole positive prompt. Pre-v119 callers
          // could pass a bare string (= replace mode); we accept both
          // here for back-compat with any in-flight requests.
          const overrideRaw = req.custom_prompts?.[type]
          let customPrompt: string | undefined
          let customPromptMode: 'append' | 'replace' | undefined
          if (typeof overrideRaw === 'string') {
            const text = overrideRaw.trim()
            if (text) { customPrompt = text; customPromptMode = 'replace' }
          } else if (overrideRaw && typeof overrideRaw === 'object') {
            const text = overrideRaw.text?.trim()
            if (text) { customPrompt = text; customPromptMode = overrideRaw.mode ?? 'replace' }
          }
          const built = buildPrompt(type, theme, req.style_id, meta, {
            customPrompt,
            customPromptMode,
          })
          // Apply the optional batch-wide ratio override. Per-asset defaults
          // still kick in for any asset whose caller didn't pass a ratio —
          // see DEFAULT_RATIO_FOR_ASSET in lib/ai/index.ts.
          const result = await generateImage(type, built, provider, { ratio: req.ratio })
          return { type, ...result, prompt: built.prompt }
        } catch (e) {
          // Provider failed AFTER we reserved — refund so the user isn't
          // billed for an asset they never received. Don't await — the
          // refund is best-effort.
          if (refundCredit) refundCredit().catch(() => {})
          throw e
        }
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
          // Provider produced an image but Storage couldn't save it —
          // user has nothing usable, refund the reserved credit.
          if (refundCredit) refundCredit().catch(() => {})
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
