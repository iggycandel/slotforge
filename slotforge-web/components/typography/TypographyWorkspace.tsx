'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — TypographyWorkspace
//
// Port of the Type Forge prototype (see docs/typography/type-forge.html)
// into Spinative's workspace system. Hosted as a new editor tab (data-ws="typography")
// that replaces the canvas area the same way Art does. Core flow:
//
//   Inputs
//     • Existing project screenshots (auto-pulled via /api/generate — a
//       one-click chip per relevant asset: background_base, bonus, logo,
//       character)
//     • Fresh uploads (drag-drop / file picker) for screenshots not yet
//       generated
//     • Target locales (EN default; chips for the 9 we support)
//     • Game name (pre-filled from projectMeta.gameName)
//     • Freeform notes
//
//   Generate → POST /api/typography/generate (see app/api/typography/generate/route.ts)
//     Server handles: plan gate, credit consumption, OpenAI vision call,
//     JSON normalisation. We get back { spec, meta }.
//
//   Preview
//     Google Fonts for the chosen pairing loaded via <link>, per-style
//     cards with live sample text, language switcher pill bar.
//
//   Export
//     • Copy JSON          — clipboard
//     • Download .json     — TypographyBundle (see types/typography.ts)
//     • Download .html     — standalone doc mirroring the preview
//       (shareable with FE devs — includes font links, rendered samples,
//       full JSON embedded)
//
// Persistence (Commit 3) writes the latest spec to payload.typographySpec
// via a postMessage bridge so the workspace rehydrates on reopen.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Sparkles, Loader2, Upload, X, Copy, Download, FileText, Info,
  ChevronLeft, Check, AlertCircle,
} from 'lucide-react'
import type {
  FontPairing, TypographySpec, TypographyLocale, PopupStyle,
  PopupStyleKey, TypographyBundle,
} from '@/types/typography'
import { POPUP_STYLE_KEYS }                         from '@/types/typography'
import { FONT_LIBRARY, findPairing }                from '@/lib/typography/pairings'
import { SAMPLE_STRINGS, LOCALE_LABELS,
         SUPPORTED_LOCALES, applyCase }             from '@/lib/typography/sampleStrings'
import type { GeneratedAsset, AssetType }           from '@/types/assets'

// ─── Design tokens (match AssetsWorkspace) ──────────────────────────────────
const C = {
  bg:       '#06060a',
  surface:  '#13131a',
  surfHigh: '#1a1a24',
  surfInp:  '#0f0f14',
  border:   'rgba(255,255,255,.06)',
  borderMed:'rgba(255,255,255,.1)',
  borderHi: 'rgba(255,255,255,.18)',
  gold:     '#c9a84c',
  goldDim:  'rgba(201,168,76,.12)',
  goldLine: 'rgba(201,168,76,.3)',
  tx:       '#eeede6',
  txMid:    '#9a9aa2',
  txMuted:  '#7a7a8a',
  txFaint:  '#44445a',
  green:    '#34d399',
  red:      '#f87171',
  font:     "'Inter','Space Grotesk',system-ui,sans-serif",
} as const

const TOOLBAR_H = 44

// ─── Props ──────────────────────────────────────────────────────────────────
interface Props {
  projectId:       string
  projectName:     string
  /** Project meta forwarded from the editor. We only need gameName +
   *  themeKey for pre-fill; the rest is unused. Typed loose to avoid
   *  coupling. */
  projectMeta?:    Record<string, unknown>
  /** Initial spec to hydrate on mount — comes from
   *  `payload.typographySpec` in Commit 3. Lets the workspace show the
   *  last-generated result without a fresh API call. */
  initialSpec?:    TypographySpec | null
  /** Called when the user generates a new spec OR clears the current
   *  one. Commit 3 wires this to `SF_SAVE_TYPOGRAPHY` on the editor
   *  iframe so the spec lands in payload.typographySpec. Optional so
   *  the workspace stays testable in isolation. */
  onSpecChange?:   (spec: TypographySpec | null) => void
  /** Back button handler — same UX as AssetsWorkspace. */
  onBackToCanvas?: () => void
}

// ─── Input image state ──────────────────────────────────────────────────────
// Two sources share the same shape so the pipeline doesn't branch:
//   'asset' — already on CDN, send as https URL
//   'upload' — user-added file, send as data URL (base64)
interface InputImage {
  id:        string
  /** Where this image came from — affects the preview chip label and
   *  whether we can remove it (assets are one-click toggles, uploads
   *  have an explicit × button). */
  source:    'asset' | 'upload'
  /** Human label shown on the thumbnail chip ("Background", "Logo",
   *  "uploaded-1.png"). */
  label:     string
  /** URL fed to <img src>. For uploads this is a data URL; for assets
   *  it's the Supabase Storage public URL. OpenAI accepts either. */
  url:       string
  /** Only set for 'asset' source — lets us toggle off by original
   *  asset type key. */
  assetType?: string
}

