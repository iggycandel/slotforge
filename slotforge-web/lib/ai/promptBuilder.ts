// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Prompt Engineering System V2
// All AI prompts flow through here. Never expose master prompt to the client.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetType, BuiltPrompt, PromptCategory, ProjectMeta } from '@/types/assets'
import { getStyleById } from '@/lib/ai/styles'

// ─── Global Quality Blocks ───────────────────────────────────────────────────

const CORE_QUALITY_PROMPT =
  'slot game asset, premium casino game quality, production-ready game art, ' +
  'strong silhouette, high readability, clean composition, consistent art direction, ' +
  'polished finish, high detail, controlled lighting, commercially usable visual clarity'

const ISOLATED_ASSET_PROMPT =
  'single subject, isolated object, centered composition, no background, cutout ready, ' +
  'transparent background look, no UI elements, no mockup presentation'

const ENVIRONMENT_PROMPT =
  'environment scene, cinematic depth, atmospheric perspective, layered composition, ' +
  'immersive worldbuilding, no foreground UI, no logo overlays'

const READABILITY_PROMPT =
  'clear shape recognition, readable at small size, high contrast, low visual noise, ' +
  'distinct silhouette, clean edge separation'

const CONSISTENCY_PROMPT =
  'consistent rendering pipeline, consistent lighting direction, consistent material response, ' +
  'same visual family as the rest of the asset set'

// ─── Negative Prompt Blocks ───────────────────────────────────────────────────

const NEGATIVE_BASE =
  'blurry, low quality, low detail, watermark, logo overlay, text overlay, ' +
  'cropped, cut off, out of frame, distorted, malformed, duplicate object, ' +
  'multiple unrelated objects, messy composition, noisy background, UI screenshot, mockup, presentation board'

const NEGATIVE_ISOLATED =
  'background scene, environment, horizon line, table surface, room interior, ' +
  'hand holding object, packaging, frame mockup'

const NEGATIVE_ENVIRONMENT =
  'characters in foreground, close-up object, isolated item on blank background, ' +
  'UI overlay, menu buttons, reward text, slot reels'

// ─── Per-category prompt templates ──────────────────────────────────────────

