-- CheckFlow consolidated P1 preflight — READ ONLY. Execute manually only on fzmzrtthmciaisygajba.
-- Returns exactly one final result set. No DML, DDL, configuration change, lock clause,
-- volatile application function, or remote write is used. Any SQL error is a STOP.
-- Compare INFO catalog fingerprints and REVIEW rows with the approved local baseline.

begin read only;

with
expected_baseline(version, name) as (
  values
    ('202607220001','base_multitenant'),
    ('202607230002','hardening_rls_mvp'),
    ('202607230003','action_plan_minimal_rls'),
    ('202608260001','checkflow_start_p0_provisioning_storage'),
    ('202608260002','execution_historical_snapshot'),
    ('202608280001','security_definer_execute_hardening')
),
expected_pending(version, name) as (
  values
    ('202609030001','checklist_structure_integrity'),
    ('202609040001','prevent_assignment_execution_duplication'),
    ('202609040002','enforce_execution_state_transitions'),
    ('202609040003','make_action_workflows_failure_safe'),
    ('202609070001','close_historical_identity_and_membership_gaps'),
    ('202609070002','validate_completion_from_persisted_answers'),
    ('202609070003','record_non_conformity_atomically'),
    ('202609070004','fail_fast_on_lifecycle_lock_conflicts')
),
history as (
  select version::text, name from supabase_migrations.schema_migrations
),
required_relations(schema_name, relation_name) as (
  values
    ('public','organizations'),('public','organization_members'),('public','units'),
    ('public','checklists'),('public','checklist_sections'),('public','checklist_items'),
    ('public','checklist_assignments'),('public','checklist_executions'),
    ('public','execution_answers'),('public','non_conformities'),('public','action_plans'),
    ('public','attachments'),('storage','objects'),('storage','buckets')
),
required_columns(table_name, column_name) as (
  values
    ('checklists','id'),('checklists','organization_id'),('checklists','status'),
    ('checklist_sections','id'),('checklist_sections','organization_id'),('checklist_sections','checklist_id'),
    ('checklist_items','id'),('checklist_items','organization_id'),('checklist_items','section_id'),
    ('checklist_assignments','id'),('checklist_assignments','organization_id'),('checklist_assignments','checklist_id'),('checklist_assignments','assigned_to'),('checklist_assignments','active'),('checklist_assignments','unit_id'),
    ('checklist_executions','id'),('checklist_executions','organization_id'),('checklist_executions','assignment_id'),('checklist_executions','checklist_id'),('checklist_executions','executor_id'),('checklist_executions','unit_id'),('checklist_executions','status'),('checklist_executions','started_at'),('checklist_executions','paused_at'),('checklist_executions','completed_at'),('checklist_executions','execution_snapshot'),
    ('execution_answers','id'),('execution_answers','organization_id'),('execution_answers','execution_id'),('execution_answers','item_id'),
    ('non_conformities','id'),('non_conformities','organization_id'),('non_conformities','execution_id'),('non_conformities','answer_id'),('non_conformities','item_id'),('non_conformities','unit_id'),('non_conformities','executor_id'),
    ('action_plans','id'),('action_plans','organization_id'),('action_plans','non_conformity_id'),('action_plans','correction_comment'),
    ('attachments','id'),('attachments','organization_id'),('attachments','execution_id'),('attachments','answer_id'),('attachments','storage_path'),('attachments','mime_type'),('attachments','size_bytes')
),
required_constraints(kind, source_table, source_column, target_table, delete_rule) as (
  values
    ('PK','checklists','id',null::text,null::text),('PK','checklist_sections','id',null::text,null::text),('PK','checklist_items','id',null::text,null::text),('PK','checklist_assignments','id',null::text,null::text),('PK','checklist_executions','id',null::text,null::text),
    ('FK','checklist_sections','checklist_id','checklists','c'),('FK','checklist_items','section_id','checklist_sections','c'),('FK','checklist_assignments','checklist_id','checklists','c'),('FK','checklist_executions','checklist_id','checklists','a'),('FK','checklist_executions','assignment_id','checklist_assignments','n')
),
observed_constraints as (
  select con.contype, src.relname source_table, tgt.relname target_table, con.confdeltype,
    array_agg(a.attname::text order by k.ordinality) source_columns
  from pg_constraint con join pg_class src on src.oid=con.conrelid
  left join pg_class tgt on tgt.oid=con.confrelid
  left join unnest(con.conkey) with ordinality k(attnum,ordinality) on true
  left join pg_attribute a on a.attrelid=src.oid and a.attnum=k.attnum
  where src.relnamespace='public'::regnamespace
  group by con.contype,src.relname,tgt.relname,con.confdeltype
),
expected_policies(table_name, policy_name) as (
  values
    ('checklists','org_member_select'),('checklists','org_manager_write'),
    ('checklist_sections','org_member_select'),('checklist_sections','org_manager_write'),
    ('checklist_items','org_member_select'),('checklist_items','org_manager_write'),
    ('checklist_assignments','org_manager_select'),('checklist_assignments','org_manager_write'),('checklist_assignments','collaborator_assignment_select'),
    ('checklist_executions','org_manager_select'),('checklist_executions','org_manager_write'),('checklist_executions','collaborator_execution_select'),('checklist_executions','collaborator_execution_insert'),('checklist_executions','collaborator_execution_update')
),
expected_existing_triggers(table_name, trigger_name) as (
  values ('checklist_executions','capture_and_protect_execution_snapshot'),
    ('checklist_sections','validate_tenant_links'),('checklist_items','validate_tenant_links'),
    ('checklist_assignments','validate_tenant_links'),('checklist_executions','validate_tenant_links')
),
new_functions(proname, identity_arguments) as (
  values
    ('lock_checkflow_checklist','p_checklist_id uuid'),('checkflow_checklist_is_protected','p_checklist_id uuid'),('enforce_checkflow_structure_immutability',''),('lock_checkflow_lifecycle_checklist',''),
    ('prevent_checkflow_duplicate_assignment_cycle',''),('enforce_checkflow_execution_state_transition',''),('sync_checkflow_action_plan_non_conformity',''),('record_checkflow_execution_photo_evidence','p_execution_id uuid, p_item_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes bigint'),
    ('guard_checkflow_record_identity',''),('guard_checkflow_evidence_object',''),('validate_checkflow_completion_answers',''),('record_checkflow_non_conformity','p_execution_id uuid, p_item_id uuid, p_observation text')
),
new_triggers(table_name, trigger_name) as (
  values
    ('checklists','enforce_checkflow_structure_immutability'),('checklist_sections','enforce_checkflow_structure_immutability'),('checklist_items','enforce_checkflow_structure_immutability'),
    ('checklist_assignments','before_checkflow_lifecycle_lock'),('checklist_executions','before_checkflow_lifecycle_lock'),('checklist_assignments','lock_checkflow_lifecycle_checklist'),('checklist_executions','lock_checkflow_lifecycle_checklist'),
    ('checklist_assignments','enforce_checkflow_assignment_cycle'),('checklist_executions','enforce_checkflow_execution_state_transition'),('action_plans','sync_checkflow_action_plan_non_conformity'),
    ('checklist_executions','validate_checkflow_completion_answers'),('checklist_executions','aa_guard_checkflow_record_identity'),('checklist_assignments','aa_guard_checkflow_record_identity'),('execution_answers','aa_guard_checkflow_record_identity'),('attachments','aa_guard_checkflow_record_identity'),('non_conformities','aa_guard_checkflow_record_identity'),('action_plans','aa_guard_checkflow_record_identity'),
    ('attachments','ab_guard_checkflow_evidence_object'),('action_plans','ab_guard_checkflow_evidence_object')
),
data_gates(gate, violations) as (
  select 'orphan_sections',count(*) from public.checklist_sections s left join public.checklists c on c.id=s.checklist_id where c.id is null
  union all select 'orphan_items',count(*) from public.checklist_items i left join public.checklist_sections s on s.id=i.section_id where s.id is null
  union all select 'orphan_assignments',count(*) from public.checklist_assignments a left join public.checklists c on c.id=a.checklist_id where c.id is null
  union all select 'orphan_executions',count(*) from public.checklist_executions e left join public.checklists c on c.id=e.checklist_id where c.id is null
  union all select 'orphan_execution_assignment_links',count(*) from public.checklist_executions e left join public.checklist_assignments a on a.id=e.assignment_id where e.assignment_id is not null and a.id is null
  union all select 'orphan_execution_answers',count(*) from public.execution_answers a left join public.checklist_executions e on e.id=a.execution_id where e.id is null
  union all select 'answers_outside_execution_checklist',count(*) from public.execution_answers a join public.checklist_executions e on e.id=a.execution_id left join public.checklist_items i on i.id=a.item_id left join public.checklist_sections s on s.id=i.section_id where i.id is null or s.checklist_id is distinct from e.checklist_id
  union all select 'section_checklist_org_mismatch',count(*) from public.checklist_sections s join public.checklists c on c.id=s.checklist_id where s.organization_id is distinct from c.organization_id
  union all select 'item_section_org_mismatch',count(*) from public.checklist_items i join public.checklist_sections s on s.id=i.section_id where i.organization_id is distinct from s.organization_id
  union all select 'assignment_checklist_org_mismatch',count(*) from public.checklist_assignments a join public.checklists c on c.id=a.checklist_id where a.organization_id is distinct from c.organization_id
  union all select 'execution_checklist_org_mismatch',count(*) from public.checklist_executions e join public.checklists c on c.id=e.checklist_id where e.organization_id is distinct from c.organization_id
  union all select 'execution_assignment_org_or_checklist_mismatch',count(*) from public.checklist_executions e join public.checklist_assignments a on a.id=e.assignment_id where e.assignment_id is not null and (e.organization_id is distinct from a.organization_id or e.checklist_id is distinct from a.checklist_id)
  union all select 'execution_assignment_executor_mismatch',count(*) from public.checklist_executions e join public.checklist_assignments a on a.id=e.assignment_id where e.assignment_id is not null and e.executor_id is distinct from a.assigned_to
  union all select 'answer_execution_org_mismatch',count(*) from public.execution_answers a join public.checklist_executions e on e.id=a.execution_id where a.organization_id is distinct from e.organization_id
  union all select 'checklists_without_organization',count(*) from public.checklists where organization_id is null
  union all select 'unique_execution_assignment',count(*) from (select assignment_id from public.checklist_executions where assignment_id is not null group by assignment_id having count(*)>1) x
  union all select 'unique_plan_nc',count(*) from (select non_conformity_id from public.action_plans group by non_conformity_id having count(*)>1) x
  union all select 'unique_attachment_path',count(*) from (select storage_path from public.attachments group by storage_path having count(*)>1) x
  union all select 'unique_attachment_answer',count(*) from (select answer_id from public.attachments where answer_id is not null group by answer_id having count(*)>1) x
  union all select 'unique_nc_answer',count(*) from (select answer_id from public.non_conformities where answer_id is not null group by answer_id having count(*)>1) x
  union all select 'operational_assignment_duplicates',count(*) from (select a.organization_id,a.checklist_id,a.assigned_to from public.checklist_assignments a where a.active and (not exists(select 1 from public.checklist_executions e where e.assignment_id=a.id) or exists(select 1 from public.checklist_executions e where e.assignment_id=a.id and e.status not in ('completed','cancelled'))) group by a.organization_id,a.checklist_id,a.assigned_to having count(*)>1) x
  union all select 'unsupported_execution_state',count(*) from public.checklist_executions where status not in ('in_progress','paused','completed')
  union all select 'execution_timestamps',count(*) from public.checklist_executions where started_at is null or (status='in_progress' and (paused_at is not null or completed_at is not null or conformity_percentage is not null)) or (status='paused' and (paused_at is null or completed_at is not null or conformity_percentage is not null)) or (status='completed' and (paused_at is not null or completed_at is null or completed_at<started_at or conformity_percentage is null or conformity_percentage<0 or conformity_percentage>100 or jsonb_typeof(summary) is distinct from 'object'))
  union all select 'snapshot_shape',count(*) from public.checklist_executions where execution_snapshot is null or jsonb_typeof(execution_snapshot) is distinct from 'object' or jsonb_typeof(execution_snapshot->'sections') is distinct from 'array' or execution_snapshot->>'version' is distinct from '1' or execution_snapshot#>>'{checklist,id}' is distinct from checklist_id::text or execution_snapshot#>>'{executor,id}' is distinct from executor_id::text or execution_snapshot#>>'{assignment,id}' is distinct from assignment_id::text
  union all select 'attachment_parent_links',count(*) from public.attachments a left join public.checklist_executions e on e.id=a.execution_id left join public.execution_answers r on r.id=a.answer_id where e.id is null or e.organization_id is distinct from a.organization_id or r.id is null or r.organization_id is distinct from a.organization_id or r.execution_id is distinct from a.execution_id
  union all select 'attachment_missing_object_or_wrong_prefix',count(*) from public.attachments a left join public.execution_answers r on r.id=a.answer_id where not exists(select 1 from storage.objects o where o.bucket_id='checkflow-evidence' and o.name=a.storage_path) or left(a.storage_path,length(a.organization_id::text||'/'||a.execution_id::text||'/'||r.item_id::text||'/')) is distinct from a.organization_id::text||'/'||a.execution_id::text||'/'||r.item_id::text||'/'
  union all select 'attachment_invalid_metadata',count(*) from public.attachments where mime_type is null or mime_type not in ('image/jpeg','image/png','image/webp') or size_bytes is null or size_bytes<1 or size_bytes>10485760
  union all select 'nc_parent_links',count(*) from public.non_conformities n left join public.checklist_executions e on e.id=n.execution_id left join public.execution_answers a on a.id=n.answer_id where e.id is null or a.id is null or n.organization_id is distinct from e.organization_id or n.organization_id is distinct from a.organization_id or n.execution_id is distinct from a.execution_id or n.item_id is distinct from a.item_id or n.executor_id is distinct from e.executor_id
  union all select 'plan_parent_links',count(*) from public.action_plans p left join public.non_conformities n on n.id=p.non_conformity_id where n.id is null or n.organization_id is distinct from p.organization_id
  union all select 'plan_nc_sync',count(*) from public.action_plans p join public.non_conformities n on n.id=p.non_conformity_id where (p.status,p.responsible_user_id,p.due_at) is distinct from (n.status,n.responsible_user_id,n.due_at)
  union all select 'plan_missing_correction_object',count(*) from public.action_plans p where p.correction_comment is not null and (left(p.correction_comment,length(p.organization_id::text||'/action-plans/'||p.id::text||'/'))<>p.organization_id::text||'/action-plans/'||p.id::text||'/' or not exists(select 1 from storage.objects o where o.bucket_id='checkflow-evidence' and o.name=p.correction_comment))
  union all select 'execution_cross_tenant_unit',count(*) from public.checklist_executions e join public.units u on u.id=e.unit_id where e.organization_id is distinct from u.organization_id
  union all select 'assignment_cross_tenant_unit',count(*) from public.checklist_assignments a join public.units u on u.id=a.unit_id where a.organization_id is distinct from u.organization_id
  union all select 'nc_cross_tenant_unit',count(*) from public.non_conformities n join public.units u on u.id=n.unit_id where n.organization_id is distinct from u.organization_id
  union all select 'public_table_rls_disabled',count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions','execution_answers','attachments','non_conformities','action_plans','organization_members') and not c.relrowsecurity
  union all select 'unsafe_definer_search_path',count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and p.proname in ('has_org_role','is_org_member','validate_checkflow_tenant_links','capture_and_protect_execution_snapshot','protect_completed_execution_records','record_checkflow_execution_photo_evidence') and not coalesce(p.proconfig @> array['search_path=""'],false)
),
completed_required_answer_violations as (
  select count(*) violations from (
    select e.id,item,a.id answer_id,a.value,a.observation
    from public.checklist_executions e
      cross join lateral jsonb_array_elements(case when jsonb_typeof(e.execution_snapshot->'sections')='array' then e.execution_snapshot->'sections' else '[]'::jsonb end) s
      cross join lateral jsonb_array_elements(case when jsonb_typeof(s->'items')='array' then s->'items' else '[]'::jsonb end) item
      left join public.execution_answers a on a.execution_id=e.id and a.item_id::text=item->>'id'
    where e.status='completed' and item->>'required'='true'
      and (a.id is null or a.value is null or a.value in ('null'::jsonb,'""'::jsonb) or (item->>'answer_type'='yes_no' and a.value in ('"Não"'::jsonb,'false'::jsonb) and (nullif(btrim(a.observation),'') is null or not exists(select 1 from public.non_conformities n where n.answer_id=a.id))))
  ) x
),
rows as (
  select '01_context' report,'INFO' status,current_database()||'; role='||current_user||'; postgres='||version() count_or_value,'Execution context; verify the database is the approved project.' interpretation
  union all select '02_baseline_migration_'||e.version,case when h.version is null then 'FAIL' else 'PASS' end,coalesce(h.name,'missing'),case when h.version is null then 'Required baseline migration is missing.' else 'Baseline migration present.' end from expected_baseline e left join history h using(version)
  union all select '02_pending_migration_'||e.version,case when h.version is null then 'PASS' when h.name=e.name then 'REVIEW' else 'FAIL' end,coalesce(h.name,'pending'),case when h.version is null then 'Expected pending migration is absent.' when h.name=e.name then 'Already recorded: use postflight, not rollout.' else 'Version exists with an unexpected migration name.' end from expected_pending e left join history h using(version)
  union all select '02_unexpected_remote_migrations',case when count(*)=0 then 'PASS' else 'REVIEW' end,count(*)::text,'Compare every unexpected remote version to approved local history.' from history h where h.version not in (select version from expected_baseline union all select version from expected_pending)
  union all select '03_relation_'||r.schema_name||'.'||r.relation_name,case when c.oid is null then 'FAIL' else 'PASS' end,coalesce(c.relkind::text,'missing'),'Required relation and catalog visibility.' from required_relations r left join pg_namespace n on n.nspname=r.schema_name left join pg_class c on c.relnamespace=n.oid and c.relname=r.relation_name
  union all select '04_column_public.'||r.table_name||'.'||r.column_name,case when c.column_name is null then 'FAIL' else 'PASS' end,coalesce(c.data_type||'/'||c.udt_name||'/nullable='||c.is_nullable,'missing'),'Required column for migrations and data gates.' from required_columns r left join information_schema.columns c on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
  union all select '04_column_catalog_fingerprint','INFO',coalesce(md5(string_agg(table_schema||'.'||table_name||'.'||column_name||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''),E'\n' order by table_schema,table_name,ordinal_position)),'none'),'Compare public/storage columns, types, nullability, and defaults with local baseline.' from information_schema.columns where (table_schema='public' and table_name in ('checklist_executions','execution_answers','checklist_assignments','non_conformities','action_plans','attachments')) or (table_schema='storage' and table_name in ('objects','buckets'))
  union all select '05_constraint_'||r.source_table||'.'||r.source_column,case when exists(select 1 from observed_constraints o where o.source_table=r.source_table and o.contype=case r.kind when 'PK' then 'p' else 'f' end and o.source_columns=array[r.source_column] and (r.target_table is null or o.target_table=r.target_table) and (r.delete_rule is null or o.confdeltype=r.delete_rule)) then 'PASS' else 'FAIL' end,coalesce(r.target_table,'primary key'),'Required PK/FK and delete action.' from required_constraints r
  union all select '05_constraint_catalog_fingerprint','INFO',coalesce(md5(string_agg(pg_get_constraintdef(c.oid),E'\n' order by c.conrelid::regclass::text,c.conname)),'none'),'Compare the deterministic constraint-definition hash with local baseline.' from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'
  union all select '05_index_catalog_fingerprint','INFO',coalesce(md5(string_agg(pg_get_indexdef(i.oid)||':unique='||x.indisunique||':valid='||x.indisvalid||':ready='||x.indisready,E'\n' order by t.relname,i.relname)),'none'),'Compare all public index definitions, uniqueness, validity, and readiness with local baseline.' from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class t on t.oid=x.indrelid where t.relnamespace='public'::regnamespace
  union all select '06_function_conflict_'||f.proname,case when p.oid is null then 'PASS' else 'REVIEW' end,coalesce(p.oid::regprocedure::text,'absent'),'Any pre-existing migration target function requires manual schema review; never drop automatically.' from new_functions f left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=f.proname and pg_get_function_identity_arguments(p.oid)=f.identity_arguments
  union all select '06_function_catalog_fingerprint','INFO',coalesce(md5(string_agg(p.oid::regprocedure::text||':'||md5(pg_get_functiondef(p.oid))||':definer='||p.prosecdef||':config='||coalesce(array_to_string(p.proconfig,','),''),E'\n' order by p.oid::regprocedure::text)),'none'),'Compare function signatures, hashes, definer flag, and search_path configuration to local baseline.' from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not like 'pgp_%' and p.proname not like 'crypt%'
  union all select '07_trigger_conflict_'||t.table_name||'.'||t.trigger_name,case when g.oid is null then 'PASS' else 'REVIEW' end,coalesce(pg_get_triggerdef(g.oid),'absent'),'Pre-existing target trigger requires manual schema review.' from new_triggers t left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=t.table_name left join pg_trigger g on g.tgrelid=c.oid and g.tgname=t.trigger_name and not g.tgisinternal
  union all select '07_required_trigger_'||t.table_name||'.'||t.trigger_name,case when g.oid is null then 'FAIL' else 'PASS' end,coalesce(pg_get_triggerdef(g.oid),'absent'),'Required historical or tenant trigger.' from expected_existing_triggers t left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=t.table_name left join pg_trigger g on g.tgrelid=c.oid and g.tgname=t.trigger_name and not g.tgisinternal
  union all select '07_trigger_catalog_fingerprint','INFO',coalesce(md5(string_agg(c.oid::regclass::text||':'||g.tgname||':'||pg_get_triggerdef(g.oid),E'\n' order by c.oid::regclass::text,g.tgname)),'none'),'Compare trigger definitions and ordering against local baseline.' from pg_trigger g join pg_class c on c.oid=g.tgrelid where not g.tgisinternal and c.relnamespace in ('public'::regnamespace,'storage'::regnamespace)
  union all select '08_rls_'||r.relation_name,case when c.oid is null or not c.relrowsecurity then 'FAIL' when c.relforcerowsecurity then 'REVIEW' else 'PASS' end,'enabled='||coalesce(c.relrowsecurity,false)||'; forced='||coalesce(c.relforcerowsecurity,false),'RLS must be enabled; FORCE RLS requires ownership review.' from required_relations r left join pg_namespace n on n.nspname=r.schema_name left join pg_class c on c.relnamespace=n.oid and c.relname=r.relation_name where r.schema_name='public' and r.relation_name in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions')
  union all select '08_policy_'||e.table_name||'.'||e.policy_name,case when p.policyname is null then 'FAIL' else 'PASS' end,coalesce(p.cmd||'; roles='||array_to_string(p.roles,','),'missing'),'Required baseline policy.' from expected_policies e left join pg_policies p on p.schemaname='public' and p.tablename=e.table_name and p.policyname=e.policy_name
  union all select '08_policy_catalog_fingerprint','INFO',coalesce(md5(string_agg(schemaname||'.'||tablename||':'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''),E'\n' order by schemaname,tablename,policyname)),'none'),'Compare public/storage policies and predicates with local baseline.' from pg_policies where schemaname in ('public','storage')
  union all select '08_rls_catalog_fingerprint','INFO',coalesce(md5(string_agg(c.oid::regclass::text||':enabled='||c.relrowsecurity||':forced='||c.relforcerowsecurity||':acl='||coalesce(array_to_string(c.relacl,','),''),E'\n' order by c.oid::regclass::text)),'none'),'Compare public/storage RLS flags and relation ACLs with local baseline.' from pg_class c where c.relkind='r' and c.relnamespace in ('public'::regnamespace,'storage'::regnamespace)
  union all select '09_role_'||r.role_name,case when p.rolname is null then 'FAIL' else 'PASS' end,coalesce(p.rolname,'missing'),'Role required by P1 REVOKE/GRANT statements.' from (values ('anon'),('authenticated'),('service_role')) r(role_name) left join pg_roles p on p.rolname=r.role_name
  union all select '09_grants_catalog_fingerprint','INFO',coalesce(md5(string_agg(coalesce(p.oid::regprocedure::text,'')||':'||coalesce(array_to_string(p.proacl,','),''),E'\n' order by p.oid::regprocedure::text)),'none'),'Compare function execute ACLs (including SECURITY DEFINER functions) with local baseline.' from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
  union all select '10_checklist_status_'||coalesce(status::text,'NULL'),case when status is null then 'FAIL' else 'INFO' end,count(*)::text,'Checklist status distribution; null is incompatible.' from public.checklists group by status
  union all select '10_execution_status_'||coalesce(status::text,'NULL'),case when status not in ('in_progress','paused','completed') or status is null then 'FAIL' else 'INFO' end,count(*)::text,'Execution status distribution; allowed lifecycle values only.' from public.checklist_executions group by status
  union all select '10_lifecycle_null_checklist_status',case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text,'Null checklist status blocks P1-01.' from public.checklists where status is null
  union all select '10_lifecycle_editable_drafts','INFO',count(*)::text,'Draft checklists without assignment or execution remain editable after P1-01.' from public.checklists c where c.status='draft' and not exists(select 1 from public.checklist_assignments a where a.checklist_id=c.id) and not exists(select 1 from public.checklist_executions e where e.checklist_id=c.id)
  union all select '10_lifecycle_protected_drafts_with_lifecycle','INFO',count(*)::text,'P1-01 will make these lifecycle-linked drafts immutable.' from public.checklists c where c.status='draft' and (exists(select 1 from public.checklist_assignments a where a.checklist_id=c.id) or exists(select 1 from public.checklist_executions e where e.checklist_id=c.id))
  union all select '10_lifecycle_protected_non_draft_without_lifecycle','INFO',count(*)::text,'P1-01 will make these non-drafts immutable.' from public.checklists c where c.status<>'draft' and not exists(select 1 from public.checklist_assignments a where a.checklist_id=c.id) and not exists(select 1 from public.checklist_executions e where e.checklist_id=c.id)
  union all select '10_lifecycle_protected_non_draft_with_lifecycle','INFO',count(*)::text,'P1-01 will make these non-draft lifecycle-linked checklists immutable.' from public.checklists c where c.status<>'draft' and (exists(select 1 from public.checklist_assignments a where a.checklist_id=c.id) or exists(select 1 from public.checklist_executions e where e.checklist_id=c.id))
  union all select '10_primary_counts','INFO','checklists='||(select count(*) from public.checklists)||'; assignments='||(select count(*) from public.checklist_assignments)||'; executions='||(select count(*) from public.checklist_executions)||'; sections='||(select count(*) from public.checklist_sections)||'; items='||(select count(*) from public.checklist_items)||'; answers='||(select count(*) from public.execution_answers),'Aggregate volume only; no identifiers are returned.'
  union all select '10_historical_completed_without_snapshot',case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text,'Completed executions require a historical snapshot.' from public.checklist_executions where status='completed' and execution_snapshot is null
  union all select '11_18_'||gate,case when violations=0 then 'PASS' else 'FAIL' end,violations::text,'Nonzero violations are a hard data-integrity stop.' from data_gates
  union all select '13_duplicate_active_assignments',case when count(*)=0 then 'PASS' else 'REVIEW' end,count(*)::text,'Duplicate active assignment groups: review re-assignment behavior.' from (select 1 from public.checklist_assignments where active group by organization_id,checklist_id,assigned_to having count(*)>1) x
  union all select '13_duplicate_executions_per_assignment',case when count(*)=0 then 'PASS' else 'REVIEW' end,count(*)::text,'Duplicate execution groups per assignment: review lifecycle history.' from (select 1 from public.checklist_executions where assignment_id is not null group by assignment_id having count(*)>1) x
  union all select '19_orphan_storage_objects','REVIEW',count(*)::text,'P2 operational residue; never delete automatically.' from storage.objects o where o.bucket_id='checkflow-evidence' and not exists(select 1 from public.attachments a where a.storage_path=o.name) and not exists(select 1 from public.action_plans p where p.correction_comment=o.name)
  union all select '20_completed_required_answers',case when violations=0 then 'PASS' else 'FAIL' end,violations::text,'Completed required answers/non-conformities must match persisted snapshot.' from completed_required_answer_violations
  union all select '21_decision_rule','INFO','STOP on any SQL error or FAIL; REVIEW is not approval.','No write was performed. Compare every INFO fingerprint with approved local baseline.'
)
select report,status,count_or_value,interpretation
from rows
order by report, status, count_or_value;

commit;
