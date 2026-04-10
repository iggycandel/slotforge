'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
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
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all mx-1',
        active
          ? 'bg-sf-gold/10 text-sf-gold border border-sf-gold/20'
          : 'text-sf-muted hover:text-sf-text hover:bg-sf-surface/60'
      )}
    >
      <Icon className={cn('w-4 h-4', active ? 'text-sf-gold' : 'text-sf-subtle')} />
      {label}
    </Link>
  )
}
