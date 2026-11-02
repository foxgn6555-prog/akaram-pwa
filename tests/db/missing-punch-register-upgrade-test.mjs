/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'fs'
const dir = '/tmp/epgdata-register-upgrade'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54333, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const c = new pg.Client({ host: '127.0.0.1', port: 54333, user: 'postgres', password: 'pw', database: 'akram' }); await c.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
  for (const f of files.filter(f => f < '00354')) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values ('400b0000-0000-0000-0000-000000000001','register-ops@test.invalid');
    insert into public.user_roles(user_id,role) values('400b0000-0000-0000-0000-000000000001','ops_room');
    insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400b0000-0000-0000-0000-000000000002','REGISTER-UP','موظف','2024-01-01','400b02');
    insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values('400b0000-0000-0000-0000-000000000003','register shift','08:00','16:00',0,'{0,1,2,3,4,5,6}');
    insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('400b0000-0000-0000-0000-000000000002','400b0000-0000-0000-0000-000000000003','2024-01-01');
    select set_config('auth.user_id','400b0000-0000-0000-0000-000000000001',false);
    insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('REGISTER-UP','400b02','400b0000-0000-0000-0000-000000000002','2025-01-05 05:30+00','manual');
    select public.ops_attendance_edit('400b0000-0000-0000-0000-000000000002','2025-01-05','2025-01-05 05:30+00','2025-01-05 13:00+00','auto','اختبار تصحيح قديم');`)
  const before = (await c.query("select to_jsonb(a) j from public.hr_attendance_days a where employee_id='400b0000-0000-0000-0000-000000000002'")).rows[0].j
  const auditBefore = (await c.query('select count(*)::int n from public.hr_attendance_audit')).rows[0].n
  await c.query(fs.readFileSync('supabase/migrations/00354_missing_punch_register.sql', 'utf8'))
  const after = (await c.query("select to_jsonb(a) j from public.hr_attendance_days a where employee_id='400b0000-0000-0000-0000-000000000002'")).rows[0].j
  const rec = (await c.query("select * from public.hr_missing_punch_register where employee_id='400b0000-0000-0000-0000-000000000002'")).rows
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('upgrade changed attendance')
  if (rec.length !== 1 || rec[0].missing_side !== 'out' || rec[0].detected_by !== 'audit_backfill') throw new Error('old verified correction not restored')
  if ((await c.query('select count(*)::int n from public.hr_attendance_audit')).rows[0].n !== auditBefore) throw new Error('old audit was altered')
  console.log('test ok: register upgrade backfilled verified audit, attendance and history unchanged')
} catch (e) { console.error('FAIL upgrade', e); process.exitCode = 1 }
finally { await c.end(); await server.stop() }
