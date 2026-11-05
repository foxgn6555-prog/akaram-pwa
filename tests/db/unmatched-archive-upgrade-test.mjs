/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir = '/tmp/epgdata-unmatched-upgrade'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54339, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const c = new pg.Client({ host: '127.0.0.1', port: 54339, user: 'postgres', password: 'pw', database: 'akram' })
await c.connect()
const c2 = new pg.Client({ host: '127.0.0.1', port: 54339, user: 'postgres', password: 'pw', database: 'akram' })
await c2.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql') && x < '00362').sort()) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into public.biometric_devices(id,serial_number,name,is_active) values ('d8040000-0000-0000-0000-000000000001','UP-ARC','جهاز الترقية',false);
    insert into public.biometric_device_users(device_serial,pin,name) values ('UP-ARC','821','قديم'),('UP-ARC','822','بلا بصمة'),('UP-ARC','823','موظف');
    insert into public.biometric_punches(id,device_serial,pin,punched_at,method,raw) values
      ('c8040000-0000-0000-0000-000000000001','UP-ARC','821','2025-01-01 07:00+00','manual','{"check":1}');
    insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
      ('e8040000-0000-0000-0000-000000000001','UP-ARC-EMP','موظف قديم','2024-01-01','823');
    insert into public.biometric_punches(id,device_serial,pin,employee_id,punched_at,method) values
      ('c8040000-0000-0000-0000-000000000002','UP-ARC','823','e8040000-0000-0000-0000-000000000001','2025-01-01 07:00+00','manual');`)
  const old = (await c.query("select to_jsonb(p) j from public.biometric_punches p where id='c8040000-0000-0000-0000-000000000001'")).rows[0].j
  await c.query(fs.readFileSync('supabase/migrations/00362_unmatched_archive_foundation.sql', 'utf8'))
  const source = (await c.query("select to_jsonb(p) j from public.biometric_punches p where id='c8040000-0000-0000-0000-000000000001'")).rows[0].j
  const archived = (await c.query("select original_punch j from public.unmatched_archive_punches where source_punch_id='c8040000-0000-0000-0000-000000000001'")).rows[0]?.j
  if (JSON.stringify(old) !== JSON.stringify(source) || JSON.stringify(old) !== JSON.stringify(archived)) throw new Error('الترحيل لم يحفظ المصدر كما هو')
  const users = (await c.query("select pin from public.unmatched_archive_device_users where device_serial='UP-ARC' order by pin")).rows.map(r => r.pin)
  if (users.join(',') !== '821,822') throw new Error('النسخ الأولي لم يميز غير المطابق والمعروف بلا بصمة: ' + users)
  const count = (await c.query("select count(*)::int n from public.unmatched_archive_punches where device_serial='UP-ARC'")).rows[0].n
  if (count !== 1) throw new Error('أرشيف البصمات عند الترقية غير صحيح: ' + count)
  // إدخالان متزامنان للشخص ذاته لا يقتفلان صف هوية مشتركاً؛ التراجع لا يترك لقطة يتيمة.
  await c.query('begin'); await c2.query('begin')
  await c.query("set local statement_timeout='3s'"); await c2.query("set local statement_timeout='3s'")
  await Promise.all([
    c.query("insert into public.biometric_punches(device_serial,pin,punched_at,method) values('UP-ARC','824','2025-01-02 07:00+00','manual')"),
    c2.query("insert into public.biometric_punches(device_serial,pin,punched_at,method) values('UP-ARC','824','2025-01-02 08:00+00','manual')"),
  ])
  await c.query('commit'); await c2.query('rollback')
  const race = (await c.query("select count(*)::int n from public.unmatched_archive_punches where device_serial='UP-ARC' and pin='824'")).rows[0].n
  if (race !== 1) throw new Error('التزام أو تراجع المعاملة لم ينعكس على الأرشيف: ' + race)
  console.log('test ok: unmatched archive upgrade backfill, concurrent inserts and rollback')
} catch (e) { console.error('FAIL unmatched archive upgrade', e); process.exitCode = 1 }
finally { await c.end(); await c2.end(); await server.stop() }
