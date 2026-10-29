-- اختبار 00274: توحيد أسطول المحطة التحويلية — الفئات، آلية المحطة، الوجهات، السائقون، تسجيل الخروج، الوصول الآلي
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);

insert into auth.users (id, email) values
  ('ee000000-0000-0000-0000-000000000001', 'ops-sf@t.iq'),
  ('ee000000-0000-0000-0000-000000000002', 'station-sf@t.iq'),
  ('ee000000-0000-0000-0000-000000000003', 'garage-sf@t.iq'),
  ('ee000000-0000-0000-0000-000000000004', 'ops2-sf@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ee000000-0000-0000-0000-000000000001', 'ops_room'),
  ('ee000000-0000-0000-0000-000000000002', 'transfer_station'),
  ('ee000000-0000-0000-0000-000000000003', 'central_garage_officer'),
  ('ee000000-0000-0000-0000-000000000004', 'ops_room') on conflict do nothing;
insert into public.garage_user_profiles (user_id, parent_sector) values ('ee000000-0000-0000-0000-000000000003', 'zaafaraniya') on conflict (user_id) do nothing;
-- 00375: حساب متعهد في النظام (بوابة المتعهدين) لربط سائقي المتعهدين
insert into auth.users (id, email) values ('ee000000-0000-0000-0000-00000000000c', 'cont-sf@t.iq'), ('ee000000-0000-0000-0000-00000000000d', 'mgr-sf@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('ee000000-0000-0000-0000-00000000000c', 'employee'), ('ee000000-0000-0000-0000-00000000000d', 'department_manager') on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('ee000000-0000-0000-0000-00000000000d', 'morning', '{1}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone) values ('ee0e0000-0000-0000-0000-00000000000c', 'ee000000-0000-0000-0000-00000000000c', 'SF-CT-1', 'متعهد النقل السريع', '2024-01-01', '0770') on conflict (id) do nothing;
insert into public.contractor_profiles (user_id, manager_user_id, sector_id) values ('ee000000-0000-0000-0000-00000000000c', 'ee000000-0000-0000-0000-00000000000d', 1) on conflict (user_id) do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (94, 'S94', 'قاطع المحطة', 94::smallint, 'karrada') on conflict (id) do nothing;
insert into public.departments (id, name, code) values ('ee0d0000-0000-0000-0000-0000000000a1', 'قسم المحطة SF', 'SFD') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('ee0d0000-0000-0000-0000-0000000000a2', 'سائق نسافة', 'SFT1', 'ee0d0000-0000-0000-0000-0000000000a1', true, true),
  ('ee0d0000-0000-0000-0000-0000000000a3', 'كاتب محطة', 'SFT2', 'ee0d0000-0000-0000-0000-0000000000a1', true, false) on conflict do nothing;
insert into public.employees (id, employee_number, full_name, hire_date, phone, job_title_id) values
  ('ee0e0000-0000-0000-0000-000000000001', 'SF-DRV-1', 'سائق موظف محطة', current_date, '07700000001', 'ee0d0000-0000-0000-0000-0000000000a2'),
  ('ee0e0000-0000-0000-0000-000000000002', 'SF-CLK-1', 'موظف غير سائق', current_date, '07700000002', 'ee0d0000-0000-0000-0000-0000000000a3'),
  ('ee0e0000-0000-0000-0000-000000000003', 'SF-DRV-2', 'سائق موظف 2', current_date, '07700000003', 'ee0d0000-0000-0000-0000-0000000000a2'),
  ('ee0e0000-0000-0000-0000-000000000004', 'SF-DRV-3', 'سائق موظف 3', current_date, '07700000004', 'ee0d0000-0000-0000-0000-0000000000a2') on conflict (id) do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ A) الفئات الموحّدة ═══
