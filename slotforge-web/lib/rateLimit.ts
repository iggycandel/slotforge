// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Rate limit helper (v121 / H3)
//
// Audit H3: AI routes (/api/ai-single, /api/generate, /api/typography/generate,
// /api/references/describe, /api/parse-gdd, /api/prompts/preview-all) had no
// per-user throttling. A signed-in user with a valid plan could fire 1000
// /api/ai-single calls in a tight loop and burn through the entire monthly
// credit allowance in a few seconds (and rack up a real OpenAI bill before
// the credit gate caught up). The audit recommends a sliding-window limit
// per (user, route-class) using Upstash Redis or @vercel/kv.
//
// This module exposes a single helper, `rateLimit(key, kind)`, that returns
// `{ ok: true } | { ok: false, retryAfterSec }`. Routes call it after
// authenticating the user and before any expensive work.
//
// Two backends:
//   1. Upstash Redis — preferred. Activates when both
//      UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set. Provides
//      true cross-instance limits (Vercel functions are stateless, so
//      in-memory limits leak across instances).
//   2. In-memory fallback — used when Upstash env vars are absent. Logs a
//      single warning at module init so the operator knows protection is
//      degraded. Useful for local dev and pre-Upstash beta deployments;
//      best-effort under load on Vercel since each warm function instance
//      keeps its own map. Don't ship to production without Upstash.
//
// "Kinds" are bucket presets — a single source-of-truth for "what's a
// reasonable rate" so individual routes don't drift. Tweak here, not in
// the route handlers.
// ─────────────────────────────────────────────────────────────────────────────

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

// ─── Bucket presets ──────────────────────────────────────────────────────────
//
// Keep these conservative — the credit system is the spending ceiling; the
// rate limit just stops a runaway client from racing the credit decrement
// (which is now atomic in v121/C2 but still costs an OpenAI call before
// failing). Bursts of legitimate single-user traffic (e.g. the ASSETS
// workspace firing 15 sequential /api/ai-single calls when the user mashes
// "Generate missing") should pass.
//
// Window units are seconds. Limit is "requests per window". Routes pick
// the kind that matches their cost profile.

export type RateLimitKind =
  | 'ai_image'      // Image generation — most expensive ($/call). 12/min/user.
  | 'ai_vision'     // Vision describe / typography. Cheap-ish, but bursty.
  | 'ai_parse'      // GDD parsing — text-only, single shot. 6/min covers a busy import session.
  | 'ai_metadata'   // Prompt preview / compose-only (no model call). Defensive cap.

interface BucketPreset {
  /** Request budget per window. */
  limit:    number
  /** Window length in seconds. */
  windowS:  number
}

const PRESETS: Record<RateLimitKind, BucketPreset> = {
  // 12/min covers the ASSETS workspace's typical "fill 15 missing" run
  // (each request is sequential, ~25 s apart) but blocks a scripted loop
  // that fires at >1 Hz.
  ai_image:    { limit: 12,  windowS: 60  },
  // Typography/reference descriptions are vision calls; the user normally
  // generates one or two in a row from the panel. 20/min is plenty.
  ai_vision:   { limit: 20,  windowS: 60  },
  // GDD parse — the user uploads a doc and waits. Re-uploads are rare.
  ai_parse:    { limit: 6,   windowS: 60  },
  // Compose-only. No model call but the prompt builder is non-trivial
  // and Review-Prompts sends 200 keys per call. Defensive cap.
  ai_metadata: { limit: 30,  windowS: 60  },
}

// ─── Backend selection ───────────────────────────────────────────────────────

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// Lazily instantiated Upstash limiters — one per kind. Kept in a module-
// scope cache so we don't pay the constructor cost on every request. Each
// Ratelimit instance binds a sliding-window algorithm + namespace, so
// they need to be separate objects.
const upstashLimiters: Partial<Record<RateLimitKind, Ratelimit>> = {}
let upstashRedis: Redis | null = null

function getUpstashLimiter(kind: RateLimitKind): Ratelimit | null {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null
  if (!upstashRedis) {
    upstashRedis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN })
  }
  if (!upstashLimiters[kind]) {
    const preset = PRESETS[kind]
    upstashLimiters[kind] = new Ratelimit({
      redis:     upstashRedis,
      // Sliding window — gives smoother throttling than fixed window
      // (no edge-of-window double-burst attack).
      limiter:   Ratelimit.slidingWindow(preset.limit, `${preset.windowS} s`),
      // Namespacing keeps the four kinds in separate counters in Redis.
      prefix:    `spinative:rl:${kind}`,
      // Analytics off — we have our own logging and don't need the
      // overhead at the per-request hot path.
      analytics: false,
    })
  }
  return upstashLimiters[kind]!
}

