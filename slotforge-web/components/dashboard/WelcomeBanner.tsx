'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Welcome banner
//
// 2-second paint-brush-reveal greeting that fires once per session when the
// user lands on the dashboard. A gold stroke wipes left-to-right, pulling
// the greeting text behind it; a brush-tip sparkle leads the stroke, and a
// light shimmer sweeps across it once the text lands before the whole card
// gently fades out.
//
// Premium-feel details:
//   • backdrop-blur + semi-transparent dark surface
//   • hairline gold border (matches the product palette)
//   • multi-stop gold gradient on the stroke (not flat)
//   • drop-shadow + soft gold glow halo
//   • cubic-bezier easing on every phase — no linear fades
//   • letters cascade in with 40ms stagger
//   • all animation is GPU-safe (opacity / transform / clip-path only)
//   • session-dedup so returning users aren't re-greeted on every tab
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

const SESSION_KEY = 'spn.welcome-seen'

function resolveFirstName(user: ReturnType<typeof useUser>['user']): string {
  if (!user) return ''
  // Prefer Clerk's firstName; fall back to username, then email local-part.
  // Final fallback is empty — the banner copy handles "Welcome back" on its own.
  const first = (user.firstName ?? '').trim()
  if (first) return first
  const uname = (user.username ?? '').trim()
  if (uname) return uname
  const email = user.primaryEmailAddress?.emailAddress ?? ''
  const local = email.split('@')[0]
  if (local) {
    // Capitalise the first letter for presentation.
    return local[0]!.toUpperCase() + local.slice(1)
  }
  return ''
}

