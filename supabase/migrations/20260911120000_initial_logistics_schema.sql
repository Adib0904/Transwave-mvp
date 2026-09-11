create extension if not exists pgcrypto;

create type public.company_role as enum ('OWNER', 'ADMIN', 'OPERATIONS', 'FINANCE', 'VIEWER');
create type public.job_status as enum ('DRAFT', 'OPEN', 'COMPLETED', 'READY_TO_INVOICE', 'CANCELLED');
create type public.invoice_status as enum ('DRAFT', 'ISSUED', 'VOID');
create type public.transport_mode as enum ('SEA', 'AIR', 'ROAD', 'MULTIMODAL');
create type public.tax_category as enum ('STANDARD', 'ZERO_RATED', 'EXEMPT', 'OUT_OF_SCOPE');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  trn text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id)
);

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.company_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  emirate text not null,
  address text,
  trn text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create table public.currencies (
  code char(3) primary key,
  name text not null,
  decimal_places smallint not null default 2 check (decimal_places between 0 and 4)
);

create table public.ports (
  id uuid primary key default gen_random_uuid(),
  un_locode char(5) unique,
  name text not null,
  country_code char(2) not null,
  emirate text,
  active boolean not null default true,
  unique (name, country_code)
);

create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  category public.tax_category not null,
  rate numeric(5,2) not null check (rate >= 0 and rate <= 100),
  effective_from date not null,
  effective_to date,
  unique (company_id, code),
  unique (id, company_id),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  default_uom text not null,
  default_currency char(3) not null references public.currencies(code),
  default_tax_rate_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (default_tax_rate_id, company_id) references public.tax_rates(id, company_id)
);

create unique index services_company_name_idx on public.services(company_id, lower(name));

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_code text not null,
  company_name text not null,
  trn text,
  email text,
  phone text,
  billing_address text,
  default_currency char(3) not null references public.currencies(code),
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, customer_code),
  unique (id, company_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  customer_id uuid not null,
  job_number text not null,
  status public.job_status not null default 'DRAFT',
  transport_mode public.transport_mode not null,
  planned_container_type text not null,
  planned_container_count integer not null check (planned_container_count > 0),
  opened_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, job_number),
  unique (id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id)
);

create table public.shipments (
  job_id uuid primary key,
  company_id uuid not null,
  port_of_loading_id uuid not null references public.ports(id),
  port_of_discharge_id uuid not null references public.ports(id),
  place_of_delivery text,
  vessel text,
  voyage text,
  hbl text,
  mbl text,
  commodity text,
  sailed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (job_id, company_id) references public.jobs(id, company_id) on delete cascade
);

create table public.job_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  job_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  unique (job_id, service_id),
  unique (id, company_id),
  foreign key (job_id, company_id) references public.jobs(id, company_id) on delete cascade,
  foreign key (service_id, company_id) references public.services(id, company_id)
);

create table public.containers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  job_id uuid not null,
  container_number text not null check (container_number ~ '^[A-Z]{4}[0-9]{7}$'),
  size smallint not null check (size in (20, 40, 45)),
  container_type text not null,
  seal_number text,
  gross_weight_kg numeric(14,3),
  package_count integer check (package_count is null or package_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, container_number),
  unique (id, company_id),
  foreign key (job_id, company_id) references public.jobs(id, company_id) on delete cascade
);

