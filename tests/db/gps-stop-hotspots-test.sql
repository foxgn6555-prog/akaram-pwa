-- اختبار 00307 (00362): بقع التوقف — استخراج أحداث التوقف تراكمياً، الاستبعاد، التجميع والترتيب، النافذة، الحذف التلقائي، الصلاحيات، الإعدادات.
set client_min_messages = notice;
insert into auth.users (id, email) values ('e8000000-0000-0000-0000-000000000001', 'ops-sh@t.iq'), ('e8000000-0000-0000-0000-000000000002', 'it-sh@t.iq'), ('e8000000-0000-0000-0000-000000000003', 'hr-sh@t.iq'), ('e8000000-0000-0000-0000-000000000004', 'dep-sh@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e8000000-0000-0000-0000-000000000001', 'ops_room'), ('e8000000-0000-0000-0000-000000000002', 'it_admin'), ('e8000000-0000-0000-0000-000000000003', 'hr_officer'), ('e8000000-0000-0000-0000-000000000004', 'deputy_director') on conflict do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (98, 'S98', 'قاطع البقع', 98, 'karrada') on conflict (id) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false), set_config('auth.role', '', false) $$;
create or replace function pg_temp.as_service() returns void language sql as $$ select set_config('auth.user_id', '', false), set_config('auth.role', 'service_role', false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

insert into public.gps_providers (id, name, type) values ('e80db000-0000-0000-0000-000000000001', 'SH provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values
  ('e80dc000-0000-0000-0000-000000000001', 'e80db000-0000-0000-0000-000000000001', 'SH-DEV1', 'جهاز SH1', 'online'),
  ('e80dc000-0000-0000-0000-000000000002', 'e80db000-0000-0000-0000-000000000001', 'SH-DEV2', 'جهاز SH2', 'online'),
  ('e80dc000-0000-0000-0000-000000000003', 'e80db000-0000-0000-0000-000000000001', 'SH-DEV3', 'جهاز SH3 غير مربوط', 'online') on conflict (id) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, created_by) values
  ('e80da000-0000-0000-0000-000000000001', 'كابسة SH1', 'DB-SH1', 'P-SH1', 'CH-SH0001', 'garage/sh1.jpg', 'سائق SH1', 'morning', 98, 'e8000000-0000-0000-0000-000000000001'),
  ('e80da000-0000-0000-0000-000000000002', 'كابسة SH2', 'DB-SH2', 'P-SH2', 'CH-SH0002', 'garage/sh2.jpg', 'سائق SH2', 'morning', 98, 'e8000000-0000-0000-0000-000000000001') on conflict (id) do nothing;
insert into public.gps_vehicle_bindings (device_id, garage_vehicle_id, match_method) values
  ('e80dc000-0000-0000-0000-000000000001', 'e80da000-0000-0000-0000-000000000001', 'manual'),
  ('e80dc000-0000-0000-0000-000000000002', 'e80da000-0000-0000-0000-000000000002', 'manual') on conflict do nothing;
-- زون «الكراج» حول (33.3000, 44.4000) ومعلم «المحطة» عند (33.3500, 44.4500)
insert into public.gps_geofences (id, name, source, polygon, color, is_active) values ('e80d9000-0000-0000-0000-000000000001', 'زون الكراج SH', 'platform',
  '[{"lat":33.2990,"lng":44.3990},{"lat":33.3010,"lng":44.3990},{"lat":33.3010,"lng":44.4010},{"lat":33.2990,"lng":44.4010}]', '#f00', true) on conflict (id) do nothing;
insert into public.gps_map_landmarks (id, name, category, latitude, longitude, created_by) values ('e80d8000-0000-0000-0000-000000000001', 'محطة SH', 'station', 33.3500, 44.4500, 'e8000000-0000-0000-0000-000000000001') on conflict (id) do nothing;

-- نقاط خام (خارج أي انطلاقة):
--  D1: توقف 10 د عند A (33.3200,44.4200) قبل 3 ساعات، توقف 4 د عند A قبل 30 ساعة، توقف 20 د داخل زون الكراج قبل ساعتين، توقف 2 د فقط (أقل من الحد) عند B، حركة بين ذلك
--  D2: توقف 6 د عند A (بُعد ~20م) قبل ساعة، توقف 8 د عند المعلم (المحطة) قبل ساعة، توقف قديم 30 د قبل 9 أيام (يُحذف)
--  D3: غير مربوط ⇒ يُشمل أيضاً (00363) ويُعرض باسم الجهاز: توقف 30 د عند A قبل ساعة
create or replace function pg_temp.stop_points(p_dev uuid, p_start timestamptz, p_lat float8, p_lng float8, p_minutes int, p_addr text default null) returns void language sql as $$
  insert into public.gps_device_position_history (device_id, latitude, longitude, speed, fix_time, address)
  select p_dev, p_lat + 0.00003 * (g % 2), p_lng + 0.00003 * (g % 3), 0, p_start + make_interval(secs => 30 * g), p_addr
  from generate_series(0, p_minutes * 2) g on conflict do nothing $$;
create or replace function pg_temp.move_points(p_dev uuid, p_start timestamptz, p_lat float8, p_lng float8, p_count int) returns void language sql as $$
  insert into public.gps_device_position_history (device_id, latitude, longitude, speed, fix_time)
  select p_dev, p_lat + 0.002 * g, p_lng, 30, p_start + make_interval(secs => 30 * g) from generate_series(0, p_count - 1) g on conflict do nothing $$;
-- 00366: كل توقف محاط بحركة متلاصقة (30 ث قبل/بعد) ⇒ المدة الدقيقة = الدقائق×60 + 15 ث من كل طرف (منتصف الفاصل)
create or replace function pg_temp.episode(p_dev uuid, p_start timestamptz, p_lat float8, p_lng float8, p_minutes int, p_addr text default null) returns void language sql as $$
  select pg_temp.move_points(p_dev, p_start - interval '150 seconds', p_lat - 0.01, p_lng, 5);
  select pg_temp.stop_points(p_dev, p_start, p_lat, p_lng, p_minutes, p_addr);
  select pg_temp.move_points(p_dev, p_start + make_interval(mins => p_minutes) + interval '30 seconds', p_lat, p_lng, 5);
$$;
do $$
declare d1 uuid := 'e80dc000-0000-0000-0000-000000000001'; d2 uuid := 'e80dc000-0000-0000-0000-000000000002'; d3 uuid := 'e80dc000-0000-0000-0000-000000000003'; t0 timestamptz := date_trunc('minute', now());
begin
  delete from public.gps_device_position_history where device_id in (d1, d2, d3);
  perform pg_temp.episode(d1, t0 - interval '3 hour', 33.3200, 44.4200, 10, 'شارع فلسطين');
  perform pg_temp.episode(d1, t0 - interval '2 hour', 33.3000, 44.4000, 20);
  perform pg_temp.episode(d1, t0 - interval '1 hour', 33.2500, 44.3000, 2);
  perform pg_temp.episode(d1, t0 - interval '30 hour', 33.3200, 44.4200, 4);
  perform pg_temp.episode(d2, t0 - interval '1 hour', 33.3202, 44.4200, 6, 'شارع فلسطين');
  perform pg_temp.episode(d2, t0 - interval '40 minute', 33.3500, 44.4500, 8);
  perform pg_temp.episode(d2, t0 - interval '9 day', 33.3200, 44.4200, 30);
  -- توقف يعبر حدّ شريحة المسح (24 ساعة من أرضية النافذة): 10 د حول (الآن − 6 أيام) ⇒ حدث واحد
  perform pg_temp.episode(d2, t0 - interval '6 day' - interval '5 minute', 33.2000, 44.2000, 10);
  perform pg_temp.episode(d3, t0 - interval '1 hour', 33.3200, 44.4200, 30);
end $$;

-- H1: الدوري يستخرج الأحداث؛ الاستبعاد يحتاج ضبط القائمة أولاً
do $$
declare r record; n int;
begin
  update public.gps_stop_hotspot_settings set excluded_zone_ids = '{}', excluded_landmark_ids = '{}', max_days = 7, stop_min_seconds = 180, stop_speed_kmh = 3, cluster_radius_m = 60 where id = 1;
  select * into r from app.gps_stop_hotspots_refresh();
  if r.devices < 3 then raise exception 'H1 devices %', r.devices; end if;
  select count(*) into n from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000001';
  if n <> 3 then raise exception 'H1 d1 events % (wanted 3: A×2 + garage; the 2-min stop is below threshold)', n; end if;
  select count(*) into n from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000002';
  if n <> 3 then raise exception 'H1 d2 events % (wanted 3: A + station + slice-boundary stop; the 9-day-old stop is beyond max_days)', n; end if;
  select count(*) into n from public.gps_stop_events e where e.device_id = 'e80dc000-0000-0000-0000-000000000002' and abs(e.latitude - 33.2000) < 0.001 and e.duration_seconds = 630;
  if n <> 1 then raise exception 'H1 slice-boundary stop must be ONE event of ~600s (got %)', n; end if;
  select count(*) into n from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000003' and garage_vehicle_id is null;
  if n <> 1 then raise exception 'H1 unbound device must be included too (00363): %', n; end if;
  select count(*) into n from public.gps_stop_events e where e.duration_seconds = 630 and e.address = 'شارع فلسطين';
  if n <> 1 then raise exception 'H1 10-min stop must be exactly 630s (600 + 15 + 15 midpoint) with address: %', n; end if;
  raise notice 'H1 ok (devices=% upserted=%)', r.devices, r.upserted;
end $$;

-- H2: إعادة التشغيل لا تُكرّر (idempotent) والعلامة المائية تتقدم
do $$
declare before_n int; after_n int; r record;
begin
  select count(*) into before_n from public.gps_stop_events;
  select * into r from app.gps_stop_hotspots_refresh();
  select count(*) into after_n from public.gps_stop_events;
  if before_n <> after_n then raise exception 'H2 duplicated % -> %', before_n, after_n; end if;
  if not exists (select 1 from public.gps_stop_scan_state where device_id = 'e80dc000-0000-0000-0000-000000000001' and last_fix_at is not null) then raise exception 'H2 watermark missing'; end if;
  -- سقف زمني صفر ⇒ يتوقف مبكراً ويبلّغ أنه لم يُنجز
  select * into r from app.gps_stop_hotspots_refresh(0);
  if r.caught_up then raise exception 'H2 budget exit expected'; end if;
  raise notice 'H2 ok';
end $$;

-- H3: توقف مفتوح يتمدد مع النقاط الجديدة دون إنشاء حدث ثانٍ
do $$
declare d1 uuid := 'e80dc000-0000-0000-0000-000000000001'; t0 timestamptz := date_trunc('minute', now()); n int; dur int;
begin
  perform pg_temp.stop_points(d1, t0 - interval '20 minute', 33.2800, 44.3800, 5);
  perform app.gps_stop_hotspots_refresh();
  select count(*), max(duration_seconds) into n, dur from public.gps_stop_events where device_id = d1 and abs(latitude - 33.2800) < 0.001;
  if n <> 1 or dur < 290 then raise exception 'H3 first pass n=% dur=%', n, dur; end if;
  perform pg_temp.stop_points(d1, t0 - interval '15 minute', 33.2800, 44.3800, 5);
  perform app.gps_stop_hotspots_refresh();
  select count(*), max(duration_seconds) into n, dur from public.gps_stop_events where device_id = d1 and abs(latitude - 33.2800) < 0.001;
  if n <> 1 or dur < 590 then raise exception 'H3 extended n=% dur=% (wanted 1 event of ~600s)', n, dur; end if;
  raise notice 'H3 ok (dur=%)', dur;
end $$;

-- H4: الاستبعاد (زون + معلم) يُطبَّق فوراً عند الحفظ، ويُعاد تقييمه
do $$
declare j jsonb; n int;
begin
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000001');
  j := public.gps_stop_hotspot_settings_save(jsonb_build_object('excluded_zone_ids', jsonb_build_array('e80d9000-0000-0000-0000-000000000001'), 'excluded_landmark_ids', jsonb_build_array('e80d8000-0000-0000-0000-000000000001')));
  if jsonb_array_length(j -> 'excluded_zones') <> 1 or (j -> 'excluded_zones' -> 0 ->> 'name') <> 'زون الكراج SH' then raise exception 'H4 zones %', j -> 'excluded_zones'; end if;
  if jsonb_array_length(j -> 'excluded_landmarks') <> 1 then raise exception 'H4 landmarks %', j -> 'excluded_landmarks'; end if;
  -- 00365: الحفظ خفيف (يرفع علم إعادة التقييم)؛ التطبيق في التحديث القادم
  if not (select needs_reeval from public.gps_stop_hotspot_settings where id = 1) then raise exception 'H4 needs_reeval flag'; end if;
  perform app.gps_stop_hotspots_refresh();
  if (select needs_reeval from public.gps_stop_hotspot_settings where id = 1) then raise exception 'H4 flag must clear'; end if;
  select count(*) into n from public.gps_stop_events where excluded and excluded_reason like 'زون:%';
  if n <> 1 then raise exception 'H4 zone-excluded events % (wanted 1)', n; end if;
  select count(*) into n from public.gps_stop_events where excluded and excluded_reason like 'معلم:%';
  if n <> 1 then raise exception 'H4 landmark-excluded events % (wanted 1)', n; end if;
  -- معرّف زون غير موجود يُتجاهل بدل أن يفشل
  j := public.gps_stop_hotspot_settings_save(jsonb_build_object('excluded_zone_ids', jsonb_build_array('00000000-0000-0000-0000-00000000dead')));
  if jsonb_array_length(j -> 'excluded_zones') <> 0 then raise exception 'H4 unknown zone must be dropped'; end if;
  perform app.gps_stop_hotspots_refresh();
  select count(*) into n from public.gps_stop_events where excluded and excluded_reason like 'زون:%';
  if n <> 0 then raise exception 'H4 re-evaluation failed %', n; end if;
  j := public.gps_stop_hotspot_settings_save(jsonb_build_object('excluded_zone_ids', jsonb_build_array('e80d9000-0000-0000-0000-000000000001')));
  perform app.gps_stop_hotspots_refresh();
  raise notice 'H4 ok';
end $$;

-- H5: التجميع والترتيب: البقعة A (D1 10د + D2 6د + D1 القديم 4د) هي الأولى؛ النافذة 24 ساعة تُسقط التوقف القديم
do $$
declare j jsonb; a jsonb; tot bigint;
begin
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000004');   -- نائب: قراءة
  j := public.gps_stop_hotspots(168);
  if (j -> 'meta' ->> 'hours')::int <> 168 then raise exception 'H5 hours %', j -> 'meta'; end if;
  a := j -> 'spots' -> 0;
  if (a ->> 'rank')::int <> 1 or abs((a ->> 'lat')::float8 - 33.3201) > 0.001 then raise exception 'H5 top spot %', a; end if;
  if (a ->> 'stops')::int <> 4 or (a ->> 'vehicles')::int <> 3 then raise exception 'H5 spot A stops/vehicles %', a; end if;
  tot := (a ->> 'total_seconds')::bigint;
  if tot <> 3120 then raise exception 'H5 total_seconds % (wanted 3120 = 630+270+390+1830)', tot; end if;
  if (a ->> 'level') <> 'high' or (a ->> 'score')::numeric <> 1 then raise exception 'H5 level/score %', a; end if;
  if (a ->> 'address') <> 'شارع فلسطين' then raise exception 'H5 address %', a ->> 'address'; end if;
  if jsonb_array_length(a -> 'top_vehicles') <> 3 or (a -> 'top_vehicles' -> 0 ->> 'vehicle_name') <> 'جهاز SH3 غير مربوط' or (a -> 'top_vehicles' -> 1 ->> 'db_number') <> 'DB-SH1' then raise exception 'H5 top vehicles %', a -> 'top_vehicles'; end if;
  if (a ->> 'peak_hour') is null then raise exception 'H5 peak_hour'; end if;
  -- 00365: مئين وتوزيع ساعي وحصة؛ الأدنى «خفيفة» لا «كثيفة»، ومجموع التوزيع الساعي = الإجمالي
  if (a ->> 'percentile')::numeric <> 1 or jsonb_array_length(a -> 'hourly') <> 24 then raise exception 'H5 percentile/hourly %', a; end if;
  if (select sum(x::text::bigint) from jsonb_array_elements(a -> 'hourly') x) <> tot then raise exception 'H5 hourly sum'; end if;
  if (select s2 ->> 'level' from jsonb_array_elements(j -> 'spots') s2 order by (s2 ->> 'rank')::int desc limit 1) <> 'low' then raise exception 'H5 last spot must be low'; end if;
  if abs((select sum((s2 ->> 'share')::numeric) from jsonb_array_elements(j -> 'spots') s2) - 1) > 0.01 then raise exception 'H5 shares must sum to 1'; end if;
  -- لا بقعة داخل زون الكراج ولا عند المعلم
  if exists (select 1 from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.3000) < 0.0005 and abs((s ->> 'lng')::float8 - 44.4000) < 0.0005) then raise exception 'H5 garage must be excluded'; end if;
  if exists (select 1 from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.3500) < 0.0005) then raise exception 'H5 station must be excluded'; end if;
  if (j -> 'totals' ->> 'excluded')::int < 2 then raise exception 'H5 totals.excluded %', j -> 'totals'; end if;
  -- نافذة 24 ساعة: التوقف قبل 30 ساعة يسقط ⇒ A = حدثان
  j := public.gps_stop_hotspots(24);
  a := j -> 'spots' -> 0;
  if (a ->> 'stops')::int <> 3 then raise exception 'H5 24h stops % (wanted 3)', a; end if;
  -- النافذة تُقصّ إلى الحد الأقصى
  j := public.gps_stop_hotspots(9999);
  if (j -> 'meta' ->> 'hours')::int <> 7 * 24 then raise exception 'H5 clamp %', j -> 'meta' ->> 'hours'; end if;
  raise notice 'H5 ok (A total=%s)', tot;
