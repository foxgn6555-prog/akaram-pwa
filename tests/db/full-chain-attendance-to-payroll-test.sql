-- جولة التحقق الشاملة: البصمة → الحضورية (شرائح الاستقطاع) → الزمنيات والإجازات (سلسلة الموافقات) → تعديلات غرفة العمليات
-- → الكشوفات (استقطاع موثّق) → السلف (قسط تلقائي) → تصدير الشهر → كشف المالية → الاعتماد والقفل → ما بعد القفل. (بادئة fx)
-- الهدف: إثبات أن ترتيب العمليات صحيح وأن كل رقم في كشف الرواتب يُشتق من مصدره بلا تضارب بين غرفة العمليات والمالية.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('fe000000-0000-0000-0000-000000000001', 'fx-ops@t.iq'), ('fe000000-0000-0000-0000-000000000002', 'fx-hr@t.iq'), ('fe000000-0000-0000-0000-000000000003', 'fx-dep@t.iq'),
  ('fe000000-0000-0000-0000-000000000004', 'fx-adm@t.iq'), ('fe000000-0000-0000-0000-000000000005', 'fx-mgr@t.iq'), ('fe000000-0000-0000-0000-000000000006', 'fx-emp@t.iq'),
  ('fe000000-0000-0000-0000-000000000007', 'fx-fin@t.iq'), ('fe000000-0000-0000-0000-000000000008', 'fx-it@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fe000000-0000-0000-0000-000000000001', 'ops_room'), ('fe000000-0000-0000-0000-000000000002', 'hr_officer'), ('fe000000-0000-0000-0000-000000000003', 'deputy_director'),
  ('fe000000-0000-0000-0000-000000000004', 'super_admin'), ('fe000000-0000-0000-0000-000000000005', 'department_manager'), ('fe000000-0000-0000-0000-000000000006', 'employee'),
  ('fe000000-0000-0000-0000-000000000007', 'finance_officer'), ('fe000000-0000-0000-0000-000000000008', 'it_admin')
on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin) values
  ('fe000000-0000-0000-0000-0000000000e5', 'fe000000-0000-0000-0000-000000000005', 'fx مدير القسم', 'FX-MGR', '2024-01-01', 'FX-M'),
  ('fe000000-0000-0000-0000-0000000000e6', 'fe000000-0000-0000-0000-000000000006', 'fx موظف الدورة', 'FX-EMP', '2024-01-01', '8101')
