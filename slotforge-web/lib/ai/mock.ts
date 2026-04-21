// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Mock AI provider (for dev/testing without API keys)
// Returns placeholder image URLs so the full pipeline can be exercised locally
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetType } from '@/types/assets'

// Deterministic placeholder colors per category
const COLORS: Record<string, string> = {
  background: '1a0e02',
  symbol_high: 'c9a84c',
  symbol_low:  '4a4a6a',
  symbol_wild: 'c040f0',
  symbol_scatter: '28c88c',
  logo: '060609',
}

function categoryFromType(type: AssetType): string {
  if (type.startsWith('background'))  return 'background'
  if (type.startsWith('symbol_high')) return 'symbol_high'
  if (type.startsWith('symbol_low'))  return 'symbol_low'
  if (type === 'symbol_wild')         return 'symbol_wild'
  if (type === 'symbol_scatter')      return 'symbol_scatter'
  return 'logo'
}

export interface MockResult {
  url:      string
  provider: 'mock'
}

/**
 * Returns a placeholder image URL using placehold.co.
 * No API key needed — safe for local development.
 */
export async function generateWithMock(
  type: AssetType,
  theme: string
): Promise<MockResult> {
  // Simulate async generation latency
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300))

  const cat   = categoryFromType(type)
  const color = COLORS[cat] ?? '333333'
  const isWide = type.startsWith('background') || type === 'logo'
  const dims   = isWide ? '1792x1024' : '1024x1024'
  const label  = encodeURIComponent(`${type}\n${theme}`)

  // `.png` suffix forces placehold.co to rasterise — the default response is
  // SVG, which the storage layer used to upload with a mismatched
  // content-type: image/png header, producing broken-icon tiles in the UI.
  return {
    url:      `https://placehold.co/${dims}/${color}/ffffff.png?text=${label}&font=raleway`,
    provider: 'mock',
  }
}
