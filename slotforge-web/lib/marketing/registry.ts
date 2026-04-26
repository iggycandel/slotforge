// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 1
// Template registry. Reads JSON files from lib/marketing/templates/ at
// module-init time, validates them against the MarketingTemplate shape,
// and exposes lookup helpers consumed by the API routes.
//
// Why eager-loaded at module init:
//   • Templates are static data baked into the deploy. There's no DB or
//     remote fetch — `import('./templates/foo.json')` is just a file read,
//     and Next.js bundles the JSON into the route bundle.
//   • Validation happens once. If any template is malformed the server
//     fails fast on cold-start instead of on first request.
//   • The /api/marketing/templates endpoint can return the cached array
//     directly with no DB round-trip — see app/api/marketing/templates.
//
// Day 1 ships an empty registry: no JSON files exist yet. Day 8 fills it
// out with all 20 templates. The route handler already works against the
// empty array — it returns [] until templates are added, which means the
// UI scaffolding (Day 5) can be developed against the real API surface
// even before any creative is rendered.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  MarketingTemplate,
  TemplateCategory,
} from './types'

// ─── Template imports ───────────────────────────────────────────────────────
//
// Explicit imports per file. Next.js / webpack can't `glob('./templates/*.json')`
// at build time, so the only way to bundle the JSON into the route output
// is to import each one by name. Press one-pager (PDF) ships in Day 9 with
// its own pdf-lib pipeline.

// Promo Screens (8)
import promoSquareLobbyTile     from './templates/promo.square_lobby_tile.json'
import promoPortraitLobbyTile   from './templates/promo.portrait_lobby_tile.json'
import promoLandscapeLobbyTile  from './templates/promo.landscape_lobby_tile.json'
import promoHeroBannerDesktop   from './templates/promo.hero_banner_desktop.json'
import promoHeroBannerMobile    from './templates/promo.hero_banner_mobile.json'
import promoSideRail            from './templates/promo.side_rail_300x600.json'
import promoSquarePromo300      from './templates/promo.square_promo_300.json'
import promoLeaderboard         from './templates/promo.leaderboard_728x90.json'

// Social Assets (8)
import socialIgSquarePost       from './templates/social.ig_square_post.json'
import socialIgPortraitPost     from './templates/social.ig_portrait_post.json'
import socialIgStory            from './templates/social.ig_story.json'
import socialFbCover            from './templates/social.fb_cover.json'
import socialXHeader            from './templates/social.x_header.json'
import socialLinkedinBanner     from './templates/social.linkedin_banner.json'
import socialYtThumbnail        from './templates/social.yt_thumbnail.json'
import socialTiktokCover        from './templates/social.tiktok_cover.json'

// Store Page (3)
import storeAppIcon             from './templates/store.app_icon_1024.json'
import storeGplayFeatureGraphic from './templates/store.gplay_feature_graphic_1024x500.json'
import storeAppStoreScreenshot  from './templates/store.app_store_screenshot.json'

const SHIPPED_TEMPLATES: MarketingTemplate[] = [
  // Insertion order = grid display order within each category.
  promoSquareLobbyTile     as MarketingTemplate,
  promoPortraitLobbyTile   as MarketingTemplate,
  promoLandscapeLobbyTile  as MarketingTemplate,
  promoHeroBannerDesktop   as MarketingTemplate,
  promoHeroBannerMobile    as MarketingTemplate,
  promoSideRail            as MarketingTemplate,
  promoSquarePromo300      as MarketingTemplate,
  promoLeaderboard         as MarketingTemplate,

  socialIgSquarePost       as MarketingTemplate,
  socialIgPortraitPost     as MarketingTemplate,
  socialIgStory            as MarketingTemplate,
  socialFbCover            as MarketingTemplate,
  socialXHeader            as MarketingTemplate,
  socialLinkedinBanner     as MarketingTemplate,
  socialYtThumbnail        as MarketingTemplate,
  socialTiktokCover        as MarketingTemplate,

  storeAppIcon             as MarketingTemplate,
  storeGplayFeatureGraphic as MarketingTemplate,
  storeAppStoreScreenshot  as MarketingTemplate,
]

// ─── Storage ─────────────────────────────────────────────────────────────────
//
// Templates are loaded into a frozen array at module init. The Map is
// just an O(1) index by id for the per-template render path — the
// catalogue endpoint iterates the array directly so insertion order is
// preserved (which is also visual-grouping order in the UI).

let TEMPLATES: readonly MarketingTemplate[] = Object.freeze([])
const BY_ID = new Map<string, MarketingTemplate>()

// ─── Loader ─────────────────────────────────────────────────────────────────
//
// Day 8 will replace this with explicit imports of every JSON file under
// lib/marketing/templates/ — webpack/Next.js can't dynamically scan a
// directory at build time, so each template gets a one-line import.
// Until then, registerTemplates() is exposed to keep the surface easy
// to test from a single seed file.

