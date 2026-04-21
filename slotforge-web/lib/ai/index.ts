// ─────────────────────────────────────────────────────────────────────────────
// Spinative — AI Service Factory
// Selects the right provider based on available env vars.
// All callers import from here — never directly from runway.ts / openai.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetType, AspectRatio, BuiltPrompt } from '@/types/assets'
import { generateWithRunway }  from './runway'
import { generateWithOpenAI }  from './openai'
import { generateWithMock }    from './mock'

export type AIProvider = 'runway' | 'openai' | 'mock' | 'auto'

export interface AIGenerateResult {
  url:      string
  provider: 'runway' | 'openai' | 'mock'
}

// ─── Default aspect ratio per asset type ─────────────────────────────────────
// The old logic collapsed everything into "isWide" (backgrounds + logo) vs
// square (everything else), which produced wrong crops for wide banners,
// portrait characters, and vertical column overlays. This table assigns a
// natural default ratio per asset type. Feature-slot keys fall through to
// a heuristic below (name prefix / suffix).
const DEFAULT_RATIO_FOR_ASSET: Partial<Record<AssetType, AspectRatio>> = {
  background_base:  '3:2',
  background_bonus: '3:2',
  logo:             '3:1',    // title banners are wider than 3:2
  character:        '2:3',    // portrait characters
  reel_frame:       '1:1',
  spin_button:      '1:1',
  jackpot_label:    '4:1',    // thin wide plaque
  // All symbols default square — handled by fallback below
}

function defaultRatioFor(assetKey: string): AspectRatio {
  if (assetKey in DEFAULT_RATIO_FOR_ASSET) {
    return DEFAULT_RATIO_FOR_ASSET[assetKey as AssetType]!
  }
  // Feature-slot heuristics — match common naming patterns in
  // FEATURE_SLOT_SPECS so feature art gets an appropriate ratio without
  // a per-slot table. Anything else falls back to square.
  if (/\.bg$/.test(assetKey))                     return '3:2'
  if (/(banner|header|footer|title)/.test(assetKey))  return '3:1'
  if (/badge|counter/.test(assetKey))             return '3:1'
  if (/expanded_overlay/.test(assetKey))          return '1:4'
  return '1:1'
}

// ─── Ratio → provider size mapping ───────────────────────────────────────────
// Each provider supports a different discrete set of dimensions. We pick the
// nearest supported size for the requested ratio.

interface RatioSpec {
  runway: { width: number; height: number }
  openai: { size: '1024x1024' | '1536x1024' | '1024x1536'; dalle: '1024x1024' | '1792x1024' | '1024x1792' }
}

const RATIO_TABLE: Record<AspectRatio, RatioSpec> = {
  '1:1':   { runway: { width: 1024, height: 1024 }, openai: { size: '1024x1024', dalle: '1024x1024' } },
  '3:2':   { runway: { width: 1536, height: 1024 }, openai: { size: '1536x1024', dalle: '1792x1024' } },
  '2:3':   { runway: { width: 1024, height: 1536 }, openai: { size: '1024x1536', dalle: '1024x1792' } },
  '16:9':  { runway: { width: 1792, height: 1024 }, openai: { size: '1536x1024', dalle: '1792x1024' } },
  '9:16':  { runway: { width: 1024, height: 1792 }, openai: { size: '1024x1536', dalle: '1024x1792' } },
  '3:1':   { runway: { width: 1792, height:  896 }, openai: { size: '1536x1024', dalle: '1792x1024' } },
  '4:1':   { runway: { width: 1792, height:  768 }, openai: { size: '1536x1024', dalle: '1792x1024' } },
  '1:4':   { runway: { width:  768, height: 1792 }, openai: { size: '1024x1536', dalle: '1024x1792' } },
}

// ─── Provider resolution ─────────────────────────────────────────────────────

function resolveProvider(requested: AIProvider): 'runway' | 'openai' | 'mock' {
  // Short, distinct log marker so the line survives Vercel's log-preview
  // truncation and can be grepped by "[ai_env]".
  const hasR = !!process.env.RUNWAY_API_KEY
  const hasO = !!process.env.OPENAI_API_KEY
  console.log(`[ai_env] requested=${requested} runway=${hasR} openai=${hasO}`)
  if (requested === 'auto') {
    if (hasR) return 'runway'
    if (hasO) return 'openai'
    console.warn('[ai_env] No API key found — falling back to mock provider')
    return 'mock'
  }
  return requested as 'runway' | 'openai' | 'mock'
}

