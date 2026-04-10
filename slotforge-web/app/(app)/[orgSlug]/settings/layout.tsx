import Link from 'next/link'
import { PageHeader } from '@/components/app/page-header'

interface Props {
  children: React.ReactNode
  params: { orgSlug: string }
}

const NAV = (slug: string) => [
  { href: `/${slug}/settings/general`,  label: 'General' },
  { href: `/${slug}/settings/members`,  label: 'Members' },
  { href: `/${slug}/settings/billing`,  label: 'Billing' },
]

export default function SettingsLayout({ children, params }: Props) {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Workspace settings" />

      <div className="flex flex-1 overflow-hidden">
        {/* Settings sub-nav */}
        <nav className="w-48 flex-shrink-0 border-r border-sf-border py-4 px-2 space-y-0.5">
          {NAV(params.orgSlug).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm text-sf-muted hover:text-sf-text hover:bg-sf-surface/60 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-auto p-8">{children}</div>
      </div>
    </div>
  )
}
