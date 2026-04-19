// ─────────────────────────────────────────────────────────────────────────────
// Spinative — ASSETS Workspace Page
// /[orgSlug]/projects/[projectId]/assets
// Server component: fetches project data + initial assets, renders workspace.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound }                        from 'next/navigation'
import { auth }                            from '@clerk/nextjs/server'
import { getProjectWithPayload }           from '@/actions/editor'
import { getProjectAssets }                from '@/lib/storage/assets'
import { getOrgPlan, canExport }            from '@/lib/billing/subscription'
import { AssetsWorkspace }                 from '@/components/assets/AssetsWorkspace'

interface Props {
  params: Promise<{ orgSlug: string; projectId: string }>
}

export default async function AssetsPage({ params }: Props) {
  const { orgSlug, projectId } = await params
  const { userId, orgId } = await auth()
  const effectiveId = orgId ?? userId ?? ''

  const result = await getProjectWithPayload(projectId)
  if (!result || result.error || !result.data) notFound()

  const { data: project } = result

  // Pre-load existing generated assets so the grid isn't empty on first render.
  // Errors here are non-fatal — the workspace handles empty state gracefully.
  const initialAssets = await getProjectAssets(projectId).catch(() => [])

  // Check plan for export gating
  const plan = await getOrgPlan(effectiveId)
  const exportsEnabled = canExport(plan)

  return (
    <AssetsWorkspace
      projectId={projectId}
      orgSlug={orgSlug}
      projectName={project.name ?? 'Untitled Project'}
      initialAssets={initialAssets}
      exportsEnabled={exportsEnabled}
    />
  )
}
