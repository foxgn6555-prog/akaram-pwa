/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir = '/tmp/epgdata-review-concurrency'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54343, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const create = () => new pg.Client({ host: '127.0.0.1', port: 54343, user: 'postgres', password: 'pw', database: 'akram' })
const c = create(), c2 = create(); await c.connect(); await c2.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values('40140000-0000-0000-0000-000000000001','review-race@t.iq');
    insert into public.user_roles(user_id,role) values('40140000-0000-0000-0000-000000000001','deputy_director');
    insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('40140000-0000-0000-0000-000000000002','MRRACE','موظف','2024-01-01','mrrace');
    update public.hr_policy set settings=settings||'{"auto_evaluate_enabled":false}'::jsonb where id=1;
    insert into public.hr_missing_punch_register(id,employee_id,work_date,original_punch,detected_by,requires_review,later_punch)
      values('40140000-0000-0000-0000-000000000003','40140000-0000-0000-0000-000000000002',date '2025-03-05','2025-03-05 05:00+00','real_arrival',true,'2025-03-05 13:00+00');`)
  for (const conn of [c, c2]) await conn.query("select set_config('auth.user_id','40140000-0000-0000-0000-000000000001',false),set_config('statement_timeout','8s',false)")
  const hash = async () => (await c2.query("select public.deputy_missing_punch_reviews('2025-03-01')->'rows'->0->>'evidence_hash' as hash")).rows[0].hash
  const decide = (h) => c2.query("select public.deputy_missing_punch_review_decide('40140000-0000-0000-0000-000000000003','confirmed','تحققنا من الجهاز والسجل',$1)",[h]).then(() => 'unexpected success', e => e.message)
  let h = await hash()
  await c2.query('begin isolation level repeatable read')
  const isolationResult = await decide(h)
  if (!isolationResult.includes('HR_REVIEW_ISOLATION_UNSUPPORTED')) throw new Error('repeatable read should be rejected to prevent stale snapshots')
  await c2.query('rollback')
  await c.query('begin; select app.hr_payroll_lock_range(\'2025-03-05\',\'2025-03-05\')')
  await c.query("insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('RACE','mrrace','40140000-0000-0000-0000-000000000002','2025-03-05 09:00+00','manual')")
  let result = decide(h)
  await c.query('select pg_sleep(0.2); commit')
  if (!(await result).includes('HR_REVIEW_EVIDENCE_CHANGED')) throw new Error('concurrent evidence change was not rejected')
  h = await hash()
  await c.query('begin; select app.hr_payroll_lock_range(\'2025-03-05\',\'2025-03-05\')')
  await c.query("insert into public.hr_month_exports(period_month,status,review_status,exported_at) values('2025-03-01','approved','approved',now())")
  result = decide(h)
  await c.query('select pg_sleep(0.2); commit')
  if (!(await result).includes('HR_MONTH_LOCKED')) throw new Error('concurrent financial closure was not rejected')
  if ((await c.query('select count(*)::int n from public.hr_missing_punch_review_decisions')).rows[0].n !== 0) throw new Error('stale/locked decision persisted')
  if ((await c.query('select count(*)::int n from public.hr_attendance_deductions')).rows[0].n !== 0) throw new Error('review created deduction')
  console.log('test ok: simultaneous evidence change and finance close reject review and create no deduction')
} catch (e) { console.error('FAIL review concurrency', e); process.exitCode = 1 }
finally { await c.end(); await c2.end(); await server.stop() }
