-- اختبار تكاملي لدورة حياة الانطلاقة كاملة عبر الدوال الحقيقية (لا إدخال مباشر في الجداول إلا للتوقيتات):
--   كراج → موقع العمل → المحطة (وزن) → موقع العمل → المحطة (مخالفة نقص وزن) → موقع العمل
--   → الصيانة (المراحل الخمس) → موقع العمل → الكراج، ثم تدقيق كل تقارير غرفة العمليات على النتيجة.
-- مستقل. كل الفحوص assert داخل do $$.
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('c0c00000-0000-0000-0000-000000000001', 'garage@t.iq'),   -- central_garage_officer (karrada)
  ('c0c00000-0000-0000-0000-000000000002', 'mgr@t.iq'),      -- department_manager (منطقة 4 صباحي)
  ('c0c00000-0000-0000-0000-000000000003', 'station@t.iq'),  -- transfer_station
  ('c0c00000-0000-0000-0000-000000000004', 'maint@t.iq'),    -- maintenance
  ('c0c00000-0000-0000-0000-000000000005', 'ops@t.iq'),      -- ops_room
  ('c0c00000-0000-0000-0000-000000000006', 'mgr2@t.iq')      -- department_manager (منطقة 8 — غريب)
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('c0c00000-0000-0000-0000-000000000001', 'central_garage_officer'),
  ('c0c00000-0000-0000-0000-000000000002', 'department_manager'),
  ('c0c00000-0000-0000-0000-000000000003', 'transfer_station'),
  ('c0c00000-0000-0000-0000-000000000004', 'maintenance'),
  ('c0c00000-0000-0000-0000-000000000005', 'ops_room'),
  ('c0c00000-0000-0000-0000-000000000006', 'department_manager')
