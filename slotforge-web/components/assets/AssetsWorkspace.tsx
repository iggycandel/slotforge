'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — ASSETS Workspace (3-panel layout)
//
// Left sidebar  (240 px) — asset-type navigator + batch actions
// Main area     (flex-1) — GenerationControlBar + 19-tile grid + SSE progress
// Right panel   (320 px) — Inspector / Prompt Editor / Feedback tabs
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Sparkles, ChevronLeft, LayoutGrid, Layers, Box,
  RefreshCw, Download, Loader2, CheckCircle2,
  XCircle, Wand2, ZapIcon, AlignLeft, MessageSquare,
  ChevronDown, ChevronUp, Eye, Upload,
} from 'lucide-react'
import type { AssetType, GeneratedAsset } from '@/types/assets'
import { ASSET_LABELS } from '@/types/assets'
import { GRAPHIC_STYLES } from '@/lib/ai/styles'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:       '#06060a',
  surface:  '#13131a',
  surfHigh: '#1a1a24',
  border:   'rgba(255,255,255,.06)',
  borderMed:'rgba(255,255,255,.1)',
  gold:     '#c9a84c',
  goldDark: '#9a7830',
  goldBg:   'rgba(201,168,76,.08)',
  tx:       '#eeede6',
  txMuted:  '#7a7a8a',
  txFaint:  '#44445a',
  green:    '#34d399',
  red:      '#f87171',
  blue:     '#60a5fa',
  font:     "'Inter','Space Grotesk',system-ui,sans-serif",
} as const

const TOOLBAR_H = 44
const SIDEBAR_W = 240
const PANEL_W   = 320

// ─── Asset group definitions ─────────────────────────────────────────────────

interface AssetGroup {
  id:         string
  label:      string
  types:      AssetType[]
  aspectRatio:'16/9' | '1/1'
  cols:       number
}

// ─── Special-symbol AssetType index mapping ───────────────────────────────────
const SPECIAL_TYPE_KEYS: AssetType[] = [
  'symbol_wild', 'symbol_scatter',
  'symbol_special_3', 'symbol_special_4', 'symbol_special_5', 'symbol_special_6',
]
const HIGH_TYPE_KEYS: AssetType[] = [
  'symbol_high_1','symbol_high_2','symbol_high_3','symbol_high_4',
  'symbol_high_5','symbol_high_6','symbol_high_7','symbol_high_8',
]
const LOW_TYPE_KEYS: AssetType[] = [
  'symbol_low_1','symbol_low_2','symbol_low_3','symbol_low_4',
  'symbol_low_5','symbol_low_6','symbol_low_7','symbol_low_8',
]

/** Build asset groups dynamically from projectMeta symbol configuration.
 *  Falls back to sensible defaults (5 high, 5 low, wild + scatter) when no meta is provided.
 */
function buildDynamicGroups(meta?: Record<string, unknown>): AssetGroup[] {
  const highCount    = Math.min(8, Math.max(1, Number(meta?.symbolHighCount    ?? 5)))
  const lowCount     = Math.min(8, Math.max(1, Number(meta?.symbolLowCount     ?? 5)))
  const specialCount = Math.min(6, Math.max(2, Number(meta?.symbolSpecialCount ?? 2)))
  const highNames    = (meta?.symbolHighNames    as string[] | undefined) ?? []
  const lowNames     = (meta?.symbolLowNames     as string[] | undefined) ?? []
  const specialNames = (meta?.symbolSpecialNames as string[] | undefined) ?? []

  return [
    {
      id: 'backgrounds', label: 'Backgrounds',
      types: ['background_base', 'background_bonus'],
      aspectRatio: '16/9', cols: 2,
    },
    {
      id: 'high_symbols',
      label: `High Symbols ${highCount > 0 ? `(${highCount})` : ''}`,
      types: HIGH_TYPE_KEYS.slice(0, highCount),
      aspectRatio: '1/1', cols: Math.min(highCount, 5),
      // Attach symbol names so tiles can show custom labels
      _names: highNames,
    } as AssetGroup & { _names: string[] },
    {
      id: 'low_symbols',
      label: `Low Symbols ${lowCount > 0 ? `(${lowCount})` : ''}`,
      types: LOW_TYPE_KEYS.slice(0, lowCount),
      aspectRatio: '1/1', cols: Math.min(lowCount, 5),
      _names: lowNames,
    } as AssetGroup & { _names: string[] },
    {
      id: 'specials',
      label: `Special Symbols ${specialCount > 0 ? `(${specialCount})` : ''}`,
      types: SPECIAL_TYPE_KEYS.slice(0, specialCount),
      aspectRatio: '1/1', cols: Math.min(specialCount, 5),
      _names: specialNames,
    } as AssetGroup & { _names: string[] },
    {
      id: 'ui_chrome', label: 'UI & Chrome',
      types: ['logo', 'character', 'reel_frame', 'spin_button', 'jackpot_label'],
      aspectRatio: '1/1', cols: 5,
    },
  ]
}

// Default static groups used before any projectMeta arrives
const DEFAULT_ASSET_GROUPS = buildDynamicGroups()

