// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Shared asset type definitions
// ─────────────────────────────────────────────────────────────────────────────

export type AssetType =
  | 'background_base'
  | 'background_bonus'
  | 'symbol_high_1'
  | 'symbol_high_2'
  | 'symbol_high_3'
  | 'symbol_high_4'
  | 'symbol_high_5'
  | 'symbol_low_1'
  | 'symbol_low_2'
  | 'symbol_low_3'
  | 'symbol_low_4'
  | 'symbol_low_5'
  | 'symbol_wild'
  | 'symbol_scatter'
  | 'logo'
  | 'character'
  | 'reel_frame'
  | 'spin_button'
  | 'jackpot_label'

export const ASSET_TYPES: AssetType[] = [
  'background_base',
  'background_bonus',
  'symbol_high_1',
  'symbol_high_2',
  'symbol_high_3',
  'symbol_high_4',
  'symbol_high_5',
  'symbol_low_1',
  'symbol_low_2',
  'symbol_low_3',
  'symbol_low_4',
  'symbol_low_5',
  'symbol_wild',
  'symbol_scatter',
  'logo',
  'character',
  'reel_frame',
  'spin_button',
  'jackpot_label',
]

export const ASSET_LABELS: Record<AssetType, string> = {
  background_base:   'Background — Base Game',
  background_bonus:  'Background — Bonus/Free Spins',
  symbol_high_1:     'High Symbol 1',
  symbol_high_2:     'High Symbol 2',
  symbol_high_3:     'High Symbol 3',
  symbol_high_4:     'High Symbol 4',
  symbol_high_5:     'High Symbol 5',
  symbol_low_1:      'Low Symbol 1',
  symbol_low_2:      'Low Symbol 2',
  symbol_low_3:      'Low Symbol 3',
  symbol_low_4:      'Low Symbol 4',
  symbol_low_5:      'Low Symbol 5',
  symbol_wild:       'Wild Symbol',
  symbol_scatter:    'Scatter Symbol',
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
  provider:   'runway' | 'openai' | 'mock'
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
  theme:      string      // user's raw prompt e.g. "ancient egypt"
  project_id: string
  provider?:  'runway' | 'openai' | 'auto'
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
