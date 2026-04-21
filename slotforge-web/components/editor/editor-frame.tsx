'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { autosaveProject, createSnapshot, getSnapshots, restoreSnapshot } from '../../actions/editor'
import type { ProjectSnapshot, SaveState } from '../../types'
import { RightPanel } from './RightPanel'
import { AssetsWorkspace } from '../assets/AssetsWorkspace'
import type { AssetType } from '@/types/assets'

interface EditorFrameProps { projectId: string; orgSlug: string; initialPayload: Record<string, unknown> | null; projectName: string; exportsEnabled?: boolean }

const TOOLBAR_H         = 44
const PANEL_W           = 320
const PANEL_W_COLLAPSED = 36

// Version string — bump on every editor.js deploy for cache-busting.
const EDITOR_VERSION = 'v87'
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
  return (
    <span style={{ fontSize: 11, color, display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block',
                     boxShadow: state.status === 'saved' ? `0 0 6px ${color}` : 'none' }} />
      {label}
      {state.lastSaved && state.status === 'saved' && (
        <span style={{ color: C.txMuted, marginLeft: 2 }}>
          {state.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
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
    }
  })
  // Bumped whenever an asset upload completes — propagated to RightPanel → AssetsPanel for auto-refresh
  const [assetRefreshTick, setAssetRefreshTick] = useState(0)

  async function loadSnapshots() {
    const { data } = await getSnapshots(projectId)
    if (data) setSnapshots(data as ProjectSnapshot[])
  }
  useEffect(() => { loadSnapshots() }, [projectId])

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
      if (isManual) {
        await createSnapshot(projectId, payload, versionLabel.trim() || undefined)
        setVersionLabel('')
        loadSnapshots()
      }
      setSaveState({ status: 'saved', lastSaved: new Date() })
      setTimeout(() => setSaveState(s => s.status === 'saved' ? { ...s, status: 'idle' } : s), 3000)
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
          type: 'SF_LOAD', payload: payloadRef.current ?? null, projectName,
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

  function triggerManualSave() {
    manualSaveFlag.current = true
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, window.location.origin)
  }

  async function handleRestore(snap: ProjectSnapshot) {
    if (!confirm('Restore this version?')) return
    await restoreSnapshot(snap.id)
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_LOAD', payload: snap.payload }, window.location.origin)
    setSaveState({ status: 'saved', lastSaved: new Date() })
  }

  function handleAddToCanvas(assetType: AssetType, url: string) {
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_INJECT_IMAGE_LAYER', assetType, url }, window.location.origin)
  }

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

        {/* Version label input */}
        <input
          type="text"
          placeholder="Version label…"
          value={versionLabel}
          onChange={e => setVersionLabel(e.target.value)}
          style={{
            padding:      '4px 10px',
            borderRadius: 6,
            fontSize:     11,
            background:   C.bg,
            border:       `1px solid rgba(255,255,255,.1)`,
            color:        C.tx,
            outline:      'none',
            width:        160,
            fontFamily:   C.font,
          }}
        />

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
        flexDirection: editorWorkspace === 'assets' ? 'column' : 'row',
        overflow:      'hidden',
        position:      'relative',
      }}>

        {/* ── Editor iframe — always mounted; shrinks to menubar strip when assets active ── */}
        <div style={
          editorWorkspace === 'assets'
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
            onBackToCanvas={() => {
              // Tell the iframe to switch to canvas — it will post SF_WORKSPACE_CHANGED back
              iframeRef.current?.contentWindow?.postMessage({ type: 'SF_SET_WORKSPACE', workspace: 'canvas' }, window.location.origin)
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
                ? <div style={{ padding: 16, fontSize: 12, color: C.txMuted, textAlign: 'center' }}>
                    No snapshots yet.<br /><br />Save with a label to create one.
                  </div>
                : snapshots.map(snap => (
                    <div
                      key={snap.id}
                      onClick={() => handleRestore(snap)}
                      style={{ padding: '9px 12px', borderRadius: 8, marginBottom: 4, background: C.surfHigh, cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, marginBottom: 2 }}>{snap.label ?? 'Autosave'}</div>
                      <div style={{ fontSize: 11, color: C.txMuted }}>{new Date(snap.created_at).toLocaleString()}</div>
                    </div>
                  ))
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
