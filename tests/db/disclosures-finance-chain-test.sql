-- 00185 · الكشوفات (الجولة A): سلامة سلسلة كشف معتمد → استقطاع → كشف المالية (بادئة fc)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00201: هذا الاختبار يفترض النموذج القديم (الراتب كاملاً ناقص الغياب ÷ 30)؛ النموذج الافتراضي الجديد «الأيام المستحقة» يُختبر في payroll-earned-days-test
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
-- 00193: هذا الاختبار يختبر التصدير مباشرة؛ بوابة «اعتماد الحضورية قبل التصدير» تُختبر في ops-attendance-two-stage-test
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('fc000000-0000-0000-0000-000000000001', 'fc-ops@t.iq'), ('fc000000-0000-0000-0000-000000000003', 'fc-dep@t.iq'),
  ('fc000000-0000-0000-0000-000000000004', 'fc-adm@t.iq'), ('fc000000-0000-0000-0000-000000000007', 'fc-fin@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fc000000-0000-0000-0000-000000000001', 'ops_room'), ('fc000000-0000-0000-0000-000000000003', 'deputy_director'),
  ('fc000000-0000-0000-0000-000000000004', 'super_admin'), ('fc000000-0000-0000-0000-000000000007', 'finance_officer')
on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date) values
  ('fc000000-0000-0000-0000-0000000000e1', 'fc000000-0000-0000-0000-000000000001', 'fc عمليات', 'FC-OPS', '2024-01-01'),
  ('fc000000-0000-0000-0000-0000000000e3', 'fc000000-0000-0000-0000-000000000003', 'fc معاون', 'FC-DEP', '2024-01-01'),
  ('fc000000-0000-0000-0000-0000000000e4', 'fc000000-0000-0000-0000-000000000004', 'fc مدير مفوض', 'FC-ADM', '2024-01-01'),
  ('fc000000-0000-0000-0000-0000000000e9', null, 'fc موظف مخالف', 'FC-9', '2024-01-01')
on conflict (id) do nothing;

-- ═══ S1 · غرفة العمليات تصدّر الشهر الماضي أولاً، ثم يُعتمد كشف بمبلغ على موظف في الشهر نفسه ═══
select auth.set_test_user('fc000000-0000-0000-0000-000000000007');
do $$ declare e record; begin
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 600000, 0, '{}', '{}', null);
  end loop;
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; j jsonb; st jsonb; begin
  x := public.ops_month_export(m);
  -- الاختبار كله في معاملة واحدة (now() ثابت) → نُرجع وقت التصدير دقيقة للخلف لمحاكاة الزمن الحقيقي
  update public.hr_month_exports set exported_at = exported_at - interval '1 minute' where id = x;
  st := public.hr_month_export_status(m);
  assert (st ->> 'export_id')::uuid = x and st ->> 'status' = 'exported', 'S1 status: ' || st::text;
  j := public.disclosure_save(null::uuid, jsonb_build_object('target_kind', 'employee', 'employee_id', 'fc000000-0000-0000-0000-0000000000e9', 'violation_type', 'absence', 'penalty_type', 'reprimand',
         'details', 'غياب يوم كامل بلا عذر مقبول', 'log_date', (m + 5)::text, 'amount', 7000));
  perform set_config('test.fc1', j ->> 'id', false);
  perform public.disclosure_submit(current_setting('test.fc1')::uuid);
  assert (j ->> 'deduction_state') is null, 'S1 no deduction yet';
  raise notice 'S1 ✅ تصدير ثم كشف قيد الموافقة';
end $$;
-- المدير المفوض (super_admin) يقرر الخطوتين حتى لا يتأثر الاختبار بسلاسل اختبارات أخرى
select auth.set_test_user('fc000000-0000-0000-0000-000000000004');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; j jsonb; begin
  j := public.disclosure_decide(current_setting('test.fc1')::uuid, true, null, null);
  if j ->> 'status' = 'pending' then j := public.disclosure_decide(current_setting('test.fc1')::uuid, true, null, null); end if;
  assert j ->> 'status' = 'approved' and (j ->> 'deduction_posted')::boolean and j ->> 'deduction_state' = 'awaiting_export', 'S2 approved: ' || j::text;
  assert exists (select 1 from public.notifications where user_id = 'fc000000-0000-0000-0000-000000000001' and title like 'أعد تصدير شهر%' and body like '%7,000%'), 'S2 ops notified to re-export';
  raise notice 'S2 ✅ الاعتماد بعد التصدير يبلّغ غرفة العمليات ويعلّم الكشف';
end $$;

