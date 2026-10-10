-- 00197 · طلب إجازة/زمنية بأثر رجعي: شروط (مفعّل/مهلة/سبب/قفل الشهر) · شفافية في سلسلة الموافقات · تصحيح الحضور عند الموافقة · تنبيه HR عند التكرار (بادئة bk)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00202: هذا الاختبار يفترض النموذج القديم (الغياب = يوم استقطاع مقترح)؛ في نموذج «الأيام المستحقة» الافتراضي الغياب يوم غير مدفوع بلا استقطاع (payroll-earned-days-test S7)
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('d3000000-0000-0000-0000-000000000001', 'bk-ops@t.iq'), ('d3000000-0000-0000-0000-000000000004', 'bk-adm@t.iq'), ('d3000000-0000-0000-0000-000000000008', 'bk-it@t.iq'),
  ('d3000000-0000-0000-0000-000000000009', 'bk-hr@t.iq'), ('d3000000-0000-0000-0000-00000000000a', 'bk-emp@t.iq'), ('d3000000-0000-0000-0000-00000000000b', 'bk-mgr@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d3000000-0000-0000-0000-000000000001', 'ops_room'), ('d3000000-0000-0000-0000-000000000004', 'super_admin'), ('d3000000-0000-0000-0000-000000000008', 'it_admin'),
  ('d3000000-0000-0000-0000-000000000009', 'hr_officer'), ('d3000000-0000-0000-0000-00000000000a', 'employee'), ('d3000000-0000-0000-0000-00000000000b', 'employee')
on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin) values
  ('d3000000-0000-0000-0000-0000000000eb', 'd3000000-0000-0000-0000-00000000000b', 'bk المدير', 'BK-M', '2024-01-01', '8702') on conflict (id) do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin, manager_id) values
  ('d3000000-0000-0000-0000-0000000000ea', 'd3000000-0000-0000-0000-00000000000a', 'bk الموظف', 'BK-E', '2024-01-01', '8701', 'd3000000-0000-0000-0000-0000000000eb') on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('d3000000-0000-0000-0000-0000000000a1', 'bk شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('d3000000-0000-0000-0000-0000000000ea', 'd3000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
-- يوم «أمس» و«قبل 3 أيام» بلا بصمة ⇒ غائب بعد الاحتساب؛ قبل 3 أيام: بصم 08:00 وخرج 12:00 (خروج مبكر 4 ساعات)
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values ('d3000000-0000-0000-0000-0000000000d1', 'BK-DEV-1', 'bk جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select set_config('test.bk_today', app.hr_local_date(now())::text, false);
select public.biometric_ingest('BK-DEV-1', '8701' || E'\t' || (current_setting('test.bk_today')::date - 3)::text || ' 08:00:00' || E'\t0\n' || '8701' || E'\t' || (current_setting('test.bk_today')::date - 3)::text || ' 12:00:00' || E'\t1', 'ATTLOG');
select app.hr_evaluate_day('d3000000-0000-0000-0000-0000000000ea', current_setting('test.bk_today')::date - 1);
select app.hr_evaluate_day('d3000000-0000-0000-0000-0000000000ea', current_setting('test.bk_today')::date - 2);
select app.hr_evaluate_day('d3000000-0000-0000-0000-0000000000ea', current_setting('test.bk_today')::date - 10);

-- ═══ S1 · الافتراضيات من التطوير المركزية + التحقق ═══
select auth.set_test_user('d3000000-0000-0000-0000-000000000008');
do $$ declare ok boolean; p jsonb; begin
  p := app.hr_policy();
  assert (p ->> 'backdated_requests_enabled')::boolean and (p ->> 'backdated_max_days')::int = 7 and (p ->> 'backdated_alert_per_month')::int = 3, 'S1 defaults: ' || p::text;
  ok := false; begin perform public.hr_policy_set('{"backdated_max_days": 400}'); exception when others then ok := sqlerrm like '%HR_POLICY_INVALID%'; end; assert ok, 'S1 max days validated';
  ok := false; begin perform public.hr_policy_set('{"backdated_alert_per_month": 0}'); exception when others then ok := sqlerrm like '%HR_POLICY_INVALID%'; end; assert ok, 'S1 alert validated';
  perform public.hr_policy_set('{"backdated_max_days": 7, "backdated_alert_per_month": 2, "permit_max_minutes": 300}');
  raise notice 'S1 ✅ الإعدادات من التطوير المركزية';
end $$;

-- ═══ S2 · الموظف: بلا سبب ⇒ مرفوض؛ أقدم من المهلة ⇒ مرفوض؛ مع سبب ضمن المهلة ⇒ يُقبل ويُعلَّم بأثر رجعي مع الحالة السابقة «غائب» ═══
select auth.set_test_user('d3000000-0000-0000-0000-00000000000a');
do $$ declare today date := current_setting('test.bk_today')::date; t uuid; ok boolean; lid uuid; l record; a record; begin
  select id into t from public.hr_leave_types where code = 'annual';
  select * into a from public.hr_attendance_days where employee_id = 'd3000000-0000-0000-0000-0000000000ea' and work_date = today - 1;
  assert a.status = 'absent' and a.proposed_deduction_days = 1, 'S2 yesterday absent before request: ' || coalesce(row_to_json(a)::text, 'null');
  ok := false; begin perform public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today - 1, today - 1); exception when others then ok := sqlerrm like '%HR_BACKDATED_REASON_REQUIRED%'; end; assert ok, 'S2 reason required';
  ok := false; begin perform public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today - 1, today - 1, null, null, null, null, 'نع'); exception when others then ok := sqlerrm like '%HR_BACKDATED_REASON_REQUIRED%'; end; assert ok, 'S2 reason too short';
  ok := false; begin perform public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today - 10, today - 10, null, null, null, null, 'أبلغت المسؤول شفهياً'); exception when others then ok := sqlerrm like '%HR_BACKDATED_TOO_OLD%'; end; assert ok, 'S2 older than 7 days rejected for employee';
  lid := public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today - 1, today - 1, null, null, 'إجازة اعتيادية', null, 'أبلغت مديري شفهياً يوم أمس ووافق، ونسيت تسجيل الطلب');
  select * into l from public.hr_leaves where id = lid;
  assert l.is_backdated and l.backdated_days = 1 and l.backdated_prior_status = 'absent' and l.backdated_reason like 'أبلغت مديري%' and l.status = 'pending', 'S2 flagged: ' || row_to_json(l)::text;
  -- طلب مستقبلي عادي لا يُعلَّم حتى لو أُرسل سبب
  lid := public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today + 5, today + 5, null, null, null, null, 'سبب لا حاجة له');
  select * into l from public.hr_leaves where id = lid;
  assert not l.is_backdated and l.backdated_reason is null and l.backdated_days = 0, 'S2 future not flagged: ' || row_to_json(l)::text;
  raise notice 'S2 ✅ شروط الطلب بأثر رجعي';
