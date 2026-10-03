-- اختبار وظيفي لـ 00146: الملخص التنفيذي الموحّد + التبليغات الداخلية
-- مستقل (لا يعتمد على ملفات اختبار أخرى). كل الفحوص assert.
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('eeee0000-0000-0000-0000-000000000001', 'md@t.iq'),    -- super_admin (المدير المفوض)
  ('eeee0000-0000-0000-0000-000000000002', 'exec@t.iq'),  -- executive_director
  ('eeee0000-0000-0000-0000-000000000003', 'dep@t.iq'),   -- deputy_director
  ('eeee0000-0000-0000-0000-000000000004', 'fin2@t.iq'),  -- finance_officer
  ('eeee0000-0000-0000-0000-000000000005', 'hr2@t.iq'),   -- hr_officer (موظف في قسم أ)
  ('eeee0000-0000-0000-0000-000000000006', 'emp2@t.iq'),  -- employee (قسم أ)
  ('eeee0000-0000-0000-0000-000000000007', 'emp3@t.iq'),  -- employee (قسم ب)
  ('eeee0000-0000-0000-0000-000000000008', 'ops2@t.iq')   -- ops_room (بلا سجل موظف)
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('eeee0000-0000-0000-0000-000000000001', 'super_admin'), ('eeee0000-0000-0000-0000-000000000002', 'executive_director'),
  ('eeee0000-0000-0000-0000-000000000003', 'deputy_director'), ('eeee0000-0000-0000-0000-000000000004', 'finance_officer'),
  ('eeee0000-0000-0000-0000-000000000005', 'hr_officer'), ('eeee0000-0000-0000-0000-000000000006', 'employee'),
  ('eeee0000-0000-0000-0000-000000000007', 'employee'), ('eeee0000-0000-0000-0000-000000000008', 'ops_room')
on conflict do nothing;
insert into public.departments (id, name, code) values
  ('dddd0000-0000-0000-0000-0000000000a1', 'قسم أ', 'DA'), ('dddd0000-0000-0000-0000-0000000000b1', 'قسم ب', 'DB') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id, biometric_pin) values
  ('ffff0000-0000-0000-0000-000000000005', 'eeee0000-0000-0000-0000-000000000005', 'X-HR', 'موظف الموارد', '2024-01-01', 'dddd0000-0000-0000-0000-0000000000a1', 'X5'),
  ('ffff0000-0000-0000-0000-000000000006', 'eeee0000-0000-0000-0000-000000000006', 'X-E1', 'موظف أ', current_date - 3, 'dddd0000-0000-0000-0000-0000000000a1', 'X6'),
  ('ffff0000-0000-0000-0000-000000000007', 'eeee0000-0000-0000-0000-000000000007', 'X-E2', 'موظف ب', '2024-01-01', 'dddd0000-0000-0000-0000-0000000000b1', 'X7')
on conflict (employee_number) do nothing;

