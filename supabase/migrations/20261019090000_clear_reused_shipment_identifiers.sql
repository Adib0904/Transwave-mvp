-- Similar jobs reuse operational details and charges, but shipment-specific
-- identifiers must be entered again for the new shipment.
create or replace function public.create_similar_job(p_source_job_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  source_record record;
  created_job_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select
    job.company_id,
    job.branch_id,
    job.customer_id,
    job.transport_mode,
    job.planned_container_type,
    job.planned_container_count,
    shipment.port_of_loading_id,
    shipment.port_of_discharge_id,
    shipment.transshipment_port_id,
    shipment.vessel,
    shipment.voyage,
    shipment.sailed_at,
    shipment.origin_port,
    shipment.place_of_delivery,
    shipment.shipper,
    shipment.consignee,
    shipment.notify_name,
    shipment.commodity,
    shipment.sales_person,
    shipment.customer_reference,
    shipment.package_count,
    shipment.weight_kg,
    shipment.volume_cbm,
    shipment.chargeable_weight_kg,
    shipment.customs_doc_reference,
    shipment.shipment_terms
  into source_record
  from public.jobs job
  join public.shipments shipment on shipment.job_id = job.id
  where job.id = p_source_job_id
  for update of job;

  if not found then
    raise exception using errcode = 'P0002', message = 'JOB_NOT_FOUND';
  end if;
  if not public.has_company_role(source_record.company_id, array['OWNER','ADMIN','OPERATIONS']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  created_job_id := public.create_job_with_details(
    source_record.company_id,
    source_record.branch_id,
    source_record.customer_id,
    'DRAFT'::public.job_status,
    source_record.transport_mode,
    source_record.planned_container_type,
    source_record.planned_container_count,
    source_record.port_of_loading_id,
    source_record.port_of_discharge_id,
    source_record.transshipment_port_id,
    source_record.vessel,
    source_record.voyage,
    source_record.sailed_at,
    source_record.origin_port,
    source_record.place_of_delivery,
    source_record.shipper,
    source_record.consignee,
    source_record.notify_name,
    source_record.commodity,
    source_record.sales_person,
    source_record.customer_reference,
    source_record.package_count,
    null,
    null,
    source_record.weight_kg,
    source_record.volume_cbm,
    source_record.chargeable_weight_kg,
    source_record.customs_doc_reference,
    source_record.shipment_terms,
    array[]::text[],
    array(
      select source_service.service_id
      from public.job_services source_service
      where source_service.job_id = p_source_job_id
      order by source_service.created_at, source_service.id
    )
  );

  insert into public.job_charges (
    company_id, job_id, job_service_id, description, quantity, uom,
    currency_code, exchange_rate, unit_rate, tax_rate_id
  )
  select
    source_charge.company_id,
    created_job_id,
    target_service.id,
    source_charge.description,
    source_charge.quantity,
    source_charge.uom,
    source_charge.currency_code,
    source_charge.exchange_rate,
    source_charge.unit_rate,
    source_charge.tax_rate_id
  from public.job_charges source_charge
  join public.job_services source_service on source_service.id = source_charge.job_service_id
  join public.job_services target_service
    on target_service.job_id = created_job_id
   and target_service.service_id = source_service.service_id
  where source_charge.job_id = p_source_job_id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (
    source_record.company_id,
    'JOB_DUPLICATED',
    'job',
    created_job_id,
    jsonb_build_object('sourceJobId', p_source_job_id)
  );

  return created_job_id;
end;
$$;

revoke all on function public.create_similar_job(uuid) from public;
grant execute on function public.create_similar_job(uuid) to authenticated;
