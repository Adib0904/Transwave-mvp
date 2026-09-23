-- Operations is the day-to-day combined role for the current staffing model.
-- It inherits application permissions guarded by ADMIN or FINANCE, while
-- OWNER-only actions remain owner-only. Portal-user owner safeguards are also
-- enforced in the API before the service-role client changes memberships.
create or replace function public.has_company_role(
  target_company_id uuid,
  allowed_roles public.company_role[]
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.company_members membership
    where membership.company_id = target_company_id
      and membership.user_id = auth.uid()
      and membership.active
      and (
        membership.role = any(allowed_roles)
        or (
          membership.role = 'OPERATIONS'
          and allowed_roles && array['ADMIN','FINANCE']::public.company_role[]
        )
      )
  );
$$;

revoke all on function public.has_company_role(uuid, public.company_role[]) from public;
grant execute on function public.has_company_role(uuid, public.company_role[]) to authenticated;
