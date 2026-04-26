// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 4
// Pull the marketing-relevant subset of ProjectMeta out of the projects.payload
// jsonb blob. The editor stores some fields top-level (gameName, theme) and
// some under payload.meta (palette, mood, narrative) — see
// components/editor/editor-frame.tsx around line 158 for the full mapping.
//
// Marketing only needs gameName + palette today. Day 8 will pull richer
// fields once templates start using mood / narrative / theme as text vars.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import type { ProjectMeta }   from '@/types/assets'

/** Press-kit / one-pager facts pulled out of payload. None of these
 *  exist on ProjectMeta because they're game-design data, not visual
 *  prompt context — they only matter for the press PDF and the GDD
 *  export. Strings are returned as-is for layout flexibility. */
export interface MarketingFacts {
  rtp?:        string  // e.g. '96.1%'
  volatility?: string  // 'Low' | 'Medium' | 'High' | 'Very High'
  paylines?:   string  // number as a string
  reelset?:    string  // '5x3', '6x4'
  maxWin?:     string  // 'x10000' / similar
  jackpotMini?:  string
  jackpotMinor?: string
  jackpotMajor?: string
  jackpotGrand?: string
  features?:   string[]   // mechanics keys, e.g. ['freespin','wheel_bonus']
}

export interface MarketingProject {
  id:    string
  name:  string
  meta:  Partial<ProjectMeta>
  facts: MarketingFacts
}

/** Load a project's marketing-relevant meta. Caller is responsible for
 *  authz — this helper bypasses RLS via the service-role client and
 *  trusts that assertProjectAccess has already run. */
export async function loadMarketingProject(projectId: string): Promise<MarketingProject | null> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('projects')
    .select('id, name, payload')
    .eq('id', projectId)
    .maybeSingle()

  if (error || !data) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = data.payload ?? {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = p.meta ?? {}

  // Press facts live mostly top-level (the GDD parser writes them
  // there). features come from the editor's enabled mechanics list.
  const facts: MarketingFacts = {
    rtp:          asStr(p.rtp),
    volatility:   asStr(p.volatility),
    paylines:     asStr(p.paylines),
    reelset:      asStr(p.reelset),
    maxWin:       asStr(p.maxWin ?? p.max_win),
    jackpotMini:  asStr(p.jackpotMini),
    jackpotMinor: asStr(p.jackpotMinor),
    jackpotMajor: asStr(p.jackpotMajor),
    jackpotGrand: asStr(p.jackpotGrand),
    features:     Array.isArray(p.features) ? p.features.filter((f: unknown) => typeof f === 'string') : undefined,
  }

  return {
    id:   data.id as string,
    name: (data.name as string) ?? 'Untitled Project',
    meta: {
      gameName:     p.gameName,
      themeKey:     p.theme,
      colorPrimary: m.colorPrimary,
      colorAccent:  m.colorAccent,
      colorBg:      m.colorBg,
    },
    facts,
  }
}

function asStr(v: unknown): string | undefined {
  if (typeof v === 'string')  return v.trim() || undefined
  if (typeof v === 'number')  return String(v)
  return undefined
}
