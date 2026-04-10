'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { autosaveProject, createSnapshot, getSnapshots, restoreSnapshot } from '../../actions/editor'
import type { ProjectSnapshot, SaveState } from '../../types'

interface EditorFrameProps { projectId: string; orgSlug: string; initialPayload: Record<string, unknown> | null; projectName: string }

// Computed once at module load — busts iframe cache on every dev server restart
// but stays stable across React re-renders within a session
const EDITOR_BUILD_TS = process.env.NODE_ENV === 'development' ? Date.now() : 'prod'
const editorSrc = `/editor/slotforge.html?v=${EDITOR_BUILD_TS}`

function SaveBadge({ state }: { state: SaveState }) {
  const map = { idle: { color: '#9090b0', label: 'All saved' }, dirty: { color: '#f59e0b', label: 'Unsaved changes' }, saving: { color: '#60a5fa', label: 'Saving…' }, saved: { color: '#34d399', label: 'Saved' }, error: { color: '#f87171', label: 'Save failed' } }
  const { color, label } = map[state.status]
  return <span style={{ fontSize: 12, color, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />{label}{state.lastSaved && state.status === 'saved' && <span style={{ color: '#9090b0', marginLeft: 4 }}>{state.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</span>
}

export default function EditorFrame({ projectId, orgSlug, initialPayload, projectName }: EditorFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const payloadRef = useRef<Record<string, unknown> | null>(initialPayload)
  const manualSaveFlag = useRef(false)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [versionLabel, setVersionLabel] = useState('')
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  // Live-track the game name as the user edits it in the editor
  const [liveProjectName, setLiveProjectName] = useState(projectName)

  async function loadSnapshots() {
    const { data } = await getSnapshots(projectId)
    if (data) setSnapshots(data as ProjectSnapshot[])
  }
  useEffect(() => { loadSnapshots() }, [projectId])

  const doSave = useCallback(async (payload: Record<string, unknown>, isManual: boolean) => {
    setSaveState({ status: 'saving' })
    try {
      const { error } = await autosaveProject(projectId, payload)
      if (error) throw error
      if (isManual) { await createSnapshot(projectId, payload, versionLabel.trim() || undefined); setVersionLabel(''); loadSnapshots() }
      setSaveState({ status: 'saved', lastSaved: new Date() })
      setTimeout(() => setSaveState(s => s.status === 'saved' ? { ...s, status: 'idle' } : s), 3000)
    } catch { setSaveState({ status: 'error' }) }
  }, [projectId, versionLabel])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg?.type) return
      if (msg.type === 'SF_IFRAME_READY') {
        // Always send projectName so the editor can use it as the canonical name
        iframeRef.current?.contentWindow?.postMessage({
          type: 'SF_LOAD',
          payload: initialPayload ?? null,
          projectName
        }, '*')
      }
      if (msg.type === 'SF_DIRTY') setSaveState(s => s.status !== 'saving' ? { ...s, status: 'dirty' } : s)
      // Asset upload: editor sends a file blob + metadata, we upload to Supabase Storage
      // and reply with the public URL so the editor can store URLs instead of base64
      if (msg.type === 'SF_UPLOAD_ASSET' && msg.file && msg.assetKey) {
        const form = new FormData()
        form.append('file', msg.file as Blob)
        form.append('projectId', projectId)
        form.append('assetKey', msg.assetKey as string)
        fetch('/api/assets/upload', { method: 'POST', body: form })
          .then(r => r.json())
          .then(({ url, error }) => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'SF_UPLOAD_ASSET_RESULT',
              assetKey: msg.assetKey,
              url: url ?? null,
              error: error ?? null,
            }, '*')
          })
          .catch(err => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'SF_UPLOAD_ASSET_RESULT',
              assetKey: msg.assetKey,
              url: null,
              error: String(err),
            }, '*')
          })
      }
      if (msg.type === 'SF_AUTOSAVE' && msg.payload) {
        payloadRef.current = msg.payload
        // Live-update the shell toolbar name from the editor's gameName
        const gn = (msg.payload as Record<string, unknown>).gameName as string | undefined
        if (gn && gn.trim()) setLiveProjectName(gn.trim())
        const isManual = manualSaveFlag.current
        manualSaveFlag.current = false
        doSave(msg.payload, isManual)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [doSave, initialPayload])

  useEffect(() => {
    const interval = setInterval(() => { if (saveState.status === 'dirty') iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, '*') }, 60000)
    return () => clearInterval(interval)
  }, [saveState.status])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); triggerManualSave() } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function triggerManualSave() { manualSaveFlag.current = true; iframeRef.current?.contentWindow?.postMessage({ type: 'SF_REQUEST_SAVE' }, '*') }

  async function handleRestore(snap: ProjectSnapshot) {
    if (!confirm('Restore this version?')) return
    await restoreSnapshot(snap.id)
    iframeRef.current?.contentWindow?.postMessage({ type: 'SF_LOAD', payload: snap.payload }, '*')
    setSaveState({ status: 'saved', lastSaved: new Date() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#13131e' }}>
      <div style={{ height: 44, background: '#1a1a2e', borderBottom: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', fontFamily: "'Space Grotesk', sans-serif", flexShrink: 0 }}>
        <Link href={`/${orgSlug}/dashboard`} style={{ fontSize: 11, color: '#9090b0', textDecoration: 'none', marginRight: 4 }}>← Dashboard</Link>
        <span style={{ color: '#3a3a52' }}>|</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e6e1' }}>{liveProjectName}</span>
        <div style={{ flex: 1 }} />
        <SaveBadge state={saveState} />
        <input type="text" placeholder="Version label (optional)" value={versionLabel} onChange={e => setVersionLabel(e.target.value)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, background: '#0e0e1a', border: '1px solid #3a3a52', color: '#e8e6e1', outline: 'none', width: 180 }} />
        <button onClick={triggerManualSave} disabled={saveState.status === 'saving'} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'linear-gradient(135deg, #c9a84c, #e8c96d)', color: '#1a1200', border: 'none', cursor: 'pointer', opacity: saveState.status === 'saving' ? 0.6 : 1 }}>Save ⌘S</button>
        <button onClick={() => setHistoryOpen(o => !o)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, background: historyOpen ? '#2a2a3e' : 'transparent', border: '1px solid #3a3a52', color: '#9090b0', cursor: 'pointer' }}>History</button>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <iframe ref={iframeRef} src={editorSrc} style={{ flex: 1, border: 'none', display: 'block' }} title="SlotForge Editor" />
        {historyOpen && (
          <div style={{ width: 260, background: '#1a1a2e', borderLeft: '1px solid #2a2a3e', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#9090b0', borderBottom: '1px solid #2a2a3e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Version History</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {snapshots.length === 0 ? <div style={{ padding: 16, fontSize: 12, color: '#9090b0', textAlign: 'center' }}>No snapshots yet.<br /><br />Save with a label to create one.</div>
              : snapshots.map(snap => (
                <div key={snap.id} onClick={() => handleRestore(snap)} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 6, background: '#0e0e1a', cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e8e6e1', marginBottom: 3 }}>{snap.label ?? 'Autosave'}</div>
                  <div style={{ fontSize: 11, color: '#9090b0' }}>{new Date(snap.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
