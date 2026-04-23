'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — PromptInputsPanel
//
// Consolidated "every field that affects the AI prompt, in one editable
// place" panel for the Art workspace.  The same values used to live in
// Project Settings (full-screen overlay inside the editor iframe) — users
// would leave the Art workspace, tweak a setting, come back, and hope they
// remembered it. Now they can see and edit everything without leaving the
// context where they'll generate.
//
// Fields shown here mirror what buildPrompt / buildFeatureSlotPrompt in
// lib/ai/promptBuilder.ts actually consume:
//   Identity         — game name, theme
//   Style            — styleId (from the expanded 14-style bench)
//   Palette          — colorPrimary/Bg/Accent (named at prompt time)
//   World & Tone     — setting, story, mood, bonus narrative
//   Art direction    — art notes, art reference (text)
//   Symbol names     — per-tier, warning when empty (generations go generic)
//
// Every edit dispatches onChange(nextMeta) which the workspace forwards to
// the iframe via SF_UPDATE_META (editor.js applies to P + DOM) so autosave
// persists the change and buildPrompt picks it up on the next generation.
//
// Reference images land in Commit 3 of this cleanup — a placeholder slot
// in the References section is hidden until that lands.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Info,
         Upload, X, Loader2, Image as ImageIcon } from 'lucide-react'
import { GRAPHIC_STYLES }                     from '@/lib/ai/styles'
import { StyleIcon }                           from '@/components/generate/StyleIcon'

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
  amber:    '#fbbf24',
  font:     "'Inter','Space Grotesk',system-ui,sans-serif",
} as const

// ─── Prop-shape of the meta the panel edits ─────────────────────────────────
// Loose shape — matches what editor.js collectMeta() emits. Optional because
// projects pre-metadata may omit fields. The panel survives missing keys by
// rendering empty inputs.

export interface PromptInputsMeta {
  gameName?:            string
  themeKey?:            string
  styleId?:             string
  /** Legacy mirror of styleId — we write BOTH so older editor.js paths stay
   *  happy, but present only styleId in the UI. */
  artStyle?:            string
  colorPrimary?:        string
  colorBg?:             string
  colorAccent?:         string
  /** Matching boolean toggles — when false, the colour is "inactive" and
   *  promptBuilder skips it. Stored on P.colors in the iframe as t1/t2/t3. */
  colorPrimaryOn?:      boolean
  colorBgOn?:           boolean
  colorAccentOn?:       boolean
  setting?:             string
  story?:               string
  mood?:                string
  bonusNarrative?:      string
  artRef?:              string
  artNotes?:            string
  symbolHighCount?:     number
  symbolLowCount?:      number
  symbolSpecialCount?:  number
  symbolHighNames?:     string[]
  symbolLowNames?:      string[]
  symbolSpecialNames?:  string[]
  /** Uploaded reference images + their GPT-4o-generated STYLE descriptions.
   *  See types/assets.ts → ProjectMeta.artRefImages for the source-of-truth
   *  definition. Capped at 3 slots in the UI. */
  artRefImages?:        Array<{ id: string; url: string; description: string }>
}

