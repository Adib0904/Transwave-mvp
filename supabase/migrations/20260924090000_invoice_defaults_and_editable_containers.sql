-- Use the full registered display name on new and existing invoice snapshots.
update public.companies
set legal_name = 'Transwave Shipping and Logistics LLC',
    trade_name = 'Transwave Shipping and Logistics',
    updated_at = now()
where lower(coalesce(trade_name, '')) = 'transwave'
   or lower(legal_name) in ('transwave shipping llc', 'transwave shipping and logistics llc');

alter table public.invoices disable trigger require_financial_invoice_writer;
alter table public.invoices disable trigger lock_issued_invoice;

update public.invoices invoice
set company_name_snapshot = company.legal_name,
    updated_at = now()
from public.companies company
where invoice.company_id = company.id
  and company.legal_name = 'Transwave Shipping and Logistics LLC';

alter table public.invoices enable trigger lock_issued_invoice;
alter table public.invoices enable trigger require_financial_invoice_writer;

-- The visible invoice series is company-wide. Due date is optional and must
-- remain empty unless a user explicitly enters one on the draft.
create or replace function public.issue_invoice(p_invoice_id uuid) returns text
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

  v_financial_year := extract(year from timezone('Asia/Dubai', now()))::integer;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(invoice_record.company_id::text || ':invoice:' || v_financial_year::text, 0)
  );

  insert into public.invoice_sequences (company_id, branch_id, financial_year, next_number)
  values (invoice_record.company_id, invoice_record.branch_id, v_financial_year, 100)
  on conflict do nothing;

  select greatest(
    sequence.next_number,
    coalesce((
      select max(substring(invoice.invoice_number from '/([0-9]{5})$')::integer) + 1
      from public.invoices invoice
      where invoice.company_id = invoice_record.company_id
        and invoice.invoice_number ~ ('^INV/TSW/' || v_financial_year::text || '/[0-9]{5}$')
    ), 100),
    100
  ) into allocated_number
  from public.invoice_sequences sequence
  where sequence.company_id = invoice_record.company_id
    and sequence.branch_id = invoice_record.branch_id
    and sequence.financial_year = v_financial_year
  for update;

  update public.invoice_sequences sequence set next_number = allocated_number + 1
  where sequence.company_id = invoice_record.company_id
    and sequence.branch_id = invoice_record.branch_id
    and sequence.financial_year = v_financial_year;

  issued_number := 'INV/TSW/' || v_financial_year || '/' || lpad(allocated_number::text, 5, '0');

  update public.invoices set
    status = 'ISSUED',
    invoice_number = issued_number,
    invoice_date = coalesce(invoice_record.invoice_date, current_date),
    due_date = invoice_record.due_date,
    issued_at = now()
  where id = p_invoice_id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (invoice_record.company_id, 'INVOICE_ISSUED', 'invoice', p_invoice_id, jsonb_build_object('invoiceNumber', issued_number));

  return issued_number;
end;
$$;

revoke all on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- Replace the job update function so the same edit form can reconcile the
-- complete container list. Unchanged containers retain their seal numbers.
drop function if exists public.update_job_with_details(
  uuid, uuid, uuid, public.job_status, public.transport_mode, text, integer,
  uuid, uuid, uuid, text, text, date, text, text, text, text, text, text,
  text, text, integer, text, text, numeric, numeric, numeric, text, text, uuid[]
);

