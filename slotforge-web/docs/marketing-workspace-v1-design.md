# Marketing Workspace v1 — Implementation Brief

**Audience:** Claude Code
**Author:** Ignacio (Spinative founder) + design plan from Cowork session
**Status:** Ready to implement
**Last updated:** 2026-04-26

---

## 0. Read these first

Before touching any code, load context from:

- `docs/features-v1-catalogue.md` — the asset-slot pattern this workspace mirrors
- `docs/prompt-architecture.md` — for understanding how project meta flows into prompts
- `public/Spinative_Pricing_Strategy_2026.docx` — confirms the plan-gate strategy
- `lib/features/registry.ts` — registry pattern to copy for templates
- `app/api/generate/route.ts` — SSE pattern + auth pattern to mirror
- `lib/supabase/authz.ts` — `assertProjectAccess` pattern (mandatory on every new route)
- `types/assets.ts` — `ProjectMeta` shape (gameName, themeKey, mood, palette, artBible, etc.)

The existing security audit flagged a critical issue with the `project-assets` Supabase bucket being public with permissive RLS. **Do not repeat that pattern for `marketing-renders`** — see §11.

---

## 1. What we're building (1 paragraph)

A functional Marketing workspace that takes the three core game-art inputs the studio has already produced (background, logo, character) plus the project meta and produces a complete, brand-consistent marketing kit at the press of a button: lobby tiles + operator banners (Promo Screens), social posts (Social Assets), app-store creatives (Store Page), and a press one-pager PDF (Press Kit). It replaces the inert "Coming Soon" cards currently rendered in the Marketing tab. **No AI image generation is involved** — this is pure composition over existing assets, so it is essentially zero-marginal-cost. The only AI call is a one-time background removal on the character asset, cached per project.

---

## 2. Current state (what exists today)

- **Tab exists, content is inert.** `public/editor/spinative.html` lines **634–709** render six placeholder cards inside `<div id="ws-marketing">`. Five show `mkt-badge-cs` ("Coming Soon"), one (GDD Export) is functional.
- **Topbar exists, button is a toast.** `public/editor/spinative.html` lines **221–224** define the Marketing topbar with a `+ New Asset` button (`#mkt-new-btn`). Wired in `public/editor/editor.js` line **~11505** to call `showToast('Asset creation coming soon')`. Replace this wiring.
- **Architecture:** the Marketing workspace lives inside the legacy editor iframe (`public/editor/spinative.html`, plain HTML/CSS/JS). It is a **sibling** of canvas/features/art/typography/flow/logic — see line **38** of `spinative.html` for the tab definition and line **10607** of `editor.js` for the workspace switcher.
- **GDD Export must stay untouched.** It is the only working flow. It opens via `openGDDModal()`. Leave it alone.

---

## 3. Architecture decision — keep it inside the iframe

**Build the new Marketing workspace inside the existing editor iframe**, as plain HTML/CSS/JS that replaces the placeholder cards. Heavy lifting (asset composition, render farm, BG removal, zip bundling) goes through new Next.js API routes under `app/api/marketing/*`.

**Why not a Next.js page?**

- The Marketing tab is one of seven editor workspaces (canvas, flow, logic, features, art, typography, marketing) all rendered as siblings inside `spinative.html`. Splitting just one out into a Next.js page breaks the navigation model and adds friction (full page reload between tabs).
- The composition complexity is in the API layer, not the UI. A clean separation keeps the iframe lean.
- Future migration to React is possible — a v2.0 effort, not v1.

**The split:**

| Layer | Where | Notes |
|---|---|---|
| UI (template grid, customise panel, preview, export) | `public/editor/marketing.js` (new) + replaced HTML in `spinative.html` | plain JS, no build step |
| Template registry | `lib/marketing/templates/*.json` (new) | served via API |
| Composition engine | `lib/marketing/compose.ts` (new) | sharp + @napi-rs/canvas |
| API routes | `app/api/marketing/*` (new) | SSE for renders, mirrors `app/api/generate` pattern |
| Storage | `marketing-renders` Supabase bucket (new, private) | signed URLs only |
| Database | `marketing_kits`, `marketing_renders` tables (new) | RLS via `assertProjectAccess` |

---

## 4. The 20 templates — full v1 catalogue

Distribution across the four active categories:

| Category | Count | Templates |
|---|---|---|
| Promo Screens | 8 | square_lobby_tile, portrait_lobby_tile, landscape_lobby_tile, hero_banner_desktop, hero_banner_mobile, side_rail_300x600, square_promo_300, leaderboard_728x90 |
| Social Assets | 8 | ig_square_post, ig_portrait_post, ig_story, fb_cover, x_header, linkedin_banner, yt_thumbnail, tiktok_cover |
| Store Page | 3 | app_icon_1024, gplay_feature_graphic_1024x500, app_store_screenshot |
| Press Kit | 1 | one_pager_a4_pdf |
| **Total** | **20** | |

