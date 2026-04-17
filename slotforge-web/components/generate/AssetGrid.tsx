'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Asset Grid
// Displays generated assets with download / layer-add controls
// ─────────────────────────────────────────────────────────────────────────────

import { Download, Layers, ZoomIn } from 'lucide-react'
import { useState } from 'react'
import { ASSET_LABELS } from '@/types/assets'
import type { AssetType, GeneratedAsset } from '@/types/assets'

interface Props {
  assets: Partial<Record<AssetType, GeneratedAsset>>
  onAddToCanvas?: (asset: GeneratedAsset) => void
}

const GROUPS: { label: string; types: AssetType[] }[] = [
  {
    label: 'Backgrounds',
    types: ['background_base', 'background_bonus'],
  },
  {
    label: 'High Symbols',
    types: ['symbol_high_1','symbol_high_2','symbol_high_3','symbol_high_4','symbol_high_5'],
  },
  {
    label: 'Low Symbols',
    types: ['symbol_low_1','symbol_low_2','symbol_low_3','symbol_low_4','symbol_low_5'],
  },
  {
    label: 'Special',
    types: ['symbol_wild', 'symbol_scatter'],
  },
  {
    label: 'Logo',
    types: ['logo'],
  },
]

function AssetCard({
  type,
  asset,
  onAddToCanvas,
}: {
  type: AssetType
  asset?: GeneratedAsset
  onAddToCanvas?: (a: GeneratedAsset) => void
}) {
  const [zoom, setZoom] = useState(false)

  if (!asset) {
    return (
      <div className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
        <div className="text-center space-y-1.5 px-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 mx-auto animate-pulse" />
          <p className="text-[9px] text-zinc-600 leading-tight">{ASSET_LABELS[type]}</p>
        </div>
      </div>
    )
  }

  const isWide = type.startsWith('background') || type === 'logo'

  return (
    <>
      <div className="group relative rounded-xl overflow-hidden border border-zinc-800 hover:border-amber-500/30 transition-colors bg-zinc-900">
        {/* Image */}
        <div className={`relative ${isWide ? 'aspect-video' : 'aspect-square'} bg-[url(/checker.svg)] bg-[length:16px_16px]`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt={ASSET_LABELS[type]}
            className="absolute inset-0 w-full h-full object-contain"
            loading="lazy"
          />

          {/* Overlay actions */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => setZoom(true)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <a
              href={asset.url}
              download={`${type}.png`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Download PNG"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
            {onAddToCanvas && (
              <button
                onClick={() => onAddToCanvas(asset)}
                className="p-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors"
                title="Add to canvas"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Label + provider badge */}
        <div className="px-2.5 py-1.5 flex items-center justify-between gap-1">
          <span className="text-[10px] text-zinc-400 truncate">{ASSET_LABELS[type]}</span>
          <span className={`
            shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium
            ${asset.provider === 'runway' ? 'bg-purple-900/40 text-purple-400' :
              asset.provider === 'openai' ? 'bg-blue-900/40 text-blue-400'   :
                                           'bg-zinc-800 text-zinc-500'}
          `}>
            {asset.provider}
          </span>
        </div>
      </div>

      {/* Lightbox */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setZoom(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt={ASSET_LABELS[type]}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

export function AssetGrid({ assets, onAddToCanvas }: Props) {
  if (Object.keys(assets).length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-sm">No assets generated yet.</p>
        <p className="text-xs mt-1">Enter a theme and hit Generate.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {GROUPS.map(group => {
        const groupAssets = group.types.filter(t => assets[t])
        if (groupAssets.length === 0) return null

        return (
          <div key={group.label}>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              {group.label}
            </h3>
            <div className={`grid gap-3 ${
              group.label === 'Backgrounds' || group.label === 'Logo'
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            }`}>
              {group.types.map(type => (
                <AssetCard
                  key={type}
                  type={type}
                  asset={assets[type]}
                  onAddToCanvas={onAddToCanvas}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
