// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Google Fonts URL helpers
//
// Three URL flavours per font family, all derived deterministically from the
// family name (and optionally the weight list):
//
//   specimenUrl  — fonts.google.com/specimen/<Family>
//                  Human-facing preview page. Lets a designer / FE dev see
//                  the full character set, supported scripts, and the
//                  family's pairing suggestions before committing.
//
//   downloadUrl  — fonts.google.com/download?family=<Family>
//                  Direct .zip of every weight's .ttf — the artefact a
//                  game runtime needs to self-host. Bypasses the @import
//                  CDN dependency so the fonts work offline / behind
//                  corporate firewalls / on locked-down build pipelines.
//
//   cssUrl       — fonts.googleapis.com/css2?family=<Family>:wght@<weights>
//                  Browser CSS @import URL — what TypographyWorkspace's
//                  live preview already uses to render the pairing.
//
// All three are pure string builders; no network calls. The download URL
// in particular is documented in the Google Fonts help docs but is NOT a
// stable public API — kept here as a thin helper so we can swap to a
// different download mechanism if Google ever changes the path.
// ─────────────────────────────────────────────────────────────────────────────

import type { FontFace } from '@/types/typography'

/** Encode a family name for a URL path segment. Spaces → +, everything
 *  else passes through encodeURIComponent. */
function encodeFamily(family: string): string {
  return encodeURIComponent(family).replace(/%20/g, '+')
}

/** Specimen page — the human-facing "preview + try it" page. */
export function googleFontsSpecimenUrl(family: string): string {
  return `https://fonts.google.com/specimen/${encodeFamily(family)}`
}

/** Direct .zip of every weight's .ttf. Triggers a download in the browser
 *  when followed.  Note: the Google Fonts site occasionally rewrites this
 *  URL; if it 404s in the wild, swap in the user's manual download flow
 *  via the specimen URL. */
export function googleFontsDownloadUrl(family: string): string {
  return `https://fonts.google.com/download?family=${encodeFamily(family)}`
}

/** Browser CSS @import URL. Mirrors the format
 *    https://fonts.googleapis.com/css2?family=Family+Name:wght@400;700
 *  used by every preview path in the workspace. */
export function googleFontsCssUrl(face: Pick<FontFace, 'family' | 'weights'>): string {
  const weightsParam = face.weights?.length
    ? `:wght@${face.weights.join(';')}`
    : ''
  return `https://fonts.googleapis.com/css2?family=${encodeFamily(face.family)}${weightsParam}&display=swap`
}

/** Combined CSS URL for two faces — what we ship in the standalone HTML
 *  doc so both pairing fonts load from a single network request. */
export function googleFontsCssUrlPair(
  display: Pick<FontFace, 'family' | 'weights'>,
  ui:      Pick<FontFace, 'family' | 'weights'>,
): string {
  const dWeights = display.weights?.length ? `:wght@${display.weights.join(';')}` : ''
  const uWeights = ui.weights?.length      ? `:wght@${ui.weights.join(';')}`      : ''
  return (
    `https://fonts.googleapis.com/css2?family=${encodeFamily(display.family)}${dWeights}` +
    `&family=${encodeFamily(ui.family)}${uWeights}` +
    `&display=swap`
  )
}
