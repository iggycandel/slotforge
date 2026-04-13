// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — AI Service Factory
// Selects the right provider based on available env vars.
// All callers import from here — never directly from runway.ts / openai.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetType } from '@/types/assets'
import type { BuiltPrompt } from '@/types/assets'
import { generateWithRunway }  from './runway'
import { generateWithOpenAI }  from './openai'
import { generateWithMock }    from './mock'

export type AIProvider = 'runway' | 'openai' | 'mock' | 'auto'

export interface AIGenerateResult {
  url:      string
  provider: 'runway' | 'openai' | 'mock'
}

// ─── Provider resolution ─────────────────────────────────────────────────────

function resolveProvider(requested: AIProvider): 'runway' | 'openai' | 'mock' {
  if (requested === 'auto') {
    if (process.env.RUNWAY_API_KEY) return 'runway'
    if (process.env.OPENAI_API_KEY) return 'openai'
    console.warn('[ai] No API key found — falling back to mock provider')
    return 'mock'
  }
  return requested as 'runway' | 'openai' | 'mock'
}

// ─── Main generate function ──────────────────────────────────────────────────

const MAX_RETRIES = 2

export async function generateImage(
  type:     AssetType,
  built:    BuiltPrompt,
  provider: AIProvider = 'auto'
): Promise<AIGenerateResult> {
  const resolved = resolveProvider(provider)
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(1_500 * attempt) // back-off
        console.log(`[ai] Retry ${attempt}/${MAX_RETRIES} for ${type}`)
      }

      switch (resolved) {
        case 'runway': {
          const isWide = type.startsWith('background') || type === 'logo'
          const r = await generateWithRunway({
            prompt:         built.prompt,
            negativePrompt: built.negativePrompt,
            width:          isWide ? 1792 : 1024,
            height:         isWide ?  896 : 1024,
          })
          return { url: r.url, provider: 'runway' }
        }

        case 'openai': {
          const isWide = type.startsWith('background') || type === 'logo'
          const r = await generateWithOpenAI({
            prompt:  built.prompt,
            size:    isWide ? '1792x1024' : '1024x1024',
            quality: 'hd',
          })
          return { url: r.url, provider: 'openai' }
        }

        case 'mock': {
          const r = await generateWithMock(type, built.assetType)
          return { url: r.url, provider: 'mock' }
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[ai] ${type} attempt ${attempt} failed:`, lastError.message)

      // If primary fails on last attempt, try mock as ultimate fallback
      if (attempt === MAX_RETRIES && resolved !== 'mock') {
        console.warn(`[ai] Falling back to mock for ${type}`)
        const r = await generateWithMock(type, built.assetType)
        return { url: r.url, provider: 'mock' }
      }
    }
  }

  throw lastError ?? new Error(`[ai] Generation failed for ${type}`)
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
