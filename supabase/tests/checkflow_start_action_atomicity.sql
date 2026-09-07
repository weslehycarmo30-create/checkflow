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
  ('40000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','30000000-0000-0000-0000-000000000941','Foto principal','photo','00000000-0000-0000-0000-000000000941'),
  ('40000000-0000-0000-0000-000000000942','10000000-0000-0000-0000-000000000941','30000000-0000-0000-0000-000000000941','Foto que falha','photo','00000000-0000-0000-0000-000000000941');
insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,active,created_by) values ('50000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','20000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943',true,'00000000-0000-0000-0000-000000000942');
insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,executor_id,status,created_by) values ('60000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','50000000-0000-0000-0000-000000000941','20000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943','in_progress','00000000-0000-0000-0000-000000000943');
insert into public.execution_answers (id,organization_id,execution_id,item_id,value,created_by) values ('70000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','"Não"'::jsonb,'00000000-0000-0000-0000-000000000943');
insert into public.non_conformities (id,organization_id,execution_id,answer_id,item_id,executor_id,observation,created_by) values ('80000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000941','70000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943','Falha observada','00000000-0000-0000-0000-000000000943');

-- The plan insert atomically updates the occurrence; an idempotent retry cannot create a second plan.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000942',true);
insert into public.action_plans (id,organization_id,non_conformity_id,description,responsible_user_id,due_at,status,created_by)
values ('90000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941','80000000-0000-0000-0000-000000000941','Corrigir foto','00000000-0000-0000-0000-000000000943',now()+interval '1 day','in_progress','00000000-0000-0000-0000-000000000942');
do $$ begin
  if not exists (select 1 from public.non_conformities where id='80000000-0000-0000-0000-000000000941' and status='in_progress' and responsible_user_id='00000000-0000-0000-0000-000000000943') then raise exception 'plan insert did not atomically synchronize occurrence'; end if;
  begin
    insert into public.action_plans (id,organization_id,non_conformity_id,description,status,created_by) values ('90000000-0000-0000-0000-000000000942','10000000-0000-0000-0000-000000000941','80000000-0000-0000-0000-000000000941','duplicado','in_progress','00000000-0000-0000-0000-000000000942');
    raise exception 'duplicate plan was accepted';
  exception
    when unique_violation then null;
    when raise_exception then if sqlerrm='duplicate plan was accepted' then raise; end if;
  end;
end $$;

insert into storage.objects(bucket_id,name,owner_id,metadata) values ('checkflow-evidence','10000000-0000-0000-0000-000000000941/action-plans/90000000-0000-0000-0000-000000000941/photo.jpg','00000000-0000-0000-0000-000000000942','{}');
update public.action_plans set correction_comment='10000000-0000-0000-0000-000000000941/action-plans/90000000-0000-0000-0000-000000000941/photo.jpg', status='awaiting_validation' where id='90000000-0000-0000-0000-000000000941';
update public.action_plans set status='completed', validated_by='00000000-0000-0000-0000-000000000942', validated_at=now() where id='90000000-0000-0000-0000-000000000941';
do $$ begin if (select status from public.non_conformities where id='80000000-0000-0000-0000-000000000941') <> 'completed' then raise exception 'plan validation did not atomically synchronize occurrence'; end if; end $$;

-- The RPC commits answer+attachment together and retry with the same path is idempotent.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000943',true);
insert into storage.objects(bucket_id,name,owner_id,metadata) values ('checkflow-evidence','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000941/photo.jpg','00000000-0000-0000-0000-000000000943','{}');
insert into storage.objects(bucket_id,name,owner_id,metadata) values ('checkflow-evidence','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000941/retry-new-path.jpg','00000000-0000-0000-0000-000000000943','{}');
insert into storage.objects(bucket_id,name,owner_id,metadata) values ('checkflow-evidence','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000942/fail.jpg','00000000-0000-0000-0000-000000000943','{}');
select public.record_checkflow_execution_photo_evidence('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000941/photo.jpg','photo.jpg','image/jpeg',10);
select public.record_checkflow_execution_photo_evidence('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000941/photo.jpg','photo.jpg','image/jpeg',10);
do $$ begin if (select count(*) from public.attachments where execution_id='60000000-0000-0000-0000-000000000941') <> 1 then raise exception 'photo retry created duplicate attachment'; end if; end $$;

-- A browser retry may generate a new storage path. The database must reject
-- the second attachment. The residual object is retained for operator cleanup.
do $$ begin
  begin
    perform public.record_checkflow_execution_photo_evidence('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000941','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000941/retry-new-path.jpg','retry-new-path.jpg','image/jpeg',10);
    raise exception 'new-path photo retry was accepted';
  exception when raise_exception then if sqlerrm='new-path photo retry was accepted' then raise; end if;
  end;
end $$;
do $$ begin if (select count(*) from public.attachments where execution_id='60000000-0000-0000-0000-000000000941') <> 1 then raise exception 'new-path retry created duplicate attachment'; end if; end $$;

-- All client deletion is denied; orphan cleanup requires a quiesced operator window.
insert into storage.objects (bucket_id,name,owner_id,metadata)
values ('checkflow-evidence','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000941/unlinked-retry.jpg','00000000-0000-0000-0000-000000000943','{}'::jsonb);
-- Storage API sets this transaction-local guard before its DELETE. The test
-- uses the same guard only to exercise RLS; all test state rolls back.
select set_config('storage.allow_delete_query','true',true);
delete from storage.objects
where bucket_id='checkflow-evidence'
  and name='10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000941/unlinked-retry.jpg';
do $$ begin if not exists (select 1 from storage.objects where bucket_id='checkflow-evidence' and name like '%/unlinked-retry.jpg') then raise exception 'client deleted an upload'; end if; end $$;

-- Linked object was uploaded before the RPC.
do $$
declare affected integer;
begin
  delete from storage.objects
  where bucket_id='checkflow-evidence'
    and name='10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000941/photo.jpg';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'linked evidence deletion was accepted'; end if;
end $$;

reset role;
create function public.p1_04_test_attachment_failure() returns trigger language plpgsql as $$ begin if new.storage_path like '%/fail.jpg' then raise exception 'injected attachment failure'; end if; return new; end $$;
create trigger p1_04_test_attachment_failure before insert on public.attachments for each row execute function public.p1_04_test_attachment_failure();
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000943',true);
do $$ begin
  begin perform public.record_checkflow_execution_photo_evidence('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000942','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000942/fail.jpg','fail.jpg','image/jpeg',10); raise exception 'injected attachment failure was accepted'; exception when raise_exception then if sqlerrm<>'injected attachment failure' then raise; end if; end;
end $$;
reset role;
do $$ begin if exists (select 1 from public.execution_answers where execution_id='60000000-0000-0000-0000-000000000941' and item_id='40000000-0000-0000-0000-000000000942') then raise exception 'attachment failure left a partial answer'; end if; end $$;

rollback;