on conflict do nothing;
-- المناطق ثابتة 1..8 (1–4 كرادة، 5–8 زعفرانية): نستخدم 4 للدورة و8 كمنطقة غريبة
insert into public.garage_user_profiles (user_id, parent_sector) values ('c0c00000-0000-0000-0000-000000000001', 'karrada') on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values
  ('c0c00000-0000-0000-0000-000000000002', 'morning', '{4}'), ('c0c00000-0000-0000-0000-000000000006', 'morning', '{8}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, job_title, biometric_pin, is_driver) values
  ('c0c00000-0000-0000-0000-0000000000e2', 'c0c00000-0000-0000-0000-000000000002', 'LC-M1', 'مسؤول قاطع الدورة', '2024-01-01', 'مسؤول قسم', null, false),
  ('c0c00000-0000-0000-0000-0000000000d1', null, 'LC-D1', 'سائق الدورة', '2024-01-01', 'سائق كابسة', 'D1', false),
  ('c0c00000-0000-0000-0000-0000000000d2', null, 'LC-D2', 'سائق ثانٍ', '2024-01-01', 'عامل', null, true),
  ('c0c00000-0000-0000-0000-0000000000d3', null, 'LC-D3', 'سائق بديل', '2024-01-01', 'سائق', 'D3', false),
  ('c0c00000-0000-0000-0000-0000000000d9', null, 'LC-D9', 'سائق مُنهى', '2024-01-01', 'سائق', null, false)
on conflict (employee_number) do nothing;
update public.employees set employment_status = 'terminated', terminated_at = current_date - 10 where employee_number = 'LC-D9';
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, driver_employee_id, shift, sector_id, vehicle_category, created_by) values
  ('c0c0a000-0000-0000-0000-000000000001', 'كابسة الدورة', 'DB-LC1', 'P-LC1', 'CH-LC0001', 'garage/lc1.jpg', 'سائق الدورة', 'c0c00000-0000-0000-0000-0000000000d1', 'morning', 4, 'compactor_large', 'c0c00000-0000-0000-0000-000000000005'),
  ('c0c0a000-0000-0000-0000-000000000002', 'كابسة ثانية', 'DB-LC2', 'P-LC2', 'CH-LC0002', 'garage/lc2.jpg', 'سائق ثانٍ', 'c0c00000-0000-0000-0000-0000000000d2', 'morning', 4, 'compactor_large', 'c0c00000-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.garage_vehicle_shift_assignments (vehicle_id, shift, driver_name, driver_employee_id, sector_id, change_reason, created_by) values
  ('c0c0a000-0000-0000-0000-000000000001', 'morning', 'سائق الدورة', 'c0c00000-0000-0000-0000-0000000000d1', 4, 'تهيئة الاختبار', 'c0c00000-0000-0000-0000-000000000005'),
  ('c0c0a000-0000-0000-0000-000000000002', 'morning', 'سائق ثانٍ', 'c0c00000-0000-0000-0000-0000000000d2', 4, 'تهيئة الاختبار', 'c0c00000-0000-0000-0000-000000000005');

-- مساعد: تبديل المستخدم الحالي
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
-- مساعد: توقع فشل بكود محدد
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══════════ L0 · السائق موظف: قائمة السائقين، إضافة آلية، تغيير السائق يصل إلى إسناد الشفت والانطلاقة ═══════════
do $$
declare v public.garage_vehicles; a public.garage_driver_assignments; d public.garage_departures; n int; ops uuid := 'c0c00000-0000-0000-0000-000000000005';
begin
  perform pg_temp.as_user(ops);
  -- القائمة: عنوان «سائق» أو خانة is_driver، بلا المُنهى، ومع مؤشر البصمة
  select count(*) into n from public.fleet_driver_options() where employee_number like 'LC-D%';
  assert n = 3, format('L0: ثلاثة سائقين مؤهلين (فعلي %s)', n);
  assert (select has_biometric from public.fleet_driver_options() where employee_number = 'LC-D1'), 'L0: D1 لديه بصمة';
  assert (select 'DB-LC1' = any(assigned_vehicles) from public.fleet_driver_options() where employee_number = 'LC-D1'), 'L0: D1 مسند إلى DB-LC1';
  assert not exists (select 1 from public.fleet_driver_options() where employee_number = 'LC-M1'), 'L0: غير السائقين لا يظهرون افتراضياً';
  assert exists (select 1 from public.fleet_driver_options('مسؤول قاطع') where employee_number = 'LC-M1'), 'L0: البحث الحر يصل لأي موظف';
  -- الكراج لا يدير قاعدة الآليات
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error('select * from public.fleet_driver_options()', 'OPS_FLEET_MASTER_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.garage_assign_driver(%L::uuid,%L::uuid,%L,%s::smallint)', 'c0c0a000-0000-0000-0000-000000000001', 'c0c00000-0000-0000-0000-0000000000d3', 'morning', 4), 'OPS_FLEET_MASTER_FORBIDDEN');
  perform pg_temp.as_user(ops);
  -- إضافة آلية بسائق موظف؛ الاسم يُشتق من الملف
  v := public.garage_add_vehicle('كابسة جديدة', 'DB-LC3', 'P-LC3', 'CH-LC0003', ops::text || '/lc3.jpg', 'evening', 'c0c00000-0000-0000-0000-0000000000d3', 4::smallint, 'compactor_large');
  assert v.driver_employee_id = 'c0c00000-0000-0000-0000-0000000000d3' and v.driver_name = 'سائق بديل', 'L0: الآلية مرتبطة بالموظف واسمه مشتق';
  assert (select driver_employee_id from public.garage_vehicle_shift_assignments where vehicle_id = v.id and shift = 'evening' and ends_at is null) = 'c0c00000-0000-0000-0000-0000000000d3', 'L0: إسناد الشفت الأول يحمل الموظف';
  -- سائق مُنهى الخدمة أو غير موجود مرفوض
  perform pg_temp.expect_error(format('select public.garage_assign_driver(%L::uuid,%L::uuid,%L,%s::smallint)', v.id, 'c0c00000-0000-0000-0000-0000000000d9', 'evening', 4), 'FLEET_DRIVER_TERMINATED');
  perform pg_temp.expect_error(format('select public.garage_assign_driver(%L::uuid,%L::uuid,%L,%s::smallint)', v.id, gen_random_uuid(), 'evening', 4), 'FLEET_DRIVER_NOT_FOUND');
  -- تغيير السائق الرئيسي يجب أن يستبدل إسناد الشفت النشط (كان يبقى القديم) وتنطلق الآلية بالسائق الجديد
  a := public.garage_assign_driver('c0c0a000-0000-0000-0000-000000000002', 'c0c00000-0000-0000-0000-0000000000d3', 'morning', 4::smallint, 'نقل السائق');
  assert a.driver_employee_id = 'c0c00000-0000-0000-0000-0000000000d3', 'L0: الإسناد الرئيسي بالموظف الجديد';
  assert (select count(*) from public.garage_vehicle_shift_assignments where vehicle_id = 'c0c0a000-0000-0000-0000-000000000002' and shift = 'morning' and ends_at is null) = 1, 'L0: إسناد شفت نشط واحد فقط';
  assert (select driver_employee_id from public.garage_vehicle_shift_assignments where vehicle_id = 'c0c0a000-0000-0000-0000-000000000002' and shift = 'morning' and ends_at is null) = 'c0c00000-0000-0000-0000-0000000000d3', 'L0: إسناد الشفت النشط = السائق الجديد';
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000001');
  d := public.garage_record_shift_departure('c0c0a000-0000-0000-0000-000000000002', 'morning');
  assert d.driver_employee_id = 'c0c00000-0000-0000-0000-0000000000d3' and d.driver_name = 'سائق بديل', 'L0: الانطلاقة بالسائق الجديد وهويته';
  -- غرفة العمليات تغيّر سائق الانطلاقة بسبب، والتدقيق يسجل
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format('select public.ops_set_departure_driver(%L::uuid,%L::uuid,%L)', d.id, 'c0c00000-0000-0000-0000-0000000000d2', ''), 'OPS_DRIVER_CHANGE_REASON_REQUIRED');
  d := public.ops_set_departure_driver(d.id, 'c0c00000-0000-0000-0000-0000000000d2', 'خطأ في الاختيار');
  assert d.driver_employee_id = 'c0c00000-0000-0000-0000-0000000000d2' and d.driver_name = 'سائق ثانٍ', 'L0: سائق الانطلاقة تغيّر';
  assert exists (select 1 from public.audit_logs where table_name = 'garage_departures' and record_id = d.id::text and operation = 'SET_DRIVER'), 'L0: سجل تدقيق لتغيير السائق';
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error(format('select public.ops_set_departure_driver(%L::uuid,%L::uuid,%L)', d.id, 'c0c00000-0000-0000-0000-0000000000d3', 'سبب'), 'OPS_FLEET_MASTER_FORBIDDEN');
  -- إعادة الحالة: إغلاق هذه الانطلاقة التجريبية وإرجاع السائق الأصلي للآلية الثانية
  update public.garage_departures set returned_at = now(), returned_by = 'c0c00000-0000-0000-0000-000000000001', arrived_at = now(), arrived_by = 'c0c00000-0000-0000-0000-000000000002', site_departed_at = now(), site_departed_by = 'c0c00000-0000-0000-0000-000000000002' where id = d.id;
  perform pg_temp.as_user(ops);
  perform public.garage_assign_driver('c0c0a000-0000-0000-0000-000000000002', 'c0c00000-0000-0000-0000-0000000000d2', 'morning', 4::smallint, 'إرجاع');
  -- تغيير الاسم في HR ينعكس على الآلية والإسناد النشط
  update public.employees set full_name = 'سائق بديل المعدل' where employee_number = 'LC-D3';
  assert (select driver_name from public.garage_vehicles where id = v.id) = 'سائق بديل المعدل', 'L0: اسم الآلية تبع HR';
  assert (select driver_name from public.garage_vehicle_shift_assignments where vehicle_id = v.id and ends_at is null) = 'سائق بديل المعدل', 'L0: اسم الإسناد النشط تبع HR';
  update public.employees set full_name = 'سائق بديل' where employee_number = 'LC-D3';
  -- قوائم الآليات تحمل هوية السائق
  assert (select driver_employee_number from public.garage_search_vehicles('DB-LC3')) = 'LC-D3', 'L0: البحث يعرض رقم موظف السائق';
  assert (select driver_has_biometric from public.garage_search_vehicles('DB-LC1')) = true, 'L0: مؤشر البصمة في البحث';
  raise notice 'L0 ok';
