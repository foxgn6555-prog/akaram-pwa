-- اختبار 00272: سياسات الاحتفاظ — طلبات آلية، أقفال سلامة ثابتة، تصدير مُثبَت، تأكيد يدوي، حذف بدفعات، صلاحيات
set client_min_messages = notice;
insert into auth.users (id, email) values ('dd000000-0000-0000-0000-000000000001', 'it-dr@t.iq'), ('dd000000-0000-0000-0000-000000000002', 'mgr-dr@t.iq'), ('dd000000-0000-0000-0000-000000000003', 'it2-dr@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('dd000000-0000-0000-0000-000000000001', 'it_admin'), ('dd000000-0000-0000-0000-000000000003', 'it_admin'), ('dd000000-0000-0000-0000-000000000002', 'department_manager') on conflict do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (93, 'S93', 'قاطع الاحتفاظ', 93, 'karrada') on conflict (id) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- بيانات: بصمات خام في 3 أشهر (قبل 9 أشهر: راتب مدفوع؛ قبل 8 أشهر: راتب مسودة؛ قبل شهر: حديثة) + GPS
do $$
declare m9 date := date_trunc('month', now() - interval '9 month')::date; m8 date := date_trunc('month', now() - interval '8 month')::date; i int;
begin
  delete from public.biometric_punches where device_serial = 'DR-DEV';
  for i in 1..5 loop insert into public.biometric_punches (device_serial, pin, punched_at, direction, method) values ('DR-DEV', 'p' || i, (m9 + 3)::timestamptz + make_interval(hours => i), 'in', 'manual'); end loop;
  for i in 1..4 loop insert into public.biometric_punches (device_serial, pin, punched_at, direction, method) values ('DR-DEV', 'q' || i, (m8 + 3)::timestamptz + make_interval(hours => i), 'in', 'manual'); end loop;
  for i in 1..3 loop insert into public.biometric_punches (device_serial, pin, punched_at, direction, method) values ('DR-DEV', 'r' || i, now() - interval '30 day' + make_interval(hours => i), 'in', 'manual'); end loop;
  insert into public.payrolls (period_month, status) values (m9, 'paid') on conflict (period_month) do update set status = 'paid';
  insert into public.payrolls (period_month, status) values (m8, 'draft') on conflict (period_month) do update set status = 'draft';
end $$;
insert into public.gps_providers (id, name, type) values ('dd0db000-0000-0000-0000-000000000001', 'DR provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values
  ('dd0dc000-0000-0000-0000-000000000001', 'dd0db000-0000-0000-0000-000000000001', 'DR-DEV1', 'جهاز DR1', 'online'),
  ('dd0dc000-0000-0000-0000-000000000002', 'dd0db000-0000-0000-0000-000000000001', 'DR-DEV2', 'جهاز DR2', 'online') on conflict (id) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, created_by) values
  ('dd0da000-0000-0000-0000-000000000001', 'كابسة DR', 'DB-DR1', 'P-DR1', 'CH-DR0001', 'garage/dr1.jpg', 'سائق DR', 'morning', 93, 'dd000000-0000-0000-0000-000000000001') on conflict (id) do nothing;
insert into public.gps_vehicle_bindings (device_id, garage_vehicle_id, match_method) values ('dd0dc000-0000-0000-0000-000000000001', 'dd0da000-0000-0000-0000-000000000001', 'manual') on conflict do nothing;
-- رحلة قديمة (قبل 5 أشهر) عليها تحقيق مفتوح
insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, returned_at, returned_by) values
  ('dd0dd000-0000-0000-0000-000000000001', 'dd0da000-0000-0000-0000-000000000001', 'سائق DR', 'morning', 93, now() - interval '5 month', 'dd000000-0000-0000-0000-000000000001', now() - interval '5 month' + interval '6 hour', 'dd000000-0000-0000-0000-000000000001') on conflict (id) do nothing;
insert into public.gps_trip_investigations (departure_id, event_type, event_at, note, status, created_by, updated_by) values
  ('dd0dd000-0000-0000-0000-000000000001', 'stop', now() - interval '5 month' + interval '1 hour', 'توقف غير مبرر — قيد التحقيق', 'open', 'dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001');
