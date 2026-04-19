# Features v1 — Catalogue & Data Model

**Status:** Reviewed and approved 2026-04-19. See "Decisions log" below for resolutions to the open questions.

## Decisions log

1. **v1 picks** — confirmed: Free Spins, Buy Feature, Bonus Pick, Hold & Spin, Expanding Wild.
2. **Settings/mechanics** — confirmed.
3. **Asset slots** — confirmed.
4. **Default values** — kept as drafted; revisit if real-game data shows otherwise.
5. **Naming** — feature IDs match the existing `editor.js` `FDEFS` keys (singular: `freespin`, `holdnspin`); asset slot namespaces use the natural plural (`freespins.*`, `holdnspin.*`, `bonuspick.*`, `buy.*`, `expandwild.*`). Pragmatic hybrid — no migration of existing payload data.
6. **Multi-screen features → feature-scoped tabs.** The current global "Pop-ups" tab gets dissolved. Each feature owns its own intro / in-round / outro screens as sub-tabs under itself. So Bonus Pick (today: 1 screen under Feature Games) becomes 3 sub-screens (intro / pick / outro) under Bonus Pick. The Pop-ups tab is retired; any non-feature-scoped popups (Big Win celebration, jackpot reveal, etc.) move into a new global "Celebrations" or similar in a follow-up. **Phase 2's Bonus Pick vertical slice will pioneer this structure.**

---

**Purpose:** Defines, per feature, the **settings schema**, **asset slots**, **canvas overlay**, and **simulation outline** that the registry will consume. Complements the existing [`features-panel-design-spec.md`](../../docs/features-panel-design-spec.md) which covers the Features workspace UX/layout.

**How to use this doc:**
- **Settings schema** drives the Features panel form (Zod-validated).
- **Asset slots** drive the Assets workspace rows + canvas image layers + Features panel "needed assets" list.
- **Canvas overlay** describes what gets composed onto the game viewport when this feature's screen is active.
- **Simulation** describes the spin-sim animation when the user clicks ▶ Sim and this feature triggers.

---

## v1 scope: 5 features

I picked these as the highest-value first wave based on commercial slot prevalence post-2020. Stub the rest until v2.

| # | Feature | Why first | Effort |
|---|---|---|---|
| 1 | **Free Spins** | Universal; every modern slot has it | M |
| 2 | **Buy Feature** | Huge monetisation driver; most-requested by ops | S |
| 3 | **Bonus Pick** | Common alternative to free spins; visible in your screenshot | M |
| 4 | **Hold & Spin** (Lock & Win) | Big category — Pragmatic Power Of Money, etc. | L |
| 5 | **Expanding Wild** | Most common Wild variant; visible in your screenshot | S |

Total: ~6-8 days of phase-2 work after Phase 1 foundation lands.

The other 21 features in `FDEFS` (lines 564-621 of `editor.js`) keep their current code-rendered behaviour until promoted.

---

## 1 · Free Spins

A scatter-triggered round where N spins run at no cost, often with a multiplier or modifier.

### 1.1 Settings schema

| Field | Type | Default | Notes |
|---|---|---|---|
| `triggerSymbol` | enum: `scatter` \| `bonus` \| `wild` | `scatter` | Which symbol triggers entry |
| `triggerCount` | int 3–5 | `3` | Min count of trigger symbols on the reels |
| `awardSpins` | int 5–50 | `10` | Spins granted on trigger |
| `retriggerEnabled` | bool | `true` | Can land more triggers during the round |
| `retriggerCount` | int 2–5 | `3` | Min count for retrigger (often = trigger - 1) |
| `retriggerSpins` | int 1–25 | `5` | Spins added per retrigger |
| `multiplierMode` | enum: `none` \| `flat` \| `progressive` | `none` | How wins are multiplied |
| `multiplierValue` | int 2–10 | `2` | Used when `flat` |
| `progressiveStart` | int | `1` | Starting × when `progressive` |
| `progressiveStep` | int | `1` | Increment per win when `progressive` |
| `progressiveCap` | int | `10` | Max × when `progressive` |
| `endCondition` | enum: `spins_only` \| `target_win` \| `manual` | `spins_only` | When the round ends |

### 1.2 Asset slots

