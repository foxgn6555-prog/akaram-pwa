-- اختبار 00160: مسؤول القاطع (إسناد القواطع من IT، فريقي، اللوحة، التقارير، التبليغ) + سلاسل الموافقات القابلة للتخصيص
-- (خطوات حسب التسلسل/حساب محدد، تخطّي الخطوات الفارغة، لا موافقة ذاتية، الرفض يُنهي، الموافقة الأخيرة تنفّذ الإجازة). مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('d8000000-0000-0000-0000-000000000001', 'it-d@t.iq'),
  ('d8000000-0000-0000-0000-000000000002', 'cont-d@t.iq'),       -- متعهد (الكرادة/منطقة 1)
  ('d8000000-0000-0000-0000-000000000003', 'dm-d@t.iq'),         -- مسؤول قسم (مناطق 1,2 كرادة)
  ('d8000000-0000-0000-0000-000000000004', 'sm-d@t.iq'),         -- مسؤول قاطع الكرادة
  ('d8000000-0000-0000-0000-000000000005', 'sm-z@t.iq'),         -- مسؤول قاطع الزعفرانية
  ('d8000000-0000-0000-0000-000000000006', 'deputy-d@t.iq'),     -- حساب محدد في السلسلة
  ('d8000000-0000-0000-0000-000000000007', 'hr-d@t.iq'),
  ('d8000000-0000-0000-0000-000000000008', 'dm-z@t.iq')          -- مسؤول قسم زعفرانية (منطقة 5)
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d8000000-0000-0000-0000-000000000001', 'it_admin'),
  ('d8000000-0000-0000-0000-000000000002', 'employee'),
  ('d8000000-0000-0000-0000-000000000003', 'department_manager'),
  ('d8000000-0000-0000-0000-000000000004', 'admin_ops'),
  ('d8000000-0000-0000-0000-000000000005', 'admin_ops'),
  ('d8000000-0000-0000-0000-000000000006', 'deputy_director'),
  ('d8000000-0000-0000-0000-000000000007', 'hr_officer'),
  ('d8000000-0000-0000-0000-000000000008', 'department_manager')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values
  ('d8000000-0000-0000-0000-000000000003', 'morning', '{1,2}'), ('d8000000-0000-0000-0000-000000000008', 'evening', '{5}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone, biometric_pin) values
  ('d8000000-0000-0000-0000-0000000000e2', 'd8000000-0000-0000-0000-000000000002', 'SM-C1', 'متعهد الكرادة', '2024-01-01', '0771', 'p2'),
  ('d8000000-0000-0000-0000-0000000000e3', 'd8000000-0000-0000-0000-000000000003', 'SM-M1', 'مسؤول قسم الكرادة', '2024-01-01', '0772', 'p3'),
  ('d8000000-0000-0000-0000-0000000000e4', 'd8000000-0000-0000-0000-000000000004', 'SM-S1', 'مسؤول قاطع الكرادة', '2024-01-01', '0773', 'p4'),
  ('d8000000-0000-0000-0000-0000000000e6', 'd8000000-0000-0000-0000-000000000006', 'SM-D1', 'معاون المدير', '2024-01-01', null, 'p6')
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ S1 · إسناد القواطع لمسؤول القاطع من التطوير المركزية فقط ═══
do $$
declare it uuid := 'd8000000-0000-0000-0000-000000000001'; r record; n int;
begin
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error($q$ select * from public.sector_manager_me() $q$, 'SECTOR_MANAGER_NOT_ASSIGNED');
  perform pg_temp.expect_error($q$ select public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{karrada}') $q$, 'IT_FORBIDDEN');
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000003', '{karrada}') $q$, 'SECTOR_MANAGER_ROLE_REQUIRED');
  perform pg_temp.expect_error($q$ select public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{}') $q$, 'SECTOR_MANAGER_SECTORS_REQUIRED');
  perform pg_temp.expect_error($q$ select public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{mars}') $q$, 'check');
  perform public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{karrada}');
  perform public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000005', '{zaafaraniya}');
  select * into r from public.sector_manager_options() o where o.parent_sector = 'karrada';
  if r.name <> 'الكرادة' or jsonb_array_length(r.sector_managers) <> 1 then raise exception 'options wrong: %', r; end if;
  -- تعدد القواطع للحساب الواحد
  perform public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{zaafaraniya,karrada}');
  select * into r from public.sector_manager_profile_for_user('d8000000-0000-0000-0000-000000000004');
  if r.parent_sectors <> '{karrada,zaafaraniya}' or r.parent_names <> '{الكرادة,الزعفرانية}' then raise exception 'profile wrong: %', r; end if;
  perform public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{karrada}');
  -- إسناد متعهد لمسؤول القسم (منطقة 1)
  perform public.contractor_assign('d8000000-0000-0000-0000-000000000002', 'd8000000-0000-0000-0000-000000000003', 1::smallint);
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  select * into r from public.sector_manager_me();
  if r.parent_names <> '{الكرادة}' or r.department_managers <> 1 or r.contractors <> 1 or not r.has_employee then raise exception 'me wrong: %', r; end if;
  select count(*) into n from public.sector_manager_team();
  if n <> 1 then raise exception 'team should have 1 dept manager, got %', n; end if;
  select * into r from public.sector_manager_team();
  if r.manager_name <> 'مسؤول قسم الكرادة' or r.contractors <> 1 or jsonb_array_length(r.areas) <> 2 or r.parent_sector <> 'karrada' then raise exception 'team row wrong: %', r; end if;
  -- مسؤول الزعفرانية لا يرى مسؤول قسم الكرادة
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000005');
  select count(*) into n from public.sector_manager_team() t where t.manager_user_id = 'd8000000-0000-0000-0000-000000000003';
  if n <> 0 then raise exception 'zaafaraniya manager should not see karrada dept manager'; end if;
  raise notice 'S1 ✅ إسناد القواطع (متعددة) من IT فقط + me/team + عزل بين القواطع';
end $$;

-- ═══ S2 · سلاسل الموافقات: ضبط من IT فقط + تحقق الخطوات ═══
do $$
declare it uuid := 'd8000000-0000-0000-0000-000000000001'; r record; n int;
begin
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000007');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"department_manager"}]') $q$, 'IT_FORBIDDEN');
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[]') $q$, 'APPROVAL_STEPS_REQUIRED');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"media"}]') $q$, 'APPROVAL_STEP_ROLE_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"account","user_id":"00000000-0000-0000-0000-000000000000"}]') $q$, 'APPROVAL_STEP_ACCOUNT_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'bonus', '[{"kind":"hierarchy","role":"admin_ops"}]') $q$, 'APPROVAL_TYPE_INVALID');
  -- متعهد/إجازة: مسؤول قسمه → مسؤول قاطعه → العمليات الميدانية (لا أحد بعد → تُخطّى) → معاون المدير (حساب محدد)
  perform public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"department_manager"},{"kind":"hierarchy","role":"admin_ops"},{"kind":"hierarchy","role":"field_ops"},{"kind":"account","user_id":"d8000000-0000-0000-0000-000000000006"}]');
  -- مسؤول قسم/إجازة: مباشرة معاون المدير
  perform public.approval_chain_save('department_manager', 'leave', '[{"kind":"account","user_id":"d8000000-0000-0000-0000-000000000006"}]');
  select count(*) into n from public.approval_chains_list();
  if n <> 2 then raise exception 'chains list should have 2, got %', n; end if;
  select * into r from public.approval_chains_list() c where c.requester_role = 'employee';
  if r.requester_label <> 'متعهد' or jsonb_array_length(r.steps) <> 4 or (r.steps -> 3 ->> 'label') <> 'معاون المدير' or (r.steps -> 1 ->> 'label') <> 'مسؤول قاطع (حسب التسلسل)' then raise exception 'chain row wrong: %', r; end if;
  raise notice 'S2 ✅ ضبط السلاسل من IT فقط + تحقق الخطوات + تسميات';
