'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useOrganizationList, useOrganization } from '@clerk/nextjs'
import { ChevronDown, Check, Plus, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function WorkspaceSwitcher() {
  const { organization } = useOrganization()
  const { userMemberships, isLoaded, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (!isLoaded) {
    return (
      <div className="h-10 rounded-xl bg-sf-surface/50 animate-pulse mx-3" />
    )
  }

  const handleSwitch = async (orgId: string, orgSlug: string) => {
    setOpen(false)
    await setActive?.({ organization: orgId })
    router.push(`/${orgSlug}/dashboard`)
  }

  return (
    <div className="relative mx-3">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all',
          'border-sf-border bg-sf-surface hover:border-sf-gold/30 hover:bg-sf-overlay',
          open && 'border-sf-gold/30 bg-sf-overlay'
        )}
      >
        <WorkspaceAvatar name={organization?.name ?? '?'} />
        <span className="flex-1 text-left text-sm font-semibold text-sf-text truncate">
          {organization?.name ?? 'Select workspace'}
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-sf-subtle transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-sf-overlay border border-sf-border rounded-xl shadow-overlay overflow-hidden">
            <div className="px-3 py-2 text-[10px] font-semibold text-sf-subtle uppercase tracking-widest border-b border-sf-border">
              Workspaces
            </div>

            <div className="py-1 max-h-64 overflow-y-auto">
              {userMemberships.data?.map(({ organization: org }) => (
                <button
                  key={org.id}
                  onClick={() => handleSwitch(org.id, org.slug ?? '')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-sf-surface/60 transition-colors group"
                >
                  <WorkspaceAvatar name={org.name} size="sm" />
                  <span className="flex-1 text-left text-sm text-sf-text truncate">
                    {org.name}
                  </span>
                  {org.id === organization?.id && (
                    <Check className="w-3.5 h-3.5 text-sf-gold flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {/* Create new workspace */}
            <div className="border-t border-sf-border py-1">
              <button
                onClick={() => { setOpen(false); router.push('/onboarding') }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-sf-surface/60 transition-colors text-sf-muted hover:text-sf-text"
              >
                <div className="w-6 h-6 rounded-md border border-dashed border-sf-border flex items-center justify-center flex-shrink-0">
                  <Plus className="w-3 h-3" />
                </div>
                <span className="text-sm">Add workspace</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Generates an avatar from the first letter of the workspace name */
function WorkspaceAvatar({
  name,
  size = 'md',
}: {
  name: string
  size?: 'sm' | 'md'
}) {
  // Generate a consistent colour from name
  const colours = [
    'bg-purple-500/20 text-purple-300',
    'bg-blue-500/20 text-blue-300',
    'bg-emerald-500/20 text-emerald-300',
    'bg-amber-500/20 text-amber-300',
    'bg-rose-500/20 text-rose-300',
    'bg-cyan-500/20 text-cyan-300',
  ]
  const colour = colours[name.charCodeAt(0) % colours.length]

  return (
    <div
      className={cn(
        'rounded-md flex items-center justify-center font-bold flex-shrink-0',
        colour,
        size === 'md' ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-[10px]'
      )}
    >
      {name[0]?.toUpperCase() ?? <Building2 className="w-3 h-3" />}
    </div>
  )
}
