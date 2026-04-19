import EditorFrame from '../../../../../components/editor/editor-frame'
import { getProjectWithPayload } from '../../../../../actions/editor'
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getOrgPlan, canExport } from '@/lib/billing/subscription'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string; orgSlug: string }>
}) {
  const { projectId, orgSlug } = await params
  const { userId, orgId } = await auth()
  const effectiveId = orgId ?? userId ?? ''

  const result = await getProjectWithPayload(projectId)
  if (!result || result.error || !result.data) notFound()

  const plan = await getOrgPlan(effectiveId)
  const exportsEnabled = canExport(plan)

  return (
    <EditorFrame
      projectId={projectId}
      orgSlug={orgSlug}
      initialPayload={result.data.payload ?? null}
      projectName={result.data.name}
      exportsEnabled={exportsEnabled}
    />
  )
}
