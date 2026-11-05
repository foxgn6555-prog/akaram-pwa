/* global process, console, setTimeout */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir='/tmp/epgdata-unmatched-independent-race'
fs.rmSync(dir,{recursive:true,force:true})
const server=new EmbeddedPostgres({databaseDir:dir,user:'postgres',password:'pw',port:54341,persistent:false,initdbFlags:['--encoding=UTF8','--locale=C']})
await server.initialise(); await server.start(); await server.createDatabase('akram')
const make=()=>new pg.Client({host:'127.0.0.1',port:54341,user:'postgres',password:'pw',database:'akram'})
const c=make(),c2=make(); await c.connect(); await c2.connect()
try {
 await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
 await c.query(fs.readFileSync('tests/db/supabase-mock.sql','utf8'))
 await c.query("select set_config('app.dedup_window_seconds','0',false)")
 for (const f of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()) await c.query(fs.readFileSync('supabase/migrations/'+f,'utf8'))
 await c.query(`insert into auth.users(id,email) values('f3660000-0000-0000-0000-000000000001','it-dup@t.invalid');
 insert into public.user_roles(user_id,role) values('f3660000-0000-0000-0000-000000000001','it_admin');
 insert into public.biometric_devices(id,serial_number,name,is_active) values('d366a000-0000-0000-0000-000000000001','RACE-DEVICE','جهاز',false);
 insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('e366a000-0000-0000-0000-000000000001','RACE-EMP','موظف','2024-01-01','123366');
 insert into public.biometric_device_users(device_serial,pin,name) values('RACE-DEVICE','123366','شخص آخر');`)
 await c.query("select set_config('auth.user_id','f3660000-0000-0000-0000-000000000001',false)")
 await c2.query("set statement_timeout='4s'")
 await c2.query('begin')
 await c2.query("insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('RACE-DEVICE','123366','e366a000-0000-0000-0000-000000000001','2025-01-01 08:00+00','manual')")
 const busy=await c.query("select public.unmatched_unit_confirm_independent('RACE-DEVICE','123366')").then(()=>'',e=>e.message)
 if(!busy.includes('BIO_LEDGER_BUSY')) throw new Error('التأكيد لم يرفض دفتر بصمات مشغولاً: '+busy)
 await c2.query('commit')
 await c.query('begin')
 await c.query("select public.unmatched_unit_confirm_independent('RACE-DEVICE','123366')")
 await c2.query('begin')
 let done=false
 const pending=c2.query("insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('RACE-DEVICE','123366','e366a000-0000-0000-0000-000000000001','2025-01-02 08:00+00','manual')").finally(()=>{done=true})
 await new Promise(resolve=>setTimeout(resolve,200))
 if(done) throw new Error('إدخال البصمة لم ينتظر قفل التأكيد')
 await c.query('commit'); await pending; await c2.query('commit')
 const {rows}=await c.query("select count(*)::int n from public.unmatched_archive_punches where device_serial='RACE-DEVICE' and pin='123366'")
 if(rows[0].n!==2) throw new Error('فجوة بين النسخ والتقاط البصمة اللاحقة '+rows[0].n)
 // مستخدم جهاز يحدّث الأرشيف قبل إدخال البصمة (كما يفعل الجسر): لا ينتظر التأكيد صف الأرشيف.
 await c.query(`insert into public.biometric_devices(id,serial_number,name,is_active) values('d366a000-0000-0000-0000-000000000002','RACE-USER','جهاز',false);
 insert into public.employees(id,employee_number,full_name,hire_date) values('e366a000-0000-0000-0000-000000000002','123367','موظف ثان','2024-01-01');
 insert into public.biometric_device_users(device_serial,pin,name) values('RACE-USER','123367','قديم');`)
 await c2.query('begin'); await c2.query("update public.biometric_device_users set name='جديد' where device_serial='RACE-USER' and pin='123367'")
 await c.query("set statement_timeout='3s'"); await c.query('begin')
 await c.query("select public.unmatched_unit_confirm_independent('RACE-USER','123367')")
 const after=c2.query("insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('RACE-USER','123367','e366a000-0000-0000-0000-000000000002','2025-01-02 08:00+00','manual')")
 await new Promise(resolve=>setTimeout(resolve,200)); await c.query('commit'); await after; await c2.query('commit')
 const check=await c.query("select count(*)::int n from public.unmatched_archive_punches where device_serial='RACE-USER' and pin='123367'")
 if(check.rows[0].n!==1) throw new Error('تعطل الجسر أو فقدت بصمته')
 console.log('test ok: independent confirmation busy, racing insert and device-user-before-punch')
} catch(e) { console.error('FAIL independent concurrency',e); process.exitCode=1 }
finally { await c.end(); await c2.end(); await server.stop() }
