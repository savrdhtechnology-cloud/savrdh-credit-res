-- SAVRDH Credit Resolution persistent CRM schema
-- Run in Supabase SQL Editor once per project.
create extension if not exists pgcrypto;

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  crm_reference_id text unique not null,
  customer_name text not null,
  mobile text,
  email text,
  pan_number text,
  aadhaar_masked text,
  dob text,
  gender text,
  address text,
  credit_score integer,
  credit_bureau text,
  active_loans_count integer default 0,
  credit_cards_count integer default 0,
  settled_accounts_count integer default 0,
  written_off_accounts_count integer default 0,
  total_default_amount numeric(14,2) default 0,
  resolution_package text,
  package_amount numeric(14,2) default 0,
  payment_id text,
  cibil_fee_amount numeric(14,2) default 350,
  cibil_fee_paid boolean default false,
  loa_status text,
  loa_reference_number text,
  loa_consent_timestamp timestamptz,
  case_status text default 'New Lead',
  assigned_advisor_name text,
  source text default 'CUSTOMER_APP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cibil_reports (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete cascade,
  bureau_name text,
  score integer,
  control_number text,
  report_date text,
  total_outstanding numeric(14,2) default 0,
  total_overdue numeric(14,2) default 0,
  settled_accounts_count integer default 0,
  written_off_accounts_count integer default 0,
  enquiries_count integer default 0,
  raw_report jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cibil_accounts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.cibil_reports(id) on delete cascade,
  institution text,
  account_type text,
  account_number_masked text,
  status text,
  sanctioned_amount numeric(14,2),
  current_balance numeric(14,2),
  amount_overdue numeric(14,2),
  written_off_amount numeric(14,2),
  settlement_amount numeric(14,2),
  max_dpd integer,
  opened_date text,
  closed_date text,
  last_reported_date text,
  raw_account jsonb
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete cascade,
  payment_id text,
  payment_type text,
  amount numeric(14,2) not null default 0,
  status text default 'PAID',
  created_at timestamptz not null default now()
);

create table if not exists public.loa_consents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete cascade,
  reference_number text,
  status text,
  consent_timestamp timestamptz,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.case_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete cascade,
  status text not null,
  note text,
  changed_by text,
  created_at timestamptz not null default now()
);

create index if not exists crm_leads_created_at_idx on public.crm_leads(created_at desc);
create index if not exists crm_leads_pan_idx on public.crm_leads(pan_number);
create index if not exists crm_leads_mobile_idx on public.crm_leads(mobile);
create index if not exists crm_leads_case_status_idx on public.crm_leads(case_status);

alter table public.crm_leads enable row level security;
alter table public.cibil_reports enable row level security;
alter table public.cibil_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.loa_consents enable row level security;
alter table public.case_status_history enable row level security;

-- No public policies are intentionally created. The app backend must use the
-- SUPABASE_SERVICE_ROLE_KEY server-side only. Never expose that key to Vite/browser code.
