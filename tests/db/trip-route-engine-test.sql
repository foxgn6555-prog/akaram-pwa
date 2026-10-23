-- اختبار 00285 (00342): محرّك مسار الانطلاقية — تنظيف، مقاطع، توقفات، فجوات، مقاييس، طابور السحب، المشغّل، الصلاحيات، الإعدادات، التخفيف
set client_min_messages = notice;
insert into auth.users (id, email) values ('e7000000-0000-0000-0000-000000000001', 'ops-tr@t.iq'), ('e7000000-0000-0000-0000-000000000002', 'it-tr@t.iq'), ('e7000000-0000-0000-0000-000000000003', 'hr-tr@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e7000000-0000-0000-0000-000000000001', 'ops_room'), ('e7000000-0000-0000-0000-000000000002', 'it_admin'), ('e7000000-0000-0000-0000-000000000003', 'hr_officer') on conflict do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (97, 'S97', 'قاطع المسار', 97, 'karrada') on conflict (id) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false), set_config('auth.role', '', false) $$;
create or replace function pg_temp.as_service() returns void language sql as $$ select set_config('auth.user_id', '', false), set_config('auth.role', 'service_role', false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

insert into public.gps_providers (id, name, type) values ('e70db000-0000-0000-0000-000000000001', 'TR provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values ('e70dc000-0000-0000-0000-000000000001', 'e70db000-0000-0000-0000-000000000001', 'TR-DEV1', 'جهاز TR1', 'online') on conflict (id) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, created_by) values
  ('e70da000-0000-0000-0000-000000000001', 'كابسة TR', 'DB-TR1', 'P-TR1', 'CH-TR0001', 'garage/tr1.jpg', 'سائق TR', 'morning', 97, 'e7000000-0000-0000-0000-000000000001'),
  ('e70da000-0000-0000-0000-000000000002', 'كابسة TR بلا GPS', 'DB-TR2', 'P-TR2', 'CH-TR0002', 'garage/tr2.jpg', 'سائق TR2', 'morning', 97, 'e7000000-0000-0000-0000-000000000001') on conflict (id) do nothing;
insert into public.gps_vehicle_bindings (device_id, garage_vehicle_id, match_method) values ('e70dc000-0000-0000-0000-000000000001', 'e70da000-0000-0000-0000-000000000001', 'manual') on conflict do nothing;
-- زون منصة حول نقطة التوقف (33.3200, 44.4200)
insert into public.gps_geofences (id, name, source, polygon, color, is_active) values ('e70d9000-0000-0000-0000-000000000001', 'زون محطة التوقف', 'platform',
  '[{"lat":33.3190,"lng":44.4190},{"lat":33.3210,"lng":44.4190},{"lat":33.3210,"lng":44.4210},{"lat":33.3190,"lng":44.4210}]', '#f00', true) on conflict (id) do nothing;

-- انطلاقية: مغادرة T0، مقطع 1 موقع عمل → محطة (T0+10د … T0+20د)، مقطع 2 محطة → كراج (T0+20د … مفتوح)
do $$
declare t0 timestamptz := date_trunc('minute', now()) - interval '2 hour'; dep uuid := 'e70dd000-0000-0000-0000-000000000001'; ops uuid := 'e7000000-0000-0000-0000-000000000001';
begin
  delete from public.garage_departures where id in (dep, 'e70dd000-0000-0000-0000-000000000002');
  insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by) values (dep, 'e70da000-0000-0000-0000-000000000001', 'سائق TR', 'morning', 97, t0, ops);
  insert into public.vehicle_trip_legs (id, departure_id, sequence_no, origin_type, destination_type, departed_at, departed_by, arrived_at, arrived_by) values
    ('e70de000-0000-0000-0000-000000000001', dep, 1, 'work_site', 'transfer_station', t0 + interval '10 minute', ops, t0 + interval '20 minute', ops),
    ('e70de000-0000-0000-0000-000000000002', dep, 2, 'transfer_station', 'garage', t0 + interval '20 minute', ops, null, null);
  -- انطلاقية بلا جهاز
  insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by) values ('e70dd000-0000-0000-0000-000000000002', 'e70da000-0000-0000-0000-000000000002', 'سائق TR2', 'morning', 97, t0, ops);
end $$;

