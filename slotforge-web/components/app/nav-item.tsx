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
}

export function NavItem({ href, icon: Icon, label, exact }: NavItemProps) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 12px',
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: 'none',
        margin: '0 6px',
        transition: 'background 0.15s, color 0.15s',
        background: active ? 'rgba(215,168,79,0.1)' : 'transparent',
        color: active ? '#d7a84f' : '#a5afc0',
        border: active ? '1px solid rgba(215,168,79,0.2)' : '1px solid transparent',
      }}
    >
      <Icon
        style={{
          width: 15,
          height: 15,
          flexShrink: 0,
          color: active ? '#d7a84f' : 'rgba(255,255,255,0.3)',
        }}
      />
      {label}
    </Link>
  )
}
