create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vendor_code text not null default ('VND-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  legal_name text not null,
  trn text,
  email text,
  phone text,
  address text,
  default_currency char(3) not null default 'AED' references public.currencies(code),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, vendor_code),
  unique (id, company_id)
);

create table public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  vendor_id uuid not null,
  job_id uuid not null,
  customer_invoice_id uuid,
  vendor_invoice_number text not null,
  bill_date date not null,
  due_date date,
  date_of_supply date,
  bl_number text,
  department text,
  remarks text,
  source_file_name text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'PAID')),
  revenue_allocated_aed numeric(18,2) not null default 0 check (revenue_allocated_aed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, vendor_id, vendor_invoice_number),
  unique (id, company_id),
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (vendor_id, company_id) references public.vendors(id, company_id),
  foreign key (job_id, company_id) references public.jobs(id, company_id),
  foreign key (customer_invoice_id, company_id) references public.invoices(id, company_id)
);

create table public.vendor_bill_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  vendor_bill_id uuid not null,
  service_id uuid,
  line_number smallint not null check (line_number > 0),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  uom text not null,
  currency_code char(3) not null references public.currencies(code),
  exchange_rate numeric(18,8) not null check (exchange_rate > 0),
  unit_rate numeric(18,2) not null check (unit_rate >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  net_amount_aed numeric(18,2) generated always as (round(quantity * unit_rate * exchange_rate, 2)) stored,
  vat_amount_aed numeric(18,2) generated always as (round(quantity * unit_rate * exchange_rate * tax_rate / 100, 2)) stored,
  total_amount_aed numeric(18,2) generated always as (round(quantity * unit_rate * exchange_rate, 2) + round(quantity * unit_rate * exchange_rate * tax_rate / 100, 2)) stored,
  created_at timestamptz not null default now(),
  unique (vendor_bill_id, line_number),
  unique (id, company_id),
  foreign key (vendor_bill_id, company_id) references public.vendor_bills(id, company_id) on delete cascade,
  foreign key (service_id, company_id) references public.services(id, company_id)
);

create index vendor_bills_company_date_idx on public.vendor_bills(company_id, bill_date desc);
create unique index vendors_company_name_idx on public.vendors(company_id, lower(legal_name));
create index vendor_bills_customer_invoice_idx on public.vendor_bills(customer_invoice_id) where customer_invoice_id is not null;
create index vendor_bill_lines_bill_idx on public.vendor_bill_lines(vendor_bill_id);

create trigger vendors_updated_at before update on public.vendors for each row execute function public.set_updated_at();
create trigger vendor_bills_updated_at before update on public.vendor_bills for each row execute function public.set_updated_at();

alter table public.vendors enable row level security;
alter table public.vendor_bills enable row level security;
alter table public.vendor_bill_lines enable row level security;

create policy vendors_read on public.vendors for select to authenticated using (public.is_company_member(company_id));
create policy vendors_insert on public.vendors for insert to authenticated with check (public.has_company_role(company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]));
create policy vendors_update on public.vendors for update to authenticated using (public.has_company_role(company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[])) with check (public.has_company_role(company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]));
create policy vendors_delete on public.vendors for delete to authenticated using (public.has_company_role(company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]));

create policy vendor_bills_read on public.vendor_bills for select to authenticated using (public.is_company_member(company_id));
create policy vendor_bill_lines_read on public.vendor_bill_lines for select to authenticated using (public.is_company_member(company_id));

grant select, insert, update, delete on public.vendors to authenticated;
grant select on public.vendor_bills, public.vendor_bill_lines to authenticated;