do $$
declare n int; k record;
begin
  select count(*) into n from public.vehicle_categories where code in ('nasafa','container_carrier','six') and station_outbound;
  assert n = 3, 'A1: فئات الخروج الثلاث';
  select count(*) into n from public.ts_vehicle_kinds; assert n = 7, 'A2: view أنواع الوزن = 7 (الفئات ذات وجهة وزن فقط) got ' || n;
  select * into k from public.ts_vehicle_kinds where kind = 'six'; assert k.min_tons = 10 and k.destination = 'transfer_station', 'A3: سكس كما كان';
  -- حفظ نوع وزن بالتوقيع القديم يحافظ على station_outbound
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  perform public.ops_ts_vehicle_kind_save('six', 'سكس', 11, null, 'transfer_station', 7, true);
  select * into k from public.vehicle_categories where code = 'six'; assert k.min_tons = 11 and k.station_outbound, 'A4: التوافق القديم';
  perform public.ops_vehicle_category_save('six', 'سكس', 10, null, 'transfer_station', true, true, 7, true);
  -- فئة جديدة بلا وزن
  perform public.ops_vehicle_category_save('water_truck', 'حوضية', null, null, null, true, false, 30, true);
  select count(*) into n from public.ts_vehicle_kinds where kind = 'water_truck'; assert n = 0, 'A5: فئة بلا وزن لا تظهر في أنواع الوزن';
  perform pg_temp.expect_error($q$select public.ops_vehicle_category_save('bad', 'سيئة', null, null, 'press', true, false, 0, true)$q$, 'TS_KIND_MIN_INVALID');
  perform pg_temp.expect_error($q$select public.ops_vehicle_category_save('other', 'أخرى', null, null, null, true, false, 99, false)$q$, 'VEHICLE_CATEGORY_OTHER_LOCKED');
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error($q$select public.ops_vehicle_category_save('x_station', 'س', null, null, null, true, false, 0, true)$q$, 'OPS_ROOM_FORBIDDEN');
  raise notice 'A ✓ الفئات الموحّدة';
end $$;

-- ═══ B) الكراج يقبل الفئات الجديدة ويرفض المجهولة/الموقوفة ═══
do $$
declare v public.garage_vehicles; v2 public.garage_vehicles; v3 public.garage_vehicles;
begin
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  v := public.garage_add_vehicle('نسافة 1', 'DB-SF1', 'P-SF1', 'CH-SF0001', 'ee000000-0000-0000-0000-000000000001/n1.jpg', 'morning', 'ee0e0000-0000-0000-0000-000000000001'::uuid, 94::smallint, 'nasafa', 'owned');
  assert v.vehicle_category = 'nasafa' and not v.is_station_vehicle, 'B1: نسافة أُضيفت';
  v2 := public.garage_add_vehicle('ناقلة 1', 'DB-SF2', 'P-SF2', 'CH-SF0002', 'ee000000-0000-0000-0000-000000000001/c1.jpg', 'morning', 'ee0e0000-0000-0000-0000-000000000003'::uuid, 94::smallint, 'container_carrier', 'rented', 'شركة النقل');
  v3 := public.garage_add_vehicle('كابسة 1', 'DB-SF3', 'P-SF3', 'CH-SF0003', 'ee000000-0000-0000-0000-000000000001/k1.jpg', 'morning', 'ee0e0000-0000-0000-0000-000000000004'::uuid, 94::smallint, 'compactor_large', 'owned');
  perform pg_temp.expect_error($q$select public.garage_add_vehicle('x', 'DB-SFX', 'P-SFX', 'CH-SFX001', 'ee000000-0000-0000-0000-000000000001/x.jpg', 'morning', 'ee0e0000-0000-0000-0000-000000000001'::uuid, 94::smallint, 'spaceship', 'owned')$q$, 'GARAGE_VEHICLE_CATEGORY_INVALID');
  perform public.ops_vehicle_category_save('water_truck', 'حوضية', null, null, null, true, false, 30, false);
  perform pg_temp.expect_error($q$select public.garage_add_vehicle('x', 'DB-SFX', 'P-SFX', 'CH-SFX001', 'ee000000-0000-0000-0000-000000000001/x.jpg', 'morning', 'ee0e0000-0000-0000-0000-000000000001'::uuid, 94::smallint, 'water_truck', 'owned')$q$, 'GARAGE_VEHICLE_CATEGORY_INVALID');
  perform pg_temp.expect_error(format($q$select public.garage_update_vehicle('%s', 'نسافة 1', 'DB-SF1', 'P-SF1', 'CH-SF0001', null, 'spaceship', 'owned')$q$, v.id), 'GARAGE_VEHICLE_CATEGORY_INVALID');
  perform public.garage_update_vehicle(v.id, 'نسافة 1', 'DB-SF1', 'P-SF1', 'CH-SF0001', null::text, 'nasafa', 'owned');
  -- حفظ المعرّفات للمراحل التالية
  perform set_config('t.v_nasafa', v.id::text, false); perform set_config('t.v_carrier', v2.id::text, false); perform set_config('t.v_compactor', v3.id::text, false);
  raise notice 'B ✓ الكراج والفئات';
