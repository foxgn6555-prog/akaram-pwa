-- 00324 (00380): حالة ربط مستودع GPS — القراءة لـ IT/العمليات، التسجيل للخدمة فقط، سجل الآليات للمستودع
set client_min_messages = notice;
insert into auth.users (id, email) values ('e9000000-0000-0000-0000-000000000001', 'it-wh@t.iq'), ('e9000000-0000-0000-0000-000000000002', 'hr-wh@t.iq'), ('e9000000-0000-0000-0000-000000000003', 'ops-wh@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e9000000-0000-0000-0000-000000000001', 'it_admin'), ('e9000000-0000-0000-0000-000000000002', 'hr_officer'), ('e9000000-0000-0000-0000-000000000003', 'ops_room') on conflict do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (94, 'S94', 'قاطع المستودع', 94, 'karrada') on conflict (id) do nothing;
insert into public.gps_providers (id, name, type) values ('e90db000-0000-0000-0000-000000000001', 'WH provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values ('e90dc000-0000-0000-0000-000000000001', 'e90db000-0000-0000-0000-000000000001', 'WH-1', 'جهاز WH1', 'online'),
  ('e90dc000-0000-0000-0000-000000000002', 'e90db000-0000-0000-0000-000000000001', 'WH-2', 'جهاز حر WH2', 'online'),
  ('e90dc000-0000-0000-0000-000000000003', 'e90db000-0000-0000-0000-000000000001', 'WH-3', 'جهاز مربوط بمؤرشفة', 'online') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status, is_active) values ('e90dc000-0000-0000-0000-000000000004', 'e90db000-0000-0000-0000-000000000001', 'WH-4', 'جهاز معطّل', 'offline', false) on conflict (id) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, created_by) values
  ('e90da000-0000-0000-0000-000000000001', 'كابسة WH', 'DB-WH1', 'P-WH1', 'CH-WH001', 'g/w.jpg', 'سائق', 'morning', 94, 'e9000000-0000-0000-0000-000000000001'),
  ('e90da000-0000-0000-0000-000000000002', 'كابسة بلا جهاز', 'DB-WH2', 'P-WH2', 'CH-WH002', 'g/w2.jpg', 'سائق', 'morning', 94, 'e9000000-0000-0000-0000-000000000001'),
  ('e90da000-0000-0000-0000-000000000003', 'مؤرشفة', 'DB-WH3', 'P-WH3', 'CH-WH003', 'g/w3.jpg', 'سائق', 'morning', 94, 'e9000000-0000-0000-0000-000000000001') on conflict (id) do nothing;