end $$;

-- ═══ S3 · المدير يرى في مهامه شارة «بأثر رجعي» + السبب + الحالة السابقة + العدّاد؛ إشعاره يحمل التحذير ═══
select auth.set_test_user('d3000000-0000-0000-0000-00000000000b');
do $$ declare r record; n int; begin
  select * into r from public.approval_my_tasks() x where x.requester_user_id = 'd3000000-0000-0000-0000-00000000000a' and x.start_date = current_setting('test.bk_today')::date - 1;
  assert r.task_id is null, 'S3 no chain configured ⇒ manager path (no approval task)';
  select count(*) into n from public.notifications where user_id = 'd3000000-0000-0000-0000-00000000000b' and title like '⚠ طلب بأثر رجعي%' and body like '%قبل 1 يوم%' and body like '%أبلغت مديري%';
  assert n = 1, 'S3 manager notification flagged: ' || n;
  -- قائمة الفريق تُظهر الأعمدة الجديدة
  select * into r from public.hr_leaves_list('team') x where x.start_date = current_setting('test.bk_today')::date - 1;
  assert r.is_backdated and r.backdated_days = 1 and r.backdated_reason like 'أبلغت%', 'S3 list columns: ' || row_to_json(r)::text;
  raise notice 'S3 ✅ المدير يرى التحذير والسبب';
end $$;

-- ═══ S4 · سلسلة موافقات مُعدّة ⇒ approval_my_tasks.details يحمل backdated/reason/prior_status/month_count ═══
select auth.set_test_user('d3000000-0000-0000-0000-000000000008');
do $$ begin
  perform public.approval_chain_save('employee', 'time_permit', '[{"kind":"account","user_id":"d3000000-0000-0000-0000-00000000000b","label":"المدير"},{"kind":"account","user_id":"d3000000-0000-0000-0000-000000000009","label":"HR"}]'::jsonb, true);
end $$;
select auth.set_test_user('d3000000-0000-0000-0000-00000000000a');
do $$ declare today date := current_setting('test.bk_today')::date; t uuid; lid uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_paid';
  lid := public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today - 3, today - 3, '12:00', '16:00', null, null, 'خرجت بإذن المدير لمراجعة المستشفى ولم أسجّل الزمنية');
  perform set_config('test.bk_permit', lid::text, false);
end $$;
select auth.set_test_user('d3000000-0000-0000-0000-00000000000b');
do $$ declare r record; d jsonb; n int; begin
  select * into r from public.approval_my_tasks() x where x.request_id = current_setting('test.bk_permit')::uuid;
  d := r.details;
  assert (d ->> 'backdated')::boolean and (d ->> 'days_late')::int = 3 and d ->> 'prior_status' = 'early_leave' and d ->> 'reason' like 'خرجت بإذن%' and (d ->> 'month_count')::int = 2 and (d ->> 'alert_threshold')::int = 2,
    'S4 task details: ' || coalesce(d::text, 'null');
  -- بلغ الحد (2) ⇒ HR نُبّهت
  select count(*) into n from public.notifications where user_id = 'd3000000-0000-0000-0000-000000000009' and title like 'تكرار طلبات بأثر رجعي%';
  assert n = 1, 'S4 HR alert on repeat: ' || n;
  raise notice 'S4 ✅ سلسلة الموافقات تعرض التفاصيل وتنبّه HR عند التكرار';
