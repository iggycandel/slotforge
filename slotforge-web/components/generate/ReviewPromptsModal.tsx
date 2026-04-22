'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Review Prompts modal
//
// Lets the user preview every asset's composed prompt in one place, before
// spending any credits. Each prompt is editable; edits persist as per-slot
// overrides in localStorage (keyed on project id) and are picked up by the
// SingleGeneratePopup the next time it opens for that slot. Bulk generate
// will pick them up in a follow-up pass (not in this first cut).
//
// Override storage shape (localStorage, per-project):
//   spn.prompts.<projectId> = { [slotKey]: customPromptString }
//
// If a slot has an override, it shows an "Override active" pill and the
// edited body. Clearing an override returns the view to the composed
// default (computed server-side).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Loader2, RefreshCw, Edit2, Check, RotateCcw, Search } from 'lucide-react'
import type { PromptSections } from '@/types/assets'

// ─── Storage helpers ────────────────────────────────────────────────────────
const STORAGE_PREFIX = 'spn.prompts.'

export function readPromptOverrides(projectId: string): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + projectId)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed as Record<string, string> : {}
  } catch { return {} }
}

export function writePromptOverrides(projectId: string, overrides: Record<string, string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(overrides))
  } catch { /* private-mode safe */ }
}

export function readPromptOverride(projectId: string, slotKey: string): string | undefined {
  const all = readPromptOverrides(projectId)
  const v = all[slotKey]
  return v && v.trim() ? v : undefined
}

// ─── Design tokens (match SingleGeneratePopup) ──────────────────────────────
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
  red:         '#f87171',
  blue:        '#60a5fa',
  font:        "'Inter','Space Grotesk',system-ui,sans-serif",
}

// ─── Types ──────────────────────────────────────────────────────────────────
export interface ReviewSlot {
  /** slot key — legacy AssetType or feature slot (e.g. 'bonuspick.bg') */
  key:      string
  /** short display label */
  label:    string
  /** group label for UI grouping — "Backgrounds", "High symbols", feature name… */
  group:    string
}

interface PromptEntry {
  prompt?:         string
  negativePrompt?: string
  sections?:       PromptSections | null
  error?:          string
}

export interface ReviewPromptsModalProps {
  open:         boolean
  onClose:      () => void
  projectId:    string
  projectName?: string
  theme:        string
  styleId?:     string
  projectMeta:  Record<string, unknown>
  /** Every slot the user might generate in this project (base + active
   *  feature slots). Usually derived by the caller from projectMeta. */
  slots:        ReviewSlot[]
  /** Called when overrides change so the caller can refresh dependent UI. */
  onOverridesChanged?: (overrides: Record<string, string>) => void
}