// ─── Generation result ──────────────────────────────────────────────────────
interface GenerateResponse {
  spec?: TypographySpec
  meta?: { model?: string; usage?: { total_tokens?: number } }
  error?: string
  message?: string
  plan?: string
  remaining?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function TypographyWorkspace({
  projectId, projectName, projectMeta, initialSpec, onSpecChange, onBackToCanvas,
}: Props) {
  // ── Inputs ────────────────────────────────────────────────────────────────
  const [images, setImages] = useState<InputImage[]>([])
  const [locales, setLocales] = useState<TypographyLocale[]>(['en'])
  const [gameName, setGameName] = useState<string>(
    (projectMeta?.gameName as string | undefined) || projectName || ''
  )
  const [notes, setNotes] = useState<string>('')

  // ── Existing project assets (one-click add to input) ──────────────────────
  const [projectAssets, setProjectAssets] = useState<GeneratedAsset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)

  // ── Generation state ──────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [spec, setSpec] = useState<TypographySpec | null>(initialSpec ?? null)
  const [genMeta, setGenMeta] = useState<GenerateResponse['meta'] | null>(null)

  // ── Preview UI state ──────────────────────────────────────────────────────
  const [currentLang, setCurrentLang] = useState<TypographyLocale>('en')
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Keep language picker valid as spec changes ────────────────────────────
  // When a fresh spec comes in, snap currentLang to the first of its
  // supportedLocales. Avoids "selected lang not in spec" flashes.
  useEffect(() => {
    if (spec && !spec.supportedLocales.includes(currentLang)) {
      setCurrentLang(spec.supportedLocales[0] ?? 'en')
    }
  }, [spec, currentLang])

