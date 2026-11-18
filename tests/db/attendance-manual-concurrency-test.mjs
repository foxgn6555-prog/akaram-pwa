/* global process, console, setTimeout */
/**
 * اختبار التزامن الحقيقي للحضور اليدوي البديل (جلسات متعددة على PostgreSQL حقيقية):
 *   a) تفعيلان متزامنان لنطاق البوابة نفسه ⇒ الثاني ينتظر ثم ATT_MANUAL_DUPLICATE_ACTIVE، وتفعيل واحد فقط.
 *   b) حفظان متزامنان لموظف ويوم واحد بحالتين مختلفتين ⇒ الثاني ينتظر قفل التفعيل، ثم يُرفض بـ ATT_MANUAL_NOTE_REQUIRED
 *      (يرى مُدخَل الأول فيعدّه تعديلاً)، والنتيجة: صف واحد بمراجعة 1 وتدقيق واحد — لا ضياع كتابة صامت.
 *   c) إيقاف يرجع اليوم للبصمة + حفظ متزامن لليوم نفسه ⇒ الحفظ ينتظر ثم ATT_MANUAL_DATE_OUT_OF_RANGE (لا صف يدوي على يوم عاد للبصمة).
 *   d) 12 حفظاً متزامناً لموظفين مختلفين في التفعيل نفسه ⇒ كلها تنجح بلا تعطّل (deadlock) و12 مُدخَلاً.
 *   f) إيقافان متزامنان لتفعيل واحد ⇒ الثاني ينتظر ثم ATT_MANUAL_ALREADY_ENDED، وسبب الإيقاف المحفوظ هو الأول.
 *   e) طبقة الدفاع الثانية: الأصل app.manual_att_sheet_save__raw يتسلسل بنفسه (قفل الشهر + صف التفعيل) حتى لو استُدعي دون الغلاف، وغير قابل للاستدعاء من authenticated.
 * التشغيل (قاعدة مضمّنة كبقية اختبارات التزامن، تطبّق كل الترحيلات):  node tests/db/attendance-manual-concurrency-test.mjs
 * أو على قاعدة جاهزة مرحَّلة: ATT_MANUAL_CONC_PG=postgresql://user:pw@host:port/db node tests/db/attendance-manual-concurrency-test.mjs
 *   (تُترك بياناتها وراءها: استعمل نسخة قابلة للإتلاف من القاعدة)
 */
import pg from 'pg';
import fs from 'fs';

