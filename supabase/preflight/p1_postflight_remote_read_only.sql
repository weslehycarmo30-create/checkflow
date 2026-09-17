-- CheckFlow controlled-rollout postflight — MANUAL READ ONLY only.
-- Target: fzmzrtthmciaisygajba. One final result set; any SQL error or FAIL is NO-GO.

begin read only;

with
expected_migrations(version, name) as (
  values
    ('202607220001','base_multitenant'),('202607230002','hardening_rls_mvp'),('202607230003','action_plan_minimal_rls'),
    ('202608260001','checkflow_start_p0_provisioning_storage'),('202608260002','execution_historical_snapshot'),('202608280001','security_definer_execute_hardening'),
    ('202609030001','checklist_structure_integrity'),('202609040001','prevent_assignment_execution_duplication'),('202609040002','enforce_execution_state_transitions'),('202609040003','make_action_workflows_failure_safe'),
    ('202609070001','close_historical_identity_and_membership_gaps'),('202609070002','validate_completion_from_persisted_answers'),('202609070003','record_non_conformity_atomically'),('202609070004','fail_fast_on_lifecycle_lock_conflicts')
),
expected_indexes(index_name) as (
  values ('checklist_executions_one_per_assignment'),('action_plans_one_per_non_conformity'),('attachments_storage_path_unique'),('attachments_one_per_answer'),('non_conformities_one_per_answer')
),
expected_constraints(source_table, source_column, target_table, delete_rule) as (
  values ('checklist_sections','checklist_id','checklists','c'),('checklist_items','section_id','checklist_sections','c'),('checklist_assignments','checklist_id','checklists','c'),('checklist_executions','checklist_id','checklists','a'),('checklist_executions','assignment_id','checklist_assignments','n')
),
observed_constraints as (
  select src.relname source_table,tgt.relname target_table,con.confdeltype,array_agg(a.attname::text order by k.ordinality) source_columns
  from pg_constraint con join pg_class src on src.oid=con.conrelid left join pg_class tgt on tgt.oid=con.confrelid left join unnest(con.conkey) with ordinality k(attnum,ordinality) on true left join pg_attribute a on a.attrelid=src.oid and a.attnum=k.attnum
  where con.contype='f' and src.relnamespace='public'::regnamespace group by src.relname,tgt.relname,con.confdeltype
),
expected_policies(table_name, policy_name) as (
  values ('checklists','org_member_select'),('checklists','org_manager_write'),('checklist_sections','org_member_select'),('checklist_sections','org_manager_write'),('checklist_items','org_member_select'),('checklist_items','org_manager_write'),('checklist_assignments','org_manager_select'),('checklist_assignments','org_manager_write'),('checklist_assignments','collaborator_assignment_select'),('checklist_executions','org_manager_select'),('checklist_executions','org_manager_write'),('checklist_executions','collaborator_execution_select'),('checklist_executions','collaborator_execution_insert'),('checklist_executions','collaborator_execution_update')
),
expected_triggers(table_name, trigger_name) as (
  values
    ('checklists','enforce_checkflow_structure_immutability'),('checklist_sections','enforce_checkflow_structure_immutability'),('checklist_items','enforce_checkflow_structure_immutability'),
    ('checklist_assignments','before_checkflow_lifecycle_lock'),('checklist_executions','before_checkflow_lifecycle_lock'),('checklist_assignments','enforce_checkflow_assignment_cycle'),('checklist_executions','enforce_checkflow_execution_state_transition'),
    ('checklist_executions','capture_and_protect_execution_snapshot'),('checklist_executions','validate_checkflow_completion_answers'),('checklist_sections','validate_tenant_links'),('checklist_items','validate_tenant_links'),('checklist_assignments','validate_tenant_links'),('checklist_executions','validate_tenant_links'),
    ('execution_answers','protect_completed_execution_records'),('attachments','protect_completed_execution_records'),('non_conformities','protect_completed_execution_records'),('action_plans','protect_completed_execution_records'),
    ('checklist_executions','aa_guard_checkflow_record_identity'),('checklist_assignments','aa_guard_checkflow_record_identity'),('execution_answers','aa_guard_checkflow_record_identity'),('attachments','aa_guard_checkflow_record_identity'),('non_conformities','aa_guard_checkflow_record_identity'),('action_plans','aa_guard_checkflow_record_identity'),
    ('attachments','ab_guard_checkflow_evidence_object'),('action_plans','ab_guard_checkflow_evidence_object'),('action_plans','sync_checkflow_action_plan_non_conformity')
),
expected_functions(proname, identity_arguments, rpc_authenticated) as (
  values
    ('lock_checkflow_checklist','p_checklist_id uuid',false),('checkflow_checklist_is_protected','p_checklist_id uuid',false),('enforce_checkflow_structure_immutability','',false),('lock_checkflow_lifecycle_checklist','',false),
    ('prevent_checkflow_duplicate_assignment_cycle','',false),('enforce_checkflow_execution_state_transition','',false),('sync_checkflow_action_plan_non_conformity','',false),('record_checkflow_execution_photo_evidence','p_execution_id uuid, p_item_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes bigint',true),
    ('guard_checkflow_record_identity','',false),('guard_checkflow_evidence_object','',false),('validate_checkflow_completion_answers','',false),('record_checkflow_non_conformity','p_execution_id uuid, p_item_id uuid, p_observation text',true)
),
legacy_snapshot_ids as (
  select id from public.checklist_executions
  where status='completed' and execution_snapshot is null
    and created_at < '2026-08-28T14:37:53.122342Z'::timestamptz
    and completed_at < '2026-08-28T14:37:53.122342Z'::timestamptz
),
snapshot_violations as (
  select id from public.checklist_executions
  where execution_snapshot is null
     or jsonb_typeof(execution_snapshot) is distinct from 'object'
     or jsonb_typeof(execution_snapshot->'sections') is distinct from 'array'
     or execution_snapshot->>'version' is distinct from '1'
     or execution_snapshot#>>'{checklist,id}' is distinct from checklist_id::text
     or execution_snapshot#>>'{executor,id}' is distinct from executor_id::text
     or execution_snapshot#>>'{assignment,id}' is distinct from assignment_id::text
),
data_gates(gate, violations) as (
  select 'duplicate_operational_assignments',count(*) from (select 1 from public.checklist_assignments a where a.active and (not exists(select 1 from public.checklist_executions e where e.assignment_id=a.id) or exists(select 1 from public.checklist_executions e where e.assignment_id=a.id and e.status not in ('completed','cancelled'))) group by a.organization_id,a.checklist_id,a.assigned_to having count(*)>1) x
  union all select 'duplicate_executions_per_assignment',count(*) from (select 1 from public.checklist_executions where assignment_id is not null group by assignment_id having count(*)>1) x
  union all select 'duplicate_action_plans_per_nc',count(*) from (select 1 from public.action_plans group by non_conformity_id having count(*)>1) x
  union all select 'duplicate_attachment_path',count(*) from (select 1 from public.attachments group by storage_path having count(*)>1) x
  union all select 'duplicate_attachment_answer',count(*) from (select 1 from public.attachments where answer_id is not null group by answer_id having count(*)>1) x
  union all select 'duplicate_nc_answer',count(*) from (select 1 from public.non_conformities where answer_id is not null group by answer_id having count(*)>1) x
  union all select 'cross_tenant_structure',count(*) from public.checklist_sections s join public.checklists c on c.id=s.checklist_id where s.organization_id is distinct from c.organization_id union all select 'cross_tenant_structure_items',count(*) from public.checklist_items i join public.checklist_sections s on s.id=i.section_id where i.organization_id is distinct from s.organization_id
  union all select 'cross_tenant_assignment',count(*) from public.checklist_assignments a join public.checklists c on c.id=a.checklist_id where a.organization_id is distinct from c.organization_id union all select 'cross_tenant_execution',count(*) from public.checklist_executions e join public.checklists c on c.id=e.checklist_id where e.organization_id is distinct from c.organization_id
  union all select 'cross_tenant_execution_assignment',count(*) from public.checklist_executions e join public.checklist_assignments a on a.id=e.assignment_id where e.assignment_id is not null and (e.organization_id is distinct from a.organization_id or e.checklist_id is distinct from a.checklist_id or e.executor_id is distinct from a.assigned_to)
  union all select 'cross_tenant_answers',count(*) from public.execution_answers a join public.checklist_executions e on e.id=a.execution_id where a.organization_id is distinct from e.organization_id
  union all select 'orphan_execution_answers',count(*) from public.execution_answers a left join public.checklist_executions e on e.id=a.execution_id where e.id is null
  union all select 'orphan_attachments_or_invalid_parent',count(*) from public.attachments a left join public.checklist_executions e on e.id=a.execution_id left join public.execution_answers r on r.id=a.answer_id where e.id is null or r.id is null or e.organization_id is distinct from a.organization_id or r.execution_id is distinct from a.execution_id or r.organization_id is distinct from a.organization_id
  union all select 'attachment_missing_object_or_wrong_prefix',count(*) from public.attachments a left join public.execution_answers r on r.id=a.answer_id where not exists(select 1 from storage.objects o where o.bucket_id='checkflow-evidence' and o.name=a.storage_path) or left(a.storage_path,length(a.organization_id::text||'/'||a.execution_id::text||'/'||r.item_id::text||'/')) is distinct from a.organization_id::text||'/'||a.execution_id::text||'/'||r.item_id::text||'/'
  union all select 'invalid_attachment_metadata',count(*) from public.attachments where mime_type not in ('image/jpeg','image/png','image/webp') or size_bytes not between 1 and 10485760
  union all select 'invalid_plan_link_or_sync',count(*) from public.action_plans p left join public.non_conformities n on n.id=p.non_conformity_id where n.id is null or n.organization_id is distinct from p.organization_id or (p.status,p.responsible_user_id,p.due_at) is distinct from (n.status,n.responsible_user_id,n.due_at)
  union all select 'missing_plan_correction_object',count(*) from public.action_plans p where p.correction_comment is not null and (left(p.correction_comment,length(p.organization_id::text||'/action-plans/'||p.id::text||'/'))<>p.organization_id::text||'/action-plans/'||p.id::text||'/' or not exists(select 1 from storage.objects o where o.bucket_id='checkflow-evidence' and o.name=p.correction_comment))
  union all select 'invalid_execution_state_or_timestamps',count(*) from public.checklist_executions where status not in ('in_progress','paused','completed') or started_at is null or (status='in_progress' and (paused_at is not null or completed_at is not null or conformity_percentage is not null)) or (status='paused' and (paused_at is null or completed_at is not null or conformity_percentage is not null)) or (status='completed' and (paused_at is not null or completed_at is null or completed_at<started_at or conformity_percentage is null or conformity_percentage not between 0 and 100 or jsonb_typeof(summary) is distinct from 'object'))
  union all select 'public_operational_table_without_rls',count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions','execution_answers','attachments','non_conformities','action_plans','organization_members') and not c.relrowsecurity
),
rows as (
  select '01_migration_'||e.version as report,case when h.version is null or h.name is distinct from e.name then 'FAIL' else 'PASS' end as status,coalesce(h.name,'missing') as count_or_value,'Exact migration version and name must be recorded.' as interpretation from expected_migrations e left join supabase_migrations.schema_migrations h on h.version::text=e.version
  union all select '02_index_'||e.index_name,case when i.oid is null or not x.indisvalid or not x.indisready then 'FAIL' else 'PASS' end,coalesce(pg_get_indexdef(i.oid),'missing'),'Required P1/forward unique index must exist, be valid and ready.' from expected_indexes e left join pg_class i on i.relnamespace='public'::regnamespace and i.relname=e.index_name left join pg_index x on x.indexrelid=i.oid
  union all select '02_index_catalog_hash','INFO',coalesce(md5(string_agg(pg_get_indexdef(i.oid)||':'||x.indisvalid||':'||x.indisready,E'\n' order by i.relname)),'none'),'Compare index definitions against approved local baseline.' from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class t on t.oid=x.indrelid where t.relnamespace='public'::regnamespace
  union all select '02_constraint_'||e.source_table||'.'||e.source_column,case when exists(select 1 from observed_constraints o where o.source_table=e.source_table and o.target_table=e.target_table and o.source_columns=array[e.source_column] and o.confdeltype=e.delete_rule) then 'PASS' else 'FAIL' end,e.target_table,'Required FK and delete action.' from expected_constraints e
  union all select '02_constraint_catalog_hash','INFO',coalesce(md5(string_agg(c.conrelid::regclass::text||':'||c.conname||':'||pg_get_constraintdef(c.oid),E'\n' order by c.conrelid::regclass::text,c.conname)),'none'),'Compare all public constraint definitions against approved local baseline.' from pg_constraint c where c.connamespace='public'::regnamespace
  union all select '03_trigger_'||e.table_name||'.'||e.trigger_name,case when g.oid is null then 'FAIL' else 'PASS' end,coalesce(pg_get_triggerdef(g.oid),'missing'),'Required trigger present; compare definition/order through catalog hash.' from expected_triggers e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.table_name left join pg_trigger g on g.tgrelid=c.oid and g.tgname=e.trigger_name and not g.tgisinternal
  union all select '03_trigger_catalog_hash','INFO',coalesce(md5(string_agg(c.oid::regclass::text||':'||g.tgname||':'||pg_get_triggerdef(g.oid),E'\n' order by c.oid::regclass::text,g.tgname)),'none'),'Compare all public/storage trigger definitions and ordering.' from pg_trigger g join pg_class c on c.oid=g.tgrelid where not g.tgisinternal and c.relnamespace in ('public'::regnamespace,'storage'::regnamespace)
  union all select '04_function_'||e.proname,case when p.oid is null or not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'],false) or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') or (not e.rpc_authenticated and has_function_privilege('authenticated',p.oid,'EXECUTE')) or (e.rpc_authenticated and not has_function_privilege('authenticated',p.oid,'EXECUTE')) then 'FAIL' else 'PASS' end,coalesce(p.oid::regprocedure::text,'missing'),'SECURITY DEFINER, empty search_path, and intended EXECUTE grants required; anon/service_role must not execute these functions.' from expected_functions e left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.proname and pg_get_function_identity_arguments(p.oid)=e.identity_arguments
  union all select '04_function_catalog_hash','INFO',coalesce(md5(string_agg(p.oid::regprocedure::text||':'||md5(pg_get_functiondef(p.oid))||':'||coalesce(array_to_string(p.proacl,','),''),E'\n' order by p.oid::regprocedure::text)),'none'),'Compare function body hashes and ACLs against approved local baseline.' from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
  union all select '05_rls_'||c.relname,case when c.relrowsecurity then 'PASS' else 'FAIL' end,'enabled='||c.relrowsecurity||'; force='||c.relforcerowsecurity,'RLS required for every operational table.' from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions','execution_answers','attachments','non_conformities','action_plans','organization_members')
  union all select '05_policy_'||e.table_name||'.'||e.policy_name,case when p.policyname is null then 'FAIL' else 'PASS' end,coalesce(p.cmd,'missing'),'Required baseline policy.' from expected_policies e left join pg_policies p on p.schemaname='public' and p.tablename=e.table_name and p.policyname=e.policy_name
  union all select '05_policy_catalog_hash','INFO',coalesce(md5(string_agg(schemaname||'.'||tablename||':'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''),E'\n' order by schemaname,tablename,policyname)),'none'),'Compare public/storage policies and grants with approved baseline.' from pg_policies where schemaname in ('public','storage')
  union all select '06_'||gate,case when violations=0 then 'PASS' else 'FAIL' end,violations::text,'Data integrity, tenant isolation, state machine, or evidence invariant.' from data_gates
  union all select '07_legacy_snapshot_preserved',case when (select count(*) from legacy_snapshot_ids)=6 and (select count(*) from snapshot_violations)=6 and not exists((select id from legacy_snapshot_ids) except (select id from snapshot_violations)) then 'PASS' else 'FAIL' end,'legacy='||(select count(*) from legacy_snapshot_ids)||'; all_snapshot_violations='||(select count(*) from snapshot_violations),'Exactly six documented July legacy executions may remain snapshotless; no new/malformed snapshot is accepted.'
  union all select '08_orphan_storage_placeholders','REVIEW',count(*)::text,'Expected two .emptyFolderPlaceholder SAFE ORPHAN records are retained; no automatic cleanup.' from storage.objects o where o.bucket_id='checkflow-evidence' and o.name like '%.emptyFolderPlaceholder' and coalesce((o.metadata->>'size')::bigint,0)=0 and not exists(select 1 from public.attachments a where a.storage_path=o.name) and not exists(select 1 from public.action_plans p where p.correction_comment=o.name)
  union all select '09_decision','INFO','GO only when every required migration/index/trigger/function/RLS/data/legacy row is PASS; INFO requires comparison and REVIEW requires human acceptance.','No write was performed.'
)
select report,status,count_or_value,interpretation from rows order by report;

commit;
