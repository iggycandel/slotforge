'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { UserButton } from '@clerk/nextjs'
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  HelpCircle,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { WorkspaceSwitcher } from './workspace-switcher'
import { NavItem } from './nav-item'
import { CreditsIndicator } from '@/components/billing/CreditsIndicator'

const WIDTH_EXPANDED  = 220
const WIDTH_COLLAPSED = 56

/** Does this pathname point at a specific project's canvas/editor? */
function isProjectEditorRoute(pathname: string | null): boolean {
  if (!pathname) return false
  // Matches /[orgSlug]/projects/[projectId] and all sub-routes
  // (e.g. /assets, /export). Does NOT match /[orgSlug]/projects (list).
  return /^\/[^/]+\/projects\/[^/]+/.test(pathname)
}

type CollapsePref = 'auto' | 'expanded' | 'collapsed'
const STORAGE_KEY = 'sf_sidebar_pref'

/**
 * Primary sidebar — always visible in the app shell.
 * Collapses to an icon rail on project editor routes by default; users can
 * pin the expanded or collapsed state via the chevron toggle.
 */
export function Sidebar() {
  const params   = useParams<{ orgSlug: string }>()
  const pathname = usePathname()
  const slug     = params?.orgSlug ?? ''

  // Persisted preference: 'auto' (default) follows the route; 'expanded' /
  // 'collapsed' override the auto behaviour across navigations.
  const [pref, setPref] = useState<CollapsePref>('auto')
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY) as CollapsePref | null
      if (v === 'expanded' || v === 'collapsed' || v === 'auto') setPref(v)
    } catch {}
  }, [])

  const autoCollapsed = isProjectEditorRoute(pathname)
  const collapsed = pref === 'collapsed' ? true
                  : pref === 'expanded' ? false
                  : autoCollapsed

  function toggle() {
    // Chevron clicks flip the *current* effective state and remember it
    // explicitly. 'auto' is reachable by long-press (kept simple for now —
    // explicit pref is the lowest-friction pattern).
    const next: CollapsePref = collapsed ? 'expanded' : 'collapsed'
    setPref(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch {}
  }

  const width = collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED

  return (
    <aside
      className="flex-shrink-0 flex flex-col h-full"
      style={{
        width,
        background:  '#080b12',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        transition:  'width .18s ease',
      }}
    >
      {/* Wordmark */}
      <div
        className="h-14 flex items-center flex-shrink-0"
        style={{
          borderBottom:  '1px solid rgba(255,255,255,0.06)',
          padding:       collapsed ? '0' : '0 20px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <Link
          href={slug ? `/${slug}/dashboard` : '/'}
          className="flex items-center gap-2"
          title={collapsed ? 'Spinative' : undefined}
        >
          {/* The old /logo.png was the legacy SLOTFORGE brand — dropping
              it from every codepath here. Expanded shows the full
              Spinative word-mark; collapsed shows a tight "S" glyph in
              the same orange accent so the narrow sidebar stays
              readable without cramming the whole word-mark into 28 px. */}
          {collapsed ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(240,168,40,.12)',
              border: '1px solid rgba(240,168,40,.35)',
              color: '#f0a828',
              fontFamily: "'Nunito','Varela Round',system-ui,sans-serif",
              fontWeight: 900, fontSize: 16, lineHeight: 1,
              letterSpacing: '-0.02em',
            }}>
              s
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/spinative-logo.png"
              alt="Spinative"
              style={{ height: 26, width: 'auto', objectFit: 'contain' }}
            />
          )}
        </Link>
      </div>

      {/* Workspace switcher — hidden when collapsed (the dropdown needs room) */}
      {!collapsed && (
        <div
          className="py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <WorkspaceSwitcher />
        </div>
      )}

      {/* Primary nav */}
      <nav className="flex-1 py-3 overflow-y-auto" style={{ gap: 2, display: 'flex', flexDirection: 'column' }}>
        {slug && (
          <>
            <NavItem
              href={`/${slug}/dashboard`}
              icon={LayoutDashboard}
              label="Dashboard"
              shortLabel="Home"
              collapsed={collapsed}
            />
            <NavItem
              href={`/${slug}/projects`}
              icon={FolderOpen}
              label="Projects"
              shortLabel="Proj"
              collapsed={collapsed}
            />

            {/* Section label — omitted when collapsed to avoid visual noise */}
            {!collapsed && (
              <div className="px-4 pt-5 pb-1">
                <span
                  className="uppercase tracking-widest font-semibold"
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}
                >
                  Workspace
                </span>
              </div>
            )}

            <NavItem
              href={`/${slug}/settings/general`}
              icon={Settings}
              label="Settings"
              shortLabel="Set"
              collapsed={collapsed}
            />
          </>
        )}
      </nav>

      {/* Credits indicator — only makes sense at full width */}
      {slug && !collapsed && <CreditsIndicator orgSlug={slug} />}

      {/* Footer */}
      <div
        className="flex-shrink-0"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding:   collapsed ? 8 : 12,
          display:   'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* Help page lives under [orgSlug] so it inherits the sidebar
            layout. Falls back to a literal /help (which would 404) only
            if the slug hasn't resolved yet — the org-layout redirect
            keeps that window very small. */}
        <NavItem href={slug ? `/${slug}/help` : '/help'} icon={HelpCircle} label="Help & docs" shortLabel="Help" exact collapsed={collapsed} />

        {/* Account row */}
        <div
          className="flex items-center rounded-lg"
          style={{
            cursor:        'default',
            gap:           collapsed ? 0 : 10,
            padding:       collapsed ? '6px 0' : '8px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
          title={collapsed ? 'Account' : undefined}
        >
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-6 h-6',
              },
            }}
          />
          {!collapsed && <span style={{ fontSize: 13, color: '#a5afc0', fontWeight: 500 }}>Account</span>}
        </div>

        {/* Collapse toggle — always last so it doesn't move when content shifts */}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            marginTop:   4,
            background:  'transparent',
            border:      '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            cursor:      'pointer',
            color:       '#7a7a8a',
            height:      30,
            display:     'flex',
            alignItems:  'center',
            justifyContent: collapsed ? 'center' : 'flex-end',
            padding:     collapsed ? 0 : '0 10px',
            fontSize:    11,
            gap:         6,
          }}
        >
          {collapsed
            ? <ChevronsRight style={{ width: 14, height: 14 }} />
            : <>
                <span>Collapse</span>
                <ChevronsLeft style={{ width: 14, height: 14 }} />
              </>
          }
        </button>
      </div>
    </aside>
  )
}