end $$;

-- ═══════════ L1 · الانطلاقة من الكراج (تعيين تلقائي للمسؤول) ═══════════
do $$
declare d public.garage_departures; v uuid := 'c0c0a000-0000-0000-0000-000000000001';
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000001');
  d := public.garage_record_shift_departure(v, 'morning', 'انطلاقة الاختبار');
  assert d.recipient_manager_id = 'c0c00000-0000-0000-0000-000000000002', 'L1: المسؤول التلقائي = مسؤول المنطقة 4';
  assert d.assignment_mode = 'auto', 'L1: نمط التعيين تلقائي';
  assert d.driver_name = 'سائق الدورة' and d.sector_id = 4 and d.driver_employee_id = 'c0c00000-0000-0000-0000-0000000000d1', 'L1: السائق (وهويته) والقاطع من إسناد الشفت';
  assert exists (select 1 from public.notifications where user_id = d.recipient_manager_id and entity_id = d.id), 'L1: إشعار للمسؤول';
  perform set_config('test.dep', d.id::text, false);
  -- لا انطلاقة ثانية لنفس الآلية
  perform pg_temp.expect_error(format('select public.garage_record_shift_departure(%L,%L)', v, 'morning'), 'GARAGE_DEPARTURE_ALREADY_OPEN');
  -- الكراج لا يستطيع إغلاقها قبل أن يرسلها المسؤول
  perform pg_temp.expect_error(format('select public.garage_record_return(%L)', d.id), 'GARAGE_VEHICLE_NOT_SENT_BACK');
  -- المسؤول: لا محطة ولا صيانة ولا كراج قبل تأكيد الوصول
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format('select public.sector_send_vehicle_to_station(%L)', d.id), 'TRIP_NOT_AT_MANAGER_SITE');
  perform pg_temp.expect_error(format('select public.sector_send_vehicle_to_garage(%L)', d.id), 'GARAGE_ARRIVAL_NOT_CONFIRMED');
  -- مسؤول قاطع آخر لا يستطيع تأكيد الوصول
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000006');
  perform pg_temp.expect_error(format('select public.sector_confirm_vehicle_arrival(%L)', d.id), 'GARAGE_ARRIVAL_NOT_ALLOWED');
  raise notice 'L1 ok';
