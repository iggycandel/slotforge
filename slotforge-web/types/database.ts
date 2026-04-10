/**
 * Supabase database types — manually maintained until you run:
 *   npx supabase gen types typescript --project-id msrtfvmshswwhtmycxjq > types/database.ts
 *
 * IMPORTANT: @supabase/supabase-js v2.44+ requires each table to include
 * a `Relationships` field (GenericRelationship[]) or the schema resolves to `never`.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type ProjectStatus = 'draft' | 'review' | 'approved' | 'archived'
export type WorkspacePlan = 'free' | 'pro' | 'enterprise'

// ─── Database type ────────────────────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id:                 string
          clerk_org_id:       string
          name:               string
          slug:               string
          plan:               WorkspacePlan
          stripe_customer_id: string | null
          created_at:         string
        }
        Insert: {
          id?:                string
          clerk_org_id:       string
          name:               string
          slug:               string
          plan?:              WorkspacePlan
          stripe_customer_id?: string | null
          created_at?:        string
        }
        Update: {
          id?:                string
          clerk_org_id?:      string
          name?:              string
          slug?:              string
          plan?:              WorkspacePlan
          stripe_customer_id?: string | null
          created_at?:        string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          id:            string
          workspace_id:  string
          clerk_user_id: string
          role:          WorkspaceRole
          created_at:    string
        }
        Insert: {
          id?:           string
          workspace_id:  string
          clerk_user_id: string
          role?:         WorkspaceRole
          created_at?:   string
        }
        Update: {
          id?:           string
          workspace_id?: string
          clerk_user_id?: string
          role?:         WorkspaceRole
          created_at?:   string
        }
        Relationships: [
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
      }
      projects: {
        Row: {
          id:             string
          workspace_id:   string
          name:           string
          slug:           string
          theme:          string
          reelset:        string
          status:         ProjectStatus
          thumbnail_path: string | null
          payload:        Record<string, unknown> | null
          created_by:     string
          created_at:     string
          updated_at:     string
        }
        Insert: {
          id?:             string
          workspace_id:    string
          name:            string
          slug:            string
          theme?:          string
          reelset?:        string
          status?:         ProjectStatus
          thumbnail_path?: string | null
          payload?:        Record<string, unknown> | null
          created_by:      string
          created_at?:     string
          updated_at?:     string
        }
        Update: {
          id?:             string
          workspace_id?:   string
          name?:           string
          slug?:           string
          theme?:          string
          reelset?:        string
          status?:         ProjectStatus
          thumbnail_path?: string | null
          payload?:        Record<string, unknown> | null
          created_by?:     string
          created_at?:     string
          updated_at?:     string
        }
        Relationships: [
          {
            foreignKeyName: 'projects_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
      }
      project_snapshots: {
        Row: {
          id:              string
          project_id:      string
          version:         number
          label:           string
          payload:         unknown
          file_size_bytes: number
          created_by:      string
          created_at:      string
        }
        Insert: {
          id?:              string
          project_id:       string
          version:          number
          label?:           string
          payload:          unknown
          file_size_bytes?: number
          created_by:       string
          created_at?:      string
        }
        Update: {
          id?:              string
          project_id?:      string
          version?:         number
          label?:           string
          payload?:         unknown
          file_size_bytes?: number
          created_by?:      string
          created_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: 'project_snapshots_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      subscriptions: {
        Row: {
          id:                 string
          workspace_id:       string
          stripe_sub_id:      string
          status:             string
          plan:               WorkspacePlan
          current_period_end: string
        }
        Insert: {
          id?:                string
          workspace_id:       string
          stripe_sub_id:      string
          status:             string
          plan:               WorkspacePlan
          current_period_end: string
        }
        Update: {
          id?:                string
          workspace_id?:      string
          stripe_sub_id?:     string
          status?:            string
          plan?:              WorkspacePlan
          current_period_end?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views:   Record<string, never>
    Functions: Record<string, never>
    Enums: {
      workspace_role: WorkspaceRole
      project_status: ProjectStatus
      workspace_plan: WorkspacePlan
    }
    CompositeTypes: Record<string, never>
  }
}