end $$;

-- ═══ C) علامة آلية المحطة + رؤية المحطة ═══
do $$
declare n int; vn uuid := current_setting('t.v_nasafa')::uuid; vc uuid := current_setting('t.v_carrier')::uuid;
begin
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format($q$select public.garage_set_station_vehicle('%s', true)$q$, vn), 'OPS_ROOM_FORBIDDEN');
  set role authenticated;
  select count(*) into n from public.garage_vehicles where id in (vn, vc); assert n = 0, 'C1: المحطة لا ترى آليات غير معلّمة';
  reset role;
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  perform public.garage_set_station_vehicle(vn, true); perform public.garage_set_station_vehicle(vc, true);
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  set role authenticated;
  select count(*) into n from public.garage_vehicles where id in (vn, vc); assert n = 2, 'C2: المحطة ترى آلياتها';
  select count(*) into n from public.station_fleet_list(); assert n = 2, 'C3: أسطول المحطة = 2';
  reset role;
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000003');
  set role authenticated;
  select count(*) into n from public.garage_vehicles where id = vn; assert n = 0, 'C4: ضابط كراج الزعفرانية لا يرى آلية الكرادة';
  reset role;
  raise notice 'C ✓ آلية المحطة';
end $$;

-- ═══ D) الوجهات والسائقون الخارجيون ═══
do $$
declare n int; d public.station_destinations; x public.station_external_drivers; gid uuid;
begin
  select count(*) into n from public.station_destinations where name in ('النهروان','النباعي') and active; assert n = 2, 'D1: الوجهتان الافتراضيتان';
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error($q$select public.station_destination_save(null, 'وجهة', null, 0, true)$q$, 'OPS_ROOM_FORBIDDEN');
  perform pg_temp.expect_error($q$select public.station_external_driver_save_v2(null, 'س', 'ee000000-0000-0000-0000-00000000000c')$q$, 'OPS_ROOM_FORBIDDEN');
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  -- زون النهروان: مربع حول (33.30, 44.60)
  gid := public.gps_platform_geofence_save(null, 'زون النهروان', '[{"lat":33.29,"lng":44.59},{"lat":33.31,"lng":44.59},{"lat":33.31,"lng":44.61},{"lat":33.29,"lng":44.61}]'::jsonb, '#06b6d4');
  d := public.station_destination_save('00000000-0000-4000-8000-00000000d001', 'النهروان', gid, 1, true);
  assert d.geofence_id = gid, 'D2: ربط الزون';
  perform pg_temp.expect_error($q$select public.station_destination_save(null, 'النباعي', null, 0, true)$q$, 'STATION_DESTINATION_DUPLICATE');
  perform pg_temp.expect_error($q$select public.station_destination_save(null, 'وجهة', '00000000-0000-4000-8000-0000000000ff', 0, true)$q$, 'STATION_DESTINATION_ZONE_NOT_FOUND');
  x := public.station_external_driver_save_v2(null, 'سائق خارجي', 'ee000000-0000-0000-0000-00000000000c', '07801234567', 'L-1');
  assert x.active and x.contractor_name = 'متعهد النقل السريع' and x.contractor_user_id = 'ee000000-0000-0000-0000-00000000000c', 'D3: سائق خارجي مرتبط بحساب المتعهد';
  perform pg_temp.expect_error($q$select public.station_external_driver_save_v2(null, 'سائق', 'ee000000-0000-0000-0000-00000000000c', 'abc')$q$, 'STATION_DRIVER_PHONE_INVALID');
  -- 00375: لا متعهد نصّاً حراً ولا حساب غير متعهد
  perform pg_temp.expect_error($q$select public.station_external_driver_save(null, 'سائق', 'متعهد نصي')$q$, 'STATION_DRIVER_CONTRACTOR_ACCOUNT_REQUIRED');
  perform pg_temp.expect_error($q$select public.station_external_driver_save_v2(null, 'سائق', 'ee000000-0000-0000-0000-000000000003')$q$, 'STATION_DRIVER_CONTRACTOR_REQUIRED');
  perform set_config('t.x_driver', x.id::text, false);
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  select count(*) into n from public.station_destinations_list() l where l.name = 'النهروان' and l.has_zone; assert n = 1, 'D4: المحطة ترى الوجهة مع زون';
  select count(*) into n from public.station_drivers_list() l where l.driver_kind = 'employee' and l.ref_id = 'ee0e0000-0000-0000-0000-000000000001'; assert n = 1, 'D5: السائق الموظف في القائمة';
  select count(*) into n from public.station_drivers_list() l where l.ref_id = 'ee0e0000-0000-0000-0000-000000000002'; assert n = 0, 'D6: غير السائق ليس في القائمة';
  select count(*) into n from public.station_drivers_list() l where l.driver_kind = 'external' and l.ref_id = x.id; assert n = 1, 'D7: الخارجي في القائمة';
  raise notice 'D ✓ الوجهات والسائقون';
