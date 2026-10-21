alter table public.vendor_bills
  add column payment_date date;

create or replace function public.save_vendor_bill_with_payment_date(
  p_id uuid,
  p_vendor_id uuid,
  p_job_id uuid,
  p_customer_invoice_id uuid,
  p_vendor_invoice_number text,
  p_bill_date date,
  p_due_date date,
  p_date_of_supply date,
  p_bl_number text,
  p_department text,
  p_remarks text,
  p_source_file_name text,
  p_status text,
  p_revenue_allocated_aed numeric,
  p_lines jsonb,
  p_payment_date date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_bill_id uuid;
begin
  saved_bill_id := public.save_vendor_bill(
    p_id,
    p_vendor_id,
    p_job_id,
    p_customer_invoice_id,
    p_vendor_invoice_number,
    p_bill_date,
    p_due_date,
    p_date_of_supply,
    p_bl_number,
    p_department,
    p_remarks,
    p_source_file_name,
    p_status,
    p_revenue_allocated_aed,
    p_lines
  );

  update public.vendor_bills
  set payment_date = p_payment_date
  where id = saved_bill_id;

  return saved_bill_id;
end;
$$;

revoke all on function public.save_vendor_bill_with_payment_date(
  uuid, uuid, uuid, uuid, text, date, date, date, text, text, text, text, text, numeric, jsonb, date
) from public;
grant execute on function public.save_vendor_bill_with_payment_date(
  uuid, uuid, uuid, uuid, text, date, date, date, text, text, text, text, text, numeric, jsonb, date
) to authenticated;
