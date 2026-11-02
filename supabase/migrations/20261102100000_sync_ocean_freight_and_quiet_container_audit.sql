-- Keep the saved Ocean Freight charge quantity in sync when a job's planned
-- container count changes. The charge trigger normalizes the quantity and UOM.
create or replace function public.sync_ocean_freight_quantity_for_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.planned_container_count is distinct from old.planned_container_count then
    update public.job_charges charge
    set quantity = new.planned_container_count,
        uom = 'CNT'
    from public.job_services job_service
    join public.services service on service.id = job_service.service_id
    where charge.job_id = new.id
      and job_service.job_id = new.id
      and charge.job_service_id = job_service.id
      and (upper(coalesce(service.code, '')) = 'OCEAN'
        or lower(coalesce(service.name, '')) = 'ocean freight')
      -- Preserve the charge backing an invoice that has already been created.
      and not exists (
        select 1
        from public.invoice_lines invoice_line
        where invoice_line.job_charge_id = charge.id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_ocean_freight_quantity_for_job on public.jobs;
create trigger sync_ocean_freight_quantity_for_job
after update of planned_container_count on public.jobs
for each row
execute function public.sync_ocean_freight_quantity_for_job();

-- Editing a container manifest can insert and delete several rows at once.
-- Those row-level audit events overwhelm the useful activity history, so stop
-- recording individual container row changes.
drop trigger if exists audit_company_record_change on public.containers;
