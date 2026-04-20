// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Prompt Engineering System V3
// All AI prompts flow through here. Never expose master prompt to the client.
//
// V3 key changes:
//   • Style is injected FIRST — it defines the entire visual language
//   • Project identity anchor leads every prompt (game name + theme + style)
//   • Stronger cross-asset consistency language on every tile
//   • Symbol names from the GDD are woven into the tile description
//   • Background uses the full world-building block (setting + story + mood)
//   • Negative prompts tuned per category to prevent style drift
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetType, BuiltPrompt, PromptCategory, ProjectMeta } from '@/types/assets'
import { getStyleById } from '@/lib/ai/styles'

// ─── Global Quality Blocks ───────────────────────────────────────────────────

const CORE_QUALITY =
  'premium casino slot game asset, production-ready game art, ' +
  'commercially released quality, high detail, polished finish'

const READABILITY =
  'strong silhouette, clear shape recognition, readable at small size, ' +
  'high contrast edges, distinct form, low visual noise'

const CONSISTENCY =
  'cohesive asset set, same art pipeline, same lighting direction from upper-left, ' +
  'same material response language, same colour temperature, unified visual family'

const ISOLATED_BASE =
  'single isolated subject, centered composition, pure transparent background, ' +
  'cutout ready, no background elements, no ground shadow, no UI frame, no text overlay'

const ENVIRONMENT_BASE =
  'wide environment scene, cinematic depth, atmospheric layered composition, ' +
  'immersive world-building, rich background detail, no foreground UI, no character close-up'

// ─── Negative Prompt Blocks ───────────────────────────────────────────────────

const NEG_UNIVERSAL =
  'blurry, low resolution, pixelated, watermark, signature, logo overlay, ' +
  'cropped edges, out of frame, distorted anatomy, duplicate elements, ' +
  'UI screenshot, mockup, presentation board, collage, split-image'

const NEG_ISOLATED =
  'background scene, horizon line, environment, table surface, room interior, ' +
  'hand holding object, pedestal, packaging mockup, drop shadow scene, multiple objects'

const NEG_ENVIRONMENT =
  'close-up isolated object, item on blank background, slot reel overlay, ' +
  'UI buttons, reward text banners, HUD elements, characters in tight foreground'

const NEG_SYMBOLS =
  'text, letters, numbers, written words, readable glyphs, watermark'

// ─── Per-category base templates ─────────────────────────────────────────────
// Templates no longer include the theme — that is injected by the project
// identity block to ensure it is tied to the graphic style consistently.

