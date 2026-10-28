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

-- ─── Brief vertical + follow-up reminders (Pipeline) ──────────────────────────
alter table client_briefs add column if not exists vertical_id uuid references verticals(id) on delete set null;
alter table client_briefs add column if not exists next_follow_up date;
alter table leads add column if not exists next_follow_up date;

-- ─── Personal to-dos: kind (todo | follow_up) ────────────────────────────────
alter table todos add column if not exists kind text default 'todo';

-- ─── Reach Outs (personal contact list in To-Dos panel) ──────────────────────
create table if not exists reach_outs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  city text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table reach_outs enable row level security;
drop policy if exists "reach_outs_own" on reach_outs;
create policy "reach_outs_own" on reach_outs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Lead ownership (member-scoped pipeline visibility) ──────────────────────
alter table leads add column if not exists created_by uuid references profiles(id) on delete set null;

-- ─── Friends of BCC (shared network list) ────────────────────────────────────
create table if not exists friends_of_bcc (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  city text,
  phone text,
  email text,
  linkedin text,
  relationship text,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table friends_of_bcc enable row level security;
drop policy if exists "friends_all" on friends_of_bcc;
create policy "friends_all" on friends_of_bcc
  for all to authenticated using (true) with check (true);

-- ─── Owned Media: team allocation + active toggle ────────────────────────────
alter table owned_media_properties add column if not exists is_active boolean not null default true;
alter table owned_media_properties add column if not exists team jsonb not null default '{}'::jsonb;

-- ─── Owned Media Sales pipeline ──────────────────────────────────────────────
create table if not exists owned_media_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  property_id uuid references owned_media_properties(id) on delete set null,
  property_name text,
  lead_type text not null default 'inbound',
  status text not null default 'draft',
  deal_value numeric(14,2),
  notes text,
  next_follow_up date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table owned_media_leads enable row level security;
drop policy if exists "oml_all" on owned_media_leads;
create policy "oml_all" on owned_media_leads
  for all to authenticated using (true) with check (true);

-- ─── Owned Media: country ────────────────────────────────────────────────────
alter table owned_media_properties add column if not exists country text;

-- ─── Owned Media Sales: lead assignment ──────────────────────────────────────
alter table owned_media_leads add column if not exists assigned_to uuid references profiles(id) on delete set null;

-- ─── Jamming Board ───────────────────────────────────────────────────────────
create table if not exists jam_boards (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  month text,
  description text,
  is_archived boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table jam_boards add column if not exists link text;
alter table jam_boards enable row level security;
drop policy if exists "jam_boards_all" on jam_boards;
create policy "jam_boards_all" on jam_boards for all to authenticated using (true) with check (true);

create table if not exists jam_notes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references jam_boards(id) on delete cascade,
  content text not null,
  color text not null default 'yellow',
  author_id uuid references profiles(id) on delete set null,
  author_name text,
  likes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table jam_notes enable row level security;
drop policy if exists "jam_notes_all" on jam_notes;
create policy "jam_notes_all" on jam_notes for all to authenticated using (true) with check (true);

-- ─── Reimbursements ──────────────────────────────────────────────────────────
-- Team members raise claims from My Profile; their reporting manager approves.
-- Approved claims surface automatically in Salary & Payouts for `month`.
create table if not exists reimbursements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  expense_date date not null,
  -- `month` is derived from expense_date on write; Salary & Payouts keys off it
  month text not null,
  expense_type text not null check (expense_type in ('travel','food','beverage','cabs','other')),
  amount numeric not null check (amount > 0),
  description text,
  evidence_url text,
  evidence_path text,
  evidence_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reimbursements_user_month_idx on reimbursements(user_id, month);
create index if not exists reimbursements_status_idx on reimbursements(status);

alter table reimbursements enable row level security;

-- Read: own claims, your reports' claims, or admin
drop policy if exists "own_or_manager_read_reimb" on reimbursements;
create policy "own_or_manager_read_reimb" on reimbursements for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or exists (select 1 from profiles p where p.id = reimbursements.user_id and p.reporting_manager_id = auth.uid())
  );

-- Write: only ever for yourself
drop policy if exists "own_write_reimb" on reimbursements;
create policy "own_write_reimb" on reimbursements for insert to authenticated
  with check (user_id = auth.uid());

-- Update: claimant (cancel/edit while pending) or manager/admin (approve/reject)
drop policy if exists "own_or_manager_update_reimb" on reimbursements;
create policy "own_or_manager_update_reimb" on reimbursements for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or exists (select 1 from profiles p where p.id = reimbursements.user_id and p.reporting_manager_id = auth.uid())
  );

