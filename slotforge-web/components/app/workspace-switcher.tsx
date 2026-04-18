'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { ChevronDown, Settings } from 'lucide-react'

const AVATAR_COLORS = [
  { bg: 'rgba(123,116,255,0.18)', text: '#a09bff' },
  { bg: 'rgba(59,130,246,0.18)',  text: '#93c5fd' },
  { bg: 'rgba(16,185,129,0.18)',  text: '#6ee7b7' },
  { bg: 'rgba(215,168,79,0.18)', text: '#d7a84f' },
  { bg: 'rgba(239,68,68,0.18)',  text: '#fca5a5' },
  { bg: 'rgba(6,182,212,0.18)',  text: '#67e8f9' },
]

function WorkspaceAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
  const dim = size === 'md' ? 26 : 22
  return (
    <div style={{
      width: dim, height: dim, borderRadius: 7,
      background: color.bg, color: color.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size === 'md' ? 11 : 10,
      flexShrink: 0, letterSpacing: '-0.01em',
    }}>
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

export function WorkspaceSwitcher() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  if (!isLoaded) {
    return (
      <div style={{
        height: 38, borderRadius: 10, margin: '0 10px',
        background: 'rgba(255,255,255,0.05)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }} />
    )
  }

  const workspaceName =
    (user?.firstName ? `${user.firstName}'s workspace` : null) ??
    user?.username ??
    user?.emailAddresses[0]?.emailAddress?.split('@')[0] ??
    'My workspace'

  const orgSlug = user?.id ?? ''

  return (
    <div style={{ position: 'relative', margin: '0 10px' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 10,
          background: open || hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(215,168,79,0.25)' : 'rgba(255,255,255,0.08)'}`,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <WorkspaceAvatar name={workspaceName} />
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 600, color: '#f4efe4',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {workspaceName}
        </span>
        <ChevronDown style={{
          width: 14, height: 14, color: 'rgba(255,255,255,0.3)',
          flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />

          <div style={{
            position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)',
            zIndex: 50, borderRadius: 12,
            background: '#111520',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}>
            {/* Label */}
            <div style={{
              padding: '8px 12px 6px',
              fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
              Workspace
            </div>

            {/* Current workspace */}
            <div style={{ padding: '4px 0' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 12px',
              }}>
                <WorkspaceAvatar name={workspaceName} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: '#f4efe4',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {workspaceName}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'rgba(255,255,255,0.35)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {user?.emailAddresses[0]?.emailAddress}
                  </div>
                </div>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#d7a84f', flexShrink: 0,
                }} />
              </div>
            </div>

            {/* Settings link */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '4px 0' }}>
              <button
                onClick={() => { setOpen(false); router.push(`/${orgSlug}/settings/general`) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 12px', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                  color: 'rgba(255,255,255,0.4)', fontSize: 13,
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = '#a5afc0'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'none'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Settings style={{ width: 12, height: 12 }} />
                </div>
                Workspace settings
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
