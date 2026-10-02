-- Read-only diagnostic. Run before applying the tenant/unit integrity migration
-- in an environment; this file never repairs or deletes rows.
select 'teams_unit_organization_mismatch' as finding,
       t.id as record_id, t.organization_id, t.unit_id,
       u.organization_id as related_organization_id
from public.teams t
join public.units u on u.id = t.unit_id
where t.organization_id is distinct from u.organization_id
union all
select 'checklists_unit_organization_mismatch', c.id, c.organization_id, c.unit_id,
       u.organization_id
from public.checklists c
join public.units u on u.id = c.unit_id
where c.organization_id is distinct from u.organization_id
union all
select 'assignments_unit_organization_mismatch', a.id, a.organization_id, a.unit_id,
       u.organization_id
from public.checklist_assignments a
join public.units u on u.id = a.unit_id
where a.organization_id is distinct from u.organization_id
union all
select 'execution_assignment_identity_or_unit_mismatch', e.id, e.organization_id, e.unit_id,
       a.organization_id
from public.checklist_executions e
join public.checklist_assignments a on a.id = e.assignment_id
where (e.organization_id, e.checklist_id, e.unit_id)
      is distinct from (a.organization_id, a.checklist_id, a.unit_id)
union all
select 'execution_unit_organization_mismatch', e.id, e.organization_id, e.unit_id,
       u.organization_id
from public.checklist_executions e
join public.units u on u.id = e.unit_id
where e.organization_id is distinct from u.organization_id
union all
select 'unassigned_execution_unit_organization_mismatch', e.id, e.organization_id, e.unit_id,
       u.organization_id
from public.checklist_executions e
join public.units u on u.id = e.unit_id
where e.assignment_id is null
  and e.organization_id is distinct from u.organization_id
union all
select 'non_conformity_unit_organization_mismatch', n.id, n.organization_id, n.unit_id,
       u.organization_id
from public.non_conformities n
join public.units u on u.id = n.unit_id
where n.organization_id is distinct from u.organization_id
union all
select 'non_conformity_execution_unit_mismatch', n.id, n.organization_id, n.unit_id,
       e.organization_id
from public.non_conformities n
join public.checklist_executions e on e.id = n.execution_id
where (n.organization_id, n.unit_id) is distinct from (e.organization_id, e.unit_id)
order by finding, record_id;
