create or replace function public.mark_invoice_paid(
  p_invoice_id uuid,
  p_payment_date date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_record record;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select id, company_id, status, payment_date
    into invoice_record
    from public.invoices
    where id = p_invoice_id
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
  if invoice_record.status <> 'ISSUED' then
    raise exception using errcode = '22023', message = 'ONLY_ISSUED_INVOICES_CAN_BE_PAID';
  end if;
  if invoice_record.payment_date is not null then
    raise exception using errcode = '22023', message = 'INVOICE_ALREADY_PAID';
  end if;
  if p_payment_date is null then
    raise exception using errcode = '22023', message = 'PAYMENT_DATE_REQUIRED';
  end if;

  perform set_config('app.invoice_edit_authorized', 'on', true);
  update public.invoices
    set payment_date = p_payment_date,
        updated_at = now()
    where id = p_invoice_id;
  perform set_config('app.invoice_edit_authorized', 'off', true);

  insert into public.audit_logs (company_id, action, entity_type, entity_id, details)
    values (
      invoice_record.company_id,
      'INVOICE_UPDATED',
      'invoice',
      p_invoice_id,
      jsonb_build_object(
        'changes', jsonb_build_object(
          'paymentDate', jsonb_build_object('before', null, 'after', p_payment_date)
        ),
        'updatedBy', auth.uid()
      )
    );

  return p_invoice_id;
exception when others then
  perform set_config('app.invoice_edit_authorized', 'off', true);
  raise;
end;
$$;

revoke all on function public.mark_invoice_paid(uuid, date) from public;
grant execute on function public.mark_invoice_paid(uuid, date) to authenticated;
