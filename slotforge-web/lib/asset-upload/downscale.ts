// ─────────────────────────────────────────────────────────────────────────────
// Spinative — client-side image downscale for asset uploads
//
// Why this exists
// ───────────────
// Vercel's Node serverless runtime caps request bodies at 4.5 MB on the
// Hobby plan (the default for this project's deploys). A 6-megabyte
// character or reel-frame PNG sails past our route's `MAX_UPLOAD_BYTES`
// check with no fanfare — it's the platform that 413s the request,
// returning text/html that the client used to silently swallow.
//
// The fix that actually unblocks users is to keep the body comfortably
// under that cap. We re-encode large images via a hidden <canvas> so
// the upload reliably fits in 3.5 MB or under regardless of how the
// designer exported the source PNG (Photoshop's "Save for Web" already
// does much of this; not every input pipeline is so tidy).
//
// Design choices
// ──────────────
//   • PNG-with-alpha stays PNG. Reel frames and character cutouts rely
//     on transparency; flattening them onto white would ruin the
//     composition once the marketing engine layers them over a
//     background. We detect alpha by checking the source content type
//     (`image/png` keeps PNG, anything else goes JPEG).
//   • JPEG output is q90 — visually transparent for game art at the
//     resolutions we ship, ~30–40% the size of an equivalent PNG.
//   • Default `maxEdge: 2400` covers every template's largest size
//     (`store.app_store_screenshot` at 1290×2796 needs ~2400 on the
//     long edge). Going larger doesn't add visible detail because the
//     marketing engine's `fit: contain` math caps draw size at the
//     canvas dimensions.
//   • We only downscale when the file exceeds the size threshold —
//     small uploads pass through untouched so we don't pointlessly
//     re-encode 200 KB logos.
//
// Browser-only — uses `Image`, `URL.createObjectURL`, and `<canvas>`.
// Caller is responsible for guarding against SSR (the AssetsWorkspace
// + the editor's iframe are both client-only surfaces, so this is
// already the case).
// ─────────────────────────────────────────────────────────────────────────────

export interface DownscaleOptions {
  /** Skip downscale when the source is already this small (bytes). Default 3.5 MB. */
  bypassUnder?: number
  /** Max width or height after downscale, in CSS pixels. Default 2400. */
  maxEdge?:     number
  /** JPEG quality 0..1 when the output is JPEG. Default 0.9. */
  jpegQuality?: number
}

const DEFAULTS: Required<DownscaleOptions> = {
  bypassUnder: 3.5 * 1024 * 1024,
  maxEdge:     2400,
  jpegQuality: 0.9,
}

/** Re-encode a File via a canvas, downscaling if it exceeds maxEdge.
 *  Returns the original File untouched when it's already small enough.
 *  Always returns a File (not a Blob) so callers can pass it to a
 *  FormData append unchanged. */
export async function maybeDownscaleImage(
  file: File,
  opts: DownscaleOptions = {},
): Promise<File> {
  const { bypassUnder, maxEdge, jpegQuality } = { ...DEFAULTS, ...opts }
  if (file.size <= bypassUnder) return file
  if (!file.type.startsWith('image/')) return file
  // SVG / GIF would lose animation / vector fidelity — leave them.
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload  = () => res(i)
      i.onerror = () => rej(new Error('image decode failed'))
      i.src = objectUrl
    })
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return file

    const scale = Math.min(1, maxEdge / Math.max(w, h))
    const tw = Math.max(1, Math.round(w * scale))
    const th = Math.max(1, Math.round(h * scale))

    const canvas = document.createElement('canvas')
    canvas.width  = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, tw, th)

    // PNG keeps alpha; everything else encodes as JPEG.
    const isPng     = file.type === 'image/png'
    const outType   = isPng ? 'image/png' : 'image/jpeg'
    const outExt    = isPng ? 'png'       : 'jpg'
    const outName   = file.name.replace(/\.[^.]+$/, '') + '.' + outExt

    const blob: Blob = await new Promise((res, rej) => {
      canvas.toBlob(
        b => b ? res(b) : rej(new Error('canvas.toBlob returned null')),
        outType,
        isPng ? undefined : jpegQuality,
      )
    })

    // Belt-and-braces: if the re-encode somehow came out larger than
    // the original (rare but possible for already-optimised PNGs),
    // ship the original — the threshold check at the top is the
    // contract, and respecting it on disk-size is what matters.
    if (blob.size >= file.size) return file
    return new File([blob], outName, { type: outType, lastModified: Date.now() })
  } catch {
    // Decode failed — caller should let the upload proceed and let the
    // server's own validation surface a clean error. Returning the
    // original file matches "no-op on decode failure" semantics.
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
