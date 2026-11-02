/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir = '/tmp/epgdata-approval-all-upgrade'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54338, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const c = new pg.Client({ host: '127.0.0.1', port: 54338, user: 'postgres', password: 'pw', database: 'akram' }); await c.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql') && x < '00356').sort()) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values
      ('40100000-0000-0000-0000-000000000001','upgrade-it@t.iq'),('40100000-0000-0000-0000-000000000002','upgrade-ops@t.iq'),('40100000-0000-0000-0000-000000000003','upgrade-dep@t.iq');
    insert into public.user_roles(user_id,role) values
      ('40100000-0000-0000-0000-000000000001','it_admin'),('40100000-0000-0000-0000-000000000002','ops_room'),('40100000-0000-0000-0000-000000000003','deputy_director');
    insert into public.departments(id,code,name) values('40100000-0000-0000-0000-000000000004','UPALL','قسم قديم');
    insert into public.employees(id,employee_number,full_name,hire_date,department_id) values('40100000-0000-0000-0000-000000000005','UPALL1','موظف','2024-01-01','40100000-0000-0000-0000-000000000004');
    select set_config('auth.user_id','40100000-0000-0000-0000-000000000001',false);
    select public.approval_chain_save('employee','leave','[{"kind":"account","user_id":"40100000-0000-0000-0000-000000000003"}]',true,null,'40100000-0000-0000-0000-000000000004',true);
    select set_config('auth.user_id','40100000-0000-0000-0000-000000000002',false);
    select public.hr_leave_request('40100000-0000-0000-0000-000000000005',(select id from public.hr_leave_types where code='unpaid'),app.hr_local_date(now())+30,app.hr_local_date(now())+30);`)
  const snapshot = async () => (await c.query(`select
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.hr_leaves x) leaves,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.approval_tasks x) tasks,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.approval_chains x) chains,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.approval_chain_versions x) versions,
    (select jsonb_agg(md5(pg_get_functiondef(p.oid)) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='app' and p.proname='hr_leave_request__raw') or (n.nspname='public' and p.proname in ('hr_leave_request','hr_leave_decide'))) leave_functions`)).rows[0]
  const before = await snapshot()
  await c.query(fs.readFileSync('supabase/migrations/00356_approval_leave_time_all.sql', 'utf8'))
  const after = await snapshot()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('upgrade changed existing leave, tasks, chains, audit versions or request engine')
  const priv = (await c.query(`select has_function_privilege('anon','public.approval_chain_save(text,text,jsonb,boolean,text,uuid,boolean)','execute') anon,
    has_function_privilege('authenticated','public.approval_chain_save(text,text,jsonb,boolean,text,uuid,boolean)','execute') authenticated,
    has_table_privilege('authenticated','app.approval_leave_scope_guard','update') direct_write`)).rows[0]
  if (priv.anon || !priv.authenticated || priv.direct_write) throw new Error('unexpected privileges ' + JSON.stringify(priv))
  console.log('test ok: 00355 upgrade preserves pending requests/tasks, chains/versions and leave engine; permissions')
} catch (e) { console.error('FAIL approval all upgrade', e); process.exitCode = 1 }
finally { await c.end(); await server.stop() }
