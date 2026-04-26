// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 9
// Press one-pager PDF. Composed via pdf-lib rather than the canvas
// engine because PDFs need structured pages (text reflow, vector
// shapes, embedded images) — not a flat raster.
//
// Layout:
//
//   ┌──────────────────────────────────────────────┐ A4 portrait
//   │  HERO IMAGE                                  │  2480 × 3508 px
//   │  (rendered hero_banner_desktop or fallback)  │  @ 300 dpi
//   │                                              │
//   │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
//   │  GAME NAME · STUDIO ─────────────────────── │
//   │  THEME / SETTING                            │
//   │                                              │
//   │  ┌─────────────┬─────────────┬───────────┐  │
//   │  │ RTP   96.1% │ Vol  High   │ Lines 25  │  │
//   │  └─────────────┴─────────────┴───────────┘  │
//   │                                              │
//   │  Mechanics: free spins, wheel bonus, …      │
//   │                                              │
//   │  Jackpots: Mini · Minor · Major · Grand     │
//   │                                              │
//   │  About: <story / setting blurb>             │
//   │                                              │
//   │  ────────── Made with Spinative ─────────── │
//   └──────────────────────────────────────────────┘
//
// All text wraps inside 1in margins. The hero image is the user's
// rendered hero_banner_desktop if that kit has been rendered (we
// query marketing_renders for it), otherwise we composite a one-shot
// hero on demand.
//
// Returns a single Buffer the storage helper can upload like any other
// render. Cache key behaves identically (vars_hash mixes facts so
// re-rendering after a GDD update produces a fresh PDF).
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

import type { MarketingProject } from './project'
import type { ResolvedAssets, ResolvedVars } from './types'

// A4 at 300dpi. pdf-lib measures in points (72 per inch). We set up
// the page in points; the px constants in the design doc only matter
// for the cache key.
const PAGE_W_PT = 595.28   // A4 width  in points
const PAGE_H_PT = 841.89   // A4 height in points
const MARGIN    = 48       // ~16mm margin

export interface PressPdfInputs {
  project:     MarketingProject
  vars:        ResolvedVars
  assets:      ResolvedAssets
  /** Optional hero image to embed at the top. PNG or JPG buffer.
   *  When absent we draw a coloured strip with the resolved palette
   *  so the page still has a visual anchor. */
  heroImage?:  Buffer | null
}

