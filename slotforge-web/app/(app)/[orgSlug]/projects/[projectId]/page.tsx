import EditorFrame from '../../../../../components/editor/editor-frame'
import { getProjectWithPayload } from '../../../../../actions/editor'
import { notFound } from 'next/navigation'

export default async function ProjectPage({
  params,
}: {
  params: { projectId: string; orgSlug: string }
}) {
  const result = await getProjectWithPayload(params.projectId)
  if (!result || result.error || !result.data) notFound()
  return (
    <EditorFrame
      projectId={params.projectId}
      orgSlug={params.orgSlug}
      initialPayload={result.data.payload ?? null}
      projectName={result.data.name}
    />
  )
}
