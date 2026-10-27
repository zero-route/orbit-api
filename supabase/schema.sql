create extension if not exists pg_cron;

create table if not exists public.devices (
  id uuid primary key,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  platform text,
  app_version text,
  blocked boolean not null default false,
  blocked_reason text,
  plan text not null default 'free'
);

create table if not exists public.requests (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  url text not null,
  platform text,
  created_at timestamptz not null default now()
);

create index if not exists requests_created_at_idx on public.requests (created_at desc);
create index if not exists requests_device_idx on public.requests (device_id, created_at desc);

create table if not exists public.api_keys (
  id bigint generated always as identity primary key,
  label text,
  key text not null unique,
  status text not null default 'active',
  fail_count integer not null default 0,
  cooldown_until timestamptz,
  last_used timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.devices enable row level security;
alter table public.requests enable row level security;
alter table public.api_keys enable row level security;

select cron.schedule(
  'purge-requests',
  '0 * * * *',
  $$delete from public.requests where created_at < now() - interval '1 day'$$
);
