import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const container = process.env.CHECKFLOW_LOCAL_CONTAINER;
const database = process.env.CHECKFLOW_LOCAL_DATABASE;
if (!/^supabase_db_[\w-]+$/.test(container || '') || !/^checkflow_gate_\d+$/.test(database || '')) throw new Error('Explicit isolated local gate target required');
if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('Docker override forbidden');
const endpoint = spawnSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {encoding:'utf8'});
if (endpoint.status !== 0 || !/^(npipe:\/\/|unix:\/\/)/.test(endpoint.stdout.trim())) throw new Error('Local Docker endpoint required');
const fixture = readFileSync(new URL('../supabase/tests/checkflow_start_action_atomicity.sql', import.meta.url),'utf8').split('-- The plan insert')[0].replace("'Foto principal','photo'", "'Foto principal','yes_no'");
const owner = `set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000942',true);`;
const completion = `update public.checklist_executions set status='completed',completed_at=now(),conformity_percentage=100,summary='{}' where id='60000000-0000-0000-0000-000000000941';`;
const newCycle = `insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,created_by) values ('50000000-0000-0000-0000-000000000942','10000000-0000-0000-0000-000000000941','20000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943','00000000-0000-0000-0000-000000000942');
insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,executor_id,created_by) values ('60000000-0000-0000-0000-000000000942','10000000-0000-0000-0000-000000000941','50000000-0000-0000-0000-000000000942','20000000-0000-0000-0000-000000000941','00000000-0000-0000-0000-000000000943','00000000-0000-0000-0000-000000000943');`;
const photo = `select public.record_checkflow_execution_photo_evidence('60000000-0000-0000-0000-000000000941','40000000-0000-0000-0000-000000000942','10000000-0000-0000-0000-000000000941/60000000-0000-0000-0000-000000000941/40000000-0000-0000-0000-000000000942/missing.jpg','missing.jpg','image/jpeg',10);`;
const cases = [
  ['historical answer cannot move to a fresh cycle', owner + completion + newCycle,
    `update public.execution_answers set execution_id='60000000-0000-0000-0000-000000000942' where id='70000000-0000-0000-0000-000000000941';`],
  ['historical NC cannot move to a fresh cycle', owner + completion + newCycle + `insert into public.execution_answers (id,organization_id,execution_id,item_id,value,created_by) values ('70000000-0000-0000-0000-000000000942','10000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000942','40000000-0000-0000-0000-000000000941','false','00000000-0000-0000-0000-000000000943');`,
    `update public.non_conformities set execution_id='60000000-0000-0000-0000-000000000942',answer_id='70000000-0000-0000-0000-000000000942' where id='80000000-0000-0000-0000-000000000941';`],
  ['removed member cannot invoke photo definer RPC', `update public.organization_members set active=false where user_id='00000000-0000-0000-0000-000000000943'; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000943',true);`, photo],
  ['photo RPC cannot link a nonexistent object', owner, photo],
  ['started execution cannot change snapshot identity', owner,
    `update public.checklist_executions set assignment_id=null where id='60000000-0000-0000-0000-000000000941';`],
  ['completion rejects a missing required answer', owner, completion, true],
];
let failed=0;
for (const [name, setup, attack, required] of cases) {
  const caseFixture = required ? fixture.replace('insert into public.checklist_assignments', `update public.checklist_items set required=true where id='40000000-0000-0000-0000-000000000942';\ninsert into public.checklist_assignments`) : fixture;
  const input = caseFixture + setup + `\nSAVEPOINT attack;\n` + attack + '\nROLLBACK;';
  const result = spawnSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{input,encoding:'utf8',timeout:30000});
  // An unrelated setup failure must never masquerade as protection.
  const reached = result.stdout?.includes('SAVEPOINT');
  try {
    assert.ok(reached, `fixture/setup failed: ${result.stderr}`);
    assert.notEqual(result.status,0,'attack was accepted');
    assert.match(result.stderr,/ERROR:/);
    console.log(`PASS ${name}: ${result.stderr.trim()}`);
  } catch(error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`Adversarial cases: ${cases.length}; failed: ${failed}`);
process.exitCode=failed?1:0;
