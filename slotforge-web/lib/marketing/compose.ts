// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 2
// Composition engine. Walks a template's layer stack bottom-up and draws
// each layer onto a server-side @napi-rs/canvas, then encodes to the
// requested format.
//
// Why @napi-rs/canvas as the single rendering surface:
//   • Skia under the hood — text shaping, gradients, shadows, alpha
//     blending all match what a designer would expect from a browser.
//   • Single context means layers compose naturally (alpha + blend modes
//     just work) without juggling intermediate buffers.
//   • Native bindings, runs on Vercel's serverless Node runtime without
//     extra config.
//
// sharp is reserved for two narrow jobs:
//   1. Decoding raster inputs (`sharp(buf).raw().toBuffer()`-shaped flow)
//      where canvas's own loader is fussy about animated WebP / EXIF.
//   2. Final-format encoding for JPG / WebP — canvas natively encodes
//      PNG, but its JPG quality knob is coarse. sharp gives us per-format
//      quality control without changing the layer-rendering path.
//
// pdf-lib is invoked separately for press.one_pager_a4_pdf (Day 8/9) —
// not from this engine. PDFs need structured pages, not raster
// composition.
//
// All helpers below are PURE per-call: no module-level state. The
// canvas instance lives only inside renderTemplate().
// ─────────────────────────────────────────────────────────────────────────────

import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Canvas } from '@napi-rs/canvas'
import sharp from 'sharp'
import path  from 'path'
import fs    from 'fs/promises'

import type {
  MarketingTemplate,
  TemplateSize,
  Layer,
  AssetLayer,
  GradientLayer,
  ShapeLayer,
  TextLayer,
  CtaLayer,
  OverlayLayer,
  Anchor,
  ColorRef,
  ResolvedVars,
  ResolvedAssets,
  RenderedLayerBox,
} from './types'

// ─── Font registration ──────────────────────────────────────────────────────
//
// @napi-rs/canvas only knows about fonts that have been explicitly
// registered. If a TextLayer asks for "Inter" and none is registered,
// Skia falls back to whatever the OS provides — DejaVu Sans on the
// Vercel runtime, which looks subtly wrong on every social-asset.
//
// We register lazily on first render so cold-start cost only hits the
// first /api/marketing/render call. Templates that arrive before the
// font is registered still render (with the OS fallback) instead of
// failing — a "missing Inter on the smoke-test machine" issue should
// not break composition. Day 8 polish ships the proper font assets;
// today this is best-effort.

let fontsRegistered = false

