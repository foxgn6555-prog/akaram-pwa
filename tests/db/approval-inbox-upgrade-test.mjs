/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const dir = '/tmp/epgdata-approval-inbox-upgrade'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54338, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const c = new pg.Client({ host: '127.0.0.1', port: 54338, user: 'postgres', password: 'pw', database: 'akram' }); await c.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql') && x < '00367').sort()) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values
    ('36710000-0000-0000-0000-000000000001','up-it@t.iq'),('36710000-0000-0000-0000-000000000002','up-ops@t.iq'),('36710000-0000-0000-0000-000000000003','up-exec@t.iq'),('36710000-0000-0000-0000-000000000004','up-hr@t.iq');
    insert into public.user_roles(user_id,role) values ('36710000-0000-0000-0000-000000000001','it_admin'),('36710000-0000-0000-0000-000000000002','ops_room'),('36710000-0000-0000-0000-000000000003','executive_director'),('36710000-0000-0000-0000-000000000004','hr_officer');
    insert into public.departments(id,code,name) values ('36710000-0000-0000-0000-000000000010','UP367','قسم سابق');
    insert into public.employees(id,employee_number,full_name,hire_date,department_id) values ('36710000-0000-0000-0000-000000000011','UP367-1','موظف سلسلة','2024-01-01','36710000-0000-0000-0000-000000000010'),('36710000-0000-0000-0000-000000000012','UP367-2','موظف مباشر','2024-01-01',null);
    select set_config('auth.user_id','36710000-0000-0000-0000-000000000001',false);
    select public.approval_chain_save('employee','leave_time_all','[{"kind":"account","user_id":"36710000-0000-0000-0000-000000000003"}]',true,null,'36710000-0000-0000-0000-000000000010',true);
    select set_config('auth.user_id','36710000-0000-0000-0000-000000000002',false);
    select public.hr_leave_request('36710000-0000-0000-0000-000000000011',(select id from public.hr_leave_types where code='unpaid'),app.hr_local_date(now())+110,app.hr_local_date(now())+110);
    select public.hr_leave_request('36710000-0000-0000-0000-000000000012',(select id from public.hr_leave_types where code='unpaid'),app.hr_local_date(now())+110,app.hr_local_date(now())+110);`)
  const snapshot = async () => (await c.query(`select
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.hr_leaves x) leaves,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.approval_tasks x) tasks,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.approval_chains x) chains,
    (select jsonb_agg(md5(pg_get_functiondef(p.oid)) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='app' and p.proname in ('hr_leave_request__raw','hr_leave_decide__raw')) or (n.nspname='public' and p.proname in ('hr_leave_request','hr_leave_decide'))) engines`)).rows[0]
  // تستمر الوحدة الإضافية وقواعدها بعد زرع كتالوج الوارد.
  await c.query(`insert into public.permission_units(key,portal,path,label,parent_key,actions,sort) values ('hr.custom-preserved','hr','/hr/custom-preserved','وحدة محفوظة',null,'{view}',9999);
    insert into public.user_permission_overrides(user_id,unit_key,action,effect) values ('36710000-0000-0000-0000-000000000004','hr.custom-preserved','view','deny');`)
  const before = await snapshot()
  const old = await c.query("select user_id,link from public.notifications where dedupe_key like 'approval:%' or dedupe_key like 'leave_hr_fallback:%'")
  assert(!old.rows.some(r => r.user_id === '36710000-0000-0000-0000-000000000003'), 'invalid old root link silently prevented notification'); assert(old.rows.some(r => r.link === '/hr/leaves'))
  const existingNotifications = (await c.query("select id,to_jsonb(n)-'link' as n from public.notifications n order by id")).rows
  await c.query(fs.readFileSync('supabase/migrations/00367_approval_inbox_routing.sql', 'utf8'))
  assert.deepEqual(await snapshot(), before, 'leave, task, chain and engine preserved')
  assert.equal((await c.query("select count(*)::int n from public.user_permission_overrides where unit_key='hr.custom-preserved' and effect='deny'")).rows[0].n,1,'custom permission and rule preserved')
  for (const row of existingNotifications) {
    const current = await c.query("select to_jsonb(n)-'link' as n from public.notifications n where id=$1", [row.id])
    assert.deepEqual(current.rows[0]?.n,row.n,'existing notification unchanged except link')
  }
  const links = await c.query("select user_id,link from public.notifications where dedupe_key like 'approval:%' or dedupe_key like 'leave_hr_fallback:%'")
  assert(links.rows.some(r => r.link === '/executive/approvals')); assert(links.rows.some(r => r.link === '/hr/approvals'))
  for (const user of ['36710000-0000-0000-0000-000000000003','36710000-0000-0000-0000-000000000004']) {
    await c.query("select set_config('auth.user_id',$1,false)",[user])
    assert.equal((await c.query('select count(*)::int n from public.approval_my_tasks()')).rows[0].n, 1)
  }
  console.log('test ok: existing pending requests, chains, engine and notifications preserved; links fixed and inboxes populated')
} catch (e) { console.error('FAIL approval inbox upgrade', e); process.exitCode = 1 }
finally { await c.end(); await server.stop() }
