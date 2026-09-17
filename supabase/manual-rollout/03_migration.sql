-- CheckFlow P1-03: execution lifecycle is a database invariant, not a UI rule.

create or replace function public.enforce_checkflow_execution_state_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'in_progress'
       or new.started_at is null
       or new.paused_at is not null
       or new.completed_at is not null
       or new.conformity_percentage is not null then
      raise exception 'Uma nova execução deve iniciar em andamento sem dados de conclusão';
    end if;
    return new;
  end if;

  if old.started_at is distinct from new.started_at then
    raise exception 'O início da execução é imutável';
  end if;

  if old.status = 'completed' then
    if (new.status, new.paused_at, new.completed_at, new.conformity_percentage, new.summary)
       is distinct from
       (old.status, old.paused_at, old.completed_at, old.conformity_percentage, old.summary) then
      raise exception 'Uma execução concluída não pode mudar de estado';
    end if;
    return new;
  end if;

  if new.status in ('pending', 'cancelled') then
    raise exception 'Estado de execução não permitido pelo fluxo operacional';
  end if;

  if old.status = 'in_progress' and new.status = 'paused' then
    if new.paused_at is null or new.completed_at is not null or new.conformity_percentage is not null then
      raise exception 'Uma pausa exige paused_at e não pode conter conclusão';
    end if;
    return new;
  end if;

  if old.status = 'paused' and new.status = 'in_progress' then
    if new.paused_at is not null or new.completed_at is not null or new.conformity_percentage is not null then
      raise exception 'Uma retomada remove paused_at e não pode conter conclusão';
    end if;
    return new;
  end if;

  if old.status = 'in_progress' and new.status = 'completed' then
    if new.paused_at is not null
       or new.completed_at is null
       or new.completed_at < new.started_at
       or new.conformity_percentage is null
       or new.conformity_percentage < 0
       or new.conformity_percentage > 100
       or jsonb_typeof(new.summary) <> 'object' then
      raise exception 'Conclusão exige timestamps e resumo compatíveis';
    end if;
    return new;
  end if;

  if old.status = new.status and new.status = 'in_progress' then
    if new.paused_at is not null or new.completed_at is not null or new.conformity_percentage is not null then
      raise exception 'Execução em andamento não pode conter dados de pausa ou conclusão';
    end if;
    return new;
  end if;

  if old.status = new.status and new.status = 'paused' then
    if new.paused_at is null or new.completed_at is not null or new.conformity_percentage is not null then
      raise exception 'Execução pausada possui campos incompatíveis';
    end if;
    return new;
  end if;

  raise exception 'Transição de execução inválida: % para %', old.status, new.status;
end
$$;

drop trigger if exists enforce_checkflow_execution_state_transition on public.checklist_executions;
create trigger enforce_checkflow_execution_state_transition
before insert or update on public.checklist_executions
for each row execute function public.enforce_checkflow_execution_state_transition();

revoke execute on function public.enforce_checkflow_execution_state_transition()
  from public, anon, authenticated, service_role;