function registerFontsOnce() {
  if (fontsRegistered) return
  fontsRegistered = true

  // Look for Inter (and any other display fonts) under
  // public/marketing/fonts/. Production deploys ship the .ttf/.otf
  // files there; if the directory is empty we silently fall back to
  // the OS default. The console.warn flags the latter so it's
  // obvious in logs why text rendering looks off.
  const fontDir = path.join(process.cwd(), 'public', 'marketing', 'fonts')
  try {
    const files = require('fs').readdirSync(fontDir) as string[]
    for (const f of files) {
      if (!/\.(ttf|otf|woff)$/i.test(f)) continue
      try {
        GlobalFonts.registerFromPath(path.join(fontDir, f))
      } catch (e) {
        console.warn(`[marketing/compose] failed to register font ${f}:`, e)
      }
    }
  } catch {
    console.warn('[marketing/compose] no public/marketing/fonts/ directory — using OS fallback')
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface RenderTemplateResult {
  buffer:        Buffer
  /** One entry per AssetLayer the engine actually drew (skipped layers
   *  are absent). Modal uses these to overlay draggable hit regions on
   *  the preview. Pixel coords in the final render's coordinate space. */
  renderedLayers: RenderedLayerBox[]
}

/**
 * Render a template at a specific size with resolved vars + assets.
 * Returns the encoded image buffer ready to upload to Storage AND the
 * per-asset bbox metadata the client uses to make the preview
 * draggable.
 *
 * The function does not consult the cache — that's lib/marketing/cache.ts
 * (Day 3). Callers that want caching must check there first; this engine
 * always renders fresh.
 *
 * Caller must guarantee `size.format !== 'pdf'`. PDFs are produced by
 * a separate pipeline (lib/marketing/pdf.ts, Day 8/9) because they need
 * structured page layout rather than raster composition.
 */
export async function renderTemplate(
  template: MarketingTemplate,
  size:     TemplateSize,
  vars:     ResolvedVars,
  assets:   ResolvedAssets,
): Promise<RenderTemplateResult> {
  if (size.format === 'pdf') {
    // Defensive: route handlers should dispatch PDFs to lib/marketing/pdf.ts.
    // Throwing here makes a routing bug obvious in logs instead of producing
    // a nonsensical PNG-shaped buffer with a .pdf filename.
    throw new Error(`[compose] PDF format not handled by raster engine — use lib/marketing/pdf.ts for ${template.id}`)
  }

  registerFontsOnce()

  const canvas: Canvas    = createCanvas(size.w, size.h)
  const ctx:    SKRSContext2D = canvas.getContext('2d')

  // Clear the canvas to fully transparent. Templates that want a solid
  // background put a ShapeLayer or AssetLayer at the bottom; if they
  // don't, the export is genuinely transparent (which is desired for
  // store.app_icon_1024).
  ctx.clearRect(0, 0, size.w, size.h)

  const renderedLayers: RenderedLayerBox[] = []

  // hasCharacter is the gate for `whenAlone` fallback. Computed once
  // per render so the per-layer dispatch stays cheap. Either slot
  // resolving to a Buffer counts — character.transparent fully
  // satisfies the "has a character" test, since the engine itself
  // falls back from .transparent → character when the cutout is
  // missing.
  const hasCharacter = !!(assets.character || assets['character.transparent'])

  for (const rawLayer of template.layers) {
    const layer = applyVariant(rawLayer, vars)
    const box = await drawLayer(ctx, layer, vars, assets, size, hasCharacter)
    if (box) renderedLayers.push(box)
  }

  let buffer: Buffer
  // Encoding. Canvas natively emits PNG; for JPG/WebP we hand off to
  // sharp so we can set quality + chroma subsampling. For PNG we go
  // straight from canvas to keep the alpha channel clean.
  if (size.format === 'png') {
    buffer = canvas.toBuffer('image/png')
  } else if (size.format === 'jpg') {
    const png = canvas.toBuffer('image/png')
    buffer = await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
  } else if (size.format === 'webp') {
    const png = canvas.toBuffer('image/png')
    buffer = await sharp(png).webp({ quality: 88 }).toBuffer()
  } else {
    throw new Error(`[compose] unsupported format ${size.format}`)
  }

  return { buffer, renderedLayers }
}

// ─── Layer dispatch ─────────────────────────────────────────────────────────

async function drawLayer(
  ctx:           SKRSContext2D,
  layer:         Layer,
  vars:          ResolvedVars,
  assets:        ResolvedAssets,
  size:          TemplateSize,
  hasCharacter:  boolean,
): Promise<RenderedLayerBox | null> {
  switch (layer.type) {
    case 'asset': {
      // Honour the user's "include character" toggle. Both
      // `character` and `character.transparent` slots are skipped when
      // the toggle is off — same template can therefore render with-
      // or without- a hero figure without authoring two layer stacks.
      if (!vars.includeCharacter && (layer.slot === 'character' || layer.slot === 'character.transparent')) {
        return null
      }
      // Layout-convention helper: when the project has no character at
      // all (or the user toggled it off), the wide-banner templates'
      // logo layer falls back to its `whenAlone` overrides so the logo
      // re-centres instead of clinging to the right half. effectiveHas
      // tracks both gates — toggle-off is functionally identical to
      // missing-asset for layout purposes.
      const effectiveHas = hasCharacter && vars.includeCharacter
      const resolved = applyWhenAlone(layer, effectiveHas)
      return drawAssetLayer(ctx, resolved, assets, size, vars)
    }
    case 'gradient': drawGradientLayer(ctx, layer, vars, size); return null
    case 'shape':    drawShapeLayer(ctx, layer, vars, size);    return null
    case 'text':     drawTextLayer(ctx, layer, vars, size);     return null
    case 'cta':      drawCtaLayer(ctx, layer, vars, size);      return null
    case 'overlay':  await drawOverlayLayer(ctx, layer, size);  return null
  }
}

// ─── Variant resolution ─────────────────────────────────────────────────────
//
// Templates can ship A/B/C arrangements without duplicating the layer
// stack — only AssetLayer supports `variants` today (the most common
// use case is repositioning the character / logo per layout). When a
// variant is selected, we shallow-merge the variant override on top of
// the base layer and return a new object so the original template
// stays immutable across calls.

function applyVariant(layer: Layer, vars: ResolvedVars): Layer {
  if (layer.type !== 'asset' || !layer.variants) return layer
  const override = layer.variants[vars.layoutVariant]
  if (!override) return layer
  return { ...layer, ...override } as AssetLayer
}

// ─── Asset layer ────────────────────────────────────────────────────────────

async function drawAssetLayer(
  ctx:    SKRSContext2D,
  layer:  AssetLayer,
  assets: ResolvedAssets,
  size:   TemplateSize,
  vars:   ResolvedVars,
): Promise<RenderedLayerBox | null> {
  // Resolve slot with bg-removed fallback. character.transparent → if
  // missing, fall back to character (the engine intentionally does NOT
  // hard-fail when the cutout isn't ready, so the workspace still works
  // before Replicate has finished or if Replicate is down).
  let buf: Buffer | null = assets[layer.slot]
  if (!buf && layer.slot === 'character.transparent') {
    buf = assets.character
  }
  if (!buf) {
    // Asset truly absent — skip the layer rather than throwing. The
    // missing-asset readiness check happens at the route level
    // (§10.1) so by the time we're rendering, asset absence is at
    // worst a partial-render annoyance, never a fatal error.
    return null
  }

  // Decode via sharp so we get clean dimensions + handle EXIF rotation.
  // Re-encoding to PNG before handing to canvas avoids @napi-rs/canvas's
  // occasional fussiness with WebP / progressive JPG sources.
  const decoded = await sharp(buf).rotate().png().toBuffer({ resolveWithObject: true })
  const img     = await loadImage(decoded.data)
  const natW    = decoded.info.width
  const natH    = decoded.info.height

  // Compute available box from canvas - padding.
  const pad     = resolvePadding(layer.padding, size.w, size.h)
  const boxX    = pad.left
  const boxY    = pad.top
  const boxW    = size.w - pad.left - pad.right
  const boxH    = size.h - pad.top  - pad.bottom

  // Fit + scale into the box.
  let drawW = boxW
  let drawH = boxH
  if (layer.fit === 'cover') {
    const r = Math.max(boxW / natW, boxH / natH)
    drawW = natW * r
    drawH = natH * r
  } else if (layer.fit === 'contain') {
    const r = Math.min(boxW / natW, boxH / natH)
    drawW = natW * r
    drawH = natH * r
  } else { /* fill */ }

  if (layer.scale && layer.scale > 0 && layer.scale !== 1) {
    drawW *= layer.scale
    drawH *= layer.scale
  }

  // User-supplied scale multiplier. Stacked on top of the template's
  // own scale so the modal's "Scale" slider reads naturally as
  // "bigger / smaller than the default" — 1.0 is no change.
  const override = vars.layerOverrides[layer.slot]
  if (override?.scale && override.scale > 0 && override.scale !== 1) {
    drawW *= override.scale
    drawH *= override.scale
  }

  // Anchor inside the box (not the canvas) — padding shrinks the box
  // and the anchor positions the asset within that smaller area, which
  // is what designers expect from "padding 40, anchor bottom-center".
  const pos = anchorIn(layer.anchor, boxX, boxY, boxW, boxH, drawW, drawH)

  // User-supplied positional offset. dx/dy are canvas-percentages so
  // the override travels cleanly across all sizes the template ships
  // — a +0.1 dx is +10% of canvas width regardless of whether we're
  // rendering at 256² or 1024².
  if (override?.dx) pos.x += override.dx * size.w
  if (override?.dy) pos.y += override.dy * size.h

  ctx.drawImage(img, pos.x, pos.y, drawW, drawH)

  return { slot: layer.slot, x: pos.x, y: pos.y, w: drawW, h: drawH }
}

// ─── Gradient layer ─────────────────────────────────────────────────────────

function drawGradientLayer(
  ctx:   SKRSContext2D,
  layer: GradientLayer,
  vars:  ResolvedVars,
  size:  TemplateSize,
): void {
  const from = resolveColor(layer.from, vars)
  const to   = resolveColor(layer.to,   vars)
  const start = clamp01(layer.start ?? 0)

  let grad: ReturnType<SKRSContext2D['createLinearGradient']> | ReturnType<SKRSContext2D['createRadialGradient']>
  if (layer.direction === 'radial') {
    // Radial: from canvas centre outward. Inner radius = start * outer.
    const cx = size.w / 2
    const cy = size.h / 2
    const r  = Math.hypot(size.w, size.h) / 2
    grad = ctx.createRadialGradient(cx, cy, r * start, cx, cy, r)
  } else {
    let x0 = 0, y0 = 0, x1 = 0, y1 = 0
    switch (layer.direction) {
      case 'top':    x0 = 0;       y0 = size.h;  x1 = 0;       y1 = 0       ; break
      case 'bottom': x0 = 0;       y0 = 0;       x1 = 0;       y1 = size.h  ; break
      case 'left':   x0 = size.w;  y0 = 0;       x1 = 0;       y1 = 0       ; break
      case 'right':  x0 = 0;       y0 = 0;       x1 = size.w;  y1 = 0       ; break
    }
    grad = ctx.createLinearGradient(x0, y0, x1, y1)
  }

  // `start` shifts the from-stop so the first portion of the layer is
  // a flat colour, then transitions. For most "darken from the bottom"
  // overlays this is the difference between a clean fade and a hazy wash.
  grad.addColorStop(start, from)
  grad.addColorStop(1,     to)

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size.w, size.h)
}

// ─── Shape layer ────────────────────────────────────────────────────────────

function drawShapeLayer(
  ctx:   SKRSContext2D,
  layer: ShapeLayer,
  vars:  ResolvedVars,
  size:  TemplateSize,
): void {
  const w = resolveDim(layer.size.w, size.w)
  const h = resolveDim(layer.size.h, size.h)
  const pos = anchorIn(layer.anchor, 0, 0, size.w, size.h, w, h)

  ctx.beginPath()
  if (layer.shape === 'circle') {
    const r = Math.min(w, h) / 2
    ctx.arc(pos.x + w / 2, pos.y + h / 2, r, 0, Math.PI * 2)
  } else if (layer.shape === 'pill') {
    // Pill = rounded rect with corner radius = half the smaller dim.
    pathRoundedRect(ctx, pos.x, pos.y, w, h, Math.min(w, h) / 2)
  } else if (layer.shape === 'rounded_rect') {
    pathRoundedRect(ctx, pos.x, pos.y, w, h, layer.borderRadius ?? 8)
  } else {
    ctx.rect(pos.x, pos.y, w, h)
  }

  ctx.fillStyle = resolveColor(layer.fill, vars)
  ctx.fill()

  if (layer.stroke) {
    ctx.lineWidth   = layer.stroke.width
    ctx.strokeStyle = resolveColor(layer.stroke.color, vars)
    ctx.stroke()
  }
}

// ─── Text layer ─────────────────────────────────────────────────────────────

function drawTextLayer(
  ctx:   SKRSContext2D,
  layer: TextLayer,
  vars:  ResolvedVars,
  size:  TemplateSize,
): void {
  const value = interpolate(layer.value, vars)
  if (!value) return

  ctx.font         = `${layer.font.weight} ${layer.font.size}px "${layer.font.family}"`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign    = layer.align

  // Letter-spacing isn't on the canvas spec — Skia exposes it via
  // ctx.letterSpacing which @napi-rs/canvas relays. Fall back to no-op
  // when undefined.
  if (layer.font.tracking != null) {
    // tracking is em-relative; convert to px
    const ls = layer.font.tracking * layer.font.size * 0.06
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ctx as any).letterSpacing = `${ls}px`
  }

  const maxW = layer.maxWidth != null ? resolveDim(layer.maxWidth, size.w) : size.w
  const lines = wrapText(ctx, value, maxW)
  const lineH = layer.font.size * 1.18  // generous leading for display type

  // Anchor positions the BLOCK; we offset per line based on align.
  const blockH = lines.length * lineH
  const pos = anchorIn(layer.anchor, 0, 0, size.w, size.h, maxW, blockH)

  // Stroke first so fill draws on top — canvas doesn't have a single
  // "stroked text" primitive that paints in the right z-order.
  if (layer.stroke) {
    ctx.lineWidth   = layer.stroke.width
    ctx.strokeStyle = resolveColor(layer.stroke.color, vars)
    ctx.lineJoin    = 'round'
  }
  ctx.fillStyle = resolveColor(layer.color, vars)

  for (let i = 0; i < lines.length; i++) {
    // textBaseline alphabetic → text sits on the line; first line's
    // baseline is one font-size below the block's top.
    const y = pos.y + lineH * i + layer.font.size
    let x: number
    switch (layer.align) {
      case 'left':   x = pos.x;             break
      case 'right':  x = pos.x + maxW;      break
      default:       x = pos.x + maxW / 2;  break
    }
    if (layer.stroke) ctx.strokeText(lines[i], x, y)
    ctx.fillText(lines[i], x, y)
  }
}

