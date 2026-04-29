'use client'
//
// Spinative — Workspace settings shell
// ---------------------------------------------------------------------------
// Round 7 polish: header gains a subtitle + a deep-link to /account so
// the user can pivot from workspace-scoped to user-scoped settings without
// hunting through the sidebar. Tabs gain Lucide icons matching the rest
// of the app surface.
//

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import {
  Sliders,
  Users,
  CreditCard,
  User as UserIcon,
  ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  children: React.ReactNode
}

interface NavSpec {
  href:  (slug: string) => string
  label: string
  icon:  LucideIcon
}

const NAV_ITEMS: NavSpec[] = [
  { href: (slug: string) => `/${slug}/settings/general`, label: 'General', icon: Sliders     },
  { href: (slug: string) => `/${slug}/settings/members`, label: 'Members', icon: Users       },
  { href: (slug: string) => `/${slug}/settings/billing`, label: 'Billing', icon: CreditCard  },
]

export default function SettingsLayout({ children }: Props) {
  const params   = useParams<{ orgSlug: string }>()
  const pathname = usePathname()
  const slug     = params?.orgSlug ?? ''

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07080d' }}>
      {/* Header */}
      <div
        className="flex-shrink-0"
        style={{
          padding:      '24px 32px 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.015em', color: '#f4efe4', margin: 0 }}>
              Workspace settings
            </h1>
            <p style={{ fontSize: 13, color: '#7d8799', margin: '5px 0 0', lineHeight: 1.55 }}>
              Manage this workspace&apos;s name, members, and billing. For your personal
              profile, security, and sign-out, head to <Link href={`/${slug}/account`} style={{ color: '#f0ca79', textDecoration: 'underline', textUnderlineOffset: 2 }}>your account</Link>.
            </p>
          </div>
          <Link
            href={`/${slug}/account`}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            6,
              padding:        '7px 12px',
              borderRadius:   999,
              border:         '1px solid rgba(255,255,255,0.10)',
              background:     'rgba(255,255,255,0.025)',
              color:          '#a5afc0',
              fontSize:       12,
              fontWeight:     600,
              textDecoration: 'none',
              whiteSpace:     'nowrap',
              flexShrink:     0,
            }}
          >
            <UserIcon size={12} /> Account <ArrowRight size={11} />
          </Link>
        </div>

        {/* Tab nav with icons */}
        <div style={{ display: 'flex', gap: 0 }}>
          {NAV_ITEMS.map(item => {
            const href   = item.href(slug)
            const active = pathname === href || pathname.startsWith(href + '/')
            const Icon   = item.icon
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display:       'inline-flex',
                  alignItems:    'center',
                  gap:           7,
                  padding:       '10px 16px',
                  fontSize:      13,
                  fontWeight:    600,
                  letterSpacing: '-.005em',
                  textDecoration:'none',
                  color:         active ? '#f4efe4' : '#7d8799',
                  borderBottom:  active ? '2px solid #d7a84f' : '2px solid transparent',
                  marginBottom:  -1,
                  transition:    'color .15s, border-color .15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#a5afc0' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#7d8799' }}
              >
                <Icon size={13} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{ padding: '32px' }}>
        {children}
      </div>
    </div>
  )
}
