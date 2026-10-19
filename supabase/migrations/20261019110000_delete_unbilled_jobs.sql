create or replace function public.delete_job(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target_company_id uuid;
  target_job_number text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select company_id, job_number
  into target_company_id, target_job_number
  from public.jobs
  where id = p_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'JOB_NOT_FOUND';
  end if;
  if not public.has_company_role(target_company_id, array['OWNER','ADMIN','OPERATIONS']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if exists (select 1 from public.invoices where job_id = p_id)
    or exists (select 1 from public.vendor_bills where job_id = p_id) then
    raise exception using errcode = '23503', message = 'JOB_HAS_FINANCIAL_RECORDS';
  end if;

  insert into public.audit_logs(company_id, action, entity_type, entity_id, details)
  values (
    target_company_id,
    'JOB_DELETED',
    'job',
    p_id,
    jsonb_build_object('jobNumber', target_job_number)
  );

  delete from public.jobs where id = p_id;
end;
$$;

revoke all on function public.delete_job(uuid) from public;
grant execute on function public.delete_job(uuid) to authenticated;