create table public.job_charges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  job_id uuid not null,
  job_service_id uuid not null,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  uom text not null,
  currency_code char(3) not null references public.currencies(code),
  exchange_rate numeric(18,8) not null check (exchange_rate > 0),
  unit_rate numeric(18,2) not null check (unit_rate >= 0),
  tax_rate_id uuid not null,
  net_amount_aed numeric(18,2) generated always as (round(quantity * unit_rate * exchange_rate, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_service_id),
  unique (id, company_id),
  foreign key (job_id, company_id) references public.jobs(id, company_id) on delete cascade,
  foreign key (job_service_id, company_id) references public.job_services(id, company_id) on delete cascade,
  foreign key (tax_rate_id, company_id) references public.tax_rates(id, company_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  branch_id uuid not null,
  customer_id uuid not null,
  job_id uuid not null,
  draft_reference text not null unique default ('DRAFT-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  invoice_number text,
  status public.invoice_status not null default 'DRAFT',
  invoice_date date,
  due_date date,
  issued_at timestamptz,
  company_name_snapshot text not null,
  company_trn_snapshot text,
  company_address_snapshot text,
  branch_code_snapshot text not null,
  branch_name_snapshot text not null,
  branch_address_snapshot text,
  customer_name_snapshot text not null,
  customer_trn_snapshot text,
  customer_address_snapshot text,
  payment_terms_days_snapshot integer not null,
  job_number_snapshot text not null,
  transport_mode_snapshot public.transport_mode not null,
  pol_snapshot text not null,
  pod_snapshot text not null,
  vessel_snapshot text,
  voyage_snapshot text,
  hbl_snapshot text,
  mbl_snapshot text,
  planned_container_type_snapshot text not null,
  planned_container_count_snapshot integer not null,
  containers_snapshot jsonb not null default '[]'::jsonb,
  subtotal_aed numeric(18,2) not null default 0,
  vat_amount_aed numeric(18,2) not null default 0,
  total_aed numeric(18,2) not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, invoice_number),
  unique (id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id),
  foreign key (job_id, company_id) references public.jobs(id, company_id),
  check ((status = 'DRAFT' and invoice_number is null and issued_at is null) or (status <> 'DRAFT' and invoice_number is not null and issued_at is not null))
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  invoice_id uuid not null,
  job_charge_id uuid not null,
  line_number smallint not null check (line_number > 0),
  service_code_snapshot text not null,
  service_name_snapshot text not null,
  description_snapshot text not null,
  quantity numeric(14,3) not null,
  uom_snapshot text not null,
  currency_code_snapshot char(3) not null,
  exchange_rate_snapshot numeric(18,8) not null,
  unit_rate_snapshot numeric(18,2) not null,
  tax_code_snapshot text not null,
  tax_rate_snapshot numeric(5,2) not null,
  taxable_amount_aed numeric(18,2) not null,
  vat_amount_aed numeric(18,2) not null,
  total_amount_aed numeric(18,2) not null,
  created_at timestamptz not null default now(),
  unique (invoice_id, line_number),
  unique (job_charge_id),
  foreign key (invoice_id, company_id) references public.invoices(id, company_id) on delete cascade,
  foreign key (job_charge_id, company_id) references public.job_charges(id, company_id)
);

create table public.invoice_sequences (
  company_id uuid not null references public.companies(id),
  branch_id uuid not null,
  financial_year integer not null,
  next_number integer not null check (next_number > 0),
  primary key (company_id, branch_id, financial_year),
  foreign key (branch_id, company_id) references public.branches(id, company_id)
);

create table public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  invoice_id uuid not null,
  storage_path text not null unique,
  document_type text not null default 'INVOICE_PDF',
  version integer not null default 1 check (version > 0),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (invoice_id, document_type, version),
  foreign key (invoice_id, company_id) references public.invoices(id, company_id) on delete cascade
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  actor_user_id uuid not null default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index jobs_company_status_idx on public.jobs(company_id, status);
create index job_charges_job_idx on public.job_charges(job_id);
create index invoices_company_status_idx on public.invoices(company_id, status, created_at desc);

create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger branches_updated_at before update on public.branches for each row execute function public.set_updated_at();
create trigger services_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger shipments_updated_at before update on public.shipments for each row execute function public.set_updated_at();
create trigger containers_updated_at before update on public.containers for each row execute function public.set_updated_at();
create trigger job_charges_updated_at before update on public.job_charges for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();

create function public.is_company_member(target_company_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members membership
    where membership.company_id = target_company_id
      and membership.user_id = auth.uid()
      and membership.active
  );
$$;

create function public.has_company_role(target_company_id uuid, allowed_roles public.company_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members membership
    where membership.company_id = target_company_id
      and membership.user_id = auth.uid()
      and membership.active
      and membership.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.has_company_role(uuid, public.company_role[]) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, public.company_role[]) to authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.branches enable row level security;
alter table public.tax_rates enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.shipments enable row level security;
alter table public.job_services enable row level security;
alter table public.containers enable row level security;
alter table public.job_charges enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.invoice_documents enable row level security;
alter table public.audit_logs enable row level security;

create policy companies_read on public.companies for select to authenticated using (public.is_company_member(id));
create policy memberships_read on public.company_members for select to authenticated using (public.is_company_member(company_id));

do $$
declare table_name text;
begin
  foreach table_name in array array['branches','tax_rates','services','customers','jobs','shipments','job_services','containers','job_charges','invoices','invoice_lines','invoice_documents'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_company_member(company_id))', table_name || '_read', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''OPERATIONS'',''FINANCE'']::public.company_role[]))', table_name || '_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''OPERATIONS'',''FINANCE'']::public.company_role[])) with check (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''OPERATIONS'',''FINANCE'']::public.company_role[]))', table_name || '_update', table_name);
  end loop;
end $$;

