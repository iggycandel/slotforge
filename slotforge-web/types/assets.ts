// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Shared asset type definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Rich project context from the Theme panel — fed directly into AI prompts */
export interface ProjectMeta {
  /** Game title (e.g. "Lucky Bull") */
  gameName?:       string
  /** Theme key (e.g. "western") */
  themeKey?:       string
  /** Setting / World free-text */
  setting?:        string
  /** Narrative arc free-text */
  story?:          string
  /** Mood / Tone selection */
  mood?:           string
  /** Bonus Round Narrative */
  bonusNarrative?: string
  /** Art Style selection (e.g. "Realistic", "Cartoon / Illustrated") */
  artStyle?:       string
  /** Visual Inspiration / Art Reference */
  artRef?:         string
  /** Art Direction Notes */
  artNotes?:       string
  /** Colour palette primary */
  colorPrimary?:   string
  /** Colour palette background */
  colorBg?:        string
  /** Colour palette accent */
  colorAccent?:    string
  /** Symbol counts */
  symbolHighCount?:    number
  symbolLowCount?:     number
  symbolSpecialCount?: number
  /** Per-symbol names (from the Symbols panel) */
  symbolHighNames?:    string[]
  symbolLowNames?:     string[]
  symbolSpecialNames?: string[]
}

export type AssetType =
  | 'background_base'
  | 'background_bonus'
  // High symbols — up to 8
  | 'symbol_high_1'
  | 'symbol_high_2'
  | 'symbol_high_3'
  | 'symbol_high_4'
  | 'symbol_high_5'
  | 'symbol_high_6'
  | 'symbol_high_7'
  | 'symbol_high_8'
  // Low symbols — up to 8
  | 'symbol_low_1'
  | 'symbol_low_2'
  | 'symbol_low_3'
  | 'symbol_low_4'
  | 'symbol_low_5'
  | 'symbol_low_6'
  | 'symbol_low_7'
  | 'symbol_low_8'
  // Special symbols — named first two + up to 6 additional
  | 'symbol_wild'
  | 'symbol_scatter'
  | 'symbol_special_3'
  | 'symbol_special_4'
  | 'symbol_special_5'
  | 'symbol_special_6'
  | 'logo'
  | 'character'
  | 'reel_frame'
  | 'spin_button'
  | 'jackpot_label'

export const ASSET_TYPES: AssetType[] = [
  'background_base',
  'background_bonus',
  'symbol_high_1', 'symbol_high_2', 'symbol_high_3', 'symbol_high_4',
  'symbol_high_5', 'symbol_high_6', 'symbol_high_7', 'symbol_high_8',
  'symbol_low_1',  'symbol_low_2',  'symbol_low_3',  'symbol_low_4',
  'symbol_low_5',  'symbol_low_6',  'symbol_low_7',  'symbol_low_8',
  'symbol_wild', 'symbol_scatter',
  'symbol_special_3', 'symbol_special_4', 'symbol_special_5', 'symbol_special_6',
  'logo',
  'character',
  'reel_frame',
  'spin_button',
  'jackpot_label',
]

export const ASSET_LABELS: Record<AssetType, string> = {
  background_base:   'Background — Base Game',
  background_bonus:  'Background — Bonus/Free Spins',
  symbol_high_1:     'High 1',
  symbol_high_2:     'High 2',
  symbol_high_3:     'High 3',
  symbol_high_4:     'High 4',
  symbol_high_5:     'High 5',
  symbol_high_6:     'High 6',
  symbol_high_7:     'High 7',
  symbol_high_8:     'High 8',
  symbol_low_1:      'Low 1',
  symbol_low_2:      'Low 2',
  symbol_low_3:      'Low 3',
  symbol_low_4:      'Low 4',
  symbol_low_5:      'Low 5',
  symbol_low_6:      'Low 6',
  symbol_low_7:      'Low 7',
  symbol_low_8:      'Low 8',
  symbol_wild:       'Wild',
  symbol_scatter:    'Scatter',
  symbol_special_3:  'Special 3',
  symbol_special_4:  'Special 4',
  symbol_special_5:  'Special 5',
  symbol_special_6:  'Special 6',
  logo:              'Game Logo',
  character:         'Character',
  reel_frame:        'Reel Frame',
  spin_button:       'Spin Button',
  jackpot_label:     'Jackpot Label',
}

// ─── Generated asset record (what we store in DB) ───────────────────────────

export interface GeneratedAsset {
  id:         string
  project_id: string
  type:       AssetType
  url:        string
  prompt:     string
  theme:      string
  provider:   'runway' | 'openai' | 'mock' | 'upload'
  created_at: string
}

// ─── Generation pipeline results ────────────────────────────────────────────

export interface GenerationResult {
  backgrounds: {
    base:  GeneratedAsset
    bonus: GeneratedAsset
  }
  symbols: {
    high:    GeneratedAsset[]   // length 5
    low:     GeneratedAsset[]   // length 5
    wild:    GeneratedAsset
    scatter: GeneratedAsset
  }
  logo: GeneratedAsset
}

// ─── Generation request ──────────────────────────────────────────────────────

export interface GenerateRequest {
  theme:        string      // user's raw prompt e.g. "ancient egypt"
  project_id:   string
  provider?:    'runway' | 'openai' | 'auto'
  style_id?:    string      // graphic style ID from GRAPHIC_STYLES (e.g. 'cartoon_3d')
  project_meta?: ProjectMeta
}

export interface GenerateResponse {
  success: boolean
  result?: GenerationResult
  error?:  string
  // Per-asset errors if some succeeded and some failed
  partial?: Partial<GenerationResult>
  failed?:  Array<{ type: AssetType; error: string }>
}

// ─── Canvas layer (Fabric.js compatible) ────────────────────────────────────

export interface CanvasLayer {
  id:       string
  type:     AssetType
  label:    string
  url:      string
  visible:  boolean
  locked:   boolean
  // Fabric.js object properties
  left:     number
  top:      number
  scaleX:   number
  scaleY:   number
  angle:    number
  opacity:  number
  zIndex:   number
}

export interface CanvasState {
  layers:    CanvasLayer[]
  width:     number
  height:    number
  theme:     string
  projectId: string
}

// ─── Prompt builder types ────────────────────────────────────────────────────

export type PromptCategory =
  | 'background'
  | 'symbol_high'
  | 'symbol_low'
  | 'symbol_wild'
  | 'symbol_scatter'
  | 'logo'
  | 'reel_frame'
  | 'spin_button'
  | 'jackpot_label'

export interface BuiltPrompt {
  category: PromptCategory
  assetType: AssetType
  prompt:   string
  negativePrompt: string
}
