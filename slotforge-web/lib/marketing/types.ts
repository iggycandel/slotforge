// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 1
// Type definitions for the JSON template format consumed by the composition
// engine (lib/marketing/compose.ts, Day 2) and the registry loader
// (lib/marketing/registry.ts).
//
// One template = one piece of marketing creative (a square lobby tile, a
// portrait IG post, a press one-pager). Templates are JSON files under
// lib/marketing/templates/, version-controlled, and validated at load
// time. The engine renders by walking `layers` bottom-up and drawing each
// to a server-side @napi-rs/canvas, with per-layer dispatch by `type`.
//
// Every shipped output (PNG, JPG, PDF) is one entry in `sizes`. The
// engine renders the same layer stack for each entry — only the canvas
// dimensions and output format vary. This keeps the JSON minimal: a
// template that ships at 256², 512², 1024² has three `sizes` entries
// and one `layers` array, not three duplicated layer stacks.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Root template ──────────────────────────────────────────────────────────

export interface MarketingTemplate {
  /** Unique ID, dot-namespaced by category. e.g. 'promo.square_lobby_tile' */
  id:        string
  /** Display name in the grid card */
  name:      string
  /** Drives the section the card appears in */
  category:  TemplateCategory
  /** Schema version. Bump whenever `layers` changes; cache.ts mixes this
   *  into vars_hash so old renders are correctly invalidated when a
   *  template's layout changes. */
  version:   number
  /** All sizes this template ships at. Each entry produces one rendered
   *  file in the export zip. */
  sizes:     TemplateSize[]
  /** Layer stack, rendered bottom-up. */
  layers:    Layer[]
  /** Schema for customisation fields exposed in the Customise modal. */
  vars:      TemplateVarsSchema
  /** Hardcoded preview image path used in the grid card BEFORE the user
   *  has rendered any size for this template. Once they've rendered, the
   *  card swaps to the largest cached render. */
  previewPath: string
}

export type TemplateCategory = 'promo' | 'social' | 'store' | 'press'

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  'promo', 'social', 'store', 'press',
] as const

export interface TemplateSize {
  w:      number
  h:      number
  /** Used as the Storage filename suffix and as the size-checkbox label
   *  in the Customise modal — keep human-readable: '1024x1024'. */
  label:  string
  format: 'png' | 'jpg' | 'webp' | 'pdf'
}

// ─── Layers ─────────────────────────────────────────────────────────────────
//
// Discriminated union by `type`. The compose engine has one function per
// variant. Adding a new layer kind = add to this union + add a renderer.

export type Layer =
  | AssetLayer
  | GradientLayer
  | ShapeLayer
  | TextLayer
  | CtaLayer
  | OverlayLayer

/** Draws a project asset (background, logo, character) onto the canvas. */
export interface AssetLayer {
  type:    'asset'
  /** Which project asset to pull. `character.transparent` is the
   *  bg-removed cutout produced once per project by the Replicate flow
   *  (Day 7); the engine falls back to `character` if the cutout is
   *  unavailable so the workspace still works without Replicate. */
  slot:    AssetSlot
  /** How to fit the asset's natural aspect into the available box. */
  fit:     'cover' | 'contain' | 'fill'
  anchor:  Anchor
  /** Scale relative to canvas (0..1). 0.85 = 85% of the smaller canvas
   *  dimension. Optional — defaults to 1.0 (fills box). */
  scale?:  number
  /** Padding inside the canvas, in canvas-relative px. A scalar is
   *  uniform; a tuple is [top, right, bottom, left]. */
  padding?: number | [top: number, right: number, bottom: number, left: number]
  /** Per-layoutVariant overrides. The engine merges
   *  `variants?[vars.layoutVariant]` into the layer config before
   *  rendering, so a template can ship A/B/C arrangements without
   *  duplicating the whole layer stack. */
  variants?: Partial<Record<LayoutVariant, Partial<Omit<AssetLayer, 'type' | 'slot'>>>>
}

export type AssetSlot =
  | 'background_base'
  | 'logo'
  | 'character'
  | 'character.transparent'

export interface GradientLayer {
  type:      'gradient'
  from:      ColorRef
  to:        ColorRef
  direction: 'top' | 'bottom' | 'left' | 'right' | 'radial'
  /** Where in the layer the gradient begins (0..1). 0 = full-canvas
   *  fade; 0.5 = top half is the `from` colour, bottom half is the
   *  gradient. */
  start?:    number
}

export interface ShapeLayer {
  type:    'shape'
  shape:   'rect' | 'pill' | 'circle' | 'rounded_rect'
  fill:    ColorRef
  stroke?: { color: ColorRef; width: number }
  anchor:  Anchor
  /** Number = px; string ending in '%' = percentage of the relevant
   *  canvas dimension (w for width, h for height). */
  size:    { w: number | string; h: number | string }
  borderRadius?: number
}

export interface TextLayer {
  type:   'text'
  /** Either a literal or a template expression like `${gameName}`.
   *  Resolved against ResolvedVars at render time. */
  value:  string
  font:   { family: string; weight: number; size: number; tracking?: number }
  color:  ColorRef
  stroke?: { color: ColorRef; width: number }
  anchor: Anchor
  align:  'left' | 'center' | 'right'
  /** Width inside which the text wraps. Number = px; string = percentage
   *  of canvas width. */
  maxWidth?: number | string
}

