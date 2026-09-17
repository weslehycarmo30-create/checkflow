-- The UI previously saved an answer and then a NC in separate requests.
-- A retry could duplicate the NC; a failure left an answer without its NC.
create unique index non_conformities_one_per_answer on public.non_conformities(answer_id)
where answer_id is not null;

create or replace function public.record_checkflow_non_conformity(p_execution_id uuid,p_item_id uuid,p_observation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  execution_row public.checklist_executions%rowtype;
  answer_id_value uuid;
  occurrence_id_value uuid;
begin
  select * into execution_row from public.checklist_executions where id=p_execution_id for no key update;
  if not found or execution_row.status<>'in_progress' then raise exception 'A não conformidade exige execução em andamento'; end if;
  if auth.uid() is null or not public.is_org_member(execution_row.organization_id)
     or (execution_row.executor_id<>auth.uid() and not public.has_org_role(execution_row.organization_id,array['owner','manager']::public.member_role[])) then
    raise exception 'Sem permissão para registrar não conformidade nesta execução';
  end if;
  if nullif(btrim(p_observation),'') is null then raise exception 'A observação é obrigatória'; end if;
  if not exists(select 1 from public.checklist_items item join public.checklist_sections section on section.id=item.section_id
    where item.id=p_item_id and item.answer_type='yes_no' and item.organization_id=execution_row.organization_id
      and section.checklist_id=execution_row.checklist_id) then raise exception 'O item não corresponde à execução'; end if;

  insert into public.execution_answers(organization_id,execution_id,item_id,value,observation,is_conforming,created_by)
  values(execution_row.organization_id,p_execution_id,p_item_id,'"Não"',btrim(p_observation),false,execution_row.executor_id)
  on conflict(execution_id,item_id) do update set value=excluded.value,observation=excluded.observation,is_conforming=false,answered_at=now()
  returning id into answer_id_value;

  insert into public.non_conformities(organization_id,execution_id,answer_id,item_id,unit_id,executor_id,observation,priority,status,created_by)
  values(execution_row.organization_id,p_execution_id,answer_id_value,p_item_id,execution_row.unit_id,execution_row.executor_id,btrim(p_observation),'medium','open',auth.uid())
  on conflict(answer_id) where answer_id is not null do update set observation=excluded.observation
  returning id into occurrence_id_value;
  return occurrence_id_value;
end $$;
revoke execute on function public.record_checkflow_non_conformity(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_checkflow_non_conformity(uuid,uuid,text) to authenticated;