/** Build a flattened per-type label map from groups (includes custom symbol names). */
function buildShortLabels(groups: (AssetGroup & { _names?: string[] })[]): Partial<Record<AssetType, string>> {
  const out: Partial<Record<AssetType, string>> = {
    background_base:  'Base BG',
    background_bonus: 'Bonus BG',
    logo:             'Logo',
    character:        'Character',
    reel_frame:       'Reel Frame',
    spin_button:      'Spin Button',
    jackpot_label:    'Jackpot',
  }
  for (const g of groups) {
    const names = (g as AssetGroup & { _names?: string[] })._names ?? []
    g.types.forEach((t, i) => {
      out[t] = names[i] ?? ASSET_LABELS[t]
    })
  }
  return out
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a deduplicated asset map from a flat GeneratedAsset array (latest wins). */
function buildAssetMap(
  list: GeneratedAsset[]
): Partial<Record<AssetType, GeneratedAsset>> {
  const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const map: Partial<Record<AssetType, GeneratedAsset>> = {}
  for (const asset of sorted) {
    if (!map[asset.type]) map[asset.type] = asset
  }
  return map
}

/** Build per-type history list (newest-first, ALL versions) for version history UI. */
function buildAssetHistory(
  list: GeneratedAsset[]
): Partial<Record<AssetType, GeneratedAsset[]>> {
  const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const hist: Partial<Record<AssetType, GeneratedAsset[]>> = {}
  for (const asset of sorted) {
    if (!hist[asset.type]) hist[asset.type] = []
    hist[asset.type]!.push(asset)
  }
  return hist
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId:     string
  orgSlug:       string
  projectName:   string
  initialAssets: GeneratedAsset[]
  /** When true: no standalone toolbar, fill parent height, fetch existing assets from API on mount */
  inlineMode?:   boolean
  /** Called when user wants to return to the canvas (only used in inlineMode) */
  onBackToCanvas?: () => void
  /** Rich theme/art-direction meta forwarded from the editor's Project Settings panel */
  projectMeta?:  Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AssetsWorkspace({ projectId, orgSlug, projectName, initialAssets, inlineMode = false, onBackToCanvas, projectMeta }: Props) {
  // Asset state
  const [assets, setAssets] = useState<Partial<Record<AssetType, GeneratedAsset>>>(
    () => buildAssetMap(initialAssets)
  )
  const [assetHistory, setAssetHistory] = useState<Partial<Record<AssetType, GeneratedAsset[]>>>(
    () => buildAssetHistory(initialAssets)
  )

  // Selection & navigation
  const [selected,    setSelected]    = useState<AssetType | null>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [rightTab,    setRightTab]    = useState<'inspector' | 'prompt' | 'feedback'>('inspector')

  // Generation control
  const [theme,       setTheme]       = useState('')
  const [styleId,     setStyleId]     = useState<string>('')
  const [provider,    setProvider]    = useState<'openai' | 'mock'>('openai')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Batch generation
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 })
  const [batchLogs, setBatchLogs] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)

  // Single-asset regen
  const [regenTarget, setRegenTarget] = useState<AssetType | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')

  // Failed asset tracking — populated after each batch, cleared on next run
  const [failedTypes, setFailedTypes] = useState<Set<AssetType>>(new Set())

  // (asset tab removed — all assets shown in one unified grid)

  const addLog = useCallback((msg: string) => {
    setBatchLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)])
  }, [])

  // ─── Context persistence: load on mount, save before generate ──────────────

  useEffect(() => {
    fetch(`/api/project-context?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.context) return
        const ctx = data.context as { theme?: string; style_id?: string; provider?: string }
        if (ctx.theme)    setTheme(ctx.theme)
        if (ctx.style_id) setStyleId(ctx.style_id)
        if (ctx.provider === 'mock') setProvider('mock')
      })
      .catch(() => {/* non-fatal */})
  }, [projectId])

  // ─── Auto-populate theme from projectMeta when editor sends it ──────────────
  // Only fills the theme field if it's currently empty (don't overwrite what the
  // user has already typed). Derives a sensible default from gameName + themeKey.
  useEffect(() => {
    if (!projectMeta) return
    setTheme(prev => {
      if (prev.trim()) return prev   // already set — don't overwrite
      const parts: string[] = []
      if (projectMeta.gameName)  parts.push(String(projectMeta.gameName))
      if (projectMeta.themeKey && projectMeta.themeKey !== projectMeta.gameName)
        parts.push(String(projectMeta.themeKey))
      const derived = parts.join(' — ')
      return derived || prev
    })
  }, [projectMeta])

  // ─── Dynamic asset groups from symbol configuration ──────────────────────────
  // Recomputed whenever the editor sends updated symbol counts / names.
  const assetGroups = useMemo(() => buildDynamicGroups(projectMeta), [projectMeta])
  const shortLabels = useMemo(() => buildShortLabels(assetGroups as (AssetGroup & { _names?: string[] })[]), [assetGroups])

  // ─── In inline mode, pre-load existing assets from API (no server-side fetch) ─

  useEffect(() => {
    if (!inlineMode) return
    fetch(`/api/generate?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => {
        const list: GeneratedAsset[] = Array.isArray(d.assets) ? d.assets : []
        if (list.length > 0) {
          setAssets(buildAssetMap(list))
          setAssetHistory(buildAssetHistory(list))
        }
      })
      .catch(() => {/* non-fatal */})
  }, [projectId, inlineMode])

  const saveContext = useCallback((t: string, s: string, p: 'openai' | 'mock') => {
    fetch('/api/project-context', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ project_id: projectId, theme: t, style_id: s || undefined, provider: p }),
    }).catch(() => {/* non-fatal */})
  }, [projectId])

  // ─── Batch generation via SSE ───────────────────────────────────────────────

  /** Runs the generate pipeline. When `fillGaps` is true, only generates types
   *  that have no existing asset in the current `assets` map. */
  const runBatchGenerate = useCallback(async (fillGaps = false) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Compute which types to generate
    const allTypes  = assetGroups.flatMap(g => g.types)
    const targetTypes = fillGaps
      ? allTypes.filter(t => !assets[t])
      : allTypes

    if (targetTypes.length === 0) {
      addLog('All assets already generated — nothing to do.')
      return
    }

    setBatchRunning(true)
    setBatchProgress({ completed: 0, total: targetTypes.length })
    setBatchLogs([])
    setFailedTypes(new Set())       // clear previous failures before each run
    saveContext(theme, styleId, provider)
    addLog(fillGaps
      ? `Filling ${targetTypes.length} missing asset(s) for theme: "${theme || '(from project settings)'}"`
      : `Starting generation for theme: "${theme || '(from project settings)'}"`
    )

    try {
      const res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          theme:        theme.trim(),
          project_id:   projectId,
          provider,
          style_id:     styleId || undefined,
          project_meta: projectMeta ?? undefined,
          asset_types:  fillGaps ? targetTypes : undefined,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        addLog(`Error: ${err.error ?? 'Request failed'}`)
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data  = JSON.parse(dataMatch[1]) as any

          switch (event) {
            case 'start':
              setBatchProgress({ completed: 0, total: data.total })
              addLog(`Generating ${data.total} assets…`)
              break

            case 'progress':
              setBatchProgress({ completed: data.completed, total: data.total })
              addLog(`✓ ${data.lastType} (${data.completed}/${data.total})`)
              break

            case 'asset': {
              // Single asset streamed in — update tile immediately
              const a = data as GeneratedAsset
              setAssets(prev => ({ ...prev, [a.type]: a }))
              setAssetHistory(prev => ({ ...prev, [a.type]: [a, ...(prev[a.type] ?? [])] }))
              break
            }

            case 'complete':
              if (data.failed?.length) {
                addLog(`⚠ ${data.failed.length} asset(s) failed`)
                setFailedTypes(new Set(
                  (data.failed as Array<{ type: AssetType }>).map(f => f.type)
                ))
              }
              addLog(`✓ Generation complete — ${data.assets?.length ?? 0} assets ready`)
              break

            case 'error':
              addLog(`Error: ${data.message}`)
              break
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        addLog(`Error: ${err instanceof Error ? err.message : 'Generation failed'}`)
      }
    } finally {
      setBatchRunning(false)
    }
  }, [theme, projectId, provider, styleId, addLog, saveContext, assetGroups, assets])

  const handleGenerate      = useCallback(() => runBatchGenerate(false), [runBatchGenerate])
  const handleGenerateMissing = useCallback(() => runBatchGenerate(true),  [runBatchGenerate])

  // ─── Single-asset regeneration ──────────────────────────────────────────────

  const handleRegen = useCallback(async (assetType: AssetType, overridePrompt?: string) => {
    setRegenTarget(assetType)
    addLog(`Generating ${assetType}…`)

    try {
      const res = await fetch('/api/ai-single', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          asset_type:    assetType,
          theme:         theme.trim(),
          project_id:    projectId,
          provider,
          style_id:      styleId || undefined,
          custom_prompt: overridePrompt || undefined,
          project_meta:  projectMeta ?? undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        addLog(`Regen error: ${json.error ?? 'Failed'}`)
        return
      }

      const newAsset = json.asset as GeneratedAsset
      setAssets(prev => ({ ...prev, [assetType]: newAsset }))
      setAssetHistory(prev => ({ ...prev, [assetType]: [newAsset, ...(prev[assetType] ?? [])] }))
      setFailedTypes(prev => { const s = new Set(prev); s.delete(assetType); return s })
      setRightTab('inspector')
      addLog(`✓ Regenerated ${assetType}`)
    } catch (err) {
      addLog(`Regen error: ${err instanceof Error ? err.message : 'Failed'}`)
    } finally {
      setRegenTarget(null)
    }
  }, [theme, projectId, provider, styleId, addLog])

  // ─── User upload ─────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (assetType: AssetType, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('projectId', projectId)
    fd.append('assetKey', assetType)
    fd.append('theme', theme || 'custom')
    addLog(`Uploading ${assetType}…`)
    try {
      const res  = await fetch('/api/assets/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.error) { addLog(`Upload error: ${json.error ?? 'Failed'}`); return }
      const newAsset: GeneratedAsset = json.asset ?? {
        id:         crypto.randomUUID(),
        project_id: projectId,
        type:       assetType,
        url:        json.url,
        prompt:     'User uploaded image',
        theme:      theme || 'custom',
        provider:   'upload' as const,
        created_at: new Date().toISOString(),
      }
      setAssets(prev => ({ ...prev, [assetType]: newAsset }))
      setAssetHistory(prev => ({ ...prev, [assetType]: [newAsset, ...(prev[assetType] ?? [])] }))
      setSelected(assetType)
      setRightTab('inspector')
      addLog(`✓ Uploaded ${assetType}`)
    } catch (err) {
      addLog(`Upload error: ${err instanceof Error ? err.message : 'Failed'}`)
    }
  }, [projectId, theme, addLog])

  // ─── Version revert ─────────────────────────────────────────────────────────
  /** Swap the active version for a type to a historical one (client-side only). */
  const handleRevert = useCallback((assetType: AssetType, historicalAsset: GeneratedAsset) => {
    setAssets(prev => ({ ...prev, [assetType]: historicalAsset }))
    addLog(`↩ Reverted ${assetType} to version from ${timeAgo(historicalAsset.created_at)}`)
  }, [addLog])

  // ─── Computed values ────────────────────────────────────────────────────────

  const totalGenerated = Object.keys(assets).length
  const totalTypes     = assetGroups.reduce((acc, g) => acc + g.types.length, 0)
  const selectedAsset  = selected ? assets[selected] : null


  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display:    'flex',
      flexDirection: 'column',
      width:      inlineMode ? '100%' : '100vw',
      height:     inlineMode ? '100%' : '100vh',
      background: C.bg,
      color:      C.tx,
      fontFamily: C.font,
      overflow:   'hidden',
      flex:       inlineMode ? 1 : undefined,
    }}>

      {/* ── Global CSS ─────────────────────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.18); }
        .sf-tile:hover .sf-tile-actions { opacity: 1 !important; }
        .sf-tile:hover { border-color: rgba(255,255,255,.14) !important; }
        .sf-tile.selected { border-color: #c9a84c !important; box-shadow: 0 0 0 1px #c9a84c40 !important; }
        .sf-btn:hover { opacity: .85; }
        .sf-btn:active { opacity: .7; }
        .sf-tab:hover { background: rgba(255,255,255,.04) !important; }
        .sf-nav-item:hover { background: rgba(255,255,255,.04) !important; }
        .sf-nav-item.active { background: rgba(201,168,76,.1) !important; }
        .sf-style-card:hover { border-color: rgba(255,255,255,.2) !important; }
        .sf-style-card.active { border-color: #c9a84c !important; }
        .sf-input:focus { border-color: #c9a84c !important; outline: none; }
        textarea:focus { outline: none; border-color: #c9a84c !important; }
      `}</style>

      {/* ── Standalone toolbar — shown only when NOT embedded in the editor ── */}
      {!inlineMode && (
        <div style={{
          height:      TOOLBAR_H,
          minHeight:   TOOLBAR_H,
          display:     'flex',
          alignItems:  'center',
          padding:     '0 16px',
          gap:         12,
          borderBottom: `1px solid ${C.border}`,
          background:  C.surface,
          position:    'relative',
          zIndex:      10,
        }}>
          {/* Back to Canvas */}
          <Link href={`/${orgSlug}/projects/${projectId}`} style={{
            display:    'flex',
            alignItems: 'center',
            gap:        5,
            color:      C.txMuted,
            textDecoration: 'none',
            fontSize:   12,
            fontWeight: 500,
            padding:    '4px 8px',
            borderRadius: 6,
            border:     `1px solid ${C.border}`,
            transition: 'all .15s',
          }}
            className="sf-btn"
          >
            <ChevronLeft size={13} />
            Canvas
          </Link>

          <div style={{ width: 1, height: 20, background: C.border }} />

          <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: '.5px' }}>
            SLOTFORGE
          </span>
          <span style={{ fontSize: 12, color: C.txFaint }}>·</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.txMuted, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Assets
          </span>

          <div style={{ flex: 1 }} />

          <span style={{ fontSize: 12, color: C.txMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectName}
          </span>

          {totalGenerated > 0 && (
            <span style={{ fontSize: 11, color: C.gold, background: C.goldBg, border: `1px solid ${C.gold}30`, borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>
              {totalGenerated} / {totalTypes}
            </span>
          )}

          <button onClick={() => {}} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: C.txMuted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }} className="sf-btn">
            <Download size={12} />
            Export
          </button>
        </div>
      )}

      {/* ── Inline mode: compact back bar (no full toolbar) ───────────────── */}
      {inlineMode && (
        <div style={{
          height:      36,
          minHeight:   36,
          display:     'flex',
          alignItems:  'center',
          gap:         10,
          padding:     '0 14px',
          background:  C.surface,
          borderBottom: `1px solid ${C.border}`,
          flexShrink:  0,
        }}>
          <button
            onClick={onBackToCanvas}
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        5,
              fontSize:   11,
              fontWeight: 600,
              color:      C.txMuted,
              background: 'none',
              border:     `1px solid ${C.border}`,
              borderRadius: 6,
              padding:    '3px 8px',
              cursor:     'pointer',
            }}
            className="sf-btn"
          >
            <ChevronLeft size={11} />
            Canvas
          </button>

          <span style={{ fontSize: 11, color: C.txFaint }}>·</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Assets Workspace
          </span>

          <div style={{ flex: 1 }} />

          {totalGenerated > 0 && (
            <span style={{ fontSize: 10, color: C.gold, background: C.goldBg, border: `1px solid ${C.gold}30`, borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
              {totalGenerated} / {totalTypes}
            </span>
          )}
        </div>
      )}

      {/* ── Three-panel body ───────────────────────────────────────────────── */}
      <div style={{
        display:  'flex',
        flex:     1,
        overflow: 'hidden',
      }}>

        {/* ── LEFT SIDEBAR ────────────────────────────────────────────────── */}
        <LeftSidebar
          groups={assetGroups}
          assets={assets}
          activeGroup={activeGroup}
          onSelectGroup={setActiveGroup}
          batchRunning={batchRunning}
          onGenerateAll={handleGenerate}
          onGenerateMissing={handleGenerateMissing}
          missingCount={assetGroups.flatMap(g => g.types).filter(t => !assets[t]).length}
        />

        {/* ── MAIN AREA ───────────────────────────────────────────────────── */}
        <main style={{
          flex:      1,
          display:   'flex',
          flexDirection: 'column',
          overflow:  'hidden',
          borderLeft:  `1px solid ${C.border}`,
          borderRight: `1px solid ${C.border}`,
        }}>
          {/* Generation Control Bar */}
          <GenerationControlBar
            theme={theme}
            onThemeChange={setTheme}
            styleId={styleId}
            onStyleChange={setStyleId}
            provider={provider}
            onProviderChange={setProvider}
            generating={batchRunning}
            onGenerate={handleGenerate}
            onGenerateMissing={handleGenerateMissing}
            missingCount={assetGroups.flatMap(g => g.types).filter(t => !assets[t]).length}
            showAdvanced={showAdvanced}
            onToggleAdvanced={() => setShowAdvanced(v => !v)}
          />

          {/* SSE Progress Bar */}
          {batchRunning && (
            <BatchProgressBar
              completed={batchProgress.completed}
              total={batchProgress.total}
            />
          )}

          {/* Asset Grid (scrollable) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 40px' }}>
            {assetGroups.map(group => (
              <AssetGroupSection
                key={group.id}
                group={group}
                assets={assets}
                failedTypes={failedTypes}
                selectedType={selected}
                regenTarget={regenTarget}
                onSelect={type => {
                  setSelected(type)
                  setRightTab('inspector')
                  const existing = assets[type]
                  if (existing) setCustomPrompt(existing.prompt)
                  else setCustomPrompt('')
                }}
                onRegen={type => handleRegen(type)}
                onOpenPromptTab={type => {
                  setSelected(type)
                  setRightTab('prompt')
                  setCustomPrompt('')
                }}
                onUpload={(type, file) => handleUpload(type, file)}
                onRevert={(type, asset) => handleRevert(type, asset)}
                assetHistory={assetHistory}
                isActive={activeGroup === group.id}
                shortLabels={shortLabels}
              />
            ))}
          </div>
        </main>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
        <RightInspectorPanel
          selectedType={selected}
          selectedAsset={selectedAsset ?? undefined}
          rightTab={rightTab}
          onTabChange={setRightTab}
          customPrompt={customPrompt}
          onPromptChange={setCustomPrompt}
          regenTarget={regenTarget}
          theme={theme}
          onRegen={handleRegen}
          logs={batchLogs}
          shortLabels={shortLabels}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Left Sidebar
// ─────────────────────────────────────────────────────────────────────────────

interface LeftSidebarProps {
  groups:               AssetGroup[]
  assets:               Partial<Record<AssetType, GeneratedAsset>>
  activeGroup:          string | null
  onSelectGroup:        (id: string | null) => void
  batchRunning:         boolean
  onGenerateAll:        () => void
  onGenerateMissing:    () => void
  missingCount:         number
}

function LeftSidebar({
  groups, assets, activeGroup, onSelectGroup, batchRunning, onGenerateAll, onGenerateMissing, missingCount,
}: LeftSidebarProps) {
  const totalGenerated = Object.keys(assets).length
  const totalTypes     = groups.reduce((acc, g) => acc + g.types.length, 0)

  return (
    <aside style={{
      width:     SIDEBAR_W,
      minWidth:  SIDEBAR_W,
      display:   'flex',
      flexDirection: 'column',
      overflow:  'hidden',
      background: C.surface,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <LayoutGrid size={14} style={{ color: C.gold }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, letterSpacing: '.04em' }}>
            ASSET LIST
          </span>
        </div>
        {/* Overall progress pill */}
        <div style={{ marginTop: 8 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 10, color: C.txMuted, marginBottom: 4,
          }}>
            <span>{totalGenerated} of {totalTypes} generated</span>
            <span style={{ color: C.gold }}>
              {Math.round((totalGenerated / totalTypes) * 100)}%
            </span>
          </div>
          <div style={{ height: 3, background: C.surfHigh, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width:  `${(totalGenerated / totalTypes) * 100}%`,
              background: C.gold,
              borderRadius: 2,
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      </div>

      {/* Group Navigator */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {groups.map(group => {
          const filled  = group.types.filter(t => !!assets[t]).length
          const isActive = activeGroup === group.id
          return (
            <button
              key={group.id}
              onClick={() => onSelectGroup(isActive ? null : group.id)}
              className={`sf-nav-item${isActive ? ' active' : ''}`}
              style={{
                width:       '100%',
                display:     'flex',
                alignItems:  'center',
                gap:         10,
                padding:     '8px 10px',
                background:  isActive ? 'rgba(201,168,76,.1)' : 'transparent',
                border:      'none',
                borderRadius: 8,
                cursor:      'pointer',
                marginBottom: 2,
                color:       C.tx,
              }}
            >
              <GroupIcon groupId={group.id} active={isActive} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: isActive ? C.gold : C.tx }}>
                  {group.label}
                </div>
              </div>
              {/* Completion pill */}
              <span style={{
                fontSize:    10,
                fontWeight:  600,
                color:       filled === group.types.length ? C.green : C.txMuted,
                background:  filled === group.types.length ? 'rgba(52,211,153,.1)' : C.surfHigh,
                border:      `1px solid ${filled === group.types.length ? 'rgba(52,211,153,.2)' : 'transparent'}`,
                borderRadius: 10,
                padding:     '1px 6px',
                minWidth:    32,
                textAlign:   'center',
              }}>
                {filled}/{group.types.length}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Footer Actions */}
      <div style={{ padding: '12px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Fill gaps button — shown only when there are missing assets */}
        {missingCount > 0 && (
          <button
            onClick={onGenerateMissing}
            disabled={batchRunning}
            className="sf-btn"
            style={{
              display:     'flex',
              alignItems:  'center',
              justifyContent: 'center',
              gap:         6,
              padding:     '7px 0',
              background:  batchRunning ? C.surfHigh : 'rgba(52,211,153,.1)',
              color:       batchRunning ? C.txMuted : C.green,
              border:      `1px solid ${batchRunning ? 'transparent' : 'rgba(52,211,153,.25)'}`,
              borderRadius: 8,
              fontSize:    11,
              fontWeight:  700,
              cursor:      batchRunning ? 'not-allowed' : 'pointer',
              transition:  'all .15s',
            }}
          >
            <ZapIcon size={12} />
            Fill gaps ({missingCount})
          </button>
        )}
        <button
          onClick={onGenerateAll}
          disabled={batchRunning}
          className="sf-btn"
          style={{
            display:     'flex',
            alignItems:  'center',
            justifyContent: 'center',
            gap:         6,
            padding:     '8px 0',
            background:  batchRunning ? C.surfHigh : C.gold,
            color:       batchRunning ? C.txMuted : '#06060a',
            border:      'none',
            borderRadius: 8,
            fontSize:    12,
            fontWeight:  700,
            cursor:      batchRunning ? 'not-allowed' : 'pointer',
            transition:  'all .15s',
          }}
        >
          {batchRunning
            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
            : <><Sparkles size={13} /> Generate All</>
          }
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </aside>
  )
}

function GroupIcon({ groupId, active }: { groupId: string; active: boolean }) {
  const color = active ? '#c9a84c' : '#7a7a8a'
  const size  = 14
  const icons: Record<string, React.ReactNode> = {
    backgrounds:  <Layers    size={size} style={{ color }} />,
    high_symbols: <ZapIcon   size={size} style={{ color }} />,
    low_symbols:  <Box       size={size} style={{ color }} />,
    specials:     <Sparkles  size={size} style={{ color }} />,
    ui_chrome:    <LayoutGrid size={size} style={{ color }} />,
  }
  return <>{icons[groupId] ?? <Box size={size} style={{ color }} />}</>
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation Control Bar
// ─────────────────────────────────────────────────────────────────────────────

interface GenBarProps {
  theme:             string
  onThemeChange:     (v: string) => void
  styleId:           string
  onStyleChange:     (v: string) => void
  provider:          'openai' | 'mock'
  onProviderChange:  (v: 'openai' | 'mock') => void
  generating:        boolean
  onGenerate:        () => void
  onGenerateMissing: () => void
  missingCount:      number
  showAdvanced:      boolean
  onToggleAdvanced:  () => void
}

function GenerationControlBar({
  theme, onThemeChange, styleId, onStyleChange,
  provider, onProviderChange,
  generating, onGenerate, onGenerateMissing, missingCount,
  showAdvanced, onToggleAdvanced,
}: GenBarProps) {
  return (
    <div style={{
      padding:      '16px 24px',
      borderBottom: `1px solid ${C.border}`,
      background:   C.surface,
    }}>
      {/* Row 1: Theme input + Generate button */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder='Describe your game theme — e.g. "Ancient Egyptian Pharaoh"'
            value={theme}
            onChange={e => onThemeChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !generating) onGenerate() }}
            className="sf-input"
            style={{
              width:        '100%',
              padding:      '9px 14px',
              background:   C.surfHigh,
              border:       `1px solid ${C.border}`,
              borderRadius: 8,
              color:        C.tx,
              fontSize:     13,
              fontFamily:   C.font,
            }}
          />
        </div>

        {/* Provider toggle */}
        <div style={{
          display:     'flex',
          background:  C.surfHigh,
          border:      `1px solid ${C.border}`,
          borderRadius: 8,
          overflow:    'hidden',
        }}>
          {(['openai', 'mock'] as const).map(p => (
            <button
              key={p}
              onClick={() => onProviderChange(p)}
              className="sf-btn"
              style={{
                padding:   '6px 10px',
                fontSize:  11,
                fontWeight: 600,
                background: provider === p ? C.goldBg : 'transparent',
                color:     provider === p ? C.gold : C.txMuted,
                border:    'none',
                cursor:    'pointer',
                letterSpacing: '.04em',
              }}
            >
              {p === 'openai' ? 'AI' : 'Mock'}
            </button>
          ))}
        </div>

        {/* Advanced / style toggle */}
        <button
          onClick={onToggleAdvanced}
          className="sf-btn"
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        4,
            padding:    '7px 10px',
            background: showAdvanced ? C.goldBg : styleId ? 'rgba(201,168,76,.06)' : C.surfHigh,
            border:     `1px solid ${showAdvanced || styleId ? C.gold + '40' : C.border}`,
            borderRadius: 8,
            color:      showAdvanced || styleId ? C.gold : C.txMuted,
            fontSize:   11,
            cursor:     'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {styleId
            ? (() => {
                const s = GRAPHIC_STYLES.find(g => g.id === styleId)
                return s ? `${s.emoji} ${s.name}` : 'Style'
              })()
            : 'Style'
          }
        </button>

        {/* Fill gaps button */}
        {missingCount > 0 && (
          <button
            onClick={onGenerateMissing}
            disabled={generating}
            className="sf-btn"
            title={`Generate only the ${missingCount} missing asset(s)`}
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        5,
              padding:    '8px 12px',
              background: generating ? C.surfHigh : 'rgba(52,211,153,.1)',
              color:      generating ? C.txMuted : C.green,
              border:     `1px solid ${generating ? 'transparent' : 'rgba(52,211,153,.25)'}`,
              borderRadius: 8,
              fontSize:   12,
              fontWeight: 700,
              cursor:     generating ? 'not-allowed' : 'pointer',
              transition: 'all .15s',
              whiteSpace: 'nowrap',
            }}
          >
            <ZapIcon size={12} />
            Fill {missingCount}
          </button>
        )}

        {/* Generate All button */}
        <button
          onClick={onGenerate}
          disabled={generating}
          className="sf-btn"
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        6,
            padding:    '8px 18px',
            background: generating ? C.surfHigh : C.gold,
            color:      generating ? C.txMuted : '#06060a',
            border:     'none',
            borderRadius: 8,
            fontSize:   13,
            fontWeight: 700,
            cursor:     generating ? 'not-allowed' : 'pointer',
            transition: 'all .15s',
            whiteSpace: 'nowrap',
          }}
        >
          {generating
            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
            : <><Sparkles size={13} /> Generate All</>
          }
        </button>
      </div>

      {/* Row 2: StylePicker (collapsible) */}
      {showAdvanced && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: C.txMuted, marginBottom: 8, fontWeight: 600, letterSpacing: '.06em' }}>
            GRAPHIC STYLE
          </div>
          <StylePickerStrip selected={styleId} onSelect={onStyleChange} />
        </div>
      )}
    </div>
  )
}

