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
declare
  created_job_id uuid;
  generated_job_number text;
  job_year integer := extract(year from timezone('Asia/Dubai', now()))::integer;
  next_number integer;
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

  -- Serialize allocation per company and calendar year so concurrent creates
  -- cannot receive the same human-readable job reference.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':' || job_year::text, 0)
  );
  select coalesce(max(right(job_number, 5)::integer), 0) + 1
    into next_number
    from public.jobs
    where company_id = p_company_id
      and job_number like 'JOB/' || job_year::text || '/%'
      and job_number ~ ('^JOB/' || job_year::text || '/[0-9]{5}$');
  generated_job_number := 'JOB/' || job_year::text || '/' || lpad(next_number::text, 5, '0');

  insert into public.jobs (company_id, branch_id, customer_id, job_number, status, transport_mode, planned_container_type, planned_container_count)
  values (p_company_id, p_branch_id, p_customer_id, generated_job_number, p_status, p_transport_mode, p_planned_container_type, p_planned_container_count)
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

revoke all on function public.create_job(uuid,uuid,uuid,text,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,text,text,uuid[]) from public;
grant execute on function public.create_job(uuid,uuid,uuid,text,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,text,text,uuid[]) to authenticated;
