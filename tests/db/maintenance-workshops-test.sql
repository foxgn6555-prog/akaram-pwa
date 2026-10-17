-- اختبار 00240: ورش الصيانة — إسناد الحساب من التطوير، التوجيه التلقائي بالقاطع، عزل الحالات/الفنيين/المخزن/المشتريات لكل ورشة، الأدوار غير المقيَّدة ترى الكل
set client_min_messages = notice;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

insert into auth.users (id, email) values
  ('ec240000-0000-0000-0000-000000000001', 'ws-central@t.iq'), ('ec240000-0000-0000-0000-000000000002', 'ws-zaaf@t.iq'),
  ('ec240000-0000-0000-0000-000000000003', 'ws-it@t.iq'), ('ec240000-0000-0000-0000-000000000004', 'ws-ops@t.iq'),
  ('ec240000-0000-0000-0000-000000000005', 'ws-mgr4@t.iq'), ('ec240000-0000-0000-0000-000000000006', 'ws-mgr6@t.iq'),
  ('ec240000-0000-0000-0000-000000000007', 'ws-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ec240000-0000-0000-0000-000000000001', 'maintenance'), ('ec240000-0000-0000-0000-000000000002', 'maintenance'),
  ('ec240000-0000-0000-0000-000000000003', 'it_admin'), ('ec240000-0000-0000-0000-000000000004', 'ops_room'),
  ('ec240000-0000-0000-0000-000000000005', 'department_manager'), ('ec240000-0000-0000-0000-000000000006', 'department_manager'),
  ('ec240000-0000-0000-0000-000000000007', 'employee')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values
  ('ec240000-0000-0000-0000-000000000005', 'morning', '{4}'), ('ec240000-0000-0000-0000-000000000006', 'morning', '{6}') on conflict do nothing;
-- قسمان: الصيانة المركزية وصيانة الزعفرانية (كل حساب صيانة موظف في قسمه — 00223)
insert into public.departments (id, name, code) values ('dc240000-0000-0000-0000-0000000000a1', 'الصيانة المركزية (اختبار)', 'WS-C'), ('dc240000-0000-0000-0000-0000000000b1', 'صيانة الزعفرانية (اختبار)', 'WS-Z') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, maintenance_specialty) values
  ('dc240000-0000-0000-0000-0000000000a2', 'فني مركزي', 'WS-CJ', 'dc240000-0000-0000-0000-0000000000a1', true, 'hydraulic'),
  ('dc240000-0000-0000-0000-0000000000b2', 'فني زعفرانية', 'WS-ZJ', 'dc240000-0000-0000-0000-0000000000b1', true, 'hydraulic') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id, job_title_id) values
  ('fc240000-0000-0000-0000-000000000001', 'ec240000-0000-0000-0000-000000000001', 'WS-C1', 'مسؤول الصيانة المركزية', '2024-01-01', 'dc240000-0000-0000-0000-0000000000a1', null),
  ('fc240000-0000-0000-0000-000000000002', 'ec240000-0000-0000-0000-000000000002', 'WS-Z1', 'مسؤول صيانة الزعفرانية', '2024-01-01', 'dc240000-0000-0000-0000-0000000000b1', null),
  ('fc240000-0000-0000-0000-000000000003', null, 'WS-CT', 'فني المركزية', '2024-01-01', 'dc240000-0000-0000-0000-0000000000a2', 'dc240000-0000-0000-0000-0000000000a2'),
  ('fc240000-0000-0000-0000-000000000004', null, 'WS-ZT', 'فني الزعفرانية', '2024-01-01', 'dc240000-0000-0000-0000-0000000000b2', 'dc240000-0000-0000-0000-0000000000b2')
on conflict (employee_number) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, vehicle_category, created_by) values
  ('ac240000-0000-0000-0000-000000000001', 'كابسة الكرادة', 'DB-WS1', 'P-WS1', 'CH-WS0001', 'garage/ws1.jpg', 'سائق ١', 'morning', 4, 'compactor_large', 'ec240000-0000-0000-0000-000000000004'),
  ('ac240000-0000-0000-0000-000000000002', 'كابسة الزعفرانية', 'DB-WS2', 'P-WS2', 'CH-WS0002', 'garage/ws2.jpg', 'سائق ٢', 'morning', 6, 'compactor_large', 'ec240000-0000-0000-0000-000000000004')