delete from public.gps_device_position_history where device_id in ('dd0dc000-0000-0000-0000-000000000001', 'dd0dc000-0000-0000-0000-000000000002');
-- جهاز 1: 3 نقاط داخل الرحلة المحقَّق فيها (محمية) + 4 نقاط قبل 6 أشهر (قابلة) ؛ جهاز 2: 2 نقاط حديثة (داخل المهلة)
insert into public.gps_device_position_history (device_id, latitude, longitude, fix_time)
select 'dd0dc000-0000-0000-0000-000000000001', 33.3, 44.4, now() - interval '5 month' + make_interval(hours => g) from generate_series(1, 3) g;
insert into public.gps_device_position_history (device_id, latitude, longitude, fix_time)
select 'dd0dc000-0000-0000-0000-000000000001', 33.3, 44.4, now() - interval '6 month' + make_interval(hours => g) from generate_series(1, 4) g;
insert into public.gps_device_position_history (device_id, latitude, longitude, fix_time)
select 'dd0dc000-0000-0000-0000-000000000002', 33.3, 44.4, now() - interval '10 day' + make_interval(hours => g) from generate_series(1, 2) g;

do $$
declare it1 uuid := 'dd000000-0000-0000-0000-000000000001'; mgr uuid := 'dd000000-0000-0000-0000-000000000002'; it2 uuid := 'dd000000-0000-0000-0000-000000000003';
  js jsonb; bio jsonb; gps jsonb; req jsonb; rid uuid; n int; notif_before int; notif_after int; sha text := repeat('a', 64); base_bio bigint; base_gps bigint;