  // ── Fetch existing project assets on mount ────────────────────────────────
  // We surface a chip for each of the relevant asset types (bg, character,
  // logo) so the user can one-click add them as analysis inputs. Feature
  // slots are excluded — they're too fragmentary to drive a typography
  // read for the whole game.
  useEffect(() => {
    let cancelled = false
    setAssetsLoading(true)
    fetch(`/api/generate?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => {
        if (cancelled) return
        const list: GeneratedAsset[] = Array.isArray(d.assets) ? d.assets : []
        // Keep only the latest version per type (DB orders newest-first).
        const latest = new Map<string, GeneratedAsset>()
        for (const a of list) if (!latest.has(a.type)) latest.set(a.type, a)
        setProjectAssets(Array.from(latest.values()))
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setAssetsLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  // ── Quick-pick chips for project assets ───────────────────────────────────
  /** Asset types eligible for typography analysis — the game's "hero"
   *  visuals, not UI chrome or individual symbols. A user who wants to
   *  include a symbol can upload it manually. */
  const ELIGIBLE_TYPES: AssetType[] = useMemo(() => [
    'background_base', 'background_bonus', 'logo', 'character',
  ], [])
  const ELIGIBLE_LABELS: Record<string, string> = {
    background_base:  'Background',
    background_bonus: 'Bonus Background',
    logo:             'Logo',
    character:        'Character',
  }

  const eligibleAssets = useMemo(
    () => projectAssets.filter(a => (ELIGIBLE_TYPES as string[]).includes(a.type)),
    [projectAssets, ELIGIBLE_TYPES]
  )

  const toggleProjectAsset = useCallback((asset: GeneratedAsset) => {
    setImages(prev => {
      const existing = prev.find(i => i.assetType === asset.type)
      if (existing) return prev.filter(i => i.id !== existing.id)
      return [...prev, {
        id:        `asset-${asset.type}`,
        source:    'asset',
        label:     ELIGIBLE_LABELS[asset.type] ?? asset.type,
        url:       asset.url,
        assetType: asset.type,
      }]
    })
  }, [])

  const isAssetSelected = useCallback(
    (assetType: string) => images.some(i => i.assetType === assetType),
    [images]
  )

  // ── Upload handler (drag-drop or file picker) ─────────────────────────────
  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (arr.length === 0) return
    // Cap the total at 6 to match the API schema limit. Oldest uploads
    // stay; we reject the excess silently.
    Promise.all(arr.map(file => new Promise<InputImage>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve({
        id:     `up-${Math.random().toString(36).slice(2, 10)}`,
        source: 'upload',
        label:  file.name.slice(0, 24),
        url:    r.result as string,
      })
      r.onerror = reject
      r.readAsDataURL(file)
    }))).then(imgs => {
      setImages(prev => [...prev, ...imgs].slice(0, 6))
    }).catch(() => {/* ignore */})
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages(prev => prev.filter(i => i.id !== id))
  }, [])

  // ── Locale toggle ─────────────────────────────────────────────────────────
  const toggleLocale = useCallback((l: TypographyLocale) => {
    setLocales(prev => prev.includes(l)
      ? prev.filter(x => x !== l)
      : [...prev, l])
  }, [])

  // ── Generate ──────────────────────────────────────────────────────────────
  const readyToGenerate = images.length > 0 && locales.length > 0 && !generating

  const handleGenerate = useCallback(async () => {
    if (!readyToGenerate) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/typography/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          project_id: projectId,
          images:     images.map(i => i.url),
          locales,
          game_name:  gameName.trim() || undefined,
          notes:      notes.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as GenerateResponse
      if (!res.ok || !data.spec) {
        throw new Error(data.message || data.error || `Generation failed (${res.status})`)
      }
      setSpec(data.spec)
      setGenMeta(data.meta ?? null)
      setCurrentLang(data.spec.supportedLocales[0] ?? 'en')
      onSpecChange?.(data.spec)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }, [readyToGenerate, projectId, images, locales, gameName, notes, onSpecChange])

  // ── Pairing + font loading ────────────────────────────────────────────────
  const pairing: FontPairing | null = useMemo(
    () => spec ? findPairing(spec.pairingId) : null,
    [spec]
  )

  // Inject a <link> tag for the pairing's Google Fonts the moment a spec
  // lands. Replaces any previous pairing's link so we don't accumulate.
  useEffect(() => {
    if (!pairing) return
    const LINK_ID = 'sf-typography-pairing-fonts'
    document.getElementById(LINK_ID)?.remove()
    const toSpec = (f: FontPairing['display']) =>
      `${f.family.replace(/ /g, '+')}:wght@${f.weights.join(';')}`
    const url = `https://fonts.googleapis.com/css2?family=${toSpec(pairing.display)}&family=${toSpec(pairing.ui)}&display=swap`
    const link = document.createElement('link')
    link.id = LINK_ID
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
  }, [pairing])

  // ── Copy / download helpers ──────────────────────────────────────────────
  function buildBundle(): TypographyBundle | null {
    if (!spec || !pairing) return null
    return {
      meta: {
        generatedAt:      new Date().toISOString(),
        gameTitle:        spec.gameTitle,
        rationale:        spec.rationale,
        supportedLocales: spec.supportedLocales,
      },
      fonts: {
        display: { id: 'display', family: pairing.display.family, weights: pairing.display.weights,
                   fallback: ['Impact', 'sans-serif'], source: 'google', license: 'OFL-1.1' },
        ui:      { id: 'ui',      family: pairing.ui.family,      weights: pairing.ui.weights,
                   fallback: ['Rajdhani', 'sans-serif'], source: 'google', license: 'OFL-1.1' },
      },
      popupTextStyles: {
        scope:            'popups',
        baseResolution:   spec.baseResolution,
        supportedLocales: spec.supportedLocales,
        styles:           spec.styles,
      },
    }
  }

  function copy(key: string, text: string) {
    if (!text) return
    navigator.clipboard?.writeText(text)
    setCopiedLabel(key)
    setTimeout(() => setCopiedLabel(prev => prev === key ? null : prev), 1500)
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  function slug(s: string) {
    return (s || 'typography').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  const downloadJson = () => {
    const bundle = buildBundle(); if (!bundle) return
    download(
      new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
      `${slug(spec?.gameTitle || projectName)}-typography.json`
    )
  }
  const copyJson = () => {
    const bundle = buildBundle(); if (!bundle) return
    copy('json', JSON.stringify(bundle, null, 2))
  }
  const downloadHtml = () => {
    if (!spec || !pairing) return
    const html = buildStandaloneHtml(spec, pairing)
    download(
      new Blob([html], { type: 'text/html' }),
      `${slug(spec.gameTitle || projectName)}-typography.html`
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      flex:      1, overflow: 'auto',
      background: C.bg, color: C.tx,
      fontFamily: C.font,
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 28px 120px' }}>

        {/* ── Toolbar (back to canvas) ──────────────────────────────────── */}
        {onBackToCanvas && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={onBackToCanvas}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', background: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: 6,
                color: C.txMuted, fontSize: 12, cursor: 'pointer',
                fontFamily: C.font,
              }}
            >
              <ChevronLeft size={12} />
              Back to Flow
            </button>
          </div>
        )}

        {/* ── Header ────────────────────────────────────────────────────── */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingBottom: 20, borderBottom: `1px solid ${C.border}`, marginBottom: 32,
        }}>
          <div>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
            }}>
              <span style={{ fontSize: 22, color: C.gold, fontStyle: 'italic',
                             fontFamily: "'Instrument Serif','Playfair Display',serif" }}>
                T
              </span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Typography</span>
              <span style={{ width: 3, height: 3, borderRadius: 2, background: C.txFaint }} />
              <span style={{ fontSize: 11, color: C.txMuted, letterSpacing: '.02em' }}>
                Font pairing from game art
              </span>
            </div>
          </div>
        </header>

        {/* ── Intro ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 32, maxWidth: 560 }}>
          <h1 style={{
            fontSize: 26, fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.02em',
            fontFamily: "'Instrument Serif','Playfair Display',serif",
            marginBottom: 8,
          }}>
            Generate a typography spec from your <em style={{ color: C.gold, fontStyle: 'italic' }}>game art</em>.
          </h1>
          <p style={{ fontSize: 13, color: C.txMid, lineHeight: 1.55 }}>
            Pick screenshots from this project or upload new ones. We identify the
            aesthetic, pick a font pairing verified across your locales, and return
            a full six-style JSON spec ready for your front-end team.
          </p>
        </div>

        {/* ── Inputs: existing project assets ───────────────────────────── */}
        <Field label="Screenshots from this project">
          {assetsLoading && eligibleAssets.length === 0 ? (
            <div style={{ fontSize: 11, color: C.txMuted }}>Loading project assets…</div>
          ) : eligibleAssets.length === 0 ? (
            <div style={{
              padding: '10px 12px', background: C.surfHigh,
              border: `1px dashed ${C.borderMed}`, borderRadius: 6,
              fontSize: 11, color: C.txMuted, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Info size={11} />
              No backgrounds / logo / character assets yet — generate some in the Art workspace, or upload screenshots below.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {eligibleAssets.map(asset => {
                const label = ELIGIBLE_LABELS[asset.type] ?? asset.type
                const selected = isAssetSelected(asset.type)
                return (
                  <button
                    key={asset.type}
                    onClick={() => toggleProjectAsset(asset)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: 4, paddingRight: 12,
                      background: selected ? C.goldDim : C.surfHigh,
                      border: `1px solid ${selected ? C.goldLine : C.border}`,
                      borderRadius: 8, cursor: 'pointer',
                      fontFamily: C.font,
                    }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 4,
                      background: C.bg, overflow: 'hidden', flexShrink: 0,
                    }}>
                      <img src={asset.url} alt="" style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                      }}/>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: selected ? C.gold : C.tx,
                      }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 9, color: C.txMuted, letterSpacing: '.04em' }}>
                        {selected ? '✓ included' : 'click to add'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Field>

        {/* ── Inputs: drag-drop uploads ─────────────────────────────────── */}
        <Field label="Or upload new screenshots">
          <UploadZone
            onFiles={handleFiles}
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />

          {images.filter(i => i.source === 'upload').length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))',
              gap: 6, marginTop: 10,
            }}>
              {images.filter(i => i.source === 'upload').map(img => (
                <div key={img.id} style={{
                  position: 'relative', aspectRatio: '16/10',
                  borderRadius: 6, overflow: 'hidden',
                  background: C.surfHigh, border: `1px solid ${C.border}`,
                }}>
                  <img src={img.url} alt="" style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                  }}/>
                  <button
                    onClick={() => removeImage(img.id)}
                    aria-label="Remove"
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'rgba(0,0,0,.7)', color: '#fff',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10,
                    }}
                  ><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </Field>

        {/* ── Locales ───────────────────────────────────────────────────── */}
        <Field label="Languages">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SUPPORTED_LOCALES.map(l => {
              const on = locales.includes(l)
              return (
                <button
                  key={l}
                  onClick={() => toggleLocale(l)}
                  style={{
                    padding: '5px 11px', borderRadius: 999,
                    background: on ? C.goldDim : C.surfHigh,
                    border: `1px solid ${on ? C.goldLine : C.border}`,
                    color:  on ? C.gold : C.txMuted,
                    fontSize: 11, fontFamily: C.font, cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {LOCALE_LABELS[l]}
                </button>
              )
            })}
          </div>
        </Field>

        {/* ── Game name + notes ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <InputGroup label="Game name" optional>
            <input
              type="text"
              value={gameName}
              onChange={e => setGameName(e.target.value)}
              maxLength={120}
              placeholder={projectName || 'Neon Starfall'}
              style={inputStyle}
            />
          </InputGroup>
          <InputGroup label="Notes for the model" optional>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Volatility tier, brand cues, specific style direction…"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
            />
          </InputGroup>
        </div>

        {/* ── Generate bar ──────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 20, borderTop: `1px solid ${C.border}`, marginTop: 24,
        }}>
          <div style={{ fontSize: 11, color: C.txMuted }}>
            {images.length === 0 ? 'No screenshots yet' :
             images.length === 1 ? '1 screenshot' : `${images.length} screenshots`}
            {' · '}
            {locales.length === 1 ? '1 language' : `${locales.length} languages`}
            {' · 1 credit'}
          </div>
          <button
            onClick={handleGenerate}
            disabled={!readyToGenerate}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 6,
              background: readyToGenerate ? C.tx : C.surfHigh,
              color: readyToGenerate ? C.bg : C.txFaint,
              border: `1px solid ${readyToGenerate ? C.tx : C.border}`,
              fontSize: 13, fontWeight: 600, fontFamily: C.font,
              cursor: readyToGenerate ? 'pointer' : 'not-allowed',
            }}
          >
            {generating
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analysing…</>
              : <><Sparkles size={13} /> Generate</>}
          </button>
        </div>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {error && (
          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'rgba(248,113,113,.08)',
            border: '1px solid rgba(248,113,113,.3)',
            borderRadius: 6, color: C.red, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={13} />
            {error}
          </div>
        )}

        {/* ── Result ───────────────────────────────────────────────────── */}
        {spec && pairing && (
          <ResultBlock
            spec={spec}
            pairing={pairing}
            genMeta={genMeta}
            currentLang={currentLang}
            setCurrentLang={setCurrentLang}
            copiedLabel={copiedLabel}
            onCopyJson={copyJson}
            onDownloadJson={downloadJson}
            onDownloadHtml={downloadHtml}
          />
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
               @keyframes sampleTypoPulse { 0%,100% { opacity: 0.65 } 50% { opacity: 1 } }`}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '.14em',
        textTransform: 'uppercase', color: C.txMuted, marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function InputGroup({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 10, fontWeight: 500,
        letterSpacing: '.14em', textTransform: 'uppercase',
        color: C.txMuted, marginBottom: 6,
      }}>
        {label}
        {optional && <span style={{
          color: C.txFaint, fontWeight: 400, marginLeft: 4,
          textTransform: 'none', letterSpacing: 0,
        }}>optional</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  background: C.surfInp,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.tx,
  fontSize: 12,
  fontFamily: C.font,
  outline: 'none',
  lineHeight: 1.5,
}

function UploadZone({ onFiles, onClick }: { onFiles: (f: FileList | File[]) => void; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onDragEnter={e => { e.preventDefault(); setHover(true) }}
      onDragOver={e => { e.preventDefault(); setHover(true) }}
      onDragLeave={e => { e.preventDefault(); setHover(false) }}
      onDrop={e => {
        e.preventDefault(); setHover(false)
        if (e.dataTransfer.files) onFiles(e.dataTransfer.files)
      }}
      style={{
        padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
        background: hover ? C.surface : C.surfHigh,
        border: `1px dashed ${hover ? C.borderHi : C.borderMed}`,
        borderRadius: 8,
        transition: 'all 120ms ease',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: C.tx, marginBottom: 4 }}>
        Drop images here
      </div>
      <div style={{ fontSize: 11, color: C.txMuted }}>
        or click to browse — PNG, JPG, WebP
      </div>
    </div>
  )
}

// ─── Result panel ────────────────────────────────────────────────────────────

function ResultBlock({
  spec, pairing, genMeta, currentLang, setCurrentLang,
  copiedLabel, onCopyJson, onDownloadJson, onDownloadHtml,
}: {
  spec: TypographySpec
  pairing: FontPairing
  genMeta: GenerateResponse['meta'] | null
  currentLang: TypographyLocale
  setCurrentLang: (l: TypographyLocale) => void
  copiedLabel: string | null
  onCopyJson: () => void
  onDownloadJson: () => void
  onDownloadHtml: () => void
}) {
  return (
    <div style={{ marginTop: 56 }}>
      {/* ── Result header ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 20, flexWrap: 'wrap', paddingBottom: 16,
        borderBottom: `1px solid ${C.border}`, marginBottom: 28,
      }}>
        <div>
          <h2 style={{
            fontSize: 24, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.015em',
            fontFamily: "'Instrument Serif','Playfair Display',serif",
            color: C.tx, marginBottom: 6,
          }}>
            {spec.gameTitle || 'Typography Spec'}
          </h2>
          <div style={{ fontSize: 11, color: C.txMuted, letterSpacing: '.02em' }}>
            Generated {new Date().toLocaleString()}
            {genMeta?.model && ` · ${genMeta.model}`}
            {genMeta?.usage?.total_tokens != null && ` · ${genMeta.usage.total_tokens.toLocaleString()} tokens`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <GhostButton onClick={onCopyJson} icon={copiedLabel === 'json' ? <Check size={11} /> : <Copy size={11} />}>
            {copiedLabel === 'json' ? 'Copied' : 'Copy JSON'}
          </GhostButton>
          <GhostButton onClick={onDownloadJson} icon={<Download size={11} />}>
            .json
          </GhostButton>
          <GhostButton onClick={onDownloadHtml} icon={<FileText size={11} />}>
            .html
          </GhostButton>
        </div>
      </div>

      {/* ── Pairing ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel>Pairing</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <span style={{
            fontSize: 20, color: C.gold, fontStyle: 'italic',
            fontFamily: "'Instrument Serif','Playfair Display',serif",
          }}>
            {pairing.name}
          </span>
          <span style={{ fontSize: 11, color: C.txMuted, fontFamily: "'DM Mono',monospace" }}>
            {pairing.display.family} + {pairing.ui.family}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.txMid, marginBottom: 14 }}>
          {pairing.description}
        </div>
        {spec.rationale && (
          <div style={{
            fontSize: 13, color: C.tx, lineHeight: 1.6,
            paddingTop: 12, borderTop: `1px solid ${C.border}`, maxWidth: 640,
          }}>
            {spec.rationale}
          </div>
        )}
      </div>

      {/* ── Language switcher ─────────────────────────────────────────── */}
      <SectionLabel>Preview</SectionLabel>
      <div style={{
        display: 'flex', gap: 3, padding: 3,
        background: C.surfHigh, border: `1px solid ${C.border}`,
        borderRadius: 8, marginBottom: 20, width: 'fit-content',
      }}>
        {spec.supportedLocales.map(l => {
          const active = l === currentLang
          return (
            <button
              key={l}
              onClick={() => setCurrentLang(l)}
              style={{
                padding: '6px 12px', background: active ? C.surface : 'transparent',
                border: 'none', borderRadius: 5,
                color: active ? C.tx : C.txMuted,
                fontSize: 11, fontWeight: 500, fontFamily: C.font, cursor: 'pointer',
              }}
            >
              {LOCALE_LABELS[l]}
            </button>
          )
        })}
      </div>

      {/* ── Style cards ───────────────────────────────────────────────── */}
      <div>
        {POPUP_STYLE_KEYS.map(key => (
          <StyleCard
            key={key}
            styleKey={key}
            style={spec.styles[key]}
            pairing={pairing}
            currentLang={currentLang}
          />
        ))}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 500, letterSpacing: '.14em',
      textTransform: 'uppercase', color: C.txMuted, marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

function GhostButton({
  onClick, icon, children,
}: { onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '7px 12px',
        background: 'transparent',
        border: `1px solid ${C.borderMed}`,
        borderRadius: 6,
        color: C.txMid,
        fontSize: 11, fontWeight: 500, fontFamily: C.font, cursor: 'pointer',
      }}
    >
      {icon}
      {children}
    </button>
  )
}

// ─── Style card — JSON on the left, live sample on the right ─────────────────

const ROLE_BY_KEY: Record<PopupStyleKey, keyof typeof SAMPLE_STRINGS['en']> = {
  'popup.title':      'title',
  'popup.subtitle':   'subtitle',
  'popup.cta':        'cta',
  'popup.body':       'body',
  'popup.numeric':    'numeric',
  'popup.smallLabel': 'smallLabel',
}

const FONT_BY_KEY: Record<PopupStyleKey, 'display' | 'ui'> = {
  'popup.title':      'display',
  'popup.subtitle':   'ui',
  'popup.cta':        'ui',
  'popup.body':       'ui',
  'popup.numeric':    'display',
  'popup.smallLabel': 'ui',
}

function StyleCard({
  styleKey, style, pairing, currentLang,
}: {
  styleKey: PopupStyleKey
  style:    PopupStyle
  pairing:  FontPairing
  currentLang: TypographyLocale
}) {
  const font = pairing[FONT_BY_KEY[styleKey]]

  return (
    <div style={{
      padding: '20px 0', borderTop: `1px solid ${C.border}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, fontFamily: "'DM Mono',monospace" }}>
          {styleKey}
        </div>
        <div style={{ fontSize: 11, color: C.txMuted }}>
          {font.family} · {style.size}px
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14,
      }}>
        <JsonBlock json={{ [styleKey]: style }} />
        <SampleStage styleKey={styleKey} style={style} font={font} currentLang={currentLang} />
      </div>
    </div>
  )
}

