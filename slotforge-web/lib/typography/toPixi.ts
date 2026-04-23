// ─────────────────────────────────────────────────────────────────────────────
// Spinative — PixiJS v8 TextStyle transformer
//
// Turns the web-first TypographySpec (CSS drop-shadow + glow layers + em
// letter-spacing + gradient-stops array) into a payload a PixiJS v8 app
// can consume almost directly.
//
// Shape we emit per style:
//
//   {
//     textStyle: {            // fed straight into new PIXI.TextStyle(...)
//       fontFamily: 'Orbitron',
//       fontSize:   72,
//       fontWeight: '500',
//       letterSpacing: 2.16,  // PX in Pixi, not em
//       lineHeight: 72,
//       fill:       ['#ffd700','#ffa500','#cc8800'],   // array → gradient
//       fillGradientStops: [0, 0.5, 1],                // per-stop 0..1
//       stroke:     { color: '#000000', width: 3 },
//       dropShadow: {
//         color: '#000000', alpha: 0.85,
//         angle: 1.5708,   // radians — derived from web offsetX/offsetY
//         blur: 4, distance: 3,
//       },
//     },
//     filters: [              // Pixi TextStyle has ONE dropShadow, so
//       { type: 'GlowFilter', color: '#ff00aa',        // additional glow
//         alpha: 1, outerStrength: 2, distance: 8 },   // layers land in
//       { type: 'GlowFilter', color: '#ff00aa',        // text.filters as
//         alpha: 0.75, outerStrength: 2.75, distance: 22 }, // GlowFilter
//     ],                                               // from @pixi/filter-glow
//     animation: { type: 'pulseAlpha', ... },          // passthrough
//     localeOverrides: { tr: { size: 30, letterSpacing: 1.2 }, … },
//   }
//
// Why not output `dropShadow: true` + sibling `dropShadowBlur:` /
// `dropShadowAngle:` fields? That's PixiJS v7 and earlier — v8 collapsed
// them into a single `dropShadow` object (matching Filters/GlowFilter's
// constructor shape). We target v8 because that's what Spinative is
// standardising on.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  FontPairing, PopupStyle, PopupStyleKey,
  TypographyLocale, TypographySpec,
} from '@/types/typography'
import { POPUP_STYLE_KEYS } from '@/types/typography'

// ─── Pixi-shaped output types ────────────────────────────────────────────────

export interface PixiDropShadow {
  color:    string
  alpha?:   number
  angle?:   number     // radians
  blur?:    number
  distance?: number
}

export interface PixiStroke {
  color: string
  width: number
}

export interface PixiTextStyle {
  fontFamily:        string
  fontSize:          number
  fontWeight:        string    // Pixi expects a string in v8 ('400','bold' etc.)
  letterSpacing?:    number    // PIXELS in Pixi, not em
  lineHeight?:       number    // pixels
  fill?:             string | string[]
  fillGradientStops?: number[]
  stroke?:           PixiStroke
  dropShadow?:       PixiDropShadow
}

export interface PixiGlowFilter {
  type:          'GlowFilter'    // `@pixi/filter-glow` constructor tag
  color:         string
  alpha?:        number
  /** Outer glow strength — bigger = more halo. We derive this from the
   *  web-format `blur` since front-ends dial it to taste anyway. */
  outerStrength: number
  distance:      number
}

export interface PixiAnimation {
  type:       'pulseAlpha'
  from:       number
  to:         number
  durationMs: number
}

export interface PixiPopupStyle {
  textStyle:        PixiTextStyle
  filters:          PixiGlowFilter[]
  animation?:       PixiAnimation
  localeOverrides?: Partial<Record<TypographyLocale, {
    fontSize?:      number
    letterSpacing?: number    // pixels, pre-converted from em
  }>>
}

/** The Pixi-format bundle — mirrors TypographyBundle but with Pixi-ready
 *  values. Both web + pixi variants ship in every download so the FE
 *  team can pick whichever matches their runtime without regenerating. */
export interface PixiTypographyBundle {
  renderer: 'pixijs'
  pixiVersion: '>=8.0.0'
  fonts: {
    display: { id: 'display'; family: string; weights: number[] }
    ui:      { id: 'ui';      family: string; weights: number[] }
  }
  baseResolution: { w: number; h: number }
  supportedLocales: TypographyLocale[]
  styles: Record<PopupStyleKey, PixiPopupStyle>
}

// ─── Transform helpers ──────────────────────────────────────────────────────

/** Which font-face (display or ui) each popup style should use. Keeps
 *  the mapping in sync with TypographyWorkspace's preview. */
const FONT_BY_KEY: Record<PopupStyleKey, 'display' | 'ui'> = {
  'popup.title':      'display',
  'popup.subtitle':   'ui',
  'popup.cta':        'ui',
  'popup.body':       'ui',
  'popup.numeric':    'display',
  'popup.smallLabel': 'ui',
}

/** Pick a sensible font weight. Display fonts use their first declared
 *  weight (Audiowide has only 400; Orbitron has 500/700/900 — pick
 *  500). UI fonts prefer 600 when available, fallback to the first. */
function pickWeight(fontWeights: number[], role: 'display' | 'ui'): number {
  if (role === 'display') return fontWeights[0] ?? 400
  return fontWeights.includes(600) ? 600 : (fontWeights[0] ?? 400)
}

/** em → pixels. Pixi letterSpacing is absolute pixels, web CSS uses
 *  em-units (relative to font-size). */
function emToPx(em: number | undefined, fontSize: number): number {
  return Math.round((em ?? 0) * fontSize * 100) / 100
}