-- نقاط اصطناعية: (أ) 20 نقطة حركة كل 30 ث بخطوة ~0.002° شمالاً (~222م ⇒ ~27 كم/س) من T0 حتى T0+9.5د
--                (ب) توقف 5 دقائق عند (33.3200,44.4200) 10 نقاط كل 30 ث باهتزاز < 5م (T0+12 … T0+16.5د)
--                (ج) قفزة مستحيلة: نقطة على بعد 50 كم بعد 30 ث (تُرفض)
--                (د) فجوة 10 دقائق ثم 10 نقاط حركة (T0+27 … T0+31.5د) — داخل المقطع 2
--                (هـ) نقطة قبل المغادرة ونقطة بعد النهاية (خارج الفترة ⇒ تُهمل) + نقطة بإحداثيات 0,0 (تُهمل)
create or replace function pg_temp.points(t0 timestamptz) returns jsonb language sql as $$
  select jsonb_agg(p order by (p ->> 'fix_time')::timestamptz) from (
    select jsonb_build_object('fix_time', t0 + make_interval(secs => 30 * g), 'lat', 33.2800 + 0.002 * g, 'lng', 44.4200, 'speed', 27, 'course', 0) p from generate_series(0, 19) g
    union all
    select jsonb_build_object('fix_time', t0 + interval '12 minute' + make_interval(secs => 30 * g), 'lat', 33.3200 + 0.00002 * (g % 2), 'lng', 44.4200 + 0.00002 * (g % 3), 'speed', 0, 'address', case when g = 3 then 'الكرادة / شارع 62' end) from generate_series(0, 9) g
    union all
    select jsonb_build_object('fix_time', t0 + interval '17 minute', 'lat', 33.7700, 'lng', 44.4200, 'speed', 30)
    union all
    select jsonb_build_object('fix_time', t0 + interval '27 minute' + make_interval(secs => 30 * g), 'lat', 33.3200 + 0.002 * g, 'lng', 44.4300, 'speed', 25) from generate_series(0, 9) g
    union all
    select jsonb_build_object('fix_time', t0 - interval '5 minute', 'lat', 33.2, 'lng', 44.4, 'speed', 10)
    union all
    select jsonb_build_object('fix_time', t0 + interval '5 hour', 'lat', 33.2, 'lng', 44.4, 'speed', 10)
    union all
    select jsonb_build_object('fix_time', t0 + interval '3 minute', 'lat', 0, 'lng', 0, 'speed', 10)
  ) q $$;

do $$
declare dep uuid := 'e70dd000-0000-0000-0000-000000000001'; dep2 uuid := 'e70dd000-0000-0000-0000-000000000002';
  ops uuid := 'e7000000-0000-0000-0000-000000000001'; it1 uuid := 'e7000000-0000-0000-0000-000000000002'; hr1 uuid := 'e7000000-0000-0000-0000-000000000003';
  t0 timestamptz; js jsonb; q jsonb; r public.trip_routes; st jsonb; n int;