begin
  select count(*) into base_bio from public.biometric_punches where device_serial = 'DR-DEV';
  select count(*) into base_gps from public.gps_device_position_history where device_id in ('dd0dc000-0000-0000-0000-000000000001', 'dd0dc000-0000-0000-0000-000000000002');
  if base_bio <> 12 or base_gps <> 9 then raise exception 'SEED: bio % gps %', base_bio, base_gps; end if;

  -- T0: غير IT ممنوع من كل شيء
  perform pg_temp.as_user(mgr);
  perform pg_temp.expect_error('select public.data_retention_settings_get()', 'IT_FORBIDDEN');
  perform pg_temp.expect_error('select public.data_retention_policy_set(''biometric_raw_punches'', true, 6, true)', 'IT_FORBIDDEN');
  perform pg_temp.expect_error('select public.data_retention_scan_now()', 'IT_FORBIDDEN');

  -- T1: الافتراضي: كل الأنواع معطّلة؛ الفحص لا ينشئ شيئاً ولا يحذف شيئاً
  perform pg_temp.as_user(it1);
  js := public.data_retention_settings_get();
  if jsonb_array_length(js) <> (select count(*) from app.data_retention_catalog()) then raise exception 'T1 catalog size %', jsonb_array_length(js); end if;
  if exists (select 1 from jsonb_array_elements(js) e where (e ->> 'enabled')::boolean) then raise exception 'T1 should all be disabled by default'; end if;
  js := public.data_retention_scan_now();
  if (js ->> 'created')::int <> 0 then raise exception 'T1 scan created % while disabled', js ->> 'created'; end if;
  if (select count(*) from public.biometric_punches where device_serial = 'DR-DEV') <> 12 then raise exception 'T1 rows deleted while disabled!'; end if;

  -- T2: مدخلات غير صالحة
  perform pg_temp.expect_error('select public.data_retention_policy_set(''nope'', true, 6, false)', 'RETENTION_UNKNOWN_KEY');
  perform pg_temp.expect_error('select public.data_retention_policy_set(''biometric_raw_punches'', true, 0, false)', 'RETENTION_INPUT_INVALID');
  perform pg_temp.expect_error('select public.data_retention_policy_set(''biometric_raw_punches'', true, 121, false)', 'RETENTION_INPUT_INVALID');

  -- T3: تفعيل البصمات (6 أشهر، تصدير مطلوب) → الفحص ينشئ طلباً واحداً + إشعاراً لكل حساب IT، ولا يحذف شيئاً
  select count(*) into notif_before from public.notifications where link = '/it/data-retention';
  js := public.data_retention_policy_set('biometric_raw_punches', true, 6, true);
  js := public.data_retention_scan_now();
  if (js ->> 'created')::int <> 1 then raise exception 'T3 created %', js ->> 'created'; end if;
  select count(*) into notif_after from public.notifications where link = '/it/data-retention';
  if notif_after - notif_before < 2 then raise exception 'T3 IT not notified (% new)', notif_after - notif_before; end if;
  if not exists (select 1 from public.notifications where link = '/it/data-retention' and user_id = it2 and title like '%البصمات الخام%') then raise exception 'T3 it2 notification missing'; end if;
  if (select count(*) from public.biometric_punches where device_serial = 'DR-DEV') <> 12 then raise exception 'T3 rows deleted at scan!'; end if;
  -- الفحص مرة ثانية لا يكرر الطلب
  js := public.data_retention_scan_now();
  if (js ->> 'created')::int <> 0 then raise exception 'T3b duplicate request'; end if;
  if (select count(*) from public.data_retention_requests where data_key = 'biometric_raw_punches' and status = 'pending') <> 1 then raise exception 'T3c open requests count'; end if;

  -- T4: أعداد الطلب: أقدم من 6 أشهر = 9 (5 شهر مدفوع + 4 شهر مسودة)، المحمي = 4 (شهر المسودة)، القابل = 5؛ الحديثة (3) خارج المهلة
  select app.data_retention_request_json(r) into req from public.data_retention_requests r where r.data_key = 'biometric_raw_punches' and r.status = 'pending';
  rid := (req ->> 'id')::uuid;
  if (req ->> 'rows_total')::int <> 9 or (req ->> 'rows_locked')::int <> 4 or (req ->> 'rows_deletable')::int <> 5 then
    raise exception 'T4 counts total % locked % deletable %', req ->> 'rows_total', req ->> 'rows_locked', req ->> 'rows_deletable'; end if;
  if (req ->> 'export_required')::boolean is not true or (req ->> 'can_confirm')::boolean then raise exception 'T4 flags'; end if;

  -- T5: التأكيد بلا تصدير ممنوع؛ الحذف قبل التأكيد ممنوع
  perform pg_temp.expect_error(format('select public.data_retention_confirm(%L)', rid), 'RETENTION_EXPORT_REQUIRED');
  perform pg_temp.expect_error(format('select public.data_retention_delete_batch(%L, 100)', rid), 'RETENTION_BAD_STATE');

  -- T6: إثبات تصدير بعدد خاطئ مرفوض؛ بصمة غير صالحة مرفوضة؛ العدد الصحيح يُقبل
  perform pg_temp.expect_error(format('select public.data_retention_export_recorded(%L, 4, %L, ''قرص-1'')', rid, sha), 'RETENTION_EXPORT_COUNT_MISMATCH');
  perform pg_temp.expect_error(format('select public.data_retention_export_recorded(%L, 5, ''zz'', ''قرص-1'')', rid), 'RETENTION_INPUT_INVALID');
  req := public.data_retention_export_recorded(rid, 5, sha, 'قرص-1');
  if req ->> 'status' <> 'exported' or (req ->> 'can_confirm')::boolean is not true then raise exception 'T6 state %', req ->> 'status'; end if;

  -- T7: دخلت بصمة قديمة جديدة بعد التصدير (استيراد متأخر) → التأكيد مرفوض لأن الإثبات لم يعد مطابقاً
  insert into public.biometric_punches (device_serial, pin, punched_at, direction, method) values ('DR-DEV', 'late', (date_trunc('month', now() - interval '9 month') + interval '5 day'), 'out', 'manual');
  perform pg_temp.expect_error(format('select public.data_retention_confirm(%L)', rid), 'RETENTION_EXPORT_STALE');
  delete from public.biometric_punches where device_serial = 'DR-DEV' and pin = 'late';

  -- T8: التأكيد ثم الحذف بدفعات صغيرة: يحذف 5 فقط، يُبقي 4 المحمية + 3 الحديثة
  req := public.data_retention_confirm(rid);
  if req ->> 'status' <> 'confirmed' or req ->> 'confirmed_by_name' is null then raise exception 'T8 confirm %', req; end if;
  req := public.data_retention_delete_batch(rid, 2);
  if req ->> 'status' <> 'deleting' or (req ->> 'rows_deleted')::int <> 2 then raise exception 'T8 batch1 %', req; end if;
  req := public.data_retention_delete_batch(rid, 2);
  req := public.data_retention_delete_batch(rid, 2);
  if req ->> 'status' <> 'done' or (req ->> 'rows_deleted')::int <> 5 then raise exception 'T8 done %', req; end if;
  if (select count(*) from public.biometric_punches where device_serial = 'DR-DEV') <> 7 then raise exception 'T8 remaining %', (select count(*) from public.biometric_punches where device_serial = 'DR-DEV'); end if;
  if (select count(*) from public.biometric_punches where device_serial = 'DR-DEV' and pin like 'q%') <> 4 then raise exception 'T8 draft-month punches were deleted!'; end if;
  if (select count(*) from public.biometric_punches where device_serial = 'DR-DEV' and pin like 'r%') <> 3 then raise exception 'T8 recent punches were deleted!'; end if;
  perform pg_temp.expect_error(format('select public.data_retention_delete_batch(%L, 100)', rid), 'RETENTION_BAD_STATE');
  -- سجل الأحداث مكتمل
  if not (req -> 'events' @> '[{"action":"request_created"}]' and req -> 'events' @> '[{"action":"exported"}]' and req -> 'events' @> '[{"action":"confirmed"}]' and req -> 'events' @> '[{"action":"done"}]') then raise exception 'T8 events %', req -> 'events'; end if;

  -- T9: اعتماد راتب شهر المسودة لاحقاً → الفحص ينشئ طلباً جديداً للـ 4 المتبقية
  update public.payrolls set status = 'approved' where period_month = date_trunc('month', now() - interval '8 month')::date;
  js := public.data_retention_scan_now();
  if (js ->> 'created')::int <> 1 then raise exception 'T9 created %', js ->> 'created'; end if;
  select app.data_retention_request_json(r) into req from public.data_retention_requests r where r.data_key = 'biometric_raw_punches' and r.status = 'pending';
  if (req ->> 'rows_deletable')::int <> 4 then raise exception 'T9 deletable %', req ->> 'rows_deletable'; end if;
  -- إيقاف السياسة يلغي الطلب المعلّق
  js := public.data_retention_policy_set('biometric_raw_punches', false, 6, true);
  if exists (select 1 from public.data_retention_requests where data_key = 'biometric_raw_punches' and status in ('pending','exported')) then raise exception 'T9 open request survived disable'; end if;

  -- T10: GPS (3 أشهر، بلا تصدير): 7 أقدم من المهلة، 3 محمية بتحقيق مفتوح → 4 قابلة؛ التأكيد مباشر؛ الحذف يترك المحمية والحديثة
  js := public.data_retention_policy_set('gps_position_history', true, 3, false);
  js := public.data_retention_scan_now();
  select app.data_retention_request_json(r) into req from public.data_retention_requests r where r.data_key = 'gps_position_history' and r.status = 'pending';
  rid := (req ->> 'id')::uuid;
  if (req ->> 'rows_total')::int <> 7 or (req ->> 'rows_locked')::int <> 3 or (req ->> 'rows_deletable')::int <> 4 then
    raise exception 'T10 counts total % locked % deletable %', req ->> 'rows_total', req ->> 'rows_locked', req ->> 'rows_deletable'; end if;
  if (req ->> 'can_confirm')::boolean is not true then raise exception 'T10 can_confirm without export'; end if;
  req := public.data_retention_confirm(rid);
  req := public.data_retention_delete_batch(rid, 1000);
  if req ->> 'status' <> 'done' or (req ->> 'rows_deleted')::int <> 4 then raise exception 'T10 delete %', req; end if;
  if (select count(*) from public.gps_device_position_history where device_id = 'dd0dc000-0000-0000-0000-000000000001') <> 3 then raise exception 'T10 investigated points deleted!'; end if;
  if (select count(*) from public.gps_device_position_history where device_id = 'dd0dc000-0000-0000-0000-000000000002') <> 2 then raise exception 'T10 recent points deleted!'; end if;

  -- T11: حل التحقيق → النقاط الثلاث تصبح قابلة؛ الإلغاء يوقف الطلب
  update public.gps_trip_investigations set status = 'resolved' where departure_id = 'dd0dd000-0000-0000-0000-000000000001';
  js := public.data_retention_scan_now();
  select app.data_retention_request_json(r) into req from public.data_retention_requests r where r.data_key = 'gps_position_history' and r.status = 'pending';
  if (req ->> 'rows_deletable')::int <> 3 then raise exception 'T11 deletable %', req ->> 'rows_deletable'; end if;
  req := public.data_retention_cancel((req ->> 'id')::uuid);
  if req ->> 'status' <> 'cancelled' then raise exception 'T11 cancel'; end if;
  if (select count(*) from public.gps_device_position_history where device_id = 'dd0dc000-0000-0000-0000-000000000001') <> 3 then raise exception 'T11 cancelled but deleted'; end if;

  -- T12: القائمة تعمل وغير IT لا يرى الجداول عبر RLS
  js := public.data_retention_requests_list(10);
  if jsonb_array_length(js) < 3 then raise exception 'T12 list %', jsonb_array_length(js); end if;
  perform pg_temp.as_user(mgr);
  perform pg_temp.expect_error(format('select public.data_retention_confirm(%L)', rid), 'IT_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.data_retention_delete_batch(%L, 10)', rid), 'IT_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.data_retention_cancel(%L)', rid), 'IT_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.data_retention_export_recorded(%L, 1, %L, ''x'')', rid, sha), 'IT_FORBIDDEN');

  -- تنظيف
  perform pg_temp.as_user(it1);
  perform public.data_retention_policy_set('gps_position_history', false, 3, false);
  raise notice 'data-retention-core-test: OK';
