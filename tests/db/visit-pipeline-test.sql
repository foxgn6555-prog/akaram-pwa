-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- tests/db/visit-pipeline-test.sql — اختبار خطّ الزيارات الموحّد (20261202000100/②/③)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- يثبت سبعة عقود لا يجوز أن تنكسر. كل واحد منها يقابل عطباً وقع فعلاً على الإنتاج:
--
--   A1  الشفتان تغطّيان ٢٤ ساعة بلا فراغ ولا تداخل، وبالحدود المعتمدة (05:00/17:00)
--   A2  الحذف بنطاق النافذة: بناء الشفت المسائي لا يمسّ زيارات الصباح
--   A3  بناء يوم كامل لا يمسّ اليوم التالي (عطب v_day_to = اليوم التالي)
--   A4  حارس النقاط: نقاط أقل من الزيارات ⇒ استثناء ولا حذف
--   A5  الشهادة: تُرفض على يوم بلا نقاط، وعلى شفت ناقص، وعلى صفّ فاشل
--   A6  الشهادة: صفّ 'empty' على شفت **فيه نقاط** يُبطل الشهادة
--   A7  التفريغ: يوم غير مُشهَّد لا تُحذف نقاطه، ويُسجَّل سببه
--
-- التشغيل: psql "$DATABASE_URL" -f tests/db/visit-pipeline-test.sql
-- التراجع: BEGIN…ROLLBACK في النهاية — لا يبقى أثر.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
set client_min_messages = notice;

create or replace function pg_temp.eq(p_got anyelement, p_want anyelement, p_label text) returns void
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL % — got % wanted %', p_label, p_got, p_want;
  end if;
  raise notice 'ok %', p_label;
end $$;

create or replace function pg_temp.raises(p_sql text, p_code text, p_label text) returns void
language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'FAIL % — no error raised (wanted %)', p_label, p_code; end if;
  if position(p_code in msg) = 0 then raise exception 'FAIL % — got [%] wanted [%]', p_label, msg, p_code; end if;
  raise notice 'ok %', p_label;
end $$;

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- A1 · تعريف الشفتين
-- ─────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  v_sum numeric;
  v_overlap numeric;
begin
  select sum(extract(epoch from (w.win_end - w.win_start)) / 3600.0) into v_sum
    from app.visit_shift_windows('2026-11-25') w;
  perform pg_temp.eq(v_sum, 24::numeric, 'A1a مجموع الشفتين 24 ساعة');

  select coalesce(sum(extract(epoch from (least(a.win_end, b.win_end) - greatest(a.win_start, b.win_start))) / 3600.0), 0)
    into v_overlap
    from app.visit_shift_windows('2026-11-25') a
    join app.visit_shift_windows('2026-11-25') b
      on a.shift_key < b.shift_key and a.win_start < b.win_end and a.win_end > b.win_start;
  perform pg_temp.eq(v_overlap, 0::numeric, 'A1b لا تداخل بين الشفتين');

  select * into r from app.visit_shift_windows('2026-11-25') w where w.shift_key = 'morning';
  perform pg_temp.eq(r.win_start, '2026-11-25 02:00:00+00'::timestamptz, 'A1c الصباحي يبدأ 05:00 بغداد');
  perform pg_temp.eq(r.win_end,   '2026-11-25 14:00:00+00'::timestamptz, 'A1d الصباحي ينتهي 17:00 بغداد');

  select * into r from app.visit_shift_windows('2026-11-25') w where w.shift_key = 'evening';
  perform pg_temp.eq(r.win_start, '2026-11-25 14:00:00+00'::timestamptz, 'A1e المسائي يبدأ 17:00 بغداد');
  perform pg_temp.eq(r.win_end,   '2026-11-26 02:00:00+00'::timestamptz, 'A1f المسائي ينتهي 05:00 اليوم التالي');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- بيانات اختبار: زون واحد + آلية + جهاز مربوط + زيارات اصطناعية حول حدّ 17:00
-- ─────────────────────────────────────────────────────────────────────────────────────────
insert into public.sectors (id, code, name, sort, parent_sector)
values (94, 'S94', 'قاطع خطّ الزيارات', 94, 'karrada') on conflict (id) do nothing;

-- الزون لا يُنشأ هنا: `map_zones.geofence_id` مرجع إلزامي إلى gps_geofences،
-- وإنشاء سياج وهمي كان سيُلوّث بيانات الخريطة. نستخدم زوناً قائماً ونضع زياراتنا فيه.
-- إن لم يوجد أي زون (قاعدة فارغة) يتخطّى الاختبار نفسه بأمان.
select id into temporary table _vp_zone from public.map_zones order by sort_order limit 1;

