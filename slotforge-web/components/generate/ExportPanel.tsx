'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Export Panel
// Bulk download as ZIP or individual PNG exports, Spine-ready naming
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Download, Package } from 'lucide-react'
import { ASSET_LABELS } from '@/types/assets'
import type { AssetType, GeneratedAsset } from '@/types/assets'

interface Props {
  assets: Partial<Record<AssetType, GeneratedAsset>>
  theme:  string
}

// Spine-ready filename convention: sym-H1.png, sym-Wild.png, etc.
const SPINE_NAMES: Partial<Record<AssetType, string>> = {
  background_base:  'bg-base.jpg',
  background_bonus: 'bg-bonus.jpg',
  symbol_high_1:    'sym-H1.png',
  symbol_high_2:    'sym-H2.png',
  symbol_high_3:    'sym-H3.png',
  symbol_high_4:    'sym-H4.png',
  symbol_high_5:    'sym-H5.png',
  symbol_low_1:     'sym-L1.png',
  symbol_low_2:     'sym-L2.png',
  symbol_low_3:     'sym-L3.png',
  symbol_low_4:     'sym-L4.png',
  symbol_low_5:     'sym-L5.png',
  symbol_wild:      'sym-Wild.png',
  symbol_scatter:   'sym-Scatter.png',
  logo:             'logo.png',
}

export function ExportPanel({ assets, theme }: Props) {
  const [exporting, setExporting] = useState(false)

  const assetList = Object.entries(assets) as [AssetType, GeneratedAsset][]
  const count = assetList.length

  async function downloadAll() {
    if (exporting || count === 0) return
    setExporting(true)

    try {
      // Dynamically import JSZip only when needed
      const JSZip = (await import('jszip')).default
      const zip   = new JSZip()
      const folder = zip.folder(theme.replace(/\s+/g, '-').toLowerCase()) ?? zip

      await Promise.all(
        assetList.map(async ([type, asset]) => {
          try {
            const res  = await fetch(asset.url)
            const blob = await res.blob()
            const name = SPINE_NAMES[type] ?? `${type}.png`
            folder.file(name, blob)
          } catch {
            console.warn(`[export] Failed to fetch ${type}`)
          }
        })
      )

      const content = await zip.generateAsync({ type: 'blob' })
      const url     = URL.createObjectURL(content)
      const a       = document.createElement('a')
      a.href        = url
      a.download    = `${theme.replace(/\s+/g, '-').toLowerCase()}-assets.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  if (count === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Export
        </h3>
        <span className="text-[10px] text-zinc-600">{count} assets ready</span>
      </div>

      {/* Export all as ZIP */}
      <button
        onClick={downloadAll}
        disabled={exporting}
        className="
          w-full flex items-center justify-center gap-2
          py-2.5 px-4 rounded-lg text-sm font-semibold
          bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30
          text-amber-400 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
        "
      >
        {exporting ? (
          <span className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
        ) : (
          <Package className="w-3.5 h-3.5" />
        )}
        {exporting ? 'Zipping…' : 'Download all as ZIP (Spine-ready)'}
      </button>

      {/* Individual downloads */}
      <div className="space-y-1 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
        {assetList.map(([type, asset]) => (
          <a
            key={type}
            href={asset.url}
            download={SPINE_NAMES[type] ?? `${type}.png`}
            target="_blank"
            rel="noopener noreferrer"
            className="
              flex items-center gap-2.5 px-2.5 py-2 rounded-lg
              bg-zinc-900 hover:bg-zinc-800 border border-zinc-800
              text-xs text-zinc-400 hover:text-zinc-200
              transition-colors group
            "
          >
            <Download className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
            <span className="flex-1 truncate">{ASSET_LABELS[type]}</span>
            <span className="text-[9px] text-zinc-600 shrink-0">
              {SPINE_NAMES[type]}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