interface Props {
  meta:      PromptInputsMeta
  /** Partial patch — only the fields that changed. Parent merges. */
  onChange:  (patch: Partial<PromptInputsMeta>) => void
  /** Upload a new reference image: parent uploads it to Supabase Storage
   *  + calls /api/references/describe, then emits `onChange` with the full
   *  artRefImages array including the new entry. Returns a promise so the
   *  panel can show a spinner while both requests are in flight. */
  onAddReference?:    (file: File) => Promise<void>
  /** Remove a reference by id. Parent emits onChange with the filtered array. */
  onRemoveReference?: (id: string) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function PromptInputsPanel({
  meta, onChange, onAddReference, onRemoveReference,
}: Props) {
  // All sections default open — the panel is meant to be a survey of what
  // the model will see, not a click-through.  User can collapse any to
  // save vertical space.
  const [open, setOpen] = useState({
    identity: true,
    style:    true,
    palette:  true,
    world:    true,
    direction:true,
    symbols:  true,
    refs:     true,
  })

  // Count unnamed symbols so the panel header can show a warning pill.
  // The per-section warning strips expand on this with tier-specific detail.
  const symbolCounts = useMemo(() => {
    const count = (n: number | undefined) => Math.max(0, Math.min(8, Number(n ?? 5)))
    const countEmpty = (names?: string[], total?: number) => {
      const t = count(total)
      const list = names ?? []
      let empty = 0
      for (let i = 0; i < t; i++) if (!list[i] || !list[i].trim()) empty++
      return empty
    }
    const h = countEmpty(meta.symbolHighNames, meta.symbolHighCount)
    const l = countEmpty(meta.symbolLowNames,  meta.symbolLowCount)
    const s = countEmpty(meta.symbolSpecialNames, meta.symbolSpecialCount)
    return { high: h, low: l, special: s, total: h + l + s }
  }, [meta.symbolHighNames, meta.symbolLowNames, meta.symbolSpecialNames,
      meta.symbolHighCount, meta.symbolLowCount, meta.symbolSpecialCount])

  // Text-field helper — debounce-free, one patch per keystroke. Good enough
  // for the autosave pipeline; expensive builds only run on Generate anyway.
  const setText = useCallback((field: keyof PromptInputsMeta, value: string) => {
    onChange({ [field]: value } as Partial<PromptInputsMeta>)
  }, [onChange])

  // Style change also writes the legacy `artStyle` mirror so pre-v108
  // save paths still find the canonical id when they look for it.
  const setStyle = useCallback((id: string) => {
    onChange({ styleId: id, artStyle: id })
  }, [onChange])

  // Symbol name editing — splice into the right-length array so empty slots
  // roundtrip as '' rather than `undefined` (the model treats missing names
  // as "invent whatever"; keeping the array stable lets us count empties).
  const setSymbolName = useCallback((
    group: 'high' | 'low' | 'special',
    idx:   number,
    value: string,
  ) => {
    const field =
      group === 'high'    ? 'symbolHighNames' :
      group === 'low'     ? 'symbolLowNames'  :
                            'symbolSpecialNames'
    const countField =
      group === 'high'    ? 'symbolHighCount' :
      group === 'low'     ? 'symbolLowCount'  :
                            'symbolSpecialCount'
    const total = Math.max(0, Math.min(8, Number(meta[countField] ?? 5)))
    const prev  = meta[field] ?? []
    // Expand to `total` entries, fill missing with ''.
    const next  = Array.from({ length: total }, (_, i) => prev[i] ?? '')
    next[idx] = value
    onChange({ [field]: next } as Partial<PromptInputsMeta>)
  }, [meta, onChange])

  // Hide sections whose feature isn't active. Right now the only conditional
  // is bonusNarrative — only relevant when the project has a bonus screen.
  // We show it unconditionally; the prompt builder only injects it for
  // background_bonus + feature backgrounds so a filled-in value for a
  // project with no bonus is harmless.

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
      background: C.surface, color: C.tx, fontFamily: C.font,
    }}>

      {/* ── Panel header ─────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.gold,
          letterSpacing: '.08em', textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          Prompt Inputs
        </div>
        <div style={{ fontSize: 10, color: C.txMuted, lineHeight: 1.5 }}>
          Every field the AI sees when you generate. Changes autosave and
          apply to the next generation.
        </div>

        {/* Unnamed-symbol warning strip — mirrors the Commit 4 banner. */}
        {symbolCounts.total > 0 && (
          <div style={{
            marginTop: 10,
            padding: '6px 9px',
            background: 'rgba(251,191,36,.08)',
            border: `1px solid rgba(251,191,36,.25)`,
            borderRadius: 6,
            fontSize: 10, color: C.amber,
            display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4,
          }}>
            <AlertTriangle size={10} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>{symbolCounts.total} unnamed symbol{symbolCounts.total === 1 ? '' : 's'}</strong> —
              generations will be generic without specific names. Fill in below.
            </span>
          </div>
        )}
      </div>

      {/* ── Identity ─────────────────────────────────────────────────── */}
      <Section
        label="Identity"
        hint="Game name + theme land first in every prompt"
        open={open.identity}
        onToggle={() => setOpen(o => ({ ...o, identity: !o.identity }))}
      >
        <Labelled label="Game name">
          <input
            type="text"
            value={meta.gameName ?? ''}
            onChange={e => setText('gameName', e.target.value)}
            placeholder="Lucky Bull"
            style={inputStyle}
          />
        </Labelled>
        <Labelled label="Theme">
          <input
            type="text"
            value={meta.themeKey ?? ''}
            onChange={e => setText('themeKey', e.target.value)}
            placeholder="western · fantasy · cyberpunk…"
            style={inputStyle}
          />
        </Labelled>
      </Section>

      {/* ── Style ───────────────────────────────────────────────────── */}
      <Section
        label="Graphic style"
        hint="Dominant visual language — rewrites layer 1 of every prompt"
        open={open.style}
        onToggle={() => setOpen(o => ({ ...o, style: !o.style }))}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
          gap: 6,
        }}>
          {/* No-style option */}
          <StyleCard
            active={!meta.styleId}
            label="None"
            onClick={() => setStyle('')}
            id=""
          />
          {GRAPHIC_STYLES.map(s => (
            <StyleCard
              key={s.id}
              active={meta.styleId === s.id}
              label={s.name}
              onClick={() => setStyle(s.id)}
              id={s.id}
            />
          ))}
        </div>
        {meta.styleId && (
          <div style={{
            marginTop: 8, fontSize: 10, color: C.txMuted, lineHeight: 1.45,
          }}>
            {GRAPHIC_STYLES.find(s => s.id === meta.styleId)?.description}
          </div>
        )}
      </Section>

      {/* ── Palette ──────────────────────────────────────────────────── */}
      <Section
        label="Colour palette"
        hint="Fed as named mood colours (warm gold, deep navy…), not raw hex"
        open={open.palette}
        onToggle={() => setOpen(o => ({ ...o, palette: !o.palette }))}
      >
        <PaletteRow
          label="Primary"
          value={meta.colorPrimary ?? '#c9a84c'}
          on={meta.colorPrimaryOn !== false}
          onChangeValue={v  => onChange({ colorPrimary: v })}
          onChangeOn=   {on => onChange({ colorPrimaryOn: on })}
        />
        <PaletteRow
          label="Background"
          value={meta.colorBg ?? '#1a0a3a'}
          on={meta.colorBgOn !== false}
          onChangeValue={v  => onChange({ colorBg: v })}
          onChangeOn=   {on => onChange({ colorBgOn: on })}
        />
        <PaletteRow
          label="Accent"
          value={meta.colorAccent ?? '#e8c96d'}
          on={meta.colorAccentOn !== false}
          onChangeValue={v  => onChange({ colorAccent: v })}
          onChangeOn=   {on => onChange({ colorAccentOn: on })}
        />
      </Section>

      {/* ── World & Tone ─────────────────────────────────────────────── */}
      <Section
        label="World & tone"
        hint="Only affects backgrounds + bonus screens — text-inviting words get softened"
        open={open.world}
        onToggle={() => setOpen(o => ({ ...o, world: !o.world }))}
      >
        <Labelled label="Mood">
          <input
            type="text"
            value={meta.mood ?? ''}
            onChange={e => setText('mood', e.target.value)}
            placeholder="opulent · mystical · gritty…"
            style={inputStyle}
          />
        </Labelled>
        <Labelled label="Setting">
          <textarea
            value={meta.setting ?? ''}
            onChange={e => setText('setting', e.target.value)}
            maxLength={240}
            rows={2}
            placeholder="e.g. desert canyon at sunset"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
          />
        </Labelled>
        <Labelled label="Story / narrative">
          <textarea
            value={meta.story ?? ''}
            onChange={e => setText('story', e.target.value)}
            maxLength={240}
            rows={2}
            placeholder="e.g. ancient treasure lost in the badlands"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
          />
        </Labelled>
        <Labelled label="Bonus narrative">
          <textarea
            value={meta.bonusNarrative ?? ''}
            onChange={e => setText('bonusNarrative', e.target.value)}
            maxLength={240}
            rows={2}
            placeholder="e.g. vault opens, gold spills out"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
          />
        </Labelled>
      </Section>

      {/* ── Art direction ────────────────────────────────────────────── */}
      <Section
        label="Art direction"
        hint="Free-text notes land in layer 3; capped tight to limit injection surface"
        open={open.direction}
        onToggle={() => setOpen(o => ({ ...o, direction: !o.direction }))}
      >
        <Labelled label="Notes" hint="max 160 chars">
          <textarea
            value={meta.artNotes ?? ''}
            onChange={e => setText('artNotes', e.target.value.slice(0, 160))}
            maxLength={160}
            rows={2}
            placeholder="e.g. slightly oversaturated, dramatic rim lighting"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
          />
        </Labelled>
        <Labelled label="Visual reference" hint="max 120 chars — text only for now">
          <input
            type="text"
            value={meta.artRef ?? ''}
            onChange={e => setText('artRef', e.target.value.slice(0, 120))}
            maxLength={120}
            placeholder="e.g. inspired by Sergio Leone westerns"
            style={inputStyle}
          />
        </Labelled>
      </Section>

      {/* ── Symbol names ─────────────────────────────────────────────── */}
      <Section
        label="Symbol names"
        hint="Biggest unused lever — empty = generic icons"
        open={open.symbols}
        onToggle={() => setOpen(o => ({ ...o, symbols: !o.symbols }))}
        warning={symbolCounts.total > 0 ? `${symbolCounts.total} empty` : undefined}
      >
        <SymbolGroup
          label="High symbols"
          count={meta.symbolHighCount}
          names={meta.symbolHighNames ?? []}
          placeholder={i => `High ${i + 1}`}
          onChange={(i, v) => setSymbolName('high', i, v)}
          emptyCount={symbolCounts.high}
        />
        <SymbolGroup
          label="Low symbols"
          count={meta.symbolLowCount}
          names={meta.symbolLowNames ?? []}
          placeholder={i => `Low ${i + 1}`}
          onChange={(i, v) => setSymbolName('low', i, v)}
          emptyCount={symbolCounts.low}
        />
        <SymbolGroup
          label="Special symbols"
          count={meta.symbolSpecialCount}
          names={meta.symbolSpecialNames ?? []}
          placeholder={i => i === 0 ? 'Wild' : i === 1 ? 'Scatter' : `Special ${i + 1}`}
          onChange={(i, v) => setSymbolName('special', i, v)}
          emptyCount={symbolCounts.special}
        />
      </Section>

      {/* ── References ───────────────────────────────────────────────── */}
      <Section
        label="Reference images"
        hint="Up to 3 — we describe each image's aesthetic and inject it into every generation"
        open={open.refs}
        onToggle={() => setOpen(o => ({ ...o, refs: !o.refs }))}
      >
        <ReferenceList
          refs={meta.artRefImages ?? []}
          onAdd={onAddReference}
          onRemove={onRemoveReference}
        />
      </Section>

      <div style={{ height: 20 }}/>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  background: C.surfInp,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  color: C.tx,
  fontSize: 12,
  fontFamily: "'Inter',system-ui,sans-serif",
  outline: 'none',
  lineHeight: 1.45,
}