// ─── In-memory fallback ──────────────────────────────────────────────────────
//
// Per-process LRU-ish map. Each entry is { count, resetAt }. Cleaned up
// lazily on access — we don't keep a timer to walk the map because (a)
// Vercel kills idle functions anyway and (b) the map is bounded by the
// number of distinct (kind, key) pairs hitting THIS instance, which in
// practice is small.

interface MemEntry { count: number; resetAt: number }
const memBuckets = new Map<string, MemEntry>()
const MEM_BUDGET = 5000  // hard cap on entries per instance — eviction LRU-ish via Map insertion order

let warnedNoUpstash = false
function warnFallback() {
  if (warnedNoUpstash) return
  warnedNoUpstash = true
  console.warn(
    '[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — falling back to in-memory ' +
    'limiter. This is ONLY safe for single-instance dev environments. Configure ' +
    'Upstash before going to production.'
  )
}

function memLimit(kind: RateLimitKind, key: string): RateLimitOutcome {
  warnFallback()
  const preset = PRESETS[kind]
  const now    = Date.now()
  const bucketKey = `${kind}::${key}`
  const existing = memBuckets.get(bucketKey)

  if (!existing || existing.resetAt <= now) {
    // Fresh window. If we're at the size cap evict the oldest entry
    // (Map iteration order = insertion order in modern engines).
    if (memBuckets.size >= MEM_BUDGET) {
      const firstKey = memBuckets.keys().next().value
      if (firstKey) memBuckets.delete(firstKey)
    }
    memBuckets.set(bucketKey, { count: 1, resetAt: now + preset.windowS * 1000 })
    return { ok: true, remaining: preset.limit - 1, retryAfterSec: 0 }
  }

  if (existing.count >= preset.limit) {
    return {
      ok:            false,
      remaining:     0,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    }
  }

  existing.count += 1
  return {
    ok:            true,
    remaining:     preset.limit - existing.count,
    retryAfterSec: 0,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RateLimitOutcome {
  ok:            boolean
  remaining:     number
  /** Seconds until the next request will be allowed. 0 when ok:true. */
  retryAfterSec: number
}

/**
 * Check whether `key` is allowed to make another request of `kind`. Returns
 * { ok: true, remaining } when the request fits in the bucket, or
 * { ok: false, retryAfterSec } when the user has exhausted the bucket and
 * should back off. Routes typically respond 429 with a Retry-After header.
 *
 * `key` is the rate-limit identity — usually `effectiveId` (orgId ?? userId)
 * scoped to a single Clerk principal. Don't use IP addresses for AI routes:
 * a single corporate NAT will collapse hundreds of legitimate users into
 * one bucket.
 */
export async function rateLimit(
  key:  string,
  kind: RateLimitKind,
): Promise<RateLimitOutcome> {
  if (!key) return { ok: true, remaining: PRESETS[kind].limit, retryAfterSec: 0 }

  const upstash = getUpstashLimiter(kind)
  if (upstash) {
    try {
      const r = await upstash.limit(key)
      return {
        ok:            r.success,
        remaining:     r.remaining,
        retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
      }
    } catch (err) {
      // Don't fail-closed on a Redis hiccup — log and fall back to memory
      // for this single request. Better to occasionally over-allow than
      // to hard-block a paying user when our infra wobbles.
      console.error(`[rateLimit] Upstash error (${kind}/${key}):`, err)
      return memLimit(kind, key)
    }
  }

  return memLimit(kind, key)
}

/**
 * Build a 429 NextResponse body + headers for a denied request. Centralised
 * so every route returns the same shape; the frontend can show "Try again
 * in N seconds" without per-route plumbing.
 */
export function rateLimitResponse(outcome: RateLimitOutcome): Response {
  const retry = Math.max(1, outcome.retryAfterSec)
  return new Response(
    JSON.stringify({
      error:         'rate_limited',
      message:       `Too many requests. Try again in ${retry}s.`,
      retryAfterSec: retry,
    }),
    {
      status:  429,
      headers: {
        'Content-Type':  'application/json',
        'Retry-After':   String(retry),
        // Informational — useful in browser devtools.
        'X-RateLimit-Remaining': String(Math.max(0, outcome.remaining)),
      },
    },
  )
}
