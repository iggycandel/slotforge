'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { WorkspaceSwitcher } from './workspace-switcher'
import { NavItem } from './nav-item'
import { CreditsIndicator } from '@/components/billing/CreditsIndicator'

/**
 * Primary sidebar — always visible in the app shell.
 * Uses the [orgSlug] route param to build workspace-scoped hrefs.
 */
export function Sidebar() {
  const params = useParams<{ orgSlug: string }>()
  const slug = params?.orgSlug ?? ''

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-full bg-sf-surface border-r border-sf-border">

      {/* Wordmark */}
      <div className="h-14 flex items-center px-5 border-b border-sf-border flex-shrink-0">
        <Link href={slug ? `/${slug}/dashboard` : '/'} className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Spinative" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
        </Link>
      </div>

      {/* Workspace switcher */}
      <div className="py-3 border-b border-sf-border flex-shrink-0">
        <WorkspaceSwitcher />
      </div>

      {/* Primary nav */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
        {slug && (
          <>
            <NavItem
              href={`/${slug}/dashboard`}
              icon={LayoutDashboard}
              label="Dashboard"
            />
            <NavItem
              href={`/${slug}/projects`}
              icon={FolderOpen}
              label="Projects"
            />

            {/* Section divider */}
            <div className="px-4 pt-4 pb-1">
              <span className="text-[10px] font-semibold text-sf-subtle uppercase tracking-widest">
                Workspace
              </span>
            </div>

            <NavItem
              href={`/${slug}/settings`}
              icon={Settings}
              label="Settings"
            />
          </>
        )}
      </nav>

      {/* Credits indicator — only visible when on a paid plan */}
      {slug && <CreditsIndicator orgSlug={slug} />}

      {/* Footer — user button + help */}
      <div className="border-t border-sf-border p-3 space-y-1 flex-shrink-0">
        <NavItem href="/help" icon={HelpCircle} label="Help & docs" exact />
        <div className="flex items-center gap-2.5 px-3 py-2">
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-7 h-7',
              },
            }}
          />
          <span className="text-sm text-sf-muted">Account</span>
        </div>
      </div>
    </aside>
  )
}
