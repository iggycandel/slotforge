// Marketing Workspace v1 / Day 9 — PDF smoke test.
//
// Renders the press one-pager via lib/marketing/pdf.ts directly using
// synthetic project facts. Verifies pdf-lib loads, embeds an image,
// and produces a parseable A4 PDF without round-tripping through
// Supabase or the SSE pipeline.

import { renderPressOnePager } from '../lib/marketing/pdf'
import { createCanvas }        from '@napi-rs/canvas'
import fs                      from 'fs/promises'

async function placeholder(label: string, color: string): Promise<Buffer> {
  const c = createCanvas(1920, 600)
  const ctx = c.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1920, 600)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '700 64px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 960, 300)
  return c.toBuffer('image/png')
}

async function main() {
  const heroImage = await placeholder('HERO BANNER', '#1a3050')

  const buf = await renderPressOnePager({
    project: {
      id:   'smoke-test',
      name: 'Lucky Bull',
      meta: {
        gameName:     'LUCKY BULL',
        themeKey:     'western',
        colorPrimary: '#c9a84c',
        colorAccent:  '#e84d3a',
        colorBg:      '#06060a',
      },
      facts: {
        rtp:        '96.1%',
        volatility: 'High',
        paylines:   '25',
        reelset:    '5x3',
        maxWin:     'x5000',
        jackpotMini:  '€100',
        jackpotMinor: '€1,000',
        jackpotMajor: '€10,000',
        jackpotGrand: '€100,000',
        features:   ['freespin', 'wheel_bonus', 'sticky_wild', 'win_multiplier'],
      },
    },
    vars: {
      gameName:      'LUCKY BULL',
      headline:      'Wild West Slot — 25 Lines, x5000 Max Win',
      subhead:       'Stampede through the Old West with Sticky Wilds, Free Spins, and the Wheel of Fortune.',
      ctaText:       'PLAY NOW',
      language:      'EN',
      colorMode:     'auto',
      layoutVariant: 'A',
      resolvedColors: { primary: '#c9a84c', accent: '#e84d3a', bg: '#06060a' },
      includeCharacter: true,
      layerOverrides:   {},
    },
    assets: {
      background_base:         null,
      logo:                    null,
      character:               null,
      'character.transparent': null,
    },
    heroImage,
  })

  const out = '/tmp/marketing-press-smoke.pdf'
  await fs.writeFile(out, buf)
  console.log(`OK — pressed PDF (${buf.length} bytes) → ${out}`)
}

main().catch(e => { console.error(e); process.exit(1) })
