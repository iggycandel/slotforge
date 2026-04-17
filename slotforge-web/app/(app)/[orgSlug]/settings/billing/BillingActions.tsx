'use client'

import { useState }  from 'react'
import { useRouter } from 'next/navigation'
import type { Plan } from '@/lib/billing/plans'

interface Props {
  mode:     'checkout' | 'portal'
  orgSlug:  string
  plan?:    Plan   // required when mode === 'checkout'
}

export default function BillingActions({ mode, orgSlug, plan }: Props) {
  const router  = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setBusy(true)
    setError(null)

    try {
      const endpoint = mode === 'checkout' ? '/api/billing/checkout' : '/api/billing/portal'
      const body     = mode === 'checkout' ? { plan } : {}

      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok || !data.url) {
        setError(data.error ?? 'Something went wrong — please try again.')
        return
      }

      // Redirect to Stripe
      window.location.href = data.url
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'portal') {
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          onClick={handleClick}
          disabled={busy}
          className="px-4 py-2 rounded-xl border border-sf-border bg-sf-surface text-sf-muted text-sm font-medium hover:border-sf-gold/40 hover:text-sf-text transition-all disabled:opacity-40"
        >
          {busy ? 'Opening…' : 'Manage billing →'}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  // Checkout button
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className="w-full py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
        style={{
          background: busy ? 'rgba(201,168,76,.2)' : '#c9a84c',
          color:      busy ? '#c9a84c' : '#06060a',
        }}
      >
        {busy ? 'Redirecting…' : `Upgrade to ${plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : ''}`}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