end $$;

-- ═══ S3 · طلب متعهد يمر بالسلسلة: قسم → قاطع → (ميدانية تُخطّى) → معاون ═══
do $$
declare lid uuid; t_annual uuid; r record; n int; tl record;
begin
  select id into t_annual from public.hr_leave_types where code = 'annual';
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  -- لا مدير مباشر في HR لكن توجد سلسلة → يُقبل الطلب
  lid := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e2', t_annual, current_date + 10, current_date + 11);
  select count(*) into n from public.approval_tasks where request_id = lid;
  if n <> 4 then raise exception 'should create 4 tasks, got %', n; end if;
  select status into r from public.approval_tasks where request_id = lid and step_no = 3;
  if r.status <> 'skipped' then raise exception 'field_ops step should be skipped'; end if;
  select status into r from public.approval_tasks where request_id = lid and step_no = 1;
  if r.status <> 'pending' then raise exception 'step 1 should be pending'; end if;
  -- إشعار لمسؤول القسم فقط
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000003' and dedupe_key like 'approval:%';
  if n <> 1 then raise exception 'dept manager should be notified once, got %', n; end if;
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000004' and dedupe_key like 'approval:%';
  if n <> 0 then raise exception 'sector manager must not be notified yet'; end if;
  -- مسؤول القاطع لا يستطيع البتّ قبل دوره
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  select count(*) into n from public.approval_my_tasks();
  if n <> 0 then raise exception 'sector manager has no task yet'; end if;
  perform pg_temp.expect_error(format($q$ select public.hr_leave_decide('%s', true) $q$, lid), 'HR_FORBIDDEN');
  -- مسؤول القسم يوافق → الطلب يبقى معلّقاً وينتقل لمسؤول القاطع
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  select * into r from public.approval_my_tasks();
  if r.requester_name <> 'متعهد الكرادة' or r.step_no <> 1 or r.total_steps <> 3 or r.requester_role_label <> 'متعهد' then raise exception 'task wrong: %', r; end if;
  perform public.hr_leave_decide(lid, true, 'موافق');
  select status into r from public.hr_leaves where id = lid;
  if r.status <> 'pending' then raise exception 'leave must stay pending after step 1'; end if;
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000004' and dedupe_key like 'approval:%';
  if n <> 1 then raise exception 'sector manager should now be notified'; end if;
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  select * into r from public.approval_my_tasks();
  if r.step_no <> 2 or jsonb_array_length(r.previous_steps) <> 1 or (r.previous_steps -> 0 ->> 'status') <> 'approved' then raise exception 'sector task wrong: %', r; end if;
  select count(*) into n from public.hr_leaves_list('team') where id = lid and can_decide;
  if n <> 1 then raise exception 'leaves_list team should show decidable row for sector manager'; end if;
  perform public.hr_leave_decide(lid, true);
  select status into r from public.hr_leaves where id = lid;
  if r.status <> 'pending' then raise exception 'leave must stay pending before deputy'; end if;
  -- معاون المدير (حساب محدد) → الموافقة النهائية تنفّذ الإجازة
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000006');
  perform public.hr_leave_decide(lid, true, 'نهائي');
  select status, approved_by into r from public.hr_leaves where id = lid;
  if r.status <> 'approved' or r.approved_by <> 'd8000000-0000-0000-0000-000000000006' then raise exception 'leave should be approved by deputy: %', r; end if;
  select count(*) into n from public.hr_leave_ledger where leave_id = lid and kind = 'consume';
  if n <> 1 then raise exception 'balance should be consumed once'; end if;
  -- المسار مرئي للطالب
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  select count(*) into n from public.approval_timeline('leave', lid) where status = 'approved';
  if n <> 3 then raise exception 'timeline should show 3 approved steps, got %', n; end if;
  select * into tl from public.approval_timeline('leave', lid) where step_no = 3;
  if tl.status <> 'skipped' then raise exception 'timeline step 3 should be skipped'; end if;
  -- غريب لا يرى المسار
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000008');
  perform pg_temp.expect_error(format($q$ select * from public.approval_timeline('leave', '%s') $q$, lid), 'HR_FORBIDDEN');
  raise notice 'S3 ✅ السلسلة خطوة بخطوة: إشعار كل خطوة في وقتها، لا بتّ قبل الدور، تخطّي الفارغ، التنفيذ عند الأخيرة';
