-- 00188 · (أ) تحكم الاستقطاع التلقائي · (ب) تقرير الكشوفات · (ج) أجور عمال المتعهدين (بادئة ad)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-00000000000b', 'ad-ops@t.iq'), ('ad000000-0000-0000-0000-00000000000c', 'ad-fin@t.iq'), ('ad000000-0000-0000-0000-00000000000d', 'ad-it@t.iq'),
  ('ad000000-0000-0000-0000-00000000000e', 'ad-adm@t.iq'), ('ad000000-0000-0000-0000-00000000000f', 'ad-dep@t.iq'), ('ad000000-0000-0000-0000-000000000011', 'ad-cont@t.iq'), ('ad000000-0000-0000-0000-000000000012', 'ad-mgr@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ad000000-0000-0000-0000-00000000000b', 'ops_room'), ('ad000000-0000-0000-0000-00000000000c', 'finance_officer'), ('ad000000-0000-0000-0000-00000000000d', 'it_admin'),
  ('ad000000-0000-0000-0000-00000000000e', 'super_admin'), ('ad000000-0000-0000-0000-00000000000f', 'deputy_director'), ('ad000000-0000-0000-0000-000000000011', 'employee'), ('ad000000-0000-0000-0000-000000000012', 'department_manager')
on conflict do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('ad000000-0000-0000-0000-0000000000d1', 'ad صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values
  ('ad000000-0000-0000-0000-0000000000e1', 'AD-1', 'باقر جزيرة', '2024-01-01', '7701') on conflict (employee_number) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('ad000000-0000-0000-0000-0000000000e1', 'ad000000-0000-0000-0000-0000000000d1', '2024-01-01') on conflict do nothing;
create or replace function pg_temp.ad_punch(p_day date, p_time time) returns void language sql as $$
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method)
  values ('AD', '7701', 'ad000000-0000-0000-0000-0000000000e1', (p_day + p_time)::timestamp - interval '3 hours', 'manual')
$$;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000c');
select public.finance_salary_set('ad000000-0000-0000-0000-0000000000e1', 'monthly', 300000, 0, '{}', '{}', null);
reset role; select set_config('auth.user_id','', false);
-- الشهر الماضي: حضور يومين كاملين فقط، الباقي غياب
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; begin
  perform pg_temp.ad_punch(m + 1, '08:00'); perform pg_temp.ad_punch(m + 1, '16:00');
  perform pg_temp.ad_punch(m + 2, '08:00'); perform pg_temp.ad_punch(m + 2, '16:00');
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000d');
select public.hr_policy_set('{"auto_deduction_enabled":true,"deduct_absence_enabled":true,"deduct_shortfall_enabled":true,"deduct_unpaid_leave_enabled":true,"auto_deduction_amount_mode":"salary","fixed_absent_day_amount":0,"fixed_shortfall_minute_amount":0,"max_auto_deduction_days_per_month":0,"auto_deduction_cap_ratio":1,"prorate_partial_month":true,"salary_day_basis":"fixed_30","absent_day_deduction_days":1}'::jsonb);

