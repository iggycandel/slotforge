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
  Eye, Upload, X, FileText, History,
} from 'lucide-react'
import type { AssetType, GeneratedAsset } from '@/types/assets'
import { ASSET_LABELS } from '@/types/assets'
import type { TypographySpec } from '@/types/typography'
import { TypographyWorkspace } from '../typography/TypographyWorkspace'
import type { FeatureDef, FeatureId, AssetSlot } from '@/types/features'
import { activeAssetSlots } from '@/types/features'
import { FEATURE_REGISTRY } from '@/lib/features/registry'
import { GRAPHIC_STYLES } from '@/lib/ai/styles'
import { SingleGeneratePopup } from '@/components/generate/SingleGeneratePopup'
import { ReviewPromptsModal, readPromptOverrides, type ReviewSlot } from '@/components/generate/ReviewPromptsModal'
import { StyleIcon } from '@/components/generate/StyleIcon'
import { PromptInputsPanel, type PromptInputsMeta } from '@/components/assets/PromptInputsPanel'

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
  /** Typography embed (Phase 1 fold-in finalised): the typography
   *  spec from payload.typographySpec, hydrated on mount. */
  initialTypographySpec?: TypographySpec | null
  /** Called when the user generates / clears the typography spec.
   *  Editor-frame wires this to SF_SAVE_TYPOGRAPHY so the iframe
   *  picks up the spec for autosave. */
  onTypographySpecChange?: (spec: TypographySpec | null) => void
  /** Rich theme/art-direction meta forwarded from the editor's Project Settings panel */
  projectMeta?:  Record<string, unknown>
  /** Whether the current plan allows exporting/downloading assets (default: false for safety) */
  exportsEnabled?: boolean
  /** Push a generated / reverted / uploaded asset URL into the editor iframe
   *  (SF_INJECT_IMAGE_LAYER). Without this, generations in the full-page Art
   *  view would only touch the DB + React state — EL_ASSETS in the iframe
   *  would never learn about the new URL, so the next autosave wouldn't
   *  capture it and on re-open the layer would be empty. Previously only
   *  the right-sidebar AssetsPanel was wired up; AssetsWorkspace silently
   *  dropped the sync, causing character/logo to disappear on round-trip. */
  onAddToCanvas?: (assetType: string, url: string) => void
  /** Patch a subset of project meta (game name, theme, style, palette, world
   *  fields, symbol names) back into the editor iframe. The iframe applies
   *  each field to its corresponding DOM input / P state and marks dirty,
   *  so autosave + cross-workspace consistency are automatic. Used by the
   *  PromptInputsPanel — without it, edits in Art would be lost on the next
   *  payload refresh. */
  onUpdateMeta?: (patch: Partial<PromptInputsMeta>) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AssetsWorkspace({ projectId, orgSlug, projectName, initialAssets, inlineMode = false, onBackToCanvas, initialTypographySpec, onTypographySpecChange, projectMeta, exportsEnabled = false, onAddToCanvas, onUpdateMeta }: Props) {
  // Route params (for billing page link)
  const params = useParams<{ orgSlug: string }>()
  const routeSlug = orgSlug ?? params?.orgSlug ?? ''

  // Gate modal — shown when plan or credits block generation
  const [gateModal, setGateModal] = useState<{ type: 'upgrade' | 'credits' } | null>(null)

  // Pre-flight confirmation modal for Generate-All / Fill-Gaps. Pops up
  // BEFORE the actual /api/generate call so the user can see the credit
  // cost and bail if it's not what they expected. The pending args are
  // the same tuple runBatchGenerate accepts; on confirm we forward them
  // straight through.
  const [confirmGen, setConfirmGen] = useState<{
    fillGaps:  boolean
    types:     AssetType[]      // resolved target list (count = .length)
    used:      number           // credits used this period
    total:     number           // credits included in plan
    plan:      string           // "free" | "freelancer" | "studio" | …
    label:     string           // short copy noun ("backgrounds", "all assets", "missing", …)
  } | null>(null)

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
  // Left-sidebar tab: 'assets' (the legacy navigator), 'inputs' (the
  // consolidated Prompt Inputs panel introduced in v109), or
  // 'typography' (embeds the TypographyWorkspace as the main-pane
  // content — Phase 1 fold-in done properly). Kept on the component
  // itself so navigating away-and-back remembers the mode.
  const [sidebarMode, setSidebarMode] = useState<'assets' | 'inputs' | 'typography'>('assets')

  // Optimistic overlay for PromptInputsPanel edits. The shell's editorMeta
  // only updates on SF_AUTOSAVE round-trips (the SF_DIRTY path into
  // payloadRef intentionally doesn't trigger a re-render to avoid input
  // thrash). But a controlled input that fires onChange WITHOUT getting
  // its value updated on the next render will snap back to stale state,
  // so we layer user-patched fields over projectMeta locally. Cleared
  // when the project id changes.
  const [metaOverlay, setMetaOverlay] = useState<Partial<PromptInputsMeta>>({})
  useEffect(() => { setMetaOverlay({}) }, [projectId])
  const effectiveMeta = useMemo<PromptInputsMeta>(
    () => ({ ...(projectMeta as PromptInputsMeta | undefined ?? {}), ...metaOverlay }),
    [projectMeta, metaOverlay]
  )
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
    // v119: overrides are now { text, mode } objects; count entries with
    // a non-empty text.
    setOverrideCount(Object.values(overrides).filter(v => v?.text && v.text.trim()).length)
  }, [projectId])

  // Failed asset tracking — populated after each batch, cleared on next
  // run.  v116: changed from Set<AssetType> → Map<AssetType, string> so
  // per-failure error messages from the pipeline reach the UI (tile
  // tooltip + retry banner). Map preserves the .has() API the existing
  // call sites use, so the change is mostly invisible elsewhere.
  const [failedTypes, setFailedTypes] = useState<Map<AssetType, string>>(new Map())

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

  // Keep a ref to the latest onAddToCanvas so the one-shot mount fetch
  // below can invoke it without taking a dep on its identity. If we
  // listed it in the dep array, an inline arrow in the parent would
  // re-run this effect on every render of EditorFrame and clobber
  // client-side state (reverts, unsaved uploads) with a stale DB fetch.
  const onAddToCanvasRef = useRef<typeof onAddToCanvas>(onAddToCanvas)
  useEffect(() => { onAddToCanvasRef.current = onAddToCanvas }, [onAddToCanvas])

  useEffect(() => {
    if (!inlineMode) return
    fetch(`/api/generate?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => {
        const list: GeneratedAsset[] = Array.isArray(d.assets) ? d.assets : []
        if (list.length > 0) {
          const assetMap = buildAssetMap(list)
          const featureMap = buildFeatureAssetMap(list)
          setAssets(assetMap)
          setAssetHistory(buildAssetHistory(list))
          setFeatureAssets(featureMap)
          // Hydrate the editor iframe's EL_ASSETS from the DB on mount.
          // Older saves might have lost char/logo URLs from payload.assets
          // because the Art view never pushed them to the iframe before
          // v101. Pushing the latest version of every base asset (+ every
          // feature slot) here rebuilds the iframe canvas from
          // ground-truth Supabase data without requiring the user to
          // manually re-generate. Ref lookup so this effect stays a
          // one-shot on (projectId, inlineMode) — adding the callback
          // to the deps would fire the fetch on every parent render and
          // overwrite any in-flight revert.
          const add = onAddToCanvasRef.current
          if (add) {
            for (const [type, asset] of Object.entries(assetMap)) {
              if (asset?.url) add(type, asset.url)
            }
            for (const [key, asset] of Object.entries(featureMap)) {
              if (asset?.url) add(key, asset.url)
            }
          }
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
  const runBatchGenerate = useCallback(async (
    fillGaps = false,
    /** Optional scope — when present, the batch runs against exactly these
     *  types instead of every type in every group. Used by the per-group
     *  "Generate all" buttons added in v112 so the user can re-roll just
     *  the high symbols without touching backgrounds or UI assets. */
    explicitTypes?: AssetType[],
  ) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Compute which types to generate. Per-group calls use `explicitTypes`
    // as the candidate pool; `fillGaps` still decides whether to skip
    // already-filled slots inside that pool.
    const candidateTypes = explicitTypes ?? assetGroups.flatMap(g => g.types)
    const targetTypes    = fillGaps
      ? candidateTypes.filter(t => !assets[t])
      : candidateTypes

    if (targetTypes.length === 0) {
      addLog('All assets already generated — nothing to do.')
      return
    }

    setBatchRunning(true)
    setBatchProgress({ completed: 0, total: targetTypes.length })
    setBatchLogs([])
    setFailedTypes(new Map())       // clear previous failures before each run
    saveContext(theme, styleId, provider)
    addLog(fillGaps
      ? `Filling ${targetTypes.length} missing asset(s) for theme: "${theme || '(from project settings)'}"`
      : `Starting generation for theme: "${theme || '(from project settings)'}"`
    )

    // Per-slot prompt overrides saved by the user in the Review Prompts
    // modal. Previously only the Single popup path honoured these — the
    // bulk path silently discarded them, destroying user trust. Now we
    // forward them to /api/generate which feeds them into pipeline.ts.
    // v119: each override carries a mode ({text, mode}) — pipeline.ts
    // honours append vs replace via BuildPromptOptions.
    const savedOverrides = readPromptOverrides(projectId)
    const activeOverrides = Object.fromEntries(
      Object.entries(savedOverrides).filter(([k, v]) =>
        targetTypes.includes(k as AssetType) && v?.text && v.text.trim()
      )
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
          // Uses effectiveMeta (overlay-merged) rather than the raw
          // projectMeta prop. Without this, palette toggles / settings
          // / symbol-name edits the user made since the last
          // SF_AUTOSAVE wouldn't reach the server — the shell's
          // editorMeta only updates on autosave round-trips, and the
          // 30-s periodic nudge means a user who edits then clicks
          // Generate within that window sends stale meta.
          project_meta: effectiveMeta ?? undefined,
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

            case 'complete': {
              const failedList = (data.failed as Array<{ type: AssetType; error?: string }> | undefined) ?? []
              const succeededN = (data.assets as Array<unknown> | undefined)?.length ?? 0
              if (failedList.length) {
                // Stash the per-type error so the failed-tile tooltip
                // and the retry banner can show what actually went
                // wrong (rate limit / content policy / network blip
                // each have very different "should I retry" answers).
                setFailedTypes(new Map(
                  failedList.map(f => [f.type, f.error || 'Unknown error'])
                ))
                // Honest summary line — old text claimed "N assets
                // ready" even when half failed.
                addLog(`⚠ ${succeededN} ready, ${failedList.length} failed — see tiles below`)
              } else {
                addLog(`✓ Generation complete — ${succeededN} asset${succeededN === 1 ? '' : 's'} ready`)
              }
              break
            }

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

  // Pre-flight confirmation. Fetches /api/credits, makes the upgrade /
  // credits-exhausted decision client-side, and only opens the confirm
  // modal when the user actually has the budget. On free plan it short-
  // circuits to the existing upgrade gate so the user is steered to
  // billing instead of seeing a confirm dialog they can't act on.
  const requestGenerateConfirm = useCallback(async (
    fillGaps:       boolean,
    explicitTypes?: AssetType[],
    label?:         string,
  ) => {
    const candidate = explicitTypes ?? assetGroups.flatMap(g => g.types)
    const types     = fillGaps ? candidate.filter(t => !assets[t]) : candidate
    if (types.length === 0) {
      addLog('All assets already generated — nothing to do.')
      return
    }

    let plan = 'free'; let aiEnabled = false; let used = 0; let total = 0
    try {
      const r = await fetch('/api/credits', { cache: 'no-store' })
      if (r.ok) {
        const j = await r.json()
        plan      = String(j.plan ?? 'free')
        aiEnabled = !!j.aiEnabled
        used      = typeof j.used  === 'number' ? j.used  : 0
        total     = typeof j.total === 'number' ? j.total : 0
      }
    } catch (e) {
      // Non-fatal: if /api/credits is briefly unreachable we still let
      // the user proceed; the server-side gate will catch any policy
      // violation and surface the existing 403/402 modals.
      console.warn('[generate-confirm] /api/credits failed; proceeding without preflight', e)
    }

    if (!aiEnabled || plan === 'free') {
      setGateModal({ type: 'upgrade' })
      return
    }
    if (total > 0 && used + types.length > total) {
      // Will run partially or not at all — push the user to top up
      // before burning the small remaining budget on a partial batch.
      setGateModal({ type: 'credits' })
      return
    }
    setConfirmGen({
      fillGaps,
      types,
      used,
      total,
      plan,
      label: label ?? (fillGaps ? 'missing assets' : 'all assets'),
    })
  }, [assetGroups, assets, addLog])

  const handleGenerate        = useCallback(() => requestGenerateConfirm(false), [requestGenerateConfirm])
  const handleGenerateMissing  = useCallback(() => requestGenerateConfirm(true),  [requestGenerateConfirm])
  // Per-group batch — reuses the same pipeline as the global Generate-All
  // button, but narrows the type list to this group and chooses
  // fill-gaps mode when some slots are already filled (re-roll-all when
  // none are, so the button is always actionable).
  const handleGenerateGroup   = useCallback((types: AssetType[]) => {
    const anyEmpty = types.some(t => !assets[t])
    // Route through the same pre-flight as the global Generate-All path
    // so per-group buttons also surface the credit cost + plan gate. The
    // label uses the group's first type as a hint ("backgrounds", "high
    // symbols", etc.) so the modal copy is contextual.
    const label = anyEmpty ? `the ${types.length} missing in this group` : `${types.length} assets in this group`
    requestGenerateConfirm(anyEmpty, types, label)
  }, [assets, requestGenerateConfirm])

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
    // Surface upload failures the way the user actually sees them: the
    // failedTypes Map drives both the per-tile red state AND the retry
    // banner at the top of the grid. addLog alone is invisible unless
    // the activity panel is open, which the user isn't necessarily
    // looking at when picking a file.
    const setFailure = (msg: string) => {
      setFailedTypes(prev => { const m = new Map(prev); m.set(assetType, msg); return m })
      addLog(`Upload error (${assetType}): ${msg}`)
    }
    const clearFailure = () => {
      setFailedTypes(prev => { const m = new Map(prev); m.delete(assetType); return m })
    }

    // Belt-and-braces client-side cap. Vercel's Node serverless runtime
    // enforces a 4.5 MB request-body cap regardless of what our route
    // says, so 12 MB is a soft ceiling — the downscale pass below
    // brings everything comfortably under 4 MB. We still keep the cap
    // in case the user feeds us a deliberately huge non-image file or
    // an image format that doesn't decode (SVG / GIF skip downscale).
    const MAX_CLIENT_BYTES = 12 * 1024 * 1024
    if (file.size > MAX_CLIENT_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      setFailure(`File is ${mb} MB — max 12 MB. Try exporting at a lower resolution.`)
      return
    }

    // Downscale large images via canvas so the body fits under
    // Vercel's 4.5 MB platform cap. PNG keeps alpha, JPEG q90
    // otherwise. Files ≤3.5 MB pass through untouched. The user's
    // 6.4 MB reel-frame upload was the impetus — see
    // lib/asset-upload/downscale.ts.
    const { maybeDownscaleImage } = await import('@/lib/asset-upload/downscale')
    let uploadFile = file
    try {
      uploadFile = await maybeDownscaleImage(file)
      if (uploadFile !== file) {
        const beforeMb = (file.size       / 1024 / 1024).toFixed(1)
        const afterMb  = (uploadFile.size / 1024 / 1024).toFixed(1)
        addLog(`Downscaled ${assetType} from ${beforeMb} MB → ${afterMb} MB to fit upload limit`)
      }
    } catch (err) {
      console.warn('[asset-upload] downscale failed', err)
      // Fall through with the original file — the server will return
      // a clean error if it really is too large.
    }

    const fd = new FormData()
    fd.append('file', uploadFile)
    fd.append('projectId', projectId)
    fd.append('assetKey', assetType)
    fd.append('theme', theme || 'custom')
    addLog(`Uploading ${assetType}…`)
    try {
      const res = await fetch('/api/assets/upload', { method: 'POST', body: fd })
      // Defensive parse — a Vercel-platform 413 ships HTML before our
      // route runs, and res.json() would throw a confusing
      // "Unexpected token <" otherwise. Read text first, JSON-parse
      // only when the content-type says so.
      const ct  = res.headers.get('content-type') ?? ''
      const raw = await res.text()
      let json: Record<string, unknown> = {}
      if (ct.includes('application/json')) {
        try { json = JSON.parse(raw) as Record<string, unknown> } catch { /* fall through */ }
      }
      if (!res.ok || json.error) {
        const msg = (json.message as string)
                  ?? (json.error as string)
                  ?? (res.status === 413
                      ? 'File too large for the upload endpoint (server cap).'
                      : `Upload failed (HTTP ${res.status})`)
        setFailure(msg)
        return
      }
      const newAsset: GeneratedAsset = (json.asset as GeneratedAsset | undefined) ?? {
        id:         crypto.randomUUID(),
        project_id: projectId,
        type:       assetType,
        url:        json.url as string,
        prompt:     'User uploaded image',
        theme:      theme || 'custom',
        provider:   'upload' as const,
        created_at: new Date().toISOString(),
      }
      setAssets(prev => ({ ...prev, [assetType]: newAsset }))
      setAssetHistory(prev => ({ ...prev, [assetType]: [newAsset, ...(prev[assetType] ?? [])] }))
      setSelected(assetType)
      setRightTab('inspector')
      clearFailure()
      // Sync the new URL into the editor iframe (see onAddToCanvas
      // comment on Props — without this the iframe's EL_ASSETS stays
      // stale and the upload disappears on project reload).
      if (newAsset.url) onAddToCanvas?.(assetType, newAsset.url)
      addLog(`✓ Uploaded ${assetType}`)
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Network error')
    }
  }, [projectId, theme, addLog, onAddToCanvas])

  // ─── Version revert ─────────────────────────────────────────────────────────
  /** Swap the active version for a type to a historical one (client-side only). */
  const handleRevert = useCallback((assetType: AssetType, historicalAsset: GeneratedAsset) => {
    setAssets(prev => ({ ...prev, [assetType]: historicalAsset }))
    // Also push the restored URL into the iframe so EL_ASSETS + save
    // reflect the rollback. Without this, reverting is purely cosmetic
    // in the Art view and the on-canvas layer stays on whatever
    // version was injected last.
    if (historicalAsset.url) onAddToCanvas?.(assetType, historicalAsset.url)
    addLog(`↩ Reverted ${assetType} to version from ${timeAgo(historicalAsset.created_at)}`)
  }, [addLog, onAddToCanvas])

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
    {/* ── Generate-All / Fill-Gaps confirmation ──────────────────────────────
       Pre-flight before kicking the SSE batch. Shows scope + credit cost +
       remaining balance. Free / no-AI plans never reach this surface — they
       get the upgrade gate from requestGenerateConfirm() instead. */}
    {confirmGen && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'linear-gradient(180deg, rgba(22,27,41,.96), rgba(10,12,20,.98))',
          border: '1px solid rgba(215,168,79,.30)',
          borderRadius: 20, padding: 28, maxWidth: 460, width: '90%',
          position: 'relative', boxShadow: '0 40px 120px rgba(0,0,0,.55)',
        }}>
          <button
            onClick={() => setConfirmGen(null)}
            style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#7a7a8a' }}
            aria-label="Close"
          ><X size={16} /></button>
          <div style={{ fontSize: 28, marginBottom: 6 }}>✨</div>
          <p style={{ fontWeight: 700, fontSize: 17, color: '#f4efe4', margin: '0 0 6px' }}>
            Ready to generate {confirmGen.label}?
          </p>
          <p style={{ fontSize: 12.5, color: '#a5afc0', lineHeight: 1.6, margin: '0 0 20px' }}>
            We&apos;ll prompt the AI for each asset (theme, palette, style, audience), upload the results, and stream them back into the grid as they land. You can re-roll any individual tile after.
          </p>

          {/* Cost / balance card */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 1,
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.07)',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 22,
          }}>
            {[
              { lbl: 'Assets',        val: String(confirmGen.types.length) },
              { lbl: 'Credits',       val: String(confirmGen.types.length) },
              { lbl: 'After',         val: confirmGen.total > 0
                  ? `${Math.max(0, confirmGen.total - confirmGen.used - confirmGen.types.length)} / ${confirmGen.total}`
                  : '—' },
            ].map((cell, i) => (
              <div key={i} style={{ background: '#0f1118', padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: '#7d8799', marginBottom: 6, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                  {cell.lbl}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: i === 1 ? '#f0ca79' : '#f4efe4', letterSpacing: '-.02em' }}>
                  {cell.val}
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11, color: '#7d8799', lineHeight: 1.55, margin: '0 0 18px' }}>
            1 credit = 1 generated asset. Credits are only deducted on successful provider responses; failed assets are refunded automatically.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setConfirmGen(null)}
              style={{
                flex: 0.7, padding: '11px 18px',
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.10)',
                color: '#a5afc0',
                borderRadius: 999, cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >Cancel</button>
            <button
              onClick={() => {
                const args = confirmGen
                setConfirmGen(null)
                // Fire the actual batch — same path as before, just gated.
                runBatchGenerate(args.fillGaps, args.types)
              }}
              style={{
                flex: 1, padding: '11px 18px',
                background: 'linear-gradient(135deg,#d7a84f,#f0ca79)',
                color: '#0a0c10',
                border: 'none', borderRadius: 999, cursor: 'pointer',
                fontSize: 13, fontWeight: 700, letterSpacing: '-.005em',
                boxShadow: '0 4px 20px rgba(215,168,79,.28), inset 0 1px 0 rgba(255,255,255,.3)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'inherit',
              }}
            >
              <Sparkles size={14} /> Generate {confirmGen.types.length}
            </button>
          </div>
        </div>
      </div>
    )}

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
        /* Style card hover: gentle lift + shadow pop so the cards feel
           tactile instead of snap-swap borders. Skip when already active. */
        .sf-style-card {
          transition: transform .15s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow .15s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color .15s;
          will-change: transform;
        }
        .sf-style-card:hover:not(.active) {
          transform: translateY(-2px) scale(1.04);
          box-shadow: 0 6px 18px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.2);
          border-color: rgba(255,255,255,.25) !important;
          z-index: 1;
        }
        .sf-style-card.active { border-color: #c9a84c !important; }

        /* Asset tile image: bounce-pop in when the URL changes (i.e. a
           fresh asset landed after generation). The <img key={url}>
           remount replays the keyframes naturally. */
        @keyframes sf-tile-pop-in {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
        .sf-tile img { animation: sf-tile-pop-in .4s cubic-bezier(0.16, 1.3, 0.3, 1); }

        /* Inspector panel: slide-in from the right + fade when the user
           selects a different asset. Driven by a keyed wrapper below. */
        @keyframes sf-inspector-slide {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0);   }
        }

        .sf-input:focus { border-color: #c9a84c !important; outline: none; }
        textarea:focus { outline: none; border-color: #c9a84c !important; }

        /* Respect reduced-motion preference — disables the new motion
           layer without disabling functional transitions. */
        @media (prefers-reduced-motion: reduce) {
          .sf-style-card, .sf-tile img {
            transition: none !important;
            animation: none !important;
          }
        }
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
        // Thin top strip — just the workspace label + progress pill. The
        // "< Canvas" back button that used to live here was removed; users
        // switch workspaces via the tabs in the editor menubar (Art /
        // Typography / Flow / …), so the redundant in-workspace back arrow
        // was clutter.
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
        {/* Two modes on one column:
              Assets — the legacy navigator (progress pill + group buttons +
                       batch actions).
              Inputs — the PromptInputsPanel (v109): every field that shapes
                       the AI prompt, editable inline.
            A header tab-switcher keeps them peers so users can flip without
            leaving the Art workspace. Each mode owns its own scroll. */}
        <aside style={{
          width: SIDEBAR_W, minWidth: SIDEBAR_W,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', background: C.surface,
        }}>
          <SidebarTabSwitcher mode={sidebarMode} onChange={setSidebarMode} />
          {sidebarMode === 'typography' ? (
            // Typography mode: the SIDEBAR is intentionally empty. The
            // full TypographyWorkspace UI takes over the main pane
            // below — see the matching branch in the canvas section.
            // A small breadcrumb keeps the user oriented.
            <div style={{
              padding: '14px 16px',
              fontSize: 11, color: C.txMuted, lineHeight: 1.6,
              fontFamily: C.font, letterSpacing: '.02em',
            }}>
              Typography spec lives in the main pane. Switch to Assets
              or Inputs to come back to art generation.
            </div>
          ) : sidebarMode === 'assets' ? (
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
          ) : (
            <PromptInputsPanel
              meta={effectiveMeta}
              onChange={patch => {
                // Apply optimistically so controlled inputs reflect the
                // keystroke immediately — the server round-trip confirms
                // and overwrites the overlay on next autosave.
                setMetaOverlay(prev => ({ ...prev, ...patch }))
                onUpdateMeta?.(patch)
              }}
              onAddReference={async (file) => {
                // Step 1 — upload to Supabase Storage under a references.*
                // asset-key so the image survives a payload refresh.
                //   The key is namespaced with a random id so multiple
                //   references don't collide on storage filenames.
                const refId = `ref_${Math.random().toString(36).slice(2, 10)}`
                const fd = new FormData()
                fd.append('file',     file)
                fd.append('projectId', projectId)
                fd.append('assetKey',  `references.${refId}`)
                const upRes = await fetch('/api/assets/upload', { method: 'POST', body: fd })
                if (!upRes.ok) {
                  const err = await upRes.json().catch(() => ({}))
                  throw new Error(err.error || `Upload failed (${upRes.status})`)
                }
                const { url } = await upRes.json() as { url?: string }
                if (!url) throw new Error('Upload returned no URL')

                // Step 2 — describe the reference's style. GPT-4o vision
                // returns a ~90-word aesthetic description (palette /
                // material / lighting / form language) with NO subject
                // matter, so the style carries without hijacking the
                // depicted content of the generated asset.
                const descRes = await fetch('/api/references/describe', {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({ project_id: projectId, image: url }),
                })
                const descJson = await descRes.json().catch(() => ({}))
                if (!descRes.ok || !descJson.description) {
                  throw new Error(descJson.error || `Describe failed (${descRes.status})`)
                }
                const description = descJson.description as string

                // Step 3 — patch the meta with the full array. The
                // SF_UPDATE_META bridge writes to P.artRefImages and
                // markDirty so autosave persists. collectMeta emits it
                // as part of the payload.meta.artRefImages on next save.
                const existing = (effectiveMeta.artRefImages as Array<{id:string;url:string;description:string}> | undefined) ?? []
                const next     = [...existing, { id: refId, url, description }].slice(0, 3)
                onUpdateMeta?.({ artRefImages: next } as unknown as Partial<PromptInputsMeta>)
                addLog(`✓ Reference image analysed — ${description.length} chars of style description`)
              }}
              onRemoveReference={(id) => {
                const existing = (effectiveMeta.artRefImages as Array<{id:string;url:string;description:string}> | undefined) ?? []
                const next     = existing.filter(r => r.id !== id)
                onUpdateMeta?.({ artRefImages: next } as unknown as Partial<PromptInputsMeta>)
              }}
              // Anchors for the art bible — generated assets the user
              // could lock as "this is the visual signature". We surface
              // the few that actually represent the project's identity
              // (logo, character, two backgrounds) so the dropdown stays
              // short. Only assets with URLs are eligible — un-generated
              // slots are filtered out before the panel sees the list.
              availableAnchors={(() => {
                const candidates: Array<{ key: AssetType; label: string }> = [
                  { key: 'logo',             label: 'Logo' },
                  { key: 'character',        label: 'Character' },
                  { key: 'background_base',  label: 'Background — Base' },
                  { key: 'background_bonus', label: 'Background — Bonus' },
                ]
                return candidates
                  .map(c => ({
                    key: c.key as string,
                    label: c.label,
                    url: assets[c.key]?.url ?? '',
                  }))
                  .filter(a => !!a.url)
              })()}
              onGenerateArtBible={async ({ assetKey, url }) => {
                // Same /api/references/describe endpoint as the
                // moodboard refs, but with kind:'art_bible' which
                // triggers the longer, more authoritative prompt
                // tuning (see app/api/references/describe/route.ts).
                const res = await fetch('/api/references/describe', {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({
                    project_id: projectId,
                    image:      url,
                    kind:       'art_bible',
                    hint:       `anchor asset: ${assetKey}`,
                  }),
                })
                const json = await res.json().catch(() => ({}))
                if (!res.ok || !json.description) {
                  throw new Error(json.error || `Art bible generation failed (${res.status})`)
                }
                const description = json.description as string
                // Patch meta with the full bible object — id-less
                // (only one bible per project), so SF_UPDATE_META
                // overwrites whatever was there.
                onUpdateMeta?.({
                  artBible: {
                    anchorAssetKey: assetKey,
                    anchorUrl:      url,
                    description,
                    generatedAt:    new Date().toISOString(),
                  },
                } as unknown as Partial<PromptInputsMeta>)
                addLog(`✓ Art bible generated from ${assetKey} — ${description.length} chars`)
              }}
              onClearArtBible={() => {
                // Send an explicit `null` (not just `undefined`) so the
                // editor.js SF_UPDATE_META handler clears P.artBible
                // instead of leaving the previous value untouched.
                onUpdateMeta?.({ artBible: null } as unknown as Partial<PromptInputsMeta>)
                addLog('Art bible cleared')
              }}
            />
          )}
        </aside>

        {/* ── MAIN AREA ───────────────────────────────────────────────────── */}
        <main style={{
          flex:      1,
          display:   'flex',
          flexDirection: 'column',
          overflow:  'hidden',
          borderLeft:  `1px solid ${C.border}`,
          borderRight: `1px solid ${C.border}`,
        }}>
          {sidebarMode === 'typography' ? (
            // Embedded TypographyWorkspace — replaces the entire art
            // pane content while still inside Art's outer chrome.
            // Switching sidebar mode back to Assets / Inputs returns
            // the user to the art generation flow without any
            // navigation.
            <TypographyWorkspace
              projectId={projectId}
              projectName={projectName}
              projectMeta={projectMeta}
              initialSpec={initialTypographySpec ?? null}
              onSpecChange={onTypographySpecChange}
            />
          ) : (
            <>
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
            onOpenInputs={() => setSidebarMode('inputs')}
          />

          {/* Symbol-name nag banner — sits above the grid so it's visible
              EVERY time the user is about to generate, not buried in the
              Inputs tab. Names are the single biggest unused lever on
              generation quality; without them, every tier comes back as a
              generic "premium icon" in the chosen theme. Dismisses for the
              session on click (we don't persist dismissal; the user should
              see it again when they return if still empty). */}
          <SymbolNameNag
            meta={effectiveMeta}
            onJumpToNames={() => setSidebarMode('inputs')}
          />

          {/* Failed-batch banner — surfaces partial failures from the
              last run with a one-click "retry all" that re-fires only
              the failed types (not the whole batch). Persists until
              the user retries / dismisses, OR until every failed type
              gets re-generated and clears its own entry. */}
          {failedTypes.size > 0 && (
            <BatchFailureBanner
              failedTypes={failedTypes}
              shortLabels={shortLabels}
              onRetryAll={() => {
                const types = Array.from(failedTypes.keys())
                runBatchGenerate(false, types)
              }}
              onDismiss={() => setFailedTypes(new Map())}
              disabled={batchRunning}
            />
          )}

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
                onGenerateGroup={handleGenerateGroup}
                batchRunning={batchRunning}
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
            </>
          )}
        </main>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
        <RightInspectorPanel
          selectedKey={selected}
          selectedIsFeature={selectedIsFeature}
          selectedAsset={selectedAsset ?? undefined}
          selectedHistory={
            selected && !selectedIsFeature
              ? (assetHistory[selected as AssetType] ?? [])
              : []
          }
          rightTab={rightTab}
          onTabChange={setRightTab}
          customPrompt={customPrompt}
          onPromptChange={setCustomPrompt}
          regenTarget={regenTarget}
          theme={theme}
          onRegenBase={handleRegen}
          onRevertBase={handleRevert}
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
        // effectiveMeta carries the optimistic metaOverlay on top of
        // the shell's editorMeta, so inline edits from the Inputs panel
        // reach the popup's preview + generate calls immediately — not
        // only after the next SF_AUTOSAVE round-trips them to the shell.
        projectMeta={effectiveMeta as Record<string, unknown>}
        defaultStyleId={styleId || undefined}
        onGenerated={(key, asset) => {
          if (FEATURE_SLOT_KEYS.has(key)) {
            setFeatureAssets(prev => ({ ...prev, [key]: asset }))
          } else {
            const at = key as AssetType
            setAssets(prev => ({ ...prev, [at]: asset }))
            setAssetHistory(prev => ({ ...prev, [at]: [asset, ...(prev[at] ?? [])] }))
            setFailedTypes(prev => { const m = new Map(prev); m.delete(at); return m })
            setRightTab('inspector')
          }
          // Push the new URL into the editor iframe so EL_ASSETS stays in
          // sync. Without this, character / logo generations done here
          // never reach the iframe's state and disappear on project
          // reload. Same sync AssetsPanel (right sidebar) already does.
          if (asset?.url) onAddToCanvas?.(key, asset.url)
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
      projectName={(effectiveMeta.gameName as string | undefined) || undefined}
      theme={theme}
      styleId={styleId || undefined}
      // Same reason as the popup above — effectiveMeta beats projectMeta
      // so the live preview in Review Prompts reflects the user's
      // pre-save edits.
      projectMeta={effectiveMeta as Record<string, unknown>}
      slots={reviewSlots}
      onOverridesChanged={(next) => {
        // v119 shape: { text, mode } per slot. Count entries with
        // a non-empty text; mode is informational, doesn't affect count.
        setOverrideCount(Object.values(next).filter(v => v?.text && v.text.trim()).length)
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
    // NOTE: no outer <aside> wrapper here — the parent AssetsWorkspace now
    // wraps this + PromptInputsPanel in a shared <aside> with the
    // SidebarTabSwitcher on top, so LeftSidebar is just the flex-growing
    // body of whichever tab is active.
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${C.border}` }}>
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
    </div>
  )
}

