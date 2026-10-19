-- Ocean freight is billed per planned container. Keep each invoice line
-- snapshot and its totals consistent with that container count.
create or replace function public.create_invoice_draft(p_job_id uuid, p_charge_ids uuid[]) returns uuid
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
    pod.name as pod_name,
    transshipment.name as transshipment_port_name
  into job_record
  from public.jobs job
  join public.companies company on company.id = job.company_id
  join public.branches branch on branch.id = job.branch_id
  join public.customers customer on customer.id = job.customer_id
  join public.shipments shipment on shipment.job_id = job.id
  join public.ports pol on pol.id = shipment.port_of_loading_id
  join public.ports pod on pod.id = shipment.port_of_discharge_id
  left join public.ports transshipment on transshipment.id = shipment.transshipment_port_id
  where job.id = p_job_id
  for update of job;

  if not found then
    raise exception using errcode = 'P0002', message = 'JOB_NOT_FOUND';
  end if;
  if not public.has_company_role(job_record.company_id, array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1 from public.job_charges charge
  where charge.id = any(p_charge_ids)
  order by charge.id for update;

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
    job_number_snapshot, transport_mode_snapshot, pol_snapshot, pod_snapshot, transshipment_port_snapshot,
    vessel_snapshot, voyage_snapshot, hbl_snapshot, mbl_snapshot,
    planned_container_type_snapshot, planned_container_count_snapshot, containers_snapshot
  ) values (
    job_record.company_id, job_record.branch_id, job_record.customer_id, job_record.id,
    job_record.company_name, job_record.company_trn, job_record.company_address,
    job_record.branch_code, job_record.branch_name, job_record.branch_address,
    job_record.customer_name, job_record.customer_trn, job_record.customer_address, job_record.payment_terms_days,
    job_record.job_number, job_record.transport_mode, job_record.pol_name, job_record.pod_name, job_record.transshipment_port_name,
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
      from public.containers container where container.job_id = job_record.id
    ), '[]'::jsonb)
  ) returning id into created_invoice_id;

  insert into public.invoice_lines (
    company_id, invoice_id, job_charge_id, line_number,
    service_code_snapshot, service_name_snapshot, description_snapshot,
    quantity, uom_snapshot, currency_code_snapshot, exchange_rate_snapshot, unit_rate_snapshot,
    tax_code_snapshot, tax_rate_snapshot, taxable_amount_aed, vat_amount_aed, total_amount_aed
  )
  select
    charge.company_id, created_invoice_id, charge.id,
    row_number() over (order by charge.created_at, charge.id)::smallint,
    service.code, service.name, charge.description,
    case when upper(service.code) = 'OCEAN' or lower(service.name) = 'ocean freight'
      then job_record.planned_container_count else charge.quantity end,
    case when upper(service.code) = 'OCEAN' or lower(service.name) = 'ocean freight'
      then 'CNT' else charge.uom end,
    charge.currency_code, charge.exchange_rate, charge.unit_rate,
    tax.code, tax.rate,
    case when upper(service.code) = 'OCEAN' or lower(service.name) = 'ocean freight'
      then round(job_record.planned_container_count * charge.unit_rate * charge.exchange_rate, 2)
      else charge.net_amount_aed end,
    round((case when upper(service.code) = 'OCEAN' or lower(service.name) = 'ocean freight'
      then round(job_record.planned_container_count * charge.unit_rate * charge.exchange_rate, 2)
      else charge.net_amount_aed end) * tax.rate / 100, 2),
    (case when upper(service.code) = 'OCEAN' or lower(service.name) = 'ocean freight'
      then round(job_record.planned_container_count * charge.unit_rate * charge.exchange_rate, 2)
      else charge.net_amount_aed end)
      + round((case when upper(service.code) = 'OCEAN' or lower(service.name) = 'ocean freight'
        then round(job_record.planned_container_count * charge.unit_rate * charge.exchange_rate, 2)
        else charge.net_amount_aed end) * tax.rate / 100, 2)
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
    select coalesce(sum(line.taxable_amount_aed), 0) as subtotal,
      coalesce(sum(line.vat_amount_aed), 0) as vat,
      coalesce(sum(line.total_amount_aed), 0) as total
    from public.invoice_lines line where line.invoice_id = created_invoice_id
  ) totals
  where invoice.id = created_invoice_id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (job_record.company_id, 'INVOICE_DRAFT_CREATED', 'invoice', created_invoice_id, jsonb_build_object('chargeIds', p_charge_ids));

  return created_invoice_id;
end;
$$;
