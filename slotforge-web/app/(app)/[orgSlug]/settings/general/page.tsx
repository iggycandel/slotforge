import { auth, clerkClient } from '@clerk/nextjs/server'

interface Props { params: { orgSlug: string } }

export const metadata = { title: 'General · Settings' }

export default async function GeneralSettingsPage({ params }: Props) {
  const { orgId } = await auth()
  const client = await clerkClient()

  const org = orgId
    ? await client.organizations.getOrganization({ organizationId: orgId })
    : null

  return (
    <div className="max-w-lg space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-1">Workspace details</h2>
        <p className="text-xs text-sf-muted mb-5">
          Update the name and slug for your workspace.
        </p>

        <div className="space-y-4 p-5 rounded-2xl border border-sf-border bg-sf-surface">
          <div>
            <label className="block text-xs font-semibold text-sf-muted uppercase tracking-wider mb-2">
              Name
            </label>
            <input
              defaultValue={org?.name ?? ''}
              placeholder="Studio name"
              className="w-full bg-sf-bg border border-sf-border rounded-xl px-4 py-2.5 text-sf-text text-sm outline-none focus:border-sf-gold/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-sf-muted uppercase tracking-wider mb-2">
              Slug
            </label>
            <div className="flex items-center gap-0">
              <span className="px-3 py-2.5 bg-sf-overlay border border-r-0 border-sf-border rounded-l-xl text-sf-subtle text-sm">
                spinative.com/
              </span>
              <input
                defaultValue={org?.slug ?? params.orgSlug}
                placeholder="workspace-slug"
                className="flex-1 bg-sf-bg border border-sf-border rounded-r-xl px-4 py-2.5 text-sf-text text-sm outline-none focus:border-sf-gold/60 transition-colors font-mono"
              />
            </div>
          </div>
          {/* Save is a TODO — will wire to Server Action */}
          <p className="text-xs text-sf-subtle pt-1">
            Name and slug changes are managed through Clerk's organisation API.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-red-400 mb-1">Danger zone</h2>
        <p className="text-xs text-sf-muted mb-5">
          Irreversible actions. Proceed with caution.
        </p>
        <div className="p-5 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-sf-text">Delete workspace</p>
              <p className="text-xs text-sf-muted mt-0.5">
                Permanently deletes all projects, assets and data.
              </p>
            </div>
            <button
              disabled
              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium opacity-50 cursor-not-allowed"
            >
              Delete
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
