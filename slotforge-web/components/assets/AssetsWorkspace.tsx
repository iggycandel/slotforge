'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — ASSETS Workspace (3-panel layout)
//
// Left sidebar  (240 px) — asset-type navigator + batch actions
// Main area     (flex-1) — GenerationControlBar + 19-tile grid + SSE progress
// Right panel   (320 px) — Inspector / Prompt Editor / Feedback tabs
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Sparkles, ChevronLeft, LayoutGrid, Layers, Box,
  RefreshCw, Download, Loader2, CheckCircle2,
  XCircle, Wand2, ZapIcon, AlignLeft, MessageSquare,
  Eye, Upload, X, FileText,
} from 'lucide-react'
import type { AssetType, GeneratedAsset } from '@/types/assets'
import { ASSET_LABELS } from '@/types/assets'
import type { FeatureDef, FeatureId, AssetSlot } from '@/types/features'
import { activeAssetSlots } from '@/types/features'
import { FEATURE_REGISTRY } from '@/lib/features/registry'
import { GRAPHIC_STYLES } from '@/lib/ai/styles'
import { SingleGeneratePopup } from '@/components/generate/SingleGeneratePopup'
import { ReviewPromptsModal, readPromptOverrides, type ReviewSlot } from '@/components/generate/ReviewPromptsModal'
import { StyleIcon } from '@/components/generate/StyleIcon'

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

// ─── Feature slot key set — derived once from the registry ──────────────────
// Used to separate feature-namespaced assets (e.g. "bonuspick.bg") from
// legacy AssetType entries when both arrive in the same /api/generate list.
const FEATURE_SLOT_KEYS: Set<string> = new Set(
  Object.values(FEATURE_REGISTRY).flatMap(def => def.assetSlots.map(s => s.key))
)

/** Build a deduplicated asset map from a flat GeneratedAsset array (latest wins).
 *  Feature-slot assets are excluded — those are tracked separately in
 *  `featureAssets` so the sidebar's base-type counts don't get inflated. */
function buildAssetMap(
  list: GeneratedAsset[]
): Partial<Record<AssetType, GeneratedAsset>> {
  const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const map: Partial<Record<AssetType, GeneratedAsset>> = {}
  for (const asset of sorted) {
    if (FEATURE_SLOT_KEYS.has(asset.type)) continue
    if (!map[asset.type]) map[asset.type] = asset
  }
  return map
}

/** Latest asset per feature slot key (e.g. "bonuspick.bg" → GeneratedAsset). */
function buildFeatureAssetMap(list: GeneratedAsset[]): Record<string, GeneratedAsset> {
  const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const map: Record<string, GeneratedAsset> = {}
  for (const asset of sorted) {
    if (FEATURE_SLOT_KEYS.has(asset.type) && !map[asset.type]) {
      map[asset.type] = asset
    }
  }
  return map
}

