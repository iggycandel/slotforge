'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Single-asset regenerate popup (Popup A of the AI-gen overhaul).
//
// Replaces the fire-and-forget ✨ button in AssetsPanel / AssetsWorkspace.
// Users now see the slot they are editing, can override the aspect ratio,
// pick a graphic style, write a custom prompt, and upload up to 3 reference
// images. References are stored locally for now (sent as data URLs in the
// request); reference-image conditioning on the provider side ships in P3.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { X, Sparkles, Loader2, Upload, ImageIcon, Info } from 'lucide-react'
import type { AspectRatio } from '@/types/assets'
import { GRAPHIC_STYLES }    from '@/lib/ai/styles'

export interface SingleGeneratePopupProps {
  open:            boolean
  onClose:         () => void
  /** Asset key — legacy AssetType (`symbol_high_1`) or feature slot (`bonuspick.bg`). */
  slotKey:         string
  slotLabel:       string
  /** Current asset URL (for side-by-side preview when regenerating). */
  currentUrl?:     string
  projectId:       string
  /** Theme text (gameName / themeKey from projectMeta). */
  theme:           string
  projectMeta:     Record<string, unknown>
  /** Style id currently set on the project — pre-selects the dropdown. */
  defaultStyleId?: string
  /** Called on successful generation with the new asset URL. */
  onGenerated:     (assetKey: string, url: string) => void
  /** Trigger a refetch of the assets list after a successful generation. */
  onReloadAssets:  () => void
}

// ─── Ratio presets with preview rectangles ──────────────────────────────────
const RATIO_PRESETS: Array<{ ratio: AspectRatio; label: string; hint: string }> = [
  { ratio: '1:1',  label: '1:1',   hint: 'symbols, buttons' },
  { ratio: '3:2',  label: '3:2',   hint: 'backgrounds' },
  { ratio: '2:3',  label: '2:3',   hint: 'character portrait' },
  { ratio: '16:9', label: '16:9',  hint: 'wide banner' },
  { ratio: '9:16', label: '9:16',  hint: 'mobile vertical' },
  { ratio: '3:1',  label: '3:1',   hint: 'title banner' },
  { ratio: '4:1',  label: '4:1',   hint: 'jackpot plaque' },
  { ratio: '1:4',  label: '1:4',   hint: 'expanded reel column' },
]

// ─── Design tokens (match AssetsPanel) ──────────────────────────────────────
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
  font:        "'Inter','Space Grotesk',sans-serif",
}

// ─── Natural default ratio picker — mirrors lib/ai/index.ts ──────────────
// We duplicate the logic here so the UI can pre-select the right radio
// without a round-trip. If the table drifts, the server still clamps via
// its authoritative copy — the mismatch would only affect the pre-select.
function defaultRatioForClient(slotKey: string): AspectRatio {
  const k = slotKey
  if (k === 'background_base' || k === 'background_bonus') return '3:2'
  if (k === 'logo')    return '3:1'
  if (k === 'character') return '2:3'
  if (k === 'jackpot_label') return '4:1'
  if (k === 'reel_frame' || k === 'spin_button') return '1:1'
  if (/\.bg$/.test(k))                           return '3:2'
  if (/(banner|header|footer|title)/.test(k))    return '3:1'
  if (/badge|counter/.test(k))                   return '3:1'
  if (/expanded_overlay/.test(k))                return '1:4'
  return '1:1'
}

