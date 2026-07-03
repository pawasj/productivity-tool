-- Owned Media Properties
-- Run this in Supabase Dashboard → SQL Editor

create table if not exists public.owned_media_properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  links jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  metrics_updated_at timestamptz,
  cadence jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.owned_media_properties enable row level security;

drop policy if exists "owned_media_select" on public.owned_media_properties;
create policy "owned_media_select" on public.owned_media_properties
  for select to authenticated using (true);

drop policy if exists "owned_media_insert" on public.owned_media_properties;
create policy "owned_media_insert" on public.owned_media_properties
  for insert to authenticated with check (true);

drop policy if exists "owned_media_update" on public.owned_media_properties;
create policy "owned_media_update" on public.owned_media_properties
  for update to authenticated using (true);

drop policy if exists "owned_media_delete" on public.owned_media_properties;
create policy "owned_media_delete" on public.owned_media_properties
  for delete to authenticated using (true);
