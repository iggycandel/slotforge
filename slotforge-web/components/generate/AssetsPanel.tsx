'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Assets Panel (sidebar edition)
// Two-tab panel: Uploads | Generated
// Lives in the 320 px side-panel of EditorFrame
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { Wand2, Upload, ImageIcon, Download, Loader2, CheckCircle2, XCircle, Plus } from 'lucide-react'
import type { AssetType, GeneratedAsset } from '@/types/assets'

// ─── AssetType → EL_ASSETS key mapping ───────────────────────────────────────

const ASSET_TO_EL_KEY: Partial<Record<AssetType, string>> = {
  background_base:  'bg',
  background_bonus: 'bg_bonus',
  symbol_high_1:    'sym_H1',
  symbol_high_2:    'sym_H2',
  symbol_high_3:    'sym_H3',
  symbol_high_4:    'sym_H4',
  symbol_high_5:    'sym_H5',
  symbol_low_1:     'sym_L1',
  symbol_low_2:     'sym_L2',
  symbol_low_3:     'sym_L3',
  symbol_low_4:     'sym_L4',
  symbol_low_5:     'sym_L5',
  symbol_wild:      'sym_Wild',
  symbol_scatter:   'sym_Scatter',
  logo:             'logo',
}

const ASSET_LABELS: Partial<Record<AssetType, string>> = {
  background_base:  'BG Base',
  background_bonus: 'BG Bonus',
  symbol_high_1:    'High 1',
  symbol_high_2:    'High 2',
  symbol_high_3:    'High 3',
  symbol_high_4:    'High 4',
  symbol_high_5:    'High 5',
  symbol_low_1:     'Low 1',
  symbol_low_2:     'Low 2',
  symbol_low_3:     'Low 3',
  symbol_low_4:     'Low 4',
  symbol_low_5:     'Low 5',
  symbol_wild:      'Wild',
  symbol_scatter:   'Scatter',
  logo:             'Logo',
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

interface GenStatus {
  phase:     'idle' | 'running' | 'done' | 'error'
  completed: number
  total:     number
  message?:  string
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId:     string
  onAddToCanvas: (assetType: AssetType, url: string) => void
}

// ─── Tiny Tabs ────────────────────────────────────────────────────────────────

type Tab = 'generated' | 'uploads'

// ─── Component ────────────────────────────────────────────────────────────────

export function AssetsPanel({ projectId, onAddToCanvas }: Props) {
  const [tab, setTab] = useState<Tab>('generated')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "'Space Grotesk', sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ padding: '12px 16px 0', borderBottom: '1px solid #2a2a3e', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9090b0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Assets
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['generated', 'uploads'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: '6px 6px 0 0',
                fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tab === t ? '#0e0e1a' : 'transparent',
                color: tab === t ? '#e8e6e1' : '#6060a0',
                borderBottom: tab === t ? '2px solid #c9a84c' : '2px solid transparent',
                transition: 'all .15s',
                textTransform: 'capitalize',
              }}
            >
              {t === 'generated' ? '✨ Generated' : '📁 Uploads'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#0e0e1a' }}>
        {tab === 'generated' && (
          <GeneratedTab projectId={projectId} onAddToCanvas={onAddToCanvas} />
        )}
        {tab === 'uploads' && (
          <UploadsTab projectId={projectId} />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Generated Tab
// ─────────────────────────────────────────────────────────────────────────────

function GeneratedTab({ projectId, onAddToCanvas }: Props) {
  const [theme,       setTheme]       = useState('')
  const [provider,    setProvider]    = useState<'auto' | 'runway' | 'openai'>('auto')
  const [genStatus,   setGenStatus]   = useState<GenStatus>({ phase: 'idle', completed: 0, total: 15 })
  const [assets,      setAssets]      = useState<Partial<Record<AssetType, GeneratedAsset>>>({})
  const [existing,    setExisting]    = useState<GeneratedAsset[]>([])
  const [loadingExisting, setLoadingExisting] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  // Load existing generated assets on mount
  useEffect(() => {
    setLoadingExisting(true)
    fetch(`/api/generate?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => { setExisting(Array.isArray(d.assets) ? d.assets : []) })
      .catch(() => setExisting([]))
      .finally(() => setLoadingExisting(false))
  }, [projectId])

  const handleGenerate = useCallback(async () => {
    if (!theme.trim() || genStatus.phase === 'running') return

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setGenStatus({ phase: 'running', completed: 0, total: 15 })
    setAssets({})

    try {
      const res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ theme: theme.trim(), project_id: projectId, provider }),
        signal:  ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setGenStatus({ phase: 'error', completed: 0, total: 15, message: err.error })
        return
      }

      const reader = res.body!.getReader()
      const dec    = new TextDecoder()
      let buffer   = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += dec.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const chunk of lines) {
          const eventMatch = chunk.match(/^event: (\w+)/m)
          const dataMatch  = chunk.match(/^data: ([\s\S]+)/m)
          if (!eventMatch || !dataMatch) continue

          const event = eventMatch[1]
          const data  = JSON.parse(dataMatch[1])

          if (event === 'start') {
            setGenStatus(s => ({ ...s, total: data.total }))
          } else if (event === 'progress') {
            setGenStatus(s => ({ ...s, completed: data.completed, total: data.total }))
          } else if (event === 'complete') {
            // Flatten partial result → assets map
            const newAssets: Partial<Record<AssetType, GeneratedAsset>> = {}
            if (data.partial?.backgrounds) {
              newAssets.background_base  = data.partial.backgrounds.base
              newAssets.background_bonus = data.partial.backgrounds.bonus
            }
            if (data.partial?.symbols) {
              data.partial.symbols.high.forEach((a: GeneratedAsset, i: number) => {
                newAssets[`symbol_high_${i+1}` as AssetType] = a
              })
              data.partial.symbols.low.forEach((a: GeneratedAsset, i: number) => {
                newAssets[`symbol_low_${i+1}` as AssetType] = a
              })
              newAssets.symbol_wild    = data.partial.symbols.wild
              newAssets.symbol_scatter = data.partial.symbols.scatter
            }
            if (data.partial?.logo) newAssets.logo = data.partial.logo

            setAssets(newAssets)
            setExisting(prev => {
              const newList = Object.values(newAssets).filter(Boolean) as GeneratedAsset[]
              return [...newList, ...prev]
            })
            setGenStatus({
              phase:     'done',
              completed: data.failed?.length === 0 ? 15 : 15 - data.failed.length,
              total:     15,
              message:   data.failed?.length > 0 ? `${data.failed.length} failed` : undefined,
            })
          } else if (event === 'error') {
            setGenStatus({ phase: 'error', completed: 0, total: 15, message: data.message })
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setGenStatus({ phase: 'error', completed: 0, total: 15, message: 'Generation failed' })
      }
    }
  }, [theme, provider, projectId, genStatus.phase])

  const assetCount = Object.keys(assets).length
  const progress   = genStatus.total > 0 ? (genStatus.completed / genStatus.total) * 100 : 0

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Generator form ── */}
      <div style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Batch Generator
        </div>

        {/* Theme input — no placeholder */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={theme}
            onChange={e => setTheme(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            disabled={genStatus.phase === 'running'}
            style={{
              width: '100%', padding: '7px 34px 7px 10px',
              borderRadius: 7, fontSize: 12,
              background: '#0e0e1a', border: '1px solid #3a3a52',
              color: '#e8e6e1', outline: 'none', boxSizing: 'border-box',
              opacity: genStatus.phase === 'running' ? 0.5 : 1,
            }}
          />
          <Wand2 style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#6060a0', pointerEvents: 'none' }} />
        </div>

        {/* Provider selector (compact) */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['auto', 'runway', 'openai'] as const).map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 10, fontWeight: 600,
                border: '1px solid', cursor: 'pointer',
                background:   provider === p ? 'rgba(201,168,76,.15)' : '#0e0e1a',
                borderColor:  provider === p ? 'rgba(201,168,76,.5)' : '#3a3a52',
                color:        provider === p ? '#c9a84c' : '#6060a0',
              }}
            >
              {p === 'auto' ? 'Auto' : p === 'runway' ? 'Runway' : 'OpenAI'}
            </button>
          ))}
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!theme.trim() || genStatus.phase === 'running'}
          style={{
            padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
            border: 'none', cursor: !theme.trim() || genStatus.phase === 'running' ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #c9a84c, #e8c96d)',
            color: '#1a1200',
            opacity: !theme.trim() || genStatus.phase === 'running' ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {genStatus.phase === 'running' ? (
            <>
              <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
              Generating…
            </>
          ) : (
            <>
              <Wand2 style={{ width: 13, height: 13 }} />
              Generate 15 assets
            </>
          )}
        </button>
      </div>

      {/* ── Progress bar ── */}
      {genStatus.phase === 'running' && (
        <div style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#9090b0' }}>Generating assets…</span>
            <span style={{ fontSize: 10, color: '#c9a84c', fontWeight: 600 }}>{genStatus.completed}/{genStatus.total}</span>
          </div>
          <div style={{ height: 4, background: '#2a2a3e', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #c9a84c, #e8c96d)', width: `${progress}%`, transition: 'width .3s ease' }} />
          </div>
        </div>
      )}

      {genStatus.phase === 'done' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: genStatus.message ? 'rgba(251,113,133,.08)' : 'rgba(52,211,153,.08)', border: `1px solid ${genStatus.message ? 'rgba(251,113,133,.2)' : 'rgba(52,211,153,.2)'}` }}>
          {genStatus.message
            ? <XCircle style={{ width: 13, height: 13, color: '#f87171', flexShrink: 0 }} />
            : <CheckCircle2 style={{ width: 13, height: 13, color: '#34d399', flexShrink: 0 }} />
          }
          <span style={{ fontSize: 11, color: genStatus.message ? '#f87171' : '#34d399' }}>
            {genStatus.message ?? `${assetCount} assets generated`}
          </span>
        </div>
      )}

      {genStatus.phase === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(251,113,133,.08)', border: '1px solid rgba(251,113,133,.2)' }}>
          <XCircle style={{ width: 13, height: 13, color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#f87171' }}>{genStatus.message ?? 'Error'}</span>
        </div>
      )}

      {/* ── Newly generated (this session) ── */}
      {assetCount > 0 && (
        <AssetThumbList
          label="Just generated"
          items={Object.entries(assets) as [AssetType, GeneratedAsset][]}
          onAddToCanvas={onAddToCanvas}
        />
      )}

      {/* ── Previously generated ── */}
      {loadingExisting ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 12, color: '#6060a0', fontSize: 11 }}>
          <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
          Loading…
        </div>
      ) : existing.length > 0 ? (
        <AssetHistoryList items={existing} onAddToCanvas={onAddToCanvas} />
      ) : genStatus.phase === 'idle' ? (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: '#6060a0' }}>
          <ImageIcon style={{ width: 28, height: 28, margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
          <p style={{ fontSize: 11, margin: 0 }}>No generated assets yet</p>
          <p style={{ fontSize: 10, margin: '4px 0 0', opacity: 0.6 }}>Enter a theme above and hit Generate</p>
        </div>
      ) : null}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset thumbnail list — session-fresh assets
// ─────────────────────────────────────────────────────────────────────────────

interface ThumbListProps {
  label:         string
  items:         [AssetType, GeneratedAsset][]
  onAddToCanvas: (type: AssetType, url: string) => void
}

function AssetThumbList({ label, items, onAddToCanvas }: ThumbListProps) {
  return (
    <div style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a3e', fontSize: 10, fontWeight: 700, color: '#6060a0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: 8 }}>
        {items.map(([type, asset]) => (
          <AssetThumb key={type} type={type} asset={asset} onAddToCanvas={onAddToCanvas} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset history list — previously generated assets
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryListProps {
  items:         GeneratedAsset[]
  onAddToCanvas: (type: AssetType, url: string) => void
}

function AssetHistoryList({ items, onAddToCanvas }: HistoryListProps) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, 9)

  return (
    <div style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          All generated ({items.length})
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: 8 }}>
        {shown.map(asset => (
          <AssetThumb
            key={asset.id}
            type={asset.type as AssetType}
            asset={asset}
            onAddToCanvas={onAddToCanvas}
          />
        ))}
      </div>
      {items.length > 9 && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ width: '100%', padding: '8px 0', fontSize: 11, color: '#6060a0', background: 'transparent', border: 'none', borderTop: '1px solid #2a2a3e', cursor: 'pointer' }}
        >
          {expanded ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Single asset thumbnail
// ─────────────────────────────────────────────────────────────────────────────

interface ThumbProps {
  type:          AssetType
  asset:         GeneratedAsset
  onAddToCanvas: (type: AssetType, url: string) => void
}

function AssetThumb({ type, asset, onAddToCanvas }: ThumbProps) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', aspectRatio: '1', borderRadius: 7, overflow: 'hidden', background: '#0e0e1a', border: '1px solid #2a2a3e', cursor: 'pointer' }}
    >
      {/* Thumbnail image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.url}
        alt={ASSET_LABELS[type] ?? type}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

      {/* Label */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '3px 4px', background: 'linear-gradient(transparent, rgba(0,0,0,.8))', fontSize: 9, color: '#e8e6e1', fontWeight: 600 }}>
        {ASSET_LABELS[type] ?? type}
      </div>

      {/* Hover overlay */}
      {hover && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <button
            onClick={() => onAddToCanvas(type, asset.url)}
            title="Add to canvas"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'linear-gradient(135deg, #c9a84c, #e8c96d)', color: '#1a1200', border: 'none', cursor: 'pointer' }}
          >
            <Plus style={{ width: 10, height: 10 }} />
            Canvas
          </button>
          <a
            href={asset.url}
            download={`${type}.png`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 5, fontSize: 10, color: '#9090b0', background: '#1a1a2e', border: '1px solid #3a3a52', cursor: 'pointer', textDecoration: 'none' }}
          >
            <Download style={{ width: 10, height: 10 }} />
            PNG
          </a>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Uploads Tab
// ─────────────────────────────────────────────────────────────────────────────

function UploadsTab({ projectId }: { projectId: string }) {
  // This tab will use the same SF_UPLOAD_ASSET bridge as the editor
  // For now, surface a drag-drop upload area
  const [dragging, setDragging] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    // Delegate to the editor's file picker by sending a message
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    window.parent?.postMessage({ type: 'SF_PANEL_UPLOAD', files, projectId }, '*')
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? '#c9a84c' : '#3a3a52'}`,
          borderRadius: 10, padding: '28px 16px', textAlign: 'center',
          background: dragging ? 'rgba(201,168,76,.06)' : '#1a1a2e',
          transition: 'all .15s', cursor: 'default',
        }}
      >
        <Upload style={{ width: 22, height: 22, margin: '0 auto 8px', display: 'block', color: dragging ? '#c9a84c' : '#6060a0' }} />
        <p style={{ fontSize: 11, color: '#9090b0', margin: '0 0 4px' }}>Drag &amp; drop images here</p>
        <p style={{ fontSize: 10, color: '#6060a0', margin: 0 }}>or use the asset slots in the canvas directly</p>
      </div>

      <div style={{ padding: '10px 12px', borderRadius: 8, background: '#1a1a2e', border: '1px solid #2a2a3e' }}>
        <p style={{ fontSize: 11, color: '#6060a0', margin: 0, lineHeight: 1.6 }}>
          You can upload custom assets by clicking any symbol or background slot directly on the canvas. Uploaded files are stored per project.
        </p>
      </div>
    </div>
  )
}