### 4.1 Output sizes (per template)

| Template ID | Sizes shipped (px) | Format |
|---|---|---|
| `promo.square_lobby_tile` | 256², 512², 1024² | PNG |
| `promo.portrait_lobby_tile` | 600×800, 1200×1600 | PNG |
| `promo.landscape_lobby_tile` | 800×600, 1600×1200 | PNG |
| `promo.hero_banner_desktop` | 1920×600, 2400×800 | JPG |
| `promo.hero_banner_mobile` | 750×400, 1080×600 | JPG |
| `promo.side_rail_300x600` | 300×600 | JPG |
| `promo.square_promo_300` | 300×300, 600×600 | JPG |
| `promo.leaderboard_728x90` | 728×90, 970×250 | JPG |
| `social.ig_square_post` | 1080×1080 | JPG |
| `social.ig_portrait_post` | 1080×1350 | JPG |
| `social.ig_story` | 1080×1920 | JPG |
| `social.fb_cover` | 820×312 | JPG |
| `social.x_header` | 1500×500 | JPG |
| `social.linkedin_banner` | 1584×396 | JPG |
| `social.yt_thumbnail` | 1280×720 | JPG |
| `social.tiktok_cover` | 1080×1920 | JPG |
| `store.app_icon_1024` | 1024×1024 | PNG (no rounded corners — Apple/Google add their own) |
| `store.gplay_feature_graphic_1024x500` | 1024×500 | JPG |
| `store.app_store_screenshot` | 1242×2208, 1290×2796 | PNG |
| `press.one_pager_a4_pdf` | 2480×3508 (A4 @ 300dpi) | PDF (`pdf-lib`) |

**Total exportable creatives per game: ~32 files** in a single zip.

### 4.2 Customisation per template

Every template exposes the same `vars` schema:

| Var | Type | Default | Options |
|---|---|---|---|
| `gameName` | string | `project.gameName` | override allowed |
| `headline` | string | auto from theme | override allowed |
| `subhead` | string | auto from `bonusNarrative` | override allowed, can be empty |
| `ctaText` | enum | `PLAY NOW` | `PLAY NOW`, `SPIN NOW`, `TRY IT`, `NEW SLOT`, `LAUNCHING SOON`, none |
| `language` | enum | `EN` | `EN`, `ES`, `PT`, `DE`, `FR`, `IT`, `SV`, `JA` (CTAs are a curated string set, not auto-translated) |
| `colorMode` | enum | `auto` | `auto` (palette from project), `light`, `dark`, `studio_brand` (v1.1) |
| `layoutVariant` | enum | `A` | `A`, `B`, `C` (different anchors for character / logo / headline) |

`auto` color mode reads `ProjectMeta.colorPrimary`, `colorAccent`, `colorBg` and applies them to gradient overlays + CTA pills.

---

## 5. Data model — SQL migration

Append this to `supabase/migrations.sql` and apply via the Supabase SQL Editor.

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Marketing kits + renders
-- One row per (project, template) the user has rendered. Stores the user's
-- customisation choices so reopening shows their last kit.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketing_kits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id  text        NOT NULL,                        -- 'promo.square_lobby_tile'
  vars         jsonb       NOT NULL DEFAULT '{}'::jsonb,    -- chosen customisation
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_kits_project ON marketing_kits (project_id);

ALTER TABLE marketing_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages marketing_kits"
ON marketing_kits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- One row per (template, size, format) actually rendered. Cached so the user
-- doesn't pay for re-renders when nothing changed.
CREATE TABLE IF NOT EXISTS marketing_renders (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id       uuid        NOT NULL REFERENCES marketing_kits(id) ON DELETE CASCADE,
  size_label   text        NOT NULL,                        -- '1024x1024'
  format       text        NOT NULL CHECK (format IN ('png', 'jpg', 'webp', 'pdf', 'mp4', 'webm')),
  url          text        NOT NULL,                        -- signed Supabase Storage URL
  vars_hash    text        NOT NULL,                        -- sha256 of (vars + template_version + asset_versions)
  bytes        integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kit_id, size_label, format, vars_hash)
);

CREATE INDEX IF NOT EXISTS idx_marketing_renders_kit ON marketing_renders (kit_id);

ALTER TABLE marketing_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages marketing_renders"
ON marketing_renders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Storage bucket for rendered marketing assets — PRIVATE.
-- Per the v1 security audit, we do NOT repeat the public+permissive pattern
-- of project-assets. This bucket is private; access is via signed URLs only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-renders', 'marketing-renders', false)
ON CONFLICT (id) DO NOTHING;

-- Folder-scoped RLS: a user can only read/write objects under
-- <projectId>/... when they own that project's workspace.
CREATE POLICY "Owners only read marketing renders"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'marketing-renders'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM projects p
    JOIN workspaces w ON p.workspace_id = w.id
    WHERE w.clerk_org_id = auth.jwt() ->> 'sub'
  )
);

