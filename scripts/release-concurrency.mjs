import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const container=process.env.CHECKFLOW_LOCAL_CONTAINER, database=process.env.CHECKFLOW_LOCAL_DATABASE;
if (!/^supabase_db_[\w-]+$/.test(container||'') || !/^checkflow_gate_\d+$/.test(database||'')) throw new Error('Isolated local gate target required');
if(process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('Docker overrides forbidden');
const endpoint=spawnSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'});
if(endpoint.status!==0 || !/^(npipe:\/\/|unix:\/\/)/.test(endpoint.stdout.trim())) throw new Error('Local Docker socket required');
const args=['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',database];
function sync(input) {
  const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:30000});
  if(r.status!==0) throw new Error(r.stderr||r.error?.message);
  return r.stdout;
}
function session(input,onReady=()=>{}) {
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',ready=false;
  child.stdout.on('data',chunk=>{stdout+=chunk;if(!ready&&stdout.includes('BARRIER')){ready=true;onReady();}});
  child.stderr.on('data',chunk=>{stderr+=chunk;if(!ready&&stderr.includes('BARRIER')){ready=true;onReady();}});
  const timer=setTimeout(()=>child.kill(),20000);
  child.stdin.end(input);
  return new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
  });
}
const fixture=readFileSync(new URL('../supabase/tests/checkflow_start_action_atomicity.sql',import.meta.url),'utf8').split('-- The plan insert')[0].replace("'Foto principal','photo'","'Foto principal','yes_no'");
const beforeAssignment=fixture.split('insert into public.checklist_assignments')[0];
const beforeExecution=fixture.split('insert into public.checklist_executions')[0];
const assignment=fixture.match(/insert into public.checklist_assignments[^;]+;/)[0];
const execution=fixture.match(/insert into public.checklist_executions[^;]+;/)[0];
const complete=`update public.checklist_executions set status='completed',completed_at=clock_timestamp(),conformity_percentage=100,summary='{}' where id='60000000-0000-0000-0000-000000000941';`;
const pause=`update public.checklist_executions set status='paused',paused_at=now() where id='60000000-0000-0000-0000-000000000941';`;
const answer=`update public.execution_answers set value='"Sim"' where id='70000000-0000-0000-0000-000000000941';`;
const edit=`update public.checklist_items set prompt='edited concurrently' where id='40000000-0000-0000-0000-000000000941';`;
const plan=`insert into public.action_plans(organization_id,non_conformity_id,description,status,created_by) values ('10000000-0000-0000-0000-000000000941','80000000-0000-0000-0000-000000000941','Concurrent plan','in_progress','00000000-0000-0000-0000-000000000942');`;
const cases=[
  ['A assignments',beforeAssignment,assignment,assignment.replace("(id,","(id,").replace("'50000000-0000-0000-0000-000000000941'","'50000000-0000-0000-0000-000000000944'"),/atribuição operacional/],
  ['B starts',beforeExecution,execution,execution.replace("'60000000-0000-0000-0000-000000000941'","'60000000-0000-0000-0000-000000000944'"),/unique constraint/],
  ['C completes',fixture,complete,complete,/concluída/],
  ['D pause then complete',fixture,pause,complete,/Conclusão exige|Transição de execução inválida/],
  ['E edit then assignment',beforeAssignment,edit,assignment,null],
  ['E assignment then edit',beforeAssignment,assignment,edit,/estrutura.*protegida/],
  ['F edit then start',beforeAssignment,edit,execution.replace("'50000000-0000-0000-0000-000000000941'","null"),null],
  ['F start then edit',beforeAssignment,execution.replace("'50000000-0000-0000-0000-000000000941'","null"),edit,/estrutura.*protegida/],
  ['G action plans',fixture,plan,plan,/unique constraint/],
  ['answer then complete',fixture,answer,complete,null],
  ['complete then answer',fixture,complete,answer,/execução em andamento/],
];
let failures=0,index=0;
for(const [name,setup,first,second,expectedError] of cases){
  index++;
  if(process.argv.includes('--deadlock-only')) continue;
  // Unique tenants per scenario, retained for inspection. Use a fresh gate DB
  // for each run. No sleeps are used to guess whether the first lock exists:
  // the second session starts only after psql emits a post-DML barrier.
  const map=text=>text.replace(/941|942|943|944/g,n=>String(100+index*10+Number(n)-941)).replace(/@local\.test/g,`+race${index}@local.test`);
  try {
    sync(map(setup)+'\nCOMMIT;');
    const auth=map(`begin;set local statement_timeout='12s';set local lock_timeout='8s';set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000942',true);`);
    let secondPromise;
    const a=await session(auth+map(first)+"\n\\echo BARRIER\nselect pg_sleep(0.8);commit;",()=>{secondPromise=session(auth+map(second)+'commit;');});
    assert.equal(a.code,0,`first transaction failed: ${a.stderr}`);
    assert.ok(secondPromise,'barrier not reached');
    let b=await secondPromise;
    const retried=/operação concorrente/.test(b.stderr);
    if(retried) b=await session(auth+map(second)+'commit;');
    assert.doesNotMatch(a.stderr+b.stderr,/deadlock detected|lock timeout|statement timeout/);
    if(expectedError){assert.notEqual(b.code,0);assert.match(b.stderr,expectedError);}
    else assert.equal(b.code,0,b.stderr);
    if(name==='answer then complete'){
      const result=sync(map(`select conformity_percentage from public.checklist_executions where id='60000000-0000-0000-0000-000000000941';`));
      assert.match(result,/50\.00/,'completion did not observe committed answer');
    }
    console.log(`PASS ${name}: first committed, second ${b.code===0?'committed':'rejected as expected'}${retried?' after contention retry':''}`);
  }catch(error){failures++;console.error(`FAIL ${name}: ${error.message}`);}
}
// Instrument the natural NC UPDATE after PostgreSQL takes its tuple lock but
// before the product guard. No product locks are supplied by this test.
try {
  const map=text=>text.replace(/941|942|943/g,n=>String(801+Number(n)-941)).replace(/@local\.test/g,'+lock-inversion@local.test');
  sync(map(fixture)+'COMMIT;');
  sync(`create function public.release_test_delay_nc() returns trigger language plpgsql as $$ begin if new.observation='race-content' then raise notice 'BARRIER'; perform pg_sleep(1); end if; return new; end $$;
create trigger a0_release_test_delay_nc before update on public.non_conformities for each row execute function public.release_test_delay_nc();`);
  const auth=map(`begin;set local statement_timeout='12s';set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000942',true);`);
  let secondPromise;
  const a=await session(auth+map(`update public.non_conformities set observation='race-content' where id='80000000-0000-0000-0000-000000000941';commit;`),()=>{secondPromise=session(auth+map(plan)+'commit;');});
  assert.ok(secondPromise,'NC trigger barrier not reached');
  const b=await secondPromise;
  assert.doesNotMatch(a.stderr+b.stderr,/deadlock detected|statement timeout/);
  assert.equal(b.code,0,b.stderr);
  if(a.code!==0) assert.match(a.stderr,/could not obtain lock|concorrente/);
  console.log(`PASS NC-content versus plan lock inversion: NC=${a.code}, plan=${b.code}`);
}catch(error){failures++;console.error(`FAIL NC-content versus plan lock inversion: ${error.message}`);}
console.log(`Independent-session scenarios: ${process.argv.includes('--deadlock-only')?1:cases.length+1}; failures: ${failures}; database retained: ${database}`);
process.exitCode=failures?1:0;