export interface CtaLayer {
  type:     'cta'
  /** Which var resolves to the button text. Always `ctaText` today —
   *  named so the template author can see what's wired without
   *  consulting the vars schema. */
  valueVar: 'ctaText'
  style:    'pill' | 'flat' | 'outlined'
  font:     { family: string; weight: number; size: number }
  bg:       ColorRef
  fg:       ColorRef
  anchor:   Anchor
  /** [vertical, horizontal] padding inside the button, in px. */
  padding:  [v: number, h: number]
}

/** Decorative PNG overlay (sparkles, bokeh, grain). Path is relative to
 *  `public/marketing/overlays/`. */
export interface OverlayLayer {
  type:       'overlay'
  src:        string
  opacity:    number
  blendMode?: 'multiply' | 'screen' | 'overlay' | 'soft-light'
}

// ─── Anchors + colours ──────────────────────────────────────────────────────

export type Anchor =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** Either a literal CSS-ish colour string (`#fff`, `rgba(0,0,0,0.6)`,
 *  `transparent`) or a reference to a project palette colour resolved
 *  from ResolvedVars.resolvedColors at render time. */
export type ColorRef =
  | string
  | { var: 'colorPrimary' | 'colorAccent' | 'colorBg' }

// ─── Vars schema ────────────────────────────────────────────────────────────

export type LayoutVariant = 'A' | 'B' | 'C'

/** Curated CTA strings — all eight languages share these keys, with
 *  per-language literals in lib/marketing/i18n.ts. The 'none' option
 *  hides the CTA layer entirely. */
export const CTA_KEYS = [
  'PLAY NOW',
  'SPIN NOW',
  'TRY IT',
  'NEW SLOT',
  'LAUNCHING SOON',
  'none',
] as const
export type CtaKey = (typeof CTA_KEYS)[number]

export const LANGUAGES = ['EN','ES','PT','DE','FR','IT','SV','JA'] as const
export type Language = (typeof LANGUAGES)[number]

export const COLOR_MODES = ['auto','light','dark'] as const
export type ColorMode = (typeof COLOR_MODES)[number]

/** Schema declaring which vars a template exposes in the Customise modal.
 *  `source: 'project.gameName'` reads the value off ProjectMeta and lets
 *  the user override; `default: ...` provides a literal fallback. */
export interface TemplateVarsSchema {
  gameName:      { source: 'project.gameName'; override?: boolean }
  headline?:     { default: string | null;     override?: boolean }
  subhead?:      { default: string | null;     override?: boolean }
  ctaText:       { default: CtaKey;            options: readonly CtaKey[] }
  language:      { default: Language;          options: readonly Language[] }
  colorMode:     { default: ColorMode;         options: readonly ColorMode[] }
  layoutVariant: { default: LayoutVariant;     options: readonly LayoutVariant[] }
}

/** What the engine actually receives at render time — every var resolved
 *  to a literal, with palette colours pre-computed against ProjectMeta
 *  and `colorMode`. */
export interface ResolvedVars {
  gameName: string
  headline: string | null
  subhead:  string | null
  /** Localised + resolved to the on-screen literal. CTA layers consume
   *  this directly — the template doesn't need to know the language. */
  ctaText:  string
  language: Language
  colorMode: ColorMode
  layoutVariant: LayoutVariant
  resolvedColors: { primary: string; accent: string; bg: string }
  /** When false, AssetLayers whose slot resolves to a character variant
   *  are skipped at render time. Lets a user opt out of overlapping
   *  hero shots when the layout doesn't suit their character art. The
   *  modal hides this control entirely when the project has no
   *  character asset; defaults to true otherwise. */
  includeCharacter: boolean
}

// ─── Asset resolution ───────────────────────────────────────────────────────

/** Buffer payload the engine receives for each asset slot. `null` when
 *  the asset isn't present yet (the readiness check happens earlier,
 *  before render is even attempted — see UX flow §10.1). */
export interface ResolvedAssets {
  background_base:         Buffer | null
  logo:                    Buffer | null
  character:               Buffer | null
  /** The bg-removed cutout. Falls back to `character` when null — the
   *  engine treats this as a soft requirement so the workspace still
   *  produces (slightly worse) output if Replicate ever returns nothing. */
  'character.transparent': Buffer | null
}

// ─── Persisted shapes (DB rows) ────────────────────────────────────────────

/** Mirror of public.marketing_kits — one row per (project, template). */
export interface MarketingKitRow {
  id:          string
  project_id:  string
  template_id: string
  /** Whatever the user picked in the Customise modal. Schema varies by
   *  template — see TemplateVarsSchema above. */
  vars:        Record<string, unknown>
  updated_at:  string
}

/** Mirror of public.marketing_renders — one row per cached render. */
export interface MarketingRenderRow {
  id:           string
  kit_id:       string
  size_label:   string
  format:       'png' | 'jpg' | 'webp' | 'pdf' | 'mp4' | 'webm'
  /** Storage path inside the marketing-renders bucket. Re-signed on
   *  demand by /api/marketing/render-url so we never persist an
   *  expiring URL. */
  storage_path: string
  vars_hash:    string
  bytes:        number
  created_at:   string
}
