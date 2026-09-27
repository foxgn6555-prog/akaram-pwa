-- اختبار وظيفي لـ 00144: السياسة · أنواع الإجازات · الرصيد · الطلبات والموافقة · نقص الدقائق والاستقطاع المقترح · الإضافي · التنبيهات · التصدير
-- التشغيل: بعد تطبيق كل الميجريشنات على قاعدة الاختبار (انظر README) — كل الفحوص assert وتفشل عند أول خطأ.
set client_min_messages = notice;

-- ── تهيئة: مستخدمون وأدوار وموظفون ─────────────────────────────
insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'hr@t.iq'), ('aaaa0000-0000-0000-0000-00000000000b', 'it@t.iq'),
  ('aaaa0000-0000-0000-0000-00000000000c', 'mgr@t.iq'), ('aaaa0000-0000-0000-0000-00000000000d', 'emp@t.iq'),
  ('aaaa0000-0000-0000-0000-00000000000e', 'ops@t.iq'), ('aaaa0000-0000-0000-0000-00000000000f', 'fin@t.iq'),
  ('aaaa0000-0000-0000-0000-000000000010', 'boss@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'hr_officer'), ('aaaa0000-0000-0000-0000-00000000000b', 'it_admin'),
  ('aaaa0000-0000-0000-0000-00000000000c', 'department_manager'), ('aaaa0000-0000-0000-0000-00000000000d', 'employee'),
  ('aaaa0000-0000-0000-0000-00000000000e', 'ops_room'), ('aaaa0000-0000-0000-0000-00000000000f', 'finance_officer'),
  ('aaaa0000-0000-0000-0000-000000000010', 'department_manager')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin) values
  ('bbbb0000-0000-0000-0000-000000000010', 'aaaa0000-0000-0000-0000-000000000010', 'T-BOSS', 'المدير الأعلى', '2024-01-01', 'B1'),
  ('bbbb0000-0000-0000-0000-00000000000c', 'aaaa0000-0000-0000-0000-00000000000c', 'T-MGR', 'المدير المباشر', '2024-01-01', 'M1'),
  ('bbbb0000-0000-0000-0000-00000000000d', 'aaaa0000-0000-0000-0000-00000000000d', 'T-EMP', 'الموظف التجريبي', '2024-01-01', '1')
on conflict (employee_number) do nothing;
update public.employees set manager_id = 'bbbb0000-0000-0000-0000-000000000010' where id = 'bbbb0000-0000-0000-0000-00000000000c';
update public.employees set manager_id = 'bbbb0000-0000-0000-0000-00000000000c' where id = 'bbbb0000-0000-0000-0000-00000000000d';

