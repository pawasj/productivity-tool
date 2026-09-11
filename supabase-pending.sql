-- ═══════════════════════════════════════════════════════════════════════════
-- PENDING MIGRATIONS — run this whole file in the Supabase SQL Editor.
--
-- Safe to run more than once: every statement is guarded, so re-running
-- changes nothing. If you are unsure what has already been applied, just
-- run the whole thing.
--
-- This does NOT include the HR tables (supabase-hr.sql) — see step 2 in
-- the accompanying notes for that one.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. To-Dos: follow-up kind ───────────────────────────────────────────────
alter table todos add column if not exists kind text default 'todo';

-- ─── 2. Sales Pipeline: ownership + follow-up reminders ──────────────────────
alter table leads add column if not exists created_by uuid references profiles(id) on delete set null;
alter table leads add column if not exists next_follow_up date;
alter table client_briefs add column if not exists vertical_id uuid references verticals(id) on delete set null;
alter table client_briefs add column if not exists next_follow_up date;

-- ─── 3. Reach Outs (To-Dos panel) ────────────────────────────────────────────
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

-- ─── 4. Friends of BCC ───────────────────────────────────────────────────────
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

-- ─── 5. Owned Media: team, active toggle, country ────────────────────────────
alter table owned_media_properties add column if not exists is_active boolean not null default true;
alter table owned_media_properties add column if not exists team jsonb not null default '{}'::jsonb;
alter table owned_media_properties add column if not exists country text;

-- ─── 6. Owned Media Sales pipeline ───────────────────────────────────────────
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
alter table owned_media_leads add column if not exists assigned_to uuid references profiles(id) on delete set null;
alter table owned_media_leads enable row level security;
drop policy if exists "oml_all" on owned_media_leads;
create policy "oml_all" on owned_media_leads
  for all to authenticated using (true) with check (true);

-- ─── 7. Jamming Board ────────────────────────────────────────────────────────
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

-- Live post-it sync (ignore the error if it is already in the publication)
do $$
begin
  alter publication supabase_realtime add table jam_notes;
exception when duplicate_object then null;
end $$;

-- ─── 8. Reimbursements ───────────────────────────────────────────────────────
create table if not exists reimbursements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  expense_date date not null,
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

drop policy if exists "own_or_manager_read_reimb" on reimbursements;
create policy "own_or_manager_read_reimb" on reimbursements for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or exists (select 1 from profiles p where p.id = reimbursements.user_id and p.reporting_manager_id = auth.uid())
  );

drop policy if exists "own_write_reimb" on reimbursements;
create policy "own_write_reimb" on reimbursements for insert to authenticated
  with check (user_id = auth.uid());

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

-- ─── 9. Evidence storage ─────────────────────────────────────────────────────
-- Reimbursement evidence and employee documents share the employee-docs
-- bucket. It must be public so approvers can open an attachment.
insert into storage.buckets (id, name, public)
values ('employee-docs', 'employee-docs', true)
on conflict (id) do update set public = true;

drop policy if exists "own_upload_docs" on storage.objects;
create policy "own_upload_docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_delete_docs" on storage.objects;
create policy "own_delete_docs" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-docs' and (storage.foldername(name))[1] = auth.uid()::text);

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

-- ═══════════════════════════════════════════════════════════════════════════
-- Verify: every row below should say true.
-- ═══════════════════════════════════════════════════════════════════════════
select 'reach_outs'        as object, to_regclass('public.reach_outs')        is not null as ok
union all select 'friends_of_bcc',    to_regclass('public.friends_of_bcc')    is not null
union all select 'owned_media_leads', to_regclass('public.owned_media_leads') is not null
union all select 'jam_boards',        to_regclass('public.jam_boards')        is not null
union all select 'jam_notes',         to_regclass('public.jam_notes')         is not null
union all select 'reimbursements',    to_regclass('public.reimbursements')    is not null
union all select 'leave_applications (HR)', to_regclass('public.leave_applications') is not null
union all select 'employee_details (HR)',   to_regclass('public.employee_details')   is not null
union all select 'clients.start_month',
  exists (select 1 from information_schema.columns where table_name='clients' and column_name='start_month')
union all select 'outbound_emails',    to_regclass('public.outbound_emails')    is not null
union all select 'employee-docs bucket',
  exists (select 1 from storage.buckets where id = 'employee-docs' and public);