-- ═══ A1 · الوضع الافتراضي (من الراتب): غياب (dim−2) يوم × 10,000 ═══
select auth.set_test_user('ad000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'AD-1';
  assert r.days_absent = dim - 2 and r.auto_deduction_days = dim - 2 and r.auto_deduction_basis = 'salary' and not r.auto_deduction_days_capped, 'A1: ' || row_to_json(r)::text;
  assert r.auto_deduction_amount = round(10000::numeric * (dim - 2), 2), 'A1 amount ' || r.auto_deduction_amount;
  raise notice 'A1 ✅ من الراتب: % يوم = %', r.auto_deduction_days, r.auto_deduction_amount;
end $$;

-- ═══ A2 · مبالغ ثابتة: 5,000 لكل يوم استقطاع · A3 · سقف 10 أيام شهرياً ═══
select auth.set_test_user('ad000000-0000-0000-0000-00000000000d');
select public.hr_policy_set('{"auto_deduction_amount_mode":"fixed","fixed_absent_day_amount":5000}'::jsonb);
select auth.set_test_user('ad000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'AD-1';
  assert r.auto_deduction_basis = 'fixed' and r.auto_deduction_amount = 5000 * (dim - 2) and r.proposed_net = 300000 - 5000 * (dim - 2), 'A2: ' || row_to_json(r)::text;
  raise notice 'A2 ✅ ثابت: % × 5,000 = %', r.auto_deduction_days, r.auto_deduction_amount;
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000d');
select public.hr_policy_set('{"max_auto_deduction_days_per_month":10}'::jsonb);
select auth.set_test_user('ad000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'AD-1';
  assert r.auto_deduction_days = dim - 2 and r.auto_deduction_days_capped and r.auto_absence_days = dim - 2 and r.auto_deduction_amount = 50000, 'A3: ' || row_to_json(r)::text;
  raise notice 'A3 ✅ سقف الأيام: % يوم غياب ⇒ 10 أيام فقط = %', r.auto_absence_days, r.auto_deduction_amount;
end $$;

-- ═══ A4 · إيقاف استقطاع الغياب فقط ⇒ الغياب يبقى ظاهراً لكن بلا استقطاع · A5 · إيقاف الكل ⇒ basis = disabled والأيام 0 ═══
select auth.set_test_user('ad000000-0000-0000-0000-00000000000d');
select public.hr_policy_set('{"deduct_absence_enabled":false,"max_auto_deduction_days_per_month":0,"auto_deduction_amount_mode":"salary"}'::jsonb);
select auth.set_test_user('ad000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'AD-1';
  assert r.days_absent = dim - 2 and r.auto_deduction_days = 0 and r.auto_deduction_amount = 0 and r.proposed_net = 300000, 'A4: ' || row_to_json(r)::text;
  assert not exists (select 1 from public.hr_attendance_days a where a.employee_id = 'ad000000-0000-0000-0000-0000000000e1' and a.work_date >= m and a.work_date < m + interval '1 month' and a.proposed_deduction_days > 0), 'A4 days reset';
  raise notice 'A4 ✅ إيقاف استقطاع الغياب: غياب % يوم، استقطاع 0', r.days_absent;
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000d');
select public.hr_policy_set('{"deduct_absence_enabled":true,"auto_deduction_enabled":false}'::jsonb);
select auth.set_test_user('ad000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'AD-1';
  assert r.auto_deduction_basis = 'disabled' and r.auto_deduction_days = 0 and r.auto_deduction_amount = 0, 'A5: ' || row_to_json(r)::text;
  assert exists (select 1 from public.hr_attendance_audit where action = 'export' and after ->> 'auto_deduction' = 'disabled' and employee_id = 'ad000000-0000-0000-0000-0000000000e1'), 'A5 audit';
  raise notice 'A5 ✅ إيقاف الاستقطاع التلقائي كلياً';
end $$;
-- إعادة التشغيل تعيد الأرقام؛ القيم غير الصالحة مرفوضة
select auth.set_test_user('ad000000-0000-0000-0000-00000000000d');
do $$ begin
  begin perform public.hr_policy_set('{"auto_deduction_amount_mode":"x"}'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_POLICY_INVALID', sqlerrm; end;
  begin perform public.hr_policy_set('{"fixed_absent_day_amount":-1}'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_POLICY_INVALID', sqlerrm; end;
  begin perform public.hr_policy_set('{"max_auto_deduction_days_per_month":40}'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_POLICY_INVALID', sqlerrm; end;
end $$;
select public.hr_policy_set('{"auto_deduction_enabled":true}'::jsonb);
select auth.set_test_user('ad000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'AD-1';
  assert r.auto_deduction_basis = 'salary' and r.auto_deduction_days = dim - 2, 'A6: ' || row_to_json(r)::text;
  raise notice 'A6 ✅ إعادة التشغيل تعيد الاستقطاع';
end $$;

-- ═══ B · تقرير الكشوفات بمدى تاريخ ═══
reset role; select set_config('auth.user_id','', false);
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, shift, driver_name, sector_id, created_by) values
  ('ad000000-0000-0000-0000-0000000000a1', 'قلاب ad', 'AD-77', '77-ad', 'CH-AD77', 'v/ad77.jpg', 'morning', 'سائق ad', 1, 'ad000000-0000-0000-0000-00000000000e') on conflict (id) do nothing;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; j jsonb; k jsonb; begin
  j := public.disclosure_save(null::uuid, jsonb_build_object('target_kind', 'employee', 'employee_id', 'ad000000-0000-0000-0000-0000000000e1', 'violation_type', 'absence', 'penalty_type', 'warning',
        'details', 'غياب متكرر بلا عذر مقبول', 'log_date', (m + 2)::text, 'amount', 15000, 'sector', 'ad-قاطع 1'));
  perform set_config('test.ad1', j ->> 'id', false);
  perform public.disclosure_submit(current_setting('test.ad1')::uuid);
  k := public.disclosure_save(null::uuid, jsonb_build_object('target_kind', 'vehicle', 'vehicle_id', 'ad000000-0000-0000-0000-0000000000a1', 'violation_type', 'delay', 'penalty_type', 'reprimand',
        'details', 'تأخر عن موعد الانطلاق المقرر', 'log_date', (m + 3)::text, 'sector', 'ad-قاطع 2'));
  perform public.disclosure_submit((k ->> 'id')::uuid);
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000e');
do $$ declare j jsonb; begin
  j := public.disclosure_decide(current_setting('test.ad1')::uuid, true, null::text, null::numeric);
  if j ->> 'status' = 'pending' then j := public.disclosure_decide(current_setting('test.ad1')::uuid, true, null::text, null::numeric); end if;
  assert j ->> 'status' = 'approved', 'B0: ' || j::text;
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000f');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; r jsonb; e jsonb; begin
  r := public.disclosure_report(m, (m + interval '1 month - 1 day')::date, null, 'ad-قاطع 1');
  assert (r -> 'totals' ->> 'count')::int = 1 and (r -> 'totals' ->> 'approved')::int = 1 and (r -> 'totals' ->> 'amount_approved')::numeric = 15000, 'B1 totals: ' || (r -> 'totals')::text;
  assert (r -> 'by_type' -> 0 ->> 'key') = 'absence' and (r -> 'by_type' -> 0 ->> 'amount')::numeric = 15000, 'B1 by_type: ' || (r -> 'by_type')::text;
  assert (r -> 'top_employees' -> 0 ->> 'employee_number') = 'AD-1' and (r -> 'top_employees' -> 0 ->> 'count')::int = 1, 'B1 top emp: ' || (r -> 'top_employees')::text;
  assert (r -> 'deductions' ->> 'posted')::int = 1 and (r -> 'deductions' ->> 'amount_posted')::numeric = 15000, 'B1 deductions: ' || (r -> 'deductions')::text;
  assert jsonb_array_length(r -> 'rows') = 1 and (r -> 'rows' -> 0 ->> 'deduction_state') is not null, 'B1 rows: ' || (r -> 'rows')::text;
  r := public.disclosure_report(m, (m + interval '1 month - 1 day')::date, 'delay', null);
  assert (r -> 'totals' ->> 'count')::int >= 1 and (r -> 'totals' ->> 'pending')::int >= 1 and exists (select 1 from jsonb_array_elements(r -> 'top_vehicles') v where v ->> 'db_number' = 'AD-77'), 'B2 vehicles: ' || (r -> 'top_vehicles')::text;
  assert (r -> 'by_month' -> 0 ->> 'month') = to_char(m, 'YYYY-MM'), 'B2 by_month';
  begin perform public.disclosure_report(m, m - 1, null, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'DISCLOSURE_RANGE_INVALID', sqlerrm; end;
  raise notice 'B ✅ التقرير: أنواع/قواطع/مكرِّرون/سلسلة الاستقطاع + فلاتر';
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000c');
do $$ begin
  begin perform public.disclosure_report(current_date - 30, current_date, null, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'DISCLOSURE_FORBIDDEN', sqlerrm; end;
  raise notice 'B3 ✅ المالية لا ترى تقرير الكشوفات';
end $$;

-- ═══ C · أجور عمال المتعهدين (المالية) ═══
reset role; select set_config('auth.user_id','', false);
insert into public.manager_profiles (user_id, shift, sectors) values ('ad000000-0000-0000-0000-000000000012', 'morning', '{3}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values ('ad000000-0000-0000-0000-0000000000e2', 'ad000000-0000-0000-0000-000000000011', 'AD-C', 'متعهد ad', '2024-01-01') on conflict (employee_number) do nothing;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000d');
select public.contractor_assign('ad000000-0000-0000-0000-000000000011', 'ad000000-0000-0000-0000-000000000012', 3::smallint, 'ad');
select auth.set_test_user('ad000000-0000-0000-0000-000000000011');
do $$ declare w1 public.contractor_workers; w2 public.contractor_workers; d date := app.baghdad_today(); m date := date_trunc('month', app.baghdad_today())::date; begin
  w1 := public.contractor_add_worker('عامل ad واحد', '0781'); w2 := public.contractor_add_worker('عامل ad اثنان', null);
  perform set_config('test.adw1', w1.id::text, false); perform set_config('test.adw2', w2.id::text, false);
  -- حضور مباشر (تجاوز بوابة الموقع/الصور لأن الاختبار لقواعد الأجور): 4 أيام حاضر + يوم غائب للعامل 1، يومان للعامل 2
  reset role;
  insert into public.contractor_worker_attendance (worker_id, contractor_user_id, sector_id, log_date, status, marked_by)
  select w1.id, 'ad000000-0000-0000-0000-000000000011', 3, g::date, case when g::date = m then 'absent' else 'present' end, 'ad000000-0000-0000-0000-000000000011'
  from generate_series(m, least(m + 4, d), interval '1 day') g on conflict do nothing;
  insert into public.contractor_worker_attendance (worker_id, contractor_user_id, sector_id, log_date, status, marked_by)
  select w2.id, 'ad000000-0000-0000-0000-000000000011', 3, g::date, 'present', 'ad000000-0000-0000-0000-000000000011'
  from generate_series(m, least(m + 1, d), interval '1 day') g on conflict do nothing;
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-00000000000c');
do $$ declare m date := date_trunc('month', app.baghdad_today())::date; r record; n int; j jsonb; p1 int; begin
  select count(*) into p1 from public.contractor_worker_attendance where worker_id = current_setting('test.adw1')::uuid and status = 'present';
  select * into r from public.finance_contractor_wages_sheet(m) where worker_id = current_setting('test.adw1')::uuid;
  assert r.contractor_name is not null and r.present_days = p1 and r.payable is null and r.wage_mode = 'monthly', 'C1 sheet: ' || row_to_json(r)::text;
  -- يومي: 25,000 × أيام الحضور
  j := public.finance_contractor_wage_set(current_setting('test.adw1')::uuid, m, 'daily', 25000, 'أجر يومي متفق عليه');
  select * into r from public.finance_contractor_wages_sheet(m) where worker_id = current_setting('test.adw1')::uuid;
  assert r.wage_mode = 'daily' and r.daily_wage = 25000 and r.payable = 25000 * p1 and r.set_by_name is not null, 'C2 daily: ' || row_to_json(r)::text;
  -- شهري: مبلغ ثابت مهما كان الحضور
  perform public.finance_contractor_wage_set(current_setting('test.adw2')::uuid, m, 'monthly', 600000, null);
  select * into r from public.finance_contractor_wages_sheet(m) where worker_id = current_setting('test.adw2')::uuid;
  assert r.wage_mode = 'monthly' and r.payable = 600000, 'C3 monthly: ' || row_to_json(r)::text;
  assert (select count(*) from public.contractor_audit_log where action = 'wage_set' and worker_id = current_setting('test.adw1')::uuid) = 1, 'C3 audit';
  -- التعديل يحفظ «قبل/بعد»
  perform public.finance_contractor_wage_set(current_setting('test.adw1')::uuid, m, 'daily', 30000, 'زيادة');
  assert exists (select 1 from public.contractor_audit_log where action = 'wage_set' and worker_id = current_setting('test.adw1')::uuid and (before_data ->> 'daily_wage')::numeric = 25000 and (after_data ->> 'daily_wage')::numeric = 30000), 'C4 audit before/after';
  -- قيم غير صالحة وشهر مستقبلي
  begin perform public.finance_contractor_wage_set(current_setting('test.adw1')::uuid, m, 'weekly', 1, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'CONTRACTOR_WAGE_MODE_INVALID', sqlerrm; end;
  begin perform public.finance_contractor_wage_set(current_setting('test.adw1')::uuid, m, 'daily', -5, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'CONTRACTOR_WAGE_INVALID', sqlerrm; end;
  begin perform public.finance_contractor_wage_set(current_setting('test.adw1')::uuid, (m + interval '1 month')::date, 'daily', 5, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'CONTRACTOR_WAGE_FUTURE_MONTH', sqlerrm; end;
  -- نسخ إلى الشهر التالي غير ممكن (مستقبل)؛ نسخ من شهر سابق لا أجور فيه = 0
  n := public.finance_contractor_wages_copy_previous(m);
  assert n = 0, 'C5 copy none ' || n;
  raise notice 'C ✅ أجور المتعهدين: يومي % × % = % · شهري 600,000 · تدقيق قبل/بعد', 25000, p1, 25000 * p1;
end $$;
-- غير المالية ممنوع
select auth.set_test_user('ad000000-0000-0000-0000-00000000000b');
do $$ declare m date := date_trunc('month', app.baghdad_today())::date; begin
  begin perform public.finance_contractor_wage_set(current_setting('test.adw1')::uuid, m, 'daily', 1, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'FINANCE_FORBIDDEN', sqlerrm; end;
  begin perform count(*) from public.finance_contractor_wages_sheet(m); raise exception 'should fail'; exception when others then assert sqlerrm = 'FINANCE_FORBIDDEN', sqlerrm; end;
  raise notice 'C6 ✅ الأجور للمالية فقط';
end $$;
