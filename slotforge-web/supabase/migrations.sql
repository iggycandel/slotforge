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