const TEMPLATES: Record<PromptCategory, () => string> = {
  background: () =>
    `${ENVIRONMENT_BASE}, ` +
    `slot game background scene, wide panoramic vista, ` +
    `dramatic atmospheric lighting, rich saturated colors, ` +
    `deep parallax depth with foreground mid-ground background layers, ` +
    `premium AAA casino game background art, 3:2 landscape orientation`,

  symbol_high: () =>
    `${ISOLATED_BASE}, ` +
    `single slot game high-value symbol, premium icon design, ` +
    `elaborate surface detail, unique material identity, luxurious finish, ` +
    `bold dominant silhouette, strong focal point, controlled detail density, ` +
    `square composition`,

  symbol_low: () =>
    `${ISOLATED_BASE}, ` +
    `single slot game low-value card symbol, clean readable shape, ` +
    `minimal ornamental detail, bright controlled palette, ` +
    `clear rank silhouette, readable at very small size, square composition`,

  symbol_wild: () =>
    `${ISOLATED_BASE}, ` +
    `slot game Wild symbol, powerful centerpiece icon, ` +
    `strong glowing energy accents, dominant hero silhouette, ` +
    `plaque area in center reserved for WILD text (do not generate text), ` +
    `maximum visual impact, square composition`,

  symbol_scatter: () =>
    `${ISOLATED_BASE}, ` +
    `slot game Scatter/Bonus symbol, mystical reward object, ` +
    `radiant emanating light, magical particle effects, ` +
    `plaque area reserved for SCATTER text (do not generate text), ` +
    `high visual excitement, square composition`,

  logo: () =>
    `${ISOLATED_BASE}, ` +
    `slot game title logo treatment, bold stylized game wordmark, ` +
    `metallic gold 3D lettering, dramatic rim lighting, ` +
    `premium casino brand identity, no subtitles, wide banner format, ` +
    `floating text with no background, embossed dimensional text effect`,

  reel_frame: () =>
    `${ISOLATED_BASE}, ` +
    `slot machine reel window frame, decorative architectural border only, ` +
    `ornate metallic trim with themed engravings, golden jeweled accents, ` +
    `hollow transparent center — frame border only, no symbols inside, ` +
    `portrait or square composition`,

  spin_button: () =>
    `${ISOLATED_BASE}, ` +
    `slot machine spin button UI element, 3D game button, ` +
    `bold circular rounded shape, glowing animated rim light, ` +
    `themed metallic finish, integrated arrow motif, ` +
    `vivid premium materials, square composition`,

  jackpot_label: () =>
    `${ISOLATED_BASE}, ` +
    `casino jackpot display badge, ornamental glowing banner shape, ` +
    `bold JACKPOT lettering with gleaming golden text, radiant light particles, ` +
    `crown star embellishments, wide banner format`,
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
  symbol_high_6:     'symbol_high',
  symbol_high_7:     'symbol_high',
  symbol_high_8:     'symbol_high',
  symbol_low_1:      'symbol_low',
  symbol_low_2:      'symbol_low',
  symbol_low_3:      'symbol_low',
  symbol_low_4:      'symbol_low',
  symbol_low_5:      'symbol_low',
  symbol_low_6:      'symbol_low',
  symbol_low_7:      'symbol_low',
  symbol_low_8:      'symbol_low',
  symbol_wild:       'symbol_wild',
  symbol_scatter:    'symbol_scatter',
  symbol_special_3:  'symbol_scatter',
  symbol_special_4:  'symbol_scatter',
  symbol_special_5:  'symbol_scatter',
  symbol_special_6:  'symbol_scatter',
  logo:              'logo',
  character:         'logo',
  reel_frame:        'reel_frame',
  spin_button:       'spin_button',
  jackpot_label:     'jackpot_label',
}

// ─── High symbol tier differentiators ────────────────────────────────────────

const HIGH_SYM_TIER = [
  'tier-1 highest-value icon, most elaborate ornamentation, strongest glow, dominant visual weight',
  'tier-2 premium icon, refined ornamentation, rich material surface, strong visual weight',
  'tier-3 premium icon, balanced ornamentation, moderate detail density',
  'tier-4 icon, cleaner silhouette, reduced ornamentation, lighter visual weight',
  'tier-5 icon, simplest premium form, minimal ornament, lightest visual weight',
  'tier-6 icon, simple clean form, understated design',
  'tier-7 icon, minimal form, very simple design',
  'tier-8 lowest high-value icon, flat simple icon',
]

// ─── Low symbol suit differentiators ─────────────────────────────────────────

const LOW_SYM_SUIT = [
  'Ace — strongest contrast, boldest weight',
  'King — regal angular form',
  'Queen — elegant curved form',
  'Jack — playful balanced form',
  'Ten — neutral simple form',
  'Nine — small compact form',
  'Eight — minimal rounded form',
  'Seven — classic lucky seven form',
]

// ─── Bonus scene modifier ─────────────────────────────────────────────────────

const BONUS_MODIFIER =
  'bonus feature variation, heightened atmosphere, golden warm light, ' +
  'celebratory mood, richer saturation shift, free spins visual tone'

// ─── Build project identity anchor ───────────────────────────────────────────
// This block goes FIRST — it anchors the entire visual language of the prompt.
// Style is the dominant signal; theme and game name reinforce the world.

