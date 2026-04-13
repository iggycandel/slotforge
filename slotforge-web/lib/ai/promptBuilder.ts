// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Prompt Engineering System
// All AI prompts flow through here. Never expose master prompt to the client.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetType, BuiltPrompt, PromptCategory } from '@/types/assets'

// ─── Hidden master prompt ────────────────────────────────────────────────────
// Appended to every single generation. Never sent to the browser.

const MASTER_PROMPT =
  'Slot game asset, clean professional casino style, high-end 3D rendering, ' +
  'consistent art direction, isolated subject, centered composition, ' +
  'transparent background where applicable, no UI overlays, no text unless logo, ' +
  'no watermarks, no mockups, strong silhouette, production-ready game art, ' +
  '4K quality, Unreal Engine cinematic lighting'

const NEGATIVE_PROMPT =
  'blurry, low quality, watermark, text overlay, UI elements, screenshot, ' +
  'photo, realistic photograph, amateur, cropped, out of frame, ugly, distorted, ' +
  'duplicate, multiple subjects in one image, border, frame'

// ─── Per-category prompt templates ──────────────────────────────────────────

const TEMPLATES: Record<PromptCategory, (theme: string) => string> = {
  background: (theme) =>
    `Slot game background scene, ${theme} theme, wide panoramic environment, ` +
    `no characters in foreground, immersive depth, rich atmospheric lighting, ` +
    `dramatic color palette, highly detailed environment art, 16:9 landscape orientation, ` +
    `premium casino game background, no UI elements, cinematic quality`,

  symbol_high: (theme) =>
    `Slot game premium symbol, ${theme} theme, high-value icon, ` +
    `ornate golden details, glossy material, jeweled accents, strong visual contrast, ` +
    `centered on transparent background, bold silhouette, glowing edges, ` +
    `3D rendered casino symbol, square composition`,

  symbol_low: (theme) =>
    `Slot game symbol, ${theme} theme, standard playing card symbol variant, ` +
    `clean colorful icon, simplified flat-to-semi-3D style, bright colors, ` +
    `centered on transparent background, clear readable shape, no gradients, ` +
    `casino card game symbol, square composition`,

  symbol_wild: (theme) =>
    `Slot game WILD symbol, ${theme} theme, powerful magical energy, ` +
    `glowing aura, electric particles, supernatural presence, ` +
    `"WILD" text integrated naturally into the design, centered transparent background, ` +
    `premium 3D render, explosive visual presence, square composition`,

  symbol_scatter: (theme) =>
    `Slot game SCATTER symbol, ${theme} theme, mystical special object, ` +
    `radiant light particles, sacred geometry, glowing center, ` +
    `"SCATTER" text integrated naturally into the design, centered transparent background, ` +
    `premium 3D render, magical aura, square composition`,

  logo: (theme) =>
    `Slot game logo, ${theme} theme, bold stylized typography, ` +
    `metallic gold lettering, dramatic lighting, dark background, ` +
    `premium casino brand identity, no subtitles, centered composition, ` +
    `3D embossed text effect, wide banner format`,
}

// ─── Asset type → category mapping ──────────────────────────────────────────

const TYPE_TO_CATEGORY: Record<AssetType, PromptCategory> = {
  background_base:   'background',
  background_bonus:  'background',
  symbol_high_1:     'symbol_high',
  symbol_high_2:     'symbol_high',
  symbol_high_3:     'symbol_high',
  symbol_high_4:     'symbol_high',
  symbol_high_5:     'symbol_high',
  symbol_low_1:      'symbol_low',
  symbol_low_2:      'symbol_low',
  symbol_low_3:      'symbol_low',
  symbol_low_4:      'symbol_low',
  symbol_low_5:      'symbol_low',
  symbol_wild:       'symbol_wild',
  symbol_scatter:    'symbol_scatter',
  logo:              'logo',
}

// ─── Bonus scene modifier ────────────────────────────────────────────────────

const BONUS_MODIFIER =
  'bonus game variation, enhanced atmosphere, golden light, celebratory mood, ' +
  'richer saturation, free spins visual tone, slightly different color palette'

// ─── High symbol differentiators (to ensure visual variety) ─────────────────

const HIGH_SYM_VARIANTS = [
  'primary hero symbol, most valuable, elaborate design, dominant presence',
  'secondary premium symbol, gemstone or artifact, detailed decoration',
  'tertiary premium symbol, cultural artifact or deity, medium complexity',
  'fourth tier symbol, stylized weapon or crown, clean design',
  'fifth tier symbol, decorative object or creature, minimalist detail',
]

const LOW_SYM_VARIANTS = [
  'Ace card symbol variant, stylized with theme elements',
  'King card symbol variant, stylized with theme elements',
  'Queen card symbol variant, stylized with theme elements',
  'Jack card symbol variant, stylized with theme elements',
  'Ten card symbol variant, stylized with theme elements',
]

// ─── Main build function ──────────────────────────────────────────────────────

export function buildPrompt(type: AssetType, userTheme: string): BuiltPrompt {
  const category = TYPE_TO_CATEGORY[type]
  const theme    = userTheme.trim().toLowerCase()

  let specificPrompt = TEMPLATES[category](theme)

  // Inject per-asset differentiators
  if (type === 'background_bonus') {
    specificPrompt += `, ${BONUS_MODIFIER}`
  }

  const highIdx = ['symbol_high_1','symbol_high_2','symbol_high_3','symbol_high_4','symbol_high_5'].indexOf(type)
  if (highIdx >= 0) {
    specificPrompt += `, ${HIGH_SYM_VARIANTS[highIdx]}`
  }

  const lowIdx = ['symbol_low_1','symbol_low_2','symbol_low_3','symbol_low_4','symbol_low_5'].indexOf(type)
  if (lowIdx >= 0) {
    specificPrompt += `, ${LOW_SYM_VARIANTS[lowIdx]}`
  }

  // Final prompt = specific details + master quality requirements
  const prompt = `${specificPrompt}. ${MASTER_PROMPT}`

  return {
    category,
    assetType: type,
    prompt,
    negativePrompt: NEGATIVE_PROMPT,
  }
}

// ─── Build all prompts for a theme at once ───────────────────────────────────

export function buildAllPrompts(theme: string): Record<AssetType, BuiltPrompt> {
  const types: AssetType[] = [
    'background_base', 'background_bonus',
    'symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4', 'symbol_high_5',
    'symbol_low_1', 'symbol_low_2', 'symbol_low_3', 'symbol_low_4', 'symbol_low_5',
    'symbol_wild', 'symbol_scatter', 'logo',
  ]

  return Object.fromEntries(
    types.map(t => [t, buildPrompt(t, theme)])
  ) as Record<AssetType, BuiltPrompt>
}
