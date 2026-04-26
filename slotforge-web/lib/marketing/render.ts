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
import { renderPressOnePager }                                     from './pdf'
import { uploadRender, signRenderUrl, downloadRender }             from './storage'
import type {
  MarketingTemplate, TemplateSize,
  ResolvedVars, ResolvedAssets, MarketingRenderRow,
  RenderedLayerBox,
} from './types'
import type { MarketingProject } from './project'

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
  /** Required for PDF templates (press one-pager) — supplies the facts
   *  block (RTP / volatility / paylines / mechanics / jackpots).
   *  Optional for raster templates so existing call sites stay
   *  unchanged. */
  project?:      MarketingProject
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
  /** Bbox per drawn AssetLayer in this render's pixel space. Empty on
   *  cache hits (we don't re-render to capture them; the modal falls
   *  back to a "click here to refresh layout boxes" path that triggers
   *  a one-shot re-render with the same vars). */
  layerBoxes:  RenderedLayerBox[]
  /** Final pixel dimensions of the rendered image — paired with
   *  layerBoxes so the client can scale the boxes to whatever CSS
   *  size it displays the preview at. */
  width:       number
  height:      number
  /** Image dimensions PLUS size_label so the client can correlate. */
  sizeLabel:   string
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
    .select('storage_path, bytes, layer_boxes')
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
      // Cache hits read the persisted bboxes from the row — drag works
      // immediately even on a render the engine hasn't seen this
      // session. Falls back to [] for older rows that pre-date the
      // layer_boxes column (cleared by the migration default).
      layerBoxes:  Array.isArray(existing.layer_boxes) ? existing.layer_boxes : [],
      width:       input.size.w,
      height:      input.size.h,
      sizeLabel:   input.size.label,
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

  // PDF dispatch — press one-pager goes through pdf-lib instead of the
  // raster engine. The PDF generator embeds the project's largest
  // existing rendered hero (cover-fits a hero_banner_desktop or any
  // promo render in the kit's project) so facts + visuals come together
  // in a single sheet.
  let buffer: Buffer
  let renderedLayers: RenderedLayerBox[] = []
  if (input.size.format === 'pdf') {
    if (!input.project) {
      throw new Error(`[marketing/render] PDF template ${input.template.id} requires a project`)
    }
    // Best-effort hero. Reuse a previously-rendered hero_banner_desktop
    // if one exists for this project; otherwise omit and pdf.ts paints
    // a coloured strip from the palette.
    const heroImage = await loadHeroForPdf(input.projectId)
    buffer = await renderPressOnePager({
      project:   input.project,
      vars:      input.vars,
      assets:    input.assets,
      heroImage,
    })
  } else {
    const r = await renderTemplate(input.template, input.size, input.vars, input.assets)
    buffer         = r.buffer
    renderedLayers = r.renderedLayers
  }
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
    // Persist the engine's bbox output so the modal can wire drag-on-
    // preview against this render even after the user closes + reopens
    // the modal (cache hit returns these directly).
    layer_boxes:  renderedLayers,
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
  return {
    rendered:    true,
    url,
    storagePath,
    bytes,
    varsHash,
    layerBoxes:  renderedLayers,
    width:       input.size.w,
    height:      input.size.h,
    sizeLabel:   input.size.label,
  }
}

/** Pull the most recent rendered hero image we have for a project so
 *  the press PDF has something visual at the top. Looks for a
 *  hero_banner_desktop render first (best framing for an A4 page),
 *  then falls back to any other raster render. Returns null when the
 *  project hasn't rendered anything yet — pdf.ts will paint a flat
 *  palette strip instead. */
async function loadHeroForPdf(projectId: string): Promise<Buffer | null> {
  // Lazy import to avoid pulling supabase admin into the hot path of
  // the raster engine — only PDFs walk this branch.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // Prefer hero_banner_desktop renders when the user has them.
  const { data: rows } = await sb
    .from('marketing_renders')
    .select('storage_path, format, kit:marketing_kits!inner(project_id, template_id)')
    .eq('kit.project_id', projectId)
    .in('format', ['png', 'jpg', 'webp'])
    .order('created_at', { ascending: false })
    .limit(20)

  const list = (rows ?? []) as Array<{
    storage_path: string; format: string;
    kit: { template_id: string }
  }>
  if (list.length === 0) return null

  const hero =
    list.find(r => r.kit?.template_id === 'promo.hero_banner_desktop') ??
    list.find(r => /banner|hero/.test(r.kit?.template_id ?? '')) ??
    list[0]

  if (!hero) return null
  try {
    return await downloadRender(hero.storage_path)
  } catch {
    return null
  }
}
