-- BCC Media Network Workspace — Supabase Schema
-- Run this in your Supabase SQL Editor

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  avatar_url text,
  role text not null default 'member' check (role in ('admin', 'member')),
  department text,
  created_at timestamptz not null default now()
);

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── Verticals ───────────────────────────────────────────────────────────────
create table if not exists verticals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6366f1',
  icon text not null default '📺',
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

-- ─── Todos ───────────────────────────────────────────────────────────────────
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references verticals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── Discussions ─────────────────────────────────────────────────────────────
create table if not exists discussions (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references verticals(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  with_member_id uuid references profiles(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

-- ─── Meetings ────────────────────────────────────────────────────────────────
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references verticals(id) on delete cascade,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  google_event_id text,
  meet_link text,
  attendees jsonb not null default '[]',
  assigned_to uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─── Notes ───────────────────────────────────────────────────────────────────
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references verticals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default '',
  content text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Team Discussions ────────────────────────────────────────────────────────
create table if not exists team_discussions (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references verticals(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references team_discussions(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- ─── Leads / CRM ─────────────────────────────────────────────────────────────
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references verticals(id) on delete cascade,
  company_name text not null,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  our_poc_id uuid references profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new','contacted','proposal','negotiation','won','lost','on_hold')),
  deal_value numeric(14,2),
  location text,
  latest_update text,
  notes text,
  next_follow_up timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── RLS Policies ────────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table verticals enable row level security;
alter table todos enable row level security;
alter table discussions enable row level security;
alter table meetings enable row level security;
alter table notes enable row level security;
alter table team_discussions enable row level security;
alter table team_discussion_replies enable row level security;
alter table leads enable row level security;

-- Authenticated users can read all data
create policy "auth_read_profiles" on profiles for select to authenticated using (true);
create policy "auth_read_verticals" on verticals for select to authenticated using (true);
create policy "auth_read_todos" on todos for select to authenticated using (true);
create policy "auth_read_discussions" on discussions for select to authenticated using (true);
create policy "auth_read_meetings" on meetings for select to authenticated using (true);
create policy "auth_read_notes" on notes for select to authenticated using (true);
create policy "auth_read_team_discussions" on team_discussions for select to authenticated using (true);
create policy "auth_read_team_discussion_replies" on team_discussion_replies for select to authenticated using (true);
create policy "auth_read_leads" on leads for select to authenticated using (true);

-- Authenticated users can insert/update/delete
create policy "auth_write_profiles" on profiles for all to authenticated using (true) with check (true);
create policy "auth_write_verticals" on verticals for all to authenticated using (true) with check (true);
create policy "auth_write_todos" on todos for all to authenticated using (true) with check (true);
create policy "auth_write_discussions" on discussions for all to authenticated using (true) with check (true);
create policy "auth_write_meetings" on meetings for all to authenticated using (true) with check (true);
create policy "auth_write_notes" on notes for all to authenticated using (true) with check (true);
create policy "auth_write_team_discussions" on team_discussions for all to authenticated using (true) with check (true);
create policy "auth_write_team_discussion_replies" on team_discussion_replies for all to authenticated using (true) with check (true);
create policy "auth_write_leads" on leads for all to authenticated using (true) with check (true);

-- ─── Seed: Insert default verticals ──────────────────────────────────────────
insert into verticals (name, color, icon, order_index) values
  ('Television', '#6366f1', '📺', 0),
  ('Digital', '#3b82f6', '💻', 1),
  ('Radio', '#f59e0b', '📻', 2),
  ('Events', '#10b981', '🎯', 3)
on conflict do nothing;
