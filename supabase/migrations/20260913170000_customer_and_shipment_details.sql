alter table public.shipments
  add column origin_port text,
  add column shipper text,
  add column consignee text,
  add column notify_name text,
  add column sales_person text,
  add column customer_reference text,
  add column package_count integer check (package_count is null or package_count >= 0),
  add column weight_kg numeric(14,3) check (weight_kg is null or weight_kg >= 0),
  add column volume_cbm numeric(14,3) check (volume_cbm is null or volume_cbm >= 0),
  add column chargeable_weight_kg numeric(14,3) check (chargeable_weight_kg is null or chargeable_weight_kg >= 0),
  add column customs_doc_reference text,
  add column shipment_terms text;

alter table public.invoices
  add column sailed_at_snapshot date,
  add column origin_port_snapshot text,
  add column place_of_delivery_snapshot text,
  add column shipper_snapshot text,
  add column consignee_snapshot text,
  add column notify_name_snapshot text,
  add column commodity_snapshot text,
  add column sales_person_snapshot text,
  add column customer_reference_snapshot text,
  add column package_count_snapshot integer,
  add column weight_kg_snapshot numeric(14,3),
  add column volume_cbm_snapshot numeric(14,3),
  add column chargeable_weight_kg_snapshot numeric(14,3),
  add column customs_doc_reference_snapshot text,
  add column shipment_terms_snapshot text;

create or replace function public.assign_customer_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  customer_year integer := extract(year from timezone('Asia/Dubai', now()))::integer;
  next_number integer;
begin
  if nullif(trim(new.customer_code), '') is not null then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.company_id::text || ':customer:' || customer_year::text, 0)
  );
  select coalesce(max(right(customer_code, 5)::integer), 0) + 1
    into next_number
    from public.customers
    where company_id = new.company_id
      and customer_code like 'CST/' || customer_year::text || '/%'
      and customer_code ~ ('^CST/' || customer_year::text || '/[0-9]{5}$');
  new.customer_code := 'CST/' || customer_year::text || '/' || lpad(next_number::text, 5, '0');
  return new;
end;
$$;

create or replace function public.prevent_customer_number_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.customer_code is distinct from old.customer_code then
    raise exception using errcode = '55000', message = 'CUSTOMER_NUMBER_LOCKED';
  end if;
  return new;
end;
$$;

create trigger assign_customer_number before insert on public.customers
for each row execute function public.assign_customer_number();
create trigger lock_customer_number before update on public.customers
for each row execute function public.prevent_customer_number_change();

