create index if not exists audit_logs_company_created_idx
  on public.audit_logs (company_id, created_at desc);

drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs
  for select to authenticated
  using (public.has_company_role(company_id, array['OWNER','ADMIN']::public.company_role[]));

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

create or replace function public.audit_company_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
  changed_fields jsonb;
  record_id uuid;
  record_company_id uuid;
  record_actor_id uuid := auth.uid();
  record_action text;
begin
  if tg_op = 'INSERT' then
    after_row := to_jsonb(new);
    record_id := coalesce(after_row ->> 'id', after_row ->> 'job_id')::uuid;
    record_company_id := (after_row ->> 'company_id')::uuid;
    record_action := upper(tg_table_name) || '_CREATED';
  elsif tg_op = 'DELETE' then
    before_row := to_jsonb(old);
    record_id := coalesce(before_row ->> 'id', before_row ->> 'job_id')::uuid;
    record_company_id := (before_row ->> 'company_id')::uuid;
    record_action := upper(tg_table_name) || '_DELETED';
  else
    before_row := to_jsonb(old);
    after_row := to_jsonb(new);
    record_id := coalesce(after_row ->> 'id', after_row ->> 'job_id')::uuid;
    record_company_id := (after_row ->> 'company_id')::uuid;
    select jsonb_object_agg(fields.key, jsonb_build_object(
      'before', before_row -> fields.key,
      'after', after_row -> fields.key
    ))
      into changed_fields
      from jsonb_object_keys(after_row) as fields(key)
      where fields.key not in ('id', 'company_id', 'created_at', 'updated_at')
        and before_row -> fields.key is distinct from after_row -> fields.key;
    if changed_fields is null then
      return new;
    end if;
    record_action := upper(tg_table_name) || '_UPDATED';
  end if;

  if record_company_id is null and tg_table_name = 'ports' then
    select membership.company_id into record_company_id
      from public.company_members as membership
      where membership.user_id = record_actor_id and membership.active
      limit 1;
  end if;

  if record_actor_id is not null and record_company_id is not null then
    insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, details)
    values (
      record_company_id,
      record_actor_id,
      record_action,
      tg_table_name,
      record_id,
      case tg_op
        when 'INSERT' then jsonb_build_object('after', after_row)
        when 'DELETE' then jsonb_build_object('before', before_row)
        else jsonb_build_object('changes', changed_fields)
      end
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_company_record_change() from public;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches', 'tax_rates', 'services', 'customers', 'shipments',
    'job_services', 'containers', 'vendors', 'ports', 'invoice_lines', 'vendor_bill_lines'
  ] loop
    execute format('drop trigger if exists audit_company_record_change on public.%I', table_name);
    execute format(
      'create trigger audit_company_record_change after insert or update or delete on public.%I for each row execute function public.audit_company_record_change()',
      table_name
    );
  end loop;
  execute 'drop trigger if exists audit_vendor_bill_delete on public.vendor_bills';
  execute 'create trigger audit_vendor_bill_delete after delete on public.vendor_bills for each row execute function public.audit_company_record_change()';
end $$;