end $$;

-- ─────────────── 00273: تغذية التصدير ───────────────
do $$
declare it1 uuid := 'dd000000-0000-0000-0000-000000000001'; mgr uuid := 'dd000000-0000-0000-0000-000000000002';
  js jsonb; req jsonb; rid uuid; page jsonb; total int := 0; ids jsonb := '[]'::jsonb; after jsonb := null; i int;
begin
  perform pg_temp.as_user(it1);
  -- بصمات جديدة لشهر معتمد (قبل 10 أشهر): 7 صفوف قابلة + شهر مسودة (قبل 7 أشهر): 2 محمية
  for i in 1..7 loop insert into public.biometric_punches (device_serial, pin, punched_at, direction, method) values ('DR-DEV', 'x' || i, (date_trunc('month', now() - interval '10 month') + interval '2 day')::timestamptz + make_interval(mins => i), 'in', 'manual'); end loop;
  for i in 1..2 loop insert into public.biometric_punches (device_serial, pin, punched_at, direction, method) values ('DR-DEV', 'y' || i, (date_trunc('month', now() - interval '7 month') + interval '2 day')::timestamptz + make_interval(mins => i), 'out', 'manual'); end loop;
  insert into public.payrolls (period_month, status) values (date_trunc('month', now() - interval '10 month')::date, 'approved') on conflict (period_month) do update set status = 'approved';
  insert into public.payrolls (period_month, status) values (date_trunc('month', now() - interval '7 month')::date, 'draft') on conflict (period_month) do update set status = 'draft';
  js := public.data_retention_policy_set('biometric_raw_punches', true, 6, true);
  js := public.data_retention_scan_now();
  select app.data_retention_request_json(r) into req from public.data_retention_requests r where r.data_key = 'biometric_raw_punches' and r.status = 'pending';
  rid := (req ->> 'id')::uuid;
  -- E1: الدفعات بمؤشر (حد 3) تعيد كل القابلة بلا تكرار، وعددها = rows_deletable؛ الأعمدة عربية
  loop
    page := public.data_retention_export_rows(rid, after, 3);
    total := total + (page ->> 'count')::int;
    select coalesce(jsonb_agg(x -> 'المعرّف'), '[]'::jsonb) || ids into ids from jsonb_array_elements(page -> 'rows') x;
    exit when page -> 'next' is null or page ->> 'next' is null;
    after := page -> 'next';
  end loop;
  if total <> (req ->> 'rows_deletable')::int then raise exception 'E1 exported % expected %', total, req ->> 'rows_deletable'; end if;
  if (select count(distinct v) from jsonb_array_elements(ids) v) <> total then raise exception 'E1 duplicates across pages'; end if;
  if page ->> 'label' <> 'البصمات الخام من الأجهزة' then raise exception 'E1 label'; end if;
  page := public.data_retention_export_rows(rid, null, 1);
  if not (page -> 'rows' -> 0) ? 'وقت البصمة' or not (page -> 'rows' -> 0) ? 'الاتجاه' or (page -> 'rows' -> 0 ->> 'الاتجاه') not in ('دخول','خروج','غير محدد') then raise exception 'E1 columns %', page -> 'rows' -> 0; end if;
  -- E2: الصفوف المحمية (شهر المسودة) ليست ضمن التصدير
  if exists (select 1 from jsonb_array_elements(ids) v join public.biometric_punches b on b.id::text = (v #>> '{}') where b.pin like 'y%') then raise exception 'E2 locked rows exported'; end if;
  -- E3: العدد المصدَّر يُقبل كإثبات؛ غير IT ممنوع؛ بعد الإلغاء الحالة تمنع التصدير
  req := public.data_retention_export_recorded(rid, total, repeat('b', 64), 'قرص-ب');
  if req ->> 'status' <> 'exported' then raise exception 'E3 status'; end if;
  page := public.data_retention_export_rows(rid, null, 5);   -- ما زال مسموحاً في exported (إعادة تصدير)
  perform pg_temp.as_user(mgr);
  perform pg_temp.expect_error(format('select public.data_retention_export_rows(%L, null, 5)', rid), 'IT_FORBIDDEN');
  perform pg_temp.as_user(it1);
  req := public.data_retention_cancel(rid);
  perform pg_temp.expect_error(format('select public.data_retention_export_rows(%L, null, 5)', rid), 'RETENTION_BAD_STATE');
  -- E4: GPS: الأعمدة عربية والمحمية مستثناة
  update public.gps_trip_investigations set status = 'open' where departure_id = 'dd0dd000-0000-0000-0000-000000000001';
  insert into public.gps_device_position_history (device_id, latitude, longitude, fix_time, address)
  select 'dd0dc000-0000-0000-0000-000000000001', 33.31, 44.41, now() - interval '7 month' + make_interval(hours => g), 'الكرادة' from generate_series(1, 2) g;
  js := public.data_retention_policy_set('gps_position_history', true, 3, false);
  js := public.data_retention_scan_now();
  select app.data_retention_request_json(r) into req from public.data_retention_requests r where r.data_key = 'gps_position_history' and r.status = 'pending';
  page := public.data_retention_export_rows((req ->> 'id')::uuid, null, 100);
  if (page ->> 'count')::int <> (req ->> 'rows_deletable')::int or (page ->> 'count')::int <> 2 then raise exception 'E4 count % deletable %', page ->> 'count', req ->> 'rows_deletable'; end if;
  if (page -> 'rows' -> 0 ->> 'الآلية') <> 'كابسة DR' or (page -> 'rows' -> 0 ->> 'العنوان') <> 'الكرادة' then raise exception 'E4 columns %', page -> 'rows' -> 0; end if;
  perform public.data_retention_cancel((req ->> 'id')::uuid);
  perform public.data_retention_policy_set('gps_position_history', false, 3, false);
  perform public.data_retention_policy_set('biometric_raw_punches', false, 6, true);
  raise notice 'data-retention-export-rows: OK';
end $$;