create policy invoice_sequences_read on public.invoice_sequences for select to authenticated using (public.is_company_member(company_id));
create policy audit_logs_read on public.audit_logs for select to authenticated using (public.is_company_member(company_id));

grant select on public.currencies, public.ports to authenticated;
grant select, insert, update on public.companies, public.company_members, public.branches, public.tax_rates, public.services, public.customers, public.jobs, public.shipments, public.job_services, public.containers, public.job_charges, public.invoices, public.invoice_lines, public.invoice_documents to authenticated;
grant select on public.audit_logs, public.invoice_sequences to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-documents', 'invoice-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy invoice_documents_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'invoice-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
);

create policy invoice_documents_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'invoice-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['OWNER','ADMIN','FINANCE']::public.company_role[]
  )
);

create function public.prevent_allocated_charge_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.invoice_lines where job_charge_id = old.id) then
    raise exception using errcode = '23503', message = 'ALLOCATED_CHARGE_LOCKED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger lock_allocated_charge before update or delete on public.job_charges
for each row execute function public.prevent_allocated_charge_mutation();

create function public.prevent_issued_invoice_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'ISSUED' then
    raise exception using errcode = '55000', message = 'ISSUED_INVOICE_LOCKED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger lock_issued_invoice before update or delete on public.invoices
for each row execute function public.prevent_issued_invoice_mutation();

create function public.prevent_issued_line_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.invoices where id = old.invoice_id and status = 'ISSUED') then
    raise exception using errcode = '55000', message = 'ISSUED_INVOICE_LOCKED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger lock_issued_invoice_line before update or delete on public.invoice_lines
for each row execute function public.prevent_issued_line_mutation();

create function public.create_invoice_draft(p_job_id uuid, p_charge_ids uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  job_record record;
  created_invoice_id uuid;
  selected_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if coalesce(cardinality(p_charge_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'CHARGES_REQUIRED';
  end if;
  if (select count(distinct charge_id) from unnest(p_charge_ids) as charge_id) <> cardinality(p_charge_ids) then
    raise exception using errcode = '22023', message = 'DUPLICATE_CHARGE_IDS';
  end if;

  select
    job.*,
    company.legal_name as company_name,
    company.trn as company_trn,
    company.address as company_address,
    branch.code as branch_code,
    branch.name as branch_name,
    branch.address as branch_address,
    customer.company_name as customer_name,
    customer.trn as customer_trn,
    customer.billing_address as customer_address,
    customer.payment_terms_days,
    shipment.vessel,
    shipment.voyage,
    shipment.hbl,
    shipment.mbl,
    pol.name as pol_name,
    pod.name as pod_name
  into job_record
  from public.jobs job
  join public.companies company on company.id = job.company_id
  join public.branches branch on branch.id = job.branch_id
  join public.customers customer on customer.id = job.customer_id
  join public.shipments shipment on shipment.job_id = job.id
  join public.ports pol on pol.id = shipment.port_of_loading_id
  join public.ports pod on pod.id = shipment.port_of_discharge_id
  where job.id = p_job_id
  for update of job;

  if not found then
    raise exception using errcode = 'P0002', message = 'JOB_NOT_FOUND';
  end if;
  if not public.has_company_role(job_record.company_id, array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.job_charges charge
  where charge.id = any(p_charge_ids)
  order by charge.id
  for update;

  select count(*) into selected_count
  from public.job_charges charge
  left join public.invoice_lines line on line.job_charge_id = charge.id
  where charge.id = any(p_charge_ids)
    and charge.job_id = p_job_id
    and charge.company_id = job_record.company_id
    and line.id is null;

  if selected_count <> cardinality(p_charge_ids) then
    raise exception using errcode = '23505', message = 'CHARGE_UNAVAILABLE';
  end if;

  insert into public.invoices (
    company_id, branch_id, customer_id, job_id,
    company_name_snapshot, company_trn_snapshot, company_address_snapshot,
    branch_code_snapshot, branch_name_snapshot, branch_address_snapshot,
    customer_name_snapshot, customer_trn_snapshot, customer_address_snapshot, payment_terms_days_snapshot,
    job_number_snapshot, transport_mode_snapshot, pol_snapshot, pod_snapshot,
    vessel_snapshot, voyage_snapshot, hbl_snapshot, mbl_snapshot,
    planned_container_type_snapshot, planned_container_count_snapshot, containers_snapshot
  ) values (
    job_record.company_id, job_record.branch_id, job_record.customer_id, job_record.id,
    job_record.company_name, job_record.company_trn, job_record.company_address,
    job_record.branch_code, job_record.branch_name, job_record.branch_address,
    job_record.customer_name, job_record.customer_trn, job_record.customer_address, job_record.payment_terms_days,
    job_record.job_number, job_record.transport_mode, job_record.pol_name, job_record.pod_name,
    job_record.vessel, job_record.voyage, job_record.hbl, job_record.mbl,
    job_record.planned_container_type, job_record.planned_container_count,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', container.id,
        'containerNumber', container.container_number,
        'size', container.size::text,
        'containerType', container.container_type,
        'sealNumber', container.seal_number
      ) order by container.container_number)
      from public.containers container
      where container.job_id = job_record.id
    ), '[]'::jsonb)
  ) returning id into created_invoice_id;

  insert into public.invoice_lines (
    company_id, invoice_id, job_charge_id, line_number,
    service_code_snapshot, service_name_snapshot, description_snapshot,
    quantity, uom_snapshot, currency_code_snapshot, exchange_rate_snapshot, unit_rate_snapshot,
    tax_code_snapshot, tax_rate_snapshot, taxable_amount_aed, vat_amount_aed, total_amount_aed
  )
  select
    charge.company_id,
    created_invoice_id,
    charge.id,
    row_number() over (order by charge.created_at, charge.id)::smallint,
    service.code,
    service.name,
    charge.description,
    charge.quantity,
    charge.uom,
    charge.currency_code,
    charge.exchange_rate,
    charge.unit_rate,
    tax.code,
    tax.rate,
    charge.net_amount_aed,
    round(charge.net_amount_aed * tax.rate / 100, 2),
    charge.net_amount_aed + round(charge.net_amount_aed * tax.rate / 100, 2)
  from public.job_charges charge
  join public.job_services job_service on job_service.id = charge.job_service_id
  join public.services service on service.id = job_service.service_id
  join public.tax_rates tax on tax.id = charge.tax_rate_id
  where charge.id = any(p_charge_ids);

  update public.invoices invoice set
    subtotal_aed = totals.subtotal,
    vat_amount_aed = totals.vat,
    total_aed = totals.total
  from (
    select
      coalesce(sum(line.taxable_amount_aed), 0) as subtotal,
      coalesce(sum(line.vat_amount_aed), 0) as vat,
      coalesce(sum(line.total_amount_aed), 0) as total
    from public.invoice_lines line
    where line.invoice_id = created_invoice_id
  ) totals
  where invoice.id = created_invoice_id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (job_record.company_id, 'INVOICE_DRAFT_CREATED', 'invoice', created_invoice_id, jsonb_build_object('chargeIds', p_charge_ids));

  return created_invoice_id;