end $$;

-- ═══════════ L2 · وصول موقع العمل ═══════════
do $$
declare d public.garage_departures; did uuid := current_setting('test.dep')::uuid;
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  d := public.sector_confirm_vehicle_arrival(did, 'وصلت');
  assert d.arrived_at is not null and d.arrived_by = 'c0c00000-0000-0000-0000-000000000002', 'L2: الوصول مؤكد';
  perform pg_temp.expect_error(format('select public.sector_confirm_vehicle_arrival(%L)', did), 'GARAGE_ARRIVAL_NOT_ALLOWED');
  -- توقيتات قابلة للقياس: انطلقت قبل 300 د، وصلت قبل 280 د (حركة 20 د)
  update public.garage_departures set departed_at = now() - interval '300 min', arrived_at = now() - interval '280 min' where id = did;
  raise notice 'L2 ok';
end $$;

-- ═══════════ L3 · زيارة المحطة الأولى: وزن سليم ═══════════
do $$
declare l public.vehicle_trip_legs; l2 public.vehicle_trip_legs; s public.ts_visit_weighing_steps; did uuid := current_setting('test.dep')::uuid;
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  l := public.sector_send_vehicle_to_station(did, 'حمولة كاملة');
  assert l.sequence_no = 1 and l.origin_type = 'work_site' and l.destination_type = 'transfer_station', 'L3: ساق 1 إلى المحطة';
  perform pg_temp.expect_error(format('select public.sector_send_vehicle_to_station(%L)', did), 'TRIP_LEG_ALREADY_OPEN');
  perform pg_temp.expect_error(format('select public.sector_send_vehicle_to_garage(%L)', did), 'TRIP_LEG_ALREADY_OPEN');
  assert exists (select 1 from public.notifications where user_id = 'c0c00000-0000-0000-0000-000000000003' and title like '%المحطة%'), 'L3: إشعار المحطة';
  -- المحطة: لا وزن قبل الوصول
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error(format('select public.ts_record_weighing(%L, 7)', l.id), 'STATION_VISIT_NOT_ARRIVED');
  perform public.station_confirm_vehicle_arrival(l.id, 'وصلت المحطة');
  -- الخروج بلا وزن ممنوع (الوزن يدوي إلزامي قبل الخروج)
  perform pg_temp.expect_error(format('select public.station_dispatch_vehicle(%L, %L)', did, 'work_site'), 'STATION_WEIGHING_REQUIRED');
  perform public.ts_record_weighing(l.id, 7.2);
  perform pg_temp.expect_error(format('select public.station_dispatch_vehicle(%L, %L)', did, 'work_site'), 'STATION_WEIGHING_REQUIRED');
  s := public.ts_complete_weighing(l.id, 'transfer_station', 'compactor_large');
  assert s.violation = false and s.deficit_tons is null, 'L3: 7.2 طن ≥ 6 ⇒ لا مخالفة';
  assert exists (select 1 from public.ts_weight_records where db_number = 'DB-LC1' and net_weight = 7.2), 'L3: صف الدفتر التلقائي';
  -- توقيت: غادرت الموقع قبل 200 د، وصلت المحطة قبل 190 د (حركة 10)، مكثت حتى قبل 160 د (محطة 30)
  update public.vehicle_trip_legs set departed_at = now() - interval '200 min', arrived_at = now() - interval '190 min' where id = l.id;
  l2 := public.station_dispatch_vehicle(did, 'work_site', 'عودة للموقع');
  assert l2.sequence_no = 2 and l2.origin_type = 'transfer_station' and l2.destination_type = 'work_site', 'L3: ساق 2 عائدة';
  update public.vehicle_trip_legs set departed_at = now() - interval '160 min' where id = l2.id;
  -- المسؤول يؤكد العودة للموقع (قبل 150 د ⇒ حركة 10)
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  perform public.sector_confirm_vehicle_site_return(l2.id, 'عادت');
  update public.vehicle_trip_legs set arrived_at = now() - interval '150 min' where id = l2.id;
  raise notice 'L3 ok';