export function WelcomeBanner() {
  const { user, isLoaded } = useUser()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isLoaded) return
    // Session dedup — only greet once per tab lifetime.
    if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY)) return
    setVisible(true)
    // Mark as seen immediately; auto-hide fires at the end of the keyframe.
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* private-mode safe */ }
    const t = setTimeout(() => setVisible(false), 2_100) // tiny buffer after 2s animation
    return () => clearTimeout(t)
  }, [isLoaded])

  if (!isLoaded || !visible) return null

  const first = resolveFirstName(user)
  const headline = first ? `Welcome back,` : `Welcome back`
  // Split headline into letters for the cascade effect; name renders as a
  // single unit so it reads cleanly without character-by-character hop.
  const headlineLetters = headline.split('')

  return (
    <>
      {/* Scoped keyframes kept next to the component so the file is portable */}
      <style>{KEYFRAMES}</style>

      <div role="status" aria-live="polite" className="sp-welcome">
        {/* Hairline gold border via background gradient (crisp on HiDPI). */}
        <div className="sp-welcome-inner">
          {/* ── Paint stroke: sits behind text, wipes L→R on open ─────── */}
          <div className="sp-welcome-stroke">
            <div className="sp-welcome-shimmer" />
          </div>

          {/* ── Brush-tip sparkle travelling with the stroke's leading edge ── */}
          <div className="sp-welcome-tip" />

          {/* ── Greeting text — fades in after stroke crosses 75 % ─────── */}
          <div className="sp-welcome-text">
            {headlineLetters.map((ch, i) => (
              <span
                key={i}
                className="sp-welcome-letter"
                style={{ animationDelay: `${0.75 + i * 0.035}s` }}
              >
                {ch === ' ' ? '\u00A0' : ch}
              </span>
            ))}
            {first && (
              <span
                className="sp-welcome-name"
                style={{ animationDelay: `${0.75 + headlineLetters.length * 0.035 + 0.08}s` }}
              >
                {first}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// All CSS inlined so the banner is self-contained and the exact animation
// timings stay readable in one block. Uses .sp-welcome-* class namespace to
// avoid collisions with the existing Tailwind-ish dashboard styles.
// ─────────────────────────────────────────────────────────────────────────────

const KEYFRAMES = `
/* ── Entry / exit of the card itself ───────────────────────────────── */
@keyframes sp-welcome-life {
  0%   { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  7%   { opacity: 1; transform: translateX(-50%) translateY(0); }
  80%  { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-6px); }
}
/* ── Paint stroke wipes left to right ──────────────────────────────── */
@keyframes sp-stroke-wipe {
  0%   { clip-path: inset(0 100% 0 0); }
  100% { clip-path: inset(0 0   0 0); }
}
/* ── Shimmer sweep across the stroke after it lands ────────────────── */
@keyframes sp-shimmer {
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(220%);  }
}
/* ── Brush-tip sparkle travelling with the stroke edge ─────────────── */
@keyframes sp-tip-travel {
  0%   { transform: translate(0%,   -50%) scale(0.6); opacity: 0; }
  10%  { opacity: 0.9; }
  55%  { transform: translate(calc(var(--sp-banner-w) - 100%), -50%) scale(1); opacity: 0.9; }
  62%  { opacity: 0; transform: translate(calc(var(--sp-banner-w) - 100%), -50%) scale(1.4); }
  100% { opacity: 0; transform: translate(calc(var(--sp-banner-w) - 100%), -50%) scale(1.4); }
}
/* ── Letter cascade fade-in ────────────────────────────────────────── */
@keyframes sp-letter-in {
  0%   { opacity: 0; transform: translateY(4px); filter: blur(2px); }
  100% { opacity: 1; transform: translateY(0);   filter: blur(0); }
}

.sp-welcome {
  position: fixed;
  top: 24px;
  left: 50%;
  z-index: 9999;
  pointer-events: none;
  transform: translateX(-50%);
  opacity: 0;
  animation: sp-welcome-life 2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  font-family: 'Inter','Space Grotesk',system-ui,sans-serif;
  --sp-banner-w: 360px;
}

.sp-welcome-inner {
  position: relative;
  width: var(--sp-banner-w);
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

/* The stroke is a gold gradient bar stretched across the pill, clipped
   from 100 % right-inset to 0 on wipe-in. Sits behind the text. */
.sp-welcome-stroke {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    rgba(215, 168, 79, 0)   0%,
    rgba(215, 168, 79, 0.85) 12%,
    rgba(255, 224, 140, 1)   48%,
    rgba(240, 202, 121, 1)   56%,
    rgba(215, 168, 79, 0.85) 88%,
    rgba(215, 168, 79, 0)   100%
  );
  box-shadow: 0 0 12px rgba(215, 168, 79, 0.5);
  clip-path: inset(0 100% 0 0);
  animation: sp-stroke-wipe 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
  overflow: hidden;
}

/* Shimmer is a short light band that slides across the landed stroke
   after the wipe completes, adding a premium highlight pass. */
.sp-welcome-shimmer {
  position: absolute;
  top: 0; bottom: 0; width: 35%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.65) 50%,
    transparent 100%
  );
  transform: translateX(-120%);
  animation: sp-shimmer 0.9s cubic-bezier(0.4, 0, 0.2, 1) 1.15s forwards;
}

/* Brush-tip sparkle — small soft dot that leads the stroke L→R. */
.sp-welcome-tip {
  position: absolute;
  bottom: -3px;
  left: 0;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 240, 180, 1) 0%,
    rgba(255, 210, 120, 0.8) 40%,
    rgba(215, 168, 79, 0) 80%
  );
  filter: blur(0.5px);
  opacity: 0;
  transform: translate(0%, -50%) scale(0.6);
  animation: sp-tip-travel 1s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
}

/* Greeting text container. */
.sp-welcome-text {
  position: relative;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: rgba(244, 239, 228, 0.88);
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.sp-welcome-letter {
  display: inline-block;
  opacity: 0;
  animation: sp-letter-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.sp-welcome-name {
  display: inline-block;
  margin-left: 6px;
  font-weight: 700;
  color: #f0ca79;
  text-shadow: 0 0 12px rgba(240, 202, 121, 0.35);
  opacity: 0;
  animation: sp-letter-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Accessibility: respect reduced-motion preferences — show the banner
   at its rest state, skip every transform/clip animation. */
@media (prefers-reduced-motion: reduce) {
  .sp-welcome,
  .sp-welcome-stroke,
  .sp-welcome-shimmer,
  .sp-welcome-tip,
  .sp-welcome-letter,
  .sp-welcome-name {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
  }
  .sp-welcome { opacity: 1; }
  .sp-welcome-stroke { clip-path: inset(0 0 0 0); }
  .sp-welcome-letter, .sp-welcome-name { opacity: 1; }
}
`