drop policy if exists "own_delete_reimb" on reimbursements;
create policy "own_delete_reimb" on reimbursements for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ─── 10. Client Details: month-aware engagements ─────────────────────────────
-- start_month  = month the retainer began, or the month a one-time deal was approved
-- end_month    = last month a retainer is billed; null means still running
alter table clients add column if not exists start_month text;
alter table clients add column if not exists end_month text;

-- Backfill existing rows from their creation date so nothing disappears
update clients set start_month = to_char(created_at, 'YYYY-MM') where start_month is null;

create index if not exists clients_start_month_idx on clients(start_month);

-- ─── 11. Client Details: distribution payout ─────────────────────────────────
-- Amount paid out to creators / pages for placements, deducted when
-- calculating client-level profitability.
alter table clients add column if not exists distribution_payout numeric not null default 0;

-- ─── 12. Outbound system emails ──────────────────────────────────────────────
-- Audit trail for automated notices (e.g. reimbursement approvals to finance).
-- Rows are written before the send is attempted, so a missing API key or a
-- provider outage leaves a record that can be retried instead of vanishing.
create table if not exists outbound_emails (
  id uuid primary key default gen_random_uuid(),
  to_addresses text[] not null,
  subject text not null,
  body_html text,
  body_text text,
  related_type text,
  related_id uuid,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  provider_id text,
  provider_response text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outbound_emails_status_idx on outbound_emails(status);
create index if not exists outbound_emails_related_idx on outbound_emails(related_type, related_id);

alter table outbound_emails enable row level security;
-- Written by the service role only; admins may read the log
drop policy if exists "admins_read_outbound_emails" on outbound_emails;
create policy "admins_read_outbound_emails" on outbound_emails for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ─── 13. AI Service vertical ─────────────────────────────────────────────────
insert into verticals (name, color, icon, order_index)
select 'AI Service', '#8b5cf6', '🤖', coalesce((select max(order_index) + 1 from verticals), 5)
where not exists (select 1 from verticals where lower(name) = 'ai service');

-- ─── 14. Client Details: payment received per month ──────────────────────────
-- One row per client per month, so a retainer's payments are tracked month by
-- month and a one-time deal is marked once in its own month.
create table if not exists client_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  month text not null,
  received boolean not null default false,
  received_at timestamptz,
  marked_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);
alter table client_payments enable row level security;
drop policy if exists "client_payments_all" on client_payments;
create policy "client_payments_all" on client_payments
  for all to authenticated using (true) with check (true);

-- ─── 15. Live Media Plans: links, verification, creator payouts ──────────────
alter table media_plan_items add column if not exists deliverable_date date;
alter table media_plan_items add column if not exists page_link text;
-- One link per deliverable: a page booked for 4 deliverables needs 4 links
alter table media_plan_items add column if not exists live_links jsonb not null default '[]'::jsonb;
alter table media_plans add column if not exists summary jsonb not null default '{}'::jsonb;
alter table media_plan_items add column if not exists verified boolean not null default false;
alter table media_plan_items add column if not exists verified_by uuid references profiles(id) on delete set null;
alter table media_plan_items add column if not exists verified_at timestamptz;
alter table media_plan_items add column if not exists paid boolean not null default false;
alter table media_plan_items add column if not exists paid_by uuid references profiles(id) on delete set null;
alter table media_plan_items add column if not exists paid_at timestamptz;
alter table media_plans add column if not exists source text not null default 'generated';
alter table media_plans add column if not exists source_file_name text;

-- Only admins may mark a creator as paid, and only verifiers may verify.
-- Enforced in the database, not just hidden in the UI.
create or replace function enforce_media_item_permissions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text;
  levels jsonb;
