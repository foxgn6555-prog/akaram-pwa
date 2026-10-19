-- 00251 · ضريبة الآليات المؤجرة (بادئة rt): من يخضع، الوعاء = الإجمالي المستحق، العزل عن باقي الاستقطاعات، صلاحيات المعاون، الإعفاء/النسبة الخاصة، المطابقة
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values ('c7000000-0000-0000-0000-000000000001', 'rt-ops@t.iq'), ('c7000000-0000-0000-0000-000000000003', 'rt-dep@t.iq'), ('c7000000-0000-0000-0000-000000000007', 'rt-fin@t.iq'), ('c7000000-0000-0000-0000-000000000009', 'rt-hr@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('c7000000-0000-0000-0000-000000000001', 'ops_room'), ('c7000000-0000-0000-0000-000000000003', 'deputy_director'), ('c7000000-0000-0000-0000-000000000007', 'finance_officer'), ('c7000000-0000-0000-0000-000000000009', 'hr_officer') on conflict do nothing;
insert into public.departments (id, name, code) values ('c7000000-0000-0000-0000-0000000000d1', 'rt النقل', 'RTD') on conflict (id) do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, biometric_pin, department_id, is_driver) values
  ('c7000000-0000-0000-0000-0000000000e1', 'rt سائق مؤجرة أساسي', 'RT-A', '2024-01-01', '7701', 'c7000000-0000-0000-0000-0000000000d1', true),
  ('c7000000-0000-0000-0000-0000000000e2', 'rt سائق مؤجرة شفت', 'RT-B', '2024-01-01', '7702', 'c7000000-0000-0000-0000-0000000000d1', true),
  ('c7000000-0000-0000-0000-0000000000e3', 'rt سائق مملوكة', 'RT-C', '2024-01-01', '7703', 'c7000000-0000-0000-0000-0000000000d1', true) on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values ('c7000000-0000-0000-0000-0000000000a1', 'rt شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
  select e, 'c7000000-0000-0000-0000-0000000000a1', '2024-01-01' from unnest(array['c7000000-0000-0000-0000-0000000000e1','c7000000-0000-0000-0000-0000000000e2','c7000000-0000-0000-0000-0000000000e3']::uuid[]) e on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values ('c7000000-0000-0000-0000-0000000000d9', 'RT-DEV-1', 'rt جهاز', '+03:00', true) on conflict (serial_number) do nothing;
-- الآليات: V1 مؤجرة سائقها الأساسي A · V2 مؤجرة بلا سائق أساسي لكن B سائق شفت فعّال · V3 مملوكة سائقها C
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, shift, driver_name, sector_id, created_by, driver_employee_id, ownership_type, lessor_name) values
  ('c7000000-0000-0000-0000-0000000000b1'::uuid, 'rt كابسة مؤجرة', 'RT-V1', 'RT-11111', 'RT-CH1', 'v/rt1.jpg', 'morning', 'rt سائق مؤجرة أساسي', 1, 'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-0000000000e1', 'rented', 'مكتب النور للتأجير'),
  ('c7000000-0000-0000-0000-0000000000b2'::uuid, 'rt قلاب مؤجر', 'RT-V2', 'RT-22222', 'RT-CH2', 'v/rt2.jpg', 'evening', 'rt سائق مؤجرة شفت', 1, 'c7000000-0000-0000-0000-000000000001', null, 'rented', 'مكتب الأمل'),
  ('c7000000-0000-0000-0000-0000000000b3'::uuid, 'rt كابسة مملوكة', 'RT-V3', 'RT-33333', 'RT-CH3', 'v/rt3.jpg', 'morning', 'rt سائق مملوكة', 1, 'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-0000000000e3', 'owned', null)
on conflict (id) do nothing;
insert into public.garage_vehicle_shift_assignments (vehicle_id, shift, driver_name, sector_id, created_by, driver_employee_id)
  values ('c7000000-0000-0000-0000-0000000000b2'::uuid, 'evening', 'rt سائق مؤجرة شفت', 1, 'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-0000000000e2') on conflict do nothing;