create function public.update_job_with_details(
  p_job_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_status public.job_status,
  p_transport_mode public.transport_mode,
  p_planned_container_type text,
  p_planned_container_count integer,
  p_pol_id uuid,
  p_pod_id uuid,
  p_transshipment_port_id uuid,
  p_vessel text,
  p_voyage text,
  p_sailed_at date,
  p_origin_port text,
  p_place_of_delivery text,
  p_shipper text,
  p_consignee text,
  p_notify_name text,
  p_commodity text,
  p_sales_person text,
  p_customer_reference text,
  p_package_count integer,
  p_hbl text,
  p_mbl text,
  p_weight_kg numeric,
  p_volume_cbm numeric,
  p_chargeable_weight_kg numeric,
  p_customs_doc_reference text,
  p_shipment_terms text,
  p_container_numbers text[],
  p_service_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  existing_job_number text;
  v_company_id uuid;
  equipment_size smallint;
  equipment_type text;
  normalized_container_numbers text[];
begin
  select job_number, company_id into existing_job_number, v_company_id
  from public.jobs where id = p_job_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'JOB_NOT_FOUND';
  end if;

  normalized_container_numbers := coalesce(
    array(select upper(trim(number)) from unnest(p_container_numbers) number),
    array[]::text[]
  );
  if cardinality(normalized_container_numbers) > p_planned_container_count then
    raise exception using errcode = '22023', message = 'TOO_MANY_CONTAINERS';
  end if;
  if exists (select 1 from unnest(normalized_container_numbers) number where number = '')
    or (select count(distinct number) from unnest(normalized_container_numbers) number) <> cardinality(normalized_container_numbers) then
    raise exception using errcode = '22023', message = 'INVALID_CONTAINER_NUMBERS';
  end if;
  if cardinality(normalized_container_numbers) > 0 then
    if p_planned_container_type !~ '^(20|40|45)' then
      raise exception using errcode = '22023', message = 'CONTAINER_TYPE_REQUIRED';
    end if;
    equipment_size := left(p_planned_container_type, 2)::smallint;
    equipment_type := coalesce(nullif(substring(p_planned_container_type from 3), ''), 'GP');
  end if;

  delete from public.containers container
  where container.job_id = p_job_id
    and not (container.container_number = any(normalized_container_numbers));

  perform public.update_job(
    p_job_id, p_branch_id, p_customer_id, existing_job_number, p_status, p_transport_mode,
    p_planned_container_type, p_planned_container_count, p_pol_id, p_pod_id,
    p_transshipment_port_id, p_vessel, p_voyage, p_hbl, p_mbl, p_service_ids
  );

  update public.shipments set
    sailed_at = p_sailed_at,
    origin_port = nullif(trim(p_origin_port), ''),
    place_of_delivery = nullif(trim(p_place_of_delivery), ''),
    shipper = nullif(trim(p_shipper), ''),
    consignee = nullif(trim(p_consignee), ''),
    notify_name = nullif(trim(p_notify_name), ''),
    commodity = nullif(trim(p_commodity), ''),
    sales_person = nullif(trim(p_sales_person), ''),
    customer_reference = nullif(trim(p_customer_reference), ''),
    package_count = p_package_count,
    weight_kg = p_weight_kg,
    volume_cbm = p_volume_cbm,
    chargeable_weight_kg = p_chargeable_weight_kg,
    customs_doc_reference = nullif(trim(p_customs_doc_reference), ''),
    shipment_terms = nullif(trim(p_shipment_terms), '')
  where job_id = p_job_id;

  if cardinality(normalized_container_numbers) > 0 then
    update public.containers
    set size = equipment_size,
        container_type = equipment_type,
        updated_at = now()
    where job_id = p_job_id
      and container_number = any(normalized_container_numbers);

    insert into public.containers (company_id, job_id, container_number, size, container_type)
    select v_company_id, p_job_id, number, equipment_size, equipment_type
    from unnest(normalized_container_numbers) number
    where not exists (
      select 1 from public.containers existing
      where existing.job_id = p_job_id and existing.container_number = number
    );
  end if;

  return p_job_id;
end;
$$;

revoke all on function public.update_job_with_details(
  uuid, uuid, uuid, public.job_status, public.transport_mode, text, integer,
  uuid, uuid, uuid, text, text, date, text, text, text, text, text, text,
  text, text, integer, text, text, numeric, numeric, numeric, text, text,
  text[], uuid[]
) from public;
grant execute on function public.update_job_with_details(
  uuid, uuid, uuid, public.job_status, public.transport_mode, text, integer,
  uuid, uuid, uuid, text, text, date, text, text, text, text, text, text,
  text, text, integer, text, text, numeric, numeric, numeric, text, text,
  text[], uuid[]
) to authenticated;