function Section({
  label, hint, open, onToggle, warning, children,
}: {
  label:    string
  hint?:    string
  open:     boolean
  onToggle: () => void
  warning?: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      borderBottom: `1px solid ${C.border}`,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '12px 16px 10px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={11} style={{ color: C.txMuted }} />
              : <ChevronRight size={11} style={{ color: C.txMuted }} />}
        <span style={{
          fontSize: 10, fontWeight: 700, color: C.tx,
          letterSpacing: '.08em', textTransform: 'uppercase',
        }}>
          {label}
        </span>
        {warning && (
          <span style={{
            marginLeft: 4, fontSize: 9, color: C.amber,
            background: 'rgba(251,191,36,.1)',
            border: '1px solid rgba(251,191,36,.3)',
            borderRadius: 3, padding: '1px 5px', fontWeight: 600,
          }}>
            {warning}
          </span>
        )}
      </button>
      {open && (
        <div style={{
          padding: '0 16px 14px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {hint && (
            <div style={{
              fontSize: 10, color: C.txFaint, lineHeight: 1.5, marginBottom: 2,
            }}>
              {hint}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

function Labelled({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 9, fontWeight: 600, color: C.txMuted,
        letterSpacing: '.08em', textTransform: 'uppercase',
        marginBottom: 4,
      }}>
        <span>{label}</span>
        {hint && <span style={{
          color: C.txFaint, fontWeight: 400,
          textTransform: 'none', letterSpacing: 0,
        }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function StyleCard({
  id, active, label, onClick,
}: {
  id:     string
  active: boolean
  label:  string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '8px 4px',
        background: active ? C.goldDim : C.surfHigh,
        border: `1px solid ${active ? C.goldLine : C.border}`,
        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
        color: active ? C.gold : C.txMuted,
      }}
    >
      <StyleIcon id={id} size={18} />
      <span style={{
        fontSize: 8.5, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', width: '100%', textAlign: 'center',
      }}>
        {label}
      </span>
    </button>
  )
}

function PaletteRow({
  label, value, on,
  onChangeValue, onChangeOn,
}: {
  label:         string
  value:         string
  on:            boolean
  onChangeValue: (v: string) => void
  onChangeOn:    (on: boolean) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px',
      background: C.surfHigh,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
    }}>
      <input
        type="color"
        value={value}
        onChange={e => onChangeValue(e.target.value)}
        style={{
          width: 28, height: 28, padding: 0,
          border: 'none', background: 'transparent', cursor: 'pointer',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.tx, fontWeight: 600, marginBottom: 1 }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: C.txMuted, fontFamily: "'DM Mono',monospace" }}>
          {value.toUpperCase()}
        </div>
      </div>
      <button
        onClick={() => onChangeOn(!on)}
        title={on ? 'Active in prompt' : 'Disabled — will not appear in prompt'}
        style={{
          width: 30, height: 16, borderRadius: 8, position: 'relative',
          background: on ? 'rgba(52,211,153,.35)' : C.surface,
          border: `1px solid ${on ? 'rgba(52,211,153,.55)' : C.border}`,
          cursor: 'pointer', flexShrink: 0,
          transition: 'all .15s',
        }}
        aria-label={`Toggle ${label}`}
      >
        <div style={{
          position: 'absolute', top: 1,
          left: on ? 14 : 1,
          width: 12, height: 12, borderRadius: '50%',
          background: on ? C.green : C.txFaint,
          transition: 'left .15s',
        }}/>
      </button>
    </div>
  )
}

function SymbolGroup({
  label, count, names, placeholder, onChange, emptyCount,
}: {
  label:       string
  count?:      number
  names:       string[]
  placeholder: (i: number) => string
  onChange:    (i: number, v: string) => void
  emptyCount:  number
}) {
  const total = Math.max(0, Math.min(8, Number(count ?? 5)))
  if (total === 0) return null
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        fontSize: 9, fontWeight: 600, color: C.txMuted,
        letterSpacing: '.08em', textTransform: 'uppercase',
        marginBottom: 4,
      }}>
        <span>{label}</span>
        {emptyCount > 0 && (
          <span style={{
            color: C.amber, fontWeight: 600, fontSize: 9,
            background: 'rgba(251,191,36,.1)',
            border: '1px solid rgba(251,191,36,.3)',
            borderRadius: 3, padding: '0 4px',
            textTransform: 'none', letterSpacing: 0,
          }}>
            {emptyCount} empty
          </span>
        )}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
      }}>
        {Array.from({ length: total }).map((_, i) => (
          <input
            key={i}
            type="text"
            value={names[i] ?? ''}
            onChange={e => onChange(i, e.target.value)}
            maxLength={40}
            placeholder={placeholder(i)}
            style={{
              ...inputStyle,
              padding: '5px 7px',
              fontSize: 11,
              borderColor: (names[i] ?? '').trim() ? C.border : 'rgba(251,191,36,.2)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Reference images ───────────────────────────────────────────────────────
// Project-level reference uploader. Each slot shows:
//   - empty: a dashed drop-zone button (or file-picker)
//   - uploading: thumbnail + spinner + "Uploading…"
//   - describing: thumbnail + spinner + "Analysing style…"
//   - done: thumbnail + first ~90 chars of description, hover full text
// Up to 3 slots; add-slot hidden when full.

function ReferenceList({
  refs, onAdd, onRemove,
}: {
  refs:     Array<{ id: string; url: string; description: string }>
  onAdd?:    (file: File) => Promise<void>
  onRemove?: (id: string) => void
}) {
  const MAX = 3
  const fileInput = useRef<HTMLInputElement>(null)
  // Short-lived local state while an upload is in flight. We track this
  // locally instead of plumbing a tri-state through the parent because
  // the parent's meta doesn't reflect pending work — it only holds the
  // final artRefImages array after onAdd resolves.
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const handlePick = useCallback(async (files: FileList | null) => {
    if (!files || !files[0] || !onAdd) return
    const file = files[0]
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    setError(null)
    try {
      await onAdd(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reference upload failed')
    } finally {
      setUploading(false)
    }
  }, [onAdd])

  const slots = refs.slice(0, MAX)
  const hasRoom = slots.length < MAX && !!onAdd

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {slots.map(ref => (
        <ReferenceTile
          key={ref.id}
          url={ref.url}
          description={ref.description}
          onRemove={onRemove ? () => onRemove(ref.id) : undefined}
        />
      ))}

      {hasRoom && (
        <>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 10px', width: '100%',
              background: C.surfInp,
              border: `1px dashed ${C.borderMed}`,
              borderRadius: 6,
              color: uploading ? C.gold : C.txMuted,
              cursor: uploading ? 'wait' : 'pointer',
              fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
            }}
          >
            {uploading ? (
              <>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }}/>
                <span>Uploading &amp; analysing reference…</span>
              </>
            ) : (
              <>
                <Upload size={12} />
                <span>Add reference image</span>
                <span style={{ marginLeft: 'auto', color: C.txFaint, fontWeight: 400 }}>
                  {slots.length} / {MAX}
                </span>
              </>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={e => { handlePick(e.target.files); e.target.value = '' }}
          />
        </>
      )}

      {error && (
        <div style={{
          fontSize: 10, color: C.red,
          background: 'rgba(248,113,113,.08)',
          border: '1px solid rgba(248,113,113,.3)',
          borderRadius: 5, padding: '6px 8px',
          display: 'flex', alignItems: 'flex-start', gap: 6,
        }}>
          <AlertTriangle size={10} style={{ flexShrink: 0, marginTop: 1 }}/>
          <span>{error}</span>
        </div>
      )}

      <div style={{
        marginTop: 4, fontSize: 10, color: C.txFaint, lineHeight: 1.5,
        display: 'flex', alignItems: 'flex-start', gap: 6,
      }}>
        <Info size={10} style={{ flexShrink: 0, marginTop: 1 }}/>
        <span>
          References guide the aesthetic (palette, material, lighting) —
          not the subject matter. Uses 1 credit per image to describe the style.
        </span>
      </div>
    </div>
  )
}

function ReferenceTile({
  url, description, onRemove,
}: { url: string; description: string; onRemove?: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const short = (description ?? '').length > 120 && !expanded
    ? (description ?? '').slice(0, 120) + '…'
    : (description ?? '')
  const empty = !description

  return (
    <div style={{
      display: 'flex', gap: 8,
      padding: 6, background: C.surfHigh,
      border: `1px solid ${C.border}`, borderRadius: 6,
      position: 'relative',
    }}>
      <div style={{
        width: 48, height: 48, flexShrink: 0,
        borderRadius: 4, overflow: 'hidden',
        background: C.surfInp,
      }}>
        {url ? (
          <img src={url} alt="reference" style={{
            width: '100%', height: '100%', objectFit: 'cover',
          }}/>
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: C.txFaint,
          }}>
            <ImageIcon size={16}/>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {empty ? (
          <div style={{
            fontSize: 10, color: C.amber, fontStyle: 'italic',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }}/>
            Analysing style…
          </div>
        ) : (
          <div
            onClick={() => setExpanded(v => !v)}
            style={{
              fontSize: 10, color: C.txMid, lineHeight: 1.45,
              cursor: 'pointer',
            }}
            title={expanded ? 'Click to collapse' : 'Click to expand'}
          >
            {short}
          </div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove reference"
          style={{
            width: 20, height: 20, flexShrink: 0,
            background: 'rgba(0,0,0,.4)',
            border: `1px solid ${C.border}`, borderRadius: 4,
            color: C.txMuted, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <X size={10}/>
        </button>
      )}
    </div>
  )
}
