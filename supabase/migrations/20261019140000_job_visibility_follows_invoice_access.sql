-- A job is visible to a non-admin only when every invoice attached to it is
-- visible to that user. Jobs without invoices remain visible to company members.
create or replace function public.can_view_job(
  target_job_id uuid,
  target_company_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_company_member(target_company_id)
    and (
      public.has_invoice_admin_visibility(target_company_id)
      or not exists (
        select 1
        from public.invoices invoice_record
        where invoice_record.job_id = target_job_id
          and invoice_record.company_id = target_company_id
          and invoice_record.created_by <> auth.uid()
      )
    );
$$;

revoke all on function public.can_view_job(uuid, uuid) from public;
grant execute on function public.can_view_job(uuid, uuid) to authenticated;

drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs
for select to authenticated
using (public.can_view_job(id, company_id));

drop policy if exists shipments_read on public.shipments;
create policy shipments_read on public.shipments
for select to authenticated
using (public.can_view_job(job_id, company_id));

drop policy if exists job_services_read on public.job_services;
create policy job_services_read on public.job_services
for select to authenticated
using (public.can_view_job(job_id, company_id));

drop policy if exists containers_read on public.containers;
create policy containers_read on public.containers
for select to authenticated
using (public.can_view_job(job_id, company_id));

drop policy if exists job_charges_read on public.job_charges;
create policy job_charges_read on public.job_charges
for select to authenticated
using (public.can_view_job(job_id, company_id));
