'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createProject } from '@/actions/projects'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'

const THEMES = [
  { value: 'western',  label: '🤠 Western' },
  { value: 'fantasy',  label: '🧙 Fantasy' },
  { value: 'egypt',    label: '🏺 Egypt' },
  { value: 'space',    label: '🚀 Space' },
  { value: 'fruit',    label: '🍒 Fruit' },
  { value: 'ocean',    label: '🌊 Ocean' },
  { value: 'jungle',   label: '🌿 Jungle' },
  { value: 'horror',   label: '💀 Horror' },
  { value: 'luxury',   label: '💎 Luxury' },
  { value: 'other',    label: '✏️ Other' },
]

const REELSETS = [
  { value: '5x3',   label: '5×3  Standard' },
  { value: '5x4',   label: '5×4' },
  { value: '6x4',   label: '6×4' },
  { value: '3x3',   label: '3×3' },
  { value: '4x3',   label: '4×3' },
  { value: '7x3',   label: '7×3  Megaways' },
  { value: '5x6c',  label: '5×6c  Cluster' },
]

export default function NewProjectPage() {
  const params   = useParams<{ orgSlug: string }>()
  const router   = useRouter()
  const [name,    setName]    = useState('')
  const [theme,   setTheme]   = useState('western')
  const [reelset, setReelset] = useState('5x3')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const result = await createProject({
      orgSlug: params.orgSlug,
      name:    name.trim(),
      theme,
      reelset,
    })

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Redirect to the new project — editor comes later
    router.push(`/${params.orgSlug}/projects/${result.data?.id}`)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="New project"
        description="Set up the basics — everything can be changed later."
      />

      <div className="flex-1 p-8 flex items-start justify-center">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-lg space-y-6"
        >
          {/* Game name */}
          <Field label="Game name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lucky Bull, Dragon's Hoard…"
              required
              autoFocus
              className="w-full bg-sf-surface border border-sf-border rounded-xl px-4 py-3 text-sf-text placeholder-sf-subtle outline-none focus:border-sf-gold/60 focus:ring-1 focus:ring-sf-gold/40 transition-colors text-sm"
            />
          </Field>

          {/* Theme + Reelset side by side */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Theme">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full bg-sf-surface border border-sf-border rounded-xl px-4 py-3 text-sf-text outline-none focus:border-sf-gold/60 focus:ring-1 focus:ring-sf-gold/40 transition-colors text-sm appearance-none cursor-pointer"
              >
                {THEMES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Reel grid">
              <select
                value={reelset}
                onChange={(e) => setReelset(e.target.value)}
                className="w-full bg-sf-surface border border-sf-border rounded-xl px-4 py-3 text-sf-text outline-none focus:border-sf-gold/60 focus:ring-1 focus:ring-sf-gold/40 transition-colors text-sm appearance-none cursor-pointer"
              >
                {REELSETS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              Create project →
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-sf-muted uppercase tracking-wider mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
