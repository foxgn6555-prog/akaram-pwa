/* global process, console, setTimeout */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'fs'
const dir = '/tmp/epgdata-arrival-concurrency'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54336, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const c = new pg.Client({ host: '127.0.0.1', port: 54336, user: 'postgres', password: 'pw', database: 'akram' }); await c.connect()
const c2 = new pg.Client({ host: '127.0.0.1', port: 54336, user: 'postgres', password: 'pw', database: 'akram' }); await c2.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values('400c0000-0000-0000-0000-000000000001','register-race@test.invalid');
    insert into public.user_roles(user_id,role) values('400c0000-0000-0000-0000-000000000001','ops_room');
    insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400c0000-0000-0000-0000-000000000002','REGISTER-RACE','موظف','2024-01-01','400c02');
    insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values('400c0000-0000-0000-0000-000000000003','register race','08:00','16:00',0,'{0,1,2,3,4,5,6}');
    insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('400c0000-0000-0000-0000-000000000002','400c0000-0000-0000-0000-000000000003','2024-01-01');
    select set_config('auth.user_id','400c0000-0000-0000-0000-000000000001',false);
    insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
      select 'REGISTER-RACE','400c02','400c0000-0000-0000-0000-000000000002',((app.hr_local_date(now())-2+time '08:30')::timestamp-interval '3 hours') at time zone 'UTC','manual';`)
  await c2.query("select set_config('auth.user_id','400c0000-0000-0000-0000-000000000001',false),set_config('app.dedup_window_seconds','0',false)")
  await c.query('begin'); await c.query('select app.hr_capture_missing_punch_daily()')
  let finished = false
  const correction = c2.query(`select public.ops_attendance_edit('400c0000-0000-0000-0000-000000000002',app.hr_local_date(now())-2,
    ((app.hr_local_date(now())-2+time '08:30')::timestamp-interval '3 hours') at time zone 'UTC',
    ((app.hr_local_date(now())-2+time '16:00')::timestamp-interval '3 hours') at time zone 'UTC','auto','اختبار تصحيح متزامن')`).then(() => { finished = true })
  await new Promise(resolve => setTimeout(resolve, 250))
  if (finished) throw new Error('correction did not wait for snapshot register insertion')
  await c.query('commit'); await correction
  const r = (await c.query('select * from public.hr_missing_punch_register')).rows
  if (r.length !== 1 || r[0].missing_side !== 'out' || !r[0].correction_audit_id) throw new Error('snapshot and correction did not converge to one record')
  // لقطة لا تحبس نفسها خلف معاملة تملك قفل الشهر؛ تعود لاحقاً لتسجيل الحالة.
  await c.query(`insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
    ('400c0000-0000-0000-0000-000000000004','ARRIVAL-LOCK','موظف','2024-01-01','400c04'),
    ('400c0000-0000-0000-0000-000000000005','ARRIVAL-IMPORT','موظف','2024-01-01','400c05');
    insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values
    ('400c0000-0000-0000-0000-000000000004','400c0000-0000-0000-0000-000000000003','2024-01-01'),
    ('400c0000-0000-0000-0000-000000000005','400c0000-0000-0000-0000-000000000003','2024-01-01');
    insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
    select 'RACE','400c04','400c0000-0000-0000-0000-000000000004',((app.hr_local_date(now())-2+time '08:30')::timestamp-interval '3 hours') at time zone 'UTC','manual';`)
  await c.query('begin')
  await c.query('select app.hr_payroll_lock_range(app.hr_local_date(now())-2,app.hr_local_date(now())-2)')
  await c2.query("set statement_timeout='3s'")
  await c2.query('select app.hr_capture_missing_punch_daily()')
  let rows = (await c2.query("select count(*)::int n from public.hr_missing_punch_register where employee_id='400c0000-0000-0000-0000-000000000004' ")).rows[0].n
  if (rows !== 0) throw new Error('snapshot did not skip locked month')
  if (!(await c2.query("select exists(select 1 from public.integration_logs where endpoint='missing_punch_snapshot' and status='error' and (payload->>'skipped_candidates')::int>0) found")).rows[0].found) throw new Error('snapshot skip not logged')
  await c.query('commit'); await c2.query('select app.hr_capture_missing_punch_daily()')
  rows = (await c2.query("select count(*)::int n from public.hr_missing_punch_register where employee_id='400c0000-0000-0000-0000-000000000004'")).rows[0].n
  if (rows !== 1) throw new Error('snapshot retry lost record')
  // بصمة حقيقية تتزامن مع لقطة سابقة للالتزام؛ تصبح حالة للمراجعة.
  await c.query(`insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
    select 'RACE','400c05','400c0000-0000-0000-0000-000000000005',((app.hr_local_date(now())-2+time '08:30')::timestamp-interval '3 hours') at time zone 'UTC','manual'`)
  await c.query('begin'); await c.query('select app.hr_capture_missing_punch_daily()')
  const incoming = c2.query(`insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
    select 'RACE','400c05','400c0000-0000-0000-0000-000000000005',((app.hr_local_date(now())-2+time '16:00')::timestamp-interval '3 hours') at time zone 'UTC','manual'`)
  await new Promise(resolve => setTimeout(resolve, 250)); await c.query('commit'); await incoming
  const review = (await c.query("select detected_by,requires_review,later_punch is not null extra from public.hr_missing_punch_register where employee_id='400c0000-0000-0000-0000-000000000005'")).rows[0]
  if (!review || review.detected_by !== 'daily_snapshot' || !review.requires_review || !review.extra) throw new Error('concurrent arrival was not marked for review')
  // دفعة بصمات مقلوبة زمنياً عبر شهرين مقابل إقفال المالية بنفس ترتيب الأقفال.
  await c.query(`with ds as (select (date_trunc('month',app.hr_local_date(now()))-interval '2 months')::date+4 old_d,
      (date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date+4 new_d)
    insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
    select 'RACE-MONTHS','400c04','400c0000-0000-0000-0000-000000000004'::uuid,((old_d+time '08:00')::timestamp-interval '3 hours') at time zone 'UTC','manual' from ds
    union all select 'RACE-MONTHS','400c05','400c0000-0000-0000-0000-000000000005'::uuid,((new_d+time '08:00')::timestamp-interval '3 hours') at time zone 'UTC','manual' from ds`)
  await c.query('begin')
  await c.query(`with ds as (select (date_trunc('month',app.hr_local_date(now()))-interval '2 months')::date+4 old_d,
      (date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date+4 new_d)
    insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
    select 'RACE-MONTHS','400c05','400c0000-0000-0000-0000-000000000005'::uuid,((new_d+time '16:00')::timestamp-interval '3 hours') at time zone 'UTC','manual' from ds
    union all select 'RACE-MONTHS','400c04','400c0000-0000-0000-0000-000000000004'::uuid,((old_d+time '16:00')::timestamp-interval '3 hours') at time zone 'UTC','manual' from ds`)
  await c2.query('begin')
  const finance = c2.query(`select app.hr_payroll_lock_range((date_trunc('month',app.hr_local_date(now()))-interval '2 months')::date,
    (date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date)`)
  await new Promise(resolve => setTimeout(resolve, 250)); await c.query('commit'); await finance
  await c2.query(`insert into public.hr_month_exports(period_month,status,review_status,exported_at)
    values((date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date,'approved','approved',now())`)
  await c2.query('commit')
  rows = (await c.query("select count(*)::int n from public.hr_missing_punch_register where employee_id in ('400c0000-0000-0000-0000-000000000004','400c0000-0000-0000-0000-000000000005') and detected_by='real_arrival' and requires_review")).rows[0].n
  if (rows !== 2) throw new Error('multi-month arrival candidates lost')
  console.log('test ok: snapshot/correction; busy month retry; snapshot/import; multi-month import/finance lock')
} catch (e) { console.error('FAIL register concurrency', e); process.exitCode = 1 }
finally { await c.end(); await c2.end(); await server.stop() }
