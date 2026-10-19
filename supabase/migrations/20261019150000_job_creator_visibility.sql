alter table public.jobs
  add column created_by uuid default auth.uid();

create or replace function public.can_view_job(
  target_job_id uuid,
  target_company_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_company_member(target_company_id)
    and (
      public.has_invoice_admin_visibility(target_company_id)
      or exists (
        select 1
        from public.jobs job_record
        where job_record.id = target_job_id
          and job_record.company_id = target_company_id
          and job_record.created_by = auth.uid()
      )
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
