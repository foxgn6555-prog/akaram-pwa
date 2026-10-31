/* global process, console, setTimeout */
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'fs';
const dir = '/tmp/epgdata-leave-concurrency';
fs.rmSync(dir, { recursive: true, force: true });
const pgs = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54330, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await pgs.initialise(); await pgs.start();
await pgs.createDatabase('akram');  // UTF8 كالإنتاج (Supabase) — SQL_ASCII يُفسد translate/regex العربية
const c = new pg.Client({ host: '127.0.0.1', port: 54330, user: 'postgres', password: 'pw', database: 'akram' });
await c.connect();
const run = async (label, sql) => { try { await c.query(sql); } catch (e) { console.error('FAIL', label, e.message, e.detail ? '['+e.detail+']' : '', (e.where||'').split('\n').slice(0,3).join(' / '), e.position ? 'pos '+e.position : ''); process.exitCode = 1; await c.end(); await pgs.stop(); process.exit(1); } };
await run('roles', `do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await run('appschema', 'create schema if not exists app; create extension if not exists pgcrypto;');
await run('mock', fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'));
// 00291: حارس التكرار معطّل افتراضياً في الاختبارات (تستدعي الدوال نفسها بالمعاملات نفسها تباعاً) — اختبارات الحارس تفعّله صراحةً
await run('dedup-off', "select set_config('app.dedup_window_seconds', '0', false)");
// 00380: MIGRATIONS_DIR=gps-warehouse/supabase/migrations لاختبار مستودع GPS (المشروع الثاني)
const migDir = process.env.MIGRATIONS_DIR || 'supabase/migrations';
const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
for (const f of files) await run(f, fs.readFileSync(migDir + '/' + f, 'utf8'));
console.log('migrations ok:', files.length);

// اتصالان حقيقيان: قفل المالية وقرار الإجازة يستخدمان قفل الشهر نفسه.
const c2 = new pg.Client({ host: '127.0.0.1', port: 54330, user: 'postgres', password: 'pw', database: 'akram' });
await c2.connect();
const uid = '39930000-0000-0000-0000-000000000001';
try {
  await c.query(`
    insert into auth.users(id,email) values ('39930000-0000-0000-0000-000000000001','priority-concurrency@test.invalid');
    insert into public.user_roles(user_id,role) values ('39930000-0000-0000-0000-000000000001','super_admin');
    insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values ('39930000-0000-0000-0000-000000000002','LOCK-1','اختبار التزامن','2024-01-01','399301');
    select set_config('auth.user_id','39930000-0000-0000-0000-000000000001',false);
    select set_config('app.dedup_window_seconds','0',false);
  `);
  await c2.query("select set_config('auth.user_id',$1,false),set_config('app.dedup_window_seconds','0',false)",[uid]);
  async function fixture(monthOffset) {
    const r = await c.query(`with d as (select (date_trunc('month',current_date) - $1 * interval '1 month')::date as m),
      x as (insert into public.hr_month_exports(period_month,status,review_status,exported_at) select m,'exported','approved',now()-interval '1 minute' from d returning id,period_month),
      l as (insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) select '39930000-0000-0000-0000-000000000002','leave',(select id from public.hr_leave_types where code='official'),m+5,m+5,'pending' from d returning id)
      select x.id as export_id,l.id as leave_id,x.period_month from x,l`,[monthOffset]);
    const f=r.rows[0];
    await c.query(`insert into public.hr_attendance_days(employee_id,work_date,status,source) values ('39930000-0000-0000-0000-000000000002',$1::date+5,'present','manual')`,[f.period_month]);
    return f;
  }
  async function blocked(promise,label) {
    let settled=false; const p=promise.then(() => {settled=true;return null}, e => {settled=true;return e});
    await new Promise(resolve => setTimeout(resolve,250));
    if (settled) throw new Error(label+' لم ينتظر قفل الشهر');
    return { p };
  }
  // المالية أولاً: الإجازة تنتظر الإقفال ثم تُرفض بلا مساس بالشهر.
  let f=await fixture(10);
  await c.query('begin');
  await c.query('select public.finance_payroll_approve($1,false)',[f.export_id]);
  let { p: pending }=await blocked(c2.query('select public.hr_leave_decide($1,true)',[f.leave_id]),'قرار الإجازة');
  await c.query('commit');
  let err=await pending; if (!err || !err.message.includes('HR_MONTH_LOCKED')) throw new Error('لم يرفض القرار بعد إقفال المالية: '+(err?.message ?? 'نجح'));
  let state=await c.query('select status from public.hr_leaves where id=$1',[f.leave_id]);
  if (state.rows[0].status !== 'pending') throw new Error('الطلب تغيّر بعد إقفال الشهر');
  // الإجازة أولاً: المالية تنتظر ثم ترى أن التصدير قديم.
  f=await fixture(11);
  await c.query('begin');
  await c.query('select public.hr_leave_decide($1,true)',[f.leave_id]);
  ({ p: pending }=await blocked(c2.query('select public.finance_payroll_approve($1,false)',[f.export_id]),'اعتماد المالية')); 
  await c.query('commit');
  err=await pending; if (!err || !err.message.includes('HR_EXPORT_STALE')) throw new Error('لم يمنع اعتماد الكشف القديم: '+(err?.message ?? 'نجح'));
  state=await c.query('select status from public.hr_month_exports where id=$1',[f.export_id]);
  if (state.rows[0].status !== 'exported') throw new Error('الكشف القديم أُقفل');
  // تعديل يدوي متزامن: ينتظر قرار الإجازة ثم لا يستطيع إخفاءها.
  f=await fixture(12);
  await c.query('begin');
  await c.query('select public.hr_leave_decide($1,true)',[f.leave_id]);
  ({ p: pending }=await blocked(c2.query("select public.ops_attendance_edit('39930000-0000-0000-0000-000000000002', $1::date+5, null, null, 'present', 'اختبار التزامن')",[f.period_month]),'التعديل اليدوي'));
  await c.query('commit');
  err=await pending; if (!err || !err.message.includes('HR_APPROVED_LEAVE_CONFLICT')) throw new Error('التعديل المتزامن لم يمنع: '+(err?.message ?? 'نجح'));
  state=await c.query("select status from public.hr_attendance_days where employee_id='39930000-0000-0000-0000-000000000002' and work_date=$1::date+5",[f.period_month]);
  if (state.rows[0].status !== 'leave') throw new Error('التعديل المتزامن أخفى الإجازة');
  // إعادة احتساب تعارض قديم: تنتظر المالية، وبعد القفل لا تغير الصف.
  f=await fixture(13);
  await c.query("update public.hr_leaves set status='approved' where id=$1",[f.leave_id]);
  await c.query('begin');
  await c.query('select public.finance_payroll_approve($1,false)',[f.export_id]);
  ({ p: pending }=await blocked(c2.query("select app.hr_evaluate_day('39930000-0000-0000-0000-000000000002',$1::date+5)",[f.period_month]),'إعادة الاحتساب'));
  await c.query('commit');
  err=await pending; if (err) throw new Error('إعادة الاحتساب فشلت: '+err.message);
  state=await c.query("select status from public.hr_attendance_days where employee_id='39930000-0000-0000-0000-000000000002' and work_date=$1::date+5",[f.period_month]);
  if (state.rows[0].status !== 'present') throw new Error('تغيرت بيانات الشهر بعد إقفال المالية');
  console.log('test ok: attendance-leave-concurrency (finance, approval, manual edit, reevaluation)');
} catch (err) { console.error('FAIL concurrency',err); process.exitCode=1; }
finally { await c.query('rollback').catch(() => {}); await c2.end(); await c.end(); await pgs.stop(); }