export function SingleGeneratePopup({
  open,
  onClose,
  slotKey,
  slotLabel,
  currentUrl,
  projectId,
  theme,
  projectMeta,
  defaultStyleId,
  onGenerated,
  onReloadAssets,
}: SingleGeneratePopupProps) {
  const [ratio,       setRatio]       = useState<AspectRatio>(defaultRatioForClient(slotKey))
  const [styleId,     setStyleId]     = useState<string>(defaultStyleId ?? '')
  const [customPrompt,setCustomPrompt]= useState<string>('')
  const [refImages,   setRefImages]   = useState<string[]>([])
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset form whenever a new slot opens the dialog
  useEffect(() => {
    if (!open) return
    setRatio(defaultRatioForClient(slotKey))
    setStyleId(defaultStyleId ?? '')
    setCustomPrompt('')
    setRefImages([])
    setError(null)
  }, [open, slotKey, defaultStyleId])

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !generating) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, generating, onClose])

  if (!open) return null

  async function handleRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - refImages.length)
    e.target.value = ''
    if (!files.length) return
    const reads = await Promise.all(files.map(f => new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = rej
      r.readAsDataURL(f)
    })))
    setRefImages(prev => [...prev, ...reads].slice(0, 3))
  }

  function removeRef(i: number) {
    setRefImages(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-single', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          asset_type:    slotKey,
          theme,
          project_id:    projectId,
          provider:      'auto',
          style_id:      styleId || undefined,
          project_meta:  projectMeta,
          ratio,
          custom_prompt: customPrompt.trim() || undefined,
          // reference_images: refImages,  // P3 — server ignores today
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? `Generation failed (${res.status})`)
      }
      const url = (data?.asset?.url ?? data?.url) as string | undefined
      if (!url) throw new Error('Generation returned no URL')
      onGenerated(slotKey, url)
      onReloadAssets()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      onClick={() => !generating && onClose()}
      style={{
        position:   'fixed',
        inset:       0,
        background: 'rgba(0,0,0,.72)',
        backdropFilter: 'blur(4px)',
        zIndex:      9999,
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'center',
        fontFamily:  T.font,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:       '96%',
          maxWidth:    580,
          maxHeight:   '92vh',
          overflow:    'auto',
          background:  T.surface,
          border:      `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow:   '0 8px 48px rgba(0,0,0,.6)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding:    '14px 18px',
          borderBottom: `1px solid ${T.border}`,
          display:    'flex',
          alignItems: 'center',
          gap:        10,
        }}>
          <Sparkles size={18} style={{ color: T.gold }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, lineHeight: 1.2 }}>
              Generate {slotLabel}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'DM Mono',monospace", marginTop: 2 }}>
              {slotKey}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.textMuted,
              cursor: generating ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Preview strip ──────────────────────────────────────────────── */}
        {currentUrl && (
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Current
            </div>
            <div style={{
              width: 96, height: 96,
              borderRadius: 6, overflow: 'hidden',
              background: T.surfaceHigh, border: `1px solid ${T.border}`,
            }}>
              <img src={currentUrl} alt="current" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
        )}

        {/* ── Ratio selector ────────────────────────────────────────────── */}
        <Section title="Aspect ratio">
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
          }}>
            {RATIO_PRESETS.map(preset => (
              <RatioCard
                key={preset.ratio}
                active={ratio === preset.ratio}
                {...preset}
                onClick={() => setRatio(preset.ratio)}
              />
            ))}
          </div>
        </Section>

        {/* ── Graphic style ──────────────────────────────────────────────── */}
        <Section title="Graphic style">
          <select
            value={styleId}
            onChange={e => setStyleId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: T.surfaceHigh,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              color: T.textPrimary,
              fontSize: 12,
              fontFamily: T.font,
              outline: 'none',
            }}
          >
            <option value="">(Project default)</option>
            {GRAPHIC_STYLES.map(s => (
              <option key={s.id} value={s.id}>{s.emoji} {s.name} — {s.description}</option>
            ))}
          </select>
        </Section>

        {/* ── Reference images (P3 stub) ────────────────────────────────── */}
        <Section
          title="Reference images"
          subtitle="Up to 3 • attachment coming in P3"
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {refImages.map((src, i) => (
              <div key={i} style={{
                width: 72, height: 72, borderRadius: 6, overflow: 'hidden',
                background: T.surfaceHigh, border: `1px solid ${T.border}`,
                position: 'relative',
              }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => removeRef(i)}
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 18, height: 18, borderRadius: 4,
                    background: 'rgba(0,0,0,.6)', border: 'none',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                ><X size={10} /></button>
              </div>
            ))}
            {refImages.length < 3 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 72, height: 72, borderRadius: 6,
                  background: T.surfaceHigh, border: `1px dashed ${T.border}`,
                  color: T.textMuted,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                <Upload size={16} />
                <span style={{ fontSize: 10 }}>add</span>
              </button>
            )}
            <input
              ref={fileInputRef} type="file" accept="image/*" multiple
              style={{ display: 'none' }} onChange={handleRefUpload}
            />
          </div>
          <div style={{
            marginTop: 8, fontSize: 10, color: T.textMuted,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Info size={10} />
            Uploads are stored in the popup for now. Provider-side image
            conditioning (Runway reference_images, OpenAI image edits) lands
            in P3 of the AI overhaul.
          </div>
        </Section>

        {/* ── Custom prompt override ────────────────────────────────────── */}
        <Section
          title="Custom prompt"
          subtitle="Leave blank to use the default composed prompt"
        >
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Override the auto-composed prompt…"
            rows={3}
            maxLength={2000}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: T.surfaceHigh,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              color: T.textPrimary,
              fontSize: 12,
              fontFamily: T.font,
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
        </Section>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div style={{
            margin: '0 18px 8px',
            padding: '8px 10px',
            background: 'rgba(248,113,113,.08)',
            border: '1px solid rgba(248,113,113,.3)',
            borderRadius: 6,
            color: T.red,
            fontSize: 11,
          }}>
            {error}
          </div>
        )}

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 18px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          background: T.bg,
        }}>
          <button
            onClick={onClose}
            disabled={generating}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              color: T.textMuted,
              fontSize: 12,
              fontFamily: T.font,
              cursor: generating ? 'wait' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '8px 14px',
              background: generating ? 'rgba(201,168,76,.20)' : 'rgba(201,168,76,.12)',
              border: `1px solid rgba(201,168,76,.4)`,
              borderRadius: 6,
              color: T.gold,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: T.font,
              cursor: generating ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {generating
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
              : <><Sparkles size={12} /> Generate (1 credit)</>}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
      <div style={{
        fontSize: 10, color: T.textMuted,
        letterSpacing: '.08em', textTransform: 'uppercase',
        marginBottom: 6,
        display: 'flex', alignItems: 'baseline', gap: 6,
      }}>
        <span>{title}</span>
        {subtitle && <span style={{ color: T.textFaint, fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

// ─── Ratio card (visualizes the aspect with a thumbnail shape) ───────────────
function RatioCard({
  ratio, label, hint, active, onClick,
}: { ratio: AspectRatio; label: string; hint: string; active: boolean; onClick: () => void }) {
  // Parse "w:h" → proportional inline box. Use a fixed 42 px max dimension
  // so portrait/landscape cards line up on the same grid row.
  const [wStr, hStr] = ratio.split(':')
  const w = parseFloat(wStr), h = parseFloat(hStr)
  const MAX = 34
  const scale = w > h ? MAX / w : MAX / h
  const bw = Math.round(w * scale)
  const bh = Math.round(h * scale)
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 4px 6px',
        background: active ? 'rgba(201,168,76,.12)' : T.surfaceHigh,
        border: `1px solid ${active ? 'rgba(201,168,76,.6)' : T.border}`,
        borderRadius: 6,
        color: active ? T.gold : T.textMuted,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        fontFamily: T.font,
      }}
    >
      <div style={{
        width: bw, height: bh,
        background: active ? 'rgba(201,168,76,.4)' : 'rgba(255,255,255,.08)',
        borderRadius: 2,
      }} />
      <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>{label}</div>
      <div style={{ fontSize: 8, color: T.textFaint, letterSpacing: '.04em', textAlign: 'center' }}>
        {hint}
      </div>
    </button>
  )
}