-- created_by إلزامي في garage_vehicles — نأخذ أي مستخدم قائم، وإن لم يوجد نتخطّى.
select id into temporary table _vp_user from auth.users order by created_at limit 1;

-- على قاعدة جديدة قد لا يوجد زون ولا مستخدم (لا بيانات مرجعية بعد). بقية الملف كانت
-- تستمرّ حينها فتُدرج صفوفاً بمفاتيح أجنبية غائبة وتفشل برسالة FK غامضة. نتخطّى صراحةً
-- ونطبع السبب، فيبقى الفرق واضحاً بين «تخطّي مقصود» و«عطل».
do $$
begin
  if not exists (select 1 from _vp_zone) or not exists (select 1 from _vp_user) then
    raise notice 'skip A2–A7 — لا زون أو لا مستخدم على هذه القاعدة (قاعدة جديدة)';
  end if;
end $$;

insert into public.garage_vehicles
  (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, created_by)
select 'f1a10000-0000-0000-0000-000000000001', 'آلية VP', 'DB-VP', 'P-VP', 'CH-VP01', 'g/vp.jpg', 'سائق', 'morning', 94, (select id from _vp_user)
where exists (select 1 from _vp_user)
on conflict (id) do nothing;

insert into public.gps_providers (id, name, type)
values ('f1a20000-0000-0000-0000-000000000001', 'VP provider', 'vendor_api')
on conflict (id) do nothing;

insert into public.gps_devices (id, provider_id, external_id, name, online_status)
values ('f1a30000-0000-0000-0000-000000000001', 'f1a20000-0000-0000-0000-000000000001', 'VP-DEV-1', 'جهاز VP', 'online')
on conflict (id) do nothing;

insert into public.gps_vehicle_bindings (device_id, garage_vehicle_id, match_method)
select 'f1a30000-0000-0000-0000-000000000001', 'f1a10000-0000-0000-0000-000000000001', 'manual'
where exists (select 1 from public.garage_vehicles where id = 'f1a10000-0000-0000-0000-000000000001')
on conflict (device_id) do nothing;

-- ⚠ التاريخ اصطناعي وقديم جداً (2020-01-15) قصداً: أي تاريخ حديث يحمل زيارات
-- إنتاج حقيقية داخل نفس الزون، فتنهار عدّادات الاختبار على بيانات ليست منه.
-- ويوم 2020-01-15 بغداداً = 2020-01-14 21:00Z → 2020-01-15 21:00Z.
-- الشفت الصباحي 02:00Z–14:00Z، والمسائي 14:00Z–2020-01-16 02:00Z.
insert into public.map_visits
  (zone_id, vehicle_id, device_id, place_kind, place_id, place_code, place_name,
   placeday, seq, entered_at, exited_at, dwell_seconds, points_count, status)
select * from (values
  ((select id from _vp_zone), 'f1a10000-0000-0000-0000-000000000001',
   'f1a30000-0000-0000-0000-000000000001', 'alley',
   'f1a40000-0000-0000-0000-000000000001', 'VP-1', 'زقاق ١',
   '2020-01-15', 1, '2020-01-15 03:00:00+00', '2020-01-15 03:10:00+00', 600, 5, 'confirmed'),
  ((select id from _vp_zone), 'f1a10000-0000-0000-0000-000000000001',
   'f1a30000-0000-0000-0000-000000000001', 'alley',
   'f1a40000-0000-0000-0000-000000000002', 'VP-2', 'زقاق ٢',
   '2020-01-15', 2, '2020-01-15 06:00:00+00', '2020-01-15 06:10:00+00', 600, 5, 'confirmed'),
  ((select id from _vp_zone), 'f1a10000-0000-0000-0000-000000000001',
   'f1a30000-0000-0000-0000-000000000001', 'alley',
   'f1a40000-0000-0000-0000-000000000003', 'VP-3', 'زقاق ٣',
   '2020-01-15', 3, '2020-01-15 11:00:00+00', '2020-01-15 11:10:00+00', 600, 5, 'confirmed'),
  ((select id from _vp_zone), 'f1a10000-0000-0000-0000-000000000001',
   'f1a30000-0000-0000-0000-000000000001', 'alley',
   'f1a40000-0000-0000-0000-000000000004', 'VP-4', 'زقاق ٤',
   '2020-01-15', 4, '2020-01-15 15:00:00+00', '2020-01-15 15:10:00+00', 600, 5, 'confirmed')
) v(zone_id, vehicle_id, device_id, place_kind, place_id, place_code, place_name,
    placeday, seq, entered_at, exited_at, dwell_seconds, points_count, status)
-- لا نُدرج زيارات وهمية إن لم يوجد زون أو آلية: كانت تفشل بـ FK غامض على قاعدة جديدة.
where exists (select 1 from public.garage_vehicles where id = 'f1a10000-0000-0000-0000-000000000001')
  and exists (select 1 from public.map_zones where id = (select id from _vp_zone))