| Slot key | Label | Required | Default | Notes |
|---|---|---|---|---|
| `freespins.intro_banner` | Intro banner | yes | placeholder | "Free Spins!" pre-round screen |
| `freespins.bg` | Background (in-round) | optional | base game bg | Sub for atmospheric change |
| `freespins.spin_counter_frame` | Spin counter frame | yes | placeholder | Overlay showing "5 / 10 spins left" |
| `freespins.multiplier_badge` | Multiplier badge | conditional | placeholder | Shown when `multiplierMode != none` |
| `freespins.retrigger_celebration` | Retrigger celebration | conditional | placeholder | Shown on retrigger |
| `freespins.outro_banner` | Outro banner | yes | placeholder | "Total win: X" end screen |

### 1.3 Canvas overlay

Three sub-tabs under the Free Spins feature: **Intro**, **In-round**, **Outro**.

- **Intro** composes: `freespins.intro_banner` centered + total win amount text. Renders over a dimmed base-game capture.
- **In-round** composes: `freespins.bg` (or base bg) + reel area unchanged + `freespins.spin_counter_frame` top-right + `freespins.multiplier_badge` top-left when applicable.
- **Outro** composes: `freespins.outro_banner` centered + cumulative win amount text.

### 1.4 Simulation

When the trigger symbols land in base game:
1. Highlight trigger symbols (gold pulse, 600ms).
2. Fade to intro screen (400ms).
3. Auto-advance to in-round screen.
4. Run N spin animations with the configured multiplier behaviour.
5. On retrigger: brief celebration overlay.
6. On end: outro screen with total win.

---

## 2 · Buy Feature

Player pays a fixed bet multiplier to skip the trigger and enter the bonus directly.

### 2.1 Settings schema

| Field | Type | Default | Notes |
|---|---|---|---|
| `enabled` | bool | `false` | Master switch |
| `targetFeature` | feature ref | `freespin` | Which feature is bought into |
| `costMultiplier` | int 50–500 | `100` | × current bet |
| `confirmRequired` | bool | `true` | Show confirmation dialog before purchase |
| `regulatoryGate` | enum: `none` \| `uk_disabled` \| `de_disabled` | `none` | Hide button per jurisdiction |

### 2.2 Asset slots

| Slot key | Label | Required | Default | Notes |
|---|---|---|---|---|
| `buy.button` | Buy button (idle) | yes | placeholder | Shown next to spin button in base game |
| `buy.button_hover` | Buy button (hover) | optional | tinted version | |
| `buy.confirm_panel_bg` | Confirmation panel background | yes | placeholder | Modal background |
| `buy.confirm_icon` | Confirmation icon | optional | placeholder | E.g. golden chest |

### 2.3 Canvas overlay

No dedicated screen — adds the **Buy Button** layer to the base-game canvas. Confirmation panel renders as an overlay when clicked in sim.

### 2.4 Simulation

1. User clicks Buy → confirmation panel slides in (300ms).
2. User confirms → button bet × `costMultiplier` deducted (visual).
3. Jump straight into `targetFeature`'s sim.

---

## 3 · Bonus Pick

A pick-and-reveal mini-game triggered by N+ bonus symbols.

### 3.1 Settings schema

| Field | Type | Default | Notes |
|---|---|---|---|
| `triggerSymbol` | enum: `bonus` \| `scatter` | `bonus` | |
| `triggerCount` | int 3–5 | `3` | |
| `gridLayout` | enum: `3x4` \| `4x3` \| `4x4` \| `5x4` | `4x3` | Number/arrangement of pick tiles |
| `picksAllowed` | int 1–N | `3` | "Pick X of Y" |
| `prizeDistribution` | enum: `random` \| `weighted` | `weighted` | |
| `prizeTypes` | string[] | `[coin, multiplier, freespin, jackpot]` | Available reveal categories |
| `endTriggerEnabled` | bool | `true` | A "POOPER" tile that ends the round early |
| `endTriggerProb` | float 0–1 | `0.05` | Probability per tile |

### 3.2 Asset slots