const EXTERNAL = process.env.ATT_MANUAL_CONC_PG || '';
let pgs = null;
let connString = EXTERNAL;
if (!EXTERNAL) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = '/tmp/epgdata-attmanual-concurrency';
  fs.rmSync(dir, { recursive: true, force: true });
  pgs = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54334, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
  await pgs.initialise();
  await pgs.start();
  await pgs.createDatabase('akram');
  connString = 'postgresql://postgres:pw@127.0.0.1:54334/akram';
}
const conn = () => new pg.Client({ connectionString: connString });
const admin = conn();
await admin.connect();
const stop = async () => { try { await admin.end(); } catch { /* ignore */ } if (pgs) await pgs.stop(); };
const run = async (label, sql) => {
  try { await admin.query(sql); } catch (e) { console.error('FAIL', label, e.message, (e.where || '').split('\n').slice(0, 2).join(' / ')); await stop(); process.exit(1); }
};
if (!EXTERNAL) {
  await run('roles', `do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
  await run('appschema', 'create schema if not exists app; create extension if not exists pgcrypto;');
  await run('mock', fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'));
  for (const f of fs.readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) await run(f, fs.readFileSync('supabase/migrations/' + f, 'utf8'));
}

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (p) => p.then((r) => ({ ok: true, r }), (e) => ({ ok: false, m: String(e.message) }));
const isPending = async (p) => (await Promise.race([p.then(() => 'done', () => 'done'), sleep(600).then(() => 'pending')])) === 'pending';
const one = async (sql, params = []) => { const r = await admin.query(sql, params); return r.rows[0] ? Object.values(r.rows[0])[0] : null; };
const num = async (sql, params = []) => Number(await one(sql, params));

const IT = 'a7c00000-0000-4000-8000-000000000001', GATE = 'a7c00000-0000-4000-8000-000000000002', OPS = 'a7c00000-0000-4000-8000-000000000003';
const DEPT = 'a7c00000-0000-4000-8000-0000000000d1', DEPT2 = 'a7c00000-0000-4000-8000-0000000000d2';
await run('fixtures', `
  insert into auth.users (id, email) values ('${IT}', 'ac-it@t.iq'), ('${GATE}', 'ac-gate@t.iq'), ('${OPS}', 'ac-ops@t.iq');
  insert into public.user_roles (user_id, role) values ('${IT}', 'it_admin'), ('${GATE}', 'transfer_station'), ('${OPS}', 'ops_room');
  insert into public.departments (id, name, code) values ('${DEPT}', 'ac محطة', 'ACD'), ('${DEPT2}', 'ac محطة 2', 'ACE');
  insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values ('a7c00000-0000-4000-8000-0000000000a1', 'ac صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}');
  insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin, department_id)
    select ('a7c00000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'AC-' || n, 'ac موظف ' || n, '2024-01-01', 'AC' || n, '${DEPT}' from generate_series(1, 14) n;
  insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
    select e.id, 'a7c00000-0000-4000-8000-0000000000a1', '2024-01-01' from public.employees e where e.employee_number like 'AC-%';
  insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin, department_id)
    values ('a7c00000-0000-4000-8000-000000000201', 'AC-X1', 'ac موظف المحطة 2', '2024-01-01', 'ACX1', '${DEPT2}');`);
const E = (n) => `a7c00000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

// جلسة بهوية مستخدم (حارس التكرار معطّل: نريد اختبار القفل لا النافذة). الهوية بالإعدادين: auth.user_id (قاعدة المحاكاة المضمّنة) و request.jwt.claims (ما تقرؤه auth.uid() في Supabase الحقيقي)
const mk = async (uid) => { const c = conn(); await c.connect(); await c.query(`select set_config('auth.user_id', $1, false), set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, false), set_config('app.dedup_window_seconds', '0', false)`, [uid]); return c; };
await admin.query(`select set_config('app.dedup_window_seconds', '0', false)`);
const today = String(await one(`select app.hr_local_date(now())::text`));
const dayBefore = String(await one(`select (app.hr_local_date(now()) - 1)::text`));
const entries = (...pairs) => JSON.stringify(pairs.map(([n, st]) => ({ employee_id: E(n), status: st })));
const activate = (c, dept, start = dayBefore) => c.query(`select public.attendance_manual_activate('transfer-station', null, $1::uuid, true, 'تعطل جهاز اختبار التزامن', $2::date) as r`, [dept, start]);

// ── a) تفعيلان متزامنان لنطاق واحد
let ACT;
{
  const c1 = await mk(IT), c2 = await mk(IT);
  await c1.query('begin'); const r1 = await activate(c1, DEPT);
  ACT = r1.rows[0].r.id;
  const p2 = settle(activate(c2, DEPT));
  check('a1) التفعيل الثاني ينتظر ما دام الأول لم يثبّت (فهرس التفرّد)', await isPending(p2));
  await c1.query('commit');
  const r2 = await p2;
  check('a2) بعد التثبيت يُرفض الثاني بـ ATT_MANUAL_DUPLICATE_ACTIVE', !r2.ok && r2.m.includes('ATT_MANUAL_DUPLICATE_ACTIVE'), r2.m || 'نجح!');
  check('a3) تفعيل واحد فقط ساري لهذا النطاق', (await num(`select count(*) from public.attendance_manual_activations where status = 'active' and department_id = '${DEPT}'`)) === 1);
  await c1.end(); await c2.end();
}

// ── b) حفظان متزامنان لموظف ويوم واحد بحالتين مختلفتين
{
  const g1 = await mk(GATE), g2 = await mk(GATE);
  await g1.query('begin');
  await g1.query('select public.manual_att_sheet_save($1::uuid, $2::date, $3::jsonb, null)', [ACT, today, entries([1, 'present'])]);
  const p2 = settle(g2.query('select public.manual_att_sheet_save($1::uuid, $2::date, $3::jsonb, null)', [ACT, today, entries([1, 'absent'])]));
  check('b1) الحفظ الثاني ينتظر قفل التفعيل ما دام الأول لم يثبّت', await isPending(p2));
  await g1.query('commit');
  const r2 = await p2;
  check('b2) بعد التثبيت يرى الثاني مُدخَل الأول فيُرفض بـ ATT_MANUAL_NOTE_REQUIRED (تعديل بلا سبب)', !r2.ok && r2.m.includes('ATT_MANUAL_NOTE_REQUIRED'), r2.m || 'نجح!');
  check('b3) الصف النهائي «حاضر» بمراجعة 1 وتدقيق واحد فقط (لا ضياع كتابة صامت)',
    (await one(`select status from public.hr_attendance_days where employee_id = '${E(1)}' and work_date = '${today}'`)) === 'present'
    && (await num(`select revision from public.attendance_manual_entries where employee_id = '${E(1)}' and work_date = '${today}'`)) === 1
    && (await num(`select count(*) from public.hr_attendance_audit where employee_id = '${E(1)}' and work_date = '${today}' and action = 'edit'`)) === 1);
  await g1.end(); await g2.end();
}

// ── d) 12 حفظاً متزامناً لموظفين مختلفين في التفعيل نفسه
{
  const sessions = await Promise.all(Array.from({ length: 12 }, () => mk(GATE)));
  const res = await Promise.all(sessions.map((c, i) => settle(c.query('select public.manual_att_sheet_save($1::uuid, $2::date, $3::jsonb, null)', [ACT, dayBefore, entries([i + 2, i % 2 ? 'absent' : 'present'])]))));
  check('d1) كل الحفظات الـ12 نجحت (مُسلسَلة بلا تعطّل)', res.every((x) => x.ok), res.filter((x) => !x.ok).map((x) => x.m).join(' | '));
  check('d2) 12 مُدخَلاً بالضبط لليوم السابق', (await num(`select count(*) from public.attendance_manual_entries where activation_id = '${ACT}' and work_date = '${dayBefore}'`)) === 12);
  check('d3) عدد صفوف الحضور اليدوية مطابق (12) ولا صفوف تلقائية لهذا اليوم', (await num(`select count(*) from public.hr_attendance_days where work_date = '${dayBefore}' and source = 'manual' and employee_id::text like 'a7c00000-%'`)) === 12
    && (await num(`select count(*) from public.hr_attendance_days where work_date = '${dayBefore}' and source = 'auto' and employee_id::text like 'a7c00000-%'`)) === 0);
  await Promise.all(sessions.map((c) => c.end()));
}

// ── c) إيقاف يُرجع اليوم للبصمة + حفظ متزامن لليوم نفسه
{
  const it = await mk(IT), g = await mk(GATE);
  await it.query('begin');
  const d = await it.query(`select public.attendance_manual_deactivate($1::uuid, $2::date, 'أُصلح الجهاز') as r`, [ACT, dayBefore]);
  check('c1) الإيقاف بآخر يوم مغطّى = أمس نجح', d.rows[0].r.ends_on === dayBefore || String(d.rows[0].r.ends_on).startsWith(dayBefore));
  const pg2 = settle(g.query('select public.manual_att_sheet_save($1::uuid, $2::date, $3::jsonb, null)', [ACT, today, entries([13, 'present'])]));
  check('c2) حفظ اليوم ينتظر قفل التفعيل ما دام الإيقاف لم يثبّت', await isPending(pg2));
  await it.query('commit');
  const r = await pg2;
  check('c3) بعد التثبيت يُرفض الحفظ بـ ATT_MANUAL_DATE_OUT_OF_RANGE (اليوم عاد للبصمة)', !r.ok && r.m.includes('ATT_MANUAL_DATE_OUT_OF_RANGE'), r.m || 'نجح!');
  check('c4) لا صف يدوي لموظف اليوم المرفوض', (await num(`select count(*) from public.hr_attendance_days where employee_id = '${E(13)}' and work_date = '${today}' and source = 'manual'`)) === 0);
  await it.end(); await g.end();
}

// ── f) إيقافان متزامنان لتفعيل واحد ⇒ الثاني ينتظر ثم ATT_MANUAL_ALREADY_ENDED، وإيقاف واحد مسجَّل
{
  const c0 = await mk(IT);
  const act2 = (await activate(c0, DEPT2)).rows[0].r.id;
  await c0.end();
  const i1 = await mk(IT), i2 = await mk(IT);
  await i1.query('begin');
  await i1.query(`select public.attendance_manual_deactivate($1::uuid, $2::date, 'إيقاف أول')`, [act2, dayBefore]);
  const p2 = settle(i2.query(`select public.attendance_manual_deactivate($1::uuid, $2::date, 'إيقاف ثانٍ')`, [act2, dayBefore]));
  check('f1) الإيقاف الثاني ينتظر ما دام الأول لم يثبّت', await isPending(p2));
  await i1.query('commit');
  const r2 = await p2;
  check('f2) بعد التثبيت يُرفض الثاني بـ ATT_MANUAL_ALREADY_ENDED', !r2.ok && r2.m.includes('ATT_MANUAL_ALREADY_ENDED'), r2.m || 'نجح!');
  check('f3) سبب الإيقاف المحفوظ هو الأول (لا كتابة فوقه)', (await one(`select end_note from public.attendance_manual_activations where id = $1`, [act2])) === 'إيقاف أول');
  await i1.end(); await i2.end();
}

// ── e) طبقة الدفاع الثانية: الأصل يتسلسل بنفسه (قفل الشهر)، وغير مكشوف لـ authenticated
{
  const g1 = await mk(GATE), g2 = await mk(GATE);
  // e1) الأصل (مستدعىً مباشرة بلا الغلاف، بصلاحية المالك) من جلستين: الثانية تنتظر ثم تُرفض كتعديل بلا سبب
  await g1.query('begin');
  await g1.query('select app.manual_att_sheet_save__raw($1::uuid, $2::date, $3::jsonb, null)', [ACT, dayBefore, entries([14, 'present'])]);
  const p2 = settle(g2.query('select app.manual_att_sheet_save__raw($1::uuid, $2::date, $3::jsonb, null)', [ACT, dayBefore, entries([14, 'absent'])]));
  check('e1) الأصل نفسه يُسلسل الحفظين (الثاني ينتظر قفل الشهر وإن تجاوز الغلاف)', await isPending(p2));
  await g1.query('commit');
  const r2 = await p2;
  check('e2) والثاني يُرفض بـ ATT_MANUAL_NOTE_REQUIRED (لا كتابة صامتة فوق مُدخَل غير مرئي له)', !r2.ok && r2.m.includes('ATT_MANUAL_NOTE_REQUIRED'), r2.m || 'نجح!');
  check('e3) المُدخَل النهائي «حاضر» بمراجعة 1', (await one(`select status from public.attendance_manual_entries where employee_id = '${E(14)}' and work_date = '${dayBefore}'`)) === 'present'
    && (await num(`select revision from public.attendance_manual_entries where employee_id = '${E(14)}' and work_date = '${dayBefore}'`)) === 1);
  await g1.end(); await g2.end();
}
{
  const g = await mk(GATE);
  await g.query(`set role authenticated`);
  const r = await settle(g.query('select app.manual_att_sheet_save__raw($1::uuid, $2::date, $3::jsonb, null)', [ACT, dayBefore, entries([14, 'present'])]));
  check('e4) استدعاء الأصل من authenticated مرفوض (لا امتياز execute)', !r.ok && /permission denied|لا تملك|denied/i.test(r.m), r.m || 'نجح!');
  const w = await settle(g.query(`select public.attendance_manual_activate('transfer-station', null, '${DEPT}'::uuid, true, 'محاولة تفعيل من حساب البوابة')`));
  check('e5) حساب البوابة لا يفعّل بنفسه (PERMISSION_DENIED)', !w.ok && w.m.includes('PERMISSION_DENIED'), w.m || 'نجح!');
  await g.end();
}

console.log(`\n════ ${pass} نجح · ${fail} فشل ════`);
await stop();
process.exit(fail ? 1 : 0);
