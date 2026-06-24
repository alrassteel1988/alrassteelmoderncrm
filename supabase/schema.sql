create table if not exists public.crm_leads (
  id text primary key,
  company_id text not null unique,
  company_name text not null,
  owner_id text,
  territory text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_users (
  id text primary key,
  email text not null unique,
  username text not null unique,
  role text not null default 'salesman',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_activities (
  id text primary key,
  company_id text not null,
  lead_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.crm_leads enable row level security;
alter table public.crm_users enable row level security;
alter table public.crm_activities enable row level security;

create index if not exists crm_leads_company_name_idx on public.crm_leads (company_name);
create index if not exists crm_leads_owner_status_idx on public.crm_leads (owner_id, status);
create index if not exists crm_users_role_idx on public.crm_users (role);
create index if not exists crm_activities_company_id_idx on public.crm_activities (company_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_leads_set_updated_at on public.crm_leads;
create trigger crm_leads_set_updated_at
before update on public.crm_leads
for each row execute function public.set_updated_at();

drop trigger if exists crm_users_set_updated_at on public.crm_users;
create trigger crm_users_set_updated_at
before update on public.crm_users
for each row execute function public.set_updated_at();
