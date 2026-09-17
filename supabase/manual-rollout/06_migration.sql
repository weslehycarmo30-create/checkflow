-- Completion must describe persisted answers, never a client assertion.
-- Child writes acquire the execution lock in 202609070001.
create or replace function public.validate_checkflow_completion_answers()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  total_count integer;
  answered_count integer;
  conforming_count integer;
  missing_count integer;
begin
  if old.status <> 'in_progress' or new.status <> 'completed' then return new; end if;
  if new.execution_snapshot is null or jsonb_typeof(new.execution_snapshot->'sections') is distinct from 'array' then
    raise exception 'Conclusão exige snapshot válido';
  end if;
  with items as (
    select item from jsonb_array_elements(new.execution_snapshot->'sections') section,
      lateral jsonb_array_elements(section->'items') item
  ), answers as (
    select item, answer.id, answer.value, answer.observation,
      coalesce(answer.value is not null and answer.value not in ('null'::jsonb,'""'::jsonb),false) as answered,
      exists(select 1 from public.non_conformities nc where nc.answer_id=answer.id and nc.execution_id=new.id) as has_nc,
      exists(select 1 from public.attachments attachment where attachment.answer_id=answer.id
        and attachment.execution_id=new.id and to_jsonb(attachment.storage_path)=answer.value) as has_photo
    from items left join public.execution_answers answer
      on answer.execution_id=new.id and answer.item_id=(item->>'id')::uuid
  )
  select count(*), count(*) filter(where answered),
    count(*) filter(where case item->>'answer_type'
      when 'checkbox' then value='true'::jsonb
      when 'yes_no' then value in ('"Sim"'::jsonb,'true'::jsonb)
      else answered end),
    count(*) filter(where (coalesce((item->>'required')::boolean,false) and
      (not answered or (item->>'answer_type'='yes_no' and value in ('"Não"'::jsonb,'false'::jsonb)
        and (nullif(btrim(observation),'') is null or not has_nc))))
      or (item->>'answer_type'='photo' and answered and not has_photo))
  into total_count,answered_count,conforming_count,missing_count from answers;
  if missing_count>0 then
    raise exception 'Conclusão rejeitada: respostas obrigatórias ou evidências pendentes';
  end if;
  new.summary := jsonb_build_object('total_items',total_count,'answered_items',answered_count,'required_complete',true);
  new.conformity_percentage := case when total_count=0 then 100 else round(100.0*conforming_count/total_count,2) end;
  return new;
end $$;
-- Runs after P1-03 validates status/timestamps and before tenant validation.
create trigger validate_checkflow_completion_answers before update on public.checklist_executions
for each row execute function public.validate_checkflow_completion_answers();
revoke execute on function public.validate_checkflow_completion_answers() from public,anon,authenticated,service_role;