-- Writes always go through service-role (the API), so an INSERT/UPDATE/DELETE
-- policy for `authenticated` is intentionally omitted.
CREATE POLICY "Service role manages marketing renders bucket"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'marketing-renders')
WITH CHECK (bucket_id = 'marketing-renders');
```

**Note on schema drift:** the existing `supabase/migrations.sql` is known to be out of sync with production (see security audit H1). Do **not** rely on the file as the source of truth — pull production schema with `supabase db dump --schema public` first if anything looks off. After applying the new migration, regenerate `types/database.ts` so the new tables are typed.

---

## 6. API surface

All routes live under `app/api/marketing/`. All require Clerk auth + `assertProjectAccess` + Freelancer or Studio plan.

### 6.1 Routes

```
GET    /api/marketing/templates
       → static catalogue of all 20 templates with metadata + size lists
       → cached at the edge, no DB lookup

GET    /api/marketing/kits?project_id=<uuid>
       → list of all kits for the project (one row per template the user has touched)
       → each row includes vars + last render thumbnails

PUT    /api/marketing/kits/:templateId
       body: { project_id, vars }
       → upsert (project_id, template_id) row

POST   /api/marketing/render
       body: { project_id, template_id, size_labels: ['1024x1024',...], format }
       → SSE stream:
         - 'start' { total }
         - 'render' { size_label, url } per completed size
         - 'complete' { renders: [{ size_label, url, bytes }] }
         - 'error' { message }
       → mirrors the SSE pattern in app/api/generate/route.ts

POST   /api/marketing/render-all
       body: { project_id, categories?: ('promo'|'social'|'store'|'press')[] }
       → SSE stream, queued bulk render across all selected templates × all sizes
       → can take 30-90s; uses maxDuration: 300 like /api/generate

POST   /api/marketing/character/extract
       body: { project_id }
       → triggers Replicate cjwbw/rembg on the project's `character` asset
       → idempotent: if `character.transparent` already exists, returns its URL
       → result cached as a generated_assets row with type='character.transparent'

GET    /api/marketing/zip?project_id=<uuid>&render_ids=<csv>
       → streams a zip of selected renders
       → filename convention: <slug(gameName)>_<template_id>_<size_label>.<ext>
```

### 6.2 Plan gate

All routes return `403 { error: 'upgrade_required' }` if `canUseAI(plan) === false` (Free tier). The Marketing workspace is restricted to Freelancer + Studio. **No credit deduction** — composition is essentially free. Track render counts in logs only for analytics; do not gate.

### 6.3 Authz — mandatory checks

Every route handler in `app/api/marketing/*` MUST:

1. Get `userId` from `auth()`.
2. Pull `project_id` from body or query string.
3. Call `await assertProjectAccess(userId, project_id)` and return 404 if null.
4. Use `createAdminClient()` for service-role DB writes (consistent with the rest of the app).

---

## 7. JSON template schema

Templates are JSON, version-controlled in `lib/marketing/templates/`. One file per template. Loaded via the registry `lib/marketing/registry.ts`.

### 7.1 Schema

```ts
// lib/marketing/types.ts
export interface MarketingTemplate {
  /** Unique ID, dot-namespaced by category. e.g. 'promo.square_lobby_tile' */
  id: string
  /** Display name in the grid */
  name: string
  /** Display category — drives the section the card appears in */
  category: 'promo' | 'social' | 'store' | 'press'
  /** Schema version. Bump when layout changes; invalidates render cache. */
  version: number
  /** Sizes shipped for this template */
  sizes: TemplateSize[]
  /** Layer stack, rendered bottom-up */
  layers: Layer[]
  /** Schema for customisation fields */
  vars: TemplateVarsSchema
  /** Hardcoded preview image path used in the grid card before first render */
  previewPath: string
}

export interface TemplateSize {
  w: number
  h: number
  label: string                            // '1024x1024'
  format: 'png' | 'jpg' | 'webp' | 'pdf'
}

export type Layer =
  | AssetLayer
  | GradientLayer
  | ShapeLayer
  | TextLayer
  | CtaLayer
  | OverlayLayer

export interface AssetLayer {
  type: 'asset'
  /** Which project asset to draw */
  slot: 'background_base' | 'logo' | 'character' | 'character.transparent'
  fit: 'cover' | 'contain' | 'fill'
  anchor: Anchor
  /** Scale relative to the canvas (0..1). e.g. 0.85 = 85% of canvas height */
  scale?: number
  /** Padding inside the canvas in px (relative to the rendered size) */
  padding?: number | [top: number, right: number, bottom: number, left: number]
  /** Variant-specific overrides */
  variants?: Partial<Record<'A'|'B'|'C', Partial<Omit<AssetLayer, 'type'|'slot'>>>>
}

