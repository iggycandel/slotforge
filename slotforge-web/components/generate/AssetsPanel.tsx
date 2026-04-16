'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Canvas Asset List Panel (floating overlay or embedded)
//
// Read-only view of assets generated in the ASSETS workspace.
// Users can drag any asset onto the canvas or use the Add/Replace buttons.
// Generation is NOT done here — it lives at /assets workspace.
//
// Behaviour: draggable floating panel, snaps to left / right edge.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ImageIcon, CheckCircle2, Plus,
  Minus, GripVertical, ChevronDown, ExternalLink, RefreshCw,
} from 'lucide-react'
import type { AssetType, GeneratedAsset } from '@/types/assets'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:          '#0a0a0f',
  surface:     '#13131a',
  surfaceHigh: '#1a1a24',
  border:      'rgba(255,255,255,.07)',
  gold:        '#c9a84c',
  goldBg:      'rgba(201,168,76,.08)',
  textPrimary: '#eeede6',
  textMuted:   '#7a7a8a',
  textFaint:   '#3e3e4e',
  green:       '#34d399',
  font:        "'Inter','Space Grotesk',sans-serif",
} as const

// ─── Asset display labels ─────────────────────────────────────────────────────
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
  spin_button:      'Spin Btn',
  jackpot_label:    'Jackpot',
}

// Group asset types for cleaner list display
const DISPLAY_GROUPS: { label: string; types: AssetType[] }[] = [
  { label: 'Backgrounds',     types: ['background_base', 'background_bonus'] },
  { label: 'High Symbols',    types: ['symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4', 'symbol_high_5'] },
  { label: 'Low Symbols',     types: ['symbol_low_1', 'symbol_low_2', 'symbol_low_3', 'symbol_low_4', 'symbol_low_5'] },
  { label: 'Special Symbols', types: ['symbol_wild', 'symbol_scatter'] },
  { label: 'UI & Chrome',     types: ['logo', 'character', 'reel_frame', 'spin_button', 'jackpot_label'] },
]

type SnapEdge = 'right' | 'left' | 'free'