end $$;

-- ═══════════ L4 · زيارة المحطة الثانية: نقص وزن ⇒ مخالفة + تنبيه غرفة العمليات ═══════════
do $$
declare l public.vehicle_trip_legs; l2 public.vehicle_trip_legs; s public.ts_visit_weighing_steps; did uuid := current_setting('test.dep')::uuid;
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  l := public.sector_send_vehicle_to_station(did);
  assert l.sequence_no = 3, 'L4: ساق 3';
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000003');
  perform public.station_confirm_vehicle_arrival(l.id);
  perform public.ts_record_weighing(l.id, 4.5);
  s := public.ts_complete_weighing(l.id, 'press', 'compactor_large');
  assert s.violation = true and s.deficit_tons = 1.5, 'L4: 4.5 < 6 ⇒ مخالفة بنقص 1.5';
  assert exists (select 1 from public.ts_violations where visit_leg_id = l.id and deficit_tons = 1.5), 'L4: سجل مخالفة';
  assert exists (select 1 from public.notifications where user_id = 'c0c00000-0000-0000-0000-000000000005' and title like '%مخالفة وزن%'), 'L4: تنبيه غرفة العمليات';
  -- لا تعديل وزن بعد الإكمال
  perform pg_temp.expect_error(format('select public.ts_record_weighing(%L, 9)', l.id), 'STATION_WEIGHING_COMPLETED');
  update public.vehicle_trip_legs set departed_at = now() - interval '140 min', arrived_at = now() - interval '135 min' where id = l.id;
  l2 := public.station_dispatch_vehicle(did, 'work_site');
  update public.vehicle_trip_legs set departed_at = now() - interval '120 min' where id = l2.id;
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  perform public.sector_confirm_vehicle_site_return(l2.id);
  update public.vehicle_trip_legs set arrived_at = now() - interval '115 min' where id = l2.id;
  raise notice 'L4 ok';
end $$;

