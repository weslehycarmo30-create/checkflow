-- CheckFlow: reforço idempotente de isolamento e integridade do MVP.
-- Execute depois de 202607220001_base_multitenant.sql.

create or replace function public.validate_checkflow_tenant_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_org uuid;
  parent_checklist uuid;
  assignment_user uuid;
  execution_user uuid;
begin
  if tg_table_name = 'checklist_sections' then
    select organization_id into parent_org from public.checklists where id = new.checklist_id;
  elsif tg_table_name = 'checklist_items' then
    select organization_id into parent_org from public.checklist_sections where id = new.section_id;
  elsif tg_table_name = 'checklist_assignments' then
    select organization_id into parent_org from public.checklists where id = new.checklist_id;
    if not exists (
      select 1 from public.organization_members
      where organization_id = new.organization_id and user_id = new.assigned_to and active
    ) then
      raise exception 'O responsável precisa ser membro ativo da organização';
    end if;
    if new.unit_id is not null and not exists (
      select 1 from public.units where id = new.unit_id and organization_id = new.organization_id
    ) then
      raise exception 'A unidade não pertence à organização';
    end if;
  elsif tg_table_name = 'checklist_executions' then
    select organization_id into parent_org from public.checklists where id = new.checklist_id;
    if new.assignment_id is not null then
      select assigned_to into assignment_user
      from public.checklist_assignments
      where id = new.assignment_id
        and organization_id = new.organization_id
        and checklist_id = new.checklist_id
        and active;
      if assignment_user is null or assignment_user <> new.executor_id then
        raise exception 'A execução não corresponde a uma atribuição ativa do executor';
      end if;
    end if;
    if tg_op = 'UPDATE'
       and not public.has_org_role(old.organization_id, array['owner','manager']::public.member_role[])
       and (new.organization_id, new.assignment_id, new.checklist_id, new.executor_id, new.created_by)
           is distinct from
           (old.organization_id, old.assignment_id, old.checklist_id, old.executor_id, old.created_by) then
      raise exception 'Campos de identidade da execução são imutáveis';
    end if;
  elsif tg_table_name = 'execution_answers' then
    select organization_id, checklist_id, executor_id
      into parent_org, parent_checklist, execution_user
    from public.checklist_executions where id = new.execution_id;
    if not exists (
      select 1
      from public.checklist_items i
      join public.checklist_sections s on s.id = i.section_id
      where i.id = new.item_id and s.checklist_id = parent_checklist
    ) then
      raise exception 'O item não pertence ao checklist executado';
    end if;
    if tg_op = 'UPDATE'
       and not public.has_org_role(old.organization_id, array['owner','manager']::public.member_role[])
       and (new.organization_id, new.execution_id, new.item_id, new.created_by)
           is distinct from
           (old.organization_id, old.execution_id, old.item_id, old.created_by) then
      raise exception 'Campos de identidade da resposta são imutáveis';
    end if;
  elsif tg_table_name = 'attachments' then
    select organization_id into parent_org
    from public.checklist_executions where id = new.execution_id;
    if new.answer_id is not null and not exists (
      select 1 from public.execution_answers
      where id = new.answer_id and execution_id = new.execution_id and organization_id = new.organization_id
    ) then
      raise exception 'O anexo não corresponde à resposta e execução informadas';
    end if;
  elsif tg_table_name = 'non_conformities' then
    select organization_id, executor_id into parent_org, execution_user
    from public.checklist_executions where id = new.execution_id;
    if execution_user is distinct from new.executor_id then
      raise exception 'O executor da ocorrência não corresponde à execução';
    end if;
    if not exists (
      select 1 from public.execution_answers
      where id = new.answer_id and execution_id = new.execution_id and item_id = new.item_id
    ) then
      raise exception 'A ocorrência não corresponde à resposta informada';
    end if;
  elsif tg_table_name = 'action_plans' then
    select organization_id into parent_org
    from public.non_conformities where id = new.non_conformity_id;
    if new.responsible_user_id is not null and not exists (
      select 1 from public.organization_members
      where organization_id = new.organization_id and user_id = new.responsible_user_id and active
    ) then
      raise exception 'O responsável do plano precisa ser membro ativo da organização';
    end if;
  end if;

  if parent_org is null or parent_org is distinct from new.organization_id then
    raise exception 'Vínculo entre organizações inválido';
  end if;
  return new;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'checklist_sections','checklist_items','checklist_assignments',
    'checklist_executions','execution_answers','attachments',
    'non_conformities','action_plans'
  ] loop
    execute format('drop trigger if exists validate_tenant_links on public.%I', table_name);
    execute format(
      'create trigger validate_tenant_links before insert or update on public.%I for each row execute function public.validate_checkflow_tenant_links()',
      table_name
    );
  end loop;
