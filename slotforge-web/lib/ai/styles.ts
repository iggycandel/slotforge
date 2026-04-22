// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Graphic Style Definitions
// Each style injects a prompt modifier into every asset generation.
// Preview images are generated on demand and cached in /public/style-refs/.
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphicStyle {
  id:               string
  name:             string
  description:      string
  /** Injected into every image prompt after the base prompt */
  promptModifier:   string
  /** Added to the negative prompt to reinforce the style */
  negativeModifier?: string
  /** Optional override for the universal CORE_QUALITY block. Styles where
   *  "premium, polished, high detail" pulls the model AWAY from the
   *  intended aesthetic (pixel, watercolor, anime) can provide a tailored
   *  quality phrasing that reinforces the style's own conventions instead.
   *  When unset, CORE_QUALITY fires as normal. */
  qualityModifier?: string
  /** CSS gradient for the style card background */
  cardGradient:     string
  /** Accent / border colour for active state */
  accentColor:      string
  /** Emoji hint shown on the card */
  emoji:            string
}

export const GRAPHIC_STYLES: GraphicStyle[] = [
  {
    id:          'cartoon_3d',
    name:        'Cartoon 3D',
    description: 'Bold, vibrant, Pixar-style',
    promptModifier:
      'cartoon 3D style, bold clean outlines, vibrant saturated colors, ' +
      'Pixar animation quality, smooth rounded forms, cel-shaded materials, ' +
      'playful cheerful aesthetic, strong rim lighting',
    negativeModifier: 'photorealistic, gritty, dark, moody',
    cardGradient: 'linear-gradient(135deg, #ff6b6b 0%, #ffd93d 100%)',
    accentColor:  '#ffd93d',
    emoji:        '🎨',
  },
  {
    id:          'realistic_3d',
    name:        'Realistic 3D',
    description: 'Photorealistic, cinematic',
    promptModifier:
      'photorealistic 3D render, physically-based rendering (PBR) materials, ' +
      'subsurface scattering, ultra-detailed textures, Unreal Engine 5 quality, ' +
      'volumetric cinematic lighting, 8K render, hyperrealistic detail',
    negativeModifier: 'cartoon, flat, illustrated, stylized',
    cardGradient: 'linear-gradient(135deg, #1a1a2e 0%, #4a4a9a 100%)',
    accentColor:  '#7a7acf',
    emoji:        '💎',
  },
  {
    id:          'fantasy_illustrated',
    name:        'Fantasy Illustrated',
    description: 'Hand-painted, semi-realistic',
    promptModifier:
      'fantasy illustration style, hand-painted brushwork, rich warm colors, ' +
      'semi-realistic concept art, oil painting technique, intricate details, ' +
      'painterly texture, guild wars 2 concept art quality',
    negativeModifier: 'photo, 3D render, flat, minimalist',
    cardGradient: 'linear-gradient(135deg, #6b3a2a 0%, #c9a84c 100%)',
    accentColor:  '#c9a84c',
    emoji:        '🖌️',
  },
  {
    id:          'art_deco',
    name:        'Art Deco',
    description: 'Geometric, luxury gold, 1920s',
    promptModifier:
      'Art Deco style, geometric symmetry, luxury gold foil and black, ' +
      'strong angular lines, 1920s casino poster aesthetic, metallic glamour, ' +
      'ornamental flourishes, gatsby-era opulence, sunburst patterns',
    negativeModifier: 'organic, cartoon, modern, flat',
    cardGradient: 'linear-gradient(135deg, #1a1206 0%, #c9a84c 100%)',
    accentColor:  '#e8c96d',
    emoji:        '🏛️',
  },
  {
    id:          'dark_gothic',
    name:        'Dark Gothic',
    description: 'Grim, atmospheric, fantasy',
    promptModifier:
      'dark gothic style, dramatic deep shadows, moody atmosphere, ' +
      'deep rich blacks and purples, gothic ornamental engravings, ' +
      'dark fantasy art, blood-red accents, skull and rune motifs, ' +
      'sinister dramatic lighting, Diablo-style game art',
    negativeModifier: 'bright, cheerful, cartoon, pastel',
    cardGradient: 'linear-gradient(135deg, #0d0014 0%, #4a0030 100%)',
    accentColor:  '#8b0060',
    emoji:        '🦇',
  },
  {
    id:          'pixel_art',
    name:        'Pixel Art',
    description: 'Retro 8/16-bit aesthetic',
    promptModifier:
      'pixel art style, 64x64 resolution aesthetic, limited 16-color palette, ' +
      'retro 8-bit to 16-bit video game look, crisp pixel edges, ' +
      'no anti-aliasing, dithering shading, classic arcade game art',
    negativeModifier: 'smooth, antialiased, 3D, photorealistic, blurred',
    qualityModifier:
      'crisp pixel grid, pure flat colour fills, intentionally low detail, ' +
      'sharp 1-pixel edges, no anti-aliasing, authentic arcade sprite feel, ' +
      'production-ready retro game asset',
    cardGradient: 'linear-gradient(135deg, #001030 0%, #00a878 100%)',
    accentColor:  '#00ff9f',
    emoji:        '👾',
  },
  {
    id:          'anime',
    name:        'Anime / Manga',
    description: 'Japanese animation, cel-shaded',
    promptModifier:
      'anime illustration style, crisp cel shading, bold line art, ' +
      'Japanese animation aesthetic, vibrant flat colors with sharp highlights, ' +
      'clean digital painting, studio ghibli meets jrpg character art quality',
    negativeModifier: 'photorealistic, western cartoon, pixel art',
    qualityModifier:
      'clean cel-shaded finish, bold confident line art, flat colour fills ' +
      'with sharp controlled highlights, intentionally non-photorealistic ' +
      'material rendering, production-ready anime asset',
    cardGradient: 'linear-gradient(135deg, #1a0533 0%, #e040fb 100%)',
    accentColor:  '#e040fb',
    emoji:        '⛩️',
  },
  {
    id:          'watercolor',
    name:        'Watercolor',
    description: 'Painterly, soft, illustrative',
    promptModifier:
      'watercolor painting style, soft wet paint edges, translucent color washes, ' +
      'painterly texture, paper grain, loose expressive brushwork, ' +
      'botanical illustration quality, delicate color gradients',
    negativeModifier: 'sharp, 3D, digital, crisp, photorealistic',
    qualityModifier:
      'loose painterly brushwork, visible paper grain and wet-edge bleeds, ' +
      'intentionally imperfect boundaries, no digital polish or rendered ' +
      'gloss, gallery-quality traditional illustration feel',
    cardGradient: 'linear-gradient(135deg, #2d7a9a 0%, #c9f0ff 100%)',
    accentColor:  '#7fd4f0',
    emoji:        '🎭',
  },
]

/** Look up a style by ID. Returns undefined for the 'none' / default style. */
export function getStyleById(id: string): GraphicStyle | undefined {
  return GRAPHIC_STYLES.find(s => s.id === id)
}