export function ReviewPromptsModal({
  open, onClose, projectId, projectName, theme, styleId, projectMeta, slots, onOverridesChanged,
}: ReviewPromptsModalProps) {
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [prompts,  setPrompts]  = useState<Record<string, PromptEntry>>({})
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft,    setDraft]    = useState<string>('')
  const [filter,   setFilter]   = useState<string>('')

  // Load overrides from localStorage on open
  useEffect(() => {
    if (!open) return
    setOverrides(readPromptOverrides(projectId))
    setEditingKey(null)
    setError(null)
    setFilter('')
  }, [open, projectId])

  // Fetch composed prompts from the server in one batch
  const fetchAll = useCallback(async () => {
    if (!slots.length) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/prompts/preview-all', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          project_id:   projectId,
          asset_keys:   slots.map(s => s.key),
          theme,
          style_id:     styleId || undefined,
          project_meta: projectMeta,
        }),
      })
      const raw  = await res.text()
      type BatchResponse = { prompts?: Record<string, PromptEntry>; error?: string }
      const data: BatchResponse = (() => { try { return raw ? JSON.parse(raw) as BatchResponse : {} } catch { return {} } })()
      if (!res.ok || data?.error) throw new Error(data?.error || `Preview failed (${res.status})`)
      setPrompts(data.prompts ?? {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setLoading(false)
    }
  }, [slots, projectId, theme, styleId, projectMeta])

  useEffect(() => { if (open) void fetchAll() }, [open, fetchAll])

  // ESC to close (unless editing — let the Cancel button handle exit there)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingKey) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, editingKey, onClose])

  if (!open) return null

  function startEdit(key: string, composed: string) {
    const existing = overrides[key]
    setEditingKey(key)
    setDraft(existing ?? composed ?? '')
  }

  function saveEdit() {
    if (!editingKey) return
    const next = { ...overrides }
    const trimmed = draft.trim()
    if (trimmed) next[editingKey] = trimmed
    else         delete next[editingKey]
    setOverrides(next)
    writePromptOverrides(projectId, next)
    onOverridesChanged?.(next)
    setEditingKey(null)
    setDraft('')
  }

  function cancelEdit() {
    setEditingKey(null)
    setDraft('')
  }

  function clearOverride(key: string) {
    const next = { ...overrides }
    delete next[key]
    setOverrides(next)
    writePromptOverrides(projectId, next)
    onOverridesChanged?.(next)
  }

  // Grouping for rendering
  const grouped = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const map = new Map<string, ReviewSlot[]>()
    for (const s of slots) {
      if (needle && !s.label.toLowerCase().includes(needle) && !s.key.toLowerCase().includes(needle)) continue
      const list = map.get(s.group) ?? []
      list.push(s)
      map.set(s.group, list)
    }
    return Array.from(map.entries())
  }, [slots, filter])

  const overrideCount = Object.values(overrides).filter(v => v && v.trim()).length

  return (
    <div
      onClick={() => !editingKey && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        fontFamily: T.font, padding: '24px 24px 0',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 880, maxHeight: '100%',
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '12px 12px 0 0',
          boxShadow: '0 8px 48px rgba(0,0,0,.6)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, lineHeight: 1.2 }}>
              Review prompts{projectName ? ` — ${projectName}` : ''}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {slots.length} slot{slots.length === 1 ? '' : 's'}
              {overrideCount > 0 && (
                <> · <span style={{ color: T.gold }}>{overrideCount} override{overrideCount === 1 ? '' : 's'}</span></>
              )}
            </div>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            title="Refresh composed prompts"
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'transparent', border: `1px solid ${T.border}`,
              color: loading ? T.textFaint : T.textMuted,
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
          </button>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.textMuted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Search ────────────────────────────────────────────────────── */}
        <div style={{ padding: '10px 18px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', background: T.surfaceHigh,
            border: `1px solid ${T.border}`, borderRadius: 6,
          }}>
            <Search size={12} style={{ color: T.textMuted }} />
            <input
              type="text"
              placeholder="Filter slots by name or key…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                flex: 1, minWidth: 0,
                background: 'transparent', border: 'none', outline: 'none',
                color: T.textPrimary, fontSize: 12, fontFamily: T.font,
              }}
            />
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          padding: '8px 18px 18px',
        }}>
          {error && (
            <div style={{
              padding: '10px 12px', marginTop: 8,
              background: 'rgba(248,113,113,.08)',
              border: '1px solid rgba(248,113,113,.3)',
              borderRadius: 6, color: T.red, fontSize: 12,
            }}>
              {error}
            </div>
          )}

          {loading && !Object.keys(prompts).length && (
            <div style={{
              padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 12,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: T.gold }} />
              Composing prompts…
            </div>
          )}

          {!loading && grouped.map(([groupName, groupSlots]) => (
            <div key={groupName} style={{ marginTop: 14 }}>
              <div style={{
                fontSize: 10, color: T.textMuted, fontWeight: 600,
                letterSpacing: '.08em', textTransform: 'uppercase',
                padding: '6px 0', borderBottom: `1px solid ${T.border}`, marginBottom: 6,
              }}>
                {groupName}
              </div>
              {groupSlots.map(slot => {
                const entry   = prompts[slot.key]
                const override = overrides[slot.key]
                const composed = entry?.prompt ?? ''
                const display  = override ?? composed
                const isEditing = editingKey === slot.key

                return (
                  <div key={slot.key} style={{
                    padding: '10px 12px', marginBottom: 6,
                    background: T.surfaceHigh,
                    border: `1px solid ${override ? 'rgba(201,168,76,.35)' : T.border}`,
                    borderRadius: 6,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, flex: 1, minWidth: 0 }}>
                        {slot.label}
                      </div>
                      <div style={{
                        fontSize: 9, color: T.textFaint,
                        fontFamily: "'DM Mono',monospace",
                      }}>
                        {slot.key}
                      </div>
                      {override && !isEditing && (
                        <div style={{
                          fontSize: 9, fontWeight: 600, color: T.gold,
                          background: 'rgba(201,168,76,.12)',
                          padding: '2px 6px', borderRadius: 3,
                          border: '1px solid rgba(201,168,76,.3)',
                          letterSpacing: '.04em', textTransform: 'uppercase',
                        }}>
                          Override
                        </div>
                      )}
                    </div>

                    {entry?.error ? (
                      <div style={{ fontSize: 11, color: T.red }}>
                        {entry.error}
                      </div>
                    ) : isEditing ? (
                      <>
                        <textarea
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          rows={6}
                          autoFocus
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: T.bg,
                            border: `1px solid ${T.border}`,
                            borderRadius: 6,
                            color: T.textPrimary,
                            fontSize: 11, fontFamily: "'DM Mono',monospace",
                            outline: 'none', resize: 'vertical', lineHeight: 1.5,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={cancelEdit}
                            style={actionBtn(T.textMuted)}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => setDraft(composed)}
                            title="Revert draft to composed default"
                            style={actionBtn(T.textMuted)}
                          >
                            <RotateCcw size={10} /> Reset to default
                          </button>
                          <button
                            onClick={saveEdit}
                            style={{
                              ...actionBtn(T.gold),
                              background: 'rgba(201,168,76,.12)',
                              border: '1px solid rgba(201,168,76,.4)',
                              fontWeight: 600,
                            }}
                          >
                            <Check size={10} /> Save override
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{
                          fontSize: 11, color: T.textPrimary,
                          fontFamily: "'DM Mono',monospace",
                          lineHeight: 1.5, opacity: override ? 1 : 0.85,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          maxHeight: 140, overflow: 'auto',
                          padding: 0,
                        }}>
                          {display || <span style={{ color: T.textFaint }}>(empty)</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                          {override && (
                            <button
                              onClick={() => clearOverride(slot.key)}
                              style={actionBtn(T.red)}
                              title="Clear override, revert to composed default"
                            >
                              <RotateCcw size={10} /> Clear override
                            </button>
                          )}
                          <button
                            onClick={() => startEdit(slot.key, composed)}
                            style={actionBtn(T.textMuted)}
                            disabled={!composed}
                          >
                            <Edit2 size={10} /> {override ? 'Edit override' : 'Edit'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {!loading && !error && !grouped.length && (
            <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
              No slots match the current filter.
            </div>
          )}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

function actionBtn(color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 5,
    background: 'transparent',
    border: `1px solid ${T.border}`,
    color, fontSize: 10, fontFamily: T.font,
    cursor: 'pointer',
  }
}
