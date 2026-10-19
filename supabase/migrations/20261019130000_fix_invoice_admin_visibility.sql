-- General role checks intentionally let Operations inherit some Admin/Finance
-- capabilities. Invoice visibility needs an exact Owner/Admin role check.
create or replace function public.has_invoice_admin_visibility(target_company_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.company_members membership
    where membership.company_id = target_company_id
      and membership.user_id = auth.uid()
      and membership.active
      and membership.role in ('OWNER','ADMIN')
  );
$$;

revoke all on function public.has_invoice_admin_visibility(uuid) from public;
grant execute on function public.has_invoice_admin_visibility(uuid) to authenticated;

drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices
for select to authenticated
using (
  public.is_company_member(company_id)
  and (
    created_by = auth.uid()
    or public.has_invoice_admin_visibility(company_id)
  )
);