function buildIdentityAnchor(theme: string, meta?: ProjectMeta, styleId?: string): string {
  const style    = styleId ? getStyleById(styleId) : undefined
  const gameName = meta?.gameName || ''
  const artStyle = meta?.artStyle || ''

  const parts: string[] = []

  // 1. Graphic style is the dominant visual language — goes absolutely first
  if (style) {
    parts.push(style.promptModifier)
  } else if (artStyle) {
    parts.push(`${artStyle} art style`)
  }

  // 2. Game + theme world context
  const worldParts: string[] = []
  if (gameName) worldParts.push(`"${gameName}"`)
  if (theme)    worldParts.push(`${theme} theme`)
  if (worldParts.length) parts.push(`slot game ${worldParts.join(', ')}`)

  return parts.join(', ')
}

// ─── Build per-asset meta context ────────────────────────────────────────────
// Injected AFTER the template — adds world/mood/colour specifics for this asset.

function buildAssetContext(type: AssetType, category: PromptCategory, meta?: ProjectMeta): string {
  if (!meta) return ''

  const parts: string[] = []

  // Mood / Tone — all assets
  if (meta.mood) parts.push(`${meta.mood.toLowerCase()} atmosphere`)

  // Colour palette — all assets (drives material and lighting)
  const colours = [
    meta.colorPrimary && `primary ${meta.colorPrimary}`,
    meta.colorBg      && `background ${meta.colorBg}`,
    meta.colorAccent  && `accent ${meta.colorAccent}`,
  ].filter(Boolean).join(', ')
  if (colours) parts.push(`colour palette: ${colours}`)

  // World-building — backgrounds especially
  if (category === 'background') {
    if (meta.setting) parts.push(`world: ${meta.setting}`)
    if (meta.story)   parts.push(`narrative context: ${meta.story}`)
  }

  // Bonus narrative — bonus background only
  if (type === 'background_bonus' && meta.bonusNarrative) {
    parts.push(`bonus scenario: ${meta.bonusNarrative}`)
  }

  // Art direction notes — explicit constraints from the art team
  if (meta.artNotes) parts.push(`art direction: ${meta.artNotes}`)

  // Visual reference — concrete inspiration
  if (meta.artRef) parts.push(`visual reference: ${meta.artRef}`)

  return parts.filter(Boolean).join(', ')
}

// ─── Resolve symbol name for a given type ────────────────────────────────────

function resolveSymbolName(type: AssetType, meta?: ProjectMeta): string {
  if (!meta) return ''

  const highIdx    = HIGH_TYPE_KEYS.indexOf(type as typeof HIGH_TYPE_KEYS[number])
  const lowIdx     = LOW_TYPE_KEYS.indexOf(type as typeof LOW_TYPE_KEYS[number])
  const specialIdx = SPECIAL_TYPE_KEYS.indexOf(type as typeof SPECIAL_TYPE_KEYS[number])

  if (highIdx >= 0) {
    const name = (meta.symbolHighNames as string[] | undefined)?.[highIdx]
    return name ? name.trim() : ''
  }
  if (lowIdx >= 0) {
    const name = (meta.symbolLowNames as string[] | undefined)?.[lowIdx]
    return name ? name.trim() : ''
  }
  if (specialIdx >= 2) {
    // index 2+ are special_3..6
    const name = (meta.symbolSpecialNames as string[] | undefined)?.[specialIdx - 2 + 2]
    return name ? name.trim() : ''
  }
  return ''
}

const HIGH_TYPE_KEYS = [
  'symbol_high_1','symbol_high_2','symbol_high_3','symbol_high_4',
  'symbol_high_5','symbol_high_6','symbol_high_7','symbol_high_8',
] as const
const LOW_TYPE_KEYS = [
  'symbol_low_1','symbol_low_2','symbol_low_3','symbol_low_4',
  'symbol_low_5','symbol_low_6','symbol_low_7','symbol_low_8',
] as const
const SPECIAL_TYPE_KEYS = [
  'symbol_wild','symbol_scatter',
  'symbol_special_3','symbol_special_4','symbol_special_5','symbol_special_6',
] as const

