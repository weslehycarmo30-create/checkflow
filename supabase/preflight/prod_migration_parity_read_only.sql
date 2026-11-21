-- CheckFlow: paridade das migrações no banco de produção. SOMENTE LEITURA (SELECT).
-- Cole no SQL Editor do Supabase (projeto fzmzrtthmciaisygajba) e rode cada bloco.

-- BLOCO 1: migrações registradas (comparar com supabase/migrations/).
-- Pode falhar se o banco nunca usou o registro; nesse caso confie no BLOCO 2.
select version, name
from supabase_migrations.schema_migrations
order by version;

-- BLOCO 2: objetos que cada migração recente cria. present = false => migração pendente.
select migration, object, present from (
  select '202609280001 dados da empresa' as migration, 'organizations.' || c as object,
         exists(select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'organizations' and column_name = c) as present
  from unnest(array['commercial_email','whatsapp','instagram','phone','address']) as c

  union all
  select m, 'function ' || f,
         exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = f)
  from (values
    ('202609030001 integridade da estrutura', 'lock_checkflow_checklist'),
    ('202609030001 integridade da estrutura', 'checkflow_checklist_is_protected'),
    ('202609070003 NC atômica',               'record_checkflow_non_conformity'),
    ('202609180002 checkbox obrigatório',     'validate_checkflow_completion_answers'),
    ('202610020001 unidades por empresa',     'lock_checkflow_tenant_link_keys'),
    ('202610020001 unidades por empresa',     'validate_checkflow_unit_tenant_integrity'),
    ('202610020001 unidades por empresa',     'prevent_checkflow_unit_tenant_move')
  ) as t(m, f)

  union all
  select m, 'trigger ' || g,
         exists(select 1 from pg_trigger where tgname = g and not tgisinternal)
  from (values
    ('202609030001 integridade da estrutura', 'enforce_checkflow_structure_immutability'),
    ('202609040003 planos de ação',           'sync_checkflow_action_plan_non_conformity'),
    ('202609180002 checkbox obrigatório',     'validate_checkflow_completion_answers'),
    ('202610020001 unidades por empresa',     'aa_lock_checkflow_tenant_link_keys'),
    ('202610020001 unidades por empresa',     'validate_checkflow_unit_tenant_integrity')
  ) as t(m, g)

  union all
  select m, 'policy ' || pol,
         exists(select 1 from pg_policies where policyname = pol)
  from (values
    ('202609040003 planos de ação',       'checkflow_evidence_unlinked_uploader_delete'),
    ('20261017150310 unidades sem delete', 'unit_manager_insert'),
    ('20261017150310 unidades sem delete', 'unit_manager_update')
  ) as t(m, pol)

  union all
  select '20261017150310 unidades sem delete', 'units sem policy de DELETE',
         not exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'units' and cmd = 'DELETE')
) as checks
order by migration, object;

-- BLOCO 3: colunas de checklist_items que o "Duplicar checklist" (PR #11) copia. Todas devem aparecer (9 linhas).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'checklist_items'
  and column_name in ('prompt','answer_type','position','required','allow_not_applicable','options',
                      'nonconformity_on_no','require_observation_on_failure','require_photo_on_failure')
order by column_name;
