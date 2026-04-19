'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Canvas Asset List Panel (floating overlay or embedded)
//
// Displays all asset types for the project.
// Users can drag any asset onto the canvas, add to a slot, or upload directly.
// Generation lives at /assets workspace; this panel is the quick-access view.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ImageIcon, CheckCircle2, Plus,
  Minus, GripVertical, ChevronDown, ExternalLink, RefreshCw, Upload,
  Loader2,
} from 'lucide-react'
import type { AssetType, GeneratedAsset } from '@/types/assets'
import type { FeatureDef, FeatureId, AssetSlot } from '@/types/features'
import { activeAssetSlots } from '@/types/features'
import { FEATURE_REGISTRY } from '@/lib/features/registry'

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
  blue:        '#60a5fa',
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
  symbol_high_6:    'High 6',
  symbol_high_7:    'High 7',
  symbol_high_8:    'High 8',
  symbol_low_1:     'Low 1',
  symbol_low_2:     'Low 2',
  symbol_low_3:     'Low 3',
  symbol_low_4:     'Low 4',
  symbol_low_5:     'Low 5',
  symbol_low_6:     'Low 6',
  symbol_low_7:     'Low 7',
  symbol_low_8:     'Low 8',
  symbol_wild:      'Wild',
  symbol_scatter:   'Scatter',
  symbol_special_3: 'Special 3',
  symbol_special_4: 'Special 4',
  symbol_special_5: 'Special 5',
  symbol_special_6: 'Special 6',
  logo:             'Logo',
  character:        'Character',
  reel_frame:       'Reel Frame',
  spin_button:      'Spin Btn',
  jackpot_label:    'Jackpot',
}

// Ordered AssetType key arrays for dynamic group building
const HIGH_TYPE_KEYS: AssetType[]    = ['symbol_high_1','symbol_high_2','symbol_high_3','symbol_high_4','symbol_high_5','symbol_high_6','symbol_high_7','symbol_high_8']
const LOW_TYPE_KEYS: AssetType[]     = ['symbol_low_1','symbol_low_2','symbol_low_3','symbol_low_4','symbol_low_5','symbol_low_6','symbol_low_7','symbol_low_8']
const SPECIAL_TYPE_KEYS: AssetType[] = ['symbol_wild','symbol_scatter','symbol_special_3','symbol_special_4','symbol_special_5','symbol_special_6']

/** Build display groups from projectMeta symbol counts (matches AssetsWorkspace logic). */
function buildDisplayGroups(meta?: Record<string, unknown>): { label: string; types: AssetType[] }[] {
  const highCount    = Math.min(8, Math.max(1, Number(meta?.symbolHighCount    ?? 5)))
  const lowCount     = Math.min(8, Math.max(1, Number(meta?.symbolLowCount     ?? 5)))
  const specialCount = Math.min(6, Math.max(2, Number(meta?.symbolSpecialCount ?? 2)))
  return [
    { label: 'Backgrounds',                         types: ['background_base', 'background_bonus'] },
    { label: `High Symbols (${highCount})`,          types: HIGH_TYPE_KEYS.slice(0, highCount) },
    { label: `Low Symbols (${lowCount})`,            types: LOW_TYPE_KEYS.slice(0, lowCount) },
    { label: `Special Symbols (${specialCount})`,    types: SPECIAL_TYPE_KEYS.slice(0, specialCount) },
    { label: 'UI & Chrome',                          types: ['logo', 'character', 'reel_frame', 'spin_button', 'jackpot_label'] },
  ]
}

// ─── Feature slot groups (v1 registry) ───────────────────────────────────────
// Returns the active asset slots for every feature enabled in projectMeta.features.
// Uses each feature's defaultSettings to compute conditional slots; once Phase 2
// wires real settings into the registry calls, this will react to user changes.
interface FeatureSlotGroup {
  featureId: FeatureId
  label:     string
  slots:     AssetSlot[]
}
function buildFeatureGroups(meta?: Record<string, unknown>): FeatureSlotGroup[] {
  const features = (meta?.features as Record<string, boolean | unknown> | undefined) ?? {}
  const groups: FeatureSlotGroup[] = []
  for (const [id, def] of Object.entries(FEATURE_REGISTRY) as [FeatureId, FeatureDef][]) {
    if (!features[id]) continue
    groups.push({
      featureId: id,
      label:     def.label,
      slots:     activeAssetSlots(def, def.defaultSettings),
    })
  }
  return groups
}

