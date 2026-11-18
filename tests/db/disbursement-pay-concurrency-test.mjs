/* global process, console, setTimeout */
/**
 * اختبار التزامن الحقيقي لمسار الصرف (جلسات متعددة على PostgreSQL حقيقية) — لا تكفي فيه الاختبارات ذات الجلسة الواحدة:
 *   a) ضغطتان متزامنتان على «صرف» الطلب نفسه ⇒ الثانية تنتظر ثم تُرفض (DISBURSEMENT_ALREADY_PAID) وحركة قاصة واحدة فقط.
 *   b) طلبان مختلفان مجموعهما أكبر من الرصيد ⇒ ينجح واحد فقط، والثاني ينتظر قفل الرصيد ثم TREASURY_INSUFFICIENT (لا رصيد سالب).
 *   c) إقفال الكشف نفسه من جلستين ⇒ طلب واحد فقط بلا خطأ.
 *   d) قراران متزامنان من المدير المفوض على الطلب نفسه ⇒ يفوز الأول والثاني DISBURSEMENT_NOT_PENDING.
 *   e) 12 صرفاً متزامناً للطلب نفسه ⇒ واحد ينجح. و12 طلباً مختلفاً والرصيد يكفي 5 فقط ⇒ 5 بالضبط والرصيد لا يصير سالباً.
 *   f) «اعتماد وإرسال» أجور المتعهدين من جلستين ⇒ طلب واحد فقط، والثانية DISBURSEMENT_ACTIVE_EXISTS.
 *   g) طبقة الدفاع الثانية: الدوال الأصلية (pay/decide __raw) تقفل صف الطلب بنفسها حتى لو تجاوز نداءٌ قفلَ السجل في الغلاف العام.
 * التشغيل (قاعدة مضمّنة كبقية اختبارات التزامن، تطبّق كل الترحيلات):  node tests/db/disbursement-pay-concurrency-test.mjs
 * أو على قاعدة جاهزة مرحَّلة: DISB_CONC_PG=postgresql://user:pw@host:port/db node tests/db/disbursement-pay-concurrency-test.mjs
 *   (تُترك بياناتها وراءها: استعمل نسخة قابلة للإتلاف من القاعدة)
 */
import pg from 'pg';
import fs from 'fs';

const EXTERNAL = process.env.DISB_CONC_PG || '';
let pgs = null;
let connString = EXTERNAL;
if (!EXTERNAL) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = '/tmp/epgdata-disb-concurrency';
  fs.rmSync(dir, { recursive: true, force: true });
  pgs = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54332, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
  await pgs.initialise();
  await pgs.start();
  await pgs.createDatabase('akram');
  connString = 'postgresql://postgres:pw@127.0.0.1:54332/akram';
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

const MD = 'c2d00000-0000-4000-8000-000000000001', F1 = 'c2d00000-0000-4000-8000-000000000002', F2 = 'c2d00000-0000-4000-8000-000000000003';
const OPS = 'c2d00000-0000-4000-8000-000000000004', CT = 'c2d00000-0000-4000-8000-000000000011', MGR = 'c2d00000-0000-4000-8000-000000000005';
await run('fixtures', `
  insert into auth.users (id, email) values ('${MD}', 'dc-md@t.iq'), ('${F1}', 'dc-f1@t.iq'), ('${F2}', 'dc-f2@t.iq'), ('${OPS}', 'dc-ops@t.iq'), ('${MGR}', 'dc-mgr@t.iq'), ('${CT}', 'dc-ct@t.iq');
  insert into public.user_roles (user_id, role) values ('${MD}', 'super_admin'), ('${F1}', 'finance_officer'), ('${F2}', 'finance_officer'), ('${OPS}', 'ops_room'), ('${MGR}', 'department_manager'), ('${CT}', 'employee');
  insert into public.employees (user_id, employee_number, full_name, hire_date, biometric_pin) values ('${CT}', 'DC-CT', 'dc متعهد', '2025-01-01', 'DCCT');
  insert into public.manager_profiles (user_id, shift, sectors) values ('${MGR}', 'morning', '{3}');
  insert into public.contractor_profiles (user_id, manager_user_id, sector_id, shift) values ('${CT}', '${MGR}', 3, 'morning');`);

