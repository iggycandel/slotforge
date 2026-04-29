import { auth }                       from '@clerk/nextjs/server'
import { createAdminClient }          from '@/lib/supabase/admin'
import { assertWorkspaceAccessBySlug } from '@/lib/supabase/authz'
import GeneralSettingsForm            from './GeneralSettingsForm'

interface Props { params: Promise<{ orgSlug: string }> }

export const metadata = { title: 'General · Settings' }

export default async function GeneralSettingsPage({ params }: Props) {
  const { orgSlug } = await params
  const { userId }  = await auth()

  // v122 / H1 follow-up — service-role read with explicit ownership
  // assertion. Pre-v122 used the anon-key SSR client which now has zero
  // privileges on the workspaces table.
  let data: { name: string; slug: string } | null = null
  if (userId && (await assertWorkspaceAccessBySlug(userId, orgSlug))) {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supabase as any)
      .from('workspaces')
      .select('name, slug')
      .eq('slug', orgSlug)
      .maybeSingle()
    data = res.data
  }

  return (
    <div className="max-w-lg space-y-8">
      <GeneralSettingsForm
        orgName={data?.name ?? ''}
        orgSlug={data?.slug ?? orgSlug}
        currentOrgSlug={orgSlug}
      />

      {/* Danger zone — workspace deletion is intentionally manual.
          We delete via support email rather than a self-serve button so
          accidental destruction (typos in workspace slug, multi-tab
          confusion) doesn't wipe a paying customer's project history.
          The Round 7 polish replaces a permanently-disabled button
          with a real path forward: a mailto link with subject + body
          pre-filled. */}
      <section>
        <h2 className="text-sm font-semibold text-red-400 mb-1">Danger zone</h2>
        <p className="text-xs text-sf-muted mb-5">
          Irreversible actions. Proceed with caution.
        </p>
        <div className="p-5 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-sf-text">Delete workspace</p>
              <p className="text-xs text-sf-muted mt-0.5 leading-relaxed">
                Workspace deletion is handled by support so it can&apos;t happen by
                mistake. We&apos;ll confirm with you before removing any data.
              </p>
            </div>
            <a
              href={`mailto:support@spinative.com?subject=${encodeURIComponent('Workspace deletion request: ' + orgSlug)}&body=${encodeURIComponent(
                `Please delete the workspace "${orgSlug}".\n\n` +
                `I understand this permanently removes all projects, assets, and history.\n\n` +
                `Confirm with my account email before proceeding.\n`
              )}`}
              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors whitespace-nowrap"
            >
              Email support
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
