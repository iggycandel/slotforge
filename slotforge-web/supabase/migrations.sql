-- ─────────────────────────────────────────────────────────────────────────────
-- Spinative — production schema baseline (v122 / H1)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This file is a documented snapshot of the live production schema as of
-- v122. It is NOT the source of truth for migrations — that role belongs
-- to `supabase_migrations.schema_migrations`, which records every migration
-- applied via the Supabase CLI / MCP `apply_migration`.
--
-- WHY DOES THIS FILE EXIST AT ALL?
--   Pre-v122 the team mixed two workflows: a handful of CLI migrations
--   (recorded in schema_migrations) and a much larger set of dashboard
--   edits (untracked). The committed migrations.sql gradually drifted
--   into fiction — it described tables that didn't exist, columns named
--   differently, and RLS policies that were never applied. The H1 audit
--   in v122 found:
--     • `credit_usage.credits_used` was actually `credit_usage.used` →
--       every credit_gate read failed silently for the entire history of
--       the app, so the gate was theatre and every paying user got
--       unlimited credits.
--     • The `subscriptions` schema in this file (org_id text) didn't
--       match production (workspace_id uuid).
--     • The 'studio' plan referenced in PLANS didn't exist in the
--       workspace_plan enum.
--     • `projects` had RLS DISABLED, AND every public-schema table had
--       open {public}-role policies — meaning anon could read/write
--       every row directly via PostgREST.
--     • Storage bucket policies allowed any authenticated user to write
--       into ANY project's folder (no ownership check).
--
-- POST-V122 GROUND RULES
--   1. NEVER edit a Supabase table or policy via the dashboard. Always
--      go through `apply_migration` (Claude MCP) or the Supabase CLI.
--      Dashboard edits are untracked and re-create the drift problem.
--   2. ALL routes write/read through the service-role client
--      (lib/supabase/admin.ts). The service role bypasses RLS.
--   3. Project access is gated in code via `assertProjectAccess`. RLS
--      policies on public-schema tables are intentionally service-role-
--      only — anon and authenticated have no direct access.
--   4. The browser does NOT call Supabase directly today. lib/supabase/
--      client.ts exists but has no importers. If client-side direct
--      access is added later, narrow per-table policies must be added
--      explicitly — do not re-open the public surface.
--
-- HOW TO RECREATE THIS SCHEMA FROM SCRATCH
--   Running this file in order against an empty database produces a
--   working baseline. Each `CREATE … IF NOT EXISTS` and `DROP POLICY IF
--   EXISTS … / CREATE POLICY` is idempotent so re-running is safe.
--   Operationally, prefer Supabase's "Restore from snapshot" or run via
--   `apply_migration` so schema_migrations history stays accurate.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Enum types ───────────────────────────────────────────────────────────
-- workspace_plan tracks the SaaS tier. 'pro' and 'enterprise' are legacy
-- values from an earlier plan structure — no rows reference them in
-- production but they're kept on the enum because removing values is a
-- multi-step migration (CREATE new enum → migrate columns → DROP old).
-- 'studio' was added in v122 to match lib/billing/plans.ts.

DO $$ BEGIN
  CREATE TYPE workspace_plan AS ENUM ('free', 'pro', 'enterprise', 'freelancer', 'studio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('draft', 'review', 'approved', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 2. workspaces ───────────────────────────────────────────────────────────
-- Tenant boundary. `clerk_org_id` is unique and stores either a Clerk org
-- id (for team workspaces) or a Clerk user id (for solo personal
-- workspaces created by ensurePersonalWorkspace).

CREATE TABLE IF NOT EXISTS public.workspaces (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id       text           UNIQUE NOT NULL,
  name               text           NOT NULL,
  slug               text           UNIQUE NOT NULL,
  plan               workspace_plan NOT NULL DEFAULT 'free',
  stripe_customer_id text,
  created_at         timestamptz    NOT NULL DEFAULT now()
);


-- ── 3. workspace_members ────────────────────────────────────────────────────
-- Currently unused by the live app — the webhook handler intentionally
-- doesn't maintain this table (see authz.ts comment). Kept for the future
-- team-org rollout. Until then, ownership goes solely through
-- workspaces.clerk_org_id.

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid           NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  clerk_user_id text           NOT NULL,
  role          workspace_role NOT NULL DEFAULT 'viewer',
  created_at    timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, clerk_user_id)
);


