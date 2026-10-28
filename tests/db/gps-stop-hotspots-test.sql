-- اختبار 00307 (00362): بقع التوقف — استخراج أحداث التوقف تراكمياً، الاستبعاد، التجميع والترتيب، النافذة، الحذف التلقائي، الصلاحيات، الإعدادات.
set client_min_messages = notice;
insert into auth.users (id, email) values ('e8000000-0000-0000-0000-000000000001', 'ops-sh@t.iq'), ('e8000000-0000-0000-0000-000000000002', 'it-sh@t.iq'), ('e8000000-0000-0000-0000-000000000003', 'hr-sh@t.iq'), ('e8000000-0000-0000-0000-000000000004', 'dep-sh@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e8000000-0000-0000-0000-000000000001', 'ops_room'), ('e8000000-0000-0000-0000-000000000002', 'it_admin'), ('e8000000-0000-0000-0000-000000000003', 'hr_officer'), ('e8000000-0000-0000-0000-000000000004', 'deputy_director') on conflict do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (98, 'S98', 'قاطع البقع', 98, 'karrada') on conflict (id) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false), set_config('auth.role', '', false) $$;
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
--  D3: غير مربوط ⇒ يُهمل كلياً
create or replace function pg_temp.stop_points(p_dev uuid, p_start timestamptz, p_lat float8, p_lng float8, p_minutes int, p_addr text default null) returns void language sql as $$
  insert into public.gps_device_position_history (device_id, latitude, longitude, speed, fix_time, address)
  select p_dev, p_lat + 0.00003 * (g % 2), p_lng + 0.00003 * (g % 3), 0, p_start + make_interval(secs => 30 * g), p_addr
  from generate_series(0, p_minutes * 2) g on conflict do nothing $$;
create or replace function pg_temp.move_points(p_dev uuid, p_start timestamptz, p_lat float8, p_lng float8, p_count int) returns void language sql as $$
  insert into public.gps_device_position_history (device_id, latitude, longitude, speed, fix_time)
  select p_dev, p_lat + 0.002 * g, p_lng, 30, p_start + make_interval(secs => 30 * g) from generate_series(0, p_count - 1) g on conflict do nothing $$;
do $$
declare d1 uuid := 'e80dc000-0000-0000-0000-000000000001'; d2 uuid := 'e80dc000-0000-0000-0000-000000000002'; d3 uuid := 'e80dc000-0000-0000-0000-000000000003'; t0 timestamptz := date_trunc('minute', now());
begin
  delete from public.gps_device_position_history where device_id in (d1, d2, d3);
  perform pg_temp.move_points(d1, t0 - interval '3 hour 10 minute', 33.3000, 44.4200, 10);
  perform pg_temp.stop_points(d1, t0 - interval '3 hour', 33.3200, 44.4200, 10, 'شارع فلسطين');
  perform pg_temp.move_points(d1, t0 - interval '2 hour 40 minute', 33.3200, 44.4200, 10);
  perform pg_temp.stop_points(d1, t0 - interval '2 hour', 33.3000, 44.4000, 20);
  perform pg_temp.move_points(d1, t0 - interval '1 hour 30 minute', 33.3000, 44.4000, 10);
  perform pg_temp.stop_points(d1, t0 - interval '1 hour', 33.2500, 44.3000, 2);
  perform pg_temp.move_points(d1, t0 - interval '50 minute', 33.2500, 44.3000, 10);
  perform pg_temp.stop_points(d1, t0 - interval '30 hour', 33.3200, 44.4200, 4);
  perform pg_temp.move_points(d1, t0 - interval '29 hour 50 minute', 33.3200, 44.4200, 10);
  perform pg_temp.move_points(d2, t0 - interval '1 hour 10 minute', 33.3000, 44.4200, 10);
  perform pg_temp.stop_points(d2, t0 - interval '1 hour', 33.3202, 44.4200, 6, 'شارع فلسطين');
  perform pg_temp.move_points(d2, t0 - interval '50 minute', 33.3202, 44.4200, 10);
  perform pg_temp.stop_points(d2, t0 - interval '40 minute', 33.3500, 44.4500, 8);
  perform pg_temp.move_points(d2, t0 - interval '25 minute', 33.3500, 44.4500, 10);
  perform pg_temp.stop_points(d2, t0 - interval '9 day', 33.3200, 44.4200, 30);
  -- توقف يعبر حدّ شريحة المسح (24 ساعة من أرضية النافذة): 10 د حول (الآن − 6 أيام) ⇒ حدث واحد ~600 ث
  perform pg_temp.stop_points(d2, t0 - interval '6 day' - interval '5 minute', 33.2000, 44.2000, 10);
  perform pg_temp.move_points(d2, t0 - interval '6 day' + interval '6 minute', 33.2000, 44.2000, 10);
  perform pg_temp.stop_points(d3, t0 - interval '1 hour', 33.3200, 44.4200, 30);
end $$;

