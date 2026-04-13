export interface ProjectSnapshot {
  id: string
  project_id: string
  label: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface SaveState {
  status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  lastSaved?: Date
  error?: string
}

export type ActionResult<T> = {
  data: T | null
  error: string | null
}

export interface Project {
  id: string
  name: string
  user_id?: string | null
  org_id?: string | null
  status: 'draft' | 'review' | 'approved' | 'archived'
  theme?: string | null
  reelset?: string | null
  payload?: Record<string, unknown> | null
  thumbnail_url?: string | null
  created_at: string
  updated_at: string
}
