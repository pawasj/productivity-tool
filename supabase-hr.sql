-- ─── HR Extensions to profiles ───────────────────────────────────────────────
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists designation text;
alter table profiles add column if not exists department text;
alter table profiles add column if not exists team text;
alter table profiles add column if not exists reporting_manager_id uuid references profiles(id) on delete set null;
alter table profiles add column if not exists employee_id text;
alter table profiles add column if not exists date_of_joining date;
alter table profiles add column if not exists employment_type text default 'full_time'
  check (employment_type in ('full_time','part_time','contract','intern'));

-- ─── Employee Personal Details ────────────────────────────────────────────────
create table if not exists employee_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  personal_email text,
  date_of_birth date,
  gender text,
  blood_group text,
  -- Emergency contact
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  -- Permanent address
  permanent_address_line1 text,
  permanent_address_line2 text,
  permanent_city text,
  permanent_state text,
  permanent_pincode text,
  permanent_country text default 'India',
  -- Correspondence address
  same_as_permanent boolean default false,
  corr_address_line1 text,
  corr_address_line2 text,
  corr_city text,
  corr_state text,
  corr_pincode text,
  corr_country text default 'India',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table employee_details enable row level security;
create policy "own_or_admin_read_employee_details" on employee_details for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "own_write_employee_details" on employee_details for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Bank Details ─────────────────────────────────────────────────────────────
create table if not exists employee_bank_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  account_holder_name text,
  bank_name text,
  account_number text,
  ifsc_code text,
  branch_name text,
  account_type text default 'savings' check (account_type in ('savings','current')),
  upi_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table employee_bank_details enable row level security;
create policy "own_or_admin_read_bank" on employee_bank_details for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "own_write_bank" on employee_bank_details for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Employee Documents ───────────────────────────────────────────────────────
create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  doc_type text not null check (doc_type in ('aadhar','pan','passport','offer_letter','nda','relieving_letter','other')),
  doc_label text,
  file_url text,
  file_path text,
  verified boolean default false,
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  uploaded_at timestamptz default now()
);
alter table employee_documents enable row level security;
create policy "own_or_admin_read_docs" on employee_documents for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "own_write_docs" on employee_documents for insert to authenticated
  with check (user_id = auth.uid());
create policy "own_delete_docs" on employee_documents for delete to authenticated
  using (user_id = auth.uid());
create policy "admin_update_docs" on employee_documents for update to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ─── Leave Applications ───────────────────────────────────────────────────────
create table if not exists leave_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('casual','sick','earned','wfh','half_day','optional')),
  from_date date not null,
  to_date date not null,
  days numeric not null default 1,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table leave_applications enable row level security;
create policy "own_or_manager_read_leaves" on leave_applications for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or exists (select 1 from profiles p where p.id = leave_applications.user_id and p.reporting_manager_id = auth.uid())
  );
create policy "own_write_leaves" on leave_applications for insert to authenticated
  with check (user_id = auth.uid());
create policy "own_cancel_leaves" on leave_applications for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or exists (select 1 from profiles p where p.id = leave_applications.user_id and p.reporting_manager_id = auth.uid())
  );

-- ─── Attendance Logs ──────────────────────────────────────────────────────────
create table if not exists attendance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  check_in time,
  check_out time,
  status text not null default 'present' check (status in ('present','absent','wfh','half_day','on_leave','holiday')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);
alter table attendance_logs enable row level security;
create policy "own_or_admin_read_attendance" on attendance_logs for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or exists (select 1 from profiles p where p.id = attendance_logs.user_id and p.reporting_manager_id = auth.uid())
  );
create policy "own_write_attendance" on attendance_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Company Holidays ─────────────────────────────────────────────────────────
create table if not exists company_holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  holiday_type text default 'public' check (holiday_type in ('public','optional','company')),
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table company_holidays enable row level security;
create policy "all_read_holidays" on company_holidays for select to authenticated using (true);
create policy "admin_write_holidays" on company_holidays for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ─── Storage bucket for employee documents ────────────────────────────────────
-- Run in Supabase Dashboard > Storage > New bucket: "employee-docs" (private)
-- Or via SQL:
insert into storage.buckets (id, name, public) values ('employee-docs', 'employee-docs', false)
  on conflict (id) do nothing;

create policy "own_upload_docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_read_docs" on storage.objects for select to authenticated
  using (bucket_id = 'employee-docs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  ));
create policy "own_delete_docs" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-docs' and (storage.foldername(name))[1] = auth.uid()::text);
