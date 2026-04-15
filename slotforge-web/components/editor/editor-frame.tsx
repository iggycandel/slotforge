'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { autosaveProject, createSnapshot, getSnapshots, restoreSnapshot } from '@/actions/editor'
import type { ProjectSnapshot, SaveState } from '@/types'

interface EditorFrameProps {
  projectId: string
  orgSlug: string
  initialPayload: Record<string, unknown> | null
  projectName: string
}

function SaveBadge({ state }: { state: SaveState }) {
  const map = {
    idle:   { color: '#9090b0', label: 'Unsaved' },
    dirty:  { color: '#f59e0b', label: 'Unsaved changes' },
    saving: { color: '#60a5fa', label: 'Saving…' },
    saved:  { color: '#34d399', label: 'Saved' },
    error:  { color: '#f87171', label: 'Save failed' },
  }
  const { color, label } = map[state.status]
  return (
    <span style={{ fontSize: 12, color, display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color, display: 'inline-block',
      }} />
      {label}
      {state.lastSaved && state.status === 'saved' && (
        <span style={{ color: '#9090b0', marginLeft: 4 }}>
          {state.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
  )
}

export default function EditorFrame({
  projectId,
  orgSlug,
  initialPayload,
  projectName,
}: EditorFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const payloadRef = useRef<Record<string, unknown> | null>(initialPayload)
  const manualSaveFlag = useRef(false)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [versionLabel, setVersionLabel] = useState('')
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [iframeReady, setIframeReady] = useState(false)

  // Load snapshots
  async function loadSnapshots() {
    const { data } = await getSnapshots(projectId)
    if (data) setSnapshots(data as ProjectSnapshot[])
  }

  useEffect(() => { loadSnapshots() }, [projectId])

  // Save function
  const doSave = useCallback(async (payload: Record<string, unknown>, isManual: boolean) => {
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
    }
  }, [projectId, versionLabel])

  // Message bridge
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg?.type) return

      if (msg.type === 'SF_IFRAME_READY') {
        setIframeReady(true)
        // Send initial payload or project name for new projects
        if (initialPayload) {
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'SF_LOAD', payload: initialPayload },
            '*'
          )
        } else {
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'SF_LOAD', payload: null, projectName },
            '*'
          )
        }
      }

      if (msg.type === 'SF_DIRTY') {
        setSaveState(s => s.status !== 'saving' ? { ...s, status: 'dirty' } : s)
      }

      if (msg.type === 'SF_AUTOSAVE' && msg.payload) {
        const payloadToSave = msg.thumbnail
          ? { ...msg.payload, _thumbnail: msg.thumbnail }
          : msg.payload
        payloadRef.current = payloadToSave
        const isManual = manualSaveFlag.current
        manualSaveFlag.current = false
        doSave(payloadToSave, isManual)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [doSave, initialPayload])

  // Periodic autosave every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      if (saveState.status === 'dirty') {
        iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, '*')
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [saveState.status])

  // ⌘S / Ctrl+S
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        triggerManualSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function triggerManualSave() {
    manualSaveFlag.current = true
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, '*')
  }

  async function handleRestore(snapshot: ProjectSnapshot) {
    if (!confirm(`Restore snapshot "${snapshot.label ?? snapshot.created_at}"?`)) return
    await restoreSnapshot(snapshot.id)
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'SF_LOAD', payload: snapshot.payload },
      '*'
    )
    setSaveState({ status: 'saved', lastSaved: new Date() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#13131e' }}>
      {/* Toolbar */}
      <div style={{
        height: 44, background: '#1a1a2e', borderBottom: '1px solid #2a2a3e',
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
        fontFamily: "'Space Grotesk', sans-serif", flexShrink: 0,
      }}>
        <Link
          href={`/${orgSlug}/dashboard`}
          style={{ fontSize: 11, color: '#9090b0', textDecoration: 'none', marginRight: 4 }}
        >
          ← Dashboard
        </Link>
        <span style={{ color: '#3a3a52' }}>|</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e6e1' }}>{projectName}</span>
        <div style={{ flex: 1 }} />

        <SaveBadge state={saveState} />

        {/* Version label input */}
        <input
          type="text"
          placeholder="Version label (optional)"
          value={versionLabel}
          onChange={e => setVersionLabel(e.target.value)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12,
            background: '#0e0e1a', border: '1px solid #3a3a52',
            color: '#e8e6e1', outline: 'none', width: 180,
          }}
        />

        {/* Save button */}
        <button
          onClick={triggerManualSave}
          disabled={saveState.status === 'saving'}
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: 'linear-gradient(135deg, #c9a84c, #e8c96d)',
            color: '#1a1200', border: 'none', cursor: 'pointer',
            opacity: saveState.status === 'saving' ? 0.6 : 1,
          }}
        >
          Save ⌘S
        </button>

        {/* History toggle */}
        <button
          onClick={() => setHistoryOpen(o => !o)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12,
            background: historyOpen ? '#2a2a3e' : 'transparent',
            border: '1px solid #3a3a52', color: '#9090b0', cursor: 'pointer',
          }}
        >
          History
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* iframe */}
        <iframe
          ref={iframeRef}
          src="/editor/slotforge.html?v=v46"
          style={{ flex: 1, border: 'none', display: 'block' }}
          title="Spinative Editor"
        />

        {/* Version history panel */}
        {historyOpen && (
          <div style={{
            width: 260, background: '#1a1a2e', borderLeft: '1px solid #2a2a3e',
            display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk', sans-serif",
          }}>
            <div style={{
              padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#9090b0',
              borderBottom: '1px solid #2a2a3e', textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Version History
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {snapshots.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: '#9090b0', textAlign: 'center' }}>
                  No snapshots yet.
                  <br /><br />
                  Save with a label to create one.
                </div>
              ) : (
                snapshots.map(snap => (
                  <div
                    key={snap.id}
                    style={{
                      padding: '10px 12px', borderRadius: 8, marginBottom: 6,
                      background: '#0e0e1a', cursor: 'pointer',
                    }}
                    onClick={() => handleRestore(snap)}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e8e6e1', marginBottom: 3 }}>
                      {snap.label ?? 'Autosave'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9090b0' }}>
                      {new Date(snap.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