-- ═══════════ L5 · الصيانة: بلاغ → وصول → المراحل الخمس → عودة للموقع ═══════════
do $$
declare c public.vehicle_maintenance_cases; l public.vehicle_trip_legs; did uuid := current_setting('test.dep')::uuid; v uuid := 'c0c0a000-0000-0000-0000-000000000001'; cid uuid;
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  c := public.sector_send_vehicle_to_maintenance(did, 'عطل هيدروليك', 'urgent', 'ضغط منخفض');
  cid := c.id; perform set_config('test.case', cid::text, false);
  assert c.status = 'to_maintenance' and c.vehicle_id = v and c.breakdown_id is not null, 'L5: حالة صيانة مفتوحة مع بلاغ عطل';
  assert (select count(*) from public.vehicle_maintenance_stages where case_id = cid) = 5, 'L5: خمس مراحل';
  assert exists (select 1 from public.vehicle_trip_legs where departure_id = did and destination_type = 'maintenance' and arrived_at is null), 'L5: ساق مفتوحة إلى الصيانة';
  perform pg_temp.expect_error(format('select public.sector_send_vehicle_to_station(%L)', did), 'TRIP_LEG_ALREADY_OPEN');
  -- الكراج لا يطلق آلية ثانية لنفس المركبة وهي في الصيانة (بعد إغلاق الانطلاقة يُختبر لاحقاً)
  -- الصيانة: لا تقدّم قبل تأكيد الوصول
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error(format('select public.maintenance_advance_stage(%L, %L)', cid, 'تشخيص مبكر'), 'MAINTENANCE_ARRIVAL_REQUIRED');
  c := public.maintenance_confirm_arrival(cid, 'وصلت الورشة');
  assert c.status = 'diagnosing' and c.arrived_at is not null, 'L5: وصول الصيانة';
  assert not exists (select 1 from public.vehicle_trip_legs where departure_id = did and arrived_at is null), 'L5: ساق الصيانة أُغلقت بالوصول';
  update public.vehicle_maintenance_cases set reported_at = now() - interval '110 min', arrived_at = now() - interval '100 min' where id = cid;
  update public.vehicle_trip_legs set departed_at = now() - interval '110 min', arrived_at = now() - interval '100 min' where departure_id = did and destination_type = 'maintenance';
  -- المراحل: التشخيص يتطلب نصاً
  perform pg_temp.expect_error(format('select public.maintenance_advance_stage(%L, %L)', cid, 'قص'), 'MAINTENANCE_DIAGNOSIS_REQUIRED');
  c := public.maintenance_advance_stage(cid, 'تلف خرطوم الهيدروليك الرئيسي');
  assert c.status = 'in_repair' and c.diagnosis like 'تلف%', 'L5: التشخيص → قيد الإصلاح';
  c := public.maintenance_advance_stage(cid, null, 'استُبدل الخرطوم');
  assert (select status from public.vehicle_maintenance_stages where case_id = cid and stage_key = 'inspection') = 'active', 'L5: مرحلة الفحص نشطة';
  -- الجاهزية تتطلب 100% + ملاحظات عمل
  perform pg_temp.expect_error(format('select public.maintenance_approve_readiness(%L)', cid), 'MAINTENANCE_READINESS_NOT_APPROVABLE');
  perform public.maintenance_update_case(cid, 'ready', 100, null, 'اكتمل الإصلاح والفحص');
  perform pg_temp.expect_error(format('select public.maintenance_dispatch_vehicle(%L, %L)', cid, 'work_site'), 'MAINTENANCE_READINESS_APPROVAL_REQUIRED');
  c := public.maintenance_approve_readiness(cid, 'جاهزة');
  assert c.readiness_approved_at is not null, 'L5: اعتماد الجاهزية';
  c := public.maintenance_dispatch_vehicle(cid, 'work_site', 'عودة للعمل');
  assert c.status = 'to_work' and c.departed_maintenance_at is not null, 'L5: في الطريق للعمل';
  update public.vehicle_maintenance_cases set departed_maintenance_at = now() - interval '40 min' where id = cid;
  select * into l from public.vehicle_trip_legs where departure_id = did and arrived_at is null;
  assert l.origin_type = 'maintenance' and l.destination_type = 'work_site', 'L5: ساق العودة من الصيانة';
  update public.vehicle_trip_legs set departed_at = now() - interval '40 min' where id = l.id;
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  perform public.sector_confirm_vehicle_site_return(l.id, 'عادت من الصيانة');
  update public.vehicle_trip_legs set arrived_at = now() - interval '30 min' where id = l.id;
  select * into c from public.vehicle_maintenance_cases where id = cid;
  assert c.status = 'returned_to_work' and c.completed_at is not null, 'L5: الحالة أُغلقت بالعودة للعمل';
  update public.vehicle_maintenance_cases set completed_at = now() - interval '30 min' where id = cid;
  assert (select status from public.sector_breakdowns where id = c.breakdown_id) = 'resolved', 'L5: بلاغ العطل محلول';
  update public.sector_breakdowns set created_at = now() - interval '110 min', resolved_at = now() - interval '30 min' where id = c.breakdown_id;
  raise notice 'L5 ok';