// ─── CTA layer ──────────────────────────────────────────────────────────────

function drawCtaLayer(
  ctx:   SKRSContext2D,
  layer: CtaLayer,
  vars:  ResolvedVars,
  size:  TemplateSize,
): void {
  const text = vars.ctaText
  // 'none' is a valid ctaText option meaning "don't render a CTA". The
  // template author still includes the layer; we just no-op here so a
  // single template variant works with or without a button.
  if (!text || text.toLowerCase() === 'none') return

  ctx.font         = `${layer.font.weight} ${layer.font.size}px "${layer.font.family}"`
  ctx.textBaseline = 'alphabetic'

  const padV = layer.padding[0]
  const padH = layer.padding[1]
  const txtW = ctx.measureText(text).width
  const btnW = txtW + padH * 2
  const btnH = layer.font.size + padV * 2

  const pos = anchorIn(layer.anchor, 0, 0, size.w, size.h, btnW, btnH)
  // Inset by 5% of canvas width so anchored CTAs don't kiss the edge —
  // a common designer-intent that templates would otherwise have to
  // encode via padding on the layer itself.
  const inset = Math.round(size.w * 0.025)
  const x = clampRange(pos.x, inset, size.w - btnW - inset)
  const y = clampRange(pos.y, inset, size.h - btnH - inset)

  // Background pill / flat / outlined.
  ctx.beginPath()
  if (layer.style === 'pill') {
    pathRoundedRect(ctx, x, y, btnW, btnH, btnH / 2)
  } else {
    pathRoundedRect(ctx, x, y, btnW, btnH, 6)
  }

  if (layer.style === 'outlined') {
    ctx.lineWidth   = 2
    ctx.strokeStyle = resolveColor(layer.bg, vars)
    ctx.stroke()
  } else {
    ctx.fillStyle = resolveColor(layer.bg, vars)
    ctx.fill()
  }

  // Button label.
  ctx.fillStyle = resolveColor(layer.fg, vars)
  ctx.textAlign = 'center'
  ctx.fillText(text, x + btnW / 2, y + btnH - padV)
}