on conflict (id) do nothing;
insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, recipient_manager_id, recipient_manager_name, arrived_at, arrived_by) values
  ('dd240000-0000-0000-0000-000000000001', 'ac240000-0000-0000-0000-000000000001', 'سائق ١', 'morning', 4, now() - interval '3 hour', 'ec240000-0000-0000-0000-000000000004', 'ec240000-0000-0000-0000-000000000005', 'مسؤول ٤', now() - interval '2 hour', 'ec240000-0000-0000-0000-000000000005'),
  ('dd240000-0000-0000-0000-000000000002', 'ac240000-0000-0000-0000-000000000002', 'سائق ٢', 'morning', 6, now() - interval '3 hour', 'ec240000-0000-0000-0000-000000000004', 'ec240000-0000-0000-0000-000000000006', 'مسؤول ٦', now() - interval '2 hour', 'ec240000-0000-0000-0000-000000000006')
on conflict (id) do nothing;

-- ① الورش المزروعة + الحسابات الحالية = مركزية تلقائياً
do $$ begin
  assert (select count(*) from public.maintenance_workshops where key in ('central','zaafaraniya')) = 2, 'seed';
  assert app.maintenance_workshop_for_sector(4::smallint) = 'central' and app.maintenance_workshop_for_sector(6::smallint) = 'zaafaraniya', 'routing by sector';
end $$;
select auth.set_test_user('ec240000-0000-0000-0000-000000000002');
do $$ begin
  assert app.maintenance_workshop() = 'central', 'unassigned maintenance account = central';
  assert (public.maintenance_my_workshop() ->> 'key') = 'central' and (public.maintenance_my_workshop() ->> 'scoped')::boolean, 'my workshop';
end $$;

-- ② التطوير المركزية تُسند حساب الزعفرانية؛ غير المخوَّل ممنوع؛ لا إسناد لحساب غير صيانة
select auth.set_test_user('ec240000-0000-0000-0000-000000000004');
select pg_temp.expect_error($q$select public.maintenance_workshop_assign('ec240000-0000-0000-0000-000000000002', 'zaafaraniya')$q$, 'IT_FORBIDDEN');
select auth.set_test_user('ec240000-0000-0000-0000-000000000003');
do $$ declare j jsonb; begin
  j := public.maintenance_workshop_account_get('ec240000-0000-0000-0000-000000000002');
  assert (j ->> 'is_maintenance')::boolean and j ->> 'workshop_key' = 'central' and not (j ->> 'explicit')::boolean, 'default get: ' || j::text;
  j := public.maintenance_workshop_assign('ec240000-0000-0000-0000-000000000002', 'zaafaraniya', 'ورشة القاطع');
  assert j ->> 'workshop_key' = 'zaafaraniya' and (j ->> 'explicit')::boolean and j ->> 'workshop_name' = 'صيانة قاطع الزعفرانية', 'assigned: ' || j::text;
  assert exists (select 1 from public.audit_logs where table_name = 'maintenance_workshop_accounts' and record_id = 'ec240000-0000-0000-0000-000000000002'), 'audit';
  assert (select (w ->> 'accounts')::int from jsonb_array_elements(public.maintenance_workshops_list()) w where w ->> 'key' = 'zaafaraniya') >= 1, 'list counts';
  assert not (public.maintenance_workshop_account_get('ec240000-0000-0000-0000-000000000007') ->> 'is_maintenance')::boolean, 'non-maintenance';
  perform pg_temp.expect_error($q$select public.maintenance_workshop_assign('ec240000-0000-0000-0000-000000000007', 'zaafaraniya')$q$, 'MAINTENANCE_WORKSHOP_NOT_MAINTENANCE_ACCOUNT');
  perform pg_temp.expect_error($q$select public.maintenance_workshop_assign('ec240000-0000-0000-0000-000000000002', 'nowhere')$q$, 'MAINTENANCE_WORKSHOP_INVALID');
