-- CheckFlow Start P0: least-privilege evidence access.
-- Execute after the three existing 202607 migrations. Forward-only.

create or replace function public.checkflow_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

create or replace function public.can_access_checkflow_evidence(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with path as (select storage.foldername(object_name) as folders)
  select exists (
    select 1
    from path
    join public.checklist_executions execution
      on execution.id = public.checkflow_uuid(path.folders[2])
     and execution.organization_id = public.checkflow_uuid(path.folders[1])
    join public.checklist_sections section
      on section.checklist_id = execution.checklist_id
    join public.checklist_items item
      on item.id = public.checkflow_uuid(path.folders[3])
     and item.section_id = section.id
    where cardinality(path.folders) = 3
      and public.is_org_member(execution.organization_id)
      and (
        public.has_org_role(execution.organization_id, array['owner','manager']::public.member_role[])
        or execution.executor_id = auth.uid()
      )
  ) or exists (
    select 1
    from path
    join public.action_plans plan
      on plan.id = public.checkflow_uuid(path.folders[3])
     and plan.organization_id = public.checkflow_uuid(path.folders[1])
    where cardinality(path.folders) = 3
      and path.folders[2] = 'action-plans'
      and public.is_org_member(plan.organization_id)
      and (
        public.has_org_role(plan.organization_id, array['owner','manager']::public.member_role[])
        or plan.responsible_user_id = auth.uid()
      )
  )
$$;

revoke all on function public.can_access_checkflow_evidence(text) from public;
grant execute on function public.can_access_checkflow_evidence(text) to authenticated;

drop policy if exists evidence_member_read on storage.objects;
drop policy if exists evidence_member_insert on storage.objects;
drop policy if exists evidence_owner_or_manager_delete on storage.objects;
drop policy if exists checkflow_evidence_authorized_read on storage.objects;
drop policy if exists checkflow_evidence_authorized_insert on storage.objects;

create policy checkflow_evidence_authorized_read
on storage.objects
for select to authenticated
using (
  bucket_id = 'checkflow-evidence'
  and public.can_access_checkflow_evidence(name)
);

create policy checkflow_evidence_authorized_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'checkflow-evidence'
  and public.can_access_checkflow_evidence(name)
);

-- Application users cannot delete evidence. This preserves the pilot record and
-- prevents an executor from deleting a photo after it has been recorded.
