'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useUser, useClerk, useOrganization } from '@clerk/nextjs'

interface Project {
  id: string
  name: string
  updated_at: string
  thumbnail_url?: string | null
  payload?: Record<string, unknown> | null
}

// ─── User avatar initials ────────────────────────────────
function Initials({ name, imageUrl }: { name?: string | null; imageUrl?: string | null }) {
  const letters = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt={name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
    )
  }
  return <span style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', letterSpacing: '.04em' }}>{letters}</span>
}

// ─── User settings dropdown ──────────────────────────────
function UserMenu() {
  const { user } = useUser()
  const { openUserProfile, openOrganizationProfile, signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const menuItems: Array<{ label: string; icon: string; action: () => void }> = [
    {
      label: 'Manage account',
      icon: '👤',
      action: () => { setOpen(false); openUserProfile() },
    },
    {
      label: 'Workspace settings',
      icon: '⚙️',
      action: () => { setOpen(false); openOrganizationProfile() },
    },
    {
      label: 'Help & Docs',
      icon: '📖',
      action: () => { setOpen(false); window.open('https://slotforge.io/docs', '_blank') },
    },
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(v => !v)}
        title={user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Account'}
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: '#1e1e2e', border: '1px solid #3a3a52',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', padding: 0, flexShrink: 0,
          outline: open ? '2px solid #c9a84c44' : 'none',
          transition: 'border-color .15s',
        }}
      >
        <Initials name={user?.fullName} imageUrl={user?.imageUrl} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0, zIndex: 200,
          background: '#1a1a28', border: '1px solid #2e2e42',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.6)',
          minWidth: 200, overflow: 'hidden',
        }}>
          {/* User info header */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #2e2e42' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6e1', marginBottom: 2 }}>
              {user?.fullName || 'Unnamed'}
            </div>
            <div style={{ fontSize: 11, color: '#6a6a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.primaryEmailAddress?.emailAddress}
            </div>
          </div>

          {/* Menu items */}
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 14px',
                background: 'transparent', border: 'none',
                color: '#c8c6c0', fontSize: 13, cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit',
                transition: 'background .1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#22223a')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 14, width: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          {/* Divider + Log out */}
          <div style={{ borderTop: '1px solid #2e2e42' }} />
          <button
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 14px 11px',
              background: 'transparent', border: 'none',
              color: '#ef7a7a', fontSize: 13, cursor: 'pointer',
              textAlign: 'left', fontFamily: 'inherit',
              transition: 'background .1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2a1a1a')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 14, width: 18 }}>↩</span>
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Members modal ───────────────────────────────────────
function MembersModal({ onClose }: { onClose: () => void }) {
  const { organization, memberships, invitations } = useOrganization({
    memberships: { infinite: true, pageSize: 20 },
    invitations: { infinite: true, pageSize: 20 },
  })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteErr, setInviteErr] = useState('')
  const [inviteOk, setInviteOk] = useState(false)

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || !organization) return
    setInviting(true); setInviteErr(''); setInviteOk(false)
    try {
      await organization.inviteMember({ emailAddress: inviteEmail.trim(), role: 'org:member' })
      setInviteEmail('')
      setInviteOk(true)
      invitations?.revalidate?.()
      setTimeout(() => setInviteOk(false), 3000)
    } catch (err: unknown) {
      setInviteErr((err as { errors?: Array<{ message: string }> })?.errors?.[0]?.message || 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  const memberList = memberships?.data ?? []
  const inviteList = invitations?.data ?? []

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,.65)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1a28', border: '1px solid #2e2e42',
          borderRadius: 16, width: '100%', maxWidth: 520,
          maxHeight: '80vh', overflow: 'auto',
          boxShadow: '0 16px 64px rgba(0,0,0,.7)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid #2e2e42',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e6e1' }}>Team members</div>
            <div style={{ fontSize: 11, color: '#6a6a8a', marginTop: 2 }}>
              {organization?.name || 'Workspace'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#6a6a8a',
              fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
            }}
          >×</button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          {/* Invite form */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9090b0', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Invite by email
            </div>
            <form onSubmit={sendInvite} style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                placeholder="colleague@studio.com"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteErr(''); setInviteOk(false) }}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 7,
                  background: '#13131e', border: '1px solid #3a3a52',
                  color: '#e8e6e1', fontSize: 13, outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                style={{
                  padding: '9px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                  background: 'linear-gradient(135deg,#c9a84c,#e8c96d)',
                  color: '#1a1200', border: 'none', cursor: 'pointer',
                  opacity: inviting || !inviteEmail.trim() ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {inviting ? '…' : 'Send invite'}
              </button>
            </form>
            {inviteErr && <div style={{ fontSize: 11, color: '#ef7a7a', marginTop: 6 }}>{inviteErr}</div>}
            {inviteOk  && <div style={{ fontSize: 11, color: '#5eca8a', marginTop: 6 }}>✓ Invitation sent</div>}
          </div>

          {/* Current members */}
          {memberList.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9090b0', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                Members ({memberList.length})
              </div>
              {memberList.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: '1px solid #22223a',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: '#2a2a3e', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  }}>
                    {m.publicUserData?.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={m.publicUserData.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 11, color: '#c9a84c', fontWeight: 700 }}>
                          {(m.publicUserData?.firstName?.[0] || '') + (m.publicUserData?.lastName?.[0] || '') || '?'}
                        </span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#e8e6e1', fontWeight: 500 }}>
                      {m.publicUserData?.firstName} {m.publicUserData?.lastName}
                    </div>
                    <div style={{ fontSize: 11, color: '#6a6a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.publicUserData?.identifier}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: m.role === 'org:admin' ? '#1a2a1a' : '#1a1a2a',
                    color: m.role === 'org:admin' ? '#5eca8a' : '#7a8aef',
                    border: `1px solid ${m.role === 'org:admin' ? '#3a5a3a' : '#2a2a5a'}`,
                    fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap',
                  }}>
                    {m.role === 'org:admin' ? 'Admin' : 'Member'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending invitations */}
          {inviteList.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9090b0', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                Pending invitations ({inviteList.length})
              </div>
              {inviteList.map(inv => (
                <div key={inv.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: '1px solid #22223a',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: '#2a2a1a', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 12, color: '#c9a84c' }}>✉</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#9090b0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inv.emailAddress}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: '#1a1a22', color: '#c9a84c',
                    border: '1px solid #3a3a22', fontWeight: 600,
                  }}>
                    Pending
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main dashboard page ─────────────────────────────────
export default function DashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showMembers, setShowMembers] = useState(false)
  const { organization } = useOrganization()

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      if (res.ok) setProjects(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    if (res.ok) {
      setNewName('')
      load()
    }
    setCreating(false)
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project?')) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#13131e',
      fontFamily: "'Space Grotesk', sans-serif",
      padding: '40px 48px',
    }}>
      {showMembers && <MembersModal onClose={() => setShowMembers(false)} />}

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/spinative-logo.svg" alt="Spinative" style={{ height: 22, width: 'auto', display: 'block' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Team button */}
            <button
              onClick={() => setShowMembers(true)}
              title="Manage team members"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 7,
                background: '#1e1e2e', border: '1px solid #2e2e42',
                color: '#9090b0', fontSize: 12, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 500,
                transition: 'border-color .15s, color .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a4a62'; e.currentTarget.style.color = '#c8c6c0' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2e2e42'; e.currentTarget.style.color = '#9090b0' }}
            >
              <span style={{ fontSize: 13 }}>👥</span>
              {organization?.membersCount != null ? `${organization.membersCount} members` : 'Team'}
            </button>
            {/* User menu */}
            <UserMenu />
          </div>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e8e6e1', marginBottom: 32 }}>Projects</h1>

        {/* New project form */}
        <form onSubmit={createProject} style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
          <input
            type="text"
            placeholder="New project name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8,
              background: '#1e1e2e', border: '1px solid #3a3a52',
              color: '#e8e6e1', fontSize: 14, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            style={{
              padding: '10px 22px', borderRadius: 8,
              background: 'linear-gradient(135deg, #c9a84c, #e8c96d)',
              color: '#1a1200', fontWeight: 700, fontSize: 13,
              border: 'none', cursor: 'pointer',
              opacity: creating || !newName.trim() ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {creating ? 'Creating…' : '+ New Project'}
          </button>
        </form>

        {/* Project list */}
        {loading ? (
          <p style={{ color: '#9090b0' }}>Loading…</p>
        ) : projects.length === 0 ? (
          <div style={{
            border: '1px dashed #3a3a52', borderRadius: 12,
            padding: '60px 24px', textAlign: 'center', color: '#9090b0',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎰</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e6e1', marginBottom: 8 }}>No projects yet</div>
            <div style={{ fontSize: 13 }}>Create your first slot game project above.</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}>
            {projects.map(p => {
              const thumb = p.thumbnail_url || (p.payload as Record<string, unknown>)?._thumbnail as string | null || null
              return (
                <div
                  key={p.id}
                  style={{
                    position: 'relative',
                    borderRadius: 12,
                    background: '#1e1e2e', border: '1px solid #2a2a3e',
                    overflow: 'hidden',
                  }}
                >
                  {/* Thumbnail area */}
                  <Link href={`/${orgSlug}/projects/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{ width: '100%', paddingTop: '56.25%', position: 'relative', background: '#0e0e1a' }}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={p.name}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          position: 'absolute', inset: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 28, color: '#3a3a52',
                        }}>
                          🎰
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '14px 16px 12px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e6e1', marginBottom: 4 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#9090b0' }}>
                        Updated {new Date(p.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </Link>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteProject(p.id)}
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      background: 'rgba(0,0,0,0.55)', border: 'none',
                      color: '#aaa', cursor: 'pointer', fontSize: 13,
                      padding: '3px 7px', borderRadius: 4,
                      backdropFilter: 'blur(4px)',
                    }}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