-- H1: الدوري يستخرج الأحداث؛ الاستبعاد يحتاج ضبط القائمة أولاً
do $$
declare r record; n int;
begin
  update public.gps_stop_hotspot_settings set excluded_zone_ids = '{}', excluded_landmark_ids = '{}', max_days = 7, stop_min_seconds = 180, stop_speed_kmh = 3, cluster_radius_m = 60 where id = 1;
  select * into r from app.gps_stop_hotspots_refresh();
  if r.devices < 2 then raise exception 'H1 devices %', r.devices; end if;
  select count(*) into n from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000001';
  if n <> 3 then raise exception 'H1 d1 events % (wanted 3: A×2 + garage; the 2-min stop is below threshold)', n; end if;
  select count(*) into n from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000002';
  if n <> 3 then raise exception 'H1 d2 events % (wanted 3: A + station + slice-boundary stop; the 9-day-old stop is beyond max_days)', n; end if;
  select count(*) into n from public.gps_stop_events e where e.device_id = 'e80dc000-0000-0000-0000-000000000002' and abs(e.latitude - 33.2000) < 0.001 and e.duration_seconds between 590 and 610;
  if n <> 1 then raise exception 'H1 slice-boundary stop must be ONE event of ~600s (got %)', n; end if;
  select count(*) into n from public.gps_stop_events where device_id = 'e80dc000-0000-0000-0000-000000000003';
  if n <> 0 then raise exception 'H1 unbound device must be ignored'; end if;
  select count(*) into n from public.gps_stop_events e where e.duration_seconds between 590 and 610 and e.address = 'شارع فلسطين';
  if n <> 1 then raise exception 'H1 10-min stop duration/address %', n; end if;
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
  select count(*) into n from public.gps_stop_events where excluded and excluded_reason like 'زون:%';
  if n <> 1 then raise exception 'H4 zone-excluded events % (wanted 1)', n; end if;
  select count(*) into n from public.gps_stop_events where excluded and excluded_reason like 'معلم:%';
  if n <> 1 then raise exception 'H4 landmark-excluded events % (wanted 1)', n; end if;
  -- معرّف زون غير موجود يُتجاهل بدل أن يفشل
  j := public.gps_stop_hotspot_settings_save(jsonb_build_object('excluded_zone_ids', jsonb_build_array('00000000-0000-0000-0000-00000000dead')));
  if jsonb_array_length(j -> 'excluded_zones') <> 0 then raise exception 'H4 unknown zone must be dropped'; end if;
  select count(*) into n from public.gps_stop_events where excluded and excluded_reason like 'زون:%';
  if n <> 0 then raise exception 'H4 re-evaluation failed %', n; end if;
  j := public.gps_stop_hotspot_settings_save(jsonb_build_object('excluded_zone_ids', jsonb_build_array('e80d9000-0000-0000-0000-000000000001')));
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
  if (a ->> 'stops')::int <> 3 or (a ->> 'vehicles')::int <> 2 then raise exception 'H5 spot A stops/vehicles %', a; end if;
  tot := (a ->> 'total_seconds')::bigint;
  if tot < 1150 or tot > 1250 then raise exception 'H5 total_seconds % (wanted ~1200)', tot; end if;
  if (a ->> 'level') <> 'high' or (a ->> 'score')::numeric <> 1 then raise exception 'H5 level/score %', a; end if;
  if (a ->> 'address') <> 'شارع فلسطين' then raise exception 'H5 address %', a ->> 'address'; end if;
  if jsonb_array_length(a -> 'top_vehicles') <> 2 or (a -> 'top_vehicles' -> 0 ->> 'db_number') <> 'DB-SH1' then raise exception 'H5 top vehicles %', a -> 'top_vehicles'; end if;
  if (a ->> 'peak_hour') is null then raise exception 'H5 peak_hour'; end if;
  -- لا بقعة داخل زون الكراج ولا عند المعلم
  if exists (select 1 from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.3000) < 0.0005 and abs((s ->> 'lng')::float8 - 44.4000) < 0.0005) then raise exception 'H5 garage must be excluded'; end if;
  if exists (select 1 from jsonb_array_elements(j -> 'spots') s where abs((s ->> 'lat')::float8 - 33.3500) < 0.0005) then raise exception 'H5 station must be excluded'; end if;
  if (j -> 'totals' ->> 'excluded')::int < 2 then raise exception 'H5 totals.excluded %', j -> 'totals'; end if;
  -- نافذة 24 ساعة: التوقف قبل 30 ساعة يسقط ⇒ A = حدثان
  j := public.gps_stop_hotspots(24);
  a := j -> 'spots' -> 0;
  if (a ->> 'stops')::int <> 2 then raise exception 'H5 24h stops % (wanted 2)', a; end if;
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
  if n <> 3 then raise exception 'H6 events % (wanted 3)', n; end if;
  select count(*) into n from public.gps_stop_hotspot_events(33.3201, 44.4200, 24, 50);
  if n <> 2 then raise exception 'H6 24h events %', n; end if;
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
  j := public.gps_stop_hotspot_settings_save('{"enabled": true, "max_days": 7}');
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
select 'gps-stop-hotspots ok' as result;
