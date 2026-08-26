-- CheckFlow Start: immutable execution snapshot and post-completion record protection.
-- Execute after 202608260001_checkflow_start_p0_provisioning_storage.sql.

alter table public.checklist_executions
  add column if not exists execution_snapshot jsonb;

create or replace function public.build_execution_snapshot(execution_row public.checklist_executions)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  checklist_row public.checklists%rowtype;
  assignment_row public.checklist_assignments%rowtype;
  assignment_snapshot jsonb := null;
begin
  select * into checklist_row
  from public.checklists
  where id = execution_row.checklist_id
    and organization_id = execution_row.organization_id;

  if not found then
    raise exception 'Checklist da execução não pertence à organização';
  end if;

  if execution_row.assignment_id is not null then
    select * into assignment_row
    from public.checklist_assignments
    where id = execution_row.assignment_id
      and organization_id = execution_row.organization_id
      and checklist_id = execution_row.checklist_id;

    if not found then
      raise exception 'A atribuição da execução não pertence ao checklist';
    end if;

    assignment_snapshot := jsonb_build_object(
      'id', assignment_row.id,
      'assigned_to', assignment_row.assigned_to,
      'due_at', assignment_row.due_at,
      'recurrence', assignment_row.recurrence,
      'unit_id', assignment_row.unit_id,
      'responsible', coalesce(
        (select jsonb_build_object('id', profile.id, 'full_name', profile.full_name)
         from public.profiles profile where profile.id = assignment_row.assigned_to),
        jsonb_build_object('id', assignment_row.assigned_to, 'full_name', null)
      )
    );
  end if;

  return jsonb_build_object(
    'version', 1,
    'captured_at', now(),
    'checklist', jsonb_build_object(
      'id', checklist_row.id,
      'name', checklist_row.name,
      'description', checklist_row.description,
      'category', checklist_row.category,
      'status', checklist_row.status,
      'responsible_user_id', checklist_row.responsible_user_id,
      'responsible', coalesce(
        (select jsonb_build_object('id', profile.id, 'full_name', profile.full_name)
         from public.profiles profile where profile.id = checklist_row.responsible_user_id),
        case when checklist_row.responsible_user_id is null then null else jsonb_build_object('id', checklist_row.responsible_user_id, 'full_name', null) end
      )
    ),
    'assignment', assignment_snapshot,
    'executor', coalesce(
      (select jsonb_build_object('id', profile.id, 'full_name', profile.full_name)
       from public.profiles profile where profile.id = execution_row.executor_id),
      jsonb_build_object('id', execution_row.executor_id, 'full_name', null)
    ),
    'unit', case when execution_row.unit_id is null then null else coalesce(
      (select jsonb_build_object('id', unit.id, 'name', unit.name)
       from public.units unit
       where unit.id = execution_row.unit_id and unit.organization_id = execution_row.organization_id),
      jsonb_build_object('id', execution_row.unit_id, 'name', null)
    ) end,
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', section.id,
          'title', section.title,
          'position', section.position,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'prompt', item.prompt,
                'answer_type', item.answer_type,
                'position', item.position,
                'required', item.required,
                'allow_not_applicable', item.allow_not_applicable,
                'options', item.options,
                'nonconformity_on_no', item.nonconformity_on_no,
                'require_observation_on_failure', item.require_observation_on_failure,
                'require_photo_on_failure', item.require_photo_on_failure
              ) order by item.position, item.id
            ) from public.checklist_items item where item.section_id = section.id
          ), '[]'::jsonb)
        ) order by section.position, section.id
      ) from public.checklist_sections section where section.checklist_id = checklist_row.id
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.capture_and_protect_execution_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.execution_snapshot := public.build_execution_snapshot(new);
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'completed' then
      raise exception 'Uma execução concluída não pode ser removida';
    end if;
    return old;
  end if;

  if new.execution_snapshot is distinct from old.execution_snapshot then
    raise exception 'O snapshot da execução é imutável';
  end if;

  if old.status = 'completed'
     and (new.organization_id, new.assignment_id, new.checklist_id, new.unit_id,
          new.executor_id, new.status, new.started_at, new.paused_at, new.completed_at,
          new.conformity_percentage, new.summary, new.created_at, new.created_by)
         is distinct from
         (old.organization_id, old.assignment_id, old.checklist_id, old.unit_id,
          old.executor_id, old.status, old.started_at, old.paused_at, old.completed_at,
          old.conformity_percentage, old.summary, old.created_at, old.created_by) then
    raise exception 'Uma execução concluída é imutável';
  end if;

  return new;
end
$$;

drop trigger if exists capture_and_protect_execution_snapshot on public.checklist_executions;
create trigger capture_and_protect_execution_snapshot
before insert or update or delete on public.checklist_executions
for each row execute function public.capture_and_protect_execution_snapshot();

create or replace function public.protect_completed_execution_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_execution_id uuid;
  is_completed boolean := false;
begin
  if tg_table_name = 'action_plans' then
    select execution.id, execution.status = 'completed'
      into related_execution_id, is_completed
    from public.non_conformities occurrence
    join public.checklist_executions execution on execution.id = occurrence.execution_id
    where occurrence.id = coalesce(new.non_conformity_id, old.non_conformity_id);
  else
    related_execution_id := coalesce(new.execution_id, old.execution_id);
    select status = 'completed' into is_completed
    from public.checklist_executions where id = related_execution_id;
  end if;

  if not coalesce(is_completed, false) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name in ('execution_answers', 'attachments') then
    raise exception 'Registros da execução concluída são imutáveis';
  end if;

  if tg_table_name = 'non_conformities' then
    if tg_op <> 'UPDATE' then
      raise exception 'Não conformidades da execução concluída não podem ser adicionadas ou removidas';
    end if;
    if (new.organization_id, new.execution_id, new.answer_id, new.item_id, new.unit_id,
        new.executor_id, new.observation, new.priority, new.created_at, new.created_by)
       is distinct from
       (old.organization_id, old.execution_id, old.answer_id, old.item_id, old.unit_id,
        old.executor_id, old.observation, old.priority, old.created_at, old.created_by) then
      raise exception 'O conteúdo da não conformidade concluída é imutável';
    end if;
    return new;
  end if;

  if tg_table_name = 'action_plans' then
    if tg_op = 'DELETE' then
      raise exception 'Planos de ação de execução concluída não podem ser removidos';
    end if;
    if tg_op = 'UPDATE'
       and (new.organization_id, new.non_conformity_id, new.description,
            new.responsible_user_id, new.due_at, new.created_at, new.created_by)
           is distinct from
           (old.organization_id, old.non_conformity_id, old.description,
            old.responsible_user_id, old.due_at, old.created_at, old.created_by) then
      raise exception 'Os termos do plano de ação histórico são imutáveis';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['execution_answers', 'attachments', 'non_conformities', 'action_plans'] loop
    execute format('drop trigger if exists protect_completed_execution_records on public.%I', table_name);
    execute format('create trigger protect_completed_execution_records before insert or update or delete on public.%I for each row execute function public.protect_completed_execution_records()', table_name);
  end loop;
end
$$;
