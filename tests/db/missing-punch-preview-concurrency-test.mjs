/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir = '/tmp/epgdata-preview-concurrency'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54339, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const createClient = () => new pg.Client({ host: '127.0.0.1', port: 54339, user: 'postgres', password: 'pw', database: 'akram' })
const c = createClient(), c2 = createClient(); await c.connect(); await c2.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values('40120000-0000-0000-0000-000000000001','preview-race@t.iq');
    insert into public.user_roles(user_id,role) values('40120000-0000-0000-0000-000000000001','it_admin');
    insert into public.employees(id,employee_number,full_name,hire_date) values('40120000-0000-0000-0000-000000000002','MPRACE','موظف','2024-01-01');`)
  for (const conn of [c, c2]) await conn.query("select set_config('auth.user_id','40120000-0000-0000-0000-000000000001',false),set_config('statement_timeout','3s',false)")
  await c.query('select public.it_missing_punch_settings_set(1,200)')
  const preview = async () => (await c2.query("select public.ops_missing_punch_month_preview((date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date) j")).rows[0].j
  await c.query('begin')
  await c.query(`insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
    values('40120000-0000-0000-0000-000000000002',(date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date+1,now(),'out','audit_backfill')`)
  let j = await preview()
  if (j.total_employees !== 0 || j.total_proposed_amount !== 0) throw new Error('uncommitted evidence visible')
  await c.query('commit'); j = await preview()
  if (j.total_employees !== 1 || j.total_proposed_amount !== 200) throw new Error('committed evidence not visible')
  await c.query('begin')
  await c.query(`insert into public.hr_month_exports(period_month,status,review_status,exported_at)
    values((date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date,'approved','approved',now())`)
  j = await preview(); if (j.finance_locked) throw new Error('uncommitted finance lock visible')
  await c.query('commit'); j = await preview()
  if (!j.finance_locked || j.total_proposed_amount !== 200) throw new Error('committed finance state not visible')
  if ((await c.query('select count(*)::int n from public.hr_attendance_deductions')).rows[0].n !== 0) throw new Error('preview created a deduction')
  console.log('test ok: concurrent evidence and finance lock are seen only after commit; no deduction')
} catch (e) { console.error('FAIL preview concurrency', e); process.exitCode = 1 }
finally { await c.end(); await c2.end(); await server.stop() }
