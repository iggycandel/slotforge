'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'

interface Props {
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: (slug: string) => `/${slug}/settings/general`,  label: 'General' },
  { href: (slug: string) => `/${slug}/settings/members`,  label: 'Members' },
  { href: (slug: string) => `/${slug}/settings/billing`,  label: 'Billing' },
]

export default function SettingsLayout({ children }: Props) {
  const params = useParams<{ orgSlug: string }>()
  const pathname = usePathname()
  const slug = params?.orgSlug ?? ''

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07080d' }}>
      {/* Header */}
      <div
        className="flex-shrink-0"
        style={{ padding: '24px 32px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f4efe4', margin: '0 0 20px' }}>
          Workspace settings
        </h1>

        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const href = item.href(slug)
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding: '8px 16px',
                  fontSize: 13, fontWeight: 500,
                  textDecoration: 'none',
                  color: active ? '#f4efe4' : '#7d8799',
                  borderBottom: active ? '2px solid #d7a84f' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'color 0.15s',
                }}
              >
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