end $$;

-- H6: تفاصيل البقعة
do $$
declare n int;
begin
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000001');
  select count(*) into n from public.gps_stop_hotspot_events(33.3201, 44.4200, 168, 50);
  if n <> 4 then raise exception 'H6 events % (wanted 4)', n; end if;
  select count(*) into n from public.gps_stop_hotspot_events(33.3201, 44.4200, 24, 50);
  if n <> 3 then raise exception 'H6 24h events %', n; end if;
  raise notice 'H6 ok';
end $$;

-- H7: الحذف التلقائي عند تقليص الحد الأقصى؛ والتعطيل يوقف المحرك
do $$
declare j jsonb; n int;
begin
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000002');   -- IT
  j := public.gps_stop_hotspot_settings_save('{"max_days": 1}');
  select count(*) into n from public.gps_stop_events where ended_at < now() - interval '1 day';
  if n <> 0 then raise exception 'H7 purge failed %', n; end if;
  if (j ->> 'max_days')::int <> 1 then raise exception 'H7 max_days'; end if;
  perform pg_temp.expect_error($q$select public.gps_stop_hotspot_settings_save('{"max_days": 99}')$q$, 'check');
  j := public.gps_stop_hotspot_settings_save('{"enabled": false}');
  j := public.gps_stop_hotspots_refresh_now();
  if (j ->> 'devices')::int <> 0 then raise exception 'H7 disabled engine must not scan %', j; end if;
  j := public.gps_stop_hotspot_settings_save('{"enabled": true, "max_days": 7, "map_style": "heat", "heat_intensity": 0.9, "heat_size": 1.5}');
  if (j ->> 'map_style') <> 'heat' or (j ->> 'heat_size')::numeric <> 1.5 then raise exception 'H7 map style %', j; end if;
  perform pg_temp.expect_error($q$select public.gps_stop_hotspot_settings_save('{"map_style": "neon"}')$q$, 'check');
  if (public.gps_stop_hotspots(24) -> 'meta' ->> 'map_style') <> 'heat' then raise exception 'H7 meta map_style'; end if;
  j := public.gps_stop_hotspots_refresh_now();
  if (j ->> 'ok')::boolean is distinct from true then raise exception 'H7 refresh_now %', j; end if;
  raise notice 'H7 ok';