-- ── 4. projects ─────────────────────────────────────────────────────────────
-- The Editor's working draft lives in `payload` (jsonb). `theme`, `reelset`,
-- `status` are denormalised from payload for fast list-page rendering.
-- `user_id` and `created_by` both store Clerk user ids; new rows use
-- `created_by`. RLS is enabled in section 11.

CREATE TABLE IF NOT EXISTS public.projects (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid           REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name            text           NOT NULL,
  slug            text           NOT NULL,
  theme           text           DEFAULT 'default',
  reelset         text           DEFAULT '5x3',
  status          project_status DEFAULT 'draft',
  thumbnail_path  text,
  thumbnail_url   text,
  created_by      text,
  user_id         text,
  payload         jsonb,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);


-- ── 5. project_snapshots ────────────────────────────────────────────────────
-- v117 — auto-snapshot + safety checkpoint feature. Each row is a
-- frozen copy of projects.payload at a point in time, tagged with a
-- monotonic `version` and an optional human label.

CREATE TABLE IF NOT EXISTS public.project_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version         integer     NOT NULL,
  label           text        NOT NULL DEFAULT '',
  payload         jsonb       NOT NULL,
  file_size_bytes integer     NOT NULL DEFAULT 0,
  created_by      text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);


-- ── 6. generated_assets ─────────────────────────────────────────────────────
-- One row per AI-generated (or user-uploaded) image. URL points at the
-- public Storage bucket. `type` is either a legacy AssetType
-- (symbol_high_1, background_base, …) OR a feature-slot key
-- (bonuspick.bg, freespins.intro_banner). Order DESC index makes the
-- assets-tab grid render cheaply.

CREATE TABLE IF NOT EXISTS public.generated_assets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  url         text        NOT NULL,
  prompt      text        NOT NULL DEFAULT '',
  theme       text        NOT NULL DEFAULT '',
  provider    text        NOT NULL DEFAULT 'openai',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generated_assets_project_id
  ON public.generated_assets (project_id, created_at DESC);


-- ── 7. asset_versions ───────────────────────────────────────────────────────
-- Tracks every regeneration so the user can revert. Exactly one row per
-- (project, type) is `is_active = true`; the partial unique index enforces
-- this without making the whole-table unique.

CREATE TABLE IF NOT EXISTS public.asset_versions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_id      uuid        REFERENCES public.generated_assets(id) ON DELETE SET NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_versions_active
  ON public.asset_versions (project_id, type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_asset_versions_project_type
  ON public.asset_versions (project_id, type, created_at DESC);


-- ── 8. canvas_links ─────────────────────────────────────────────────────────
-- Records which generated_asset is currently linked to each canvas slot.

CREATE TABLE IF NOT EXISTS public.canvas_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_id    uuid        NOT NULL REFERENCES public.generated_assets(id) ON DELETE CASCADE,
  asset_type  text        NOT NULL,
  el_key      text        NOT NULL,
  linked_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, asset_type)
);
CREATE INDEX IF NOT EXISTS idx_canvas_links_project
  ON public.canvas_links (project_id);


-- ── 9. project_context ──────────────────────────────────────────────────────
-- Per-project generation context (last theme / style / provider) — used to
-- prefill the ASSETS workspace control bar on revisit.

CREATE TABLE IF NOT EXISTS public.project_context (
  project_id  uuid        PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  theme       text        NOT NULL DEFAULT '',
  style_id    text,
  provider    text        NOT NULL DEFAULT 'openai',
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ── 10. subscriptions ───────────────────────────────────────────────────────
-- Stripe subscription state per workspace. NOTE: the older code-side
-- assumption was `org_id text` keying by Clerk org id; the actual
-- production schema keys by `workspace_id uuid`. Keep this in mind when
-- writing the Stripe webhook handler — it needs to resolve clerk_org_id
-- to a workspace_id before upserting.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid           NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stripe_sub_id        text           UNIQUE NOT NULL,
  stripe_customer_id   text,
  status               text           NOT NULL,
  plan                 workspace_plan NOT NULL,
  current_period_end   timestamptz,
  cancel_at_period_end boolean        NOT NULL DEFAULT false,
  seat_count           integer        DEFAULT 1,
  updated_at           timestamptz    NOT NULL DEFAULT now()
);


