create or replace function public.enforce_job_writer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
begin
  if not public.has_company_role(target_company_id, array['OWNER','ADMIN','OPERATIONS']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'OPERATIONS_ROLE_REQUIRED';
  end if;

  if tg_table_name = 'jobs' then
    if tg_op = 'UPDATE' and new.planned_container_count < (
      select count(*) from public.containers where job_id = new.id
    ) then
      raise exception using errcode = '23514', message = 'CONTAINER_COUNT_BELOW_ACTUAL';
    end if;
  elsif tg_table_name = 'containers' then
    if tg_op = 'INSERT' and (
      select count(*) from public.containers where job_id = new.job_id
    ) >= (
      select planned_container_count from public.jobs where id = new.job_id
    ) then
      raise exception using errcode = '23514', message = 'PLANNED_CONTAINER_COUNT_EXCEEDED';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.enforce_job_writer() from public;
