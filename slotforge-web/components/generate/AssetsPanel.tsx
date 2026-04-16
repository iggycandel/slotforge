'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Assets Panel (draggable floating overlay)
// Draggable + snap-to-edge (left / right / free)
// Two tabs: ✨ Generated | 📁 Uploads
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { Wand2, Upload, ImageIcon, Download, Loader2, CheckCircle2, XCircle, Plus, X, Minus, GripVertical, ChevronDown } from 'lucide-react'
import type { AssetType, GeneratedAsset } from '@/types/assets'
import { GRAPHIC_STYLES } from '@/lib/ai/styles'
import type { GraphicStyle } from '@/lib/ai/styles'

// ─── Design tokens (shared panel language) ───────────────────────────────────
const T = {
  bg:           '#12121e',
  surface:      '#1a1a2e',
  surfaceHigh:  '#22223a',
  border:       '#2a2a42',
  borderLight:  '#3a3a52',
  gold:         '#c9a84c',
  goldLight:    '#e8c96d',
  textPrimary:  '#e8e6e1',
  textMuted:    '#9090b0',
  textFaint:    '#5a5a7a',
  green:        '#34d399',
  red:          '#f87171',
  font:         "'Space Grotesk', sans-serif",
  fontMono:     "'DM Mono', monospace",
} as const

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
  character:        'char',
  reel_frame:       'reel_frame',
  spin_button:      'spin_button',
  jackpot_label:    'jackpot_label',
} as const
void ASSET_TO_EL_KEY

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
  character:        'Character',
  reel_frame:       'Reel Frame',
  spin_button:      'Spin Button',
  jackpot_label:    'Jackpot Label',
}