export interface GradientLayer {
  type: 'gradient'
  from: ColorRef                           // 'transparent' | hex | { var: 'colorPrimary' }
  to:   ColorRef
  direction: 'top' | 'bottom' | 'left' | 'right' | 'radial'
  /** Where in the layer to start the gradient (0..1) */
  start?: number
}

export interface ShapeLayer {
  type: 'shape'
  shape: 'rect' | 'pill' | 'circle' | 'rounded_rect'
  fill: ColorRef
  stroke?: { color: ColorRef; width: number }
  anchor: Anchor
  /** Size relative to canvas */
  size: { w: number | string; h: number | string }   // string for percentages: '60%'
  borderRadius?: number
}

export interface TextLayer {
  type: 'text'
  /** Either a literal or a template expression like '${gameName}' */
  value: string
  font: { family: string; weight: number; size: number; tracking?: number }
  color: ColorRef
  stroke?: { color: ColorRef; width: number }
  anchor: Anchor
  align: 'left' | 'center' | 'right'
  /** Width in px (or % string) — text wraps inside this */
  maxWidth?: number | string
}

export interface CtaLayer {
  type: 'cta'
  /** Variable name that resolves to the button text */
  valueVar: 'ctaText'
  style: 'pill' | 'flat' | 'outlined'
  font: { family: string; weight: number; size: number }
  bg: ColorRef
  fg: ColorRef
  anchor: Anchor
  padding: [v: number, h: number]
}

export interface OverlayLayer {
  type: 'overlay'
  src: string                              // path under public/marketing/overlays/
  opacity: number
  blendMode?: 'multiply' | 'screen' | 'overlay' | 'soft-light'
}

export type Anchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export type ColorRef =
  | string                                 // '#fff', 'rgba(0,0,0,0.6)', 'transparent'
  | { var: 'colorPrimary' | 'colorAccent' | 'colorBg' }   // resolved from ProjectMeta

export interface TemplateVarsSchema {
  gameName:      { source: 'project.gameName'; override?: boolean }
  headline?:     { default: string | null; override?: boolean }
  subhead?:      { default: string | null; override?: boolean }
  ctaText:       { default: 'PLAY NOW'; options: readonly string[] }
  language:      { default: 'EN'; options: readonly string[] }
  colorMode:     { default: 'auto'; options: readonly string[] }
  layoutVariant: { default: 'A'; options: readonly ('A'|'B'|'C')[] }
}
```

### 7.2 Reference template — `promo.square_lobby_tile`

```json
{
  "id": "promo.square_lobby_tile",
  "name": "Square Lobby Tile",
  "category": "promo",
  "version": 1,
  "sizes": [
    { "w": 256,  "h": 256,  "label": "256x256",   "format": "png" },
    { "w": 512,  "h": 512,  "label": "512x512",   "format": "png" },
    { "w": 1024, "h": 1024, "label": "1024x1024", "format": "png" }
  ],
  "layers": [
    {
      "type": "asset",
      "slot": "background_base",
      "fit": "cover",
      "anchor": "middle-center"
    },
    {
      "type": "gradient",
      "from": "transparent",
      "to": "rgba(0,0,0,0.65)",
      "direction": "bottom",
      "start": 0.4
    },
    {
      "type": "asset",
      "slot": "character.transparent",
      "fit": "contain",
      "anchor": "bottom-center",
      "scale": 0.85,
      "padding": 40,
      "variants": {
        "B": { "anchor": "bottom-right", "scale": 0.75 },
        "C": { "anchor": "bottom-left",  "scale": 0.75 }
      }
    },
    {
      "type": "asset",
      "slot": "logo",
      "fit": "contain",
      "anchor": "top-center",
      "scale": 0.7,
      "padding": 60
    },
    {
      "type": "text",
      "value": "${gameName}",
      "font": { "family": "Inter", "weight": 900, "size": 48, "tracking": 1.2 },
      "color": "#ffffff",
      "stroke": { "color": "rgba(0,0,0,0.45)", "width": 3 },
      "anchor": "bottom-center",
      "align": "center",
      "maxWidth": "85%"
    },
    {
      "type": "cta",
      "valueVar": "ctaText",
      "style": "pill",
      "font": { "family": "Inter", "weight": 800, "size": 18 },
      "bg": { "var": "colorAccent" },
      "fg": "#ffffff",
      "anchor": "bottom-right",
      "padding": [10, 20]
    }
  ],
  "vars": {
    "gameName":      { "source": "project.gameName", "override": true },
    "headline":      { "default": null, "override": true },
    "subhead":       { "default": null, "override": true },
    "ctaText":       { "default": "PLAY NOW", "options": ["PLAY NOW", "SPIN NOW", "TRY IT", "NEW SLOT", "LAUNCHING SOON", "none"] },
    "language":      { "default": "EN", "options": ["EN","ES","PT","DE","FR","IT","SV","JA"] },
    "colorMode":     { "default": "auto", "options": ["auto","light","dark"] },
    "layoutVariant": { "default": "A", "options": ["A","B","C"] }
  },
  "previewPath": "/marketing/previews/promo_square_lobby_tile.png"
}
```

The remaining 19 templates follow the same schema. **Build the engine first against this one template**, then add the rest in day 8 when the rendering loop is proven.

---

## 8. Composition pipeline

### 8.1 Libraries

```bash
npm install sharp @napi-rs/canvas pdf-lib archiver
npm install @types/archiver --save-dev
```

| Lib | Purpose |
|---|---|
| `sharp` | Raster operations: composite, resize, format conversion. Native, fast. |
| `@napi-rs/canvas` | Server-side Skia canvas. Used for: text rendering, gradients, shapes, CTA pills. Renders to a buffer that sharp then composites. |
| `pdf-lib` | The press one-pager. Embeds rendered PNGs + structured project data (RTP, volatility, paylines, max win). |
| `archiver` | Streaming zip for the bulk download endpoint. |
| `replicate` (already in stack? if not, add) | One-time character BG removal via `cjwbw/rembg`. |

### 8.2 Render function signature

```ts
// lib/marketing/compose.ts
export async function renderTemplate(
  template: MarketingTemplate,
  size: TemplateSize,
  vars: ResolvedVars,
  assets: ResolvedAssets,
  project: ProjectMeta
): Promise<Buffer>