const PANEL_W = 280

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId:      string
  orgSlug:        string
  onAddToCanvas:  (assetType: AssetType, url: string) => void
  toolbarHeight?: number
  embedded?:      boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AssetsPanel({
  projectId, orgSlug, onAddToCanvas, toolbarHeight = 44, embedded = false,
}: Props) {
  const [minimized, setMinimized] = useState(false)
  const [snap,      setSnap]      = useState<SnapEdge>('right')
  const [pos,       setPos]       = useState({ x: 0, y: toolbarHeight })

  const panelRef   = useRef<HTMLDivElement>(null)
  const dragging   = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // ─── Drag logic ─────────────────────────────────────────────────────────────

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,a')) return
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
      const nx = e.clientX - dragOffset.current.x
      if (nx < 60) setSnap('left')
      else if (nx + PANEL_W > window.innerWidth - 60) setSnap('right')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [toolbarHeight])

  // ─── Panel position style ────────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    position:      'fixed',
    top:           snap === 'free' ? pos.y : toolbarHeight,
    left:          snap === 'left'  ? 0   : snap === 'free' ? pos.x : undefined,
    right:         snap === 'right' ? 0   : undefined,
    width:         PANEL_W,
    height:        minimized ? 'auto' : `calc(100vh - ${snap === 'free' ? pos.y : toolbarHeight}px)`,
    display:       'flex',
    flexDirection: 'column',
    background:    T.surface,
    borderLeft:    snap === 'right' ? `1px solid ${T.border}` : 'none',
    borderRight:   snap === 'left'  ? `1px solid ${T.border}` : 'none',
    border:        snap === 'free'  ? `1px solid ${T.border}` : undefined,
    borderRadius:  snap === 'free'  ? 10 : 0,
    boxShadow:     snap === 'free'  ? '0 8px 40px rgba(0,0,0,.6)' : '0 0 24px rgba(0,0,0,.4)',
    fontFamily:    T.font,
    zIndex:        400,
    overflow:      'hidden',
    userSelect:    'none',
    transition:    dragging.current ? 'none' : 'right .15s, left .15s, top .15s',
  }

  const content = (
    <AssetLibraryContent
      projectId={projectId}
      orgSlug={orgSlug}
      onAddToCanvas={onAddToCanvas}
    />
  )

  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', background: T.bg, fontFamily: T.font }}>
        {content}
        <style>{`@keyframes sf-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <>
      <div ref={panelRef} style={panelStyle}>
        {/* ── Header / drag handle ────────────────────────────────────────── */}
        <div
          onMouseDown={onHeaderMouseDown}
          style={{
            display:     'flex',
            alignItems:  'center',
            gap:         6,
            padding:     '0 8px 0 12px',
            height:      40,
            background:  T.surfaceHigh,
            borderBottom:`1px solid ${T.border}`,
            cursor:      'grab',
            flexShrink:  0,
          }}
        >
          <GripVertical style={{ width: 13, height: 13, color: T.textFaint, flexShrink: 0 }} />
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.textMuted,
            textTransform: 'uppercase', letterSpacing: '.08em', flex: 1,
          }}>
            Asset List
          </span>

          {/* Snap buttons */}
          <button onClick={() => setSnap('left')}  title="Snap left"  style={snapBtnStyle(snap === 'left')}>◧</button>
          <button onClick={() => setSnap('right')} title="Snap right" style={snapBtnStyle(snap === 'right')}>◨</button>

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
          <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
            {content}
          </div>
        )}
      </div>

      <style>{`@keyframes sf-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

// ─── Button style helpers ─────────────────────────────────────────────────────

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
// Asset Library Content
// (loads generated assets from API, shows grouped read-only tiles)
// ─────────────────────────────────────────────────────────────────────────────

function AssetLibraryContent({
  projectId, orgSlug, onAddToCanvas,
}: { projectId: string; orgSlug: string; onAddToCanvas: (type: AssetType, url: string) => void }) {
  const [assets,  setAssets]  = useState<Partial<Record<AssetType, GeneratedAsset>>>({})
  const [loading, setLoading] = useState(true)

  const loadAssets = useCallback(() => {
    setLoading(true)
    fetch(`/api/generate?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => {
        const list: GeneratedAsset[] = Array.isArray(d.assets) ? d.assets : []
        // Build map: latest asset per type
        const map: Partial<Record<AssetType, GeneratedAsset>> = {}
        const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
        for (const a of sorted) {
          if (!map[a.type]) map[a.type] = a
        }
        setAssets(map)
      })
      .catch(() => setAssets({}))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { loadAssets() }, [loadAssets])

  const totalGenerated = Object.keys(assets).length
  const totalTypes     = 19

  return (
    <div style={{ padding: '0 0 24px' }}>

      {/* ── "Go to ASSETS Workspace" CTA ─────────────────────────────────── */}
      <div style={{
        margin:     '12px 12px 8px',
        padding:    '10px 12px',
        background: T.goldBg,
        border:     `1px solid rgba(201,168,76,.2)`,
        borderRadius: 8,
      }}>
        <Link
          href={`/${orgSlug}/projects/${projectId}/assets`}
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        6,
            textDecoration: 'none',
          }}
        >
          <span style={{ fontSize: 14 }}>✦</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.gold }}>
              Open ASSETS Workspace
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
              Generate, style and manage all project assets
            </div>
          </div>
          <ExternalLink size={12} style={{ color: T.gold, flexShrink: 0 }} />
        </Link>
      </div>

      {/* ── Summary bar ─────────────────────────────────────────────────── */}
      <div style={{
        display:   'flex',
        alignItems:'center',
        justifyContent:'space-between',
        padding:   '6px 12px',
        fontSize:  10,
        color:     T.textMuted,
      }}>
        <span>
          {loading ? 'Loading…' : `${totalGenerated} / ${totalTypes} assets`}
        </span>
        <button
          onClick={loadAssets}
          title="Refresh"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.textFaint, padding: 2,
          }}
        >
          <RefreshCw size={11} style={loading ? { animation: 'sf-spin 1s linear infinite' } : {}} />
        </button>
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: 52, background: T.surfaceHigh, borderRadius: 6, opacity: .6 }} />
          ))}
        </div>
      )}

      {/* ── Asset groups ─────────────────────────────────────────────────── */}
      {!loading && DISPLAY_GROUPS.map(group => {
        const groupAssets = group.types.map(t => ({ type: t, asset: assets[t] }))
        const filledCount = groupAssets.filter(a => !!a.asset).length
        if (filledCount === 0) return null  // hide empty groups

        return (
          <div key={group.label} style={{ marginBottom: 4 }}>
            {/* Group label */}
            <div style={{
              display:   'flex',
              alignItems:'center',
              justifyContent:'space-between',
              padding:   '6px 12px 4px',
              fontSize:  10,
              fontWeight:700,
              color:     T.textFaint,
              letterSpacing:'.06em',
              textTransform:'uppercase',
            }}>
              <span>{group.label}</span>
              <span style={{ color: filledCount === group.types.length ? T.green : T.textFaint }}>
                {filledCount}/{group.types.length}
              </span>
            </div>

            {/* Asset rows */}
            {groupAssets.filter(a => !!a.asset).map(({ type, asset }) => (
              <LibraryRow
                key={type}
                assetType={type}
                asset={asset!}
                onAddToCanvas={onAddToCanvas}
              />
            ))}
          </div>
        )
      })}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && totalGenerated === 0 && (
        <div style={{
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          justifyContent:'center',
          padding:       '32px 16px',
          textAlign:     'center',
        }}>
          <ImageIcon size={28} style={{ color: T.textFaint, marginBottom: 10, opacity: .4 }} />
          <p style={{ margin: '0 0 4px', fontSize: 12, color: T.textMuted, fontWeight: 500 }}>
            No assets yet
          </p>
          <p style={{ margin: 0, fontSize: 11, color: T.textFaint }}>
            Generate assets in the ASSETS workspace
          </p>
        </div>
      )}
    </div>
  )
}

// Canvas slot options for the "Place in…" dropdown
const CANVAS_SLOT_OPTIONS: { label: string; assetType: AssetType }[] = [
  { label: 'BG Base',    assetType: 'background_base' },
  { label: 'BG Bonus',   assetType: 'background_bonus' },
  { label: 'High 1',     assetType: 'symbol_high_1' },
  { label: 'High 2',     assetType: 'symbol_high_2' },
  { label: 'High 3',     assetType: 'symbol_high_3' },
  { label: 'High 4',     assetType: 'symbol_high_4' },
  { label: 'High 5',     assetType: 'symbol_high_5' },
  { label: 'Low 1',      assetType: 'symbol_low_1' },
  { label: 'Low 2',      assetType: 'symbol_low_2' },
  { label: 'Low 3',      assetType: 'symbol_low_3' },
  { label: 'Low 4',      assetType: 'symbol_low_4' },
  { label: 'Low 5',      assetType: 'symbol_low_5' },
  { label: 'Wild',       assetType: 'symbol_wild' },
  { label: 'Scatter',    assetType: 'symbol_scatter' },
  { label: 'Logo',       assetType: 'logo' },
  { label: 'Character',  assetType: 'character' },
  { label: 'Reel Frame', assetType: 'reel_frame' },
  { label: 'Spin Btn',   assetType: 'spin_button' },
  { label: 'Jackpot',    assetType: 'jackpot_label' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Library Row — compact single-asset list row with drag + replace dropdown
// ─────────────────────────────────────────────────────────────────────────────

function LibraryRow({
  assetType, asset, onAddToCanvas,
}: { assetType: AssetType; asset: GeneratedAsset; onAddToCanvas: (t: AssetType, url: string) => void }) {
  const [adding,      setAdding]      = useState(false)
  const [ddOpen,      setDdOpen]      = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!ddOpen) return
    function close(e: MouseEvent) {
      if (!ddRef.current?.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ddOpen])

  function handleAdd(targetType: AssetType = assetType) {
    setAdding(true)
    setDdOpen(false)
    onAddToCanvas(targetType, asset.url)
    setTimeout(() => setAdding(false), 1200)
  }

  // Drag-and-drop: encode assetType + url in dataTransfer
  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', JSON.stringify({ assetType, url: asset.url }))
    // Use the thumbnail as the drag image
    const img = e.currentTarget.querySelector('img') as HTMLImageElement | null
    if (img) e.dataTransfer.setDragImage(img, 20, 20)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      title="Drag onto the canvas to place, or use the + button"
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         10,
        padding:     '5px 12px',
        borderBottom:`1px solid ${T.border}`,
        cursor:      'grab',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width:       40,
        height:      40,
        borderRadius:6,
        overflow:    'hidden',
        flexShrink:  0,
        background:  T.surfaceHigh,
        border:      `1px solid ${T.border}`,
      }}>
        <img
          src={asset.url}
          alt={ASSET_LABELS[assetType] ?? assetType}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:   11,
          fontWeight: 600,
          color:      T.textPrimary,
          overflow:   'hidden',
          textOverflow:'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {ASSET_LABELS[assetType] ?? assetType}
        </div>
        <div style={{ fontSize: 9, color: T.textFaint, marginTop: 1 }}>
          {asset.provider} · {asset.theme?.slice(0, 18) ?? '—'}
        </div>
      </div>

      {/* Split button: Add + dropdown for placing in any slot */}
      <div ref={ddRef} style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
        {/* Main add button */}
        <button
          onClick={() => handleAdd()}
          title="Place in default canvas slot"
          style={{
            width:      26,
            height:     26,
            borderRadius:'6px 0 0 6px',
            display:    'flex',
            alignItems: 'center',
            justifyContent:'center',
            background: adding ? 'rgba(52,211,153,.12)' : T.goldBg,
            border:     `1px solid ${adding ? 'rgba(52,211,153,.3)' : 'rgba(201,168,76,.2)'}`,
            borderRight:'none',
            cursor:     'pointer',
            color:      adding ? T.green : T.gold,
          }}
        >
          {adding
            ? <CheckCircle2 size={12} />
            : <Plus         size={12} />
          }
        </button>

        {/* Dropdown toggle */}
        <button
          onClick={() => setDdOpen(v => !v)}
          title="Place in a specific canvas slot…"
          style={{
            width:      18,
            height:     26,
            borderRadius:'0 6px 6px 0',
            display:    'flex',
            alignItems: 'center',
            justifyContent:'center',
            background: ddOpen ? T.goldBg : 'rgba(201,168,76,.04)',
            border:     `1px solid rgba(201,168,76,.2)`,
            cursor:     'pointer',
            color:      T.gold,
            padding:    0,
          }}
        >
          <ChevronDown size={10} />
        </button>

        {/* Dropdown menu */}
        {ddOpen && (
          <div style={{
            position:   'absolute',
            right:      0,
            top:        '100%',
            marginTop:  3,
            background: T.surfaceHigh,
            border:     `1px solid ${T.border}`,
            borderRadius: 8,
            zIndex:     600,
            minWidth:   160,
            boxShadow:  '0 6px 24px rgba(0,0,0,.6)',
            overflow:   'hidden',
          }}>
            <div style={{
              padding:   '6px 10px 4px',
              fontSize:  9,
              color:     T.textFaint,
              fontWeight:700,
              letterSpacing:'.06em',
              textTransform:'uppercase',
              borderBottom: `1px solid ${T.border}`,
            }}>
              Place in canvas slot…
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {CANVAS_SLOT_OPTIONS.map(opt => (
                <button
                  key={opt.assetType}
                  onClick={() => handleAdd(opt.assetType)}
                  style={{
                    display:    'block',
                    width:      '100%',
                    padding:    '6px 10px',
                    textAlign:  'left',
                    background: opt.assetType === assetType ? T.goldBg : 'transparent',
                    border:     'none',
                    color:      opt.assetType === assetType ? T.gold : T.textMuted,
                    fontSize:   11,
                    cursor:     'pointer',
                    fontFamily: T.font,
                  }}
                >
                  {opt.label}
                  {opt.assetType === assetType && (
                    <span style={{ float: 'right', color: T.gold, fontSize: 9 }}>default</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