export async function renderPressOnePager(input: PressPdfInputs): Promise<Buffer> {
  const { project, vars, assets, heroImage } = input

  const pdf = await PDFDocument.create()
  pdf.setTitle(`${project.meta.gameName ?? project.name} — Press Kit`)
  pdf.setProducer('Spinative')
  pdf.setCreator('Spinative Marketing v1')

  const page = pdf.addPage([PAGE_W_PT, PAGE_H_PT])

  const fontReg  = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fontMono = await pdf.embedFont(StandardFonts.Courier)

  // ── Hero strip ───────────────────────────────────────────────────────────
  // Top third of the page. Either the supplied hero image (centered,
  // cropped to fit) or a solid palette block.
  const heroH = (PAGE_H_PT - MARGIN * 2) * 0.40
  const heroY = PAGE_H_PT - MARGIN - heroH
  const heroX = MARGIN
  const heroW = PAGE_W_PT - MARGIN * 2

  if (heroImage) {
    const isJpg = heroImage[0] === 0xff && heroImage[1] === 0xd8
    const img = isJpg ? await pdf.embedJpg(heroImage) : await pdf.embedPng(heroImage)
    // Cover-fit
    const imgRatio = img.width / img.height
    const boxRatio = heroW / heroH
    let drawW: number, drawH: number
    if (imgRatio > boxRatio) {
      drawH = heroH
      drawW = drawH * imgRatio
    } else {
      drawW = heroW
      drawH = drawW / imgRatio
    }
    const drawX = heroX + (heroW - drawW) / 2
    const drawY = heroY + (heroH - drawH) / 2
    // pdf-lib doesn't support clipping out of the box; we just over-draw
    // the bleed with white rectangles after. Acceptable for a press
    // sheet — the hero box is well within the margin.
    page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH })
    // Mask any bleed outside the hero box
    if (drawX < heroX) page.drawRectangle({ x: 0, y: heroY, width: heroX, height: heroH, color: rgb(1, 1, 1) })
    if (drawX + drawW > heroX + heroW) page.drawRectangle({ x: heroX + heroW, y: heroY, width: PAGE_W_PT - (heroX + heroW), height: heroH, color: rgb(1, 1, 1) })
  } else {
    const c = hexToRgb(vars.resolvedColors.primary || '#c9a84c')
    page.drawRectangle({ x: heroX, y: heroY, width: heroW, height: heroH, color: rgb(c.r, c.g, c.b) })
  }

  // Suppress unused-asset lint — assets is reserved for future enhancements
  // (e.g. embedding the logo as a corner mark on the press sheet).
  void assets

  // ── Title block ──────────────────────────────────────────────────────────
  let cursorY = heroY - 28
  const title = (project.meta.gameName ?? project.name ?? 'Untitled Game').toUpperCase()
  page.drawText(title, {
    x: MARGIN, y: cursorY, size: 28, font: fontBold,
    color: rgb(0.04, 0.04, 0.06),
    maxWidth: PAGE_W_PT - MARGIN * 2,
  })
  cursorY -= 22

  if (project.meta.themeKey) {
    page.drawText(String(project.meta.themeKey).toUpperCase(), {
      x: MARGIN, y: cursorY, size: 10, font: fontMono,
      color: rgb(0.45, 0.45, 0.55),
    })
    cursorY -= 26
  } else {
    cursorY -= 16
  }

  // Divider rule
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end:   { x: PAGE_W_PT - MARGIN, y: cursorY },
    thickness: 0.5, color: rgb(0.7, 0.7, 0.75),
  })
  cursorY -= 24

  // ── Stat strip ───────────────────────────────────────────────────────────
  // Four columns: RTP, Volatility, Paylines, Max Win. Each has a
  // small label above and the value below. Skip empty entries cleanly
  // so a thin GDD doesn't leave a row of "—" placeholders.
  const stats: Array<{ label: string; value?: string }> = [
    { label: 'RTP',         value: project.facts.rtp        },
    { label: 'VOLATILITY',  value: project.facts.volatility },
    { label: 'PAYLINES',    value: project.facts.paylines   },
    { label: 'MAX WIN',     value: project.facts.maxWin     },
    { label: 'REELSET',     value: project.facts.reelset    },
  ].filter(s => !!s.value)

  if (stats.length) {
    const colW = (PAGE_W_PT - MARGIN * 2) / stats.length
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i]
      const x = MARGIN + colW * i
      page.drawText(s.label, {
        x: x + 4, y: cursorY, size: 8, font: fontMono,
        color: rgb(0.45, 0.45, 0.55),
      })
      page.drawText(s.value ?? '—', {
        x: x + 4, y: cursorY - 18, size: 14, font: fontBold,
        color: rgb(0.04, 0.04, 0.06),
      })
    }
    cursorY -= 50
  }

  // ── Mechanics ────────────────────────────────────────────────────────────
  if (project.facts.features?.length) {
    page.drawText('MECHANICS', {
      x: MARGIN, y: cursorY, size: 8, font: fontMono,
      color: rgb(0.45, 0.45, 0.55),
    })
    cursorY -= 14
    const list = project.facts.features
      .map(f => f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      .join(' · ')
    cursorY = drawWrappedText(page, list, MARGIN, cursorY, 12, fontReg, rgb(0.15, 0.15, 0.2), PAGE_W_PT - MARGIN * 2)
    cursorY -= 16
  }

  // ── Jackpots ─────────────────────────────────────────────────────────────
  const jackpots = [
    project.facts.jackpotMini  && `Mini ${project.facts.jackpotMini}`,
    project.facts.jackpotMinor && `Minor ${project.facts.jackpotMinor}`,
    project.facts.jackpotMajor && `Major ${project.facts.jackpotMajor}`,
    project.facts.jackpotGrand && `Grand ${project.facts.jackpotGrand}`,
  ].filter((j): j is string => !!j)

  if (jackpots.length) {
    page.drawText('JACKPOTS', {
      x: MARGIN, y: cursorY, size: 8, font: fontMono,
      color: rgb(0.45, 0.45, 0.55),
    })
    cursorY -= 14
    cursorY = drawWrappedText(page, jackpots.join(' · '), MARGIN, cursorY, 12, fontReg, rgb(0.15, 0.15, 0.2), PAGE_W_PT - MARGIN * 2)
    cursorY -= 16
  }

  // ── About / subhead ──────────────────────────────────────────────────────
  if (vars.subhead || vars.headline) {
    page.drawText('ABOUT', {
      x: MARGIN, y: cursorY, size: 8, font: fontMono,
      color: rgb(0.45, 0.45, 0.55),
    })
    cursorY -= 14
    const blurb = [vars.headline, vars.subhead].filter(Boolean).join('. ')
    cursorY = drawWrappedText(page, blurb, MARGIN, cursorY, 11, fontReg, rgb(0.15, 0.15, 0.2), PAGE_W_PT - MARGIN * 2)
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y: MARGIN + 18 },
    end:   { x: PAGE_W_PT - MARGIN, y: MARGIN + 18 },
    thickness: 0.5, color: rgb(0.85, 0.85, 0.88),
  })
  page.drawText('Made with Spinative', {
    x: MARGIN, y: MARGIN, size: 8, font: fontMono,
    color: rgb(0.6, 0.6, 0.65),
  })
  page.drawText(new Date().toISOString().slice(0, 10), {
    x: PAGE_W_PT - MARGIN - 60, y: MARGIN, size: 8, font: fontMono,
    color: rgb(0.6, 0.6, 0.65),
  })

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (!m) return { r: 0.79, g: 0.66, b: 0.30 }
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

/** Naive word-wrap drawer for pdf-lib. Returns the new cursorY. */
function drawWrappedText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page:   any,
  text:   string,
  x:      number,
  y:      number,
  size:   number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  font:   any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  color:  any,
  maxW:   number,
): number {
  const words = text.split(/\s+/).filter(Boolean)
  const lineH = size * 1.32
  let line = ''
  let curY = y
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w
    const width = font.widthOfTextAtSize(trial, size)
    if (width <= maxW) {
      line = trial
    } else {
      page.drawText(line, { x, y: curY, size, font, color })
      curY -= lineH
      line = w
    }
  }
  if (line) {
    page.drawText(line, { x, y: curY, size, font, color })
    curY -= lineH
  }
  return curY
}