begin
  select departed_at into t0 from public.garage_departures where id = dep;

  -- T1: المشغّل أنشأ صفوف trip_routes: مع جهاز ⇒ pending، بلا جهاز ⇒ no_device
  select * into r from public.trip_routes where departure_id = dep;  if r.status <> 'pending' or r.device_id is null then raise exception 'T1 %', r.status; end if;
  select * into r from public.trip_routes where departure_id = dep2; if r.status <> 'no_device' then raise exception 'T1 no_device %', r.status; end if;

  -- T2: الطابور (service_role فقط) يعيد الانطلاقية المفتوحة بفترة من المغادرة حتى الآن، وليست نهائية؛ بلا جهاز لا تظهر
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error('select public.trip_route_pull_queue(5)', 'GPS_SERVICE_ROLE_REQUIRED');
  perform pg_temp.as_service();
  q := public.trip_route_pull_queue(10);
  select x into js from jsonb_array_elements(q) x where x ->> 'departure_id' = dep::text;
  if js is null then raise exception 'T2 not queued: %', q; end if;
  if (js ->> 'final')::boolean or (js ->> 'range_from')::timestamptz <> t0 or js ->> 'external_id' <> 'TR-DEV1' then raise exception 'T2 %', js; end if;
  if exists (select 1 from jsonb_array_elements(q) x where x ->> 'departure_id' = dep2::text) then raise exception 'T2 no_device queued'; end if;

  -- T3: التطبيق (جزئي): تنظيف + مقاطع + توقف + فجوة + مقاييس
  js := public.trip_route_apply(dep, pg_temp.points(t0), 44, t0, t0 + interval '40 minute', false);
  select * into r from public.trip_routes where departure_id = dep;
  if r.status <> 'partial' or r.is_final then raise exception 'T3 status % final %', r.status, r.is_final; end if;
  -- 44 مصدر: 3 خارج الفترة/صفرية تُهمل + 1 قفزة تُرفض ⇒ 40 محفوظة، 4 مرفوضة
  if r.points_kept <> 40 or r.points_rejected <> 4 then raise exception 'T3 kept % rejected %', r.points_kept, r.points_rejected; end if;
  if not exists (select 1 from public.trip_route_points where departure_id = dep) then raise exception 'T3 no points'; end if;
  if exists (select 1 from public.trip_route_points where departure_id = dep and latitude > 33.5) then raise exception 'T3 jump point kept!'; end if;
  -- توقف واحد ≈ 4.5 دقيقة (10 نقاط × 30 ث من T0+12 إلى T0+16.5) داخل الزون ⇒ اسم الزون + عنوان LVN
  if r.stops_count <> 1 then raise exception 'T3 stops %', r.stops_count; end if;
  select to_jsonb(s) into st from public.trip_route_stops s where s.departure_id = dep;
  if (st ->> 'duration_seconds')::int not between 260 and 280 then raise exception 'T3 stop duration %', st ->> 'duration_seconds'; end if;
  if st ->> 'geofence_name' <> 'زون محطة التوقف' or st ->> 'address' <> 'الكرادة / شارع 62' or st ->> 'address_source' <> 'lvn' then raise exception 'T3 stop zone/address %', st; end if;
  if abs((st ->> 'latitude')::float8 - 33.32) > 0.0005 then raise exception 'T3 stop centroid'; end if;
  -- فجوة واحدة ≈ 10.5 دقيقة (من T0+16.5 إلى T0+27)
  if r.gaps_count <> 1 or r.gap_seconds not between 600 and 660 then raise exception 'T3 gaps % / %', r.gaps_count, r.gap_seconds; end if;
  -- المسافة: 28 خطوة × ~222م + الانتقال للتوقف 222م + عبور الفجوة ~930م ≈ 7.37 كم (± 5%)
  if r.distance_m not between 7000 and 7750 then raise exception 'T3 distance %', r.distance_m; end if;
  if r.max_speed_kmh not between 25 and 32 then raise exception 'T3 max speed %', r.max_speed_kmh; end if;
  if r.stopped_seconds not between 250 and 300 then raise exception 'T3 stopped %', r.stopped_seconds; end if;
  -- المقاطع: نقاط قبل T0+10 بلا مقطع؛ التوقف ضمن المقطع 1؛ نقاط (د) ضمن المقطع 2
  if (select count(*) from public.trip_route_points where departure_id = dep and leg_id is null) <> 20 then raise exception 'T3 pre-leg points %', (select count(*) from public.trip_route_points where departure_id = dep and leg_id is null); end if;
  if st ->> 'leg_id' <> 'e70de000-0000-0000-0000-000000000001' then raise exception 'T3 stop leg'; end if;
  if (select count(*) from public.trip_route_points where departure_id = dep and leg_id = 'e70de000-0000-0000-0000-000000000002') <> 10 then raise exception 'T3 leg2 points'; end if;
  if jsonb_array_length(r.legs) <> 2 or (r.legs -> 0 ->> 'stops_count')::int <> 1 or (r.legs -> 1 ->> 'points')::int <> 10 or (r.legs -> 1 ->> 'gaps_count')::int <> 1 then raise exception 'T3 legs %', r.legs; end if;
  if r.next_pull_at is null or r.next_pull_at = 'infinity' or r.next_pull_at > now() + interval '16 minute' then raise exception 'T3 next_pull %', r.next_pull_at; end if;

  -- T4: إعادة التطبيق لا تراكم (نفس الأعداد)
  js := public.trip_route_apply(dep, pg_temp.points(t0), 44, t0, t0 + interval '40 minute', false);
  if (select count(*) from public.trip_route_points where departure_id = dep) <> 40 or (select count(*) from public.trip_route_stops where departure_id = dep) <> 1 then raise exception 'T4 accumulation'; end if;

  -- T5: القراءة: غير مخوَّل ممنوع؛ العمليات تقرأ؛ التخفيف يحافظ على التوقفات/الفجوات/الأطراف
  perform pg_temp.as_user(hr1);
  perform pg_temp.expect_error(format('select public.trip_route_get(%L, 100)', dep), 'GPS_FORBIDDEN');
  perform pg_temp.as_user(ops);
  js := public.trip_route_get(dep, 3000);
  if (js ->> 'points_returned')::int <> 40 or (js ->> 'downsample_step')::int <> 1 or jsonb_array_length(js -> 'stops') <> 1 or jsonb_array_length(js -> 'gaps') <> 1 or jsonb_array_length(js -> 'legs') <> 2 then raise exception 'T5 full %', js - 'points'; end if;
  js := public.trip_route_get(dep, 8);
  if (js ->> 'downsample_step')::int <> 5 then raise exception 'T5 step %', js ->> 'downsample_step'; end if;
  n := (js ->> 'points_returned')::int;
  if n >= 40 or n < 8 then raise exception 'T5 returned %', n; end if;
  if (js -> 'points' -> 0 ->> 'seq')::int <> 1 or (js -> 'points' -> (n - 1) ->> 'seq')::int <> 40 then raise exception 'T5 endpoints'; end if;
  if not exists (select 1 from jsonb_array_elements(js -> 'points') p where p ->> 'state' = 'gap') then raise exception 'T5 gap point dropped'; end if;
  js := public.trip_route_get(dep, 0);
  if (js ->> 'points_returned')::int <> 0 then raise exception 'T5 zero'; end if;
  -- v2 (00345): نفس المحتوى + بيانات الانطلاقية للترويسة
  js := public.trip_route_get_v2(dep, 10);
  if js -> 'trip' ->> 'db_number' <> 'DB-TR1' or js -> 'trip' ->> 'driver_name' <> 'سائق TR' or js -> 'trip' ->> 'sector_name' <> 'قاطع المسار' or js -> 'trip' ->> 'device_external_id' <> 'TR-DEV1' or (js -> 'trip' ->> 'departed_at')::timestamptz <> t0 then raise exception 'T5 v2 %', js -> 'trip'; end if;
  if (js ->> 'points_returned')::int < 8 or jsonb_array_length(js -> 'stops') <> 1 then raise exception 'T5 v2 base'; end if;
  perform pg_temp.as_user(hr1);
  perform pg_temp.expect_error(format('select public.trip_route_get_v2(%L, 10)', dep), 'GPS_FORBIDDEN');
  perform pg_temp.as_user(ops);
  js := public.trip_route_get(dep, 0);
  if (js ->> 'points_returned')::int <> 0 then raise exception 'T5 zero'; end if;
  -- انطلاقية بلا صف ⇒ pending فارغ، غير موجودة ⇒ خطأ
  js := public.trip_route_get(dep2, 10); if js ->> 'status' <> 'no_device' then raise exception 'T5 dep2 %', js ->> 'status'; end if;
  perform pg_temp.expect_error('select public.trip_route_get(''00000000-0000-0000-0000-000000000009'', 10)', 'TRIP_ROUTE_DEPARTURE_NOT_FOUND');

  -- T6: طلب سحب الآن (العمليات): يقدّم في الطابور؛ بلا جهاز ⇒ خطأ واضح
  update public.trip_routes set next_pull_at = now() + interval '1 hour' where departure_id = dep;
  js := public.trip_route_request_pull(dep);
  if (select next_pull_at from public.trip_routes where departure_id = dep) > now() then raise exception 'T6 not prioritized'; end if;
  perform pg_temp.expect_error(format('select public.trip_route_request_pull(%L)', dep2), 'TRIP_ROUTE_NO_DEVICE');

  -- T7: العودة الفعلية ⇒ المشغّل يعيد فتح النهائي ويطلب سحباً فورياً؛ الطابور يعيدها بـ final=true بعد مهلة final_after
  update public.trip_routes set is_final = true, next_pull_at = 'infinity' where departure_id = dep;
  update public.garage_departures set returned_at = t0 + interval '35 minute', returned_by = ops where id = dep;
  select * into r from public.trip_routes where departure_id = dep;
  if r.is_final or r.next_pull_at > now() then raise exception 'T7 trigger'; end if;
  perform pg_temp.as_service();
  q := public.trip_route_pull_queue(10);
  select x into js from jsonb_array_elements(q) x where x ->> 'departure_id' = dep::text;
  if js is null or not (js ->> 'final')::boolean or (js ->> 'range_to')::timestamptz <> t0 + interval '35 minute' then raise exception 'T7 queue %', js; end if;
  -- تطبيق نهائي ⇒ complete، لا سحب لاحق
  js := public.trip_route_apply(dep, pg_temp.points(t0), 44, t0, t0 + interval '35 minute', true);
  select * into r from public.trip_routes where departure_id = dep;
  if r.status <> 'complete' or not r.is_final or r.next_pull_at <> 'infinity' then raise exception 'T7 final %', r.status; end if;
  q := public.trip_route_pull_queue(10);
  if exists (select 1 from jsonb_array_elements(q) x where x ->> 'departure_id' = dep::text) then raise exception 'T7 still queued'; end if;

  -- T8: فشل سحب ⇒ تأجيل 10 دقائق مع رمز الخطأ، ولا يمسّ النقاط المحفوظة
  perform public.trip_route_mark_failed(dep, 'LVN_HTTP_502');
  select * into r from public.trip_routes where departure_id = dep;
  if r.error_code <> 'LVN_HTTP_502' or r.status <> 'complete' or r.points_kept <> 40 then raise exception 'T8 %', r; end if;

  -- T9: عناوين التوقفات بلا عنوان (OSM): توقف بلا عنوان يُدرج في القائمة ثم يُحدَّث
  update public.trip_route_stops set address = null, address_source = null where departure_id = dep;
  js := public.trip_route_stops_without_address(10);
  if not exists (select 1 from jsonb_array_elements(js) x where (x ->> 'id')::bigint = (select id from public.trip_route_stops where departure_id = dep)) then raise exception 'T9 list'; end if;
  perform public.trip_route_stop_address_set((select id from public.trip_route_stops where departure_id = dep), ' أرخيتة / كرادة ');
  if (select address || '|' || address_source from public.trip_route_stops where departure_id = dep) <> 'أرخيتة / كرادة|osm' then raise exception 'T9 set'; end if;

  -- T10: فارغ: تطبيق بلا نقاط ⇒ empty، بلا توقفات
  insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, returned_at, returned_by)
    values ('e70dd000-0000-0000-0000-000000000003', 'e70da000-0000-0000-0000-000000000001', 'سائق TR', 'evening', 97, t0 - interval '1 day', ops, t0 - interval '1 day' + interval '1 hour', ops);
  js := public.trip_route_apply('e70dd000-0000-0000-0000-000000000003', '[]'::jsonb, 0, t0 - interval '1 day', t0 - interval '1 day' + interval '1 hour', true);
  if js ->> 'status' <> 'empty' or (js ->> 'stops_count')::int <> 0 then raise exception 'T10 %', js ->> 'status'; end if;
  perform pg_temp.expect_error(format('select public.trip_route_apply(%L, ''[]'', 0, now(), now() - interval ''1 hour'', true)', dep), 'TRIP_ROUTE_RANGE_INVALID');

  -- T11: الإعدادات: العمليات تقرأ، IT فقط يحفظ، القيم خارج النطاق تُرفض؛ عتبة التوقف 6 دقائق ⇒ التوقف (4.5 د) يختفي
  perform pg_temp.as_user(ops);
  js := public.trip_route_settings_get(); if (js ->> 'stop_min_seconds')::int <> 120 then raise exception 'T11 default'; end if;
  perform pg_temp.expect_error('select public.trip_route_settings_save(''{"stop_min_seconds":360}'')', 'IT_FORBIDDEN');
  perform pg_temp.as_user(it1);
  perform pg_temp.expect_error('select public.trip_route_settings_save(''{"stop_min_seconds":10}'')', 'TRIP_ROUTE_SETTINGS_INVALID');
  js := public.trip_route_settings_save('{"stop_min_seconds":360}');
  perform pg_temp.as_service();
  js := public.trip_route_apply(dep, pg_temp.points(t0), 44, t0, t0 + interval '35 minute', true);
  if (js ->> 'stops_count')::int <> 0 then raise exception 'T11 stop should vanish'; end if;
  -- سرعة قصوى 60 ⇒ لا تغيير (27 كم/س)؛ لكن max_speed منخفضة جداً ممنوعة
  perform pg_temp.as_user(it1);
  js := public.trip_route_settings_save('{"stop_min_seconds":120,"max_speed_kmh":60}');
  perform pg_temp.as_service();
  js := public.trip_route_apply(dep, pg_temp.points(t0), 44, t0, t0 + interval '35 minute', true);
  if (js ->> 'points_kept')::int <> 40 or (js ->> 'stops_count')::int <> 1 then raise exception 'T11 restore'; end if;
  perform pg_temp.as_user(it1);
  js := public.trip_route_settings_save('{"max_speed_kmh":150}');

  -- T12: حذف الانطلاقية يحذف المسار كله
  delete from public.garage_departures where id = 'e70dd000-0000-0000-0000-000000000003';
  if exists (select 1 from public.trip_routes where departure_id = 'e70dd000-0000-0000-0000-000000000003') then raise exception 'T12 cascade'; end if;
  raise notice 'trip route engine ok';
end $$;