// ─── Main generate function ──────────────────────────────────────────────────

export interface GenerateImageOptions {
  /** Explicit aspect ratio override. Falls back to DEFAULT_RATIO_FOR_ASSET. */
  ratio?: AspectRatio
}

const MAX_RETRIES = 2

export async function generateImage(
  type:     AssetType,
  built:    BuiltPrompt,
  provider: AIProvider = 'auto',
  options:  GenerateImageOptions = {},
): Promise<AIGenerateResult> {
  const resolved = resolveProvider(provider)
  // Resolve aspect ratio: explicit override > asset-type default.
  // built.assetType is typed AssetType but the pipeline uses it as a string
  // when dispatching feature-slot keys (e.g. 'bonuspick.bg'); cast safely.
  const ratio = options.ratio ?? defaultRatioFor(built.assetType as string)
  const dims  = RATIO_TABLE[ratio]
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(1_500 * attempt) // back-off
        console.log(`[ai] Retry ${attempt}/${MAX_RETRIES} for ${type}`)
      }

      switch (resolved) {
        case 'runway': {
          const r = await generateWithRunway({
            prompt:         built.prompt,
            negativePrompt: built.negativePrompt,
            width:          dims.runway.width,
            height:         dims.runway.height,
          })
          return { url: r.url, provider: 'runway' }
        }

        case 'openai': {
          const isBackground = (type as string).startsWith('background')
          // Backgrounds: gpt-image-1 landscape at highest quality (opaque — full scene)
          // Falls back to dall-e-3 hd if the account lacks gpt-image-1 access
          if (isBackground) {
            try {
              const r = await generateWithOpenAI({
                prompt:       built.prompt,
                model:        'gpt-image-1',
                size:         dims.openai.size,
                quality:      'high',
                background:   'opaque',
                outputFormat: 'png',
              })
              return { url: r.url, provider: 'openai' }
            } catch (gptErr) {
              const msg = gptErr instanceof Error ? gptErr.message : String(gptErr)
              if (msg.includes('model') || msg.includes('404') || msg.includes('not found') || msg.includes('permission')) {
                console.warn(`[ai] gpt-image-1 unavailable for background, falling back to dall-e-3: ${msg}`)
                const r = await generateWithOpenAI({
                  prompt:  built.prompt,
                  model:   'dall-e-3',
                  size:    dims.openai.dalle,
                  quality: 'hd',
                })
                return { url: r.url, provider: 'openai' }
              }
              throw gptErr
            }
          }
          // Symbols, UI elements, logo, character — try gpt-image-1 for native transparency
          try {
            const r = await generateWithOpenAI({
              prompt:      built.prompt,
              model:       'gpt-image-1',
              size:        dims.openai.size,
              quality:     'high',
              background:  'transparent',
              outputFormat: 'png',
            })
            return { url: r.url, provider: 'openai' }
          } catch (gptErr) {
            // gpt-image-1 not available on this account — fall back to dall-e-3
            const msg = gptErr instanceof Error ? gptErr.message : String(gptErr)
            if (msg.includes('model') || msg.includes('404') || msg.includes('not found') || msg.includes('permission')) {
              console.warn(`[ai] gpt-image-1 unavailable for ${type}, falling back to dall-e-3: ${msg}`)
              const r = await generateWithOpenAI({
                prompt:  built.prompt,
                model:   'dall-e-3',
                size:    dims.openai.dalle,
                quality: 'hd',
              })
              return { url: r.url, provider: 'openai' }
            }
            throw gptErr
          }
        }

        case 'mock': {
          const r = await generateWithMock(type, built.assetType)
          return { url: r.url, provider: 'mock' }
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[ai] ${type} attempt ${attempt} failed:`, lastError.message)
    }
  }

  // Previously we silently fell back to the mock provider after all retries
  // failed, which made real provider errors (bad API key, no gpt-image-1
  // access, quota exhausted) invisible to the user — they just saw a
  // placeholder image with provider="mock" and no explanation. Throw the
  // last real error instead so the API response + popup display it. The
  // mock provider is still used when resolveProvider explicitly returns
  // 'mock' (no API keys present), via the case above.
  throw lastError ?? new Error(`[ai] Generation failed for ${type}`)
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