/** Validate a template at registration time. Throws if anything would
 *  make the engine misbehave at render time — better to fail fast on
 *  cold-start than to render a corrupt asset that ships in a customer's
 *  marketing zip. */
function validateTemplate(t: MarketingTemplate): void {
  if (!t.id || typeof t.id !== 'string') {
    throw new Error('[marketing/registry] template missing id')
  }
  if (!t.name || typeof t.name !== 'string') {
    throw new Error(`[marketing/registry] ${t.id}: missing name`)
  }
  if (!['promo','social','store','press'].includes(t.category)) {
    throw new Error(`[marketing/registry] ${t.id}: invalid category "${t.category}"`)
  }
  if (typeof t.version !== 'number' || t.version < 1) {
    throw new Error(`[marketing/registry] ${t.id}: invalid version ${t.version}`)
  }
  if (!Array.isArray(t.sizes) || t.sizes.length === 0) {
    throw new Error(`[marketing/registry] ${t.id}: must declare at least one size`)
  }
  if (!Array.isArray(t.layers) || t.layers.length === 0) {
    throw new Error(`[marketing/registry] ${t.id}: must declare at least one layer`)
  }
  if (!t.previewPath || typeof t.previewPath !== 'string') {
    throw new Error(`[marketing/registry] ${t.id}: missing previewPath`)
  }
  // Size labels must be unique within a template — the cache key includes
  // the label so duplicates would cause renders to overwrite each other.
  const labels = new Set<string>()
  for (const s of t.sizes) {
    if (labels.has(s.label)) {
      throw new Error(`[marketing/registry] ${t.id}: duplicate size label "${s.label}"`)
    }
    labels.add(s.label)
  }
}

/** Replace the whole registry. Idempotent — calling twice with the same
 *  set produces the same end state. Used by tests and by the Day 8
 *  bulk-import seed; production code should not call this. */
export function registerTemplates(input: MarketingTemplate[]): void {
  const seen = new Set<string>()
  for (const t of input) {
    validateTemplate(t)
    if (seen.has(t.id)) {
      throw new Error(`[marketing/registry] duplicate template id "${t.id}"`)
    }
    seen.add(t.id)
  }
  TEMPLATES = Object.freeze([...input])
  BY_ID.clear()
  for (const t of TEMPLATES) BY_ID.set(t.id, t)
}

// ─── Read API ───────────────────────────────────────────────────────────────

/** All templates, in insertion (== display) order. Frozen — callers must
 *  not mutate. */
export function listTemplates(): readonly MarketingTemplate[] {
  return TEMPLATES
}

/** Templates grouped by category, with stable order matching
 *  TEMPLATE_CATEGORIES. Used by the grid renderer to produce the four
 *  sectioned blocks (Promo Screens, Social Assets, Store Page, Press Kit). */
export function listTemplatesByCategory(): Record<TemplateCategory, readonly MarketingTemplate[]> {
  const groups: Record<TemplateCategory, MarketingTemplate[]> = {
    promo: [], social: [], store: [], press: [],
  }
  for (const t of TEMPLATES) groups[t.category].push(t)
  // Freeze the inner arrays so callers can't accidentally extend the
  // registry through a returned slice.
  return {
    promo:  Object.freeze(groups.promo),
    social: Object.freeze(groups.social),
    store:  Object.freeze(groups.store),
    press:  Object.freeze(groups.press),
  }
}

/** Look up a single template by id. Returns null when the id isn't
 *  registered — callers respond 404 rather than throwing, since the id
 *  comes off a URL param. */
export function getTemplate(id: string): MarketingTemplate | null {
  return BY_ID.get(id) ?? null
}

/** Compact metadata-only view of every template — used by the templates
 *  catalogue endpoint so the response stays small even once layer
 *  stacks get large. The Customise modal's preview render fetches the
 *  full template separately by id. */
export interface TemplateSummary {
  id:        string
  name:      string
  category:  TemplateCategory
  version:   number
  /** Just label + format pairs. The grid card uses these to show
   *  "256² · 512² · 1024² PNG". */
  sizes:     Array<{ w: number; h: number; label: string; format: string }>
  previewPath: string
}

export function listTemplateSummaries(): TemplateSummary[] {
  return TEMPLATES.map(t => ({
    id:          t.id,
    name:        t.name,
    category:    t.category,
    version:     t.version,
    sizes:       t.sizes.map(s => ({ w: s.w, h: s.h, label: s.label, format: s.format })),
    previewPath: t.previewPath,
  }))
}

// ─── Module-init bootstrap ──────────────────────────────────────────────────
//
// Register the shipped templates as soon as this module is imported. Any
// import of registry.ts (or anything that re-exports from it) lights the
// catalogue up. Validation errors crash the module, which crashes the
// route at cold-start — exactly what we want: a malformed template should
// never silently ship a broken render.

registerTemplates(SHIPPED_TEMPLATES)
