-- P1-04 database atomicity regression. All rows, test triggers and grants roll back.
begin;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p104-owner@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000942','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p104-manager@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000943','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p104-executor@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.organizations (id,name,created_by) values ('10000000-0000-0000-0000-000000000941','P1-04 local','00000000-0000-0000-0000-000000000941');
insert into public.organization_members (organization_id,user_id,role,active,created_by) values
  ('10000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000941','owner',true,'00000000-0000-0000-0000-000000000941'),
  ('10000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000942','manager',true,'00000000-0000-0000-0000-000000000941'),
  ('10000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943','collaborator',true,'00000000-0000-0000-0000-000000000941');
insert into public.checklists (id,organization_id,name,status,created_by) values ('20000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','P1-04 checklist','draft','00000000-0000-0000-0000-000000000941');
insert into public.checklist_sections (id,organization_id,checklist_id,title,created_by) values ('30000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','20000000-0000-0000-0000-000000000941','Fotos','00000000-0000-0000-0000-000000000941');
insert into public.checklist_items (id,organization_id,section_id,prompt,answer_type,created_by) values
  ('40000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','30000000-0000-0000-0000-000000000941','Foto principal','yes_no','00000000-0000-0000-0000-000000000941'),
  ('40000000-0000-0000-0000-000000000942','10000000-0000-0000-0000-000000000941','30000000-0000-0000-0000-000000000941','Foto que falha','yes_no','00000000-0000-0000-0000-000000000941');
insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,active,created_by) values ('50000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','20000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943',true,'00000000-0000-0000-0000-000000000942');
insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,executor_id,status,created_by) values ('60000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','50000000-0000-0000-0000-000000000941','20000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943','in_progress','00000000-0000-0000-0000-000000000943');
insert into public.execution_answers (id,organization_id,execution_id,item_id,value,created_by) values ('70000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','"Não"'::jsonb,'00000000-0000-0000-0000-000000000943');
insert into public.non_conformities (id,organization_id,execution_id,answer_id,item_id,executor_id,observation,created_by) values ('80000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000941','70000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943','Falha observada','00000000-0000-0000-0000-000000000943');


set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000943',true);
select public.record_checkflow_non_conformity('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','Retry da ocorrência');
select public.record_checkflow_non_conformity('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','Retry da ocorrência');
do $$ begin
  if (select count(*) from public.non_conformities where execution_id='60000000-0000-0000-0000-000000000941')<>1 then raise exception 'NC retry duplicated occurrence'; end if;
  if (select observation from public.execution_answers where id='70000000-0000-0000-0000-000000000941') is distinct from 'Retry da ocorrência' then raise exception 'NC answer was not synchronized'; end if;
end $$;
reset role;
create function public.release_test_nc_failure() returns trigger language plpgsql as $$ begin if new.observation='injected failure' then raise exception 'injected NC failure'; end if; return new; end $$;
create trigger release_test_nc_failure before insert on public.non_conformities for each row execute function public.release_test_nc_failure();
set local role authenticated;
do $$ begin
  begin
    perform public.record_checkflow_non_conformity('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000942','injected failure');
    raise exception 'NC injection accepted';
  exception when raise_exception then if sqlerrm<>'injected NC failure' then raise; end if; end;
  if exists(select 1 from public.execution_answers where item_id='40000000-0000-0000-0000-000000000942') then raise exception 'NC failure left partial answer'; end if;
end $$;
reset role;
update public.organization_members set active=false where user_id='00000000-0000-0000-0000-000000000943';
set local role authenticated;
do $$ begin
  begin
    perform public.record_checkflow_non_conformity('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000942','removed member');
    raise exception 'removed member NC accepted';
  exception when raise_exception then if sqlerrm<>'Sem permissão para registrar não conformidade nesta execução' then raise; end if; end;
end $$;
rollback;
