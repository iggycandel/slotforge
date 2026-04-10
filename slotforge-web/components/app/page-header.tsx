import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** Action buttons rendered in the top-right */
  actions?: React.ReactNode
  className?: string
}

/**
 * Consistent page header used across dashboard, projects, settings pages.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-8 py-6 border-b border-sf-border',
        className
      )}
    >
      <div>
        <h1 className="text-xl font-bold text-sf-text">{title}</h1>
        {description && (
          <p className="text-sm text-sf-muted mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
