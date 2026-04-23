// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Typography spec types
//
// Shared between /api/typography/generate (server) and TypographyWorkspace
// (client). The spec is modelled after the Type Forge tool output and is
// designed to be consumed directly by a Pixi/Phaser/CSS front-end runtime
// — see `docs/typography/spec.md` for the renderer contract (TBD).
// ─────────────────────────────────────────────────────────────────────────────

/** Locale codes we currently have sample strings for. Extend by adding
 *  entries to lib/typography/sampleStrings.ts + the LOCALE_LABELS map. */
export type TypographyLocale =
  | 'en' | 'es' | 'tr' | 'pt' | 'de' | 'fr' | 'it' | 'pl' | 'ru'

/** One half of a pairing — either the display (title) or UI (body) font.
 *  `family` must be a Google-Fonts-available family; the workspace loads
 *  it from fonts.googleapis.com at render time. */
export interface FontFace {
  family:  string
  weights: number[]
}

/** A named font pairing from the curated library (lib/typography/pairings.ts).
 *  Claude / GPT-4o picks one of these by `id` given the screenshot's
 *  aesthetic — it does NOT invent new pairings. Constraining the choice
 *  to a validated library avoids hallucinated font names that don't
 *  actually ship on Google Fonts. */
export interface FontPairing {
  id:          string
  name:        string
  /** Short human description ("Retro 80s, Miami Vice, neon signage, palm
   *  trees, chrome"). Fed into the prompt so the model has concrete
   *  matching signals per pairing. */
  description: string
  /** Keyword hints — also fed to the prompt so theme words in the notes
   *  ("volcano", "samurai") can bias the choice. */
  keywords:    string[]
  display:     FontFace   // big-display font (titles, numerics)
  ui:          FontFace   // body/ui font (subtitles, cta, captions)
}

/** Drop-shadow block. Colour + alpha + blur + vertical offset. Kept
 *  simple — horizontal offset defaults to 0 in the renderer and we've
 *  never needed it for slot popups. */
export interface DropShadow {
  color:    string   // hex
  alpha?:   number   // 0..1, default 0.85
  blur?:    number   // px, default 3
  offsetX?: number
  offsetY?: number   // default 2
}

/** Glow layer — stacked to build the "neon bloom" effect. Typically
 *  two layers: a tight hot glow + a soft wide halo. */
export interface Glow {
  color:    string
  blur:     number
  alpha?:   number
  offsetX?: number
  offsetY?: number
}

/** Per-locale overrides for when a long translation (German, Russian)
 *  needs to shrink or a script (Turkish) needs different tracking. */
export interface LocaleOverride {
  size?:          number
  letterSpacing?: number
}

/** Animation descriptor. Only one type for now but room to grow. */
export interface TextAnimation {
  type:        'pulseAlpha'
  from:        number
  to:          number
  durationMs:  number
}

/** One popup text style — used for title, subtitle, cta, body, numeric,
 *  smallLabel. The shape matches the Type Forge JSON exactly so the
 *  exported standalone HTML and any downstream renderer can consume
 *  the same payload unchanged. */
export interface PopupStyle {
  size:           number
  letterSpacing?: number   // em
  lineHeight?:    number
  case?:          'upper' | 'lower' | 'sentence' | 'asis'

  /** Pick ONE of fillColor / fillGradient. Renderer checks gradient
   *  first. */
  fillColor?:     string
  fillGradient?:  string[]   // 2–4 hex stops, top→bottom

  strokeColor?:   string
  strokeWidth?:   number

  dropShadow?:    DropShadow
  glow?:          Glow[]

  animation?:     TextAnimation
  localeOverrides?: Partial<Record<TypographyLocale, LocaleOverride>>
}

/** The six canonical popup styles. Keep the list stable — the standalone
 *  HTML export iterates this order and renderers may index by string key. */
export const POPUP_STYLE_KEYS = [
  'popup.title',
  'popup.subtitle',
  'popup.cta',
  'popup.body',
  'popup.numeric',
  'popup.smallLabel',
] as const
export type PopupStyleKey = typeof POPUP_STYLE_KEYS[number]

/** Full typography spec returned by the API. What goes into the
 *  .json download, the standalone .html export, AND (eventually)
 *  project.payload.typographySpec for persistence. */
export interface TypographySpec {
  /** Pairing id — validated against the library before we return. */
  pairingId:        string
  /** 2–3 sentence rationale from the model explaining why this pairing. */
  rationale:        string
  /** Game title pulled from the screenshot / name field — free text. */
  gameTitle:        string
  /** Base resolution the sizes are tuned for. Defaults to 1920×1080. */
  baseResolution:   { w: number; h: number }
  /** Locales the spec was generated for — same order as the request. */
  supportedLocales: TypographyLocale[]
  /** The six styles. Keys are `PopupStyleKey`s. Model is instructed to
   *  emit all six — the route validates and fills sensible defaults
   *  for any missing. */
  styles:           Record<PopupStyleKey, PopupStyle>
}

/** Full export bundle — what the Download JSON button emits. Wraps the
 *  raw TypographySpec with meta + a resolved fonts block so front-end
 *  devs don't need the pairings library to self-host the fonts.
 *
 *  Bundles ship BOTH a web-first variant (CSS drop-shadow + em letter-
 *  spacing + glow layers) and a Pixi v8 variant (polar-coord dropShadow
 *  + pixel letter-spacing + GlowFilter-shaped filters array) so a
 *  consumer picks whichever matches their runtime without a second
 *  generation.  The Pixi side is filled in by lib/typography/toPixi.ts
 *  — we leave it as unknown here to avoid a circular import with the
 *  Pixi types module. */
export interface TypographyBundle {
  meta: {
    generatedAt:      string   // ISO 8601
    gameTitle:        string
    rationale:        string
    supportedLocales: TypographyLocale[]
  }
  fonts: {
    display: FontFace & { id: 'display'; fallback: string[]; source: 'google'; license: 'OFL-1.1' }
    ui:      FontFace & { id: 'ui';      fallback: string[]; source: 'google'; license: 'OFL-1.1' }
  }
  popupTextStyles: {
    scope:            'popups'
    baseResolution:   TypographySpec['baseResolution']
    supportedLocales: TypographyLocale[]
    styles:           Record<PopupStyleKey, PopupStyle>
  }
  /** Optional Pixi v8 variant. Always present on fresh downloads from
   *  the workspace; older bundles (generated before Pixi support landed)
   *  may omit it. Typed loose to decouple from lib/typography/toPixi.ts. */
  pixi?: unknown
}