end;
$$;

create function public.issue_invoice(p_invoice_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  invoice_record record;
  allocated_number integer;
  v_financial_year integer;
  issued_number text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select * into invoice_record from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND';
  end if;
  if not public.has_company_role(invoice_record.company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if invoice_record.status = 'ISSUED' then
    return invoice_record.invoice_number;
  end if;
  if invoice_record.status <> 'DRAFT' then
    raise exception using errcode = '55000', message = 'INVALID_INVOICE_STATUS';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice_id) then
    raise exception using errcode = '23514', message = 'INVOICE_LINES_REQUIRED';
  end if;

  v_financial_year := extract(year from current_date)::integer;
  insert into public.invoice_sequences (company_id, branch_id, financial_year, next_number)
  values (invoice_record.company_id, invoice_record.branch_id, v_financial_year, 1)
  on conflict do nothing;

  select sequence.next_number into allocated_number
  from public.invoice_sequences sequence
  where sequence.company_id = invoice_record.company_id
    and sequence.branch_id = invoice_record.branch_id
    and sequence.financial_year = v_financial_year
  for update;

  update public.invoice_sequences sequence set next_number = allocated_number + 1
  where sequence.company_id = invoice_record.company_id
    and sequence.branch_id = invoice_record.branch_id
    and sequence.financial_year = v_financial_year;

  issued_number := 'INV/' || invoice_record.branch_code_snapshot || '/' || v_financial_year || '/' || lpad(allocated_number::text, 6, '0');

  update public.invoices set
    status = 'ISSUED',
    invoice_number = issued_number,
    invoice_date = current_date,
    due_date = current_date + invoice_record.payment_terms_days_snapshot,
    issued_at = now()
  where id = p_invoice_id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (invoice_record.company_id, 'INVOICE_ISSUED', 'invoice', p_invoice_id, jsonb_build_object('invoiceNumber', issued_number));

  return issued_number;
end;
$$;

revoke all on function public.create_invoice_draft(uuid, uuid[]) from public;
revoke all on function public.issue_invoice(uuid) from public;
grant execute on function public.create_invoice_draft(uuid, uuid[]) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