// ─── Overlay layer ──────────────────────────────────────────────────────────

async function drawOverlayLayer(
  ctx:   SKRSContext2D,
  layer: OverlayLayer,
  size:  TemplateSize,
): Promise<void> {
  // Overlay paths are relative to public/marketing/overlays/ — the
  // template author keeps a curated set of decorative PNGs (sparkles,
  // bokeh, grain) and references them by basename.
  const filePath = path.join(process.cwd(), 'public', 'marketing', 'overlays', layer.src)
  let buf: Buffer
  try {
    buf = await fs.readFile(filePath)
  } catch {
    console.warn(`[marketing/compose] overlay missing: ${layer.src}`)
    return
  }
  const img = await loadImage(buf)

  const prevAlpha = ctx.globalAlpha
  const prevComp  = ctx.globalCompositeOperation
  ctx.globalAlpha = layer.opacity
  // Map the template's blendMode names onto canvas composite ops.
  // 'soft-light' is the canvas op that designers usually mean for a
  // subtle bokeh-on-bg effect; 'multiply'/'screen'/'overlay' map 1:1.
  if (layer.blendMode) {
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation
  }
  ctx.drawImage(img, 0, 0, size.w, size.h)
  ctx.globalAlpha = prevAlpha
  ctx.globalCompositeOperation = prevComp
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Resolve a ColorRef. Either the literal CSS-ish string or a project
 *  palette colour. Unknown var refs fall back to a hot pink so the
 *  designer notices missing palette wiring instead of getting silent
 *  black text. */
function resolveColor(ref: ColorRef, vars: ResolvedVars): string {
  if (typeof ref === 'string') return ref
  switch (ref.var) {
    case 'colorPrimary': return vars.resolvedColors.primary
    case 'colorAccent':  return vars.resolvedColors.accent
    case 'colorBg':      return vars.resolvedColors.bg
    default:             return '#ff00aa'
  }
}

/** Resolve a layer dimension that may be a literal px or a percentage
 *  string ('50%') of the relevant canvas axis. */
function resolveDim(dim: number | string, axisPx: number): number {
  if (typeof dim === 'number') return dim
  const m = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(dim.trim())
  if (m) return (parseFloat(m[1]) / 100) * axisPx
  return parseFloat(dim) || 0
}

function resolvePadding(
  pad: AssetLayer['padding'],
  w:   number,
  h:   number,
): { top: number; right: number; bottom: number; left: number } {
  if (pad == null) return { top: 0, right: 0, bottom: 0, left: 0 }
  // Each side resolves against its matching axis — top/bottom against
  // height, left/right against width — so a `"50%"` left padding always
  // carves exactly half the canvas regardless of the template's
  // aspect ratio. Used by char-left / logo-right wide banners.
  const sideW = (s: number | string): number => resolveDim(s, w)
  const sideH = (s: number | string): number => resolveDim(s, h)
  if (typeof pad === 'number' || typeof pad === 'string') {
    const v = typeof pad === 'number' ? pad : sideW(pad)
    return { top: v, right: v, bottom: v, left: v }
  }
  return {
    top:    sideH(pad[0]),
    right:  sideW(pad[1]),
    bottom: sideH(pad[2]),
    left:   sideW(pad[3]),
  }
}

/** When the project has no character asset, merge the layer's
 *  `whenAlone` overrides on top so a logo declared as `middle-right`
 *  for the char-left/logo-right layout snaps back to `middle-center`
 *  for a logo-only render. Pure: returns a new layer object so the
 *  template definition stays immutable across calls. */
function applyWhenAlone(layer: AssetLayer, hasCharacter: boolean): AssetLayer {
  if (hasCharacter || !layer.whenAlone) return layer
  return { ...layer, ...layer.whenAlone } as AssetLayer
}

/** Position content of size (cw, ch) inside box (bx, by, bw, bh) per
 *  the 9-cell anchor grid. */
function anchorIn(
  anchor: Anchor,
  bx: number, by: number, bw: number, bh: number,
  cw: number, ch: number,
): { x: number; y: number } {
  const [v, h] = anchor.split('-')
  let x = bx, y = by
  if (h === 'center') x = bx + (bw - cw) / 2
  if (h === 'right')  x = bx +  bw - cw
  if (v === 'middle') y = by + (bh - ch) / 2
  if (v === 'bottom') y = by +  bh - ch
  return { x, y }
}

/** Replace `${gameName}` / `${headline}` etc with their resolved values.
 *  Unknown keys leave the placeholder intact so authors notice the typo. */
function interpolate(template: string, vars: ResolvedVars): string {
  return template.replace(/\$\{(\w+)\}/g, (m, key: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (vars as any)[key]
    return v != null ? String(v) : m
  })
}

/** Greedy word-wrap to fit width. Long single tokens are NOT broken —
 *  display type with no breakable space is typically a game name and
 *  the designer would rather the box overflow than the title chop. */
function wrapText(ctx: SKRSContext2D, value: string, maxW: number): string[] {
  const lines: string[] = []
  for (const paragraph of value.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) { lines.push(''); continue }
    let cur = words[0]
    for (let i = 1; i < words.length; i++) {
      const next = `${cur} ${words[i]}`
      if (ctx.measureText(next).width <= maxW) {
        cur = next
      } else {
        lines.push(cur)
        cur = words[i]
      }
    }
    lines.push(cur)
  }
  return lines
}

function pathRoundedRect(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y,     x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x,     y + h, rr)
  ctx.arcTo(x,     y + h, x,     y,     rr)
  ctx.arcTo(x,     y,     x + w, y,     rr)
  ctx.closePath()
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function clampRange(n: number, lo: number, hi: number): number {
  if (lo > hi) return n
  return n < lo ? lo : n > hi ? hi : n
}