-- بيانات أعمال متنوعة داخل نافذة الأيام السبعة الماضية
insert into public.sectors (id, code, name, sort, parent_sector) values (91, 'S91', 'قاطع الاختبار', 91, 'karrada'), (92, 'S92', 'قاطع ثانٍ', 92, 'zaafaraniya') on conflict (id) do nothing;
insert into public.complaints (reference_no, sector, complaint_type, received_at, status) values
  ('C-1', 'karrada', 'نفايات', now() - interval '1 day', 'new'),
  ('C-2', 'karrada', 'نفايات', now() - interval '2 day', 'sent'),
  ('C-3', 'zaafaraniya', 'إنارة', now() - interval '3 day', 'new'),
  ('C-OLD', 'zaafaraniya', 'إنارة', now() - interval '40 day', 'new');
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, created_by) values
  ('a1a10000-0000-0000-0000-000000000001', 'كابسة 1', 'DB-1', 'P-1', 'CH-0001', 'garage/v1.jpg', 'سائق 1', 'morning', 91, 'eeee0000-0000-0000-0000-000000000001'), ('a1a10000-0000-0000-0000-000000000002', 'كابسة 2', 'DB-2', 'P-2', 'CH-0002', 'garage/v2.jpg', 'سائق 2', 'evening', 92, 'eeee0000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.garage_departures (vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, returned_at, returned_by) values
  ('a1a10000-0000-0000-0000-000000000001', 'سائق 1', 'morning', 91, now() - interval '1 day', 'eeee0000-0000-0000-0000-000000000001', now() - interval '1 day' + interval '6 hour', 'eeee0000-0000-0000-0000-000000000001'),
  ('a1a10000-0000-0000-0000-000000000001', 'سائق 1', 'morning', 91, now() - interval '2 day', 'eeee0000-0000-0000-0000-000000000001', now() - interval '2 day' + interval '8 hour', 'eeee0000-0000-0000-0000-000000000001'),
  ('a1a10000-0000-0000-0000-000000000002', 'سائق 2', 'evening', 92, now() - interval '3 hour', 'eeee0000-0000-0000-0000-000000000001', null, null);
insert into public.vehicle_trip_legs (id, departure_id, sequence_no, origin_type, destination_type, departed_at, departed_by, arrived_at, arrived_by) values
  ('b1b10000-0000-0000-0000-000000000001', (select id from public.garage_departures where driver_name = 'سائق 1' limit 1), 1, 'work_site', 'transfer_station', now() - interval '1 day' - interval '1 hour', 'eeee0000-0000-0000-0000-000000000001', now() - interval '1 day', 'eeee0000-0000-0000-0000-000000000001'),
  ('b1b10000-0000-0000-0000-000000000002', (select id from public.garage_departures where driver_name = 'سائق 1' limit 1), 2, 'work_site', 'transfer_station', now() - interval '2 day' - interval '1 hour', 'eeee0000-0000-0000-0000-000000000001', now() - interval '2 day', 'eeee0000-0000-0000-0000-000000000001'),
  ('b1b10000-0000-0000-0000-000000000003', (select id from public.garage_departures where driver_name = 'سائق 2' limit 1), 1, 'work_site', 'transfer_station', now() - interval '30 day' - interval '1 hour', 'eeee0000-0000-0000-0000-000000000001', now() - interval '30 day', 'eeee0000-0000-0000-0000-000000000001');
insert into public.ts_visit_weighing_steps (visit_leg_id, weight_tons, destination, vehicle_kind, weighed_at, violation, deficit_tons) values
  ('b1b10000-0000-0000-0000-000000000001', 12.5, 'transfer_station', 'compactor_large', now() - interval '1 day', false, null),
  ('b1b10000-0000-0000-0000-000000000002', 4.0,  'press', 'compactor_medium', now() - interval '2 day', true, 2.0),
  ('b1b10000-0000-0000-0000-000000000003', 9.0,  'press', 'compactor_large',  now() - interval '30 day', false, null);
insert into public.disclosures (ref_no, db_number, driver_name, details, sector, shift, log_date, violation_type, status, contractor_name) values
  ('D-1', 'DB-1', 'سائق 1', 'تفاصيل', 'karrada', 'morning', current_date - 1, 'delay', 'pending', 'مقاول أ'),
  ('D-2', 'DB-2', 'سائق 2', 'تفاصيل', 'zaafaraniya', 'evening', current_date - 2, 'absence', 'pending', 'مقاول ب');
-- أيام حضور حقيقية: يُترك للمحرك (trigger) حساب النقص والاستقطاع من أوقات الشفت المتوقعة
insert into public.hr_attendance_days (employee_id, work_date, status, is_rest_day, expected_in, expected_out, check_in, check_out, worked_minutes) values
  ('ffff0000-0000-0000-0000-000000000006', current_date - 1, 'present', false, (current_date - 1) + time '08:00', (current_date - 1) + time '16:00', (current_date - 1) + time '08:00', (current_date - 1) + time '16:00', 480),
  ('ffff0000-0000-0000-0000-000000000006', current_date - 2, 'absent',  false, (current_date - 2) + time '08:00', (current_date - 2) + time '16:00', null, null, 0),
  ('ffff0000-0000-0000-0000-000000000007', current_date - 1, 'late',    false, (current_date - 1) + time '08:00', (current_date - 1) + time '16:00', (current_date - 1) + time '08:30', (current_date - 1) + time '16:00', 450);
insert into public.maintenance_purchase_orders (order_number, supplier_name, total_amount, item_count, created_by) values ('PO-1', 'مورد', 250000, 3, 'eeee0000-0000-0000-0000-000000000001');
insert into public.budget_allocations (fiscal_year, department_id, category, allocated_amount, spent_amount) values (extract(year from current_date)::int, 'dddd0000-0000-0000-0000-0000000000a1', 'وقود', 1000000, 400000);

-- ── ① الصلاحية: غير التنفيذيين ممنوعون ──
select auth.set_test_user('eeee0000-0000-0000-0000-000000000008');
do $$ begin
  begin perform public.exec_overview(current_date - 7, current_date); raise exception 'should fail';
  exception when others then assert sqlerrm = 'EXEC_FORBIDDEN', 'ops cannot read exec overview: ' || sqlerrm; end;
  assert public.exec_filter_options() is null, 'filter options hidden';
  assert public.announcement_targets() is null, 'targets hidden';
  begin perform public.announcement_publish('عنوان', 'نص التبليغ'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_FORBIDDEN', 'ops cannot publish: ' || sqlerrm; end;
  raise notice 'X1 ✅ الصلاحيات: المنظومة حصرية للإدارة العليا والمالية';
end $$;

-- ── ② الملخص: أرقام صحيحة داخل الفترة فقط ──
select auth.set_test_user('eeee0000-0000-0000-0000-000000000001');
do $$ declare o jsonb; begin
  o := public.exec_overview(current_date - 7, current_date);
  assert (o -> 'period' ->> 'days')::int = 8, 'period days';
  assert (o -> 'complaints' ->> 'total')::int = 3, 'complaints in window = 3 (old excluded): ' || (o -> 'complaints')::text;
  assert (o -> 'complaints' ->> 'open')::int = 2 and (o -> 'complaints' ->> 'resolved')::int = 1, 'open/resolved split';
  assert jsonb_array_length(o -> 'complaints' -> 'by_sector') = 2 and (o -> 'station' -> 'by_kind' -> 0 ->> 'name') = 'كابسة كبيرة', 'by_sector 2 + kind label';
  assert (o -> 'fleet' ->> 'departures')::int = 3 and (o -> 'fleet' ->> 'returned')::int = 2 and (o -> 'fleet' ->> 'open_now')::int = 1, 'fleet counts: ' || (o -> 'fleet')::text;
  assert (o -> 'fleet' ->> 'avg_hours')::numeric = 7.0, 'avg trip hours 7.0';
  assert (o -> 'station' ->> 'weighings')::int = 2 and (o -> 'station' ->> 'tons')::numeric = 16.5 and (o -> 'station' ->> 'violations')::int = 1 and (o -> 'station' ->> 'deficit_tons')::numeric = 2.0, 'station: ' || (o -> 'station')::text;
  assert (o -> 'disclosures' ->> 'total')::int = 2, 'disclosures 2';
  assert (o -> 'workforce' -> 'attendance' ->> 'present')::int = 1 and (o -> 'workforce' -> 'attendance' ->> 'absent')::int = 1 and (o -> 'workforce' -> 'attendance' ->> 'late')::int = 1, 'attendance split';
  assert (o -> 'workforce' -> 'attendance' ->> 'deduction_days')::numeric >= 1 and (o -> 'workforce' -> 'attendance' ->> 'shortfall_minutes')::int >= 480, 'absence → ≥1 day deduction & ≥480 shortfall: ' || (o -> 'workforce' -> 'attendance')::text;
  assert (o -> 'workforce' ->> 'hired')::int >= 1, 'hired in window';
  assert (o -> 'finance' -> 'purchases' ->> 'total')::numeric = 250000, 'purchases total';
  assert (o -> 'finance' -> 'budget' ->> 'allocated')::numeric = 1000000 and (o -> 'finance' -> 'budget' ->> 'spent')::numeric = 400000, 'budget';
  assert o -> 'finance' -> 'payroll' = 'null'::jsonb or o -> 'finance' -> 'payroll' is null, 'no payroll export yet';
  raise notice 'X2 ✅ الملخص التنفيذي يجمع كل الوحدات بأرقام صحيحة داخل الفترة';
end $$;

-- ── ③ الفلاتر: قاطع/شفت ──
do $$ declare o jsonb; begin
  o := public.exec_overview(current_date - 7, current_date, 91::smallint, null);
  assert (o -> 'complaints' ->> 'total')::int = 2, 'sector filter complaints 2';
  assert (o -> 'fleet' ->> 'departures')::int = 2 and (o -> 'fleet' ->> 'open_now')::int = 0, 'sector filter fleet';
  assert (o -> 'disclosures' ->> 'total')::int = 1, 'sector filter disclosures';
  o := public.exec_overview(current_date - 7, current_date, null, 'evening');
  assert (o -> 'fleet' ->> 'departures')::int = 1 and (o -> 'fleet' ->> 'vehicles')::int = 1, 'shift filter fleet';
  assert (public.exec_filter_options() -> 'sectors') @> '[{"id": 91, "name": "قاطع الاختبار"}]'::jsonb, 'filter options list sectors';
  begin perform public.exec_overview(current_date, current_date - 1); raise exception 'should fail';
  exception when others then assert sqlerrm = 'EXEC_RANGE_INVALID', 'range invalid: ' || sqlerrm; end;
  begin perform public.exec_overview(current_date - 500, current_date); raise exception 'should fail';
  exception when others then assert sqlerrm = 'EXEC_RANGE_TOO_WIDE', 'range too wide: ' || sqlerrm; end;
  raise notice 'X3 ✅ فلاتر القاطع والشفت والتحقق من النطاق';
end $$;

-- ── ④ كل الأدوار الأربعة تقرأ الملخص ──
select auth.set_test_user('eeee0000-0000-0000-0000-000000000002');
select public.exec_overview(current_date - 1, current_date);
select auth.set_test_user('eeee0000-0000-0000-0000-000000000003');
select public.exec_overview(current_date - 1, current_date);
select auth.set_test_user('eeee0000-0000-0000-0000-000000000004');
do $$ begin perform public.exec_overview(current_date - 1, current_date); raise notice 'X4 ✅ التنفيذي والمعاون والمالية يقرؤون الملخص'; end $$;

-- ── ⑤ التبليغات: نشر للكل → إيصال وإشعار لكل مستخدم ──
select auth.set_test_user('eeee0000-0000-0000-0000-000000000001');
do $$ declare aid uuid; n int; total int; begin
  select count(distinct user_id) into total from public.user_roles;
  aid := public.announcement_publish('تعميم عام', 'يرجى الالتزام بالدوام الرسمي', 'important', 'all');
  select recipients_count into n from public.announcements where id = aid; assert n = total, 'all users are recipients: ' || n || ' vs ' || total;
  select count(*) into n from public.announcement_receipts where announcement_id = aid; assert n = total, 'receipts rows';
  select count(*) into n from public.notifications where dedupe_key = 'ann:' || aid::text; assert n = total, 'one notification per recipient';
  assert (select title from public.notifications where dedupe_key = 'ann:' || aid::text limit 1) like '🟠 تبليغ مهم: %', 'priority prefix';
  assert (select link from public.notifications where dedupe_key = 'ann:' || aid::text limit 1) = '/announcements/' || aid::text, 'link';
  assert (select publisher_role from public.announcements where id = aid) = 'super_admin', 'publisher role';
  perform set_config('test.ann_all', aid::text, false);
  raise notice 'X5 ✅ نشر للكل: إيصالات + إشعارات لكل المستخدمين';
end $$;

-- ── ⑥ استهداف قسم: فقط موظفو القسم أ (لهم حسابات) ──
do $$ declare aid uuid; n int; begin
  aid := public.announcement_publish('اجتماع قسم أ', 'الاجتماع الساعة 10', 'normal', 'departments', '{}', array['dddd0000-0000-0000-0000-0000000000a1']::uuid[]);
  select count(*) into n from public.announcement_receipts where announcement_id = aid; assert n = 2, 'dept A has 2 users: ' || n;
  assert exists (select 1 from public.announcement_receipts where announcement_id = aid and user_id = 'eeee0000-0000-0000-0000-000000000006'), 'emp A included';
  assert not exists (select 1 from public.announcement_receipts where announcement_id = aid and user_id = 'eeee0000-0000-0000-0000-000000000007'), 'emp B excluded';
  perform set_config('test.ann_dept', aid::text, false);
  -- استهداف أدوار
  aid := public.announcement_publish('إلى المالية والموارد', 'تسليم الكشوف قبل 25', 'urgent', 'roles', array['finance_officer', 'hr_officer']);
  select count(*) into n from public.announcement_receipts where announcement_id = aid; assert n >= 2, 'roles targeted: ' || n;
  assert exists (select 1 from public.announcement_receipts where announcement_id = aid and user_id = 'eeee0000-0000-0000-0000-000000000004'), 'finance included';
  assert not exists (select 1 from public.announcement_receipts where announcement_id = aid and user_id = 'eeee0000-0000-0000-0000-000000000006'), 'employee excluded';
  -- استهداف أشخاص
  aid := public.announcement_publish('شخصي', 'مراجعة المكتب', 'normal', 'users', '{}', '{}', array['eeee0000-0000-0000-0000-000000000007']::uuid[], true);
  select count(*) into n from public.announcement_receipts where announcement_id = aid; assert n = 1, 'single user';
  perform set_config('test.ann_user', aid::text, false);
  raise notice 'X6 ✅ الاستهداف بالقسم/الدور/الشخص دقيق';
end $$;

-- ── ⑦ تحقق المدخلات ──
do $$ begin
  begin perform public.announcement_publish('ق', 'نص'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_TITLE_REQUIRED', 'title: ' || sqlerrm; end;
  begin perform public.announcement_publish('عنوان', '  '); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_BODY_REQUIRED', 'body: ' || sqlerrm; end;
  begin perform public.announcement_publish('عنوان', 'نص', 'normal', 'roles', '{}'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_AUDIENCE_EMPTY', 'audience empty: ' || sqlerrm; end;
  begin perform public.announcement_publish('عنوان', 'نص', 'normal', 'roles', array['no_such_role']); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_NO_RECIPIENTS', 'no recipients: ' || sqlerrm; end;
  begin perform public.announcement_publish('عنوان', 'نص', 'critical'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_PRIORITY_INVALID', 'priority: ' || sqlerrm; end;
  begin perform public.announcement_publish('عنوان', 'نص', 'normal', 'all', '{}', '{}', '{}', false, false, now() - interval '1 hour'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_EXPIRY_INVALID', 'expiry: ' || sqlerrm; end;
  raise notice 'X7 ✅ التحقق من المدخلات';
end $$;

-- ── ⑧ الوارد والقراءة والإقرار من جهة المستلم ──
select auth.set_test_user('eeee0000-0000-0000-0000-000000000007');   -- موظف ب
do $$ declare n int; g jsonb; aid uuid := current_setting('test.ann_user')::uuid; begin
  assert public.announcement_unread_count() = 2, 'emp B unread = 2 (all + personal): ' || public.announcement_unread_count();
  select count(*) into n from public.announcement_feed('inbox'); assert n = 2, 'inbox 2';
  assert not exists (select 1 from public.announcement_feed('inbox') f where f.id = current_setting('test.ann_dept')::uuid), 'dept A post not in B inbox';
  g := public.announcement_get(aid);
  assert g ->> 'my_read_at' is not null, 'opening marks read';
  assert (g ->> 'requires_ack')::boolean, 'requires ack';
  assert public.announcement_unread_count() = 1, 'unread decremented';
  assert (select is_read from public.notifications where user_id = 'eeee0000-0000-0000-0000-000000000007' and dedupe_key = 'ann:' || aid::text), 'notification marked read too';
  perform public.announcement_ack(aid);
  assert (select acked_at from public.announcement_receipts where announcement_id = aid and user_id = 'eeee0000-0000-0000-0000-000000000007') is not null, 'acked';
  -- لا يستطيع الإقرار على تبليغ ليس موجهاً له
  begin perform public.announcement_ack(current_setting('test.ann_dept')::uuid); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_NOT_RECIPIENT', 'ack non-recipient: ' || sqlerrm; end;
  begin perform public.announcement_get(current_setting('test.ann_dept')::uuid); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_FORBIDDEN', 'get non-recipient: ' || sqlerrm; end;
  -- لا يستطيع الموظف النشر أو الأرشفة
  begin perform public.announcement_publish('x', 'yyy'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_FORBIDDEN', 'employee cannot publish: ' || sqlerrm; end;
  begin perform public.announcement_archive(aid); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_FORBIDDEN', 'employee cannot archive: ' || sqlerrm; end;
  begin perform public.announcement_recipients(aid); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_FORBIDDEN', 'employee cannot list recipients: ' || sqlerrm; end;
  raise notice 'X8 ✅ الوارد والقراءة والإقرار وحدود المستلم';
end $$;

-- ── ⑨ الناشر: الصادر مع عدّادات القراءة/الإقرار + قائمة المستلمين + الأرشفة ──
select auth.set_test_user('eeee0000-0000-0000-0000-000000000001');
do $$ declare f record; n int; aid uuid := current_setting('test.ann_user')::uuid; begin
  select * into f from public.announcement_feed('sent') x where x.id = aid;
  assert f.is_mine and f.recipients_count = 1 and f.read_count = 1 and f.ack_count = 1, 'sent counters: ' || row_to_json(f)::text;
  select count(*) into n from public.announcement_recipients(aid) r where r.acked_at is not null; assert n = 1, 'recipients list acked';
  assert (select full_name from public.announcement_recipients(aid) limit 1) = 'موظف ب', 'recipient name resolved from employees';
  perform public.announcement_archive(aid, 'انتهى');
  assert (select archived_at from public.announcements where id = aid) is not null, 'archived';
  select count(*) into n from public.announcement_feed('sent') x where x.id = aid; assert n = 0, 'archived hidden by default';
  select count(*) into n from public.announcement_feed('sent', 50, true) x where x.id = aid; assert n = 1, 'archived visible on demand';
  assert (select dismissed_at from public.notifications where dedupe_key = 'ann:' || aid::text limit 1) is not null, 'notification dismissed on archive';
  raise notice 'X9 ✅ الصادر والعدّادات والمستلمون والأرشفة';
end $$;

-- ── ⑩ المعاون ينشر ويرى صادره فقط؛ المدير المفوض يرى الكل ──
select auth.set_test_user('eeee0000-0000-0000-0000-000000000003');
do $$ declare aid uuid; n int; begin
  aid := public.announcement_publish('من المعاون', 'تبليغ للقواطع', 'normal', 'roles', array['employee']);
  assert (select publisher_role from public.announcements where id = aid) = 'deputy_director', 'deputy role recorded';
  select count(*) into n from public.announcement_feed('sent'); assert n = 1, 'deputy sees own sent only: ' || n;
  begin perform public.announcement_archive(current_setting('test.ann_dept')::uuid); raise exception 'should fail';
  exception when others then assert sqlerrm = 'ANN_FORBIDDEN', 'deputy cannot archive MD post: ' || sqlerrm; end;
  assert (public.announcement_targets() -> 'departments') @> '[{"name": "قسم أ"}]'::jsonb, 'targets include departments';
  assert (public.announcement_targets() ->> 'total_users')::int >= 8, 'targets total users';
end $$;
select auth.set_test_user('eeee0000-0000-0000-0000-000000000001');
do $$ declare n int; begin
  select count(*) into n from public.announcement_feed('sent'); assert n >= 4, 'MD sees all sent: ' || n;
  raise notice 'X10 ✅ الصادر بحسب الناشر والمدير المفوض يرى الكل';
end $$;

-- ── ⑪ انتهاء الصلاحية يُخفي من الوارد ──
do $$ declare aid uuid; n int; begin
  aid := public.announcement_publish('مؤقت', 'ينتهي بعد ساعة', 'normal', 'users', '{}', '{}', array['eeee0000-0000-0000-0000-000000000006']::uuid[], false, false, now() + interval '1 hour');
  update public.announcements set expires_at = now() - interval '1 minute' where id = aid;   -- محاكاة مرور الوقت
  perform auth.set_test_user('eeee0000-0000-0000-0000-000000000006');
  select count(*) into n from public.announcement_feed('inbox') x where x.id = aid; assert n = 0, 'expired hidden';
  assert public.announcement_unread_count() = 3, 'unread excludes expired (all + dept + employees-role): ' || public.announcement_unread_count();
  raise notice 'X11 ✅ انتهاء الصلاحية';
end $$;
