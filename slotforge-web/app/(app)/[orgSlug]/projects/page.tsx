import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { ProjectCard } from '@/components/projects/project-card'
import { ProjectsEmptyState } from '@/components/projects/empty-state'
import { getProjects } from '@/actions/projects'

interface Props {
  params: { orgSlug: string }
  searchParams: { status?: string; q?: string }
}

export async function generateMetadata({ params }: Props) {
  return { title: `Projects · ${params.orgSlug}` }
}

export default async function ProjectsPage({ params, searchParams }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const projects = await getProjects(params.orgSlug, {
    status: searchParams.status,
    query:  searchParams.q,
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Projects"
        description="All slot game projects in this workspace"
        actions={
          <Link href={`/${params.orgSlug}/projects/new`}>
            <Button variant="primary" size="sm">
              <Plus className="w-3.5 h-3.5" />
              New project
            </Button>
          </Link>
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-8 py-3 border-b border-sf-border">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={
              f.value === 'all'
                ? `/${params.orgSlug}/projects`
                : `/${params.orgSlug}/projects?status=${f.value}`
            }
            className={
              (f.value === 'all' && !searchParams.status) ||
              searchParams.status === f.value
                ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-sf-gold/10 text-sf-gold border border-sf-gold/20'
                : 'px-3 py-1.5 rounded-lg text-xs font-medium text-sf-muted hover:text-sf-text hover:bg-sf-surface transition-colors'
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 p-8">
        {projects.length === 0 ? (
          <ProjectsEmptyState orgSlug={params.orgSlug} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                orgSlug={params.orgSlug}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_FILTERS = [
  { label: 'All',      value: 'all' },
  { label: 'Draft',    value: 'draft' },
  { label: 'Review',   value: 'review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Archived', value: 'archived' },
]
