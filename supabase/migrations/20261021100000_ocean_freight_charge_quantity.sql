-- Ocean Freight charges use the job's planned container count as their quantity.
-- This covers both charges created from the job screen and charges copied when
-- a similar job is created.
create or replace function public.set_ocean_freight_charge_quantity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  planned_count integer;
  service_code text;
  service_name text;
begin
  select job.planned_container_count, service.code, service.name
  into planned_count, service_code, service_name
  from public.jobs job
  join public.job_services job_service
    on job_service.job_id = job.id
   and job_service.id = new.job_service_id
  join public.services service on service.id = job_service.service_id
  where job.id = new.job_id;

  if upper(coalesce(service_code, '')) = 'OCEAN'
    or lower(coalesce(service_name, '')) = 'ocean freight' then
    new.quantity := planned_count;
    new.uom := 'CNT';
  end if;

  return new;
end;
$$;

create trigger set_ocean_freight_charge_quantity
before insert or update of job_id, job_service_id, quantity, uom
on public.job_charges
for each row
execute function public.set_ocean_freight_charge_quantity();