type SnapEdge = 'right' | 'left' | 'free'

const PANEL_W = 280

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId:         string
  orgSlug:           string
  onAddToCanvas:     (assetType: AssetType, url: string) => void
  toolbarHeight?:    number
  embedded?:         boolean
  assetRefreshTick?: number  // increments externally to trigger re-fetch
  projectMeta?:      Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AssetsPanel({
  projectId, orgSlug, onAddToCanvas, toolbarHeight = 44, embedded = false, assetRefreshTick, projectMeta,
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
      assetRefreshTick={assetRefreshTick}
      projectMeta={projectMeta}
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
// (loads assets from API, shows all types grouped, with upload capability)
// ─────────────────────────────────────────────────────────────────────────────

function AssetLibraryContent({
  projectId, orgSlug, onAddToCanvas, assetRefreshTick, projectMeta,
}: { projectId: string; orgSlug: string; onAddToCanvas: (type: AssetType, url: string) => void; assetRefreshTick?: number; projectMeta?: Record<string, unknown> }) {
  const [assets,  setAssets]  = useState<Record<string, GeneratedAsset>>({})
  const [loading, setLoading] = useState(true)

  const loadAssets = useCallback(() => {
    setLoading(true)
    fetch(`/api/generate?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => {
        const list: GeneratedAsset[] = Array.isArray(d.assets) ? d.assets : []
        // Build map: latest asset per type. Keys are arbitrary strings —
        // either legacy AssetType values ("symbol_high_1") or feature slot
        // keys ("bonuspick.bg") preserved by /api/assets/upload.
        const map: Record<string, GeneratedAsset> = {}
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

  // Re-fetch whenever the parent signals an asset was changed (e.g. reel upload in editor)
  useEffect(() => {
    if (assetRefreshTick && assetRefreshTick > 0) loadAssets()
  }, [assetRefreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload handler — called from LibraryRow ──────────────────────────────
  const uploadAsset = useCallback(async (file: File, assetType: AssetType) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('projectId', projectId)
    fd.append('assetKey', assetType)
    fd.append('theme', 'upload')
    const res = await fetch('/api/assets/upload', { method: 'POST', body: fd })
    if (res.ok) {
      loadAssets()
    } else {
      const err = await res.json().catch(() => ({}))
      console.error('[AssetsPanel] upload failed:', err)
    }
  }, [projectId, loadAssets])

  // ── Feature slot upload — same endpoint, but the slot key has a namespace
  // (e.g. "bonuspick.bg") and the canvas position is fixed in editor.js, so
  // we auto-inject into the iframe right after upload via onAddToCanvas.
  const uploadFeatureSlot = useCallback(async (file: File, slotKey: string) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('projectId', projectId)
    fd.append('assetKey', slotKey)
    fd.append('theme', 'upload')
    const res = await fetch('/api/assets/upload', { method: 'POST', body: fd })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[AssetsPanel] feature slot upload failed:', err)
      return
    }
    const data = await res.json().catch(() => ({}))
    const url = data?.url as string | undefined
    if (url) {
      // SF_INJECT_IMAGE_LAYER falls back to the raw key when not in
      // ASSET_KEY_MAP, so namespaced feature slots flow through unchanged.
      onAddToCanvas(slotKey as AssetType, url)
    }
    loadAssets()
  }, [projectId, loadAssets, onAddToCanvas])

  // Build display groups dynamically from project symbol counts
  const displayGroups = useMemo(() => buildDisplayGroups(projectMeta), [projectMeta])
  const featureGroups = useMemo(() => buildFeatureGroups(projectMeta), [projectMeta])

  const totalFilled = Object.keys(assets).length
  const totalTypes  = displayGroups.reduce((n, g) => n + g.types.length, 0)

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
          {loading ? 'Loading…' : `${totalFilled} / ${totalTypes} assets`}
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
      {!loading && displayGroups.map(group => {
        const groupAssets = group.types.map(t => ({ type: t, asset: assets[t] }))
        const filledCount = groupAssets.filter(a => !!a.asset).length

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

            {/* All asset rows — filled and empty alike */}
            {groupAssets.map(({ type, asset }) => (
              <LibraryRow
                key={type}
                assetType={type}
                asset={asset}
                onAddToCanvas={onAddToCanvas}
                onUpload={uploadAsset}
              />
            ))}
          </div>
        )
      })}

      {/* ── Feature slot groups ──────────────────────────────────────────── */}
      {!loading && featureGroups.length > 0 && (
        <div style={{
          margin: '14px 12px 4px',
          padding: '4px 0 4px',
          borderTop: `1px solid ${T.border}`,
          fontSize: 9,
          fontWeight: 700,
          color: T.gold,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
        }}>
          ✦ Features
        </div>
      )}
      {!loading && featureGroups.map(group => {
        const filledCount = group.slots.filter(s => !!assets[s.key]).length
        return (
          <div key={group.featureId} style={{ marginBottom: 4 }}>
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '6px 12px 4px',
              fontSize:       10,
              fontWeight:     700,
              color:          T.textFaint,
              letterSpacing:  '.06em',
              textTransform:  'uppercase',
            }}>
              <span>{group.label}</span>
              <span style={{ color: filledCount === group.slots.length ? T.green : T.textFaint }}>
                {filledCount}/{group.slots.length}
              </span>
            </div>
            {group.slots.map(slot => (
              <FeatureSlotRow
                key={slot.key}
                slot={slot}
                asset={assets[slot.key]}
                onUpload={uploadFeatureSlot}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Slot Row — simpler than LibraryRow because the slot's canvas
// position is fixed in the editor (no drag, no "Place in" dropdown).
// Upload triggers an auto-inject into the editor canvas via uploadFeatureSlot.
// ─────────────────────────────────────────────────────────────────────────────

function FeatureSlotRow({
  slot, asset, onUpload,
}: {
  slot:     AssetSlot
  asset?:   GeneratedAsset
  onUpload: (file: File, slotKey: string) => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function handleUploadClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const inp = fileInput.current
    if (inp) setTimeout(() => inp.click(), 0)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      await onUpload(file, slot.key)
    } finally {
      setUploading(false)
    }
  }

  const isEmpty = !asset
  const required = slot.requirement === 'required'

  return (
    <div
      title={isEmpty ? `Upload ${slot.label}` : `${slot.label} — ${slot.key}`}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         8,
        padding:     '5px 12px',
        borderBottom:`1px solid ${T.border}`,
        opacity:     isEmpty ? 0.7 : 1,
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width:  38, height: 38, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
        background: T.surfaceHigh,
        border: `1px solid ${isEmpty ? 'rgba(255,255,255,.04)' : T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {asset
          ? <img
              src={asset.url}
              alt={slot.label}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          : <ImageIcon size={14} style={{ color: T.textFaint, opacity: .4 }} />
        }
      </div>

      {/* Label + slot key + requirement */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: isEmpty ? T.textFaint : T.textPrimary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {slot.label}
          {required && (
            <span style={{ color: 'rgba(248,113,113,.7)', marginLeft: 4, fontSize: 10 }}>*</span>
          )}
        </div>
        <div style={{
          fontSize: 9, marginTop: 1,
          color: T.textFaint,
          fontFamily: "'DM Mono',monospace",
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {slot.key}
        </div>
      </div>

      {/* Upload button */}
      <button
        onClick={handleUploadClick}
        title={asset ? 'Replace with upload' : 'Upload image'}
        disabled={uploading}
        style={{
          width: 26, height: 26, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: uploading ? 'rgba(96,165,250,.12)' : 'rgba(96,165,250,.06)',
          border: `1px solid ${uploading ? 'rgba(96,165,250,.4)' : 'rgba(96,165,250,.18)'}`,
          cursor: uploading ? 'wait' : 'pointer',
          color: uploading ? T.blue : 'rgba(96,165,250,.6)',
          flexShrink: 0,
        }}
      >
        {uploading
          ? <Loader2 size={11} style={{ animation: 'sf-spin 1s linear infinite' }} />
          : <Upload  size={11} />
        }
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
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
// Library Row — single asset row with drag + replace dropdown + upload
// ─────────────────────────────────────────────────────────────────────────────

function LibraryRow({
  assetType, asset, onAddToCanvas, onUpload,
}: {
  assetType:    AssetType
  asset?:       GeneratedAsset
  onAddToCanvas:(t: AssetType, url: string) => void
  onUpload:     (file: File, type: AssetType) => Promise<void>
}) {
  const [adding,    setAdding]    = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ddOpen,    setDdOpen]    = useState(false)
  const ddRef     = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

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
    if (!asset) return
    setAdding(true)
    setDdOpen(false)
    onAddToCanvas(targetType, asset.url)
    setTimeout(() => setAdding(false), 1200)
  }

  // Drag-and-drop
  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    if (!asset) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', JSON.stringify({ assetType, url: asset.url }))
    const img = e.currentTarget.querySelector('img') as HTMLImageElement | null
    if (img) e.dataTransfer.setDragImage(img, 20, 20)
  }

  // Trigger file picker — defer one tick so the synthetic event finishes first
  function handleUploadClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const inp = fileInput.current
    if (inp) setTimeout(() => inp.click(), 0)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // reset so same file can be re-selected
    setUploading(true)
    try {
      await onUpload(file, assetType)
    } finally {
      setUploading(false)
    }
  }

  // Provider badge colour
  const providerColor = asset?.provider === 'upload' ? T.blue
    : asset?.provider === 'openai' ? '#a78bfa'
    : asset?.provider === 'runway' ? '#fb923c'
    : T.textFaint

  const isEmpty = !asset

  return (
    <div
      draggable={!isEmpty}
      onDragStart={handleDragStart}
      title={isEmpty ? `Upload ${ASSET_LABELS[assetType] ?? assetType}` : 'Drag onto the canvas or use the + button'}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         8,
        padding:     '5px 12px',
        borderBottom:`1px solid ${T.border}`,
        cursor:      isEmpty ? 'default' : 'grab',
        opacity:     isEmpty ? 0.55 : 1,
      }}
    >
      {/* Thumbnail / empty placeholder */}
      <div style={{
        width:       38,
        height:      38,
        borderRadius:6,
        overflow:    'hidden',
        flexShrink:  0,
        background:  T.surfaceHigh,
        border:      `1px solid ${isEmpty ? 'rgba(255,255,255,.04)' : T.border}`,
        display:     'flex',
        alignItems:  'center',
        justifyContent:'center',
      }}>
        {asset
          ? <img
              src={asset.url}
              alt={ASSET_LABELS[assetType] ?? assetType}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          : <ImageIcon size={14} style={{ color: T.textFaint, opacity: .4 }} />
        }
      </div>

      {/* Label + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:   11,
          fontWeight: 600,
          color:      isEmpty ? T.textFaint : T.textPrimary,
          overflow:   'hidden',
          textOverflow:'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {ASSET_LABELS[assetType] ?? assetType}
        </div>
        {asset
          ? (
            <div style={{ fontSize: 9, color: providerColor, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                background: `${providerColor}22`,
                border: `1px solid ${providerColor}44`,
                borderRadius: 3,
                padding: '0 4px',
                lineHeight: '14px',
              }}>
                {asset.provider}
              </span>
              <span style={{ color: T.textFaint }}>
                {asset.theme?.slice(0, 16) ?? '—'}
              </span>
            </div>
          )
          : (
            <div style={{ fontSize: 9, color: T.textFaint, marginTop: 1 }}>
              empty — upload or generate
            </div>
          )
        }
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>

        {/* Upload button — always visible */}
        <button
          onClick={handleUploadClick}
          title={asset ? 'Replace with upload' : 'Upload image'}
          disabled={uploading}
          style={{
            width:      26,
            height:     26,
            borderRadius: 6,
            display:    'flex',
            alignItems: 'center',
            justifyContent:'center',
            background: uploading ? 'rgba(96,165,250,.12)' : 'rgba(96,165,250,.06)',
            border:     `1px solid ${uploading ? 'rgba(96,165,250,.4)' : 'rgba(96,165,250,.18)'}`,
            cursor:     uploading ? 'wait' : 'pointer',
            color:      uploading ? T.blue : 'rgba(96,165,250,.6)',
            flexShrink: 0,
          }}
        >
          {uploading
            ? <Loader2 size={11} style={{ animation: 'sf-spin 1s linear infinite' }} />
            : <Upload  size={11} />
          }
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Add + dropdown — only shown when an asset exists */}
        {asset && (
          <div ref={ddRef} style={{ position: 'relative', display: 'flex' }}>
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
                width:      16,
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
        )}
      </div>
    </div>
  )
}
