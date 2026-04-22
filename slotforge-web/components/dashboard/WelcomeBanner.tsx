'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Welcome banner (two variants)
//
// FIRST-VISIT (first time the user ever lands on the dashboard):
//   • Large centered modal-style banner — ~520 px wide, ~240 px tall
//   • Animated sparkle mark on top, wordmark headline, gold paint underline,
//     personalised subtitle, ambient drifting particles
//   • Plays over a soft vignette that doesn't block interactions
//   • Total life: 6 s
//
// RETURNING (every subsequent visit):
//   • Compact top-center pill — same paint-stroke reveal aesthetic
//   • "Welcome back, [Name]"
//   • Total life: 6 s (1.7 s action + 3.6 s hold + 0.7 s exit)
//
// Both variants:
//   • Premium feel — multi-stop gold gradients, backdrop-blur, gold halo,
//     cubic-bezier easing on every phase, GPU-only animation
//   • Reduced-motion safe (static rest state)
//   • Shown every visit; first-visit state is persisted in localStorage
//     so the elaborate greeting fires once per browser (first-visit flag is
//     cross-session, not cross-device)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

const FIRST_VISIT_KEY = 'spn.first-welcome-seen'
const TOTAL_DURATION_MS = 6_000

// ─── Name resolution ────────────────────────────────────────────────────────
function resolveFirstName(user: ReturnType<typeof useUser>['user']): string {
  if (!user) return ''
  const first = (user.firstName ?? '').trim()
  if (first) return first
  const uname = (user.username ?? '').trim()
  if (uname) return uname
  const email = user.primaryEmailAddress?.emailAddress ?? ''
  const local = email.split('@')[0]
  if (local) return local[0]!.toUpperCase() + local.slice(1)
  return ''
}

// ─── Top-level chooser ──────────────────────────────────────────────────────
export function WelcomeBanner() {
  const { user, isLoaded } = useUser()
  // Three-state: undecided (SSR / first paint) → first-visit → returning.
  // We default to null so neither variant flashes before we know.
  const [mode, setMode] = useState<'first' | 'back' | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (typeof window === 'undefined') return
    let seenFirst = false
    try { seenFirst = !!window.localStorage.getItem(FIRST_VISIT_KEY) } catch { /* private-mode */ }
    setMode(seenFirst ? 'back' : 'first')
    if (!seenFirst) {
      try { window.localStorage.setItem(FIRST_VISIT_KEY, '1') } catch { /* no-op */ }
    }
    const t = setTimeout(() => setMode(null), TOTAL_DURATION_MS + 200)
    return () => clearTimeout(t)
  }, [isLoaded])

  if (!isLoaded || mode === null) return null

  const name = resolveFirstName(user)
  return mode === 'first'
    ? <FirstVisitBanner name={name} />
    : <ReturningBanner  name={name} />
}

