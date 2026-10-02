import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const container = 'supabase_db_checkflow';
const baselineMode = process.argv.includes('--expect-vulnerable');

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function startPsql(sql) {
  const child = spawn('docker', [
    'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stdin.end(sql);
  return child;
}

function waitForOutput(child, needle) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out waiting for local psql output: ${needle}`));
    }, 10_000);
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
      if (stdout.includes(needle)) {
        clearTimeout(timeout);
        resolve({ stdout, stderr });
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local psql exited before ${needle} (code ${code}): ${stderr}`));
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const orgA = randomUUID();
const orgB = randomUUID();
const user = randomUUID();
const checklist = randomUUID();
const checklistMoveTarget = randomUUID();
const unitIds = Object.fromEntries(['team', 'checklist', 'assignment', 'execution'].map((key) => [key, randomUUID()]));
unitIds.parentFirstTeam = randomUUID();
unitIds.assignmentExecution = randomUUID();
const assignmentId = randomUUID();
const slug = `tenant-link-concurrency-${orgA}`;
const email = `tenant-link-${user}@invalid.example`;
const insertedRecords = [];
let fixtureCreated = false;

async function runRace({ name, moverSql, insertSql, mismatchSql, table, insertedId, expectedError }) {
  const mover = startPsql(`
    begin;
    set local lock_timeout = '8s';
    ${moverSql}
    select pg_sleep(1.5);
    commit;
  `);
  const moverExit = waitForExit(mover);
  await waitForOutput(mover, 'UPDATE 1');
  const insertResult = await psql(`
    begin;
    set local lock_timeout = '7s';
    ${insertSql}
    commit;
  `);
  const moverResult = await moverExit;
  if (moverResult.code !== 0) throw new Error(`${name}: parent change failed: ${moverResult.stderr}`);

  const checked = await psql(mismatchSql);
  if (checked.code !== 0) throw new Error(`${name}: local verification failed: ${checked.stderr}`);
  const mismatchCount = Number(checked.stdout.trim());
  const insertAccepted = insertResult.code === 0;
  const rejectedForIntegrity = !insertAccepted && insertResult.stderr.includes(expectedError);
  insertedRecords.push({ table, id: insertedId });

  if (baselineMode) {
    if (!insertAccepted || mismatchCount !== 1) {
      throw new Error(`${name}: expected to reproduce race, insert=${insertAccepted}, mismatches=${mismatchCount}`);
    }
    process.stdout.write(`Reproduced: concurrent ${name} write committed with a cross-tenant link.\n`);
  } else if (!rejectedForIntegrity || mismatchCount !== 0) {
    throw new Error(`${name}: expected rejection '${expectedError}', insert=${insertAccepted}, mismatches=${mismatchCount}, error=${insertResult.stderr}`);
  } else {
    process.stdout.write(`Passed: conflicting concurrent ${name} write was rejected.\n`);
  }
}

async function runParentAfterChild({ name, childSql, parentSql, mismatchSql, table, insertedId, expectedError }) {
  const child = startPsql(`
    begin;
    set local lock_timeout = '8s';
    ${childSql}
    select pg_sleep(1.5);
    commit;
  `);
  const childExit = waitForExit(child);
  await waitForOutput(child, 'INSERT 0 1');
  const parent = await psql(`
    begin;
    set local lock_timeout = '7s';
    ${parentSql}
    commit;
  `);
  const childResult = await childExit;
  if (childResult.code !== 0) throw new Error(`${name}: child insert failed: ${childResult.stderr}`);
  insertedRecords.push({ table, id: insertedId });

  const checked = await psql(mismatchSql);
  if (checked.code !== 0) throw new Error(`${name}: local verification failed: ${checked.stderr}`);
  const mismatchCount = Number(checked.stdout.trim());
  if (parent.code === 0 || !parent.stderr.includes(expectedError) || mismatchCount !== 0) {
    throw new Error(`${name}: expected parent update rejection '${expectedError}', mismatches=${mismatchCount}, error=${parent.stderr}`);
  }
  process.stdout.write(`Passed: parent change waits for child and is rejected (${name}).\n`);
}