const ALL_ASSET_TYPES: AssetType[] = [
  'background_base', 'background_bonus',
  'symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4', 'symbol_high_5',
  'symbol_low_1',  'symbol_low_2',  'symbol_low_3',  'symbol_low_4',  'symbol_low_5',
  'symbol_wild', 'symbol_scatter', 'logo', 'character',
  'reel_frame', 'spin_button', 'jackpot_label',
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenStatus {
  phase:     'idle' | 'running' | 'done' | 'error'
  completed: number
  total:     number
  message?:  string
}

interface UploadedFile {
  name:       string
  url:        string
  created_at: string
}

type Tab       = 'generated' | 'uploads'
type SnapEdge  = 'right' | 'left' | 'free'

interface Props {
  projectId:     string
  onAddToCanvas: (assetType: AssetType, url: string) => void
  toolbarHeight?: number   // px height of the parent toolbar (default: 44)
  /** When true, renders as embedded content (no floating wrapper, no drag/snap) */
  embedded?: boolean
}

// ─── Panel width constant ─────────────────────────────────────────────────────
const PANEL_W = 320

// ─────────────────────────────────────────────────────────────────────────────
// Main: AssetsPanel — floating draggable container
// ─────────────────────────────────────────────────────────────────────────────

export function AssetsPanel({ projectId, onAddToCanvas, toolbarHeight = 44, embedded = false }: Props) {
  const [tab,       setTab]       = useState<Tab>('generated')
  const [minimized, setMinimized] = useState(false)
  const [snap,      setSnap]      = useState<SnapEdge>('right')
  const [pos,       setPos]       = useState({ x: 0, y: toolbarHeight })

  const panelRef   = useRef<HTMLDivElement>(null)
  const dragging   = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // ── Drag logic ──────────────────────────────────────────────────────────────

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return // don't drag when clicking buttons
    dragging.current = true
    const rect = panelRef.current!.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const nx = e.clientX - dragOffset.current.x
      const ny = Math.max(toolbarHeight, e.clientY - dragOffset.current.y)
      setSnap('free')
      setPos({ x: nx, y: ny })
    }

    function onUp(e: MouseEvent) {
      if (!dragging.current) return
      dragging.current = false
      const SNAP_ZONE = 60
      const nx = e.clientX - dragOffset.current.x
      if (nx < SNAP_ZONE) {
        setSnap('left')
      } else if (nx + PANEL_W > window.innerWidth - SNAP_ZONE) {
        setSnap('right')
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [toolbarHeight])

  // ── Compute CSS position ─────────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    position:     'fixed',
    top:          snap === 'free' ? pos.y : toolbarHeight,
    left:         snap === 'left'  ? 0   : snap === 'free' ? pos.x : undefined,
    right:        snap === 'right' ? 0   : undefined,
    width:        PANEL_W,
    height:       minimized ? 'auto' : `calc(100vh - ${snap === 'free' ? pos.y : toolbarHeight}px)`,
    display:      'flex',
    flexDirection:'column',
    background:   T.surface,
    borderLeft:   snap === 'right' ? `1px solid ${T.border}`  : 'none',
    borderRight:  snap === 'left'  ? `1px solid ${T.border}`  : 'none',
    border:       snap === 'free'  ? `1px solid ${T.border}`  : undefined,
    borderRadius: snap === 'free'  ? 10 : 0,
    boxShadow:    snap === 'free'  ? '0 8px 40px rgba(0,0,0,.6)' : '0 0 24px rgba(0,0,0,.4)',
    fontFamily:   T.font,
    zIndex:       400,
    overflow:     'hidden',
    userSelect:   'none',
    transition:   dragging.current ? 'none' : 'right .15s, left .15s, top .15s',
  }

  // ── Snap zone indicators ─────────────────────────────────────────────────────
  // (visual guide while dragging — rendered as siblings in the viewport)

  // ── Embedded mode: render just the tab+content without any floating wrapper ──
  // Uses RightPanel design tokens for visual consistency.
  const EP = {
    bg:          '#0a0a0f',
    surface:     '#13131a',
    surfaceHigh: '#1a1a24',
    border:      'rgba(255,255,255,.06)',
    gold:        '#c9a84c',
    textPrimary: '#eeede6',
    textMuted:   '#7a7a8a',
    textFaint:   '#3e3e4e',
    font:        "'Inter', 'Space Grotesk', sans-serif",
  } as const

  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: EP.bg, fontFamily: EP.font }}>
        {/* Tabs — matches RightPanel tab style */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${EP.border}`, flexShrink: 0, background: EP.surface }}>
          {(['generated', 'uploads'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '7px 8px',
                fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background:   'transparent',
                color:        tab === t ? EP.textPrimary : EP.textFaint,
                borderBottom: tab === t ? `2px solid ${EP.gold}` : '2px solid transparent',
                transition:   'color .12s, border-color .12s',
                fontFamily:   EP.font,
                letterSpacing: '.01em',
              }}
            >
              {t === 'generated' ? '✦ Generated' : '⬆ Uploads'}
            </button>
          ))}
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', background: EP.bg }}>
          {tab === 'generated'
            ? <GeneratedTab projectId={projectId} onAddToCanvas={onAddToCanvas} />
            : <UploadsTab   projectId={projectId} onAddToCanvas={onAddToCanvas} />
          }
        </div>
        <style>{`@keyframes sf-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <>
      <div ref={panelRef} style={panelStyle}>

        {/* ── Header / drag handle ── */}
        <div
          onMouseDown={onHeaderMouseDown}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            6,
            padding:        '0 8px 0 12px',
            height:         40,
            background:     T.surfaceHigh,
            borderBottom:   `1px solid ${T.border}`,
            cursor:         'grab',
            flexShrink:     0,
          }}
        >
          <GripVertical style={{ width: 13, height: 13, color: T.textFaint, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
            Assets
          </span>

          {/* Snap buttons */}
          <button onClick={() => setSnap('left')}  title="Snap left"
            style={snapBtnStyle(snap === 'left')}>◧</button>
          <button onClick={() => setSnap('right')} title="Snap right"
            style={snapBtnStyle(snap === 'right')}>◨</button>

          {/* Minimize */}
          <button
            onClick={() => setMinimized(v => !v)}
            title={minimized ? 'Expand' : 'Minimise'}
            style={iconBtnStyle}
          >
            {minimized
              ? <ChevronDown style={{ width: 13, height: 13 }} />
              : <Minus       style={{ width: 13, height: 13 }} />
            }
          </button>
        </div>

        {!minimized && (
          <>
            {/* ── Tabs ── */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              {(['generated', 'uploads'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1, padding: '7px 8px',
                    fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background:  tab === t ? T.bg : 'transparent',
                    color:       tab === t ? T.textPrimary : T.textFaint,
                    borderBottom: tab === t ? `2px solid ${T.gold}` : '2px solid transparent',
                    transition:  'all .12s',
                    fontFamily:  T.font,
                  }}
                >
                  {t === 'generated' ? '✨ Generated' : '📁 Uploads'}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
              {tab === 'generated'
                ? <GeneratedTab projectId={projectId} onAddToCanvas={onAddToCanvas} />
                : <UploadsTab   projectId={projectId} onAddToCanvas={onAddToCanvas} />
              }
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes sf-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

// ── Tiny button style helpers ──────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: '#6060a0', flexShrink: 0,
}

function snapBtnStyle(active: boolean): React.CSSProperties {
  return {
    ...iconBtnStyle,
    fontSize: 14,
    background: active ? 'rgba(201,168,76,.15)' : 'transparent',
    color:      active ? T.gold : T.textFaint,
    border:     active ? `1px solid rgba(201,168,76,.3)` : '1px solid transparent',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// StylePicker — horizontal scrollable strip of graphic style cards
// ─────────────────────────────────────────────────────────────────────────────

function StylePicker({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const S = {
    wrap: {
      overflowX: 'auto' as const,
      display:   'flex',
      gap:       6,
      paddingBottom: 4,
      scrollbarWidth: 'none' as const,
      msOverflowStyle: 'none' as const,
    },
    card: (style: GraphicStyle, active: boolean): React.CSSProperties => ({
      flexShrink:  0,
      width:       80,
      borderRadius: 8,
      cursor:      'pointer',
      background:  style.cardGradient,
      border:      `2px solid ${active ? style.accentColor : 'transparent'}`,
      boxShadow:   active ? `0 0 10px ${style.accentColor}55, 0 2px 8px rgba(0,0,0,.5)` : '0 2px 8px rgba(0,0,0,.4)',
      padding:     '8px 6px 6px',
      display:     'flex',
      flexDirection: 'column' as const,
      alignItems:  'center',
      gap:         3,
      transition:  'border-color .15s, box-shadow .15s',
      userSelect:  'none' as const,
    }),
    emoji: {
      fontSize: 18,
      lineHeight: '1',
    },
    name: (active: boolean): React.CSSProperties => ({
      fontSize:   9,
      fontWeight: active ? 700 : 600,
      color:      '#fff',
      textAlign:  'center' as const,
      lineHeight: '1.2',
      marginTop:  2,
    }),
    desc: {
      fontSize:  8,
      color:     'rgba(255,255,255,.6)',
      textAlign: 'center' as const,
      lineHeight:'1.2',
    },
    none: (active: boolean): React.CSSProperties => ({
      flexShrink: 0,
      width:      54,
      borderRadius: 8,
      cursor:     'pointer',
      background: active ? 'rgba(201,168,76,.15)' : T.surfaceHigh,
      border:     `2px solid ${active ? 'rgba(201,168,76,.6)' : T.borderLight}`,
      padding:    '8px 4px 6px',
      display:    'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      gap:        3,
      transition: 'border-color .15s',
    }),
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontWeight: 600 }}>
        Art Style
      </div>
      <div style={S.wrap}>
        {/* None / auto option */}
        <div style={S.none(selected === null)} onClick={() => onSelect(null)}>
          <span style={{ fontSize: 16 }}>✦</span>
          <span style={{ ...S.name(selected === null), color: selected === null ? T.gold : T.textMuted }}>Auto</span>
          <span style={S.desc}>Default</span>
        </div>
        {GRAPHIC_STYLES.map(style => {
          const active = selected === style.id
          return (
            <div key={style.id} style={S.card(style, active)} onClick={() => onSelect(active ? null : style.id)}>
              <span style={S.emoji}>{style.emoji}</span>
              <span style={S.name(active)}>{style.name}</span>
              <span style={S.desc}>{style.description}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Generated Tab
// ─────────────────────────────────────────────────────────────────────────────

function GeneratedTab({ projectId, onAddToCanvas }: { projectId: string; onAddToCanvas: (type: AssetType, url: string) => void }) {
  const [theme,          setTheme]          = useState('')
  const [provider,       setProvider]       = useState<'auto' | 'runway' | 'openai'>('auto')
  const [styleId,        setStyleId]        = useState<string | null>(null)
  const [genStatus,      setGenStatus]      = useState<GenStatus>({ phase: 'idle', completed: 0, total: 18 })
  const [assets,         setAssets]         = useState<Partial<Record<AssetType, GeneratedAsset>>>({})
  const [existing,       setExisting]       = useState<GeneratedAsset[]>([])
  const [loadingEx,      setLoadingEx]      = useState(true)
  const [inspectedAsset, setInspectedAsset] = useState<GeneratedAsset | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refreshExisting = useCallback(() => {
    setLoadingEx(true)
    fetch(`/api/generate?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => setExisting(Array.isArray(d.assets) ? d.assets : []))
      .catch(() => setExisting([]))
      .finally(() => setLoadingEx(false))
  }, [projectId])

  useEffect(() => { refreshExisting() }, [refreshExisting])

  const handleGenerate = useCallback(async () => {
    if (!theme.trim() || genStatus.phase === 'running') return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setGenStatus({ phase: 'running', completed: 0, total: 18 })
    setAssets({})

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ theme: theme.trim(), project_id: projectId, provider, ...(styleId ? { style_id: styleId } : {}) }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setGenStatus({ phase: 'error', completed: 0, total: 18, message: err.error })
        return
      }

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n\n')
        buf = lines.pop() ?? ''
        for (const chunk of lines) {
          const ev  = chunk.match(/^event: (\w+)/m)?.[1]
          const raw = chunk.match(/^data: ([\s\S]+)/m)?.[1]
          if (!ev || !raw) continue
          let data: unknown
          try { data = JSON.parse(raw) } catch { continue }

          if (ev === 'start') {
            setGenStatus(s => ({ ...s, total: (data as { total: number }).total }))
          }

          if (ev === 'progress') {
            const d = data as { completed: number; total: number }
            setGenStatus(s => ({ ...s, completed: d.completed, total: d.total }))
          }

          // ── Per-asset streaming event — show tile the moment it's ready ──
          if (ev === 'asset') {
            const a = data as GeneratedAsset
            if (a?.type && a?.url) {
              setAssets(prev => ({ ...prev, [a.type as AssetType]: a }))
              // Prepend to history without duplicates
              setExisting(prev => [a, ...prev.filter(e => e.id !== a.id)])
            }
          }

          if (ev === 'complete') {
            const d = data as {
              success: boolean
              partial?: {
                backgrounds?: { base?: GeneratedAsset; bonus?: GeneratedAsset }
                symbols?: { high?: GeneratedAsset[]; low?: GeneratedAsset[]; wild?: GeneratedAsset; scatter?: GeneratedAsset }
                logo?: GeneratedAsset
              }
              assets?: GeneratedAsset[]
              failed?: Array<{ type: AssetType; error: string }>
            }
            // Merge any assets from 'complete' that weren't already received via 'asset' events
            // (keeps backward compat if the server is still on the old pipeline)
            const mergeAssets: Partial<Record<AssetType, GeneratedAsset>> = {}
            if (d.partial?.backgrounds?.base)  mergeAssets.background_base  = d.partial.backgrounds.base
            if (d.partial?.backgrounds?.bonus) mergeAssets.background_bonus = d.partial.backgrounds.bonus
            d.partial?.symbols?.high?.forEach((a, i) => { if (a) mergeAssets[`symbol_high_${i+1}` as AssetType] = a })
            d.partial?.symbols?.low?.forEach((a,  i) => { if (a) mergeAssets[`symbol_low_${i+1}`  as AssetType] = a })
            if (d.partial?.symbols?.wild)    mergeAssets.symbol_wild    = d.partial.symbols.wild
            if (d.partial?.symbols?.scatter) mergeAssets.symbol_scatter = d.partial.symbols.scatter
            if (d.partial?.logo)             mergeAssets.logo           = d.partial.logo
            if (Array.isArray(d.assets)) {
              d.assets.forEach(a => { if (a?.type && a?.url) mergeAssets[a.type as AssetType] = a })
            }
            // Merge (not replace) — 'asset' events may have already populated most tiles
            setAssets(prev => ({ ...prev, ...mergeAssets }))
            setExisting(prev => {
              const nl = Object.values(mergeAssets).filter(Boolean) as GeneratedAsset[]
              const ids = new Set(nl.map(a => a.id))
              return [...nl, ...prev.filter(e => !ids.has(e.id))]
            })
            const failedCount = d.failed?.length ?? 0
            setGenStatus({
              phase:     'done',
              completed: 18 - failedCount,
              total:     15,
              message:   failedCount > 0 ? `${failedCount} asset(s) failed` : undefined,
            })
          }

          if (ev === 'error') {
            const d = data as { message?: string }
            setGenStatus({ phase: 'error', completed: 0, total: 18, message: d.message })
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setGenStatus({ phase: 'error', completed: 0, total: 18, message: 'Generation failed' })
      }
    }
  }, [theme, provider, styleId, projectId, genStatus.phase])

  async function handleDeleteGenerated(assetId: string) {
    await fetch('/api/generate', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: assetId }) })
    setExisting(prev => prev.filter(a => a.id !== assetId))
    setAssets(prev => {
      const copy = { ...prev }
      for (const [k, v] of Object.entries(copy)) { if ((v as GeneratedAsset).id === assetId) delete copy[k as AssetType] }
      return copy
    })
  }

  function handleRegenerated(newAsset: GeneratedAsset) {
    setAssets(prev => ({ ...prev, [newAsset.type as AssetType]: newAsset }))
    setExisting(prev => [newAsset, ...prev.filter(e => e.id !== newAsset.id && e.type !== newAsset.type)])
    setInspectedAsset(newAsset)
  }

  // If inspector is open, show it as a full-panel overlay
  if (inspectedAsset) {
    return (
      <AssetInspector
        asset={inspectedAsset}
        projectId={projectId}
        theme={theme}
        onClose={() => setInspectedAsset(null)}
        onRegenerated={handleRegenerated}
        onAddToCanvas={onAddToCanvas}
      />
    )
  }

  const progress   = genStatus.total > 0 ? (genStatus.completed / genStatus.total) * 100 : 0
  const assetCount = Object.keys(assets).length

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Generator form */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Batch Generator</div>
        <div style={{ position: 'relative' }}>
          <input
            type="text" value={theme}
            onChange={e => setTheme(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            disabled={genStatus.phase === 'running'}
            placeholder="e.g. Ancient Egypt"
            style={{ ...inputStyle, paddingRight: 34, opacity: genStatus.phase === 'running' ? 0.5 : 1 }}
          />
          <Wand2 style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.textFaint, pointerEvents: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {(['auto', 'openai', 'runway'] as const).map(p => (
            <button key={p} onClick={() => setProvider(p)} style={{
              flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 10, fontWeight: 600,
              border: '1px solid', cursor: 'pointer',
              background:  provider === p ? `rgba(201,168,76,.15)` : T.bg,
              borderColor: provider === p ? `rgba(201,168,76,.5)`  : T.borderLight,
              color:       provider === p ? T.gold : T.textFaint,
              fontFamily:  T.font,
            }}>
              {p === 'auto' ? 'Auto' : p === 'openai' ? 'OpenAI' : 'Runway'}
            </button>
          ))}
        </div>

        <StylePicker selected={styleId} onSelect={setStyleId} />

        <button onClick={handleGenerate} disabled={!theme.trim() || genStatus.phase === 'running'}
          style={{
            ...goldBtnStyle,
            opacity: !theme.trim() || genStatus.phase === 'running' ? 0.5 : 1,
            cursor:  !theme.trim() || genStatus.phase === 'running' ? 'not-allowed' : 'pointer',
          }}
        >
          {genStatus.phase === 'running'
            ? <><Loader2 style={{ width: 13, height: 13, animation: 'sf-spin 1s linear infinite' }} /> Generating…</>
            : <><Wand2   style={{ width: 13, height: 13 }} /> Generate 18 assets</>
          }
        </button>
      </div>

      {/* Progress */}
      {genStatus.phase === 'running' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: T.textMuted }}>Generating…</span>
            <span style={{ fontSize: 10, color: T.gold, fontWeight: 600 }}>{genStatus.completed}/{genStatus.total}</span>
          </div>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.goldLight})`, width: `${progress}%`, transition: 'width .3s ease' }} />
          </div>
        </div>
      )}

      {genStatus.phase === 'done' && (
        <StatusBanner ok={!genStatus.message} message={genStatus.message ?? `${assetCount} assets ready`} />
      )}
      {genStatus.phase === 'error' && (
        <StatusBanner ok={false} message={genStatus.message ?? 'Generation failed'} />
      )}

      {/* Newly generated this session — appears as soon as the first 'asset' event arrives */}
      {assetCount > 0 && (
        <AssetGrid
          label={genStatus.phase === 'running' ? `Generating… (${assetCount}/18)` : 'Just generated'}
          items={Object.entries(assets) as [AssetType, GeneratedAsset][]}
          onAddToCanvas={onAddToCanvas}
          onDelete={a => handleDeleteGenerated((a as GeneratedAsset).id)}
          onInspect={setInspectedAsset}
        />
      )}

      {/* Historical */}
      {loadingEx
        ? <Spinner label="Loading…" />
        : existing.length > 0
          ? <GeneratedHistoryGrid items={existing} onAddToCanvas={onAddToCanvas} onDelete={id => handleDeleteGenerated(id)} onInspect={setInspectedAsset} />
          : genStatus.phase === 'idle'
            ? <EmptyState icon={<ImageIcon />} text="No generated assets yet" sub="Enter a theme and click Generate" />
            : null
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Uploads Tab
// ─────────────────────────────────────────────────────────────────────────────

function UploadsTab({ projectId, onAddToCanvas }: { projectId: string; onAddToCanvas: (type: AssetType, url: string) => void }) {
  const [dragging,   setDragging]   = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [progress,   setProgress]   = useState('')
  const [files,      setFiles]      = useState<UploadedFile[]>([])
  const [loading,    setLoading]    = useState(true)
  const [hovered,    setHovered]    = useState<string | null>(null)
  // Track which file has the canvas picker open + its viewport position
  const [picker,     setPicker]     = useState<{ url: string; rect: DOMRect } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/assets/upload?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : { files: [] })
      .then(d => setFiles(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [projectId])

  // Close picker when clicking outside
  useEffect(() => {
    if (!picker) return
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-picker]')) setPicker(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [picker])

  async function uploadFiles(fileList: File[]) {
    const images = fileList.filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    setUploading(true)
    const uploaded: UploadedFile[] = []
    for (let i = 0; i < images.length; i++) {
      const file = images[i]
      setProgress(`Uploading ${i + 1}/${images.length}…`)
      const form = new FormData()
      form.append('file', file)
      form.append('projectId', projectId)
      form.append('assetKey', file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_'))
      try {
        const res  = await fetch('/api/assets/upload', { method: 'POST', body: form })
        const json = await res.json()
        if (json.url) uploaded.push({ name: file.name, url: json.url, created_at: new Date().toISOString() })
      } catch { /* skip */ }
    }
    setFiles(prev => [...uploaded, ...prev])
    setUploading(false)
    setProgress('')
  }

  async function handleDelete(file: UploadedFile) {
    setFiles(prev => prev.filter(f => f.url !== file.url))
    const fileName = file.url.split('/').pop() ?? file.name
    await fetch('/api/assets/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, file_name: fileName }),
    })
  }

  function openPicker(e: React.MouseEvent, url: string) {
    e.stopPropagation()
    const btn = e.currentTarget as HTMLElement
    const rect = btn.getBoundingClientRect()
    setPicker(prev => prev?.url === url ? null : { url, rect })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); uploadFiles(Array.from(e.dataTransfer.files)) }}
        style={{
          border: `2px dashed ${dragging ? T.gold : T.borderLight}`,
          borderRadius: 10, padding: '18px 16px', textAlign: 'center',
          background: dragging ? `rgba(201,168,76,.06)` : T.surface,
          transition: 'all .15s', cursor: 'pointer',
        }}
      >
        <Upload style={{ width: 18, height: 18, margin: '0 auto 6px', display: 'block', color: dragging ? T.gold : T.textFaint }} />
        {uploading
          ? <p style={{ fontSize: 11, color: T.gold, margin: 0 }}>{progress}</p>
          : <>
              <p style={{ fontSize: 11, color: T.textMuted, margin: '0 0 2px', fontWeight: 600 }}>Click or drop images</p>
              <p style={{ fontSize: 10, color: T.textFaint, margin: 0 }}>PNG · JPG · WebP</p>
            </>
        }
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={e => { if (e.target.files) uploadFiles(Array.from(e.target.files)); e.target.value = '' }} style={{ display: 'none' }} />
      </div>

      {/* Files grid */}
      {loading
        ? <Spinner label="Loading uploads…" />
        : files.length === 0
          ? <EmptyState icon={<ImageIcon />} text="No uploads yet" sub="Drop images above" />
          : (
            <div style={{ ...cardStyle, padding: 0, overflow: 'visible' }}>
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Uploads ({files.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: 8 }}>
                {files.map(f => (
                  <UploadThumb
                    key={f.url}
                    file={f}
                    isHovered={hovered === f.url}
                    onHover={v => setHovered(v ? f.url : null)}
                    onDelete={handleDelete}
                    onOpenPicker={openPicker}
                  />
                ))}
              </div>
            </div>
          )
      }

      {/* Fixed-position canvas picker — rendered at viewport level to escape any clipping */}
      {picker && (
        <FixedPicker
          fileUrl={picker.url}
          triggerRect={picker.rect}
          onSelect={(type, url) => { onAddToCanvas(type, url); setPicker(null); setHovered(null) }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

// ─── Upload thumbnail ─────────────────────────────────────────────────────────

function UploadThumb({ file, isHovered, onHover, onDelete, onOpenPicker }: {
  file: UploadedFile
  isHovered: boolean
  onHover: (v: boolean) => void
  onDelete: (f: UploadedFile) => void
  onOpenPicker: (e: React.MouseEvent, url: string) => void
}) {
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ position: 'relative', aspectRatio: '1', borderRadius: 7, background: T.bg, border: `1px solid ${T.border}`, overflow: 'hidden' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={file.url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '3px 4px', background: 'linear-gradient(transparent, rgba(0,0,0,.85))', fontSize: 8, color: T.textPrimary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.name}
      </div>
      {isHovered && (
        <>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <button data-picker onClick={e => onOpenPicker(e, file.url)}
              style={{ ...goldBtnStyle, padding: '4px 8px', fontSize: 10 }}>
              <Plus style={{ width: 10, height: 10 }} /> Canvas
            </button>
            <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 5, fontSize: 10, color: T.textMuted, background: T.surface, border: `1px solid ${T.borderLight}`, textDecoration: 'none', cursor: 'pointer' }}>
              <Download style={{ width: 10, height: 10 }} /> PNG
            </a>
          </div>
          {/* Delete button */}
          <button
            onClick={e => { e.stopPropagation(); onDelete(file) }}
            title="Delete"
            style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 4, background: 'rgba(248,113,113,.2)', border: `1px solid rgba(248,113,113,.4)`, color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X style={{ width: 10, height: 10 }} />
          </button>
        </>
      )}
    </div>
  )
}

// ─── Fixed-position canvas type picker ───────────────────────────────────────
// Uses viewport coordinates to escape any overflow:hidden ancestor

function FixedPicker({ fileUrl, triggerRect, onSelect, onClose }: {
  fileUrl:     string
  triggerRect: DOMRect
  onSelect:    (type: AssetType, url: string) => void
  onClose:     () => void
}) {
  const PICKER_W = 150
  const PICKER_H = 320 // approximate max height

  // Position: prefer below the trigger; flip above if it would go off screen
  let top  = triggerRect.bottom + 4
  let left = triggerRect.right - PICKER_W
  if (top + PICKER_H > window.innerHeight - 8) top = triggerRect.top - PICKER_H - 4
  if (left < 8) left = 8

  return (
    <div
      data-picker
      style={{
        position: 'fixed', top, left, width: PICKER_W, zIndex: 9999,
        background: T.surface, border: `1px solid ${T.borderLight}`,
        borderRadius: 10, padding: 6, boxShadow: '0 12px 40px rgba(0,0,0,.7)',
        display: 'flex', flexDirection: 'column', gap: 2,
        maxHeight: PICKER_H, overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px 6px' }}>
        <span style={{ fontSize: 9, color: T.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Use as…
        </span>
        <button onClick={onClose} style={{ ...iconBtnStyle, width: 18, height: 18 }}>
          <X style={{ width: 10, height: 10 }} />
        </button>
      </div>
      {ALL_ASSET_TYPES.map(t => (
        <button key={t}
          onClick={() => onSelect(t, fileUrl)}
          style={{ padding: '5px 8px', borderRadius: 6, fontSize: 11, color: T.textPrimary, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: T.font }}
          onMouseEnter={e => (e.currentTarget.style.background = T.surfaceHigh)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {ASSET_LABELS[t] ?? t}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset grids for generated assets
// ─────────────────────────────────────────────────────────────────────────────

function AssetGrid({ label, items, onAddToCanvas, onDelete, onInspect }: {
  label:         string
  items:         [AssetType, GeneratedAsset][]
  onAddToCanvas: (type: AssetType, url: string) => void
  onDelete:      (asset: GeneratedAsset) => void
  onInspect?:    (asset: GeneratedAsset) => void
}) {
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {items.map(([type, asset]) => (
          <GeneratedThumb key={`${type}-${asset.id}`} type={type} asset={asset} onAddToCanvas={onAddToCanvas} onDelete={onDelete} onInspect={onInspect} />
        ))}
      </div>
    </div>
  )
}

function GeneratedHistoryGrid({ items, onAddToCanvas, onDelete, onInspect }: {
  items:         GeneratedAsset[]
  onAddToCanvas: (type: AssetType, url: string) => void
  onDelete:      (id: string) => void
  onInspect?:    (asset: GeneratedAsset) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, 9)
  return (
    <div style={cardStyle}>
      <div style={{ ...cardTitleStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>All generated ({items.length})</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {shown.map(asset => (
          <GeneratedThumb
            key={asset.id}
            type={asset.type as AssetType}
            asset={asset}
            onAddToCanvas={onAddToCanvas}
            onDelete={a => onDelete((a as GeneratedAsset).id)}
            onInspect={onInspect}
          />
        ))}
      </div>
      {items.length > 9 && (
        <button onClick={() => setExpanded(v => !v)}
          style={{ width: '100%', padding: '8px 0', fontSize: 11, color: T.textMuted, background: 'transparent', border: 'none', borderTop: `1px solid ${T.border}`, cursor: 'pointer', marginTop: 4, fontFamily: T.font }}>
          {expanded ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

// ─── Single generated asset thumbnail ─────────────────────────────────────────

function GeneratedThumb({ type, asset, onAddToCanvas, onDelete, onInspect }: {
  type:          AssetType
  asset:         GeneratedAsset
  onAddToCanvas: (type: AssetType, url: string) => void
  onDelete:      (asset: GeneratedAsset) => void
  onInspect?:    (asset: GeneratedAsset) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', aspectRatio: '1', borderRadius: 7, overflow: 'hidden', background: T.bg, border: `1px solid ${T.border}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt={ASSET_LABELS[type] ?? type} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '3px 4px', background: 'linear-gradient(transparent, rgba(0,0,0,.8))', fontSize: 9, color: T.textPrimary, fontWeight: 600 }}>
        {ASSET_LABELS[type] ?? type}
      </div>
      {hover && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <button onClick={() => onAddToCanvas(type, asset.url)}
            style={{ ...goldBtnStyle, padding: '4px 8px', fontSize: 10 }}>
            <Plus style={{ width: 10, height: 10 }} /> Canvas
          </button>
          {onInspect && (
            <button onClick={() => onInspect(asset)}
              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 5, fontSize: 10, color: T.textPrimary, background: T.surfaceHigh, border: `1px solid ${T.borderLight}`, cursor: 'pointer' }}>
              <ImageIcon style={{ width: 10, height: 10 }} /> Inspect
            </button>
          )}
          <a href={asset.url} download={`${type}.png`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 5, fontSize: 10, color: T.textMuted, background: T.surface, border: `1px solid ${T.borderLight}`, textDecoration: 'none' }}>
            <Download style={{ width: 10, height: 10 }} /> PNG
          </a>
          <button onClick={() => onDelete(asset)}
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 5, fontSize: 10, color: T.red, background: 'rgba(248,113,113,.1)', border: `1px solid rgba(248,113,113,.25)`, cursor: 'pointer' }}>
            <X style={{ width: 10, height: 10 }} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Inspector — slide-in drawer showing metadata, prompt editor, regen
// ─────────────────────────────────────────────────────────────────────────────

type InspectorTab = 'info' | 'prompt'

function AssetInspector({ asset, projectId, theme, onClose, onRegenerated, onAddToCanvas }: {
  asset:         GeneratedAsset
  projectId:     string
  theme:         string
  onClose:       () => void
  onRegenerated: (newAsset: GeneratedAsset) => void
  onAddToCanvas: (type: AssetType, url: string) => void
}) {
  const [tab,         setTab]         = useState<InspectorTab>('info')
  const [customPrompt,setCustomPrompt]= useState(asset.prompt || '')
  const [regenState,  setRegenState]  = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [regenError,  setRegenError]  = useState('')

  async function handleRegen(useCustomPrompt = false) {
    setRegenState('loading')
    setRegenError('')
    try {
      const body: Record<string, string> = {
        asset_type: asset.type,
        theme:      theme || asset.theme || 'slot game',
        project_id: projectId,
      }
      if (useCustomPrompt && customPrompt.trim()) {
        body.custom_prompt = customPrompt.trim()
      }
      const res  = await fetch('/api/ai-single', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRegenState('done')
      onRegenerated(data.asset as GeneratedAsset)
      setTimeout(() => setRegenState('idle'), 2000)
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : 'Regeneration failed')
      setRegenState('error')
    }
  }

  const type = asset.type as AssetType

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg }}>
      {/* Inspector header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={onClose} title="Back"
          style={{ ...iconBtnStyle, color: T.textMuted }}>
          ←
        </button>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textPrimary, flex: 1 }}>
          {ASSET_LABELS[type] ?? type}
        </span>
        <span style={{ fontSize: 9, color: T.textFaint, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 5px', fontWeight: 600, textTransform: 'uppercase' }}>
          {asset.provider}
        </span>
      </div>

      {/* Large thumbnail */}
      <div style={{ flexShrink: 0, padding: '10px 12px 0' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={type} style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 8, background: `repeating-conic-gradient(${T.surface} 0% 25%, ${T.surfaceHigh} 0% 50%) 0 0 / 12px 12px` }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0, marginTop: 8 }}>
        {(['info', 'prompt'] as InspectorTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 600,
            border: 'none', cursor: 'pointer', background: 'transparent',
            color: tab === t ? T.textPrimary : T.textFaint,
            borderBottom: tab === t ? `2px solid ${T.gold}` : '2px solid transparent',
            fontFamily: T.font,
          }}>
            {t === 'info' ? '◎ Inspector' : '✎ Prompt'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>

        {tab === 'info' && (
          <>
            {/* Metadata table */}
            <div style={{ ...cardStyle, gap: 0 }}>
              {[
                ['Type',     ASSET_LABELS[type] ?? type],
                ['Provider', asset.provider],
                ['Theme',    asset.theme || '—'],
                ['Created',  new Date(asset.created_at).toLocaleDateString()],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 10, color: T.textFaint, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 10, color: T.textPrimary, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <button onClick={() => onAddToCanvas(type, asset.url)} style={goldBtnStyle}>
              <Plus style={{ width: 11, height: 11 }} /> Add to Canvas
            </button>
            <button onClick={() => handleRegen(false)} disabled={regenState === 'loading'}
              style={{ ...goldBtnStyle, background: T.surfaceHigh, color: T.textMuted, border: `1px solid ${T.borderLight}`, opacity: regenState === 'loading' ? 0.6 : 1 }}>
              {regenState === 'loading'
                ? <><Loader2 style={{ width: 11, height: 11, animation: 'sf-spin 1s linear infinite' }} /> Regenerating…</>
                : regenState === 'done'
                ? <><CheckCircle2 style={{ width: 11, height: 11, color: T.green }} /> Done!</>
                : <><Wand2 style={{ width: 11, height: 11 }} /> Regenerate</>
              }
            </button>
            {regenState === 'error' && <StatusBanner ok={false} message={regenError} />}

            <a href={asset.url} download={`${type}.png`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700, color: T.textMuted, background: T.surface, border: `1px solid ${T.borderLight}`, textDecoration: 'none', fontFamily: T.font }}>
              <Download style={{ width: 11, height: 11 }} /> Download PNG
            </a>
          </>
        )}

        {tab === 'prompt' && (
          <>
            <div style={{ fontSize: 10, color: T.textFaint, lineHeight: 1.5 }}>
              Edit the prompt below, then click "Regenerate with prompt" to use it.
            </div>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              rows={8}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5', fontSize: 11 }}
              placeholder="Describe the asset you want to generate…"
            />
            <div style={{ fontSize: 9, color: T.textFaint, lineHeight: 1.4 }}>
              Note: Platform quality requirements are always appended server-side. Write only the creative brief here.
            </div>
            <button
              onClick={() => handleRegen(true)}
              disabled={regenState === 'loading' || !customPrompt.trim()}
              style={{ ...goldBtnStyle, opacity: regenState === 'loading' || !customPrompt.trim() ? 0.5 : 1, cursor: regenState === 'loading' || !customPrompt.trim() ? 'not-allowed' : 'pointer' }}>
              {regenState === 'loading'
                ? <><Loader2 style={{ width: 11, height: 11, animation: 'sf-spin 1s linear infinite' }} /> Regenerating…</>
                : regenState === 'done'
                ? <><CheckCircle2 style={{ width: 11, height: 11, color: T.green }} /> Done!</>
                : <><Wand2 style={{ width: 11, height: 11 }} /> Regenerate with prompt</>
              }
            </button>
            {regenState === 'error' && <StatusBanner ok={false} message={regenError} />}
          </>
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI micro-components
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 12, color: T.textFaint, fontSize: 11 }}>
      <Loader2 style={{ width: 12, height: 12, animation: 'sf-spin 1s linear infinite', flexShrink: 0 }} />
      {label}
    </div>
  )
}

function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 16px', color: T.textFaint }}>
      <div style={{ width: 28, height: 28, margin: '0 auto 8px', opacity: 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <p style={{ fontSize: 11, margin: 0, color: T.textMuted }}>{text}</p>
      {sub && <p style={{ fontSize: 10, margin: '4px 0 0', opacity: 0.6 }}>{sub}</p>}
    </div>
  )
}

function StatusBanner({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: ok ? 'rgba(52,211,153,.08)' : 'rgba(251,113,133,.08)', border: `1px solid ${ok ? 'rgba(52,211,153,.2)' : 'rgba(251,113,133,.2)'}` }}>
      {ok
        ? <CheckCircle2 style={{ width: 13, height: 13, color: T.green, flexShrink: 0 }} />
        : <XCircle      style={{ width: 13, height: 13, color: T.red,   flexShrink: 0 }} />
      }
      <span style={{ fontSize: 11, color: ok ? T.green : T.red }}>{message}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style objects
// ─────────────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background:   T.surface,
  border:       `1px solid ${T.border}`,
  borderRadius: 10,
  padding:      12,
  display:      'flex',
  flexDirection:'column',
  gap:          8,
}

const cardTitleStyle: React.CSSProperties = {
  fontSize:      10,
  fontWeight:    700,
  color:         T.textFaint,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const inputStyle: React.CSSProperties = {
  width:       '100%',
  padding:     '7px 10px',
  borderRadius: 7,
  fontSize:     12,
  background:  T.bg,
  border:      `1px solid ${T.borderLight}`,
  color:       T.textPrimary,
  outline:     'none',
  boxSizing:   'border-box',
  fontFamily:  T.font,
}

const goldBtnStyle: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  gap:            5,
  padding:        '7px 0',
  borderRadius:   7,
  fontSize:       12,
  fontWeight:     700,
  border:         'none',
  background:     `linear-gradient(135deg, ${T.gold}, ${T.goldLight})`,
  color:          '#1a1200',
  cursor:         'pointer',
  fontFamily:     T.font,
  width:          '100%',
}