end $$;

-- ═══ S4 · الرفض في أي خطوة يُنهي الطلب + لا موافقة ذاتية + بلا سلسلة يبقى المدير المباشر ═══
do $$
declare lid uuid; t_annual uuid; r record; n int;
begin
  select id into t_annual from public.hr_leave_types where code = 'annual';
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  lid := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e2', t_annual, current_date + 20, current_date + 20);
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error(format($q$ select public.hr_leave_decide('%s', false) $q$, lid), 'HR_REASON_REQUIRED');
  perform public.hr_leave_decide(lid, false, 'ضغط عمل');
  select status into r from public.hr_leaves where id = lid;
  if r.status <> 'rejected' then raise exception 'should be rejected'; end if;
  select count(*) into n from public.approval_tasks where request_id = lid and status = 'waiting';
  if n <> 0 then raise exception 'no waiting tasks after rejection'; end if;
  -- مسؤول القسم يطلب إجازة: سلسلته = معاون المدير مباشرة (ولا يوافق على نفسه)
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  lid := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e3', t_annual, current_date + 30, current_date + 30);
  select approvers into r from public.approval_tasks where request_id = lid and step_no = 1;
  if r.approvers <> array['d8000000-0000-0000-0000-000000000006']::uuid[] then raise exception 'dept manager chain wrong: %', r; end if;
  perform pg_temp.expect_error(format($q$ select public.hr_leave_decide('%s', true) $q$, lid), 'HR_FORBIDDEN');
  -- سلسلة كل خطواتها تُحلّ إلى الطالب نفسه فقط → خطأ واضح
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000001');
  perform public.approval_chain_save('deputy_director', 'leave', '[{"kind":"account","user_id":"d8000000-0000-0000-0000-000000000006"}]');
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000006');
  perform pg_temp.expect_error(format($q$ select public.hr_leave_request('d8000000-0000-0000-0000-0000000000e6', '%s', current_date + 40, current_date + 40) $q$, t_annual), 'APPROVAL_NO_APPROVER');
  -- مسؤول القاطع بلا سلسلة وبلا مدير مباشر → HR_NO_MANAGER (السلوك القديم محفوظ)
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error(format($q$ select public.hr_leave_request('d8000000-0000-0000-0000-0000000000e4', '%s', current_date + 40, current_date + 40) $q$, t_annual), 'HR_NO_MANAGER');
  -- تعطيل السلسلة يعيد المتعهد إلى قاعدة المدير المباشر
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000001');
  perform public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"department_manager"}]', false);
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format($q$ select public.hr_leave_request('d8000000-0000-0000-0000-0000000000e2', '%s', current_date + 50, current_date + 50) $q$, t_annual), 'HR_NO_MANAGER');
  raise notice 'S4 ✅ الرفض يُنهي، لا موافقة ذاتية، APPROVAL_NO_APPROVER، وبلا سلسلة يبقى المدير المباشر';