end $$;

-- H8: الصلاحيات — HR ممنوع؛ النائب قراءة فقط (لا حفظ)
do $$
begin
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error('select public.gps_stop_hotspots(24)', 'FORBIDDEN');
  perform pg_temp.expect_error('select public.gps_stop_hotspot_settings_get()', 'FORBIDDEN');
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error($q$select public.gps_stop_hotspot_settings_save('{"max_days": 3}')$q$, 'FORBIDDEN');
  perform pg_temp.expect_error('select public.gps_stop_hotspots_refresh_now()', 'FORBIDDEN');
  if (public.gps_stop_hotspot_settings_get() ->> 'can_edit')::boolean then raise exception 'H8 deputy can_edit must be false'; end if;
  raise notice 'H8 ok';
end $$;

-- H9: الكتالوج والجدولة
do $$
declare n int;
begin
  if not exists (select 1 from app.data_retention_catalog() where table_name = 'gps_stop_events' and deletable) then raise exception 'H9 catalog gps_stop_events'; end if;
  if not exists (select 1 from app.data_retention_catalog() where table_name = 'gps_stop_hotspot_settings' and not deletable) then raise exception 'H9 catalog settings'; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select count(*) from cron.job where jobname = 'gps_stop_hotspots_refresh'$q$ into n;
    if n <> 1 then raise exception 'H9 cron job'; end if;
  end if;
  raise notice 'H9 ok';