interface ResolvedVars {
  gameName: string
  headline: string | null
  subhead:  string | null
  ctaText:  string         // already localised + resolved to literal
  language: string
  colorMode: 'auto' | 'light' | 'dark'
  layoutVariant: 'A' | 'B' | 'C'
  /** Resolved colors: 'auto' → palette from project, else theme defaults */
  resolvedColors: { primary: string; accent: string; bg: string }
}

interface ResolvedAssets {
  background_base:        Buffer | null
  logo:                   Buffer | null
  character:              Buffer | null
  'character.transparent': Buffer | null   // null → fall back to character with bg-removal warning
}
```

The render function:

1. Creates an `@napi-rs/canvas` of `(size.w, size.h)`.
2. Iterates `template.layers`, calling a per-layer-type renderer that draws to the canvas.
3. For asset layers: passes the asset Buffer to sharp, resizes to fit/cover/contain, returns a buffer, draws via `ctx.drawImage`.
4. For text/shape/cta layers: pure canvas operations.
5. For gradient layers: `ctx.createLinearGradient` or `ctx.createRadialGradient`.
6. Variants are resolved by merging `layer.variants?[vars.layoutVariant]` into the layer config before rendering.
7. Color refs `{ var: 'colorPrimary' }` resolve to `vars.resolvedColors.primary`.
8. Returns the encoded buffer in the requested format (`size.format`).

### 8.3 Caching — `vars_hash`

Before every render, compute:

```ts
import { createHash } from 'crypto'

const hash = createHash('sha256').update(JSON.stringify({
  template_id: template.id,
  template_version: template.version,
  size_label: size.label,
  format: size.format,
  vars,
  asset_versions: {
    background_base: project.assetVersions.background_base,
    logo: project.assetVersions.logo,
    character: project.assetVersions['character.transparent'] ?? project.assetVersions.character,
  }
}))
.digest('hex')
```

Then `SELECT url FROM marketing_renders WHERE kit_id = $1 AND size_label = $2 AND format = $3 AND vars_hash = $4`. If a row exists, return the URL. Otherwise render, upload to Storage, insert the row.

This makes re-opening a kit page instant and idempotent — you only pay (in compute) for renders that genuinely changed.

### 8.4 Localisation

CTA text is a hand-curated string set:

```ts
// lib/marketing/i18n.ts
export const CTAS = {
  EN: { 'PLAY NOW': 'PLAY NOW', 'SPIN NOW': 'SPIN NOW', 'TRY IT': 'TRY IT', 'NEW SLOT': 'NEW SLOT', 'LAUNCHING SOON': 'LAUNCHING SOON' },
  ES: { 'PLAY NOW': 'JUGAR YA', 'SPIN NOW': 'GIRAR', 'TRY IT': 'PRUÉBALO', 'NEW SLOT': 'NUEVA SLOT', 'LAUNCHING SOON': 'PRÓXIMAMENTE' },
  PT: { 'PLAY NOW': 'JOGAR AGORA', ... },
  // ... 8 languages × 5 CTAs = 40 hand-checked strings
}
```

`vars.ctaText` is the canonical key (`'PLAY NOW'`); `CTAS[language][key]` is what actually renders. Subhead translations are auto-generated via gpt-4o on first render and cached in the kit row's `vars` blob. **Do not auto-translate CTAs** — they're too short and operator-facing.

---

## 9. Character background removal — explanation + decision

You wanted clarification on this. The TL;DR:

- The character on a banner needs to have **no background** behind it (otherwise you get a square block of the original art covering the new banner background).
- "Cutting out" the character requires an AI/ML model that detects the subject and removes the background.
- Result is a transparent PNG.

**v1 decision: server-side via Replicate `cjwbw/rembg`.**

- Cost: $0.002 per character (ONE-time per project, cached forever).
- Quality: noticeably better than client-side WASM models.
- No 50MB browser download for the user.
- Trigger: lazily, the first time the user opens the Marketing tab AND the project doesn't have `character.transparent` in its `generated_assets` rows.
- Endpoint: `POST /api/marketing/character/extract` (idempotent — returns existing URL if already cached).

Implementation:

```ts
// lib/marketing/bgremove.ts
import Replicate from 'replicate'