end $$;

-- ③ التوجيه التلقائي: آلية القاطع 4 ⇒ المركزية، آلية القاطع 6 ⇒ الزعفرانية
select auth.set_test_user('ec240000-0000-0000-0000-000000000005');
do $$ declare c public.vehicle_maintenance_cases; begin
  c := public.sector_send_vehicle_to_maintenance('dd240000-0000-0000-0000-000000000001', 'عطل هيدروليك', 'urgent', 'كرادة');
  assert c.workshop_key = 'central' and c.origin_workshop_key is null, 'karrada → central: ' || c.workshop_key;
  perform set_config('test.c1', c.id::text, false);
end $$;
select auth.set_test_user('ec240000-0000-0000-0000-000000000006');
do $$ declare c public.vehicle_maintenance_cases; begin
  c := public.sector_send_vehicle_to_maintenance('dd240000-0000-0000-0000-000000000002', 'عطل فرامل', 'normal', 'زعفرانية');
  assert c.workshop_key = 'zaafaraniya', 'zaafaraniya → zaafaraniya: ' || c.workshop_key;
  perform set_config('test.c2', c.id::text, false);
end $$;

-- ④ حساب الزعفرانية: يرى حالته فقط، لا يقرأ/يعدّل حالة المركزية؛ فنيّوه وحساباته من ورشته فقط
select auth.set_test_user('ec240000-0000-0000-0000-000000000002');
do $$ declare c1 uuid := current_setting('test.c1')::uuid; c2 uuid := current_setting('test.c2')::uuid; n int; begin
  assert exists (select 1 from public.maintenance_vehicle_cases() x where x.case_id = c2), 'zaaf sees own case';
  assert not exists (select 1 from public.maintenance_vehicle_cases() x where x.case_id = c1), 'zaaf does not see central case';
  perform public.maintenance_case_timeline(c2);
  perform pg_temp.expect_error(format('select public.maintenance_case_timeline(%L)', c1), 'MAINTENANCE_CASE_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.maintenance_case_events_unscoped(%L)', c1), 'MAINTENANCE_CASE_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.maintenance_confirm_arrival(%L, %L)', c1, 'وصلت'), 'MAINTENANCE_ARRIVAL_NOT_ALLOWED');
  perform public.maintenance_confirm_arrival(c2, 'وصلت ورشة الزعفرانية');
  assert (select arrived_at is not null from public.vehicle_maintenance_cases where id = c2), 'zaaf confirms own arrival';
  -- الفنيون: موظفو قسم الزعفرانية فقط
  assert exists (select 1 from public.maintenance_technician_options() t where t.full_name = 'فني الزعفرانية'), 'zaaf technician visible';
  assert not exists (select 1 from public.maintenance_technician_options() t where t.full_name = 'فني المركزية'), 'central technician hidden from zaaf';
  -- حسابات الصيانة: ورشتي فقط
  assert not exists (select 1 from public.maintenance_technicians() t where t.email = 'ws-central@t.iq'), 'central account hidden from zaaf';
  assert exists (select 1 from public.maintenance_technicians() t where t.email = 'ws-zaaf@t.iq'), 'zaaf account listed';
end $$;

-- ⑤ المخزن والمشتريات لكل ورشة
do $$ declare inv public.maintenance_inventory_items; po jsonb; begin
  inv := public.maintenance_inventory_create('WS-OIL', 'زيت هيدروليك', 'لتر', 2);
  assert inv.workshop_key = 'zaafaraniya', 'inventory item tagged with workshop: ' || inv.workshop_key;
  perform public.maintenance_inventory_receive(inv.id, 10, 5000, 'توريد');
  assert exists (select 1 from public.maintenance_inventory_list(null, null) i where i.sku = 'WS-OIL'), 'zaaf lists own inventory';
