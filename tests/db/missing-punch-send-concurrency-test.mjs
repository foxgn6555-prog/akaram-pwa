/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir = '/tmp/epgdata-send-concurrency'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54346, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const create = () => new pg.Client({ host: '127.0.0.1', port: 54346, user: 'postgres', password: 'pw', database: 'akram' })
const c = create(), c2 = create(), c3 = create(); await c.connect(); await c2.connect(); await c3.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql','utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await c.query(fs.readFileSync('supabase/migrations/' + f,'utf8'))
  await c.query(`insert into auth.users(id,email) values('40220000-0000-0000-0000-000000000001','draft-race-ops@t.iq'),('40220000-0000-0000-0000-000000000002','draft-race-fin@t.iq'),('40220000-0000-0000-0000-000000000003','draft-race-it@t.iq'),('40220000-0000-0000-0000-000000000006','send-race-deputy@t.iq');
   insert into public.user_roles(user_id,role) values('40220000-0000-0000-0000-000000000001','ops_room'),('40220000-0000-0000-0000-000000000002','finance_officer'),('40220000-0000-0000-0000-000000000003','it_admin'),('40220000-0000-0000-0000-000000000006','deputy_director');
   insert into public.employees(id,employee_number,full_name,hire_date) values('40220000-0000-0000-0000-000000000004','DRACE','موظف','2024-01-01');
   insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by) values('40220000-0000-0000-0000-000000000004','2025-03-05','2025-03-05 05:00+00','out','audit_backfill');
   insert into public.hr_month_exports(id,period_month,status,review_status,exported_at) values('40220000-0000-0000-0000-000000000005','2025-03-01','exported','approved',now());
   select set_config('auth.user_id','40220000-0000-0000-0000-000000000003',false); select public.it_missing_punch_settings_set(1,200);`)
  await c.query("select set_config('auth.user_id','',false),set_config('statement_timeout','8s',false)")
  await c2.query("select set_config('auth.user_id','40220000-0000-0000-0000-000000000002',false),set_config('statement_timeout','8s',false)")
  await c3.query("select set_config('auth.user_id','40220000-0000-0000-0000-000000000002',false),set_config('statement_timeout','8s',false)")
  await c.query('begin isolation level repeatable read')
  let res = await c.query("select app.hr_missing_punch_send_month('2025-03-01')").then(()=>'unexpected success',e=>e.message)
  if (!res.includes('HR_MISSING_DRAFT_ISOLATION')) throw new Error('repeatable read not rejected')
  await c.query('rollback')
  await c.query('begin')
  await c.query("select app.hr_missing_punch_send_month('2025-03-01')")
  let pending = c2.query("select app.hr_missing_punch_send_month('2025-03-01')").then(r=>r.rows[0].hr_missing_punch_send_month,e=>e.message)
  const financePending = c3.query("select public.finance_payroll_approve('40220000-0000-0000-0000-000000000005',false)").then(()=>'unexpected success',e=>e.message)
  await c.query('select pg_sleep(0.2); commit')
  const financeResult = await financePending
  if (!financeResult.includes('HR_MISSING_DRAFT_DELETE_CONFIRM')) throw new Error('concurrent old finance silently closed sent report: '+financeResult)
  res = await pending
  if (res !== 'already_sent') throw new Error('concurrent send was not idempotent: '+res)
  const counts = (await c.query("select (select count(*)::int from public.hr_missing_punch_month_draft_revisions) revisions,(select count(*)::int from public.notifications where entity_type='missing_punch_month_report') notifications")).rows[0]
  if (counts.revisions !== 1 || counts.notifications !== 1) throw new Error('duplicate report or notification: '+JSON.stringify(counts))
  res = await c2.query("select public.finance_payroll_approve('40220000-0000-0000-0000-000000000005',false)").then(()=>'unexpected success',e=>e.message)
  if (!res.includes('HR_MISSING_DRAFT_DELETE_CONFIRM')) throw new Error('old finance silently closed sent report: '+res)
  await c2.query('begin')
  await c2.query("select public.finance_payroll_approve_discard_missing_draft('40220000-0000-0000-0000-000000000005',false,true)")
  pending = c.query("select app.hr_missing_punch_send_month('2025-03-01')").then(r=>r.rows[0].hr_missing_punch_send_month,e=>e.message)
  await c2.query('select pg_sleep(0.2); commit')
  res = await pending
  if (res !== 'locked') throw new Error('concurrent send recreated report after close: '+res)
  if ((await c.query('select count(*)::int n from public.hr_missing_punch_month_drafts')).rows[0].n !== 0) throw new Error('report remained after close')
  if ((await c.query('select count(*)::int n from public.hr_missing_punch_month_draft_revisions')).rows[0].n !== 0) throw new Error('report versions remained after close')
  if ((await c.query("select count(*)::int n from public.notifications where entity_type='missing_punch_month_report'")).rows[0].n !== 0) throw new Error('report notification remained after close')
  if ((await c.query('select count(*)::int n from public.hr_attendance_deductions')).rows[0].n !== 0) throw new Error('send caused deduction')
  console.log('test ok: duplicate sends serialize; finance confirmation and close prevent recreation and deduction')
} catch (e) { console.error('FAIL send concurrency', e); process.exitCode=1 }
finally { await c.end(); await c2.end(); await c3.end(); await server.stop() }
