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
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Sparkles, Loader2, Upload, Info, ChevronDown, ChevronRight, Copy, FileText } from 'lucide-react'
import type { AspectRatio, GeneratedAsset, PromptSections } from '@/types/assets'
import { GRAPHIC_STYLES }    from '@/lib/ai/styles'
import { readPromptOverride } from './ReviewPromptsModal'

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
  /** Called on successful generation with the full asset record. Callers
   *  that only need the URL can read `asset.url`. */
  onGenerated:     (assetKey: string, asset: GeneratedAsset) => void
  /** Trigger a refetch of the assets list after a successful generation.
   *  Optional — workspaces that manage their own asset state (AssetsWorkspace)
   *  can skip this and update via onGenerated instead. */
  onReloadAssets?: () => void
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
  const [quality,     setQuality]     = useState<'low'|'medium'|'high'>('medium')
  const [customPrompt,setCustomPrompt]= useState<string>('')
  const [refImages,   setRefImages]   = useState<string[]>([])
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Prompt composition (Part 3) ───────────────────────────────────────────
  // Preview contents, plus UI flags for the collapsible panel + copy toast.
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError,   setPreviewError]   = useState<string | null>(null)
  const [sections,       setSections]       = useState<PromptSections | null>(null)
  const [finalPrompt,    setFinalPrompt]    = useState<string>('')
  const [finalNegative,  setFinalNegative]  = useState<string>('')
  const [promptOpen,     setPromptOpen]     = useState<boolean>(false)
  const [advancedOpen,   setAdvancedOpen]   = useState<boolean>(false)
  const [copiedLabel,    setCopiedLabel]    = useState<string | null>(null)

  // Reset form whenever a new slot opens the dialog
  useEffect(() => {
    if (!open) return
    setRatio(defaultRatioForClient(slotKey))
    setStyleId(defaultStyleId ?? '')
    setQuality('medium')
    // If the user previously saved a prompt override for this slot from the
    // Review Prompts modal, pre-fill the Custom Prompt textarea with it so
    // regenerations automatically use the override. Empty string means no
    // override saved — the server composes from scratch.
    const savedOverride = readPromptOverride(projectId, slotKey) ?? ''
    setCustomPrompt(savedOverride)
    setRefImages([])
    setError(null)
    setSections(null)
    setFinalPrompt('')
    setFinalNegative('')
    setPreviewError(null)
    setPromptOpen(false)
    setAdvancedOpen(false)
    setCopiedLabel(null)
  }, [open, slotKey, defaultStyleId])

  // Fetch the composed prompt preview. Called on-demand when the user
  // opens the "Prompt composition" panel, and again when they change
  // style (since style is the dominant signal in the identity anchor).
  // Not called on ratio or quality changes — those don't affect prompt
  // text, only the image generation parameters.
  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch('/api/ai-single/preview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          asset_type:   slotKey,
          theme,
          project_id:   projectId,
          style_id:     styleId || undefined,
          project_meta: projectMeta,
        }),
      })
      const raw  = await res.text()
      type PreviewResponse = { prompt?: string; negativePrompt?: string; sections?: PromptSections | null; error?: string }
      const data: PreviewResponse = (() => { try { return raw ? JSON.parse(raw) as PreviewResponse : {} } catch { return {} } })()
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `Preview failed (${res.status})`)
      }
      setSections(data.sections ?? null)
      setFinalPrompt(data.prompt ?? '')
      setFinalNegative(data.negativePrompt ?? '')
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }, [slotKey, theme, projectId, styleId, projectMeta])

  // Refetch when the panel is opened (lazy — don't pay for a preview call
  // if the user never opens the panel) and when the style changes while it's
  // already open.
  useEffect(() => {
    if (!open || !promptOpen) return
    void fetchPreview()
  }, [open, promptOpen, styleId, fetchPreview])

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !generating) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, generating, onClose])

  if (!open) return null

  function handleCopy(key: string, text: string) {
    if (!text) return
    try {
      navigator.clipboard?.writeText(text)
      setCopiedLabel(key)
      setTimeout(() => setCopiedLabel(prev => (prev === key ? null : prev)), 1500)
    } catch {
      // Clipboard API can fail in non-secure contexts; silent fallback —
      // the user can still read the text on-screen.
    }
  }

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
          quality,
          custom_prompt: customPrompt.trim() || undefined,
          // reference_images: refImages,  // P3 — server ignores today
        }),
      })
      // Read the body as text first, then try JSON. A non-JSON response
      // (e.g. Vercel CDN serving an HTML 404 page, a plain-text 500 from
      // a crashed edge runtime) previously collapsed into the generic
      // "Generation failed (<status>)" message and hid the actual cause.
      const raw = await res.text()
      type ZodDetails = { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
      let data: { error?: string; details?: ZodDetails; asset?: GeneratedAsset; url?: string } = {}
      try { data = raw ? JSON.parse(raw) : {} } catch { /* non-JSON body, fall through */ }
      if (!res.ok || data?.error) {
        // For Zod validation failures, append the per-field details so the
        // user sees *which* field failed (e.g. "asset_type: Unknown
        // asset_type") instead of just the top-level "Invalid request".
        const fieldLines = Object.entries(data?.details?.fieldErrors ?? {})
          .map(([k, msgs]) => `${k}: ${(msgs ?? []).join('; ')}`)
        const formLines = data?.details?.formErrors ?? []
        const detailSuffix = [...fieldLines, ...formLines]
          .filter(Boolean).join(' · ')
        const rawSnippet = raw
          .replace(/<[^>]+>/g, '')    // strip HTML tags
          .split('\n').map(l => l.trim()).filter(Boolean).slice(0, 1).join(' ')
          .slice(0, 180)
        const base = data?.error || rawSnippet || `Generation failed (${res.status})`
        const msg = detailSuffix ? `${base} — ${detailSuffix}` : base
        throw new Error(msg)
      }
      const asset = data?.asset as GeneratedAsset | undefined
      if (!asset?.url) throw new Error('Generation returned no URL')
      onGenerated(slotKey, asset)
      onReloadAssets?.()
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
        <Section
          title="Graphic style"
          subtitle={
            defaultStyleId && styleId === defaultStyleId
              ? 'inherited from Project Settings · change to override for this asset'
              : defaultStyleId && styleId && styleId !== defaultStyleId
                ? 'overrides the project default'
                : undefined
          }
        >
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

        {/* ── Quality tier ──────────────────────────────────────────────── */}
        <Section
          title="Quality"
          subtitle="Medium is plenty for iteration • High only for final delivery"
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {([
              { q: 'low',    label: 'Low',    hint: 'draft', cost: '~$0.01' },
              { q: 'medium', label: 'Medium', hint: 'review', cost: '~$0.04' },
              { q: 'high',   label: 'High',   hint: 'final',  cost: '~$0.17' },
            ] as const).map(opt => (
              <button
                key={opt.q}
                onClick={() => setQuality(opt.q)}
                style={{
                  padding: '8px 6px',
                  background: quality === opt.q ? 'rgba(201,168,76,.12)' : T.surfaceHigh,
                  border: `1px solid ${quality === opt.q ? 'rgba(201,168,76,.6)' : T.border}`,
                  borderRadius: 6,
                  color: quality === opt.q ? T.gold : T.textMuted,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  fontFamily: T.font,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: 9, color: T.textFaint }}>{opt.hint}</div>
                <div style={{ fontSize: 9, color: T.textFaint, fontFamily: "'DM Mono',monospace" }}>
                  {opt.cost}
                </div>
              </button>
            ))}
          </div>
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

        {/* ── Prompt composition (Part 3: transparency) ─────────────────── */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
          <button
            onClick={() => setPromptOpen(v => !v)}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: 0, background: 'transparent', border: 'none',
              color: T.textMuted, cursor: 'pointer',
              fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
              fontFamily: T.font,
            }}
          >
            {promptOpen
              ? <ChevronDown  size={12} />
              : <ChevronRight size={12} />}
            <span>Prompt composition</span>
            <span style={{ color: T.textFaint, fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>
              see what the model will receive
            </span>
          </button>

          {promptOpen && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {previewLoading && !sections && (
                <div style={{ fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> Composing…
                </div>
              )}
              {previewError && (
                <div style={{ fontSize: 11, color: T.red }}>{previewError}</div>
              )}

              {sections && (
                <>
                  {/* Identity — style + theme */}
                  <PromptLayer
                    label="Identity"
                    hint="style · theme"
                    body={sections.identity || '(none — project has no style or theme set)'}
                    onCopy={() => handleCopy('identity', sections.identity)}
                    copied={copiedLabel === 'identity'}
                  />

                  {/* Template — category base */}
                  <PromptLayer
                    label="Template"
                    hint="category base"
                    body={sections.template}
                    onCopy={() => handleCopy('template', sections.template)}
                    copied={copiedLabel === 'template'}
                  />

                  {/* Context — meta-derived lines */}
                  <PromptLayer
                    label="Context"
                    hint={`${sections.context.length} line${sections.context.length === 1 ? '' : 's'} from project meta`}
                    body={sections.context.length ? sections.context.join('\n') : '(no context — Project Settings are empty)'}
                    onCopy={() => handleCopy('context', sections.context.join(', '))}
                    copied={copiedLabel === 'context'}
                  />

                  {/* Differentiator — tier/suit/name */}
                  {sections.differentiator.length > 0 && (
                    <PromptLayer
                      label="Differentiator"
                      hint="what makes this slot unique in its set"
                      body={sections.differentiator.join('\n')}
                      onCopy={() => handleCopy('differentiator', sections.differentiator.join(', '))}
                      copied={copiedLabel === 'differentiator'}
                    />
                  )}

                  {/* Advanced — quality blocks + negatives (collapsed) */}
                  <button
                    onClick={() => setAdvancedOpen(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: 0, background: 'transparent', border: 'none',
                      color: T.textFaint, cursor: 'pointer',
                      fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase',
                      fontFamily: T.font,
                    }}
                  >
                    {advancedOpen
                      ? <ChevronDown  size={10} />
                      : <ChevronRight size={10} />}
                    Advanced (quality + negatives)
                  </button>
                  {advancedOpen && (
                    <>
                      <PromptLayer
                        label="Quality blocks"
                        hint="applied to every prompt"
                        body={[sections.quality.readability, sections.quality.consistency, sections.quality.core].join('\n')}
                        onCopy={() => handleCopy('quality', [sections.quality.readability, sections.quality.consistency, sections.quality.core].join(', '))}
                        copied={copiedLabel === 'quality'}
                      />
                      <PromptLayer
                        label="Negative prompt"
                        hint="what the model should NOT render"
                        body={finalNegative}
                        onCopy={() => handleCopy('negative', finalNegative)}
                        copied={copiedLabel === 'negative'}
                      />
                    </>
                  )}

                  {/* Use-as-custom-prompt button */}
                  <button
                    onClick={() => setCustomPrompt(finalPrompt)}
                    disabled={!finalPrompt || customPrompt === finalPrompt}
                    style={{
                      marginTop: 4,
                      padding: '6px 10px',
                      background: customPrompt === finalPrompt ? 'rgba(52,211,153,.08)' : 'rgba(201,168,76,.08)',
                      border: `1px solid ${customPrompt === finalPrompt ? 'rgba(52,211,153,.3)' : 'rgba(201,168,76,.25)'}`,
                      borderRadius: 6,
                      color: customPrompt === finalPrompt ? T.green : T.gold,
                      cursor: !finalPrompt || customPrompt === finalPrompt ? 'default' : 'pointer',
                      fontSize: 11, fontFamily: T.font, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <FileText size={11} />
                    {customPrompt === finalPrompt
                      ? 'Loaded — edit below'
                      : 'Copy composed prompt into the editor below'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Custom prompt override ────────────────────────────────────── */}
        <Section
          title="Custom prompt"
          subtitle={
            // When an override was pre-filled from the Review Prompts modal
            // we flag it explicitly so the user knows where it came from
            // (and can clear it by deleting the textarea content).
            customPrompt && customPrompt === readPromptOverride(projectId, slotKey)
              ? 'override loaded from Review Prompts · edit or clear to use default'
              : 'Leave blank to use the default composed prompt; or load it above and edit'
          }
        >
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Override the auto-composed prompt…"
            rows={customPrompt ? 6 : 3}
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
// ─── Prompt composition layer card (Part 3) ───────────────────────────────
// One card per layer in the composed prompt: Identity, Template, Context,
// Differentiator, Quality blocks, Negatives. Read-only body + a small copy
// button. Used inside the collapsible "Prompt composition" panel.
function PromptLayer({
  label, hint, body, onCopy, copied,
}: { label: string; hint: string; body: string; onCopy: () => void; copied: boolean }) {
  return (
    <div style={{
      background:   T.surfaceHigh,
      border:       `1px solid ${T.border}`,
      borderRadius: 6,
      padding:      '8px 10px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: T.gold,
            letterSpacing: '.08em', textTransform: 'uppercase',
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 9, color: T.textFaint,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {hint}
          </span>
        </div>
        <button
          onClick={onCopy}
          title="Copy"
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '3px 6px', borderRadius: 4,
            background: copied ? 'rgba(52,211,153,.12)' : 'transparent',
            border:     `1px solid ${copied ? 'rgba(52,211,153,.3)' : T.border}`,
            color:      copied ? T.green : T.textMuted,
            cursor:     'pointer', fontSize: 9, fontFamily: T.font,
            flexShrink: 0,
          }}
        >
          <Copy size={9} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div style={{
        fontSize: 11, color: T.textPrimary, lineHeight: 1.5,
        fontFamily: "'DM Mono',monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        opacity: 0.9,
      }}>
        {body}
      </div>
    </div>
  )
}

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