// ─── Main build function ──────────────────────────────────────────────────────
//
// V3 prompt structure:
//   [1] IDENTITY ANCHOR  — style + game + theme (most important — goes first)
//   [2] ASSET TEMPLATE   — category-specific base description
//   [3] ASSET CONTEXT    — per-asset world/mood/colour from project meta
//   [4] DIFFERENTIATOR   — tier/suit/variant that separates this asset from siblings
//   [5] QUALITY BLOCKS   — readability + consistency (applied universally)
//   [6] CORE QUALITY     — production quality signal

export function buildPrompt(
  type:      AssetType,
  userTheme: string,
  styleId?:  string,
  meta?:     ProjectMeta,
): BuiltPrompt {
  const category = TYPE_TO_CATEGORY[type]
  const theme    = userTheme.trim().toLowerCase() || 'slot game'

  // ── [1] Identity anchor ────────────────────────────────────────────────────
  const identityAnchor = buildIdentityAnchor(theme, meta, styleId)

  // ── [2] Asset template ─────────────────────────────────────────────────────
  let assetBlock = TEMPLATES[category]()

  // ── [3] Asset context (world/mood/colour/art direction) ────────────────────
  const assetContext = buildAssetContext(type, category, meta)

  // ── [4] Differentiator ─────────────────────────────────────────────────────
  const differentiators: string[] = []

  if (type === 'background_bonus') {
    differentiators.push(BONUS_MODIFIER)
  }

  const highIdx = HIGH_TYPE_KEYS.indexOf(type as typeof HIGH_TYPE_KEYS[number])
  if (highIdx >= 0) {
    differentiators.push(HIGH_SYM_TIER[highIdx] ?? HIGH_SYM_TIER[4])
    const symName = resolveSymbolName(type, meta)
    if (symName) differentiators.push(`depicted as: ${symName}`)
  }

  const lowIdx = LOW_TYPE_KEYS.indexOf(type as typeof LOW_TYPE_KEYS[number])
  if (lowIdx >= 0) {
    differentiators.push(LOW_SYM_SUIT[lowIdx] ?? LOW_SYM_SUIT[4])
    const symName = resolveSymbolName(type, meta)
    if (symName) differentiators.push(`depicted as: ${symName}`)
  }

  const specialIdx = SPECIAL_TYPE_KEYS.indexOf(type as typeof SPECIAL_TYPE_KEYS[number])
  if (specialIdx >= 2) {
    const symName = resolveSymbolName(type, meta)
    if (symName) differentiators.push(`bonus symbol depicted as: ${symName}`)
  }

  // ── Assemble prompt ────────────────────────────────────────────────────────
  const segments = [
    identityAnchor,
    assetBlock,
    assetContext,
    ...differentiators,
    READABILITY,
    CONSISTENCY,
    CORE_QUALITY,
  ].filter(Boolean)

  const prompt = segments.join(', ')

  // ── Assemble negative prompt ───────────────────────────────────────────────
  const style = styleId ? getStyleById(styleId) : undefined
  const isEnvironment = category === 'background'
  const negParts = [
    NEG_UNIVERSAL,
    isEnvironment ? NEG_ENVIRONMENT : NEG_ISOLATED,
    !isEnvironment ? NEG_SYMBOLS : '',
    style?.negativeModifier ?? '',
  ].filter(Boolean)
  const negativePrompt = negParts.join(', ')

  return { category, assetType: type, prompt, negativePrompt }
}

// ─── Build all prompts for a theme at once ───────────────────────────────────

