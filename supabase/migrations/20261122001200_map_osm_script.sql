-- ═══════════════════════════════════════════════════════════════════════════
-- الجولة ٩ — مولد سكربت OSM من مضلّع الزون
--
--   لماذا دالة قاعدة لا كود واجهة؟
--   المضلّع هو «مصدر الحقيقة» في gps_geofences، وتوليد النص من نفس المصدر
--   مباشرة يمنع صنفاً كاملاً من الأخطاء: مضلّع منسوخ في الواجهة يبتعد عن
--   الأصل بصمت (فاصلة عشرية، ترتيب محاور، خطأ يدوي) ثم نستورد حدوداً لا
--   تشبه المضلّع. هنا لا يوجد نسخ: النص يُبنى من القاعدة لحظة الطلب.
--
--   يُستخدم من الواجهة لاحقاً بـ: select app.map_osm_script(app.map_zone_polygon($1))
-- ═══════════════════════════════════════════════════════════════════════════

-- ① مضلّع الزون — بصيغة Overpass (lat lon lat lon ...)
--    ملاحظة حرجة: مضلّعات gps_geofences حلقة **مفتوحة** (آخر نقطة ≠ أولها).
--    Overpass يقبل المفتوح، لكننا نغلقه صراحةً لتطابق ما يفعله المستورد
--    (load_zone يُغلق الحلقة) — وإلا اختلفت النتيجة بين «ما رسمت» و«ما استورد».
create or replace function app.map_zone_polygon(p_zone uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_poly jsonb;
  v_out  text := '';
  v_first text;
  v_last  text;
  pt     jsonb;
  n      int := 0;
begin
  select g.polygon into v_poly
  from public.map_zones z
  join public.gps_geofences g on g.id = z.geofence_id
  where z.id = p_zone;

  if v_poly is null then
    raise exception 'MAP_ZONE_POLYGON_MISSING: الزون % بلا مضلّع في gps_geofences', p_zone
      using errcode = 'no_data_found';
  end if;

  for pt in select value from jsonb_array_elements(v_poly) loop
    -- ندعم الشكلين: [lat,lng] و {lat,lng} — المنصة تكتب كليهما
    v_out := v_out || case when n = 0 then '' else ' ' end
      || round(coalesce((pt->>0)::numeric, (pt->>'lat')::numeric), 7)::text
      || ' '
      || round(coalesce((pt->>1)::numeric, (pt->>'lng')::numeric), 7)::text;
    if n = 0 then v_first := v_out; end if;
    n := n + 1;
  end loop;

  if n < 3 then
    raise exception 'MAP_ZONE_POLYGON_INVALID: المضلّع بنقطة واحدة أو نقطتين (n=%)', n
      using errcode = 'check_violation';
  end if;

  -- إغلاق الحلقة إن كانت مفتوحة (نفس منطق load_zone في المستورد)
  v_last := split_part(v_out, ' ', array_length(string_to_array(v_out, ' '), 1) - 1)
         || ' ' || split_part(v_out, ' ', array_length(string_to_array(v_out, ' '), 1));
  if v_last <> v_first then
    v_out := v_out || ' ' || v_first;
  end if;

  return v_out;
end $$;

comment on function app.map_zone_polygon(uuid) is
  'مضلّع الزون بصيغة Overpass (lat lon...) — مغلق صراحةً ليطابق ما يستورده المستورد';

-- ② السكربت الكامل — جاهز للصق في overpass-turbo.eu
--    الشبكة: way["highway"](poly:"...") — لا amenity/shops: الشوارع فقط.
--    (._;>;); يجلب عُقد الأزقة، وهو ضروري وإلا عاد الملف بمسارات بلا إحداثيات.
create or replace function app.map_osm_script(p_zone uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_name text;
  v_code text;
  v_pts  text;
begin
  select z.name, z.code into v_name, v_code
  from public.map_zones z where z.id = p_zone;

  if v_name is null then
    raise exception 'MAP_ZONE_NOT_FOUND: الزون % غير موجود', p_zone
      using errcode = 'no_data_found';
  end if;

  v_pts := app.map_zone_polygon(p_zone);

  return format(
$script$// ═══════════════════════════════════════════════════════════════════════
// Akaram — سكربت استيراد زون «%s» (%s)
// وُلّد من مضلّع gps_geofences الحقيقي — %s نقطة
//
// ١. افتح: https://overpass-turbo.eu
// ٢. الصق هذا كله في مربع الاستعلام (يسار الشاشة)
// ٣. اضغط Run
// ٤. اضغط Export ← «raw OSM data» ← يُنزَّل ملف .osm
// ٥. عُد إلى المنصة وأدرج الملف
// ═══════════════════════════════════════════════════════════════════════
[out:xml][timeout:900][maxsize:1073741824];

(
  way["highway"](poly:"%s");
);

(._;>;);

out body;
$script$,
    v_name, v_code,
    (array_length(string_to_array(v_pts, ' '), 1) / 2)::text,
    v_pts);
end $$;

comment on function app.map_osm_script(uuid) is
  'سكربت Overpass جاهز للصق — يُولَّد من المضلّع الحقيقي، لا من نسخة في الواجهة';

revoke all on function app.map_zone_polygon(uuid) from public, anon;
revoke all on function app.map_osm_script(uuid) from public, anon;
grant execute on function app.map_zone_polygon(uuid) to authenticated;
grant execute on function app.map_osm_script(uuid) to authenticated;
