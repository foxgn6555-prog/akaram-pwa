-- اختبار 00161: بوابة العمليات الميدانية — نطاق كل القواطع، تعلو مسؤولي القواطع، خطوة «العمليات الميدانية» في السلسلة تُنفَّذ (لا تُخطّى)،
-- التبليغ لمسؤولي القواطع ومسؤولي الأقسام، ولا أي بيانات مالية. مستقل (بادئة d9، مناطق 3 و6).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('d9000000-0000-0000-0000-000000000001', 'it-f@t.iq'),
  ('d9000000-0000-0000-0000-000000000002', 'cont-f@t.iq'),      -- متعهد (الكرادة/منطقة 3)
  ('d9000000-0000-0000-0000-000000000003', 'dm-f@t.iq'),        -- مسؤول قسم (منطقة 3)
  ('d9000000-0000-0000-0000-000000000004', 'sm-f@t.iq'),        -- مسؤول قاطع الكرادة
  ('d9000000-0000-0000-0000-000000000005', 'fo-f@t.iq'),        -- العمليات الميدانية
  ('d9000000-0000-0000-0000-000000000006', 'dm-fz@t.iq'),       -- مسؤول قسم زعفرانية (منطقة 6)
  ('d9000000-0000-0000-0000-000000000007', 'smz-f@t.iq')        -- مسؤول قاطع الزعفرانية
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d9000000-0000-0000-0000-000000000001', 'it_admin'), ('d9000000-0000-0000-0000-000000000002', 'employee'), ('d9000000-0000-0000-0000-000000000003', 'department_manager'),
  ('d9000000-0000-0000-0000-000000000004', 'admin_ops'), ('d9000000-0000-0000-0000-000000000005', 'field_ops'), ('d9000000-0000-0000-0000-000000000006', 'department_manager'),
  ('d9000000-0000-0000-0000-000000000007', 'admin_ops')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values
  ('d9000000-0000-0000-0000-000000000003', 'morning', '{3}'), ('d9000000-0000-0000-0000-000000000006', 'evening', '{6}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone, biometric_pin) values
  ('d9000000-0000-0000-0000-0000000000e2', 'd9000000-0000-0000-0000-000000000002', 'FO-C1', 'متعهد المنطقة 3', '2024-01-01', '0771', 'f2'),
  ('d9000000-0000-0000-0000-0000000000e3', 'd9000000-0000-0000-0000-000000000003', 'FO-M1', 'مسؤول قسم 3', '2024-01-01', '0772', 'f3'),
  ('d9000000-0000-0000-0000-0000000000e4', 'd9000000-0000-0000-0000-000000000004', 'FO-S1', 'مسؤول قاطع الكرادة', '2024-01-01', '0773', 'f4'),
  ('d9000000-0000-0000-0000-0000000000e5', 'd9000000-0000-0000-0000-000000000005', 'FO-F1', 'العمليات الميدانية', '2024-01-01', '0775', 'f5'),
  ('d9000000-0000-0000-0000-0000000000e7', 'd9000000-0000-0000-0000-000000000007', 'FO-S2', 'مسؤول قاطع الزعفرانية', '2024-01-01', '0777', 'f7')
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ F1 · النطاق: العمليات الميدانية ترى كل القواطع بلا إسناد؛ مسؤول القاطع قاطعه فقط؛ غيرهما ممنوع ═══
do $$
declare j jsonb; r record; n int; wid uuid;
begin
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000001');
  perform public.sector_manager_profile_save('d9000000-0000-0000-0000-000000000004', '{karrada}');
  perform public.sector_manager_profile_save('d9000000-0000-0000-0000-000000000007', '{zaafaraniya}');
  perform public.contractor_assign('d9000000-0000-0000-0000-000000000002', 'd9000000-0000-0000-0000-000000000003', 3::smallint);
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000002');
  wid := (public.contractor_add_worker('عامل ف1')).id;
  perform public.contractor_checkin(33.31, 44.42, 8, 'f/s.jpg', 'f/t.jpg');
  perform public.contractor_mark_attendance(wid, 'present');

  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000005');
  select * into r from public.sector_manager_me();
  if r.parent_sectors <> '{karrada,zaafaraniya}' or r.full_name <> 'العمليات الميدانية' or not r.has_employee then raise exception 'field ops me wrong: %', r; end if;
  j := public.sector_manager_dashboard();
  if not (j ->> 'is_field_ops')::boolean or jsonb_array_length(j -> 'parents_detail') <> 2 or jsonb_array_length(j -> 'sector_managers') < 2 then raise exception 'field ops dashboard wrong: %', j; end if;
  if (j -> 'parents_detail' -> 0 ->> 'code') <> 'karrada' or (j -> 'parents_detail' -> 0 ->> 'presence_proved')::int < 1 or (j -> 'parents_detail' -> 0 ->> 'sector_managers') not like '%مسؤول قاطع الكرادة%' then raise exception 'parents_detail wrong: %', j -> 'parents_detail'; end if;
  if j::text ilike '%wage%' or j::text ilike '%salary%' or j::text ilike '%amount%' or j::text ilike '%iqd%' then raise exception 'field ops dashboard must not contain finance data'; end if;
  -- فريقي: مسؤولو الأقسام من القاطعين معاً
  select count(*) into n from public.sector_manager_team() t where t.manager_user_id in ('d9000000-0000-0000-0000-000000000003', 'd9000000-0000-0000-0000-000000000006');
  if n <> 2 then raise exception 'field ops team should include both dept managers, got %', n; end if;
  -- مسؤولو القواطع
  select * into r from public.field_ops_sector_managers() s where s.user_id = 'd9000000-0000-0000-0000-000000000004';
  if r.parent_names <> '{الكرادة}' or r.present_today < 1 or r.department_managers < 1 or not r.has_employee then raise exception 'sector managers list wrong: %', r; end if;
  j := public.sector_manager_reports(current_date - 6, current_date);
  if (j -> 'totals' ->> 'present')::int < 1 or j::text ilike '%wage%' or j::text ilike '%salary%' then raise exception 'field ops reports wrong/finance: %', j -> 'totals'; end if;

  -- مسؤول القاطع: قاطعه فقط (لا is_field_ops، parents_detail واحد)
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000004');
  j := public.sector_manager_dashboard();
  if (j ->> 'is_field_ops')::boolean or jsonb_array_length(j -> 'parents_detail') <> 1 then raise exception 'sector manager scope leaked: %', j; end if;
  select count(*) into n from public.sector_manager_team() t where t.manager_user_id = 'd9000000-0000-0000-0000-000000000006';
  if n <> 0 then raise exception 'sector manager must not see other sector managers team'; end if;
  perform pg_temp.expect_error($q$ select * from public.field_ops_sector_managers() $q$, 'FIELD_OPS_FORBIDDEN');
  -- مسؤول قسم ممنوع
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error($q$ select public.sector_manager_dashboard() $q$, 'PARENT_SECTOR_MANAGER_FORBIDDEN');
  raise notice 'F1 ✅ النطاق: الميدانية كل القواطع، مسؤول القاطع قاطعه، الباقي ممنوع، ولا بيانات مالية';
end $$;

-- ═══ F2 · التبليغ: الميدانية → مسؤولو القواطع + مسؤولو الأقسام (كلهم)؛ مسؤول القاطع → مسؤولو أقسامه فقط ═══
do $$
declare n int; r record;
begin
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000005');
  select count(*) into n from public.sector_manager_notify_targets() t where t.role = 'admin_ops' and t.user_id in ('d9000000-0000-0000-0000-000000000004', 'd9000000-0000-0000-0000-000000000007');
  if n <> 2 then raise exception 'field ops targets must include both sector managers, got %', n; end if;
  select * into r from public.sector_manager_notify_targets() t where t.user_id = 'd9000000-0000-0000-0000-000000000004';
  if r.areas <> 'الكرادة' then raise exception 'sector manager target label wrong: %', r; end if;
  n := public.sector_manager_notify('توجيه عام', 'تشديد الحضور الصباحي', array['d9000000-0000-0000-0000-000000000004', 'd9000000-0000-0000-0000-000000000006']::uuid[]);
  if n <> 2 then raise exception 'should notify 2, got %', n; end if;
  select count(*) into n from public.notifications where user_id = 'd9000000-0000-0000-0000-000000000004' and title like 'تبليغ من العمليات الميدانية:%' and link = '/admin-ops';
  if n <> 1 then raise exception 'sector manager should receive field ops notice with /admin-ops link'; end if;
  select count(*) into n from public.notifications where user_id = 'd9000000-0000-0000-0000-000000000006' and title like 'تبليغ من العمليات الميدانية:%' and link = '/manager';
  if n <> 1 then raise exception 'dept manager should receive field ops notice with /manager link'; end if;
  -- مسؤول القاطع لا يستطيع تبليغ مسؤول قاطع آخر ولا مسؤول قسم خارج قاطعه
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000004');
  select count(*) into n from public.sector_manager_notify_targets() t where t.role = 'admin_ops';
  if n <> 0 then raise exception 'sector manager targets must not include sector managers'; end if;
  perform pg_temp.expect_error($q$ select public.sector_manager_notify('x1234', 'y1234', '{d9000000-0000-0000-0000-000000000007}') $q$, 'NOTICE_TARGET_FORBIDDEN');
  perform pg_temp.expect_error($q$ select public.sector_manager_notify('x1234', 'y1234', '{d9000000-0000-0000-0000-000000000006}') $q$, 'NOTICE_TARGET_FORBIDDEN');
  raise notice 'F2 ✅ التبليغ: الميدانية تبلّغ مسؤولي القواطع والأقسام؛ مسؤول القاطع أقسامه فقط';
end $$;

-- ═══ F3 · السلسلة: متعهد/زمنية → مسؤول قاطعه → العمليات الميدانية (تُنفَّذ لا تُخطّى، وتعلو مسؤول القاطع) ═══
do $$
declare lid uuid; t_permit uuid; r record; n int;
begin
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000001');
  perform public.approval_chain_save('employee', 'time_permit', '[{"kind":"hierarchy","role":"admin_ops"},{"kind":"hierarchy","role":"field_ops"}]');
  select id into t_permit from public.hr_leave_types where kind = 'time_permit' and is_active order by sort_order limit 1;
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000002');
  lid := public.hr_leave_request('d9000000-0000-0000-0000-0000000000e2', t_permit, current_date + 3, current_date + 3, '09:00', '10:00');
  select status into r from public.approval_tasks where request_id = lid and step_no = 2;
  if r.status <> 'waiting' then raise exception 'field ops step must be waiting (not skipped), got %', r.status; end if;
  -- الميدانية لا تبتّ قبل دور مسؤول القاطع
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000005');
  select count(*) into n from public.approval_my_tasks(); if n <> 0 then raise exception 'field ops has no task yet'; end if;
  perform pg_temp.expect_error(format($q$ select public.hr_leave_decide('%s', true) $q$, lid), 'HR_FORBIDDEN');
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000004');
  perform public.hr_leave_decide(lid, true);
  select count(*) into n from public.notifications where user_id = 'd9000000-0000-0000-0000-000000000005' and dedupe_key like 'approval:%' and link = '/field-ops/requests';
  if n <> 1 then raise exception 'field ops should be notified with /field-ops/requests link'; end if;
  perform pg_temp.as_user('d9000000-0000-0000-0000-000000000005');
  select * into r from public.approval_my_tasks();
  if r.step_no <> 2 or r.request_kind <> 'time_permit' or r.minutes <> 60 or r.requester_role_label <> 'متعهد' then raise exception 'field ops task wrong: %', r; end if;
  perform public.hr_leave_decide(lid, true, 'موافقة الميدانية');
  select status, approved_by into r from public.hr_leaves where id = lid;
  if r.status <> 'approved' or r.approved_by <> 'd9000000-0000-0000-0000-000000000005' then raise exception 'permit should be approved by field ops: %', r; end if;
  raise notice 'F3 ✅ خطوة العمليات الميدانية تُنفَّذ بعد مسؤول القاطع وتُنهي الطلب بالموافقة';
end $$;
