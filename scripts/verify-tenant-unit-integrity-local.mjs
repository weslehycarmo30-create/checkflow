import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const container = 'supabase_db_checkflow';
const projectUrlExpected = 'http://127.0.0.1:55421';
const databaseHostExpected = '127.0.0.1:55422';

function run(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
  return result.stdout;
}

if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) {
  throw new Error('Remote/overridden Docker contexts are forbidden');
}
const endpoint = run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim();
if (!/^(npipe:\/\/|unix:\/\/)/.test(endpoint)) throw new Error('Docker endpoint must be local');
const labels = run('docker', ['inspect', '--format', '{{ index .Config.Labels "com.supabase.cli.project" }}', container]).trim();
if (labels !== 'checkflow') throw new Error('The selected database container is not labeled for CheckFlow');

// CLI output (including local keys) stays in process memory and is never logged.
const envOutput = run('supabase', ['status', '-o', 'env', '--agent=no']);
const env = Object.fromEntries(envOutput.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) return [];
  return [[match[1], match[2].replace(/^['"]|['"]$/g, '')]];
}));
if (env.API_URL !== projectUrlExpected || !env.DB_URL?.includes(databaseHostExpected)) {
  throw new Error('Supabase endpoints are not the confirmed local CheckFlow endpoints');
}
if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error('Local Auth API keys are unavailable');

const api = env.API_URL;
const anonKey = env.ANON_KEY;
const adminKey = env.SERVICE_ROLE_KEY;
const suffix = randomUUID().replaceAll('-', '');
const organizationA = randomUUID();
const organizationB = randomUUID();
const checklistA = randomUUID();
const checklistB = randomUUID();
const checklistANoUnit = randomUUID();
const unitA = randomUUID();
const unitA2 = randomUUID();
const unitB = randomUUID();
const assignmentCollab = randomUUID();
const assignmentManager = randomUUID();
const assignmentOwnerNoUnit = randomUUID();
const executionCollab = randomUUID();
const executionManager = randomUUID();
const executionOwnerNoUnit = randomUUID();
const checks = [];
const passwords = new Map();

async function request(path, { key = anonKey, token, method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

function check(name, passed, note = '') {
  checks.push({ name, passed, note });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`);
  if (!passed) throw new Error(`Local integration check failed: ${name}`);
}

async function createUser(role) {
  const email = `m35-${role}-${suffix}@local.test`;
  const password = `T-${randomUUID()}-aA9!`;
  const result = await request('/auth/v1/admin/users', {
    key: adminKey,
    token: adminKey,
    method: 'POST',
    body: { email, password, email_confirm: true, user_metadata: { full_name: `M35 ${role}` } },
  });
  if (result.status !== 200 && result.status !== 201) throw new Error(`Local Auth fixture creation failed (${result.status})`);
  passwords.set(role, { email, password, id: result.data.id });
  return result.data.id;
}

async function login(role) {
  const user = passwords.get(role);
  const result = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: user.email, password: user.password },
  });
  if (result.status !== 200 || !result.data?.access_token) throw new Error(`Local Auth login failed for ${role} (${result.status})`);
  return result.data.access_token;
}

async function rest(table, query, token, method = 'GET', body) {
  const path = `/rest/v1/${table}${query ? `?${query}` : ''}`;
  return request(path, { token, method, body, prefer: 'return=representation' });
}

const psql = (sql) => run('docker', [
  'exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
], sql);

function cleanPreviousFixtures() {
  psql(`
    begin;
    create temporary table m35_cleanup_orgs on commit drop as
      select id from public.organizations where name in ('Mission 35 tenant A ${suffix}','Mission 35 tenant B ${suffix}');
    delete from public.action_plans where organization_id in (select id from m35_cleanup_orgs);
    delete from public.non_conformities where organization_id in (select id from m35_cleanup_orgs);
    delete from public.attachments where organization_id in (select id from m35_cleanup_orgs);
    delete from public.execution_answers where organization_id in (select id from m35_cleanup_orgs);
    delete from public.checklist_executions where organization_id in (select id from m35_cleanup_orgs);
    delete from public.checklist_assignments where organization_id in (select id from m35_cleanup_orgs);
    delete from public.team_members where organization_id in (select id from m35_cleanup_orgs);
    delete from public.teams where organization_id in (select id from m35_cleanup_orgs);
    delete from public.checklist_sections where organization_id in (select id from m35_cleanup_orgs);
    delete from public.checklists where organization_id in (select id from m35_cleanup_orgs);
    delete from public.units where organization_id in (select id from m35_cleanup_orgs);
    delete from public.organizations where id in (select id from m35_cleanup_orgs);
    delete from auth.users where email like 'm35-%-${suffix}@local.test';
    commit;
  `);
}

try {
  const ownerA = await createUser('owner-a');
  const managerA = await createUser('manager-a');
  const collaboratorA = await createUser('collaborator-a');
  const ownerB = await createUser('owner-b');

  // Local postgres is used only to prepare isolated fixtures. RLS assertions below
  // use access tokens issued by local Supabase Auth, never the service-role key.
  const q = (value) => `'${value.replaceAll("'", "''")}'`;
  psql(`
    begin;
    insert into public.organizations(id,name,created_by) values
      (${q(organizationA)},${q(`Mission 35 tenant A ${suffix}`)},${q(ownerA)}),
      (${q(organizationB)},${q(`Mission 35 tenant B ${suffix}`)},${q(ownerB)});
    insert into public.organization_members(organization_id,user_id,role,active,created_by) values
      (${q(organizationA)},${q(ownerA)},'owner',true,${q(ownerA)}),
      (${q(organizationA)},${q(managerA)},'manager',true,${q(ownerA)}),
      (${q(organizationA)},${q(collaboratorA)},'collaborator',true,${q(ownerA)}),
      (${q(organizationB)},${q(ownerB)},'owner',true,${q(ownerB)});
    insert into public.units(id,organization_id,name,created_by) values
      (${q(unitA)},${q(organizationA)},'M35 A1',${q(ownerA)}),
      (${q(unitA2)},${q(organizationA)},'M35 A2',${q(ownerA)}),
      (${q(unitB)},${q(organizationB)},'M35 B1',${q(ownerB)});
    insert into public.checklists(id,organization_id,name,created_by) values
      (${q(checklistA)},${q(organizationA)},'M35 Checklist A',${q(ownerA)}),
      (${q(checklistB)},${q(organizationB)},'M35 Checklist B',${q(ownerB)}),
      (${q(checklistANoUnit)},${q(organizationA)},'M35 Checklist A no unit',${q(ownerA)});
    insert into public.checklist_assignments(id,organization_id,checklist_id,assigned_to,unit_id,active,created_by) values
      (${q(assignmentCollab)},${q(organizationA)},${q(checklistA)},${q(collaboratorA)},${q(unitA)},true,${q(ownerA)}),
      (${q(assignmentManager)},${q(organizationA)},${q(checklistA)},${q(managerA)},${q(unitA)},true,${q(ownerA)}),
      (${q(assignmentOwnerNoUnit)},${q(organizationA)},${q(checklistANoUnit)},${q(ownerA)},null,true,${q(ownerA)});
    commit;
  `);
  const tokenA = await login('owner-a');
  const tokenManager = await login('manager-a');
  const tokenCollaborator = await login('collaborator-a');
  const tokenB = await login('owner-b');

  const ownerCreateId = randomUUID();
  const ownerCreate = await rest('units', '', tokenA, 'POST', { id: ownerCreateId, organization_id: organizationA, name: 'Owner API unit', created_by: ownerA });
  check('Owner A creates unit in organization A', ownerCreate.status === 201 && ownerCreate.data?.[0]?.id === ownerCreateId, `HTTP ${ownerCreate.status}`);

  const managerCreateId = randomUUID();
  const managerCreate = await rest('units', '', tokenManager, 'POST', { id: managerCreateId, organization_id: organizationA, name: 'Manager API unit', created_by: managerA });
  check('Manager A creates unit in organization A', managerCreate.status === 201 && managerCreate.data?.[0]?.id === managerCreateId, `HTTP ${managerCreate.status}`);

  const collaboratorCreate = await rest('units', '', tokenCollaborator, 'POST', { organization_id: organizationA, name: 'Forbidden unit', created_by: collaboratorA });
  check('Collaborator cannot create unit', collaboratorCreate.status >= 400, `HTTP ${collaboratorCreate.status}`);

  const collaboratorDeactivate = await rest('units', `id=eq.${unitA}`, tokenCollaborator, 'PATCH', { active: false });
  const unitAfterCollaborator = await rest('units', `id=eq.${unitA}&select=active`, tokenA);
  check('Collaborator cannot deactivate unit', collaboratorDeactivate.status < 400 && !collaboratorDeactivate.data?.length && unitAfterCollaborator.data?.[0]?.active === true, `HTTP ${collaboratorDeactivate.status}`);

  const bRead = await rest('units', `id=eq.${unitA}&select=id`, tokenB);
  check('Owner B cannot read units from A', bRead.status === 200 && Array.isArray(bRead.data) && bRead.data.length === 0, `HTTP ${bRead.status}`);
  await rest('units', `id=eq.${unitA}`, tokenB, 'PATCH', { name: 'Cross-tenant edit' });
  const unitAfterB = await rest('units', `id=eq.${unitA}&select=name`, tokenA);
  check('Owner B cannot modify units from A', unitAfterB.data?.[0]?.name === 'M35 A1', `observed ${unitAfterB.data?.[0]?.name || 'no row'}`);

  const managerCrossCreate = await rest('units', '', tokenManager, 'POST', { organization_id: organizationB, name: 'Cross-tenant unit', created_by: managerA });
  check('Manager A cannot create a unit in organization B', managerCrossCreate.status >= 400, `HTTP ${managerCrossCreate.status}`);

  const badTeam = await rest('teams', '', tokenManager, 'POST', { organization_id: organizationA, unit_id: unitB, name: 'Invalid cross-tenant team', created_by: managerA });
  check('Team A rejects unit B', badTeam.status >= 400, `HTTP ${badTeam.status}`);
  const validTeamId = randomUUID();
  const validTeam = await rest('teams', '', tokenManager, 'POST', { id: validTeamId, organization_id: organizationA, unit_id: unitA, name: 'Valid team A', created_by: managerA });
  check('Manager creates a valid team A', validTeam.status === 201, `HTTP ${validTeam.status}`);
  const changedTeam = await rest('teams', `id=eq.${validTeamId}`, tokenManager, 'PATCH', { unit_id: unitB });
  check('Team update cannot introduce cross-tenant unit', changedTeam.status >= 400, `HTTP ${changedTeam.status}`);
  const badChecklist = await rest('checklists', '', tokenManager, 'POST', { organization_id: organizationA, unit_id: unitB, name: 'Invalid cross-tenant checklist', created_by: managerA });
  check('Checklist A rejects unit B', badChecklist.status >= 400, `HTTP ${badChecklist.status}`);
  const changedAssignment = await rest('checklist_assignments', `id=eq.${assignmentManager}`, tokenManager, 'PATCH', { unit_id: unitB });
  check('Assignment update cannot introduce cross-tenant unit', changedAssignment.status >= 400, `HTTP ${changedAssignment.status}`);

  const executionPayload = (id, assignment, executor, unit) => ({
    id, organization_id: organizationA, assignment_id: assignment, checklist_id: checklistA,
    unit_id: unit, executor_id: executor, created_by: executor, status: 'in_progress',
  });
  const goodCollaboratorExecution = await rest('checklist_executions', '', tokenCollaborator, 'POST', executionPayload(executionCollab, assignmentCollab, collaboratorA, unitA));
  check('Collaborator starts a valid assigned execution', goodCollaboratorExecution.status === 201, `HTTP ${goodCollaboratorExecution.status}`);

  for (const [name, unit] of [
    ['same-tenant different unit', unitA2],
    ['cross-tenant unit', unitB],
    ['null unit when assignment has a unit', null],
  ]) {
    const rejected = await rest('checklist_executions', '', tokenManager, 'POST', executionPayload(randomUUID(), assignmentManager, managerA, unit));
    check(`Execution rejects ${name}`, rejected.status >= 400, `HTTP ${rejected.status}`);
  }
  const goodManagerExecution = await rest('checklist_executions', '', tokenManager, 'POST', executionPayload(executionManager, assignmentManager, managerA, unitA));
  check('Manager starts valid execution matching assigned unit', goodManagerExecution.status === 201, `HTTP ${goodManagerExecution.status}`);

  const goodNullExecution = await rest('checklist_executions', '', tokenA, 'POST', {
    id: executionOwnerNoUnit, organization_id: organizationA, assignment_id: assignmentOwnerNoUnit,
    checklist_id: checklistANoUnit, unit_id: null, executor_id: ownerA, created_by: ownerA, status: 'in_progress',
  });
  check('Null unit is accepted when assignment unit is null', goodNullExecution.status === 201, `HTTP ${goodNullExecution.status}`);

  const changedExecution = await rest('checklist_executions', `id=eq.${executionManager}`, tokenManager, 'PATCH', { unit_id: unitA2 });
  check('Execution identity update cannot introduce unit mismatch', changedExecution.status >= 400, `HTTP ${changedExecution.status}`);
  const changedChecklist = await rest('checklists', `id=eq.${checklistA}`, tokenManager, 'PATCH', { unit_id: unitB });
  check('Checklist update cannot introduce cross-tenant unit', changedChecklist.status >= 400, `HTTP ${changedChecklist.status}`);

  const movedUnit = await rest('units', `id=eq.${unitA}`, tokenA, 'PATCH', { organization_id: organizationB });
  check('Referenced unit cannot move across organizations', movedUnit.status >= 400, `HTTP ${movedUnit.status}`);

  const deactivated = await rest('units', `id=eq.${unitA}`, tokenA, 'PATCH', { active: false });
  const activeUnits = await rest('units', `organization_id=eq.${organizationA}&active=eq.true&select=id`, tokenA);
  const retainedAssignment = await rest('checklist_assignments', `id=eq.${assignmentCollab}&select=unit_id`, tokenA);
  const retainedExecution = await rest('checklist_executions', `id=eq.${executionCollab}&select=unit_id`, tokenA);
  check('Owner deactivates a unit; existing assignment/execution references remain; inactive unit absent from active options',
    deactivated.status < 400 && activeUnits.status === 200 && !activeUnits.data.some((unit) => unit.id === unitA)
      && retainedAssignment.data?.[0]?.unit_id === unitA && retainedExecution.data?.[0]?.unit_id === unitA,
    `deactivation HTTP ${deactivated.status}`);
} finally {
  // Remove only fixtures created by this run from this explicitly local DB/Auth.
  try {
    cleanPreviousFixtures();
  } catch {
    console.error('Temporary local fixture cleanup failed');
  }
  passwords.clear();
}

console.log(`REAL LOCAL JWT CHECKS: ${checks.filter((item) => item.passed).length}/${checks.length} passed`);