end $$;
-- H10 (00364): طابور سحب LVN لكل الأجهزة الفعّالة، العلامة «مسحوب حتى»، الأخطاء لا تتقدم، حالة السحب، وتحديث الخدمة
do $$
declare n int; q record; j jsonb;
begin
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error('select * from public.gps_stop_pull_queue(5)', 'GPS_SERVICE_ROLE_REQUIRED');
  perform pg_temp.as_service();
  select count(*) into n from public.gps_stop_pull_queue(20) where device_id in ('e80dc000-0000-0000-0000-000000000001','e80dc000-0000-0000-0000-000000000002','e80dc000-0000-0000-0000-000000000003');
  if n <> 3 then raise exception 'H10 queue must include bound+unbound devices (got %)', n; end if;
  select * into q from public.gps_stop_pull_queue(20) where device_id = 'e80dc000-0000-0000-0000-000000000003';
  if q.pulled_until is not null or q.direction <> 'forward' or q.pull_to - q.pull_from <> interval '6 hours' or q.pull_to < now() - interval '3 minutes' then raise exception 'H10 first window must be the most recent 6h %', to_jsonb(q); end if;
  -- سحب ناجح حتى قبل دقيقة ⇒ يخرج من الطابور؛ ويعيد المسح من بداية النافذة
  perform public.gps_stop_pull_mark('e80dc000-0000-0000-0000-000000000003', now() - interval '6 hours', now() - interval '1 minute', 120, null);
  if exists (select 1 from public.gps_stop_pull_queue(20) where device_id = 'e80dc000-0000-0000-0000-000000000003' and direction = 'forward') then raise exception 'H10 caught-up device must leave forward queue'; end if;
  select * into q from public.gps_stop_pull_queue(20) where device_id = 'e80dc000-0000-0000-0000-000000000003';
  if q.direction <> 'backward' or q.pull_to <> (select lvn_pulled_from from public.gps_stop_scan_state where device_id = 'e80dc000-0000-0000-0000-000000000003') or q.pull_to - q.pull_from <> interval '6 hours' then raise exception 'H10 backward window %', to_jsonb(q); end if;
  -- الأجهزة التي لم تُسحب تسبق التعميق للخلف
  if (select direction from public.gps_stop_pull_queue(1)) <> 'forward' then raise exception 'H10 forward first'; end if;
  if not exists (select 1 from public.gps_stop_scan_state where device_id = 'e80dc000-0000-0000-0000-000000000003' and lvn_points_total = 120 and scan_from <= now() - interval '6 hours') then raise exception 'H10 mark state'; end if;
  -- خطأ لا يقدّم العلامة
  perform public.gps_stop_pull_mark('e80dc000-0000-0000-0000-000000000003', now() - interval '1 minute', now(), 0, 'LVN_TIMEOUT');
  if not exists (select 1 from public.gps_stop_scan_state where device_id = 'e80dc000-0000-0000-0000-000000000003' and lvn_last_error = 'LVN_TIMEOUT' and lvn_pulled_until <= now() - interval '1 minute') then raise exception 'H10 error must not advance'; end if;
  j := public.gps_stop_hotspots_refresh_service(5000);
  if (j ->> 'ok')::boolean is distinct from true then raise exception 'H10 refresh_service %', j; end if;
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000004');
  j := public.gps_stop_pull_status();
  if (j ->> 'devices')::int < 3 or (j ->> 'errors')::int <> 1 or (j ->> 'last_error') <> 'LVN_TIMEOUT' or (j ->> 'points_total')::int <> 120 then raise exception 'H10 status %', j; end if;
  raise notice 'H10 ok';
