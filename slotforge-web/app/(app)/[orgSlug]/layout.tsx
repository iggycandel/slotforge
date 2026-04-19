import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/app/sidebar'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  children: React.ReactNode
  params:   Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: Props) {
  const { orgSlug }  = await params
  const { userId }   = await auth()
  if (!userId) redirect('/sign-in')

  // Resolve the user's canonical workspace slug. If the URL slug doesn't
  // match (stale bookmark, renamed slug, wrong workspace), redirect to the
  // user's actual workspace instead of showing an empty/broken page.
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ws } = await (supabase as any)
    .from('workspaces')
    .select('slug')
    .eq('clerk_org_id', userId)
    .maybeSingle()

  if (!ws?.slug) {
    redirect('/onboarding')
  }
  if (ws.slug !== orgSlug) {
    redirect(`/${ws.slug}/dashboard`)
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#07080d' }}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ minWidth: 0 }}
      >
        {children}
      </main>
    </div>
  )
}
