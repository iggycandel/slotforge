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


-- ── 8. Subscriptions ──────────────────────────────────────────────────────────
-- Stores Stripe subscription state per Clerk organisation.
-- Written by the Stripe webhook handler; read by plan-gate helpers.
-- Free-tier orgs have no row — absence = free.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  text        NOT NULL UNIQUE,
  stripe_customer_id      text        NOT NULL,
  stripe_subscription_id  text        NOT NULL,
  plan                    text        NOT NULL DEFAULT 'free'
                          CHECK (plan IN ('free', 'pro', 'studio')),
  status                  text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  current_period_end      timestamptz,
  cancel_at_period_end    boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON subscriptions (org_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage subscriptions"
ON subscriptions FOR ALL TO service_role
USING (true) WITH CHECK (true);


-- ── 9. Subscriptions — per-seat model update ──────────────────────────────────
-- Add seat_count column and update plan check to new tier names.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS seat_count integer NOT NULL DEFAULT 1;

-- Update plan constraint to new tier names (freelancer replaces pro)
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free', 'freelancer', 'studio'));


-- ── 10. Credit usage ─────────────────────────────────────────────────────────
-- Tracks AI image generation credits consumed per org per calendar month.
-- One row per (org_id, month). Resets naturally — a new month = new row.
-- Month format: 'YYYY-MM' (e.g. '2026-04').

CREATE TABLE IF NOT EXISTS credit_usage (
  org_id       text        NOT NULL,
  month        text        NOT NULL,           -- 'YYYY-MM'
  credits_used integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (org_id, month)
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_org_month ON credit_usage (org_id, month);

ALTER TABLE credit_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage credit_usage"
ON credit_usage FOR ALL TO service_role
USING (true) WITH CHECK (true);


-- ── 11. v121 / C1 — Storage RLS lockdown ──────────────────────────────────────
-- Audit C1: the original storage policies (section 3) gated INSERT/UPDATE/
-- DELETE on `bucket_id = 'project-assets'` only — meaning any authenticated
-- user could write into ANY project folder, including someone else's. Our
-- route handlers (e.g. /api/assets/upload) gate on assertProjectAccess and
-- bypass RLS via the service-role key, so server traffic was safe — but a
-- malicious client speaking directly to Supabase Storage with their own
-- session JWT could still scribble over a victim's project assets.
--
-- Fix: replace the open policies with per-folder ownership checks. The
-- first path segment of every object name is the project UUID
-- (storage.foldername(name))[1]. We resolve that back to a project, then
-- check that the requesting user (Clerk userId in the JWT 'sub' claim)
-- owns the workspace that contains the project.
--
-- Public SELECT policy is intentionally kept — public CDN URLs are how
-- the editor renders generated assets. Flipping the bucket private and
-- migrating to signed URLs is tracked separately (v122+).

DROP POLICY IF EXISTS "Authenticated users can upload project assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update project assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project assets" ON storage.objects;

-- Helper: resolves the JWT 'sub' (Clerk userId) → workspace.clerk_org_id and
-- checks ownership of the project folder. SECURITY DEFINER so the policy
-- can read projects/workspaces without recursive RLS evaluation. Stable
-- so Postgres can cache the result within a query.
CREATE OR REPLACE FUNCTION public.user_owns_project_folder(p_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM projects p
      JOIN workspaces w ON p.workspace_id = w.id
     WHERE p.id::text     = p_id
       AND w.clerk_org_id = (auth.jwt() ->> 'sub')
  );
$$;

CREATE POLICY "Owners can upload to their project folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-assets'
  AND public.user_owns_project_folder((storage.foldername(name))[1])
);

CREATE POLICY "Owners can update objects in their project folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-assets'
  AND public.user_owns_project_folder((storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'project-assets'
  AND public.user_owns_project_folder((storage.foldername(name))[1])
);

CREATE POLICY "Owners can delete objects in their project folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-assets'
  AND public.user_owns_project_folder((storage.foldername(name))[1])
);


-- ── 12. v121 / C2 — Atomic credit reserve / refund ───────────────────────────
-- Audit C2: lib/billing/subscription.ts.consumeCredits did SELECT-then-UPDATE
-- with no atomicity, so two parallel /api/ai-single calls from the same
-- user could both read `credits_used = N`, both UPDATE to `N + 1`, and the
-- counter would only advance by 1 instead of 2 (lost-update race). Combined
-- with consume-AFTER-call ordering, a user with 1 remaining credit could
-- fire 10 parallel requests, all pass the gate, all generate, and only 1
-- of those would actually decrement the counter — the other 9 generations
-- would be free.
--
-- These RPCs replace the unsafe pattern with:
--   consume_credit  — atomic UPSERT that fails (returns NULL) when the
--                     increment would push usage past the included quota.
--                     Caller must pass `included` (computed from plan +
--                     seat_count) so the quota check happens inside the
--                     same transaction as the counter bump.
--   refund_credit   — straight decrement, used by the failure paths
--                     (OpenAI errored, upload failed) so we don't bill
--                     the user for a generation that never produced an
--                     asset.
--
-- Routes call reserveCredits() BEFORE the OpenAI request and refundCredits()
-- on failure. Total cost is one extra round-trip per generation but it
-- closes the lost-update race AND the "burn cost on a depleted budget"
-- attack window.

CREATE OR REPLACE FUNCTION public.consume_credit(
  p_org_id   text,
  p_count    int,
  p_included int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := to_char(now(), 'YYYY-MM');
  v_used  int;
BEGIN
  -- Reject negative / zero / overshooting reserves up-front. The CHECK
  -- inside the ON CONFLICT branch handles the rolling-overflow case
  -- (existing usage + count would exceed quota), but the INSERT branch
  -- would happily insert `p_count` for a fresh month even if p_count
  -- itself > p_included — guard explicitly.
  IF p_count <= 0 OR p_count > p_included THEN
    RETURN NULL;
  END IF;

  INSERT INTO credit_usage (org_id, month, credits_used, updated_at)
    VALUES (p_org_id, v_month, p_count, now())
    ON CONFLICT (org_id, month) DO UPDATE
      SET credits_used = credit_usage.credits_used + EXCLUDED.credits_used,
          updated_at   = now()
      WHERE credit_usage.credits_used + EXCLUDED.credits_used <= p_included
    RETURNING credits_used INTO v_used;

  -- v_used is NULL when the ON CONFLICT WHERE clause skipped the UPDATE
  -- (would have overflowed). Caller treats NULL as "insufficient credits".
  RETURN v_used;
END
$$;

CREATE OR REPLACE FUNCTION public.refund_credit(
  p_org_id text,
  p_count  int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := to_char(now(), 'YYYY-MM');
  v_used  int;
BEGIN
  IF p_count <= 0 THEN
    RETURN NULL;
  END IF;
  UPDATE credit_usage
    SET credits_used = GREATEST(0, credits_used - p_count),
        updated_at   = now()
    WHERE org_id = p_org_id AND month = v_month
  RETURNING credits_used INTO v_used;
  RETURN v_used;
END
$$;

-- Service-role calls these via supabase.rpc(). Authenticated users never
-- call them directly — the routes that wrap them already authenticate
-- the user via Clerk before resolving plan + included credits. Keep the
-- functions invokable by service_role only.
REVOKE ALL ON FUNCTION public.consume_credit(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_credit(text, int)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credit(text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit(text, int)        TO service_role;