end $$;
select 'gps-stop-hotspots ok' as result;

-- H11 (00371): نوافذ بالدقائق مع قصّ دقيق: توقف بدأ قبل بداية النافذة يُحتسب منه الجزء الداخل فقط
do $$
declare j jsonb; a jsonb; n int; ev record; tot int;
begin
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000001');
  j := public.gps_stop_hotspots_v2(50);
  if (j -> 'meta' ->> 'minutes')::int <> 50 or (j -> 'meta' ->> 'hours')::numeric <> round(50 / 60.0, 4) then raise exception 'H11 meta %', j -> 'meta'; end if;
  select s into a from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.3201) < 0.001;
  if a is null then raise exception 'H11 spot A missing %', j -> 'spots'; end if;
  -- D3: توقف 30 د (1830 ث) بدأ قبل ~60 د و15 ث؛ النافذة تبدأ قبل 50 د ⇒ الجزء الداخل بين 1155 و 1215 ث؛ توقف D2 (انتهى قبل ~54 د) يسقط
  tot := (a ->> 'total_seconds')::int;
  if tot not between 1155 and 1215 then raise exception 'H11 clipped total % (wanted 1155..1215)', tot; end if;
  if (a ->> 'stops')::int <> 1 or (a ->> 'vehicles')::int <> 1 then raise exception 'H11 stops/vehicles %', a; end if;
  if (j -> 'totals' ->> 'total_seconds')::int < tot then raise exception 'H11 totals clipped %', j -> 'totals'; end if;
  -- أحداث البقعة مقصوصة بالقدر نفسه
  select count(*) into n from public.gps_stop_hotspot_events_v2(33.3201, 44.4200, 50, 10);
  if n <> 1 then raise exception 'H11 events count % (wanted 1)', n; end if;
  select * into ev from public.gps_stop_hotspot_events_v2(33.3201, 44.4200, 50, 10) limit 1;
  if ev.duration_seconds <> tot then raise exception 'H11 events clip % vs %', ev.duration_seconds, tot; end if;
  -- النافذة الأوسع (90 د) تعيد D3 كاملاً 1830 ث + D2 (390 ث) = 2220
  j := public.gps_stop_hotspots_v2(90);
  select s into a from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.3201) < 0.001;
  if (a ->> 'total_seconds')::int <> 2220 or (a ->> 'stops')::int <> 2 then raise exception 'H11 90m total % (wanted 2220/2)', a; end if;
  -- 5 دقائق: لا شيء (آخر توقف انتهى قبل ~30 د)
  j := public.gps_stop_hotspots_v2(5);
  if jsonb_array_length(coalesce(j -> 'spots', '[]'::jsonb)) <> 0 then raise exception 'H11 5-minute window must be empty %', j -> 'spots'; end if;
  if (j -> 'meta' ->> 'minutes')::int <> 5 then raise exception 'H11 5m meta'; end if;
  -- الغلاف القديم بالساعات يعطي الأرقام نفسها، والقصّ إلى الحد الأقصى بالدقائق، والحد الأدنى دقيقة
  if public.gps_stop_hotspots(2) -> 'totals' <> public.gps_stop_hotspots_v2(120) -> 'totals' then raise exception 'H11 wrapper mismatch'; end if;
  if (public.gps_stop_hotspots_v2(999999) -> 'meta' ->> 'minutes')::int <> 7 * 1440 then raise exception 'H11 clamp max'; end if;
  if (public.gps_stop_hotspots_v2(0) -> 'meta' ->> 'minutes')::int < 1 then raise exception 'H11 clamp min'; end if;
  raise notice 'H11 ok (clipped=%)', tot;
