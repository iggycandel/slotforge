'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { MoreHorizontal, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

const STATUS_VARIANT = {
  draft:    'default',
  review:   'warning',
  approved: 'success',
  archived: 'danger',
} as const

interface ProjectCardProps {
  project: Project
  orgSlug: string
}

export function ProjectCard({ project, orgSlug }: ProjectCardProps) {
  return (
    <Link
      href={`/${orgSlug}/projects/${project.id}`}
      className={cn(
        'group flex flex-col rounded-2xl border border-sf-border bg-sf-surface',
        'hover:border-sf-gold/30 hover:shadow-card transition-all duration-200',
        'overflow-hidden'
      )}
    >
      {/* Thumbnail — a JPEG data URL captured from the editor's portrait
          viewport (~492×1000 for portrait projects). Plain <img>, not
          next/image, because data URLs bypass optimisation anyway. */}
      <div className="relative aspect-[9/16] bg-sf-bg overflow-hidden">
        {project.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnail_url}
            alt={project.name}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-sf-bg to-sf-overlay">
            <div className="flex flex-col items-center gap-2 text-center px-4">
              <Sparkles className="w-6 h-6 text-sf-gold/70" />
              <span className="text-xs font-semibold text-sf-text">This is your new project!</span>
              <span className="text-[10px] text-sf-subtle">Open it to start designing</span>
            </div>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-sf-gold/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sf-text text-sm leading-snug group-hover:text-sf-gold transition-colors truncate">
            {project.name}
          </h3>
          {/* More menu — prevent link navigation */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            className="p-1 rounded-md text-sf-subtle hover:text-sf-text hover:bg-sf-overlay opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={STATUS_VARIANT[project.status] ?? 'default'}>
            {project.status}
          </Badge>
          {project.theme && (
            <span className="text-[10px] text-sf-subtle font-mono">{project.theme}</span>
          )}
          {project.reelset && (
            <span className="text-[10px] text-sf-subtle font-mono">{project.reelset}</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-3 flex items-center justify-between text-[10px] text-sf-subtle">
        <span>
          Updated{' '}
          {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
        </span>
      </div>
    </Link>
  )
}