// ─── Sidebar tab switcher — Assets / Inputs / Typography ──────────────────
//
// Typography is a true embedded mode now: when the user picks it, the
// main pane swaps to the TypographyWorkspace component INSIDE Art —
// no full-page workspace switch. Coming back is just clicking Assets
// or Inputs again.
type SidebarMode = 'assets' | 'inputs' | 'typography'

function SidebarTabSwitcher({
  mode, onChange,
}: {
  mode: SidebarMode
  onChange: (m: SidebarMode) => void
}) {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: '8px 10px 6px',
      borderBottom: `1px solid ${C.border}`, flexShrink: 0,
    }}>
      {([
        { id: 'assets',     label: 'Assets'     },
        { id: 'inputs',     label: 'Inputs'     },
        { id: 'typography', label: 'Typography' },
      ] as const).map(tab => {
        const active = mode === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1, padding: '6px 10px',
              background: active ? C.surfHigh : 'transparent',
              border: `1px solid ${active ? C.borderMed : 'transparent'}`,
              borderRadius: 5,
              color: active ? C.tx : C.txMuted,
              fontSize: 11, fontWeight: 600, fontFamily: C.font,
              cursor: 'pointer', letterSpacing: '.02em',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Symbol-name nag banner ────────────────────────────────────────────────
// Thin amber strip above the asset grid. Counts empty symbol names (high /
// low / special) and surfaces a single-click jump to the Inputs panel's
// Symbols section. Hidden when every tier is named OR when the project has
// zero symbol slots configured.
// ─── Batch failure banner ─────────────────────────────────────────────────
// Sits above the asset grid when the last run had partial failures.
// One-click "retry all" re-fires only the failed types (runBatchGenerate
// already supports a scoped explicitTypes list — same path the per-group
// buttons use). The dropdown reveal lets the user inspect what failed
// and why before deciding whether to retry — a content-policy reject
// won't succeed by retrying, but a rate-limit blip will.
function BatchFailureBanner({
  failedTypes, shortLabels, onRetryAll, onDismiss, disabled,
}: {
  failedTypes: Map<AssetType, string>
  shortLabels: Partial<Record<AssetType, string>>
  onRetryAll:  () => void
  onDismiss:   () => void
  disabled:    boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const entries = Array.from(failedTypes.entries())
  const count   = entries.length

  return (
    <div style={{
      borderBottom: `1px solid rgba(248,113,113,.25)`,
      background:   'rgba(248,113,113,.05)',
      fontFamily:   C.font,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
      }}>
        <XCircle size={12} style={{ color: C.red, flexShrink: 0 }} />
        <span style={{
          fontSize: 9, fontWeight: 700, color: C.red,
          background: 'rgba(248,113,113,.15)',
          border: '1px solid rgba(248,113,113,.4)',
          borderRadius: 3, padding: '2px 6px', letterSpacing: '.04em',
          flexShrink: 0,
        }}>
          {count} failed
        </span>
        <span style={{ color: '#f0a3a3', fontSize: 11, flex: 1, minWidth: 0 }}>
          Last batch had {count} failure{count === 1 ? '' : 's'}.
          {' '}
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'transparent', border: 'none', padding: 0,
              color: '#f0a3a3', cursor: 'pointer', fontSize: 11,
              fontFamily: 'inherit', textDecoration: 'underline',
              textDecorationStyle: 'dotted', textUnderlineOffset: 2,
            }}
          >
            {expanded ? 'Hide details' : 'Show what failed'}
          </button>
        </span>
        <button
          onClick={onRetryAll}
          disabled={disabled}
          title={disabled
            ? 'A batch is already running'
            : `Retry only the ${count} failed asset${count === 1 ? '' : 's'}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 5,
            background: disabled ? C.surfHigh : 'rgba(248,113,113,.16)',
            border: '1px solid rgba(248,113,113,.5)',
            color: disabled ? C.txFaint : C.red,
            fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            cursor: disabled ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          <RefreshCw size={10} />
          Retry failed
        </button>
        <button
          onClick={onDismiss}
          title="Dismiss the banner — failed tiles still show their red state until re-generated."
          style={{
            padding: '3px 5px', borderRadius: 4,
            background: 'transparent', border: 'none',
            color: '#c87070', fontSize: 11, cursor: 'pointer',
            fontFamily: 'inherit', flexShrink: 0,
          }}
        >
          <X size={11} />
        </button>
      </div>

      {/* Per-failure detail — collapsed by default to keep the banner
          tight, expanded shows the asset label + truncated reason for
          each failure so the user can spot patterns (all rate-limit?
          worth retrying. all content-policy? prompt needs editing). */}
      {expanded && (
        <div style={{
          padding: '0 14px 10px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {entries.map(([type, msg]) => {
            const label = shortLabels[type] ?? ASSET_LABELS[type] ?? type
            return (
              <div
                key={type}
                title={msg}
                style={{
                  display: 'flex', gap: 8, alignItems: 'baseline',
                  padding: '4px 8px',
                  background: 'rgba(248,113,113,.04)',
                  border: '1px solid rgba(248,113,113,.15)',
                  borderRadius: 4,
                  fontSize: 10,
                }}
              >
                <span style={{
                  color: C.red, fontWeight: 700, fontFamily: "'DM Mono',monospace",
                  flexShrink: 0, minWidth: 80,
                }}>
                  {label}
                </span>
                <span style={{
                  color: '#d49595', flex: 1, minWidth: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontFamily: "'DM Mono','JetBrains Mono',monospace",
                }}>
                  {msg}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SymbolNameNag({
  meta, onJumpToNames,
}: { meta: PromptInputsMeta; onJumpToNames: () => void }) {
  const [dismissed, setDismissed] = useState(false)
  const countEmpty = (names: string[] | undefined, total: number | undefined) => {
    const t = Math.max(0, Math.min(8, Number(total ?? 5)))
    const list = names ?? []
    let empty = 0
    for (let i = 0; i < t; i++) if (!(list[i] ?? '').trim()) empty++
    return empty
  }
  const h = countEmpty(meta.symbolHighNames,    meta.symbolHighCount)
  const l = countEmpty(meta.symbolLowNames,     meta.symbolLowCount)
  const s = countEmpty(meta.symbolSpecialNames, meta.symbolSpecialCount)
  const total = h + l + s
  if (total === 0 || dismissed) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px',
      background: 'rgba(251,191,36,.08)',
      borderBottom: `1px solid rgba(251,191,36,.25)`,
      color: '#fbbf24', fontSize: 11, fontFamily: C.font,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700,
        background: 'rgba(251,191,36,.18)',
        border: '1px solid rgba(251,191,36,.4)',
        borderRadius: 3, padding: '2px 6px', letterSpacing: '.04em',
      }}>
        {total} unnamed
      </span>
      <span style={{ color: '#e5c07b', flex: 1, minWidth: 0 }}>
        Symbol names drive icon identity — without them, every tier comes
        back as a generic "premium icon in {meta.themeKey || 'your theme'}".
        {h > 0 && ` ${h} high,`}{l > 0 && ` ${l} low,`}{s > 0 && ` ${s} special`} still blank.
      </span>
      <button
        onClick={onJumpToNames}
        style={{
          padding: '4px 10px', borderRadius: 5,
          background: 'rgba(251,191,36,.16)',
          border: '1px solid rgba(251,191,36,.45)',
          color: '#fbbf24', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        }}
      >
        Fill in names →
      </button>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss for this session"
        style={{
          padding: '3px 5px', borderRadius: 4,
          background: 'transparent', border: 'none',
          color: '#c89a2e', fontSize: 11, cursor: 'pointer',
          fontFamily: 'inherit', flexShrink: 0,
        }}
      >
        <X size={11} />
      </button>
    </div>
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
  /** Flip the left sidebar to Inputs mode. Wired to the tiny "change"
   *  link on the style status pill since the full picker now lives in
   *  PromptInputsPanel — duplicate pickers were confusing. */
  onOpenInputs?:     () => void
}

function GenerationControlBar({
  theme, onThemeChange, styleId, onStyleChange: _onStyleChange,
  provider, onProviderChange,
  generating, onGenerate, onGenerateMissing, missingCount,
  onReviewPrompts, overrideCount = 0, onOpenInputs,
}: GenBarProps) {
  // onStyleChange is preserved in the interface for legacy callers; the
  // status pill no longer lets the user *change* the style — that UI
  // moved to PromptInputsPanel (v109) so the Art workspace has exactly
  // one place where every prompt-affecting input lives.
  const currentStyle = styleId
    ? GRAPHIC_STYLES.find(s => s.id === styleId)
    : undefined
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

      {/* Row 2: Style status badge. v2 UX (Phase 4): more visual weight
          per the UX critique §6 — "the whole generation pipeline shifts
          when style changes; it deserves prominence". A chosen style
          gets a thick gold-bordered badge with the style icon prominent;
          no-style state reads as a clear call-to-action. The full
          14-card picker still lives in PromptInputsPanel (sidebar
          Inputs tab) so duplication is avoided — this stays a status
          + entry point. */}
      <div style={{
        marginTop: 12,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 10, color: C.txMuted, fontWeight: 600,
          letterSpacing: '.06em', textTransform: 'uppercase',
        }}>
          Style
        </span>
        <button
          onClick={onOpenInputs}
          title={currentStyle
            ? `${currentStyle.name} — click to change in Inputs`
            : 'Pick a style — click to open Inputs'}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 14px 8px 10px',
            background: currentStyle
              ? 'linear-gradient(135deg,rgba(201,168,76,.18) 0%,rgba(201,168,76,.06) 100%)'
              : C.surfHigh,
            border: `1.5px ${currentStyle ? 'solid' : 'dashed'} ${currentStyle ? 'rgba(201,168,76,.6)' : 'rgba(255,255,255,.12)'}`,
            borderRadius: 10,
            color: currentStyle ? C.gold : C.txMuted,
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            cursor: onOpenInputs ? 'pointer' : 'default',
            boxShadow: currentStyle ? '0 0 0 1px rgba(201,168,76,.18), 0 4px 14px rgba(201,168,76,.12)' : 'none',
            transition: 'all .15s',
          }}
        >
          <StyleIcon id={currentStyle?.id ?? 'default'} size={20} />
          <span>{currentStyle?.name ?? 'Pick a style'}</span>
          {onOpenInputs && (
            <span style={{
              fontSize: 9, color: currentStyle ? 'rgba(201,168,76,.7)' : C.txFaint,
              fontWeight: 500,
              paddingLeft: 8, borderLeft: `1px solid ${currentStyle ? 'rgba(201,168,76,.25)' : C.border}`,
              letterSpacing: '.04em',
            }}>
              {currentStyle ? 'change ↗' : 'open Inputs ↗'}
            </span>
          )}
        </button>
        {currentStyle?.description && (
          <span style={{ fontSize: 11, color: C.txFaint, fontStyle: 'italic' }}>
            {currentStyle.description}
          </span>
        )}
      </div>
    </div>
  )
}

// StylePickerStrip was removed in v112. The full 14-card picker now lives
// exclusively in PromptInputsPanel (sidebar Inputs tab) — users flagged
// the duplicate pickers as confusing. GenerationControlBar now renders a
// compact status pill + "change in Inputs" link instead.
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
  /** v116: now carries per-type error message, not just a presence Set.
   *  AssetTile reads .get(type) for the tooltip text; the truthy/falsy
   *  check `.has(type)` keeps behaving the same. */
  failedTypes:     Map<AssetType, string>
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
  /** Batch-generate every type in this group. Fill-gaps vs regenerate-all
   *  is decided inside the handler — if any slot in the group is empty,
   *  fill-gaps; otherwise regenerate all. Keeps the per-group button
   *  always actionable. */
  onGenerateGroup: (types: AssetType[]) => void
  /** Global batch-running flag — disables the per-group button while a
   *  batch is in flight to avoid queueing two competing batches. */
  batchRunning:    boolean
}

function AssetGroupSection({
  group, assets, failedTypes, assetHistory, selectedType, regenTarget,
  onSelect, onRegen, onOpenPromptTab, onUpload, onRevert, isActive, shortLabels,
  onGenerateGroup, batchRunning,
}: AssetGroupSectionProps) {
  const filledCount = group.types.filter(t => !!assets[t]).length
  const emptyCount  = group.types.length - filledCount
  // "Fill" mode when some slots are empty; "Re-roll" when the group is
  // complete. Same button, label + semantics flip.
  const fillMode    = emptyCount > 0
  const buttonLabel = fillMode
    ? `Generate ${emptyCount} missing`
    : `Re-roll all ${group.types.length}`

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
        <div style={{ flex: 1 }} />
        {/* Per-group batch button. Dimmed while any batch is running so a
            click doesn't stack two concurrent runs. Label flips based on
            whether the group has empty slots — "fill gaps" by default so
            the action is lossless; re-roll is opt-in once the group is
            complete. */}
        <button
          onClick={() => onGenerateGroup(group.types)}
          disabled={batchRunning}
          title={fillMode
            ? `Generate every empty slot in ${group.label}`
            : `Regenerate every slot in ${group.label} — overwrites existing assets`}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 5,
            background: batchRunning
              ? C.surfHigh
              : fillMode ? C.goldBg : 'rgba(255,255,255,.04)',
            border: `1px solid ${fillMode ? 'rgba(201,168,76,.35)' : C.border}`,
            color: batchRunning ? C.txFaint : fillMode ? C.gold : C.txMuted,
            fontSize: 10, fontWeight: 600, fontFamily: C.font,
            cursor: batchRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <Sparkles size={10} />
          <span>{buttonLabel}</span>
        </button>
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
            failureMessage={failedTypes.get(type)}
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
  /** v116: optional human-readable error from the pipeline (rate
   *  limit, content policy, network, etc.). Surfaced as the tile's
   *  hover tooltip and the FailedTilePlaceholder caption so the user
   *  can decide whether retry is worth a credit. */
  failureMessage?: string
  aspectRatio:     '16/9' | '1/1'
  onSelect:        () => void
  onRegen:         () => void
  onOpenPromptTab: () => void
  onUpload:        (file: File) => void
  onRevert:        (asset: GeneratedAsset) => void
  label?:          string
}

function AssetTile({
  assetType, asset, history, isSelected, isRegenerating, isFailed, failureMessage,
  aspectRatio, onSelect, onRegen, onOpenPromptTab, onUpload, onRevert, label: labelProp,
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
      {/* Three distinct tile states per the UX critique: (1) generating
          takes precedence visually (shimmer + pulse); (2) failed shows a
          red-tinted retry card; (3) has-asset shows the image (with a
          shimmer overlay when re-generating over an existing asset);
          (4) idle shows a dashed "Not generated" card. */}
      {isRegenerating ? (
        <GeneratingTilePlaceholder label={label} />
      ) : isFailed && !asset?.url ? (
        <FailedTilePlaceholder
          label={label}
          message={failureMessage}
          onRetry={e => { e.stopPropagation(); onRegen() }}
        />
      ) : asset?.url ? (
        <img
          // key on URL so the bounce-pop keyframe replays whenever a
          // fresh asset lands — makes the completion moment delightful
          // rather than snapping in.
          key={asset.url}
          src={asset.url}
          alt={label}
          style={{
            width:      '100%',
            height:     '100%',
            objectFit:  'cover',
            display:    'block',
          }}
        />
      ) : (
        <IdleTilePlaceholder label={label} />
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

      {/* History badge — shown when multiple versions exist. Icon + count
          makes the affordance scannable ("there's history here") instead
          of a cryptic "v2" pill that users missed entirely in the prior
          build. The badge opens the full-tile history overlay below. */}
      {prevVersions.length > 0 && !isRegenerating && (
        <button
          title={`${prevVersions.length} previous version${prevVersions.length > 1 ? 's' : ''} — click to browse`}
          onClick={e => { e.stopPropagation(); setShowHistory(v => !v) }}
          style={{
            position:   'absolute',
            top:        5,
            left:       5,
            display:    'flex',
            alignItems: 'center',
            gap:        3,
            padding:    '2px 6px 2px 5px',
            background: showHistory ? 'rgba(201,168,76,.35)' : 'rgba(6,6,10,.75)',
            border:     `1px solid ${showHistory ? C.gold : 'rgba(201,168,76,.4)'}`,
            borderRadius: 10,
            color:      showHistory ? '#06060a' : C.gold,
            backdropFilter: 'blur(2px)',
            fontSize:   9,
            fontWeight: 700,
            cursor:     'pointer',
            lineHeight: 1,
            letterSpacing: '.04em',
          }}
        >
          <History size={9} />
          <span>{prevVersions.length + 1}</span>
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

/** Idle state — no asset yet, not generating, not failed. Dashed-border
 *  card that communicates "ready for you" without the busy hatching the
 *  previous version used. Per UX critique: 3 distinct states instead of
 *  one "empty" bucket with isRegenerating booleans. */
function IdleTilePlaceholder({ label }: { label: string }) {
  return (
    <div style={{
      position:       'absolute', inset: 6,
      display:        'flex', flexDirection: 'column',
      alignItems:     'center', justifyContent: 'center',
      gap:            6,
      border:         '1px dashed rgba(255,255,255,.12)',
      borderRadius:   8,
      background:     'rgba(255,255,255,.015)',
    }}>
      <Sparkles size={14} style={{ opacity: .35, color: C.gold }} />
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.04em', textAlign: 'center', padding: '0 4px', color: C.txMuted }}>
        {label}
      </span>
      <span style={{ fontSize: 8, color: C.txFaint, letterSpacing: '.04em' }}>
        Not generated
      </span>
    </div>
  )
}

/** Generating state — animated shimmer skeleton sweeping left→right,
 *  plus a subtle pulsing border glow so the tile reads as actively doing
 *  work (not just loading). The shimmer is a single layered gradient
 *  keyframed via CSS; keyframes live in a <style> block inside the
 *  component so the tile is self-contained. */
function GeneratingTilePlaceholder({ label }: { label: string }) {
  return (
    <>
      <style>{`
        @keyframes sf-tile-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes sf-tile-pulse {
          0%, 100% { box-shadow: inset 0 0 0 1px rgba(201,168,76,.35); }
          50%      { box-shadow: inset 0 0 0 1px rgba(201,168,76,.75); }
        }
      `}</style>
      <div style={{
        width: '100%', height: '100%',
        position: 'relative', overflow: 'hidden',
        background: 'rgba(18,18,28,0.9)',
        animation: 'sf-tile-pulse 1.8s ease-in-out infinite',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6,
      }}>
        {/* Shimmer sweep */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(110deg, transparent 25%, rgba(201,168,76,.15) 45%, rgba(255,224,140,.25) 55%, transparent 75%)',
          animation: 'sf-tile-shimmer 1.5s ease-in-out infinite',
        }}/>
        {/* Foreground content */}
        <Loader2 size={18} style={{ color: C.gold, animation: 'spin 1s linear infinite', position: 'relative', zIndex: 1 }} />
        <span style={{ fontSize: 9, fontWeight: 600, color: C.gold, letterSpacing: '.04em', textAlign: 'center', padding: '0 4px', position: 'relative', zIndex: 1 }}>
          {label}
        </span>
        <span style={{ fontSize: 8, color: C.gold, opacity: 0.65, letterSpacing: '.04em', position: 'relative', zIndex: 1 }}>
          Generating…
        </span>
      </div>
    </>
  )
}

function FailedTilePlaceholder({
  label, message, onRetry,
}: {
  label:    string
  message?: string
  onRetry:  (e: React.MouseEvent) => void
}) {
  // Truncate aggressively in the tile body — full text rides in the
  // title attribute and is also surfaced by the parent tile's title
  // tooltip. Failed tiles are tiny; an overflowing error message looks
  // like noise.
  const short = message
    ? (message.length > 60 ? message.slice(0, 60).trim() + '…' : message)
    : ''
  return (
    <div
      title={message ? `${label}: ${message}` : label}
      style={{
        width:          '100%',
        height:         '100%',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            6,
        padding:        '0 6px',
        background:     'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(248,113,113,.025) 6px, rgba(248,113,113,.025) 12px)',
      }}
    >
      <XCircle size={16} style={{ color: C.red, opacity: .7 }} />
      <span style={{ fontSize: 9, fontWeight: 600, color: C.red, opacity: .8, letterSpacing: '.04em', textAlign: 'center' }}>
        {label}
      </span>
      {short && (
        <span style={{
          fontSize: 8, color: C.red, opacity: 0.65,
          textAlign: 'center', lineHeight: 1.3,
          fontFamily: "'DM Mono','JetBrains Mono',monospace",
          maxHeight: 24, overflow: 'hidden',
        }}>
          {short}
        </span>
      )}
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
  /** Full per-type history (newest-first) for the currently selected base
   *  asset. Empty array when selection is a feature slot or has no history. */
  selectedHistory:   GeneratedAsset[]
  rightTab:          RightTab
  onTabChange:       (tab: RightTab) => void
  customPrompt:      string
  onPromptChange:    (v: string) => void
  regenTarget:       AssetType | null
  theme:             string
  /** Regenerate a base asset type (existing batch/single flow). */
  onRegenBase:       (type: AssetType, prompt?: string) => void
  /** Revert a base asset type to a previous version (client-side only). */
  onRevertBase:      (type: AssetType, asset: GeneratedAsset) => void
  /** Generate a single feature slot (wired from handleFeatureSlotGenerate). */
  onGenerateFeature: (slotKey: string) => Promise<{ ok: boolean; error?: string }>
  logs:              string[]
  shortLabels:       Partial<Record<AssetType, string>>
  exportsEnabled:    boolean
  onUpgradeGate:     () => void
}

function RightInspectorPanel({
  selectedKey, selectedIsFeature, selectedAsset, selectedHistory,
  rightTab, onTabChange,
  customPrompt, onPromptChange,
  regenTarget, theme, onRegenBase, onRevertBase, onGenerateFeature, logs, shortLabels,
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

        {/* Inspector Tab — keyed on selectedKey so the slide-in keyframe
            replays whenever the user picks a different asset, per the
            UX critique's motion recommendation. */}
        {rightTab === 'inspector' && (
          <div
            key={selectedKey ?? '__empty'}
            style={{ animation: 'sf-inspector-slide .2s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <InspectorTab
              selectedKey={selectedKey ?? null}
              selectedIsFeature={selectedIsFeature}
              selectedAsset={selectedAsset}
              selectedHistory={selectedHistory}
              regenTarget={regenTarget}
              theme={theme}
              onRegenBase={onRegenBase}
              onRevertBase={onRevertBase}
              onGenerateFeature={onGenerateFeature}
              shortLabels={shortLabels}
              exportsEnabled={exportsEnabled}
              onUpgradeGate={onUpgradeGate}
            />
          </div>
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
  selectedKey, selectedIsFeature, selectedAsset, selectedHistory,
  regenTarget, theme, onRegenBase, onRevertBase, onGenerateFeature,
  shortLabels, exportsEnabled, onUpgradeGate,
}: {
  selectedKey:      string | null
  selectedIsFeature: boolean
  selectedAsset?:   GeneratedAsset
  selectedHistory:  GeneratedAsset[]
  regenTarget:      AssetType | null
  theme:            string
  onRegenBase:      (type: AssetType) => void
  onRevertBase:     (type: AssetType, asset: GeneratedAsset) => void
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

      {/* Version history — newest first. Every regeneration inserts a
          fresh row in generated_assets, so this strip is populated
          automatically across sessions. The user can click any
          thumbnail to revert that slot to an earlier version
          (client-side swap only — the previous version remains in the
          DB and reappears here after a re-generate). The current
          version shows a gold border + "active" pill; everything else
          is a clickable thumb with a hover-revealed "restore" hint. */}
      {!selectedIsFeature && selectedHistory.length > 1 && selectedKey && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: C.gold,
              letterSpacing: '.08em', textTransform: 'uppercase',
            }}>
              Versions
            </span>
            <span style={{ fontSize: 9, color: C.txFaint }}>
              {selectedHistory.length} total · click to restore
            </span>
          </div>
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4,
          }}>
            {selectedHistory.map(v => {
              const isActive = v.id === selectedAsset?.id
              return (
                <button
                  key={v.id}
                  title={
                    isActive
                      ? `Active version — ${timeAgo(v.created_at)}`
                      : `Restore version from ${timeAgo(v.created_at)}`
                  }
                  onClick={() => {
                    if (isActive) return
                    onRevertBase(selectedKey as AssetType, v)
                  }}
                  disabled={isActive}
                  style={{
                    position: 'relative', padding: 0,
                    width: 56, height: 56, flexShrink: 0,
                    background: 'none',
                    border: `1.5px solid ${isActive ? C.gold : C.border}`,
                    borderRadius: 6, overflow: 'hidden',
                    cursor: isActive ? 'default' : 'pointer',
                    boxShadow: isActive ? `0 0 0 1px ${C.gold}40` : 'none',
                  }}
                >
                  <img
                    src={v.url}
                    alt={timeAgo(v.created_at)}
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      display: 'block',
                      opacity: isActive ? 1 : 0.85,
                    }}
                  />
                  {isActive && (
                    <span style={{
                      position: 'absolute', bottom: 2, left: 2, right: 2,
                      fontSize: 7, color: '#06060a', background: C.gold,
                      fontWeight: 700, textAlign: 'center',
                      borderRadius: 2, lineHeight: '10px',
                      letterSpacing: '.04em', textTransform: 'uppercase',
                    }}>
                      active
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions — primary Generate (filled gold) + ghost Download per
          UX critique. Previously both buttons had near-identical visual
          weight, which flattened the action hierarchy. Now Generate
          reads as the CTA, Download reads as secondary. */}
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
            padding:        '10px 0',
            background:     isRegen
                              ? C.surfHigh
                              : `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`,
            border:         isRegen ? `1px solid ${C.border}` : 'none',
            borderRadius:   8,
            color:          isRegen ? C.txMuted : '#06060a',
            fontSize:       12,
            fontWeight:     700,
            letterSpacing:  '.02em',
            cursor:         isRegen ? 'not-allowed' : 'pointer',
            boxShadow:      isRegen ? 'none' : `0 2px 14px rgba(201,168,76,.28)`,
            transition:     'transform .12s ease-out, box-shadow .15s',
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
                background:     'transparent',
                border:         `1px solid ${C.border}`,
                borderRadius:   8,
                color:          C.txMuted,
                fontSize:       11,
                fontWeight:     600,
                textDecoration: 'none',
              }}
            >
              <Download size={12} />
              Download PNG
            </a>
          ) : (
            <button
              onClick={() => onUpgradeGate()}
              title="Upgrade to a paid plan to export assets"
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            6,
                padding:        '8px 0',
                background:     'transparent',
                border:         `1px dashed rgba(255,255,255,.15)`,
                borderRadius:   8,
                color:          C.txFaint,
                fontSize:       11,
                fontWeight:     600,
                cursor:         'pointer',
                width:          '100%',
              }}
            >
              {/* Ghost-outlined + lock glyph. Tooltip explains the gate
                  up-front — no click-to-discover upgrade modal for the
                  lock state per UX critique. */}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="11" width="16" height="9" rx="2"/>
                <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
              </svg>
              Download PNG
              <span style={{ fontSize: 9, color: C.txFaint, opacity: .7, marginLeft: 2 }}>
                — upgrade to unlock
              </span>
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