try {
  const setup = await psql(`
    begin;
    insert into public.organizations (id, name, slug) values
      ('${orgA}', 'Concurrency A', '${slug}'),
      ('${orgB}', 'Concurrency B', '${slug}-b');
    insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
      values ('${user}', 'authenticated', 'authenticated', '${email}', '{}'::jsonb, '{}'::jsonb);
    insert into public.organization_members (organization_id, user_id, role, active)
      values ('${orgA}', '${user}', 'owner', true);
    insert into public.checklists (id, organization_id, name)
      values ('${checklist}', '${orgA}', 'Concurrency parent checklist');
    insert into public.checklists (id, organization_id, name)
      values ('${checklistMoveTarget}', '${orgA}', 'Checklist move target');
    insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to)
      values ('${assignmentId}', '${orgA}', '${checklist}', '${user}');
    insert into public.units (id, organization_id, name) values
      ('${unitIds.team}', '${orgA}', 'Concurrency team unit'),
      ('${unitIds.checklist}', '${orgA}', 'Concurrency checklist unit'),
      ('${unitIds.assignment}', '${orgA}', 'Concurrency assignment unit'),
      ('${unitIds.execution}', '${orgA}', 'Concurrency execution unit'),
      ('${unitIds.parentFirstTeam}', '${orgA}', 'Parent-first concurrency unit'),
      ('${unitIds.assignmentExecution}', '${orgA}', 'Assignment execution concurrency unit');
    commit;
  `);
  if (setup.code !== 0) throw new Error(`Local fixture setup failed: ${setup.stderr}`);
  fixtureCreated = true;

  const teamId = randomUUID();
  await runRace({
    name: 'team insert vs unit move',
    moverSql: `update public.units set organization_id='${orgB}' where id='${unitIds.team}';`,
    insertSql: `insert into public.teams (id, organization_id, unit_id, name) values ('${teamId}', '${orgA}', '${unitIds.team}', 'Concurrent team');`,
    mismatchSql: `select count(*) from public.teams where unit_id='${unitIds.team}' and organization_id is distinct from (select organization_id from public.units where id='${unitIds.team}');`,
    table: 'teams',
    insertedId: teamId,
    expectedError: 'A unidade não pertence à organização',
  });
  const checklistInsertId = randomUUID();
  await runRace({
    name: 'checklist insert vs unit move',
    moverSql: `update public.units set organization_id='${orgB}' where id='${unitIds.checklist}';`,
    insertSql: `insert into public.checklists (id, organization_id, unit_id, name) values ('${checklistInsertId}', '${orgA}', '${unitIds.checklist}', 'Concurrent checklist');`,
    mismatchSql: `select count(*) from public.checklists where unit_id='${unitIds.checklist}' and organization_id is distinct from (select organization_id from public.units where id='${unitIds.checklist}');`,
    table: 'checklists',
    insertedId: checklistInsertId,
    expectedError: 'A unidade não pertence à organização',
  });
  const assignmentInsertId = randomUUID();
  await runRace({
    name: 'assignment insert vs unit move',
    moverSql: `update public.units set organization_id='${orgB}' where id='${unitIds.assignment}';`,
    insertSql: `insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to, unit_id) values ('${assignmentInsertId}', '${orgA}', '${checklistMoveTarget}', '${user}', '${unitIds.assignment}');`,
    mismatchSql: `select count(*) from public.checklist_assignments where unit_id='${unitIds.assignment}' and organization_id is distinct from (select organization_id from public.units where id='${unitIds.assignment}');`,
    table: 'checklist_assignments',
    insertedId: assignmentInsertId,
    expectedError: 'A unidade não pertence à organização',
  });
  const executionInsertId = randomUUID();
  await runRace({
    name: 'unassigned execution insert vs unit move',
    moverSql: `update public.units set organization_id='${orgB}' where id='${unitIds.execution}';`,
    insertSql: `insert into public.checklist_executions (id, organization_id, checklist_id, unit_id, executor_id) values ('${executionInsertId}', '${orgA}', '${checklist}', '${unitIds.execution}', '${user}');`,
    mismatchSql: `select count(*) from public.checklist_executions where unit_id='${unitIds.execution}' and organization_id is distinct from (select organization_id from public.units where id='${unitIds.execution}');`,
    table: 'checklist_executions',
    insertedId: executionInsertId,
    expectedError: 'A unidade da execução não pertence à organização',
  });

  const assignmentRaceId = randomUUID();
  await runRace({
    name: 'assignment insert vs checklist tenant move',
    moverSql: `update public.checklists set organization_id='${orgB}' where id='${checklistMoveTarget}';`,
    insertSql: `insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to) values ('${assignmentRaceId}', '${orgA}', '${checklistMoveTarget}', '${user}');`,
    mismatchSql: `select count(*) from public.checklist_assignments a join public.checklists c on c.id=a.checklist_id where a.id='${assignmentRaceId}' and a.organization_id is distinct from c.organization_id;`,
    table: 'checklist_assignments',
    insertedId: assignmentRaceId,
    expectedError: 'Vínculo entre organizações inválido',
  });

  const inactiveExecutionId = randomUUID();
  await runRace({
    name: 'execution insert vs assignment deactivation',
    moverSql: `update public.checklist_assignments set active=false where id='${assignmentId}';`,
    insertSql: `insert into public.checklist_executions (id, organization_id, checklist_id, assignment_id, executor_id) values ('${inactiveExecutionId}', '${orgA}', '${checklist}', '${assignmentId}', '${user}');`,
    mismatchSql: `select count(*) from public.checklist_executions e join public.checklist_assignments a on a.id=e.assignment_id where e.id='${inactiveExecutionId}' and not a.active;`,
    table: 'checklist_executions',
    insertedId: inactiveExecutionId,
    expectedError: 'A execução não corresponde a uma atribuição ativa do executor',
  });
  const reactivate = await psql(`update public.checklist_assignments set active=true where id='${assignmentId}';`);
  if (reactivate.code !== 0) throw new Error(`Could not reactivate local assignment fixture: ${reactivate.stderr}`);

  const parentFirstTeamId = randomUUID();
  await runParentAfterChild({
    name: 'team insert before unit move',
    childSql: `insert into public.teams (id, organization_id, unit_id, name) values ('${parentFirstTeamId}', '${orgA}', '${unitIds.parentFirstTeam}', 'Child-first team');`,
    parentSql: `update public.units set organization_id='${orgB}' where id='${unitIds.parentFirstTeam}';`,
    mismatchSql: `select count(*) from public.teams where id='${parentFirstTeamId}' and organization_id is distinct from (select organization_id from public.units where id='${unitIds.parentFirstTeam}');`,
    table: 'teams',
    insertedId: parentFirstTeamId,
    expectedError: 'A organização de uma unidade referenciada não pode ser alterada',
  });

  const targetChecklistReset = await psql(`update public.checklists set organization_id='${orgA}' where id='${checklistMoveTarget}';`);
  if (targetChecklistReset.code !== 0) throw new Error(`Could not reset local checklist test fixture: ${targetChecklistReset.stderr}`);
  const parentFirstAssignmentId = randomUUID();
  await runParentAfterChild({
    name: 'assignment insert before checklist move',
    childSql: `insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to) values ('${parentFirstAssignmentId}', '${orgA}', '${checklistMoveTarget}', '${user}');`,
    parentSql: `update public.checklists set organization_id='${orgB}' where id='${checklistMoveTarget}';`,
    mismatchSql: `select count(*) from public.checklist_assignments a join public.checklists c on c.id=a.checklist_id where a.id='${parentFirstAssignmentId}' and a.organization_id is distinct from c.organization_id;`,
    table: 'checklist_assignments',
    insertedId: parentFirstAssignmentId,
    expectedError: 'A estrutura do checklist está protegida',
  });

  const linkedExecutionId = randomUUID();
  await runParentAfterChild({
    name: 'execution insert before assignment identity change',
    childSql: `insert into public.checklist_executions (id, organization_id, checklist_id, assignment_id, executor_id) values ('${linkedExecutionId}', '${orgA}', '${checklist}', '${assignmentId}', '${user}');`,
    parentSql: `update public.checklist_assignments set unit_id='${unitIds.assignmentExecution}' where id='${assignmentId}';`,
    mismatchSql: `select count(*) from public.checklist_assignments a join public.checklist_executions e on e.assignment_id=a.id where a.id='${assignmentId}' and (e.organization_id,e.checklist_id,e.unit_id) is distinct from (a.organization_id,a.checklist_id,a.unit_id);`,
    table: 'checklist_executions',
    insertedId: linkedExecutionId,
    expectedError: 'A identidade de uma atribuição iniciada é imutável',
  });
} finally {
  if (fixtureCreated) {
    const cleanup = await psql(`
      begin;
      ${insertedRecords.filter((r) => r.table === 'checklist_executions').map((r) => `delete from public.checklist_executions where id='${r.id}';`).join('\n')}
      ${insertedRecords.filter((r) => r.table === 'teams').map((r) => `delete from public.teams where id='${r.id}';`).join('\n')}
      ${insertedRecords.filter((r) => r.table === 'checklist_assignments').map((r) => `delete from public.checklist_assignments where id='${r.id}';`).join('\n')}
      delete from public.checklist_assignments where id='${assignmentId}';
      ${insertedRecords.filter((r) => r.table === 'checklists').map((r) => `delete from public.checklists where id='${r.id}';`).join('\n')}
      delete from public.units where id in ('${Object.values(unitIds).join("','")}');
      delete from public.checklists where id in ('${checklist}', '${checklistMoveTarget}');
      delete from public.organization_members where organization_id='${orgA}' and user_id='${user}';
      delete from public.organizations where id in ('${orgA}', '${orgB}');
      delete from auth.users where id='${user}';
      commit;
    `);
    if (cleanup.code !== 0) throw new Error(`Local fixture cleanup failed: ${cleanup.stderr}`);
  }
}
