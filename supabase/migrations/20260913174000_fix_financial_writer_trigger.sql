create or replace function public.enforce_financial_writer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
begin
  if not public.has_company_role(target_company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FINANCE_ROLE_REQUIRED';
  end if;

  if tg_table_name = 'invoices' then
    if tg_op = 'UPDATE' and new.status = 'ISSUED' and new.total_aed <= 0 then
      raise exception using errcode = '23514', message = 'POSITIVE_INVOICE_TOTAL_REQUIRED';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.enforce_financial_writer() from public;