export function buildAllPrompts(
  theme: string,
  meta?: ProjectMeta,
): Record<AssetType, BuiltPrompt> {
  const types: AssetType[] = [
    'background_base', 'background_bonus',
    'symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4', 'symbol_high_5',
    'symbol_low_1',  'symbol_low_2',  'symbol_low_3',  'symbol_low_4',  'symbol_low_5',
    'symbol_wild', 'symbol_scatter', 'logo',
  ]

  return Object.fromEntries(
    types.map(t => [t, buildPrompt(t, theme, undefined, meta)])
  ) as Record<AssetType, BuiltPrompt>
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE SLOT PROMPTS (v1 registry — bonuspick.*, freespins.*, holdnspin.*,
// buy.*, expandwild.*)
//
// These prompts power the Generate (✨) button on feature slots in the Assets
// panel and Assets workspace. Each slot has its own template describing what
// kind of asset it is; the identity anchor + style + project meta are layered
// on top so theme consistency carries across feature art.
//
// The FEATURE_SLOT_SPECS map is the single source of truth — adding a new
// slot means adding one entry here, no other file touches.
// ═════════════════════════════════════════════════════════════════════════════

interface FeatureSlotSpec {
  /** Human-readable spec text injected as the [2] asset template. */
  template:   string
  /** If true, use ENVIRONMENT_BASE+NEG_ENVIRONMENT framing (backgrounds).
   *  Otherwise ISOLATED_BASE+NEG_ISOLATED (icons, buttons, banners). */
  isScene?:   boolean
  /** Reported in the BuiltPrompt as `category` — drives downstream logging. */
  category?:  PromptCategory
}

const FEATURE_SLOT_SPECS: Record<string, FeatureSlotSpec> = {
  // ── Free Spins ────────────────────────────────────────────────────────────
  'freespins.intro_banner': {
    template: 'celebratory "FREE SPINS" wide banner title graphic, bold stylised lettering, radiant light rays, premium slot announcement, horizontal banner format with empty centre panel for later text composition',
    category: 'logo',
  },
  'freespins.bg': {
    template: 'bonus feature variation background scene, wide panoramic vista, dramatic atmospheric lighting, ' + BONUS_MODIFIER + ', premium AAA free spins background art',
    isScene:  true,
    category: 'background',
  },
  'freespins.spin_counter_frame': {
    template: 'small ornate HUD frame for a numeric counter like "5/10", compact badge form, premium slot UI, empty dark centre readable area for runtime text, glowing ornate border',
    category: 'reel_frame',
  },
  'freespins.multiplier_badge': {
    template: 'circular multiplier badge icon, glowing gemstone texture with empty centre for runtime "x2" text, premium casino UI, small compact readable at thumbnail size',
    category: 'symbol_scatter',
  },
  'freespins.retrigger_celebration': {
    template: 'energetic "RETRIGGER!" celebratory overlay graphic, bursting light rays and sparkles, bold excited typography treatment with empty text panel, premium slot bonus flourish',
    category: 'logo',
  },
  'freespins.outro_banner': {
    template: 'celebratory "TOTAL WIN" banner title graphic, bold golden lettering, radiating light, premium slot completion announcement, horizontal banner with empty text area beneath',
    category: 'logo',
  },

  // ── Bonus Pick ────────────────────────────────────────────────────────────
  'bonuspick.bg': {
    template: 'bonus feature variation background scene, mysterious atmospheric pick game setting, dramatic lighting, rich parallax depth, ' + BONUS_MODIFIER + ', premium AAA pick-game background art',
    isScene:  true,
    category: 'background',
  },
  'bonuspick.header': {
    template: 'ornate "CHOOSE YOUR PRIZE" title banner graphic, premium gold lettering treatment, wide horizontal format, flanked by ornamental flourishes, empty composition-ready layout',
    category: 'logo',
  },
  'bonuspick.tile_closed': {
    template: 'closed mysterious bonus pick tile button, square format, ornate gem-studded border, rich material surface with subtle question-mark texture at centre, premium casino button art, readable at small grid size',
    category: 'reel_frame',
  },
  'bonuspick.tile_revealed': {
    template: 'revealed bonus pick tile, opened state, brighter lighter material surface, ornate gem-studded border same family as closed tile, empty flat centre ready for prize icon overlay, square format',
    category: 'reel_frame',
  },
  'bonuspick.prize_coin': {
    template: 'shiny gold coin icon, premium slot prize symbol, isolated centered, rich metallic material, subtle rim lighting',
    category: 'symbol_high',
  },
  'bonuspick.prize_multiplier': {
    template: 'multiplier prize icon, bold gemstone with empty centre for runtime number like "x3", premium slot prize symbol, isolated centered',
    category: 'symbol_scatter',
  },
  'bonuspick.prize_freespin': {
    template: 'free spin prize icon, stylised spinning reel or starburst motif, premium slot prize symbol, isolated centered',
    category: 'symbol_scatter',
  },
  'bonuspick.prize_jackpot': {
    template: 'jackpot prize icon, ornate trophy or crown with radiating light, premium slot prize symbol, highest-value treatment, isolated centered',
    category: 'symbol_scatter',
  },
  'bonuspick.prize_pooper': {
    template: 'round-ending warning prize icon, ominous skull or bomb iconography, clear negative signal, premium slot prize symbol, isolated centered',
    category: 'symbol_scatter',
  },
  'bonuspick.footer': {
    template: 'subtle slim UI footer banner, premium casino game HUD element, space for short runtime text like "Pick 3 of 12", ornate edges with muted central panel',
    category: 'reel_frame',
  },

  // ── Hold & Spin (Lock & Win) ──────────────────────────────────────────────
  'holdnspin.intro_banner': {
    template: 'celebratory "LOCK AND WIN" wide banner title graphic, bold coin-themed lettering, gold and silver accents, premium slot announcement, horizontal banner format',
    category: 'logo',
  },
  'holdnspin.bg': {
    template: 'bonus feature variation background scene, treasure-vault atmosphere, coin-laden opulence, dramatic warm lighting, ' + BONUS_MODIFIER + ', premium AAA lock-and-win background art',
    isScene:  true,
    category: 'background',
  },
  'holdnspin.coin_symbol_locked': {
    template: 'locked collectible coin symbol, bright gold with runtime-empty centre for value text, secured-in-place material treatment, premium slot symbol, isolated centered square format',
    category: 'symbol_high',
  },
  'holdnspin.coin_symbol_glowing': {
    template: 'just-landed glowing coin symbol, radiant golden burst, celebratory lighting, same family as locked coin but dramatic high-energy variant, isolated centered square format',
    category: 'symbol_high',
  },
  'holdnspin.respin_counter_frame': {
    template: 'ornate respin counter HUD frame, compact badge with empty dark centre for runtime counter like "3 spins", premium slot UI, glowing ornate border',
    category: 'reel_frame',
  },
  'holdnspin.jackpot_grand': {
    template: 'tier-1 GRAND jackpot tier badge, largest most ornate treatment, platinum or diamond material, radiating light, premium casino jackpot tier, wide horizontal badge format',
    category: 'jackpot_label',
  },
  'holdnspin.jackpot_major': {
    template: 'tier-2 MAJOR jackpot tier badge, rich gold material, ornate second-tier treatment, premium casino jackpot tier, wide horizontal badge format',
    category: 'jackpot_label',
  },
  'holdnspin.jackpot_minor': {
    template: 'tier-3 MINOR jackpot tier badge, bronze or rose-gold material, simpler third-tier treatment, premium casino jackpot tier, wide horizontal badge format',
    category: 'jackpot_label',
  },
  'holdnspin.jackpot_mini': {
    template: 'tier-4 MINI jackpot tier badge, silver or copper material, simplest entry-tier treatment, premium casino jackpot tier, wide horizontal badge format',
    category: 'jackpot_label',
  },
  'holdnspin.outro_banner': {
    template: 'celebratory "TOTAL WIN" banner title graphic, coin-themed opulent treatment, bold golden lettering, premium slot completion announcement, horizontal banner format',
    category: 'logo',
  },

  // ── Buy Feature ───────────────────────────────────────────────────────────
  'buy.button': {
    template: 'premium "BUY BONUS" slot UI call-to-action button, pill or rounded-rectangle form, vibrant eye-catching gradient treatment, ornate trim, readable at HUD size, horizontal banner format',
    category: 'reel_frame',
  },
  'buy.button_hover': {
    template: 'hover-state variant of a premium "BUY BONUS" slot UI button, brighter more saturated rim lighting, same family as the idle button but highlighted, horizontal banner format',
    category: 'reel_frame',
  },
  'buy.confirm_panel_bg': {
    template: 'dark premium modal panel background, ornate casino frame with rich central panel for runtime copy, gold trim, centered composition, wide 3:2 format',
    category: 'reel_frame',
  },
  'buy.confirm_icon': {
    template: 'purchase confirmation icon, premium treasure chest or coin-stack iconography, isolated centered, rich metallic material, slot UI ready',
    category: 'symbol_high',
  },

  // ── Expanding Wild ────────────────────────────────────────────────────────
  'expandwild.symbol': {
    template: 'slot wild symbol, bold "WILD" lettering on ornate gemstone badge, premium casino symbol at reel-cell scale, same style family as other reel symbols, isolated centered square format',
    category: 'symbol_wild',
  },
  'expandwild.expanded_overlay': {
    template: 'tall vertical expanded wild reel overlay, column-filling banner of ornate wild-symbol artwork, repeating motif or stretched ornamentation, premium slot reel treatment, vertical 1:4 format with empty central text readability',
    category: 'symbol_wild',
  },
  'expandwild.multiplier_badge': {
    template: 'circular multiplier badge icon for a wild, glowing gemstone with empty centre for runtime "x3" text, premium casino UI, small compact readable at thumbnail size',
    category: 'symbol_scatter',
  },
}

/** True if the given asset_type string is a registry feature slot key. */
export function isFeatureSlotKey(key: string): boolean {
  return key in FEATURE_SLOT_SPECS
}

/** Build a prompt for a feature slot (e.g. 'bonuspick.header'). Shares the
 *  identity anchor / style / meta context with the legacy buildPrompt so
 *  feature art stays consistent with base-game art. */
export function buildFeatureSlotPrompt(
  slotKey:   string,
  userTheme: string,
  styleId?:  string,
  meta?:     ProjectMeta,
): BuiltPrompt {
  const spec = FEATURE_SLOT_SPECS[slotKey]
  if (!spec) throw new Error(`Unknown feature slot: ${slotKey}`)
  const theme    = userTheme.trim().toLowerCase() || 'slot game'

  const identityAnchor = buildIdentityAnchor(theme, meta, styleId)

  // Isolated vs scene — drives both framing and negative prompt
  const framing = spec.isScene ? ENVIRONMENT_BASE : ISOLATED_BASE
  const negExtra = spec.isScene ? NEG_ENVIRONMENT : (NEG_ISOLATED + ', ' + NEG_SYMBOLS)

  // Mood / colour / world context — reuse the same helper as legacy assets.
  // Category is passed so world-building context is included for backgrounds.
  const category    = spec.category ?? 'reel_frame'
  const assetContext = buildAssetContext(slotKey as AssetType, category, meta)

  const segments = [
    identityAnchor,
    framing,
    spec.template,
    assetContext,
    READABILITY,
    CONSISTENCY,
    CORE_QUALITY,
  ].filter(Boolean)

  const prompt = segments.join(', ')
  const style  = styleId ? getStyleById(styleId) : undefined
  const negParts = [
    NEG_UNIVERSAL,
    negExtra,
    style?.negativeModifier ?? '',
  ].filter(Boolean)
  const negativePrompt = negParts.join(', ')

  return { category, assetType: slotKey as AssetType, prompt, negativePrompt }
}
