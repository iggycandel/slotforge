import { auth }            from '@clerk/nextjs/server'
import { createClient }    from '@/lib/supabase/server'
import GeneralSettingsForm from './GeneralSettingsForm'

interface Props { params: Promise<{ orgSlug: string }> }

export const metadata = { title: 'General · Settings' }

export default async function GeneralSettingsPage({ params }: Props) {
  const { orgSlug } = await params
  const { userId }  = await auth()

  // Read workspace from Supabase (the app has no Clerk orgs — routes by userId)
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspaces')
    .select('name, slug')
    .eq('slug', orgSlug)
    .eq('clerk_org_id', userId ?? '')
    .maybeSingle()

  return (
    <div className="max-w-lg space-y-8">
      <GeneralSettingsForm
        orgName={data?.name ?? ''}
        orgSlug={data?.slug ?? orgSlug}
        currentOrgSlug={orgSlug}
      />

      {/* Danger zone */}
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
