/* global process, console, setTimeout */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir='/tmp/epgdata-unmatched-permission-race'
fs.rmSync(dir,{ recursive:true,force:true })
const server=new EmbeddedPostgres({ databaseDir:dir,user:'postgres',password:'pw',port:54340,persistent:false,initdbFlags:['--encoding=UTF8','--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const make=()=>new pg.Client({host:'127.0.0.1',port:54340,user:'postgres',password:'pw',database:'akram'})
const c=make(),c2=make(); await c.connect(); await c2.connect()
try {
 await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
 await c.query(fs.readFileSync('tests/db/supabase-mock.sql','utf8'))
 await c.query("select set_config('app.dedup_window_seconds','0',false)")
 for(const f of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()) await c.query(fs.readFileSync('supabase/migrations/'+f,'utf8'))
 await c.query(`insert into auth.users(id,email) values('f3640000-0000-0000-0000-000000000001','race-it@t.invalid'),('f3640000-0000-0000-0000-000000000002','race-hr@t.invalid');
 insert into public.user_roles(user_id,role) values('f3640000-0000-0000-0000-000000000001','it_admin'),('f3640000-0000-0000-0000-000000000002','hr_officer');
 insert into public.biometric_device_users(device_serial,pin,name) values('RACE','11','شخص');`)
 await c.query("select set_config('auth.user_id','f3640000-0000-0000-0000-000000000001',false)")
 await c2.query("select set_config('auth.user_id','f3640000-0000-0000-0000-000000000002',false),set_config('statement_timeout','4s',false)")
 await c.query("select public.unmatched_unit_set_hr_permission('f3640000-0000-0000-0000-000000000002',true)")
 await c.query('begin')
 await c.query("select public.unmatched_unit_set_hr_permission('f3640000-0000-0000-0000-000000000002',false)")
 let done=false
 const pending=c2.query("select public.unmatched_unit_person_edit('RACE','11','بعد السحب',0)").then(()=>'',e=>e.message).finally(()=>{done=true})
 await new Promise(resolve=>setTimeout(resolve,200))
 if(done) throw new Error('تعديل HR لم ينتظر سحب الصلاحية')
 await c.query('commit')
 const err=await pending
 if(!err.includes('BIO_FORBIDDEN')) throw new Error('تعديل بعد سحب الصلاحية لم يُرفض: '+err)
 await c.query("select public.unmatched_unit_set_hr_permission('f3640000-0000-0000-0000-000000000002',true)")
 await c.query("select set_config('auth.user_id','f3640000-0000-0000-0000-000000000002',false)")
 await c.query('begin'); await c.query("select public.unmatched_unit_person_edit('RACE','11','الأول',0)")
 let editDone=false
 const other=c2.query("select public.unmatched_unit_person_edit('RACE','11','الثاني',0)").then(()=>'',e=>e.message).finally(()=>{editDone=true})
 await new Promise(resolve=>setTimeout(resolve,200))
 if(editDone) throw new Error('تعديل متزامن لم ينتظر')
 await c.query('commit')
 const conflict=await other
 if(!conflict.includes('BIO_EDIT_CONFLICT')) throw new Error('لم يرفض التعديل القديم '+conflict)
 await c2.query('begin isolation level repeatable read')
 const isolation=await c2.query("select public.unmatched_unit_person_edit('RACE','11','نسخة قديمة',1)").then(()=>'',e=>e.message)
 if(!isolation.includes('BIO_EDIT_ISOLATION')) throw new Error('عزل لقطة قديمة غير محمي '+isolation)
 await c2.query('rollback')
 console.log('test ok: unmatched permission revoke, concurrent edit, stale isolation')
} catch(e) { console.error('FAIL permission race',e); process.exitCode=1 }
finally { await c.end(); await c2.end(); await server.stop() }