create or replace function public.save_vendor_bill(
  p_id uuid,
  p_vendor_id uuid,
  p_job_id uuid,
  p_customer_invoice_id uuid,
  p_vendor_invoice_number text,
  p_bill_date date,
  p_due_date date,
  p_date_of_supply date,
  p_bl_number text,
  p_department text,
  p_remarks text,
  p_source_file_name text,
  p_status text,
  p_revenue_allocated_aed numeric,
  p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid;
  v_bill_id uuid;
  v_invoice_job_id uuid;
  v_invoice_subtotal numeric;
  v_other_allocated numeric;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select company_id into v_company_id from public.jobs where id = p_job_id;
  if v_company_id is null then raise exception using errcode = 'P0002', message = 'JOB_NOT_FOUND'; end if;
  if not public.has_company_role(v_company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FINANCE_ROLE_REQUIRED';
  end if;
  if not exists (select 1 from public.vendors where id = p_vendor_id and company_id = v_company_id and active) then
    raise exception using errcode = '22023', message = 'INVALID_VENDOR';
  end if;
  if p_status not in ('DRAFT', 'APPROVED', 'PAID') then raise exception using errcode = '22023', message = 'INVALID_VENDOR_BILL_STATUS'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception using errcode = '22023', message = 'VENDOR_BILL_LINES_REQUIRED'; end if;

  if p_customer_invoice_id is not null then
    select job_id, subtotal_aed into v_invoice_job_id, v_invoice_subtotal
    from public.invoices where id = p_customer_invoice_id and company_id = v_company_id;
    if v_invoice_job_id is null or v_invoice_job_id <> p_job_id then
      raise exception using errcode = '22023', message = 'CUSTOMER_INVOICE_JOB_MISMATCH';
    end if;
    select coalesce(sum(revenue_allocated_aed), 0) into v_other_allocated
    from public.vendor_bills
    where customer_invoice_id = p_customer_invoice_id and id is distinct from p_id;
    if v_other_allocated + p_revenue_allocated_aed > v_invoice_subtotal then
      raise exception using errcode = '23514', message = 'REVENUE_ALLOCATION_EXCEEDS_INVOICE';
    end if;
  elsif p_revenue_allocated_aed <> 0 then
    raise exception using errcode = '22023', message = 'CUSTOMER_INVOICE_REQUIRED_FOR_REVENUE';
  end if;

  if p_id is null then
    insert into public.vendor_bills (
      company_id, vendor_id, job_id, customer_invoice_id, vendor_invoice_number,
      bill_date, due_date, date_of_supply, bl_number, department, remarks,
      source_file_name, status, revenue_allocated_aed
    ) values (
      v_company_id, p_vendor_id, p_job_id, p_customer_invoice_id, p_vendor_invoice_number,
      p_bill_date, p_due_date, p_date_of_supply, nullif(p_bl_number, ''), nullif(p_department, ''),
      nullif(p_remarks, ''), nullif(p_source_file_name, ''), p_status, p_revenue_allocated_aed
    ) returning id into v_bill_id;
  else
    select id into v_bill_id from public.vendor_bills where id = p_id and company_id = v_company_id for update;
    if v_bill_id is null then raise exception using errcode = 'P0002', message = 'VENDOR_BILL_NOT_FOUND'; end if;
    update public.vendor_bills set
      vendor_id = p_vendor_id, job_id = p_job_id, customer_invoice_id = p_customer_invoice_id,
      vendor_invoice_number = p_vendor_invoice_number, bill_date = p_bill_date, due_date = p_due_date,
      date_of_supply = p_date_of_supply, bl_number = nullif(p_bl_number, ''), department = nullif(p_department, ''),
      remarks = nullif(p_remarks, ''), source_file_name = nullif(p_source_file_name, ''),
      status = p_status, revenue_allocated_aed = p_revenue_allocated_aed
    where id = v_bill_id;
    delete from public.vendor_bill_lines where vendor_bill_id = v_bill_id;
  end if;

  insert into public.vendor_bill_lines (
    company_id, vendor_bill_id, service_id, line_number, description, quantity,
    uom, currency_code, exchange_rate, unit_rate, tax_rate
  )
  select
    v_company_id, v_bill_id, nullif(line->>'serviceId', '')::uuid, ordinal::smallint,
    line->>'description', (line->>'quantity')::numeric, line->>'uom', line->>'currency',
    (line->>'exchangeRate')::numeric, (line->>'unitRate')::numeric, (line->>'taxRate')::numeric
  from jsonb_array_elements(p_lines) with ordinality as item(line, ordinal);

  insert into public.audit_logs(company_id, action, entity_type, entity_id, details)
  values (v_company_id, case when p_id is null then 'VENDOR_BILL_CREATED' else 'VENDOR_BILL_UPDATED' end,
    'vendor_bill', v_bill_id, jsonb_build_object('vendorInvoiceNumber', p_vendor_invoice_number, 'customerInvoiceId', p_customer_invoice_id));
  return v_bill_id;
end;
$$;

create or replace function public.delete_vendor_bill(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.vendor_bills where id = p_id;
  if v_company_id is null then raise exception using errcode = 'P0002', message = 'VENDOR_BILL_NOT_FOUND'; end if;
  if not public.has_company_role(v_company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FINANCE_ROLE_REQUIRED';
  end if;
  delete from public.vendor_bills where id = p_id;
end;
$$;

revoke all on function public.save_vendor_bill(uuid,uuid,uuid,uuid,text,date,date,date,text,text,text,text,text,numeric,jsonb) from public;
revoke all on function public.delete_vendor_bill(uuid) from public;
grant execute on function public.save_vendor_bill(uuid,uuid,uuid,uuid,text,date,date,date,text,text,text,text,text,numeric,jsonb) to authenticated;
grant execute on function public.delete_vendor_bill(uuid) to authenticated;
