// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 7
// Server-side character background removal via Replicate's `cjwbw/rembg`.
//
// Why server-side and not in-browser:
//   • The browser-WASM rembg model is ~50 MB; that's a one-time cost the
//     user pays per page load on a slow connection — bad first impression.
//   • Replicate's hosted version produces noticeably cleaner cutouts on
//     stylised character art (less hair-detail loss, fewer halos).
//   • Cost is ~$0.002 per image, paid ONCE per project (the result is
//     cached forever in generated_assets as type='character.transparent').
//
// Why no caching here in the wrapper:
//   • The endpoint that calls this (app/api/marketing/character/extract)
//     checks generated_assets BEFORE invoking Replicate so a duplicate
//     trigger from a stale tab never burns a second call. This module
//     just owns the network round-trip.
//
// Failure mode: if Replicate is down / the API key is missing, the
// endpoint returns a 500 and the marketing engine falls back to the
// original `character` asset (the layer dispatcher in compose.ts has
// the fallback baked in). Workspace stays usable, just less polished.
// ─────────────────────────────────────────────────────────────────────────────

import Replicate from 'replicate'

/** Pinned model version. Replicate identifies a model by `<owner>/<name>:
 *  <hash>`; the bare `<owner>/<name>` resolves to whatever the latest
 *  version is at request time, which can break unexpectedly when the
 *  model author publishes a new revision. The hash here is the
 *  rembg release that's been stable on Replicate's leaderboard for
 *  months. Override via env var to bump without a code change. */
const DEFAULT_REMBG_VERSION =
  'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003'

/** Run rembg against a publicly-fetchable image URL and return the
 *  Replicate-hosted URL of the transparent PNG. The caller is expected
 *  to download that URL immediately and re-host in our own Supabase
 *  Storage — Replicate's URLs expire (typically within an hour). */
export async function removeBackground(imageUrl: string): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) {
    throw new Error('[bgremove] REPLICATE_API_TOKEN is not set')
  }

  const version = process.env.REPLICATE_REMBG_VERSION || DEFAULT_REMBG_VERSION

  const replicate = new Replicate({ auth: token })
  const output = await replicate.run(version as `${string}/${string}:${string}`, {
    input: { image: imageUrl },
  })

  // Replicate returns either a single URL string or an array of URLs
  // depending on the model's output schema. cjwbw/rembg ships a single
  // string but be defensive in case the schema evolves.
  if (typeof output === 'string') return output
  if (Array.isArray(output) && typeof output[0] === 'string') return output[0]
  // ReadableStream output (newer Replicate shape) — capture the URL by
  // reading the stream's underlying URL property when present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyOut = output as any
  if (anyOut && typeof anyOut.url === 'function') {
    const url = anyOut.url()
    if (typeof url === 'string') return url
    if (url && typeof url.toString === 'function') return url.toString()
  }
  throw new Error('[bgremove] Unexpected Replicate output shape')
}