// ─── Style Picker Strip ───────────────────────────────────────────────────────

function StylePickerStrip({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div style={{
      display:        'flex',
      gap:            8,
      overflowX:      'auto',
      paddingBottom:  4,
    }}>
      {/* "No style" card */}
      <button
        onClick={() => onSelect('')}
        className={`sf-style-card${!selected ? ' active' : ''}`}
        style={{
          flex:         '0 0 auto',
          width:        80,
          padding:      '8px 6px',
          background:   !selected ? C.goldBg : C.surfHigh,
          border:       `1px solid ${!selected ? C.gold : C.border}`,
          borderRadius: 8,
          cursor:       'pointer',
          color:        !selected ? C.gold : C.txMuted,
          fontSize:     11,
          fontWeight:   600,
          textAlign:    'center',
        }}
      >
        <div style={{ fontSize: 16, marginBottom: 3 }}>✦</div>
        Default
      </button>

      {GRAPHIC_STYLES.map(style => {
        const isActive = selected === style.id
        return (
          <button
            key={style.id}
            onClick={() => onSelect(style.id)}
            className={`sf-style-card${isActive ? ' active' : ''}`}
            style={{
              flex:         '0 0 auto',
              width:        80,
              padding:      '8px 6px',
              background:   isActive ? C.goldBg : style.cardGradient,
              border:       `1px solid ${isActive ? C.gold : 'rgba(255,255,255,.1)'}`,
              borderRadius: 8,
              cursor:       'pointer',
              color:        C.tx,
              fontSize:     10,
              fontWeight:   600,
              textAlign:    'center',
              boxShadow:    isActive ? `0 0 0 1px ${C.gold}50` : 'none',
              transition:   'all .15s',
            }}
          >
            <div style={{ fontSize: 16, marginBottom: 3 }}>{style.emoji}</div>
            <div style={{ color: isActive ? C.gold : '#ffffffcc', lineHeight: 1.2 }}>
              {style.name}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Progress Bar
// ─────────────────────────────────────────────────────────────────────────────

function BatchProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? (completed / total) * 100 : 0
  return (
    <div style={{
      padding:     '8px 24px',
      background:  C.surface,
      borderBottom: `1px solid ${C.border}`,
      display:     'flex',
      alignItems:  'center',
      gap:         12,
    }}>
      <Loader2 size={12} style={{ color: C.gold, animation: 'spin 1s linear infinite', flexShrink: 0 }} />
      <div style={{ flex: 1, height: 4, background: C.surfHigh, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height:     '100%',
          width:      `${pct}%`,
          background: `linear-gradient(90deg, ${C.gold} 0%, #e8c96d 100%)`,
          borderRadius: 2,
          transition: 'width .3s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color: C.txMuted, whiteSpace: 'nowrap' }}>
        {completed} / {total}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Group Section
// ─────────────────────────────────────────────────────────────────────────────

interface AssetGroupSectionProps {
  group:           AssetGroup
  assets:          Partial<Record<AssetType, GeneratedAsset>>
  failedTypes:     Set<AssetType>
  assetHistory:    Partial<Record<AssetType, GeneratedAsset[]>>
  selectedType:    AssetType | null
  regenTarget:     AssetType | null
  onSelect:        (type: AssetType) => void
  onRegen:         (type: AssetType) => void
  onOpenPromptTab: (type: AssetType) => void
  onUpload:        (type: AssetType, file: File) => void
  onRevert:        (type: AssetType, asset: GeneratedAsset) => void
  isActive:        boolean
  shortLabels:     Partial<Record<AssetType, string>>
}

function AssetGroupSection({
  group, assets, failedTypes, assetHistory, selectedType, regenTarget, onSelect, onRegen, onOpenPromptTab, onUpload, onRevert, isActive, shortLabels,
}: AssetGroupSectionProps) {
  const filledCount = group.types.filter(t => !!assets[t]).length

  return (
    <div
      id={`group-${group.id}`}
      style={{ marginBottom: 32 }}
    >
      {/* Group header */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${isActive ? C.gold + '30' : C.border}`,
      }}>
        <span style={{
          fontSize:   12,
          fontWeight: 700,
          color:      isActive ? C.gold : C.tx,
          letterSpacing: '.04em',
        }}>
          {group.label.toUpperCase()}
        </span>
        <span style={{
          fontSize: 10,
          color:    filledCount === group.types.length ? C.green : C.txMuted,
          fontWeight: 600,
        }}>
          {filledCount}/{group.types.length}
        </span>
        {filledCount === group.types.length && (
          <CheckCircle2 size={12} style={{ color: C.green }} />
        )}
      </div>

      {/* Tile grid */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: `repeat(${group.cols}, 1fr)`,
        gap:                 12,
      }}>
        {group.types.map(type => (
          <AssetTile
            key={type}
            assetType={type}
            asset={assets[type]}
            history={assetHistory[type]}
            isSelected={selectedType === type}
            isRegenerating={regenTarget === type}
            isFailed={failedTypes.has(type)}
            aspectRatio={group.aspectRatio}
            onSelect={() => onSelect(type)}
            onRegen={() => onRegen(type)}
            onOpenPromptTab={() => onOpenPromptTab(type)}
            onUpload={(file) => onUpload(type, file)}
            onRevert={(a) => onRevert(type, a)}
            label={shortLabels[type]}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Tile
// ─────────────────────────────────────────────────────────────────────────────

interface AssetTileProps {
  assetType:       AssetType
  asset?:          GeneratedAsset
  history?:        GeneratedAsset[]
  isSelected:      boolean
  isRegenerating:  boolean
  isFailed?:       boolean
  aspectRatio:     '16/9' | '1/1'
  onSelect:        () => void
  onRegen:         () => void
  onOpenPromptTab: () => void
  onUpload:        (file: File) => void
  onRevert:        (asset: GeneratedAsset) => void
  label?:          string
}

function AssetTile({
  assetType, asset, history, isSelected, isRegenerating, isFailed, aspectRatio, onSelect, onRegen, onOpenPromptTab, onUpload, onRevert, label: labelProp,
}: AssetTileProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [showHistory, setShowHistory] = useState(false)
  const label = labelProp ?? ASSET_LABELS[assetType] ?? assetType
  // Previous versions = history minus the current active asset
  const prevVersions = history?.filter(h => h.id !== asset?.id) ?? []

  // Border colour: gold=selected, red=failed, default otherwise
  const borderColor = isSelected ? C.gold : isFailed ? C.red : C.border

  return (
    <div
      className={`sf-tile${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
      style={{
        position:    'relative',
        aspectRatio: aspectRatio,
        background:  C.surfHigh,
        border:      `1px solid ${borderColor}`,
        borderRadius: 10,
        overflow:    'hidden',
        cursor:      'pointer',
        transition:  'border-color .15s',
        boxShadow:   isSelected ? `0 0 0 1px ${C.gold}40` : isFailed ? `0 0 0 1px ${C.red}30` : 'none',
      }}
    >
      {/* Image / placeholder */}
      {asset?.url ? (
        <img
          src={asset.url}
          alt={label}
          style={{
            width:      '100%',
            height:     '100%',
            objectFit:  'cover',
            display:    'block',
          }}
        />
      ) : isFailed ? (
        <FailedTilePlaceholder label={label} onRetry={e => { e.stopPropagation(); onRegen() }} />
      ) : (
        <EmptyTilePlaceholder label={label} isRegenerating={isRegenerating} />
      )}

      {/* Regenerating overlay */}
      {isRegenerating && (
        <div style={{
          position:   'absolute',
          inset:      0,
          background: 'rgba(6,6,10,.75)',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 6,
        }}>
          <Loader2 size={18} style={{ color: C.gold, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 10, color: C.gold }}>Generating…</span>
        </div>
      )}

      {/* Hover actions overlay */}
      {!isRegenerating && (
        <div
          className="sf-tile-actions"
          style={{
            position:   'absolute',
            inset:      0,
            background: asset ? 'rgba(6,6,10,.7)' : 'rgba(6,6,10,.55)',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap:        8,
            opacity:    0,
            transition: 'opacity .15s',
          }}
        >
              {/* Hidden file input — used for both Replace and Upload */}
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) { onUpload(f); e.target.value = '' }
            }}
          />

          {asset ? (
            <>
              <button
                onClick={e => { e.stopPropagation(); onSelect() }}
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        4,
                  padding:    '5px 8px',
                  background: 'rgba(255,255,255,.1)',
                  border:     '1px solid rgba(255,255,255,.15)',
                  borderRadius: 6,
                  color:      C.tx,
                  fontSize:   10,
                  fontWeight: 600,
                  cursor:     'pointer',
                }}
              >
                <Eye size={10} />
                Inspect
              </button>
              {/* Uploaded assets get Replace; generated assets get Regen */}
              {asset.provider === 'upload' ? (
                <button
                  onClick={e => { e.stopPropagation(); uploadInputRef.current?.click() }}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        4,
                    padding:    '5px 8px',
                    background: 'rgba(96,165,250,.12)',
                    border:     '1px solid rgba(96,165,250,.3)',
                    borderRadius: 6,
                    color:      '#60a5fa',
                    fontSize:   10,
                    fontWeight: 600,
                    cursor:     'pointer',
                  }}
                >
                  <Upload size={10} />
                  Replace
                </button>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); onRegen() }}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        4,
                    padding:    '5px 8px',
                    background: C.goldBg,
                    border:     `1px solid ${C.gold}40`,
                    borderRadius: 6,
                    color:      C.gold,
                    fontSize:   10,
                    fontWeight: 600,
                    cursor:     'pointer',
                  }}
                >
                  <RefreshCw size={10} />
                  Regen
                </button>
              )}
            </>
          ) : (
            /* Empty tile: Generate (opens prompt panel) + Upload */
            <>
              <button
                onClick={e => { e.stopPropagation(); onOpenPromptTab() }}
                style={{
                  display:       'flex',
                  flexDirection: 'column',
                  alignItems:    'center',
                  gap:           5,
                  padding:       '8px 12px',
                  background:    C.gold,
                  border:        'none',
                  borderRadius:  8,
                  color:         '#06060a',
                  fontSize:      11,
                  fontWeight:    700,
                  cursor:        'pointer',
                }}
              >
                <Sparkles size={13} />
                Generate
              </button>
              <button
                onClick={e => { e.stopPropagation(); uploadInputRef.current?.click() }}
                style={{
                  display:       'flex',
                  flexDirection: 'column',
                  alignItems:    'center',
                  gap:           5,
                  padding:       '8px 12px',
                  background:    'rgba(255,255,255,.08)',
                  border:        '1px solid rgba(255,255,255,.15)',
                  borderRadius:  8,
                  color:         '#ccc',
                  fontSize:      11,
                  fontWeight:    600,
                  cursor:        'pointer',
                }}
              >
                <Upload size={13} />
                Upload
              </button>
            </>
          )}
        </div>
      )}

      {/* Label strip */}
      <div style={{
        position:   'absolute',
        bottom:     0,
        left:       0,
        right:      0,
        padding:    '4px 6px',
        background: 'linear-gradient(transparent, rgba(6,6,10,.9))',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap:        4,
      }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: asset ? C.tx : C.txMuted, letterSpacing: '.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {asset && (
          <span style={{
            fontSize:     8,
            fontWeight:   600,
            color:        asset.provider === 'upload' ? '#60a5fa' : C.txFaint,
            background:   asset.provider === 'upload' ? 'rgba(96,165,250,.15)' : 'transparent',
            border:       asset.provider === 'upload' ? '1px solid rgba(96,165,250,.25)' : 'none',
            borderRadius: 3,
            padding:      asset.provider === 'upload' ? '0 3px' : 0,
            lineHeight:   '14px',
            flexShrink:   0,
          }}>
            {asset.provider === 'upload' ? '↑' : '✦'}
          </span>
        )}
      </div>

      {/* Generated checkmark */}
      {asset && !isRegenerating && (
        <div style={{
          position:   'absolute',
          top:        5,
          right:      5,
          width:      14,
          height:     14,
          background: C.green,
          borderRadius: '50%',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <CheckCircle2 size={9} style={{ color: '#000' }} />
        </div>
      )}

      {/* History badge — shown when multiple versions exist */}
      {prevVersions.length > 0 && !isRegenerating && (
        <button
          title={`${prevVersions.length} previous version${prevVersions.length > 1 ? 's' : ''}`}
          onClick={e => { e.stopPropagation(); setShowHistory(v => !v) }}
          style={{
            position:   'absolute',
            top:        5,
            left:       5,
            padding:    '1px 5px',
            background: showHistory ? 'rgba(201,168,76,.3)' : 'rgba(0,0,0,.55)',
            border:     `1px solid ${showHistory ? C.gold : 'rgba(255,255,255,.15)'}`,
            borderRadius: 4,
            color:      showHistory ? C.gold : C.txMuted,
            fontSize:   8,
            fontWeight: 700,
            cursor:     'pointer',
            lineHeight: '14px',
            letterSpacing: '.04em',
          }}
        >
          v{prevVersions.length + 1}
        </button>
      )}

      {/* History overlay panel */}
      {showHistory && prevVersions.length > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position:   'absolute',
            inset:      0,
            background: 'rgba(6,6,10,.92)',
            display:    'flex',
            flexDirection: 'column',
            padding:    8,
            zIndex:     10,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.gold, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              History
            </span>
            <button
              onClick={e => { e.stopPropagation(); setShowHistory(false) }}
              style={{ background: 'none', border: 'none', color: C.txMuted, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}
            >×</button>
          </div>
          {/* Version thumbnails */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, overflowY: 'auto' }}>
            {/* Current version first */}
            {asset && (
              <div style={{ position: 'relative', width: 38, height: 38 }}>
                <img
                  src={asset.url}
                  alt="current"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, border: `1px solid ${C.green}`, opacity: 1 }}
                />
                <div style={{ position: 'absolute', bottom: 1, left: 1, right: 1, fontSize: 6, color: C.green, textAlign: 'center', fontWeight: 700 }}>
                  current
                </div>
              </div>
            )}
            {prevVersions.slice(0, 8).map(v => (
              <button
                key={v.id}
                title={`Restore version from ${timeAgo(v.created_at)}`}
                onClick={e => { e.stopPropagation(); onRevert(v); setShowHistory(false) }}
                style={{ padding: 0, border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden', width: 38, height: 38, cursor: 'pointer', background: 'none', flexShrink: 0 }}
              >
                <img src={v.url} alt={timeAgo(v.created_at)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 8, color: C.txFaint, textAlign: 'center' }}>
            Click any thumbnail to restore
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyTilePlaceholder({ label, isRegenerating }: { label: string; isRegenerating: boolean }) {
  return (
    <div style={{
      width:          '100%',
      height:         '100%',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            6,
      color:          C.txFaint,
      background:     'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,.013) 6px, rgba(255,255,255,.013) 12px)',
    }}>
      {isRegenerating
        ? <Loader2 size={18} style={{ color: C.gold, animation: 'spin 1s linear infinite' }} />
        : <Sparkles size={14} style={{ opacity: .3, color: C.gold }} />
      }
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.04em', textAlign: 'center', padding: '0 4px', color: C.txMuted }}>
        {label}
      </span>
      {!isRegenerating && (
        <span style={{ fontSize: 8, color: C.txFaint, letterSpacing: '.04em' }}>Hover to generate</span>
      )}
    </div>
  )
}

function FailedTilePlaceholder({ label, onRetry }: { label: string; onRetry: (e: React.MouseEvent) => void }) {
  return (
    <div style={{
      width:          '100%',
      height:         '100%',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            6,
      background:     'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(248,113,113,.025) 6px, rgba(248,113,113,.025) 12px)',
    }}>
      <XCircle size={16} style={{ color: C.red, opacity: .7 }} />
      <span style={{ fontSize: 9, fontWeight: 600, color: C.red, opacity: .8, letterSpacing: '.04em', textAlign: 'center', padding: '0 6px' }}>
        {label}
      </span>
      <button
        onClick={onRetry}
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        4,
          padding:    '4px 8px',
          background: 'rgba(248,113,113,.12)',
          border:     '1px solid rgba(248,113,113,.3)',
          borderRadius: 5,
          color:      C.red,
          fontSize:   9,
          fontWeight: 700,
          cursor:     'pointer',
          letterSpacing: '.04em',
        }}
      >
        <RefreshCw size={9} />
        Retry
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Right Inspector Panel
// ─────────────────────────────────────────────────────────────────────────────

type RightTab = 'inspector' | 'prompt' | 'feedback'

interface RightPanelProps {
  selectedType?:  AssetType | null
  selectedAsset?: GeneratedAsset
  rightTab:       RightTab
  onTabChange:    (tab: RightTab) => void
  customPrompt:   string
  onPromptChange: (v: string) => void
  regenTarget:    AssetType | null
  theme:          string
  onRegen:        (type: AssetType, prompt?: string) => void
  logs:           string[]
  shortLabels:    Partial<Record<AssetType, string>>
}

function RightInspectorPanel({
  selectedType, selectedAsset, rightTab, onTabChange,
  customPrompt, onPromptChange,
  regenTarget, theme, onRegen, logs, shortLabels,
}: RightPanelProps) {
  const TABS: { id: RightTab; label: string; icon: React.ReactNode }[] = [
    { id: 'inspector', label: 'Inspector', icon: <Eye size={12} /> },
    { id: 'prompt',    label: 'Prompt',    icon: <AlignLeft size={12} /> },
    { id: 'feedback',  label: 'Activity',  icon: <MessageSquare size={12} /> },
  ]

  return (
    <aside style={{
      width:    PANEL_W,
      minWidth: PANEL_W,
      display:  'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: C.surface,
    }}>
      {/* Tab bar */}
      <div style={{
        display:     'flex',
        borderBottom: `1px solid ${C.border}`,
        padding:     '0 8px',
        gap:         2,
        paddingTop:  8,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="sf-tab"
            style={{
              flex:        1,
              display:     'flex',
              alignItems:  'center',
              justifyContent: 'center',
              gap:         5,
              padding:     '6px 0',
              background:  rightTab === tab.id ? C.surfHigh : 'transparent',
              border:      'none',
              borderRadius: '6px 6px 0 0',
              color:       rightTab === tab.id ? C.tx : C.txMuted,
              fontSize:    11,
              fontWeight:  600,
              cursor:      'pointer',
              borderBottom: rightTab === tab.id ? `2px solid ${C.gold}` : '2px solid transparent',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Inspector Tab */}
        {rightTab === 'inspector' && (
          <InspectorTab
            selectedType={selectedType ?? null}
            selectedAsset={selectedAsset}
            regenTarget={regenTarget}
            theme={theme}
            onRegen={onRegen}
            shortLabels={shortLabels}
          />
        )}

        {/* Prompt Editor Tab */}
        {rightTab === 'prompt' && (
          <PromptTab
            selectedType={selectedType ?? null}
            selectedAsset={selectedAsset}
            customPrompt={customPrompt}
            onPromptChange={onPromptChange}
            regenTarget={regenTarget}
            theme={theme}
            onRegen={onRegen}
            shortLabels={shortLabels}
          />
        )}

        {/* Activity / Feedback Tab */}
        {rightTab === 'feedback' && (
          <FeedbackTab logs={logs} />
        )}
      </div>
    </aside>
  )
}

// ─── Inspector Tab ────────────────────────────────────────────────────────────

function InspectorTab({
  selectedType, selectedAsset, regenTarget, theme, onRegen, shortLabels,
}: {
  selectedType:  AssetType | null
  selectedAsset?: GeneratedAsset
  regenTarget:   AssetType | null
  theme:         string
  onRegen:       (type: AssetType) => void
  shortLabels:   Partial<Record<AssetType, string>>
}) {
  if (!selectedType) {
    return (
      <div style={{
        display:  'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', minHeight: 300,
        padding: 24, textAlign: 'center', color: C.txMuted,
      }}>
        <Eye size={28} style={{ opacity: .3, marginBottom: 12 }} />
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>Select an asset to inspect</p>
        <p style={{ fontSize: 11, margin: '6px 0 0', color: C.txFaint }}>
          Click any tile in the grid
        </p>
      </div>
    )
  }

  const label = shortLabels[selectedType] ?? ASSET_LABELS[selectedType] ?? selectedType
  const isRegen = regenTarget === selectedType

  return (
    <div style={{ padding: 16 }}>
      {/* Preview */}
      <div style={{
        aspectRatio: '1/1',
        background:  C.surfHigh,
        borderRadius: 10,
        overflow:    'hidden',
        marginBottom: 14,
        border:      `1px solid ${C.border}`,
      }}>
        {selectedAsset?.url
          ? <img src={selectedAsset.url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.txFaint }}>
              <Wand2 size={24} style={{ opacity: .4 }} />
            </div>
          )
        }
      </div>

      {/* Metadata */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: C.tx }}>
          {label}
        </h3>
        {selectedAsset ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <MetaRow label="Type"     value={selectedType} />
            <MetaRow label="Provider" value={selectedAsset.provider} accent />
            <MetaRow label="Theme"    value={selectedAsset.theme} />
            <MetaRow label={selectedAsset.provider === 'upload' ? 'Uploaded' : 'Generated'} value={timeAgo(selectedAsset.created_at)} />
          </div>
        ) : (
          <p style={{ fontSize: 12, color: C.txMuted, margin: 0 }}>Not yet generated</p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => onRegen(selectedType)}
          disabled={isRegen}
          className="sf-btn"
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            6,
            padding:        '9px 0',
            background:     isRegen ? C.surfHigh : C.goldBg,
            border:         `1px solid ${isRegen ? C.border : C.gold + '50'}`,
            borderRadius:   8,
            color:          isRegen ? C.txMuted : C.gold,
            fontSize:       12,
            fontWeight:     700,
            cursor:         isRegen ? 'not-allowed' : 'pointer',
          }}
        >
          {isRegen
            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
            : <><RefreshCw size={13} /> Generate</>
          }
        </button>

        {selectedAsset && (
          <a
            href={selectedAsset.url}
            download={`${selectedType}.png`}
            target="_blank"
            rel="noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            6,
              padding:        '8px 0',
              background:     C.surfHigh,
              border:         `1px solid ${C.border}`,
              borderRadius:   8,
              color:          C.txMuted,
              fontSize:       12,
              fontWeight:     600,
              textDecoration: 'none',
            }}
          >
            <Download size={13} />
            Download PNG
          </a>
        )}
      </div>
    </div>
  )
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, color: C.txMuted, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize:   11,
        fontWeight: 600,
        color:      accent ? C.gold : C.tx,
        background: accent ? C.goldBg : 'transparent',
        padding:    accent ? '1px 6px' : '0',
        borderRadius: accent ? 4 : 0,
        maxWidth:   160,
        overflow:   'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textAlign:  'right',
      }}>
        {value}
      </span>
    </div>
  )
}