// جلسة بهوية مستخدم (حارس التكرار معطّل: نريد اختبار القفل لا النافذة)
const mk = async (uid) => { const c = conn(); await c.connect(); await c.query(`select set_config('auth.user_id', $1, false), set_config('app.dedup_window_seconds', '0', false)`, [uid]); return c; };
const setBalance = async (target) => {
  const cur = await num('select app.treasury_balance()');
  if (target === cur) return;
  const kind = target > cur ? 'receipt' : 'expense';
  await admin.query(`insert into public.treasury_transactions (ref_no, kind, amount, type_name, status, affects_balance, created_by, confirmed_by, confirmed_at) values ($1, $2, $3, 'dc', 'confirmed', true, $4, $4, now())`,
    ['TR-DC-' + Math.random().toString(36).slice(2), kind, Math.abs(target - cur), F1]);
};
let seq = 0;
const mkExport = async (month, net, by = F2) => {
  seq++;
  const e = await one(`insert into public.employees (employee_number, full_name, hire_date) values ($1, $2, '2024-01-01') returning id`, [`DC-${seq}`, `dc سباق ${seq}`]);
  const x = await one(`insert into public.hr_month_exports (period_month, version, status, review_status, exported_by) values ($1, 1, 'exported', 'approved', $2) returning id`, [month, by]);
  await admin.query(`insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, pay_type, gross_amount, deductions_total, proposed_net, final_net) values ($1, $2, $3, 'dc', 'monthly', $4, 0, $4, $4)`, [x, e, `DC-${seq}`, net]);
  return x;
};
const close = (x, by = F2) => admin.query(`update public.hr_month_exports set status = 'approved', approved_by = $2, approved_at = now() where id = $1`, [x, by]);
const mkReq = async (month, net) => {
  const x = await mkExport(month, net);
  await close(x);
  return (await admin.query(`select * from public.payroll_disbursements where source_export_id = $1`, [x])).rows[0];
};
const decideOk = async (id) => { const c = await mk(MD); await c.query('select public.disbursement_decide($1, true)', [id]); await c.end(); };

await admin.query(`select set_config('app.dedup_window_seconds', '0', false)`);
await setBalance(10000000);

// ── a) ضغطتان متزامنتان على الصرف نفسه: الجلسة الأولى تمسك الأقفال حتى التثبيت
{
  const P = await mkReq('2040-01-01', 1000000); await decideOk(P.id);
  const c1 = await mk(F1), c2 = await mk(F1);
  await c1.query('begin'); await c1.query('select public.disbursement_pay($1)', [P.id]);
  const p2 = settle(c2.query('select public.disbursement_pay($1)', [P.id]));
  check('a1) الجلسة الثانية تنتظر ولا تتجاوز القفل ما دامت الأولى لم تثبّت', await isPending(p2));
  await c1.query('commit');
  const r2 = await p2;
  check('a2) بعد التثبيت تُرفض الثانية بـ DISBURSEMENT_ALREADY_PAID', !r2.ok && r2.m.includes('DISBURSEMENT_ALREADY_PAID'), r2.m || 'نجحت!');
  check('a3) حركة واحدة فقط والرصيد خُصم مرة واحدة (10,000,000 − 1,000,000)', (await num(`select count(*) from public.treasury_transactions where kind = 'payroll'`)) === 1 && (await num('select app.treasury_balance()')) === 9000000);
  await c1.end(); await c2.end();
}

// ── b) سباق تجاوز الرصيد: طلبان مختلفان مجموعهما أكبر من الرصيد ⇒ ينجح واحد فقط
{
  await setBalance(1500000);
  const X = await mkReq('2040-02-01', 1000000), Y = await mkReq('2040-03-01', 1000000);
  await decideOk(X.id); await decideOk(Y.id);
  const c1 = await mk(F1), c2 = await mk(F2);
  await c1.query('begin'); await c1.query('select public.disbursement_pay($1)', [X.id]);
  const pY = settle(c2.query('select public.disbursement_pay($1)', [Y.id]));
  check('b1) صرف الطلب الثاني ينتظر قفل الرصيد ما دام الأول لم يثبّت', await isPending(pY));
  await c1.query('commit');
  const rY = await pY;
  check('b2) بعد التثبيت يُرفض الثاني بـ TREASURY_INSUFFICIENT (لا تجاوز للرصيد)', !rY.ok && rY.m.includes('TREASURY_INSUFFICIENT'), rY.m || 'نجح!');
  check('b3) الرصيد 500,000 (غير سالب) والطلب الثاني ما زال معتمداً', (await num('select app.treasury_balance()')) === 500000 && (await one('select status from public.payroll_disbursements where id = $1', [Y.id])) === 'approved');
  await c1.end(); await c2.end();
}

