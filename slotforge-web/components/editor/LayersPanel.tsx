'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Layers Panel (floating overlay, snap-to-right)
// Receives SF_LAYERS_UPDATE from the editor iframe.
// Sends SF_LAYER_OP back for select / visibility / lock / delete / duplicate / blend.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { Layers, GripVertical, Minus, ChevronDown, Eye, EyeOff, Lock, Unlock, Copy, Trash2, Plus } from 'lucide-react'

// ─── Design tokens (match AssetsPanel) ───────────────────────────────────────
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
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LayerInfo {
  key:        string
  label:      string
  type:       string
  z:          number
  hasAsset:   boolean
  isOff:      boolean
  isHidden:   boolean
  isLocked:   boolean
  isSelected: boolean
  blendMode:  string
}

type SnapEdge = 'right' | 'left' | 'free'

interface Props {
  toolbarHeight?: number
  /** px offset from the right edge when snapped right (to avoid overlapping AssetsPanel) */
  rightOffset?: number
}

const PANEL_W = 280

const BLEND_LABELS: Record<string, string> = {
  normal:   'Normal',
  screen:   'Add / Screen',
  multiply: 'Multiply',
}

// ─── Small style helpers ──────────────────────────────────────────────────────

function snapBtnStyle(active: boolean): React.CSSProperties {
  return {
    background:   active ? T.borderLight : 'transparent',
    border:       'none',
    color:        active ? T.textPrimary : T.textFaint,
    borderRadius: 4,
    width:        22,
    height:       22,
    cursor:       'pointer',
    fontSize:     12,
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    flexShrink:   0,
  }
}