create or replace function public.create_job_with_details(
  p_company_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_status public.job_status,
  p_transport_mode public.transport_mode,
  p_planned_container_type text,
  p_planned_container_count integer,
  p_pol_id uuid,
  p_pod_id uuid,
  p_transshipment_port_id uuid,
  p_vessel text,
  p_voyage text,
  p_sailed_at date,
  p_origin_port text,
  p_place_of_delivery text,
  p_shipper text,
  p_consignee text,
  p_notify_name text,
  p_commodity text,
  p_sales_person text,
  p_customer_reference text,
  p_package_count integer,
  p_hbl text,
  p_mbl text,
  p_weight_kg numeric,
  p_volume_cbm numeric,
  p_chargeable_weight_kg numeric,
  p_customs_doc_reference text,
  p_shipment_terms text,
  p_container_numbers text[],
  p_service_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  created_job_id uuid;
  equipment_size smallint;
  equipment_type text;
begin
  if coalesce(cardinality(p_container_numbers), 0) > p_planned_container_count then
    raise exception using errcode = '22023', message = 'TOO_MANY_CONTAINERS';
  end if;
  if coalesce(cardinality(p_container_numbers), 0) > 0 then
    if p_planned_container_type !~ '^(20|40|45)' then
      raise exception using errcode = '22023', message = 'CONTAINER_TYPE_REQUIRED';
    end if;
    if exists (select 1 from unnest(p_container_numbers) number where upper(trim(number)) !~ '^[A-Z]{4}[0-9]{7}$')
      or (select count(distinct upper(trim(number))) from unnest(p_container_numbers) number) <> cardinality(p_container_numbers) then
      raise exception using errcode = '22023', message = 'INVALID_CONTAINER_NUMBERS';
    end if;
    equipment_size := left(p_planned_container_type, 2)::smallint;
    equipment_type := coalesce(nullif(substring(p_planned_container_type from 3), ''), 'GP');
  end if;

  created_job_id := public.create_job(
    p_company_id, p_branch_id, p_customer_id, '', p_status, p_transport_mode,
    p_planned_container_type, p_planned_container_count, p_pol_id, p_pod_id,
    p_transshipment_port_id, p_vessel, p_voyage, p_hbl, p_mbl, p_service_ids
  );

  update public.shipments set
    sailed_at = p_sailed_at,
    origin_port = nullif(trim(p_origin_port), ''),
    place_of_delivery = nullif(trim(p_place_of_delivery), ''),
    shipper = nullif(trim(p_shipper), ''),
    consignee = nullif(trim(p_consignee), ''),
    notify_name = nullif(trim(p_notify_name), ''),
    commodity = nullif(trim(p_commodity), ''),
    sales_person = nullif(trim(p_sales_person), ''),
    customer_reference = nullif(trim(p_customer_reference), ''),
    package_count = p_package_count,
    weight_kg = p_weight_kg,
    volume_cbm = p_volume_cbm,
    chargeable_weight_kg = p_chargeable_weight_kg,
    customs_doc_reference = nullif(trim(p_customs_doc_reference), ''),
    shipment_terms = nullif(trim(p_shipment_terms), '')
  where job_id = created_job_id;

  insert into public.containers (company_id, job_id, container_number, size, container_type)
  select p_company_id, created_job_id, upper(trim(number)), equipment_size, equipment_type
  from unnest(p_container_numbers) number;

  return created_job_id;
end;
$$;

create or replace function public.update_job_with_details(
  p_job_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_status public.job_status,
  p_transport_mode public.transport_mode,
  p_planned_container_type text,
  p_planned_container_count integer,
  p_pol_id uuid,
  p_pod_id uuid,
  p_transshipment_port_id uuid,
  p_vessel text,
  p_voyage text,
  p_sailed_at date,
  p_origin_port text,
  p_place_of_delivery text,
  p_shipper text,
  p_consignee text,
  p_notify_name text,
  p_commodity text,
  p_sales_person text,
  p_customer_reference text,
  p_package_count integer,
  p_hbl text,
  p_mbl text,
  p_weight_kg numeric,
  p_volume_cbm numeric,
  p_chargeable_weight_kg numeric,
  p_customs_doc_reference text,
  p_shipment_terms text,
  p_service_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare existing_job_number text;
begin
  select job_number into existing_job_number from public.jobs where id = p_job_id;
  perform public.update_job(
    p_job_id, p_branch_id, p_customer_id, existing_job_number, p_status, p_transport_mode,
    p_planned_container_type, p_planned_container_count, p_pol_id, p_pod_id,
    p_transshipment_port_id, p_vessel, p_voyage, p_hbl, p_mbl, p_service_ids
  );
  update public.shipments set
    sailed_at = p_sailed_at,
    origin_port = nullif(trim(p_origin_port), ''),
    place_of_delivery = nullif(trim(p_place_of_delivery), ''),
    shipper = nullif(trim(p_shipper), ''),
    consignee = nullif(trim(p_consignee), ''),
    notify_name = nullif(trim(p_notify_name), ''),
    commodity = nullif(trim(p_commodity), ''),
    sales_person = nullif(trim(p_sales_person), ''),
    customer_reference = nullif(trim(p_customer_reference), ''),
    package_count = p_package_count,
    weight_kg = p_weight_kg,
    volume_cbm = p_volume_cbm,
    chargeable_weight_kg = p_chargeable_weight_kg,
    customs_doc_reference = nullif(trim(p_customs_doc_reference), ''),
    shipment_terms = nullif(trim(p_shipment_terms), '')
  where job_id = p_job_id;
  return p_job_id;
end;
$$;

create or replace function public.populate_invoice_shipment_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare shipment_record record;
begin
  select * into shipment_record from public.shipments where job_id = new.job_id;
  new.sailed_at_snapshot := shipment_record.sailed_at;
  new.origin_port_snapshot := shipment_record.origin_port;
  new.place_of_delivery_snapshot := shipment_record.place_of_delivery;
  new.shipper_snapshot := shipment_record.shipper;
  new.consignee_snapshot := shipment_record.consignee;
  new.notify_name_snapshot := shipment_record.notify_name;
  new.commodity_snapshot := shipment_record.commodity;
  new.sales_person_snapshot := shipment_record.sales_person;
  new.customer_reference_snapshot := shipment_record.customer_reference;
  new.package_count_snapshot := shipment_record.package_count;
  new.weight_kg_snapshot := shipment_record.weight_kg;
  new.volume_cbm_snapshot := shipment_record.volume_cbm;
  new.chargeable_weight_kg_snapshot := shipment_record.chargeable_weight_kg;
  new.customs_doc_reference_snapshot := shipment_record.customs_doc_reference;
  new.shipment_terms_snapshot := shipment_record.shipment_terms;
  return new;
end;
$$;

create trigger populate_invoice_shipment_snapshot before insert on public.invoices
for each row execute function public.populate_invoice_shipment_snapshot();

revoke all on function public.assign_customer_number() from public;
revoke all on function public.prevent_customer_number_change() from public;
revoke all on function public.populate_invoice_shipment_snapshot() from public;
revoke all on function public.create_job_with_details(uuid,uuid,uuid,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,integer,text,text,numeric,numeric,numeric,text,text,text[],uuid[]) from public;
revoke all on function public.update_job_with_details(uuid,uuid,uuid,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,integer,text,text,numeric,numeric,numeric,text,text,uuid[]) from public;
grant execute on function public.create_job_with_details(uuid,uuid,uuid,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,integer,text,text,numeric,numeric,numeric,text,text,text[],uuid[]) to authenticated;
grant execute on function public.update_job_with_details(uuid,uuid,uuid,public.job_status,public.transport_mode,text,integer,uuid,uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,integer,text,text,numeric,numeric,numeric,text,text,uuid[]) to authenticated;