end $$;
select auth.set_test_user('ec240000-0000-0000-0000-000000000001');
do $$ declare inv public.maintenance_inventory_items; c1 uuid := current_setting('test.c1')::uuid; c2 uuid := current_setting('test.c2')::uuid; begin
  assert app.maintenance_workshop() = 'central', 'central account';
  assert not exists (select 1 from public.maintenance_inventory_list(null, null) i where i.sku = 'WS-OIL'), 'central does not see zaaf inventory';
  inv := public.maintenance_inventory_create('WS-OIL', 'زيت هيدروليك (مركزي)', 'لتر', 2);   -- نفس الرمز مسموح في ورشة أخرى
  assert inv.workshop_key = 'central', 'central item';
  perform pg_temp.expect_error(format('select public.maintenance_inventory_receive(%L, 1, 1, null)', (select id from public.maintenance_inventory_items where sku = 'WS-OIL' and workshop_key = 'zaafaraniya')), 'MAINTENANCE_ITEM_NOT_FOUND');
  assert exists (select 1 from public.maintenance_vehicle_cases() x where x.case_id = c1), 'central sees own case';
  assert not exists (select 1 from public.maintenance_vehicle_cases() x where x.case_id = c2), 'central does not see zaaf case';
  assert exists (select 1 from public.maintenance_technician_options() t where t.full_name = 'فني المركزية'), 'central technician visible';
  assert not exists (select 1 from public.maintenance_technician_options() t where t.full_name = 'فني الزعفرانية'), 'zaaf technician hidden from central';
end $$;

-- ⑥ غرفة العمليات (غير مقيَّدة): ترى الحالتين وعمود الورشة
select auth.set_test_user('ec240000-0000-0000-0000-000000000004');
do $$ declare c1 uuid := current_setting('test.c1')::uuid; c2 uuid := current_setting('test.c2')::uuid; begin
  assert app.maintenance_workshop() is null, 'ops unscoped';
  assert (select count(*) from public.vehicle_maintenance_cases x where x.id in (c1, c2) and app.maintenance_ws_visible(x.workshop_key, x.origin_workshop_key)) = 2, 'ops sees both';
  assert (public.maintenance_case_timeline(c2) -> 'case' ->> 'workshop_key') = 'zaafaraniya', 'workshop column';
  perform public.maintenance_case_timeline(c1); perform public.maintenance_case_timeline(c2);
end $$;