end $$;

-- ═══ E) تسجيل الخروج ═══
insert into public.gps_providers (id, name, type) values ('ee0db000-0000-0000-0000-000000000001', 'SF provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values
  ('ee0dc000-0000-0000-0000-000000000001', 'ee0db000-0000-0000-0000-000000000001', 'SF-DEV1', 'جهاز SF1', 'online') on conflict (id) do nothing;
do $$
declare r jsonb; vn uuid := current_setting('t.v_nasafa')::uuid; vc uuid := current_setting('t.v_carrier')::uuid; vk uuid := current_setting('t.v_compactor')::uuid;
        xd uuid := current_setting('t.x_driver')::uuid; dest uuid := '00000000-0000-4000-8000-00000000d001'; n int; s public.ts_saksat_records;
begin
  insert into public.gps_vehicle_bindings (device_id, garage_vehicle_id, match_method) values ('ee0dc000-0000-0000-0000-000000000001', vn, 'manual');
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'employee', '%s', 'ee0e0000-0000-0000-0000-000000000001')$q$, vn, dest), 'PERMISSION_DENIED');
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'employee', '%s', 'ee0e0000-0000-0000-0000-000000000001')$q$, vk, dest), 'STATION_VEHICLE_NOT_STATION');
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001'); perform public.garage_set_station_vehicle(vk, true); perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'employee', '%s', 'ee0e0000-0000-0000-0000-000000000001')$q$, vk, dest), 'STATION_VEHICLE_CATEGORY_NOT_OUTBOUND');
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'employee', '%s', 'ee0e0000-0000-0000-0000-000000000002')$q$, vn, dest), 'FLEET_DRIVER_NOT_DRIVER_TITLE');
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'employee', '00000000-0000-4000-8000-0000000000ff', 'ee0e0000-0000-0000-0000-000000000001')$q$, vn), 'STATION_DESTINATION_NOT_FOUND');
end $$;
do $$
declare r jsonb; vn uuid := current_setting('t.v_nasafa')::uuid; vc uuid := current_setting('t.v_carrier')::uuid;
        xd uuid := current_setting('t.x_driver')::uuid; dest uuid := '00000000-0000-4000-8000-00000000d001'; n int; s public.ts_saksat_records; c public.ts_carrier_records;
