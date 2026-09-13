-- Enforce least privilege at the database boundary. UI visibility is only a
-- convenience; these policies remain authoritative for API and direct REST use.

do $$
declare table_name text;
begin
  foreach table_name in array array['branches', 'tax_rates', 'services'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_company_role(company_id, array[''OWNER'',''ADMIN'']::public.company_role[]))', table_name || '_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_company_role(company_id, array[''OWNER'',''ADMIN'']::public.company_role[])) with check (public.has_company_role(company_id, array[''OWNER'',''ADMIN'']::public.company_role[]))', table_name || '_update', table_name);
  end loop;

  foreach table_name in array array['customers', 'jobs', 'shipments', 'job_services', 'containers'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''OPERATIONS'']::public.company_role[]))', table_name || '_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''OPERATIONS'']::public.company_role[])) with check (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''OPERATIONS'']::public.company_role[]))', table_name || '_update', table_name);
  end loop;

  foreach table_name in array array['job_charges', 'invoice_documents'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''FINANCE'']::public.company_role[]))', table_name || '_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''FINANCE'']::public.company_role[])) with check (public.has_company_role(company_id, array[''OWNER'',''ADMIN'',''FINANCE'']::public.company_role[]))', table_name || '_update', table_name);
  end loop;
end $$;

drop policy if exists ports_insert on public.ports;
drop policy if exists ports_update on public.ports;
create policy ports_insert on public.ports for insert to authenticated
with check (company_id is not null and public.has_company_role(company_id, array['OWNER','ADMIN']::public.company_role[]));
create policy ports_update on public.ports for update to authenticated
using (company_id is not null and public.has_company_role(company_id, array['OWNER','ADMIN']::public.company_role[]))
with check (company_id is not null and public.has_company_role(company_id, array['OWNER','ADMIN']::public.company_role[]));

drop policy if exists job_charges_delete on public.job_charges;
create policy job_charges_delete on public.job_charges for delete to authenticated
using (public.has_company_role(company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]));

-- Drafts and their lines are snapshots. They may only be written by the
-- security-definer invoice functions, never by a browser or direct REST call.
drop policy if exists invoices_insert on public.invoices;
drop policy if exists invoices_update on public.invoices;
drop policy if exists invoice_lines_insert on public.invoice_lines;
drop policy if exists invoice_lines_update on public.invoice_lines;
revoke insert, update, delete on public.invoices, public.invoice_lines from authenticated;

create or replace function public.enforce_financial_writer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
begin
  if not public.has_company_role(target_company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FINANCE_ROLE_REQUIRED';
  end if;
  if tg_table_name = 'invoices' and tg_op = 'UPDATE' and new.status = 'ISSUED' and new.total_aed <= 0 then
    raise exception using errcode = '23514', message = 'POSITIVE_INVOICE_TOTAL_REQUIRED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists require_financial_invoice_writer on public.invoices;
create trigger require_financial_invoice_writer before insert or update on public.invoices
for each row execute function public.enforce_financial_writer();
drop trigger if exists require_financial_line_writer on public.invoice_lines;
create trigger require_financial_line_writer before insert or update or delete on public.invoice_lines
for each row execute function public.enforce_financial_writer();

create or replace function public.enforce_job_writer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
begin
  if not public.has_company_role(target_company_id, array['OWNER','ADMIN','OPERATIONS']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'OPERATIONS_ROLE_REQUIRED';
  end if;
  if tg_table_name = 'jobs' and tg_op = 'UPDATE' and new.planned_container_count < (
    select count(*) from public.containers where job_id = new.id
  ) then
    raise exception using errcode = '23514', message = 'CONTAINER_COUNT_BELOW_ACTUAL';
  end if;
  if tg_table_name = 'containers' and tg_op = 'INSERT' and (
    select count(*) from public.containers where job_id = new.job_id
  ) >= (
    select planned_container_count from public.jobs where id = new.job_id
  ) then
    raise exception using errcode = '23514', message = 'PLANNED_CONTAINER_COUNT_EXCEEDED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists require_job_writer on public.jobs;
create trigger require_job_writer before insert or update on public.jobs
for each row execute function public.enforce_job_writer();
drop trigger if exists require_container_writer on public.containers;
create trigger require_container_writer before insert or update or delete on public.containers
for each row execute function public.enforce_job_writer();

-- Financial changes must be attributable without making the audit table
-- writable by application users.
create or replace function public.audit_job_charge_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  target_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (
    target_company_id,
    'JOB_CHARGE_' || tg_op,
    'job_charge',
    target_id,
    case
      when tg_op = 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else jsonb_build_object('old', to_jsonb(old))
    end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists audit_job_charge_changes on public.job_charges;
create trigger audit_job_charge_changes after insert or update or delete on public.job_charges
for each row execute function public.audit_job_charge_change();

revoke all on function public.enforce_financial_writer() from public;
revoke all on function public.enforce_job_writer() from public;
revoke all on function public.audit_job_charge_change() from public;
