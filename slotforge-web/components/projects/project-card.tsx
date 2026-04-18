'use client'

import Link from 'next/link'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { MoreHorizontal, Layers } from 'lucide-react'
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
      {/* Thumbnail */}
      <div className="relative aspect-video bg-sf-bg overflow-hidden">
        {(project.thumbnail_url || (project.payload as any)?._thumbnail) ? (
          <Image
            src={(project.thumbnail_url || (project.payload as any)?._thumbnail) as string}
            alt={project.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-sf-subtle">
              <Layers className="w-8 h-8" />
              <span className="text-xs font-mono">No preview</span>
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