-- ⑦ (00241) التحويل إلى الصيانة المركزية: سبب إلزامي، نفس الحالة تنتقل بسجلها، للقراءة فقط في الزعفرانية، ساق رحلة جديدة، المركزية تؤكد الوصول
select auth.set_test_user('ec240000-0000-0000-0000-000000000002');
do $$ declare c2 uuid := current_setting('test.c2')::uuid; c1 uuid := current_setting('test.c1')::uuid; c public.vehicle_maintenance_cases; legs_before int; upd_before int; begin
  perform public.maintenance_assign_technician(c2, 'fc240000-0000-0000-0000-000000000004', null);
  select count(*) into legs_before from public.vehicle_trip_legs l join public.vehicle_maintenance_cases x on x.departure_id = l.departure_id where x.id = c2;
  select count(*) into upd_before from public.vehicle_maintenance_updates where case_id = c2;
  perform pg_temp.expect_error(format('select public.maintenance_forward_to_central(%L, %L)', c2, ''), 'MAINTENANCE_FORWARD_REASON_REQUIRED');
  perform pg_temp.expect_error(format('select public.maintenance_forward_to_central(%L, %L)', c2, 'قصير'), 'MAINTENANCE_FORWARD_REASON_REQUIRED');
  perform pg_temp.expect_error(format('select public.maintenance_forward_to_central(%L, %L)', c1, 'ليست حالتي أصلاً'), 'MAINTENANCE_CASE_NOT_FOUND');
  c := public.maintenance_forward_to_central(c2, 'يحتاج رافعة هيدروليكية غير متوفرة في الورشة');
  assert c.workshop_key = 'central' and c.origin_workshop_key = 'zaafaraniya' and c.forwarded_at is not null and c.status = 'to_maintenance' and c.arrived_at is null, 'forwarded: ' || row_to_json(c)::text;
  assert (select count(*) from public.vehicle_trip_legs l where l.departure_id = c.departure_id) = legs_before + 1, 'new leg';
  assert exists (select 1 from public.vehicle_trip_legs l where l.departure_id = c.departure_id and l.origin_type = 'maintenance' and l.destination_type = 'maintenance' and l.arrived_at is null), 'open leg workshop → central';
  assert (select count(*) from public.vehicle_maintenance_updates where case_id = c2) = upd_before + 1, 'forward event in history';
  assert not exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c2 and released_at is null), 'zaaf technicians released';
  assert exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c2), 'technician history kept';
  assert exists (select 1 from public.notifications where user_id = 'ec240000-0000-0000-0000-000000000001' and title like '%الصيانة المركزية%'), 'central notified';
  assert exists (select 1 from public.notifications where user_id = 'ec240000-0000-0000-0000-000000000004' and title like '%الصيانة المركزية%'), 'ops notified';
  assert exists (select 1 from public.notifications where user_id = 'ec240000-0000-0000-0000-000000000006' and title like '%الصيانة المركزية%'), 'sector manager notified';
  -- الزعفرانية: ما تزال تراها (للقراءة) ولا تعدّلها ولا تحوّلها ثانية
  assert exists (select 1 from public.maintenance_vehicle_cases() x where x.case_id = c2), 'zaaf still sees forwarded case';
  assert (select x.can_edit from public.maintenance_cases_for_day(current_date) x where x.case_id = c2) = false, 'read-only for zaaf';
  assert (select x.origin_workshop_name from public.maintenance_cases_for_day(current_date) x where x.case_id = c2) = 'صيانة قاطع الزعفرانية', 'origin name';
  perform public.maintenance_case_timeline(c2);
  perform pg_temp.expect_error(format('select public.maintenance_confirm_arrival(%L, %L)', c2, 'وصلت'), 'MAINTENANCE_ARRIVAL_NOT_ALLOWED');
  perform pg_temp.expect_error(format('select public.maintenance_forward_to_central(%L, %L)', c2, 'سبب آخر كافٍ هنا'), 'MAINTENANCE_CASE_NOT_FOUND');
end $$;
-- المركزية: تراها قابلة للتعديل، تؤكد الوصول (الساق تُغلق)، ولا يمكن تحويل حالة مركزية
select auth.set_test_user('ec240000-0000-0000-0000-000000000001');
do $$ declare c2 uuid := current_setting('test.c2')::uuid; c1 uuid := current_setting('test.c1')::uuid; c public.vehicle_maintenance_cases; begin
  assert (select x.can_edit from public.maintenance_cases_for_day(current_date) x where x.case_id = c2) = true, 'central can edit';
  c := public.maintenance_confirm_arrival(c2, 'وصلت المركزية');
  assert c.arrived_at is not null and c.status = 'diagnosing', 'central arrival';
  assert not exists (select 1 from public.vehicle_trip_legs l where l.departure_id = c.departure_id and l.arrived_at is null), 'leg closed';
  assert (select count(*) from public.vehicle_maintenance_stages where case_id = c2 and status = 'active') = 1, 'one active stage';
  perform public.maintenance_confirm_arrival(c1, 'وصلت');
  perform pg_temp.expect_error(format('select public.maintenance_forward_to_central(%L, %L)', c1, 'سبب كافٍ للتحويل'), 'MAINTENANCE_FORWARD_ALREADY_CENTRAL');
end $$;