// ═══════════════════════════════════════════════════════════════════════════
// RETURNING BANNER — compact pill at the top, 6 s total
// ═══════════════════════════════════════════════════════════════════════════
function ReturningBanner({ name }: { name: string }) {
  const headline = name ? 'Welcome back,' : 'Welcome back'
  const letters = headline.split('')
  return (
    <>
      <style>{RETURNING_STYLES}</style>
      <div role="status" aria-live="polite" className="sp-welcome-back">
        <div className="sp-welcome-back-inner">
          <div className="sp-welcome-back-stroke">
            <div className="sp-welcome-back-shimmer" />
          </div>
          <div className="sp-welcome-back-tip" />
          <div className="sp-welcome-back-text">
            {letters.map((ch, i) => (
              <span
                key={i}
                className="sp-welcome-back-letter"
                style={{ animationDelay: `${0.75 + i * 0.035}s` }}
              >
                {ch === ' ' ? '\u00A0' : ch}
              </span>
            ))}
            {name && (
              <span
                className="sp-welcome-back-name"
                style={{ animationDelay: `${0.75 + letters.length * 0.035 + 0.08}s` }}
              >
                {name}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRST-VISIT BANNER — centered, elaborate, 6 s total
// ═══════════════════════════════════════════════════════════════════════════
function FirstVisitBanner({ name }: { name: string }) {
  const sub = name
    ? `Hi ${name} — let's build something extraordinary.`
    : `Let's build something extraordinary.`
  return (
    <>
      <style>{FIRST_VISIT_STYLES}</style>
      <div className="sp-welcome-first-vignette" aria-hidden="true" />
      <div role="status" aria-live="polite" className="sp-welcome-first">
        <div className="sp-welcome-first-halo" aria-hidden="true" />
        <div className="sp-welcome-first-inner">
          {/* ── Sparkle mark ─────────────────────────────────────────── */}
          <div className="sp-welcome-first-mark" aria-hidden="true">
            <svg viewBox="0 0 44 44" width="44" height="44">
              <defs>
                <linearGradient id="sp-first-mark-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%"  stopColor="#f0ca79" />
                  <stop offset="50%" stopColor="#ffe08c" />
                  <stop offset="100%" stopColor="#d7a84f" />
                </linearGradient>
              </defs>
              {/* 4-point star */}
              <path
                d="M22 4 L24.5 19.5 L40 22 L24.5 24.5 L22 40 L19.5 24.5 L4 22 L19.5 19.5 Z"
                fill="url(#sp-first-mark-g)"
              />
            </svg>
          </div>

          {/* ── Headline ─────────────────────────────────────────────── */}
          <div className="sp-welcome-first-headline">
            {'Welcome to '.split('').map((ch, i) => (
              <span
                key={`w-${i}`}
                className="sp-welcome-first-letter"
                style={{ animationDelay: `${0.6 + i * 0.04}s` }}
              >
                {ch === ' ' ? '\u00A0' : ch}
              </span>
            ))}
            <span
              className="sp-welcome-first-wordmark"
              style={{ animationDelay: `${0.6 + 'Welcome to '.length * 0.04 + 0.12}s` }}
            >
              Spinative
            </span>
          </div>

          {/* ── Paint-stroke underline ───────────────────────────────── */}
          <div className="sp-welcome-first-stroke">
            <div className="sp-welcome-first-shimmer" />
          </div>

          {/* ── Subtitle ─────────────────────────────────────────────── */}
          <div className="sp-welcome-first-sub">{sub}</div>

          {/* ── Ambient floating particles ───────────────────────────── */}
          <div className="sp-welcome-first-particles" aria-hidden="true">
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className="sp-welcome-first-particle"
                style={{
                  left:  `${p.x}%`,
                  bottom: `${p.y}%`,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.dur}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// Deterministic particle layout — eight tiny specks drifting up at slightly
// different rates, seeded so the animation looks organic but consistent
// between renders. Positioned within the banner's inner padding.
const PARTICLES = [
  { x: 12, y: 18, delay: 2.4, dur: 4.0 },
  { x: 24, y: 10, delay: 3.0, dur: 3.6 },
  { x: 38, y: 22, delay: 2.7, dur: 4.2 },
  { x: 52, y: 12, delay: 3.2, dur: 3.8 },
  { x: 66, y: 20, delay: 2.6, dur: 4.0 },
  { x: 78, y: 8,  delay: 3.4, dur: 3.4 },
  { x: 88, y: 24, delay: 2.9, dur: 3.9 },
  { x: 46, y: 28, delay: 3.6, dur: 3.5 },
]

// ═══════════════════════════════════════════════════════════════════════════
// STYLES — returning
// ═══════════════════════════════════════════════════════════════════════════
const RETURNING_STYLES = `
@keyframes sp-welcome-back-life {
  0%   { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  3%   { opacity: 1; transform: translateX(-50%) translateY(0); }
  92%  { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-6px); }
}
@keyframes sp-wb-stroke-wipe {
  0%   { clip-path: inset(0 100% 0 0); }
  100% { clip-path: inset(0 0 0 0); }
}
@keyframes sp-wb-shimmer {
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(220%); }
}
@keyframes sp-wb-tip-travel {
  0%   { transform: translate(0%, -50%) scale(0.6); opacity: 0; }
  10%  { opacity: 0.9; }
  55%  { transform: translate(calc(var(--sp-wb-w) - 100%), -50%) scale(1); opacity: 0.9; }
  62%  { opacity: 0; transform: translate(calc(var(--sp-wb-w) - 100%), -50%) scale(1.4); }
  100% { opacity: 0; transform: translate(calc(var(--sp-wb-w) - 100%), -50%) scale(1.4); }
}
@keyframes sp-wb-letter-in {
  0%   { opacity: 0; transform: translateY(4px); filter: blur(2px); }
  100% { opacity: 1; transform: translateY(0);   filter: blur(0); }
}

.sp-welcome-back {
  position: fixed;
  top: 24px; left: 50%;
  z-index: 9999;
  pointer-events: none;
  transform: translateX(-50%);
  opacity: 0;
  animation: sp-welcome-back-life 6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  font-family: 'Inter','Space Grotesk',system-ui,sans-serif;
  --sp-wb-w: 360px;
}
.sp-welcome-back-inner {
  position: relative;
  width: var(--sp-wb-w);
  padding: 14px 26px;
  background:
    linear-gradient(180deg, rgba(19, 19, 26, 0.88), rgba(13, 13, 22, 0.9)),
    radial-gradient(120% 60% at 0% 50%, rgba(215, 168, 79, 0.08), transparent 60%);
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  border-radius: 999px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 0 0 1px rgba(215, 168, 79, 0.22),
    0 12px 36px rgba(0, 0, 0, 0.5),
    0 0 48px rgba(215, 168, 79, 0.1);
  overflow: hidden;
}
.sp-welcome-back-stroke {
  position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: linear-gradient(90deg,
    rgba(215,168,79,0) 0%, rgba(215,168,79,0.85) 12%, rgba(255,224,140,1) 48%,
    rgba(240,202,121,1) 56%, rgba(215,168,79,0.85) 88%, rgba(215,168,79,0) 100%);
  box-shadow: 0 0 12px rgba(215, 168, 79, 0.5);
  clip-path: inset(0 100% 0 0);
  animation: sp-wb-stroke-wipe 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
  overflow: hidden;
}
.sp-welcome-back-shimmer {
  position: absolute; top: 0; bottom: 0; width: 35%;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.65) 50%, transparent 100%);
  transform: translateX(-120%);
  animation: sp-wb-shimmer 0.9s cubic-bezier(0.4, 0, 0.2, 1) 1.15s forwards;
}
.sp-welcome-back-tip {
  position: absolute; bottom: -3px; left: 0;
  width: 10px; height: 10px; border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255,240,180,1) 0%, rgba(255,210,120,0.8) 40%, rgba(215,168,79,0) 80%);
  filter: blur(0.5px); opacity: 0;
  transform: translate(0%, -50%) scale(0.6);
  animation: sp-wb-tip-travel 1s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
}
.sp-welcome-back-text {
  position: relative; text-align: center;
  font-size: 14px; font-weight: 500;
  color: rgba(244, 239, 228, 0.88);
  letter-spacing: 0.01em; white-space: nowrap;
}
.sp-welcome-back-letter {
  display: inline-block; opacity: 0;
  animation: sp-wb-letter-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.sp-welcome-back-name {
  display: inline-block; margin-left: 6px;
  font-weight: 700; color: #f0ca79;
  text-shadow: 0 0 12px rgba(240, 202, 121, 0.35);
  opacity: 0;
  animation: sp-wb-letter-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .sp-welcome-back, .sp-welcome-back-stroke, .sp-welcome-back-shimmer,
  .sp-welcome-back-tip, .sp-welcome-back-letter, .sp-welcome-back-name {
    animation-duration: 0.01ms !important; animation-delay: 0ms !important;
  }
  .sp-welcome-back { opacity: 1; }
  .sp-welcome-back-stroke { clip-path: inset(0 0 0 0); }
  .sp-welcome-back-letter, .sp-welcome-back-name { opacity: 1; }
}
`

// ═══════════════════════════════════════════════════════════════════════════
// STYLES — first visit
// ═══════════════════════════════════════════════════════════════════════════
const FIRST_VISIT_STYLES = `
@keyframes sp-first-vignette {
  0%   { opacity: 0; }
  10%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes sp-first-life {
  0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.96); filter: blur(4px); }
  6%   { opacity: 1; transform: translate(-50%, -50%) scale(1);    filter: blur(0); }
  88%  { opacity: 1; transform: translate(-50%, -50%) scale(1);    filter: blur(0); }
  100% { opacity: 0; transform: translate(-50%, -52%) scale(0.99); filter: blur(1px); }
}
@keyframes sp-first-halo {
  0%,100% { opacity: 0.55; transform: translate(-50%, -50%) scale(1); }
  50%     { opacity: 0.8;  transform: translate(-50%, -50%) scale(1.06); }
}
@keyframes sp-first-mark-in {
  0%   { opacity: 0; transform: scale(0.4) rotate(-35deg); }
  60%  { opacity: 1; transform: scale(1.15) rotate(6deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
@keyframes sp-first-mark-pulse {
  0%,100% { filter: drop-shadow(0 0 10px rgba(240, 202, 121, 0.35)); }
  50%     { filter: drop-shadow(0 0 20px rgba(240, 202, 121, 0.7)); }
}
@keyframes sp-first-letter-in {
  0%   { opacity: 0; transform: translateY(10px); filter: blur(6px); }
  100% { opacity: 1; transform: translateY(0);    filter: blur(0); }
}
@keyframes sp-first-wordmark-in {
  0%   { opacity: 0; transform: translateY(10px) scale(0.96); letter-spacing: -0.02em; filter: blur(6px); }
  100% { opacity: 1; transform: translateY(0)    scale(1);    letter-spacing: 0;       filter: blur(0); }
}
@keyframes sp-first-stroke-wipe {
  0%   { clip-path: inset(0 100% 0 0); }
  100% { clip-path: inset(0 0 0 0); }
}
@keyframes sp-first-shimmer {
  0%   { transform: translateX(-140%); }
  100% { transform: translateX(240%); }
}
@keyframes sp-first-sub-in {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes sp-first-particle {
  0%   { opacity: 0; transform: translateY(0) scale(0.6); }
  25%  { opacity: 0.9; }
  100% { opacity: 0; transform: translateY(-60px) scale(1.1); }
}

.sp-welcome-first-vignette {
  position: fixed; inset: 0; z-index: 9998; pointer-events: none;
  background: radial-gradient(
    60% 60% at 50% 50%,
    rgba(0,0,0,0) 0%, rgba(7,8,13,0.6) 100%
  );
  opacity: 0;
  animation: sp-first-vignette 6s linear forwards;
}

.sp-welcome-first {
  position: fixed; top: 50%; left: 50%; z-index: 9999;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.96);
  opacity: 0;
  animation: sp-first-life 6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  font-family: 'Inter','Space Grotesk',system-ui,sans-serif;
  width: 520px; max-width: 92vw;
}

/* Halo — soft gold radial bloom behind the card, gently breathing */
.sp-welcome-first-halo {
  position: absolute; top: 50%; left: 50%;
  width: 680px; height: 340px; max-width: 120%;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    60% 60% at 50% 50%,
    rgba(240, 202, 121, 0.22) 0%,
    rgba(215, 168, 79, 0.12) 40%,
    rgba(215, 168, 79, 0) 75%
  );
  filter: blur(30px);
  opacity: 0.55;
  animation: sp-first-halo 3s ease-in-out 0.6s infinite;
}

.sp-welcome-first-inner {
  position: relative;
  padding: 34px 44px 36px;
  background:
    linear-gradient(180deg, rgba(19, 19, 26, 0.92), rgba(12, 12, 20, 0.94)),
    radial-gradient(140% 80% at 50% 0%, rgba(215, 168, 79, 0.1), transparent 70%);
  backdrop-filter: blur(20px) saturate(1.15);
  -webkit-backdrop-filter: blur(20px) saturate(1.15);
  border-radius: 20px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 0 0 1px rgba(215, 168, 79, 0.28),
    0 20px 56px rgba(0, 0, 0, 0.55),
    0 0 80px rgba(215, 168, 79, 0.14);
  text-align: center;
  overflow: hidden;
}

.sp-welcome-first-mark {
  display: block; width: 44px; height: 44px; margin: 0 auto 14px;
  opacity: 0;
  animation:
    sp-first-mark-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.25s forwards,
    sp-first-mark-pulse 3s ease-in-out 1.5s infinite;
}

.sp-welcome-first-headline {
  font-size: 26px;
  font-weight: 600;
  color: rgba(244, 239, 228, 0.92);
  letter-spacing: -0.01em;
  line-height: 1.2;
  margin-bottom: 14px;
  white-space: nowrap;
}
.sp-welcome-first-letter {
  display: inline-block; opacity: 0;
  animation: sp-first-letter-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.sp-welcome-first-wordmark {
  display: inline-block;
  font-weight: 800;
  background: linear-gradient(135deg, #d7a84f 0%, #ffe08c 50%, #d7a84f 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  text-shadow: 0 0 20px rgba(240, 202, 121, 0.35);
  opacity: 0;
  animation: sp-first-wordmark-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) 1.15s forwards;
}

/* Paint-stroke underline — wider & thicker than the returning variant */
.sp-welcome-first-stroke {
  position: relative;
  width: 140px;
  height: 3px;
  margin: 0 auto 18px;
  border-radius: 2px;
  background: linear-gradient(90deg,
    rgba(215,168,79,0) 0%, rgba(240,202,121,1) 30%, rgba(255,224,140,1) 50%,
    rgba(240,202,121,1) 70%, rgba(215,168,79,0) 100%);
  box-shadow: 0 0 14px rgba(240, 202, 121, 0.6);
  clip-path: inset(0 100% 0 0);
  animation: sp-first-stroke-wipe 1s cubic-bezier(0.16, 1, 0.3, 1) 1.3s forwards;
  overflow: hidden;
}
.sp-welcome-first-shimmer {
  position: absolute; top: 0; bottom: 0; width: 40%;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%);
  transform: translateX(-140%);
  animation: sp-first-shimmer 1.2s cubic-bezier(0.4, 0, 0.2, 1) 2.4s forwards;
}

.sp-welcome-first-sub {
  font-size: 14px; font-weight: 400;
  color: rgba(244, 239, 228, 0.72);
  letter-spacing: 0.01em;
  line-height: 1.5;
  opacity: 0;
  animation: sp-first-sub-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) 2.0s forwards;
}

/* Ambient floating particles */
.sp-welcome-first-particles {
  position: absolute; inset: 0; pointer-events: none;
}
.sp-welcome-first-particle {
  position: absolute;
  width: 4px; height: 4px; border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255,240,180,1) 0%, rgba(240,202,121,0.8) 50%, rgba(215,168,79,0) 90%);
  filter: blur(0.5px);
  opacity: 0;
  animation: sp-first-particle 4s ease-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .sp-welcome-first-vignette, .sp-welcome-first,
  .sp-welcome-first-halo, .sp-welcome-first-mark,
  .sp-welcome-first-letter, .sp-welcome-first-wordmark,
  .sp-welcome-first-stroke, .sp-welcome-first-shimmer,
  .sp-welcome-first-sub, .sp-welcome-first-particle {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
  }
  .sp-welcome-first, .sp-welcome-first-mark,
  .sp-welcome-first-letter, .sp-welcome-first-wordmark,
  .sp-welcome-first-sub { opacity: 1; }
  .sp-welcome-first-stroke { clip-path: inset(0 0 0 0); }
}
`
