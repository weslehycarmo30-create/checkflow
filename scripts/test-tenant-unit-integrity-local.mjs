import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const container = 'supabase_db_checkflow';

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

async function assertRejected(name, sql, expectedMessage) {
  const result = await psql(`
    do $$
    declare rejected boolean := false; error_state text; error_message text;
    begin
      begin
        ${sql}
      exception when others then
        get stacked diagnostics error_state = returned_sqlstate, error_message = message_text;
        if error_state = 'P0001' and position('${expectedMessage}' in error_message) > 0 then
          rejected := true;
        else
          raise;
        end if;
      end;
      if not rejected then raise exception 'expected integrity rejection was not raised: ${name}'; end if;
    end
    $$;
  `);
  if (result.code !== 0) throw new Error(`${name} failed: ${result.stderr || result.stdout}`);
  process.stdout.write(`Passed: ${name}.\n`);
}

const orgA = randomUUID();
const orgB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const userA2 = randomUUID();
const unitA = randomUUID();
const unitB = randomUUID();
const teamA = randomUUID();
const teamRls = randomUUID();
const teamInvalidRls = randomUUID();
const checklistA = randomUUID();
const sectionA = randomUUID();
const itemA = randomUUID();
const assignmentA = randomUUID();
const executionA = randomUUID();
const answerA = randomUUID();
const slug = `tenant-integrity-local-${orgA}`;
let fixtureCreated = false;

