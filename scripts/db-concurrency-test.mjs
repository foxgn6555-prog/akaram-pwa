/**
 * اختبار التزامن الحقيقي (00349-A): جلستان منفصلتان تستدعيان دالة الكتابة نفسها في اللحظة نفسها.
 *   1) المستخدم نفسه × نقرتان متزامنتان على «إرسال طلب التعيين» ⇒ سجل واحد + DUPLICATE_SUBMIT للأخرى.
 *   2) مديران مفوضان يقرران الطلب نفسه معاً ⇒ قرار واحد، والآخر يحصل على «لم يعد معلّقاً».
 *   3) متعهد × تسجيل حضور مزدوج متزامن ⇒ سجل واحد.
 *   4) 50 نقرة متزامنة من المستخدم نفسه ⇒ سجل واحد.
 * التشغيل: node scripts/db-concurrency-test.mjs  (يستخدم قاعدة مضمّنة كـ db-migrations-test.mjs)
 */
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'fs';
const dir = '/tmp/epgdata-conc';
fs.rmSync(dir, { recursive: true, force: true });
const pgs = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54331, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await pgs.initialise(); await pgs.start();
await pgs.createDatabase('akram');
const conn = () => new pg.Client({ host: '127.0.0.1', port: 54331, user: 'postgres', password: 'pw', database: 'akram' });
const admin = conn(); await admin.connect();
let failed = false;
const die = async (msg) => { console.error('FAIL', msg); failed = true; };
const run = async (label, sql) => { try { await admin.query(sql); } catch (e) { console.error('FAIL', label, e.message, (e.where || '').split('\n').slice(0, 2).join(' / ')); await admin.end(); await pgs.stop(); process.exit(1); } };
await run('roles', `do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await run('appschema', 'create schema if not exists app; create extension if not exists pgcrypto;');
await run('mock', fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'));
for (const f of fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) await run(f, fs.readFileSync('supabase/migrations/' + f, 'utf8'));
// auth.uid() في القاعدة المضمّنة يقرأ الإعداد auth.user_id لكل جلسة
await run('fixtures', `
insert into auth.users (id, email) values ('4a000000-0000-0000-0000-000000000001','cc-garage@t.iq'),('4a000000-0000-0000-0000-000000000004','cc-ceo1@t.iq'),('4a000000-0000-0000-0000-000000000005','cc-ceo2@t.iq'),('4a000000-0000-0000-0000-000000000007','cc-contractor@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('4a000000-0000-0000-0000-000000000001','central_garage_officer'),('4a000000-0000-0000-0000-000000000004','super_admin'),('4a000000-0000-0000-0000-000000000005','super_admin'),('4a000000-0000-0000-0000-000000000007','employee') on conflict do nothing;
insert into public.departments (id, name, code) values ('4ad00000-0000-0000-0000-0000000000a1','كراج التزامن','CC1') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title) values ('4ad00000-0000-0000-0000-0000000000a2','سائق التزامن','CC1J','4ad00000-0000-0000-0000-0000000000a1', true) on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id) values ('4ae00000-0000-0000-0000-000000000001','4a000000-0000-0000-0000-000000000001','CC-G','مسؤول كراج التزامن','2024-01-01','4ad00000-0000-0000-0000-0000000000a1') on conflict (employee_number) do nothing;
`);

const session = async (uid) => { const c = conn(); await c.connect(); await c.query(`select set_config('auth.user_id', '${uid}', false); select set_config('app.dedup_window_seconds', '8', false)`); return c; };
const attempt = async (c, sql, params = []) => { try { const r = await c.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } };
const count = async (sql) => Number((await admin.query(sql)).rows[0].n);

// ── 1) نقرتان متزامنتان من المستخدم نفسه
{
  const [a, b] = await Promise.all([session('4a000000-0000-0000-0000-000000000001'), session('4a000000-0000-0000-0000-000000000001')]);
  const args = { full_name: 'نقرة مزدوجة', job_title_id: '4ad00000-0000-0000-0000-0000000000a2' };
  const [ra, rb] = await Promise.all([attempt(a, 'select public.hire_request_create($1::jsonb)', [args]), attempt(b, 'select public.hire_request_create($1::jsonb)', [args])]);
  const oks = [ra, rb].filter((r) => r.ok).length, dups = [ra, rb].filter((r) => !r.ok && r.err.includes('DUPLICATE_SUBMIT')).length;
  const n = await count(`select count(*) n from public.hire_requests where full_name = 'نقرة مزدوجة'`);
  if (oks !== 1 || dups !== 1 || n !== 1) await die(`S1 double click: ok=${oks} dup=${dups} rows=${n} (${ra.err ?? ''} ${rb.err ?? ''})`); else console.log('S1 ✅ نقرتان متزامنتان ⇒ سجل واحد + DUPLICATE_SUBMIT');
  await a.end(); await b.end();
}
// ── 2) مديران يقرران الطلب نفسه معاً
{
  const rid = (await admin.query(`select id from public.hire_requests where full_name = 'نقرة مزدوجة'`)).rows[0].id;
  const [a, b] = await Promise.all([session('4a000000-0000-0000-0000-000000000004'), session('4a000000-0000-0000-0000-000000000005')]);
  const [ra, rb] = await Promise.all([attempt(a, `select public.approval_decide_request('hire', $1::uuid, true, null)`, [rid]), attempt(b, `select public.approval_decide_request('hire', $1::uuid, true, null)`, [rid])]);
  const oks = [ra, rb].filter((r) => r.ok).length;
  const other = [ra, rb].find((r) => !r.ok);
  const approvedTasks = await count(`select count(*) n from public.approval_tasks where request_kind = 'hire' and request_id = '${rid}' and status = 'approved'`);
  const st = (await admin.query(`select status from public.hire_requests where id = '${rid}'`)).rows[0].status;
  const hrNotices = await count(`select count(*) n from public.notifications where title like 'طلب تعيين معتمد — أكملوا ملف نقرة مزدوجة%'`);
  if (oks !== 1 || !other || !/PROCEDURE_NOT_PENDING|APPROVAL_TASK/.test(other.err) || approvedTasks !== 1 || st !== 'approved') await die(`S2 two approvers: ok=${oks} other=${other?.err} tasks=${approvedTasks} status=${st}`);
  else console.log(`S2 ✅ مديران معاً ⇒ قرار واحد (الآخر: ${other.err.split('\n')[0]}) · إشعارات HR بلا تكرار: ${hrNotices}`);
  await a.end(); await b.end();
}
// ── 3) حضور متعهد مزدوج متزامن
{
  await run('contractor', `
    insert into public.employees (id, user_id, employee_number, full_name, hire_date) values ('4ae00000-0000-0000-0000-000000000007','4a000000-0000-0000-0000-000000000007','CC-C','متعهد التزامن','2024-01-01') on conflict (employee_number) do nothing;
    insert into auth.users (id, email) values ('4a000000-0000-0000-0000-000000000008','cc-manager@t.iq') on conflict (id) do nothing;
    insert into public.user_roles (user_id, role) values ('4a000000-0000-0000-0000-000000000008','department_manager') on conflict do nothing;
    insert into public.manager_profiles (user_id, shift, sectors) values ('4a000000-0000-0000-0000-000000000008', 'morning', '{1}') on conflict do nothing;
    insert into public.contractor_profiles (user_id, manager_user_id, sector_id) values ('4a000000-0000-0000-0000-000000000007', '4a000000-0000-0000-0000-000000000008', 1) on conflict do nothing;`);
  const [a, b] = await Promise.all([session('4a000000-0000-0000-0000-000000000007'), session('4a000000-0000-0000-0000-000000000007')]);
  const sql = `select public.contractor_checkin(33.31, 44.42, 8, 'c/s.jpg', 'c/t.jpg', 3)`;
  const [ra, rb] = await Promise.all([attempt(a, sql), attempt(b, sql)]);
  const dups = [ra, rb].filter((r) => !r.ok && r.err.includes('DUPLICATE_SUBMIT')).length;
  const oks = [ra, rb].filter((r) => r.ok).length;
  if (dups !== 1 || oks > 1) await die(`S3 contractor double checkin: ok=${oks} dup=${dups} (${ra.err ?? ''} | ${rb.err ?? ''})`);
  else console.log(`S3 ✅ حضور مزدوج متزامن ⇒ الحارس أوقف الثانية (الأولى: ${ra.ok || rb.ok ? 'نُفِّذت' : 'رُفضت من منطق الدالة: ' + (ra.err ?? rb.err).split('\n')[0]})`);
  await a.end(); await b.end();
}
// ── 4) 50 نقرة متزامنة
{
  const sessions = await Promise.all(Array.from({ length: 50 }, () => session('4a000000-0000-0000-0000-000000000001')));
  const args = { full_name: 'خمسون نقرة', job_title_id: '4ad00000-0000-0000-0000-0000000000a2' };
  const rs = await Promise.all(sessions.map((c) => attempt(c, 'select public.hire_request_create($1::jsonb)', [args])));
  const oks = rs.filter((r) => r.ok).length, dups = rs.filter((r) => !r.ok && r.err.includes('DUPLICATE_SUBMIT')).length;
  const n = await count(`select count(*) n from public.hire_requests where full_name = 'خمسون نقرة'`);
  if (oks !== 1 || dups !== 49 || n !== 1) await die(`S4 50 clicks: ok=${oks} dup=${dups} rows=${n}`); else console.log('S4 ✅ 50 نقرة متزامنة ⇒ سجل واحد و49 رفضاً');
  await Promise.all(sessions.map((c) => c.end()));
}
await admin.end(); await pgs.stop();
fs.rmSync(dir, { recursive: true, force: true });
if (failed) process.exit(1);
console.log('concurrency ok');
