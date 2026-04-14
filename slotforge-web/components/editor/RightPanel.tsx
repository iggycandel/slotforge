'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Right Panel (Adobe PS-style fixed sidebar)
// Two tabs: Layers | Assets
// Layers: drag-to-reorder, right-click context menu, visibility/lock/blend mode
// Assets: embeds AssetsPanel in embedded mode
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, Plus, ChevronDown } from 'lucide-react'
import { AssetsPanel } from '../generate/AssetsPanel'
import type { AssetType } from '@/types/assets'

// ─── Design tokens (landing page palette) ────────────────────────────────────
const T = {
  bg:          '#0a0a0f',
  surface:     '#13131a',
  surfaceHigh: '#1a1a24',
  surfaceHov:  '#22222e',
  border:      'rgba(255,255,255,.06)',
  borderGold:  'rgba(201,168,76,.28)',
  gold:        '#c9a84c',
  goldLight:   '#f0d060',
  textPrimary: '#eeede6',
  textMuted:   '#7a7a8a',
  textFaint:   '#3e3e4e',
  red:         '#e07070',
  font:        "'Inter', 'Space Grotesk', sans-serif",
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

type PanelTab = 'layers' | 'assets'

const BLEND_LABELS: Record<string, string> = {
  normal:   'Normal',
  screen:   'Add / Screen',
  multiply: 'Multiply',
}

function layerTypeIcon(type: string) {
  if (type === 'custom') return '🖼'
  if (type === 'reel')   return '🎰'
  if (type === 'group')  return '📁'
  if (type === 'sym')    return '◆'
  return '◻'
}

const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, padding: 3, flexShrink: 0,
}

// ─────────────────────────────────────────────────────────────────────────────
// RightPanel — main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  projectId:     string
  onAddToCanvas: (assetType: AssetType, url: string) => void
  width?:        number   // panel width in px (default 320)
}