begin
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  -- 1) نسافة بسائق موظف + GPS مرتبط ⇒ تتبع gps، لا إشعار «بلا تتبع»
  r := public.station_record_exit(vn, 'employee', dest, 'ee0e0000-0000-0000-0000-000000000001');
  assert r->>'table' = 'ts_saksat_records' and r->>'tracking' = 'gps' and r->>'driver_name' = 'سائق موظف محطة', 'E1: ' || r::text;
  select * into s from public.ts_saksat_records where id = (r->>'id')::uuid;
  assert s.vehicle_id = vn and s.driver_kind = 'employee' and s.destination_id = dest and s.device_id = 'ee0dc000-0000-0000-0000-000000000001' and s.vehicle_type = 'نسافة' and s.arrived_at is null, 'E2: أعمدة الربط';
  select count(*) into n from public.notifications where title = 'خروج آلية بلا تتبع من المحطة'; assert n = 0, 'E3: لا تنبيه بلا تتبع';
  perform set_config('t.exit1', s.id::text, false);
  -- 2) ناقلة بسائق خارجي بلا GPS ⇒ الوزن إلزامي، تتبع none، تنبيه لغرفة العمليات (مستخدمان)
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'external', '%s', null, '%s')$q$, vc, dest, xd), 'STATION_WEIGHT_REQUIRED');
  r := public.station_record_exit(vc, 'external', dest, null, xd, null, 12.5);
  assert r->>'table' = 'ts_carrier_records' and r->>'tracking' = 'none', 'E4: ' || r::text;
  select * into c from public.ts_carrier_records where id = (r->>'id')::uuid;
  assert c.external_driver_id = xd and c.weight_tons = 12.5 and c.driver_name = 'سائق خارجي', 'E5: الناقلة';
  select count(*) into n from public.notifications where title = 'خروج آلية بلا تتبع من المحطة' and user_id in ('ee000000-0000-0000-0000-000000000001','ee000000-0000-0000-0000-000000000004'); assert n = 2, 'E6: تنبيه غرفة العمليات = 2 got ' || n;
  -- 3) متعاقد بالاسم الحر أُغلق في 00377 — السائق من سجل سائقي المتعهدين فقط
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'contracted', '%s', null, null, 'سائق المتعاقد', 9)$q$, vc, dest), 'STATION_DRIVER_KIND_RETIRED');
  r := public.station_record_exit(vc, 'external', dest, null, xd, null, 9);
  assert r->>'driver_name' = 'سائق خارجي', 'E7: خروج ثانٍ بسائق المتعهد من السجل';
  -- 4) سائق خارجي موقوف يُرفض
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  perform public.station_external_driver_save_v2(xd, 'سائق خارجي', 'ee000000-0000-0000-0000-00000000000c', '07801234567', 'L-1', null, null, false);
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'external', '%s', null, '%s', null, 5)$q$, vc, dest, xd), 'STATION_DRIVER_INACTIVE');
  perform pg_temp.expect_error(format($q$select public.station_record_exit('%s', 'robot', '%s')$q$, vn, dest), 'STATION_DRIVER_KIND_INVALID');
  -- 5) السجل الموحّد
  select count(*) into n from public.station_outbound_list(current_date - 1, current_date, true); assert n = 3, 'E8: 3 خروجات مفتوحة got ' || n;
  select count(*) into n from public.station_outbound_list(current_date - 1, current_date, false) l where l.status = 'untracked'; assert n = 2, 'E9: اثنتان بلا تتبع';
  raise notice 'E ✓ تسجيل الخروج';
end $$;

