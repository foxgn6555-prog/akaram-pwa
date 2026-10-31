-- 00396: طلب الإجازة لا يُرفض بـ HR_NO_MANAGER — بلا سلسلة وبلا مدير قادر على البتّ يُحال إلى الموارد البشرية (من غرفة العمليات، الموظف، المدير).
set client_min_messages = warning;
insert into auth.users (id, email) values
  ('39600000-0000-0000-0000-0000000000a1', 'ops-396@t.iq'), ('39600000-0000-0000-0000-0000000000a2', 'hr-396@t.iq'), ('39600000-0000-0000-0000-0000000000a3', 'hr2-396@t.iq'),
  ('39600000-0000-0000-0000-0000000000a4', 'emp-396@t.iq'), ('39600000-0000-0000-0000-0000000000a5', 'grand-396@t.iq'), ('39600000-0000-0000-0000-0000000000a6', 'fin-396@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('39600000-0000-0000-0000-0000000000a1', 'ops_room'), ('39600000-0000-0000-0000-0000000000a2', 'hr_officer'), ('39600000-0000-0000-0000-0000000000a3', 'hr_officer'),
  ('39600000-0000-0000-0000-0000000000a4', 'employee'), ('39600000-0000-0000-0000-0000000000a5', 'department_manager'), ('39600000-0000-0000-0000-0000000000a6', 'finance_officer')
on conflict do nothing;
insert into public.departments (id, code, name, parent_id) values ('39600000-0000-0000-0000-0000000000d1', 'D396', 'قسم 396', null) on conflict (id) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id, biometric_pin) values
  ('39600000-0000-0000-0000-0000000000e1', null, 'E396-1', 'عامل بلا مدير 396', '2024-01-01', '39600000-0000-0000-0000-0000000000d1', null),
  ('39600000-0000-0000-0000-0000000000e2', '39600000-0000-0000-0000-0000000000a4', 'E396-2', 'موظف مديره بلا حساب 396', '2024-01-01', '39600000-0000-0000-0000-0000000000d1', 'p396'),
  ('39600000-0000-0000-0000-0000000000e3', null, 'E396-3', 'مدير بلا حساب 396', '2024-01-01', '39600000-0000-0000-0000-0000000000d1', null),
  ('39600000-0000-0000-0000-0000000000e4', '39600000-0000-0000-0000-0000000000a5', 'E396-4', 'المدير الأعلى 396', '2024-01-01', '39600000-0000-0000-0000-0000000000d1', 'p397'),
  ('39600000-0000-0000-0000-0000000000e5', null, 'E396-5', 'عامل مديره بلا حساب وبلا أعلى 396', '2024-01-01', '39600000-0000-0000-0000-0000000000d1', null),
  ('39600000-0000-0000-0000-0000000000e6', null, 'E396-6', 'مدير بلا حساب وبلا أعلى 396', '2024-01-01', '39600000-0000-0000-0000-0000000000d1', null)
on conflict (employee_number) do nothing;
update public.employees set manager_id = '39600000-0000-0000-0000-0000000000e3' where id = '39600000-0000-0000-0000-0000000000e2';
update public.employees set manager_id = '39600000-0000-0000-0000-0000000000e4' where id = '39600000-0000-0000-0000-0000000000e3';
update public.employees set manager_id = '39600000-0000-0000-0000-0000000000e6' where id = '39600000-0000-0000-0000-0000000000e5';
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;

-- ═══ F1 · غرفة العمليات: عامل بلا مدير وبلا سلسلة ⇒ يُقبل ويُحال إلى HR مع تبليغ كل موظفي HR، والتشخيص ok ═══
do $$ declare t uuid; lid uuid; d date := app.hr_local_date(now()) + 15; r record; j jsonb; n int; begin
  select id into t from public.hr_leave_types where code = 'unpaid';
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a1');
  assert app.hr_leave_manager_can_act('39600000-0000-0000-0000-0000000000e1') = false, 'no manager → cannot act';
  j := public.approval_diagnose('39600000-0000-0000-0000-0000000000e1', 'leave');
  assert (j ->> 'ok')::boolean and j ->> 'fallback' = 'hr_only' and j ->> 'reason' like '%يُحال إلى الموارد البشرية%', 'diag: ' || j::text;
  assert j ->> 'reason' not like '%HR_NO_MANAGER%' and j ->> 'reason' not like '%لا يُقبل%', 'no rejection wording: ' || (j ->> 'reason');
  lid := public.hr_leave_request('39600000-0000-0000-0000-0000000000e1', t, d, d);
  select * into r from public.hr_leaves where id = lid;
  assert r.status = 'pending' and r.requested_via = 'ops_room' and r.manager_id is null and r.chain_id is null and r.hr_fallback, 'row: ' || row_to_json(r)::text;
  assert r.hr_fallback_reason = 'لا سلسلة موافقات ولا مدير مباشر مسجّل في ملف الموظف', 'reason: ' || r.hr_fallback_reason;
  select count(*) into n from public.notifications x where x.user_id in ('39600000-0000-0000-0000-0000000000a2', '39600000-0000-0000-0000-0000000000a3')
    and x.title like 'طلب محال إلى الموارد البشرية%' and x.body like '%قُدِّم عبر غرفة العمليات%' and x.body like '%لا مدير مباشر%';
  assert n = 2, 'both HR officers notified: ' || n;
  -- القائمة تُظهر الإحالة؛ غرفة العمليات لا تبتّ؛ المالية لا ترى
  select * into r from public.hr_leaves_list('all') x where x.id = lid;
  assert r.hr_fallback and r.hr_fallback_reason is not null and not r.can_decide and r.can_cancel, 'ops list: ' || row_to_json(r)::text;
  begin perform public.hr_leave_decide(lid, true, null); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'ops cannot decide: ' || sqlerrm; end;
  perform set_config('test.f1', lid::text, false);
  raise warning 'F1 ✅ غرفة العمليات: بلا مدير ⇒ إحالة إلى HR + تبليغ + تشخيص ok';
