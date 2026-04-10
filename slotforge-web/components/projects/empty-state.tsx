import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface EmptyStateProps {
  orgSlug: string
}

export function ProjectsEmptyState({ orgSlug }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="text-5xl mb-5">🎰</div>
      <h2 className="text-lg font-bold text-sf-text mb-2">No projects yet</h2>
      <p className="text-sm text-sf-muted max-w-xs mb-8">
        Create your first slot game project to start designing with the canvas and flow builder.
      </p>
      <Link href={`/${orgSlug}/projects/new`}>
        <Button variant="primary" size="md">
          <Plus className="w-4 h-4" />
          New project
        </Button>
      </Link>
    </div>
  )
}