-- ═══ F) الوصول الآلي من GPS ═══
do $$
declare ex uuid := current_setting('t.exit1')::uuid; s public.ts_saksat_records; n int; dev uuid := 'ee0dc000-0000-0000-0000-000000000001';
begin
  -- نقطة خارج الزون ⇒ لا وصول
  insert into public.gps_device_positions (device_id, latitude, longitude, fix_time) values (dev, 33.40, 44.40, now())
    on conflict (device_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, fix_time = excluded.fix_time;
  select * into s from public.ts_saksat_records where id = ex; assert s.arrived_at is null, 'F1: خارج الزون';
  -- نقطة تاريخية قبل الخروج داخل الزون ⇒ لا وصول (قبل الخروج)
  insert into public.gps_device_position_history (device_id, latitude, longitude, fix_time) values (dev, 33.30, 44.60, s.exit_time - interval '2 hours');
  select * into s from public.ts_saksat_records where id = ex; assert s.arrived_at is null, 'F2: نقطة قبل الخروج لا تُحتسب';
  -- نقطة حية داخل زون النهروان ⇒ وصول + إشعار غرفة العمليات
  update public.gps_device_positions set latitude = 33.30, longitude = 44.60, fix_time = now() + interval '1 second' where device_id = dev;
  select * into s from public.ts_saksat_records where id = ex;
  assert s.arrived_at is not null and s.arrival_latitude = 33.30, 'F3: وصلت';
  select count(*) into n from public.notifications where title = 'وصلت الآلية إلى النهروان' and user_id = 'ee000000-0000-0000-0000-000000000001'; assert n = 1, 'F4: إشعار الوصول';
  -- نقطة أخرى داخل الزون لا تكرّر الوصول ولا الإشعار
  update public.gps_device_positions set latitude = 33.301, fix_time = now() + interval '2 second' where device_id = dev;
  select count(*) into n from public.notifications where title = 'وصلت الآلية إلى النهروان'; assert n = 2, 'F5: لا تكرار (مستخدما غرفة العمليات فقط) got ' || n;
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  select count(*) into n from public.station_outbound_list(current_date - 1, current_date, false) l where l.id = ex and l.status = 'arrived' and l.minutes_to_arrival >= 0; assert n = 1, 'F6: السجل يعرض الوصول';
  select count(*) into n from public.station_outbound_list(current_date - 1, current_date, true); assert n = 2, 'F7: مفتوحتان بعد الوصول';
  raise notice 'F ✓ الوصول الآلي';
end $$;

-- ═══ G) 00276: لا إدخال مباشر (القوائم فقط) + القديم محفوظ + قفل حقول الخروج ═══
do $$
declare n int; ex uuid := current_setting('t.exit1')::uuid;
begin
  -- سجل قديم (قبل القفل) يُدرج بصلاحية الخادم لمحاكاة البيانات التاريخية
  insert into public.ts_saksat_records (driver_name, vehicle_type, log_date) values ('سائق قديم', 'سكس', current_date);
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  set role authenticated;
  perform pg_temp.expect_error($q$insert into public.ts_saksat_records (driver_name, vehicle_type, log_date) values ('نص حر', 'سكس', current_date)$q$, 'row-level security');
  perform pg_temp.expect_error($q$insert into public.ts_carrier_records (driver_name, vehicle_type, weight_tons, log_date) values ('نص حر', 'ناقلة', 5, current_date)$q$, 'row-level security');
  perform pg_temp.expect_error(format($q$update public.ts_saksat_records set driver_name = 'تغيير' where id = '%s'$q$, ex), 'STATION_EXIT_FIELDS_LOCKED');
  perform pg_temp.expect_error(format($q$update public.ts_saksat_records set arrived_at = null where id = '%s'$q$, ex), 'STATION_EXIT_FIELDS_LOCKED');
  update public.ts_saksat_records set status = 'submitted_to_deputy', submitted_at = now() where id = ex;  -- الحالة تبقى قابلة للتعديل
  reset role;
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  select count(*) into n from public.station_outbound_list(current_date, current_date, false) l where l.driver_name = 'سائق قديم' and l.status = 'legacy' and l.category_label = 'سكس'; assert n = 1, 'G1: legacy';
  raise notice 'G ✓ القوائم فقط والقديم محفوظ';