end
$$;

-- Gestores não podem promover papéis, remover proprietários ou alterar associações.
drop policy if exists org_manager_write on public.organization_members;
drop policy if exists organization_members_owner_write on public.organization_members;
create policy organization_members_owner_write
on public.organization_members
for all
using (public.has_org_role(organization_id, array['owner']::public.member_role[]))
with check (public.has_org_role(organization_id, array['owner']::public.member_role[]));

-- Colaboradores podem operar somente as próprias execuções, sem exclusão.
drop policy if exists collaborator_execution_write on public.checklist_executions;
drop policy if exists collaborator_execution_select on public.checklist_executions;
drop policy if exists collaborator_execution_insert on public.checklist_executions;
drop policy if exists collaborator_execution_update on public.checklist_executions;
create policy collaborator_execution_select on public.checklist_executions
for select using (executor_id = auth.uid() and public.is_org_member(organization_id));
create policy collaborator_execution_insert on public.checklist_executions
for insert with check (
  executor_id = auth.uid()
  and created_by = auth.uid()
  and public.is_org_member(organization_id)
  and exists (
    select 1 from public.checklist_assignments a
    where a.id = assignment_id
      and a.organization_id = checklist_executions.organization_id
      and a.checklist_id = checklist_executions.checklist_id
      and a.assigned_to = auth.uid()
      and a.active
  )
);
create policy collaborator_execution_update on public.checklist_executions
for update
using (executor_id = auth.uid() and public.is_org_member(organization_id))
with check (executor_id = auth.uid() and created_by = auth.uid() and public.is_org_member(organization_id));

drop policy if exists collaborator_answer_write on public.execution_answers;
drop policy if exists collaborator_answer_select on public.execution_answers;
drop policy if exists collaborator_answer_insert on public.execution_answers;
drop policy if exists collaborator_answer_update on public.execution_answers;
create policy collaborator_answer_select on public.execution_answers
for select using (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.checklist_executions e
    where e.id = execution_id and e.executor_id = auth.uid()
  )
);
create policy collaborator_answer_insert on public.execution_answers
for insert with check (
  created_by = auth.uid()
  and public.is_org_member(organization_id)
  and exists (
    select 1 from public.checklist_executions e
    where e.id = execution_id and e.executor_id = auth.uid() and e.status = 'in_progress'
  )
);
create policy collaborator_answer_update on public.execution_answers
for update
using (
  created_by = auth.uid()
  and public.is_org_member(organization_id)
  and exists (
    select 1 from public.checklist_executions e
    where e.id = execution_id and e.executor_id = auth.uid() and e.status = 'in_progress'
  )
)
with check (
  created_by = auth.uid()
  and public.is_org_member(organization_id)
  and exists (
    select 1 from public.checklist_executions e
    where e.id = execution_id and e.executor_id = auth.uid() and e.status = 'in_progress'
  )
);

-- Logs de auditoria são append-only para usuários da aplicação.
drop policy if exists org_manager_write on public.audit_logs;
drop policy if exists audit_log_manager_insert on public.audit_logs;
create policy audit_log_manager_insert on public.audit_logs
for insert with check (
  actor_id = auth.uid()
  and created_by = auth.uid()
  and public.has_org_role(organization_id, array['owner','manager']::public.member_role[])
);