-- ═══ S3 · الحالة «يلزم إعادة التصدير»؛ استقطاع الكشف لا يُحذف من الحضوريات؛ المالية لا تعتمد كشفاً قديماً بلا تأكيد ═══
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; st jsonb; dd uuid; ok boolean := false; r record; begin
  st := public.hr_month_export_status(m);
  assert (st ->> 'needs_reexport')::boolean and (st ->> 'deductions_after')::int >= 1 and (st ->> 'disclosure_deductions_after')::int >= 1 and (st ->> 'changes_after')::int >= 1, 'S3 stale: ' || st::text;
  select id into dd from public.hr_attendance_deductions where source_disclosure_id = current_setting('test.fc1')::uuid;
  begin perform public.ops_deduction_delete(dd, 'محاولة حذف'); exception when others then ok := sqlerrm = 'HR_DEDUCTION_FROM_DISCLOSURE'; end;
  assert ok and exists (select 1 from public.hr_attendance_deductions where id = dd), 'S3 disclosure deduction protected';
  select * into r from public.hr_employee_month_deductions('fc000000-0000-0000-0000-0000000000e9', m);
  assert r.amount = 7000 and r.disclosure_ref is not null and r.disclosure_type = 'غياب' and r.source_disclosure_id = current_setting('test.fc1')::uuid, 'S3 detail: ' || row_to_json(r)::text;
  raise notice 'S3 ✅ الحالة والحماية والتفاصيل';
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000007');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; st jsonb; ok boolean := false; n int; begin
  st := public.hr_month_export_status(m);
  begin perform public.finance_payroll_approve((st ->> 'export_id')::uuid); exception when others then ok := sqlerrm = 'HR_EXPORT_STALE'; if not ok then raise notice 'S3 err: %', sqlerrm; end if; end;
  assert ok, 'S3 finance blocked on stale export';
  select count(*) into n from public.finance_payroll_sheet(m) where employee_number = 'FC-9' and ops_deduction_amount = 7000;
  assert n = 0, 'S3 old sheet does not contain the new deduction yet';
  raise notice 'S3b ✅ المالية محمية من اعتماد كشف قديم';
end $$;

-- ═══ S4 · إعادة التصدير تُدخل المبلغ في كشف المالية؛ حالة الكشف «في كشف المالية» ثم «معتمد» بعد اعتماد المالية ═══
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; st jsonb; j jsonb; begin
  x := public.ops_month_export(m);
  st := public.hr_month_export_status(m);
  assert (st ->> 'export_id')::uuid = x and not (st ->> 'needs_reexport')::boolean and (st ->> 'deductions_after')::int = 0, 'S4 fresh: ' || st::text;
  j := public.disclosure_get(current_setting('test.fc1')::uuid);
  assert j ->> 'deduction_state' = 'exported', 'S4 state exported: ' || (j ->> 'deduction_state');
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000007');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; r record; st jsonb; begin
  select * into r from public.finance_payroll_sheet(m) where employee_number = 'FC-9';
  assert r.ops_deduction_amount = 7000 and r.ops_deduction_reasons like 'كشف %غياب%' and r.proposed_net = 593000, 'S4 sheet: ' || row_to_json(r)::text;
  st := public.hr_month_export_status(m);
  perform public.finance_payroll_approve((st ->> 'export_id')::uuid);
  assert app.hr_month_locked(m), 'S4 locked';
  raise notice 'S4 ✅ المبلغ في كشف المالية والشهر معتمد';
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.disclosure_get(current_setting('test.fc1')::uuid);
  assert j ->> 'deduction_state' = 'approved', 'S4 state approved: ' || (j ->> 'deduction_state');
  raise notice 'S4b ✅ حالة استقطاع الكشف تتبع المالية';
end $$;

-- ═══ S5 · اعتماد قسري (p_force) لكشف قديم مسموح ويُؤرشف في السجل ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := (date_trunc('month', current_date) - interval '3 month')::date; begin
  perform set_config('test.fcm2', m::text, false);
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fcm2')::date; x uuid; begin
  x := public.ops_month_export(m);
  update public.hr_month_exports set exported_at = exported_at - interval '1 minute' where id = x;
  perform public.ops_deduction_add('fc000000-0000-0000-0000-0000000000e9', m, 1000, 0, 'استقطاع يدوي بعد التصدير');
  assert (public.hr_month_export_status(m) ->> 'needs_reexport')::boolean, 'S5 stale after manual deduction';
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.fcm2')::date; st jsonb; begin
  st := public.hr_month_export_status(m);
  perform public.finance_payroll_approve((st ->> 'export_id')::uuid, true);
  assert app.hr_month_locked(m), 'S5 forced approve';
  assert exists (select 1 from public.hr_attendance_audit where action = 'approve' and work_date = m and (after ->> 'forced_stale')::boolean), 'S5 audit forced_stale';
  raise notice 'S5 ✅ الاعتماد القسري مسجَّل';
end $$;
reset role; select set_config('auth.user_id','', false);
