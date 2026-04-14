'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { autosaveProject, createSnapshot, getSnapshots, restoreSnapshot } from '../../actions/editor'
import type { ProjectSnapshot, SaveState } from '../../types'
import { RightPanel } from './RightPanel'
import type { AssetType } from '@/types/assets'

interface EditorFrameProps { projectId: string; orgSlug: string; initialPayload: Record<string, unknown> | null; projectName: string }

const TOOLBAR_H  = 44
const PANEL_W    = 320

// Version string — bump on every editor.js deploy for cache-busting.
const EDITOR_VERSION = 'v36'
const editorSrc = `/editor/slotforge.html?v=${EDITOR_VERSION}`

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

export default function EditorFrame({ projectId, orgSlug, initialPayload, projectName }: EditorFrameProps) {
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
      const msg = event.data
      if (!msg?.type) return

      if (msg.type === 'SF_IFRAME_READY') {
        iframeRef.current?.contentWindow?.postMessage({
          type: 'SF_LOAD', payload: payloadRef.current ?? null, projectName,
        }, '*')
        iframeRef.current?.contentWindow?.postMessage({ type: 'SF_INJECT_CSS', css: IFRAME_CSS }, '*')
        // Once CSS is injected, request a layers update so RightPanel populates immediately
        setTimeout(() => {
          iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_LAYERS_UPDATE' }, '*')
        }, 400)
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
            }, '*')
            if (url && payloadRef.current) {
              const assets = ((payloadRef.current.assets as Record<string, unknown>) ?? {})
              payloadRef.current = { ...payloadRef.current, assets: { ...assets, [msg.assetKey as string]: url } }
              doSave(payloadRef.current, false)
            }
          })
          .catch(err => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'SF_UPLOAD_ASSET_RESULT', assetKey: msg.assetKey, url: null, error: String(err),
            }, '*')
          })
      }

      if (msg.type === 'SF_ASSET_CDN_URL' && msg.assetKey && msg.url) {
        if (payloadRef.current) {
          const assets = ((payloadRef.current.assets as Record<string, unknown>) ?? {})
          payloadRef.current = { ...payloadRef.current, assets: { ...assets, [msg.assetKey as string]: msg.url } }
        }
      }

      if (msg.type === 'SF_AUTOSAVE' && msg.payload) {
        payloadRef.current = msg.payload
        const gn = (msg.payload as Record<string, unknown>).gameName as string | undefined
        if (gn?.trim()) setLiveProjectName(gn.trim())
        const isManual = manualSaveFlag.current
        manualSaveFlag.current = false
        doSave(msg.payload, isManual)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [doSave, initialPayload, projectId])

  // Periodic save nudge
  useEffect(() => {
    const iv = setInterval(() => {
      if (saveState.status === 'dirty' || saveState.status === 'error') {
        iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, '*')
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
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, '*')
  }

  async function handleRestore(snap: ProjectSnapshot) {
    if (!confirm('Restore this version?')) return
    await restoreSnapshot(snap.id)
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_LOAD', payload: snap.payload }, '*')
    setSaveState({ status: 'saved', lastSaved: new Date() })
  }

  function handleAddToCanvas(assetType: AssetType, url: string) {
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_INJECT_IMAGE_LAYER', assetType, url }, '*')
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

      {/* ── Main area: iframe + right panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Iframe — takes remaining width */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <iframe
            ref={iframeRef}
            src={editorSrc}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="SlotForge Editor"
          />
        </div>

        {/* Right panel — fixed PS-style sidebar */}
        <RightPanel
          projectId={projectId}
          onAddToCanvas={handleAddToCanvas}
          width={PANEL_W}
        />

        {/* Version history slide-in (over the right panel) */}
        {historyOpen && (
          <div style={{
            position:      'absolute',
            top:           TOOLBAR_H,
            right:         PANEL_W,
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
