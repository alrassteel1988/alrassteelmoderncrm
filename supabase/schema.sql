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

create table if not exists public.companies (
  id text primary key,
  legacy_lead_id text unique,
  company_name text not null,
  legal_name text,
  country_emirate text,
  sector text,
  tier text,
  status text,
  assigned_user_id text not null,
  territory text,
  next_action text,
  next_action_date date,
  estimated_value numeric default 0,
  first_order_date date,
  estimated_monthly_volume text,
  product_interest text,
  tags text,
  quotation_ref text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  name text not null,
  title text,
  phone text,
  email text,
  is_default boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  activity_type text not null,
  logged_by text not null,
  notes text,
  quotation_ref text,
  pmr_linked boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pmrs (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  activity_id text references public.activities(id) on delete set null,
  meeting_date date not null,
  filed_by text not null,
  products_discussed text,
  competitors_mentioned text,
  compliance_requirements jsonb not null default '[]'::jsonb,
  relationship_heat_score integer,
  first_order_timing text,
  potential_annual_value text,
  director_action_required text,
  account_status text,
  raw_document_url text,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  owner_id text not null,
  stage text not null,
  expected_value numeric default 0,
  probability integer default 0,
  expected_close_date date,
  product_interest text,
  risk_note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_reports (
  id text primary key,
  week_ending date not null,
  user_id text not null,
  state text not null default 'In Progress',
  summary text,
  market_overlay jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  attestation jsonb,
  director_review jsonb,
  payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_ending)
);

create table if not exists public.weekly_report_items (
  id text primary key,
  report_id text not null references public.weekly_reports(id) on delete cascade,
  item_type text not null,
  company_id text,
  disposition text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_intelligence (
  id text primary key,
  title text not null,
  source text,
  sector_tags text[] not null default '{}',
  geography_tags text[] not null default '{}',
  company_ids text[] not null default '{}',
  summary text,
  url text,
  published_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.config_audit (
  change_id text primary key,
  changed_by_user text not null,
  user_role text not null,
  parameter_changed text not null,
  previous_value jsonb,
  new_value jsonb,
  plain_language_input text,
  agent_interpretation text,
  confirmation_given boolean not null default false,
  business_reason text,
  review_trigger text,
  created_at timestamptz not null default now()
);

create table if not exists public.deletion_requests (
  id text primary key,
  company_id text,
  lead_id text,
  requested_by text not null,
  reason text,
  status text not null default 'Pending',
  decision_by text,
  decision_reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table public.crm_leads enable row level security;
alter table public.crm_users enable row level security;
alter table public.crm_activities enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.activities enable row level security;
alter table public.pmrs enable row level security;
alter table public.opportunities enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.weekly_report_items enable row level security;
alter table public.market_intelligence enable row level security;
alter table public.config_audit enable row level security;
alter table public.deletion_requests enable row level security;

create index if not exists crm_leads_company_name_idx on public.crm_leads (company_name);
create index if not exists crm_leads_owner_status_idx on public.crm_leads (owner_id, status);
create index if not exists crm_users_role_idx on public.crm_users (role);
create index if not exists crm_activities_company_id_idx on public.crm_activities (company_id);
create index if not exists companies_assigned_status_idx on public.companies (assigned_user_id, status);
create index if not exists companies_territory_sector_idx on public.companies (territory, sector);
create index if not exists contacts_company_default_idx on public.contacts (company_id, is_default);
create index if not exists activities_company_created_idx on public.activities (company_id, created_at desc);
create index if not exists pmrs_company_meeting_idx on public.pmrs (company_id, meeting_date desc);
create index if not exists opportunities_owner_stage_idx on public.opportunities (owner_id, stage);
create index if not exists weekly_reports_user_week_idx on public.weekly_reports (user_id, week_ending desc);
create index if not exists weekly_report_items_report_type_idx on public.weekly_report_items (report_id, item_type);
create index if not exists deletion_requests_status_idx on public.deletion_requests (status, requested_at desc);

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

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

drop trigger if exists weekly_reports_set_updated_at on public.weekly_reports;
create trigger weekly_reports_set_updated_at
before update on public.weekly_reports
for each row execute function public.set_updated_at();