end $$;

-- ═══ S5 · اللوحة والتقارير والتبليغ (بلا بيانات مالية) ═══
do $$
declare r record; j jsonb; n int; wid uuid;
begin
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  wid := (public.contractor_add_worker('عامل 1')).id;
  perform public.contractor_add_worker('عامل 2');
  perform public.contractor_checkin(33.31, 44.42, 8, 'c/s.jpg', 'c/t.jpg');
  perform public.contractor_mark_attendance(wid, 'present');
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  j := public.sector_manager_dashboard();
  if (j ->> 'department_managers')::int <> 1 or (j ->> 'contractors')::int <> 1 or (j ->> 'workers')::int <> 2 or (j ->> 'present_today')::int <> 1 or (j ->> 'presence_proved')::int <> 1 then raise exception 'dashboard wrong: %', j; end if;
  if j ? 'salary' or j ? 'wages' or j::text ilike '%wage%' or j::text ilike '%salary%' then raise exception 'dashboard must not contain finance data'; end if;
  j := public.sector_manager_reports(current_date - 6, current_date);
  if (j -> 'totals' ->> 'present')::int <> 1 or jsonb_array_length(j -> 'series') <> 7 or jsonb_array_length(j -> 'contractors') <> 1 or jsonb_array_length(j -> 'managers') <> 1 then raise exception 'reports wrong: %', j; end if;
  if (j -> 'contractors' -> 0 ->> 'name') <> 'متعهد الكرادة' or (j -> 'contractors' -> 0 ->> 'proof_days')::int <> 1 or (j -> 'managers' -> 0 ->> 'name') <> 'مسؤول قسم الكرادة' then raise exception 'report rows wrong: %', j; end if;
  if j::text ilike '%wage%' or j::text ilike '%salary%' or j::text ilike '%amount%' then raise exception 'reports must not contain finance data'; end if;
  perform pg_temp.expect_error($q$ select public.sector_manager_reports(current_date, current_date - 1) $q$, 'HR_DATE_INVALID');
  -- التبليغ: مسؤولو أقسامي فقط
  select count(*) into n from public.sector_manager_notify_targets();
  if n <> 1 then raise exception 'targets should be 1, got %', n; end if;
  perform pg_temp.expect_error($q$ select public.sector_manager_notify('x', 'y') $q$, 'NOTICE_TITLE_REQUIRED');
  perform pg_temp.expect_error($q$ select public.sector_manager_notify('اجتماع', 'غداً الساعة 9', '{d8000000-0000-0000-0000-000000000008}') $q$, 'NOTICE_TARGET_FORBIDDEN');
  n := public.sector_manager_notify('اجتماع طارئ', 'غداً الساعة 9 صباحاً في المقر');
  if n <> 1 then raise exception 'should notify 1, got %', n; end if;
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000003' and title like 'تبليغ من مسؤول القاطع:%';
  if n <> 1 then raise exception 'dept manager should receive notice'; end if;
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000008' and title like 'تبليغ من مسؤول القاطع:%';
  if n <> 0 then raise exception 'other sector dept manager must not receive notice'; end if;
  select * into r from public.sector_manager_notices();
  if r.title <> 'اجتماع طارئ' or r.recipients_count <> 1 or r.recipient_names <> 'مسؤول قسم الكرادة' then raise exception 'notices wrong: %', r; end if;
  -- مسؤول قسم لا يصل لدوال مسؤول القاطع
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error($q$ select public.sector_manager_dashboard() $q$, 'PARENT_SECTOR_MANAGER_FORBIDDEN');
  raise notice 'S5 ✅ اللوحة والتقارير بلا بيانات مالية + التبليغ لمسؤولي أقسامه فقط';
end $$;