end $$;

-- ═══ H) 00275: بحث المرشحين لغرفة العمليات ═══
do $$
declare n int;
begin
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error($q$select * from public.station_fleet_candidates('', false, 60)$q$, 'OPS_ROOM_FORBIDDEN');
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  select count(*) into n from public.station_fleet_candidates('نسافة', false, 60) c where c.is_station_vehicle and c.has_gps; assert n = 1, 'H1: بحث بالفئة';
  select count(*) into n from public.station_fleet_candidates(null, true, 60); assert n = 3, 'H2: آليات المحطة فقط = 3 got ' || n;
  select count(*) into n from public.station_fleet_candidates('DB-SF2', false, 60) c where c.ownership_type = 'rented' and not c.has_gps; assert n = 1, 'H3: بحث بـ DB';
  raise notice 'H ✓ المرشحون';
end $$;

-- ═══ I) 00277: دمج النسافات — الجدول القديم للقراءة فقط + التقرير اليومي يفرز بالفئة ═══
do $$
declare n int; r jsonb;
begin
  -- سجل قديم في جدول النسافات (بصلاحية الخادم لمحاكاة التاريخ)
  insert into public.ts_trips_records (driver_name, vehicle_type, log_date) values ('سائق نسافة قديم', 'نسافة', current_date);
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  set role authenticated;
  perform pg_temp.expect_error($q$insert into public.ts_trips_records (driver_name, vehicle_type, log_date) values ('نص حر', 'نسافة', current_date)$q$, 'row-level security');
  select count(*) into n from public.ts_trips_records where driver_name = 'سائق نسافة قديم'; assert n = 1, 'I1: القديم مقروء للمحطة';
  reset role;
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  r := public.ops_station_daily_report(current_date);
  -- اليوم: نسافة واحدة من الجدول الموحّد (exit1) + نسافة قديمة = 2 · سكس قديم (بلا فئة) = 1 · ناقلتان
  assert (r->'outbound'->'trips'->>'count')::int = 2, 'I2: trips=2 got ' || (r->'outbound'->'trips'->>'count');
  assert (r->'outbound'->'saksat'->>'count')::int = 1, 'I3: saksat=1 got ' || (r->'outbound'->'saksat'->>'count');
  assert (r->'outbound'->'carrier'->>'count')::int = 2, 'I4: carrier=2 got ' || (r->'outbound'->'carrier'->>'count');
  assert (r->'outbound'->'trips'->>'tons')::numeric = 50, 'I5: أطنان النسافات بالحمولة القياسية 25 got ' || (r->'outbound'->'trips'->>'tons');
  assert (r->'outbound'->>'total_count')::int = 5, 'I6: total=5 got ' || (r->'outbound'->>'total_count');
  raise notice 'I ✓ دمج النسافات';
end $$;

reset role; select set_config('auth.user_id','', false);
select 'STATION FLEET UNIFICATION TEST PASSED' as result;