export function RightPanel({ projectId, onAddToCanvas, width = 320 }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('layers')
  const [layers,    setLayers]    = useState<LayerInfo[]>([])
  const [screen,    setScreen]    = useState('')

  // Blend dropdown state
  const [blendOpen, setBlendOpen] = useState<string | null>(null)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ key: string; x: number; y: number } | null>(null)

  // Drag-to-reorder state
  const dragKey    = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)

  // ── postMessage helpers ────────────────────────────────────────────────────

  function getIframe(): HTMLIFrameElement | null {
    return document.querySelector<HTMLIFrameElement>('iframe[title="SlotForge Editor"]')
  }

  const sendOp = useCallback((op: string, key?: string, extra?: Record<string, unknown>) => {
    getIframe()?.contentWindow?.postMessage({ type: 'SF_LAYER_OP', op, key, ...extra }, '*')
  }, [])

  // ── Listen for SF_LAYERS_UPDATE ────────────────────────────────────────────

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type !== 'SF_LAYERS_UPDATE') return
      setLayers(e.data.layers ?? [])
      setScreen(e.data.screenLabel ?? e.data.screen ?? '')
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // ── Request layers update when layers tab becomes active ───────────────────

  useEffect(() => {
    if (activeTab === 'layers') {
      const req = () => getIframe()?.contentWindow?.postMessage({ type: 'SF_REQUEST_LAYERS_UPDATE' }, '*')
      // Small delay to ensure iframe is ready
      const t = setTimeout(req, 200)
      return () => clearTimeout(t)
    }
  }, [activeTab])

  // ── Close context menu on outside click ───────────────────────────────────

  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.sf-layer-ctx')) setCtxMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctxMenu])

  // ── Close blend dropdown on outside click ─────────────────────────────────

  useEffect(() => {
    if (!blendOpen) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.sf-blend-dd')) setBlendOpen(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [blendOpen])

  // ── Drag-to-reorder handlers (fixed: use onDragEnter for state, onDragOver just prevents default) ──

  function onDragStart(key: string, e: React.DragEvent) {
    dragKey.current = key
    e.dataTransfer.effectAllowed = 'move'
    // Invisible ghost so we control the visual feedback ourselves
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-999px;left:-999px;width:1px;height:1px;opacity:0'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    requestAnimationFrame(() => { if (ghost.parentNode) document.body.removeChild(ghost) })
  }

  function onDragEnter(targetKey: string, e: React.DragEvent) {
    e.preventDefault()
    if (dragKey.current && dragKey.current !== targetKey) setDragOver(targetKey)
  }

  function onDragOverRow(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onDragLeave(targetKey: string, e: React.DragEvent) {
    const related = e.relatedTarget as HTMLElement | null
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      setDragOver(v => v === targetKey ? null : v)
    }
  }

  function onDrop(targetKey: string, e: React.DragEvent) {
    e.preventDefault()
    const from = dragKey.current
    dragKey.current = null
    setDragOver(null)
    if (!from || from === targetKey) return
    sendOp('reorder', from, { targetKey, position: 'before' })
  }

  function onDragEnd() {
    dragKey.current = null
    setDragOver(null)
  }

  // ── Context menu handler ───────────────────────────────────────────────────

  function openCtx(key: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const panelRect = panelRef.current!.getBoundingClientRect()
    setCtxMenu({ key, x: e.clientX - panelRect.left, y: e.clientY - panelRect.top })
    setBlendOpen(null)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={panelRef}
      style={{
        width,
        minWidth:      width,
        display:       'flex',
        flexDirection: 'column',
        background:    T.surface,
        borderLeft:    `1px solid ${T.border}`,
        height:        '100%',
        overflow:      'hidden',
        fontFamily:    T.font,
        position:      'relative',
        flexShrink:    0,
      }}
    >
      {/* ── Tab bar ── */}
      <div style={{
        display:       'flex',
        background:    T.bg,
        borderBottom:  `1px solid ${T.border}`,
        flexShrink:    0,
      }}>
        {(['layers', 'assets'] as PanelTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex:         1,
              padding:      '9px 8px',
              fontSize:     11,
              fontWeight:   600,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              border:       'none',
              cursor:       'pointer',
              background:   'transparent',
              color:        activeTab === tab ? T.gold : T.textFaint,
              borderBottom: activeTab === tab ? `2px solid ${T.gold}` : '2px solid transparent',
              transition:   'color .15s, border-color .15s',
              fontFamily:   T.font,
            }}
          >
            {tab === 'layers' ? 'Layers' : 'Assets'}
          </button>
        ))}
      </div>

      {/* ── Layers tab ── */}
      {activeTab === 'layers' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Layers toolbar */}
          <div style={{
            display:       'flex',
            alignItems:    'center',
            justifyContent: 'space-between',
            padding:       '5px 10px',
            borderBottom:  `1px solid ${T.border}`,
            flexShrink:    0,
            background:    T.surface,
          }}>
            <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>
              {screen || 'Base Game'}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => sendOp('addGroup')}
                title="New group"
                style={{ ...iconBtn, color: T.textMuted }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="1" y="4" width="14" height="10" rx="2"/>
                  <path d="M1 6h14M5 4V2h6v2"/>
                </svg>
              </button>
              <button
                onClick={() => sendOp('addLayer')}
                title="New layer"
                style={{ ...iconBtn, color: T.gold }}
              >
                <Plus style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>

          {/* Layer list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
            {layers.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.textFaint, lineHeight: 1.7 }}>
                No layers yet.<br />
                <span style={{ fontSize: 11 }}>Open a project to see layers.</span>
              </div>
            ) : (
              layers.map(layer => (
                <div
                  key={layer.key}
                  draggable
                  onDragStart={e => onDragStart(layer.key, e)}
                  onDragEnter={e => onDragEnter(layer.key, e)}
                  onDragOver={onDragOverRow}
                  onDragLeave={e => onDragLeave(layer.key, e)}
                  onDrop={e => onDrop(layer.key, e)}
                  onDragEnd={onDragEnd}
                  onClick={() => { sendOp('select', layer.key); setBlendOpen(null); setCtxMenu(null) }}
                  onContextMenu={e => openCtx(layer.key, e)}
                  style={{
                    display:       'flex',
                    alignItems:    'center',
                    gap:           6,
                    padding:       '5px 10px',
                    cursor:        'pointer',
                    background:    layer.isSelected
                      ? 'rgba(201,168,76,.08)'
                      : dragOver === layer.key
                        ? 'rgba(201,168,76,.04)'
                        : 'transparent',
                    borderLeft:    layer.isSelected ? `2px solid ${T.gold}` : '2px solid transparent',
                    borderTop:     dragOver === layer.key ? `1px solid ${T.gold}` : '1px solid transparent',
                    opacity:       layer.isOff || layer.isHidden ? 0.4 : 1,
                    userSelect:    'none',
                    transition:    'background .1s',
                  }}
                >
                  {/* Drag handle + type icon */}
                  <span style={{ fontSize: 12, flexShrink: 0, lineHeight: 1, cursor: 'grab', color: T.textFaint }}>⠿</span>
                  <span style={{ fontSize: 12, flexShrink: 0, lineHeight: 1 }}>
                    {layerTypeIcon(layer.type)}
                  </span>

                  {/* Label */}
                  <span style={{
                    flex:        1,
                    fontSize:    12,
                    color:       layer.isSelected ? T.textPrimary : T.textMuted,
                    fontWeight:  layer.isSelected ? 500 : 400,
                    overflow:    'hidden',
                    textOverflow:'ellipsis',
                    whiteSpace:  'nowrap',
                  }}>
                    {layer.label}
                  </span>

                  {/* Non-normal blend badge */}
                  {layer.blendMode && layer.blendMode !== 'normal' && (
                    <span style={{
                      fontSize: 8, color: T.gold, letterSpacing: '.04em',
                      background: 'rgba(201,168,76,.1)', border: `1px solid ${T.borderGold}`,
                      borderRadius: 3, padding: '1px 3px', flexShrink: 0,
                    }}>
                      {layer.blendMode === 'screen' ? 'ADD' : 'MUL'}
                    </span>
                  )}

                  {/* Eye / visibility */}
                  <button
                    onClick={e => { e.stopPropagation(); sendOp('toggleVisibility', layer.key) }}
                    title={layer.isHidden ? 'Show' : 'Hide'}
                    style={{ ...iconBtn, color: layer.isHidden ? T.textFaint : T.textMuted }}
                  >
                    {layer.isHidden
                      ? <EyeOff style={{ width: 12, height: 12 }} />
                      : <Eye    style={{ width: 12, height: 12 }} />
                    }
                  </button>

                  {/* Lock */}
                  <button
                    onClick={e => { e.stopPropagation(); sendOp('toggleLock', layer.key) }}
                    title={layer.isLocked ? 'Unlock' : 'Lock'}
                    style={{ ...iconBtn, color: layer.isLocked ? T.gold : T.textFaint }}
                  >
                    {layer.isLocked
                      ? <Lock   style={{ width: 11, height: 11 }} />
                      : <Unlock style={{ width: 11, height: 11 }} />
                    }
                  </button>

                  {/* Blend mode chevron */}
                  <div className="sf-blend-dd" style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      onClick={e => { e.stopPropagation(); setBlendOpen(o => o === layer.key ? null : layer.key) }}
                      title="Blend mode"
                      style={{ ...iconBtn, color: T.textFaint }}
                    >
                      <ChevronDown style={{ width: 10, height: 10 }} />
                    </button>

                    {blendOpen === layer.key && (
                      <div style={{
                        position:  'absolute',
                        right:     0,
                        top:       '100%',
                        background: T.surfaceHigh,
                        border:    `1px solid ${T.border}`,
                        borderRadius: 6,
                        zIndex:    600,
                        minWidth:  140,
                        boxShadow: '0 4px 20px rgba(0,0,0,.6)',
                        overflow:  'hidden',
                      }}
                        onClick={e => e.stopPropagation()}
                      >
                        {(['normal', 'screen', 'multiply'] as const).map(mode => (
                          <button
                            key={mode}
                            onClick={() => {
                              sendOp('setBlendMode', layer.key, { blendMode: mode })
                              setBlendOpen(null)
                            }}
                            style={{
                              display:   'block',
                              width:     '100%',
                              padding:   '7px 12px',
                              textAlign: 'left',
                              background: layer.blendMode === mode ? 'rgba(201,168,76,.1)' : 'transparent',
                              border:    'none',
                              color:     layer.blendMode === mode ? T.textPrimary : T.textMuted,
                              fontSize:  11,
                              cursor:    'pointer',
                              fontFamily: T.font,
                            }}
                          >
                            {BLEND_LABELS[mode]}
                            {layer.blendMode === mode && (
                              <span style={{ float: 'right', color: T.gold }}>✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Assets tab ── */}
      {activeTab === 'assets' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <AssetsPanel
            projectId={projectId}
            onAddToCanvas={onAddToCanvas}
            embedded={true}
          />
        </div>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          className="sf-layer-ctx"
          style={{
            position:   'absolute',
            left:       Math.min(ctxMenu.x, width - 170),
            top:        ctxMenu.y,
            background: T.surfaceHigh,
            border:     `1px solid ${T.border}`,
            borderRadius: 8,
            zIndex:     900,
            minWidth:   160,
            boxShadow:  '0 8px 32px rgba(0,0,0,.7)',
            overflow:   'hidden',
          }}
        >
          {[
            { label: '+ New Layer',    op: 'addLayer',  key: undefined,    icon: <Plus style={{ width: 12, height: 12 }} />,     danger: false },
            { label: '+ New Group',    op: 'addGroup',  key: undefined,    icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="14" height="10" rx="2"/></svg>, danger: false },
            { label: 'Duplicate',      op: 'duplicate', key: ctxMenu.key,  icon: <Copy style={{ width: 12, height: 12 }} />,     danger: false },
            { label: 'Delete Layer',   op: 'delete',    key: ctxMenu.key,  icon: <Trash2 style={{ width: 12, height: 12 }} />,   danger: true  },
          ].map(item => {
            // Only show Delete/Duplicate for custom layers
            const layer = layers.find(l => l.key === ctxMenu.key)
            if ((item.op === 'delete' || item.op === 'duplicate') && layer?.type !== 'custom') return null
            return (
              <button
                key={item.op}
                onClick={() => {
                  sendOp(item.op, item.key)
                  setCtxMenu(null)
                }}
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        8,
                  width:      '100%',
                  padding:    '8px 14px',
                  textAlign:  'left',
                  background: 'transparent',
                  border:     'none',
                  color:      item.danger ? T.red : T.textMuted,
                  fontSize:   12,
                  cursor:     'pointer',
                  fontFamily: T.font,
                  transition: 'background .1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = item.danger ? 'rgba(224,112,112,.1)' : T.surfaceHov)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: item.danger ? T.red : T.textFaint, flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
