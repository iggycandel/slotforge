'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CreditsIndicator
// Fetches the current org's AI credit status and shows a small pill in the
// sidebar. Clicking it navigates to the billing settings page.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Zap } from 'lucide-react'

interface CreditStatus {
  included:    number
  used:        number
  remaining:   number
  canGenerate: boolean
}

interface Props {
  orgSlug: string
}

export function CreditsIndicator({ orgSlug }: Props) {
  const [credits, setCredits] = useState<CreditStatus | null>(null)

  useEffect(() => {
    fetch('/api/billing/credits')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCredits(d))
      .catch(() => {})
  }, [])

  // Don't render if no credits info (free plan or error)
  if (!credits || credits.included === 0) return null

  const pct = credits.included > 0
    ? Math.min((credits.remaining / credits.included) * 100, 100)
    : 0
  const low = credits.remaining < 10

  return (
    <Link
      href={`/${orgSlug}/settings/billing`}
      className="block mx-3 my-1 px-3 py-2 rounded-xl bg-sf-bg border border-sf-border hover:border-sf-gold/30 transition-colors"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Zap size={11} className={low ? 'text-red-400' : 'text-sf-gold'} />
          <span className="text-[11px] font-medium text-sf-muted">AI Credits</span>
        </div>
        <span className={`text-[11px] font-semibold tabular-nums ${low ? 'text-red-400' : 'text-sf-text'}`}>
          {credits.remaining}/{credits.included}
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-sf-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${low ? 'bg-red-400' : 'bg-sf-gold'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {low && credits.remaining === 0 && (
        <p className="text-[10px] text-red-400 mt-1">No credits — tap to top up</p>
      )}
      {low && credits.remaining > 0 && (
        <p className="text-[10px] text-amber-400 mt-1">Running low</p>
      )}
    </Link>
  )
}
