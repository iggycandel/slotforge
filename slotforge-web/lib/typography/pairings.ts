// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Font pairing library
//
// 15 curated slot-genre font pairings. Every pairing is:
//   • Google-Fonts hosted (fetched at render time, OFL-1.1 licensed)
//   • Paired for display/title + ui/body so a single pairing covers the
//     full popup style set (title, subtitle, cta, body, numeric, label)
//   • Tagged with keywords so the model can match on theme vocabulary
//     ("samurai" → oriental-asian, "volcano desert" → egyptian-pharaoh)
//
// The vision model is CONSTRAINED to pick a pairing by `id` — it never
// invents new font names. This avoids hallucinated families that don't
// ship on Google Fonts and keeps the download artifact (standalone
// HTML) self-contained.
//
// Originally ported from the Type Forge prototype (docs/typography/
// type-forge.html). Keep entries stable; downstream renderers may key
// on pairing id for cache lookup. Adding new pairings is fine;
// renaming / deleting is a breaking change.
// ─────────────────────────────────────────────────────────────────────────────

import type { FontPairing } from '@/types/typography'

export const FONT_LIBRARY: FontPairing[] = [
  { id: 'synthwave-neon', name: 'Synthwave Neon',
    description: 'Retro 80s, Miami Vice, neon signage, palm trees, chrome',
    keywords: ['neon','retro','80s','synthwave','miami','vaporwave','arcade','glow','purple','pink','cyan'],
    display: { family: 'Audiowide',     weights: [400] },
    ui:      { family: 'Chakra Petch',  weights: [500,600,700] } },

  { id: 'art-deco-gatsby', name: 'Art Deco Gatsby',
    description: '1920s luxury, Gatsby, jazz age, geometric symmetry',
    keywords: ['art deco','1920s','gatsby','luxury','elegant','gold','jazz','geometric','prohibition'],
    display: { family: 'Limelight',  weights: [400] },
    ui:      { family: 'Poiret One', weights: [400] } },

  { id: 'fantasy-rpg', name: 'Fantasy RPG',
    description: 'Dragons, swords, medieval, high fantasy, runes',
    keywords: ['fantasy','medieval','dragon','sword','rpg','knight','wizard','elven','dungeon','castle','mythic'],
    display: { family: 'MedievalSharp', weights: [400] },
    ui:      { family: 'Cinzel',        weights: [400,600,700] } },

  { id: 'fruit-classic', name: 'Classic Fruit',
    description: 'Vegas, cherries, 777, traditional slot, casino floor',
    keywords: ['fruit','cherry','classic','vegas','777','casino','diamond','lucky','traditional'],
    display: { family: 'Bungee',  weights: [400] },
    ui:      { family: 'Oswald',  weights: [500,600,700] } },

  { id: 'oriental-asian', name: 'Oriental Asian',
    description: 'Dragons, koi, cherry blossoms, golden pagodas',
    keywords: ['asian','chinese','japanese','dragon','koi','jade','panda','fortune','oriental','prosperity','zen'],
    display: { family: 'Cinzel Decorative', weights: [400,700,900] },
    ui:      { family: 'Noto Sans',         weights: [500,600,700] } },

  { id: 'egyptian-pharaoh', name: 'Egyptian Pharaoh',
    description: 'Pyramids, sarcophagus, Book of the Dead, golden gods',
    keywords: ['egyptian','pharaoh','pyramid','cleopatra','anubis','horus','sphinx','hieroglyph','desert','tomb'],
    display: { family: 'Cinzel Decorative', weights: [700,900] },
    ui:      { family: 'Cinzel',            weights: [400,600] } },

  { id: 'wild-west', name: 'Wild West',
    description: 'Cowboys, saloons, wanted posters, desert sunsets',
    keywords: ['western','cowboy','saloon','wild west','wanted','sheriff','desert','bandit','bull','frontier','rodeo'],
    display: { family: 'Rye',           weights: [400] },
    ui:      { family: 'Special Elite', weights: [400] } },

  { id: 'luxury-gold', name: 'Luxury Gold',
    description: 'Champagne, diamonds, black-tie, VIP high roller',
    keywords: ['luxury','premium','vip','diamond','champagne','high roller','exclusive','opulent','rich','platinum'],
    display: { family: 'Playfair Display', weights: [700,900] },
    ui:      { family: 'Montserrat',       weights: [500,600,700] } },

  { id: 'sports-arena', name: 'Sports Arena',
    description: 'Football, stadium, team colors, scoreboard energy',
    keywords: ['sports','football','soccer','stadium','team','athletic','championship','trophy','arena','kick','goal'],
    display: { family: 'Bebas Neue',       weights: [400] },
    ui:      { family: 'Barlow Condensed', weights: [500,600,700] } },

  { id: 'pirate-adventure', name: 'Pirate Adventure',
    description: 'Treasure maps, skulls, Jolly Roger, galleons',
    keywords: ['pirate','treasure','skull','ship','sea','buccaneer','jolly roger','captain','cove','nautical','adventure'],
    display: { family: 'Pirata One',       weights: [400] },
    ui:      { family: 'IM Fell English',  weights: [400] } },

  { id: 'horror-gothic', name: 'Horror Gothic',
    description: 'Vampires, haunted houses, blood, crypts, moonlight',
    keywords: ['horror','gothic','vampire','haunted','blood','dark','scary','halloween','creepy','zombie','crypt'],
    display: { family: 'Creepster',     weights: [400] },
    ui:      { family: 'Special Elite', weights: [400] } },

  { id: 'candy-kids', name: 'Candy Kids',
    description: 'Sweets, bubblegum, cartoon, bright, playful',
    keywords: ['candy','sweet','sugar','bubblegum','cartoon','kids','playful','bright','cute','lollipop','gummy'],
    display: { family: 'Fredoka One', weights: [400] },
    ui:      { family: 'Baloo 2',     weights: [500,600,700] } },

  { id: 'tropical-beach', name: 'Tropical Beach',
    description: 'Palm trees, coconuts, tiki, sunset, surf',
    keywords: ['tropical','beach','palm','coconut','tiki','hawaii','surf','paradise','ocean','aloha','island'],
    display: { family: 'Righteous', weights: [400] },
    ui:      { family: 'Quicksand', weights: [500,600,700] } },

  { id: 'sci-fi-cyber', name: 'Sci-Fi Cyber',
    description: 'Space, cyberpunk, futuristic, holographic',
    keywords: ['sci fi','space','cyberpunk','futuristic','robot','alien','galaxy','hologram','laser','cyber','tech'],
    display: { family: 'Orbitron', weights: [500,700,900] },
    ui:      { family: 'Rajdhani', weights: [500,600,700] } },

  { id: 'mythology-greek', name: 'Greek Mythology',
    description: 'Zeus, Olympus, Spartan, marble columns, lightning',
    keywords: ['greek','mythology','zeus','olympus','sparta','gods','marble','lightning','titan','hercules','roman'],
    display: { family: 'Cinzel',    weights: [700,900] },
    ui:      { family: 'Marcellus', weights: [400] } },
]

/** Fast-lookup set of valid pairing ids — used by the API route to
 *  validate the model's output and fall back to a safe default if the
 *  model hallucinates an id. */
export const PAIRING_IDS: Set<string> = new Set(FONT_LIBRARY.map(p => p.id))

/** Safe fallback when the model returns an unknown id. Synthwave is a
 *  versatile, visually distinctive choice that reads well with most
 *  screenshot palettes; better than 'classic-fruit' which only fits
 *  one genre. */
export const DEFAULT_PAIRING_ID = 'synthwave-neon'

export function findPairing(id: string): FontPairing {
  return FONT_LIBRARY.find(p => p.id === id)
      ?? FONT_LIBRARY.find(p => p.id === DEFAULT_PAIRING_ID)!
}
