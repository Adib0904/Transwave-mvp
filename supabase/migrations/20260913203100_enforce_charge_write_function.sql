-- Enforce the atomic charge workflow even on databases where the preceding
-- migration was applied before its final privilege hardening was added.
revoke insert, update on public.job_charges from authenticated;