/** CSS drop-shadow offsetX/offsetY → Pixi (angle, distance). Pixi uses
 *  polar coords; distance is the hypotenuse, angle is radians clockwise
 *  from the positive x-axis (standard math convention for v8). */
function offsetToPolar(ox: number, oy: number): { angle: number; distance: number } {
  const distance = Math.hypot(ox, oy)
  // atan2 treats +x as 0, +y (down in screen coords) as π/2 — exactly
  // what Pixi expects. Handle the no-offset case gracefully: angle
  // becomes 0 and distance stays 0, which Pixi renders as no shadow
  // offset (still blurred). Default to π/2 (straight down) so an
  // explicit dropShadow with no offsets still looks like a shadow.
  if (distance < 0.01) return { angle: Math.PI / 2, distance: 0 }
  return { angle: Math.atan2(oy, ox), distance }
}

// ─── Per-style transformer ───────────────────────────────────────────────────

export function popupStyleToPixi(
  key:   PopupStyleKey,
  style: PopupStyle,
  pairing: FontPairing,
): PixiPopupStyle {
  const role       = FONT_BY_KEY[key]
  const face       = pairing[role]
  const weight     = pickWeight(face.weights, role)
  const lineHeight = Math.round(style.size * (style.lineHeight ?? 1))

  const textStyle: PixiTextStyle = {
    fontFamily:    face.family,
    fontSize:      style.size,
    fontWeight:    String(weight),
    letterSpacing: emToPx(style.letterSpacing, style.size),
    lineHeight,
  }

  // ── Fill ──────────────────────────────────────────────────────────────
  // Gradient → array of color strings + explicit stops. Pixi v8's
  // `FillGradient` (or `TextStyle` with a color array) handles these
  // natively. We emit stops too so the FE can build
  // `new FillGradient(...).addColorStop(stops[i], colors[i])` directly.
  if (style.fillGradient?.length) {
    textStyle.fill = [...style.fillGradient]
    const n = style.fillGradient.length
    textStyle.fillGradientStops = style.fillGradient.map(
      (_, i) => n <= 1 ? 0 : Math.round(i / (n - 1) * 100) / 100
    )
  } else if (style.fillColor) {
    textStyle.fill = style.fillColor
  }

  // ── Stroke ────────────────────────────────────────────────────────────
  // Pixi v8 stroke is `{ color, width, alignment?, join?, miterLimit? }`.
  // We only set color + width; FE can tweak alignment/join if needed.
  if (style.strokeColor) {
    textStyle.stroke = {
      color: style.strokeColor,
      width: style.strokeWidth ?? 2,
    }
  }

  // ── Drop shadow (one layer only in the TextStyle) ─────────────────────
  if (style.dropShadow) {
    const ds = style.dropShadow
    const { angle, distance } = offsetToPolar(ds.offsetX ?? 0, ds.offsetY ?? 2)
    textStyle.dropShadow = {
      color:    ds.color ?? '#000000',
      alpha:    ds.alpha ?? 0.85,
      angle,
      blur:     ds.blur ?? 3,
      distance: distance || 3,
    }
  }

  // ── Glow filters (stacked on text.filters) ────────────────────────────
  // Pixi's TextStyle.dropShadow is a single layer, so multi-layer glows
  // from the web spec land as a GlowFilter array. Mapping:
  //   outerStrength ≈ blur / 8, clamped to a useful range. Front-ends
  //   typically dial this by eye anyway; the number is a starting point.
  const filters: PixiGlowFilter[] = (style.glow ?? []).map(g => ({
    type:          'GlowFilter',
    color:         g.color,
    alpha:         g.alpha ?? 1,
    outerStrength: Math.max(0.5, Math.min(6, (g.blur ?? 4) / 8)),
    distance:      g.blur ?? 4,
  }))

  // ── Locale overrides — convert em letterSpacing to pixels so the
  //    override values are drop-in replacements for text.style.* at
  //    runtime, no additional unit conversion needed. ─────────────────
  let localeOverrides: PixiPopupStyle['localeOverrides']
  if (style.localeOverrides) {
    localeOverrides = {}
    for (const [loc, ov] of Object.entries(style.localeOverrides) as [TypographyLocale, { size?: number; letterSpacing?: number }][]) {
      const entry: { fontSize?: number; letterSpacing?: number } = {}
      if (ov.size          != null) entry.fontSize      = ov.size
      // Override em uses the OVERRIDDEN size when present, falling back
      // to the base — otherwise a {size: 30, letterSpacing: 0.08} pair
      // would calculate pixels against the wrong font-size.
      if (ov.letterSpacing != null) entry.letterSpacing = emToPx(ov.letterSpacing, ov.size ?? style.size)
      if (Object.keys(entry).length) localeOverrides[loc] = entry
    }
    if (Object.keys(localeOverrides).length === 0) localeOverrides = undefined
  }

  return {
    textStyle,
    filters,
    animation: style.animation,
    localeOverrides,
  }
}

// ─── Full-spec transformer ───────────────────────────────────────────────────

export function specToPixiBundle(
  spec:    TypographySpec,
  pairing: FontPairing,
): PixiTypographyBundle {
  const styles = {} as Record<PopupStyleKey, PixiPopupStyle>
  for (const key of POPUP_STYLE_KEYS) {
    styles[key] = popupStyleToPixi(key, spec.styles[key], pairing)
  }
  return {
    renderer:        'pixijs',
    pixiVersion:     '>=8.0.0',
    fonts: {
      display: { id: 'display', family: pairing.display.family, weights: pairing.display.weights },
      ui:      { id: 'ui',      family: pairing.ui.family,      weights: pairing.ui.weights },
    },
    baseResolution:   spec.baseResolution,
    supportedLocales: spec.supportedLocales,
    styles,
  }
}