function JsonBlock({ json }: { json: Record<string, unknown> }) {
  const str = JSON.stringify(json, null, 2)
  const html = str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span style="color:#eeede6">"$1"</span>:')
    .replace(/: (".*?")/g, ': <span style="color:#c9a84c">$1</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span style="color:#b5c9d9">$1</span>')
    .replace(/: (true|false|null)/g, ': <span style="color:#b5c9d9">$1</span>')
  return (
    <pre style={{
      background: C.surfInp, border: `1px solid ${C.border}`,
      borderRadius: 6, padding: '12px 14px', margin: 0,
      fontFamily: "'DM Mono',monospace", fontSize: 11, lineHeight: 1.65,
      color: C.txMuted, overflow: 'auto', maxHeight: 340,
    }} dangerouslySetInnerHTML={{ __html: html }} />
  )
}

function SampleStage({
  styleKey, style, font, currentLang,
}: {
  styleKey: PopupStyleKey
  style:    PopupStyle
  font:     { family: string; weights: number[] }
  currentLang: TypographyLocale
}) {
  const samples = SAMPLE_STRINGS[currentLang] ?? SAMPLE_STRINGS.en
  const rawText = samples[ROLE_BY_KEY[styleKey]]
  const text = applyCase(rawText, style.case, currentLang)

  // Per-locale overrides (letterSpacing / size bumps for long translations)
  const override = style.localeOverrides?.[currentLang] ?? {}
  const size = override.size ?? style.size
  const letterSpacing = override.letterSpacing ?? style.letterSpacing ?? 0

  // Pick a weight that suits the role — display fonts get their first
  // declared weight; UI fonts prefer 600 when available.
  const isDisplay = FONT_BY_KEY[styleKey] === 'display'
  const weight = isDisplay ? font.weights[0]
              : (font.weights.includes(600) ? 600 : font.weights[0])

  // Scale to 55% so all six cards fit the grid comfortably — real
  // runtime sizes are baseResolution-relative.
  const scaledSize = Math.round(size * 0.55)

  const innerStyle: React.CSSProperties = {
    fontFamily: `'${font.family}', sans-serif`,
    fontWeight: weight,
    fontSize: `${scaledSize}px`,
    letterSpacing: `${letterSpacing}em`,
    lineHeight: style.lineHeight ?? 1,
  }

  if (style.fillGradient?.length) {
    const stops = style.fillGradient
      .map((c, i, a) => `${c} ${Math.round((i / (a.length - 1)) * 100)}%`)
      .join(', ')
    Object.assign(innerStyle, {
      background: `linear-gradient(180deg, ${stops})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    })
  } else if (style.fillColor) {
    innerStyle.color = style.fillColor
  }

  const filters: string[] = []
  if (style.dropShadow) {
    const ds = style.dropShadow
    filters.push(
      `drop-shadow(${ds.offsetX ?? 0}px ${ds.offsetY ?? 2}px ${ds.blur ?? 3}px ${hexToRgba(ds.color ?? '#000000', ds.alpha ?? 0.85)})`
    )
  }
  ;(style.glow ?? []).forEach(g => {
    filters.push(
      `drop-shadow(${g.offsetX ?? 0}px ${g.offsetY ?? 0}px ${g.blur}px ${hexToRgba(g.color, g.alpha ?? 1)})`
    )
  })
  if (filters.length) innerStyle.filter = filters.join(' ')

  if (style.animation?.type === 'pulseAlpha') {
    innerStyle.animation = `sampleTypoPulse ${style.animation.durationMs ?? 1600}ms ease-in-out infinite`
  }

  // Moody gradient stage derived from the style's own colours.
  const accent = style.glow?.[0]?.color
             ?? style.fillGradient?.[style.fillGradient.length - 1]
             ?? style.fillColor
             ?? '#444466'
  const bg = `radial-gradient(ellipse at 50% 120%, ${hexToRgba(accent, 0.22)} 0%, transparent 55%), ` +
             `linear-gradient(180deg, ${darken(accent, 0.88)} 0%, ${darken(accent, 0.78)} 100%)`

  return (
    <div style={{
      aspectRatio: '16/10', borderRadius: 6, overflow: 'hidden',
      display: 'grid', placeItems: 'center',
      padding: '6% 5%', textAlign: 'center',
      border: `1px solid ${C.border}`,
      background: bg,
    }}>
      <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
        <div style={innerStyle}>{text}</div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return hex
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function darken(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return hex
  const r = Math.round(parseInt(h.substring(0, 2), 16) * (1 - amount))
  const g = Math.round(parseInt(h.substring(2, 4), 16) * (1 - amount))
  const b = Math.round(parseInt(h.substring(4, 6), 16) * (1 - amount))
  return `rgb(${r},${g},${b})`
}

// ─── Standalone HTML export ─────────────────────────────────────────────────
// Self-contained doc with:
//   • Google Fonts <link> for the pairing
//   • Per-style cards with rendered sample text for every locale
//   • Language switcher (vanilla JS, toggles display:none per locale)
//   • Full JSON embedded at the bottom
// Designed to be shared with FE devs — they can preview in any browser
// and lift the JSON straight into their runtime.

function buildStandaloneHtml(spec: TypographySpec, pairing: FontPairing): string {
  const escape = (s: string) => String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string
  ))

  const toSpec = (f: FontPairing['display']) =>
    `${f.family.replace(/ /g, '+')}:wght@${f.weights.join(';')}`
  const fontUrl = `https://fonts.googleapis.com/css2?family=${toSpec(pairing.display)}` +
                  `&family=${toSpec(pairing.ui)}` +
                  `&family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono&display=swap`

  const bundle: TypographyBundle = {
    meta: {
      generatedAt:      new Date().toISOString(),
      gameTitle:        spec.gameTitle,
      rationale:        spec.rationale,
      supportedLocales: spec.supportedLocales,
    },
    fonts: {
      display: { id: 'display', family: pairing.display.family, weights: pairing.display.weights,
                 fallback: ['Impact', 'sans-serif'], source: 'google', license: 'OFL-1.1' },
      ui:      { id: 'ui',      family: pairing.ui.family,      weights: pairing.ui.weights,
                 fallback: ['Rajdhani', 'sans-serif'], source: 'google', license: 'OFL-1.1' },
    },
    popupTextStyles: {
      scope:            'popups',
      baseResolution:   spec.baseResolution,
      supportedLocales: spec.supportedLocales,
      styles:           spec.styles,
    },
  }

  const renderStyleCard = (key: PopupStyleKey): string => {
    const st = spec.styles[key]
    if (!st) return ''
    const font = pairing[FONT_BY_KEY[key]]
    const isDisplay = FONT_BY_KEY[key] === 'display'
    const weight = isDisplay ? font.weights[0]
                : (font.weights.includes(600) ? 600 : font.weights[0])

    const samples = spec.supportedLocales.map(loc => {
      const s = SAMPLE_STRINGS[loc] ?? SAMPLE_STRINGS.en
      const text = applyCase(s[ROLE_BY_KEY[key]], st.case, loc)
      const override = st.localeOverrides?.[loc] ?? {}
      const size = Math.round((override.size ?? st.size) * 0.55)
      const letterSpacing = override.letterSpacing ?? st.letterSpacing ?? 0

      let inline = `font-family:'${font.family}',sans-serif;font-weight:${weight};` +
                   `font-size:${size}px;letter-spacing:${letterSpacing}em;line-height:${st.lineHeight ?? 1};`
      if (st.fillGradient?.length) {
        const stops = st.fillGradient.map((c, i, a) => `${c} ${Math.round((i/(a.length-1))*100)}%`).join(', ')
        inline += `background:linear-gradient(180deg,${stops});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;`
      } else if (st.fillColor) {
        inline += `color:${st.fillColor};`
      }
      const filters: string[] = []
      if (st.dropShadow) filters.push(
        `drop-shadow(${st.dropShadow.offsetX ?? 0}px ${st.dropShadow.offsetY ?? 2}px ${st.dropShadow.blur ?? 3}px ${hexToRgba(st.dropShadow.color ?? '#000', st.dropShadow.alpha ?? 0.85)})`
      )
      ;(st.glow ?? []).forEach(g => filters.push(
        `drop-shadow(${g.offsetX ?? 0}px ${g.offsetY ?? 0}px ${g.blur}px ${hexToRgba(g.color, g.alpha ?? 1)})`
      ))
      if (filters.length) inline += `filter:${filters.join(' ')};`
      if (st.animation?.type === 'pulseAlpha') inline += `animation:samplePulse ${st.animation.durationMs ?? 1600}ms ease-in-out infinite;`

      return `<div class="sample" data-lang="${loc}" style="display:${loc === spec.supportedLocales[0] ? 'block' : 'none'}">` +
             `<div style="${inline}">${escape(text)}</div></div>`
    }).join('')

    const accent = st.glow?.[0]?.color
                ?? st.fillGradient?.[st.fillGradient.length - 1]
                ?? st.fillColor
                ?? '#444466'
    const stageBg = `radial-gradient(ellipse at 50% 120%, ${hexToRgba(accent, 0.22)} 0%, transparent 55%),` +
                    `linear-gradient(180deg, ${darken(accent, 0.88)} 0%, ${darken(accent, 0.78)} 100%)`

    return `
    <div class="style-card">
      <div class="style-card-head">
        <div class="style-card-title">${key}</div>
        <div class="style-card-sub">${escape(font.family)} · ${st.size}px</div>
      </div>
      <div class="style-row">
        <pre class="json">${escape(JSON.stringify({ [key]: st }, null, 2))}</pre>
        <div class="sample-stage" style="background:${stageBg}">${samples}</div>
      </div>
    </div>`
  }

  const styleCardsHtml = POPUP_STYLE_KEYS.map(renderStyleCard).join('')
  const langButtons = spec.supportedLocales.map((l, i) =>
    `<button class="lang-pill ${i === 0 ? 'active' : ''}" data-lang="${l}">${escape(LOCALE_LABELS[l])}</button>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${escape(spec.gameTitle || 'Typography Spec')}</title>
<link rel="stylesheet" href="${fontUrl}">
<style>
:root{--bg:#06060a;--bg-raised:#13131a;--bg-input:#0f0f14;--line:rgba(255,255,255,0.06);--line-strong:rgba(255,255,255,0.1);--text:#eeede6;--text-mid:#9a9aa2;--text-dim:#7a7a8a;--text-faint:#44445a;--accent:#c9a84c;--accent-dim:rgba(201,168,76,.12);--accent-line:rgba(201,168,76,.3)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;font-size:14px;line-height:1.5;letter-spacing:-0.005em;-webkit-font-smoothing:antialiased;padding:48px 28px 96px}
.wrap{max-width:1060px;margin:0 auto}
h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:28px;line-height:1.1;letter-spacing:-0.02em;margin-bottom:6px}
.meta{font-size:11px;color:var(--text-dim);letter-spacing:.02em;margin-bottom:32px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.section-label{font-size:10px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim);margin-bottom:12px}
.pairing{margin-bottom:36px}
.pairing-head{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}
.pairing-name{font-family:'Instrument Serif',serif;font-style:italic;font-size:20px;color:var(--accent);line-height:1.2}
.pairing-fams{font-size:11px;color:var(--text-dim);font-family:'JetBrains Mono',monospace}
.pairing-desc{font-size:12px;color:var(--text-mid);margin-bottom:14px}
.rationale{font-size:13px;color:var(--text);line-height:1.6;padding-top:12px;border-top:1px solid var(--line);max-width:640px}
.lang-bar{display:flex;gap:3px;padding:3px;background:var(--bg-raised);border:1px solid var(--line);border-radius:8px;margin-bottom:20px;width:fit-content}
.lang-pill{background:transparent;border:none;color:var(--text-dim);font-family:inherit;font-size:11px;font-weight:500;padding:6px 12px;border-radius:5px;cursor:pointer}
.lang-pill.active{background:#1a1a24;color:var(--text)}
.style-card{padding:20px 0;border-top:1px solid var(--line)}
.style-card:last-of-type{border-bottom:1px solid var(--line)}
.style-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.style-card-title{font-size:12px;font-weight:600;color:var(--text);font-family:'JetBrains Mono',monospace}
.style-card-sub{font-size:11px;color:var(--text-dim)}
.style-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
@media(max-width:780px){.style-row{grid-template-columns:1fr}}
pre.json{background:var(--bg-input);border:1px solid var(--line);border-radius:6px;padding:12px 14px;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.65;color:var(--text-mid);overflow:auto;max-height:340px;margin:0;white-space:pre-wrap}
.sample-stage{position:relative;aspect-ratio:16/10;border-radius:6px;overflow:hidden;display:grid;place-items:center;padding:6% 5%;text-align:center;border:1px solid var(--line)}
.full-json-block{margin-top:44px}
.full-json-block h3{font-size:10px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim);margin-bottom:12px}
@keyframes samplePulse{0%,100%{opacity:.65}50%{opacity:1}}
</style></head>
<body><div class="wrap">
  <h1>${escape(spec.gameTitle || 'Typography Spec')}</h1>
  <div class="meta">Generated ${new Date().toLocaleString()}</div>

  <div class="pairing">
    <div class="section-label">Pairing</div>
    <div class="pairing-head">
      <div class="pairing-name">${escape(pairing.name)}</div>
      <div class="pairing-fams">${escape(pairing.display.family)} + ${escape(pairing.ui.family)}</div>
    </div>
    <div class="pairing-desc">${escape(pairing.description)}</div>
    ${spec.rationale ? `<div class="rationale">${escape(spec.rationale)}</div>` : ''}
  </div>

  <div class="section-label">Preview</div>
  <div class="lang-bar">${langButtons}</div>
  ${styleCardsHtml}

  <div class="full-json-block">
    <h3>Full JSON</h3>
    <pre class="json">${escape(JSON.stringify(bundle, null, 2))}</pre>
  </div>
</div>
<script>
  document.querySelectorAll('.lang-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const lang = btn.dataset.lang;
      document.querySelectorAll('.sample').forEach(el => {
        el.style.display = el.dataset.lang === lang ? 'block' : 'none';
      });
    });
  });
<\/script>
</body></html>`
}
