-- Match charge deletion access to charge creation/editing access.
drop policy if exists job_charges_delete on public.job_charges;
create policy job_charges_delete on public.job_charges for delete to authenticated
using (public.has_company_role(company_id, array['OWNER','ADMIN','OPERATIONS','FINANCE']::public.company_role[]));
