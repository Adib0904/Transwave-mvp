create or replace function public.create_job(
  p_company_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_job_number text,
  p_status public.job_status,
  p_transport_mode public.transport_mode,
  p_planned_container_type text,
  p_planned_container_count integer,
  p_pol_id uuid,
  p_pod_id uuid,
  p_transshipment_port_id uuid,
  p_vessel text,
  p_voyage text,
  p_hbl text,
  p_mbl text,
  p_service_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare created_job_id uuid;
begin
  if not public.has_company_role(p_company_id, array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_pol_id = p_pod_id or p_transshipment_port_id in (p_pol_id, p_pod_id) then
    raise exception using errcode = '22023', message = 'INVALID_ROUTE';
  end if;
  if coalesce(cardinality(p_service_ids), 0) = 0 or (select count(distinct id) from unnest(p_service_ids) id) <> cardinality(p_service_ids) then
    raise exception using errcode = '22023', message = 'INVALID_SERVICES';
  end if;
  if (select count(*) from public.services where id = any(p_service_ids) and company_id = p_company_id and active) <> cardinality(p_service_ids) then
    raise exception using errcode = '22023', message = 'INVALID_SERVICES';
  end if;

  insert into public.jobs (company_id, branch_id, customer_id, job_number, status, transport_mode, planned_container_type, planned_container_count)
  values (p_company_id, p_branch_id, p_customer_id, p_job_number, p_status, p_transport_mode, p_planned_container_type, p_planned_container_count)
  returning id into created_job_id;

  insert into public.shipments (job_id, company_id, port_of_loading_id, port_of_discharge_id, transshipment_port_id, vessel, voyage, hbl, mbl)
  values (created_job_id, p_company_id, p_pol_id, p_pod_id, p_transshipment_port_id, nullif(p_vessel, ''), nullif(p_voyage, ''), nullif(p_hbl, ''), nullif(p_mbl, ''));

  insert into public.job_services (company_id, job_id, service_id)
  select p_company_id, created_job_id, id from unnest(p_service_ids) id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id)
  values (p_company_id, 'JOB_CREATED', 'job', created_job_id);
  return created_job_id;
end;
$$;
