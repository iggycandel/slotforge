# Spinative — AI Prompt Architecture

Living doc. Mirrors the code in `lib/ai/promptBuilder.ts`. Edit freely as the
system changes; the implementation is the source of truth and this file
should stay in sync.

Last sync: editor commits up to commit with Part A/B of AI-gen overhaul.

---

## 1. One sentence

Every image the app generates is built from **six composable layers** that are
concatenated into a single prompt string before being sent to gpt-image-1.
Some layers come from the project's saved settings, others from per-generation
user choices, and some are invariant quality/negative guard rails.

---

## 2. The six layers (hierarchy, top = strongest signal)

```
┌──────────────────────────────────────────────────────────────┐
│ 1. IDENTITY            style modifier + theme + game name    │  ← project
├──────────────────────────────────────────────────────────────┤
│ 2. TEMPLATE            category-specific base                │  ← constant
├──────────────────────────────────────────────────────────────┤
│ 3. CONTEXT             mood, palette, world, story, notes    │  ← project
├──────────────────────────────────────────────────────────────┤
│ 4. DIFFERENTIATOR      tier / suit / symbol name / frame /   │  ← per-asset
│                        predominant colour                    │
├──────────────────────────────────────────────────────────────┤
│ 5. QUALITY BLOCKS      readability + consistency + quality   │  ← invariant
├──────────────────────────────────────────────────────────────┤
│ 6. NEGATIVE PROMPT     universal + framing + scene-text /    │  ← invariant
│                        symbols + style-specific negatives    │
└──────────────────────────────────────────────────────────────┘
```

The six layers get joined with `, ` and sent as a single string. Negatives are
emitted as a separate `negativePrompt` field the provider either consumes
natively (Runway) or folds into its own internal guard rails (OpenAI).

---

## 3. Layer-by-layer

### 3.1 Identity

**Goes first because it's the strongest signal.** gpt-image-1 anchors the
whole composition on the first few phrases of the prompt.

Source of each fragment:

| Fragment                  | Where from                                         | File |
|---------------------------|----------------------------------------------------|------|
| Style modifier            | `GRAPHIC_STYLES[styleId].promptModifier`           | `lib/ai/styles.ts` |
| Game name (in quotes)     | `projectMeta.gameName`                             | editor → React shell |
| Theme                     | `theme` param (popup / request) or fallback        | Project Settings |

Resolution order (from `buildIdentityAnchor` in `promptBuilder.ts`):

```
1. styleId param                    ← popup / request override
2. meta.styleId                     ← project default
3. meta.artStyle as a styleId       ← newer payloads mirror styleId here
4. meta.artStyle as free text       ← LEGACY fallback, emits "X art style"
```

**Backgrounds drop the game name** (`omitGameName: true`). Without this,
gpt-image-1 treats "Jim Boom Boom" as a brand to paint on every storefront.
The game name belongs on the logo asset.

### 3.2 Template

Hardcoded per asset category. Lives in `TEMPLATES` in
`lib/ai/promptBuilder.ts`.

| Category         | Example (truncated)                                                    |
|------------------|------------------------------------------------------------------------|
| `background`     | "slot game background scene, wide panoramic vista, ..., clean empty backdrop for UI overlay, no text or signage anywhere" |
| `symbol_high`    | "single slot game high-value symbol, elaborate surface detail, bold dominant silhouette, square composition" |
| `symbol_low`     | "single slot game low-value card symbol, clean readable shape, clear rank silhouette, square composition" |
| `symbol_wild`    | "slot game Wild symbol, powerful centerpiece icon, plaque area reserved for WILD text" |
| `symbol_scatter` | "slot game Scatter/Bonus symbol, mystical reward object, radiant emanating light" |
| `logo`           | "slot game title logo treatment, metallic gold 3D lettering, wide banner format" |
| `reel_frame`     | "slot machine reel window frame, decorative architectural border only, hollow transparent center" |
| `spin_button`    | "slot machine spin button UI element, 3D game button, integrated arrow motif" |
| `jackpot_label`  | "casino jackpot display badge, ornamental glowing banner shape, bold JACKPOT lettering" |

Feature slots (`bonuspick.bg`, `freespins.intro_banner`, etc.) have their own
templates in `FEATURE_SLOT_SPECS`, same file.

### 3.3 Context

