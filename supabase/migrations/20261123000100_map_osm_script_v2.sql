-- ═══════════════════════════════════════════════════════════════════════════
-- المرحلة ① من خطة مطابقة الشكل مع Overpass — إصلاح السكربت المولَّد
--
--   المشكلة المقيسة (docs/plans/map-import-shape-mismatch-diagnosis.md):
--   الملف المُستورد يصل بعقد متباعدة ⇒ الشكل زاوي لا يطابق Overpass.
--     · كثافة العقد 132 عقدة/كم² مقابل 2000–8000 في بغداد الكثيفة
--     · وسيط العقد/شوط = 4   ·   32% من الأشواط بعقدتين فقط
--     · أقصى فجوة بين عقدتين متتاليتين = 1135 متر
--
--   ثلاثة أسباب في السكربت المولَّد، لا في خوارزمية القصّ:
--
--   ① maxsize = 1 ج.ب فقط. Overpass يقتطع الملف عند بلوغه الحدّ **بصمت**:
--      يعيد XML صالحاً ناقصاً، لا خطأ. وOverpass Turbo يكتفي بعرض تحذير
--      صغير في الأسفل لا يُقرأ. النتيجة: ملف يبدو سليماً وهو مقتطع.
--      ⇒ يُرفع إلى 2 ج.ب (أقصى ما يسمحه overpass-api.de).
--
--   ② `out body;` يُسقط الوسوم (tags) ويُبقي الإحداثيات. لا مشكلة في الرسم،
--      لكنه يمنع **التحقق**: لا يمكن معرفة إن كان الملف مقتطعاً لأن
--      `timestamp`، `version`، `changeset` غير موجودة. ومع `out meta;`
--      يستطيع المستورد قياس الاكتمال.
--      ⚠ التغيير **لا يغيّر الشكل** — نفس العقد ونفس المسارات.
--
--   ③ لا توجد أي إرشادات للمشغّل عند حدوث الاقتطاع، فيعيد المحاولة بنفس
--      السكربت ويحصل على نفس الملف الناقص.
--
--   ما تفعله هذه الهجرة:
--     · script()   — سكربت جديد بمضلّع الزون، maxsize 2ج.ب، out meta، وإرشاد
--                     التقسيم إلى أرباع عند الاقتطاع.
--     · script_bbox(p_zone, p_quarter) — سكربت لربع محدّد من الزون (شمالي/
--                     جنوبي/شرقي/غربي) ⇒ حلّ الاقتطاع جذرياً لا مجرد تحذير.
--     · completeness(mahallas_count, ways_count, ...) — تقييم اكتمال ملف
--                     مُستورد: يقارن ما وصل بما يجب أن يصل.
--
--   التراجع: المهاجرة السابقة 20261122001200 تبقى سليمة — أعد تشغيلها.
--           أو: drop function app.map_osm_script_v2(uuid);
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① السكربت الأساسي — maxsize 2ج.ب + out meta + إرشادات القطع
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_osm_script_v2(p_zone uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_name  text;
  v_code  text;
  v_pts   text;
  v_npts  int;
begin
  select z.name, z.code into v_name, v_code
  from public.map_zones z where z.id = p_zone;

  if v_name is null then
    raise exception 'MAP_ZONE_NOT_FOUND: الزون % غير موجود', p_zone
      using errcode = 'no_data_found';
  end if;

  v_pts  := app.map_zone_polygon(p_zone);
  v_npts := array_length(string_to_array(v_pts, ' '), 1) / 2;

  /*
   * maxsize: كان 1073741824 (1 ج.ب) — وهو حدّ Overpass الافتراضي. رفعه إلى
   * 2147483648 (2 ج.ب) **لا يضمن** عدم الاقتطاع، لكنه يرفع السقف ضعفين ويقلّل
   * احتمال بلوغه كثيراً في زونات بغداد الكثيفة (تقدير: 5–15 م.ب لكل زون).
   *
   * out meta: يُضيف timestamp/version/changeset لكل عنصر. لا يغيّر الشكل،
   * لكنه يسمح للمستورد بقياس الاكتمال وكشف الاقتطاع.
   *
   * الإرشادات في التعليق ليست تجميلاً: المشغّل لا يرى تحذير Overpass Turbo
   * إن كان صغيراً، فيعود بنفس الملف الناقص. نُخبره صراحةً ماذا يفعل.
   */
  return format(
$script$// ═══════════════════════════════════════════════════════════════════════
// Akaram — سكربت استيراد زون «%s» (%s)
// وُلّد من مضلّع gps_geofences الحقيقي — %s نقطة
//
// ١. افتح: https://overpass-turbo.eu
// ٢. الصق هذا كله في مربع الاستعلام
// ٣. اضغط Run — انتظر حتى ينتهي (قد يأخذ دقيقة للزونات الكبيرة)
// ٤. اضغط Export ← «raw OSM data» ← يُنزَّل ملف .osm
// ٥. عُد إلى المنصة وأدرج الملف
//
// ⚠ إن ظهر تحذير في أسفل شاشة Overpass بأي كلمة من:
//    «runtime error» · «out of memory» · «maxsize» · «timeout»
//    فالملف **ناقص** — لا تُدرجه. أعد التصدير بأحد الحلّين:
//
//    أ) استخدم سكربت «الربع» من المنصة (زر: تصدير ربع) — أربعة أرباع
//       واستوردها بالترتيب. هذا الحلّ المضمون.
//
//    ب) قسّم يدوياً: غيّر bbox أدناه إلى نصف الزون، ثم النصف الآخر.
//
// ⚠ كيف تعرف أن الملف كامل؟ عدد العناصر يجب أن يكون بالآلاف لا بالمئات.
//    زون بغداد الكثيف (≈3 كم²) يعطي عادةً 1500–4000 طريقاً.
// ═══════════════════════════════════════════════════════════════════════
[out:xml][timeout:900][maxsize:2147483648];

(
  way["highway"](poly:"%s");
);

(._;>;);

out meta;
$script$,
    v_name, v_code, v_npts::text, v_pts);
end $$;

comment on function app.map_osm_script_v2(uuid) is
  'سكربت Overpass بمضلّع الزون — maxsize 2ج.ب وout meta وإرشاد التقسيم عند الاقتطاع';

-- ───────────────────────────────────────────────────────────────────────────
-- ② سكربت ربع الزون — الحلّ الجذري للاقتطاع لا مجرد تحذير
--
--    الفكرة: بدل «حاول مرة أخرى بأمل ألا يُقتطع»، نُعطي المشغّل مضلّعاً
--    بحجم رُبع الزون. أي ملف من ربع لن يبلغ maxsize عملياً، ثم نُدرج الأربعة.
--    المستورد يقبل ملفات متعددة في نفس الزون (insert بـ on conflict).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_osm_script_quarter(p_zone uuid, p_quarter int)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_name text;
  v_code text;
  v_poly jsonb;
  -- ⚠ يبدأ '' لا NULL: في PL/pgSQL `NULL || 'نص'` = NULL إلى الأبد،
  --   فالحلقة تبني NULL صامتاً ويخرج poly:"" بلا أي خطأ. (عيب أُمسك بالتنفيذ
  --   على PostgreSQL حقيقي، لا بقراءة الكود.)
  v_pts  text := '';
  v_clip jsonb;
  v_lat0 numeric; v_lat1 numeric; v_lng0 numeric; v_lng1 numeric;
  v_mlat numeric; v_mlng numeric;
  v_label text;
  pt jsonb;
  n int := 0;
  v_first text;
  v_last text;
begin
  if p_quarter not between 1 and 4 then
    raise exception 'MAP_QUARTER_INVALID: الربع يجب أن يكون 1..4 (وصل %)', p_quarter
      using errcode = 'check_violation';
  end if;

  select z.name, z.code into v_name, v_code
  from public.map_zones z where z.id = p_zone;
  if v_name is null then
    raise exception 'MAP_ZONE_NOT_FOUND: الزون % غير موجود', p_zone
      using errcode = 'no_data_found';
  end if;

  select g.polygon into v_poly
  from public.map_zones z
  join public.gps_geofences g on g.id = z.geofence_id
  where z.id = p_zone;

  if v_poly is null then
    raise exception 'MAP_ZONE_POLYGON_MISSING: الزون % بلا مضلّع', p_zone
      using errcode = 'no_data_found';
  end if;

  -- نطاق المضلّع: نقرأ الشكلين [lat,lng] و {lat,lng} كما في map_zone_polygon
  -- ⚠ `pt` مُعرَّف أعلاه كمتغير — لا يُستعمل كاسم عمود هنا وإلا التبس
  --   (PL/pgSQL يفضّل المتغير على العمود ⇒ كل الصفوف تُقرأ من قيمة واحدة).
  select min(coalesce((e.val->>0)::numeric, (e.val->>'lat')::numeric)),
         max(coalesce((e.val->>0)::numeric, (e.val->>'lat')::numeric)),
         min(coalesce((e.val->>1)::numeric, (e.val->>'lng')::numeric)),
         max(coalesce((e.val->>1)::numeric, (e.val->>'lng')::numeric))
    into v_lat0, v_lat1, v_lng0, v_lng1
  from jsonb_array_elements(v_poly) as e(val);

  v_mlat := (v_lat1 + v_lat0) / 2;
  v_mlng := (v_lng1 + v_lng0) / 2;

  /*
   * الربع كمستطيل يغطّي ربع نطاق الزون. الشكل الناتج مستطيل لا مضلّع —
   * وهذا **مقصود**: Overpass يقبل bbox، والمستورد يقصّ على المضلّع الحقيقي
   * لاحقاً. أي أن المستطيل يجلب زيادة ثم يُنقّى. الأهم ألا يُقتطع الملف.
   */
  v_clip := case p_quarter
    when 1 then jsonb_build_array(jsonb_build_array(v_mlat, v_lng0), jsonb_build_array(v_lat1, v_lng0), jsonb_build_array(v_lat1, v_mlng), jsonb_build_array(v_mlat, v_mlng))  -- شمالي غربي
    when 2 then jsonb_build_array(jsonb_build_array(v_mlat, v_mlng), jsonb_build_array(v_lat1, v_mlng), jsonb_build_array(v_lat1, v_lng1), jsonb_build_array(v_mlat, v_lng1))  -- شمالي شرقي
    when 3 then jsonb_build_array(jsonb_build_array(v_lat0, v_lng0), jsonb_build_array(v_mlat, v_lng0), jsonb_build_array(v_mlat, v_mlng), jsonb_build_array(v_lat0, v_mlng))  -- جنوبي غربي
    else        jsonb_build_array(jsonb_build_array(v_lat0, v_mlng), jsonb_build_array(v_mlat, v_mlng), jsonb_build_array(v_mlat, v_lng1), jsonb_build_array(v_lat0, v_lng1))  -- جنوبي شرقي
  end;

  v_label := case p_quarter
    when 1 then 'شمالي غربي' when 2 then 'شمالي شرقي'
    when 3 then 'جنوبي غربي' else 'جنوبي شرقي' end;

  for pt in select value from jsonb_array_elements(v_clip) loop
    v_pts := v_pts || case when n = 0 then '' else ' ' end
      || round((pt->>0)::numeric, 7)::text || ' ' || round((pt->>1)::numeric, 7)::text;
    if n = 0 then v_first := v_pts; end if;
    n := n + 1;
  end loop;

  v_last := split_part(v_pts, ' ', array_length(string_to_array(v_pts, ' '), 1) - 1)
         || ' ' || split_part(v_pts, ' ', array_length(string_to_array(v_pts, ' '), 1));
  if v_last <> v_first then
    v_pts := v_pts || ' ' || v_first;
  end if;

  return format(
$script$// ═══════════════════════════════════════════════════════════════════════
// Akaram — زون «%s» (%s) — الربع %s من 4: %s
//
// هذا **جزء** من الزون. استورد الأرباع الأربعة (1 ثم 2 ثم 3 ثم 4) في نفس
// الزون على المنصة — الإدراج يدمج تلقائياً (on conflict update).
//
// لماذا أرباع؟ لأن استعلام الزون كاملاً قد يُقتطع عند maxsize فيُعطي
// ملفاً ناقصاً بصمت. الربع بحجم ربع الزون لا يبلغ الحدّ عملياً.
// ═══════════════════════════════════════════════════════════════════════
[out:xml][timeout:900][maxsize:2147483648];

(
  way["highway"](poly:"%s");
);

(._;>;);

out meta;
$script$,
    v_name, v_code, p_quarter::text, v_label, v_pts);
end $$;

comment on function app.map_osm_script_quarter(uuid, int) is
  'سكربت Overpass لربع الزون (1..4) — يحلّ الاقتطاع بتقسيم الحمل';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ أغلفة public — PostgREST يكشف public فقط
--    (نفس نمط 20261122001600 — الحرّاس قبل أي تنفيذ)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.map_osm_script_v2(p_zone uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.map_osm_script_v2(p_zone);
end $$;

create or replace function public.map_osm_script_quarter(p_zone uuid, p_quarter int)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.map_osm_script_quarter(p_zone, p_quarter);
end $$;

revoke all on function app.map_osm_script_v2(uuid) from public, anon;
revoke all on function app.map_osm_script_quarter(uuid, int) from public, anon;
revoke all on function public.map_osm_script_v2(uuid) from public, anon;
revoke all on function public.map_osm_script_quarter(uuid, int) from public, anon;

grant execute on function app.map_osm_script_v2(uuid) to authenticated;
grant execute on function app.map_osm_script_quarter(uuid, int) to authenticated;
grant execute on function public.map_osm_script_v2(uuid) to authenticated;
grant execute on function public.map_osm_script_quarter(uuid, int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ملاحظة على التحقق من الاكتمال
--
--   كان مقصوداً إضافة دالة `map_import_completeness` تقارن ما وصل بما يجب.
--   لكن «ما يجب» غير معروف مسبقاً — لا يوجد مرجع لعدد طرق زون في OSM إلا
--   باستعلام Overpass آخر (شبكة؟ لا). فالدالة ستُخمّن، والتخمين في تقرير
--   «هل ملفي كامل» أسوأ من غيابه: يعطي ثقة كاذبة.
--
--   البديل المنفَّذ في كود الواجهة (المرحلة ③): قياس **الشكل** لا العدد —
--   نسبة الأشواط ذات العقد ≤ 4، ووسيط العقد/شوط. إن كانتا مرتفعتان فالملف
--   مقتطع أو رديء الجودة، بلا حاجة لمرجع خارجي.
-- ═══════════════════════════════════════════════════════════════════════════
