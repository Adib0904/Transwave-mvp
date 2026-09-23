insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  is_sso_user, is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'finance@transwave.local',
    extensions.crypt('Transwave123!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Finance Demo"}', now(), now(),
    '', '', '', '', false, false
  ),
  (
    '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'viewer@secondco.local',
    extensions.crypt('Secondco123!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Second Tenant"}', now(), now(),
    '', '', '', '', false, false
  )
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, id)
values
  ('finance@transwave.local', '10000000-0000-4000-8000-000000000001', '{"sub":"10000000-0000-4000-8000-000000000001","email":"finance@transwave.local"}', 'email', now(), now(), '11000000-0000-4000-8000-000000000001'),
  ('viewer@secondco.local', '10000000-0000-4000-8000-000000000002', '{"sub":"10000000-0000-4000-8000-000000000002","email":"viewer@secondco.local"}', 'email', now(), now(), '11000000-0000-4000-8000-000000000002')
on conflict (provider_id, provider) do nothing;

insert into public.companies (id, legal_name, trade_name, trn, address) values
  ('20000000-0000-4000-8000-000000000001', 'TransWave Shipping LLC', 'TransWave', '105303929100003', 'SHARJAH FREE ZONE, UAE'),
  ('20000000-0000-4000-8000-000000000002', 'Second Company LLC', 'SecondCo', '100000000000004', 'Abu Dhabi, United Arab Emirates');

insert into public.company_members (company_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ADMIN'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'VIEWER');

insert into public.branches (id, company_id, code, name, emirate, address, trn) values
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'DXB', 'Dubai', 'Dubai', 'SHARJAH FREE ZONE, UAE', '105303929100003'),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'AUH', 'Abu Dhabi', 'Abu Dhabi', 'Abu Dhabi, United Arab Emirates', '100000000000004');

insert into public.currencies (code, name, decimal_places) values
  ('AED', 'UAE Dirham', 2), ('USD', 'US Dollar', 2), ('EUR', 'Euro', 2);

insert into public.ports (id, un_locode, name, country_code, emirate) values
  ('30000000-0000-4000-8000-000000000001', 'AEJEA', 'Jebel Ali', 'AE', 'Dubai'),
  ('30000000-0000-4000-8000-000000000002', 'AEKHL', 'Khalifa Port', 'AE', 'Abu Dhabi'),
  ('30000000-0000-4000-8000-000000000003', 'INNSA', 'Nhava Sheva', 'IN', null),
  ('30000000-0000-4000-8000-000000000004', 'CNSHA', 'Shanghai', 'CN', null),
  ('30000000-0000-4000-8000-000000000005', 'SGSIN', 'Singapore', 'SG', null);

insert into public.tax_rates (id, company_id, code, category, rate, effective_from) values
  ('31000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'VAT5', 'STANDARD', 5, '2018-01-01'),
  ('31000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'ZERO', 'ZERO_RATED', 0, '2018-01-01'),
  ('31000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'VAT5', 'STANDARD', 5, '2018-01-01');

insert into public.services (id, company_id, code, name, default_uom, default_currency, default_tax_rate_id) values
  ('32000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'OCEAN', 'Ocean Freight', 'JOB', 'AED', '31000000-0000-4000-8000-000000000002'),
  ('32000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'LAND', 'Land Transport', 'CNTR', 'AED', '31000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'DOC', 'Documentation', 'JOB', 'AED', '31000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'CLR', 'Clearance', 'JOB', 'AED', '31000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'DOC', 'Documentation', 'JOB', 'AED', '31000000-0000-4000-8000-000000000003');

insert into public.customers (id, company_id, customer_code, company_name, trn, billing_address, default_currency, payment_terms_days) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CST-001', 'Shipwaves Online LLC', '100000000000010', 'Dubai, UAE', 'AED', 30),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'CST-002', 'Aash Rubber Industries LLC', '100000000000011', 'Sharjah, UAE', 'AED', 30),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'CST-003', 'Solar Chemfert Pvt Ltd', null, 'Mumbai, India', 'USD', 45),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'CST-001', 'Second Tenant Customer', null, 'Abu Dhabi, UAE', 'AED', 30);

insert into public.jobs (id, company_id, branch_id, customer_id, job_number, status, transport_mode, planned_container_type, planned_container_count) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'TW-26001', 'READY_TO_INVOICE', 'SEA', '20GP', 1),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'TW-26002', 'OPEN', 'SEA', '40HC', 2),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004', 'SC-26001', 'OPEN', 'ROAD', '20GP', 1);

insert into public.shipments (job_id, company_id, port_of_loading_id, port_of_discharge_id, transshipment_port_id, vessel, voyage, hbl, mbl) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000005', 'MSC LORENA', 'VOY-184A', 'HBL-26001', 'MBL-26001'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', null, null, null, null),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', null, null, null, null, null);

insert into public.job_services (id, company_id, job_id, service_id) values
  ('51000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002'),
  ('51000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003'),
  ('51000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000005');

insert into public.containers (id, company_id, job_id, container_number, size, container_type) values
  ('52000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'REGU5214111', 20, 'GP');

insert into public.job_charges (id, company_id, job_id, job_service_id, description, quantity, uom, currency_code, exchange_rate, unit_rate, tax_rate_id) values
  ('53000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'Land Transport', 1, 'CNTR', 'AED', 1, 3200, '31000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 'Documentation', 1, 'JOB', 'AED', 1, 150, '31000000-0000-4000-8000-000000000001');