end $$;

-- ═══ F2 · الموارد البشرية تراه (can_decide) وتعتمده ═══
do $$ declare lid uuid := current_setting('test.f1')::uuid; r record; begin
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a2');
  select * into r from public.hr_leaves_list('all') x where x.id = lid;
  assert r.can_decide, 'hr can decide: ' || row_to_json(r)::text;
  perform public.hr_leave_decide(lid, true, null);
  assert (select status from public.hr_leaves where id = lid) = 'approved', 'approved by HR';
  raise warning 'F2 ✅ الموارد البشرية تبتّ';
end $$;

-- ═══ F3 · الموظف نفسه: مديره بلا حساب لكن له مدير أعلى ⇒ يُقبل (كان HR_NO_MANAGER)، يُبلَّغ HR والمدير الأعلى، وكلاهما يستطيع البتّ ═══
do $$ declare t uuid; lid uuid; d date := app.hr_local_date(now()) + 20; r record; j jsonb; begin
  select id into t from public.hr_leave_types where code = 'annual';
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a4');
  assert app.hr_leave_manager_can_act('39600000-0000-0000-0000-0000000000e2'), 'grand manager with account can act';
  j := public.approval_diagnose('39600000-0000-0000-0000-0000000000e2', 'leave');
  assert (j ->> 'ok')::boolean and j ->> 'fallback' = 'hr_only', 'diag e2: ' || j::text;
  lid := public.hr_leave_request('39600000-0000-0000-0000-0000000000e2', t, d, d);
  select * into r from public.hr_leaves where id = lid;
  assert r.status = 'pending' and r.requested_via = 'self' and r.manager_id = '39600000-0000-0000-0000-0000000000e3' and not r.hr_fallback, 'self row (manager kept, grand decides): ' || row_to_json(r)::text;
  -- المدير الأعلى يبتّ بالنيابة (قاعدة 00144) والموارد البشرية أيضاً (00396)
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a5');
  assert app.hr_can_decide(lid), 'grand manager can decide';
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a2');
  assert app.hr_can_decide(lid), 'HR can decide when manager has no account';
  perform public.hr_leave_decide(lid, false, 'اختبار رفض من HR');
  assert (select status from public.hr_leaves where id = lid) = 'rejected', 'rejected by HR';
  raise warning 'F3 ✅ مدير بلا حساب ومدير أعلى: يُقبل، ويبتّ الأعلى أو HR';
end $$;

-- ═══ F4 · عامل مديره بلا حساب وبلا مدير أعلى: غرفة العمليات ⇒ إحالة إلى HR بسبب «بلا حساب دخول» ═══
do $$ declare t uuid; lid uuid; d date := app.hr_local_date(now()) + 25; r record; begin
  select id into t from public.hr_leave_types where code = 'unpaid';
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a1');
  assert app.hr_leave_manager_can_act('39600000-0000-0000-0000-0000000000e5') = false, 'manager without account and no grand → cannot act';
  lid := public.hr_leave_request('39600000-0000-0000-0000-0000000000e5', t, d, d);
  select * into r from public.hr_leaves where id = lid;
  assert r.hr_fallback and r.manager_id = '39600000-0000-0000-0000-0000000000e6' and r.hr_fallback_reason like '%بلا حساب دخول%', 'e5 row: ' || row_to_json(r)::text;
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a3');
  assert app.hr_can_decide(lid), 'second HR officer can decide';
  perform public.hr_leave_decide(lid, true, null);
  assert (select status from public.hr_leaves where id = lid) = 'approved', 'approved';
  raise warning 'F4 ✅ مدير بلا حساب وبلا أعلى ⇒ إحالة إلى HR';
end $$;

-- ═══ F5 · السلوك الاعتيادي لم يتغير: مدير له حساب ⇒ لا إحالة، المدير وحده يبتّ (HR لا) ═══
do $$ declare t uuid; lid uuid; d date := app.hr_local_date(now()) + 30; r record; begin
  update public.employees set manager_id = '39600000-0000-0000-0000-0000000000e4' where id = '39600000-0000-0000-0000-0000000000e1';
  select id into t from public.hr_leave_types where code = 'unpaid';
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a1');
  assert app.hr_leave_manager_can_act('39600000-0000-0000-0000-0000000000e1'), 'manager with account';
  lid := public.hr_leave_request('39600000-0000-0000-0000-0000000000e1', t, d, d);
  select * into r from public.hr_leaves where id = lid;
  assert not r.hr_fallback and r.hr_fallback_reason is null and r.manager_id = '39600000-0000-0000-0000-0000000000e4', 'normal row: ' || row_to_json(r)::text;
  assert exists (select 1 from public.notifications x where x.user_id = '39600000-0000-0000-0000-0000000000a5' and x.dedupe_key = 'leave_req:' || lid::text), 'manager notified';
  assert not exists (select 1 from public.notifications x where x.user_id = '39600000-0000-0000-0000-0000000000a2' and x.dedupe_key = 'leave_hr_fallback:' || lid::text), 'HR not notified for normal flow';
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a2');
  assert app.hr_can_decide(lid) = false, 'HR does not decide when manager can';
  perform pg_temp.as_user('39600000-0000-0000-0000-0000000000a5');
  assert app.hr_can_decide(lid), 'manager decides';
  raise warning 'F5 ✅ المسار الاعتيادي بلا تغيير';
end $$;
