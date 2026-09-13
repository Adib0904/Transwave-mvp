begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cf569dd5-0d32-4678-999e-774d9a9d35d6', true);

do $$
declare
  v_company_id constant uuid := '20000000-0000-4000-8000-000000000001';
  v_branch_id constant uuid := '21000000-0000-4000-8000-000000000001';
  v_pol_id constant uuid := '30000000-0000-4000-8000-000000000001';
  v_pod_id constant uuid := '30000000-0000-4000-8000-000000000003';
  v_service_id constant uuid := '32000000-0000-4000-8000-000000000004';
  v_customer_id uuid;
  v_job_id uuid;
  v_charge_id uuid;
  v_invoice_id uuid;
  customer_number text;
begin
  insert into public.customers (
    company_id, customer_code, company_name, trn, default_currency, payment_terms_days
  ) values (
    v_company_id, '', 'Rollback verification customer', '100000000000099', 'AED', 30
  ) returning id, customer_code into v_customer_id, customer_number;

  if customer_number !~ '^CST/[0-9]{4}/[0-9]{5}$' then
    raise exception 'Customer number was not generated: %', customer_number;
  end if;

  v_job_id := public.create_job_with_details(
    v_company_id, v_branch_id, v_customer_id, 'OPEN', 'SEA', '20SD', 1,
    v_pol_id, v_pod_id, null, 'OSHAIRIJ', '2611E', date '2026-09-10',
    'Sohar', 'Nhava Sheva', 'Rollback Shipper', 'Rollback Consignee',
    'Rollback Notify', 'General Cargo', 'Test Sales', 'CUST-REF-42', 42,
    'HBL-42', 'MBL-42', 12000.500, 28.750, 12000.500,
    'CUSTOMS-42', 'PREPAID', array['MSCU1234567'], array[v_service_id]
  );

  if not exists (
    select 1 from public.shipments
    where shipments.job_id = v_job_id and origin_port = 'Sohar' and place_of_delivery = 'Nhava Sheva'
      and package_count = 42 and weight_kg = 12000.500 and shipment_terms = 'PREPAID'
  ) then
    raise exception 'Shipment details were not persisted';
  end if;
  if (select count(*) from public.containers where containers.job_id = v_job_id) <> 1 then
    raise exception 'Initial container was not persisted';
  end if;

  insert into public.job_charges (
    company_id, job_id, job_service_id, description, quantity, uom,
    currency_code, exchange_rate, unit_rate, tax_rate_id
  ) values (
    v_company_id, v_job_id, (select id from public.job_services where job_services.job_id = v_job_id),
    'Rollback verification charge', 1, 'JOB', 'AED', 1, 100,
    (select id from public.tax_rates where tax_rates.company_id = v_company_id order by rate desc limit 1)
  ) returning id into v_charge_id;

  v_invoice_id := public.create_invoice_draft(v_job_id, array[v_charge_id]);
  if not exists (
    select 1 from public.invoices
    where invoices.id = v_invoice_id and sailed_at_snapshot = date '2026-09-10'
      and origin_port_snapshot = 'Sohar' and customer_reference_snapshot = 'CUST-REF-42'
      and package_count_snapshot = 42 and shipment_terms_snapshot = 'PREPAID'
  ) then
    raise exception 'Invoice shipment snapshot was not created';
  end if;

  raise notice 'Verified customer %, job %, invoice %', customer_number, v_job_id, v_invoice_id;
end;
$$;

rollback;