end $$;

-- ═══════════ L6 · إنهاء الوردية والعودة إلى الكراج ═══════════
do $$
declare d public.garage_departures; did uuid := current_setting('test.dep')::uuid;
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  d := public.sector_send_vehicle_to_garage(did, 'انتهت الوردية');
  assert d.site_departed_at is not null, 'L6: غادرت الموقع نحو الكراج';
  update public.garage_departures set site_departed_at = now() - interval '20 min' where id = did;
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000001');
  d := public.garage_record_return(did);
  assert d.returned_at is not null and d.returned_by = 'c0c00000-0000-0000-0000-000000000001', 'L6: الكراج أغلق الانطلاقة';
  perform pg_temp.expect_error(format('select public.garage_record_return(%L)', did), 'GARAGE_OPEN_DEPARTURE_NOT_FOUND');
  -- سلامة السيقان: تسلسل متصل بلا ساق مفتوحة
  assert (select array_agg(sequence_no order by sequence_no) from public.vehicle_trip_legs where departure_id = did) = '{1,2,3,4,5,6}', 'L6: 6 سيقان متسلسلة';
  assert not exists (select 1 from public.vehicle_trip_legs where departure_id = did and arrived_at is null), 'L6: لا ساق مفتوحة';
  -- يمكن إطلاق الآلية مجدداً بعد الإغلاق
  d := public.garage_record_shift_departure('c0c0a000-0000-0000-0000-000000000001', 'morning');
  perform set_config('test.dep2', d.id::text, false);
  raise notice 'L6 ok';
end $$;

-- ═══════════ L7 · تقارير غرفة العمليات تعكس الدورة بدقة ═══════════
do $$
declare did uuid := current_setting('test.dep')::uuid; k record; n int; t record;
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000005');
  select * into k from public.operational_vehicle_kpis(current_date - 1, current_date) where departure_id = did;
  assert k.departure_id is not null, 'L7: الانطلاقة في مؤشرات الآليات';
  assert k.station_visit_count = 2 and k.maintenance_count = 1 and k.breakdown_count = 1, format('L7: عدّادات (محطة %s صيانة %s أعطال %s)', k.station_visit_count, k.maintenance_count, k.breakdown_count);
  assert k.total_minutes between 299 and 301, format('L7: الإجمالي 300 د (فعلي %s)', k.total_minutes);
  -- الحركة: كراج→موقع 20 + موقع→محطة 10 + محطة→موقع 10 + موقع→محطة 5 + محطة→موقع 5 + موقع→صيانة 10 + صيانة→موقع 10 + موقع→كراج 20 = 90
  assert k.movement_minutes between 89 and 91, format('L7: الحركة 90 د (فعلي %s)', k.movement_minutes);
  assert k.station_minutes between 44 and 46, format('L7: المحطة 30+15=45 د (فعلي %s)', k.station_minutes);
  -- العمل المنتج داخل الموقع: 80 + 10 + 5 + 10 = 105، ولا «غير مصنف» لأن كل دقيقة معلومة
  assert k.productive_minutes between 104 and 106, format('L7: العمل المنتج 105 د (فعلي %s)', k.productive_minutes);
  assert k.other_minutes = 0, format('L7: لا دقائق غير مصنفة (فعلي %s)', k.other_minutes);
  assert k.downtime_minutes between 79 and 81, format('L7: تعطل البلاغ 80 د (فعلي %s)', k.downtime_minutes);
  assert k.maintenance_minutes between 59 and 61, format('L7: الصيانة 100→40 = 60 د (فعلي %s)', k.maintenance_minutes);
  assert k.movement_minutes + k.productive_minutes + k.station_minutes + k.maintenance_minutes + k.other_minutes = k.total_minutes, 'L7: مجموع الأجزاء = الإجمالي';
  assert k.productive_minutes >= 0 and k.other_minutes >= 0, 'L7: لا قيم سالبة';
  -- الرحلات
  select * into t from public.operational_garage_trips(current_date - 1, current_date) where id = did;
  assert t.total_minutes between 299 and 301 and t.returned_at is not null, 'L7: رحلة الكراج مغلقة بإجمالي 300';
  -- زيارات المحطة
  select count(*) into n from public.operational_station_visits(current_date - 1, current_date) where departure_id = did;
  assert n = 2, format('L7: زيارتا محطة (فعلي %s)', n);
  -- سير عمل المحطة اليومي + مخالفة واحدة
  select count(*) into n from public.ops_station_workflow(current_date) where departure_id = did;
  assert n = 2, format('L7: سير عمل المحطة زيارتان (فعلي %s)', n);
  select count(*) into n from public.ts_violations_list(current_date) where db_number = 'DB-LC1';
  assert n = 1, format('L7: مخالفة واحدة (فعلي %s)', n);
  -- الحركات + السيقان
  select count(*) into n from public.operational_vehicle_movements(current_date - 1, current_date) where departure_id = did;
  assert n = 6, format('L7: 6 حركات (فعلي %s)', n);
  -- حالات الصيانة
  assert exists (select 1 from public.operational_maintenance_cases(current_date - 1, current_date) where departure_id = did and status = 'returned_to_work'), 'L7: حالة الصيانة في التقرير';
  -- لا تنبيهات حية لانطلاقة مغلقة
  assert not exists (select 1 from public.operational_live_alerts() where departure_id = did), 'L7: لا تنبيهات للانطلاقة المغلقة';
  raise notice 'L7 ok';
