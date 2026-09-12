-- Company-specific ports may coexist with the shared seed catalogue.
alter table public.ports add column company_id uuid references public.companies(id) on delete cascade;
alter table public.ports drop constraint ports_un_locode_key;
alter table public.ports drop constraint ports_name_country_code_key;
create unique index ports_global_locode_idx on public.ports(un_locode) where company_id is null and un_locode is not null;
create unique index ports_company_locode_idx on public.ports(company_id, un_locode) where company_id is not null and un_locode is not null;
create unique index ports_company_name_idx on public.ports(company_id, lower(name), country_code) where company_id is not null;

alter table public.ports enable row level security;
create policy ports_read on public.ports for select to authenticated
using (company_id is null or public.is_company_member(company_id));
create policy ports_insert on public.ports for insert to authenticated
with check (company_id is not null and public.has_company_role(company_id, array['OWNER','ADMIN','OPERATIONS']::public.company_role[]));
create policy ports_update on public.ports for update to authenticated
using (company_id is not null and public.has_company_role(company_id, array['OWNER','ADMIN','OPERATIONS']::public.company_role[]))
with check (company_id is not null and public.has_company_role(company_id, array['OWNER','ADMIN','OPERATIONS']::public.company_role[]));
grant insert, update on public.ports to authenticated;

create policy containers_delete on public.containers for delete to authenticated
using (public.has_company_role(company_id, array['OWNER','ADMIN','OPERATIONS']::public.company_role[]));
create policy job_charges_delete on public.job_charges for delete to authenticated
using (public.has_company_role(company_id, array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]));
grant delete on public.containers, public.job_charges to authenticated;

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
  if (select count(*) from public.services where id = any(p_service_ids) and company_id = target_company_id and active) <> cardinality(p_service_ids) then
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

create or replace function public.update_job(
  p_job_id uuid,
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
declare target_company_id uuid;
begin
  select company_id into target_company_id from public.jobs where id = p_job_id for update;
  if target_company_id is null then raise exception using errcode = 'P0002', message = 'JOB_NOT_FOUND'; end if;
  if not public.has_company_role(target_company_id, array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_pol_id = p_pod_id or p_transshipment_port_id in (p_pol_id, p_pod_id) then
    raise exception using errcode = '22023', message = 'INVALID_ROUTE';
  end if;
  if coalesce(cardinality(p_service_ids), 0) = 0 or (select count(distinct id) from unnest(p_service_ids) id) <> cardinality(p_service_ids) then
    raise exception using errcode = '22023', message = 'INVALID_SERVICES';
  end if;
  if exists (
    select 1 from public.job_services js join public.job_charges jc on jc.job_service_id = js.id
    where js.job_id = p_job_id and not (js.service_id = any(p_service_ids))
  ) then raise exception using errcode = '23503', message = 'SERVICE_WITH_CHARGE_CANNOT_BE_REMOVED'; end if;

  update public.jobs set branch_id=p_branch_id, customer_id=p_customer_id, job_number=p_job_number,
    status=p_status, transport_mode=p_transport_mode, planned_container_type=p_planned_container_type,
    planned_container_count=p_planned_container_count where id=p_job_id;
  update public.shipments set port_of_loading_id=p_pol_id, port_of_discharge_id=p_pod_id,
    transshipment_port_id=p_transshipment_port_id, vessel=nullif(p_vessel,''), voyage=nullif(p_voyage,''),
    hbl=nullif(p_hbl,''), mbl=nullif(p_mbl,'') where job_id=p_job_id;

  delete from public.job_services where job_id=p_job_id and not (service_id = any(p_service_ids));
  insert into public.job_services(company_id, job_id, service_id)
  select target_company_id, p_job_id, id from unnest(p_service_ids) id
  on conflict(job_id, service_id) do nothing;

  insert into public.audit_logs(company_id, action, entity_type, entity_id)
  values(target_company_id, 'JOB_UPDATED', 'job', p_job_id);
  return p_job_id;
end;
$$;

revoke all on function public.create_job(uuid,uuid,uuid,text,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,text,text,uuid[]) from public;
revoke all on function public.update_job(uuid,uuid,uuid,text,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,text,text,uuid[]) from public;
grant execute on function public.create_job(uuid,uuid,uuid,text,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,text,text,uuid[]) to authenticated;
grant execute on function public.update_job(uuid,uuid,uuid,text,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,text,text,uuid[]) to authenticated;
