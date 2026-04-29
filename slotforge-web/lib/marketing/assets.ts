// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 4
// Pull a project's marketing-relevant source assets out of the
// generated_assets table and download each into a Buffer the composition
// engine can consume.
//
// Slots needed by templates:
//   • background_base       — required (templates assume it exists)
//   • logo                  — required
//   • character             — required
//   • character.transparent — optional cutout (Replicate, Day 7)
//
// We load all four in parallel. For each, asset_versions[slot] is the
// row's created_at — the cache hash uses these so re-generating any
// upstream asset invalidates downstream marketing renders.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { legacyKeysFor, ALL_LEGACY_KEYS } from '@/lib/storage/asset-keys'
import type { ResolvedAssets } from './types'
import type { CacheKeyInputs } from './cache'

export interface MarketingAssetReadiness {
  hasBackground: boolean
  hasLogo:       boolean
  hasCharacter:  boolean
  /** Includes the original character — the Marketing tab still works
   *  before bg-removal lands; the engine falls back automatically. */
  hasCharacterTransparent: boolean
}

export interface LoadedMarketingAssets {
  assets:        ResolvedAssets
  assetVersions: CacheKeyInputs['assetVersions']
  readiness:     MarketingAssetReadiness
}

const SLOTS = ['background_base', 'logo', 'character', 'character.transparent'] as const
type Slot = (typeof SLOTS)[number]

/**
 * Download all marketing-relevant assets for a project. Returns the
 * Buffers + version stamps + readiness flags. Throws only on
 * unrecoverable Supabase errors; missing assets are nulls in the
 * returned ResolvedAssets so the caller can render a partial state or
 * surface the readiness UI.
 */
export async function loadMarketingAssets(projectId: string): Promise<LoadedMarketingAssets> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // Pull all asset rows for the slots we care about, AND any legacy
  // editor PSD-key rows (`bg`, `char`, …) that older Flow-side uploads
  // landed under. We only need the most recent row per (project, type)
  // — the schema doesn't enforce uniqueness on (project_id, type) so we
  // order by created_at desc and let JS dedupe with canonical-wins
  // semantics (a legacy `bg` row only surfaces when the project has no
  // canonical `background_base`). See lib/storage/asset-keys.ts.
  const queryTypes = [...SLOTS, ...ALL_LEGACY_KEYS] as readonly string[]
  const { data: rows, error } = await sb
    .from('generated_assets')
    .select('type, url, created_at')
    .eq('project_id', projectId)
    .in('type', queryTypes)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`[marketing/assets] generated_assets lookup failed: ${error.message}`)
  }

  const allRows: Array<{ type: string; url: string; created_at: string }> =
    (rows as Array<{ type: string; url: string; created_at: string }> | null) ?? []

  // Pass 1 — capture canonical rows. These always win.
  const latest = new Map<Slot, { url: string; created_at: string }>()
  for (const r of allRows) {
    if (SLOTS.includes(r.type as Slot) && !latest.has(r.type as Slot)) {
      latest.set(r.type as Slot, { url: r.url, created_at: r.created_at })
    }
  }
  // Pass 2 — fill any still-missing canonical slot from a legacy alias.
  // This is the read-side fallback that lets users who uploaded under the
  // old code path see their assets without re-uploading. The latest legacy
  // row wins (allRows is already sorted desc by created_at).
  for (const slot of SLOTS) {
    if (latest.has(slot)) continue
    const aliases = legacyKeysFor(slot)
    if (aliases.length === 0) continue
    for (const r of allRows) {
      if (aliases.includes(r.type)) {
        latest.set(slot, { url: r.url, created_at: r.created_at })
        break
      }
    }
  }

  // Download all four URLs in parallel. Failures degrade to null — the
  // engine falls back gracefully (character.transparent → character)
  // and the readiness check upstream is what surfaces "no assets yet".
  const buffers = await Promise.all(SLOTS.map(async slot => {
    const entry = latest.get(slot)
    if (!entry) return [slot, null] as const
    try {
      const res = await fetch(entry.url)
      if (!res.ok) {
        console.warn(`[marketing/assets] ${slot} fetch failed: ${res.status}`)
        return [slot, null] as const
      }
      return [slot, Buffer.from(await res.arrayBuffer())] as const
    } catch (e) {
      console.warn(`[marketing/assets] ${slot} fetch threw:`, e)
      return [slot, null] as const
    }
  }))

  const map = new Map<Slot, Buffer | null>(buffers)

  const assets: ResolvedAssets = {
    background_base:         map.get('background_base')         ?? null,
    logo:                    map.get('logo')                    ?? null,
    character:               map.get('character')               ?? null,
    'character.transparent': map.get('character.transparent')   ?? null,
  }

  const assetVersions: CacheKeyInputs['assetVersions'] = {
    background_base:         latest.get('background_base')?.created_at,
    logo:                    latest.get('logo')?.created_at,
    character:               latest.get('character')?.created_at,
    'character.transparent': latest.get('character.transparent')?.created_at,
  }

  const readiness: MarketingAssetReadiness = {
    hasBackground:           assets.background_base !== null,
    hasLogo:                 assets.logo            !== null,
    hasCharacter:            assets.character       !== null,
    hasCharacterTransparent: assets['character.transparent'] !== null,
  }

  return { assets, assetVersions, readiness }
}