end $$;

-- H12 (00371): الاحتفاظ 7 أيام — التنظيف الأسبوعي يحذف ما هو أقدم من max_days فقط، والمهمة مجدولة
do $$
declare n int; dev uuid := 'e80dc000-0000-0000-0000-000000000001'; old_id bigint; new_id bigint;
begin
  insert into public.gps_stop_events (device_id, latitude, longitude, started_at, ended_at, duration_seconds, excluded)
  values (dev, 33.1, 44.1, now() - interval '8 days 20 minutes', now() - interval '8 days', 1200, false) returning id into old_id;
  insert into public.gps_stop_events (device_id, latitude, longitude, started_at, ended_at, duration_seconds, excluded)
  values (dev, 33.1, 44.1, now() - interval '6 days 20 minutes', now() - interval '6 days', 1200, false) returning id into new_id;
  n := app.gps_stop_events_weekly_purge();
  if n < 1 then raise exception 'H12 purge count %', n; end if;
  if exists (select 1 from public.gps_stop_events where id = old_id) then raise exception 'H12 old event must be purged'; end if;
  if not exists (select 1 from public.gps_stop_events where id = new_id) then raise exception 'H12 recent event must stay'; end if;
  if (select max_days from public.gps_stop_hotspot_settings where id = 1) <> 7 then raise exception 'H12 default retention must be 7 days'; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select count(*) from cron.job where jobname = 'gps_stop_events_daily_purge'$q$ into n;
    if n <> 1 then raise exception 'H12 cron job'; end if;
  end if;
  delete from public.gps_stop_events where id = new_id;
  raise notice 'H12 ok';
