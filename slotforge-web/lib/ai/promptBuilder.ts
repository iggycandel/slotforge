// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Prompt Engineering System
// All AI prompts flow through here. Never expose master prompt to the client.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetType, BuiltPrompt, PromptCategory } from '@/types/assets'
import { getStyleById } from '@/lib/ai/styles'

// ─── Hidden master prompt ────────────────────────────────────────────────────
// Appended to every single generation. Never sent to the browser.

const MASTER_PROMPT =
  'Slot game asset, clean professional casino style, high-end 3D rendering, ' +
  'consistent art direction, isolated subject, centered composition, ' +
  'no UI overlays, no watermarks, no mockups, strong silhouette, ' +
  'production-ready game art, 4K quality, Unreal Engine cinematic lighting'

const NEGATIVE_PROMPT =
  'blurry, low quality, watermark, text overlay, screenshot, ' +
  'photo, realistic photograph, amateur, cropped, out of frame, ugly, distorted, ' +
  'duplicate, multiple subjects in one image, solid plain background, white background, ' +
  'grey background, gradient background'

// ─── Per-category prompt templates ──────────────────────────────────────────

const TEMPLATES: Record<PromptCategory, (theme: string) => string> = {
  background: (theme) =>
    `Slot game background scene, ${theme} theme, wide panoramic environment, ` +
    `no characters in foreground, immersive depth, rich atmospheric lighting, ` +
    `dramatic color palette, highly detailed environment art, 16:9 landscape orientation, ` +
    `premium casino game background, no UI elements, cinematic quality`,

  symbol_high: (theme) =>
    `Single isolated slot game symbol, ${theme} theme, high-value premium icon, ` +
    `ornate golden details, glossy jeweled material, strong visual contrast, ` +
    `floating isolated object with no background, bold silhouette, glowing rim light, ` +
    `3D rendered casino symbol, square composition, cutout ready`,

  symbol_low: (theme) =>
    `Single isolated slot game symbol, ${theme} theme, playing card rank icon, ` +
    `clean colorful semi-3D style, bright vibrant colors, ` +
    `floating isolated object with no background, clear readable shape, ` +
    `casino card symbol, square composition, cutout ready`,

  symbol_wild: (theme) =>
    `Single isolated slot game WILD symbol, ${theme} theme, powerful magical energy, ` +
    `glowing aura, electric particles, supernatural presence, ` +
    `"WILD" text integrated naturally into the design, floating isolated object with no background, ` +
    `premium 3D render, explosive visual presence, square composition, cutout ready`,

  symbol_scatter: (theme) =>
    `Single isolated slot game SCATTER symbol, ${theme} theme, mystical special object, ` +
    `radiant light particles, sacred geometry, glowing center, ` +
    `"SCATTER" text integrated naturally into the design, floating isolated object with no background, ` +
    `premium 3D render, magical aura, square composition, cutout ready`,

  logo: (theme) =>
    `Slot game logo title treatment, ${theme} theme, bold stylized typography, ` +
    `metallic gold lettering, dramatic rim lighting, ` +
    `premium casino brand wordmark, no subtitles, centered composition, ` +
    `3D embossed text effect, isolated floating text with no background, wide banner format`,

  reel_frame: (theme) =>
    `Slot machine reel window frame, ${theme} theme, decorative architectural border, ` +
    `ornate metallic trim with themed engravings, golden or jeweled accents, ` +
    `hollow center — only the frame border itself, NO reel content or symbols inside, ` +
    `isolated frame shape with no background, portrait or square composition, ` +
    `premium casino game UI art, cutout ready`,

  spin_button: (theme) =>
    `Slot machine spin button, ${theme} theme, 3D game UI button element, ` +
    `bold circular or rounded shape, glowing animated rim, themed metallic finish, ` +
    `arrow icon or "SPIN" text integrated into the design, floating isolated object with no background, ` +
    `premium casino button art, vivid materials, square composition, cutout ready`,

  jackpot_label: (theme) =>
    `Casino jackpot display badge, ${theme} theme, glowing ornamental banner shape, ` +
    `bold "JACKPOT" lettering with golden gleaming text, radiant light particles, ` +
    `crown or star embellishments, floating isolated badge with no background, ` +
    `premium slot machine typography, wide banner format, cutout ready`,
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
  character:         'logo',
  reel_frame:        'reel_frame',
  spin_button:       'spin_button',
  jackpot_label:     'jackpot_label',
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
// styleId is the ID of a GraphicStyle from GRAPHIC_STYLES (e.g. 'cartoon_3d').
// If provided, its promptModifier is injected before MASTER_PROMPT and its
// negativeModifier is appended to the negative prompt.

export function buildPrompt(type: AssetType, userTheme: string, styleId?: string): BuiltPrompt {
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

  // Inject graphic style modifier (server-side only — not shown to clients unfiltered)
  const style = styleId ? getStyleById(styleId) : undefined
  if (style) {
    specificPrompt += `. ${style.promptModifier}`
  }

  // Final prompt = specific details + master quality requirements
  const prompt = `${specificPrompt}. ${MASTER_PROMPT}`

  // Combine base negative prompt with style-specific negative modifier
  const negativePrompt = style?.negativeModifier
    ? `${NEGATIVE_PROMPT}, ${style.negativeModifier}`
    : NEGATIVE_PROMPT

  return {
    category,
    assetType: type,
    prompt,
    negativePrompt,
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
