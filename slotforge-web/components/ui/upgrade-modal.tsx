'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Upgrade / Gate Modal
// Reusable modal shown when a feature is locked behind a plan upgrade.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { X } from 'lucide-react'

export type UpgradeModalType = 'upgrade' | 'credits' | 'project_limit' | 'export'

interface Props {
  type:        UpgradeModalType
  billingHref: string          // e.g. "/{orgSlug}/settings/billing"
  onClose:     () => void
}

const CONTENT: Record<UpgradeModalType, {
  icon:     string
  title:    string
  body:     string
  cta:      string
}> = {
  upgrade: {
    icon:  '✨',
    title: 'AI generation requires a paid plan',
    body:  'The Free plan lets you explore the canvas and manage projects, but AI generation is a Freelancer and Studio feature. Upgrade to start generating assets in seconds.',
    cta:   'View plans',
  },
  credits: {
    icon:  '🔋',
    title: 'No AI credits remaining',
    body:  "You've used all your included credits for this month. Top up with a credit pack (50 credits for €10) or wait for your monthly reset.",
    cta:   'Top up credits',
  },
  project_limit: {
    icon:  '📁',
    title: 'Project limit reached',
    body:  'The Free plan includes up to 2 projects. Upgrade to Freelancer or Studio to create unlimited projects.',
    cta:   'Upgrade plan',
  },
  export: {
    icon:  '📦',
    title: 'Exports require a paid plan',
    body:  'Asset exports (PNG, Spine-ready) are available on the Freelancer and Studio plans. Upgrade to download your generated assets.',
    cta:   'Upgrade plan',
  },
}

export function UpgradeModal({ type, billingHref, onClose }: Props) {
  const { icon, title, body, cta } = CONTENT[type]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#13131a', border: '1px solid rgba(201,168,76,.3)',
        borderRadius: 20, padding: 32, maxWidth: 400, width: '90%',
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none',
            cursor: 'pointer', color: '#7a7a8a', lineHeight: 1,
          }}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>

        {/* Content */}
        <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
        <p style={{ fontWeight: 700, fontSize: 17, color: '#eeede6', marginBottom: 8 }}>
          {title}
        </p>
        <p style={{ fontSize: 13, color: '#7a7a8a', marginBottom: 24, lineHeight: 1.6 }}>
          {body}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href={billingHref}
            onClick={onClose}
            style={{
              flex: 1, textAlign: 'center', padding: '10px 0',
              background: '#c9a84c', color: '#06060a',
              borderRadius: 10, fontWeight: 700, fontSize: 14,
              textDecoration: 'none', display: 'block',
            }}
          >
            {cta}
          </Link>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', background: 'none',
              border: '1px solid rgba(255,255,255,.1)', color: '#7a7a8a',
              borderRadius: 10, cursor: 'pointer', fontSize: 14,
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
