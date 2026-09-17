-- Adversarial review: preserve the identity captured at execution start and
-- serialize historical child writes with completion. Forward fix; no data edits.
create or replace function public.guard_checkflow_record_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  related_id uuid;
  execution_state public.execution_status;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'checklist_executions' then
      if (new.id,new.organization_id,new.assignment_id,new.checklist_id,new.executor_id,new.unit_id,new.created_by)
         is distinct from
         (old.id,old.organization_id,old.assignment_id,old.checklist_id,old.executor_id,old.unit_id,old.created_by) then
        raise exception 'A identidade capturada da execução é imutável';
      end if;
      return new;
    elsif tg_table_name = 'checklist_assignments' then
      if (new.id,new.organization_id,new.checklist_id,new.assigned_to,new.unit_id)
         is distinct from (old.id,old.organization_id,old.checklist_id,old.assigned_to,old.unit_id)
         and exists(select 1 from public.checklist_executions where assignment_id=old.id) then
        raise exception 'A identidade de uma atribuição iniciada é imutável';
      end if;
      return new;
    elsif tg_table_name = 'action_plans' then
      if (new.id,new.organization_id,new.non_conformity_id,new.created_by)
         is distinct from (old.id,old.organization_id,old.non_conformity_id,old.created_by) then
        raise exception 'O vínculo do plano de ação é imutável';
      end if;
    elsif tg_table_name = 'execution_answers' then
      if (new.id,new.organization_id,new.execution_id,new.item_id,new.created_by)
         is distinct from (old.id,old.organization_id,old.execution_id,old.item_id,old.created_by) then
        raise exception 'O vínculo da resposta é imutável';
      end if;
    elsif tg_table_name = 'attachments' then
      if (new.id,new.organization_id,new.execution_id,new.answer_id,new.storage_path,new.created_by)
         is distinct from (old.id,old.organization_id,old.execution_id,old.answer_id,old.storage_path,old.created_by) then
        raise exception 'O vínculo da evidência é imutável';
      end if;
    elsif tg_table_name = 'non_conformities' then
      if (new.id,new.organization_id,new.execution_id,new.answer_id,new.item_id,new.executor_id,new.created_by)
         is distinct from (old.id,old.organization_id,old.execution_id,old.answer_id,old.item_id,old.executor_id,old.created_by) then
        raise exception 'O vínculo da não conformidade é imutável';
      end if;
    end if;
  end if;

  if tg_table_name in ('checklist_executions','checklist_assignments') then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if auth.uid() is not null and not public.is_org_member(case when tg_op='DELETE' then old.organization_id else new.organization_id end) then
    raise exception 'Membro ativo obrigatório para alterar registros da execução';
  end if;
  if tg_table_name='action_plans' then
    select execution_id into related_id from public.non_conformities
    where id=case when tg_op='DELETE' then old.non_conformity_id else new.non_conformity_id end;
  else
    related_id := case when tg_op='DELETE' then old.execution_id else new.execution_id end;
  end if;
  -- NO KEY UPDATE conflicts with lifecycle UPDATE without conflicting with the
  -- FK's KEY SHARE. The lock is retained until the whole transaction finishes.
  select status into execution_state from public.checklist_executions
  where id=related_id for no key update nowait;
  if tg_table_name in ('execution_answers','attachments') and execution_state <> 'in_progress' then
    raise exception 'Respostas e evidências exigem execução em andamento';
  end if;
  return case when tg_op='DELETE' then old else new end;
exception when lock_not_available then
  raise exception using errcode='55P03',message='Execução em operação concorrente. Atualize e tente novamente.';
end $$;

do $$ declare relation_name text; begin
  foreach relation_name in array array['checklist_executions','checklist_assignments','execution_answers','attachments','non_conformities','action_plans'] loop
    execute format('create trigger aa_guard_checkflow_record_identity before insert or update or delete on public.%I for each row execute function public.guard_checkflow_record_identity()',relation_name);
  end loop;
end $$;
revoke execute on function public.guard_checkflow_record_identity() from public,anon,authenticated,service_role;

-- The RPC remains authorized by P1-04, with a trigger enforcing membership even
-- when called through SECURITY DEFINER and bypassing table RLS.
create or replace function public.guard_checkflow_evidence_object()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  object_path text;
  object_owner text;
  expected_prefix text;
  item_id uuid;
begin
  if tg_table_name='attachments' then
    object_path := new.storage_path;
    select answer.item_id into item_id from public.execution_answers answer
    where answer.id=new.answer_id and answer.execution_id=new.execution_id
      and answer.organization_id=new.organization_id;
    expected_prefix := new.organization_id::text || '/' || new.execution_id::text || '/' || item_id::text || '/';
  else
    if tg_op='INSERT' and new.correction_comment is null then return new; end if;
    if tg_op='UPDATE' and new.correction_comment is not distinct from old.correction_comment then return new; end if;
    object_path := new.correction_comment;
    expected_prefix := new.organization_id::text || '/action-plans/' || new.id::text || '/';
  end if;
  if auth.uid() is null or not public.is_org_member(new.organization_id) then
    raise exception 'Membro ativo obrigatório para vincular evidência';
  end if;
  if object_path is null or expected_prefix is null or left(object_path,length(expected_prefix))<>expected_prefix then
    raise exception 'O caminho da evidência não corresponde ao registro';
  end if;
  select owner_id into object_owner from storage.objects
  where bucket_id='checkflow-evidence' and name=object_path for update;
  if not found or object_owner is distinct from auth.uid()::text then
    raise exception 'A evidência deve existir e pertencer ao uploader autenticado';
  end if;
  return new;
end $$;
create trigger ab_guard_checkflow_evidence_object before insert on public.attachments
for each row execute function public.guard_checkflow_evidence_object();
create trigger ab_guard_checkflow_evidence_object before insert or update of correction_comment on public.action_plans
for each row execute function public.guard_checkflow_evidence_object();
revoke execute on function public.guard_checkflow_evidence_object() from public,anon,authenticated,service_role;

-- A database-only NOT EXISTS policy cannot establish atomicity with Storage's
-- physical deletion. Until end-to-end deletion/link concurrency is proven,
-- preserve uploads; orphan cleanup is an audited operator task, not client DML.
drop policy if exists checkflow_evidence_unlinked_uploader_delete on storage.objects;
