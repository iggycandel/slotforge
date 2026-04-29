'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOrganization } from '@clerk/nextjs'
import { Plus, Trash2, LayoutGrid, Clock, Sparkles, Search, ArrowDownUp, X } from 'lucide-react'
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner'

interface Project {
  id: string
  name: string
  updated_at: string
  thumbnail_url?: string | null
  payload?: Record<string, unknown> | null
}

// Round 7 polish: persisted sort preference. Restored on mount so the
// user's chosen ordering carries across sessions on the same device.
type SortMode = 'recent' | 'oldest' | 'name'
const SORT_STORAGE_KEY = 'sf_dash_sort_v1'

// ─── Main dashboard page ─────────────────────────────────
export default function DashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [query, setQuery] = useState('')
  const [sort,  setSort]  = useState<SortMode>('recent')
  const { organization } = useOrganization()
  const inputRef     = useRef<HTMLInputElement>(null)
  const searchRef    = useRef<HTMLInputElement>(null)

  // Restore the persisted sort preference on first mount. localStorage
  // access is wrapped in try/catch so SSR / private-mode browsers don't
  // crash the page.
  useEffect(() => {
    try {
      const v = localStorage.getItem(SORT_STORAGE_KEY)
      if (v === 'recent' || v === 'oldest' || v === 'name') setSort(v)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(SORT_STORAGE_KEY, sort) } catch { /* ignore */ }
  }, [sort])

  // ⌘K / Ctrl+K focuses the search input — standard "open search"
  // gesture across SaaS dashboards. preventDefault so the browser
  // bookmark-K binding doesn't intercept.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Derived filtered + sorted list. Memoised so typing in the search
  // input doesn't re-run the array allocation on every parent render.
  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = q
      ? projects.filter(p => p.name.toLowerCase().includes(q))
      : projects.slice()
    if (sort === 'recent') {
      out.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    } else if (sort === 'oldest') {
      out.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
    } else if (sort === 'name') {
      out.sort((a, b) => a.name.localeCompare(b.name))
    }
    return out
  }, [projects, query, sort])

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
      {/* 2s paint-brush reveal greeting — fires once per session */}
      <WelcomeBanner />

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
            {visibleProjects.length === projects.length
              ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`
              : `${visibleProjects.length} of ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
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

      {/* Search + sort toolbar — shown only once there's >1 project so
          a brand-new dashboard stays uncluttered. ⌘K focuses the
          search field; Esc clears it. Sort preference persists per
          device via localStorage. */}
      {!loading && projects.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,17,24,0.5)',
        }}>
          <div style={{
            flex: 1, maxWidth: 480, position: 'relative',
            display: 'flex', alignItems: 'center',
          }}>
            <Search style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              width: 14, height: 14, color: '#7d8799', pointerEvents: 'none',
            }} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder="Search projects… (⌘K)"
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
              style={{
                flex: 1, padding: '8px 36px 8px 34px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f4efe4', fontSize: 13,
                borderRadius: 999, outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color .15s, background .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(215,168,79,0.30)'; e.currentTarget.style.background = 'rgba(215,168,79,0.04)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); searchRef.current?.focus() }}
                title="Clear search"
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  width: 22, height: 22, borderRadius: '50%',
                  border: 'none', background: 'rgba(255,255,255,0.06)',
                  color: '#a5afc0', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><X size={11} /></button>
            )}
          </div>

          {/* Sort dropdown — three options, persisted */}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 11px', borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.025)',
            cursor: 'pointer',
          }}>
            <ArrowDownUp size={12} style={{ color: '#7d8799' }} />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortMode)}
              style={{
                appearance: 'none' as const,
                WebkitAppearance: 'none',
                background: 'transparent', border: 'none', outline: 'none',
                color: '#f4efe4', fontSize: 12, fontFamily: 'inherit',
                cursor: 'pointer', paddingRight: 14,
                backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"8\\" height=\\"8\\" viewBox=\\"0 0 8 8\\"><path d=\\"M1 2.5L4 5.5L7 2.5\\" stroke=\\"%23a5afc0\\" stroke-width=\\"1.2\\" fill=\\"none\\" stroke-linecap=\\"round\\"/></svg>")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0 center',
              }}
            >
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name (A→Z)</option>
            </select>
          </label>
        </div>
      )}

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
        ) : visibleProjects.length === 0 ? (
          <NoMatchesState query={query} onClear={() => setQuery('')} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 16,
          }}>
            {visibleProjects.map(p => (
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

// ─── No-matches state — shown when search filters out every project ──
function NoMatchesState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
      }}>
        <Search style={{ width: 22, height: 22, color: '#7d8799' }} />
      </div>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f4efe4', margin: '0 0 6px' }}>
        No projects matching “{query}”
      </h3>
      <p style={{ fontSize: 12, color: '#7d8799', marginBottom: 18, maxWidth: 280 }}>
        Check the spelling, or clear the search to see every project in this workspace.
      </p>
      <button
        onClick={onClear}
        style={{
          padding: '7px 16px', borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.03)',
          color: '#a5afc0', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >Clear search</button>
    </div>
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
