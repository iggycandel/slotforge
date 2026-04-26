'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'

interface NavItemProps {
  href: string
  icon: LucideIcon
  label: string
  /** If true, only match exact path instead of startsWith */
  exact?: boolean
  /** Render as icon-only rail item (tooltip via native title attr). */
  collapsed?: boolean
}

export function NavItem({ href, icon: Icon, label, exact, collapsed }: NavItemProps) {
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
        }}>
          {label}
        </span>
      ) : (
        label
      )}
    </Link>
  )
}