end $$;

-- ═══ S5 · الموافقة النهائية تصحّح الحضور: «غائب» ⇒ «إجازة» بلا استقطاع؛ «خروج مبكر» ⇒ «حاضر (زمنية)» بلا استقطاع؛ وتُبلَّغ غرفة العمليات ═══
select auth.set_test_user('d3000000-0000-0000-0000-00000000000b');
do $$ declare today date := current_setting('test.bk_today')::date; lid uuid; a record; n int; begin
  select id into lid from public.hr_leaves where employee_id = 'd3000000-0000-0000-0000-0000000000ea' and start_date = today - 1 and status = 'pending';
  perform public.hr_leave_decide(lid, true, 'أؤكد أنه أبلغني');
  select * into a from public.hr_attendance_days where employee_id = 'd3000000-0000-0000-0000-0000000000ea' and work_date = today - 1;
  assert a.status = 'leave' and a.proposed_deduction_days = 0 and a.proposed_deduction_minutes = 0 and a.deduction_reason is null, 'S5 absent ⇒ leave, no deduction: ' || row_to_json(a)::text;
  select count(*) into n from public.notifications where user_id = 'd3000000-0000-0000-0000-000000000001' and title like 'تصحيح حضور بأثر رجعي%';
  assert n = 1, 'S5 ops notified: ' || n;
  select count(*) into n from public.notifications where user_id = 'd3000000-0000-0000-0000-00000000000a' and title like 'تمت الموافقة%(بأثر رجعي)' and body like '%صُحِّح سجل حضورك%';
  assert n = 1, 'S5 employee notified: ' || n;
  -- الزمنية: خطوة المدير ثم HR
  perform public.hr_leave_decide(current_setting('test.bk_permit')::uuid, true, null);
end $$;
select auth.set_test_user('d3000000-0000-0000-0000-000000000009');
do $$ declare today date := current_setting('test.bk_today')::date; a record; begin
  select * into a from public.hr_attendance_days where employee_id = 'd3000000-0000-0000-0000-0000000000ea' and work_date = today - 3;
  assert a.status = 'early_leave' and a.proposed_deduction_minutes + a.proposed_deduction_days > 0, 'S5 still early_leave before final approval: ' || row_to_json(a)::text;
  perform public.hr_leave_decide(current_setting('test.bk_permit')::uuid, true, null);
  select * into a from public.hr_attendance_days where employee_id = 'd3000000-0000-0000-0000-0000000000ea' and work_date = today - 3;
  assert a.status = 'time_permit' and a.shortfall_minutes = 0 and a.proposed_deduction_minutes = 0 and a.proposed_deduction_days = 0, 'S5 early_leave ⇒ time_permit, no deduction: ' || row_to_json(a)::text;
  raise notice 'S5 ✅ الموافقة تصحّح الحضور وتلغي الاستقطاع';
end $$;

-- ═══ S6 · HR بلا مهلة لكن بسبب؛ الإيقاف الكلي من التطوير المركزية يمنع الجميع ═══
select auth.set_test_user('d3000000-0000-0000-0000-000000000009');
do $$ declare today date := current_setting('test.bk_today')::date; t uuid; lid uuid; l record; begin
  select id into t from public.hr_leave_types where code = 'official';
  lid := public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today - 10, today - 10, null, null, null, null, 'إيفاد رسمي موثّق بكتاب متأخر الوصول');
  select * into l from public.hr_leaves where id = lid;
  assert l.is_backdated and l.backdated_days = 10 and l.backdated_prior_status = 'absent', 'S6 HR beyond max days: ' || row_to_json(l)::text;
end $$;
select auth.set_test_user('d3000000-0000-0000-0000-000000000008');
select public.hr_policy_set('{"backdated_requests_enabled": false}');
select auth.set_test_user('d3000000-0000-0000-0000-000000000009');
do $$ declare today date := current_setting('test.bk_today')::date; t uuid; ok boolean := false; begin
  select id into t from public.hr_leave_types where code = 'annual';
  begin perform public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today - 2, today - 2, null, null, null, null, 'سبب كافٍ وطويل'); exception when others then ok := sqlerrm like '%HR_BACKDATED_DISABLED%'; end;
  assert ok, 'S6 disabled blocks everyone';
  -- المستقبل يبقى مسموحاً
  perform public.hr_leave_request('d3000000-0000-0000-0000-0000000000ea', t, today + 20, today + 20);
  raise notice 'S6 ✅ HR بلا مهلة؛ الإيقاف الكلي يعمل';
end $$;
