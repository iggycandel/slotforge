'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  HelpCircle,
  Sparkles,
} from 'lucide-react'
import { WorkspaceSwitcher } from './workspace-switcher'
import { NavItem } from './nav-item'
import { CreditsIndicator } from '@/components/billing/CreditsIndicator'

/**
 * Primary sidebar — always visible in the app shell.
 */
export function Sidebar() {
  const params = useParams<{ orgSlug: string }>()
  const slug = params?.orgSlug ?? ''

  return (
    <aside
      className="w-[220px] flex-shrink-0 flex flex-col h-full"
      style={{
        background: '#080b12',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Wordmark */}
      <div
        className="h-14 flex items-center px-5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Link href={slug ? `/${slug}/dashboard` : '/'} className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/spinative-logo.png"
            alt="Spinative"
            style={{ height: 26, width: 'auto', objectFit: 'contain' }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/logo.png'
            }}
          />
        </Link>
      </div>

      {/* Workspace switcher */}
      <div
        className="py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <WorkspaceSwitcher />
      </div>

      {/* Primary nav */}
      <nav className="flex-1 py-3 overflow-y-auto" style={{ gap: 2, display: 'flex', flexDirection: 'column' }}>
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

            {/* Section label */}
            <div className="px-4 pt-5 pb-1">
              <span
                className="uppercase tracking-widest font-semibold"
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}
              >
                Workspace
              </span>
            </div>

            <NavItem
              href={`/${slug}/settings/general`}
              icon={Settings}
              label="Settings"
            />
          </>
        )}
      </nav>

      {/* Credits indicator */}
      {slug && <CreditsIndicator orgSlug={slug} />}

      {/* Footer */}
      <div
        className="p-3 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        <NavItem href="/help" icon={HelpCircle} label="Help & docs" exact />
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
          style={{ cursor: 'default' }}
        >
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-6 h-6',
              },
            }}
          />
          <span style={{ fontSize: 13, color: '#a5afc0', fontWeight: 500 }}>Account</span>
        </div>
      </div>
    </aside>
  )
}