// ── c) إقفال الكشف نفسه من جلستين: طلب واحد فقط ولا خطأ
{
  const x = await mkExport('2040-04-01', 700);
  const c1 = await mk(F1), c2 = await mk(F2);
  const upd = `update public.hr_month_exports set status = 'approved', approved_by = $2, approved_at = now() where id = $1`;
  await c1.query('begin'); await c1.query(upd, [x, F1]);
  const pq = settle(c2.query(upd, [x, F2]));
  check('c1) الإقفال الثاني ينتظر قفل صف الكشف', await isPending(pq));
  await c1.query('commit');
  const rq = await pq;
  check('c2) لا خطأ ولا طلب مكرر: طلب واحد لهذا الكشف', rq.ok && (await num('select count(*) from public.payroll_disbursements where source_export_id = $1', [x])) === 1, rq.m || '');
  await c1.end(); await c2.end();
}

// ── d) قراران متزامنان من المدير المفوض على الطلب نفسه
{
  const Z = await mkReq('2040-05-01', 5000);
  const c1 = await mk(MD), c2 = await mk(MD);
  await c1.query('begin'); await c1.query('select public.disbursement_decide($1, true)', [Z.id]);
  const pz = settle(c2.query(`select public.disbursement_decide($1, false, 'رفض متزامن')`, [Z.id]));
  check('d1) القرار الثاني ينتظر', await isPending(pz));
  await c1.query('commit');
  const rz = await pz;
  check('d2) القرار الثاني يُرفض (NOT_PENDING) والأول ثابت (approved)', !rz.ok && rz.m.includes('DISBURSEMENT_NOT_PENDING') && (await one('select status from public.payroll_disbursements where id = $1', [Z.id])) === 'approved', rz.m || '');
  await c1.end(); await c2.end();
}

// ── e) ضغط: 12 صرفاً للطلب نفسه، ثم 12 طلباً مختلفاً والرصيد يكفي 5 فقط
{
  await setBalance(100000000);
  const H = await mkReq('2040-06-01', 1000); await decideOk(H.id);
  const cs = await Promise.all(Array.from({ length: 12 }, () => mk(F1)));
  const bal0 = await num('select app.treasury_balance()');
  const outs = await Promise.all(cs.map((c) => settle(c.query('select public.disbursement_pay($1)', [H.id]))));
  const okN = outs.filter((o) => o.ok).length;
  check('e1) 12 صرفاً متزامناً للطلب نفسه: واحد ينجح فقط والباقي ALREADY_PAID', okN === 1 && outs.filter((o) => !o.ok).every((o) => o.m.includes('DISBURSEMENT_ALREADY_PAID')), `${okN} نجحوا: ${outs.filter((o) => !o.ok).map((o) => o.m.slice(0, 40)).join('|')}`);
  check('e2) ... والرصيد خُصم 1,000 مرة واحدة', (await num('select app.treasury_balance()')) === bal0 - 1000);
  for (const c of cs) await c.end();

  const many = [];
  for (let i = 0; i < 12; i++) { const r = await mkReq(`2041-${String(i + 1).padStart(2, '0')}-01`, 1000000); await decideOk(r.id); many.push(r); }
  await setBalance(5500000);
  const cs2 = await Promise.all(many.map(() => mk(F1)));
  const outs2 = await Promise.all(cs2.map((c, i) => settle(c.query('select public.disbursement_pay($1)', [many[i].id]))));
  const ok2 = outs2.filter((o) => o.ok).length;
  check('e3) ينجح 5 صرفات بالضبط والباقي TREASURY_INSUFFICIENT', ok2 === 5 && outs2.filter((o) => !o.ok).every((o) => o.m.includes('TREASURY_INSUFFICIENT')), `${ok2} نجحوا: ${outs2.filter((o) => !o.ok).map((o) => o.m.slice(0, 50)).join('|')}`);
  check('e4) الرصيد النهائي 500,000 وليس سالباً أبداً', (await num('select app.treasury_balance()')) === 500000, String(await num('select app.treasury_balance()')));
  for (const c of cs2) await c.end();
}