end $$;

-- ═══════════ L8 · التنبيهات الحية: تأخر الوصول من الكراج + بقاء طويل في المحطة ═══════════
do $$
declare did2 uuid := current_setting('test.dep2')::uuid; a record; d public.garage_departures; l public.vehicle_trip_legs;
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000005');
  update public.garage_departures set departed_at = now() - interval '130 min' where id = did2;
  select * into a from public.operational_live_alerts() where departure_id = did2 and alert_type = 'garage_arrival_delay';
  assert a.severity = 'critical' and a.elapsed_minutes >= 130, 'L8: تنبيه حرج لتأخر الوصول';
  assert (select count(*) from public.operational_live_alerts(4::smallint, 'morning', 'critical') where departure_id = did2) = 1, 'L8: فلاتر القاطع/الشفت/الشدة';
  assert (select count(*) from public.operational_live_alerts(8::smallint) where departure_id = did2) = 0, 'L8: قاطع آخر لا يرى التنبيه';
  -- آلية ثانية تصل وتذهب للمحطة وتمكث طويلاً
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000001');
  d := public.garage_record_shift_departure('c0c0a000-0000-0000-0000-000000000002', 'morning');
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  perform public.sector_confirm_vehicle_arrival(d.id);
  l := public.sector_send_vehicle_to_station(d.id);
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000003');
  perform public.station_confirm_vehicle_arrival(l.id);
  update public.vehicle_trip_legs set departed_at = now() - interval '80 min', arrived_at = now() - interval '70 min' where id = l.id;
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000005');
  assert exists (select 1 from public.operational_live_alerts() where departure_id = d.id and alert_type = 'station_stay_delay' and severity = 'warning'), 'L8: تنبيه بقاء في المحطة';
  raise notice 'L8 ok';
end $$;

-- ═══════════ L9 · العزل: غير غرفة العمليات لا يقرأ التقارير ═══════════
do $$
begin
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error('select * from public.operational_vehicle_kpis(current_date, current_date)', 'OPS_ROOM_FORBIDDEN');
  perform pg_temp.expect_error('select * from public.operational_live_alerts()', 'OPS_ROOM_FORBIDDEN');
  perform pg_temp.as_user('c0c00000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error('select * from public.operational_garage_trips(current_date, current_date)', 'OPS_ROOM_FORBIDDEN');
  raise notice 'L9 ok';
end $$;
