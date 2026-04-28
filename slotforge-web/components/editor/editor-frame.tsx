'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { autosaveProject, createSnapshot, getSnapshots, restoreSnapshot, deleteSnapshot } from '../../actions/editor'
import type { ProjectSnapshot, SaveState } from '../../types'
import { RightPanel } from './RightPanel'
import { AssetsWorkspace } from '../assets/AssetsWorkspace'
import { TypographyWorkspace } from '../typography/TypographyWorkspace'
import type { TypographySpec } from '@/types/typography'
import type { AssetType } from '@/types/assets'

interface EditorFrameProps { projectId: string; orgSlug: string; initialPayload: Record<string, unknown> | null; projectName: string; exportsEnabled?: boolean }

const TOOLBAR_H         = 44
const PANEL_W           = 320
const PANEL_W_COLLAPSED = 36

// Version string — bump on every editor.js deploy for cache-busting.
const EDITOR_VERSION = 'v132'
const editorSrc = `/editor/spinative.html?v=${EDITOR_VERSION}`

// CSS injected into the editor iframe:
//  • Hides the duplicate Assets tab and library section
//  • Hides the built-in right panel (replaced by React RightPanel)
//  • Forces the editor layout to use full available width
const IFRAME_CSS = `
  #rp-tab-assets  { display: none !important; }
  #library-section{ display: none !important; }
  #right-panel    { display: none !important; }
  #main-col       { width: 100% !important; flex: 1 !important; }
`

// ─── Landing page design tokens ───────────────────────────────────────────────
const C = {
  bg:       '#06060a',
  surface:  '#13131a',
  surfHigh: '#1a1a24',
  border:   'rgba(255,255,255,.06)',
  gold:     '#c9a84c',
  goldDark: '#9a7830',
  tx:       '#eeede6',
  txMuted:  '#7a7a8a',
  font:     "'Inter', 'Space Grotesk', system-ui, sans-serif",
} as const

// ─── Save badge ───────────────────────────────────────────────────────────────