const TEMPLATES: Record<PromptCategory, (theme: string) => string> = {
  background: (theme) =>
    `${ENVIRONMENT_PROMPT}, ` +
    `slot game background scene, ${theme} theme, wide panoramic environment, ` +
    `no characters in foreground, immersive depth, rich atmospheric lighting, ` +
    `dramatic color palette, highly detailed environment art, 16:9 landscape orientation, ` +
    `premium casino game background, no UI elements, cinematic quality`,

  symbol_high: (theme) =>
    `${ISOLATED_ASSET_PROMPT}, ` +
    `single isolated slot game symbol, ${theme} theme, premium high-value icon, ` +
    `unique material identity, luxurious finish, bold silhouette, strong focal point, ` +
    `readable at small size, visually prestigious, controlled detail density, ` +
    `square composition, no text`,

  symbol_low: (theme) =>
    `${ISOLATED_ASSET_PROMPT}, ` +
    `single isolated slot game symbol, ${theme} theme, low-value card rank icon, ` +
    `simple readable shape, minimal detail, bright controlled color palette, ` +
    `clear rank hierarchy, readable at very small size, square composition, no text`,

  symbol_wild: (theme) =>
    `${ISOLATED_ASSET_PROMPT}, ` +
    `single isolated slot game wild symbol, ${theme} theme, powerful centerpiece design, ` +
    `strong glow accents, dominant silhouette, ` +
    `central plaque area reserved for later WILD text placement, no generated text`,

  symbol_scatter: (theme) =>
    `${ISOLATED_ASSET_PROMPT}, ` +
    `single isolated slot game scatter symbol, ${theme} theme, mystical reward object, ` +
    `radiant center, magical particles, ` +
    `plaque area reserved for later SCATTER text placement, no generated text`,

  logo: (theme) =>
    `${ISOLATED_ASSET_PROMPT}, ` +
    `slot game logo title treatment, ${theme} theme, bold stylized typography, ` +
    `metallic gold lettering, dramatic rim lighting, ` +
    `premium casino brand wordmark, no subtitles, centered composition, ` +
    `3D embossed text effect, isolated floating text with no background, wide banner format`,

  reel_frame: (theme) =>
    `${ISOLATED_ASSET_PROMPT}, ` +
    `slot machine reel window frame, ${theme} theme, decorative architectural border, ` +
    `ornate metallic trim with themed engravings, golden or jeweled accents, ` +
    `hollow center — only the frame border itself, NO reel content or symbols inside, ` +
    `isolated frame shape with no background, portrait or square composition, ` +
    `premium casino game UI art, cutout ready`,

  spin_button: (theme) =>
    `${ISOLATED_ASSET_PROMPT}, ` +
    `slot machine spin button, ${theme} theme, 3D game UI button element, ` +
    `bold circular or rounded shape, glowing animated rim, themed metallic finish, ` +
    `arrow icon or "SPIN" text integrated into the design, floating isolated object with no background, ` +
    `premium casino button art, vivid materials, square composition, cutout ready`,

  jackpot_label: (theme) =>
    `${ISOLATED_ASSET_PROMPT}, ` +
    `casino jackpot display badge, ${theme} theme, glowing ornamental banner shape, ` +
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

// ─── High symbol differentiators (V2 — ensures strong visual variety) ────────

const HIGH_SYM_VARIANTS = [
  'primary hero symbol, highest value, most elaborate silhouette, strongest glow accents',
  'secondary premium symbol, refined silhouette, strong material richness',
  'tertiary premium symbol, balanced silhouette, moderate ornamentation',
  'fourth-tier symbol, cleaner silhouette, reduced detailing',
  'fifth-tier symbol, simplest premium symbol, minimal detail',
]

// ─── Low symbol differentiators (V2) ─────────────────────────────────────────

const LOW_SYM_VARIANTS = [
  'Ace variant, strongest contrast',
  'King variant, regal shape language',
  'Queen variant, elegant readable form',
  'Jack variant, simple silhouette',
  'Ten variant, minimal decoration',
]

// ─── Build meta context block ─────────────────────────────────────────────────
// Converts rich Theme-panel data into prompt modifiers.

function buildMetaContext(type: AssetType, category: PromptCategory, meta?: ProjectMeta): string {
  if (!meta) return ''

  const parts: string[] = []

  // Mood/Tone → universal
  if (meta.mood) {
    parts.push(`${meta.mood.toLowerCase()} mood`)
  }

  // Colour palette → universal (affects material and lighting choices)
  if (meta.colorPrimary || meta.colorBg || meta.colorAccent) {
    const colours = [
      meta.colorPrimary && `primary ${meta.colorPrimary}`,
      meta.colorBg      && `background ${meta.colorBg}`,
      meta.colorAccent  && `accent ${meta.colorAccent}`,
    ].filter(Boolean).join(', ')
    if (colours) parts.push(`colour palette: ${colours}`)
  }

  // Setting/World → especially relevant for backgrounds
  if (meta.setting && category === 'background') {
    parts.push(`world: ${meta.setting}`)
  }

  // Bonus narrative → specifically for the bonus background
  if (type === 'background_bonus' && meta.bonusNarrative) {
    parts.push(`bonus narrative: ${meta.bonusNarrative}`)
  }

  // Art style → adds production style hint
  if (meta.artStyle) {
    parts.push(`art style: ${meta.artStyle}`)
  }

  // Visual Inspiration / Art Reference → concrete visual reference
  if (meta.artRef) {
    parts.push(`visual reference: ${meta.artRef}`)
  }

  // Art Direction Notes → explicit constraints from the art team
  if (meta.artNotes) {
    parts.push(`art direction: ${meta.artNotes}`)
  }

  return parts.length ? parts.join(', ') : ''
}

// ─── Main build function ──────────────────────────────────────────────────────
// styleId is the ID of a GraphicStyle from GRAPHIC_STYLES (e.g. 'cartoon_3d').
// meta is the optional rich Theme-panel context from ProjectMeta.
// Final prompt = CORE_QUALITY + TYPE_BLOCK + META_CONTEXT + READABILITY + CONSISTENCY + TEMPLATE + VARIANT + STYLE_MODIFIER

export function buildPrompt(type: AssetType, userTheme: string, styleId?: string, meta?: ProjectMeta): BuiltPrompt {
  const category = TYPE_TO_CATEGORY[type]
  const theme    = userTheme.trim().toLowerCase() || 'slot game'

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

  // Inject rich project meta (mood, colours, setting, art direction…)
  const metaContext = buildMetaContext(type, category, meta)
  if (metaContext) {
    specificPrompt += `, ${metaContext}`
  }

  // Inject graphic style modifier (server-side only — not shown to clients unfiltered)
  const style = styleId ? getStyleById(styleId) : undefined
  if (style) {
    specificPrompt += `. ${style.promptModifier}`
  }

  // Final prompt = V2 quality blocks + specific details
  const prompt = [
    CORE_QUALITY_PROMPT,
    specificPrompt,
    READABILITY_PROMPT,
    CONSISTENCY_PROMPT,
  ].join(', ')

  // Combine negative prompts (base + isolated/environment + style-specific)
  const isEnvironment = category === 'background'
  const negativeExtra  = isEnvironment ? NEGATIVE_ENVIRONMENT : NEGATIVE_ISOLATED
  const negativePrompt = style?.negativeModifier
    ? `${NEGATIVE_BASE}, ${negativeExtra}, ${style.negativeModifier}`
    : `${NEGATIVE_BASE}, ${negativeExtra}`

  return {
    category,
    assetType: type,
    prompt,
    negativePrompt,
  }
}

// ─── Build all prompts for a theme at once ───────────────────────────────────

export function buildAllPrompts(theme: string, meta?: ProjectMeta): Record<AssetType, BuiltPrompt> {
  const types: AssetType[] = [
    'background_base', 'background_bonus',
    'symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4', 'symbol_high_5',
    'symbol_low_1', 'symbol_low_2', 'symbol_low_3', 'symbol_low_4', 'symbol_low_5',
    'symbol_wild', 'symbol_scatter', 'logo',
  ]

  return Object.fromEntries(
    types.map(t => [t, buildPrompt(t, theme, undefined, meta)])
  ) as Record<AssetType, BuiltPrompt>
}
