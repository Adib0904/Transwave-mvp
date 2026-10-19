-- Owners and admins can see every invoice in their company. All other roles
-- can only see invoices they created, including the associated lines/documents.
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices
for select to authenticated
using (
  public.is_company_member(company_id)
  and (
    created_by = auth.uid()
    or public.has_company_role(company_id, array['OWNER','ADMIN']::public.company_role[])
  )
);

drop policy if exists invoice_lines_read on public.invoice_lines;
create policy invoice_lines_read on public.invoice_lines
for select to authenticated
using (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.invoices
    where invoices.id = invoice_lines.invoice_id
      and invoices.company_id = invoice_lines.company_id
  )
);

drop policy if exists invoice_documents_read on public.invoice_documents;
create policy invoice_documents_read on public.invoice_documents
for select to authenticated
using (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.invoices
    where invoices.id = invoice_documents.invoice_id
      and invoices.company_id = invoice_documents.company_id
  )
);
