-- Salary payments tracking + document bucket fix
-- Run this in Supabase Dashboard > SQL Editor (after supabase-hr.sql)

-- 1. Paid/unpaid tracking on salary entries
alter table salary_entries add column if not exists paid boolean not null default false;

-- 2. The app links documents via public URLs, so the bucket must be public.
--    (URLs contain unguessable UUID paths; switch to signed URLs later if
--    stricter access control is needed.)
update storage.buckets set public = true where id = 'employee-docs';
