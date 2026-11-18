-- Persist internal per-container selling amounts alongside the buying and
-- commission snapshots. Customer invoice rows and PDFs remain unchanged.
alter table public.invoice_line_profit_details
  add column selling_price_per_container_aed numeric(18,2)
  check (selling_price_per_container_aed is null or selling_price_per_container_aed >= 0);

create or replace function public.save_invoice_profit_details(
  p_invoice_id uuid,
  p_agent_name text,
  p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  invoice_record record;
  item_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select id, company_id, status, invoice_number, draft_reference
    into invoice_record
    from public.invoices
    where id = p_invoice_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND';
  end if;
  if not public.has_company_role(invoice_record.company_id, array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FINANCE_ROLE_REQUIRED';
  end if;
  if invoice_record.status not in ('DRAFT', 'ISSUED') then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_STATUS';
  end if;
  if p_agent_name is not null and (length(trim(p_agent_name)) = 0 or length(trim(p_agent_name)) > 160) then
    raise exception using errcode = '22023', message = 'INVALID_AGENT_NAME';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'INVOICE_LINES_REQUIRED';
  end if;

  item_count := jsonb_array_length(p_lines);
  if item_count <> (select count(*) from public.invoice_lines where invoice_id = p_invoice_id)
    or item_count <> (select count(distinct item.invoice_line_id) from jsonb_to_recordset(p_lines) as item(invoice_line_id uuid))
    or exists (
      select 1
      from jsonb_to_recordset(p_lines) as item(
        invoice_line_id uuid,
        buying_cost_per_container_aed numeric,
        selling_price_per_container_aed numeric,
        commission_per_container_aed numeric
      )
      left join public.invoice_lines line on line.id = item.invoice_line_id and line.invoice_id = p_invoice_id
      where line.id is null
        or item.commission_per_container_aed is null
        or item.commission_per_container_aed < 0
        or (line.uom_snapshot = 'CNT' and (item.buying_cost_per_container_aed is null or item.selling_price_per_container_aed is null))
        or (item.buying_cost_per_container_aed is not null and item.buying_cost_per_container_aed < 0)
        or (item.selling_price_per_container_aed is not null and item.selling_price_per_container_aed < 0)
        or (p_agent_name is null and item.commission_per_container_aed <> 0)
    ) then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_PROFIT_DETAILS';
  end if;

  insert into public.invoice_line_profit_details (
    invoice_line_id, invoice_id, company_id, agent_name_snapshot,
    buying_cost_per_container_aed, selling_price_per_container_aed,
    commission_per_container_aed, recorded_at
  )
  select item.invoice_line_id, p_invoice_id, invoice_record.company_id,
    nullif(trim(p_agent_name), ''), item.buying_cost_per_container_aed,
    item.selling_price_per_container_aed, item.commission_per_container_aed, now()
  from jsonb_to_recordset(p_lines) as item(
    invoice_line_id uuid,
    buying_cost_per_container_aed numeric,
    selling_price_per_container_aed numeric,
    commission_per_container_aed numeric
  )
  on conflict (invoice_line_id) do update set
    invoice_id = excluded.invoice_id,
    company_id = excluded.company_id,
    agent_name_snapshot = excluded.agent_name_snapshot,
    buying_cost_per_container_aed = excluded.buying_cost_per_container_aed,
    selling_price_per_container_aed = excluded.selling_price_per_container_aed,
    commission_per_container_aed = excluded.commission_per_container_aed,
    recorded_at = excluded.recorded_at;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (
    invoice_record.company_id,
    'INVOICE_PROFIT_DETAILS_UPDATED',
    'invoice',
    p_invoice_id,
    jsonb_build_object('invoiceNumber', coalesce(invoice_record.invoice_number, invoice_record.draft_reference), 'updatedBy', auth.uid())
  );
  return p_invoice_id;
end;
$$;

revoke all on function public.save_invoice_profit_details(uuid, text, jsonb) from public;
grant execute on function public.save_invoice_profit_details(uuid, text, jsonb) to authenticated;
