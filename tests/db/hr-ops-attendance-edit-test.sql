-- 00178 · تعديل غرفة العمليات للحضور: دقة الاحتساب + تبليغ التطوير المركزية + سجل التدقيق بأسماء (بادئة oe)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"backdated_max_days": 365}'::jsonb where id = 1;  -- 00197: الاختبار يطلب لأشهر ماضية
insert into auth.users (id, email) values
  ('0e000000-0000-0000-0000-00000000000a', 'oe-ops@t.iq'), ('0e000000-0000-0000-0000-00000000000b', 'oe-it@t.iq'),
  ('0e000000-0000-0000-0000-00000000000c', 'oe-emp@t.iq'), ('0e000000-0000-0000-0000-00000000000d', 'oe-hr@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('0e000000-0000-0000-0000-00000000000a', 'ops_room'), ('0e000000-0000-0000-0000-00000000000b', 'it_admin'),
  ('0e000000-0000-0000-0000-00000000000c', 'employee'), ('0e000000-0000-0000-0000-00000000000d', 'hr_officer')
on conflict do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('0e000000-0000-0000-0000-0000000000d1', 'oe صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}')
on conflict (name) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin) values
  ('0e000000-0000-0000-0000-0000000000e1', '0e000000-0000-0000-0000-00000000000c', 'OE-EMP', 'موظف التعديل', '2024-01-01', '7201')
on conflict (employee_number) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('0e000000-0000-0000-0000-0000000000e1', '0e000000-0000-0000-0000-0000000000d1', '2024-01-01') on conflict do nothing;