-- شفت 08:00–16:00 سماحية 15 كل الأيام
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('cccc0000-0000-0000-0000-000000000001', 'شفت الاختبار', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('bbbb0000-0000-0000-0000-00000000000d', 'cccc0000-0000-0000-0000-000000000001', '2024-01-01') on conflict do nothing;

-- ── ① السياسة ──────────────────────────────────────────────────
do $$ declare p jsonb; begin
  p := public.hr_policy_get();
  assert (p ->> 'annual_leave_days_default')::int = 30, 'default annual 30';
  assert (p ->> 'permits_per_leave_day')::int = 3, 'permits per day 3';
  assert jsonb_array_length(p -> 'deduction_tiers') = 6, 'tiers seeded';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ begin
  begin perform public.hr_policy_set('{"annual_leave_days_default": 25}'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'HR cannot set policy: ' || sqlerrm; end;
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000b');
do $$ begin
  begin perform public.hr_policy_set('{"deduction_tiers": [{"from": 1, "to": 10, "minutes": 0}, {"from": 12, "to": null, "minutes": 30}]}'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_TIERS_INVALID', 'gap tiers rejected: ' || sqlerrm; end;
  begin perform public.hr_policy_set('{"deduction_tiers": [{"from": 1, "to": 10, "minutes": 0}]}'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_TIERS_INVALID', 'closed last tier rejected: ' || sqlerrm; end;
  perform public.hr_policy_set('{"annual_leave_days_default": 24, "alert_late_days_per_month": 2}');
  assert (public.hr_policy_get() ->> 'annual_leave_days_default')::int = 24, 'policy updated';
  assert (public.hr_policy_get() ->> 'permits_per_leave_day')::int = 3, 'merge keeps other keys';
  raise notice 'T1 ✅ السياسة: صلاحية IT فقط + تحقق الشرائح + دمج';
end $$;

-- ── ② أنواع الإجازات ────────────────────────────────────────────
do $$ declare n int; v uuid; begin
  select count(*) into n from public.hr_leave_types where is_active; assert n >= 8, 'seeded types';
  v := public.hr_leave_type_save('{"code": "study", "name": "إجازة دراسية", "kind": "leave", "is_paid": false, "consumes_balance": false, "deduction_days_per_day": 0.5}');
  assert (select deduction_days_per_day from public.hr_leave_types where id = v) = 0.5, 'custom type saved';
  perform public.hr_leave_type_save(jsonb_build_object('id', v, 'code', 'study', 'name', 'إجازة دراسية', 'kind', 'leave', 'is_active', false));
  assert not (select is_active from public.hr_leave_types where id = v), 'type deactivated';
  raise notice 'T2 ✅ أنواع الإجازات: بذور + إنشاء/تعطيل';
end $$;

-- ── ③ الرصيد ─────────────────────────────────────────────────
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare b jsonb; y int := extract(year from current_date)::int; begin
  b := public.hr_leave_balance('bbbb0000-0000-0000-0000-00000000000d', y);
  assert (b ->> 'granted')::numeric = 24, 'auto grant from policy: ' || b::text;
  perform public.hr_balance_set_grant('bbbb0000-0000-0000-0000-00000000000d', y, 30, 'رصيد خاص');
  b := public.hr_leave_balance('bbbb0000-0000-0000-0000-00000000000d', y);
  assert (b ->> 'granted')::numeric = 30 and (b ->> 'remaining')::numeric = 30, 'HR sets annual days: ' || b::text;
  begin perform public.hr_balance_adjust('bbbb0000-0000-0000-0000-00000000000d', y, -2, ''); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_REASON_REQUIRED', 'adjust needs reason'; end;
  perform public.hr_balance_adjust('bbbb0000-0000-0000-0000-00000000000d', y, -2, 'تسوية');
  b := public.hr_leave_balance('bbbb0000-0000-0000-0000-00000000000d', y);
  assert (b ->> 'remaining')::numeric = 28, 'adjust applied: ' || b::text;
  raise notice 'T3 ✅ الرصيد: منحة تلقائية + تحديد HR + تعديل بسبب';
end $$;

-- ── ④ الطلبات والموافقة ──────────────────────────────────────────
-- الموظف يطلب إجازة اعتيادية يومين الشهر القادم
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000d');
do $$ declare t_annual uuid; t_unpaid uuid; t_permit uuid; t_permit_unpaid uuid; lid uuid; d1 date := (date_trunc('month', current_date) + interval '1 month')::date + 3; n int; b jsonb;
begin
  select id into t_annual from public.hr_leave_types where code = 'annual';
  select id into t_permit from public.hr_leave_types where code = 'permit_paid';
  -- زمنية أطول من الحد
  begin perform public.hr_leave_request('bbbb0000-0000-0000-0000-00000000000d', t_permit, d1, d1, '09:00', '13:00'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_PERMIT_TOO_LONG', 'permit max: ' || sqlerrm; end;
  lid := public.hr_leave_request('bbbb0000-0000-0000-0000-00000000000d', t_annual, d1, d1 + 1, null, null, 'سفر');
  assert (select status from public.hr_leaves where id = lid) = 'pending', 'pending';
  assert (select manager_id from public.hr_leaves where id = lid) = 'bbbb0000-0000-0000-0000-00000000000c', 'manager snapshot';
  select count(*) into n from public.notifications where user_id = 'aaaa0000-0000-0000-0000-00000000000c' and dedupe_key = 'leave_req:' || lid; assert n = 1, 'manager notified';
  -- تداخل
  begin perform public.hr_leave_request('bbbb0000-0000-0000-0000-00000000000d', t_annual, d1 + 1, d1 + 2); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_LEAVE_OVERLAP', 'overlap: ' || sqlerrm; end;
  -- لا يبتّ الموظف بنفسه
  begin perform public.hr_leave_decide(lid, true); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'self decide forbidden: ' || sqlerrm; end;
  select count(*) into n from public.hr_leaves_list('mine'); assert n = 1, 'mine list';
  raise notice 'T4 ✅ الطلب: تحقق الحد والتداخل + إشعار المدير + قائمة طلباتي';
end $$;
-- HR لا يبتّ (ليس المدير المباشر)، والمدير الأعلى لا يبتّ ما دام المباشر متاحاً
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare lid uuid; begin
  select id into lid from public.hr_leaves where employee_id = 'bbbb0000-0000-0000-0000-00000000000d' and status = 'pending';
  begin perform public.hr_leave_decide(lid, true); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'HR cannot decide: ' || sqlerrm; end;
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-000000000010');
do $$ declare lid uuid; n int; begin
  select id into lid from public.hr_leaves where employee_id = 'bbbb0000-0000-0000-0000-00000000000d' and status = 'pending';
  begin perform public.hr_leave_decide(lid, true); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'grand manager cannot decide while direct available: ' || sqlerrm; end;
  select count(*) into n from public.hr_leaves_list('team') where can_decide; assert n = 0, 'no decidable for boss';
  raise notice 'T5 ✅ الموافقة حصرية للمدير المباشر (HR والمدير الأعلى مرفوضان)';
end $$;
-- المدير المباشر: رفض بلا سبب مرفوض، ثم موافقة → استهلاك الرصيد + إشعار الموظف
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000c');
do $$ declare lid uuid; b jsonb; n int; y int; begin
  select id, extract(year from start_date)::int into lid, y from public.hr_leaves where employee_id = 'bbbb0000-0000-0000-0000-00000000000d' and status = 'pending';
  select count(*) into n from public.hr_leaves_list('team') where can_decide; assert n = 1, 'inbox shows 1';
  begin perform public.hr_leave_decide(lid, false, ''); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_REASON_REQUIRED', 'reject needs reason'; end;
  perform public.hr_leave_decide(lid, true, 'موافق');
  assert (select status from public.hr_leaves where id = lid) = 'approved', 'approved';
  assert (select sum(days) from public.hr_leave_ledger where leave_id = lid and kind = 'consume') = -2, 'consumed 2 days';
  select count(*) into n from public.notifications where user_id = 'aaaa0000-0000-0000-0000-00000000000d' and dedupe_key = 'leave_dec:' || lid; assert n = 1, 'employee notified';
  begin perform public.hr_leave_decide(lid, true); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_LEAVE_NOT_PENDING', 'double decide blocked'; end;
  raise notice 'T6 ✅ موافقة المدير: استهلاك الرصيد + إشعار + منع البتّ المزدوج';
end $$;
-- الموظف يلغي إجازة معتمدة مستقبلية → إرجاع الرصيد
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000d');
do $$ declare lid uuid; b jsonb; y int; begin
  select id, extract(year from start_date)::int into lid, y from public.hr_leaves where employee_id = 'bbbb0000-0000-0000-0000-00000000000d' and status = 'approved';
  begin perform public.hr_leave_cancel(lid, ''); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_REASON_REQUIRED', 'cancel approved needs reason'; end;
  perform public.hr_leave_cancel(lid, 'تغيّرت الخطة');
  assert (select status from public.hr_leaves where id = lid) = 'cancelled', 'cancelled';
  b := public.hr_leave_balance('bbbb0000-0000-0000-0000-00000000000d', y);
  assert (b ->> 'used_leave_days')::numeric = 2 and (b ->> 'reversed')::numeric = 2, 'reversal restores: ' || b::text;
  raise notice 'T7 ✅ إلغاء إجازة معتمدة يعيد الرصيد';
end $$;

-- ── ⑤ الحضور: نقص الدقائق والاستقطاع المقترح والإضافي ──────────────
-- أيام الشهر الماضي: D1..D7
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000e');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := 'bbbb0000-0000-0000-0000-00000000000d';
  a record;
begin
  -- بصمات
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method) values
    ('T', '1', e, (m + 1 + time '08:10')::timestamp at time zone '+03:00'::interval, 'manual'), ('T', '1', e, (m + 1 + time '16:00')::timestamp at time zone '+03:00'::interval, 'manual'),  -- نقص 10 → ضمن السماحية
    ('T', '1', e, (m + 2 + time '08:30')::timestamp at time zone '+03:00'::interval, 'manual'), ('T', '1', e, (m + 2 + time '16:00')::timestamp at time zone '+03:00'::interval, 'manual'),  -- نقص 30 → 60 دقيقة
    ('T', '1', e, (m + 3 + time '08:30')::timestamp at time zone '+03:00'::interval, 'manual'), ('T', '1', e, (m + 3 + time '16:30')::timestamp at time zone '+03:00'::interval, 'manual'),  -- تأخر عوّضه بالبقاء → 0
    ('T', '1', e, (m + 4 + time '08:00')::timestamp at time zone '+03:00'::interval, 'manual'), ('T', '1', e, (m + 4 + time '17:30')::timestamp at time zone '+03:00'::interval, 'manual'),  -- إضافي 90
    ('T', '1', e, (m + 5 + time '10:00')::timestamp at time zone '+03:00'::interval, 'manual'), ('T', '1', e, (m + 5 + time '17:00')::timestamp at time zone '+03:00'::interval, 'manual'),  -- زمنية مدفوعة 09–10 + عمل 7س = 8س → 0
    ('T', '1', e, (m + 7 + time '10:00')::timestamp at time zone '+03:00'::interval, 'manual'), ('T', '1', e, (m + 7 + time '16:00')::timestamp at time zone '+03:00'::interval, 'manual');  -- زمنية غير مدفوعة 08–10 → نقص 120 → نصف يوم
  -- اليوم 6: غياب. اليوم 8: إجازة بدون راتب معتمدة.
  perform public.hr_attendance_evaluate(m + 1, m + 8, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 1;
  assert a.required_minutes = 480 and a.shortfall_minutes = 10 and a.proposed_deduction_minutes = 0 and a.proposed_deduction_days = 0, 'D1 grace: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 2;
  assert a.shortfall_minutes = 30 and a.proposed_deduction_minutes = 60 and a.status = 'late', 'D2 tier 26..35 → 60: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 3;
  assert a.shortfall_minutes = 0 and a.proposed_deduction_minutes = 0 and a.overtime_minutes = 0, 'D3 late compensated: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 4;
  assert a.overtime_minutes = 90 and a.proposed_deduction_minutes = 0, 'D4 overtime 90: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 6;
  assert a.status = 'absent' and a.proposed_deduction_days = 1 and a.shortfall_minutes = 480, 'D6 absent → 1 day: ' || row_to_json(a)::text;
  raise notice 'T8 ✅ نقص الدقائق والشرائح والإضافي والغياب';
end $$;
-- زمنيات وإجازة غير مدفوعة (HR تُدخل نيابة، المدير يوافق)
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := 'bbbb0000-0000-0000-0000-00000000000d'; t uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_paid';
  perform public.hr_leave_request(e, t, m + 5, m + 5, '09:00', '10:00', 'زمنية');
  select id into t from public.hr_leave_types where code = 'permit_unpaid';
  perform public.hr_leave_request(e, t, m + 7, m + 7, '08:00', '10:00', 'زمنية بلا راتب');
  select id into t from public.hr_leave_types where code = 'unpaid';
  perform public.hr_leave_request(e, t, m + 8, m + 8, null, null, 'بدون راتب');
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000c');
do $$ declare r record; a record; m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := 'bbbb0000-0000-0000-0000-00000000000d'; b jsonb; begin
  for r in select id from public.hr_leaves where employee_id = e and status = 'pending' loop perform public.hr_leave_decide(r.id, true); end loop;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 5;
  assert a.status = 'time_permit' and a.permit_minutes = 60 and a.shortfall_minutes = 0 and a.proposed_deduction_minutes = 0, 'D5 paid permit covers: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 7;
  assert a.permit_minutes = 0 and a.shortfall_minutes = 120 and a.proposed_deduction_days = 0.5, 'D7 unpaid permit deducts: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 8;
  assert a.status = 'leave' and a.proposed_deduction_days = 1 and a.shortfall_minutes = 0, 'D8 unpaid leave → 1 day: ' || row_to_json(a)::text;
  b := public.hr_leave_balance(e, extract(year from m)::int);
  assert (b ->> 'permits_count')::int = 1 and (b ->> 'used_permit_days')::numeric = 0.333, 'permit consumes 1/3: ' || b::text;
  raise notice 'T9 ✅ الزمنية المدفوعة تغطي النقص وتستهلك ثلث يوم؛ غير المدفوعة والإجازة بلا راتب تُستقطع';
end $$;
-- غرفة العمليات: إلغاء استقطاع بسبب
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000e');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := 'bbbb0000-0000-0000-0000-00000000000d'; s record; n int; begin
  begin perform public.ops_deduction_waive(e, m + 2, true, ''); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_REASON_REQUIRED', 'waive needs reason'; end;
  perform public.ops_deduction_waive(e, m + 2, true, 'ظرف قاهر موثّق');
  select * into s from app.hr_month_summary(m) where employee_id = e;
  assert s.auto_minutes = 0 and s.auto_days = 2.5 and s.overtime_minutes = 90 and s.shift_minutes = 480, 'summary after waive: ' || row_to_json(s)::text;
  select count(*) into n from public.hr_attendance_audit where employee_id = e and action = 'waive'; assert n = 1, 'waive audited';
  select count(*) into n from public.ops_attendance_list(m, m + 8) where employee_id = e and deduction_waived; assert n = 1, 'list shows waived';
  raise notice 'T10 ✅ إلغاء الاستقطاع بسبب + سجل تدقيق + الملخص يستثنيه';
end $$;
-- التنبيهات: تكرار التأخير (العتبة 2)
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := 'bbbb0000-0000-0000-0000-00000000000d'; n int; a record; begin
  select * into a from public.hr_alerts where employee_id = e and period_month = m and kind = 'late_repeat';
  assert a.id is not null and a.value = 2, 'late alert raised (D2, D3): ' || coalesce(row_to_json(a)::text, 'none');
  select count(*) into n from public.hr_alerts_list(m) where kind = 'late_repeat'; assert n = 1, 'alert listed';
  select count(*) into n from public.notifications where user_id = 'aaaa0000-0000-0000-0000-00000000000c' and dedupe_key like 'hr_alert:late:%'; assert n = 1, 'manager notified of alert';
  perform public.hr_alert_ack(a.id);
  select count(*) into n from public.hr_alerts_list(m) where kind = 'late_repeat'; assert n = 0, 'ack hides';
  raise notice 'T11 ✅ تنبيه تكرار التأخير + إشعار المدير + الإقرار';
end $$;

-- ── ⑦ التصدير والمالية ─────────────────────────────────────────
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000f');
select public.finance_salary_set('bbbb0000-0000-0000-0000-00000000000d', 'monthly', 1440000, null, '{}', '{}');
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000e');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := 'bbbb0000-0000-0000-0000-00000000000d'; x uuid; r record; b jsonb; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = e;
  -- أجر اليوم 48000 · أجر الدقيقة 100 · مقترح: 0 دقيقة + 2.5 يوم = 120000
  assert r.auto_deduction_minutes = 0 and r.auto_deduction_days = 2.5 and r.auto_deduction_amount = 120000, 'auto amount: ' || row_to_json(r)::text;
  assert r.proposed_net = 1440000 - 120000, 'proposed net: ' || r.proposed_net;
  assert r.overtime_minutes = 90, 'overtime carried';
  -- رصيد الإضافي: 90/480 = 0.188 يوم، idempotent
  b := public.hr_leave_balance(e, extract(year from m)::int);
  assert (b ->> 'overtime_days')::numeric = 0.188, 'overtime credited: ' || b::text;
  perform public.ops_month_export(m);
  b := public.hr_leave_balance(e, extract(year from m)::int);
  assert (b ->> 'overtime_days')::numeric = 0.188, 'overtime idempotent: ' || b::text;
  raise notice 'T12 ✅ التصدير: مبلغ الاستقطاع التلقائي + رصيد الإضافي (idempotent)';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000f');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; r record; begin
  select * into r from public.finance_payroll_sheet(m) where employee_id = 'bbbb0000-0000-0000-0000-00000000000d';
  assert r.auto_deduction_amount = 120000 and r.shortfall_minutes > 0, 'finance sheet columns: ' || row_to_json(r)::text;
  raise notice 'T13 ✅ كشف المالية يحمل أعمدة الاستقطاع التلقائي';
end $$;
select auth.set_test_user('aaaa0000-0000-0000-0000-00000000000a');
do $$ declare d jsonb; begin
  d := public.hr_leaves_dashboard();
  assert (d ->> 'pending')::int = 0 and (d ->> 'open_alerts')::int >= 0, 'dashboard: ' || d::text;
  raise notice 'T14 ✅ لوحة الإجازات';
end $$;
