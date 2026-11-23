-- Buying and selling come from invoice totals; saving agent commission needs no manual cost inputs.
create or replace function public.save_invoice_profit_details_multi(
  p_invoice_id uuid,
  p_lines jsonb,
  p_agents jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  invoice_record record;
  item_count integer;
  agent_count integer;
  container_count numeric;
  commission_line_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select id, company_id, status, invoice_number, draft_reference, containers_snapshot, planned_container_count_snapshot
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
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'INVOICE_LINES_REQUIRED';
  end if;
  if p_agents is null or jsonb_typeof(p_agents) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_AGENT_COMMISSIONS';
  end if;

  item_count := jsonb_array_length(p_lines);
  agent_count := jsonb_array_length(p_agents);
  if item_count <> (select count(*) from public.invoice_lines where invoice_id = p_invoice_id)
    or item_count <> (select count(distinct item.invoice_line_id) from jsonb_to_recordset(p_lines) as item(invoice_line_id uuid))
    or exists (
      select 1
      from jsonb_to_recordset(p_lines) as item(invoice_line_id uuid, buying_cost_per_container_aed numeric, selling_price_per_container_aed numeric)
      left join public.invoice_lines line on line.id = item.invoice_line_id and line.invoice_id = p_invoice_id
      where line.id is null
        or (item.buying_cost_per_container_aed is not null and item.buying_cost_per_container_aed < 0)
        or (item.selling_price_per_container_aed is not null and item.selling_price_per_container_aed < 0)
    )
    or exists (
      select 1 from jsonb_to_recordset(p_agents) as agent(agent_name text, commission_per_container_aed numeric)
      where agent.agent_name is null or length(trim(agent.agent_name)) not between 1 and 160
        or agent.commission_per_container_aed is null or agent.commission_per_container_aed < 0
    )
    or agent_count <> (
      select count(distinct lower(trim(agent.agent_name)))
      from jsonb_to_recordset(p_agents) as agent(agent_name text, commission_per_container_aed numeric)
    ) then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_PROFIT_DETAILS';
  end if;

  -- Count the shipment once; other service quantities must not multiply commission.
  container_count := coalesce(nullif(jsonb_array_length(invoice_record.containers_snapshot), 0),
    nullif(invoice_record.planned_container_count_snapshot, 0),
    (select sum(quantity) from public.invoice_lines where invoice_id = p_invoice_id and uom_snapshot = 'CNT'), 0);
  select id into commission_line_id from public.invoice_lines where invoice_id = p_invoice_id
    order by (uom_snapshot = 'CNT') desc, line_number, id limit 1;

  insert into public.invoice_line_profit_details (
    invoice_line_id, invoice_id, company_id, agent_name_snapshot,
    buying_cost_per_container_aed, selling_price_per_container_aed,
    commission_per_container_aed, commission_quantity, recorded_at
  )
  select item.invoice_line_id, p_invoice_id, invoice_record.company_id,
    case when agent_count = 1 then (select trim(agent.agent_name) from jsonb_to_recordset(p_agents) as agent(agent_name text, commission_per_container_aed numeric) limit 1) else null end,
    item.buying_cost_per_container_aed,
    item.selling_price_per_container_aed,
    case when agent_count = 1 then (select agent.commission_per_container_aed from jsonb_to_recordset(p_agents) as agent(agent_name text, commission_per_container_aed numeric) limit 1) else 0 end,
    case when item.invoice_line_id = commission_line_id then container_count else 0 end,
    now()
  from jsonb_to_recordset(p_lines) as item(
    invoice_line_id uuid,
    buying_cost_per_container_aed numeric,
    selling_price_per_container_aed numeric
  )
  on conflict (invoice_line_id) do update set
    invoice_id = excluded.invoice_id,
    company_id = excluded.company_id,
    agent_name_snapshot = excluded.agent_name_snapshot,
    buying_cost_per_container_aed = excluded.buying_cost_per_container_aed,
    selling_price_per_container_aed = excluded.selling_price_per_container_aed,
    commission_per_container_aed = excluded.commission_per_container_aed,
    commission_quantity = excluded.commission_quantity,
    recorded_at = excluded.recorded_at;

  delete from public.invoice_line_agent_commissions where invoice_id = p_invoice_id;
  insert into public.invoice_line_agent_commissions (
    invoice_line_id, invoice_id, company_id, agent_name_snapshot, commission_per_container_aed, recorded_at
  )
  select line.id, p_invoice_id, invoice_record.company_id, trim(agent.agent_name), agent.commission_per_container_aed, now()
  from public.invoice_lines line
  cross join jsonb_to_recordset(p_agents) as agent(agent_name text, commission_per_container_aed numeric)
  where line.invoice_id = p_invoice_id and line.id = commission_line_id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (
    invoice_record.company_id,
    'INVOICE_PROFIT_DETAILS_UPDATED',
    'invoice',
    p_invoice_id,
    jsonb_build_object(
      'invoiceNumber', coalesce(invoice_record.invoice_number, invoice_record.draft_reference),
      'agentNames', (select coalesce(jsonb_agg(trim(agent.agent_name)), '[]'::jsonb) from jsonb_to_recordset(p_agents) as agent(agent_name text, commission_per_container_aed numeric)),
      'updatedBy', auth.uid()
    )
  );
  return p_invoice_id;
end;
$$;

revoke all on function public.save_invoice_profit_details_multi(uuid, jsonb, jsonb) from public;
grant execute on function public.save_invoice_profit_details_multi(uuid, jsonb, jsonb) to authenticated;
