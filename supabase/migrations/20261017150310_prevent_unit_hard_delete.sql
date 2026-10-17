-- Units are deactivated by the application; direct API deletion would
-- detach related records through ON DELETE SET NULL foreign keys.
-- Keep read access and owner/manager insert/update access, but remove DELETE
-- from both table privileges and the broad FOR ALL RLS policy.
revoke delete on table public.units from public, anon, authenticated;

drop policy if exists org_manager_write on public.units;

create policy unit_manager_insert
on public.units
for insert
to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'manager']::public.member_role[]
  )
);

create policy unit_manager_update
on public.units
for update
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'manager']::public.member_role[]
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'manager']::public.member_role[]
  )
);
