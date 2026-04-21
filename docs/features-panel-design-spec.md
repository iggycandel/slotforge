# SlotForge — Feature-Driven System Editor
## Complete UX + UI + Architecture Specification

**Version:** 1.0  
**Author:** Product Design / Architecture  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Layout Blueprint](#1-layout-blueprint)
2. [Feature Object Model](#2-feature-object-model)
3. [Feature Editor UX (Tabs)](#3-feature-editor-ux)
4. [Screen Generation System](#4-screen-generation-system)
5. [Default Preview Logic](#5-default-preview-logic)
6. [Flow Integration](#6-flow-integration)
7. [Live System Feedback Panel](#7-live-system-feedback-panel)
8. [Interactions & Behavior](#8-interactions--behavior)
9. [Visual Hierarchy](#9-visual-hierarchy)
10. [Smart Summaries, Dependencies & Two-Way Navigation](#10-smart-summaries-dependencies--two-way-navigation)

---

## 1. Layout Blueprint

### Overall Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FEATURES  [+ Add Feature ▾]                           [⚙ Panel Options]│
├──────────────┬────────────────────────────────────┬─────────────────────┤
│ LEFT         │ CENTER                             │ RIGHT               │
│ 240px        │ flex-1 (min 520px)                 │ 280px               │
│              │                                    │                     │
│ Feature List │ Feature Editor                     │ Live System Impact  │
│              │                                    │                     │
│ ─────────── │ [Feature Name] [Type Badge] [●ON]  │ ▸ Canvas Impact     │
│ FS   ⚡ FS  │                                    │ ▸ Flow Impact       │
│ H&S  ⚡ H&S │ ┌─────────────────────────────┐   │ ▸ Default Preview   │
│ BUY  ● off  │ │ Setup │Trigger│Mechs│Screens│   │ ▸ Warnings          │
│ WHEEL ⚠     │ └─────────────────────────────┘   │                     │
│              │                                    │                     │
│ [+ Feature]  │  [tab content]                     │                     │
└──────────────┴────────────────────────────────────┴─────────────────────┘
```

### Left Column — Feature List (240px, fixed)

```
┌──────────────────────────┐
│ 🔍 Search features...    │  ← filter input
├──────────────────────────┤
│ All  Active  Warnings    │  ← filter tabs (3)
├──────────────────────────┤
│ ≡ Free Spins        ✓  │  ← drag handle, name, valid indicator
│   ⚡ 3+ Scatter · 10sp  │  ← auto-summary (2 lines max)
│   🖥 5 screens          │  ← screen count
├──────────────────────────┤
│ ≡ Hold & Spin       ⚠  │  ← warning indicator
│   ⚡ 6+ Coins · 3res   │
│   🖥 3 screens          │
├──────────────────────────┤
│ ≡ Buy Feature       ●  │  ← disabled (greyed)
│   Manual · 75× bet     │
│   🖥 2 screens          │
├──────────────────────────┤
│                          │
│  [＋ Add Feature]        │
└──────────────────────────┘
```

**Feature list item anatomy:**
- Drag handle (`≡`) — reorders features (affects flow priority)
- Feature name — editable inline on double-click
- Status indicator — right-aligned: `✓` valid (green), `⚠` warning (amber), `✕` error (red), `●` disabled (grey)
- Auto-summary line — trigger shorthand + primary mechanic value
- Screen count — glanceable canvas footprint

### Center Column — Feature Editor (flex, min 520px)

```
┌──────────────────────────────────────────────────┐
│  Free Spins                [FREE_SPINS]  [● ON]  │ ← header bar
│  ↳ Triggered by 3+ Scatters · Awards 10 spins   │ ← live smart summary
├──────────────────────────────────────────────────┤
│  Setup  │ Trigger │ Mechanics │ Screens │ Flow   │ ← tab row
├──────────────────────────────────────────────────┤
│                                                  │
│  [tab content — varies per tab, see §3]          │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Header bar elements:**
- Name (editable via click-to-edit)
- Type badge (pill, not editable — changing type requires re-creating)
- Enable/disable toggle (hard off — collapses feature from flow and canvas)

### Right Column — Live System Impact (280px, fixed)

```
┌────────────────────────────┐
│ SYSTEM IMPACT              │
├────────────────────────────┤
│ ▸ Canvas (5 screens)  ✓   │
│   + FS_GAMEPLAY            │
│   + FS_INTRO               │
│   + FS_TRIGGER_ANIM        │
│   + FS_RETRIGGER           │
│   + FS_SUMMARY             │
├────────────────────────────┤
│ ▸ Flow (8 connections) ✓  │
│   BASE → FS_TRIGGER_ANIM  │
│   FS_TRIGGER_ANIM → FS_IN  │
│   FS_IN → FS_GAMEPLAY      │
│   FS_GAMEPLAY ↺ (retrig)  │
│   FS_GAMEPLAY → FS_SUMM    │
│   FS_SUMM → BASE           │
├────────────────────────────┤
│ ▸ Default Preview          │
│   [FS_GAMEPLAY] (auto)     │
│   [Override →]             │
├────────────────────────────┤
│ ▸ Warnings (0)  ✓         │
└────────────────────────────┘
```

---

## 2. Feature Object Model

### Core Data Structures (TypeScript)

```typescript
// ─── Feature Types ────────────────────────────────────────────────────────
type FeatureType =
  | 'FREE_SPINS'       // scatter-triggered free spin round
  | 'HOLD_SPIN'        // coin/symbol triggered respin mechanic
  | 'BONUS_PICK'       // player picks hidden items for prizes
  | 'WHEEL_BONUS'      // prize wheel
  | 'BUY_FEATURE'      // direct purchase entry to feature
  | 'JACKPOT'          // progressive/fixed jackpot
  | 'CASCADE'          // tumble/cascade winning mechanic
  | 'EXPANDING_WILD'   // wilds that expand on reel
  | 'STICKY_WILD'      // wilds persist across spins
  | 'MULTIPLIER_TRAIL' // growing win multiplier per win
  | 'GAMBLE'           // player gambles wins
  | 'COLLECT_BONUS';   // accumulator-style collect mechanic

type TriggerType =
  | 'SCATTER_COUNT'    // N scatter symbols anywhere
  | 'SYMBOL_COMBO'     // specific reel position combination
  | 'WIN_AMOUNT'       // win exceeds threshold
  | 'MANUAL'           // player action (buy button)
  | 'LINKED'           // triggered by another feature completing
  | 'PROBABILITY'      // random base probability per spin
  | 'COMPLETION';      // triggered when another mechanic completes

type MechanicType =
  | 'SPIN_COUNT'        // how many free spins awarded
  | 'MULTIPLIER'        // win multiplier (fixed/progressive/increasing)
  | 'REEL_MODIFIER'     // changes reel strip content during feature
  | 'WILD_MODIFIER'     // changes wild symbol behaviour
  | 'RETRIGGER'         // allows feature to retrigger within itself
  | 'COLLECT'           // collect symbol accumulator
  | 'LEVEL_SYSTEM'      // progress through levels during feature
  | 'GAMBLE_OPTION'     // player can gamble any win
  | 'RNG_TABLE'         // explicit probability outcome table
  | 'SYMBOL_TRANSFORM'  // symbols morph to others on trigger
  | 'SUPER_BET'         // side-bet modifier
  | 'COIN_SYSTEM';      // land coins on fixed grid

type ScreenType =
  | 'GAMEPLAY'          // main feature play canvas
  | 'TRIGGER_ANIM'      // transition / announcement when triggered
  | 'INTRO'             // pre-feature intro (spin selection, rule display)
  | 'RETRIGGER'         // retrigger announcement within feature
  | 'SUMMARY'           // post-feature summary / total win reveal
  | 'MENU'              // buy feature / selection menu
  | 'CONFIRM'           // confirmation dialog (buy confirm)
  | 'PICK_GRID'         // pick-and-reveal game board
  | 'WHEEL'             // wheel/spinner interface
  | 'RESULT';           // result reveal screen

type FeatureStatus = 'valid' | 'warning' | 'error' | 'incomplete' | 'disabled';

// ─── Main Feature Object ─────────────────────────────────────────────────
interface Feature {
  id: string;
  name: string;
  type: FeatureType;
  enabled: boolean;
  order: number;             // list position — drives flow priority
  color: string;             // hex, for visual identity across canvas/flow
  icon: string;              // emoji or short code

  status: FeatureStatus;
  statusMessages: StatusMessage[];

  trigger: Trigger;
  mechanics: Mechanic[];
  screens: FeatureScreen[];
  flowRules: FlowRules;

  previewSettings: PreviewSettings;

  dependencies: string[];    // feature IDs required before this works
  conflicts: string[];       // feature IDs that cannot coexist
  tags: string[];
  notes: string;

  meta: {
    createdAt: string;
    updatedAt: string;
    version: number;
    generatedBy: 'user' | 'template' | 'import';
  };
}

// ─── Trigger ──────────────────────────────────────────────────────────────
interface Trigger {
  type: TriggerType;

  // SCATTER_COUNT
  scatterSymbol?: string;
  scatterCount?: number;
  scatterAnywhere?: boolean;     // true = any position, false = specific reels

  // SYMBOL_COMBO
  reelPositions?: Array<{
    reel: number; row: number; symbol: string;
  }>;

  // WIN_AMOUNT
  winThreshold?: number;
  winThresholdUnit?: 'credits' | 'bet_multiplier';

  // MANUAL / BUY_FEATURE
  cost?: number;
  costUnit?: 'credits' | 'bet_multiplier';

  // LINKED
  linkedFeatureId?: string;
  linkedOnEvent?: 'enter' | 'exit' | 'retrigger';

  // PROBABILITY
  baseProbability?: number;     // 0–1
  probabilityNotes?: string;    // e.g. "1 in 200 base spins"

  // COMPLETION
  completionSourceId?: string;  // mechanic or feature id

  // Shared
  activeIn?: ('BASE_GAME' | 'FREE_SPINS' | string)[];  // contexts where trigger is live
  exclusions?: string[];        // feature IDs where trigger is suppressed
}

// ─── Mechanic ─────────────────────────────────────────────────────────────
interface Mechanic {
  id: string;
  type: MechanicType;
  label: string;               // display name
  description: string;         // auto-generated or user-edited
  enabled: boolean;
  order: number;               // block order in mechanic list

  params: Record<string, MechanicParam>;

  // Screen impact
  generatesScreenType?: ScreenType;   // this mechanic causes a screen to be created
  modifiesScreenType?: ScreenType;    // this mechanic changes an existing screen's behaviour

  // Validation
  requires?: string[];         // mechanic IDs required before this one
  conflicts?: string[];        // mechanic IDs that conflict
}

interface MechanicParam {
  type: 'number' | 'string' | 'boolean' | 'select' | 'range' | 'table' | 'symbol_picker';
  value: any;
  label: string;
  description?: string;
  unit?: string;               // "spins", "×", "credits", "%"
  validation?: {
    min?: number;
    max?: number;
    step?: number;
    required?: boolean;
    options?: Array<{ value: any; label: string; description?: string }>;
  };
}

// ─── Feature Screen ───────────────────────────────────────────────────────
interface FeatureScreen {
  id: string;
  featureId: string;
  screenType: ScreenType;
  canvasNodeId: string;        // linked node ID in the canvas

  required: boolean;           // cannot be disabled
  enabled: boolean;            // user toggle for optional screens

  label: string;               // display name on canvas
  description: string;         // what this screen does

  previewEligible: boolean;    // can this screen be the default preview?
  previewWeight: number;       // higher = preferred in auto-selection

  // Flow connections this screen has
  flowEntry: FlowConnection[];
  flowExit: FlowConnection[];

  // Which mechanic generates this screen (null = from feature template directly)
  generatedByMechanicId: string | null;

  // Position hint for canvas auto-layout
  layoutRole: 'entry' | 'main' | 'branch' | 'exit';

  templateOverrides: Record<string, any>; // user overrides to template defaults
}

interface FlowConnection {
  targetScreenId: string;       // 'BASE_GAME' or a screen id
  label: string;
  condition?: FlowCondition;
  metadata?: {
    triggerType?: 'auto' | 'user-action' | 'timer' | 'condition';
    probability?: number;
    durationMs?: number;
  };
}

// ─── Flow Rules ───────────────────────────────────────────────────────────
interface FlowRules {
  // Where does the player come from when entering this feature?
  entryPoints: FlowEntry[];

  // Where do they go when the feature ends?
  exitPoints: FlowExit[];

  // Internal branches (e.g. retrigger, level up)
  branches: FlowBranch[];

  // Interruption rules
  interruptible: boolean;
  interruptedBy: string[];     // feature IDs that can interrupt this

  // Retrigger behaviour
  canRetrigger: boolean;
  retriggerLimit: number | null;
  retriggerBehavior: 'add_spins' | 'reset' | 'extend';

  // Exit trigger
  returnTrigger: 'spin_count' | 'manual' | 'collect_complete' | 'timer' | 'picks_exhausted';
}

interface FlowEntry {
  fromScreenId: string;        // 'BASE_GAME' or screen id
  viaScreenId?: string;        // optional intermediate (trigger anim)
  condition: FlowCondition;
  label: string;
}

interface FlowExit {
  toScreenId: string;          // 'BASE_GAME' or screen id
  condition: FlowCondition;
  label: string;
  showSummary: boolean;        // route through summary screen before exit
}

interface FlowBranch {
  id: string;
  label: string;
  fromScreenId: string;
  toScreenId: string;
  condition: FlowCondition;
  priority: number;
  metadata?: { probability?: number; triggerType?: string };
}

interface FlowCondition {
  field: string;               // e.g. 'spinCount', 'coinCount', 'playerAction'
  op: '==' | '!=' | '>=' | '<=' | '>' | '<' | 'truthy' | 'exhausted';
  value: any;
  label?: string;              // human-readable version
}

// ─── Preview Settings ─────────────────────────────────────────────────────
interface PreviewSettings {
  mode: 'auto' | 'manual';
  screenId: string | null;     // null = let system decide
  priority: number;            // 0–100, used in auto-selection ranking
  overrideReason?: string;     // why user manually set this
}

// ─── Status Message ───────────────────────────────────────────────────────
interface StatusMessage {
  level: 'error' | 'warning' | 'info';
  code: string;                // machine-readable: 'MISSING_TRIGGER', 'NO_RETURN_PATH'
  message: string;             // human-readable
  affectedField?: string;      // which field to highlight
  suggestedFix?: string;       // one-liner fix suggestion
  autoFixable?: boolean;       // can the system fix this without user input?
}
```

### How Features Generate Screens

Every `Feature` has a `screens[]` array populated by the **Template Engine** (see §4). The template engine runs whenever:

1. A feature is added (from template)
2. A mechanic is toggled on/off
3. A mechanic param changes a value that controls screen generation
4. A screen is manually enabled/disabled

### How Screens Connect to Flow

Each `FeatureScreen` has `flowEntry[]` and `flowExit[]` arrays. These are the **contracts** between the feature system and the Game Flow Designer. When a feature is saved:

1. The Flow Engine reads all `FlowEntry` and `FlowExit` from all enabled features
2. It generates the corresponding nodes (if they don't exist in the canvas) and connections
3. It orders connections by feature `.order` and branch `.priority`
4. Conflicts (two features claiming the same screen slot) are surfaced as warnings

### Change Propagation Chain

```
User edits feature
        │
        ▼
validateFeature(feature)
        │
        ▼
updateStatusMessages(feature)
        │
        ├──▶ runTemplateEngine(feature)     → update feature.screens[]
        │         │
        │         ▼
        │    syncCanvasNodes(feature)        → add/remove/update canvas nodes
        │
        ├──▶ runFlowEngine(allFeatures)     → update GFD connections
        │
        ├──▶ updatePreviewSelection()       → recalculate default preview
        │
        └──▶ updateLiveImpactPanel()        → right column refreshes
```

All changes are debounced 300ms to batch rapid edits (e.g. typing a name).

---

## 3. Feature Editor UX

### Tab: Setup

**Purpose:** Identity, basic configuration, metadata.

```
┌──────────────────────────────────────────────────┐
│  IDENTITY                                        │
│  Name        [Free Spins              ]          │
│  Type        [FREE_SPINS        ▾] (read-only)  │
│  Color       [●] (colour picker, 12 presets)    │
│  Tags        [bonus] [retrigger] [+ tag]        │
│                                                  │
│  STATUS                                          │
│  Enabled     [● ON]                             │
│  Order       Drag in sidebar to reorder          │
│                                                  │
│  NOTES                                           │
│  [Free text — design intent, cert notes…]       │
│                                                  │
│  DEPENDENCIES                                    │
│  Requires    [ Select feature… ▾ ]              │
│  Conflicts   [ Select feature… ▾ ]              │
│                                                  │
│  DANGER ZONE                                     │
│  [Duplicate Feature]    [Delete Feature]         │
└──────────────────────────────────────────────────┘
```

**Rules:**
- Type cannot be changed — if user needs a different type, they duplicate then delete
- Color auto-assigned from a preset palette on creation (no duplicates until palette exhausted)
- Dependencies: if a required feature is disabled, this feature auto-warns but stays enabled
- Deleting a feature shows the impact (N screens, N flow connections to be removed) before confirming

---

### Tab: Trigger

**Purpose:** Define when and how this feature activates.

```
┌──────────────────────────────────────────────────┐
│  TRIGGER TYPE                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ 🎯 Scatter  │ │ 💰 Combo    │ │ 🛒 Manual  │ │
│  │ Count       │ │ Position    │ │ Purchase   │ │
│  └─────────────┘ └─────────────┘ └────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ 🔗 Linked   │ │ 🎲 Prob.    │ │ ✓ Complet  │ │
│  │ Feature     │ │ Based       │ │ ion        │ │
│  └─────────────┘ └─────────────┘ └────────────┘ │
├──────────────────────────────────────────────────┤
│  [SCATTER_COUNT selected — context below]        │
│                                                  │
│  Symbol          [Scatter ▾]  (symbol picker)   │
│  Minimum count   [3]  anywhere on reels          │
│  Active in       [✓ Base Game]  [✓ Free Spins]  │
│                                                  │
│  PROBABILITY ESTIMATE                            │
│  ≈ 1 in 200 base spins (5×3 reels, 3 scatters)  │  ← auto-calc
│  [!] Probability requires math doc submission    │  ← cert note
│                                                  │
│  SUPPRESSED DURING                               │
│  [ Select features… ]  ← disable trigger when   │
│                           another feature active │
└──────────────────────────────────────────────────┘
```

**Conditional fields per trigger type:**

| Trigger | Fields shown |
|---------|-------------|
| SCATTER_COUNT | Symbol picker, count spinner (1–12), scatter positions toggle |
| SYMBOL_COMBO | Reel grid with per-position symbol picker |
| WIN_AMOUNT | Threshold input, unit select (credits / bet×) |
| MANUAL | Cost input, unit select, button label |
| LINKED | Feature selector, event selector (enter/exit/retrigger) |
| PROBABILITY | Base probability (0–100%), context notes |
| COMPLETION | Source selector (mechanic or feature) |

**Rules:**
- Scatter triggers show the probability estimate calculator (informational, not binding)
- Manual/Purchase trigger auto-generates a MENU screen on the Screens tab
- Linked trigger validates that the linked feature actually exists and is enabled

---

### Tab: Mechanics

**Purpose:** Define what the feature *does* — modular block-based.

```
┌──────────────────────────────────────────────────┐
│  MECHANICS                        [+ Add Block]  │
│                                                  │
│  ≡ ┌─────────────────────────────────────────┐  │
│    │ 🎰 Spin Count                      ● ON │  │
│    │ Award   [10]  spins                     │  │
│    │ On entry   [fixed ▾]                    │  │
│    └─────────────────────────────────────────┘  │
│                                                  │
│  ≡ ┌─────────────────────────────────────────┐  │
│    │ × Multiplier                       ● ON │  │
│    │ Type        [fixed ▾]                   │  │
│    │ Value       [3×]                        │  │
│    │ Applies to  [all wins ▾]                │  │
│    └─────────────────────────────────────────┘  │
│                                                  │
│  ≡ ┌─────────────────────────────────────────┐  │
│    │ ↺ Retrigger                        ● ON │  │
│    │ Triggered by   [scatter ▾]              │  │
│    │ Awards         [+10 spins ▾]            │  │
│    │ Max retriggers [unlimited ▾]            │  │
│    │ ┌─────────────────────────────────────┐ │  │
│    │ │ ↳ Generates: RETRIGGER screen      │ │  │
│    │ └─────────────────────────────────────┘ │  │
│    └─────────────────────────────────────────┘  │
│                                                  │
│  ┌── Add mechanic block ──────────────────────┐  │
│  │  REEL_MODIFIER  WILD_MODIFIER  COLLECT     │  │
│  │  LEVEL_SYSTEM   GAMBLE_OPTION  RNG_TABLE   │  │
│  └───────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Block behavior rules:**
- Each mechanic block is drag-reorderable (order affects processing priority in the math doc)
- Blocks have a `generatesScreenType` indicator showing what screen they create
- Disabling a block removes its generated screens from the feature (with warning if it was the only gameplay screen)
- `RETRIGGER` block: if disabled, retrigger flow branches disappear from the Flow tab
- `LEVEL_SYSTEM` block: generates a LEVEL_INDICATOR overlay screen
- `GAMBLE_OPTION` block: generates a GAMBLE screen and creates a branch connection from GAMEPLAY → GAMBLE → GAMEPLAY/RETURN

**Mechanic block params by type:**

```
SPIN_COUNT:
  award_count: number (1–999)
  award_type: 'fixed' | 'random_from_table' | 'player_choice'
  award_table?: [{ count: number, probability: number }]

MULTIPLIER:
  type: 'fixed' | 'progressive' | 'reel_position' | 'win_count'
  value: number (fixed)
  start_value?: number (progressive)
  increment?: number (progressive)
  max_value?: number

REEL_MODIFIER:
  modification: 'overlay_wilds' | 'remove_low_pay' | 'add_high_pay' | 'lock_positions'
  affected_symbols: string[]
  affected_reels: number[] (1-indexed)

RETRIGGER:
  trigger: same as parent Trigger options (subset)
  award_type: 'add_to_remaining' | 'reset_full' | 'fixed_extra'
  award_count: number
  max_retriggers: number | null

COLLECT:
  target_count: number
  symbol: string
  on_complete: 'award_prize' | 'trigger_feature' | 'level_up'
  display_style: 'meter' | 'grid' | 'counter'

LEVEL_SYSTEM:
  levels: [{ name: string, spins: number, multiplier?: number }]
  progression: 'spin_based' | 'win_based' | 'collect_based'
```

---

### Tab: Screens

**Purpose:** Review and configure the screens generated by this feature.

```
┌──────────────────────────────────────────────────┐
│  GENERATED SCREENS                               │
│                                                  │
│  ● GAMEPLAY          [required]  [Go to canvas →]│
│    Main free spin reels screen                   │
│    Preview eligible: Yes (weight: 90)            │
│                                                  │
│  ● TRIGGER_ANIM      [optional] [● ON]           │
│    Transition animation on feature entry         │
│    Preview eligible: No                          │
│                                                  │
│  ● INTRO             [optional] [● ON]           │
│    Spin count display + player confirmation      │
│    Preview eligible: No                          │
│                                                  │
│  ● RETRIGGER         [optional] [● ON]           │
│    Generated by: Retrigger mechanic              │  ← sourced from mechanic
│    Preview eligible: No                          │
│                                                  │
│  ● SUMMARY           [optional] [● ON]           │
│    Total win reveal post-feature                 │
│    Preview eligible: Yes (weight: 20)            │
│                                                  │
│  SCREEN LABELS                                   │
│  Rename screens to match your naming convention  │
│  [FS_GAMEPLAY      ] [FS_INTRO        ]          │
│  [FS_TRIGGER_ANIM  ] [FS_RETRIGGER    ]          │
│  [FS_SUMMARY       ]                            │
└──────────────────────────────────────────────────┘
```

**Rules:**
- Required screens cannot be toggled off (toggle is locked with tooltip explanation)
- Each screen has a **[Go to canvas →]** link that jumps to that node in the canvas
- Screen labels default to `{FEATURE_ACRONYM}_{SCREEN_TYPE}` (e.g. `FS_GAMEPLAY`)
- If a screen is generated by a mechanic, disabling the mechanic also removes the screen (confirmed via warning)
- Preview weight is shown for eligible screens — user can adjust weight (0–100)

---

### Tab: Flow

**Purpose:** Configure exactly how this feature connects into the global game flow.

```
┌──────────────────────────────────────────────────┐
│  ENTRY                                           │
│  From BASE_GAME  when  scatter >= 3              │
│    via  FS_TRIGGER_ANIM → FS_INTRO → FS_GAMEPLAY │
│                                                  │
│  EXIT                                            │
│  From FS_GAMEPLAY  when  spinCount <= 0          │
│    via  FS_SUMMARY  →  BASE_GAME                 │
│                                                  │
│  INTERNAL BRANCHES                               │
│  ┌─────────────────────────────────────────┐    │
│  │ FS_GAMEPLAY → FS_RETRIGGER              │    │
│  │ When: scatter >= 3 during free spins    │    │
│  │ Priority: 1 (checks first)              │    │
│  │ Probability: ~1.5% (informational)      │    │
│  │ [Edit] [Remove]                         │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │ FS_RETRIGGER → FS_GAMEPLAY              │    │
│  │ When: auto (transition complete)        │    │
│  │ Priority: 1                             │    │
│  └─────────────────────────────────────────┘    │
│  [+ Add Branch]                                 │
│                                                  │
│  INTERRUPTIONS                                   │
│  Can this feature be interrupted?  [● No]       │
│  Interrupted by: [ — ]                          │
│                                                  │
│  RETURN TO BASE                                  │
│  Trigger: [Spin count exhausted ▾]              │
│  Route via summary: [● Yes]                     │
└──────────────────────────────────────────────────┘
```

**Rules:**
- Entry and exit paths auto-populate from template — user can add steps to the path but not break the core chain
- The mini flow diagram updates live as branches are added/removed
- Adding a branch opens an inline editor (from/to screen selectors + condition builder)
- Condition builder is the same rule-builder as used in the GFD (field + op + value)
- The "Route via summary" toggle controls whether FS_SUMMARY appears in the exit path

---

## 4. Screen Generation System

### Template Registry

Each `FeatureType` has a registered template. Templates are functions that produce a `FeatureScreen[]` from the current feature state.

```typescript
type ScreenTemplate = {
  featureType: FeatureType;
  generate: (feature: Feature) => FeatureScreen[];
};

// Templates map — one entry per FeatureType
const SCREEN_TEMPLATES: Record<FeatureType, ScreenTemplate> = { ... };
```

### Template: FREE_SPINS

```
Required screens always generated:
  FS_GAMEPLAY        — main free spin reel canvas
                       layoutRole: 'main', previewEligible: true, weight: 90

Optional screens — generated by default, user can disable:
  FS_TRIGGER_ANIM    — generated when: always (transition animation)
                       layoutRole: 'entry', previewEligible: false

  FS_INTRO           — generated when: always (shows spin award)
                       layoutRole: 'entry', previewEligible: false

  FS_SUMMARY         — generated when: always (post-feature win reveal)
                       layoutRole: 'exit', previewEligible: true, weight: 20

Mechanic-driven screens:
  FS_RETRIGGER       — generated when: RETRIGGER mechanic is enabled
                       layoutRole: 'branch', previewEligible: false

  FS_LEVEL_UP        — generated when: LEVEL_SYSTEM mechanic is enabled
                       layoutRole: 'branch', previewEligible: false

  FS_GAMBLE          — generated when: GAMBLE_OPTION mechanic is enabled
                       layoutRole: 'branch', previewEligible: false
```

### Template: HOLD_SPIN

```
Required:
  HS_GAMEPLAY        — the hold & spin fixed grid with coins
                       previewEligible: true, weight: 85

Optional (default on):
  HS_TRIGGER_ANIM    layoutRole: 'entry'
  HS_INTRO           layoutRole: 'entry'
  HS_RESULT          layoutRole: 'exit', previewEligible: true, weight: 15

Mechanic-driven:
  HS_JACKPOT_REVEAL  — when: JACKPOT mechanic present
```

### Template: BONUS_PICK

```
Required:
  BP_PICK_GRID       — the pick-and-reveal board
                       previewEligible: true, weight: 80

Optional (default on):
  BP_INTRO           layoutRole: 'entry'
  BP_RESULT          layoutRole: 'exit', previewEligible: true, weight: 30

Mechanic-driven:
  BP_LEVEL_PICKER    — when: LEVEL_SYSTEM present (multi-level pick)
```

### Template: WHEEL_BONUS

```
Required:
  WH_WHEEL           previewEligible: true, weight: 85

Optional (default on):
  WH_INTRO           layoutRole: 'entry'
  WH_RESULT          layoutRole: 'exit'
```

### Template: BUY_FEATURE

```
Required:
  BF_MENU            — overlay showing feature options and costs
                       previewEligible: false

Optional (default on):
  BF_CONFIRM         — confirmation dialog (cost + balance display)
                       previewEligible: false

Note: BUY_FEATURE does not generate its own gameplay screen.
      It links to another feature's GAMEPLAY screen as its exit.
      Requires: linkedFeature set in Trigger tab.
```

### Template: JACKPOT

```
Required:
  JP_REVEAL          — the jackpot win celebration screen
                       previewEligible: true, weight: 70

Optional:
  JP_POOL_DISPLAY    — shows current jackpot values (informational overlay)
  JP_COLLECT_CONFIRM — player confirms collection (if applicable)
```

### Screen Update Rules

| Event | Action |
|-------|--------|
| Feature enabled | All template screens created; connections added to flow |
| Feature disabled | All screens removed from canvas; connections removed from flow |
| Mechanic enabled | Mechanic's generated screen added; new flow branch added |
| Mechanic disabled | Screen removed (with warning if it had custom edits); branch removed |
| Screen renamed | Canvas node label updated immediately |
| Screen disabled (optional) | Canvas node removed; flow connections rerouted around it |
| Screen re-enabled | Canvas node recreated at last position or auto-laid out |

### Canvas Node Auto-Layout

When screens are generated, they are positioned on the canvas using the feature's **column slot** (features are allocated columns by order):

```
Column X = CANVAS_LEFT_PAD + (feature.order × FEATURE_COL_WIDTH)
Y positions by layoutRole:
  'entry'  → ROW_OFFSET × 0
  'main'   → ROW_OFFSET × 1
  'branch' → ROW_OFFSET × 2 (stacked if multiple)
  'exit'   → ROW_OFFSET × 3 (or last branch + 1)
```

---

## 5. Default Preview Logic

### Auto-Selection Algorithm

```
function selectDefaultPreview(features: Feature[]): FeatureScreen | null {
  // 1. Respect manual override (highest priority)
  for (const f of features) {
    if (f.previewSettings.mode === 'manual' && f.previewSettings.screenId) {
      const screen = findScreen(f, f.previewSettings.screenId);
      if (screen?.enabled) return screen;
    }
  }

  // 2. Auto-select from enabled, valid features
  const candidates: Array<{ screen: FeatureScreen; score: number }> = [];

  for (const f of features) {
    if (!f.enabled || f.status === 'error') continue;

    for (const screen of f.screens) {
      if (!screen.enabled || !screen.previewEligible) continue;

      const score =
        screen.previewWeight             // base weight from template (0–100)
        + (f.order === 0 ? 20 : 0)      // +20 for first feature in list
        + (f.status === 'valid' ? 10 : 0) // +10 for clean feature
        - (f.order * 5);                // -5 per position (later = lower priority)

      candidates.push({ screen, score });
    }
  }

  if (!candidates.length) return null; // fallback: base game
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].screen;
}
```

### Priority Ladder (highest to lowest)

1. Manual override (`previewSettings.mode === 'manual'`)
2. GAMEPLAY screen of first-ordered, valid, enabled feature
3. GAMEPLAY screen of any other valid feature (by order)
4. SUMMARY screen of first-ordered feature
5. No features → base game default screen

### UI Communication

The right panel shows:

```
▸ Default Preview
  [FS_GAMEPLAY]  ← screen name with feature colour dot
  Source: Auto-selected
  Reason: "Free Spins · GAMEPLAY screen · highest weight (90)"
  
  [Set manually →]   ← opens a screen picker modal
```

Manual override UI:
```
Override Default Preview
  Feature  [Free Spins ▾]
  Screen   [FS_GAMEPLAY ▾]
  [Set Override]   [Clear Override]
```

When an override is set, the badge changes to:
```
  [FS_INTRO]  ← pinned icon
  Source: Manual override
  [Clear override]
```

If the overridden screen becomes unavailable (mechanic disabled, feature disabled), the system auto-reverts to auto-select and shows a warning:
> ⚠ Manual preview screen was removed. Reverted to auto-selection.

---

## 6. Flow Integration

### Per-Feature Flow Module

Each feature compiles to a **Flow Module** — a self-contained subgraph. The global flow is the union of the base game flow plus all enabled feature modules.

**FREE_SPINS flow module:**

```
Entry path:
  BASE_GAME
    ──[scatter >= 3]──▶ FS_TRIGGER_ANIM (if enabled)
    ──[auto]──────────▶ FS_INTRO (if enabled)
    ──[player confirms]▶ FS_GAMEPLAY

During feature:
  FS_GAMEPLAY ──[scatter >= 3, priority:1]──▶ FS_RETRIGGER (if enabled)
  FS_RETRIGGER ──[auto]────────────────────▶ FS_GAMEPLAY
  FS_GAMEPLAY ──[win resolved]─────────────▶ (continue loop)

Exit path:
  FS_GAMEPLAY ──[spinCount <= 0, priority:99]──▶ FS_SUMMARY (if enabled)
  FS_SUMMARY ──[auto]───────────────────────────▶ BASE_GAME
```

**BUY_FEATURE flow module:**

```
Entry path:
  BASE_GAME ──[player taps BUY, priority:50]──▶ BF_MENU
  BF_MENU ──[player selects option]──▶ BF_CONFIRM (if enabled)
  BF_CONFIRM ──[confirmed]──▶ [linked feature's entry screen]
  BF_CONFIRM ──[cancelled]──▶ BASE_GAME
  BF_MENU ──[dismissed]────▶ BASE_GAME

Note: No internal gameplay — exits into another feature
```

**HOLD_SPIN flow module:**

```
Entry path:
  BASE_GAME ──[coinCount >= 6, priority:10]──▶ HS_TRIGGER_ANIM
  HS_TRIGGER_ANIM ──[auto]──▶ HS_INTRO
  HS_INTRO ──[auto]──────────▶ HS_GAMEPLAY

During feature:
  HS_GAMEPLAY ──[new coin lands, priority:1]──▶ HS_GAMEPLAY (reset respins)

Exit path:
  HS_GAMEPLAY ──[respins <= 0, priority:99]──▶ HS_RESULT
  HS_RESULT ──[auto]────────────────────────▶ BASE_GAME
```

### Global Flow Merge Rules

When multiple features are enabled:

1. **Entry conditions** are added to BASE_GAME as separate branches, ordered by `feature.order`
2. **Exit conditions** all return to BASE_GAME (unless BUY_FEATURE reroutes to another feature)
3. **Conflicts** (two features with identical trigger conditions) surface as CONFLICTING_FEATURES warning
4. **Interruptions** — if FeatureA defines it is `interruptedBy: ['BONUS_PICK']`, the Flow Engine adds a high-priority branch from FeatureA's GAMEPLAY → BonusPick's entry

### Flow Engine Connection Format

The Flow Engine produces connections in the GFD format already used by the Game Flow Designer:

```typescript
interface GeneratedConnection {
  fromNodeId: string;
  toNodeId: string;
  label: string;
  condition: FlowCondition | null;
  priority: number;
  metadata: {
    triggerType: 'auto' | 'user-action' | 'condition';
    probability?: number;
    durationMs?: number;
    generatedByFeatureId: string;   // so connections can be removed when feature is disabled
  };
}
```

---

## 7. Live System Impact Panel

### Panel Structure

The right panel is always visible and refreshes in real time (debounced 300ms) after any edit.

```
┌────────────────────────────────┐
│  SYSTEM IMPACT                 │
│  Free Spins — last changed 2s  │
├────────────────────────────────┤
│  ▾ Canvas         5 screens  ✓│
│    ┌───────────────────────┐   │
│    │ + FS_GAMEPLAY  [main] │   │
│    │ + FS_TRIGGER_ANIM     │   │
│    │ + FS_INTRO            │   │
│    │ + FS_RETRIGGER        │   │
│    │ + FS_SUMMARY          │   │
│    └───────────────────────┘   │
│    [Preview in canvas →]       │
├────────────────────────────────┤
│  ▾ Flow           8 edges   ✓ │
│   BASE → FS_TRIGGER_ANIM       │
│   FS_TRIGGER_ANIM → FS_INTRO   │
│   FS_INTRO → FS_GAMEPLAY       │
│   FS_GAMEPLAY ↺ [retrigger]   │
│   FS_GAMEPLAY → FS_SUMMARY     │
│   FS_SUMMARY → BASE            │
│   BASE → FS (exit, p99)        │
│   [Open in Flow Designer →]    │
├────────────────────────────────┤
│  ▾ Default Preview             │
│   ● FS_GAMEPLAY (auto, w:90)   │
│   [Override →]                 │
├────────────────────────────────┤
│  ▾ Warnings       0         ✓ │
└────────────────────────────────┘
```

### Canvas Impact Section

Shows a diff view:
- `+` prefix + green = screen will be added
- `−` prefix + red = screen will be removed
- `~` prefix + amber = screen exists but will be modified (label change, etc.)
- Neutral = screen already exists and unchanged

Clicking any screen item jumps to that node in the canvas (two-way navigation).

### Flow Impact Section

Shows all connections that will exist when this feature is saved. Collapsed by default to the count. Expanded shows the full edge list with arrow notation.

Format: `{FROM} → {TO}  [{condition shorthand}]`

Special annotations:
- `↺` = self-loop (retrigger)
- `⟂` = interrupt (breaks another feature's flow)
- `p{N}` = priority annotation (only shown when non-default)

### Warnings Section

Warnings are grouped by severity. Each warning card shows:

```
┌──────────────────────────────────────┐
│ ⚠ MISSING_TRIGGER                    │
│ Free Spins has no trigger configured │
│ → Go to Trigger tab                  │  ← clickable
│ [Auto-fix: Set 3+ Scatter default]   │  ← only if autoFixable
└──────────────────────────────────────┘
```

**Warning catalog:**

| Code | Level | Condition | Message |
|------|-------|-----------|---------|
| `MISSING_TRIGGER` | error | Trigger type is null | "No trigger configured. Feature cannot activate." |
| `NO_RETURN_PATH` | error | No exit connection back to BASE_GAME | "Feature has no exit to base game. Player will be stuck." |
| `NO_GAMEPLAY_SCREEN` | error | No GAMEPLAY screen enabled | "No main gameplay screen. Feature has no playable state." |
| `CONFLICTING_TRIGGER` | warning | Two features with same scatter count + symbol | "Trigger overlaps with {FeatureName}. Only one will fire." |
| `MISSING_DEPENDENCY` | warning | Required feature is disabled | "{FeatureName} requires {DependencyName} to be enabled." |
| `ORPHANED_SCREEN` | warning | Screen has no flow connections | "{ScreenName} is not connected in the flow." |
| `DISABLED_REQUIRED_SCREEN` | error | Required screen has been toggled off | "{ScreenName} is required but disabled." |
| `INVALID_RETRIGGER` | warning | Retrigger mechanic present but RETRIGGER screen disabled | "Retrigger screen disabled. Retrigger will snap straight back to gameplay." |
| `JACKPOT_CERT_REQUIRED` | info | JACKPOT feature enabled | "Jackpot features require jurisdiction-specific cert submission." |
| `HIGH_COST_BUY` | warning | Buy feature cost > 200× | "Buy cost is very high. Verify compliance for target jurisdictions." |

---

## 8. Interactions & Behavior

### Adding a Feature

```
1. User clicks [+ Add Feature]
2. Dropdown appears: list of FeatureTypes with icons and one-line descriptions
3. User selects type (e.g. FREE_SPINS)
4. System:
   a. Generates feature ID
   b. Runs template engine → populates screens[]
   c. Sets status = 'incomplete' (no trigger yet)
   d. Appends to features list
   e. Selects the new feature in center editor
   f. Opens "Trigger" tab (user's first task)
   g. Right panel shows the canvas impact diff (screens to be added)
   h. Adds screens to canvas immediately (even without trigger configured)
   i. Adds flow nodes immediately (without entry connection — shown as orphaned)
5. Toast: "Free Spins added. Configure a trigger to connect it to the flow."
```

### Editing a Trigger

```
1. User opens Trigger tab, changes type from SCATTER_COUNT to LINKED
2. Fields fade out/in (animated 150ms) showing new trigger's fields
3. User selects linkedFeatureId = 'hold_spin_001'
4. System:
   a. Validates: linked feature exists and is enabled → ✓
   b. Updates flowRules.entryPoints
   c. Right panel updates flow impact section (old entry connection removed, new one added)
   d. No canvas changes (screens unchanged, only connections change)
5. If linked feature doesn't exist:
   → Error: "Selected feature not found or disabled."
```

### Adding a Mechanic

```
1. User clicks [+ Add Block] in Mechanics tab
2. Block picker opens showing available MechanicTypes (with short descriptions)
   — Already-added mechanics are shown as "Added ✓" (non-selectable if conflicts)
3. User selects RETRIGGER
4. System:
   a. Adds mechanic block to feature.mechanics[]
   b. Runs template engine → adds FS_RETRIGGER to feature.screens[]
   c. Adds canvas node for FS_RETRIGGER
   d. Adds flow branches: FS_GAMEPLAY → FS_RETRIGGER, FS_RETRIGGER → FS_GAMEPLAY
   e. Right panel shows "+1 screen, +2 flow edges" in impact diff
5. Block expands immediately with default param values
6. Status re-validates
```

### Removing a Mechanic

```
1. User clicks block header to expand, then [Remove Block]
2. If mechanic has generated a screen with user edits (renamed, custom template):
   → Warning modal: "Removing this mechanic will delete FS_RETRIGGER and its
     2 flow connections. Screen has been customised. This cannot be undone."
   → [Cancel] [Remove anyway]
3. On confirm:
   a. Mechanic removed from feature.mechanics[]
   b. Generated screens removed from feature.screens[]
   c. Canvas nodes removed
   d. Flow connections removed
   e. Right panel diff updates
```

### Disabling a Feature

```
1. User toggles [● ON] → [● OFF] in feature editor header
2. Feature status = 'disabled'
3. System:
   a. All feature screens removed from canvas
   b. All feature flow connections removed
   c. Feature list item greys out with ● indicator
   d. Default preview recalculates (may change)
   e. If other features depended on this one → warning shown on those features
4. No data is lost — re-enabling restores everything
5. Right panel shows: "−{N} screens, −{M} connections"
```

### Re-enabling a Feature

```
1. User toggles [● OFF] → [● ON]
2. System restores all screens and connections
3. If canvas nodes exist at stored positions, restores to those positions
4. If canvas has been rearranged, auto-lays out at feature column position
5. Right panel shows: "+{N} screens, +{M} connections"
6. Status re-validates (may now surface warnings that were suppressed while disabled)
```

---

## 9. Visual Hierarchy

### Feature List Item Design

```
┌──────────────────────────────────────┐
│ ≡  ● Free Spins              ✓       │
│    ⚡ 3+ Scatter · 10 spins          │
│    🖥 5 screens  ·  📈 ~0.5% hit rate │
└──────────────────────────────────────┘
```

**Elements:**
- `≡` drag handle (grey, visible on hover)
- `●` feature color dot (matches canvas node accent color)
- **Feature name** — 13px, 600 weight, `#eeede6`
- Status indicator (right-aligned): `✓` green / `⚠` amber / `✕` red / `○` disabled grey
- **Auto-summary** — 10px, `#7a7a8a`, max 2 lines
  - Trigger shorthand: "⚡ 3+ Scatter" or "🛒 Manual (75×)" or "🔗 After Hold & Spin"
  - Primary mechanic value: "10 spins", "3× multiplier", "pick 3"
- **Footer row** — 9px, `#3e3e4e`
  - Screen count: `🖥 5 screens`
  - Hit rate if available: `📈 ~0.5%`

**Selected state:**
- Left border: 2px solid feature color
- Background: `rgba(feature_color, 0.06)`

### Status System

| Status | Indicator | Color | Meaning |
|--------|-----------|-------|---------|
| valid | ✓ | `#34d399` | All fields complete, no conflicts |
| warning | ⚠ | `#f59e0b` | Minor issues, feature will work but may need attention |
| error | ✕ | `#f87171` | Critical issue, feature will not function |
| incomplete | ◐ | `#60a5fa` | Recently added, required fields missing |
| disabled | ○ | `#3e3e5e` | User has disabled this feature |

### Mechanic Block Design

```
┌─────────────────────────────────────────────────┐
│  × Multiplier                    [● ON]  [≡]   │
│  ────────────────────────────────────────────── │
│  Type      [progressive ▾]                      │
│  Start     [1×]        Max  [5×]               │
│  Increment [+1× per win]                        │
│  Applies   [all wins ▾]                         │
│                                                  │
│  ↳ Affects: FS_GAMEPLAY screen                  │  ← grey linkage note
└─────────────────────────────────────────────────┘
```

Block header: `12px` uppercase label, `font-weight:700`, feature color accent on left border (`3px`)  
Params: standard form inputs using SlotForge dark-gold design tokens  
Linkage note: `9px`, `#3e3e4e`, shows what screen/connection this mechanic generates

### Reducing Complexity Visually

**Progressive disclosure:** Mechanics are collapsed by default. Click header to expand.

**Grouping:** On the Trigger tab, fields are shown only for the selected trigger type. All others are hidden — not greyed out.

**Smart defaults:** Every mechanic block opens with sensible defaults (SPIN_COUNT defaults to 10 spins, MULTIPLIER defaults to 3×). User sees a working configuration immediately and edits from there.

**Inline validation:** Fields show validation errors inline (red border + message below), not in a separate errors list.

**Complexity indicator:** Features with 5+ mechanics show a complexity badge: `● Complex` in amber. This is informational, not blocking.

---

## 10. Smart Summaries, Dependencies & Two-Way Navigation

### Smart Summary Generation

Every feature auto-generates a one-line summary from its current configuration.

```typescript
function generateSmartSummary(feature: Feature): string {
  const trigger = summarizeTrigger(feature.trigger);
  const mechanic = summarizePrimaryMechanic(feature.mechanics);
  return [trigger, mechanic].filter(Boolean).join(' · ');
}

// Trigger summary examples:
// SCATTER_COUNT(3, 'Scatter') → "⚡ 3+ Scatter"
// MANUAL(75, 'bet_multiplier') → "🛒 Manual (75×)"
// LINKED('hold_spin_001') → "🔗 After Hold & Spin"
// PROBABILITY(0.005) → "🎲 ~1 in 200 spins"

// Primary mechanic summary (first enabled mechanic with a clear value):
// SPIN_COUNT(10) → "10 spins"
// MULTIPLIER(3, 'fixed') → "3× multiplier"
// COLLECT(20) → "Collect 20"
```

Summaries update on every save (debounced 500ms from last edit).

### Dependency System

Dependencies and conflicts are defined in the Setup tab. The system enforces:

**Dependency (requires):**
- If FeatureA.dependencies = ['FeatureB'], and FeatureB is disabled → FeatureA shows `MISSING_DEPENDENCY` warning
- Feature can still be enabled — designer may be setting up A before B
- In the feature list, dependent features show a link icon between them

**Conflict:**
- If FeatureA.conflicts = ['FeatureB'], and both are enabled → both show `CONFLICTING_FEATURES` error
- The second-enabled feature (lower in the list) is shown as the one "causing" the conflict
- System does not auto-disable — this is a design decision, not a system enforcement

**Dependency graph:** A global dependency view is accessible from the panel header (`⚙ Panel Options → View Dependency Graph`). Shows all features as nodes, dependencies as grey arrows, conflicts as red crossed lines.

### "Generated by Feature" Linking

Every canvas node generated by a feature carries a `featureId` tag. This enables:

**Canvas → Features Panel:**
- Clicking a canvas node that was generated by a feature shows a banner at the bottom of the canvas inspector:
  > `Generated by: Free Spins` [Go to feature →]
- Clicking the link opens the Features Panel with that feature selected, scrolled to the Screens tab

**Features Panel → Canvas:**
- In the Screens tab, each screen has a `[Go to canvas →]` action
- In the Flow tab, each flow branch has a `[Highlight in flow →]` action
- The right panel's Canvas Impact section: clicking a screen name jumps to it

**Flow Designer → Features Panel:**
- Clicking a flow node that was generated by a feature shows:
  > `[Free Spins · FS_GAMEPLAY] → Edit feature`
- The GFD node has the feature's color applied to its border

### Two-Way Navigation Summary

```
Canvas node click
  └─▶ If generated by feature:
        Shows "Generated by Feature" banner
        [Go to Feature →] → opens Features Panel, selects feature, opens Screens tab

Features Panel → Screens tab → [Go to canvas →]
  └─▶ Canvas pans/zooms to that node, selects it, highlights it

Features Panel → Flow tab → [Highlight in flow →]
  └─▶ Opens Game Flow Designer, highlights the relevant connection in gold

Game Flow Designer node click
  └─▶ If generated by feature:
        Props panel shows: "Feature: Free Spins · [Edit →]"
        [Edit →] → opens Features Panel for that feature

Right panel → Canvas Impact → screen name click
  └─▶ Canvas jumps to that node

Right panel → Flow Impact → edge click
  └─▶ Game Flow Designer opens, highlights that connection
```

---

## Implementation Notes

### Recommended Implementation Order

1. **Data model** — implement `Feature`, `Trigger`, `Mechanic`, `FeatureScreen`, `FlowRules` interfaces. Wire into `getPayload()` / `_sfApplyPayload()`.

2. **Template engine** — implement `SCREEN_TEMPLATES` for FREE_SPINS first. This gives you a working end-to-end loop.

3. **Left column** — Feature list with status indicators and smart summaries. Add/delete features.

4. **Center editor** — Setup + Trigger tabs. This covers the core configuration that drives templates.

5. **Right panel** — Canvas Impact section (diff view). This proves the template engine is working visually.

6. **Mechanics tab** — Block-based mechanic editor. Start with SPIN_COUNT and MULTIPLIER.

7. **Flow engine** — Generate GFD connections from FlowRules. Wire into the existing GFD system.

8. **Screens tab** — Review and rename generated screens.

9. **Flow tab** — Branch editor. Re-uses the condition builder already built for GFD.

10. **Default preview** — Auto-selection algorithm + manual override UI.

11. **Two-way navigation** — Link canvas nodes and flow nodes back to features.

12. **Remaining feature types** — HOLD_SPIN, BONUS_PICK, WHEEL_BONUS, BUY_FEATURE, JACKPOT.

13. **Dependency system** — Graph validation, warning surfacing, dependency view.

### Design Tokens

Use the existing SlotForge dark-gold token set:
- Background: `#06060a` (canvas), `#0a0a0f` (panel), `#13131a` (surface)
- Border: `rgba(255,255,255,.06)`
- Gold: `#c9a84c` (active state, primary actions)
- Text: `#eeede6` (primary), `#7a7a8a` (muted), `#3e3e4e` (faint)
- Status: `#34d399` (valid), `#f59e0b` (warning), `#f87171` (error), `#60a5fa` (info)
- Font: `Inter, Space Grotesk, system-ui`

### State Management

The Features Panel state lives in a `FEATURES` global (paralleling `GFD`):

```typescript
const FEATURES: {
  list: Feature[];
  selectedId: string | null;
  activeTab: 'setup' | 'trigger' | 'mechanics' | 'screens' | 'flow';
  impactDiff: ImpactDiff | null; // right panel data
} = {
  list: [],
  selectedId: null,
  activeTab: 'trigger',
  impactDiff: null,
};
```

Serialized into `getPayload().features` and restored in `_sfApplyPayload()`.

---

*End of specification. All sections are designed to be implementable directly without further design decisions.*
