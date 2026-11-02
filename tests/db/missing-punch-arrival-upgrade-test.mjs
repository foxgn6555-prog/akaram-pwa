/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'fs'
const dir = '/tmp/epgdata-arrival-upgrade'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54335, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const c = new pg.Client({ host: '127.0.0.1', port: 54335, user: 'postgres', password: 'pw', database: 'akram' }); await c.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
  for (const f of files.filter(f => f < '00355')) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values ('400b0000-0000-0000-0000-000000000001','register-ops@test.invalid');
    insert into public.user_roles(user_id,role) values('400b0000-0000-0000-0000-000000000001','ops_room');
    insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400b0000-0000-0000-0000-000000000002','REGISTER-UP','موظف','2024-01-01','400b02');
    insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values('400b0000-0000-0000-0000-000000000003','register shift','08:00','16:00',0,'{0,1,2,3,4,5,6}');
    insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('400b0000-0000-0000-0000-000000000002','400b0000-0000-0000-0000-000000000003','2024-01-01');
    select set_config('auth.user_id','400b0000-0000-0000-0000-000000000001',false);
    insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('REGISTER-UP','400b02','400b0000-0000-0000-0000-000000000002','2025-01-05 05:30+00','manual');
    select public.ops_attendance_edit('400b0000-0000-0000-0000-000000000002','2025-01-05','2025-01-05 05:30+00','2025-01-05 13:00+00','auto','اختبار تصحيح قديم');`)
  await c.query(`insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
    values('400b0000-0000-0000-0000-000000000002','2025-01-06','2025-01-06 05:30+00','out','daily_snapshot');`)
  const before = (await c.query("select coalesce(jsonb_agg(to_jsonb(a) order by a.work_date),'[]') j from public.hr_attendance_days a")).rows[0].j
  const records = (await c.query("select coalesce(jsonb_agg(to_jsonb(r) order by r.work_date),'[]') j from public.hr_missing_punch_register r")).rows[0].j
  const auditBefore = (await c.query('select count(*)::int n from public.hr_attendance_audit')).rows[0].n
  await c.query(fs.readFileSync('supabase/migrations/00355_missing_punch_arrival_review.sql', 'utf8'))
  const after = (await c.query("select coalesce(jsonb_agg(to_jsonb(a) order by a.work_date),'[]') j from public.hr_attendance_days a")).rows[0].j
  const rec = (await c.query("select coalesce(jsonb_agg(to_jsonb(r)-'requires_review'-'later_punch' order by r.work_date),'[]') j from public.hr_missing_punch_register r")).rows[0].j
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('upgrade changed attendance')
  if (JSON.stringify(records) !== JSON.stringify(rec)) throw new Error('upgrade changed register evidence')
  if ((await c.query('select count(*)::int n from public.hr_attendance_audit')).rows[0].n !== auditBefore) throw new Error('upgrade altered audit')
  const permissions = (await c.query(`select has_function_privilege('authenticated','app.hr_evaluate_day_00354_prior(uuid,date)','execute') prior,
    has_function_privilege('authenticated','app.hr_evaluate_day_safe(uuid,date)','execute') safe,
    has_function_privilege('anon','public.ops_missing_punch_register(date,integer,integer)','execute') anon,
    has_function_privilege('authenticated','public.ops_missing_punch_register(date,integer,integer)','execute') auth`)).rows[0]
  if (permissions.prior || permissions.safe || permissions.anon || !permissions.auth) throw new Error('permissions: '+JSON.stringify(permissions))
  console.log('test ok: upgrade 00354 to 00355 preserves attendance, audit and register evidence; permissions')
} catch (e) { console.error('FAIL upgrade', e); process.exitCode = 1 }
finally { await c.end(); await server.stop() }
