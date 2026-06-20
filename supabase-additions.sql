-- BCC Media Network — Schema Additions
-- Run this in Supabase SQL Editor after the initial schema

-- Add with_person_name to discussions (free text instead of FK)
alter table discussions add column if not exists with_person_name text;

-- Update seed verticals
delete from verticals;
insert into verticals (name, color, icon, order_index) values
  ('Social Media', '#6366f1', '📱', 0),
  ('Distribution', '#3b82f6', '🌐', 1),
  ('Production', '#f59e0b', '🎬', 2),
  ('IPs', '#10b981', '💡', 3),
  ('Owned Media', '#ec4899', '📺', 4)
on conflict do nothing;

-- ─── Influencer Database ─────────────────────────────────────────────────────
create table if not exists influencers (
  id uuid primary key default gen_random_uuid(),
  handle_name text not null,
  channel_link text,
  category text,
  platform text not null default 'instagram',
  followers bigint,
  rate_post numeric,
  rate_story numeric,
  rate_combo numeric,
  rate_reel numeric,
  rate_carousel numeric,
  rate_collab_post numeric,
  contact_no text,
  person_name text,
  location text,
  state text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(handle_name, platform)
);

alter table influencers enable row level security;
create policy "auth_read_influencers" on influencers for select to authenticated using (true);
create policy "auth_write_influencers" on influencers for all to authenticated using (true) with check (true);

-- ─── Client Briefs ───────────────────────────────────────────────────────────
create table if not exists client_briefs (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  brand_poc text,
  budget numeric,
  engagement_type text not null default 'one_time' check (engagement_type in ('retainer', 'one_time')),
  industry text,
  brief text,
  status text not null default 'draft' check (status in ('draft', 'planning', 'approved', 'live', 'completed', 'lost')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table client_briefs enable row level security;
create policy "auth_read_client_briefs" on client_briefs for select to authenticated using (true);
create policy "auth_write_client_briefs" on client_briefs for all to authenticated using (true) with check (true);

-- ─── Media Plans ─────────────────────────────────────────────────────────────
create table if not exists media_plans (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references client_briefs(id) on delete cascade,
  total_budget numeric,
  allocated_budget numeric,
  margin_pct numeric,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  narrative text,
  plan_notes text,
  approved_at timestamptz,
  approved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table media_plans enable row level security;
create policy "auth_read_media_plans" on media_plans for select to authenticated using (true);
create policy "auth_write_media_plans" on media_plans for all to authenticated using (true) with check (true);

-- ─── Media Plan Items ────────────────────────────────────────────────────────
create table if not exists media_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references media_plans(id) on delete cascade,
  influencer_id uuid references influencers(id) on delete set null,
  handle_name text,
  category text,
  platform text,
  followers bigint,
  deliverable_type text,
  quantity int not null default 1,
  rate numeric,
  total_cost numeric,
  notes text,
  live_link text,
  live_at timestamptz,
  created_at timestamptz not null default now()
);

alter table media_plan_items enable row level security;
create policy "auth_read_media_plan_items" on media_plan_items for select to authenticated using (true);
create policy "auth_write_media_plan_items" on media_plan_items for all to authenticated using (true) with check (true);

-- ─── Idea Dump ───────────────────────────────────────────────────────────────
create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references verticals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  tags text[],
  created_at timestamptz not null default now()
);

alter table ideas enable row level security;
create policy "auth_read_ideas" on ideas for select to authenticated using (true);
create policy "auth_write_ideas" on ideas for all to authenticated using (true) with check (true);

-- ─── client_briefs extended columns (for Distribution Hub redesign) ───────────
alter table client_briefs add column if not exists poc_name text;
alter table client_briefs add column if not exists campaign_type text;
alter table client_briefs add column if not exists total_budget numeric;
alter table client_briefs add column if not exists target_audience text;
alter table client_briefs add column if not exists campaign_objective text;
alter table client_briefs add column if not exists timeline text;
alter table client_briefs add column if not exists media_plan_json jsonb;
alter table client_briefs add column if not exists narrative_text text;
alter table client_briefs add column if not exists source text default 'distro';

-- ─── Google Calendar token storage ──────────────────────────────────────────
alter table profiles add column if not exists google_calendar_token jsonb;
alter table profiles add column if not exists google_calendar_email text;

-- ─── Calendar events cache (Google Calendar sync + vertical tagging) ────────
create table if not exists calendar_events (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  summary text not null default 'Untitled Meeting',
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  location text,
  meet_link text,
  attendees jsonb,
  vertical_id uuid references verticals(id) on delete set null,
  synced_at timestamptz default now()
);
alter table calendar_events enable row level security;
create policy "auth_read_calendar_events" on calendar_events for select to authenticated using (true);
create policy "auth_write_calendar_events" on calendar_events for all to authenticated using (true) with check (true);

-- ─── Notifications ───────────────────────────────────────────────────────────
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  read boolean default false,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
create policy "auth_own_notifications" on notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Influencer type column (replaces notes-based heuristic) ────────────────
alter table influencers add column if not exists influencer_type text default 'creator'
  check (influencer_type in ('creator', 'page'));

-- Backfill based on category
update influencers set influencer_type = 'page'
  where category in ('Meme Page','Pop Culture','News','Regional','Motivational',
    'Volume Led','Community','Media','Politics','Cinema','Cricket / Sports',
    'Music','Devotional')
  and influencer_type = 'creator';

-- Add notes as actual notes (separate from type)
alter table influencers add column if not exists page_notes text;

-- ─── Update client_briefs status constraint ───────────────────────────────────
alter table client_briefs drop constraint if exists client_briefs_status_check;
alter table client_briefs add constraint client_briefs_status_check
  check (status in ('draft','planning','approved','shipped','accepted','rejected','live','completed','lost'));
