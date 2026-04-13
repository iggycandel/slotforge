'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Generate Form
// Single-input theme entry with provider selector
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Wand2, ChevronDown } from 'lucide-react'

interface Props {
  onGenerate:  (theme: string, provider: string) => void
  isLoading:   boolean
}

const EXAMPLE_THEMES = [
  'Ancient Egypt',
  'Deep Ocean Treasure',
  'Viking Warriors',
  'Enchanted Forest',
  'Space Odyssey',
  'Dragon\'s Gold',
  'Wild West',
  'Japanese Neon',
]

export function GenerateForm({ onGenerate, isLoading }: Props) {
  const [theme,    setTheme]    = useState('')
  const [provider, setProvider] = useState('auto')
  const [showAdv,  setShowAdv]  = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!theme.trim() || isLoading) return
    onGenerate(theme.trim(), provider)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Main theme input */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Game Theme
        </label>
        <div className="relative">
          <input
            type="text"
            value={theme}
            onChange={e => setTheme(e.target.value)}
            placeholder=""
            disabled={isLoading}
            className="
              w-full px-4 py-3 pr-12 rounded-xl text-sm
              bg-zinc-900 border border-zinc-700
              text-zinc-100 placeholder-zinc-500
              focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          />
          <Wand2 className="absolute right-3.5 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
        </div>

        {/* Example chips */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {EXAMPLE_THEMES.map(ex => (
            <button
              key={ex}
              type="button"
              onClick={() => setTheme(ex)}
              disabled={isLoading}
              className="
                px-2.5 py-1 rounded-full text-xs
                bg-zinc-800 hover:bg-zinc-700 border border-zinc-700
                text-zinc-400 hover:text-zinc-200
                transition-colors disabled:opacity-40
              "
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdv(v => !v)}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${showAdv ? 'rotate-180' : ''}`} />
        Advanced options
      </button>

      {showAdv && (
        <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
          <label className="block text-xs font-medium text-zinc-400">AI Provider</label>
          <div className="flex gap-2">
            {(['auto', 'runway', 'openai'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                  ${provider === p
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'}
                `}
              >
                {p === 'auto' ? '✨ Auto' : p === 'runway' ? '🎬 Runway' : '🤖 OpenAI'}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600">
            Auto selects Runway if configured, falls back to OpenAI, then mock.
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!theme.trim() || isLoading}
        className="
          w-full py-3 px-6 rounded-xl font-semibold text-sm
          bg-amber-500 hover:bg-amber-400 text-zinc-900
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-all shadow-lg shadow-amber-500/20
          flex items-center justify-center gap-2
        "
      >
        {isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-zinc-900/40 border-t-zinc-900 rounded-full animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4" />
            Generate {15} assets
          </>
        )}
      </button>
    </form>
  )
}
