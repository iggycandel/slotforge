# Phase 2 — Overnight Session Summary

**Date:** 2026-04-20 (overnight work)
**Scope:** Extend the feature-asset pattern from Bonus Pick to the full v1 registry, fix all surfaced bugs, polish.

## What changed

### Vertical-slice expansion — all 5 v1 features now render from asset slots

Each of Free Spins, Bonus Pick, Hold & Spin, Buy Feature and Expanding Wild now reads its canvas art from `EL_ASSETS[<feature>.<slot>]`, with a dashed placeholder (labelled with slot key + "⬆ UPLOAD" hint) when empty. Same pattern end-to-end: upload anywhere → slot fills immediately → no save/reload needed.

| Feature | Canvas surfaces |
|---|---|
| **Free Spins** | top-level tab group with Intro / In-round / Outro sub-tabs. In-round overlays the spin counter frame (top-right) and multiplier badge (top-left) over the normal reel grid. Intro and Outro are dimmed banners with collect-CTA. |
| **Bonus Pick** | its own top-level tab group with Intro / Pick / Outro sub-tabs. Pick grid is square-tile (4×3 by default), cover-fit on tile_closed, and centered vertically. |
| **Hold & Spin** | top-level tab group with Intro / In-round / Outro sub-tabs. In-round shows respin counter (top-center) and 4 jackpot tier badges (Grand/Major/Minor/Mini) stacked right. |
| **Buy Feature** | `buy.button` overrides the base-game `bannerBuy` position when uploaded. |
| **Expanding Wild** | `expandwild.expanded_overlay` cover-fits over the highlighted reel column in `buildEWOverlay`. |

### Features workspace — "Assets needed" per enabled feature

The editor's Features tab now renders a compact Assets-needed panel right under each enabled feature's config. Each slot shows a coloured dot (green = uploaded, red-outline = required+missing, grey = optional+missing), its friendly label, and the namespaced slot key. Count pill on the right turns green when every required slot is filled. **Live-refreshes** on every asset upload via `SF_INJECT_IMAGE_LAYER` → `buildFeatures()`.

### Layers panel — feature slots now visible

`_sendLayersUpdate` walks `#feature-screen-overlay [data-asset-key]` and emits a synthetic layer per slot with its friendly label (deduped by key). So switching to a feature screen now lists Background / Header / Tile (closed) / Footer / … in the right-side Layers panel instead of just the base `bg`. Wired to fire after both overlay-rebuild paths (tab switch + upload).

### Assets panel + full Assets workspace

Both the right-sidebar `AssetsPanel` and the full-page `AssetsWorkspace` now group slots into collapsible sections with gold headers. Base-game categories sit under a `◆ BASE GAME` divider, feature slots under `✦ FEATURES`. Feature slot rows auto-inject into the canvas via `SF_INJECT_IMAGE_LAYER` on upload.

### Bugs fixed

1. **Replace broke the canvas** — `SF_INJECT_IMAGE_LAYER` now rebuilds the feature overlay after `buildCanvas` so no slot disappears when you replace one.
2. **20s delay on first open** — `features` is seeded in the initial `editorMeta` from the payload, not just via autosave.
3. **Free Spins bg upload didn't render** — feature-namespaced bg keys (`freespins.bg`, `holdnspin.bg`, `bonuspick.bg`) now take priority over `bg_<screen>` in both bg render paths, and the map also covers every sub-tab.
4. **Feature sub-screen SDEF leak** — toggling a feature off now also cleans up its intro / outro screens from SDEFS.
5. **Redundant bg draw in `_ovPickOutro`** — removed after the feature-bg map made the base bg render the right asset already.
6. **Tile aspect ratio** — Bonus Pick tiles are now square (`min(widthPerCol, heightPerRow)`) with `object-fit: cover` for uploaded art.
7. **Legacy label legibility** — `LibraryRow` labels match `FeatureSlotRow` (13 px, always text-primary).

### Polish

- Placeholder dashed boxes now show an "⬆ UPLOAD" hint so they read as affordances, not broken states.
- Collapsible section headers in the Assets panel with chevron indicators.
- Gold dividers separate base-game from feature sections.
- Required slots marked with a red `*` in row labels.

## Commits in this session (10 total, all pushed to origin/main)

```
e84a7ca feat(features): live refresh of Features workspace + upload affordance
b70a19d fix(features): cleanup leaks + bg propagation to sub-tabs + outro dedup
a0fc70e feat(features): Features workspace shows 'Assets needed' per enabled feature
abdc2aa feat(features): Buy Feature button + Expanding Wild asset overlays
68bd1d3 feat(features): asset-driven overlays + sub-tabs for Free Spins and Hold & Spin
71db309 fix(features): Layers panel surfaces slots; FS bg upload works; font parity
294b271 feat(features): Bonus Pick intro / pick / outro sub-tabs
6bc0647 feat(features): feature slot sections in the full Assets workspace
e5e619d feat(features): collapsible asset groups + gold headers + legible slot names
ec597d7 fix(features): feature overlay survives upload; init without 20s wait
e861a40 feat(features): Phase 2 — Assets workspace integration for feature slots
```

Plus this doc (committed separately).

## Verification

- `npm run typecheck` — clean
- `node --check public/editor/editor.js` — clean
- `npm run build` — clean (Vercel auto-deploys on push)

**`EDITOR_VERSION` is now v67.** Hard-refresh the editor to pick up every change.

## Morning checklist

1. Open a project with several features enabled.
2. Confirm each feature has its own top-level tab with Intro / Round / Outro sub-tabs: Free Spins, Bonus Pick, Hold & Spin.
3. In the right-side Assets panel → Features section → upload to a slot on any feature → matching slot on the canvas fills in live.
4. Open the Features workspace → each enabled feature shows a "Assets needed" card that updates as you upload.
5. Check the Layers panel on each feature sub-tab — it should list the slot layers you see on canvas.
6. Try disabling + re-enabling a feature — sub-tabs disappear + come back cleanly.
7. The legacy Backgrounds / High / Low / Special / UI & Chrome categories have the same collapsible UX with gold headers.

## Still-open Phase 2 items (not shipped tonight)

- **Click-to-resize the Bonus Pick grid** — bigger UX work (draggable handles on the tile area, bind to `P.bonusPickSettings`). Nothing broken today, but the user asked for it earlier. Ready for its own commit when you give the nod.
- **Full AI-generation path for feature slots** — today they're upload-only; AI gen would route through `/api/ai-single` with the namespaced slot key once the prompt-builder grows a per-slot prompt.
- **Stripping unused slots** — the catalogue has conditional slots (e.g. `freespins.multiplier_badge` only when `multiplierMode != 'none'`). Today we always show all default slots. Will tighten once the Features panel form feeds real settings into the registry.

These three are the residual Phase 2/3 work. Everything else in the catalogue is shipped.