// ── f) «اعتماد وإرسال» أجور المتعهدين من جلستين: طلب واحد
{
  const M = '2025-09-01';
  await admin.query(`update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1`);
  await admin.query(`insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) select $1, 3, $2::date + i, 'follow_up', 2, $3 from generate_series(0, 2) i`, [CT, M, OPS]);
  await admin.query(`insert into public.hr_attendance_days (employee_id, work_date, status, source) select (select id from public.employees where user_id = $1), $2::date + i, 'present', 'manual' from generate_series(0, 2) i`, [CT, M]);
  const o = await mk(OPS);
  await o.query(`select public.ops_contractor_month_approve($1, 'follow_up', true)`, [M]); await o.end();
  const f = await mk(F1);
  await f.query('select public.finance_contractor_rates_set($1, $2, 50000, 30000, null)', [CT, M]); await f.end();
  const c1 = await mk(F1), c2 = await mk(F2);
  await c1.query('begin'); await c1.query('select public.finance_contractor_wages_close($1)', [M]);
  const pc = settle(c2.query('select public.finance_contractor_wages_close($1)', [M]));
  check('f1) «اعتماد وإرسال» الثانية تنتظر قفل الشهر', await isPending(pc));
  await c1.query('commit');
  const rc = await pc;
  check('f2) الثانية تُرفض بـ DISBURSEMENT_ACTIVE_EXISTS وطلب واحد للشهر', !rc.ok && rc.m.includes('DISBURSEMENT_ACTIVE_EXISTS') && (await num(`select count(*) from public.payroll_disbursements where kind = 'contractor_wages' and period_month = $1`, [M])) === 1, rc.m || 'نجحت!');
  check('f3) المبلغ المجمَّد: 3 أيام × (50,000 + 30,000) = 240,000', (await num(`select net_total from public.payroll_disbursements where kind = 'contractor_wages' and period_month = $1`, [M])) === 240000);
  await c1.end(); await c2.end();
}

// ── g) طبقة الدفاع الثانية: قفل صف الطلب داخل الدوال الأصلية. الغلاف العام يقفل السجل أصلاً (guard_record_lock)،
//      فلا تُرى هذه الطبقة عبر الواجهة؛ نستدعي الأصل مباشرة بصفة مالك القاعدة لنثبت أنها تعمل وحدها.
{
  await setBalance(90000000);
  const P = await mkReq('2042-01-01', 1000); await decideOk(P.id);
  const txBefore = await num(`select count(*) from public.treasury_transactions where kind = 'payroll'`);
  const c1 = await mk(F1), c2 = await mk(F1);
  await c1.query('begin'); await c1.query('select app.disbursement_pay__raw($1)', [P.id]);
  const p2 = settle(c2.query('select app.disbursement_pay__raw($1)', [P.id]));
  check('g1) الأصل مباشرة: الصرف الثاني ينتظر', await isPending(p2));
  await c1.query('commit');
  const r2 = await p2;
  check('g2) ... ثم يُرفض بـ ALREADY_PAID ولا حركة ثانية', !r2.ok && r2.m.includes('DISBURSEMENT_ALREADY_PAID') && (await num(`select count(*) from public.treasury_transactions where kind = 'payroll'`)) === txBefore + 1, r2.m || 'نجح (صرف مزدوج)!');
  await c1.end(); await c2.end();

  const Q = await mkReq('2042-02-01', 2000);
  const d1 = await mk(MD), d2 = await mk(MD);
  await d1.query('begin'); await d1.query('select app.disbursement_decide__raw($1, true)', [Q.id]);
  const pq = settle(d2.query(`select app.disbursement_decide__raw($1, false, 'رفض متزامن')`, [Q.id]));
  check('g3) الأصل مباشرة: القرار الثاني ينتظر', await isPending(pq));
  await d1.query('commit');
  const rq = await pq;
  check('g4) ... ثم يُرفض بـ NOT_PENDING والقرار الأول ثابت (لا تحديث ضائع)', !rq.ok && rq.m.includes('DISBURSEMENT_NOT_PENDING') && (await one('select status from public.payroll_disbursements where id = $1', [Q.id])) === 'approved', rq.m || 'نجح (قرار متضارب)!');
  await d1.end(); await d2.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
await stop();
process.exit(fail ? 1 : 0);
