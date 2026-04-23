'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — custom SVG icons per graphic style.
//
// Replaces the mixed bag of emoji that used to sit on the style cards (system
// emoji rendered differently per OS — e.g. the Watercolor 🎭 actually looked
// like a mask). Each icon is a small illustrative glyph that reads as the
// aesthetic it represents; all drawn at the same line weight and scale so
// the row of cards feels like one family.
//
// The Default card gets its own entry (id === '' or 'default') so the
// "no style selected" state matches the visual quality bar.
//
// Usage:
//   <StyleIcon id="realistic_3d" size={22} />
// ─────────────────────────────────────────────────────────────────────────────
import type { JSX, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 22, ...rest }: IconProps, inner: JSX.Element) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >{inner}</svg>
  )
}

// ─── Individual icons ───────────────────────────────────────────────────────

/** Default (no style) — gold sparkle, the existing quality bar from the card. */
const DefaultIcon = (p: IconProps) => base(p, <>
  <path d="M12 2 L13.8 10.2 L22 12 L13.8 13.8 L12 22 L10.2 13.8 L2 12 L10.2 10.2 Z" fill="currentColor" stroke="none"/>
</>)

/** Cartoon 3D — bouncy bubble character with a highlight dot. */
const Cartoon3DIcon = (p: IconProps) => base(p, <>
  <circle cx="12" cy="13" r="8" fill="currentColor" fillOpacity="0.18"/>
  <circle cx="12" cy="13" r="8"/>
  <circle cx="9" cy="10" r="1.4" fill="currentColor" stroke="none"/>
  <circle cx="15" cy="10" r="1.4" fill="currentColor" stroke="none"/>
  <path d="M8.5 14.5 Q12 17.5 15.5 14.5" fill="none"/>
</>)

/** Realistic 3D — faceted diamond with a specular highlight. */
const Realistic3DIcon = (p: IconProps) => base(p, <>
  <path d="M4 9 L12 2 L20 9 L12 22 Z" fill="currentColor" fillOpacity="0.18"/>
  <path d="M4 9 L12 2 L20 9 L12 22 Z"/>
  <path d="M4 9 L20 9"/>
  <path d="M9 9 L12 2 L15 9 L12 22"/>
</>)

/** Fantasy Illustrated — framed painterly vista (no brush reference). */
const FantasyIllustratedIcon = (p: IconProps) => base(p, <>
  <rect x="3.5" y="5" width="17" height="14" rx="1"/>
  <path d="M3.5 15 L9 10 L13 14 L16 11 L20.5 15" fill="currentColor" fillOpacity="0.2"/>
  <path d="M3.5 15 L9 10 L13 14 L16 11 L20.5 15"/>
  <circle cx="16.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>
</>)

/** Art Deco — geometric fan / sunburst rays from a corner. */
const ArtDecoIcon = (p: IconProps) => base(p, <>
  <path d="M4 20 A16 16 0 0 1 20 4" />
  <path d="M4 20 L20 4"/>
  <path d="M4 20 L20 9"/>
  <path d="M4 20 L15 4"/>
  <path d="M4 20 L11 4"/>
  <path d="M4 20 L20 14"/>
</>)

/** Dark Gothic — pointed cathedral arch with a cross/fleur flourish. */
const DarkGothicIcon = (p: IconProps) => base(p, <>
  <path d="M6 21 L6 12 Q12 3 18 12 L18 21 Z" fill="currentColor" fillOpacity="0.18"/>
  <path d="M6 21 L6 12 Q12 3 18 12 L18 21"/>
  <path d="M10 21 L10 16 Q12 13 14 16 L14 21"/>
  <path d="M12 7 L12 9"/>
  <path d="M11 8 L13 8"/>
</>)

/** Pixel Art — literal 4×4 pixel grid with a couple of highlighted pixels. */
const PixelArtIcon = (p: IconProps) => base(p, <>
  {/* 4×4 grid, each cell 4px, inset 2px */}
  {([
    [6, 6], [10, 6], [14, 6],
    [6, 10], [14, 10],
    [6, 14], [10, 14], [14, 14],
    [6, 18], [10, 18], [14, 18],
  ] as const).map(([x, y], i) => (
    <rect key={i} x={x} y={y} width="3.5" height="3.5" fill="currentColor" stroke="none"/>
  ))}
  {/* Solid fills to create a mini-character shape */}
  <rect x="10" y="10" width="3.5" height="3.5" fill="currentColor" fillOpacity="0.35" stroke="none"/>
  <rect x="18" y="6"  width="3.5" height="3.5" fill="currentColor" fillOpacity="0.35" stroke="none"/>
  <rect x="2"  y="18" width="3.5" height="3.5" fill="currentColor" fillOpacity="0.35" stroke="none"/>
</>)

/** Anime — stylised eye with a sharp highlight (signature anime motif). */
const AnimeIcon = (p: IconProps) => base(p, <>
  <path d="M3 12 Q12 5 21 12 Q12 19 3 12 Z" fill="currentColor" fillOpacity="0.18"/>
  <path d="M3 12 Q12 5 21 12 Q12 19 3 12 Z"/>
  <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>
  <circle cx="13.3" cy="10.7" r="0.9" fill="#ffffff" stroke="none"/>
</>)

/** Watercolor — pigment droplet with surrounding colour bleeds. */
const WatercolorIcon = (p: IconProps) => base(p, <>
  <path d="M12 3 Q17 9 17 14 Q17 19 12 19 Q7 19 7 14 Q7 9 12 3 Z" fill="currentColor" fillOpacity="0.18"/>
  <path d="M12 3 Q17 9 17 14 Q17 19 12 19 Q7 19 7 14 Q7 9 12 3 Z"/>
  <path d="M9.5 11 Q10.5 10 11 12" strokeWidth="1.2" opacity="0.7"/>
  <circle cx="19" cy="17" r="1.2" fill="currentColor" stroke="none" opacity="0.5"/>
  <circle cx="5" cy="18.5" r="0.8" fill="currentColor" stroke="none" opacity="0.5"/>
</>)

