// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 3
// Render cache. The composition engine is deterministic — given the same
// (template, size, vars, asset_versions), it produces byte-identical
// output. So we hash those inputs into a `vars_hash` column, cache the
// resulting Storage path in `marketing_renders`, and only re-render
// when the hash changes.
//
// Why this matters: the user opens the Marketing tab → grid wants 20
// thumbnails. Without a cache that's 20 fresh canvas renders on every
// open. With the cache, opening a kit is a single SELECT and a single
// signed-URL re-issue per tile.
//
// Hash inputs:
//   • template_id + template_version (so a layout change invalidates)
//   • size_label + format (each size is a distinct render)
//   • vars (the user's customisation choices)
//   • asset_versions (so re-uploading the character invalidates the
//     downstream marketing renders that depend on it)
//
// What's NOT in the hash: the project_id (cache is scoped per-kit so
// two projects can't collide; kit_id encodes the project), the user
// (same kit, same hash, same render — no per-user variance).
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto'

import type { ResolvedVars } from './types'

export interface CacheKeyInputs {
  templateId:      string
  templateVersion: number
  sizeLabel:       string
  format:          string
  vars:            ResolvedVars
  /** Map of slot → version stamp. Use the asset's created_at (or any
   *  monotonic identifier) so re-generating an asset bumps the hash
   *  and invalidates downstream marketing renders. Slots not present
   *  in the map default to the empty string — equivalent to "no asset
   *  yet". */
  assetVersions:   Partial<Record<'background_base' | 'logo' | 'character' | 'character.transparent', string>>
}

/** Deterministic sha256 over the input set, returned as a 64-char hex
 *  string. Used both as the marketing_renders.vars_hash column AND as
 *  the storage filename suffix so the same hash never overwrites a
 *  different render's path. */
export function computeVarsHash(input: CacheKeyInputs): string {
  // Stable JSON: sort top-level + nested keys so two objects with the
  // same content but different insertion order produce the same hash.
  // ResolvedVars is shallow enough that JSON.stringify with sorted
  // keys is enough — no need for a deep-canonicalising library.
  const payload = stableStringify({
    t:  input.templateId,
    tv: input.templateVersion,
    s:  input.sizeLabel,
    f:  input.format,
    v:  input.vars,
    av: {
      // Resolve the BG-removal fallback at hash time — if the cutout
      // exists, its version contributes; otherwise the original
      // character's version does. This keeps the cache valid through
      // the "Replicate finished, swap in the cutout" transition.
      character: input.assetVersions['character.transparent'] ?? input.assetVersions.character ?? '',
      logo:       input.assetVersions.logo            ?? '',
      bg:         input.assetVersions.background_base ?? '',
    },
  })
  return createHash('sha256').update(payload).digest('hex')
}

/** Build the Storage path for a render. Convention:
 *    <projectId>/<templateId>__<sizeLabel>__<varsHash>.<ext>
 *  The first folder segment is the project id so a future folder-RLS
 *  policy can use storage.foldername(name)[1] without changing the
 *  layout. The double-underscore separators stay inside [a-z0-9_-]
 *  which keeps the path safe across operating-system filename rules. */
export function buildStoragePath(
  projectId: string,
  templateId: string,
  sizeLabel: string,
  varsHash: string,
  format: string,
): string {
  // Sanitize each segment defensively — ids should already be slug-safe
  // (uuid for projectId, dot-namespaced for templateId) but a malformed
  // template author could still slip in slashes.
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${safe(projectId)}/${safe(templateId)}__${safe(sizeLabel)}__${varsHash.slice(0, 16)}.${format}`
}

// ─── Internal: stable JSON stringify ────────────────────────────────────────

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce((acc, k) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc as any)[k] = (v as any)[k]
        return acc
      }, {} as Record<string, unknown>)
    }
    return v
  })
}
