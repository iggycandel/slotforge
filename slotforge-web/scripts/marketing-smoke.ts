// Marketing Workspace v1 / Day 2 — composition smoke test.
//
// Renders promo.square_lobby_tile at 1024² to /tmp/marketing-smoke.png
// using synthetic placeholder assets so the test runs offline (no
// Supabase round-trip). Confirms that:
//   • sharp + @napi-rs/canvas load on this Node runtime
//   • the layer dispatch, anchor maths, font registration, and PNG
//     encoding all do something reasonable
//   • the JSON template parses + validates through registry.ts
//
// Run with:   npx tsx scripts/marketing-smoke.ts
// or:         npx ts-node --transpile-only scripts/marketing-smoke.ts

import { renderTemplate } from '../lib/marketing/compose'
import { getTemplate }    from '../lib/marketing/registry'
import { createCanvas }   from '@napi-rs/canvas'
import fs                 from 'fs/promises'

// Generate solid-coloured placeholder PNGs for the asset slots so the
// engine has SOMETHING to draw without us needing a real Supabase
// project. Each is a 1024x1024 PNG with a label in the centre so it's
// obvious in the output which slot drew where.
async function placeholder(label: string, color: string): Promise<Buffer> {
  const c = createCanvas(1024, 1024)
  const ctx = c.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1024, 1024)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '700 64px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 512, 512)
  return c.toBuffer('image/png')
}

async function main() {
  const tpl = getTemplate('promo.square_lobby_tile')
  if (!tpl) throw new Error('template not registered — registry bootstrap broke')

  const size = tpl.sizes.find(s => s.label === '1024x1024')
  if (!size) throw new Error('size 1024x1024 not declared on template')

  const assets = {
    background_base:         await placeholder('BACKGROUND',  '#1a3050'),
    logo:                    await placeholder('LOGO',         '#c9a84c'),
    character:               await placeholder('CHARACTER',    '#7a2030'),
    'character.transparent': null,                              // exercise the fallback to character
  }

  const buf = await renderTemplate(tpl, size, {
    gameName:      'LUCKY BULL',
    headline:      null,
    subhead:       null,
    ctaText:       'PLAY NOW',
    language:      'EN',
    colorMode:     'auto',
    layoutVariant: 'A',
    resolvedColors: {
      primary: '#c9a84c',
      accent:  '#e84d3a',
      bg:      '#06060a',
    },
  }, assets)

  const out = '/tmp/marketing-smoke.png'
  await fs.writeFile(out, buf)
  console.log(`OK — rendered ${buf.length} bytes to ${out}`)
}

main().catch(e => { console.error(e); process.exit(1) })
