'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useOrganization } from '@clerk/nextjs'
import { Plus, Trash2, LayoutGrid, Clock, Sparkles } from 'lucide-react'

interface Project {
  id: string
  name: string
  updated_at: string
  thumbnail_url?: string | null
  payload?: Record<string, unknown> | null
}

// ─── Main dashboard page ─────────────────────────────────
export default function DashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const { organization } = useOrganization()
  const inputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (showNewForm) setTimeout(() => inputRef.current?.focus(), 50)
  }, [showNewForm])

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
      setShowNewForm(false)
      load()
    }
    setCreating(false)
  }

  async function deleteProject(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this project? This cannot be undone.')) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: '#07080d' }}
    >
      {/* Page header */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{
          padding: '24px 32px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f4efe4', margin: 0 }}>
            {organization?.name ?? 'Dashboard'}
          </h1>
          <p style={{ fontSize: 13, color: '#7d8799', margin: '4px 0 0' }}>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </p>
        </div>

        <button
          onClick={() => setShowNewForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 10,
            background: 'linear-gradient(135deg, #d7a84f, #f0ca79)',
            color: '#07080d', fontWeight: 700, fontSize: 13,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(215,168,79,0.28)',
            fontFamily: 'inherit',
            transition: 'box-shadow 0.2s, transform 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(215,168,79,0.42)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = '0 4px 18px rgba(215,168,79,0.28)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <Plus style={{ width: 15, height: 15 }} />
          New project
        </button>
      </div>

      {/* New project form */}
      {showNewForm && (
        <div
          style={{
            padding: '16px 32px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(215,168,79,0.03)',
          }}
        >
          <form onSubmit={createProject} style={{ display: 'flex', gap: 10, maxWidth: 480 }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Project name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{
                flex: 1, padding: '9px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(215,168,79,0.3)',
                color: '#f4efe4', fontSize: 13,
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              style={{
                padding: '9px 18px', borderRadius: 10,
                background: 'linear-gradient(135deg,#d7a84f,#f0ca79)',
                color: '#07080d', fontWeight: 700, fontSize: 13,
                border: 'none', cursor: 'pointer',
                opacity: creating || !newName.trim() ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              style={{
                padding: '9px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#a5afc0', fontSize: 13, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto" style={{ padding: '28px 32px' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  borderRadius: 14, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              >
                <div style={{ paddingTop: '56.25%', background: 'rgba(255,255,255,0.03)' }} />
                <div style={{ padding: '14px 16px 16px' }}>
                  <div style={{ height: 14, width: '60%', background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ height: 10, width: '40%', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onNew={() => setShowNewForm(true)} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 16,
          }}>
            {projects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                orgSlug={orgSlug}
                thumb={p.thumbnail_url ?? null}
                onDelete={deleteProject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Project card ─────────────────────────────────────────
function ProjectCard({
  project, orgSlug, thumb, onDelete,
}: {
  project: Project
  orgSlug: string
  thumb: string | null
  onDelete: (e: React.MouseEvent, id: string) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <Link
      href={`/${orgSlug}/projects/${project.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          borderRadius: 14, overflow: 'hidden',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${hovered ? 'rgba(215,168,79,0.2)' : 'rgba(255,255,255,0.06)'}`,
          transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        {/* Thumbnail — portrait 9:16 to match the editor viewport capture */}
        <div style={{ width: '100%', paddingTop: '177.78%', position: 'relative', background: '#080b12' }}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt={project.name}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8, textAlign: 'center', padding: '0 16px',
              background: 'linear-gradient(135deg, #0b0e16, #141826)',
            }}>
              <Sparkles style={{ width: 22, height: 22, color: 'rgba(215,168,79,0.65)' }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: '#f4efe4' }}>
                This is your new project!
              </div>
              <div style={{ fontSize: 10, color: '#7d8799' }}>
                Open it to start designing
              </div>
            </div>
          )}

          {/* Delete overlay button */}
          <button
            onClick={(e) => onDelete(e, project.id)}
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#a5afc0', cursor: 'pointer',
              width: 28, height: 28, borderRadius: 7,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.15s',
              backdropFilter: 'blur(8px)',
            }}
            title="Delete project"
          >
            <Trash2 style={{ width: 13, height: 13 }} />
          </button>
        </div>

        {/* Info */}
        <div style={{ padding: '14px 16px 15px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f4efe4', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#7d8799' }}>
            <Clock style={{ width: 11, height: 11 }} />
            {new Date(project.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Empty state ──────────────────────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '80px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: 'rgba(215,168,79,0.08)',
        border: '1px solid rgba(215,168,79,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
        <LayoutGrid style={{ width: 28, height: 28, color: 'rgba(215,168,79,0.6)' }} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f4efe4', margin: '0 0 8px' }}>
        No projects yet
      </h3>
      <p style={{ fontSize: 13, color: '#7d8799', marginBottom: 24, maxWidth: 300 }}>
        Create your first slot game project to start generating AI-powered assets.
      </p>
      <button
        onClick={onNew}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 20px', borderRadius: 10,
          background: 'linear-gradient(135deg,#d7a84f,#f0ca79)',
          color: '#07080d', fontWeight: 700, fontSize: 13,
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(215,168,79,0.25)',
          fontFamily: 'inherit',
        }}
      >
        <Plus style={{ width: 15, height: 15 }} />
        New project
      </button>
    </div>
  )
}