Per-project meta fields injected as individual lines. Source:
`projectMeta` (sent from the editor's `buildEditorMeta()`).

| Field              | Projected as                                               | Applied to         |
|--------------------|------------------------------------------------------------|--------------------|
| `mood`             | `"<mood> atmosphere"`                                      | every asset        |
| `colors` (3× hex)  | `"colour mood inspired by <named tones> (use as cues...)"` | every asset        |
| `setting`          | `"world: <sanitized text>"`                                | backgrounds only   |
| `story`            | `"narrative atmosphere: <sanitized text>"`                 | backgrounds only   |
| `bonusNarrative`   | `"bonus scenario: <sanitized text>"`                       | `background_bonus` only |
| `artNotes`         | `"art direction: <sanitized text>"`                        | every asset        |
| `artRef`           | `"visual reference: <sanitized text>"`                     | every asset        |

**Two sanitization passes** run on all free-text fields before injection:

1. `sanitizeUserText` — strips control chars, newlines, and injection verbs
   (`ignore`, `disregard`, `override`, `bypass`, `jailbreak`, `new instructions`).
   Caps length at 240 chars per field.
2. `sanitizeForBackground` — **only for background assets** — rewrites
   text-inviting words into neutral atmospheric equivalents before the
   setting/story/bonusNarrative lines are emitted. 27-entry replacement
   table covering:
   - "neon signage" → "neon lighting"
   - "signs / signage" → "atmospheric props"
   - "graffiti / tagging" → "textured weathered walls"
   - "billboards / posters / banners" → "abstract panels / weathered wall surfaces / colored fabric"
   - "vandalism" → "gritty atmosphere"
   - "logos / brands / labels / titles / text / letters / typography" → neutral equivalents

**Hex → named colour** conversion uses `nearestColorName` against a 32-entry
palette (`warm gold`, `deep indigo`, `soft peach`, etc.). Raw hex values used
to over-rotate the whole scene onto 3 tones; names are softer mood cues.

### 3.4 Differentiator

The per-asset layer that makes each slot distinct from its siblings. Built
inside `buildPrompt` directly; differs sharply per category:

**High symbols** (`symbol_high_1..8`):
- `HIGH_SYM_TIER[tier - 1]` — tier language, e.g. `"tier-1 highest-value icon, most elaborate ornamentation, strongest glow, dominant visual weight"`
- `"depicted as: <name>"` — if `projectMeta.symbolHighNames[idx]` is set

**Low symbols** (`symbol_low_1..8`):
- `LOW_SYM_TIER[tier - 1]` — neutral tier language (`"tier-1 low-value icon, strongest silhouette..."`).
  **Note:** these used to be playing-card ranks ("Ace", "King", "Queen"...),
  which locked non-card themes into a card aesthetic. Replaced with tier-
  neutral wording.
- `"depicted as: <name>"` — if `projectMeta.symbolLowNames[idx]` is set

**Special symbols** (`symbol_wild`, `symbol_scatter`, `symbol_special_3..6`):
- `"bonus symbol depicted as: <name>"` — only

**Backgrounds** (`background_base`, `background_bonus`):
- `"bonus scenario: <sanitized bonus narrative>"` — bonus only
- Otherwise no differentiator

**Symbol hints (Part B — per-generation, not per-project):**
When popup submits with `symbol_frame` / `symbol_color`:
- Frame ON: `"inside an ornate gem-studded metallic frame, premium slot symbol badge with decorative border, polished metallic rim, icon sits within the frame"`
- Frame OFF: `"no decorative frame or border, pure isolated subject, no ornamental ring or badge shape around the icon, clean cutout against transparency"`
- Colour (TIER ACCENT — not dominant): `"tier-distinguishing accent in <colour>, applied as a secondary highlight on this tier only; the project's colour mood remains the dominant palette"`

**Priority rule between project palette (§3.3) and tier accent:**

The project palette in §3.3 Context is the dominant signal — injected as a
mood cue with softer "inspired by" wording. Tier colour in §3.4 is phrased
as a secondary accent that only highlights the current tier. The two no
longer compete for dominance.

The popup reflects this in two ways:
1. When the project has any colour set (`colorPrimary` / `colorBg` /
   `colorAccent`), the Tier-accent picker defaults to `'none'` so the
   palette stays uncontested. A footnote in the popup explains why.
2. When the project palette is empty, the tier default ⭑ is pre-selected
   as before (the palette isn't there to take precedence).

These only apply to high/low/wild/scatter categories; feature slots ignore them.

**Tier-to-colour default palette** (Part B — `tierColorPalette`):

| Tier count | Palette (warm → cold, tier 1 → tier N)                                          |
|------------|----------------------------------------------------------------------------------|
| 4          | bright red · royal purple · emerald green · deep navy                            |
| 5          | bright red · royal purple · warm orange · emerald green · deep navy              |
| 6          | bright red · royal purple · warm orange · emerald green · teal · deep navy       |
| 7          | + bright gold between orange and emerald green                                   |
| 8          | + magenta between bright red and royal purple                                    |

### 3.5 Quality blocks

Three constants appended to **every** prompt. Lives at the top of
`promptBuilder.ts`.

| Block         | Emits |
|---------------|-------|
| `READABILITY` | "strong silhouette, clear shape recognition, readable at small size, high contrast edges, distinct form, low visual noise" |
| `CONSISTENCY` | "cohesive asset set, same art pipeline, same lighting direction from upper-left, same material response language, same colour temperature, unified visual family" |
| `CORE_QUALITY`| "premium casino slot game asset, production-ready game art, commercially released quality, high detail, polished finish" |

### 3.6 Negative prompt

Composed separately and sent alongside the positive prompt. Five sources
(joined with `, `):

| Source                          | Applied to  | Emits |
|---------------------------------|-------------|-------|
| `NEG_UNIVERSAL`                 | every asset | "blurry, low resolution, pixelated, watermark, signature, logo overlay, cropped edges, out of frame, distorted anatomy, duplicate elements, UI screenshot, mockup, presentation board, collage, split-image" |
| `NEG_ISOLATED`                  | non-bg      | "background scene, horizon line, environment, table surface, room interior, hand holding object, pedestal, packaging mockup, drop shadow scene, multiple objects" |
| `NEG_ENVIRONMENT`               | bg only     | "close-up isolated object, item on blank background, slot reel overlay, UI buttons, reward text banners, HUD elements, characters in tight foreground" |
| `NEG_SYMBOLS`                   | non-bg      | "text, letters, numbers, written words, readable glyphs, watermark" |
| `NEG_SCENE_TEXT`                | bg only     | "no readable text anywhere in the scene, no signage, no neon signs, no brand names, no billboards, no storefront labels, no shop signs, no graffiti, no painted writing on walls, no book titles, no license plates, no captions, no typography anywhere in the composition, no in-scene logos" |
| `GRAPHIC_STYLES[id].negativeModifier` | if style set | varies per style, e.g. `"photorealistic, gritty, dark, moody"` for cartoon_3d |

---

## 4. Request-time overrides

User input that shapes the prompt at generation time (not stored in project
meta). All pass through `/api/ai-single` or its batch counterpart.

| Field          | Effect                                                              |
|----------------|---------------------------------------------------------------------|
| `style_id`     | Replaces `meta.styleId` for this call. Shown in popup as "Graphic style". |
| `ratio`        | Output aspect ratio (1:1 / 3:2 / 2:3 / 16:9 / 9:16 / 3:1 / 4:1 / 1:4). Does not alter the prompt text — affects size/size only. |
| `quality`      | low / medium (default) / high. Affects cost + latency + detail; does not alter prompt text. |
| `custom_prompt`| **Replaces the whole composed prompt**. Layers 1-5 are bypassed; negative prompt still applies. Used by: (a) Popup's "Custom prompt" textarea. (b) Per-slot overrides saved in Review Prompts modal (loaded from `localStorage.spn.prompts.<projectId>` → pre-filled into the popup → sent as `custom_prompt`). |
| `symbol_frame` | Boolean. Adds the frame-on or frame-off differentiator line (§3.4). Symbol categories only. |
| `symbol_color` | Named colour from `tierColorPalette`. Adds the predominant-colour differentiator line. Symbol categories only. |

---

## 5. Concrete example — composing a prompt

Imagine a user project with:
- Theme: `western`
- Style: `realistic_3d`
- gameName: `Desert Run`
- mood: `gritty`, setting: `dusty saloon town at dawn`, story: `lone gunslinger hunts lost gold`
- colours: `#c9a84c`, `#2a1406`, `#e8dbb2`
- Generating `symbol_high_1` (tier 1 of 4 high symbols, named "Revolver")

Composed prompt the model sees:

```
photorealistic 3D render, physically-based rendering (PBR) materials,
subsurface scattering, ultra-detailed textures, Unreal Engine 5 quality,
volumetric cinematic lighting, 8K render, hyperrealistic detail,
slot game "Desert Run", western theme,

single isolated subject, centered composition, pure transparent background,
cutout ready, no background elements, no ground shadow, no UI frame,
no text overlay, single slot game high-value symbol, premium icon design,
elaborate surface detail, unique material identity, luxurious finish,
bold dominant silhouette, strong focal point, controlled detail density,
square composition,

gritty atmosphere,
colour mood inspired by warm gold, rich brown, cream (use these as
tonal cues for the dominant lighting and material palette — complementary
and supporting colours are welcome where they strengthen the composition),

tier-1 highest-value icon, most elaborate ornamentation, strongest glow,
dominant visual weight, depicted as: Revolver,
inside an ornate gem-studded metallic frame, premium slot symbol badge
with decorative border, polished metallic rim, icon sits within the frame,
predominantly bright red as the dominant hue, with complementary supporting
tones used sparingly to preserve the tier reading,

strong silhouette, clear shape recognition, readable at small size,
high contrast edges, distinct form, low visual noise,
cohesive asset set, same art pipeline, same lighting direction from
upper-left, same material response language, same colour temperature,
unified visual family,
premium casino slot game asset, production-ready game art, commercially
released quality, high detail, polished finish
```

Negative prompt:

```
blurry, low resolution, pixelated, watermark, signature, logo overlay,
cropped edges, out of frame, distorted anatomy, duplicate elements,
UI screenshot, mockup, presentation board, collage, split-image,
background scene, horizon line, environment, table surface, room interior,
hand holding object, pedestal, packaging mockup, drop shadow scene,
multiple objects,
text, letters, numbers, written words, readable glyphs, watermark,
cartoon, flat, illustrated, stylized
```

---

## 6. File map

| Purpose                                    | File                                           |
|--------------------------------------------|------------------------------------------------|
| Main prompt composition                    | `lib/ai/promptBuilder.ts`                      |
| Graphic-style catalogue                    | `lib/ai/styles.ts`                             |
| Hex → named colour                         | `promptBuilder.ts` `nearestColorName()`        |
| Background-only text sanitizer             | `promptBuilder.ts` `sanitizeForBackground()`   |
| Symbol tier & colour helpers               | `promptBuilder.ts` `symbolTierInfo()` etc.     |
| Feature slot catalogue                     | `promptBuilder.ts` `FEATURE_SLOT_SPECS`        |
| Editor-side style picker (Project Settings)| `public/editor/editor.js` `GRAPHIC_STYLES_MIRROR` |
| Single-asset popup (style / ratio / qty / frame / color / custom prompt) | `components/generate/SingleGeneratePopup.tsx` |
| Review-every-prompt modal (per-slot overrides) | `components/generate/ReviewPromptsModal.tsx` |
| Single generation endpoint                 | `app/api/ai-single/route.ts`                   |
| Single prompt preview (no model call)      | `app/api/ai-single/preview/route.ts`           |
| Batch prompt preview (for Review modal)    | `app/api/prompts/preview-all/route.ts`         |
| Bulk generation                            | `app/api/generate/route.ts`                    |

---

## 7. Known gaps and future changes

- ~~**Bulk `/api/generate` doesn't honour per-slot Review Prompts overrides**~~
  **Fixed.** `AssetsWorkspace` reads `readPromptOverrides()` and forwards them
  as `custom_prompts` on every bulk call; `pipeline.ts` substitutes the
  override into `built.prompt` before calling the provider. The batch log
  confirms the override count: `"Using 3 per-slot overrides: symbol_high_1,
  symbol_low_2, logo"`.
- **Feature slots (`bonuspick.*`, etc.) don't accept `symbol_frame` / `symbol_color`** hints.
  Add wiring if needed.
- **Reference image attachment** is a UI-only stub in the popup. Provider-side
  conditioning (Runway `reference_images`, OpenAI `images.edit`) is not wired.
- **Per-section prompt edits** — the Prompt Composition panel in the popup is
  read-only with a single "Copy into Custom Prompt" escape hatch. Inline
  per-layer editing (add context lines, swap template) is future work.
- **Style consistency across a batch** — no enforcement today. Generating the
  same asset three times produces three different scenes. A group-generation
  popup with shared seed / anchor would address this.
- **Overrides live in localStorage** — per-device. Moving to Supabase
  `project_context` for cross-device sync is a follow-up.

---

## 8. Editing this doc

This is a living reference. If you change how prompts are composed, update
the relevant section here. Big changes also warrant an update to `§2` (the
hierarchy diagram) and `§5` (the concrete example).

The file at `lib/ai/promptBuilder.ts` has inline comments that mirror the
layer-by-layer structure in §3 — those can be updated together.