| Slot key | Label | Required | Default | Notes |
|---|---|---|---|---|
| `bonuspick.bg` | Background | yes | placeholder | Full-screen bg for the pick screen |
| `bonuspick.header` | "Choose Your Prize" header | yes | placeholder | Title bar |
| `bonuspick.tile_closed` | Tile (closed) | yes | placeholder | Default state |
| `bonuspick.tile_revealed` | Tile (revealed) | yes | placeholder | After click |
| `bonuspick.prize_coin` | Prize: coin icon | conditional | placeholder | Shown when `coin` in `prizeTypes` |
| `bonuspick.prize_multiplier` | Prize: multiplier icon | conditional | placeholder | |
| `bonuspick.prize_freespin` | Prize: free-spin icon | conditional | placeholder | |
| `bonuspick.prize_jackpot` | Prize: jackpot icon | conditional | placeholder | |
| `bonuspick.prize_pooper` | Prize: end-round icon | conditional | placeholder | When `endTriggerEnabled` |
| `bonuspick.footer` | "Pick X of Y" footer | yes | placeholder | |

### 3.3 Canvas overlay

Three sub-tabs under the Bonus Pick feature: **Intro**, **Pick**, **Outro**. Replaces the entire reel area while active.

- **Intro** composes: dimmed base-game capture + a "Bonus!" banner using `bonuspick.header` styling + brief delay before auto-advancing to Pick.
- **Pick** composes (top-down): `bonuspick.bg` → `bonuspick.header` → grid of `bonuspick.tile_closed` per `gridLayout` → `bonuspick.footer`. On tile click during sim: tile swaps to `tile_revealed` + prize icon.
- **Outro** composes: `bonuspick.bg` (dimmed) + cumulative tally + "Continue" affordance back to base game.

### 3.4 Simulation

1. Trigger lands → fade to Bonus Pick screen.
2. Tiles fade in row-by-row.
3. User clicks tiles (or auto-pick in sim).
4. Each click: flip animation (300ms) → reveal prize → tally.
5. On `picksAllowed` reached or `pooper` hit: outro with total win.

---

## 4 · Hold & Spin (Lock & Win)

Special symbols (usually money/coin symbols) lock in place; reels respin until either no new special symbols land for N spins or grid fills.

### 4.1 Settings schema

| Field | Type | Default | Notes |
|---|---|---|---|
| `triggerSymbol` | string | `coin` | The "lockable" special symbol |
| `triggerCount` | int 5–8 | `6` | Min count to start the round |
| `respinsGranted` | int 2–5 | `3` | Resets to this on each new lock |
| `respinResetOnLand` | bool | `true` | New lock resets the respin counter |
| `prizeOnSymbol` | enum: `value_text` \| `value_image` \| `value_animated` | `value_text` | How prize appears on each locked symbol |
| `gridFillBonus` | int | `0` | Extra prize if all cells lock (0 = disabled) |
| `jackpotTiers` | string[] | `[grand, major, minor, mini]` | Special prize values |
| `endCondition` | enum: `respins_zero` \| `grid_full` | `respins_zero` | |

### 4.2 Asset slots

| Slot key | Label | Required | Default | Notes |
|---|---|---|---|---|
| `holdnspin.intro_banner` | Intro banner | yes | placeholder | "Lock & Win!" |
| `holdnspin.bg` | Background | optional | base bg | |
| `holdnspin.coin_symbol_locked` | Coin (locked state) | yes | placeholder | |
| `holdnspin.coin_symbol_glowing` | Coin (just-landed glow) | optional | placeholder | |
| `holdnspin.respin_counter_frame` | Respin counter frame | yes | placeholder | Shows "3 spins left" |
| `holdnspin.jackpot_grand` | Jackpot Grand badge | conditional | placeholder | Per `jackpotTiers` |
| `holdnspin.jackpot_major` | Jackpot Major badge | conditional | placeholder | |
| `holdnspin.jackpot_minor` | Jackpot Minor badge | conditional | placeholder | |
| `holdnspin.jackpot_mini` | Jackpot Mini badge | conditional | placeholder | |
| `holdnspin.outro_banner` | Outro banner | yes | placeholder | |

### 4.3 Canvas overlay

Three sub-tabs under the Hold & Spin feature: **Intro**, **In-round**, **Outro**.

- **Intro** composes: `holdnspin.intro_banner` centered over a dimmed base-game capture.
- **In-round** composes: `holdnspin.bg` + base reel grid + `holdnspin.coin_symbol_locked` per locked cell + `holdnspin.respin_counter_frame` top + jackpot tier badges along the side.
- **Outro** composes: `holdnspin.outro_banner` + total win + jackpot tier earned (when any).

### 4.4 Simulation

1. Trigger count reached → intro screen (400ms).
2. In-round: locked coins glow once, respin counter shows starting value.
3. Per respin: reel cells animate; new coins lock with `coin_symbol_glowing` flash → settle to `locked`.
4. If new coin lands: counter resets to `respinsGranted`.
5. End: respins hit zero or grid fills → outro with total + jackpot tier earned.