export async function extractTransparentCharacter(characterUrl: string): Promise<string> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })
  const output = await replicate.run('cjwbw/rembg:fb8af171...', {
    input: { image: characterUrl }
  })
  return output as string   // URL of the transparent PNG
}
```

Add `REPLICATE_API_TOKEN` to `.env.example`. The output URL is then downloaded server-side and stored as a `generated_assets` row with `type='character.transparent'` so it shows up in the standard asset pipeline.

If the project's character asset has good transparency baked in already (e.g. if the AI prompt enforced transparent BG), `character.transparent` falls back to the original `character` asset. The pipeline checks this on read.

---

## 10. UX flow

### 10.1 First-time entry

User clicks the Marketing tab → workspace loads → JS checks:
1. Does the project have `background_base`, `logo`, `character` assets? (call `GET /api/marketing/kits` — server returns kit list + a `readiness` flag indicating which assets are present)
2. If NO → show a "Getting ready" empty state with checkboxes for missing assets and a "Go to Generate tab" CTA.
3. If YES but no `character.transparent` → fire `POST /api/marketing/character/extract` in the background, show "Preparing character art… 5–8s" toast.
4. Once ready → render the template grid.

### 10.2 Template grid

Replace lines **648–705** of `spinative.html` with a single container that JS populates from `GET /api/marketing/templates`.

Card layout (per template):

```
┌────────────────────────────┐
│  ┌──────────────────────┐  │
│  │   live preview img   │  │   ← rendered at 1024 once, cached
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  Square Lobby Tile         │
│  256² · 512² · 1024²  PNG  │
│                            │
│  [Customize]   [Render]    │
└────────────────────────────┘
```

Group cards by category with section headers: `Promo Screens (8)`, `Social Assets (8)`, `Store Page (3)`, `Press Kit (1)`.

### 10.3 Customise modal

Click `Customize` → modal opens with:

- Live preview at the largest size (1024 max width)
- All `vars` as form inputs:
  - `gameName` — text input, prefilled from `project.gameName`
  - `headline` — text input, optional override
  - `subhead` — text input, optional override
  - `ctaText` — dropdown, 6 options
  - `language` — dropdown, 8 options
  - `colorMode` — dropdown, 3 options
  - `layoutVariant` — radio A/B/C with mini-thumbnails
- Size checkboxes (which sizes to render on export)
- `[Save]` and `[Render selected sizes]` buttons

Re-render preview on every change, debounced 300ms. Use a single small render at preview size (max 1024) — full export sizes happen on `Render` click.

### 10.4 Workspace-level actions

Topbar `+ New Asset` button (currently a toast) — repurpose to **`Export all`**:

```
[ Export all kit ▾ ]
   ├ All categories (32 files)
   ├ Promo Screens only (16 files)
   ├ Social Assets only (8 files)
   ├ Store Page only (5 files)
   └ Press Kit only (1 file)
