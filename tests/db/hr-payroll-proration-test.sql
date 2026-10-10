-- 00187 · الراتب الشهري بالنسبة والتناسب + ضوابط السياسة + حدود مبلغ المخالفة (بادئة pr)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00201: هذا الاختبار يتحقق من النموذج القديم (الراتب كاملاً ناقص الغياب)؛ النموذج الافتراضي الجديد «الأيام المستحقة» يُختبر في payroll-earned-days-test
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
-- 00193: هذا الاختبار يختبر التصدير مباشرة؛ بوابة «اعتماد الحضورية قبل التصدير» تُختبر في ops-attendance-two-stage-test
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values ('fe000000-0000-0000-0000-00000000000b', 'pr-ops@t.iq'), ('fe000000-0000-0000-0000-00000000000c', 'pr-fin@t.iq'), ('fe000000-0000-0000-0000-00000000000d', 'pr-it@t.iq'), ('fe000000-0000-0000-0000-00000000000e', 'pr-adm@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('fe000000-0000-0000-0000-00000000000b', 'ops_room'), ('fe000000-0000-0000-0000-00000000000c', 'finance_officer'), ('fe000000-0000-0000-0000-00000000000d', 'it_admin'), ('fe000000-0000-0000-0000-00000000000e', 'super_admin') on conflict do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('fe000000-0000-0000-0000-0000000000d1', 'pr صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
-- موظف عُيّن قبل نهاية الشهر الماضي بـ5 أيام (الفترة المشمولة = 5 أيام تقويمية بالضبط، كما في شاشة المستخدم) براتب 500,000
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values
    ('fe000000-0000-0000-0000-0000000000e1', 'PR-1', 'مرتضى جزيرة', m + (dim - 5), '7601') on conflict (employee_number) do nothing;
  insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
    ('fe000000-0000-0000-0000-0000000000e1', 'fe000000-0000-0000-0000-0000000000d1', m + (dim - 5)) on conflict do nothing;
end $$;
create or replace function pg_temp.pr_punch(p_day date, p_time time) returns void language sql as $$
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method)
  values ('PR', '7601', 'fe000000-0000-0000-0000-0000000000e1', (p_day + p_time)::timestamp - interval '3 hours', 'manual')
$$;
select auth.set_test_user('fe000000-0000-0000-0000-00000000000c');
select public.finance_salary_set('fe000000-0000-0000-0000-0000000000e1', 'monthly', 500000, 0, '{"transport": 30000}', '{}', null);
-- حضر يومين كاملين من الخمسة، والثلاثة الباقية غياب
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; dim int; d0 date; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int; d0 := m + (dim - 5);
  perform pg_temp.pr_punch(d0, '08:00'); perform pg_temp.pr_punch(d0, '16:00');
  perform pg_temp.pr_punch(d0 + 1, '08:00'); perform pg_temp.pr_punch(d0 + 1, '16:00');
end $$;
-- السياسة الافتراضية (الأساسي ÷ 30، تناسب مفعّل، بدلات متناسبة، بلا سقف)
select auth.set_test_user('fe000000-0000-0000-0000-00000000000d');
select public.hr_policy_set('{"salary_day_basis":"fixed_30","prorate_partial_month":true,"prorate_allowances":true,"auto_deduction_cap_ratio":1}'::jsonb);

