-- Accept carrier references that do not follow the ISO owner/serial format.
alter table public.containers
  drop constraint if exists containers_container_number_check;

-- The requested invoice series starts at 00100 and uses the company code TSW.
update public.invoice_sequences
set next_number = 100
where next_number < 100;

create or replace function public.issue_invoice(p_invoice_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  invoice_record record;
  allocated_number integer;
  v_financial_year integer;
  issued_number text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select * into invoice_record from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND';
  end if;
  if not public.has_company_role(invoice_record.company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if invoice_record.status = 'ISSUED' then
    return invoice_record.invoice_number;
  end if;
  if invoice_record.status <> 'DRAFT' then
    raise exception using errcode = '55000', message = 'INVALID_INVOICE_STATUS';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice_id) then
    raise exception using errcode = '23514', message = 'INVOICE_LINES_REQUIRED';
  end if;

  v_financial_year := extract(year from current_date)::integer;
  insert into public.invoice_sequences (company_id, branch_id, financial_year, next_number)
  values (invoice_record.company_id, invoice_record.branch_id, v_financial_year, 100)
  on conflict do nothing;

  select sequence.next_number into allocated_number
  from public.invoice_sequences sequence
  where sequence.company_id = invoice_record.company_id
    and sequence.branch_id = invoice_record.branch_id
    and sequence.financial_year = v_financial_year
  for update;

  update public.invoice_sequences sequence set next_number = allocated_number + 1
  where sequence.company_id = invoice_record.company_id
    and sequence.branch_id = invoice_record.branch_id
    and sequence.financial_year = v_financial_year;

  issued_number := 'INV/TSW/' || v_financial_year || '/' || lpad(allocated_number::text, 5, '0');

  update public.invoices set
    status = 'ISSUED',
    invoice_number = issued_number,
    invoice_date = current_date,
    due_date = current_date + invoice_record.payment_terms_days_snapshot,
    issued_at = now()
  where id = p_invoice_id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (invoice_record.company_id, 'INVOICE_ISSUED', 'invoice', p_invoice_id, jsonb_build_object('invoiceNumber', issued_number));

  return issued_number;
end;
$$;

revoke all on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- Operations staff enter the agreed job charges; invoice issue remains limited
-- to Finance/Admin/Owner in issue_invoice above.
create or replace function public.save_job_charge(
  p_job_id uuid,
  p_job_service_id uuid,
  p_description text,
  p_quantity numeric,
  p_uom text,
  p_currency_code text,
  p_exchange_rate numeric,
  p_unit_rate numeric,
  p_tax_rate_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid;
  v_charge_id uuid;
  v_invoice_id uuid;
  v_invoice_status public.invoice_status;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select job_service.company_id
  into v_company_id
  from public.job_services job_service
  where job_service.id = p_job_service_id
    and job_service.job_id = p_job_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'JOB_SERVICE_NOT_FOUND';
  end if;
  if not public.has_company_role(v_company_id, array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'CHARGE_ROLE_REQUIRED';
  end if;
  if p_currency_code not in ('AED', 'USD') then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_CHARGE_CURRENCY';
  end if;
  if p_exchange_rate <= 0 or (p_currency_code = 'AED' and p_exchange_rate <> 1) then
    raise exception using errcode = '22023', message = 'INVALID_EXCHANGE_RATE';
  end if;

  select charge.id, line.invoice_id, invoice.status
  into v_charge_id, v_invoice_id, v_invoice_status
  from public.job_charges charge
  left join public.invoice_lines line on line.job_charge_id = charge.id
  left join public.invoices invoice on invoice.id = line.invoice_id
  where charge.job_service_id = p_job_service_id
  for update of charge;

  if v_invoice_status = 'ISSUED' then
    raise exception using errcode = '55000', message = 'ISSUED_CHARGE_LOCKED';
  end if;

  if v_charge_id is null then
    insert into public.job_charges (
      company_id, job_id, job_service_id, description, quantity, uom,
      currency_code, exchange_rate, unit_rate, tax_rate_id
    ) values (
      v_company_id, p_job_id, p_job_service_id, p_description, p_quantity, p_uom,
      p_currency_code, p_exchange_rate, p_unit_rate, p_tax_rate_id
    ) returning id into v_charge_id;
  else
    update public.job_charges set
      description = p_description,
      quantity = p_quantity,
      uom = p_uom,
      currency_code = p_currency_code,
      exchange_rate = p_exchange_rate,
      unit_rate = p_unit_rate,
      tax_rate_id = p_tax_rate_id,
      updated_at = now()
    where id = v_charge_id;
  end if;

  if v_invoice_id is not null then
    update public.invoice_lines line set
      service_code_snapshot = service.code,
      service_name_snapshot = service.name,
      description_snapshot = charge.description,
      quantity = charge.quantity,
      uom_snapshot = charge.uom,
      currency_code_snapshot = charge.currency_code,
      exchange_rate_snapshot = charge.exchange_rate,
      unit_rate_snapshot = charge.unit_rate,
      tax_code_snapshot = tax.code,
      tax_rate_snapshot = tax.rate,
      taxable_amount_aed = charge.net_amount_aed,
      vat_amount_aed = round(charge.net_amount_aed * tax.rate / 100, 2),
      total_amount_aed = charge.net_amount_aed + round(charge.net_amount_aed * tax.rate / 100, 2)
    from public.job_charges charge
    join public.job_services job_service on job_service.id = charge.job_service_id
    join public.services service on service.id = job_service.service_id
    join public.tax_rates tax on tax.id = charge.tax_rate_id
    where line.job_charge_id = v_charge_id
      and line.invoice_id = v_invoice_id
      and charge.id = v_charge_id;

    update public.invoices invoice set
      subtotal_aed = totals.subtotal,
      vat_amount_aed = totals.vat,
      total_aed = totals.total
    from (
      select
        coalesce(sum(line.taxable_amount_aed), 0) as subtotal,
        coalesce(sum(line.vat_amount_aed), 0) as vat,
        coalesce(sum(line.total_amount_aed), 0) as total
      from public.invoice_lines line
      where line.invoice_id = v_invoice_id
    ) totals
    where invoice.id = v_invoice_id;
  end if;

  return v_charge_id;
end;
$$;

revoke all on function public.save_job_charge(uuid, uuid, text, numeric, text, text, numeric, numeric, uuid) from public;
grant execute on function public.save_job_charge(uuid, uuid, text, numeric, text, text, numeric, numeric, uuid) to authenticated;
