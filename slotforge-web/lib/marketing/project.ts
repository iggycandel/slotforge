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

export interface MarketingProject {
  id:    string
  name:  string
  meta:  Partial<ProjectMeta>
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
  }
}