// ─── Added v108 ──────────────────────────────────────────────────────────────

/** Cartoon 2D Stylised — bold outlined speech-bubble face. */
const Cartoon2DIcon = (p: IconProps) => base(p, <>
  <path d="M4 6 Q4 4 6 4 L18 4 Q20 4 20 6 L20 15 Q20 17 18 17 L10 17 L6 20 L7 17 L6 17 Q4 17 4 15 Z"
        strokeWidth="2" fill="currentColor" fillOpacity="0.15"/>
  <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none"/>
  <circle cx="15" cy="10" r="1.3" fill="currentColor" stroke="none"/>
  <path d="M9 13.5 Q12 15.5 15 13.5" strokeWidth="1.6"/>
</>)

/** Low Poly — 3D faceted gem made of triangulated planes. */
const LowPolyIcon = (p: IconProps) => base(p, <>
  <path d="M12 3 L5 8 L3 16 L8 22 L16 22 L21 16 L19 8 Z" fill="currentColor" fillOpacity="0.15"/>
  <path d="M12 3 L5 8 L3 16 L8 22 L16 22 L21 16 L19 8 Z"/>
  <path d="M12 3 L3 16 M12 3 L21 16 M12 3 L8 22 M12 3 L16 22"/>
</>)

/** Ukiyo-e — stylised cresting wave (Hokusai reference). */
const UkiyoEIcon = (p: IconProps) => base(p, <>
  <path d="M3 15 Q7 9 11 12 Q15 15 19 10 Q20 9 21 10" fill="currentColor" fillOpacity="0.2"/>
  <path d="M3 15 Q7 9 11 12 Q15 15 19 10 Q20 9 21 10"/>
  <path d="M4 17 Q10 14 14 17 Q18 20 21 17" strokeWidth="1.2" opacity="0.7"/>
  <circle cx="8" cy="7" r="1.2" fill="currentColor" stroke="none" opacity="0.8"/>
</>)

/** Minimalist UI — three stacked geometric primitives, zero ornament. */
const MinimalistUIIcon = (p: IconProps) => base(p, <>
  <circle cx="7"  cy="8"  r="3" fill="currentColor" fillOpacity="0.2"/>
  <rect   x="13" y="5"  width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.12"/>
  <path d="M4 19 L20 19" strokeWidth="2"/>
  <path d="M4 15.5 L10 15.5" strokeWidth="1.4" opacity="0.6"/>
</>)

/** Claymation — soft rounded clay blob with a highlight dimple. */
const ClaymationIcon = (p: IconProps) => base(p, <>
  <path d="M6 12 Q6 6 12 6 Q18 6 18 12 Q19 16 16 18 Q12 20 8 18 Q5 16 6 12 Z"
        fill="currentColor" fillOpacity="0.2"/>
  <path d="M6 12 Q6 6 12 6 Q18 6 18 12 Q19 16 16 18 Q12 20 8 18 Q5 16 6 12 Z"/>
  <ellipse cx="10" cy="10" rx="1.6" ry="1" fill="#ffffff" stroke="none" opacity="0.6"/>
  <path d="M13 14 Q14 15 15 14" strokeWidth="1.2" opacity="0.6"/>
</>)

/** Neo-Noir — chiaroscuro silhouette with a single accent light ray. */
const NeoNoirIcon = (p: IconProps) => base(p, <>
  <path d="M4 20 L20 20 L20 14 L14 10 L12 4 L10 10 L4 14 Z" fill="currentColor" fillOpacity="0.85" stroke="none"/>
  <path d="M4 20 L20 20 L20 14 L14 10 L12 4 L10 10 L4 14 Z"/>
  <path d="M17 4 L21 2" strokeWidth="1.6"/>
  <path d="M15 6 L19 3" strokeWidth="1.2" opacity="0.7"/>
</>)

// ─── Registry ────────────────────────────────────────────────────────────────
//
// Keep the keys in sync with lib/ai/styles.ts GRAPHIC_STYLES.id. '' and
// 'default' both map to the sparkle (for the Default / No-style card).
const STYLE_ICON_MAP: Record<string, (p: IconProps) => JSX.Element> = {
  '':                    DefaultIcon,
  'default':             DefaultIcon,
  'cartoon_3d':          Cartoon3DIcon,
  'realistic_3d':        Realistic3DIcon,
  'fantasy_illustrated': FantasyIllustratedIcon,
  'art_deco':            ArtDecoIcon,
  'dark_gothic':         DarkGothicIcon,
  'pixel_art':           PixelArtIcon,
  'anime':               AnimeIcon,
  'watercolor':          WatercolorIcon,
  // v108 additions — match GRAPHIC_STYLES ids in lib/ai/styles.ts.
  'cartoon_2d':          Cartoon2DIcon,
  'low_poly':            LowPolyIcon,
  'ukiyo_e':             UkiyoEIcon,
  'minimalist_ui':       MinimalistUIIcon,
  'claymation':          ClaymationIcon,
  'neo_noir':            NeoNoirIcon,
}

/** Renders the custom SVG for the given styleId. Falls back to the Default
 *  sparkle when an unknown id is passed. */
export function StyleIcon({ id, ...rest }: { id: string } & IconProps) {
  const Comp = STYLE_ICON_MAP[id] ?? DefaultIcon
  return <Comp {...rest} />
}