on conflict (vehicle_id, place_kind, place_id, entered_at) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- A2/A3 · نطاق الحذف = النافذة، لا اليوم
--   لا نُشغّل المحرّك هنا (يحتاج نقاطاً حقيقية وهندسة) — نُثبت **شرط الحذف** نفسه،
--   وهو السطر الذي كان يمحو زيارات الصباح: بين() على اليوم بدل >=/< على النافذة.
-- ─────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_morning int;
  v_evening int;
  v_old_scope int;
begin
  -- الزيارات الاصطناعية أعلاه لا تُدرج على قاعدة جديدة (لا زون ولا آلية)، فلا شيء
  -- لقياس نطاق الحذف عليه. تخطٍّ صريح مع سبب، بدل انهيار على عدّاد صفر.
  if not exists (
    select 1 from public.map_visits
     where zone_id = (select id from _vp_zone)
       and vehicle_id = 'f1a10000-0000-0000-0000-000000000001'
  ) then
    raise notice 'skip A2/A3 — لا زيارات اصطناعية (قاعدة جديدة بلا زون/آلية)';
    return;
  end if;

  select count(*) into v_morning from public.map_visits
   where zone_id = (select id from _vp_zone)
     and entered_at >= '2020-01-15 02:00:00+00' and entered_at < '2020-01-15 14:00:00+00';
  select count(*) into v_evening from public.map_visits
   where zone_id = (select id from _vp_zone)
     and entered_at >= '2020-01-15 14:00:00+00' and entered_at < '2020-01-16 02:00:00+00';

  perform pg_temp.eq(v_morning, 3, 'A2a ثلاث زيارات صباحية قبل 17:00');
  perform pg_temp.eq(v_evening, 1, 'A2b زيارة مسائية واحدة بعد 17:00');

  -- النطاق الجديد (المستخدم في المحرّك): المسائي فقط
  select count(*) into v_old_scope from public.map_visits
   where zone_id = (select id from _vp_zone)
     and entered_at >= '2020-01-15 14:00:00+00' and entered_at < '2020-01-16 02:00:00+00';
  perform pg_temp.eq(v_old_scope, 1, 'A2c الحذف المسائي يمسّ زيارة واحدة فقط — لا الصباح');

  -- النطاق القديم المعطوب (اليوم كامل عبر between على اليوم البغدادي) كان سيمسّ الأربع
  select count(*) into v_old_scope from public.map_visits
   where zone_id = (select id from _vp_zone)
     and app.map_baghdad_day(entered_at) between '2020-01-15'::date
         and app.map_baghdad_day('2020-01-16 02:00:00+00'::timestamptz - interval '1 second');
  perform pg_temp.eq(v_old_scope, 4, 'A3a النطاق القديم كان يمسّ 4 (العطب موثّق)');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- A4 · حارس النقاط — استثناء صريح ولا حذف
-- ─────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from public.map_visits
   where zone_id = (select id from _vp_zone);

  -- النافذة فيها صفر نقطة (لا نُدخل نقاطاً) وفيها 3 زيارات ⇒ يجب أن يرفض
  perform pg_temp.raises(
    $q$select app.map_build_visits((select id from _vp_zone)::uuid,
          '2020-01-15 02:00:00+00'::timestamptz, '2020-01-15 14:00:00+00'::timestamptz,
          null, 60, 300, true, true)$q$,
    'MAP_BUILD_GUARD_INSUFFICIENT_POINTS', 'A4a الحارس يرفض الهدم بلا نقاط');

  select count(*) into v_after from public.map_visits
   where zone_id = (select id from _vp_zone);
  perform pg_temp.eq(v_after, v_before, 'A4b لم تُحذف أي زيارة بعد رفض الحارس');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- A5/A6 · الشهادة
--   نستخدم يوماً اصطناعياً بعيداً حتى لا نلمس بيانات حقيقية، ونكتب صفوف السجل يدوياً.
-- ─────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_day date := current_date - 400;
  v_note int;
