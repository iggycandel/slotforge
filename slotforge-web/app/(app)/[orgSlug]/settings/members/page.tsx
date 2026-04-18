import { auth, clerkClient }    from '@clerk/nextjs/server'
import { getOrgSubscription }   from '@/lib/billing/subscription'
import Link                     from 'next/link'

export const metadata = { title: 'Members · Settings' }
export const dynamic  = 'force-dynamic'

interface Props { params: { orgSlug: string } }

export default async function MembersPage({ params }: Props) {
  const { userId, orgId } = await auth()
  const effectiveId       = orgId ?? userId ?? ''
  const sub               = effectiveId ? await getOrgSubscription(effectiveId) : null
  const plan              = (sub?.plan ?? 'free') as 'free' | 'freelancer' | 'studio'
  const isStudio          = plan === 'studio'

  // Fetch current user details for the members list
  let userName    = 'Workspace owner'
  let userEmail   = ''
  let userAvatar  = ''
  if (userId) {
    try {
      const client = await clerkClient()
      const user   = await client.users.getUser(userId)
      userName   = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'You'
      userEmail  = user.emailAddresses[0]?.emailAddress ?? ''
      userAvatar = user.imageUrl ?? ''
    } catch { /* non-fatal */ }
  }

  const planLabel: Record<typeof plan, string> = {
    free:       'Free',
    freelancer: 'Freelancer',
    studio:     'Studio',
  }

  return (
    <div className="max-w-2xl space-y-8">

      {/* ── Current members ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-1">Team members</h2>
        <p className="text-xs text-sf-muted mb-5">
          People with access to this workspace.
        </p>

        <div className="rounded-2xl border border-sf-border bg-sf-surface overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_100px] gap-4 px-5 py-3 border-b border-sf-border">
            <span className="text-[11px] font-semibold text-sf-muted uppercase tracking-wider">Member</span>
            <span className="text-[11px] font-semibold text-sf-muted uppercase tracking-wider">Role</span>
            <span className="text-[11px] font-semibold text-sf-muted uppercase tracking-wider">Plan</span>
          </div>

          {/* Current user row */}
          <div className="grid grid-cols-[1fr_120px_100px] gap-4 px-5 py-4 items-center">
            <div className="flex items-center gap-3 min-w-0">
              {userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-8 h-8 rounded-full shrink-0 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-sf-gold/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-sf-gold">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-sf-text truncate">{userName}</p>
                <p className="text-xs text-sf-muted truncate">{userEmail}</p>
              </div>
            </div>
            <div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-sf-gold/10 text-sf-gold border border-sf-gold/25">
                Owner
              </span>
            </div>
            <div>
              <span className="text-xs text-sf-muted">{planLabel[plan]}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Invite section ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-1">Invite team members</h2>
        <p className="text-xs text-sf-muted mb-5">
          Add collaborators to your workspace so they can access projects and assets.
        </p>

        {isStudio ? (
          /* Studio: invite form (coming soon) */
          <div className="p-5 rounded-2xl border border-sf-border bg-sf-surface">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-purple-400">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-sf-text mb-1">Team invitations</p>
                <p className="text-xs text-sf-muted leading-relaxed">
                  Team invitations are coming soon. You&apos;ll be able to invite collaborators directly
                  from here. In the meantime, contact{' '}
                  <a href="mailto:hello@spinative.com" className="text-sf-gold hover:underline">
                    hello@spinative.com
                  </a>{' '}
                  and we&apos;ll set up your seats manually.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Free / Freelancer: upgrade prompt */
          <div className="p-5 rounded-2xl border border-sf-border bg-sf-surface">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-sf-gold/10 border border-sf-gold/20 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-sf-gold">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sf-text mb-1">Team collaboration is a Studio feature</p>
                <p className="text-xs text-sf-muted leading-relaxed mb-4">
                  Upgrade to the <span className="text-sf-text font-medium">Studio plan</span> to invite
                  team members, assign roles, and collaborate on projects with your studio.
                  Studio seats include 100 AI credits/month, a shared style library, and priority generation.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href={`/${params.orgSlug}/settings/billing`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: '#c9a84c', color: '#06060a' }}
                  >
                    Upgrade to Studio
                    <span>→</span>
                  </Link>
                  <span className="text-xs text-sf-muted">€49 / seat / month</span>
                </div>
              </div>
            </div>

            {/* Feature bullets */}
            <div className="mt-5 pt-4 border-t border-sf-border grid grid-cols-2 gap-2">
              {[
                'Multi-seat team workspace',
                'Shared style library & templates',
                'Batch generation with tracking',
                'Version history & rollback',
                '100 AI credits / seat / month',
                'Priority generation queue',
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-sf-muted">
                  <span className="text-sf-gold shrink-0">✓</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