interface FeatureSlotGroup {
  featureId: FeatureId
  label:     string
  slots:     AssetSlot[]
}
/** Build feature slot groups for every feature enabled in projectMeta.features. */
function buildFeatureSlotGroups(meta?: Record<string, unknown>): FeatureSlotGroup[] {
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

/** Build per-type history list (newest-first, ALL versions) for version history UI.
 *  Skips feature-slot assets so the base-type history stays clean. */
function buildAssetHistory(
  list: GeneratedAsset[]
): Partial<Record<AssetType, GeneratedAsset[]>> {
  const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const hist: Partial<Record<AssetType, GeneratedAsset[]>> = {}
  for (const asset of sorted) {
    if (FEATURE_SLOT_KEYS.has(asset.type)) continue
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
  /** Whether the current plan allows exporting/downloading assets (default: false for safety) */
  exportsEnabled?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AssetsWorkspace({ projectId, orgSlug, projectName, initialAssets, inlineMode = false, onBackToCanvas, projectMeta, exportsEnabled = false }: Props) {
  // Route params (for billing page link)
  const params = useParams<{ orgSlug: string }>()
  const routeSlug = orgSlug ?? params?.orgSlug ?? ''

  // Gate modal — shown when plan or credits block generation
  const [gateModal, setGateModal] = useState<{ type: 'upgrade' | 'credits' } | null>(null)

  // Asset state
  const [assets, setAssets] = useState<Partial<Record<AssetType, GeneratedAsset>>>(
    () => buildAssetMap(initialAssets)
  )
  const [assetHistory, setAssetHistory] = useState<Partial<Record<AssetType, GeneratedAsset[]>>>(
    () => buildAssetHistory(initialAssets)
  )
  // Feature slot assets — parallel map keyed by namespaced slot key ("bonuspick.bg").
  // Kept separate from `assets` so the existing AssetType-typed code paths stay intact.
  const [featureAssets, setFeatureAssets] = useState<Record<string, GeneratedAsset>>(
    () => buildFeatureAssetMap(initialAssets)
  )

  // Selection & navigation
  // `selected` stores either a base AssetType (e.g. "bg_splash") or a
  // feature-slot key (e.g. "freespins.bg"). Inspector + Prompt tabs detect
  // which by checking FEATURE_SLOT_KEYS and route label/regen accordingly.
  const [selected,    setSelected]    = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [rightTab,    setRightTab]    = useState<'inspector' | 'prompt' | 'feedback'>('inspector')

  // Generation control
  const [theme,       setTheme]       = useState('')
  const [styleId,     setStyleId]     = useState<string>('')
  const [provider,    setProvider]    = useState<'openai' | 'mock'>('openai')
  // showAdvanced was the toggle that gated the style picker — removed
  // when the picker became always-visible. Kept the variable declaration
  // eliminated here rather than above to keep this diff focused.

  // Batch generation
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 })
  const [batchLogs, setBatchLogs] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)

  // Single-asset regen
  const [regenTarget, setRegenTarget] = useState<AssetType | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')

  // Slot the single-asset regenerate popup (Popup A) is open for.
  // null = closed. Holds both legacy AssetType keys and feature slot keys.
  const [popupSlot, setPopupSlot] = useState<{
    key:    string
    label:  string
    url?:   string
  } | null>(null)

  // Review Prompts modal — lets user preview every composed prompt in one
  // place and edit per-slot overrides before generating.
  const [reviewOpen,      setReviewOpen]      = useState(false)
  // Count of slots with a user-saved prompt override (drives the pill on
  // the Review prompts button). Initialised from localStorage on mount,
  // refreshed when the modal closes or reports a change.
  const [overrideCount,   setOverrideCount]   = useState(0)
  useEffect(() => {
    const overrides = readPromptOverrides(projectId)
    setOverrideCount(Object.values(overrides).filter(v => v && v.trim()).length)
  }, [projectId])

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
  // Feature slot groups appear below the legacy AssetType groups when the
  // corresponding feature is enabled in projectMeta.features.
  const featureGroups = useMemo(() => buildFeatureSlotGroups(projectMeta), [projectMeta])

  // Flat slot list for the Review Prompts modal — base groups + feature
  // slots, each tagged with a group label for the modal's section headers.
  const reviewSlots = useMemo<ReviewSlot[]>(() => {
    const out: ReviewSlot[] = []
    for (const g of assetGroups) {
      for (const t of g.types) {
        out.push({ key: t, label: (ASSET_LABELS as Record<string, string>)[t] ?? t, group: g.label })
      }
    }
    for (const fg of featureGroups) {
      for (const s of fg.slots) {
        out.push({ key: s.key, label: `${fg.label} · ${s.label}`, group: fg.label })
      }
    }
    return out
  }, [assetGroups, featureGroups])

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
          setFeatureAssets(buildFeatureAssetMap(list))
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

    // Per-slot prompt overrides saved by the user in the Review Prompts
    // modal. Previously only the Single popup path honoured these — the
    // bulk path silently discarded them, destroying user trust. Now we
    // forward them to /api/generate which feeds them into pipeline.ts.
    const savedOverrides = readPromptOverrides(projectId)
    const activeOverrides = Object.fromEntries(
      Object.entries(savedOverrides).filter(([k, v]) => targetTypes.includes(k as AssetType) && v && v.trim())
    )
    const overrideKeys = Object.keys(activeOverrides)
    if (overrideKeys.length) {
      addLog(`Using ${overrideKeys.length} per-slot override${overrideKeys.length === 1 ? '' : 's'}: ${overrideKeys.join(', ')}`)
    }

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
          custom_prompts: overrideKeys.length ? activeOverrides : undefined,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        if (err.error === 'upgrade_required') { setGateModal({ type: 'upgrade' }); setBatchRunning(false); return }
        if (err.error === 'credits_exhausted') { setGateModal({ type: 'credits' }); setBatchRunning(false); return }
        addLog(`Error: ${err.error ?? 'Request failed'}`)
        setBatchRunning(false)
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

  // Open the Single regenerate popup (Popup A). The popup handles the
  // /api/ai-single call with user-selected ratio / style / custom prompt /
  // references; on success its onGenerated callback (below, inside the
  // render block) updates `assets` + `assetHistory` and clears failedTypes.
  // Gate-modal routing (upgrade_required / credits_exhausted) still fires
  // on bulk generate — single-asset errors surface in the popup itself.
  //
  // `overridePrompt` is kept as an optional arg for future callers that
  // want to preseed the popup's textarea; the popup's own custom_prompt
  // textarea is the primary entry point now.
  const handleRegen = useCallback((assetType: AssetType, _overridePrompt?: string) => {
    const label = (ASSET_LABELS as Record<string, string>)[assetType] ?? assetType
    setPopupSlot({
      key:   assetType,
      label,
      url:   assets[assetType]?.url,
    })
    return Promise.resolve()
  }, [assets])

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

  // ─── Feature slot upload (namespaced keys like "bonuspick.bg") ──────────────
  // Same endpoint as handleUpload but routes the result into featureAssets so
  // the feature sections below the legacy grid refresh without a roundtrip.
  const handleFeatureSlotUpload = useCallback(async (slotKey: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('projectId', projectId)
    fd.append('assetKey', slotKey)
    fd.append('theme', theme || 'custom')
    addLog(`Uploading ${slotKey}…`)
    try {
      const res  = await fetch('/api/assets/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.error) { addLog(`Upload error: ${json.error ?? 'Failed'}`); return }
      const newAsset: GeneratedAsset = json.asset ?? {
        id:         crypto.randomUUID(),
        project_id: projectId,
        type:       slotKey,
        url:        json.url,
        prompt:     'User uploaded image',
        theme:      theme || 'custom',
        provider:   'upload' as const,
        created_at: new Date().toISOString(),
      }
      setFeatureAssets(prev => ({ ...prev, [slotKey]: newAsset }))
      addLog(`✓ Uploaded ${slotKey}`)
    } catch (err) {
      addLog(`Upload error: ${err instanceof Error ? err.message : 'Failed'}`)
    }
  }, [projectId, theme, addLog])

  // Open the Single regenerate popup for a feature slot. Same flow as
  // handleRegen above; the popup's onGenerated updates featureAssets
  // instead of the legacy assets map.
  const handleFeatureSlotGenerate = useCallback((slotKey: string): Promise<{ ok: boolean; error?: string }> => {
    // Resolve a nice header label ("Bonus Pick · Background") from the
    // registry so the popup doesn't show a raw namespaced key.
    let label = slotKey
    for (const fdef of Object.values(FEATURE_REGISTRY) as FeatureDef[]) {
      const slot = fdef.assetSlots.find(s => s.key === slotKey)
      if (slot) { label = `${fdef.label} · ${slot.label}`; break }
    }
    setPopupSlot({
      key:   slotKey,
      label,
      url:   featureAssets[slotKey]?.url,
    })
    return Promise.resolve({ ok: true })
  }, [featureAssets])

  // ─── Computed values ────────────────────────────────────────────────────────

  // Totals combine base-type slots and every enabled feature's slots so the
  // header + inline readouts match the left-sidebar progress pill.
  const baseGeneratedCount    = Object.keys(assets).length
  const baseTypesCount        = assetGroups.reduce((acc, g) => acc + g.types.length, 0)
  const featureGeneratedCount = featureGroups.reduce(
    (acc, g) => acc + g.slots.filter(s => !!featureAssets[s.key]).length, 0
  )
  const featureTypesCount     = featureGroups.reduce((acc, g) => acc + g.slots.length, 0)
  const totalGenerated        = baseGeneratedCount + featureGeneratedCount
  const totalTypes            = baseTypesCount + featureTypesCount
  // Routing: feature-slot keys look up in featureAssets; everything else
  // falls through to the base AssetType-keyed map.
  const selectedIsFeature     = !!selected && FEATURE_SLOT_KEYS.has(selected)
  const selectedAsset         = !selected
    ? null
    : selectedIsFeature
      ? (featureAssets[selected] ?? null)
      : ((assets as Record<string, GeneratedAsset | undefined>)[selected] ?? null)


  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
    {/* ── Plan / Credits gate modal ──────────────────────────────────────────── */}
    {gateModal && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: '#13131a', border: '1px solid rgba(201,168,76,.3)',
          borderRadius: 20, padding: 32, maxWidth: 400, width: '90%',
          position: 'relative',
        }}>
          <button
            onClick={() => setGateModal(null)}
            style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#7a7a8a' }}
          ><X size={16} /></button>

          {gateModal.type === 'upgrade' ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
              <p style={{ fontWeight: 700, fontSize: 17, color: '#eeede6', marginBottom: 8 }}>
                AI generation requires a paid plan
              </p>
              <p style={{ fontSize: 13, color: '#7a7a8a', marginBottom: 24, lineHeight: 1.6 }}>
                The Free plan lets you explore the canvas and manage projects, but AI generation is a Freelancer and Studio feature. Upgrade to start generating assets in seconds.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link href={`/${routeSlug}/settings/billing`}
                  style={{
                    flex: 1, textAlign: 'center', padding: '10px 0',
                    background: '#c9a84c', color: '#06060a',
                    borderRadius: 10, fontWeight: 700, fontSize: 14,
                    textDecoration: 'none',
                  }}
                  onClick={() => setGateModal(null)}
                >
                  View plans
                </Link>
                <button
                  onClick={() => setGateModal(null)}
                  style={{
                    padding: '10px 18px', background: 'none',
                    border: '1px solid rgba(255,255,255,.1)', color: '#7a7a8a',
                    borderRadius: 10, cursor: 'pointer', fontSize: 14,
                  }}
                >Dismiss</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔋</div>
              <p style={{ fontWeight: 700, fontSize: 17, color: '#eeede6', marginBottom: 8 }}>
                No AI credits remaining
              </p>
              <p style={{ fontSize: 13, color: '#7a7a8a', marginBottom: 24, lineHeight: 1.6 }}>
                You&apos;ve used all your included credits for this month. Top up with a credit pack (50 credits for €10) or wait for your monthly reset.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link href={`/${routeSlug}/settings/billing`}
                  style={{
                    flex: 1, textAlign: 'center', padding: '10px 0',
                    background: '#c9a84c', color: '#06060a',
                    borderRadius: 10, fontWeight: 700, fontSize: 14,
                    textDecoration: 'none',
                  }}
                  onClick={() => setGateModal(null)}
                >
                  Top up credits
                </Link>
                <button
                  onClick={() => setGateModal(null)}
                  style={{
                    padding: '10px 18px', background: 'none',
                    border: '1px solid rgba(255,255,255,.1)', color: '#7a7a8a',
                    borderRadius: 10, cursor: 'pointer', fontSize: 14,
                  }}
                >Dismiss</button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    <div style={{
      display:    'flex',
      flexDirection: 'column',
      width:      '100%',
      height:     '100%',
      background: C.bg,
      color:      C.tx,
      fontFamily: C.font,
      overflow:   'hidden',
      flex:       1,
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
          {/* Back to Flow (canvas workspace) */}
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
            Flow
          </Link>

          <div style={{ width: 1, height: 20, background: C.border }} />

          <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: '.5px' }}>
            SPINATIVE
          </span>
          <span style={{ fontSize: 12, color: C.txFaint }}>·</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.txMuted, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Art
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

          <button
            onClick={() => { if (!exportsEnabled) { setGateModal({ type: 'upgrade' }) } }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: exportsEnabled ? C.txMuted : C.txFaint, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: exportsEnabled ? 'pointer' : 'default', opacity: exportsEnabled ? 1 : 0.6 }}
            className="sf-btn"
            title={exportsEnabled ? 'Export assets' : 'Upgrade to export assets'}
          >
            <Download size={12} />
            Export{!exportsEnabled && ' 🔒'}
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
            Art Workspace
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
        {/* missingCount stays restricted to base-type gaps — the "Fill gaps"
            and "Generate All" buttons only batch-generate base assets;
            feature slots are created one at a time from the tile Generate
            action. The progress pill inside LeftSidebar uses the combined
            totals (base + feature) so the user sees the whole picture. */}
        <LeftSidebar
          groups={assetGroups}
          featureGroups={featureGroups}
          assets={assets}
          featureAssets={featureAssets}
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
            onReviewPrompts={() => setReviewOpen(true)}
            overrideCount={overrideCount}
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

            {/* ── Feature slot sections ────────────────────────────────── */}
            {featureGroups.length > 0 && (
              <div style={{
                margin:        '12px 0 16px',
                paddingTop:    16,
                borderTop:     `1px solid ${C.border}`,
                fontSize:      11,
                fontWeight:    700,
                color:         C.gold,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}>
                ✦ Features
              </div>
            )}
            {featureGroups.map(group => (
              <FeatureSlotsSection
                key={group.featureId}
                featureId={group.featureId}
                label={group.label}
                slots={group.slots}
                assets={featureAssets}
                onUpload={handleFeatureSlotUpload}
                onGenerate={handleFeatureSlotGenerate}
                selectedKey={selectedIsFeature ? selected : null}
                onSelect={(slotKey) => setSelected(slotKey)}
              />
            ))}
          </div>
        </main>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
        <RightInspectorPanel
          selectedKey={selected}
          selectedIsFeature={selectedIsFeature}
          selectedAsset={selectedAsset ?? undefined}
          rightTab={rightTab}
          onTabChange={setRightTab}
          customPrompt={customPrompt}
          onPromptChange={setCustomPrompt}
          regenTarget={regenTarget}
          theme={theme}
          onRegenBase={handleRegen}
          onGenerateFeature={handleFeatureSlotGenerate}
          logs={batchLogs}
          shortLabels={shortLabels}
          exportsEnabled={exportsEnabled}
          onUpgradeGate={() => setGateModal({ type: 'upgrade' })}
        />
      </div>
    </div>

    {/* Single-asset regenerate popup (Popup A). Shown whenever the user
        clicks ✨ on a base-game tile or a feature slot row. Routes the new
        asset into `assets` vs `featureAssets` based on whether the key
        belongs to FEATURE_SLOT_KEYS, and updates history + clears the
        failedTypes flag so the tile stops showing red. */}
    {popupSlot && (
      <SingleGeneratePopup
        open={!!popupSlot}
        onClose={() => setPopupSlot(null)}
        slotKey={popupSlot.key}
        slotLabel={popupSlot.label}
        currentUrl={popupSlot.url}
        projectId={projectId}
        theme={theme}
        projectMeta={(projectMeta ?? {}) as Record<string, unknown>}
        defaultStyleId={styleId || undefined}
        onGenerated={(key, asset) => {
          if (FEATURE_SLOT_KEYS.has(key)) {
            setFeatureAssets(prev => ({ ...prev, [key]: asset }))
          } else {
            const at = key as AssetType
            setAssets(prev => ({ ...prev, [at]: asset }))
            setAssetHistory(prev => ({ ...prev, [at]: [asset, ...(prev[at] ?? [])] }))
            setFailedTypes(prev => { const s = new Set(prev); s.delete(at); return s })
            setRightTab('inspector')
          }
          addLog(`✓ Generated ${key}`)
        }}
      />
    )}

    {/* Review Prompts modal — batch preview + per-slot override editor.
        Opens from the "Review prompts" button in GenerationControlBar. */}
    <ReviewPromptsModal
      open={reviewOpen}
      onClose={() => setReviewOpen(false)}
      projectId={projectId}
      projectName={(projectMeta?.gameName as string | undefined) || undefined}
      theme={theme}
      styleId={styleId || undefined}
      projectMeta={(projectMeta ?? {}) as Record<string, unknown>}
      slots={reviewSlots}
      onOverridesChanged={(next) => {
        setOverrideCount(Object.values(next).filter(v => v && v.trim()).length)
      }}
    />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Left Sidebar
// ─────────────────────────────────────────────────────────────────────────────

interface LeftSidebarProps {
  groups:               AssetGroup[]
  featureGroups:        FeatureSlotGroup[]
  assets:               Partial<Record<AssetType, GeneratedAsset>>
  featureAssets:        Record<string, GeneratedAsset>
  activeGroup:          string | null
  onSelectGroup:        (id: string | null) => void
  batchRunning:         boolean
  onGenerateAll:        () => void
  onGenerateMissing:    () => void
  missingCount:         number
}

function LeftSidebar({
  groups, featureGroups, assets, featureAssets, activeGroup, onSelectGroup, batchRunning, onGenerateAll, onGenerateMissing, missingCount,
}: LeftSidebarProps) {
  // Counts include BOTH base asset types AND the feature slots for every
  // enabled feature — so the progress readout reflects what the main grid
  // actually renders. Without feature slots, the numerator stays flat even
  // after uploading/generating feature assets.
  const baseGenerated    = Object.keys(assets).length
  const baseTypes        = groups.reduce((acc, g) => acc + g.types.length, 0)
  const featureGenerated = featureGroups.reduce(
    (acc, g) => acc + g.slots.filter(s => !!featureAssets[s.key]).length, 0
  )
  const featureTypes     = featureGroups.reduce((acc, g) => acc + g.slots.length, 0)
  const totalGenerated   = baseGenerated + featureGenerated
  const totalTypes       = baseTypes + featureTypes

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

        {/* Feature groups — shown below the base-type groups so the nav
            mirrors the main grid layout (features appear after UI & Chrome).
            Clicking a feature group scrolls the grid to its section; it
            shares the activeGroup state with base groups so only one can
            be highlighted at a time. */}
        {featureGroups.length > 0 && (
          <div style={{
            fontSize:      9,
            fontWeight:    700,
            color:         C.gold,
            padding:       '12px 10px 4px',
            letterSpacing: '.12em',
            textTransform: 'uppercase',
          }}>
            ✦ Features
          </div>
        )}
        {featureGroups.map(group => {
          const filled   = group.slots.filter(s => !!featureAssets[s.key]).length
          const total    = group.slots.length
          const groupId  = `feature:${group.featureId}`
          const isActive = activeGroup === groupId
          const complete = filled === total && total > 0
          return (
            <button
              key={groupId}
              onClick={() => onSelectGroup(isActive ? null : groupId)}
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
              <Sparkles
                size={14}
                style={{ color: isActive ? C.gold : C.txMuted, flexShrink: 0 }}
              />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: isActive ? C.gold : C.tx }}>
                  {group.label}
                </div>
              </div>
              <span style={{
                fontSize:    10,
                fontWeight:  600,
                color:       complete ? C.green : C.txMuted,
                background:  complete ? 'rgba(52,211,153,.1)' : C.surfHigh,
                border:      `1px solid ${complete ? 'rgba(52,211,153,.2)' : 'transparent'}`,
                borderRadius: 10,
                padding:     '1px 6px',
                minWidth:    32,
                textAlign:   'center',
              }}>
                {filled}/{total}
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
  /** Opens the Review Prompts modal — lets the user preview + edit every
   *  composed prompt before hitting Generate. */
  onReviewPrompts?:  () => void
  /** Count of slots with a user-saved prompt override (drives the small
   *  gold pill on the Review Prompts button). */
  overrideCount?:    number
}

function GenerationControlBar({
  theme, onThemeChange, styleId, onStyleChange,
  provider, onProviderChange,
  generating, onGenerate, onGenerateMissing, missingCount,
  onReviewPrompts, overrideCount = 0,
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

        {/* Review prompts button — opens the modal that lists every
            composed prompt with edit + save-override controls. Shows a
            gold pill with the override count when any are active. */}
        {onReviewPrompts && (
          <button
            onClick={onReviewPrompts}
            className="sf-btn"
            title="Review every composed prompt + edit per-slot overrides"
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        5,
              padding:    '8px 12px',
              background: overrideCount > 0 ? 'rgba(201,168,76,.08)' : C.surfHigh,
              color:      overrideCount > 0 ? C.gold : C.txMuted,
              border:     `1px solid ${overrideCount > 0 ? 'rgba(201,168,76,.35)' : C.border}`,
              borderRadius: 8,
              fontSize:   12,
              fontWeight: 600,
              cursor:     'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <FileText size={12} />
            Review prompts
            {overrideCount > 0 && (
              <span style={{
                marginLeft: 2,
                padding: '1px 5px', borderRadius: 3,
                background: 'rgba(201,168,76,.18)',
                color: C.gold, fontSize: 10,
                fontFamily: "'DM Mono',monospace",
              }}>
                {overrideCount}
              </span>
            )}
          </button>
        )}

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

      {/* Row 2: Graphic style picker — always visible. Users asked to
          remove the Advanced-toggle gate so the style is never hidden
          behind a collapsed section; the selected card is always
          discoverable and the picker doubles as a status readout. */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: C.txMuted, marginBottom: 8, fontWeight: 600, letterSpacing: '.06em' }}>
          GRAPHIC STYLE
        </div>
        <StylePickerStrip selected={styleId} onSelect={onStyleChange} />
      </div>
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
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          height: 22, marginBottom: 3, color: !selected ? C.gold : '#e8c96d',
        }}>
          <StyleIcon id="default" size={20} />
        </div>
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
            {/* Custom SVG replaces the per-OS emoji; one consistent icon
                family across the nine cards, drawn at same line weight so
                the row reads as one visual set. currentColor inherits from
                the button's foreground so each card picks up its own
                accent on the gradient background. */}
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              height: 22, marginBottom: 3,
              color: isActive ? C.gold : '#ffffffcc',
              filter: isActive ? 'none' : 'drop-shadow(0 1px 2px rgba(0,0,0,.35))',
            }}>
              <StyleIcon id={style.id} size={20} />
            </div>
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
  /** Widened to string so feature-slot selections don't un-highlight on type mismatch. */
  selectedType:    string | null
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
  /** The currently selected key — either a base AssetType or a feature-slot key. */
  selectedKey?:       string | null
  /** True when the selection is a feature-slot key (drives regen routing). */
  selectedIsFeature: boolean
  selectedAsset?:    GeneratedAsset
  rightTab:          RightTab
  onTabChange:       (tab: RightTab) => void
  customPrompt:      string
  onPromptChange:    (v: string) => void
  regenTarget:       AssetType | null
  theme:             string
  /** Regenerate a base asset type (existing batch/single flow). */
  onRegenBase:       (type: AssetType, prompt?: string) => void
  /** Generate a single feature slot (wired from handleFeatureSlotGenerate). */
  onGenerateFeature: (slotKey: string) => Promise<{ ok: boolean; error?: string }>
  logs:              string[]
  shortLabels:       Partial<Record<AssetType, string>>
  exportsEnabled:    boolean
  onUpgradeGate:     () => void
}

