/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'fs'
const dir = '/tmp/epgdata-missing-upgrade'
fs.rmSync(dir, { recursive: true, force: true })
const pgs = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54331, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await pgs.initialise(); await pgs.start(); await pgs.createDatabase('akram')
const c = new pg.Client({ host: '127.0.0.1', port: 54331, user: 'postgres', password: 'pw', database: 'akram' }); await c.connect()
try {
  await c.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto;`)
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql','utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  const files=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()
  for (const f of files.filter(f=>f<'00352')) await c.query(fs.readFileSync('supabase/migrations/'+f,'utf8'))
  await c.query(`insert into auth.users(id,email) values ('39950000-0000-0000-0000-000000000001','up-ops@t.invalid'),('39950000-0000-0000-0000-000000000002','up-hr@t.invalid'),('39950000-0000-0000-0000-000000000005','up-deputy@t.invalid');
    insert into public.user_roles(user_id,role) values('39950000-0000-0000-0000-000000000001','ops_room'),('39950000-0000-0000-0000-000000000002','hr_officer'),('39950000-0000-0000-0000-000000000005','deputy_director');
    insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('39950000-0000-0000-0000-000000000003','UPGRADE-1','موظف الترقية','2024-01-01','399501');
    insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values('39950000-0000-0000-0000-000000000004','upgrade shift','16:00','22:00',0,'{0,1,2,3,4,5,6}');
    insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('39950000-0000-0000-0000-000000000003','39950000-0000-0000-0000-000000000004','2024-01-01');
    select set_config('auth.user_id','39950000-0000-0000-0000-000000000001',false);`)
  const old = await c.query(`select public.attendance_edit_create('employees',array['39950000-0000-0000-0000-000000000003']::uuid[],array['2025-01-05'::date],'full_presence','{}','تعديل تاريخي جماعي','direct') j`)
  const pending = await c.query(`select public.attendance_edit_create('employees',array['39950000-0000-0000-0000-000000000003']::uuid[],array['2025-01-06'::date],'set_status','{"status":"leave"}','طلب تاريخي معلّق','hr_request') j`)
  const id=pending.rows[0].j.id
  const before=(await c.query(`select to_jsonb(d) j from public.hr_attendance_days d where employee_id='39950000-0000-0000-0000-000000000003' and work_date='2025-01-05'`)).rows[0].j
  if (old.rows[0].j.status!=='applied') throw new Error('فشل إعداد بيانات قديمة')
  await c.query(fs.readFileSync('supabase/migrations/00352_attendance_missing_punch_guard.sql','utf8'))
  const after=(await c.query(`select to_jsonb(d)-'manual_punch_correction' j from public.hr_attendance_days d where employee_id='39950000-0000-0000-0000-000000000003' and work_date='2025-01-05'`)).rows[0].j
  if (JSON.stringify(before)!==JSON.stringify(after)) throw new Error('تغيّر صف تاريخي عند الترحيل')
  await c.query("select set_config('auth.user_id','39950000-0000-0000-0000-000000000002',false)")
  let blocked=false
  try { await c.query('select public.attendance_edit_hr_apply($1,null)',[id]) } catch (e) { blocked=e.message.includes('HR_EDIT_STATUS_OR_TIME') }
  if (!blocked) throw new Error('سمح بطلب قديم يدوياً إلى إجازة')
  const req=(await c.query('select status from public.attendance_edit_requests where id=$1',[id])).rows[0]
  if (req.status!=='approved') throw new Error('الطلب التاريخي تغير رغم فشل التطبيق')
  await c.query(`insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
    values('UP','399501','39950000-0000-0000-0000-000000000003','2025-01-05 13:30+00','manual');`)
  await c.query("select set_config('auth.user_id','39950000-0000-0000-0000-000000000005',false)")
  blocked=false
  try { await c.query('select public.attendance_edit_revert($1,$2)',[old.rows[0].j.id,'تراجع تاريخي للاختبار']) } catch (e) { blocked=e.message.includes('ATT_EDIT_CHANGED_SINCE_APPLY') }
  if (!blocked) throw new Error('التراجع التاريخي تجاهل بصمة حقيقية جديدة')
  console.log('test ok: attendance-missing-upgrade (legacy data intact, unsafe pending request and stale revert blocked)')
} catch(e) { console.error('FAIL upgrade',e); process.exitCode=1 }
finally { await c.end(); await pgs.stop() }
