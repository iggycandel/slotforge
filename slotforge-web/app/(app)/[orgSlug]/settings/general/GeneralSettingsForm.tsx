'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter }                        from 'next/navigation'
import { updateWorkspace }                  from '@/actions/settings'

interface Props {
  orgName:        string
  orgSlug:        string
  currentOrgSlug: string
}

export default function GeneralSettingsForm({ orgName, orgSlug, currentOrgSlug }: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const res = await updateWorkspace(fd)
      if (res.ok) {
        setStatus({ ok: true, message: 'Workspace updated.' })
        // If the slug changed, navigate to the new URL
        if (res.newSlug && res.newSlug !== currentOrgSlug) {
          router.push(`/${res.newSlug}/settings/general`)
        }
      } else {
        setStatus({ ok: false, message: res.error ?? 'Something went wrong.' })
      }
    })
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-sf-text mb-1">Workspace details</h2>
      <p className="text-xs text-sf-muted mb-5">
        Update the name and slug for your workspace.
      </p>

      <form ref={formRef} onSubmit={handleSubmit}>
        {/* Hidden field so the server action knows which workspace to update */}
        <input type="hidden" name="currentSlug" value={currentOrgSlug} />
        <div className="space-y-4 p-5 rounded-2xl border border-sf-border bg-sf-surface">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-sf-muted uppercase tracking-wider mb-2">
              Name
            </label>
            <input
              name="name"
              defaultValue={orgName}
              placeholder="Studio name"
              required
              className="w-full bg-sf-bg border border-sf-border rounded-xl px-4 py-2.5 text-sf-text text-sm outline-none focus:border-sf-gold/60 transition-colors"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-semibold text-sf-muted uppercase tracking-wider mb-2">
              Slug
            </label>
            <div className="flex items-center gap-0">
              <span className="px-3 py-2.5 bg-sf-overlay border border-r-0 border-sf-border rounded-l-xl text-sf-subtle text-sm select-none">
                spinative.com/
              </span>
              <input
                name="slug"
                defaultValue={orgSlug}
                placeholder="workspace-slug"
                required
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers and hyphens only"
                className="flex-1 bg-sf-bg border border-sf-border rounded-r-xl px-4 py-2.5 text-sf-text text-sm outline-none focus:border-sf-gold/60 transition-colors font-mono"
              />
            </div>
            <p className="text-xs text-sf-subtle mt-1.5 pl-1">
              Lowercase letters, numbers and hyphens only.
            </p>
          </div>

          {/* Feedback */}
          {status && (
            <div className={`text-xs px-3 py-2 rounded-lg ${
              status.ok
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {status.message}
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 rounded-xl text-sm font-semibold transition-all bg-sf-gold text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: isPending ? undefined : '#c9a84c' }}
            >
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
