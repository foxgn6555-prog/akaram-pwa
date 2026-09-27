-- تدقيق تداخلات الحضور ↔ الإجازات (00145) — يُشغَّل بعد hr-leaves-policy-test.sql (يعتمد على مستخدميه وشفته)
-- كل فحص assert؛ يفشل عند أول اختلاف. الشهر المرجعي = قبل شهرين (بعيداً عن بيانات الملف الأول).
set client_min_messages = notice;

-- موظف ثانٍ (لتجنب تداخل الطلبات مع الملف الأول) + موظف بلا بصمة + مدير في إجازة
insert into auth.users (id, email) values ('aaaa0000-0000-0000-0000-000000000021', 'emp2@t.iq'), ('aaaa0000-0000-0000-0000-000000000022', 'nobio@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('aaaa0000-0000-0000-0000-000000000021', 'employee'), ('aaaa0000-0000-0000-0000-000000000022', 'employee') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, manager_id, biometric_pin) values
  ('bbbb0000-0000-0000-0000-000000000021', 'aaaa0000-0000-0000-0000-000000000021', 'T-EMP2', 'موظف الحافة', '2024-01-01', 'bbbb0000-0000-0000-0000-00000000000c', '21'),
  ('bbbb0000-0000-0000-0000-000000000022', 'aaaa0000-0000-0000-0000-000000000022', 'T-NOBIO', 'موظف بلا بصمة', '2024-01-01', 'bbbb0000-0000-0000-0000-00000000000c', null)
on conflict (employee_number) do nothing;
update public.employees set biometric_pin = '1' where id = 'bbbb0000-0000-0000-0000-00000000000d' and biometric_pin is null;
update public.employees set biometric_pin = 'M1' where id = 'bbbb0000-0000-0000-0000-00000000000c' and biometric_pin is null;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('bbbb0000-0000-0000-0000-000000000021', 'cccc0000-0000-0000-0000-000000000001', '2024-01-01'),
  ('bbbb0000-0000-0000-0000-000000000022', 'cccc0000-0000-0000-0000-000000000001', '2024-01-01'),
  ('bbbb0000-0000-0000-0000-00000000000c', 'cccc0000-0000-0000-0000-000000000001', '2024-01-01')
on conflict do nothing;

-- ── E1: الموظف المجاز الذي لم يبصم = «إجازة» لا «غياب»؛ ويبقى مجازاً حتى لو بصم ──
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; t uuid; lid uuid; a record; begin
  -- قبل أي إجازة: اليوم 10 و11 غياب
  perform public.hr_attendance_evaluate(m + 10, m + 11, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 10;
  assert a.status = 'absent' and a.proposed_deduction_days = 1, 'قبل الإجازة: غياب مقترح: ' || row_to_json(a)::text;
  -- HR تُدخل إجازة اعتيادية للأيام 10..11 نيابةً؛ لا تزال معلّقة → يبقى غياباً
  select id into t from public.hr_leave_types where code = 'annual';
  lid := public.hr_leave_request(e, t, m + 10, m + 11, null, null, 'نيابة');
  perform public.hr_attendance_evaluate(m + 10, m + 11, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 10;
  assert a.status = 'absent', 'طلب معلّق لا يغيّر الغياب: ' || a.status;
  raise notice 'E1a ✅ الطلب المعلّق لا يُلغي الغياب';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000c');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; lid uuid; a record; n int; begin
  select id into lid from public.hr_leaves where employee_id = e and status = 'pending' and start_date = m + 10;
  perform public.hr_leave_decide(lid, true, 'موافق');
  -- الموافقة أعادت الاحتساب فوراً (بلا استدعاء evaluate)
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 10;
  assert a.status = 'leave' and a.proposed_deduction_days = 0 and a.shortfall_minutes = 0 and a.deduction_reason is null, 'مجاز بلا بصمة = إجازة بلا استقطاع: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 11;
  assert a.status = 'leave', 'اليوم الثاني من الإجازة: ' || a.status;
  -- بصم في اليوم 11 رغم الإجازة → يبقى «إجازة» مع حفظ وقت البصمة، ولا تأخير ولا نقص
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method) values
    ('T', '21', e, (m + 11 + time '10:00')::timestamp at time zone '+03:00'::interval, 'manual'), ('T', '21', e, (m + 11 + time '12:00')::timestamp at time zone '+03:00'::interval, 'manual');
  perform app.hr_evaluate_day(e, m + 11);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 11;
  assert a.status = 'leave' and a.check_in is not null and a.late_minutes = 0 and a.shortfall_minutes = 0 and a.proposed_deduction_days = 0, 'بصم وهو مجاز → يبقى مجازاً: ' || row_to_json(a)::text;
  -- إعادة الاحتساب الجماعي لا تُعيده غياباً (استقلال الترتيب)
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date between m + 10 and m + 11 and status = 'leave'; assert n = 2, 'order independence';
  raise notice 'E1b ✅ المجاز لا يظهر غائباً (بصم أو لم يبصم)، والموافقة تعيد الاحتساب فوراً';
end $$;

-- ── E2: إلغاء الإجازة المعتمدة بعد مرورها (HR فقط) يعيدها غياباً ويُرجع الرصيد ──
select auth.set_test_user('aaaa0000-0000-0000-0000-000000000021');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; lid uuid; begin
  select id into lid from public.hr_leaves where employee_id = 'bbbb0000-0000-0000-0000-000000000021' and status = 'approved' and start_date = m + 10;
  begin perform public.hr_leave_cancel(lid, 'تراجع'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_LEAVE_STARTED', 'employee cannot cancel started leave: ' || sqlerrm; end;
  raise notice 'E2a ✅ الموظف لا يلغي إجازة بدأت';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; lid uuid; a record; b jsonb; begin
  select id into lid from public.hr_leaves where employee_id = e and status = 'approved' and start_date = m + 10;
  perform public.hr_leave_cancel(lid, 'أُدخلت خطأً');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 10;
  assert a.status = 'absent' and a.proposed_deduction_days = 1, 'بعد الإلغاء يعود غياباً: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 11;
  assert a.status = 'late' and a.shortfall_minutes = 360 and a.proposed_deduction_days = 1, 'اليوم 11 (عمل ساعتين متأخراً) يعود تأخيراً بنقص 360 → يوم: ' || row_to_json(a)::text;
  b := public.hr_leave_balance(e, extract(year from m)::int);
  assert (b ->> 'used_leave_days')::numeric = 2 and (b ->> 'reversed')::numeric = 2, 'الرصيد أُرجع: ' || b::text;
  raise notice 'E2b ✅ HR تلغي إجازة ماضية → غياب من جديد + إرجاع الرصيد';
end $$;

-- ── E3: زمنية معتمدة بلا أي بصمة = غياب؛ ببصمة واحدة = ناقصة؛ ببصمتين = زمنية ──
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; t uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_paid';
  perform public.hr_leave_request(e, t, m + 12, m + 12, '08:00', '09:00', 'بلا بصمة');
  perform public.hr_leave_request(e, t, m + 13, m + 13, '08:00', '09:00', 'بصمة واحدة');
  perform public.hr_leave_request(e, t, m + 14, m + 14, '08:00', '09:00', 'بصمتان');
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method) values
    ('T', '21', e, (m + 13 + time '09:00')::timestamp at time zone '+03:00'::interval, 'manual'),
    ('T', '21', e, (m + 14 + time '09:00')::timestamp at time zone '+03:00'::interval, 'manual'), ('T', '21', e, (m + 14 + time '16:00')::timestamp at time zone '+03:00'::interval, 'manual');
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000c');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; r record; a record; begin
  for r in select id from public.hr_leaves where employee_id = e and status = 'pending' loop perform public.hr_leave_decide(r.id, true); end loop;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 12;
  assert a.status = 'absent' and a.proposed_deduction_days = 1, 'زمنية بلا بصمة = غياب: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 13;
  assert a.status = 'incomplete' and a.proposed_deduction_days = 0, 'زمنية ببصمة واحدة = ناقصة (تُدقَّق يدوياً): ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 14;
  assert a.status = 'time_permit' and a.late_minutes = 0 and a.permit_minutes = 60 and a.shortfall_minutes = 0 and a.proposed_deduction_minutes = 0, 'زمنية ببصمتين = زمنية بلا تأخير: ' || row_to_json(a)::text;
  raise notice 'E3 ✅ الزمنية لا تُخفي الغياب أو البصمة الناقصة';
end $$;

-- ── E4: الموظف بلا بصمة: لا صفوف حضور ولا استقطاعات؛ لا يطلب بنفسه؛ HR تُدخل نيابةً ──
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000022'; n int; s record; begin
  perform public.hr_attendance_evaluate(m + 1, m + 10, e);
  select count(*) into n from public.hr_attendance_days where employee_id = e; assert n = 0, 'no attendance rows for non-biometric';
  select count(*) into n from app.hr_month_summary(m) where employee_id = e; assert n = 0, 'no summary row';
  raise notice 'E4a ✅ بلا بصمة: لا غياب وهمي ولا استقطاع';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-000000000022');
do $$ declare t uuid; d date := (date_trunc('month', current_date) + interval '1 month')::date + 10; begin
  select id into t from public.hr_leave_types where code = 'annual';
  begin perform public.hr_leave_request('bbbb0000-0000-0000-0000-000000000022', t, d, d); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_NO_BIOMETRIC', 'self request blocked: ' || sqlerrm; end;
  raise notice 'E4b ✅ بلا بصمة لا يطلب بنفسه';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare t uuid; d date := (date_trunc('month', current_date) + interval '1 month')::date + 10; lid uuid; begin
  select id into t from public.hr_leave_types where code = 'annual';
  lid := public.hr_leave_request('bbbb0000-0000-0000-0000-000000000022', t, d, d, null, null, 'نيابة');
  assert (select status from public.hr_leaves where id = lid) = 'pending', 'HR may enter on behalf';
  perform public.hr_leave_cancel(lid, 'تنظيف');
  raise notice 'E4c ✅ HR تُدخل نيابةً عن موظف بلا بصمة';
end $$;

-- ── E5: صلاحيات الطلب: موظف يطلب لغيره → مرفوض؛ المدير يطلب لموظفه → مقبول ──
select auth.set_test_user('aaaa0000-0000-0000-0000-000000000021');
do $$ declare t uuid; d date := (date_trunc('month', current_date) + interval '1 month')::date + 12; begin
  select id into t from public.hr_leave_types where code = 'annual';
  begin perform public.hr_leave_request('bbbb0000-0000-0000-0000-00000000000d', t, d, d); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'employee cannot request for others: ' || sqlerrm; end;
  raise notice 'E5a ✅ الموظف لا يطلب لغيره';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000c');
do $$ declare t uuid; d date := (date_trunc('month', current_date) + interval '1 month')::date + 12; lid uuid; begin
  select id into t from public.hr_leave_types where code = 'annual';
  lid := public.hr_leave_request('bbbb0000-0000-0000-0000-000000000021', t, d, d, null, null, 'من المدير');
  perform public.hr_leave_cancel(lid, 'تنظيف');
  raise notice 'E5b ✅ المدير المباشر يطلب لموظفه';
end $$;

-- ── E6: المرضية تتطلب مرفقاً؛ الحد الشهري للزمنيات؛ نمط الاستحقاق الشهري ──
select auth.set_test_user('aaaa0000-0000-0000-0000-000000000021');
do $$ declare t uuid; d date := (date_trunc('month', current_date) + interval '1 month')::date + 15; lid uuid; begin
  select id into t from public.hr_leave_types where code = 'sick';
  begin perform public.hr_leave_request('bbbb0000-0000-0000-0000-000000000021', t, d, d); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_ATTACHMENT_REQUIRED', 'sick needs attachment: ' || sqlerrm; end;
  lid := public.hr_leave_request('bbbb0000-0000-0000-0000-000000000021', t, d, d, null, null, null, 'bbbb0000-0000-0000-0000-000000000021/leave-1.pdf');
  perform public.hr_leave_cancel(lid);
  raise notice 'E6a ✅ المرضية بمرفق فقط';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000b');
select public.hr_policy_set('{"permits_max_per_month": 1}');
select auth.set_test_user('aaaa0000-0000-0000-0000-000000000021');
do $$ declare t uuid; d date := (date_trunc('month', current_date) + interval '1 month')::date + 16; lid uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_paid';
  lid := public.hr_leave_request('bbbb0000-0000-0000-0000-000000000021', t, d, d, '09:00', '10:00');
  begin perform public.hr_leave_request('bbbb0000-0000-0000-0000-000000000021', t, d + 1, d + 1, '09:00', '10:00'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_PERMIT_MONTH_LIMIT', 'monthly permit cap: ' || sqlerrm; end;
  perform public.hr_leave_cancel(lid);
  raise notice 'E6b ✅ السقف الشهري للزمنيات';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000b');
select public.hr_policy_set('{"permits_max_per_month": null, "balance_mode": "monthly_accrual"}');
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare b jsonb; y int := extract(year from current_date)::int; expected numeric; begin
  perform public.hr_balance_set_grant('bbbb0000-0000-0000-0000-000000000022', y, 24);
  b := public.hr_leave_balance('bbbb0000-0000-0000-0000-000000000022', y);
  expected := round(24 * extract(month from current_date) / 12, 2);
  assert (b ->> 'accrued')::numeric = expected and (b ->> 'remaining')::numeric = expected, 'monthly accrual: ' || b::text || ' expected ' || expected;
  raise notice 'E6c ✅ الاستحقاق الشهري (1/12 لكل شهر)';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000b');
select public.hr_policy_set('{"balance_mode": "annual_upfront"}');

-- ── E7: مدير المدير يبتّ فقط عندما يكون المدير المباشر في إجازة معتمدة اليوم ──
select auth.set_test_user('aaaa0000-0000-0000-0000-000000000021');
do $$ declare t uuid; d date := (date_trunc('month', current_date) + interval '1 month')::date + 20; begin
  select id into t from public.hr_leave_types where code = 'annual';
  perform public.hr_leave_request('bbbb0000-0000-0000-0000-000000000021', t, d, d, null, null, 'اختبار التصعيد');
end $$;
-- المدير المباشر (c) يطلب إجازة تشمل اليوم، ومديره الأعلى (boss) يوافق
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000c');
do $$ declare t uuid; begin
  select id into t from public.hr_leave_types where code = 'official';
  perform public.hr_leave_request('bbbb0000-0000-0000-0000-00000000000c', t, current_date, current_date, null, null, 'إيفاد');
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-000000000010');
do $$ declare lid uuid; own uuid; begin
  select id into own from public.hr_leaves where employee_id = 'bbbb0000-0000-0000-0000-00000000000c' and status = 'pending';
  select id into lid from public.hr_leaves where employee_id = 'bbbb0000-0000-0000-0000-000000000021' and status = 'pending';
  begin perform public.hr_leave_decide(lid, true); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'boss blocked while direct manager available: ' || sqlerrm; end;
  perform public.hr_leave_decide(own, true, 'موافق');          -- المدير المباشر أصبح مجازاً اليوم
  assert app.hr_can_decide(lid), 'boss can decide while direct manager on leave';
  perform public.hr_leave_decide(lid, true, 'بالإنابة');
  assert (select status from public.hr_leaves where id = lid) = 'approved', 'escalated approval';
  raise notice 'E7 ✅ التصعيد لمدير المدير عند إجازة المدير المباشر فقط';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare r record; begin
  for r in select id from public.hr_leaves where employee_id in ('bbbb0000-0000-0000-0000-00000000000c', 'bbbb0000-0000-0000-0000-000000000021') and status = 'approved' and start_date >= current_date loop
    perform public.hr_leave_cancel(r.id, 'تنظيف الاختبار');
  end loop;
end $$;

-- ── E8: التعديل اليدوي لغرفة العمليات يعيد حساب المشتقات ويصمد أمام إعادة الاحتساب ──
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000e');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; a record; begin
  -- اليوم 12 كان غياباً (زمنية بلا بصمة): غرفة العمليات تُثبت الحضور بسبب
  perform public.ops_attendance_edit(e, m + 12, (m + 12 + time '08:00')::timestamp at time zone '+03:00'::interval, (m + 12 + time '16:00')::timestamp at time zone '+03:00'::interval, 'present', 'كان في مهمة خارجية موثقة');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 12;
  assert a.source = 'manual' and a.status = 'present' and a.shortfall_minutes = 0 and a.proposed_deduction_days = 0 and a.deduction_reason is null, 'manual edit recomputes metrics: ' || row_to_json(a)::text;
  perform public.hr_attendance_evaluate(m + 12, m + 12, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 12;
  assert a.source = 'manual' and a.status = 'present', 'manual row survives re-evaluation';
  raise notice 'E8 ✅ التعديل اليدوي يعيد حساب الاستقطاع ويصمد أمام إعادة الاحتساب';
end $$;

-- ── E9: الشهر المقفول (اعتماد المالية) يمنع الموافقة/الإلغاء/إلغاء الاستقطاع ──
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000f');
select public.finance_salary_set('bbbb0000-0000-0000-0000-000000000021', 'monthly', 900000, null, '{}', '{}');
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; t uuid; begin
  select id into t from public.hr_leave_types where code = 'annual';
  perform public.hr_leave_request('bbbb0000-0000-0000-0000-000000000021', t, m + 20, m + 20, null, null, 'قبل القفل');
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000e');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; x uuid; begin
  x := public.ops_month_export(m);
  perform set_config('test.export_id', x::text, false);
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000f');
do $$ begin
  update public.hr_month_export_rows set final_net = coalesce(final_net, proposed_net, 0) where export_id = current_setting('test.export_id')::uuid and final_net is null;
  perform public.finance_payroll_approve(current_setting('test.export_id')::uuid);
  raise notice 'E9a ✅ اعتُمد الشهر (مقفول)';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000c');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; lid uuid; begin
  select id into lid from public.hr_leaves where employee_id = 'bbbb0000-0000-0000-0000-000000000021' and status = 'pending' and start_date = m + 20;
  begin perform public.hr_leave_decide(lid, true); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_MONTH_LOCKED', 'approve in locked month: ' || sqlerrm; end;
  perform public.hr_leave_decide(lid, false, 'الشهر مقفول — راجع HR');   -- الرفض مسموح (لا يغيّر الحضور)
  raise notice 'E9b ✅ لا موافقة في شهر مقفول (الرفض مسموح)';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000e');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 month')::date; begin
  begin perform public.ops_deduction_waive('bbbb0000-0000-0000-0000-000000000021', m + 10, true, 'محاولة'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_MONTH_LOCKED', 'waive in locked month: ' || sqlerrm; end;
  begin perform public.hr_attendance_evaluate(m + 1, m + 5, 'bbbb0000-0000-0000-0000-000000000021'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_MONTH_LOCKED', 'evaluate in locked month: ' || sqlerrm; end;
  raise notice 'E9c ✅ لا إلغاء استقطاع ولا إعادة احتساب في شهر مقفول';
end $$;

-- ── E10: تنبيهات الغياب لا تحتسب أيام الإجازة؛ وتنبيه النقص يستثني الاستقطاعات الملغاة ──
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '3 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; t uuid; lid uuid; a record; begin
  select id into t from public.hr_leave_types where code = 'annual';
  lid := public.hr_leave_request(e, t, m + 3, m + 6, null, null, 'أربعة أيام');
  perform set_config('test.leave_id', lid::text, false);
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000c');
select public.hr_leave_decide(current_setting('test.leave_id')::uuid, true, 'موافق');
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '3 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; a record; n int; begin
  -- اليومان 1 و2 غياب فعلي، 3..6 إجازة
  perform public.hr_attendance_evaluate(m + 1, m + 6, e);
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date between m + 1 and m + 6 and status = 'leave'; assert n = 4, 'four leave days';
  select * into a from public.hr_alerts where employee_id = e and period_month = m and kind = 'absent_repeat';
  assert a.value = 2, 'absent alert counts only real absences (2), not leave days: ' || coalesce(a.value::text, 'none');
  select * into a from public.hr_alerts where employee_id = e and period_month = m and kind = 'shortfall';
  assert a.value = 960, 'shortfall alert = 2 × 480: ' || coalesce(a.value::text, 'none');
  raise notice 'E10a ✅ أيام الإجازة ليست غياباً في التنبيهات';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000e');
do $$ declare m date := (date_trunc('month', current_date) - interval '3 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000021'; a record; begin
  perform public.ops_deduction_waive(e, m + 1, true, 'عذر موثق');
  perform public.ops_deduction_waive(e, m + 2, true, 'عذر موثق');
  select * into a from public.hr_alerts where employee_id = e and period_month = m and kind = 'shortfall';
  assert a.id is null, 'shortfall alert cleared after waiving both days';
  raise notice 'E10b ✅ إلغاء الاستقطاع يُحدّث تنبيه النقص فوراً';
end $$;

-- ── E11: الرصيد عبر السنوات: ترحيل المتبقي بحدّه الأقصى + تناسب سنة التعيين ──
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare y int := extract(year from current_date)::int; b jsonb; e uuid; begin
  insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values ('bbbb0000-0000-0000-0000-000000000031', 'T-CARRY', 'موظف الترحيل', '2020-01-01', '31') on conflict (employee_number) do nothing;
  e := 'bbbb0000-0000-0000-0000-000000000031';
  insert into public.hr_leave_ledger (employee_id, year, kind, days, note) values (e, y - 1, 'grant', 30, 'السنة الماضية'), (e, y - 1, 'consume', -5, 'إجازة');
  b := public.hr_leave_balance(e, y);
  -- المتبقي 25 > الحد الأقصى 30؟ لا → يُرحّل 25 كاملاً
  assert (b ->> 'carried')::numeric = 25 and (b ->> 'remaining')::numeric = 24 + 25, 'carry-over 25: ' || b::text;
  -- موظف معيّن في تموز هذه السنة: منحة نسبية 6/12
  insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values ('bbbb0000-0000-0000-0000-000000000032', 'T-MIDYEAR', 'معيّن منتصف السنة', make_date(y, 7, 1), '32') on conflict (employee_number) do nothing;
  b := public.hr_leave_balance('bbbb0000-0000-0000-0000-000000000032', y);
  assert (b ->> 'granted')::numeric = round(24 * 6.0 / 12, 2), 'prorated grant: ' || b::text;
  raise notice 'E11 ✅ ترحيل المتبقي وتناسب سنة التعيين';
end $$;

-- ── E12: الموظف المُنهى خدمته لا يُشتق حضوره بعد تاريخ الإنهاء ولا يطلب ──
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '4 month')::date; e uuid := 'bbbb0000-0000-0000-0000-000000000031'; n int; t uuid; begin
  update public.employees set employment_status = 'terminated', terminated_at = m + 5 where id = e;
  perform public.hr_attendance_evaluate(m + 1, m + 10, e);
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date > m + 5; assert n = 0, 'no rows after termination';
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date between m + 1 and m + 5; assert n = 5, 'rows up to termination day';
  select id into t from public.hr_leave_types where code = 'annual';
  begin perform public.hr_leave_request(e, t, current_date + 30, current_date + 30); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_NOT_FOUND', 'terminated cannot request: ' || sqlerrm; end;
  raise notice 'E12 ✅ المُنهى خدمته خارج الاشتقاق والطلبات';
end $$;