on conflict (id) do nothing;
update public.employees set manager_id = 'fe000000-0000-0000-0000-0000000000e5' where id = 'fe000000-0000-0000-0000-0000000000e6';
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('fe000000-0000-0000-0000-0000000000a1', 'fx شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('fe000000-0000-0000-0000-0000000000e6', 'fe000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('fe000000-0000-0000-0000-0000000000e5', 'fe000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('fe000000-0000-0000-0000-0000000000d1', 'FX-DEV-1', 'fx جهاز', '+03:00', true) on conflict (serial_number) do nothing;
-- الشهر موضوع الاختبار: الشهر الماضي (مكتمل ⇒ لا تناسب)
select set_config('test.fx_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

-- ═══ S0 · المالية تُعرّف الرواتب: الموظف 600,000 + نقل 50,000 − تأمين 10,000 ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000007');
do $$ declare e record; begin
  perform public.finance_salary_set('fe000000-0000-0000-0000-0000000000e6', 'monthly', 600000, 0, '{"نقل": 50000}'::jsonb, '{"تأمين": 10000}'::jsonb, null);
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;

-- ═══ S1 · البصمات: حاضر / متأخر 40 د / غائب / خروج مبكر ساعتين / بصمة ناقصة → تُحتسب تلقائياً بالمنطقة الزمنية الصحيحة ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.fx_m')::date; n int; a record; e uuid := 'fe000000-0000-0000-0000-0000000000e6'; tiers jsonb; begin
  n := public.biometric_ingest('FX-DEV-1',
         '8101' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t' || '0' || E'\n' || '8101' || E'\t' || (m + 1)::text || ' 16:00:00' || E'\t' || '1' || E'\n' ||
         '8101' || E'\t' || (m + 2)::text || ' 08:40:00' || E'\t' || '0' || E'\n' || '8101' || E'\t' || (m + 2)::text || ' 16:00:00' || E'\t' || '1' || E'\n' ||
         '8101' || E'\t' || (m + 4)::text || ' 08:00:00' || E'\t' || '0' || E'\n' || '8101' || E'\t' || (m + 4)::text || ' 14:00:00' || E'\t' || '1' || E'\n' ||
         '8101' || E'\t' || (m + 5)::text || ' 08:00:00' || E'\t' || '0', 'ATTLOG');
  assert n = 7, 'S1 ingest ' || n;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 1;
  assert a.status = 'present' and a.worked_minutes = 480 and a.shortfall_minutes = 0 and a.proposed_deduction_minutes = 0, 'S1 d1: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 2;
  assert a.status = 'late' and a.late_minutes = 30 and a.shortfall_minutes = 40, 'S1 d2: ' || row_to_json(a)::text;
  -- الاستقطاع المقترح يطابق شريحة السياسة (التطوير المركزية) لنقص 40 دقيقة
  select o_minutes into n from app.hr_tier_for(40, 480);
  assert a.proposed_deduction_minutes = n, 'S1 d2 tier: ' || a.proposed_deduction_minutes || ' vs ' || n;
  perform set_config('test.fx_d2_min', n::text, false);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 3;
  assert a.status = 'absent' and a.proposed_deduction_days = app.hr_policy_num('absent_day_deduction_days', 1), 'S1 d3: ' || coalesce(row_to_json(a)::text, 'null');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 4;
  assert a.status = 'early_leave' and a.early_minutes = 120 and a.shortfall_minutes = 120, 'S1 d4: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 5;
  assert a.status = 'incomplete', 'S1 d5: ' || coalesce(a.status, 'null');
  raise notice 'S1 ✅ البصمات → أيام الحضور ومشتقاتها';
end $$;

-- ═══ S2 · زمنية مدفوعة 14:00–16:00 ليوم الخروج المبكر: طلب الموظف → موافقة المدير المباشر → النقص يُلغى تلقائياً ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000006');
do $$ declare m date := current_setting('test.fx_m')::date; t uuid; lid uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_paid';
  lid := public.hr_leave_request('fe000000-0000-0000-0000-0000000000e6', t, m + 4, m + 4, '14:00', '16:00', 'مراجعة دائرة');
  perform set_config('test.fx_permit', lid::text, false);
  assert exists (select 1 from public.notifications where user_id = 'fe000000-0000-0000-0000-000000000005' and body like '%14:00–16:00%'), 'S2 manager notified';
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-000000000005');
do $$ declare m date := current_setting('test.fx_m')::date; a record; begin
  perform public.hr_leave_decide(current_setting('test.fx_permit')::uuid, true, null);
  select * into a from public.hr_attendance_days where employee_id = 'fe000000-0000-0000-0000-0000000000e6' and work_date = m + 4;
  assert a.permit_minutes = 120 and a.shortfall_minutes = 0 and a.proposed_deduction_minutes = 0 and a.proposed_deduction_days = 0, 'S2 permit applied: ' || row_to_json(a)::text;
  raise notice 'S2 ✅ الزمنية المعتمدة تلغي النقص';
end $$;

-- ═══ S3 · إجازة اعتيادية يومين (مدفوعة) + إجازة بدون راتب يوم: تُعتمد → الأيام تتحول إلى «إجازة» والمدفوعة بلا استقطاع ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000006');
do $$ declare m date := current_setting('test.fx_m')::date; t uuid; l1 uuid; l2 uuid; begin
  select id into t from public.hr_leave_types where code = 'annual';
  l1 := public.hr_leave_request('fe000000-0000-0000-0000-0000000000e6', t, m + 6, m + 7, null, null, 'سفر');
  select id into t from public.hr_leave_types where code = 'unpaid';
  l2 := public.hr_leave_request('fe000000-0000-0000-0000-0000000000e6', t, m + 8, m + 8, null, null, 'ظرف خاص');
  perform set_config('test.fx_l1', l1::text, false); perform set_config('test.fx_l2', l2::text, false);
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-000000000005');
do $$ declare m date := current_setting('test.fx_m')::date; a record; begin
  perform public.hr_leave_decide(current_setting('test.fx_l1')::uuid, true, null);
  perform public.hr_leave_decide(current_setting('test.fx_l2')::uuid, true, null);
  select * into a from public.hr_attendance_days where employee_id = 'fe000000-0000-0000-0000-0000000000e6' and work_date = m + 6;
  assert a.status = 'leave' and a.proposed_deduction_days = 0, 'S3 paid leave day: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = 'fe000000-0000-0000-0000-0000000000e6' and work_date = m + 8;
  assert a.status = 'leave' and a.proposed_deduction_days = 1, 'S3 unpaid leave day: ' || row_to_json(a)::text;
  raise notice 'S3 ✅ الإجازات المعتمدة (مدفوعة/غير مدفوعة)';
end $$;

-- ═══ S4 · غرفة العمليات: إعفاء استقطاع يوم التأخير بسبب + استقطاع يدوي 5,000 (كلاهما في سجل التدقيق) ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fx_m')::date; a record; begin
  perform public.ops_deduction_waive('fe000000-0000-0000-0000-0000000000e6', m + 2, true, 'تأخير بسبب حاجز أمني');
  select * into a from public.hr_attendance_days where employee_id = 'fe000000-0000-0000-0000-0000000000e6' and work_date = m + 2;
  assert a.deduction_waived and a.waive_reason like 'تأخير%', 'S4 waived';
  perform public.ops_deduction_add('fe000000-0000-0000-0000-0000000000e6', m, 5000, 0, 'تلف عهدة');
  assert (select count(*) from public.hr_attendance_audit where employee_id = 'fe000000-0000-0000-0000-0000000000e6' and action in ('waive', 'deduction_add', 'deduction_waive')) >= 1, 'S4 audited';
  raise notice 'S4 ✅ تعديلات غرفة العمليات موثّقة';
end $$;

-- ═══ S5 · كشف بمبلغ 7,000 على الموظف (غرفة العمليات تُعدّ → المعاون → المدير المفوض) → استقطاع موثّق بمصدره في شهر المخالفة ═══
do $$ declare m date := current_setting('test.fx_m')::date; j jsonb; begin
  j := public.disclosure_save(null::uuid, jsonb_build_object('target_kind', 'employee', 'employee_id', 'fe000000-0000-0000-0000-0000000000e6', 'violation_type', 'absence', 'penalty_type', 'reprimand',
         'details', 'غياب يوم كامل بلا عذر مقبول', 'log_date', (m + 3)::text, 'amount', 7000));
  perform set_config('test.fx_disc', j ->> 'id', false);
  perform public.disclosure_submit(current_setting('test.fx_disc')::uuid);
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-000000000004');
do $$ declare m date := current_setting('test.fx_m')::date; j jsonb; begin
  j := public.disclosure_decide(current_setting('test.fx_disc')::uuid, true, null, null);
  if j ->> 'status' = 'pending' then j := public.disclosure_decide(current_setting('test.fx_disc')::uuid, true, null, null); end if;
  assert j ->> 'status' = 'approved' and (j ->> 'deduction_posted')::boolean, 'S5: ' || j::text;
  assert exists (select 1 from public.hr_attendance_deductions where source_disclosure_id = current_setting('test.fx_disc')::uuid and period_month = m and amount = 7000), 'S5 deduction row in violation month';
  raise notice 'S5 ✅ الكشف المعتمد → استقطاع 7,000 في شهر المخالفة';
end $$;

-- ═══ S6 · سلفة 300,000 على 3 أقساط: غرفة العمليات → المعاون → المدير المفوض → المالية تسلّم؛ نجعل بداية الاستقطاع هذا الشهر ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; t uuid; begin
  select id into t from public.advance_types where name = 'سلفة نقدية عادية';
  j := public.advance_request_create('fe000000-0000-0000-0000-0000000000e6', t, 300000, 'equal', 3, null, null, 'سلفة الدورة');
  perform set_config('test.fx_adv', j ->> 'id', false);
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-000000000003');
select public.advance_decide(current_setting('test.fx_adv')::uuid, true, null, null, null);
select auth.set_test_user('fe000000-0000-0000-0000-000000000004');
select public.advance_decide(current_setting('test.fx_adv')::uuid, true, null, null, null);
select auth.set_test_user('fe000000-0000-0000-0000-000000000007');
do $$ declare j jsonb; begin
  j := public.advance_deliver(current_setting('test.fx_adv')::uuid, 'سُلّمت');
  assert j ->> 'status' = 'delivered', 'S6 delivered';
end $$;
reset role; select set_config('auth.user_id','', false);
update public.advances set start_month = current_setting('test.fx_m')::date where id = current_setting('test.fx_adv')::uuid;

-- ═══ S7 · تصدير الشهر من غرفة العمليات: كل رقم يُشتق من مصدره ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fx_m')::date; x uuid; r record; e uuid := 'fe000000-0000-0000-0000-0000000000e6';
        exp_auto_min int; exp_auto_days numeric; day_rate numeric; min_rate numeric; exp_auto_amt numeric; exp_ded numeric; n_days int; ok boolean := false; cf jsonb; begin
  -- 00193: الترتيب إلزامي — لا تصدير قبل «اعتماد حضورية الشهر» (المرحلة 1 → 2)
  begin perform public.ops_month_export(m); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_NOT_CONFIRMED'; end;
  assert ok, 'S7 export blocked before confirmation';
  cf := public.ops_attendance_confirm(m);
  assert (cf ->> 'confirmed')::boolean and (cf ->> 'can_export')::boolean and (cf ->> 'unevaluated_days')::int = 0, 'S7 confirmed: ' || cf::text;
  x := public.ops_month_export(m);
  perform set_config('test.fx_export', x::text, false);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = e;
  assert r.id is not null, 'S7 row';
  -- أيام الشهر كلها محتسبة (لا يوم مجدول بلا احتساب)
  assert r.unevaluated_days = 0 and r.scheduled_days = (select count(*) from public.hr_attendance_days where employee_id = e and date_trunc('month', work_date) = m and not is_rest_day), 'S7 coverage: ' || r.unevaluated_days;
  -- الحضور: حاضر + متأخر + خروج مبكر (الزمنية غطّته) = 3؛ ناقص 1؛ إجازة مدفوعة 2 وغير مدفوعة 1؛ الغياب = غياب صريح + بقية الأيام بلا بصمة
  assert r.days_present = 3 and r.days_late = 1 and r.days_incomplete = 1 and r.days_leave_paid = 2 and r.days_leave_unpaid = 1, 'S7 counts: ' || row_to_json(r)::text;
  assert r.days_absent = (select count(*) from public.hr_attendance_days where employee_id = e and date_trunc('month', work_date) = m and status = 'absent'), 'S7 absent count';
  -- الاستقطاع التلقائي = مجموع المقترح غير المُعفى (يوم التأخير مُعفى ⇒ لا دقائقه)
  select coalesce(sum(proposed_deduction_minutes), 0), coalesce(sum(proposed_deduction_days), 0) into exp_auto_min, exp_auto_days
  from public.hr_attendance_days where employee_id = e and date_trunc('month', work_date) = m and not deduction_waived;
  assert r.auto_deduction_minutes = exp_auto_min and r.auto_deduction_days = exp_auto_days, 'S7 auto: ' || r.auto_deduction_minutes || '/' || r.auto_deduction_days || ' vs ' || exp_auto_min || '/' || exp_auto_days;
  assert exp_auto_days >= 2, 'S7 auto days include absent + unpaid leave';
  assert (select deduction_waived from public.hr_attendance_days where employee_id = e and work_date = m + 2), 'S7 waived day stays waived';
  -- استقطاعات غرفة العمليات = 5,000 يدوي + 7,000 كشف، والأسباب تذكر الكشف
  assert r.ops_deduction_amount = 12000 and r.ops_deduction_reasons like '%كشف%', 'S7 ops ded: ' || r.ops_deduction_amount || ' / ' || coalesce(r.ops_deduction_reasons, '');
  -- قسط السلفة 100,000
  assert r.advance_installment = 100000, 'S7 advance: ' || r.advance_installment;
  -- الإجمالي والاستقطاعات والصافي
  day_rate := round(600000 / 30.0, 4);
  assert r.gross_amount = 650000 and r.fixed_deductions_total = 10000 and r.day_rate = day_rate, 'S7 gross/fixed/day_rate: ' || r.gross_amount || '/' || r.fixed_deductions_total || '/' || r.day_rate;
  exp_ded := 10000 + 12000 + r.ops_deduction_days_amount + r.auto_deduction_amount + 100000;
  assert r.deductions_total = exp_ded, 'S7 deductions_total ' || r.deductions_total || ' vs ' || exp_ded;
  assert r.proposed_net = greatest(0, 650000 - exp_ded) and r.final_net = r.proposed_net, 'S7 net ' || r.proposed_net;
  assert r.auto_deduction_amount > 0 and r.auto_deduction_amount = least(round(day_rate * exp_auto_days + round(day_rate / 480, 4) * exp_auto_min, 2), round(app.hr_policy_num('auto_deduction_cap_ratio', 1) * 650000, 2)), 'S7 auto amount ' || r.auto_deduction_amount;
  raise notice 'S7 ✅ التصدير: حضور % · غياب % · تلقائي % د/% يوم = % · عمليات 12,000 · سلفة 100,000 · الصافي %', r.days_present, r.days_absent, exp_auto_min, exp_auto_days, r.auto_deduction_amount, r.proposed_net;
end $$;

-- ═══ S8 · كشف المالية = صفوف غرفة العمليات تماماً؛ تفصيل الاستقطاعات يُظهر الكشف ومصدره ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.fx_m')::date; f record; o record; d record; st jsonb; begin
  select * into f from public.finance_payroll_sheet(m) x where x.employee_id = 'fe000000-0000-0000-0000-0000000000e6';
  select * into o from public.ops_month_export_rows(current_setting('test.fx_export')::uuid) x where x.employee_id = 'fe000000-0000-0000-0000-0000000000e6';
  assert f.days_present = o.days_present and f.days_absent = o.days_absent and f.ops_deduction_amount = o.ops_deduction_amount and f.auto_deduction_minutes = o.auto_deduction_minutes and f.auto_deduction_days = o.auto_deduction_days, 'S8 finance = ops';
  assert f.advance_installment = 100000 and f.export_status = 'exported', 'S8 finance advance col';
  select * into d from public.hr_employee_month_deductions('fe000000-0000-0000-0000-0000000000e6', m) x where x.source_disclosure_id is not null;
  assert d.amount = 7000 and d.disclosure_ref is not null, 'S8 disclosure detail';
  st := public.hr_month_export_status(m);
  assert not (st ->> 'needs_reexport')::boolean and (st ->> 'unevaluated_days')::int = 0, 'S8 status fresh: ' || st::text;
  raise notice 'S8 ✅ المالية ترى ما صدّرته غرفة العمليات بلا فرق';
end $$;

-- ═══ S9 · تغيير بعد التصدير (زمنية جديدة تُعتمد) ⇒ «يلزم إعادة التصدير»؛ المالية لا تعتمد بلا تأكيد؛ إعادة التصدير تُحدّث الأرقام ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fx_m')::date; ok boolean := false; cf jsonb; begin
  update public.hr_month_exports set exported_at = exported_at - interval '1 minute' where id = current_setting('test.fx_export')::uuid;
  -- بعد الاعتماد: أي تعديل يدوي ممنوع حتى إعادة الفتح بسبب
  begin perform public.ops_deduction_add('fe000000-0000-0000-0000-0000000000e6', m, 3000, 0, 'غرامة متأخرة'); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_CONFIRMED'; end;
  assert ok, 'S9 manual deduction blocked while confirmed';
  ok := false; begin perform public.ops_attendance_reopen(m, ''); exception when others then ok := sqlerrm = 'HR_REASON_REQUIRED'; end;
  assert ok, 'S9 reopen needs reason';
  cf := public.ops_attendance_reopen(m, 'غرامة وصلت بعد الاعتماد');
  assert cf ->> 'status' = 'reopened' and not (cf ->> 'can_export')::boolean, 'S9 reopened: ' || cf::text;
  assert exists (select 1 from public.notifications where user_id = 'fe000000-0000-0000-0000-000000000008' and title like 'إعادة فتح حضورية%'), 'S9 IT notified of reopen';
  perform public.ops_deduction_add('fe000000-0000-0000-0000-0000000000e6', m, 3000, 0, 'غرامة متأخرة');
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.fx_m')::date; st jsonb; ok boolean := false; begin
  st := public.hr_month_export_status(m);
  assert (st ->> 'needs_reexport')::boolean and (st ->> 'deductions_after')::int >= 1, 'S9 stale: ' || st::text;
  begin perform public.finance_payroll_approve(current_setting('test.fx_export')::uuid, false); exception when others then ok := sqlerrm = 'HR_EXPORT_STALE'; end;
  assert ok, 'S9 stale approve blocked';
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fx_m')::date; x uuid; r record; ok boolean := false; begin
  begin perform public.ops_month_export(m); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_NOT_CONFIRMED'; end;
  assert ok, 'S9 export blocked while reopened';
  perform public.ops_attendance_confirm(m);
  assert (public.ops_attendance_confirmation(m) ->> 'confirm_count')::int = 2, 'S9 confirm_count 2';
  x := public.ops_month_export(m);
  perform set_config('test.fx_export', x::text, false);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'fe000000-0000-0000-0000-0000000000e6';
  assert r.ops_deduction_amount = 15000 and r.advance_installment = 100000, 'S9 re-export: ' || r.ops_deduction_amount;
  assert (select status from public.hr_month_exports where period_month = m and version = 1) = 'superseded', 'S9 v1 superseded';
  -- لم يُسجَّل أي قسط على السلفة قبل الاعتماد رغم تصديرين
  assert (select repaid_total from public.advances where id = current_setting('test.fx_adv')::uuid) = 0, 'S9 no installment before approval';
  raise notice 'S9 ✅ إعادة التصدير بعد تغيير';
end $$;

-- ═══ S10 · المالية تعدّل الصافي بملاحظة ثم تعتمد ⇒ القفل؛ قسط السلفة يُسجَّل مرة واحدة ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.fx_m')::date; f record; j jsonb; begin
  select * into f from public.finance_payroll_sheet(m) x where x.employee_id = 'fe000000-0000-0000-0000-0000000000e6';
  perform public.finance_payroll_adjust(f.row_id, f.proposed_net + 25000, 'مكافأة استثنائية');
  perform public.finance_payroll_approve(current_setting('test.fx_export')::uuid, false);
  select * into f from public.finance_payroll_sheet(m) x where x.employee_id = 'fe000000-0000-0000-0000-0000000000e6';
  assert f.export_status = 'approved' and f.final_net = f.proposed_net + 25000 and f.finance_note = 'مكافأة استثنائية', 'S10 approved';
  assert app.hr_month_locked(m), 'S10 locked';
  j := public.advance_get(current_setting('test.fx_adv')::uuid);
  assert (j ->> 'repaid_total')::numeric = 100000 and (j ->> 'remaining')::numeric = 200000 and (j ->> 'installments_posted')::int = 1, 'S10 advance posted once: ' || j::text;
  raise notice 'S10 ✅ الاعتماد والقفل وتسجيل القسط';
end $$;

-- ═══ S11 · بعد القفل: لا تصدير، لا تعديل حضور، لا استقطاع يدوي؛ البصمة تُخزَّن ولا تُحتسب؛ كشف جديد يُرحَّل لأول شهر مفتوح ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fx_m')::date; ok boolean; n int; e uuid := 'fe000000-0000-0000-0000-0000000000e6'; before_status text; begin
  ok := false; begin perform public.ops_month_export(m); exception when others then ok := sqlerrm = 'HR_MONTH_LOCKED'; end; assert ok, 'S11 export blocked';
  ok := false; begin perform public.ops_attendance_edit(e, m + 3, (m + 3)::text::timestamp at time zone 'Asia/Baghdad' + interval '8 hour', (m + 3)::text::timestamp at time zone 'Asia/Baghdad' + interval '16 hour', 'present', 'تصحيح'); exception when others then ok := sqlerrm = 'HR_MONTH_LOCKED'; end; assert ok, 'S11 edit blocked';
  ok := false; begin perform public.ops_deduction_add(e, m, 1000, 0, 'متأخر'); exception when others then ok := sqlerrm = 'HR_MONTH_LOCKED'; end; assert ok, 'S11 deduction blocked';
  ok := false; begin perform public.ops_attendance_reopen(m, 'محاولة'); exception when others then ok := sqlerrm = 'HR_MONTH_LOCKED'; end; assert ok, 'S11 reopen blocked after lock';
  ok := false; begin perform public.ops_attendance_confirm(m); exception when others then ok := sqlerrm = 'HR_MONTH_LOCKED'; end; assert ok, 'S11 confirm blocked after lock';
  select status into before_status from public.hr_attendance_days where employee_id = e and work_date = m + 9;
  n := public.biometric_ingest('FX-DEV-1', '8101' || E'\t' || (m + 9)::text || ' 08:00:00' || E'\t' || '0' || E'\n' || '8101' || E'\t' || (m + 9)::text || ' 16:00:00' || E'\t' || '1', 'ATTLOG');
  assert n = 2, 'S11 punches stored';
  assert (select status from public.hr_attendance_days where employee_id = e and work_date = m + 9) is not distinct from before_status, 'S11 locked day untouched';
  raise notice 'S11 ✅ القفل يحمي الشهر';
end $$;
do $$ declare m date := current_setting('test.fx_m')::date; j jsonb; begin
  j := public.disclosure_save(null::uuid, jsonb_build_object('target_kind', 'employee', 'employee_id', 'fe000000-0000-0000-0000-0000000000e6', 'violation_type', 'absence', 'penalty_type', 'reprimand',
         'details', 'غياب آخر بعد قفل الشهر', 'log_date', (m + 10)::text, 'amount', 4000));
  perform set_config('test.fx_disc2', j ->> 'id', false);
  perform public.disclosure_submit(current_setting('test.fx_disc2')::uuid);
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-000000000004');
do $$ declare m date := current_setting('test.fx_m')::date; j jsonb; dm date; begin
  j := public.disclosure_decide(current_setting('test.fx_disc2')::uuid, true, null, null);
  if j ->> 'status' = 'pending' then j := public.disclosure_decide(current_setting('test.fx_disc2')::uuid, true, null, null); end if;
  select period_month into dm from public.hr_attendance_deductions where source_disclosure_id = current_setting('test.fx_disc2')::uuid;
  assert dm = (m + interval '1 month')::date and (j ->> 'deduction_note') like '%مقفل%', 'S11 disclosure carried to next open month: ' || coalesce(dm::text, 'null') || ' / ' || coalesce(j ->> 'deduction_note', '');
  raise notice 'S11b ✅ كشف بعد القفل يُرحَّل إلى الشهر التالي ويُوثَّق';
end $$;

-- ═══ S12 · الشهر التالي (الحالي): بلا بصمات الصافي صفر ⇒ القسط يُؤجَّل (لا يُستقطع من لا شيء)؛ بعد إجازة مدفوعة يظهر القسط الثاني والكشف المرحَّل؛ لا سلفة ثانية ═══
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare m date := date_trunc('month', current_date)::date; x uuid; r record; begin
  perform public.ops_attendance_confirm(m);
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'fe000000-0000-0000-0000-0000000000e6';
  assert r.ops_deduction_amount = 4000 and r.ops_deduction_reasons like '%كشف%', 'S12a carried disclosure: ' || r.ops_deduction_amount;
  assert r.proposed_net = 0 and r.advance_installment = 0, 'S12a zero net ⇒ installment deferred: ' || r.proposed_net || '/' || r.advance_installment;
  assert (select amount - repaid_total from public.advances where id = current_setting('test.fx_adv')::uuid) = 200000, 'S12a remaining untouched';
end $$;
-- الرصيد السنوي لا يكفي لشهر كامل (يُرفض HR_BALANCE_INSUFFICIENT) ⇒ نستخدم إجازة رسمية مدفوعة بلا رصيد تغطي الشهر الحالي كله
select auth.set_test_user('fe000000-0000-0000-0000-000000000006');
do $$ declare m date := date_trunc('month', current_date)::date; t uuid; l uuid; ok boolean := false; begin
  select id into t from public.hr_leave_types where code = 'annual';
  begin l := public.hr_leave_request('fe000000-0000-0000-0000-0000000000e6', t, m, (m + interval '1 month' - interval '1 day')::date, null, null, 'إجازة سنوية');
  exception when others then ok := sqlerrm = 'HR_BALANCE_INSUFFICIENT'; end;
  assert ok, 'S12 annual balance guard';
  select id into t from public.hr_leave_types where code = 'official';
  l := public.hr_leave_request('fe000000-0000-0000-0000-0000000000e6', t, m, (m + interval '1 month' - interval '1 day')::date, null, null, 'إيفاد رسمي');
  perform set_config('test.fx_l3', l::text, false);
end $$;
select auth.set_test_user('fe000000-0000-0000-0000-000000000005');
select public.hr_leave_decide(current_setting('test.fx_l3')::uuid, true, null);
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare m date := date_trunc('month', current_date)::date; x uuid; r record; ok boolean := false; t uuid; cf jsonb; begin
  -- الإجازة اعتُمدت بعد اعتماد الحضورية ⇒ أيامها مُعلَّقة (لم تُطبَّق صامتةً) والتصدير ممنوع حتى إعادة الفتح ثم الاعتماد
  cf := public.ops_attendance_confirmation(m);
  if current_date > m then
    assert (cf ->> 'pending_auto')::int > 0 and not (cf ->> 'can_export')::boolean, 'S12 pending auto after confirmation: ' || cf::text;
    assert (select status from public.hr_attendance_days where employee_id = 'fe000000-0000-0000-0000-0000000000e6' and work_date = m) = 'absent', 'S12 day untouched while confirmed';
    begin perform public.ops_month_export(m); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_NOT_CONFIRMED'; end;
    assert ok, 'S12 export blocked with pending auto changes';
    perform public.ops_attendance_reopen(m, 'إجازة رسمية اعتُمدت بعد الاعتماد');
    assert (select status from public.hr_attendance_days where employee_id = 'fe000000-0000-0000-0000-0000000000e6' and work_date = m) = 'leave', 'S12 reopen applies pending leave';
  end if;
  perform public.ops_attendance_confirm(m);
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'fe000000-0000-0000-0000-0000000000e6';
  assert r.days_absent = 0 and r.auto_deduction_amount = 0, 'S12 leave covers month: ' || row_to_json(r)::text;
  assert r.advance_installment = 100000, 'S12 second installment: ' || r.advance_installment;
  assert r.ops_deduction_amount = 4000 and r.ops_deduction_reasons like '%كشف%', 'S12 carried disclosure: ' || r.ops_deduction_amount;
  assert r.deductions_total = 10000 + 4000 + 100000 and r.proposed_net = r.gross_amount - r.deductions_total, 'S12 totals: ' || r.deductions_total || '/' || r.proposed_net;
  select id into t from public.advance_types where name = 'سلفة طارئة';
  ok := false; begin perform public.advance_request_create('fe000000-0000-0000-0000-0000000000e6', t, 50000, 'single'); exception when others then ok := sqlerrm = 'ADVANCE_ALREADY_OPEN'; end;
  assert ok, 'S12 second advance blocked while open';
  raise notice 'S12 ✅ الشهر التالي: القسط الثاني + الكشف المرحَّل';
end $$;
reset role; select set_config('auth.user_id','', false);