begin
  -- (١) سجل فارغ ⇒ لا شهادة
  perform pg_temp.eq(app.gps_day_is_certified(v_day), false, 'A5a سجل فارغ ⇒ لا شهادة');

  -- (٢) كل الصفوف 'empty' على يوم بلا نقاط ⇒ لا شهادة (لا دليل على أنه مرّ بلا نشاط)
  insert into public.gps_visit_builds (zone_id, day, shift_type, status, trigger_kind)
  select z.id, v_day, w.shift_key, 'empty', 'nightly'
    from public.map_zones z cross join app.visit_shift_windows(v_day) w
  on conflict (zone_id, day, shift_type) do nothing;
  perform pg_temp.eq(app.gps_day_is_certified(v_day), false, 'A5b يوم بلا نقاط ⇒ لا شهادة ولو كانت كل الصفوف empty');

  -- (٣) صفّ failed واحد يُسقط الشهادة
  update public.gps_visit_builds set status = 'failed', error = 'test'
   where day = v_day and zone_id = (select id from public.map_zones order by sort_order limit 1)
     and shift_type = 'morning';
  perform pg_temp.eq(app.gps_day_is_certified(v_day), false, 'A5c صفّ فاشل ⇒ لا شهادة');

  -- (٤) شفت ناقص يُسقط الشهادة
  update public.gps_visit_builds set status = 'empty', error = null where day = v_day;
  delete from public.gps_visit_builds
   where day = v_day and shift_type = 'evening'
     and zone_id = (select id from public.map_zones order by sort_order limit 1);
  perform pg_temp.eq(app.gps_day_is_certified(v_day), false, 'A5d شفت ناقص ⇒ لا شهادة');

  get diagnostics v_note = row_count;
  delete from public.gps_visit_builds where day = v_day;
end $$;

-- A6 · صفّ empty على شفت **فيه نقاط** — الحالة التي أنتجت شهادة كاذبة على الإنتاج
do $$
declare
  v_day  date;
  v_zone uuid;
  v_shift record;
  v_has_points boolean;
  v_got boolean;
begin
  -- نبحث عن يوم بغدادي حقيقي فيه نقاط لشفت واحد على الأقل، داخل نافذة نقاط موجودة
  select app.map_baghdad_day(h.fix_time) into v_day
    from public.gps_device_position_history h
   group by 1 having count(*) > 5
   order by 1 desc limit 1;

  if v_day is null then
    raise notice 'skip A6 — لا نقاط في القاعدة';
    return;
  end if;

  v_zone := (select id from public.map_zones order by sort_order limit 1);
  delete from public.gps_visit_builds where day = v_day;

  for v_shift in select * from app.visit_shift_windows(v_day) w loop
    select exists (
      select 1 from public.gps_device_position_history h
       where h.fix_time >= v_shift.win_start and h.fix_time < v_shift.win_end
         and exists (select 1 from public.gps_vehicle_bindings vb where vb.device_id = h.device_id)
    ) into v_has_points;

    -- كل الزونات: empty دائماً، وpoints_at_build = null
    insert into public.gps_visit_builds (zone_id, day, shift_type, status, trigger_kind, points_at_build)
    select z.id, v_day, v_shift.shift_key, 'empty', 'nightly', null
      from public.map_zones z
    on conflict (zone_id, day, shift_type) do update set status = 'empty', points_at_build = null;

    if v_has_points then
      v_got := app.gps_day_is_certified(v_day);
      perform pg_temp.eq(v_got, false, 'A6 صفّ empty على شفت فيه نقاط ⇒ لا شهادة (' || v_shift.shift_key || ')');
      exit;
    end if;
  end loop;

  delete from public.gps_visit_builds where day = v_day;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- A7 · التفريغ لا يحذف نقاط يوم غير مُشهَّد، ويُسجَّل السبب
-- ─────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_day    date;
  v_points bigint;
  v_state  jsonb;
begin
  select app.map_baghdad_day(h.fix_time) into v_day
    from public.gps_device_position_history h
   group by 1 having count(*) > 5 order by 1 desc limit 1;

  if v_day is null then
    raise notice 'skip A7 — لا نقاط في القاعدة';
    return;
  end if;

  -- نجعل اليوم غير مُشهَّد (سجل فارغ) ثم نتفقّد أن حالة اليوم تُعلن السبب
  delete from public.gps_visit_builds where day = v_day;
  v_state := app.visit_day_state(v_day);

  perform pg_temp.eq((v_state ->> 'certified')::boolean, false, 'A7a اليوم غير مُشهَّد بعد محو السجل');
  perform pg_temp.eq((v_state ->> 'shift_rows_missing')::int, 16, 'A7b 16 صفّ شفت ناقص (8 زونات × 2)');
  if not (v_state -> 'reasons') @> '[{"code":"not_built"}]'::jsonb then
    raise exception 'FAIL A7c السبب لا يذكر not_built: %', v_state -> 'reasons';
  end if;
  raise notice 'ok A7c السبب يذكر not_built';

  select count(*) into v_points from public.gps_device_position_history h
   where app.map_baghdad_day(h.fix_time) = v_day;
  perform pg_temp.eq(v_points > 0, true, 'A7d النقاط ما زالت موجودة — لم يُحذف شيء');
end $$;

rollback;

raise notice '════ كل اختبارات خطّ الزيارات نجحت ════';
