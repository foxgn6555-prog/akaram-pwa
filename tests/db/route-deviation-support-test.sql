-- اختبار 00154: زون المنطقة + تنبيه «خرجت من مسارها» + طلبات الدعم بين المسؤولين.
-- مستقل. كل الفحوص assert داخل do $$.
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('d0d00000-0000-0000-0000-000000000001', 'garage-rd@t.iq'),  -- central_garage_officer (karrada)
  ('d0d00000-0000-0000-0000-000000000002', 'mgrA-rd@t.iq'),    -- department_manager (منطقة 4 الجادرية صباحي)
  ('d0d00000-0000-0000-0000-000000000003', 'mgrB-rd@t.iq'),    -- department_manager (منطقة 1 أرخيته صباحي)
  ('d0d00000-0000-0000-0000-000000000005', 'ops-rd@t.iq'),     -- ops_room
  ('d0d00000-0000-0000-0000-000000000007', 'it-rd@t.iq')       -- it_admin
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d0d00000-0000-0000-0000-000000000001', 'central_garage_officer'),
  ('d0d00000-0000-0000-0000-000000000002', 'department_manager'),
  ('d0d00000-0000-0000-0000-000000000003', 'department_manager'),
  ('d0d00000-0000-0000-0000-000000000005', 'ops_room'),
  ('d0d00000-0000-0000-0000-000000000007', 'it_admin')
on conflict do nothing;
insert into public.garage_user_profiles (user_id, parent_sector) values ('d0d00000-0000-0000-0000-000000000001', 'karrada') on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values
  ('d0d00000-0000-0000-0000-000000000002', 'morning', '{4}'), ('d0d00000-0000-0000-0000-000000000003', 'morning', '{1}') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('d0d0d000-0000-0000-0000-000000000001', 'قسم الآليات (RD)', 'RD-FLEET', null, false, false),
  ('d0d0d000-0000-0000-0000-000000000004', 'قسم الإدارة (RD)', 'RD-ADMIN', null, false, false)
on conflict (id) do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('d0d0d000-0000-0000-0000-000000000002', 'سائق كابسة', 'RD-T1', 'd0d0d000-0000-0000-0000-000000000001', true, true),
  ('d0d0d000-0000-0000-0000-000000000005', 'مسؤول قسم', 'RD-T3', 'd0d0d000-0000-0000-0000-000000000004', true, false)
on conflict (id) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, job_title_id) values
  ('d0d00000-0000-0000-0000-0000000000e2', 'd0d00000-0000-0000-0000-000000000002', 'RD-MA', 'مسؤول الجادرية', '2024-01-01', 'd0d0d000-0000-0000-0000-000000000005'),
  ('d0d00000-0000-0000-0000-0000000000e3', 'd0d00000-0000-0000-0000-000000000003', 'RD-MB', 'مسؤول أرخيته', '2024-01-01', 'd0d0d000-0000-0000-0000-000000000005'),
  ('d0d00000-0000-0000-0000-0000000000d1', null, 'RD-D1', 'سائق الجادرية', '2024-01-01', 'd0d0d000-0000-0000-0000-000000000002'),
  ('d0d00000-0000-0000-0000-0000000000d2', null, 'RD-D2', 'سائق أرخيته', '2024-01-01', 'd0d0d000-0000-0000-0000-000000000002')
