import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Explicit Docker container only: no connection URLs, remote Docker contexts,
// linked Supabase projects, inherited PGHOST, or destructive reset.
const root = fileURLToPath(new URL('..', import.meta.url));
const container = process.env.CHECKFLOW_LOCAL_CONTAINER;
if (!container || !/^supabase_db_[a-zA-Z0-9_-]+$/.test(container)) {
  throw new Error('Set CHECKFLOW_LOCAL_CONTAINER to a confirmed local supabase_db_* container');
}
if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('Remote/overridden Docker contexts are forbidden');
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error(`${args[0]} failed: ${result.error?.message || result.stderr}`);
  return result.stdout;
}
const endpoint = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim();
if (!/^(npipe:\/\/|unix:\/\/)/.test(endpoint)) throw new Error('Docker endpoint must be a local pipe/socket');
const database = `checkflow_gate_${Date.now()}`;
const sql = (input, db = database) => docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db], input);
sql(`CREATE DATABASE ${database};`, 'postgres');
console.log(`LOCAL DATABASE: ${database} (retained for inspection; no existing database reset)`);
// Bootstrap platform schemas from the installed local Supabase version, schema
// only. Product tables/data are never copied. Pin/use the same platform image
// when reproducing; this is a SQL gate, not an Auth/Storage HTTP emulator.
let platform = docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=auth', '--schema=storage', '--schema=extensions', '--no-owner']);
platform = platform.replace(/CREATE TRIGGER on_auth_user_created[^;]+;/g, '');
// Product Storage policies are installed from migrations below, never copied.
platform = platform.replace(/CREATE POLICY [^;]+ ON storage\.objects[^;]*;/g, '');
// Cluster-owned default ACLs cannot be reassigned by the local postgres role;
// existing object ACLs above are retained and are what these gates exercise.
platform = platform.replace(/ALTER DEFAULT PRIVILEGES [^;]+;/g, '');
sql(platform);
sql('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
const through=process.env.CHECKFLOW_MIGRATION_THROUGH;
if(through && !/^\d{12}$/.test(through)) throw new Error('Invalid migration cutoff');
for (const name of readdirSync(resolve(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) {
  if(through && name.slice(0,12)>through) continue;
  sql(`BEGIN; SET LOCAL statement_timeout='60s';\n${readFileSync(resolve(root, 'supabase/migrations', name), 'utf8')}\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('${name.slice(0,12)}','${name.slice(13,-4)}');\nCOMMIT;`);
  console.log(`MIGRATION PASS ${name}`);
}
let failures = 0;
if(through){console.log('Baseline-only bootstrap; product tests intentionally not run against a partial migration set.');process.exit(0);}
for (const name of readdirSync(resolve(root, 'supabase/tests')).filter(n => n.endsWith('.sql') && !/e2e/.test(n)).sort()) {
  try {
    sql(`SET statement_timeout='45s';\n${readFileSync(resolve(root, 'supabase/tests', name), 'utf8')}`);
    console.log(`SQL PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`SQL FAIL ${name}: ${error.message}`);
  }
}
console.log(`SQL gate failures: ${failures}; retained database: ${database}`);
process.exitCode = failures ? 1 : 0;
