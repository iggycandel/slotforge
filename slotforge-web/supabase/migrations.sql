-- ─────────────────────────────────────────────────────────────────────────────
-- SlotForge — Supabase migrations
-- Run each section once in the Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Editor payload column ──────────────────────────────────────────────────
-- Stores the working draft of the editor (JSON blob, assets as storage URLs).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT NULL;


-- ── 2. Storage bucket for project assets ─────────────────────────────────────
-- Stores uploaded images (logos, backgrounds, symbols etc.) for each project.
-- NOTE: You can also create this from Supabase Dashboard → Storage.

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-assets', 'project-assets', true)
ON CONFLICT (id) DO NOTHING;


-- ── 3. Storage RLS policies ───────────────────────────────────────────────────

-- Authenticated users can upload/update assets
CREATE POLICY "Authenticated users can upload project assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-assets');

-- Public read (bucket is public)
CREATE POLICY "Public read for project assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'project-assets');

-- Authenticated users can update their assets (upsert)
CREATE POLICY "Authenticated users can update project assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'project-assets');

-- Authenticated users can delete their assets
CREATE POLICY "Authenticated users can delete project assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'project-assets');


-- ── 4. Generated assets metadata table ───────────────────────────────────────
-- Stores AI generation results linked to projects

CREATE TABLE IF NOT EXISTS generated_assets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  url         text        NOT NULL,
  prompt      text        NOT NULL DEFAULT '',
  theme       text        NOT NULL DEFAULT '',
  provider    text        NOT NULL DEFAULT 'unknown'
                          CHECK (provider IN ('runway','openai','mock','unknown')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast project lookups
CREATE INDEX IF NOT EXISTS idx_generated_assets_project_id
  ON generated_assets (project_id, created_at DESC);

-- RLS
ALTER TABLE generated_assets ENABLE ROW LEVEL SECURITY;

-- Users can only see assets belonging to their projects
CREATE POLICY "Users can view their own generated assets"
ON generated_assets FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  )
);

-- Service role can insert (pipeline runs server-side with service key)
CREATE POLICY "Service role can insert generated assets"
ON generated_assets FOR INSERT
TO service_role
WITH CHECK (true);

-- Users can delete their own project assets
CREATE POLICY "Users can delete their own generated assets"
ON generated_assets FOR DELETE
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  )
);
