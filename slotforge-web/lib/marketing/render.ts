// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 3
// One-stop render orchestrator: ensures a (kit, size, format, vars) is
// rendered, uploaded, and recorded — using the cache when possible.
//
// This is the function the Day 4 SSE endpoint and the Day 9 bulk
// endpoint both call per (template, size). It owns:
//   • cache lookup (marketing_renders SELECT)
//   • cache miss → compose + upload + insert
//   • cache hit  → return the cached storage_path (no compose, no upload)
//   • signed URL re-issue at the end so the caller never sees a stored
//     URL (which we don't keep) and never has to know about TTLs
//
// What this DOES NOT do:
//   • No auth / project-access — caller is responsible (the route does it)
//   • No PDF — that goes through lib/marketing/pdf.ts (Day 8/9). The
//     PDF path will reuse cache.ts + storage.ts but skip compose.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'

import { computeVarsHash, buildStoragePath, type CacheKeyInputs } from './cache'
import { renderTemplate }                                          from './compose'
import { uploadRender, signRenderUrl }                             from './storage'
import type {
  MarketingTemplate, TemplateSize,
  ResolvedVars, ResolvedAssets, MarketingRenderRow,
} from './types'

export interface EnsureRenderInputs {
  /** The kit row's id — must already exist (PUT /api/marketing/kits creates it). */
  kitId:        string
  /** Project id is used as the first folder segment in storage paths so
   *  ownership-based RLS can be re-introduced later if needed without
   *  re-laying-out the bucket. */
  projectId:    string
  template:     MarketingTemplate
  size:         TemplateSize
  vars:         ResolvedVars
  assets:       ResolvedAssets
  /** Asset version stamps from the project — fed into the vars hash so
   *  the cache invalidates when an upstream asset is regenerated. */
  assetVersions: CacheKeyInputs['assetVersions']
}

export interface EnsureRenderResult {
  /** True when we composed + uploaded; false when we returned a cached row. */
  rendered:    boolean
  /** Already-signed URL with the standard 1h TTL. Caller hands it
   *  straight to the client — no further work needed. */
  url:         string
  /** Stable Storage path. Persisted in marketing_renders.storage_path. */
  storagePath: string
  bytes:       number
  /** The hash that was computed/looked up. Returned so callers can
   *  log it for cache-hit-rate observability. */
  varsHash:    string
}

/**
 * Idempotent render. If the cache has a row matching the inputs, returns
 * the existing path; otherwise composes + uploads + inserts the row.
 * Either way, the returned URL is freshly signed.
 */
export async function ensureRender(input: EnsureRenderInputs): Promise<EnsureRenderResult> {
  const varsHash = computeVarsHash({
    templateId:      input.template.id,
    templateVersion: input.template.version,
    sizeLabel:       input.size.label,
    format:          input.size.format,
    vars:            input.vars,
    assetVersions:   input.assetVersions,
  })

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // ── Cache lookup ──────────────────────────────────────────────────────────
  // Unique index is (kit_id, size_label, format, vars_hash) so this is at
  // most one row.
  const { data: existing } = await sb
    .from('marketing_renders')
    .select('storage_path, bytes')
    .eq('kit_id',     input.kitId)
    .eq('size_label', input.size.label)
    .eq('format',     input.size.format)
    .eq('vars_hash',  varsHash)
    .maybeSingle()

  if (existing?.storage_path) {
    const url = await signRenderUrl(existing.storage_path as string)
    return {
      rendered:    false,
      url,
      storagePath: existing.storage_path as string,
      bytes:       (existing.bytes as number) ?? 0,
      varsHash,
    }
  }

  // ── Cache miss → compose + upload + insert ────────────────────────────────
  const storagePath = buildStoragePath(
    input.projectId,
    input.template.id,
    input.size.label,
    varsHash,
    input.size.format,
  )

  const buffer = await renderTemplate(input.template, input.size, input.vars, input.assets)
  const { bytes } = await uploadRender(storagePath, buffer, input.size.format)

  // Insert the cache row. We use upsert with onConflict so a parallel
  // request that lost the race against an earlier render doesn't 23505;
  // the second writer just observes the first's row.
  const row: Omit<MarketingRenderRow, 'id' | 'created_at'> = {
    kit_id:       input.kitId,
    size_label:   input.size.label,
    format:       input.size.format as MarketingRenderRow['format'],
    storage_path: storagePath,
    vars_hash:    varsHash,
    bytes,
  }
  const { error } = await sb
    .from('marketing_renders')
    .upsert(row, { onConflict: 'kit_id,size_label,format,vars_hash' })
  if (error) {
    // The render IS uploaded — we just couldn't record it. Surface the
    // error so support can reconcile, but don't try to delete the
    // storage object (that creates a worse failure mode if Storage is
    // healthy and the DB is the issue).
    throw new Error(`[marketing/render] cache row insert failed: ${error.message}`)
  }

  const url = await signRenderUrl(storagePath)
  return { rendered: true, url, storagePath, bytes, varsHash }
}