---

## 5 · Expanding Wild

A wild symbol that, on landing, expands to fill its entire reel column (or row).

### 5.1 Settings schema

| Field | Type | Default | Notes |
|---|---|---|---|
| `enabled` | bool | `false` | |
| `appliesIn` | enum: `base` \| `freespin` \| `both` | `freespin` | When the expansion happens |
| `direction` | enum: `vertical` \| `horizontal` \| `both` | `vertical` | Reel column vs row |
| `triggerProbability` | float 0–1 | `1.0` | Chance to expand on land (1.0 = always) |
| `hasMultiplier` | bool | `false` | |
| `multiplierValue` | int 2–10 | `2` | When `hasMultiplier` |
| `holdsPosition` | bool | `false` | If true, behaves like Sticky Wild after expanding |

### 5.2 Asset slots

| Slot key | Label | Required | Default | Notes |
|---|---|---|---|---|
| `expandwild.symbol` | Wild symbol (un-expanded) | yes | placeholder | The pre-expansion icon |
| `expandwild.expanded_overlay` | Expanded reel overlay | yes | placeholder | The full-column graphic that overlays the reel post-expansion |
| `expandwild.multiplier_badge` | Multiplier badge | conditional | placeholder | When `hasMultiplier` |

### 5.3 Canvas overlay

No dedicated screen — modifies how the wild appears on the base or free-spins reel grid. The Wild row in the Assets panel gets two slots: `symbol` and `expanded_overlay`.

### 5.4 Simulation

1. Wild lands on a reel.
2. Symbol pulses gold (200ms).
3. `expanded_overlay` slides in to cover the column (300ms).
4. If `hasMultiplier`: `multiplier_badge` fades in centred on the expanded overlay.
5. Wins recalculate; payline highlights run as usual.

---

## Stub list (v2+)

The remaining 21 features keep their current code-rendered behaviour. Promote one to the catalogue when it becomes a priority.

**Bonus Rounds:** Wheel Bonus, Ladder/Trail Bonus
**Wild Mechanics:** Sticky Wild, Walking Wild, Stacked Wilds, Multiplier Wild, Colossal Wild
**Buy/Ante:** Ante Bet, Bonus Store
**Cascades:** Cascade/Avalanche, Tumble, Win Multiplier Trail
**Special:** Megaways™, Infinity Reels, Cluster Pays, All Ways, Mystery Symbol, Symbol Upgrade
**Gamble:** Gamble, Super Gamble

---

## Cross-cutting requirements

These apply to every feature in the registry:

1. **Asset slot keys are namespaced** by feature id (`freespins.intro_banner`, not `intro_banner`) so the Assets workspace can group them per feature without collision.
2. **Conditional asset slots** are only listed in the Assets workspace + Features panel "needed" list when their condition is met (e.g. `multiplier_badge` only when `multiplierMode != none`).
3. **Default placeholders** ship with the editor so a never-touched project still renders something coherent (no broken-image squares).
4. **Settings changes recompute `assetSlots`** so toggling a setting that adds a slot immediately surfaces the new row in both workspaces.
5. **Canvas overlays use the same `<img>` layer system** as base-game assets — no per-feature ad-hoc DOM. This is what unlocks bitmap-based rendering.
6. **Sim hooks return a declarative event sequence**, not imperative animation code — keeps each feature small and testable.

---

## Phase status

- [x] **Phase 0** — Catalogue (this doc).
- [x] **Phase 1** — Feature registry foundation. See [`lib/features/registry.ts`](../lib/features/registry.ts) and [`types/features.ts`](../types/features.ts).
- [ ] **Phase 2** — Vertical slice for Bonus Pick: replace code-rendered overlay with asset-driven layers; introduce the feature-scoped intro/pick/outro sub-tabs; add per-feature row in Assets workspace and "Assets needed" in Features panel. Pioneers the Pop-ups tab dissolution.
- [ ] **Phase 2 cycles** — apply same template to Free Spins, Hold & Spin, Buy Feature, Expanding Wild.
- [ ] **Phase 3** — Assets workspace integration polish.
- [ ] **Phase 4** — Features workspace integration polish.
- [ ] **Phase 5** — Sim hooks.
- [ ] **Phase 6** — Migration + cleanup.