try {
  const setup = await psql(`
    begin;
    insert into public.organizations (id, name, slug) values
      ('${orgA}', 'Integrity local A', '${slug}'),
      ('${orgB}', 'Integrity local B', '${slug}-b');
    insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
      ('${userA}', 'authenticated', 'authenticated', 'tenant-a-${userA}@invalid.example', '{}'::jsonb, '{}'::jsonb),
      ('${userB}', 'authenticated', 'authenticated', 'tenant-b-${userB}@invalid.example', '{}'::jsonb, '{}'::jsonb),
      ('${userA2}', 'authenticated', 'authenticated', 'tenant-a2-${userA2}@invalid.example', '{}'::jsonb, '{}'::jsonb);
    insert into public.organization_members (organization_id, user_id, role, active) values
      ('${orgA}', '${userA}', 'owner', true),
      ('${orgA}', '${userA2}', 'owner', true),
      ('${orgB}', '${userB}', 'owner', true);
    insert into public.units (id, organization_id, name) values
      ('${unitA}', '${orgA}', 'Integrity unit A'),
      ('${unitB}', '${orgB}', 'Integrity unit B');
    insert into public.checklists (id, organization_id, name)
      values ('${checklistA}', '${orgA}', 'Integrity checklist');
    insert into public.checklist_sections (id, organization_id, checklist_id, title)
      values ('${sectionA}', '${orgA}', '${checklistA}', 'Integrity section');
    insert into public.checklist_items (id, organization_id, section_id, prompt, answer_type)
      values ('${itemA}', '${orgA}', '${sectionA}', 'Integrity item', 'checkbox');
    insert into public.teams (id, organization_id, unit_id, name)
      values ('${teamA}', '${orgA}', '${unitA}', 'Valid integrity team');
    insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to, unit_id)
      values ('${assignmentA}', '${orgA}', '${checklistA}', '${userA}', '${unitA}');
    insert into public.checklist_executions (id, organization_id, checklist_id, assignment_id, unit_id, executor_id)
      values ('${executionA}', '${orgA}', '${checklistA}', '${assignmentA}', '${unitA}', '${userA}');
    insert into public.execution_answers (id, organization_id, execution_id, item_id, value, created_by)
      values ('${answerA}', '${orgA}', '${executionA}', '${itemA}', 'true'::jsonb, '${userA}');
    commit;
  `);
  if (setup.code !== 0) throw new Error(`Local fixture setup failed: ${setup.stderr}`);
  fixtureCreated = true;

  await assertRejected('team cannot reference another organization unit', `
    insert into public.teams (organization_id, unit_id, name) values ('${orgA}', '${unitB}', 'Invalid team');
  `, 'A unidade não pertence à organização');
  await assertRejected('checklist cannot reference another organization unit', `
    insert into public.checklists (organization_id, unit_id, name) values ('${orgA}', '${unitB}', 'Invalid checklist');
  `, 'A unidade não pertence à organização');
  await assertRejected('assignment cannot reference another organization unit', `
    insert into public.checklist_assignments (organization_id, checklist_id, assigned_to, unit_id)
    values ('${orgA}', '${checklistA}', '${userA2}', '${unitB}');
  `, 'A unidade não pertence à organização');
  await assertRejected('execution unit must match its assignment exactly', `
    insert into public.checklist_executions (organization_id, checklist_id, assignment_id, unit_id, executor_id)
    values ('${orgA}', '${checklistA}', '${assignmentA}', '${unitB}', '${userA}');
  `, 'A unidade da execução deve corresponder exatamente à atribuição');
  await assertRejected('nonconformity unit must match its execution', `
    insert into public.non_conformities
      (organization_id, execution_id, answer_id, item_id, unit_id, executor_id, observation, created_by)
    values ('${orgA}', '${executionA}', '${answerA}', '${itemA}', '${unitB}', '${userA}', 'Invalid unit link', '${userA}');
  `, 'A unidade da não conformidade deve corresponder à execução');
  await assertRejected('referenced unit organization cannot move', `
    update public.units set organization_id='${orgB}' where id='${unitA}';
  `, 'A organização de uma unidade referenciada não pode ser alterada');
  await assertRejected('referenced checklist organization cannot move', `
    update public.checklists set organization_id='${orgB}' where id='${checklistA}';
  `, 'A estrutura do checklist está protegida');

  const rlsRead = await psql(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${userA}', true);
    select (select count(*) from public.units where id='${unitA}') || '|' ||
           (select count(*) from public.units where id='${unitB}');
    commit;
  `);
  if (rlsRead.code !== 0 || !rlsRead.stdout.trim().split(/\s+/).includes('1|0')) {
    throw new Error(`RLS organization isolation failed for user A: ${rlsRead.stderr || rlsRead.stdout}`);
  }
  process.stdout.write('Passed: authenticated RLS shows own organization only.\n');

  const rlsValidInsert = await psql(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${userA}', true);
    insert into public.teams (id, organization_id, unit_id, name, created_by)
      values ('${teamRls}', '${orgA}', '${unitA}', 'RLS valid team', '${userA}');
    commit;
  `);
  if (rlsValidInsert.code !== 0) throw new Error(`RLS valid insert failed: ${rlsValidInsert.stderr}`);
  process.stdout.write('Passed: authenticated owner can perform valid tenant insert.\n');

  const rlsInvalidInsert = await psql(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${userA}', true);
    insert into public.teams (id, organization_id, unit_id, name, created_by)
      values ('${teamInvalidRls}', '${orgA}', '${unitB}', 'RLS invalid team', '${userA}');
    commit;
  `);
  if (rlsInvalidInsert.code === 0 || !rlsInvalidInsert.stderr.includes('A unidade não pertence à organização')) {
    throw new Error(`RLS cross-tenant write was not rejected by integrity trigger: ${rlsInvalidInsert.stderr}`);
  }
  process.stdout.write('Passed: authenticated cross-tenant insert is rejected by integrity trigger.\n');

  const privileges = await psql(`
    select has_table_privilege('anon', 'public.units', 'TRUNCATE') or
           has_table_privilege('authenticated', 'public.units', 'TRUNCATE');
  `);
  if (privileges.code !== 0 || privileges.stdout.trim() !== 'f') {
    throw new Error(`API roles still have effective TRUNCATE on public.units: ${privileges.stdout || privileges.stderr}`);
  }
  process.stdout.write('Passed: anon and authenticated have no effective TRUNCATE on public.units.\n');
} finally {
  if (fixtureCreated) {
    const cleanup = await psql(`
      begin;
      delete from public.non_conformities where execution_id='${executionA}';
      delete from public.execution_answers where id='${answerA}';
      delete from public.checklist_executions where id='${executionA}';
      delete from public.checklist_assignments where id='${assignmentA}';
      delete from public.teams where id in ('${teamA}', '${teamRls}', '${teamInvalidRls}');
      delete from public.checklist_items where id='${itemA}';
      delete from public.checklist_sections where id='${sectionA}';
      delete from public.checklists where id='${checklistA}';
      delete from public.units where id in ('${unitA}', '${unitB}');
      delete from public.organization_members where organization_id in ('${orgA}', '${orgB}');
      delete from public.organizations where id in ('${orgA}', '${orgB}');
      delete from auth.users where id in ('${userA}', '${userB}', '${userA2}');
      commit;
    `);
    if (cleanup.code !== 0) throw new Error(`Local fixture cleanup failed: ${cleanup.stderr}`);
  }
}