function RightInspectorPanel({
  selectedKey, selectedIsFeature, selectedAsset, rightTab, onTabChange,
  customPrompt, onPromptChange,
  regenTarget, theme, onRegenBase, onGenerateFeature, logs, shortLabels,
  exportsEnabled, onUpgradeGate,
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
            selectedKey={selectedKey ?? null}
            selectedIsFeature={selectedIsFeature}
            selectedAsset={selectedAsset}
            regenTarget={regenTarget}
            theme={theme}
            onRegenBase={onRegenBase}
            onGenerateFeature={onGenerateFeature}
            shortLabels={shortLabels}
            exportsEnabled={exportsEnabled}
            onUpgradeGate={onUpgradeGate}
          />
        )}

        {/* Prompt Editor Tab */}
        {rightTab === 'prompt' && (
          <PromptTab
            selectedKey={selectedKey ?? null}
            selectedIsFeature={selectedIsFeature}
            selectedAsset={selectedAsset}
            customPrompt={customPrompt}
            onPromptChange={onPromptChange}
            regenTarget={regenTarget}
            theme={theme}
            onRegenBase={onRegenBase}
            onGenerateFeature={onGenerateFeature}
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

/** Resolve a human label for any selected key (base AssetType or feature slot). */
function resolveLabel(
  key: string,
  isFeature: boolean,
  shortLabels: Partial<Record<AssetType, string>>
): string {
  if (!isFeature) {
    return shortLabels[key as AssetType] ?? ASSET_LABELS[key as AssetType] ?? key
  }
  for (const def of Object.values(FEATURE_REGISTRY)) {
    const slot = def.assetSlots.find(s => s.key === key)
    if (slot) return `${def.label} — ${slot.label}`
  }
  return key
}

function InspectorTab({
  selectedKey, selectedIsFeature, selectedAsset,
  regenTarget, theme, onRegenBase, onGenerateFeature,
  shortLabels, exportsEnabled, onUpgradeGate,
}: {
  selectedKey:      string | null
  selectedIsFeature: boolean
  selectedAsset?:   GeneratedAsset
  regenTarget:      AssetType | null
  theme:            string
  onRegenBase:      (type: AssetType) => void
  onGenerateFeature: (slotKey: string) => Promise<{ ok: boolean; error?: string }>
  shortLabels:      Partial<Record<AssetType, string>>
  exportsEnabled:   boolean
  onUpgradeGate:    () => void
}) {
  // Local feature-generation state — base-asset regen uses the shared
  // regenTarget prop, but feature slots are generated via a Promise-returning
  // callback so we track the in-flight state here.
  const [featGenerating, setFeatGenerating] = useState(false)

  if (!selectedKey) {
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

  const label = resolveLabel(selectedKey, selectedIsFeature, shortLabels)
  const isRegen = selectedIsFeature
    ? featGenerating
    : (regenTarget === selectedKey)

  async function handleRegenClick() {
    if (isRegen) return
    if (selectedIsFeature) {
      setFeatGenerating(true)
      try { await onGenerateFeature(selectedKey!) }
      finally { setFeatGenerating(false) }
    } else {
      onRegenBase(selectedKey as AssetType)
    }
  }

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
            <MetaRow label="Type"     value={selectedKey} />
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
          onClick={handleRegenClick}
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
          exportsEnabled ? (
            <a
              href={selectedAsset.url}
              download={`${selectedKey}.png`}
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
          ) : (
            <button
              onClick={() => onUpgradeGate()}
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            6,
                padding:        '8px 0',
                background:     C.surfHigh,
                border:         `1px solid ${C.border}`,
                borderRadius:   8,
                color:          C.txFaint,
                fontSize:       12,
                fontWeight:     600,
                cursor:         'pointer',
                width:          '100%',
                opacity:        0.7,
              }}
              title="Upgrade to download assets"
            >
              🔒 Download PNG
            </button>
          )
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
  selectedKey, selectedIsFeature, selectedAsset, customPrompt, onPromptChange,
  regenTarget, theme, onRegenBase, onGenerateFeature, shortLabels,
}: {
  selectedKey:       string | null
  selectedIsFeature: boolean
  selectedAsset?:    GeneratedAsset
  customPrompt:      string
  onPromptChange:    (v: string) => void
  regenTarget:       AssetType | null
  theme:             string
  onRegenBase:       (type: AssetType, prompt?: string) => void
  onGenerateFeature: (slotKey: string) => Promise<{ ok: boolean; error?: string }>
  shortLabels:       Partial<Record<AssetType, string>>
}) {
  const [featGenerating, setFeatGenerating] = useState(false)

  if (!selectedKey) {
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

  const isRegen = selectedIsFeature ? featGenerating : (regenTarget === selectedKey)
  const label   = resolveLabel(selectedKey, selectedIsFeature, shortLabels)

  async function handleGenerate() {
    if (isRegen) return
    if (selectedIsFeature) {
      setFeatGenerating(true)
      // Feature slots don't yet accept a custom prompt override — the custom
      // prompt textarea stays editable but is ignored for feature slots in
      // this iteration. (buildFeatureSlotPrompt in promptBuilder.ts uses its
      // own per-slot template.) TODO: plumb customPrompt into /api/ai-single.
      try { await onGenerateFeature(selectedKey!) }
      finally { setFeatGenerating(false) }
    } else {
      onRegenBase(selectedKey as AssetType, customPrompt || undefined)
    }
  }

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
        onClick={handleGenerate}
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
          : <><Wand2 size={13} /> {(!selectedIsFeature && customPrompt) ? 'Generate with custom prompt' : 'Generate'}</>
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

// ─────────────────────────────────────────────────────────────────────────────
// Feature slot section — appears below the legacy AssetGroupSections when a
// feature is enabled. Renders one grid of asset tiles per active feature slot.
// Each tile supports upload and AI generate (✦) — generate routes through
// /api/ai-single with the namespaced slot key.
// ─────────────────────────────────────────────────────────────────────────────

function FeatureSlotsSection({
  featureId, label, slots, assets, onUpload, onGenerate,
  selectedKey, onSelect,
}: {
  featureId:  FeatureId
  label:      string
  slots:      AssetSlot[]
  assets:     Record<string, GeneratedAsset>
  onUpload:   (slotKey: string, file: File) => void
  onGenerate: (slotKey: string) => Promise<{ ok: boolean; error?: string }>
  selectedKey: string | null
  onSelect:   (slotKey: string) => void
}) {
  const filledCount = slots.filter(s => !!assets[s.key]).length
  return (
    <div id={`feature-group-${featureId}`} style={{ marginBottom: 32 }}>
      {/* Group header — mirrors the AssetGroupSection header style */}
      <div style={{
        display:       'flex',
        alignItems:    'center',
        gap:           10,
        marginBottom:  12,
      }}>
        <div style={{
          fontSize:      13,
          fontWeight:    700,
          color:         C.tx,
          letterSpacing: '.03em',
        }}>
          {label}
        </div>
        <div style={{
          fontSize:   10,
          fontWeight: 700,
          padding:    '2px 8px',
          borderRadius: 10,
          color:      filledCount === slots.length ? C.green : C.txMuted,
          background: filledCount === slots.length ? 'rgba(52,211,153,.1)' : C.surfHigh,
          border:     `1px solid ${filledCount === slots.length ? 'rgba(52,211,153,.2)' : 'transparent'}`,
        }}>
          {filledCount}/{slots.length}
        </div>
      </div>
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap:                 10,
      }}>
        {slots.map(slot => (
          <FeatureSlotTile
            key={slot.key}
            slot={slot}
            asset={assets[slot.key]}
            onUpload={onUpload}
            onGenerate={onGenerate}
            isSelected={selectedKey === slot.key}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

function FeatureSlotTile({
  slot, asset, onUpload, onGenerate, isSelected, onSelect,
}: {
  slot:       AssetSlot
  asset?:     GeneratedAsset
  onUpload:   (slotKey: string, file: File) => void
  onGenerate: (slotKey: string) => Promise<{ ok: boolean; error?: string }>
  isSelected: boolean
  onSelect:   (slotKey: string) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError]   = useState<string | null>(null)
  const isEmpty   = !asset
  const required  = slot.requirement === 'required'

  async function handleGenerate(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (generating) return
    setGenerating(true)
    setGenError(null)
    try {
      const res = await onGenerate(slot.key)
      if (!res.ok) setGenError(res.error ?? 'Failed')
    } finally {
      setGenerating(false)
    }
  }

  function handleUploadClick(e: React.MouseEvent) {
    e.stopPropagation()
    fileInput.current?.click()
  }
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onUpload(slot.key, file)
  }

  // Tile click → select (opens Inspector in the right panel). Dedicated
  // buttons handle upload / generate so those actions aren't lost.
  const borderColor = isSelected ? C.gold : isEmpty ? C.border : 'rgba(201,168,76,.3)'

  return (
    <div
      onClick={() => onSelect(slot.key)}
      title={slot.description || slot.label}
      style={{
        display:        'flex',
        flexDirection:  'column',
        borderRadius:   10,
        background:     C.surface,
        border:         `1px solid ${borderColor}`,
        overflow:       'hidden',
        position:       'relative',
        cursor:         'pointer',
        transition:     'border-color .15s',
        boxShadow:      isSelected ? `0 0 0 1px ${C.gold}40` : 'none',
      }}
    >
      {/* Thumbnail / empty state */}
      <div
        style={{
          aspectRatio:    '1 / 1',
          width:          '100%',
          background:     isEmpty
            ? `repeating-linear-gradient(45deg, ${C.surfHigh} 0 6px, transparent 6px 12px)`
            : C.bg,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        {generating ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: C.gold }}>
            <Loader2 size={22} style={{ animation: 'sf-spin 1s linear infinite' }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em' }}>GENERATING…</span>
          </div>
        ) : asset
          ? <img
              src={asset.url}
              alt={slot.label}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: C.txMuted }}>
              <Sparkles size={18} style={{ opacity: 0.6 }} />
              <span style={{ fontSize: 9, fontWeight: 600 }}>Hover to generate</span>
            </div>
          )
        }
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Action buttons — Upload + AI generate, same positioning as the
          base-asset tiles so the two types feel uniform. */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        display: 'flex', gap: 6,
      }}>
        <button
          onClick={handleUploadClick}
          title={asset ? 'Replace by upload' : 'Upload image'}
          style={{
            width:          26,
            height:         26,
            borderRadius:   7,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            background:     'rgba(0,0,0,0.55)',
            border:         `1px solid ${C.border}`,
            color:          C.txMuted,
            cursor:         'pointer',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Upload size={12} />
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating}
          title={genError ? `Retry AI generate · ${genError}` : (asset ? 'Replace with AI generate' : 'Generate with AI')}
          style={{
            width:          26,
            height:         26,
            borderRadius:   7,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            background:     generating ? 'rgba(201,168,76,.35)'
                          : genError   ? 'rgba(248,113,113,.15)'
                                       : 'rgba(201,168,76,.2)',
            border:         `1px solid ${generating ? 'rgba(201,168,76,.8)'
                                       : genError   ? 'rgba(248,113,113,.5)'
                                                    : 'rgba(201,168,76,.45)'}`,
            color:          generating ? C.gold : genError ? C.red : C.gold,
            cursor:         generating ? 'wait' : 'pointer',
            backdropFilter: 'blur(6px)',
          }}
        >
          {generating
            ? <Loader2 size={12} style={{ animation: 'sf-spin 1s linear infinite' }} />
            : <Sparkles size={12} />
          }
        </button>
      </div>

      {/* Label + slot key */}
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{
          fontSize:     12,
          fontWeight:   600,
          color:        C.tx,
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
        }}>
          {slot.label}
          {required && <span style={{ color: 'rgba(248,113,113,.85)', marginLeft: 3 }}>*</span>}
        </div>
        <div style={{
          fontSize:     10,
          marginTop:    2,
          fontFamily:   "'DM Mono',monospace",
          color:        C.txFaint,
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
        }}>
          {slot.key}
        </div>
        {genError && (
          <div style={{
            fontSize:  9,
            marginTop: 4,
            color:     C.red,
            overflow:  'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            ⚠ {genError}
          </div>
        )}
      </div>
    </div>
  )
}
