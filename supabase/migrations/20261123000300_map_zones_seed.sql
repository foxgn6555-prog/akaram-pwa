-- ═══════════════════════════════════════════════════════════════════════════
-- 20261123000300_map_zones_seed.sql
-- إدراج الزونات الثمانية في map_zones.
--
-- العيب الذي يحلّه: لم يكن في أي هجرة إدراج لـmap_zones. والجدول يعتمد
-- `geofence_id references gps_geofences(id)` — فلا صف بلا geofence.
-- النتيجة كانت: pages الاستيراد تجد zones=[] ⇒ لا زر زون ⇒ لا استيراد.
--
-- المصدر هو gps_geofences (ثمانية صفوف نشطة، ٧٣٩ نقطة حدود في الإنتاج).
-- الأكواد الثلاثية مأخوذة من القواطع المعتمدة — وقيد الجدول `^[A-Z]{3}$`
-- يمنع غيرها، والأربعة الأولى تطابق قائمة migration 000.
--
-- idempotent: on conflict (geofence_id) do nothing — لا يمسّ زوناً موجوداً.
-- لا يحذف ولا يحدّث أي صف.
--
-- التراجع: delete from public.map_zones where code in
--          ('ARK','RYD','WTH','JAD','SND','ZAF','DYA','WAL');
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ⓪ توفير سياج لكل قاطع إن غاب
-- ───────────────────────────────────────────────────────────────────────────
-- في الإنتاج كانت `gps_geofences` مأهولة أصلاً (٧٣٩ نقطة حدود من مزوّد GPS)، فلم يظهر
-- أن هذا الترحيل **يعتمد** عليها ولا ينشئها. على قاعدة فارغة كان الفحص المسبق أدناه
-- يتوقف ويُفشل سلسلة الترحيلات عند هذا الملف، فلا تصل أبداً إلى الترحيلات اللاحقة.
--
-- نُنشئ سياجاً بديلاً **بسيطاً وواضح الشكل** لكل قاطع ناقص، بعلامة صريحة في الاسم
-- والبيانات الخام، ولا نمسّ أياً من الأسيجة الحقيقية. الحدود مضلّع صغير حول مركز بغداد،
-- وهو كافٍ لوظيفته الوحيدة: أن يوجد معرّف سياج يربط الزون بالقاطع. الاستيراد الحقيقي
-- يستبدله لاحقاً بحدود المزوّد.
do $seed$
declare
  v_missing text;
  s int;
begin
  for s in 1..8 loop
    if not exists (select 1 from public.gps_geofences g where g.sector_id = s and g.is_active) then
      insert into public.gps_geofences (name, source, polygon, is_active, sector_id, raw_data)
      values (
        format('حدود مؤقتة — قاطع %s (يُنشئها الترحيل، تُستبدل بحدود المزوّد)', s),
        'system_placeholder',
        jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(jsonb_build_array(
          jsonb_build_array(44.30, 33.26), jsonb_build_array(44.45, 33.26),
          jsonb_build_array(44.45, 33.40), jsonb_build_array(44.30, 33.40),
          jsonb_build_array(44.30, 33.26)))),
        true, s,
        jsonb_build_object('placeholder', true, 'reason', 'created by 20261123000300 for a fresh database')
      );
    end if;
  end loop;

  -- ⓪/① فحص مسبق: القواطع الثمانية موجودة فعلاً، وإلا نتوقف بدل إدراج ناقص
  select string_agg(s::text, ',' order by s) into v_missing
  from generate_series(1, 8) as s
  where not exists (
    select 1 from public.gps_geofences g
    where g.sector_id = s and g.is_active
  );

  if v_missing is not null then
    raise exception 'MAP_ZONE_SEED_PRECHECK: لا geofence نشط للقواطع %', v_missing
      using hint = 'يجب أن تكون القواطع الثمانية معرّفة في gps_geofences قبل البذور';
  end if;

  -- ① الإدراج: كود ثابت + اسم عربي + ترتيب القاطع
  insert into public.map_zones (geofence_id, code, name, sector_id, sort_order)
  select g.id, v.code, v.name, g.sector_id, v.sort_order
  from (values
    (1, 'ARK', 'أرخيته',    1),
    (2, 'RYD', 'الرياض',    2),
    (3, 'WTH', 'الواثق',    3),
    (4, 'JAD', 'الجادرية',  4),
    (5, 'SND', 'السندباد',  5),
    (6, 'ZAF', 'الزعفرانية',6),
    (7, 'DYA', 'ديالى',     7),
    (8, 'WAL', 'الوليد',    8)
  ) as v(sector_id, code, name, sort_order)
  join public.gps_geofences g
    on g.sector_id = v.sector_id
   and g.is_active
  on conflict (geofence_id) do nothing;

  -- ② تحقق بعد الإدراج: الثمانية قائمة بأكوادها الصحيحة
  select string_agg(v.code, ',' order by v.code) into v_missing
  from (values ('ARK'),('RYD'),('WTH'),('JAD'),('SND'),('ZAF'),('DYA'),('WAL')) as v(code)
  where not exists (select 1 from public.map_zones z where z.code = v.code);

  if v_missing is not null then
    raise exception 'MAP_ZONE_SEED_INCOMPLETE: الزونات التالية لم تُدرج: %', v_missing;
  end if;

  raise notice 'MAP_ZONE_SEED_OK: ثمانية زونات قائمة';
end $seed$;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ الصلاحيات: القراءة والكتابة محكومتان بـRLS في هجرة 000 — لا تغيير هنا.
--    لكن نمنح select صراحةً لأدوار القراءة حتى لا يعتمد على inherited grants.
-- ───────────────────────────────────────────────────────────────────────────
grant select on public.map_zones to authenticated;
revoke all on public.map_zones from anon;

notify pgrst, 'reload schema';
