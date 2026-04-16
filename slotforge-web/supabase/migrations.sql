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
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
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
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
    )
  )
);


-- ── 5. Asset versions ─────────────────────────────────────────────────────────
-- Tracks every generation iteration of an asset so users can revert.
-- Each row = one generation attempt for a given project+type combination.

CREATE TABLE IF NOT EXISTS asset_versions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id      uuid        REFERENCES generated_assets(id) ON DELETE SET NULL,
  type          text        NOT NULL,
  url           text        NOT NULL,
  prompt        text        NOT NULL DEFAULT '',
  theme         text        NOT NULL DEFAULT '',
  style_id      text,
  provider      text        NOT NULL DEFAULT 'unknown',
  version_num   integer     NOT NULL DEFAULT 1,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Exactly one active version per (project, type) at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_versions_active
  ON asset_versions (project_id, type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_asset_versions_project_type
  ON asset_versions (project_id, type, created_at DESC);

-- RLS
ALTER TABLE asset_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own asset versions"
ON asset_versions FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
    )
  )
);

CREATE POLICY "Service role can manage asset versions"
ON asset_versions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ── 6. Canvas links ───────────────────────────────────────────────────────────
-- Records which generated_asset is linked to each slot/layer in the Canvas editor.
-- When the user clicks "Send to Canvas" in ASSETS workspace, a row is upserted here.
-- The Canvas AssetsPanel reads these rows so it knows which assets are "in use".

CREATE TABLE IF NOT EXISTS canvas_links (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id      uuid        NOT NULL REFERENCES generated_assets(id) ON DELETE CASCADE,
  asset_type    text        NOT NULL,   -- e.g. 'symbol_high_1'
  el_key        text        NOT NULL,   -- e.g. 'sym_H1' (editor.js EL_ASSETS key)
  linked_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, asset_type)       -- one active link per slot per project
);

CREATE INDEX IF NOT EXISTS idx_canvas_links_project
  ON canvas_links (project_id);

-- RLS
ALTER TABLE canvas_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own canvas links"
ON canvas_links FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
    )
  )
);

CREATE POLICY "Service role can manage canvas links"
ON canvas_links FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can manage their own canvas links"
ON canvas_links FOR ALL
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
    )
  )
)
WITH CHECK (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
    )
  )
);


-- ── 7. Project context ────────────────────────────────────────────────────────
-- Stores per-project generation context: the last used theme, style_id,
-- and provider. Allows the ASSETS workspace to pre-fill the control bar
-- on next visit.

CREATE TABLE IF NOT EXISTS project_context (
  project_id    uuid        PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  theme         text        NOT NULL DEFAULT '',
  style_id      text,
  provider      text        NOT NULL DEFAULT 'openai',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE project_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own project context"
ON project_context FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
    )
  )
);

CREATE POLICY "Service role can manage project context"
ON project_context FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can upsert their own project context"
ON project_context FOR ALL
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
    )
  )
)
WITH CHECK (
  project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
    )
  )
);