-- ═══ S1 · الفترة المشمولة 5 أيام → الإجمالي = 500,000 ÷ 30 × 5 = 83,333.33 (+ بدل متناسب) · الغياب 3 أيام = 50,000 · الصافي 38,333.33 ═══
select auth.set_test_user('fe000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-1';
  assert r.covered_days = 5 and r.days_in_month = dim and r.period_from = m + (dim - 5) and r.period_to = m + (dim - 1), 'S1 period: ' || row_to_json(r)::text;
  assert r.scheduled_days = 5 and r.days_present = 2 and r.days_absent = 3 and r.unevaluated_days = 0, 'S1 counts: ' || row_to_json(r)::text;
  assert r.day_rate = round(500000::numeric / 30, 4), 'S1 day_rate ' || r.day_rate;
  assert r.gross_amount = 83333.33 + round(30000 * r.proration_ratio, 2), 'S1 gross ' || r.gross_amount || ' ratio ' || r.proration_ratio;
  assert r.proration_ratio = round(83333.33 / 500000, 6), 'S1 ratio ' || r.proration_ratio;
  assert r.auto_deduction_days = 3 and r.auto_deduction_amount = 50000.00 and r.auto_deduction_capped = false, 'S1 auto: ' || row_to_json(r)::text;
  assert r.proposed_net = r.gross_amount - 50000 and r.proposed_net < 40000, 'S1 net ' || r.proposed_net;
  raise notice 'S1 ✅ 5 أيام مشمولة: إجمالي % · استقطاع % · صافٍ %', r.gross_amount, r.auto_deduction_amount, r.proposed_net;
end $$;

-- ═══ S2 · أساس «أيام الشهر الفعلية»: أجر اليوم = 500,000 ÷ أيام الشهر ═══
select auth.set_test_user('fe000000-0000-0000-0000-00000000000d');
select public.hr_policy_set('{"salary_day_basis":"calendar_days"}'::jsonb);
select auth.set_test_user('fe000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; dim int; dr numeric; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int; dr := round(500000::numeric / dim, 4);
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-1';
  assert r.day_rate = dr and r.gross_amount = round(dr * 5, 2) + round(30000 * r.proration_ratio, 2) and r.auto_deduction_amount = round(dr * 3, 2), 'S2: ' || row_to_json(r)::text;
  raise notice 'S2 ✅ أساس أيام الشهر: أجر اليوم % · إجمالي %', r.day_rate, r.gross_amount;
end $$;

-- ═══ S3 · إيقاف التناسب يعيد السلوك القديم (الأساسي كاملاً) · سقف الاستقطاع التلقائي 5% يقيّد المبلغ ويعلّم الصف ═══
select auth.set_test_user('fe000000-0000-0000-0000-00000000000d');
select public.hr_policy_set('{"salary_day_basis":"fixed_30","prorate_partial_month":false,"auto_deduction_cap_ratio":0.05}'::jsonb);
select auth.set_test_user('fe000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-1';
  assert r.gross_amount = 530000 and r.proration_ratio = 1, 'S3 gross ' || r.gross_amount;
  assert r.auto_deduction_capped and r.auto_deduction_amount = round(0.05 * 530000, 2) and r.proposed_net = 530000 - round(0.05 * 530000, 2), 'S3 cap: ' || row_to_json(r)::text;
  raise notice 'S3 ✅ بلا تناسب: إجمالي % · الاستقطاع مقيّد بالسقف %', r.gross_amount, r.auto_deduction_amount;
end $$;
-- قيم غير صالحة مرفوضة
select auth.set_test_user('fe000000-0000-0000-0000-00000000000d');
do $$ begin
  begin perform public.hr_policy_set('{"salary_day_basis":"weird"}'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_POLICY_INVALID', sqlerrm; end;
  begin perform public.hr_policy_set('{"auto_deduction_cap_ratio":1.5}'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_POLICY_INVALID', sqlerrm; end;
  begin perform public.hr_policy_set('{"absent_day_deduction_days":5}'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_POLICY_INVALID', sqlerrm; end;
  raise notice 'S3b ✅ القيم غير الصالحة مرفوضة';
end $$;
select public.hr_policy_set('{"prorate_partial_month":true,"auto_deduction_cap_ratio":1}'::jsonb);

-- ═══ S4 · الشهر المكتمل = الراتب كاملاً (لا تناسب) حتى لو كان الشهر 28 أو 31 يوماً ═══
reset role; select set_config('auth.user_id','', false);
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values
  ('fe000000-0000-0000-0000-0000000000e2', 'PR-2', 'سجاد جزيرة', '2024-01-01', '7602') on conflict (employee_number) do nothing;
select auth.set_test_user('fe000000-0000-0000-0000-00000000000c');
select public.finance_salary_set('fe000000-0000-0000-0000-0000000000e2', 'monthly', 500000, 0, '{}', '{}', null);
select auth.set_test_user('fe000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; p record; begin
  select * into p from app.hr_month_period(m) where employee_id = 'fe000000-0000-0000-0000-0000000000e2';
  assert p.full_month and p.covered_days = p.days_in_month, 'S4 period: ' || row_to_json(p)::text;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-2';
  assert r.gross_amount = 500000 and r.proration_ratio = 1 and r.covered_days = r.days_in_month, 'S4: ' || row_to_json(r)::text;
  raise notice 'S4 ✅ الشهر المكتمل = الأساسي كاملاً';
end $$;
-- المالية ترى الأعمدة الجديدة
select auth.set_test_user('fe000000-0000-0000-0000-00000000000c');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; r record; begin
  select * into r from public.finance_payroll_sheet(m) where employee_number = 'PR-1';
  assert r.covered_days = 5 and r.day_rate is not null and r.proration_ratio < 1, 'S4b finance cols: ' || row_to_json(r)::text;
  raise notice 'S4b ✅ المالية ترى الفترة المشمولة وأجر اليوم';
end $$;

-- ═══ S5 · حدود مبلغ المخالفة لكل نوع من بوابة التطوير: أي مبلغ خارج الحد يُرفض ═══
select auth.set_test_user('fe000000-0000-0000-0000-00000000000d');
do $$ declare j jsonb; begin
  j := public.disclosure_type_save('pr_speeding', 'pr سرعة زائدة', null, array['warning','reprimand'], 25000, true, 50, 10000, 100000);
  assert exists (select 1 from jsonb_array_elements(j) t where t ->> 'key' = 'pr_speeding' and (t ->> 'min_amount')::numeric = 10000 and (t ->> 'max_amount')::numeric = 100000), 'S5 type saved: ' || j::text;
  begin perform public.disclosure_type_save('pr_speeding', 'pr سرعة زائدة', null, null, 25000, true, 50, 50000, 10000); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_AMOUNT_RANGE_INVALID', sqlerrm; end;
  begin perform public.disclosure_type_save('pr_speeding', 'pr سرعة زائدة', null, null, 500000, true, 50, 10000, 100000); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_AMOUNT_RANGE_INVALID', sqlerrm; end;
  raise notice 'S5 ✅ نوع الكشف بحدود 10,000–100,000';
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; j jsonb; begin
  begin
    perform public.disclosure_save(null::uuid, jsonb_build_object('target_kind', 'employee', 'employee_id', 'fe000000-0000-0000-0000-0000000000e2', 'violation_type', 'pr_speeding', 'penalty_type', 'warning',
      'details', 'تجاوز السرعة داخل الحي السكني', 'log_date', (m + 3)::text, 'amount', 200000));
    raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_AMOUNT_OUT_OF_RANGE', sqlerrm; end;
  j := public.disclosure_save(null::uuid, jsonb_build_object('target_kind', 'employee', 'employee_id', 'fe000000-0000-0000-0000-0000000000e2', 'violation_type', 'pr_speeding', 'penalty_type', 'warning',
      'details', 'تجاوز السرعة داخل الحي السكني', 'log_date', (m + 3)::text, 'amount', 50000));
  perform set_config('test.pr1', j ->> 'id', false);
  perform public.disclosure_submit(current_setting('test.pr1')::uuid);
  raise notice 'S5b ✅ المبلغ خارج الحد مرفوض عند الحفظ، وداخل الحد مقبول';
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-00000000000e');
do $$ declare j jsonb; begin
  begin perform public.disclosure_decide(current_setting('test.pr1')::uuid, true, null::text, 5000::numeric); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_AMOUNT_OUT_OF_RANGE', sqlerrm; end;
  j := public.disclosure_decide(current_setting('test.pr1')::uuid, true, null::text, 90000::numeric);
  assert (j ->> 'amount')::numeric = 90000, 'S5c decide: ' || j::text;
  raise notice 'S5c ✅ قرار المعاون/المدير يخضع للحدود نفسها';
end $$;
