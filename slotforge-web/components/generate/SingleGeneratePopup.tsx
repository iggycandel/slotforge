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
import { symbolTierInfo, defaultColorForSymbol, tierColorPalette } from '@/lib/ai/promptBuilder'
import type { ProjectMeta } from '@/types/assets'
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
  const [customPrompt,    setCustomPrompt]    = useState<string>('')
  // Custom-prompt merge mode — replace (wholesale, legacy) vs append
  // (inserts as context line, keeps project identity / template / negatives).
  // Default remains 'replace' so Review-Prompts overrides behave as before;
  // users who type a fresh custom prompt can flip to 'append' to keep the
  // consistency benefit of Project Settings.
  const [customPromptMode, setCustomPromptMode] = useState<'replace' | 'append'>('replace')
  // Per-asset reference images. Each entry stores the data-URL preview
  // plus its GPT-4o-described aesthetic (populated async by the describe
  // pipeline). Descriptions are passed into the generate call as
  // `reference_descriptions` and stack on top of project-level
  // artRefImages descriptions already injected via buildAssetContext.
  interface LocalRef { id: string; dataUrl: string; description: string; describing: boolean; error?: string }
  const [refImages,   setRefImages]   = useState<LocalRef[]>([])
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Symbol-only controls (Part B) ─────────────────────────────────────────
  // Whether to include a decorative frame (defaults to ON for symbols),
  // and which colour to weight toward. Default color selection now
  // respects the project's colour palette: if the user has set any
  // primary/bg/accent colour in Project Settings, tier-colour defaults
  // to 'none' (so it doesn't fight the palette as a competing dominant
  // hue). With no palette set, the tier default stands as before.
  const tier = symbolTierInfo(slotKey, projectMeta as ProjectMeta)
  const defaultColor = defaultColorForSymbol(slotKey, projectMeta as ProjectMeta)
  const palette = tier.count ? tierColorPalette(tier.count) : []
  const hasProjectPalette = !!(
    (projectMeta as ProjectMeta)?.colorPrimary ||
    (projectMeta as ProjectMeta)?.colorBg      ||
    (projectMeta as ProjectMeta)?.colorAccent
  )
  // Initial tier colour: 'none' when palette present, tier default otherwise.
  const initialTierColor = hasProjectPalette ? '' : (defaultColor ?? '')
  const [symbolFrame, setSymbolFrame] = useState<boolean>(true)
  const [symbolColor, setSymbolColor] = useState<string>(initialTierColor)
  // Label-capable symbol check: wild, scatter, and specials get an
  // optional user-supplied label (e.g. "WILD", "BONUS"). High / low
  // symbols are always text-free — their identity comes from the
  // depicted motif, not lettering. See promptBuilder.ts symbolLabel
  // injection which is gated on category === symbol_wild|scatter.
  const isLabelSymbol =
    slotKey === 'symbol_wild' ||
    slotKey === 'symbol_scatter' ||
    /^symbol_special_\d+$/.test(slotKey)
  const [symbolLabel, setSymbolLabel] = useState<string>('')

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
    // Review-Prompts overrides are complete composed prompts the user
    // hand-edited — use replace. Fresh custom prompts (no saved
    // override) default to append for best-of-both-worlds.
    setCustomPromptMode(savedOverride ? 'replace' : 'append')
    setRefImages([])
    setError(null)
    // Symbol defaults reset per slot. Frame on. Colour falls back to the
    // tier default only when the project palette is empty; otherwise we
    // start from 'none' so the project palette drives the mood
    // uncontested and tier accents stay opt-in.
    setSymbolFrame(true)
    const hasPalette = !!(
      (projectMeta as ProjectMeta)?.colorPrimary ||
      (projectMeta as ProjectMeta)?.colorBg      ||
      (projectMeta as ProjectMeta)?.colorAccent
    )
    setSymbolColor(hasPalette ? '' : (defaultColorForSymbol(slotKey, projectMeta as ProjectMeta) ?? ''))
    // Default label per slot: sensible auto-fill for wild/scatter, blank
    // for specials (user must opt-in explicitly).
    setSymbolLabel(
      slotKey === 'symbol_wild'    ? 'WILD'    :
      slotKey === 'symbol_scatter' ? 'SCATTER' :
      ''
    )
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
          // Symbol hints only make a difference for symbol slots — sent
          // unconditionally; the server filters by asset category.
          symbol_frame: tier.isSymbol ? symbolFrame : undefined,
          symbol_color: tier.isSymbol && symbolColor ? symbolColor : undefined,
          // Label is only honoured for wild/scatter/specials — server-side
          // the category check in promptBuilder filters for us, but we
          // still gate on isLabelSymbol here so high/low can never leak
          // a label through.
          symbol_label: isLabelSymbol && symbolLabel.trim() ? symbolLabel.trim() : undefined,
          // Preview matches what Generate will send so the prompt-composition
          // panel reflects append/replace correctly.
          custom_prompt:      customPrompt.trim() || undefined,
          custom_prompt_mode: customPrompt.trim() ? customPromptMode : undefined,
          // Per-asset reference descriptions — only the ones that finished
          // describing. In-flight references are omitted; the preview
          // re-runs when they complete (describe flow triggers a React
          // re-render, which re-runs the useEffect that calls fetchPreview).
          reference_descriptions: refImages
            .filter(r => r.description && !r.describing)
            .map(r => r.description),
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
  }, [slotKey, theme, projectId, styleId, projectMeta, tier.isSymbol, symbolFrame, symbolColor, isLabelSymbol, symbolLabel, customPrompt, customPromptMode, refImages])

  // Refetch when the panel is opened (lazy — don't pay for a preview call
  // if the user never opens the panel) and when any composition-affecting
  // control changes while it's already open.
  useEffect(() => {
    if (!open || !promptOpen) return
    void fetchPreview()
  }, [open, promptOpen, styleId, symbolFrame, symbolColor, customPrompt, customPromptMode, refImages, fetchPreview])

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

    // Read each file → data URL, show an optimistic "describing…" tile.
    const reads = await Promise.all(files.map(f => new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload  = () => res(r.result as string)
      r.onerror = rej
      r.readAsDataURL(f)
    })))

    const additions: LocalRef[] = reads.map(dataUrl => ({
      id:          `ref_${Math.random().toString(36).slice(2, 10)}`,
      dataUrl,
      description: '',
      describing:  true,
    }))
    setRefImages(prev => [...prev, ...additions].slice(0, 3))

    // For each pending ref, call /api/references/describe. gpt-4o vision
    // returns a ~90-word aesthetic description (palette / material /
    // lighting / form language) with no subject matter. Feed to generate
    // as an extra context line.  Sends the data URL directly — no need
    // to upload these to Storage, they're scoped to this one generation.
    additions.forEach(ref => {
      fetch('/api/references/describe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ project_id: projectId, image: ref.dataUrl, hint: slotKey }),
      })
        .then(async r => {
          const j = await r.json().catch(() => ({}))
          if (!r.ok || !j.description) {
            throw new Error(j.error || `Describe failed (${r.status})`)
          }
          setRefImages(prev => prev.map(x =>
            x.id === ref.id ? { ...x, description: j.description, describing: false } : x
          ))
        })
        .catch(err => {
          setRefImages(prev => prev.map(x =>
            x.id === ref.id ? { ...x, describing: false, error: err.message || 'Describe failed' } : x
          ))
        })
    })
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
          custom_prompt:      customPrompt.trim() || undefined,
          custom_prompt_mode: customPrompt.trim() ? customPromptMode : undefined,
          // Symbol-only hints forwarded to /api/ai-single → buildPrompt.
          // Server ignores them for non-symbol asset types.
          symbol_frame: tier.isSymbol ? symbolFrame : undefined,
          symbol_color: tier.isSymbol && symbolColor ? symbolColor : undefined,
          // Label rendering on wild / scatter / specials only. Server
          // double-checks the category, but we gate here too so a stray
          // label state can't leak onto a high/low symbol.
          symbol_label: isLabelSymbol && symbolLabel.trim() ? symbolLabel.trim() : undefined,
          // Per-asset references — only ones whose describe succeeded.
          // In-flight / errored refs are dropped silently so an API hiccup
          // doesn't block generation.
          reference_descriptions: refImages
            .filter(r => r.description && !r.describing)
            .map(r => r.description),
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

        {/* ── Symbol controls (Part B) ──────────────────────────────────── */}
        {tier.isSymbol && (
          <Section
            title="Symbol"
            subtitle={
              tier.kind && tier.tier && tier.count
                ? `${tier.kind === 'high' ? 'High' : 'Low'} symbol tier ${tier.tier} of ${tier.count} · defaults shown`
                : undefined
            }
          >
            {/* Frame toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px',
              background: T.surfaceHigh,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              marginBottom: 8,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.textPrimary, fontWeight: 600 }}>
                  Ornate frame
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                  Symbol sits inside a decorative badge border
                </div>
              </div>
              <button
                onClick={() => setSymbolFrame(v => !v)}
                style={{
                  width: 36, height: 20, borderRadius: 10, position: 'relative',
                  background: symbolFrame ? 'rgba(201,168,76,.5)' : T.surface,
                  border: `1px solid ${symbolFrame ? 'rgba(201,168,76,.6)' : T.border}`,
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'background .15s',
                }}
                aria-label="Toggle ornate frame"
              >
                <div style={{
                  position: 'absolute',
                  top: 1, left: symbolFrame ? 16 : 1,
                  width: 16, height: 16, borderRadius: '50%',
                  background: symbolFrame ? T.gold : T.textFaint,
                  transition: 'left .15s, background .15s',
                }}/>
              </button>
            </div>

            {/* Tier-accent colour picker — swatches for the project's tier palette.
                Reworded from "Predominant colour" since the tier colour is now
                injected as an accent highlight that layers over the project
                palette, not a dominant hue that replaces it. */}
            {palette.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, color: T.textMuted, letterSpacing: '.06em',
                  textTransform: 'uppercase', marginBottom: 6,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                }}>
                  <span>Tier accent colour</span>
                  {symbolColor && symbolColor !== defaultColor && (
                    <button
                      onClick={() => setSymbolColor(defaultColor ?? '')}
                      style={{
                        background: 'transparent', border: 'none',
                        color: T.textMuted, cursor: 'pointer',
                        fontSize: 9, padding: 0, textTransform: 'none', letterSpacing: 0,
                      }}
                      title="Reset to tier default"
                    >
                      reset to default
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {palette.map(c => {
                    const swatch = COLOR_SWATCH_MAP[c] ?? '#888'
                    const active = symbolColor === c
                    const isDefault = c === defaultColor
                    return (
                      <button
                        key={c}
                        onClick={() => setSymbolColor(c)}
                        title={`${c}${isDefault ? ' (default for this tier)' : ''}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 8px 5px 5px', borderRadius: 18,
                          background: active ? 'rgba(201,168,76,.12)' : T.surfaceHigh,
                          border: `1px solid ${active ? 'rgba(201,168,76,.5)' : T.border}`,
                          cursor: 'pointer', fontFamily: T.font,
                        }}
                      >
                        <span style={{
                          width: 16, height: 16, borderRadius: '50%',
                          background: swatch, flexShrink: 0,
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.2)',
                        }}/>
                        <span style={{
                          fontSize: 10, color: active ? T.gold : T.textMuted,
                          fontWeight: 600,
                        }}>{c}</span>
                        {isDefault && (
                          <span style={{ fontSize: 8, color: T.textFaint, marginRight: 2 }}>
                            ⭑
                          </span>
                        )}
                      </button>
                    )
                  })}
                  {/* "None" option for users who want to leave colour unspecified */}
                  <button
                    onClick={() => setSymbolColor('')}
                    title="No predominant colour (let style + theme decide)"
                    style={{
                      padding: '5px 10px', borderRadius: 18,
                      background: !symbolColor ? 'rgba(201,168,76,.12)' : T.surfaceHigh,
                      border: `1px solid ${!symbolColor ? 'rgba(201,168,76,.5)' : T.border}`,
                      cursor: 'pointer', fontFamily: T.font,
                      fontSize: 10, color: !symbolColor ? T.gold : T.textMuted,
                      fontWeight: 600,
                    }}
                  >
                    none
                  </button>
                </div>
                {/* Footnote clarifying the role hierarchy so users who set a
                    project palette understand why 'none' was pre-selected. */}
                <div style={{
                  fontSize: 10, color: T.textFaint, lineHeight: 1.5,
                  marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6,
                }}>
                  <Info size={10} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Tier accent is a secondary highlight layered over the
                    project's colour palette — not a dominant hue.
                    {hasProjectPalette
                      ? ' Pre-set to "none" because a project palette is already active; pick a swatch if you want tier-specific distinguishing colour.'
                      : ' Default falls back to the tier\u00A0⭑ since no project palette is set.'}
                  </span>
                </div>
              </>
            )}
          </Section>
        )}

        {/* ── Symbol label (wild / scatter / specials only) ─────────────── */}
        {isLabelSymbol && (
          <Section
            title="Symbol label"
            subtitle={
              slotKey === 'symbol_wild'    ? 'text painted onto the wild icon — leave blank to skip' :
              slotKey === 'symbol_scatter' ? 'text painted onto the scatter icon — leave blank to skip' :
              'text painted onto the symbol — e.g. BONUS, MINI, MAJOR; leave blank to skip'
            }
          >
            <input
              type="text"
              value={symbolLabel}
              onChange={e => setSymbolLabel(e.target.value.slice(0, 20))}
              maxLength={20}
              placeholder={
                slotKey === 'symbol_wild'    ? 'WILD'    :
                slotKey === 'symbol_scatter' ? 'SCATTER' :
                'BONUS'
              }
              style={{
                width: '100%',
                padding: '8px 10px',
                background: T.surfaceHigh,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                color: T.textPrimary,
                fontSize: 13,
                fontFamily: "'DM Mono',monospace",
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                outline: 'none',
              }}
            />
            <div style={{
              fontSize: 10, color: T.textFaint, lineHeight: 1.5,
              marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <Info size={10} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Only wild, scatter and special symbols may carry rendered
                text — high / low symbols are always text-free and rely on
                their motif alone. Max&nbsp;20 characters; blank means no
                label (clean icon).
              </span>
            </div>
          </Section>
        )}

        {/* ── Reference images (per-asset) ──────────────────────────────
            Uploads stay in the popup. Each ref is sent to GPT-4o vision
            for a ~90-word aesthetic description; the description rides
            into this generation's prompt only (project-level references
            in Art → Inputs apply to every asset). 1 credit per describe. */}
        <Section
          title="Reference images"
          subtitle="Up to 3 · style only, not subject matter · 1 credit per ref"
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {refImages.map((ref, i) => (
              <div key={ref.id} style={{
                width: 72, height: 72, borderRadius: 6, overflow: 'hidden',
                background: T.surfaceHigh, border: `1px solid ${T.border}`,
                position: 'relative',
              }}
              title={
                ref.error ? `Describe failed: ${ref.error}` :
                ref.describing ? 'Analysing style…' :
                ref.description
              }
              >
                <img src={ref.dataUrl} alt="" style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  opacity: ref.describing ? 0.55 : 1,
                }} />
                {ref.describing && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: T.gold,
                  }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
                {ref.description && !ref.describing && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 4, background: T.green, opacity: 0.8,
                  }} title="Style analysed"/>
                )}
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
            display: 'flex', alignItems: 'flex-start', gap: 4, lineHeight: 1.5,
          }}>
            <Info size={10} style={{ marginTop: 2, flexShrink: 0 }}/>
            <span>
              References guide the aesthetic (palette, material, lighting)
              without copying the depicted subject. Scoped to this
              generation — for project-wide refs, use Art → Inputs → References.
            </span>
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

          {/* Merge-mode segmented control — only visible when there's
              actually custom text to merge. Default is 'append' (project
              identity + template + negatives stay active) unless an
              override was loaded from Review Prompts, in which case
              'replace' preserves the legacy full-override semantics. */}
          {customPrompt.trim() && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                display: 'flex', background: T.surfaceHigh,
                border: `1px solid ${T.border}`, borderRadius: 6,
                overflow: 'hidden',
              }}>
                {([
                  { id: 'append',  label: 'Add as context',  hint: 'Keeps project identity + template active' },
                  { id: 'replace', label: 'Replace whole prompt', hint: 'Bypasses layers 1–5, negatives still apply' },
                ] as const).map(mode => {
                  const active = customPromptMode === mode.id
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setCustomPromptMode(mode.id)}
                      title={mode.hint}
                      style={{
                        flex: 1, padding: '7px 10px', background: 'transparent',
                        border: 'none', cursor: 'pointer',
                        color: active ? T.gold : T.textMuted,
                        fontSize: 11, fontFamily: T.font,
                        fontWeight: active ? 700 : 500,
                        backgroundColor: active ? 'rgba(201,168,76,.12)' : 'transparent',
                      }}
                    >
                      {mode.label}
                    </button>
                  )
                })}
              </div>
              <div style={{
                fontSize: 10, color: T.textFaint, marginTop: 6, lineHeight: 1.5,
              }}>
                {customPromptMode === 'append'
                  ? 'Your text appears as an extra context line in §3.3; project style, template, differentiator, quality and negatives still fire.'
                  : 'Your text replaces the composed prompt entirely. Only the negative prompt remains active.'}
              </div>
            </div>
          )}
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
// Visible swatch hex for each named colour the server's TIER_COLORS_BY_COUNT
// table emits. Keep the keys in sync with promptBuilder.ts. The values are
// UI-only (affect only the swatch pill on-screen); the server prompt uses
// the colour NAME verbatim.
const COLOR_SWATCH_MAP: Record<string, string> = {
  'bright red':     '#dc2626',
  'magenta':        '#c026d3',
  'royal purple':   '#581c87',
  'warm orange':    '#ea580c',
  'bright gold':    '#ffd700',
  'emerald green':  '#059669',
  'teal':           '#0d9488',
  'deep navy':      '#0f1744',
}

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
