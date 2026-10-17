-- Regression coverage for tenant/unit integrity and least-privilege migration.
-- Fixtures are local/transactional and are rolled back at the end.
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke delete on public.units from authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a351','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a-m35@local.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-00000000a352','00000000-0000-0000-0000-000000000000','authenticated','authenticated','manager-a-m35@local.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-00000000a353','00000000-0000-0000-0000-000000000000','authenticated','authenticated','collab-a-m35@local.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-00000000a354','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b-m35@local.test','',now(),'{}','{}',now(),now());
insert into public.organizations (id,name,created_by) values
  ('10000000-0000-0000-0000-00000000a351','Mission 35 A','00000000-0000-0000-0000-00000000a351'),
  ('10000000-0000-0000-0000-00000000a352','Mission 35 B','00000000-0000-0000-0000-00000000a354');
insert into public.organization_members (organization_id,user_id,role,active,created_by) values
  ('10000000-0000-0000-0000-00000000a351','00000000-0000-0000-0000-00000000a351','owner',true,'00000000-0000-0000-0000-00000000a351'),
  ('10000000-0000-0000-0000-00000000a351','00000000-0000-0000-0000-00000000a352','manager',true,'00000000-0000-0000-0000-00000000a351'),
  ('10000000-0000-0000-0000-00000000a351','00000000-0000-0000-0000-00000000a353','collaborator',true,'00000000-0000-0000-0000-00000000a351'),
  ('10000000-0000-0000-0000-00000000a352','00000000-0000-0000-0000-00000000a354','owner',true,'00000000-0000-0000-0000-00000000a354');
insert into public.units (id,organization_id,name,created_by) values
  ('20000000-0000-0000-0000-00000000a351','10000000-0000-0000-0000-00000000a351','A-1','00000000-0000-0000-0000-00000000a351'),
  ('20000000-0000-0000-0000-00000000a352','10000000-0000-0000-0000-00000000a351','A-2','00000000-0000-0000-0000-00000000a351'),
  ('20000000-0000-0000-0000-00000000a353','10000000-0000-0000-0000-00000000a352','B-1','00000000-0000-0000-0000-00000000a354');
insert into public.checklists (id,organization_id,name,created_by) values
  ('30000000-0000-0000-0000-00000000a351','10000000-0000-0000-0000-00000000a351','Checklist A','00000000-0000-0000-0000-00000000a351'),
  ('30000000-0000-0000-0000-00000000a352','10000000-0000-0000-0000-00000000a352','Checklist B','00000000-0000-0000-0000-00000000a354');
insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,unit_id,created_by) values
  ('40000000-0000-0000-0000-00000000a351','10000000-0000-0000-0000-00000000a351','30000000-0000-0000-0000-00000000a351','00000000-0000-0000-0000-00000000a353','20000000-0000-0000-0000-00000000a351','00000000-0000-0000-0000-00000000a351'),
  ('40000000-0000-0000-0000-00000000a352','10000000-0000-0000-0000-00000000a351','30000000-0000-0000-0000-00000000a351','00000000-0000-0000-0000-00000000a352',null,'00000000-0000-0000-0000-00000000a351');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a351',true);
insert into public.units (id,organization_id,name,created_by) values ('20000000-0000-0000-0000-00000000a354','10000000-0000-0000-0000-00000000a351','Owner-created','00000000-0000-0000-0000-00000000a351');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a352',true);
insert into public.units (id,organization_id,name,created_by) values ('20000000-0000-0000-0000-00000000a355','10000000-0000-0000-0000-00000000a351','Manager-created','00000000-0000-0000-0000-00000000a352');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a353',true);
do $$ begin
  begin
    insert into public.units (organization_id,name,created_by) values ('10000000-0000-0000-0000-00000000a351','Collaborator-forbidden','00000000-0000-0000-0000-00000000a353');
    raise exception 'collaborator created unit';
  exception when insufficient_privilege then null;
    when raise_exception then if sqlerrm='collaborator created unit' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a354',true);
do $$ begin
  if exists(select 1 from public.units where id='20000000-0000-0000-0000-00000000a351') then raise exception 'tenant B read tenant A unit'; end if;
end $$;
update public.units set name='Cross-tenant edit' where id='20000000-0000-0000-0000-00000000a351';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a351',true);
do $$ begin
  begin
    insert into public.teams (organization_id,unit_id,name,created_by) values ('10000000-0000-0000-0000-00000000a351','20000000-0000-0000-0000-00000000a353','Bad team','00000000-0000-0000-0000-00000000a351');
    raise exception 'cross-tenant team unit accepted';
  exception when raise_exception then if sqlerrm='cross-tenant team unit accepted' then raise; end if;
  end;
  begin
    insert into public.checklists (organization_id,unit_id,name,created_by) values ('10000000-0000-0000-0000-00000000a351','20000000-0000-0000-0000-00000000a353','Bad checklist','00000000-0000-0000-0000-00000000a351');
    raise exception 'cross-tenant checklist unit accepted';
  exception when raise_exception then if sqlerrm='cross-tenant checklist unit accepted' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a353',true);
insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,unit_id,executor_id,created_by)
values ('50000000-0000-0000-0000-00000000a351','10000000-0000-0000-0000-00000000a351','40000000-0000-0000-0000-00000000a351','30000000-0000-0000-0000-00000000a351','20000000-0000-0000-0000-00000000a351','00000000-0000-0000-0000-00000000a353','00000000-0000-0000-0000-00000000a353');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a352',true);
insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,unit_id,executor_id,created_by)
 values ('50000000-0000-0000-0000-00000000a352','10000000-0000-0000-0000-00000000a351','40000000-0000-0000-0000-00000000a352','30000000-0000-0000-0000-00000000a351',null,'00000000-0000-0000-0000-00000000a352','00000000-0000-0000-0000-00000000a352');
