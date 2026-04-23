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
    description: 'Painterly concept art, semi-realistic',
    promptModifier:
      'fantasy illustration style, painterly semi-realistic concept art, rich warm ' +
      'saturated colours, layered pigment passes, soft diffused edges, intricate ' +
      'material detail, atmospheric depth, guild wars 2 / world of warcraft loading ' +
      'screen aesthetic, high-fidelity fantasy artwork',
    negativeModifier: 'photo, 3D render, flat, minimalist, painterly texture, loose hand-painted finish',
    cardGradient: 'linear-gradient(135deg, #6b3a2a 0%, #c9a84c 100%)',
    accentColor:  '#c9a84c',
    emoji:        '🖼️',
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
    description: 'Translucent washes, soft edges',
    promptModifier:
      'watercolor painting style, translucent pigment washes, soft wet-edge bleeds, ' +
      'delicate colour transitions, paper grain texture, gentle tonal gradients, ' +
      'botanical illustration quality, muted layered hues',
    negativeModifier: 'sharp, 3D, digital, crisp, photorealistic, painterly texture, loose hand-painted finish',
    qualityModifier:
      'intentionally imperfect boundaries, feathered colour edges, visible paper ' +
      'grain, no digital polish or rendered gloss, traditional illustration feel',
    cardGradient: 'linear-gradient(135deg, #2d7a9a 0%, #c9f0ff 100%)',
    accentColor:  '#7fd4f0',
    emoji:        '💧',
  },

  // ─── Added v108: filling gaps in the genre coverage ──────────────────────
  // The original 8 styles leaned hard toward 3D / illustrated. These five
  // open up the low-fidelity and stylised corners of the space (Pixi / CSS
  // friendly), an Eastern art tradition, and a contemporary flat look for
  // minimalist UI games.

  {
    id:          'cartoon_2d',
    name:        'Cartoon 2D Stylised',
    description: 'Flat 2D, bold outlines, vector-like',
    promptModifier:
      'stylised 2D cartoon illustration, thick confident outlines, flat colour ' +
      'fills with simple shading zones, vector-art clarity, playful exaggerated ' +
      'proportions, Netflix animated series aesthetic, clean graphic design feel',
    negativeModifier: 'photorealistic, 3D render, painterly, loose painterly',
    qualityModifier:
      'crisp vector-style line art, clean colour separations, intentionally flat ' +
      'rendering with controlled shadow passes, production-ready stylised 2D asset',
    cardGradient: 'linear-gradient(135deg, #ff4081 0%, #5f50ff 100%)',
    accentColor:  '#ff4081',
    emoji:        '✏️',
  },

  {
    id:          'low_poly',
    name:        'Low Poly',
    description: 'Faceted polygons, indie-game geometry',
    promptModifier:
      'low-poly 3D art style, faceted geometric surfaces, visible triangulated ' +
      'polygons, flat-shaded planes, indie game aesthetic, monument valley / ' +
      'alto\'s adventure vibe, stylised simplified forms, soft directional lighting',
    negativeModifier: 'smooth, subdivision-surface, photorealistic, painterly, loose painterly',
    qualityModifier:
      'clean polygon topology, crisp facet edges, controlled limited palette, ' +
      'stylised geometric rendering, production-ready low-poly asset',
    cardGradient: 'linear-gradient(135deg, #3b5aa6 0%, #8affb0 100%)',
    accentColor:  '#8affb0',
    emoji:        '🔷',
  },

  {
    id:          'ukiyo_e',
    name:        'Ukiyo-e / Edo Woodblock',
    description: 'Japanese woodblock print tradition',
    promptModifier:
      'ukiyo-e Japanese woodblock print style, bold flat colour blocks, strong ' +
      'linear outlines, decorative compositional flattening, stylised natural forms, ' +
      'Hokusai / Hiroshige aesthetic, muted traditional palette of indigo, crimson, ' +
      'warm ochre and sumi ink black',
    negativeModifier: 'photorealistic, 3D render, western cartoon, loose painterly, messy painterly',
    qualityModifier:
      'crisp printed edges, registered colour separations, controlled tonal fields, ' +
      'authentic woodblock print feel, no digital gloss',
    cardGradient: 'linear-gradient(135deg, #2a3f5a 0%, #d44c3e 100%)',
    accentColor:  '#d44c3e',
    emoji:        '⛩️',
  },

  {
    id:          'minimalist_ui',
    name:        'Minimalist UI',
    description: 'Flat geometry, limited palette, icon-first',
    promptModifier:
      'minimalist flat UI illustration style, pure geometric shapes, limited 3-4 ' +
      'colour palette, generous negative space, icon-first clarity, airbnb / duolingo ' +
      'illustration language, clean rounded forms, no gradients in fills, soft long shadows only',
    negativeModifier: 'photorealistic, 3D render, painterly, ornamental, intricate detail',
    qualityModifier:
      'precise geometric construction, intentionally minimal detail, crisp flat ' +
      'colour separations, production-ready flat UI asset',
    cardGradient: 'linear-gradient(135deg, #0e5eff 0%, #9bd2ff 100%)',
    accentColor:  '#0e5eff',
    emoji:        '◎',
  },

  {
    id:          'claymation',
    name:        'Claymation',
    description: 'Stop-motion clay, handcrafted feel',
    promptModifier:
      'claymation stop-motion style, handcrafted plasticine surface texture, soft ' +
      'matte finish with visible fingerprint imperfections, cosy warm key lighting, ' +
      'aardman / laika studio aesthetic, slightly irregular organic shapes, ' +
      'tactile modelled material feel',
    negativeModifier: 'photorealistic, glossy CGI, vector art, painterly, loose painterly',
    qualityModifier:
      'soft modelled surfaces, gentle matte highlights, intentional handcrafted ' +
      'irregularities, no digital gloss, production-ready claymation-style asset',
    cardGradient: 'linear-gradient(135deg, #8a4a1f 0%, #f4b063 100%)',
    accentColor:  '#f4b063',
    emoji:        '🧱',
  },

  {
    id:          'neo_noir',
    name:        'Neo-Noir',
    description: 'High contrast shadows, pulp crime mood',
    promptModifier:
      'neo-noir graphic illustration style, extreme chiaroscuro lighting, deep ' +
      'pure black shadows against limited warm accent lights, smoky atmospheric ' +
      'haze, 1940s pulp crime cover aesthetic updated with modern graphic clarity, ' +
      'monochrome base palette with a single saturated accent colour',
    negativeModifier: 'bright cheerful, cartoon, pastel, photorealistic, loose painterly',
    qualityModifier:
      'crisp silhouette separation, controlled shadow passes, intentional palette ' +
      'restraint, moody cinematic lighting, production-ready neo-noir asset',
    cardGradient: 'linear-gradient(135deg, #050508 0%, #b8272e 100%)',
    accentColor:  '#b8272e',
    emoji:        '🎞️',
  },
]

/** Look up a style by ID. Returns undefined for the 'none' / default style. */
export function getStyleById(id: string): GraphicStyle | undefined {
  return GRAPHIC_STYLES.find(s => s.id === id)
}