-- ── 11. credit_usage ────────────────────────────────────────────────────────
-- Tracks AI credits consumed per (org_id, month). Production column is
-- `used` (not `credits_used` as earlier drafts of this file claimed —
-- see top-of-file note about the v122 audit).

CREATE TABLE IF NOT EXISTS public.credit_usage (
  org_id  text    NOT NULL,
  month   text    NOT NULL,             -- 'YYYY-MM'
  used    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, month)
);


-- ── 12. RLS — service-role-only across the public schema ───────────────────
-- v122 / H1 lockdown. All app traffic uses the service-role key, which
-- bypasses RLS. Anon and authenticated have no direct DB access; if
-- client-side Supabase is wired up later, narrow policies must be added
-- explicitly per-table.

ALTER TABLE public.workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_assets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_context   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_usage      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages workspaces"        ON public.workspaces;
DROP POLICY IF EXISTS "Service role manages workspace_members" ON public.workspace_members;
DROP POLICY IF EXISTS "Service role manages projects"          ON public.projects;
DROP POLICY IF EXISTS "Service role manages project_snapshots" ON public.project_snapshots;
DROP POLICY IF EXISTS "Service role manages generated_assets"  ON public.generated_assets;
DROP POLICY IF EXISTS "Service role manages asset_versions"    ON public.asset_versions;
DROP POLICY IF EXISTS "Service role manages canvas_links"      ON public.canvas_links;
DROP POLICY IF EXISTS "Service role manages project_context"   ON public.project_context;
DROP POLICY IF EXISTS "Service role manages subscriptions"     ON public.subscriptions;
DROP POLICY IF EXISTS "Service role manages credit_usage"      ON public.credit_usage;

CREATE POLICY "Service role manages workspaces"
  ON public.workspaces        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages workspace_members"
  ON public.workspace_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages projects"
  ON public.projects          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages project_snapshots"
  ON public.project_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages generated_assets"
  ON public.generated_assets  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages asset_versions"
  ON public.asset_versions    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages canvas_links"
  ON public.canvas_links      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages project_context"
  ON public.project_context   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages credit_usage"
  ON public.credit_usage      FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Belt-and-braces: revoke ALL grants from anon/authenticated on every
-- public table. The defaults handed SELECT/INSERT/UPDATE/DELETE
-- (data-bearing) plus REFERENCES/TRIGGER/TRUNCATE (latent capability,
-- harmless without schema-level CREATE but tidied for hygiene).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;


-- ── 13. Storage bucket + RLS ────────────────────────────────────────────────
-- Public-read bucket for AI-generated and user-uploaded project images.
-- Public SELECT is intentional — the editor renders assets via CDN URLs.
-- Writes go ONLY through the service-role key in /api/assets/upload (which
-- gates on assertProjectAccess). Any "authenticated user can upload"
-- policy is removed in v122/H1.

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-assets', 'project-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Auth upload project-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload project assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update project assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read project-assets" ON storage.objects;

CREATE POLICY "Public read project-assets"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'project-assets');


-- ── 14. Atomic credit reserve / refund (v121 / C2 → corrected in v122 / H1)
-- Replaces the racy SELECT-then-UPDATE pattern that pre-v121 consumeCredits
-- used. consume_credit returns the new `used` value on success or NULL
-- when the reserve would overflow `included`. Routes call reserveCredits
-- BEFORE the OpenAI request and refundCredits on failure so the user is
-- only billed for assets that actually land.

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
  IF p_count <= 0 OR p_count > p_included THEN
    RETURN NULL;
  END IF;

  INSERT INTO credit_usage (org_id, month, used)
    VALUES (p_org_id, v_month, p_count)
    ON CONFLICT (org_id, month) DO UPDATE
      SET used = credit_usage.used + EXCLUDED.used
      WHERE credit_usage.used + EXCLUDED.used <= p_included
    RETURNING used INTO v_used;

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
    SET used = GREATEST(0, used - p_count)
    WHERE org_id = p_org_id AND month = v_month
  RETURNING used INTO v_used;
  RETURN v_used;
END
$$;

REVOKE ALL ON FUNCTION public.consume_credit(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_credit(text, int)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credit(text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit(text, int)        TO service_role;
