alter table public.invoices
  add column payment_date date;

drop function if exists public.update_invoice(
  uuid, date, date, text, text, text, text, text, jsonb
);

create function public.update_invoice(
  p_invoice_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_payment_date date,
  p_customer_name text,
  p_customer_trn text,
  p_customer_vat_number text,
  p_customer_address text,
  p_remarks text,
  p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  invoice_record record;
  input_count integer;
  existing_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select id, company_id, status into invoice_record
  from public.invoices where id = p_invoice_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND';
  end if;
  if not public.has_company_role(
    invoice_record.company_id,
    array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]
  ) then
    raise exception using errcode = '42501', message = 'FINANCE_ROLE_REQUIRED';
  end if;
  if invoice_record.status not in ('DRAFT', 'ISSUED') then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_STATUS';
  end if;
  if p_payment_date is not null and invoice_record.status <> 'ISSUED' then
    raise exception using errcode = '22023', message = 'ONLY_ISSUED_INVOICES_CAN_BE_PAID';
  end if;
  if nullif(trim(p_customer_name), '') is null then
    raise exception using errcode = '22023', message = 'CUSTOMER_NAME_REQUIRED';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'INVOICE_LINES_REQUIRED';
  end if;

  input_count := jsonb_array_length(p_lines);
  select count(*) into existing_count
  from public.invoice_lines where invoice_id = p_invoice_id;
  if input_count = 0 or input_count <> existing_count then
    raise exception using errcode = '22023', message = 'INVOICE_LINE_SET_MISMATCH';
  end if;
  if (select count(distinct item.id) from jsonb_to_recordset(p_lines) as item(id uuid)) <> input_count
    or exists (
      select 1 from jsonb_to_recordset(p_lines) as item(id uuid)
      left join public.invoice_lines line
        on line.id = item.id and line.invoice_id = p_invoice_id
      where line.id is null
    ) then
    raise exception using errcode = '22023', message = 'INVOICE_LINE_SET_MISMATCH';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as item(
      id uuid, description text, quantity numeric, uom text,
      currency text, "exchangeRate" numeric, "unitRate" numeric, "taxRateId" uuid
    )
    left join public.tax_rates tax
      on tax.id = item."taxRateId" and tax.company_id = invoice_record.company_id
    where nullif(trim(item.description), '') is null
      or nullif(trim(item.uom), '') is null
      or item.quantity <= 0
      or item."unitRate" < 0
      or item.currency not in ('AED', 'USD')
      or item."exchangeRate" <= 0
      or (item.currency = 'AED' and item."exchangeRate" <> 1)
      or tax.id is null
  ) then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_LINE';
  end if;

  perform set_config('app.invoice_edit_authorized', 'on', true);

  update public.invoices set
    invoice_date = p_invoice_date,
    due_date = p_due_date,
    payment_date = p_payment_date,
    customer_name_snapshot = trim(p_customer_name),
    customer_trn_snapshot = nullif(trim(p_customer_trn), ''),
    customer_vat_number_snapshot = nullif(trim(p_customer_vat_number), ''),
    customer_address_snapshot = nullif(trim(p_customer_address), ''),
    remarks = nullif(trim(p_remarks), ''),
    updated_at = now()
  where id = p_invoice_id;

  update public.invoice_lines line set
    description_snapshot = trim(item.description),
    quantity = item.quantity,
    uom_snapshot = case
      when upper(line.service_code_snapshot) = 'OCEAN'
        or lower(line.service_name_snapshot) = 'ocean freight' then 'CNT'
      else upper(trim(item.uom))
    end,
    currency_code_snapshot = item.currency::char(3),
    exchange_rate_snapshot = item."exchangeRate",
    unit_rate_snapshot = item."unitRate",
    tax_code_snapshot = tax.code,
    tax_rate_snapshot = tax.rate,
    taxable_amount_aed = round(item.quantity * item."unitRate" * item."exchangeRate", 2),
    vat_amount_aed = round(round(item.quantity * item."unitRate" * item."exchangeRate", 2) * tax.rate / 100, 2),
    total_amount_aed = round(item.quantity * item."unitRate" * item."exchangeRate", 2)
      + round(round(item.quantity * item."unitRate" * item."exchangeRate", 2) * tax.rate / 100, 2)
  from jsonb_to_recordset(p_lines) as item(
    id uuid, description text, quantity numeric, uom text,
    currency text, "exchangeRate" numeric, "unitRate" numeric, "taxRateId" uuid
  )
  join public.tax_rates tax
    on tax.id = item."taxRateId" and tax.company_id = invoice_record.company_id
  where line.id = item.id and line.invoice_id = p_invoice_id;

  update public.invoices invoice set
    subtotal_aed = totals.subtotal,
    vat_amount_aed = totals.vat,
    total_aed = totals.total,
    updated_at = now()
  from (
    select coalesce(sum(taxable_amount_aed), 0) subtotal,
      coalesce(sum(vat_amount_aed), 0) vat,
      coalesce(sum(total_amount_aed), 0) total
    from public.invoice_lines where invoice_id = p_invoice_id
  ) totals
  where invoice.id = p_invoice_id;

  perform set_config('app.invoice_edit_authorized', 'off', true);

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
  values (
    invoice_record.company_id,
    'INVOICE_UPDATED',
    'invoice',
    p_invoice_id,
    jsonb_build_object(
      'status', invoice_record.status,
      'paymentDate', p_payment_date,
      'updatedBy', auth.uid()
    )
  );

  return p_invoice_id;
exception when others then
  perform set_config('app.invoice_edit_authorized', 'off', true);
  raise;
end;
$$;

revoke all on function public.update_invoice(
  uuid, date, date, date, text, text, text, text, text, jsonb
) from public;
grant execute on function public.update_invoice(
  uuid, date, date, date, text, text, text, text, text, jsonb
) to authenticated;