-- ═══ H) 00375: سجل المتعهدين من حسابات النظام، سائق متعهد عند إضافة الآلية ═══
do $$
declare n int; o record; x public.station_external_drivers; v public.garage_vehicles; d record;
begin
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000003');   -- ضابط الكراج يرى المتعهدين ويضيف سائقاً
  select count(*) into n from public.contractor_options() where user_id = 'ee000000-0000-0000-0000-00000000000c';
  assert n = 1, 'H1: حساب المتعهد في الخيارات';
  select * into o from public.contractor_options() where user_id = 'ee000000-0000-0000-0000-00000000000c';
  assert o.full_name = 'متعهد النقل السريع' and o.is_active, 'H1b: اسم المتعهد من الحساب';
  x := public.station_external_driver_save_v2(null, 'سائق المتعهد كرار', 'ee000000-0000-0000-0000-00000000000c', '07811111111');
  assert x.contractor_user_id = 'ee000000-0000-0000-0000-00000000000c', 'H2: ضابط الكراج أضاف سائق متعهد';
  select * into d from public.station_external_drivers_list() l where l.id = x.id;
  assert d.contractor_name = 'متعهد النقل السريع' and cardinality(d.vehicles) = 0, 'H3: القائمة بالحساب';
  -- إضافة آلية بسائق متعهد (غرفة العمليات)
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000001');
  v := public.garage_add_vehicle('قلاب متعهد', 'DB-SF9', 'P-SF9', 'CH-SF0009', 'ee000000-0000-0000-0000-000000000001/q9.jpg', 'morning', null, 94::smallint, 'tipper', 'rented', 'متعهد النقل السريع', null, null, null, null, null, null, x.id);
  assert v.driver_external_id = x.id and v.driver_employee_id is null and v.driver_name = 'سائق المتعهد كرار', 'H4: آلية بسائق متعهد';
  select count(*) into n from public.garage_driver_assignments a where a.vehicle_id = v.id and a.driver_external_id = x.id and a.driver_employee_id is null;
  assert n = 1, 'H5: الإسناد الأول بسائق المتعهد';
  select * into d from public.station_external_drivers_list() l where l.id = x.id;
  assert d.vehicles = array['DB-SF9'], 'H6: آليات السائق في القائمة';
  -- لا سائقان معاً، ولا سائق متعهد موقوف، ولا بلا سائق
  perform pg_temp.expect_error(format($q$select public.garage_add_vehicle('قلاب تجريبي', 'DB-SF10', 'P-SF10', 'CH-SF0010', 'ee000000-0000-0000-0000-000000000001/x.jpg', 'morning', 'ee0e0000-0000-0000-0000-000000000001', 94::smallint, 'tipper', 'owned', null, null, null, null, null, null, null, '%s')$q$, x.id), 'FLEET_DRIVER_ONE_ONLY');
  perform pg_temp.expect_error($q$select public.garage_add_vehicle('قلاب تجريبي', 'DB-SF10', 'P-SF10', 'CH-SF0010', 'ee000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 94::smallint, 'tipper', 'owned')$q$, 'FLEET_DRIVER_REQUIRED');
  perform public.station_external_driver_save_v2(x.id, 'سائق المتعهد كرار', 'ee000000-0000-0000-0000-00000000000c', '07811111111', null, null, null, false);
  perform pg_temp.expect_error(format($q$select public.garage_add_vehicle('قلاب تجريبي', 'DB-SF10', 'P-SF10', 'CH-SF0010', 'ee000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 94::smallint, 'tipper', 'owned', null, null, null, null, null, null, null, '%s')$q$, x.id), 'FLEET_EXTERNAL_DRIVER_NOT_FOUND');
  -- تعديل اسم السائق ينعكس على الآلية
  perform public.station_external_driver_save_v2(x.id, 'كرار المتعهد', 'ee000000-0000-0000-0000-00000000000c', '07811111111', null, null, null, true);
  select driver_name into d from public.garage_vehicles where id = v.id; assert d.driver_name = 'كرار المتعهد', 'H7: اسم السائق يتبع السجل';
  -- المحطة ترى المتعهدين لكن لا تضيف
  perform pg_temp.as_user('ee000000-0000-0000-0000-000000000002');
  select count(*) into n from public.contractor_options(); assert n >= 1, 'H8: المحطة تقرأ';
  perform pg_temp.expect_error($q$select public.station_external_driver_save_v2(null, 'س', 'ee000000-0000-0000-0000-00000000000c')$q$, 'OPS_ROOM_FORBIDDEN');
  raise notice 'H ✓ 00375 سائقو المتعهدين';
end $$;