// ─── Prompt Tab ───────────────────────────────────────────────────────────────

function PromptTab({
  selectedType, selectedAsset, customPrompt, onPromptChange,
  regenTarget, theme, onRegen, shortLabels,
}: {
  selectedType:  AssetType | null
  selectedAsset?: GeneratedAsset
  customPrompt:  string
  onPromptChange:(v: string) => void
  regenTarget:   AssetType | null
  theme:         string
  onRegen:       (type: AssetType, prompt?: string) => void
  shortLabels:   Partial<Record<AssetType, string>>
}) {
  if (!selectedType) {
    return (
      <div style={{
        display:  'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', minHeight: 300,
        padding: 24, textAlign: 'center', color: C.txMuted,
      }}>
        <AlignLeft size={28} style={{ opacity: .3, marginBottom: 12 }} />
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>Select an asset to edit its prompt</p>
      </div>
    )
  }

  const isRegen = regenTarget === selectedType
  const label   = shortLabels[selectedType] ?? ASSET_LABELS[selectedType] ?? selectedType

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: C.tx }}>{label}</h3>
        <p style={{ margin: 0, fontSize: 11, color: C.txMuted }}>
          Edit the prompt below, then generate this asset.
        </p>
      </div>

      {/* Original prompt (read-only info) */}
      {selectedAsset?.prompt && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: C.txFaint, marginBottom: 4, letterSpacing: '.06em' }}>
            LAST USED PROMPT
          </div>
          <div style={{
            padding:    '8px 10px',
            background: C.surfHigh,
            border:     `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize:   10,
            color:      C.txMuted,
            lineHeight: 1.5,
            maxHeight:  80,
            overflowY:  'auto',
          }}>
            {selectedAsset.prompt}
          </div>
        </div>
      )}

      {/* Custom prompt textarea */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.txFaint, marginBottom: 4, letterSpacing: '.06em' }}>
          CUSTOM PROMPT (OPTIONAL)
        </div>
        <textarea
          value={customPrompt}
          onChange={e => onPromptChange(e.target.value)}
          placeholder={`Describe what you want for the ${label}…`}
          rows={5}
          style={{
            width:        '100%',
            padding:      '8px 10px',
            background:   C.surfHigh,
            border:       `1px solid ${C.border}`,
            borderRadius: 6,
            color:        C.tx,
            fontSize:     12,
            fontFamily:   C.font,
            lineHeight:   1.5,
            resize:       'vertical',
          }}
        />
        <p style={{ margin: '4px 0 0', fontSize: 10, color: C.txFaint }}>
          Leave blank to use the auto-generated prompt
        </p>
      </div>

      <button
        onClick={() => onRegen(selectedType, customPrompt || undefined)}
        disabled={isRegen}
        className="sf-btn"
        style={{
          width:          '100%',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            6,
          padding:        '9px 0',
          background:     isRegen ? C.surfHigh : C.gold,
          border:         'none',
          borderRadius:   8,
          color:          isRegen ? C.txMuted : '#06060a',
          fontSize:       12,
          fontWeight:     700,
          cursor:         isRegen ? 'not-allowed' : 'pointer',
        }}
      >
        {isRegen
          ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
          : <><Wand2 size={13} /> {customPrompt ? 'Generate with custom prompt' : 'Generate'}</>
        }
      </button>
    </div>
  )
}

// ─── Feedback / Activity Tab ──────────────────────────────────────────────────

function FeedbackTab({ logs }: { logs: string[] }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{
        fontSize:     10,
        color:        C.txFaint,
        marginBottom: 10,
        letterSpacing:'.06em',
        fontWeight:   700,
      }}>
        GENERATION ACTIVITY
      </div>

      {logs.length === 0 ? (
        <div style={{
          display:   'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '32px 16px', textAlign: 'center',
        }}>
          <MessageSquare size={24} style={{ color: C.txFaint, marginBottom: 8, opacity: .4 }} />
          <p style={{ fontSize: 12, color: C.txMuted, margin: 0 }}>No activity yet</p>
          <p style={{ fontSize: 11, color: C.txFaint, margin: '4px 0 0' }}>
            Start generating to see logs here
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {logs.map((log, i) => {
            const isError = log.includes('Error') || log.includes('⚠')
            const isGood  = log.includes('✓')
            return (
              <div key={i} style={{
                padding:    '5px 8px',
                background: C.surfHigh,
                borderLeft: `2px solid ${isError ? C.red : isGood ? C.green : C.border}`,
                borderRadius: '0 4px 4px 0',
                fontSize:   10,
                color:      isError ? C.red : isGood ? C.green : C.txMuted,
                lineHeight: 1.4,
                fontFamily: "'DM Mono', monospace",
              }}>
                {log}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
