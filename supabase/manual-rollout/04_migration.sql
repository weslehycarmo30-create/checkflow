-- CheckFlow P1-04: database steps for plans/NCs and photo metadata are atomic.

create unique index if not exists action_plans_one_per_non_conformity
  on public.action_plans (non_conformity_id);

create unique index if not exists attachments_storage_path_unique
  on public.attachments (storage_path);

-- A photo response has one canonical evidence record. A retry produces a new
-- object key client-side, so storage_path uniqueness alone cannot prevent a
-- duplicate database attachment.
create unique index if not exists attachments_one_per_answer
  on public.attachments (answer_id)
  where answer_id is not null;

create or replace function public.sync_checkflow_action_plan_non_conformity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.responsible_user_id, new.due_at, new.status)
         is not distinct from
         (old.responsible_user_id, old.due_at, old.status) then
    return new;
  end if;

  update public.non_conformities occurrence
     set responsible_user_id = new.responsible_user_id,
         due_at = new.due_at,
         status = new.status
   where occurrence.id = new.non_conformity_id
     and occurrence.organization_id = new.organization_id;

  if not found then
    raise exception 'O plano de ação não corresponde a uma não conformidade da organização';
  end if;

  return new;
end
$$;

drop trigger if exists sync_checkflow_action_plan_non_conformity on public.action_plans;
create trigger sync_checkflow_action_plan_non_conformity
after insert or update of responsible_user_id, due_at, status on public.action_plans
for each row execute function public.sync_checkflow_action_plan_non_conformity();

create or replace function public.record_checkflow_execution_photo_evidence(
  p_execution_id uuid,
  p_item_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_row public.checklist_executions%rowtype;
  resolved_answer_id uuid;
  resolved_attachment_id uuid;
  expected_prefix text;
begin
  select * into execution_row
  from public.checklist_executions execution
  where execution.id = p_execution_id;

  if not found or execution_row.status <> 'in_progress' then
    raise exception 'A evidência só pode ser vinculada a uma execução em andamento';
  end if;

  if auth.uid() is null
     or (execution_row.executor_id <> auth.uid()
         and not public.has_org_role(execution_row.organization_id, array['owner','manager']::public.member_role[])) then
    raise exception 'Sem permissão para vincular evidência nesta execução';
  end if;

  if not exists (
    select 1
    from public.checklist_items item
    join public.checklist_sections section on section.id = item.section_id
    where item.id = p_item_id
      and item.answer_type = 'photo'
      and section.checklist_id = execution_row.checklist_id
      and item.organization_id = execution_row.organization_id
  ) then
    raise exception 'O item de evidência não pertence à execução';
  end if;

  expected_prefix := execution_row.organization_id::text || '/' || execution_row.id::text || '/' || p_item_id::text || '/';
  if p_storage_path is null
     or left(p_storage_path, length(expected_prefix)) <> expected_prefix
     or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_size_bytes is null
     or p_size_bytes < 1
     or p_size_bytes > 10 * 1024 * 1024 then
    raise exception 'Metadados de evidência inválidos';
  end if;

  insert into public.execution_answers (
    organization_id, execution_id, item_id, value, answered_at, created_by
  ) values (
    execution_row.organization_id, execution_row.id, p_item_id,
    to_jsonb(p_storage_path), now(), auth.uid()
  )
  on conflict (execution_id, item_id) do update
    set value = excluded.value,
        answered_at = excluded.answered_at
  returning id into resolved_answer_id;

  insert into public.attachments (
    organization_id, execution_id, answer_id, storage_path, file_name,
    mime_type, size_bytes, created_by
  ) values (
    execution_row.organization_id, execution_row.id, resolved_answer_id, p_storage_path,
    p_file_name, p_mime_type, p_size_bytes, auth.uid()
  )
  on conflict (answer_id) where answer_id is not null do nothing
  returning id into resolved_attachment_id;

  if resolved_attachment_id is null then
    select attachment.id into resolved_attachment_id
    from public.attachments attachment
    where attachment.storage_path = p_storage_path
      and attachment.organization_id = execution_row.organization_id
      and attachment.execution_id = execution_row.id
      and attachment.answer_id = resolved_answer_id;
    if resolved_attachment_id is null then
      raise exception 'O caminho de evidência já pertence a outro registro';
    end if;
  end if;

  return resolved_attachment_id;
end
$$;

revoke execute on function public.sync_checkflow_action_plan_non_conformity() from public, anon, authenticated, service_role;
revoke execute on function public.record_checkflow_execution_photo_evidence(uuid, uuid, text, text, text, bigint) from public, anon, service_role;
grant execute on function public.record_checkflow_execution_photo_evidence(uuid, uuid, text, text, text, bigint) to authenticated;

-- Storage and Postgres cannot share a transaction. Permit only the uploader to
-- compensate an object that was uploaded but never linked by either workflow.
-- Linked evidence remains protected by the existing no-delete policy.
drop policy if exists checkflow_evidence_unlinked_uploader_delete on storage.objects;
create policy checkflow_evidence_unlinked_uploader_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'checkflow-evidence'
  and owner_id = auth.uid()::text
  and not exists (
    select 1 from public.attachments attachment
    where attachment.storage_path = name
  )
  and not exists (
    select 1 from public.action_plans plan
    where plan.correction_comment = name
  )
);
