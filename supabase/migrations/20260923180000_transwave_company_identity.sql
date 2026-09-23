-- Keep the registered TransWave identity consistent in company setup, branch
-- setup and historical invoice snapshots. Existing issued invoices remain
-- editable only through explicitly authorised maintenance paths.
update public.companies
set trn = '105303929100003',
    address = 'SHARJAH FREE ZONE, UAE',
    updated_at = now()
where lower(legal_name) = 'transwave shipping llc'
   or lower(coalesce(trade_name, '')) = 'transwave';

update public.branches branch
set trn = '105303929100003',
    address = 'SHARJAH FREE ZONE, UAE',
    updated_at = now()
from public.companies company
where branch.company_id = company.id
  and (lower(company.legal_name) = 'transwave shipping llc'
    or lower(coalesce(company.trade_name, '')) = 'transwave');

alter table public.invoices disable trigger require_financial_invoice_writer;
alter table public.invoices disable trigger lock_issued_invoice;

update public.invoices invoice
set company_trn_snapshot = '105303929100003',
    company_address_snapshot = 'SHARJAH FREE ZONE, UAE',
    branch_address_snapshot = 'SHARJAH FREE ZONE, UAE',
    updated_at = now()
from public.companies company
where invoice.company_id = company.id
  and (lower(company.legal_name) = 'transwave shipping llc'
    or lower(coalesce(company.trade_name, '')) = 'transwave');

alter table public.invoices enable trigger lock_issued_invoice;
alter table public.invoices enable trigger require_financial_invoice_writer;
