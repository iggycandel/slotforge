// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 4
// Resolve a kit's stored vars (or a request body's overrides) plus the
// project meta into ResolvedVars — every field a literal value the
// composition engine can render directly.
//
// Resolution rules:
//   • gameName    → user override > project.gameName > 'Untitled Game'
//   • headline    → user override > template default (may be null)
//   • subhead     → user override > template default (may be null)
//   • ctaText     → kit's chosen key, localised to vars.language via
//                   lib/marketing/i18n.ts (Day 6)
//   • language    → kit value > template default
//   • colorMode   → kit value > template default
//   • layoutVariant → kit value > template default
//   • resolvedColors → palette from project, modulated by colorMode
//
// This module is intentionally pure: no DB, no I/O. Routes load the
// kit row + project meta separately, then call resolveVars().
// ─────────────────────────────────────────────────────────────────────────────

import type {
  MarketingTemplate, ResolvedVars,
  CtaKey, Language, ColorMode, LayoutVariant,
} from './types'
import type { ProjectMeta } from '@/types/assets'

/** Best-effort palette defaults for projects that haven't picked colours
 *  yet. Studio brand (#c9a84c gold + #06060a near-black) so renders
 *  still look intentional rather than random. */
const FALLBACK_PALETTE = {
  primary: '#c9a84c',
  accent:  '#e84d3a',
  bg:      '#06060a',
}

/** Resolve a (project, kit, template) into the literal vars the engine
 *  needs. The `kitVars` parameter is the JSONB stored in
 *  marketing_kits.vars — partial overrides keyed by var name; missing
 *  keys fall back to template defaults. */
export function resolveVars(
  template: MarketingTemplate,
  project:  Partial<ProjectMeta> | null,
  kitVars:  Record<string, unknown>,
): ResolvedVars {
  const v = kitVars ?? {}

  const gameName = pickStr(v.gameName, project?.gameName, 'Untitled Game')

  // Template defaults are the second source. The schema declaration
  // permits null for headline/subhead which is a feature — many
  // templates intentionally don't show subhead unless the user opts in.
  const headline = optStr(v.headline, template.vars.headline?.default ?? null)
  const subhead  = optStr(v.subhead,  template.vars.subhead?.default  ?? null)

  const ctaKey: CtaKey       = pickEnum(v.ctaText,       template.vars.ctaText.options,       template.vars.ctaText.default)
  const language: Language   = pickEnum(v.language,      template.vars.language.options,      template.vars.language.default)
  const colorMode: ColorMode = pickEnum(v.colorMode,     template.vars.colorMode.options,     template.vars.colorMode.default)
  const variant: LayoutVariant = pickEnum(v.layoutVariant, template.vars.layoutVariant.options, template.vars.layoutVariant.default)

  // Character toggle. Defaults to true so existing kits keep rendering
  // hero-shot tiles. The modal only shows the control when the project
  // actually has a character asset; if no character exists the value
  // doesn't matter (engine skips the layer for the unrelated reason
  // that the asset slot is null).
  const includeCharacter = typeof v.includeCharacter === 'boolean' ? v.includeCharacter : true

  return {
    gameName,
    headline,
    subhead,
    // CTA literal localisation lands in Day 6 with the i18n table; for
    // now we pass the canonical key through unchanged so EN renders
    // correctly and other languages render the English string. The
    // engine treats 'none' as "skip the layer" so the picker still
    // works as advertised.
    ctaText:  ctaKey,
    language,
    colorMode,
    layoutVariant: variant,
    resolvedColors: resolvePalette(project, colorMode),
    includeCharacter,
  }
}

/** Pull palette colours off ProjectMeta, applying any colorMode tweaks. */
function resolvePalette(
  project:   Partial<ProjectMeta> | null,
  colorMode: ColorMode,
): { primary: string; accent: string; bg: string } {
  const primary = nonEmptyStr(project?.colorPrimary)  ?? FALLBACK_PALETTE.primary
  const accent  = nonEmptyStr(project?.colorAccent)   ?? FALLBACK_PALETTE.accent
  const bg      = nonEmptyStr(project?.colorBg)       ?? FALLBACK_PALETTE.bg

  // colorMode 'auto' = use as-is. 'light' / 'dark' overrides bg only —
  // primary/accent are brand colours and shouldn't flip. Day 6 may
  // grow more sophisticated rules; this keeps the contract stable.
  if (colorMode === 'light') return { primary, accent, bg: '#f5f0e6' }
  if (colorMode === 'dark')  return { primary, accent, bg: '#0a0a10' }
  return { primary, accent, bg }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function pickStr(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

function optStr(value: unknown, fallback: string | null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  return fallback
}

function nonEmptyStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function pickEnum<T extends string>(
  value:    unknown,
  options:  readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}