select set_config('test.rt_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

-- بصمات الشهر الماضي: A كامل إلا 3 أيام غياب (i in 5,6,7) · B و C كاملان
do $$ declare m date := current_setting('test.rt_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; i int; n int; begin
  for i in 0..dim - 1 loop
    if i not in (5, 6, 7) then n := public.biometric_ingest('RT-DEV-1', '7701' || E'\t' || (m + i)::text || E' 08:00:00\t0\n7701\t' || (m + i)::text || E' 16:00:00\t1', 'ATTLOG'); end if;
    n := public.biometric_ingest('RT-DEV-1', '7702' || E'\t' || (m + i)::text || E' 08:00:00\t0\n7702\t' || (m + i)::text || E' 16:00:00\t1', 'ATTLOG');
    n := public.biometric_ingest('RT-DEV-1', '7703' || E'\t' || (m + i)::text || E' 08:00:00\t0\n7703\t' || (m + i)::text || E' 16:00:00\t1', 'ATTLOG');
  end loop;
  perform app.hr_evaluate_month(m);
end $$;
-- رواتب: A 1,500,000 + مخصصات 150,000 · B 1,200,000 · C 1,000,000 · استقطاع ثابت لـ B 50,000 (للتأكد من عدم التداخل)
select auth.set_test_user('c7000000-0000-0000-0000-000000000007');
select public.finance_salary_set('c7000000-0000-0000-0000-0000000000e1', 'monthly', 1500000, 0, '{"نقل": 150000}', '{}', null);
select public.finance_salary_set('c7000000-0000-0000-0000-0000000000e2', 'monthly', 1200000, 0, '{}', '{"تأمين": 50000}', null);
select public.finance_salary_set('c7000000-0000-0000-0000-0000000000e3', 'monthly', 1000000, 0, '{}', '{}', null);
do $$ declare e record; begin
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;

-- ═══ T1 · من يخضع: A (سائق أساسي) و B (سائق شفت) نعم بـ 3٪ افتراضياً · C (مملوكة) لا ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare j jsonb; begin
  j := app.rented_tax_rate_for('c7000000-0000-0000-0000-0000000000e1');
  assert (j ->> 'pct')::numeric = 3 and j ->> 'source' = 'auto' and j ->> 'vehicle' like 'RT-V1%', 'T1 A: ' || j::text;
  j := app.rented_tax_rate_for('c7000000-0000-0000-0000-0000000000e2');
  assert (j ->> 'pct')::numeric = 3 and j ->> 'source' = 'auto' and j ->> 'vehicle' like 'RT-V2%', 'T1 B: ' || j::text;
  j := app.rented_tax_rate_for('c7000000-0000-0000-0000-0000000000e3');
  assert (j ->> 'pct')::numeric = 0 and j ->> 'source' = 'none', 'T1 C: ' || j::text;
  raise notice 'T1 ✅ من يخضع للضريبة';
end $$;

-- ═══ T2 · التصدير: الوعاء = الإجمالي المستحق (الأيام المدفوعة فقط)، سطر مستقل، لا تداخل مع الثابت، المطابقة خضراء ═══
select auth.set_test_user('c7000000-0000-0000-0000-000000000001');
do $$ declare x uuid; begin x := public.ops_month_export(current_setting('test.rt_m')::date); perform set_config('test.rt_x1', x::text, false); end $$;
reset role; select set_config('auth.user_id','', false);
do $$ declare a public.hr_month_export_rows; b public.hr_month_export_rows; c public.hr_month_export_rows; dim int; exp_gross numeric; begin
  select * into a from public.hr_month_export_rows where export_id = current_setting('test.rt_x1')::uuid and employee_id = 'c7000000-0000-0000-0000-0000000000e1';
  select * into b from public.hr_month_export_rows where export_id = current_setting('test.rt_x1')::uuid and employee_id = 'c7000000-0000-0000-0000-0000000000e2';
  select * into c from public.hr_month_export_rows where export_id = current_setting('test.rt_x1')::uuid and employee_id = 'c7000000-0000-0000-0000-0000000000e3';
  dim := extract(day from (current_setting('test.rt_m')::date + interval '1 month - 1 day'))::int;
  -- A غاب 3 أيام ⇒ الأيام المدفوعة = dim − 3 ⇒ الإجمالي المستحق أقل من الراتب الكامل، والضريبة 3٪ منه بالضبط
  assert a.days_absent = 3 and a.payable_days = dim - 3, 'T2 A days: ' || a.days_absent || '/' || a.payable_days;
  assert a.rented_tax_pct = 3 and a.rented_tax_source = 'auto' and a.rented_tax_vehicle like 'RT-V1%', 'T2 A meta: ' || a.rented_tax_source;
  assert a.rented_tax_amount = round(a.gross_amount * 0.03, 2) and a.rented_tax_amount < round(1650000 * 0.03, 2), 'T2 A amount: ' || a.rented_tax_amount || ' gross ' || a.gross_amount;
  assert a.deductions_total = a.rented_tax_amount + coalesce(a.auto_deduction_amount, 0) and a.proposed_net = round(a.gross_amount - a.deductions_total, 2), 'T2 A net: ' || a.deductions_total || '/' || a.proposed_net;
  -- B كامل: الإجمالي = 1,200,000 ⇒ الضريبة 36,000 بجانب الاستقطاع الثابت 50,000 دون أن يؤثر أحدهما في الآخر
  assert b.gross_amount = 1200000 and b.rented_tax_amount = 36000 and b.fixed_deductions_total = 50000 and b.deductions_total = 86000 and b.proposed_net = 1114000 and b.final_net = 1114000, 'T2 B: ' || row_to_json(b)::text;
  -- C مملوكة: لا ضريبة
  assert c.rented_tax_amount = 0 and c.rented_tax_pct = 0 and c.rented_tax_source is null and c.proposed_net = 1000000, 'T2 C: ' || c.rented_tax_amount;
  raise notice 'T2 ✅ التصدير: الوعاء والعزل (A % من % · B 36,000)', a.rented_tax_amount, a.gross_amount;
end $$;
select auth.set_test_user('c7000000-0000-0000-0000-000000000007');
do $$ declare n_bad int; begin
  -- الكشف محجوب عن المالية قبل اعتماد المعاون؛ المطابقة متاحة
  select count(*) into n_bad from public.finance_payroll_reconcile(current_setting('test.rt_m')::date) rc where rc.employee_number like 'RT-%' and not rc.money_ok;
  assert n_bad = 0, 'T2 reconcile money_ok: ' || n_bad;
  assert (select (components ->> 'rented_tax')::numeric from public.finance_payroll_reconcile(current_setting('test.rt_m')::date) where employee_number = 'RT-B') = 36000, 'T2 reconcile component';
  raise notice 'T2b ✅ المطابقة تعرف الضريبة';
end $$;

-- ═══ T3 · مراجعة المعاون للاستقطاعات لا تشمل الضريبة (ليست من الأنواع الأربعة) والصافي بعد المراجعة يبقى ناقصها ═══
select auth.set_test_user('c7000000-0000-0000-0000-000000000003');
do $$ declare r record; begin
  select * into r from public.deputy_deduction_review(current_setting('test.rt_m')::date) v where v.employee_number = 'RT-B';
  assert r.reviewable_total = 0 and r.deductions_total = 86000 and (r.breakdown ->> 'final_net_after')::numeric = 1114000, 'T3 review: ' || r.reviewable_total || '/' || r.deductions_total || '/' || (r.breakdown ->> 'final_net_after');
  perform public.deputy_payroll_approve(current_setting('test.rt_x1')::uuid);
  raise notice 'T3 ✅ الضريبة خارج مراجعة الاستقطاعات';
end $$;
select auth.set_test_user('c7000000-0000-0000-0000-000000000007');
do $$ declare r record; begin
  select * into r from public.finance_payroll_sheet(current_setting('test.rt_m')::date) s where s.employee_number = 'RT-B';
  assert r.rented_tax_amount = 36000 and r.rented_tax_pct = 3 and r.rented_tax_source = 'auto' and r.rented_tax_vehicle like 'RT-V2%' and r.final_net = 1114000, 'T3 sheet: ' || row_to_json(r)::text;
  raise notice 'T3b ✅ كشف المالية يعرض السطر';
end $$;

-- ═══ T4 · الصلاحيات: غرفة العمليات/المالية/HR لا تعدّل؛ المعاون يعدّل النسبة العامة ويعفي ويحدد نسبة خاصة (بسبب) ═══
select auth.set_test_user('c7000000-0000-0000-0000-000000000001');
do $$ declare ok boolean := false; begin
  begin perform public.deputy_rented_tax_set_pct(5, 'x'); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end; assert ok, 'T4 ops forbidden';
  ok := false; begin perform public.deputy_rented_tax_overview(); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end; assert ok, 'T4 ops overview forbidden';
end $$;
select auth.set_test_user('c7000000-0000-0000-0000-000000000007');
do $$ declare ok boolean := false; begin
  begin perform public.deputy_rented_tax_override_set('c7000000-0000-0000-0000-0000000000e1', 'exempt', null, 'سبب'); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end; assert ok, 'T4 finance forbidden';
end $$;
select auth.set_test_user('c7000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; ok boolean; begin
  j := public.deputy_rented_tax_overview();
  assert (j ->> 'pct')::numeric = 3 and (j ->> 'rented_vehicles')::int >= 2, 'T4 overview: ' || (j ->> 'pct');
  assert (select count(*) from jsonb_array_elements(j -> 'employees') e where e ->> 'employee_number' in ('RT-A', 'RT-B')) = 2
     and not exists (select 1 from jsonb_array_elements(j -> 'employees') e where e ->> 'employee_number' = 'RT-C'), 'T4 overview employees';
  assert (select (e ->> 'last_tax')::numeric from jsonb_array_elements(j -> 'employees') e where e ->> 'employee_number' = 'RT-B') = 36000, 'T4 overview last_tax';
  ok := false; begin perform public.deputy_rented_tax_set_pct(5, ''); exception when others then ok := sqlerrm = 'RENTED_TAX_REASON_REQUIRED'; end; assert ok, 'T4 reason required';
  ok := false; begin perform public.deputy_rented_tax_set_pct(101, 'قرار'); exception when others then ok := sqlerrm = 'RENTED_TAX_PCT_INVALID'; end; assert ok, 'T4 pct invalid';
  ok := false; begin perform public.deputy_rented_tax_override_set('c7000000-0000-0000-0000-0000000000e1', 'custom', null, 'قرار'); exception when others then ok := sqlerrm = 'RENTED_TAX_PCT_INVALID'; end; assert ok, 'T4 custom needs pct';
  perform public.deputy_rented_tax_set_pct(5, 'قرار الإدارة: رفع النسبة إلى 5٪');
  perform public.deputy_rented_tax_override_set('c7000000-0000-0000-0000-0000000000e1', 'custom', 2, 'اتفاق خاص مع السائق', null);
  perform public.deputy_rented_tax_override_set('c7000000-0000-0000-0000-0000000000e2', 'exempt', null, 'الآلية انتقلت لملكية الشركة قيد التوثيق', (current_date + 30)::date);
  j := app.rented_tax_rate_for('c7000000-0000-0000-0000-0000000000e1'); assert (j ->> 'pct')::numeric = 2 and j ->> 'source' = 'custom', 'T4 A custom: ' || j::text;
  j := app.rented_tax_rate_for('c7000000-0000-0000-0000-0000000000e2'); assert (j ->> 'pct')::numeric = 0 and j ->> 'source' = 'exempt', 'T4 B exempt: ' || j::text;
  -- انتهاء مدة الإعفاء ⇒ يعود للنسبة العامة
  j := app.rented_tax_rate_for('c7000000-0000-0000-0000-0000000000e2', (current_date + 31)::date); assert (j ->> 'pct')::numeric = 5 and j ->> 'source' = 'auto', 'T4 B after expiry: ' || j::text;
  j := public.deputy_rented_tax_audit(50);
  assert jsonb_array_length(j) >= 3 and (j -> 0 ->> 'action') = 'exempt' and (j -> 2 ->> 'action') = 'pct' and (j -> 2 -> 'after' ->> 'pct')::numeric = 5, 'T4 audit: ' || j::text;
  -- معاينة الشهر المُصدَّر بالنِّسَب الحالية
  j := public.deputy_rented_tax_preview(current_setting('test.rt_m')::date);
  assert (select (e ->> 'current_tax')::numeric from jsonb_array_elements(j) e where e ->> 'employee_number' = 'RT-B') = 0
     and (select (e ->> 'stored_tax')::numeric from jsonb_array_elements(j) e where e ->> 'employee_number' = 'RT-B') = 36000, 'T4 preview: ' || j::text;
  raise notice 'T4 ✅ صلاحيات المعاون والإعفاء والنسبة الخاصة والتدقيق';
end $$;

-- ═══ T5 · إعادة التصدير تطبّق النِّسَب الجديدة؛ الكشف المعتمد السابق لم يتغيّر؛ إلغاء الاستثناء ═══
-- الشهر السابق اعتُمد من المعاون فقط (ليس المالية) فيُعاد تصديره
select auth.set_test_user('c7000000-0000-0000-0000-000000000001');
do $$ declare x uuid; begin x := public.ops_month_export(current_setting('test.rt_m')::date); perform set_config('test.rt_x2', x::text, false); end $$;
reset role; select set_config('auth.user_id','', false);
do $$ declare a public.hr_month_export_rows; b public.hr_month_export_rows; old_b public.hr_month_export_rows; begin
  select * into a from public.hr_month_export_rows where export_id = current_setting('test.rt_x2')::uuid and employee_id = 'c7000000-0000-0000-0000-0000000000e1';
  select * into b from public.hr_month_export_rows where export_id = current_setting('test.rt_x2')::uuid and employee_id = 'c7000000-0000-0000-0000-0000000000e2';
  select * into old_b from public.hr_month_export_rows where export_id = current_setting('test.rt_x1')::uuid and employee_id = 'c7000000-0000-0000-0000-0000000000e2';
  assert a.rented_tax_pct = 2 and a.rented_tax_source = 'custom' and a.rented_tax_amount = round(a.gross_amount * 0.02, 2), 'T5 A: ' || a.rented_tax_amount;
  assert b.rented_tax_pct = 0 and b.rented_tax_source = 'exempt' and b.rented_tax_amount = 0 and b.deductions_total = 50000 and b.proposed_net = 1150000, 'T5 B: ' || row_to_json(b)::text;
  assert old_b.rented_tax_amount = 36000, 'T5 old export untouched';
  raise notice 'T5 ✅ إعادة التصدير بالنِّسَب الجديدة';
end $$;
select auth.set_test_user('c7000000-0000-0000-0000-000000000003');
do $$ declare ok boolean := false; j jsonb; begin
  begin perform public.deputy_rented_tax_override_clear('c7000000-0000-0000-0000-0000000000e2', ''); exception when others then ok := sqlerrm = 'RENTED_TAX_REASON_REQUIRED'; end; assert ok, 'T5 clear reason';
  perform public.deputy_rented_tax_override_clear('c7000000-0000-0000-0000-0000000000e2', 'اكتمل التوثيق — تعود للنسبة العامة');
  j := app.rented_tax_rate_for('c7000000-0000-0000-0000-0000000000e2'); assert (j ->> 'pct')::numeric = 5 and j ->> 'source' = 'auto', 'T5 B cleared: ' || j::text;
  ok := false; begin perform public.deputy_rented_tax_override_clear('c7000000-0000-0000-0000-0000000000e2', 'مرة ثانية'); exception when others then ok := sqlerrm = 'HR_NOT_FOUND'; end; assert ok, 'T5 clear twice';
  raise notice 'T5b ✅ إلغاء الاستثناء';
end $$;
reset role; select set_config('auth.user_id','', false);