on conflict (employee_number) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, driver_employee_id, shift, sector_id, vehicle_category, created_by) values
  ('d0d0a000-0000-0000-0000-000000000001', 'كابسة الجادرية', 'DB-RD1', 'P-RD1', 'CH-RD0001', 'garage/rd1.jpg', 'سائق الجادرية', 'd0d00000-0000-0000-0000-0000000000d1', 'morning', 4, 'compactor_large', 'd0d00000-0000-0000-0000-000000000005'),
  ('d0d0a000-0000-0000-0000-000000000002', 'كابسة أرخيته', 'DB-RD2', 'P-RD2', 'CH-RD0002', 'garage/rd2.jpg', 'سائق أرخيته', 'd0d00000-0000-0000-0000-0000000000d2', 'morning', 1, 'compactor_large', 'd0d00000-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.garage_vehicle_shift_assignments (vehicle_id, shift, driver_name, driver_employee_id, sector_id, change_reason, created_by) values
  ('d0d0a000-0000-0000-0000-000000000001', 'morning', 'سائق الجادرية', 'd0d00000-0000-0000-0000-0000000000d1', 4, 'تهيئة الاختبار', 'd0d00000-0000-0000-0000-000000000005'),
  ('d0d0a000-0000-0000-0000-000000000002', 'morning', 'سائق أرخيته', 'd0d00000-0000-0000-0000-0000000000d2', 1, 'تهيئة الاختبار', 'd0d00000-0000-0000-0000-000000000005');
-- GPS: مزوّد + جهازان مربوطان بالآليتين
insert into public.gps_providers (id, name, type) values ('d0d0b000-0000-0000-0000-000000000001', 'RD provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values
  ('d0d0c000-0000-0000-0000-000000000001', 'd0d0b000-0000-0000-0000-000000000001', 'RD-DEV1', 'جهاز RD1', 'online'),
  ('d0d0c000-0000-0000-0000-000000000002', 'd0d0b000-0000-0000-0000-000000000001', 'RD-DEV2', 'جهاز RD2', 'online')
on conflict (id) do nothing;
insert into public.gps_vehicle_bindings (device_id, garage_vehicle_id, match_method) values
  ('d0d0c000-0000-0000-0000-000000000001', 'd0d0a000-0000-0000-0000-000000000001', 'manual'),
  ('d0d0c000-0000-0000-0000-000000000002', 'd0d0a000-0000-0000-0000-000000000002', 'manual')
on conflict do nothing;
insert into public.gps_device_positions (device_id, latitude, longitude, fix_time) values
  ('d0d0c000-0000-0000-0000-000000000001', 33.305, 44.405, now()),
  ('d0d0c000-0000-0000-0000-000000000002', 33.355, 44.455, now())
on conflict (device_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, fix_time = excluded.fix_time;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if position(p_code in msg) = 0 then raise exception 'WRONG_ERROR: got % (wanted %)', msg, p_code; end if;
end $$;
-- تحريك جهاز إلى نقطة الآن
create or replace function pg_temp.move(p_dev uuid, p_lat float8, p_lng float8) returns void language sql as $$
  update public.gps_device_positions set latitude = p_lat, longitude = p_lng, fix_time = now() where device_id = p_dev $$;
-- محاكاة مرور الوقت خارج الزون
create or replace function pg_temp.age_outside(p_dep uuid, p_minutes int) returns void language sql as $$
  update public.gps_route_presence_state set changed_at = now() - make_interval(mins => p_minutes), observed_at = now() - make_interval(mins => p_minutes) where departure_id = p_dep $$;

-- ═══════════ Z1 · ربط الزونات بالمناطق + إعدادات المهلة ═══════════
do $$
declare z4 uuid; z1 uuid; g integer;
begin
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000005');
  z4 := public.gps_platform_geofence_save(null, 'زون الجادرية (RD)', '[{"lat":33.30,"lng":44.40},{"lat":33.31,"lng":44.40},{"lat":33.31,"lng":44.41},{"lat":33.30,"lng":44.41}]'::jsonb, '#06b6d4', 4::smallint);
  z1 := public.gps_platform_geofence_save(null, 'زون أرخيته (RD)', '[{"lat":33.35,"lng":44.45},{"lat":33.36,"lng":44.45},{"lat":33.36,"lng":44.46},{"lat":33.35,"lng":44.46}]'::jsonb, '#06b6d4', null);
  perform pg_temp.expect_error(format('select public.gps_platform_geofence_save(null,%L,%L::jsonb,%L,%s::smallint)', 'x زون', '[{"lat":1,"lng":1},{"lat":1,"lng":2},{"lat":2,"lng":2}]', '#06b6d4', 99), 'GPS_ZONE_SECTOR_INVALID');
  perform pg_temp.expect_error(format('select public.gps_geofence_set_sector(%L::uuid,%s::smallint)', z1, 99), 'GPS_ZONE_SECTOR_INVALID');
  perform public.gps_geofence_set_sector(z1, 1::smallint);
  assert (select m.area_name from public.gps_lvn_map_geofences() m where m.id = z4) = 'الجادرية', 'Z1: زون 4 مرتبط بالجادرية';
  assert (select m.area_name from public.gps_lvn_map_geofences() m where m.id = z1) = 'أرخيته', 'Z1: زون 1 مرتبط بأرخيته';
  assert (select m.parent_sector from public.gps_lvn_map_geofences() m where m.id = z1) = 'karrada', 'Z1: القاطع الأب';
  select grace_minutes into g from public.gps_route_deviation_settings_get(); assert g = 3, 'Z1: المهلة الافتراضية 3 دقائق';
  perform pg_temp.expect_error('select public.gps_route_deviation_settings_save(500)', 'GPS_ROUTE_GRACE_INVALID');
  perform public.gps_route_deviation_settings_save(5);
  select grace_minutes into g from public.gps_route_deviation_settings_get(); assert g = 5, 'Z1: المهلة أصبحت 5';
  perform public.gps_route_deviation_settings_save(3);
  -- المسؤول لا يضبط الإعدادات
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error('select public.gps_route_deviation_settings_save(1)', 'GPS_FORBIDDEN');
  perform set_config('t.z4', z4::text, false); perform set_config('t.z1', z1::text, false);
end $$;

-- ═══════════ R1 · تنبيه الخروج عن المسار: فقط أثناء العمل في الموقع وبعد المهلة ═══════════
do $$
declare d public.garage_departures; dev uuid := 'd0d0c000-0000-0000-0000-000000000001'; a public.gps_operational_alerts; n int;
begin
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000001');
  d := public.garage_record_shift_departure('d0d0a000-0000-0000-0000-000000000001', 'morning');
  assert d.recipient_manager_id = 'd0d00000-0000-0000-0000-000000000002', 'R1: المستلم مسؤول الجادرية';
  perform set_config('t.dep1', d.id::text, false);
  -- في الطريق وخارج الزون: لا مراقبة
  perform pg_temp.move(dev, 33.50, 44.50);
  perform public.gps_evaluate_operational_alerts();
  assert not exists (select 1 from public.gps_route_presence_state where departure_id = d.id), 'R1: لا حالة وجود أثناء الطريق';
  assert not exists (select 1 from public.gps_operational_alerts where departure_id = d.id and alert_type = 'route_deviation'), 'R1: لا تنبيه أثناء الطريق';
  -- وصلت للموقع داخل الزون
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  d := public.sector_confirm_vehicle_arrival(d.id, 'وصلت');
  assert app.trip_status(d.id) = 'at_site', 'R1: تعمل في الموقع';
  perform pg_temp.move(dev, 33.305, 44.405);
  perform public.gps_evaluate_operational_alerts();
  assert (select is_inside from public.gps_route_presence_state where departure_id = d.id), 'R1: داخل زون الجادرية';
  -- خرجت للتو: ضمن المهلة → لا تنبيه
  perform pg_temp.move(dev, 33.50, 44.50);
  perform public.gps_evaluate_operational_alerts();
  assert not (select is_inside from public.gps_route_presence_state where departure_id = d.id), 'R1: خارج الزون';
  assert not exists (select 1 from public.gps_operational_alerts where departure_id = d.id and alert_type = 'route_deviation'), 'R1: لا تنبيه قبل انقضاء المهلة';
  -- مرّت 4 دقائق خارج الزون → تنبيه بالتفاصيل
  perform pg_temp.age_outside(d.id, 4);
  perform pg_temp.move(dev, 33.50, 44.50);
  perform public.gps_evaluate_operational_alerts();
  select * into a from public.gps_operational_alerts where departure_id = d.id and alert_type = 'route_deviation' and resolved_at is null;
  assert found, 'R1: فُتح تنبيه خرجت من مسارها';
  assert a.title = 'الآلية خرجت من مسارها' and a.details->>'area_name' = 'الجادرية' and a.details->>'driver_name' = 'سائق الجادرية' and a.details->>'manager_name' = 'مسؤول الجادرية' and (a.details->>'in_support')::boolean = false, 'R1: تفاصيل التنبيه (المنطقة/السائق/المسؤول)';
  assert (a.details->>'outside_minutes')::int >= 4, 'R1: مدة الخروج';
  assert exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000005' and entity_id = a.id and category = 'gps' and body like '%سائق الجادرية%' and body like '%الجادرية%'), 'R1: إشعار غرفة العمليات باسم السائق والمنطقة';
  assert not exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000002' and entity_id = a.id), 'R1: المسؤول ليس من متلقّي التنبيه افتراضياً';
  -- تكرار التقييم لا يفتح تنبيهاً ثانياً
  perform public.gps_evaluate_operational_alerts();
  select count(*) into n from public.gps_operational_alerts where departure_id = d.id and alert_type = 'route_deviation'; assert n = 1, 'R1: تنبيه واحد فقط';
  -- عادت للزون → يُغلق التنبيه
  perform pg_temp.move(dev, 33.305, 44.405);
  perform public.gps_evaluate_operational_alerts();
  assert (select resolved_at is not null from public.gps_operational_alerts where id = a.id), 'R1: أُغلق التنبيه بعد العودة';
  -- الآلية الثانية: في الموقع ثم إلى المحطة → حذف الحالة ولا تنبيه (المرحلة ليست في الموقع)
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000001');
  d := public.garage_record_shift_departure('d0d0a000-0000-0000-0000-000000000002', 'morning');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  d := public.sector_confirm_vehicle_arrival(d.id, 'وصلت');
  perform pg_temp.move('d0d0c000-0000-0000-0000-000000000002', 33.60, 44.60);
  perform public.gps_evaluate_operational_alerts();
  assert exists (select 1 from public.gps_route_presence_state where departure_id = d.id and not is_inside and sector_id = 1), 'R1: الآلية الثانية خارج زون أرخيته';
  perform public.sector_send_vehicle_to_station(d.id, null);
  perform pg_temp.age_outside(d.id, 30);
  perform public.gps_evaluate_operational_alerts();
  assert not exists (select 1 from public.gps_route_presence_state where departure_id = d.id), 'R1: حذف الحالة عند مغادرة الموقع';
  assert not exists (select 1 from public.gps_operational_alerts where departure_id = d.id and alert_type = 'route_deviation'), 'R1: لا تنبيه في الطريق إلى المحطة';
end $$;

-- ═══════════ S1 · طلب دعم: إنشاء → قبول → المراقبة تتبع منطقة المستفيد → إنهاء من المستفيد ═══════════
do $$
declare r public.sector_support_requests; a public.sector_support_assignments; dep1 uuid := current_setting('t.dep1')::uuid; dev uuid := 'd0d0c000-0000-0000-0000-000000000001'; al public.gps_operational_alerts; aid uuid;
begin
  -- مسؤول أرخيته (B) يطلب من مسؤول الجادرية (A)
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  assert exists (select 1 from public.sector_support_managers() m where m.user_id = 'd0d00000-0000-0000-0000-000000000002' and m.manager_name = 'مسؤول الجادرية' and 'الجادرية' = any(m.area_names) and m.active_vehicles = 1), 'S1: قائمة المسؤولين تُظهر A وآلياته النشطة';
  assert not exists (select 1 from public.sector_support_managers() m where m.user_id = 'd0d00000-0000-0000-0000-000000000003'), 'S1: لا يظهر الطالب نفسه';
  perform pg_temp.expect_error(format('select public.sector_support_request_create(%L::uuid,%s::smallint,1,%L)', 'd0d00000-0000-0000-0000-000000000002', 4, 'حمل كبير'), 'SUPPORT_SECTOR_NOT_MINE');
  perform pg_temp.expect_error(format('select public.sector_support_request_create(%L::uuid,%s::smallint,0,%L)', 'd0d00000-0000-0000-0000-000000000002', 1, 'حمل كبير'), 'SUPPORT_COUNT_INVALID');
  perform pg_temp.expect_error(format('select public.sector_support_request_create(%L::uuid,%s::smallint,1,%L)', 'd0d00000-0000-0000-0000-000000000002', 1, 'x'), 'SUPPORT_REASON_INVALID');
  perform pg_temp.expect_error(format('select public.sector_support_request_create(%L::uuid,%s::smallint,1,%L)', 'd0d00000-0000-0000-0000-000000000005', 1, 'حمل كبير'), 'SUPPORT_TARGET_INVALID');
  r := public.sector_support_request_create('d0d00000-0000-0000-0000-000000000002', 1::smallint, 2, 'تراكم نفايات في أرخيته');
  assert r.status = 'pending' and r.requester_name = 'مسؤول أرخيته' and r.target_name = 'مسؤول الجادرية', 'S1: الطلب معلّق بالأسماء';
  perform pg_temp.expect_error(format('select public.sector_support_request_create(%L::uuid,%s::smallint,1,%L)', 'd0d00000-0000-0000-0000-000000000002', 1, 'تكرار'), 'SUPPORT_REQUEST_DUPLICATE');
  assert exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000002' and entity_id = r.id and title = 'طلب دعم بآليات' and body like '%أرخيته%' and body like '%مسؤول أرخيته%'), 'S1: إشعار للمسؤول المستهدف باسم الطالب والمنطقة';
  assert exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000005' and entity_id = r.id), 'S1: غرفة العمليات للعلم';
  assert (select l.direction from public.sector_support_requests_list() l where l.id = r.id) = 'outgoing', 'S1: صادر لدى الطالب';
  -- الطالب لا يقبل طلبه ولا يرفضه
  perform pg_temp.expect_error(format('select public.sector_support_request_accept(%L::uuid,array[%L::uuid])', r.id, dep1), 'SUPPORT_REQUEST_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.sector_support_request_reject(%L::uuid,%L)', r.id, 'لا أستطيع'), 'SUPPORT_REQUEST_FORBIDDEN');
  -- A يرى الطلب وارداً ويقبل بآليته
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  assert (select l.direction from public.sector_support_requests_list() l where l.id = r.id) = 'incoming', 'S1: وارد لدى المستهدف';
  assert exists (select 1 from public.sector_support_lendable_vehicles() v where v.departure_id = dep1 and v.trip_status = 'at_site'), 'S1: الآلية قابلة للإرسال';
  perform pg_temp.expect_error(format('select public.sector_support_request_accept(%L::uuid,array[]::uuid[])', r.id), 'SUPPORT_VEHICLES_REQUIRED');
  perform pg_temp.expect_error(format('select public.sector_support_request_accept(%L::uuid,array[%L::uuid,%L::uuid,%L::uuid])', r.id, dep1, gen_random_uuid(), gen_random_uuid()), 'SUPPORT_TOO_MANY_VEHICLES');
  perform pg_temp.expect_error(format('select public.sector_support_request_accept(%L::uuid,array[%L::uuid])', r.id, gen_random_uuid()), 'SUPPORT_VEHICLE_NOT_MINE');
  r := public.sector_support_request_accept(r.id, array[dep1], 'أرسلت كابسة واحدة');
  assert r.status = 'accepted', 'S1: مقبول';
  select * into a from public.sector_support_assignments where request_id = r.id and ended_at is null;
  assert found and a.from_sector_id = 4 and a.to_sector_id = 1 and a.to_manager_id = 'd0d00000-0000-0000-0000-000000000003', 'S1: إسناد مفتوح من 4 إلى 1';
  assert app.departure_effective_sector(dep1) = 1, 'S1: المنطقة الفعلية = أرخيته';
  assert not exists (select 1 from public.sector_support_lendable_vehicles() v where v.departure_id = dep1), 'S1: لم تعد قابلة للإرسال';
  assert exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000003' and entity_id = r.id and title = 'تمت الموافقة على طلب الدعم' and body like '%DB-RD1%'), 'S1: إشعار القبول للطالب باسم الآلية';
  assert (select t.support_role from public.manager_vehicle_trips() t where t.id = dep1) = 'lent' and (select t.support_counterpart_name from public.manager_vehicle_trips() t where t.id = dep1) = 'مسؤول أرخيته', 'S1: لدى A: مُعارة إلى مسؤول أرخيته';
  -- B يرى الآلية في رحلاته كمستعارة
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  assert (select t.support_role from public.manager_vehicle_trips() t where t.id = dep1) = 'borrowed' and (select t.support_area_name from public.manager_vehicle_trips() t where t.id = dep1) = 'أرخيته', 'S1: لدى B: مستعارة لمنطقة أرخيته';
  assert exists (select 1 from public.manager_vehicle_trips_for_day((now() at time zone 'Asia/Baghdad')::date) t where t.id = dep1 and t.support_role = 'borrowed'), 'S1: تظهر في يوم B';
  assert (select jsonb_array_length(l.assignments) from public.sector_support_requests_list() l where l.id = r.id) = 1, 'S1: الإسناد ضمن القائمة';
  -- المراقبة تتبع زون أرخيته الآن: الآلية ما زالت في الجادرية (خارج زون أرخيته)
  perform pg_temp.move(dev, 33.305, 44.405);
  perform public.gps_evaluate_operational_alerts();
  assert (select s.sector_id = 1 and not s.is_inside from public.gps_route_presence_state s where s.departure_id = dep1), 'S1: الحالة تتبع منطقة الدعم';
  assert not exists (select 1 from public.gps_operational_alerts where departure_id = dep1 and alert_type = 'route_deviation' and resolved_at is null), 'S1: لا تنبيه فوري (العدّ بدأ من جديد)';
  perform pg_temp.move(dev, 33.355, 44.455);
  perform public.gps_evaluate_operational_alerts();
  assert (select s.is_inside from public.gps_route_presence_state s where s.departure_id = dep1), 'S1: دخلت زون أرخيته';
  perform pg_temp.move(dev, 33.305, 44.405);
  perform public.gps_evaluate_operational_alerts();
  perform pg_temp.age_outside(dep1, 10);
  perform pg_temp.move(dev, 33.305, 44.405);
  perform public.gps_evaluate_operational_alerts();
  select * into al from public.gps_operational_alerts where departure_id = dep1 and alert_type = 'route_deviation' and resolved_at is null;
  assert found and al.details->>'area_name' = 'أرخيته' and al.details->>'manager_name' = 'مسؤول أرخيته' and (al.details->>'in_support')::boolean, 'S1: تنبيه الخروج يذكر منطقة الدعم ومسؤولها';
  -- المستفيد يُنهي الدعم → الطلب مكتمل، المنطقة الفعلية تعود، التنبيه يُغلق (هي داخل الجادرية)
  a := public.sector_support_end(a.id, 'انتهى العمل شكراً');
  assert a.end_kind = 'released' and a.ended_by = 'd0d00000-0000-0000-0000-000000000003', 'S1: إنهاء من المستفيد';
  perform pg_temp.expect_error(format('select public.sector_support_end(%L::uuid)', a.id), 'SUPPORT_ASSIGNMENT_ENDED');
  assert (select q.status from public.sector_support_requests q where q.id = r.id) = 'completed', 'S1: الطلب مكتمل تلقائياً';
  assert app.departure_effective_sector(dep1) = 4, 'S1: المنطقة الفعلية عادت للجادرية';
  assert exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000002' and entity_id = r.id and title like 'انتهى الدعم%'), 'S1: إشعار المالك بالإنهاء';
  perform public.gps_evaluate_operational_alerts();
  assert (select resolved_at is not null from public.gps_operational_alerts where id = al.id), 'S1: أُغلق التنبيه بعد عودة المنطقة الأصلية';
  assert (select t.support_role from public.manager_vehicle_trips() t where t.id = dep1) is null, 'S1: لا شارة دعم بعد الإنهاء';
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  assert not exists (select 1 from public.manager_vehicle_trips() t where t.id = dep1), 'S1: لم تعد في رحلات B';
end $$;

-- ═══════════ S2 · استرجاع المالك، رفض، إلغاء الطالب، إلغاء غرفة العمليات، إنهاء تلقائي بالعودة ═══════════
do $$
declare r public.sector_support_requests; r2 public.sector_support_requests; r3 public.sector_support_requests; a public.sector_support_assignments; dep1 uuid := current_setting('t.dep1')::uuid; d public.garage_departures;
begin
  -- استرجاع المالك
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  r := public.sector_support_request_create('d0d00000-0000-0000-0000-000000000002', 1::smallint, 1, 'دعم ثانٍ');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  r := public.sector_support_request_accept(r.id, array[dep1]);
  select * into a from public.sector_support_assignments where request_id = r.id and ended_at is null;
  a := public.sector_support_end(a.id, 'أحتاجها');
  assert a.end_kind = 'recalled', 'S2: استرجاع من المالك';
  assert (select q.status from public.sector_support_requests q where q.id = r.id) = 'completed', 'S2: مكتمل';
  assert exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000003' and entity_id = r.id and title = 'استرجاع آلية الدعم'), 'S2: إشعار المستفيد بالاسترجاع';
  -- رفض بسبب
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  r := public.sector_support_request_create('d0d00000-0000-0000-0000-000000000002', 1::smallint, 1, 'دعم ثالث');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format('select public.sector_support_request_reject(%L::uuid,%L)', r.id, 'x'), 'SUPPORT_REASON_INVALID');
  r := public.sector_support_request_reject(r.id, 'لا تتوفر آليات حالياً');
  assert r.status = 'rejected' and r.decision_note = 'لا تتوفر آليات حالياً', 'S2: مرفوض بسبب';
  perform pg_temp.expect_error(format('select public.sector_support_request_reject(%L::uuid,%L)', r.id, 'مرة أخرى'), 'SUPPORT_REQUEST_NOT_PENDING');
  assert exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000003' and entity_id = r.id and title = 'تعذّر توفير الدعم' and body like '%لا تتوفر آليات%'), 'S2: إشعار الرفض بالسبب';
  -- إلغاء الطالب وهو معلّق فقط
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  r2 := public.sector_support_request_create('d0d00000-0000-0000-0000-000000000002', 1::smallint, 1, 'دعم رابع');
  perform pg_temp.expect_error(format('select public.sector_support_request_cancel(%L::uuid,%L)', r2.id, 'x'), 'SUPPORT_REASON_INVALID');
  r2 := public.sector_support_request_cancel(r2.id, 'انتفت الحاجة');
  assert r2.status = 'cancelled' and r2.cancelled_by = 'd0d00000-0000-0000-0000-000000000003', 'S2: ألغاه الطالب';
  -- المستهدف لا يلغي
  r3 := public.sector_support_request_create('d0d00000-0000-0000-0000-000000000002', 1::smallint, 1, 'دعم خامس');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format('select public.sector_support_request_cancel(%L::uuid,%L)', r3.id, 'لا أريد'), 'SUPPORT_REQUEST_FORBIDDEN');
  r3 := public.sector_support_request_accept(r3.id, array[dep1]);
  -- الطالب لا يلغي بعد القبول (يُنهي بدلاً من ذلك)
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error(format('select public.sector_support_request_cancel(%L::uuid,%L)', r3.id, 'تراجعت'), 'SUPPORT_REQUEST_NOT_PENDING');
  -- غرفة العمليات تلغي المقبول → الإسناد يُنهى cancelled
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000005');
  perform pg_temp.expect_error('select * from public.sector_support_requests_list()', 'SECTOR_MANAGER_FORBIDDEN');
  assert (select count(*) from public.ops_support_requests_list()) >= 5, 'S2: تقرير غرفة العمليات يشمل كل الطلبات';
  assert (select count(*) from public.ops_support_requests_list(null, null, 'accepted')) = 1, 'S2: فلترة بالحالة';
  r3 := public.sector_support_request_cancel(r3.id, 'قرار تشغيلي');
  assert r3.status = 'cancelled' and (select a2.end_kind from public.sector_support_assignments a2 where a2.request_id = r3.id) = 'cancelled', 'S2: إلغاء غرفة العمليات يُنهي الإسناد';
  assert app.departure_effective_sector(dep1) = 4, 'S2: المنطقة عادت';
  assert exists (select 1 from public.notifications where user_id = 'd0d00000-0000-0000-0000-000000000002' and entity_id = r3.id and body like 'غرفة العمليات ألغت الطلب%'), 'S2: إشعار الطرفين بإلغاء غرفة العمليات';
  perform pg_temp.expect_error(format('select public.sector_support_request_cancel(%L::uuid,%L)', r3.id, 'مرة أخرى'), 'SUPPORT_REQUEST_NOT_OPEN');
  -- المسؤول لا يرى تقرير غرفة العمليات
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error('select * from public.ops_support_requests_list()', 'OPS_FORBIDDEN');
  -- إنهاء تلقائي عند العودة للكراج
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  r := public.sector_support_request_create('d0d00000-0000-0000-0000-000000000002', 1::smallint, 1, 'دعم سادس');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  r := public.sector_support_request_accept(r.id, array[dep1]);
  -- آلية مُعارة لا تُعار مرة أخرى
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  r2 := public.sector_support_request_create('d0d00000-0000-0000-0000-000000000002', 1::smallint, 1, 'دعم سابع');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format('select public.sector_support_request_accept(%L::uuid,array[%L::uuid])', r2.id, dep1), 'SUPPORT_VEHICLE_ALREADY_LENT');
  r2 := public.sector_support_request_reject(r2.id, 'الآلية مُعارة أصلاً');
  perform public.sector_send_vehicle_to_garage(dep1, 'انتهى الدوام');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000001');
  d := public.garage_record_return(dep1);
  assert d.returned_at is not null, 'S2: عادت للكراج';
  assert (select a2.end_kind from public.sector_support_assignments a2 where a2.request_id = r.id) = 'returned', 'S2: الإسناد أُنهي تلقائياً بالعودة';
  assert (select q.status from public.sector_support_requests q where q.id = r.id) = 'completed', 'S2: الطلب اكتمل بالعودة';
  -- آلية في الطريق ليست قابلة للإعارة
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000003');
  r := public.sector_support_request_create('d0d00000-0000-0000-0000-000000000002', 1::smallint, 1, 'دعم ثامن');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000001');
  d := public.garage_record_shift_departure('d0d0a000-0000-0000-0000-000000000001', 'morning');
  perform pg_temp.as_user('d0d00000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format('select public.sector_support_request_accept(%L::uuid,array[%L::uuid])', r.id, d.id), 'SUPPORT_VEHICLE_NOT_AT_SITE');
end $$;