-- ═══ O1 · تعديل يوم بلا صف سابق: يُكمل الدوام المتوقع من الشفت ويحتسب التأخير بالسماح والخروج المبكر ═══
select auth.set_test_user('0e000000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '0e000000-0000-0000-0000-0000000000e1'; a record; d date; begin
  d := m + 3;
  perform public.ops_attendance_edit(e, d, (d + time '08:40')::timestamp - interval '3 hours', (d + time '15:30')::timestamp - interval '3 hours', 'late', 'بصمة الدخول لم تُسجَّل — تأكدنا من المسؤول');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = d;
  assert a.shift_name = 'oe صباحي' and a.expected_in = (d + time '08:00')::timestamp - interval '3 hours' and a.expected_out = (d + time '16:00')::timestamp - interval '3 hours', 'O1 expected from shift: ' || row_to_json(a)::text;
  assert a.late_minutes = 25 and a.early_minutes = 0 and a.worked_minutes = 410 and a.status = 'late' and a.source = 'manual', 'O1 metrics: ' || row_to_json(a)::text;
  assert a.required_minutes = 480 and a.shortfall_minutes = 70, 'O1 shortfall computed: ' || row_to_json(a)::text;
  raise notice 'O1 ✅ التعديل اليدوي يكمل الدوام المتوقع ويحتسب بدقة';
end $$;

-- ═══ O2 · خروج مبكر ضمن السماح + «حاضر» يصفّر الدقائق + التاريخ المستقبلي مرفوض ═══
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '0e000000-0000-0000-0000-0000000000e1'; a record; d date; ok boolean := false; begin
  d := m + 4;
  perform public.ops_attendance_edit(e, d, (d + time '07:55')::timestamp - interval '3 hours', (d + time '15:52')::timestamp - interval '3 hours', 'present', 'تأكيد حضور');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = d;
  assert a.status = 'present' and a.late_minutes = 0 and a.early_minutes = 0 and a.worked_minutes = 477, 'O2 present: ' || row_to_json(a)::text;
  begin
    perform public.ops_attendance_edit(e, current_date + 5, null, null, 'absent', 'مستقبل');
  exception when others then ok := sqlerrm like '%HR_FUTURE_DATE%'; end;
  assert ok, 'O2 future rejected';
  raise notice 'O2 ✅ السماح للخروج المبكر، والمستقبل مرفوض';
end $$;

-- ═══ O3 · الزمنية المعتمدة تغطي التأخير داخلها فقط عند التعديل اليدوي ═══
select auth.set_test_user('0e000000-0000-0000-0000-00000000000d');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '0e000000-0000-0000-0000-0000000000e1'; t uuid; lid uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_paid';
  lid := public.hr_leave_request(e, t, m + 5, m + 5, '08:00', '09:00', 'زمنية صباحية', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  reset role; perform set_config('auth.user_id', '', false);
  update public.hr_leaves set status = 'approved', decided_at = now() where id = lid;
end $$;
select auth.set_test_user('0e000000-0000-0000-0000-00000000000a');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '0e000000-0000-0000-0000-0000000000e1'; a record; d date; begin
  d := m + 5;
  perform public.ops_attendance_edit(e, d, (d + time '09:30')::timestamp - interval '3 hours', (d + time '16:00')::timestamp - interval '3 hours', 'late', 'دخل بعد الزمنية بنصف ساعة');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = d;
  -- 90 دقيقة بعد 08:00 − 60 زمنية − 15 سماح = 15
  assert a.late_minutes = 15 and a.permit_minutes = 60, 'O3 permit cover: ' || row_to_json(a)::text;
  raise notice 'O3 ✅ الزمنية تغطي ما بداخلها فقط في التعديل اليدوي';
end $$;

-- ═══ O4 · كل تعديل يبلّغ التطوير المركزية (إشعار hr) ولا يبلّغ المعدِّل نفسه + سجل التدقيق بأسماء ═══
do $$ declare e uuid := '0e000000-0000-0000-0000-0000000000e1'; n int; r record; m date := (date_trunc('month', current_date) - interval '1 month')::date; begin
  select count(*) into n from public.notifications where user_id = '0e000000-0000-0000-0000-00000000000b' and category = 'hr' and entity_type = 'hr_attendance_audit';
  assert n >= 3, 'O4 IT notified: ' || n;
  select * into r from public.notifications where user_id = '0e000000-0000-0000-0000-00000000000b' and category = 'hr' and body like '%دخل بعد الزمنية%' limit 1;
  assert r.link = '/it/integrations/biometric/attendance-audit' and r.id is not null and r.body like '%موظف التعديل%' and r.type = 'warning', 'O4 content: ' || row_to_json(r)::text;
  select count(*) into n from public.notifications where user_id = '0e000000-0000-0000-0000-00000000000a' and category = 'hr';
  assert n = 0, 'O4 actor not self-notified';
  -- إعادة الاحتساب وإلغاء الاستقطاع المقترح يبلّغان أيضاً
  perform public.ops_attendance_reset(e, m + 3, 'إعادة للاشتقاق التلقائي');
  perform public.ops_deduction_add(e, m, 0, 0.5, 'استقطاع تجريبي');
  select count(*) into n from public.notifications where user_id = '0e000000-0000-0000-0000-00000000000b' and category = 'hr' and body like 'إعادة احتساب%';
  assert n = 1, 'O4 reset notified';
  select count(*) into n from public.notifications where user_id = '0e000000-0000-0000-0000-00000000000b' and category = 'hr' and body like 'إضافة استقطاع%';
  assert n = 1, 'O4 deduction notified';
  raise notice 'O4 ✅ التطوير المركزية تُبلَّغ بكل تعديل تشغيلي';
end $$;
select auth.set_test_user('0e000000-0000-0000-0000-00000000000b');
do $$ declare r record; n int; begin
  select count(*) into n from public.hr_attendance_audit where employee_id = '0e000000-0000-0000-0000-0000000000e1';
  assert n >= 5, 'O5 IT reads audit via RLS: ' || n;
  select * into r from public.hr_attendance_audit_list(null, null, '0e000000-0000-0000-0000-0000000000e1', 50) limit 1;
  assert r.full_name = 'موظف التعديل' and r.employee_number = 'OE-EMP' and r.actor_name is not null, 'O5 names: ' || row_to_json(r)::text;
  raise notice 'O5 ✅ سجل التدقيق مقروء للتطوير المركزية بأسماء الموظف والمدقّق';
end $$;
-- موظف عادي لا يرى سجل التدقيق
select auth.set_test_user('0e000000-0000-0000-0000-00000000000c');
do $$ declare n int; begin
  select count(*) into n from public.hr_attendance_audit_list(null, null, null, 10);
  assert n = 0, 'O6 employee sees nothing';
  raise notice 'O6 ✅ الموظف لا يرى سجل التدقيق';
end $$;
reset role; select set_config('auth.user_id','', false);
