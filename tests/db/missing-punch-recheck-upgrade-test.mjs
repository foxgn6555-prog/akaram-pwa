/* global process, console */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir = '/tmp/epgdata-recheck-upgrade'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54349, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const c = new pg.Client({ host: '127.0.0.1', port: 54349, user: 'postgres', password: 'pw', database: 'akram' }); await c.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql') && x < '00361').sort()) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values('40130000-0000-0000-0000-000000000001','preview-upgrade@t.iq');
    insert into public.user_roles(user_id,role) values('40130000-0000-0000-0000-000000000001','it_admin'),('40130000-0000-0000-0000-000000000001','ops_room');
    select set_config('auth.user_id','40130000-0000-0000-0000-000000000001',false);
    select public.it_missing_punch_settings_set(3,1000.25);
    insert into public.employees(id,employee_number,full_name,hire_date) values('40130000-0000-0000-0000-000000000002','MPUP','موظف','2024-01-01');
    insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
      values('40130000-0000-0000-0000-000000000002','2026-01-05','2026-01-05 05:00+00','out','audit_backfill');
    insert into public.hr_attendance_days(employee_id,work_date,status,source) values('40130000-0000-0000-0000-000000000002','2026-01-05','absent','auto');
    select public.ops_missing_punch_draft_save('2026-01-01');
    select app.hr_missing_punch_send_month('2026-01-01');`)
  const snapshot = async () => (await c.query(`select
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.hr_missing_punch_register x) register,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.hr_attendance_days x) attendance,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.hr_month_exports x) exports,
    (select jsonb_agg(to_jsonb(x)-'sent_at' order by x.id) from public.hr_missing_punch_month_drafts x) drafts,
    (select jsonb_agg(to_jsonb(x)-'evidence' order by x.draft_id,x.revision) from public.hr_missing_punch_month_draft_revisions x) revisions,
    (select to_jsonb(x) from public.hr_policy x where x.id=1) policy,
    (select jsonb_agg(md5(pg_get_functiondef(p.oid)) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='app' and p.proname in ('hr_evaluate_day','hr_capture_missing_punch_daily','hr_leave_request__raw'))
      or (n.nspname='public' and p.proname in ('finance_payroll_approve'))) functions`)).rows[0]
  const before = await snapshot()
  await c.query(fs.readFileSync('supabase/migrations/00361_missing_punch_report_recheck.sql', 'utf8'))
  if (JSON.stringify(before) !== JSON.stringify(await snapshot())) throw new Error('recheck upgrade changed existing report, records or engines')
  const priv = (await c.query(`select has_function_privilege('anon','public.deputy_missing_punch_report_recheck(date,integer)','execute') anon,
    has_function_privilege('authenticated','public.deputy_missing_punch_report_recheck(date,integer)','execute') authenticated`)).rows[0]
  const internal = (await c.query("select has_function_privilege('authenticated','app.hr_missing_punch_recheck_pack(date)','execute') snapshot, has_function_privilege('authenticated','app.hr_missing_punch_send_month(date)','execute') sender")).rows[0]
  if (internal.snapshot || internal.sender) throw new Error('internal functions exposed')
  if (priv.anon || !priv.authenticated) throw new Error('unexpected function privileges')
  console.log('test ok: upgrade 00360 to 00361 preserves sent reports, revisions, register, attendance, policy, exports and engines')
} catch (e) { console.error('FAIL recheck upgrade', e); process.exitCode = 1 }
finally { await c.end(); await server.stop() }