begin
  -- to_jsonb works whether access_levels is text[] or jsonb
  select role, coalesce(to_jsonb(access_levels), '[]'::jsonb) into r, levels from profiles where id = auth.uid();
  -- service role / server routes have no auth.uid(); let them through
  if auth.uid() is null then return new; end if;

  if (new.paid is distinct from old.paid) and r <> 'admin' then
    raise exception 'Only admins can mark a payout as paid';
  end if;
  if (new.verified is distinct from old.verified)
     and r <> 'admin' and not (levels ? 'verify_live_links') then
    raise exception 'You do not have permission to verify live links';
  end if;
  -- Payout amounts are money decisions
  if ((new.total_cost is distinct from old.total_cost) or (new.rate is distinct from old.rate))
     and r <> 'admin' then
    raise exception 'Only admins can change payout amounts';
  end if;
  -- A verified link must not be swapped afterwards; un-verify first
  if old.verified and new.verified
     and (new.live_links is distinct from old.live_links) and r <> 'admin' then
    raise exception 'Live links are locked once verified';
  end if;
  -- Paid requires verified, and an un-verify cannot strand a paid row
  if new.paid and not new.verified then
    raise exception 'A line item must be verified before it can be marked paid';
  end if;
  return new;
end $$;

drop trigger if exists media_item_permissions on media_plan_items;
create trigger media_item_permissions before update on media_plan_items
  for each row execute function enforce_media_item_permissions();

-- ─── 16. Creator / page KYC from the public /join form ───────────────────────
-- Kept out of influencer_submissions on purpose: that table is readable by
-- every signed-in user, and KYC must be admin-only.
create table if not exists influencer_kyc (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid,
  influencer_id uuid references influencers(id) on delete set null,
  handle_name text,
  platform text,
  person_name text,
  aadhaar_path text,
  aadhaar_file_name text,
  pan_path text,
  pan_file_name text,
  pan_number text,
  account_holder_name text,
  bank_name text,
  account_number text,
  ifsc_code text,
  upi_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists influencer_kyc_submission_idx on influencer_kyc(submission_id);
alter table influencer_kyc enable row level security;
drop policy if exists "admins_read_kyc" on influencer_kyc;
create policy "admins_read_kyc" on influencer_kyc for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
-- No insert/update/delete policies: writes only happen via the service role

-- Private bucket: files are served to admins through short-lived signed URLs
insert into storage.buckets (id, name, public)
values ('kyc-docs', 'kyc-docs', false)
on conflict (id) do update set public = false;

-- ─── 17. HRMS role: may create team members, nothing else ────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'member', 'hrms'));

-- ─── 18. Lock down privileged profile fields ─────────────────────────────────
-- The profiles write policy is `for all to authenticated using (true)`, so any
-- signed-in user could set their own role to admin, grant themselves every
-- module, or edit and delete other people's profiles from the browser console.
-- This trigger makes roles and access admin-only and confines everyone else to
-- their own row. Server routes use the service role (no auth.uid()) and pass.
create or replace function guard_profile_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  select role into caller_role from profiles where id = auth.uid();
  if caller_role = 'admin' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Only admins can delete profiles';
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'member'
       or jsonb_array_length(coalesce(to_jsonb(new.access_levels), '[]'::jsonb)) > 0 then
      raise exception 'New profiles start as members with no access';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.id <> auth.uid() then
    raise exception 'You can only edit your own profile';
  end if;
  if new.role is distinct from old.role
     or to_jsonb(new.access_levels) is distinct from to_jsonb(old.access_levels)
     or new.reporting_manager_id is distinct from old.reporting_manager_id
     or new.locked_reporting_manager_id is distinct from old.locked_reporting_manager_id
     or new.locked_designation is distinct from old.locked_designation
     or new.locked_department is distinct from old.locked_department
     or new.employee_id is distinct from old.employee_id
     or new.employment_type is distinct from old.employment_type then
    raise exception 'Only admins can change roles, access or HR fields';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before insert or update or delete on profiles
  for each row execute function guard_profile_changes();
