'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Export Panel
// Bulk download (sequential) or individual PNG exports, Spine-ready naming.
// Shows an upgrade prompt for users without export access.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Download, Package, Lock } from 'lucide-react'
import { ASSET_LABELS } from '@/types/assets'
import type { AssetType, GeneratedAsset } from '@/types/assets'
import Link from 'next/link'

interface Props {
  assets:          Partial<Record<AssetType, GeneratedAsset>>
  theme:           string
  /** Whether the current plan allows exports. Default: true (for backwards-compat). */
  exportsEnabled?: boolean
  /** Billing page href, used in upgrade prompt. */
  billingHref?:    string
}

// Spine-ready filename convention
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

/** Trigger a browser download for a remote URL without a zip library */
async function downloadFile(url: string, filename: string) {
  const res  = await fetch(url)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(href)
}

export function ExportPanel({
  assets,
  theme,
  exportsEnabled = true,
  billingHref,
}: Props) {
  const [exporting, setExporting] = useState(false)
  const [progress,  setProgress]  = useState(0)

  const assetList = Object.entries(assets) as [AssetType, GeneratedAsset][]
  const count = assetList.length

  async function downloadAll() {
    if (exporting || count === 0) return
    setExporting(true)
    setProgress(0)

    for (let i = 0; i < assetList.length; i++) {
      const [type, asset] = assetList[i]
      const filename = SPINE_NAMES[type] ?? `${type}.png`
      try {
        await downloadFile(asset.url, filename)
      } catch {
        console.warn(`[export] Failed to download ${type}`)
      }
      setProgress(i + 1)
      // Small delay so the browser doesn't block multiple simultaneous downloads
      await new Promise(r => setTimeout(r, 300))
    }

    setExporting(false)
    setProgress(0)
  }

  if (count === 0) return null

  // ── Upgrade prompt for free-tier users ───────────────────────────────────

  if (!exportsEnabled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Export
          </h3>
          <span className="text-[10px] text-zinc-600">{count} assets ready</span>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-4 h-4 text-zinc-500" />
          </div>
          <p className="text-xs font-semibold text-zinc-300 mb-1">Exports locked</p>
          <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
            Asset downloads are available on the Freelancer and Studio plans.
          </p>
          {billingHref && (
            <Link
              href={billingHref}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 transition-colors"
            >
              Upgrade to export →
            </Link>
          )}
        </div>
      </div>
    )
  }

  // ── Normal export UI ─────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Export
        </h3>
        <span className="text-[10px] text-zinc-600">{count} assets ready</span>
      </div>

      {/* Download all button */}
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
          <>
            <span className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
            Downloading {progress}/{count}…
          </>
        ) : (
          <>
            <Package className="w-3.5 h-3.5" />
            Download all (Spine-ready)
          </>
        )}
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