function SaveBadge({ state }: { state: SaveState }) {
  const map = {
    idle:   { color: '#3e3e5e', label: 'All saved' },
    dirty:  { color: '#f59e0b', label: 'Unsaved' },
    saving: { color: '#60a5fa', label: 'Saving…' },
    saved:  { color: '#34d399', label: 'Saved' },
    error:  { color: '#f87171', label: 'Error' },
  }
  const { color, label } = map[state.status]
  const showCheck = state.status === 'saved' || state.status === 'idle'
  return (
    <>
      {/* Keyframes scoped to this component so the checkmark stroke-draws
          + fades-in when the user successfully saves. No-op otherwise. */}
      <style>{`
        @keyframes sf-save-check-draw {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes sf-save-dot-pulse {
          0%   { transform: scale(0.4); opacity: 0; }
          40%  { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
      <span style={{ fontSize: 11, color, display: 'flex', alignItems: 'center', gap: 5 }}>
        {/* Checkmark for saved / idle states; pulsing dot otherwise */}
        {showCheck ? (
          <svg
            key={state.status + (state.lastSaved?.getTime() ?? 0)}
            width="11" height="11" viewBox="0 0 14 14" fill="none"
            stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
            style={{
              filter: state.status === 'saved' ? `drop-shadow(0 0 4px ${color})` : 'none',
              transition: 'filter .3s ease-out',
            }}
          >
            <path
              d="M2.5 7.5 L6 11 L12 3.5"
              strokeDasharray="20"
              strokeDashoffset={state.status === 'saved' ? 0 : 0}
              style={{
                animation: state.status === 'saved'
                  ? 'sf-save-check-draw .3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
                  : 'none',
              }}
            />
          </svg>
        ) : (
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: color,
            display: 'inline-block',
            animation: state.status === 'saving' ? 'sf-save-dot-pulse .6s ease-out infinite alternate' : 'none',
          }} />
        )}
        {label}
        {state.lastSaved && state.status === 'saved' && (
          <span style={{ color: C.txMuted, marginLeft: 2 }}>
            {state.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </span>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EditorFrame({ projectId, orgSlug, initialPayload, projectName, exportsEnabled = false }: EditorFrameProps) {
  const iframeRef      = useRef<HTMLIFrameElement>(null)
  const payloadRef     = useRef<Record<string, unknown> | null>(initialPayload)
  const manualSaveFlag = useRef(false)
  const isSavingRef    = useRef(false)
  const pendingSave    = useRef<{ payload: Record<string, unknown>; isManual: boolean } | null>(null)

  const [saveState,       setSaveState]       = useState<SaveState>({ status: 'idle' })
  const [versionLabel,    setVersionLabel]    = useState('')
  const [snapshots,       setSnapshots]       = useState<ProjectSnapshot[]>([])
  const [historyOpen,     setHistoryOpen]     = useState(false)
  const [liveProjectName, setLiveProjectName] = useState(projectName)
  const [editorWorkspace, setEditorWorkspace] = useState<string>('canvas')
  // Right panel (Layers/Assets) collapse state — persisted across sessions
  // so the user's preference survives reloads and project switches.
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('sf_right_panel_collapsed') === '1'
  })
  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed(c => {
      const next = !c
      try { window.localStorage.setItem('sf_right_panel_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }, [])
  const effectivePanelW = rightPanelCollapsed ? PANEL_W_COLLAPSED : PANEL_W
  // Initialise editorMeta from the saved payload so symbol counts AND the
  // features map are correct on first load. Without `features` here the
  // Assets panel shows no feature groups until the first autosave fires.
  const [editorMeta, setEditorMeta] = useState<Record<string, unknown> | null>(() => {
    if (!initialPayload) return null
    const p = initialPayload
    // The editor serialises both a top-level subset (gameName, theme, …)
    // AND the full collectMeta() output under payload.meta. Most fields
    // have top-level mirrors, but artRefImages + world/tone text fields
    // live only inside meta — pull them through so the Prompt Inputs
    // panel can read every prompt-affecting input without another
    // round-trip on mount.
    const m = (p.meta as Record<string, unknown> | undefined) ?? {}
    return {
      gameName:          p.gameName,
      themeKey:          p.theme,
      symbolHighCount:   p.symbolHighCount,
      symbolLowCount:    p.symbolLowCount,
      symbolSpecialCount:p.symbolSpecialCount,
      symbolHighNames:   p.symbolHighNames,
      symbolLowNames:    p.symbolLowNames,
      symbolSpecialNames:p.symbolSpecialNames,
      features:          p.features,
      // Fields from collectMeta() that the Art workspace needs:
      styleId:           m.styleId,
      artStyle:          m.artStyle,
      setting:           m.setting,
      story:             m.story,
      mood:              m.mood,
      bonusNarrative:    m.bonusNarrative,
      artRef:            m.artRef,
      artNotes:          m.artNotes,
      artRefImages:      m.artRefImages,
      artBible:          m.artBible,
      colorPrimary:      m.colorPrimary,
      colorBg:           m.colorBg,
      colorAccent:       m.colorAccent,
      // Colour toggles — not in collectMeta(), but we mirror P.colors.t*
      // for the panel's PaletteRow toggles. Derived from top-level
      // payload.colors (if present).
      colorPrimaryOn:    (p.colors as Record<string, unknown> | undefined)?.t1 ?? true,
      colorBgOn:         (p.colors as Record<string, unknown> | undefined)?.t2 ?? true,
      colorAccentOn:     (p.colors as Record<string, unknown> | undefined)?.t3 ?? true,
    }
  })
  // Bumped whenever an asset upload completes — propagated to RightPanel → AssetsPanel for auto-refresh
  const [assetRefreshTick, setAssetRefreshTick] = useState(0)

  async function loadSnapshots() {
    const { data } = await getSnapshots(projectId)
    if (data) setSnapshots(data as ProjectSnapshot[])
  }
  useEffect(() => { loadSnapshots() }, [projectId])

  // ─── Auto-snapshots ─────────────────────────────────────────────────────
  // Manual ⌘S already snapshots, but a user working in long stretches
  // without explicit saves had no rollback points beyond the last
  // manual save (which might be hours back). v117: every 15 min, if
  // we've autosaved at least once since the last snapshot, take one.
  // Labels read "Auto · 14:32" so the UI can visually distinguish
  // them from named manual saves. The check fires every 60 s; the
  // 15-min gate is enforced by comparing to lastSnapshotAt below.
  //
  // Why client-side instead of a cron / DB trigger? The shell already
  // has the live payloadRef.current — server-side would have to read
  // it back from `projects.payload`, which is the same data minus
  // any in-flight edits the autosave hadn't completed yet.
  const lastSnapshotAt = useRef<number>(Date.now())
  const dirtySinceSnap = useRef<boolean>(false)
  // Mark dirty whenever an autosave or manual save lands. doSave
  // updates payloadRef BEFORE the timer fires, so this flag captures
  // "user has done work since the last snapshot".
  useEffect(() => {
    if (saveState.status === 'saved') dirtySinceSnap.current = true
  }, [saveState.status])
  useEffect(() => {
    if (!projectId) return
    const SNAPSHOT_GAP_MS = 15 * 60_000
    const iv = setInterval(async () => {
      if (!payloadRef.current) return
      if (!dirtySinceSnap.current) return
      if (Date.now() - lastSnapshotAt.current < SNAPSHOT_GAP_MS) return
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      try {
        await createSnapshot(projectId, payloadRef.current, `Auto · ${time}`)
        lastSnapshotAt.current = Date.now()
        dirtySinceSnap.current = false
        loadSnapshots()
      } catch {
        // Non-fatal — we'll retry next minute.
      }
    }, 60_000)
    return () => clearInterval(iv)
  }, [projectId])

  const doSave = useCallback(async (payload: Record<string, unknown>, isManual: boolean) => {
    if (isSavingRef.current) {
      pendingSave.current = { payload, isManual: isManual || (pendingSave.current?.isManual ?? false) }
      return
    }
    isSavingRef.current = true
    setSaveState({ status: 'saving' })
    try {
      const { error } = await autosaveProject(projectId, payload)
      if (error) throw error
      const noteText = versionLabel.trim()
      if (isManual) {
        await createSnapshot(projectId, payload, noteText || undefined)
        setVersionLabel('')
        loadSnapshots()
      }
      setSaveState({ status: 'saved', lastSaved: new Date() })
      setTimeout(() => setSaveState(s => s.status === 'saved' ? { ...s, status: 'idle' } : s), 3000)
      // v2 UX (Phase 5): tell the iframe whether this save carried a
      // version note. The iframe-side version-notes nudge counts
      // unnoted saves and gently prompts the user after a threshold.
      try {
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'SF_SAVED', isManual, hasNote: noteText.length > 0 },
          window.location.origin,
        )
      } catch { /* iframe gone — ignore */ }
    } catch {
      setSaveState({ status: 'error' })
    } finally {
      isSavingRef.current = false
      if (pendingSave.current) {
        const next = pendingSave.current
        pendingSave.current = null
        doSave(next.payload, next.isManual)
      }
    }
  }, [projectId, versionLabel])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // The editor iframe is same-origin (served from /editor/slotforge.html).
      // Reject any message from a different origin — otherwise any page that
      // iframes the app can forge SF_AUTOSAVE / SF_UPLOAD_ASSET / SF_AI_GENERATE.
      if (event.origin !== window.location.origin) return
      const msg = event.data
      if (!msg?.type) return

      if (msg.type === 'SF_IFRAME_READY') {
        iframeRef.current?.contentWindow?.postMessage({
          // projectId added v1 marketing — the iframe needs it to call
          // /api/marketing/* without piping every URL through the shell.
          type: 'SF_LOAD', payload: payloadRef.current ?? null, projectName, projectId,
        }, window.location.origin)
        iframeRef.current?.contentWindow?.postMessage({ type: 'SF_INJECT_CSS', css: IFRAME_CSS }, window.location.origin)
        // Once CSS is injected, request a layers update so RightPanel populates immediately
        setTimeout(() => {
          iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_LAYERS_UPDATE' }, window.location.origin)
        }, 400)
      }

      if (msg.type === 'SF_WORKSPACE_CHANGED' && msg.workspace) {
        setEditorWorkspace(msg.workspace as string)
        // Merge (not replace) so any field the editor omits from collectMeta
        // — e.g. features in an older editor build — survives from the SSR
        // initialPayload seed and the Assets workspace stays populated.
        if (msg.meta) {
          setEditorMeta(prev => ({ ...(prev ?? {}), ...(msg.meta as Record<string, unknown>) }))
        }
      }


      if (msg.type === 'SF_DIRTY') {
        setSaveState(s => s.status !== 'saving' ? { ...s, status: 'dirty' } : s)
        if (msg.snapshot && payloadRef.current) {
          payloadRef.current = { ...payloadRef.current, ...(msg.snapshot as Record<string, unknown>) }
        } else if (msg.snapshot) {
          payloadRef.current = msg.snapshot as Record<string, unknown>
        }
      }

      if (msg.type === 'SF_UPLOAD_ASSET' && msg.file && msg.assetKey) {
        const form = new FormData()
        form.append('file',      msg.file as Blob)
        form.append('projectId', projectId)
        form.append('assetKey',  msg.assetKey as string)
        fetch('/api/assets/upload', { method: 'POST', body: form })
          .then(r => r.json())
          .then(({ url, error }) => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'SF_UPLOAD_ASSET_RESULT', assetKey: msg.assetKey, url: url ?? null, error: error ?? null,
            }, window.location.origin)
            if (url && payloadRef.current) {
              const assets = ((payloadRef.current.assets as Record<string, unknown>) ?? {})
              payloadRef.current = { ...payloadRef.current, assets: { ...assets, [msg.assetKey as string]: url } }
              doSave(payloadRef.current, false)
              // Trigger right-panel asset list refresh
              setAssetRefreshTick(t => t + 1)
            }
          })
          .catch(err => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'SF_UPLOAD_ASSET_RESULT', assetKey: msg.assetKey, url: null, error: String(err),
            }, window.location.origin)
          })
      }

      if (msg.type === 'SF_ASSET_CDN_URL' && msg.assetKey && msg.url) {
        if (payloadRef.current) {
          const assets = ((payloadRef.current.assets as Record<string, unknown>) ?? {})
          payloadRef.current = { ...payloadRef.current, assets: { ...assets, [msg.assetKey as string]: msg.url } }
        }
      }

      if (msg.type === 'SF_AUTOSAVE' && msg.payload) {
        // editor.js sends { payload, thumbnail } at the top level of the message.
        // Fold the thumbnail (a JPEG data URL from a canvas snapshot) into the
        // payload under _thumbnail so autosaveProject picks it up.
        const incoming = msg.payload as Record<string, unknown>
        const withThumb = msg.thumbnail
          ? { ...incoming, _thumbnail: msg.thumbnail as string }
          : incoming
        payloadRef.current = withThumb
        const pl = withThumb
        const gn = pl.gameName as string | undefined
        if (gn?.trim()) setLiveProjectName(gn.trim())
        // Keep editorMeta in sync so RightPanel symbol counts stay accurate.
        // `features` propagates the enabled-feature map (P.features) so
        // AssetsPanel can show feature-specific slot rows (e.g. Bonus Pick).
        // Also mirror the full meta block (styleId, setting, artRefImages
        // etc.) so PromptInputsPanel always reflects the freshest data
        // without needing another round-trip.
        const plMeta = (pl.meta as Record<string, unknown> | undefined) ?? {}
        const plColors = (pl.colors as Record<string, unknown> | undefined) ?? {}
        setEditorMeta(prev => ({
          ...prev,
          gameName:          pl.gameName,
          themeKey:          pl.theme,
          symbolHighCount:   pl.symbolHighCount,
          symbolLowCount:    pl.symbolLowCount,
          symbolSpecialCount:pl.symbolSpecialCount,
          symbolHighNames:   pl.symbolHighNames,
          symbolLowNames:    pl.symbolLowNames,
          symbolSpecialNames:pl.symbolSpecialNames,
          features:          pl.features,
          styleId:           plMeta.styleId,
          artStyle:          plMeta.artStyle,
          setting:           plMeta.setting,
          story:             plMeta.story,
          mood:              plMeta.mood,
          bonusNarrative:    plMeta.bonusNarrative,
          artRef:            plMeta.artRef,
          artNotes:          plMeta.artNotes,
          artRefImages:      plMeta.artRefImages,
          artBible:          plMeta.artBible,
          colorPrimary:      plMeta.colorPrimary ?? plColors.c1,
          colorBg:           plMeta.colorBg      ?? plColors.c2,
          colorAccent:       plMeta.colorAccent  ?? plColors.c3,
          colorPrimaryOn:    plColors.t1 ?? true,
          colorBgOn:         plColors.t2 ?? true,
          colorAccentOn:     plColors.t3 ?? true,
        } as Record<string, unknown>))
        const isManual = manualSaveFlag.current
        manualSaveFlag.current = false
        doSave(withThumb, isManual)
      }

      // ── AI single-asset generation triggered from right-click context menu ──
      // editor.js sends SF_AI_GENERATE when the user clicks "Generate with AI".
      // We handle it here because only the parent shell has auth + project context.
      if (msg.type === 'SF_AI_GENERATE' && msg.ctxKey) {
        const ctxKey = msg.ctxKey as string
        const theme  = (msg.theme as string | undefined) || 'slot game'

        // Map editor EL_ASSETS key → AssetType for /api/ai-single
        const EL_TO_ASSET_TYPE: Record<string, string> = {
          bg:            'background_base',
          bg_bonus:      'background_bonus',
          sym_H1:        'symbol_high_1',
          sym_H2:        'symbol_high_2',
          sym_H3:        'symbol_high_3',
          sym_H4:        'symbol_high_4',
          sym_H5:        'symbol_high_5',
          sym_L1:        'symbol_low_1',
          sym_L2:        'symbol_low_2',
          sym_L3:        'symbol_low_3',
          sym_L4:        'symbol_low_4',
          sym_L5:        'symbol_low_5',
          sym_Wild:      'symbol_wild',
          sym_Scatter:   'symbol_scatter',
          logo:          'logo',
          char:          'character',
          reel_frame:    'reel_frame',
          spin_button:   'spin_button',
          jackpot_label: 'jackpot_label',
        }
        const assetType = EL_TO_ASSET_TYPE[ctxKey]
        if (!assetType) {
          iframeRef.current?.contentWindow?.postMessage({
            type: 'SF_AI_GENERATE_RESULT', ctxKey, error: `No asset type mapped for layer "${ctxKey}"`,
          }, window.location.origin)
          return
        }

        // Call /api/ai-single (authenticated via cookie — same origin)
        fetch('/api/ai-single', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            asset_type:    assetType,
            theme:         theme,
            project_id:    projectId,
            custom_prompt: (msg.userNotes as string | undefined) || undefined,
          }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.error) {
              iframeRef.current?.contentWindow?.postMessage({
                type: 'SF_AI_GENERATE_RESULT', ctxKey, error: data.error,
              }, window.location.origin)
              return
            }
            const url = data.asset?.url as string
            // Inject the image into the canvas layer
            iframeRef.current?.contentWindow?.postMessage({
              type: 'SF_INJECT_IMAGE_LAYER', assetType, url,
            }, window.location.origin)
            // Also notify the popup so it can show success and close
            iframeRef.current?.contentWindow?.postMessage({
              type: 'SF_AI_GENERATE_RESULT', ctxKey, url,
            }, window.location.origin)
            // Update saved payload with the new asset URL
            if (payloadRef.current) {
              const assets = ((payloadRef.current.assets as Record<string, unknown>) ?? {})
              payloadRef.current = { ...payloadRef.current, assets: { ...assets, [ctxKey]: url } }
              doSave(payloadRef.current, false)
            }
          })
          .catch(err => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'SF_AI_GENERATE_RESULT', ctxKey, error: String(err),
            }, window.location.origin)
          })
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [doSave, initialPayload, projectId])

  // Periodic save nudge
  useEffect(() => {
    const iv = setInterval(() => {
      if (saveState.status === 'dirty' || saveState.status === 'error') {
        iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, window.location.origin)
      }
    }, saveState.status === 'error' ? 15000 : 30000)
    return () => clearInterval(iv)
  }, [saveState.status])

  // ⌘S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); triggerManualSave() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ─── Last-chance safety save ─────────────────────────────────────────────
  // When the user navigates away (dashboard link, back button, tab close),
  // fire one final save using the latest payloadRef.current. Without this,
  // a dirty edit made between the most-recent SF_AUTOSAVE and the
  // navigation would be silently dropped — the iframe's own beforeunload
  // hook only fires on full-page unloads, not on client-side route
  // changes that unmount EditorFrame. We don't await the promise because
  // pagehide blocks only briefly; fire-and-forget is the pragmatic choice.
  useEffect(() => {
    const flush = () => {
      if (!payloadRef.current) return
      // Ask the iframe to post a FRESH payload first — its getPayload()
      // captures live PSD state (layerZ, keyOrders, etc.) that the
      // debounce-free SF_DIRTY path doesn't always mirror into
      // payloadRef. If the iframe isn't reachable (already torn down)
      // we fall back to the last known payloadRef.
      try {
        iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, window.location.origin)
      } catch { /* ignore */ }
      // Also kick off a direct server save as a backup. The duplicate
      // round-trip is fine; autosaveProject is idempotent (updates by
      // project_id) and the server accepts whichever arrives last.
      void doSave(payloadRef.current, false)
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      // Component unmount (client-side nav). Same flush — beforeunload
      // won't have fired for a SPA transition.
      flush()
    }
  }, [doSave])

  function triggerManualSave() {
    manualSaveFlag.current = true
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, window.location.origin)
  }

  /** Restore a snapshot. v117: takes a SAFETY checkpoint of the live
   *  payload first (labelled "Before restore: <old>") so the user
   *  always has a one-click undo. Without this a misclick would
   *  silently overwrite hours of work — the bare browser confirm()
   *  was the only barrier. The checkpoint also surfaces in the
   *  history list so it reads as "here's what you had right before
   *  rolling back". */
  async function handleRestore(snap: ProjectSnapshot) {
    if (payloadRef.current) {
      try {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const oldLabel = (snap.label || 'snapshot').slice(0, 30)
        await createSnapshot(
          projectId, payloadRef.current,
          `Before restore · ${oldLabel} · ${time}`,
        )
      } catch {
        // Non-fatal — restore still proceeds. Log so support can
        // reconcile if a user ever reports lost work.
        console.warn('[snapshots] safety checkpoint failed; proceeding with restore')
      }
    }
    await restoreSnapshot(snap.id)
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_LOAD', payload: snap.payload }, window.location.origin)
    setSaveState({ status: 'saved', lastSaved: new Date() })
    // Refresh so the new "Before restore" snapshot shows up in the list.
    loadSnapshots()
  }

  async function handleDeleteSnapshot(snap: ProjectSnapshot) {
    // Optimistic removal — the list rebuilds on the loadSnapshots
    // call after the action; pulling it from local state immediately
    // prevents a perceived delay.
    setSnapshots(prev => prev.filter(s => s.id !== snap.id))
    try {
      await deleteSnapshot(snap.id)
    } catch {
      // Rollback on failure
      loadSnapshots()
    }
  }

  // Stable reference — AssetsWorkspace passes this into its own
  // useEffect/useCallback dep arrays (auto-rehydrate on mount,
  // handleRevert, handleUpload). If this identity changed every render,
  // the mount-hydrate effect would fire repeatedly and wipe any
  // client-side revert before it could stick. Wrapped in useCallback
  // with an empty dep list since iframeRef is a ref (stable) and the
  // origin is constant.
  const handleAddToCanvas = useCallback((assetType: AssetType, url: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_INJECT_IMAGE_LAYER', assetType, url }, window.location.origin)
  }, [])

  // Patch project meta (name / theme / style / palette / world fields /
  // symbol names) from the Art workspace's PromptInputsPanel. Forwarded
  // to editor.js as SF_UPDATE_META; the iframe fans the patch out to
  // DOM inputs + P state + markDirty so autosave persists.
  const handleUpdateMeta = useCallback((patch: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'SF_UPDATE_META', patch },
      window.location.origin,
    )
  }, [])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, fontFamily: C.font }}>

      {/* ── Toolbar ── */}
      <div style={{
        height:       TOOLBAR_H,
        background:   C.surface,
        borderBottom: `1px solid ${C.border}`,
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        padding:      '0 14px',
        flexShrink:   0,
        zIndex:       500,
        position:     'relative',
      }}>
        {/* Back link */}
        <Link
          href={`/${orgSlug}/dashboard`}
          style={{ fontSize: 11, color: C.txMuted, textDecoration: 'none', letterSpacing: '.02em', flexShrink: 0 }}
        >
          ← Dashboard
        </Link>
        <span style={{ color: C.border, fontSize: 16 }}>|</span>

        {/* Project name */}
        <span style={{ fontSize: 13, fontWeight: 600, color: C.tx, letterSpacing: '-.01em' }}>
          {liveProjectName}
        </span>

        <div style={{ flex: 1 }} />

        {/* Save status */}
        <SaveBadge state={saveState} />

        {/* Version label input — renamed from "Version label…" per UX
            critique (looked like a search field because of its position).
            Small tag icon prefix clarifies it's for tagging a named
            version before Save, not searching. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 10px',
          borderRadius: 6,
          background:   C.bg,
          border:       `1px solid rgba(255,255,255,.1)`,
          width: 180,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round"
               style={{ color: C.txMuted, flexShrink: 0 }} aria-hidden="true">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          <input
            type="text"
            placeholder="Add version note…"
            title="Add a note that will be attached to the next saved snapshot"
            value={versionLabel}
            onChange={e => setVersionLabel(e.target.value)}
            style={{
              padding:      '4px 0',
              fontSize:     11,
              background:   'transparent',
              border:       'none',
              color:        C.tx,
              outline:      'none',
              width:        '100%',
              fontFamily:   C.font,
            }}
          />
        </div>

        {/* Save button */}
        <button
          onClick={triggerManualSave}
          disabled={saveState.status === 'saving'}
          style={{
            padding:    '5px 16px',
            borderRadius: 100,
            fontSize:   12,
            fontWeight: 700,
            background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`,
            color:      '#06060a',
            border:     'none',
            cursor:     'pointer',
            opacity:    saveState.status === 'saving' ? 0.6 : 1,
            letterSpacing: '.02em',
            boxShadow:  `0 0 20px rgba(201,168,76,.25)`,
            fontFamily: C.font,
          }}
        >
          Save ⌘S
        </button>

        {/* History button */}
        <button
          onClick={() => setHistoryOpen(o => !o)}
          style={{
            padding:      '5px 12px',
            borderRadius: 100,
            fontSize:     11,
            background:   historyOpen ? 'rgba(201,168,76,.12)' : 'transparent',
            border:       `1px solid ${historyOpen ? C.gold + '55' : 'rgba(255,255,255,.1)'}`,
            color:        historyOpen ? C.gold : C.txMuted,
            cursor:       'pointer',
            fontFamily:   C.font,
          }}
        >
          History
        </button>
      </div>

      {/* ── Main area ── */}
      {/* When assets workspace is active, we switch to a column layout:
          the iframe shrinks to 36px (just the editor's #menubar / workspace-tab strip stays
          visible and clickable), and AssetsWorkspace fills the space below.
          This keeps the workspace-tab bar always on screen so the user can switch back. */}
      <div style={{
        flex:          1,
        display:       'flex',
        // Workspaces that take over the main area (full-page React) flip
        // the layout to column — iframe shrinks to the menubar strip,
        // React workspace fills below. Assets and Typography share the
        // same pattern.
        flexDirection: (editorWorkspace === 'assets' || editorWorkspace === 'typography') ? 'column' : 'row',
        overflow:      'hidden',
        position:      'relative',
      }}>

        {/* ── Editor iframe — always mounted; shrinks to menubar strip when a full-page workspace is active ── */}
        <div style={
          (editorWorkspace === 'assets' || editorWorkspace === 'typography')
            ? { height: 36, flexShrink: 0, position: 'relative', overflow: 'hidden', width: '100%', boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }
            : { flex: 1, position: 'relative', overflow: 'hidden' }
        }>
          <iframe
            ref={iframeRef}
            src={editorSrc}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="Spinative Editor"
          />
        </div>

        {/* ── Assets workspace (inline, fills below the menubar strip) ── */}
        {editorWorkspace === 'assets' && (
          <AssetsWorkspace
            projectId={projectId}
            orgSlug={orgSlug}
            projectName={liveProjectName}
            initialAssets={[]}
            inlineMode
            projectMeta={editorMeta ?? undefined}
            exportsEnabled={exportsEnabled}
            // Sync Art-view generations / uploads / reverts into the iframe
            // so EL_ASSETS stays current and the save round-trips the URL
            // back into payload.assets. Previously only the right-sidebar
            // (Canvas workspace) wired this up; the full-page Art view
            // silently dropped the sync, which is why character + logo
            // disappeared on project reload.
            // Directly pass the memoised callback — wrapping it in an
            // inline arrow here would break the identity stability
            // AssetsWorkspace's effects rely on.
            onAddToCanvas={handleAddToCanvas}
            onUpdateMeta={handleUpdateMeta}
            onBackToCanvas={() => {
              // Tell the iframe to switch to canvas — it will post SF_WORKSPACE_CHANGED back
              iframeRef.current?.contentWindow?.postMessage({ type: 'SF_SET_WORKSPACE', workspace: 'canvas' }, window.location.origin)
            }}
            // Phase 1 fold-in (final): Typography lives INSIDE Art now
            // as a third sidebar tab. The full-page typography
            // workspace mount below is kept as a deep-link target but
            // the primary entry point is the Art sidebar.
            initialTypographySpec={(initialPayload?.typographySpec as TypographySpec | null | undefined) ?? null}
            onTypographySpecChange={spec => {
              iframeRef.current?.contentWindow?.postMessage(
                { type: 'SF_SAVE_TYPOGRAPHY', spec },
                window.location.origin,
              )
              if (payloadRef.current) {
                payloadRef.current = { ...payloadRef.current, typographySpec: spec }
              }
            }}
          />
        )}

        {/* ── Typography workspace (inline, fills below the menubar strip) ── */}
        {editorWorkspace === 'typography' && (
          <TypographyWorkspace
            projectId={projectId}
            projectName={liveProjectName}
            projectMeta={editorMeta ?? undefined}
            // Commit 3 will hydrate this from payload.typographySpec. For
            // now the workspace just shows its inputs on first mount.
            initialSpec={(initialPayload?.typographySpec as TypographySpec | null | undefined) ?? null}
            onSpecChange={spec => {
              // Push the spec back into the iframe so the autosave
              // payload picks it up. The iframe merges it into its
              // serialised P + EL_ASSETS payload under payload.typographySpec.
              iframeRef.current?.contentWindow?.postMessage(
                { type: 'SF_SAVE_TYPOGRAPHY', spec },
                window.location.origin,
              )
              // Also mirror into the shell's payloadRef so any save that
              // short-circuits the iframe round-trip (beforeunload /
              // unmount) still captures the latest spec.
              if (payloadRef.current) {
                payloadRef.current = { ...payloadRef.current, typographySpec: spec }
              }
            }}
          />
        )}

        {/* Right panel — only visible in Canvas workspace */}
        {editorWorkspace === 'canvas' && (
          <RightPanel
            projectId={projectId}
            orgSlug={orgSlug}
            onAddToCanvas={handleAddToCanvas}
            width={PANEL_W}
            assetRefreshTick={assetRefreshTick}
            projectMeta={editorMeta ?? undefined}
            collapsed={rightPanelCollapsed}
            onToggleCollapsed={toggleRightPanel}
          />
        )}

        {/* Version history slide-in (over the right panel) */}
        {historyOpen && (
          <div style={{
            position:      'absolute',
            top:           TOOLBAR_H,
            right:         editorWorkspace === 'canvas' ? effectivePanelW : 0,
            width:         260,
            height:        `calc(100% - ${TOOLBAR_H}px)`,
            background:    C.surface,
            borderLeft:    `1px solid ${C.border}`,
            display:       'flex',
            flexDirection: 'column',
            zIndex:        450,
            boxShadow:     '-4px 0 24px rgba(0,0,0,.5)',
          }}>
            <div style={{
              padding: '11px 14px', fontSize: 11, fontWeight: 700, color: C.txMuted,
              borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase',
              letterSpacing: '.08em', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              Version History
              <button onClick={() => setHistoryOpen(false)}
                style={{ background: 'none', border: 'none', color: C.txMuted, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {snapshots.length === 0
                ? <div style={{ padding: 16, fontSize: 12, color: C.txMuted, textAlign: 'center', lineHeight: 1.5 }}>
                    No snapshots yet.
                    <br /><br />
                    They&rsquo;ll appear here automatically every 15 min while you work, or whenever you press <kbd style={{
                      fontFamily: "'DM Mono',monospace", fontSize: 10,
                      padding: '1px 4px', borderRadius: 3,
                      background: C.surfHigh, border: `1px solid ${C.border}`,
                      color: C.tx,
                    }}>⌘S</kbd>.
                  </div>
                : snapshots.map(snap => (
                    <SnapshotTile
                      key={snap.id}
                      snap={snap}
                      onRestore={() => handleRestore(snap)}
                      onDelete={() => handleDeleteSnapshot(snap)}
                    />
                  ))
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Snapshot tile ─────────────────────────────────────────────────────────
// One row per snapshot in the version-history slide-in. Two-stage UI:
//
//   Idle  — label + timestamp + small kebab area; click anywhere on the
//           row to begin a restore (transitions to Confirming).
//   Confirming — replaces the row body with [Restore] / [Cancel] /
//                [Delete] inline buttons. Avoids the bare browser
//                confirm() dialog the previous version used (jarring,
//                no styling, easy misclick).
//
// Visual cues:
//   • Auto-generated snapshots ("Auto · 14:32") get a subtle gold
//     "auto" pill so the user can tell them apart from manually-named
//     versions at a glance.
//   • Pre-restore safety checkpoints ("Before restore · …") get a
//     red-tinted pill so they read as "this is your get-back-to-here
//     point" — distinct from both auto and named saves.
function SnapshotTile({
  snap, onRestore, onDelete,
}: {
  snap:      ProjectSnapshot
  onRestore: () => void | Promise<void>
  onDelete:  () => void | Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy,       setBusy]       = useState(false)
  const label = snap.label ?? 'Untitled save'
  const isAuto    = label.startsWith('Auto · ')
  const isUndo    = label.startsWith('Before restore')

  // Pill colour + text per category. Stays compact (8 px) so the tile
  // doesn't grow taller than the original.
  const pill = isUndo
    ? { text: 'undo point', bg: 'rgba(248,113,113,.12)', border: 'rgba(248,113,113,.35)', color: '#f0a3a3' }
    : isAuto
    ? { text: 'auto',       bg: 'rgba(201,168,76,.10)',  border: 'rgba(201,168,76,.30)',  color: '#c9a84c' }
    : null

  const created = new Date(snap.created_at)
  const dateStr = created.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      style={{
        padding: '9px 12px', borderRadius: 8, marginBottom: 4,
        background: confirming ? 'rgba(201,168,76,.06)' : C.surfHigh,
        border:     `1px solid ${confirming ? 'rgba(201,168,76,.3)' : 'transparent'}`,
        cursor:      confirming ? 'default' : 'pointer',
        transition:  'background .12s, border-color .12s',
      }}
      onClick={() => { if (!confirming) setConfirming(true) }}
    >
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8, marginBottom: 2,
      }}>
        <div style={{ flex: 1, minWidth: 0,
          fontSize: 12, fontWeight: 600, color: C.tx,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        {pill && (
          <span style={{
            fontSize: 8, fontWeight: 700,
            letterSpacing: '.06em', textTransform: 'uppercase',
            background: pill.bg, border: `1px solid ${pill.border}`,
            color: pill.color, borderRadius: 3, padding: '1px 5px',
            flexShrink: 0,
          }}>
            {pill.text}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: C.txMuted }}>{dateStr}</div>

      {/* Inline confirm — replaces the bare browser confirm() the
          previous flow used. Three actions: Restore (gold, primary),
          Cancel (back to idle), Delete (red, removes snapshot from
          DB without restoring). */}
      {confirming && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            marginTop: 8, display: 'flex', gap: 4,
          }}
        >
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onRestore() } finally { setBusy(false); setConfirming(false) } }}
            style={{
              flex: 1, padding: '5px 8px', borderRadius: 5,
              background: 'rgba(201,168,76,.16)',
              border: '1px solid rgba(201,168,76,.45)',
              color: '#c9a84c', fontSize: 11, fontWeight: 600,
              fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Restore
          </button>
          <button
            disabled={busy}
            onClick={() => setConfirming(false)}
            style={{
              padding: '5px 8px', borderRadius: 5,
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.txMuted, fontSize: 11, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onDelete() } finally { setBusy(false); setConfirming(false) } }}
            title="Permanently delete this snapshot (cannot be undone)"
            style={{
              padding: '5px 8px', borderRadius: 5,
              background: 'rgba(248,113,113,.08)',
              border: '1px solid rgba(248,113,113,.3)',
              color: '#f87171', fontSize: 11, fontWeight: 600,
              fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