end $$;

-- H13 (00372): أحداث التوقف دائمة — حذف النقاط الخام (الاحتفاظ) ثم إعادة المسح لا يُنقص البقع
do $$
declare d3 uuid := 'e80dc000-0000-0000-0000-000000000003'; before_n int; after_n int; r record; j jsonb; a jsonb;
begin
  select count(*) into before_n from public.gps_stop_events where device_id = d3;
  if before_n < 1 then raise exception 'H13 precondition: d3 has no events'; end if;
  -- محاكاة احتفاظ النقاط الخام: حذف كل نقاط D3 ثم إعادة المسح من بداية الاحتفاظ
  delete from public.gps_device_position_history where device_id = d3;
  select * into r from app.gps_stop_scan_device(d3, now() - interval '3 days', now());
  if r.points <> 0 or r.upserted <> 0 then raise exception 'H13 scan without points must be a no-op %', r; end if;
  update public.gps_stop_scan_state set scan_from = now() - interval '3 days' where device_id = d3;
  perform app.gps_stop_hotspots_refresh();
  select count(*) into after_n from public.gps_stop_events where device_id = d3;
  if after_n <> before_n then raise exception 'H13 events lost after raw purge: % -> %', before_n, after_n; end if;
  -- حذف جزئي (الأقدم أولاً كما يفعل الاحتفاظ): نقاط D2 قبل 50 دقيقة تُحذف؛ توقف D2 عند A (قبل ساعة) يبقى، وتوقفه عند المحطة (قبل 40 د) يُعاد اشتقاقه
  delete from public.gps_device_position_history where device_id = 'e80dc000-0000-0000-0000-000000000002' and fix_time < now() - interval '50 minutes';
  select count(*) into before_n from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000002';
  select * into r from app.gps_stop_scan_device('e80dc000-0000-0000-0000-000000000002', now() - interval '3 days', now());
  select count(*) into after_n from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000002';
  if after_n <> before_n then raise exception 'H13 partial purge lost events: % -> %', before_n, after_n; end if;
  if not exists (select 1 from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000002' and abs(latitude - 33.3202) < 0.001 and duration_seconds = 390) then
    raise exception 'H13 D2 stop at A must survive (its raw points are gone)';
  end if;
  -- الاحتفاظ الافتراضي 3 أيام والتنظيف يومي
  if (select column_default from information_schema.columns where table_name = 'gps_stop_hotspot_settings' and column_name = 'max_days') <> '3' then raise exception 'H13 default max_days'; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select count(*) from cron.job where jobname = 'gps_stop_events_daily_purge' and schedule = '30 0 * * *'$q$ into after_n;
    if after_n <> 1 then raise exception 'H13 daily purge cron'; end if;
    execute $q$select count(*) from cron.job where jobname = 'gps_stop_events_weekly_purge'$q$ into after_n;
    if after_n <> 0 then raise exception 'H13 weekly job must be gone'; end if;
  end if;
  raise notice 'H13 ok';
end $$;

-- H14 (00373): الصمت الطويل في المكان نفسه لا يقطع التوقف؛ الأصناف الثلاثة والوسيط والتوزيع
do $$
declare d4 uuid := 'e80dc000-0000-0000-0000-000000000004'; t0 timestamptz := date_trunc('minute', now()); r record; n int; j jsonb; a jsonb; c jsonb;
begin
  insert into public.gps_devices (id, provider_id, external_id, name, online_status) values (d4, 'e80db000-0000-0000-0000-000000000001', 'SH-DEV4', 'جهاز SH4', 'online') on conflict (id) do nothing;
  -- C (33.2800,44.3600): توقف 5 د ← صمت ساعتين (الجهاز نائم) ← توقف 5 د في المكان نفسه ← حركة  ⇒ حدث واحد ≈ 2 س 10 د
  perform pg_temp.move_points(d4, t0 - interval '5 hours' - interval '150 seconds', 33.27, 44.36, 5);
  perform pg_temp.stop_points(d4, t0 - interval '5 hours', 33.2800, 44.3600, 5, 'ساحة C');
  perform pg_temp.stop_points(d4, t0 - interval '5 hours' + interval '2 hours 5 minutes', 33.2800, 44.3600, 5, 'ساحة C');
  perform pg_temp.move_points(d4, t0 - interval '5 hours' + interval '2 hours 10 minutes' + interval '30 seconds', 33.28, 44.36, 5);
  -- E (33.2600,44.3800) ثم صمت ساعتين ثم توقف عند F بعيداً (33.2400,44.3900) ⇒ حدثان منفصلان
  perform pg_temp.move_points(d4, t0 - interval '2 hours' - interval '150 seconds', 33.25, 44.38, 5);
  perform pg_temp.stop_points(d4, t0 - interval '2 hours', 33.2600, 44.3800, 5);
  perform pg_temp.stop_points(d4, t0 - interval '2 hours' + interval '2 hours 5 minutes' - interval '70 minutes', 33.2400, 44.3900, 5);
  perform pg_temp.move_points(d4, t0 - interval '2 hours' + interval '2 hours 5 minutes' - interval '70 minutes' + interval '5 minutes 30 seconds', 33.24, 44.39, 5);
  select * into r from app.gps_stop_scan_device(d4, t0 - interval '6 hours', now());
  select count(*) into n from public.gps_stop_events where device_id = d4 and abs(latitude - 33.28) < 0.001;
  if n <> 1 then raise exception 'H14 same-place silence must stay ONE stop (got %)', n; end if;
  select duration_seconds into n from public.gps_stop_events where device_id = d4 and abs(latitude - 33.28) < 0.001;
  if n not between 7700 and 7900 then raise exception 'H14 bridged duration % (wanted ≈ 7800 = 2h10m)', n; end if;
  select count(*) into n from public.gps_stop_events where device_id = d4 and latitude < 33.27;
  if n <> 2 then raise exception 'H14 different places after silence must be TWO stops (got %)', n; end if;
  if exists (select 1 from public.gps_stop_events where device_id = d4 and latitude < 33.27 and duration_seconds > 900) then raise exception 'H14 split stops must not absorb the silence'; end if;
  -- الأصناف
  perform pg_temp.as_user('e8000000-0000-0000-0000-000000000001');
  j := public.gps_stop_hotspots_v2(3 * 1440);
  select s into c from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.28) < 0.001;
  if c is null or (c ->> 'class') <> 'long' then raise exception 'H14 spot C must be long: %', c; end if;
  if (c -> 'buckets' -> 'long' ->> 'stops')::int <> 1 or (c -> 'buckets' -> 'light' ->> 'stops')::int <> 0 then raise exception 'H14 C buckets %', c -> 'buckets'; end if;
  if (c ->> 'median_seconds')::int <> (c ->> 'max_seconds')::int then raise exception 'H14 C median %', c; end if;
  select s into a from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.3201) < 0.001;
  -- A (بعد تنظيفات الاختبارات السابقة): 1830 + 630 (تلكؤ) + 390 (خفيف 6.5 د) ⇒ الغالب زمنياً «تلكؤ»، الوسيط 630
  if (a ->> 'class') <> 'loiter' then raise exception 'H14 A class % (wanted loiter) %', a ->> 'class', a -> 'buckets'; end if;
  if (a -> 'buckets' -> 'loiter' ->> 'stops')::int <> 2 or (a -> 'buckets' -> 'light' ->> 'stops')::int <> 1 or (a -> 'buckets' -> 'long' ->> 'stops')::int <> 0 then raise exception 'H14 A buckets %', a -> 'buckets'; end if;
  if (a ->> 'median_seconds')::int <> 630 then raise exception 'H14 A median % (wanted 630)', a ->> 'median_seconds'; end if;
  if (a -> 'buckets' -> 'light' ->> 'seconds')::int + (a -> 'buckets' -> 'loiter' ->> 'seconds')::int <> (a ->> 'total_seconds')::int then raise exception 'H14 A bucket seconds must sum to total'; end if;
  -- بقعة خفيفة: E أو F (5 د كلٌّ)
  select s into c from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.26) < 0.001;
  if (c ->> 'class') <> 'light' then raise exception 'H14 E must be light %', c; end if;
  if (j -> 'totals' ->> 'long_stops')::int < 1 or (j -> 'totals' ->> 'light_stops')::int < 2 or (j -> 'totals' ->> 'loiter_stops')::int < 2 then raise exception 'H14 totals %', j -> 'totals'; end if;
  raise notice 'H14 ok';
end $$;