do $$ begin
  begin
    insert into public.checklist_executions (organization_id,assignment_id,checklist_id,unit_id,executor_id,created_by)
    values ('10000000-0000-0000-0000-00000000a351','40000000-0000-0000-0000-00000000a351','30000000-0000-0000-0000-00000000a351','20000000-0000-0000-0000-00000000a352','00000000-0000-0000-0000-00000000a353','00000000-0000-0000-0000-00000000a353');
    raise exception 'same-tenant mismatched execution unit accepted';
  exception when raise_exception then if sqlerrm='same-tenant mismatched execution unit accepted' then raise; end if;
  end;
  begin
    insert into public.checklist_executions (organization_id,assignment_id,checklist_id,unit_id,executor_id,created_by)
    values ('10000000-0000-0000-0000-00000000a351','40000000-0000-0000-0000-00000000a351','30000000-0000-0000-0000-00000000a351','20000000-0000-0000-0000-00000000a353','00000000-0000-0000-0000-00000000a353','00000000-0000-0000-0000-00000000a353');
    raise exception 'cross-tenant execution unit accepted';
  exception when raise_exception then if sqlerrm='cross-tenant execution unit accepted' then raise; end if;
  end;
  begin
    insert into public.checklist_executions (organization_id,assignment_id,checklist_id,unit_id,executor_id,created_by)
    values ('10000000-0000-0000-0000-00000000a351','40000000-0000-0000-0000-00000000a351','30000000-0000-0000-0000-00000000a351',null,'00000000-0000-0000-0000-00000000a353','00000000-0000-0000-0000-00000000a353');
    raise exception 'null execution unit against assigned unit accepted';
  exception when raise_exception then if sqlerrm='null execution unit against assigned unit accepted' then raise; end if;
  end;
  begin
    update public.checklist_executions set unit_id='20000000-0000-0000-0000-00000000a352' where id='50000000-0000-0000-0000-00000000a351';
    raise exception 'execution identity update accepted';
  exception when raise_exception then if sqlerrm='execution identity update accepted' then raise; end if;
  end;
end $$;

reset role;
do $$ begin
  if has_table_privilege('anon','public.units','TRUNCATE') then raise exception 'anon retains TRUNCATE on units'; end if;
  if has_table_privilege('authenticated','public.checklist_executions','TRUNCATE') then raise exception 'authenticated retains TRUNCATE on executions'; end if;
  if not has_table_privilege('authenticated','public.units','INSERT') then raise exception 'authenticated unit INSERT was revoked'; end if;
  if has_table_privilege('anon','public.units','DELETE') then raise exception 'anon retains DELETE on units'; end if;
  if has_table_privilege('authenticated','public.units','DELETE') then raise exception 'authenticated retains DELETE on units'; end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='units' and cmd in ('ALL','DELETE')
  ) then raise exception 'units still has an ALL or DELETE policy'; end if;
  if exists (
    select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) acl
    where d.defaclnamespace='public'::regnamespace and d.defaclobjtype='r'
      and d.defaclrole='postgres'::regrole
      and acl.grantee in ('anon'::regrole,'authenticated'::regrole) and acl.privilege_type='TRUNCATE'
  ) then raise exception 'a public default ACL still grants TRUNCATE'; end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and (has_table_privilege('anon',c.oid,'TRUNCATE') or has_table_privilege('authenticated',c.oid,'TRUNCATE'))
  ) then raise exception 'an existing public table still grants TRUNCATE'; end if;
end $$;

-- Temporarily grant DELETE inside this rolled-back test transaction so the
-- owner/manager/collaborator assertions prove that RLS also blocks hard delete.
grant delete on public.units to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a351',true);
do $$ declare affected integer; begin
  delete from public.units where id='20000000-0000-0000-0000-00000000a354';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'owner deleted a unit directly'; end if;
  if not exists(select 1 from public.units where id='20000000-0000-0000-0000-00000000a354') then raise exception 'owner delete removed a unit'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a352',true);
do $$ declare affected integer; begin
  delete from public.units where id='20000000-0000-0000-0000-00000000a354';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'manager deleted a unit directly'; end if;
  if not exists(select 1 from public.units where id='20000000-0000-0000-0000-00000000a354') then raise exception 'manager delete removed a unit'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a353',true);
do $$ declare affected integer; begin
  delete from public.units where id='20000000-0000-0000-0000-00000000a354';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'collaborator deleted a unit directly'; end if;
  if not exists(select 1 from public.units where id='20000000-0000-0000-0000-00000000a354') then raise exception 'collaborator delete removed a unit'; end if;
end $$;
reset role;
revoke delete on public.units from authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a351',true);
update public.units set active=false where id='20000000-0000-0000-0000-00000000a351';
do $$ begin
  if not exists(select 1 from public.checklist_assignments where id='40000000-0000-0000-0000-00000000a351' and unit_id='20000000-0000-0000-0000-00000000a351') then raise exception 'deactivation removed assignment history'; end if;
  if not exists(select 1 from public.checklist_executions where id='50000000-0000-0000-0000-00000000a351' and unit_id='20000000-0000-0000-0000-00000000a351') then raise exception 'deactivation removed execution history'; end if;
  if exists(select 1 from public.units where id='20000000-0000-0000-0000-00000000a351' and active) then raise exception 'deactivated unit remains active'; end if;
end $$;
rollback;
