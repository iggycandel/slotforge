'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createProject } from '@/actions/projects'
import { ArrowLeft, Check } from 'lucide-react'
import Link from 'next/link'

const THEMES = [
  { value: 'western',  label: 'Western',  emoji: '🤠' },
  { value: 'fantasy',  label: 'Fantasy',  emoji: '🧙' },
  { value: 'egypt',    label: 'Egypt',    emoji: '🏺' },
  { value: 'space',    label: 'Space',    emoji: '🚀' },
  { value: 'fruit',    label: 'Fruit',    emoji: '🍒' },
  { value: 'ocean',    label: 'Ocean',    emoji: '🌊' },
  { value: 'jungle',   label: 'Jungle',   emoji: '🌿' },
  { value: 'horror',   label: 'Horror',   emoji: '💀' },
  { value: 'luxury',   label: 'Luxury',   emoji: '💎' },
  { value: 'other',    label: 'Custom',   emoji: '✏️' },
]

const REELSETS = [
  { value: '5x3',   label: '5×3',   sub: 'Standard',  cols: 5, rows: 3 },
  { value: '5x4',   label: '5×4',   sub: 'Wide',      cols: 5, rows: 4 },
  { value: '6x4',   label: '6×4',   sub: 'Big win',   cols: 6, rows: 4 },
  { value: '3x3',   label: '3×3',   sub: 'Classic',   cols: 3, rows: 3 },
  { value: '4x3',   label: '4×3',   sub: '4-reel',    cols: 4, rows: 3 },
  { value: '7x3',   label: '7×3',   sub: 'Megaways',  cols: 7, rows: 3 },
  { value: '5x6c',  label: '5×6c',  sub: 'Cluster',   cols: 5, rows: 6 },
]

export default function NewProjectPage() {
  const params   = useParams<{ orgSlug: string }>()
  const router   = useRouter()
  const [name,    setName]    = useState('')
  const [theme,   setTheme]   = useState('western')
  const [reelset, setReelset] = useState('5x3')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const result = await createProject({
      orgSlug: params.orgSlug,
      name:    name.trim(),
      theme,
      reelset,
    })

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.push(`/${params.orgSlug}/projects/${result.data?.id}`)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07080d' }}>
      {/* Header */}
      <div
        className="flex items-center gap-4 flex-shrink-0"
        style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Link
          href={`/${params.orgSlug}/projects`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#a5afc0', textDecoration: 'none',
          }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} />
        </Link>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#f4efe4', margin: 0 }}>New project</h1>
          <p style={{ fontSize: 12, color: '#7d8799', margin: '2px 0 0' }}>
            Set up your slot game — everything can be changed later.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto" style={{ padding: '32px' }}>
        <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>

          {/* Game name */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7d8799', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Game name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lucky Bull, Dragon's Hoard…"
              required
              autoFocus
              style={{
                width: '100%', padding: '12px 16px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, fontSize: 14, color: '#f4efe4',
                outline: 'none', fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(215,168,79,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {/* Theme */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7d8799', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Theme
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {THEMES.map(t => (
                <ThemeCard
                  key={t.value}
                  theme={t}
                  selected={theme === t.value}
                  onClick={() => setTheme(t.value)}
                />
              ))}
            </div>
          </div>

          {/* Reel grid */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7d8799', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Reel grid
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {REELSETS.map(r => (
                <ReelCard
                  key={r.value}
                  reel={r}
                  selected={reelset === r.value}
                  onClick={() => setReelset(r.value)}
                />
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 20,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{
                padding: '11px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#a5afc0', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                flex: 1, padding: '11px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: loading || !name.trim()
                  ? 'rgba(215,168,79,0.3)'
                  : 'linear-gradient(135deg,#d7a84f,#f0ca79)',
                color: loading || !name.trim() ? '#a5afc0' : '#07080d',
                border: 'none', cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading || !name.trim() ? 'none' : '0 4px 18px rgba(215,168,79,0.25)',
              }}
            >
              {loading ? (
                <>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.4)', borderTopColor: 'rgba(0,0,0,0.9)', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
                  Creating…
                </>
              ) : (
                'Create project →'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Theme card ───────────────────────────────────────────
function ThemeCard({
  theme, selected, onClick,
}: { theme: typeof THEMES[0]; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '14px 8px 12px',
        borderRadius: 12,
        background: selected ? 'rgba(215,168,79,0.1)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'rgba(215,168,79,0.35)' : 'rgba(255,255,255,0.07)'}`,
        cursor: 'pointer', textAlign: 'center',
        transition: 'all 0.15s',
        outline: 'none',
      }}
    >
      <div style={{ fontSize: 22, marginBottom: 6 }}>{theme.emoji}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: selected ? '#d7a84f' : '#a5afc0', fontFamily: 'inherit' }}>
        {theme.label}
      </div>
      {selected && (
        <div style={{
          position: 'absolute', top: 5, right: 5,
          width: 16, height: 16, borderRadius: '50%',
          background: '#d7a84f',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check style={{ width: 9, height: 9, color: '#07080d', strokeWidth: 3 }} />
        </div>
      )}
    </button>
  )
}

// ─── Reel card ────────────────────────────────────────────
function ReelCard({
  reel, selected, onClick,
}: { reel: typeof REELSETS[0]; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '14px 10px 12px',
        borderRadius: 12,
        background: selected ? 'rgba(215,168,79,0.1)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'rgba(215,168,79,0.35)' : 'rgba(255,255,255,0.07)'}`,
        cursor: 'pointer', textAlign: 'center',
        transition: 'all 0.15s',
        outline: 'none',
      }}
    >
      {/* Mini grid preview */}
      <ReelGrid cols={Math.min(reel.cols, 5)} rows={Math.min(reel.rows, 4)} selected={selected} />
      <div style={{ fontSize: 12, fontWeight: 700, color: selected ? '#d7a84f' : '#f4efe4', marginTop: 8, fontFamily: 'inherit' }}>
        {reel.label}
      </div>
      <div style={{ fontSize: 10, color: '#7d8799', fontFamily: 'inherit' }}>{reel.sub}</div>
      {selected && (
        <div style={{
          position: 'absolute', top: 5, right: 5,
          width: 16, height: 16, borderRadius: '50%',
          background: '#d7a84f',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check style={{ width: 9, height: 9, color: '#07080d', strokeWidth: 3 }} />
        </div>
      )}
    </button>
  )
}

function ReelGrid({ cols, rows, selected }: { cols: number; rows: number; selected: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
      {Array.from({ length: cols }).map((_, c) => (
        <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} style={{
              width: cols <= 3 ? 10 : cols <= 5 ? 8 : 6,
              height: rows <= 3 ? 10 : rows <= 4 ? 8 : 6,
              borderRadius: 2,
              background: selected ? 'rgba(215,168,79,0.5)' : 'rgba(255,255,255,0.15)',
            }} />
          ))}
        </div>
      ))}
    </div>
  )
}