```

Triggers `POST /api/marketing/render-all` → SSE progress → final zip download. Filename: `<slug(gameName)>_marketing-kit_v1.zip`.

---

## 11. Security requirements

These are **mandatory** based on the v1 security audit findings. Do not skip.

1. **Private storage bucket** `marketing-renders` (already in §5 SQL). Public reads OFF.
2. **Folder-scoped RLS** on storage objects (already in §5 SQL). The path scheme MUST be `<projectId>/<template_id>__<size_label>__<vars_hash>.<ext>` — the first folder segment is the project ID, which the RLS policy uses to verify ownership.
3. **Signed URLs only** for download. Use `supabase.storage.from('marketing-renders').createSignedUrl(path, 60 * 60)` (1h expiry). Store the path, not the URL, in `marketing_renders.url` if you want long-term records — re-sign on read. Actually the cleaner approach: store the path, expose a thin wrapper `GET /api/marketing/render-url?id=<render_id>` that re-signs on demand.
4. **`assertProjectAccess` on every route** (already in §6.3). No exceptions.
5. **Magic-byte validation** is not needed here because we own the writes — the API is the only writer. But verify input asset URLs all resolve to your own Supabase Storage origin before downloading them server-side (prevent SSRF).
6. **No fire-and-forget side effects.** Renders complete fully before responding. The credit-deduction race condition that exists in `/api/generate` does NOT apply here (no credits to deduct).
7. **Plan gate** check at the top of every route — same `getOrgPlan(effectiveId)` + `canUseAI(plan)` pattern.

---

## 12. Day-by-day implementation order

Aim for **10 working days** total. Each day ends in a demoable artifact.

| Day | Goal | Artifact |
|---|---|---|
| 1 | Schema + types + registry skeleton | Migration applied, `lib/marketing/types.ts` + empty `lib/marketing/registry.ts`, empty `app/api/marketing/templates/route.ts` returning `[]` |
| 2 | Composition engine v1 against ONE template | Working render of `promo.square_lobby_tile` at 1024² to a local PNG. Sharp + Skia confirmed working in serverless. |
| 3 | Storage upload + cache + signed URLs | `marketing_renders` rows being created; `lib/marketing/cache.ts` resolves vars hash → cached URL or new render |
| 4 | `POST /api/marketing/render` with SSE | curl-able SSE stream that renders 3 sizes of the reference template and emits per-size events |
| 5 | UI scaffolding inside the iframe | `public/editor/marketing.js` (new) replaces the placeholder cards, template grid renders from the API, `+ New Asset` button removed |
| 6 | Customise modal + live preview + `PUT /kits` | Modal opens, vars persist, preview re-renders on change |
| 7 | Character BG removal flow | Replicate integration, `character.transparent` cached as a `generated_assets` row, fallback to `character` if extraction fails |
| 8 | Build out the remaining 19 templates | All 20 templates render, all sizes ship; visual QA pass with one real project |
| 9 | Bulk render + zip export | `Export all` works end-to-end; filenames follow the convention; performance validated at <90s for the full kit |
| 10 | Polish, plan gate UX, empty states, error handling, billing copy | Free-tier shows upgrade modal; missing-asset state is helpful; render errors don't kill the whole batch |

If any day overruns, push the catalogue (day 8) — start with 5–8 templates and add the rest after launch.

---

## 13. File-level changes

### 13.1 New files

```
lib/marketing/
├── types.ts                     # MarketingTemplate, Layer types, vars schema
├── registry.ts                  # loads + validates all templates from JSON
├── compose.ts                   # renderTemplate() — sharp + @napi-rs/canvas
├── cache.ts                     # vars_hash + render cache lookup
├── bgremove.ts                  # Replicate cjwbw/rembg wrapper
├── i18n.ts                      # CTA strings × 8 languages
├── pdf.ts                       # one-pager PDF (pdf-lib)
└── templates/
    ├── promo.square_lobby_tile.json
    ├── promo.portrait_lobby_tile.json
    ├── promo.landscape_lobby_tile.json
    ├── promo.hero_banner_desktop.json
    ├── promo.hero_banner_mobile.json
    ├── promo.side_rail_300x600.json
    ├── promo.square_promo_300.json
    ├── promo.leaderboard_728x90.json
    ├── social.ig_square_post.json
    ├── social.ig_portrait_post.json
    ├── social.ig_story.json
    ├── social.fb_cover.json
    ├── social.x_header.json
    ├── social.linkedin_banner.json
    ├── social.yt_thumbnail.json
    ├── social.tiktok_cover.json
    ├── store.app_icon_1024.json
    ├── store.gplay_feature_graphic_1024x500.json
    ├── store.app_store_screenshot.json
    └── press.one_pager_a4_pdf.json

app/api/marketing/
├── templates/route.ts           # GET — static catalogue
├── kits/route.ts                # GET — list user's kits for a project
├── kits/[templateId]/route.ts   # PUT — upsert kit vars
├── render/route.ts              # POST — single template SSE render
├── render-all/route.ts          # POST — bulk SSE render
├── render-url/route.ts          # GET — re-sign a render URL
├── character/extract/route.ts   # POST — Replicate BG removal
└── zip/route.ts                 # GET — stream zip of selected renders

public/editor/
├── marketing.js                 # NEW — replaces inline marketing JS
└── marketing.css                # NEW — extracted marketing styles (optional)

public/marketing/previews/       # 20 hand-rendered preview PNGs (one per template)
public/marketing/overlays/       # any sparkles/bokeh assets used by overlay layers
public/marketing/fonts/          # Inter / display fonts shipped for canvas rendering

