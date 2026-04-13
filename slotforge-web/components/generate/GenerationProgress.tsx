'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Generation Progress Panel
// Real-time progress bars per asset type during generation
// ─────────────────────────────────────────────────────────────────────────────

import { ASSET_LABELS } from '@/types/assets'
import type { AssetType } from '@/types/assets'

export interface GenerationStatus {
  completed: number
  total:     number
  current?:  AssetType
  done:      boolean
  error?:    string
}

interface Props {
  status:       GenerationStatus
  completedSet: Set<AssetType>
  failedSet:    Set<AssetType>
}

const GROUPS = [
  { label: 'Backgrounds',     types: ['background_base', 'background_bonus'] as AssetType[] },
  { label: 'High Symbols',    types: ['symbol_high_1','symbol_high_2','symbol_high_3','symbol_high_4','symbol_high_5'] as AssetType[] },
  { label: 'Low Symbols',     types: ['symbol_low_1','symbol_low_2','symbol_low_3','symbol_low_4','symbol_low_5'] as AssetType[] },
  { label: 'Special Symbols', types: ['symbol_wild', 'symbol_scatter'] as AssetType[] },
  { label: 'Logo',            types: ['logo'] as AssetType[] },
]

export function GenerationProgress({ status, completedSet, failedSet }: Props) {
  const pct = status.total > 0 ? Math.round((status.completed / status.total) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Overall progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-zinc-400">
            {status.done ? 'Complete' : `Generating… ${status.completed} / ${status.total}`}
          </span>
          <span className="text-xs font-semibold text-amber-400">{pct}%</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {status.current && !status.done && (
          <p className="text-[10px] text-zinc-500 mt-1">
            ↳ {ASSET_LABELS[status.current]}
          </p>
        )}
      </div>

      {/* Per-group status */}
      <div className="space-y-3">
        {GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              {group.label}
            </p>
            <div className="grid grid-cols-1 gap-1">
              {group.types.map(type => {
                const done   = completedSet.has(type)
                const failed = failedSet.has(type)
                const active = status.current === type

                return (
                  <div
                    key={type}
                    className={`
                      flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs
                      transition-all duration-300
                      ${active  ? 'bg-amber-500/10 border border-amber-500/25'  : ''}
                      ${done    ? 'bg-zinc-800/60'                              : ''}
                      ${failed  ? 'bg-red-900/20 border border-red-800/30'      : ''}
                      ${!active && !done && !failed ? 'text-zinc-600'           : ''}
                    `}
                  >
                    {/* Status dot */}
                    <span className="flex-shrink-0">
                      {done   && <span className="text-emerald-400">✓</span>}
                      {failed && <span className="text-red-400">✗</span>}
                      {active && <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse block" />}
                      {!done && !failed && !active && (
                        <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 block" />
                      )}
                    </span>

                    <span className={`flex-1 truncate ${
                      done   ? 'text-zinc-300' :
                      failed ? 'text-red-400'  :
                      active ? 'text-amber-300' :
                               'text-zinc-600'
                    }`}>
                      {ASSET_LABELS[type]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {status.error && (
        <div className="px-3 py-2.5 rounded-lg bg-red-900/30 border border-red-800/40 text-xs text-red-300">
          {status.error}
        </div>
      )}
    </div>
  )
}
