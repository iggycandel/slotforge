'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'

interface NavItemProps {
  href: string
  icon: LucideIcon
  label: string
  /** Tighter label rendered under the icon when the sidebar is in
   *  collapsed mode. The collapsed rail is 56 px wide with 8 px side
   *  margin → only ~40 px of room for the caption, and full labels like
   *  "DASHBOARD" or "HELP & DOCS" overflow / wrap to multiple lines.
   *  Pass a 4-5 char abbreviation here (e.g. "Dash", "Help"); falls
   *  back to the full `label` when omitted. The expanded mode and the
   *  native tooltip both still show the full label. */
  shortLabel?: string
  /** If true, only match exact path instead of startsWith */
  exact?: boolean
  /** Render as icon-only rail item (tooltip via native title attr). */
  collapsed?: boolean
}

export function NavItem({ href, icon: Icon, label, shortLabel, exact, collapsed }: NavItemProps) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexDirection: collapsed ? 'column' : 'row',
        gap: collapsed ? 4 : 10,
        padding: collapsed ? '8px 0' : '7px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: 'none',
        margin: collapsed ? '0 8px' : '0 6px',
        transition: 'background 0.15s, color 0.15s',
        background: active ? 'rgba(215,168,79,0.1)' : 'transparent',
        color: active ? '#d7a84f' : '#a5afc0',
        border: active ? '1px solid rgba(215,168,79,0.2)' : '1px solid transparent',
      }}
    >
      <Icon
        style={{
          width: 16,
          height: 16,
          flexShrink: 0,
          color: active ? '#d7a84f' : 'rgba(255,255,255,0.3)',
        }}
      />
      {/* In the collapsed rail we still show a tiny caption under each
       *  icon — much faster orientation for new users than relying on
       *  a delayed-hover native title. Stays visually quiet via tighter
       *  letter-spacing and lower opacity. */}
      {collapsed ? (
        <span style={{
          fontSize:       9,
          letterSpacing:  '0.04em',
          textTransform:  'uppercase',
          opacity:        active ? 0.95 : 0.5,
          color:          active ? '#d7a84f' : 'rgba(255,255,255,0.6)',
          lineHeight:     1,
          marginTop:      1,
          // Belt-and-braces against the 56 px rail clipping the caption:
          // never wrap, hide overflow, and ellipsis if shortLabel still
          // happens to be too long (e.g. localised translations).
          maxWidth:       '100%',
          whiteSpace:     'nowrap',
          overflow:       'hidden',
          textOverflow:   'ellipsis',
        }}>
          {shortLabel ?? label}
        </span>
      ) : (
        label
      )}
    </Link>
  )
}