update public.garage_vehicles set archived_at = now() where id = 'e90da000-0000-0000-0000-000000000003';
insert into public.gps_vehicle_bindings (device_id, garage_vehicle_id, match_method) values ('e90dc000-0000-0000-0000-000000000001', 'e90da000-0000-0000-0000-000000000001', 'manual'), ('e90dc000-0000-0000-0000-000000000003', 'e90da000-0000-0000-0000-000000000003', 'manual') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false), set_config('auth.role', '', false) $$;
create or replace function pg_temp.as_service() returns void language sql as $$ select set_config('auth.user_id', '', false), set_config('auth.role', 'service_role', false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if position(p_code in msg) = 0 then raise exception 'WRONG_ERROR: got % wanted %', msg, p_code; end if;
end $$;
do $$
declare js jsonb; r jsonb;
begin
  -- K1: الصف الوحيد موجود؛ HR ممنوع؛ IT والعمليات يقرآن
  if (select count(*) from public.gps_warehouse_link) <> 1 then raise exception 'K1 singleton'; end if;
  perform pg_temp.as_user('e9000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error('select public.gps_warehouse_link_get()', 'GPS_FORBIDDEN');
  perform pg_temp.expect_error('select public.gps_warehouse_registry()', 'GPS_FORBIDDEN');
  perform pg_temp.as_user('e9000000-0000-0000-0000-000000000003');
  js := public.gps_warehouse_link_get(); if (js ->> 'id')::int <> 1 or js ->> 'last_ping_at' is not null then raise exception 'K1 ops read %', js; end if;
  perform pg_temp.expect_error('select public.gps_warehouse_registry()', 'GPS_FORBIDDEN');   -- السجل للخدمة/IT فقط
  perform pg_temp.expect_error('select public.gps_warehouse_link_record(''ping'', true)', 'GPS_FORBIDDEN');
  -- K2: السجل (IT): الآليات غير المؤرشفة فقط، مع الجهاز إن وُجد
  perform pg_temp.as_user('e9000000-0000-0000-0000-000000000001');
  js := public.gps_warehouse_registry();
  select x into r from jsonb_array_elements(js) x where x ->> 'vehicle_id' = 'e90da000-0000-0000-0000-000000000001';
  if r is null or r ->> 'device_external_id' <> 'WH-1' or r ->> 'sector_name' <> 'قاطع المستودع' or r ->> 'db_number' <> 'DB-WH1' then raise exception 'K2 bound %', r; end if;
  select x into r from jsonb_array_elements(js) x where x ->> 'vehicle_id' = 'e90da000-0000-0000-0000-000000000002';
  if r is null or r ->> 'device_external_id' is not null then raise exception 'K2 unbound %', r; end if;
  if exists (select 1 from jsonb_array_elements(js) x where x ->> 'vehicle_id' = 'e90da000-0000-0000-0000-000000000003') then raise exception 'K2 archived included'; end if;
  -- K2b (00326): الأجهزة النشطة غير المربوطة بآلية فعّالة تُدرج باسم الجهاز؛ المعطّل لا يُدرج؛ المربوط لا يتكرر
  select x into r from jsonb_array_elements(js) x where x ->> 'vehicle_id' = 'e90dc000-0000-0000-0000-000000000002';
  if r is null or r ->> 'source' <> 'device' or r ->> 'device_external_id' <> 'WH-2' or r ->> 'vehicle_name' <> 'جهاز حر WH2' then raise exception 'K2b free device %', r; end if;
  if not exists (select 1 from jsonb_array_elements(js) x where x ->> 'device_external_id' = 'WH-3' and x ->> 'source' = 'device') then raise exception 'K2b device bound to archived vehicle missing'; end if;
  if exists (select 1 from jsonb_array_elements(js) x where x ->> 'device_external_id' = 'WH-4') then raise exception 'K2b inactive device included'; end if;
  if (select count(*) from jsonb_array_elements(js) x where x ->> 'device_external_id' = 'WH-1') <> 1 then raise exception 'K2b bound device duplicated'; end if;
  if jsonb_array_length(js) <> 4 then raise exception 'K2b count %', jsonb_array_length(js); end if;
  perform pg_temp.expect_error('select public.gps_warehouse_link_record(''ping'', true)', 'GPS_FORBIDDEN');   -- حتى IT لا يسجّل؛ الخدمة فقط
  -- K3: الخدمة تسجّل فحصاً ناجحاً ثم فاشلاً ثم مزامنة سجل
  perform pg_temp.as_service();
  js := public.gps_warehouse_registry(); if jsonb_array_length(js) <> 4 then raise exception 'K3 service registry'; end if;
  perform public.gps_warehouse_link_record('ping', true, '{"schema_version":1,"vehicles":0}'::jsonb, 'ujfwtbzvpshtxzsjtcxz.supabase.co');
  perform pg_temp.as_user('e9000000-0000-0000-0000-000000000001'); js := public.gps_warehouse_link_get();
  if not (js ->> 'last_ping_ok')::boolean or (js ->> 'schema_version')::int <> 1 or js ->> 'warehouse_host' <> 'ujfwtbzvpshtxzsjtcxz.supabase.co' or js ->> 'last_error_code' is not null then raise exception 'K3 ping ok %', js; end if;
  perform pg_temp.as_service();
  perform public.gps_warehouse_link_record('ping', false, '{}'::jsonb, null, 'GPS_WAREHOUSE_UNREACHABLE');
  perform pg_temp.as_user('e9000000-0000-0000-0000-000000000001'); js := public.gps_warehouse_link_get();
  if (js ->> 'last_ping_ok')::boolean or js ->> 'last_error_code' <> 'GPS_WAREHOUSE_UNREACHABLE' or (js ->> 'schema_version')::int <> 1 or js ->> 'warehouse_host' is null then raise exception 'K3 ping fail %', js; end if;
  perform pg_temp.as_service();
  perform public.gps_warehouse_link_record('registry', true, '{"upserted":2,"deactivated":0,"active":2}'::jsonb);
  perform pg_temp.expect_error('select public.gps_warehouse_link_record(''x'', true)', 'GPS_WAREHOUSE_KIND_INVALID');
  perform pg_temp.as_user('e9000000-0000-0000-0000-000000000001'); js := public.gps_warehouse_link_get();
  if (js ->> 'registry_active')::int <> 2 or js ->> 'last_registry_sync_at' is null or js ->> 'last_error_code' is not null then raise exception 'K3 registry %', js; end if;
  -- K4 (00381): حالة المجدول ضمن الحالة (بلا pg_cron في الاختبار ⇒ غير مجدول)
  if (js -> 'cron' ->> 'scheduled')::boolean is distinct from false then raise exception 'K4 cron %', js -> 'cron'; end if;
  perform pg_temp.as_user('e9000000-0000-0000-0000-000000000002'); perform pg_temp.expect_error('select public.gps_warehouse_cron_status()', 'GPS_FORBIDDEN');
  raise notice 'gps warehouse link ok';
end $$;