const iconBtnStyle: React.CSSProperties = {
  background:   'transparent',
  border:       'none',
  color:        T.textFaint,
  borderRadius: 4,
  width:        22,
  height:       22,
  cursor:       'pointer',
  display:      'flex',
  alignItems:   'center',
  justifyContent: 'center',
  flexShrink:   0,
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function LayersPanel({ toolbarHeight = 44, rightOffset = 320 }: Props) {
  const [layers,    setLayers]    = useState<LayerInfo[]>([])
  const [screen,    setScreen]    = useState('')
  const [minimized, setMinimized] = useState(false)
  const [snap,      setSnap]      = useState<SnapEdge>('right')
  const [pos,       setPos]       = useState({ x: 0, y: toolbarHeight })

  // Blend mode dropdown state
  const [blendOpen, setBlendOpen] = useState<string | null>(null) // key of layer with open dropdown

  const panelRef   = useRef<HTMLDivElement>(null)
  const dragging   = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // ── Listen for SF_LAYERS_UPDATE from iframe ──────────────────────────────────
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'SF_LAYERS_UPDATE') return
      setLayers(e.data.layers ?? [])
      setScreen(e.data.screenLabel ?? e.data.screen ?? '')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // ── Send SF_LAYER_OP to iframe ───────────────────────────────────────────────
  const sendOp = useCallback((op: string, key?: string, extra?: Record<string, unknown>) => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Spinative Editor"]')
    iframe?.contentWindow?.postMessage({ type: 'SF_LAYER_OP', op, key, ...extra }, '*')
  }, [])

  // ── Drag logic ──────────────────────────────────────────────────────────────

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
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
      } else if (nx + PANEL_W > window.innerWidth - rightOffset - SNAP_ZONE) {
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

  // When snapped right, sit below the AssetsPanel (AssetsPanel is 320px wide, LayersPanel 280px)
  // They share the right edge; LayersPanel sits directly below at the same right:0 position.
  // We offset its top by toolbarHeight + the AssetsPanel header (40px) when both are snapped right.
  // Actually simpler: just let both snap to right:0 — they'll stack if we use position:fixed.
  // Since AssetsPanel is full height (calc 100vh - toolbar), we need this panel to float above or below.
  // Strategy: LayersPanel starts snapped to right as well, positioned at a lower starting y
  // (user can drag it anywhere). Default y = toolbarHeight + 340 to sit below AssetsPanel's header area.

  const panelStyle: React.CSSProperties = {
    position:      'fixed',
    top:           snap === 'free' ? pos.y : toolbarHeight,
    left:          snap === 'left'  ? 0   : snap === 'free' ? pos.x : undefined,
    right:         snap === 'right' ? rightOffset : undefined,
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
    zIndex:        390,   // just below AssetsPanel (400) so Assets floats on top when overlapping
    overflow:      'hidden',
    userSelect:    'none',
    transition:    dragging.current ? 'none' : 'right .15s, left .15s, top .15s',
  }

  // ── Layer type icon ──────────────────────────────────────────────────────────

  function layerTypeIcon(type: string) {
    if (type === 'custom') return '🖼'
    if (type === 'reel')   return '🎰'
    if (type === 'group')  return '📁'
    return '◻'
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div ref={panelRef} style={panelStyle}>

      {/* ── Header / drag handle ── */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          padding:      '0 8px 0 12px',
          height:       40,
          background:   T.surfaceHigh,
          borderBottom: `1px solid ${T.border}`,
          cursor:       'grab',
          flexShrink:   0,
        }}
      >
        <GripVertical style={{ width: 13, height: 13, color: T.textFaint, flexShrink: 0 }} />
        <Layers style={{ width: 13, height: 13, color: T.gold, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
          Layers {screen ? <span style={{ color: T.textFaint, fontWeight: 400 }}>· {screen}</span> : null}
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
        <>
          {/* ── Toolbar: Add Layer ── */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'flex-end',
            gap:          4,
            padding:      '4px 8px',
            borderBottom: `1px solid ${T.border}`,
            flexShrink:   0,
          }}>
            <button
              onClick={() => sendOp('addLayer')}
              title="New layer"
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          4,
                background:   'transparent',
                border:       `1px solid ${T.borderLight}`,
                color:        T.textMuted,
                borderRadius: 5,
                padding:      '3px 8px',
                fontSize:     11,
                cursor:       'pointer',
                fontFamily:   T.font,
              }}
            >
              <Plus style={{ width: 11, height: 11 }} />
              New Layer
            </button>
          </div>

          {/* ── Layers list ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {layers.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: T.textFaint }}>
                No layers yet.<br />Open a project to see layers here.
              </div>
            ) : (
              layers.map(layer => (
                <div
                  key={layer.key}
                  onClick={() => { sendOp('select', layer.key); setBlendOpen(null) }}
                  style={{
                    display:       'flex',
                    alignItems:    'center',
                    gap:           6,
                    padding:       '5px 8px',
                    cursor:        'pointer',
                    background:    layer.isSelected ? '#2a2a4a' : 'transparent',
                    borderLeft:    layer.isSelected ? `2px solid ${T.gold}` : '2px solid transparent',
                    opacity:       layer.isOff || layer.isHidden ? 0.45 : 1,
                    position:      'relative',
                  }}
                >
                  {/* Type icon */}
                  <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>
                    {layerTypeIcon(layer.type)}
                  </span>

                  {/* Label */}
                  <span style={{
                    flex:       1,
                    fontSize:   12,
                    color:      layer.isSelected ? T.textPrimary : T.textMuted,
                    fontWeight: layer.isSelected ? 600 : 400,
                    overflow:   'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {layer.label}
                  </span>

                  {/* Blend mode badge (if non-normal) */}
                  {layer.blendMode && layer.blendMode !== 'normal' && (
                    <span style={{ fontSize: 9, color: T.gold, background: '#2a2200', border: `1px solid ${T.gold}33`, borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
                      {layer.blendMode === 'screen' ? 'ADD' : 'MUL'}
                    </span>
                  )}

                  {/* Visibility toggle */}
                  <button
                    onClick={e => { e.stopPropagation(); sendOp('toggleVisibility', layer.key) }}
                    title={layer.isHidden ? 'Show layer' : 'Hide layer'}
                    style={{ ...iconBtnStyle, color: layer.isHidden ? T.textFaint : T.textMuted }}
                  >
                    {layer.isHidden
                      ? <EyeOff style={{ width: 12, height: 12 }} />
                      : <Eye    style={{ width: 12, height: 12 }} />
                    }
                  </button>

                  {/* Lock toggle */}
                  <button
                    onClick={e => { e.stopPropagation(); sendOp('toggleLock', layer.key) }}
                    title={layer.isLocked ? 'Unlock layer' : 'Lock layer'}
                    style={{ ...iconBtnStyle, color: layer.isLocked ? T.gold : T.textFaint }}
                  >
                    {layer.isLocked
                      ? <Lock   style={{ width: 12, height: 12 }} />
                      : <Unlock style={{ width: 12, height: 12 }} />
                    }
                  </button>

                  {/* Blend mode button */}
                  <button
                    onClick={e => { e.stopPropagation(); setBlendOpen(o => o === layer.key ? null : layer.key) }}
                    title="Blend mode"
                    style={{ ...iconBtnStyle, color: T.textFaint, fontSize: 9, width: 'auto', padding: '0 3px' }}
                  >
                    <ChevronDown style={{ width: 10, height: 10 }} />
                  </button>

                  {/* Duplicate — custom layers only */}
                  {layer.type === 'custom' && (
                    <button
                      onClick={e => { e.stopPropagation(); sendOp('duplicate', layer.key) }}
                      title="Duplicate layer"
                      style={iconBtnStyle}
                    >
                      <Copy style={{ width: 11, height: 11 }} />
                    </button>
                  )}

                  {/* Delete — all layers */}
                  <button
                    onClick={e => { e.stopPropagation(); sendOp('delete', layer.key) }}
                    title={layer.type === 'custom' ? 'Delete layer' : 'Remove from this screen'}
                    style={{ ...iconBtnStyle, color: T.red }}
                  >
                    <Trash2 style={{ width: 11, height: 11 }} />
                  </button>

                  {/* Blend mode dropdown */}
                  {blendOpen === layer.key && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        position:   'absolute',
                        right:      8,
                        top:        '100%',
                        background: T.surfaceHigh,
                        border:     `1px solid ${T.borderLight}`,
                        borderRadius: 6,
                        zIndex:     600,
                        minWidth:   130,
                        boxShadow:  '0 4px 20px rgba(0,0,0,.6)',
                        overflow:   'hidden',
                      }}
                    >
                      {(['normal', 'screen', 'multiply'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => {
                            sendOp('setBlendMode', layer.key, { blendMode: mode })
                            setBlendOpen(null)
                          }}
                          style={{
                            display:    'block',
                            width:      '100%',
                            padding:    '7px 12px',
                            textAlign:  'left',
                            background: layer.blendMode === mode ? '#2a2a4a' : 'transparent',
                            border:     'none',
                            color:      layer.blendMode === mode ? T.textPrimary : T.textMuted,
                            fontSize:   12,
                            cursor:     'pointer',
                            fontFamily: T.font,
                          }}
                        >
                          {BLEND_LABELS[mode]}
                          {layer.blendMode === mode && <span style={{ float: 'right', color: T.gold }}>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