supabase/
└── migrations.sql               # APPENDED with the §5 SQL block
```

### 13.2 Files to modify

| File | What |
|---|---|
| `public/editor/spinative.html` lines 632–712 | Replace the inert `<div id="ws-marketing">` body with a minimal scaffold that `marketing.js` populates. Keep the GDD Export card untouched. |
| `public/editor/spinative.html` lines 220–225 | Replace `+ New Asset` button with `+ Export all kit ▾` dropdown trigger |
| `public/editor/editor.js` line ~11505 | Remove the `mkt-new-btn` toast wiring; load `marketing.js` instead. Add init in `wireMarketingWorkspace()` |
| `public/editor/editor.js` line ~10607 | When workspace switches to `marketing`, ensure `marketing.js` is initialised once |
| `.env.example` | Add `REPLICATE_API_TOKEN=r8_...` |
| `package.json` | Add `sharp`, `@napi-rs/canvas`, `pdf-lib`, `archiver`, `replicate` |
| `types/database.ts` | Regenerate after migration applies |
| `lib/billing/plans.ts` | Add `marketingEnabled` boolean per plan (true for freelancer + studio, false for free) |
| `lib/billing/subscription.ts` | Add `canUseMarketing(plan)` helper |
| `vercel.json` | Add `app/api/marketing/render-all/route.ts: { maxDuration: 300 }` |

### 13.3 Files to leave alone

- `app/api/generate/route.ts` and the rest of `/api/generate/*` — different system, do not touch
- `app/(marketing)/route.ts` — this is the **public landing page**, not the workspace. Naming clash, but separate concern. Don't confuse them.
- The GDD Export card and `openGDDModal()` flow

---

## 14. Acceptance criteria

The v1 ships when every item below is true:

- [ ] A user with a complete project (bg + logo + char + meta) can open Marketing, see all 20 templates rendered with their actual assets, customise any one, and export selected sizes — in under 30 seconds end-to-end.
- [ ] `Export all kit` produces a zip of ~32 files in under 90 seconds.
- [ ] Re-opening a kit shows previously-rendered creatives instantly (cached).
- [ ] Changing any var triggers a fresh render only for affected size combos; others stay cached.
- [ ] Free-tier users see an upgrade modal when clicking Marketing.
- [ ] Background removal triggers automatically on first entry, takes <10s, falls back gracefully if Replicate fails.
- [ ] `marketing-renders` bucket is private; access is via signed URL only; security audit re-run passes the bucket policy check.
- [ ] All 8 categories of Social Assets render correctly at platform-spec sizes.
- [ ] The Press Kit one-pager PDF embeds the rendered hero image + structured project data (RTP, volatility, paylines, max win, mechanics list).
- [ ] Filenames in the zip follow `<slug(gameName)>_<template_id>_<size_label>.<ext>`.
- [ ] No new ESLint or TypeScript errors. `npm run typecheck` passes clean.
- [ ] All routes have `assertProjectAccess` and the plan gate.

---

## 15. Out of scope (v1.1 / v1.2)

| Feature | Version | Reason |
|---|---|---|
| Brand kit (saved color themes, custom CTAs, studio logo lockup) | v1.1 | Unlocks Studio-tier upsell, but not blocking v1 |
| Trailer / animated assets (logo loops, character idle animations, parallax bg) | v1.2 | Material complexity — Puppeteer + ffmpeg pipeline. Keep the Trailer card "Coming Soon" for now. |
| Custom-size renders (user enters w×h) | v1.1 | Useful but specs are already comprehensive |
| Operator-specific template packs (e.g. "Stake-spec lobby tiles") | v2.0 | Sales-led, not core |
| Real-time collaborative editing of marketing kits | v2.0 | Multi-seat is already a Studio feature; not a marketing-specific concern |
| AI variants of existing assets (regenerate bg for a specific banner crop) | v2.0 | Explicitly excluded by current scope decision (compose existing assets only) |

---

## 16. Open questions for Ignacio

Drop the answers in chat or in this doc and Claude Code can pick up. None of these block day 1 — defaults are picked.

1. **Default headline copy** when the user hasn't overridden it. Options:
   - `(a)` Just the gameName (default)
   - `(b)` "NEW from {studioName}" (requires studio name in project meta)
   - `(c)` Theme-derived ("WIN BIG IN THE WILD WEST" for theme=western)
   - **Default: (a)** — safest, no extra meta dependency.

2. **Render preview thumbnail strategy.** Options:
   - `(a)` Hand-render a generic preview per template, use the same image for all projects (faster grid load).
   - `(b)` Use the user's actual assets to render a small thumbnail per template on first grid load (slower load, but the grid sells the product harder).
   - **Default: (b)** — the moment of "wow, those are MY assets" is what makes this feature memorable.

3. **Subhead auto-translation.** Whether to call gpt-4o for non-EN subhead translations. Options:
   - `(a)` Yes, cache per-language in the kit's vars blob. Cost: ~€0.001 per language × 7 langs = €0.007 per kit.
   - `(b)` No, English subhead only in v1; localise in v1.1.
   - **Default: (a)** — cost is negligible, value is high.

4. **Watermarking.** Even though everything is on Freelancer+ plans, do we ever want a "Made with Spinative" watermark? Options:
   - `(a)` Never — they're paying customers.
   - `(b)` Optional toggle defaulting OFF.
   - **Default: (a)** — clean, professional.

---

**End of brief.** Claude Code: start with day 1. If you hit a blocker, write to a new file `docs/marketing-workspace-v1-decisions.md` with the open question and your proposed answer; Ignacio will resolve.