-- ⑧ (00242) خارج بوابة الصيانة: غرفة العمليات ترى الورشة وحدث التحويل وتفلتر بالورشة؛ مسؤول القاطع يرى الورشة في حالة رحلته؛ الأرشيف بفلتر الورشة
select auth.set_test_user('ec240000-0000-0000-0000-000000000004');
do $$ declare c1 uuid := current_setting('test.c1')::uuid; c2 uuid := current_setting('test.c2')::uuid; n int; begin
  assert (select r.workshop_name from public.operational_maintenance_report(current_date, current_date) r where r.case_id = c2) = 'الصيانة المركزية', 'ops report workshop';
  assert (select r.origin_workshop_name from public.operational_maintenance_report(current_date, current_date) r where r.case_id = c2) = 'صيانة قاطع الزعفرانية', 'ops report origin';
  assert (select r.forward_reason from public.operational_maintenance_report(current_date, current_date) r where r.case_id = c2) like 'يحتاج رافعة%', 'ops report reason';
  select count(*) into n from public.operational_maintenance_report(current_date, current_date, 'zaafaraniya') r where r.case_id in (c1, c2);
  assert n = 1, 'ops filter zaafaraniya (origin counts): ' || n;
  select count(*) into n from public.operational_maintenance_report(current_date, current_date, 'central') r where r.case_id in (c1, c2);
  assert n = 2, 'ops filter central: ' || n;
  assert exists (select 1 from public.operational_departure_timeline('dd240000-0000-0000-0000-000000000002') t where t.title = 'تحويل إلى الصيانة المركزية' and t.details like '%صيانة قاطع الزعفرانية%'), 'ops timeline forward event';
  assert exists (select 1 from public.operational_departure_timeline('dd240000-0000-0000-0000-000000000002') t where t.title = 'وصلت إلى الصيانة المركزية'), 'ops timeline leg arrival label';
  assert exists (select 1 from public.operational_departure_timeline('dd240000-0000-0000-0000-000000000002') t where t.title = 'إحالة إلى الصيانة' and t.details like '%الورشة: صيانة قاطع الزعفرانية%'), 'ops timeline referral shows original workshop';
  assert exists (select 1 from public.maintenance_case_events(c2) e where e.event_key = 'case:forwarded'), 'case events forward';
  assert not exists (select 1 from public.maintenance_case_events(c2) e where e.title = 'تحديث الصيانة: to_maintenance'), 'no raw duplicate update row';
  -- الأرشيف بفلتر الورشة (بعد إكمال حالة المركزية الأصلية)
end $$;
select auth.set_test_user('ec240000-0000-0000-0000-000000000006');
do $$ declare j jsonb; begin
  j := public.sector_trip_maintenance_state('dd240000-0000-0000-0000-000000000002');
  assert j ->> 'workshop_name' = 'الصيانة المركزية' and j ->> 'origin_workshop_name' = 'صيانة قاطع الزعفرانية' and (j ->> 'forwarded_at') is not null, 'manager state: ' || j::text;
end $$;
select auth.set_test_user('ec240000-0000-0000-0000-000000000005');
do $$ declare j jsonb; begin
  j := public.sector_trip_maintenance_state('dd240000-0000-0000-0000-000000000001');
  assert j ->> 'workshop_name' = 'الصيانة المركزية' and (j ->> 'origin_workshop_key') is null, 'manager state central: ' || j::text;
end $$;
select auth.set_test_user('ec240000-0000-0000-0000-000000000004');
do $$ declare c1 uuid := current_setting('test.c1')::uuid; c2 uuid := current_setting('test.c2')::uuid; begin
  update public.vehicle_maintenance_cases set completed_at = now(), status = 'returned_to_work' where id in (c1, c2);
  assert (select count(*) from public.maintenance_archive_list(null, null, null, 'zaafaraniya') a where a.case_id in (c1, c2)) = 1, 'archive filter zaafaraniya';
  assert (select a.origin_workshop_name from public.maintenance_archive_list(null, null, null, 'zaafaraniya') a where a.case_id = c2) = 'صيانة قاطع الزعفرانية', 'archive origin column';
  assert (select count(*) from public.maintenance_archive_list(null, null, null, null) a where a.case_id in (c1, c2)) = 2, 'archive no filter';
end $$;
do $$ begin raise notice 'maintenance-workshops-test OK'; end $$;
