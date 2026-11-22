-- ═══════════════════════════════════════════════════════════════════════════
-- تنظيف الأشواط اليتيمة — الجولة ⑤
--
-- ## العيب الذي أُصلح (كشفه التشغيل على القاعدة الحقيقية، لا قراءة الكود)
--
-- `app.map_import_batch` تُطابق بـ`osm_way_id` فلا تُكرّر ولا تُبدّل الأكواد.
-- لكنها **لا تحذف** ما اختفى من OSM:
--
--   استيراد أول  ⇒ ٤ شوارع (way 3001..3004) ⇒ LOC-0001..LOC-0004
--   حُذف way 3001 من OSM (أُزيل الطريق، دُمج، أُعيد رسمه بمعرّف جديد)
--   استيراد ثانٍ ⇒ ٣ موجودة تُحدَّث + way 3005 يُدرج
--   النتيجة: **٥ صفوف** — منها LOC-0001→3001 صف **يتيم** لا وجود له في OSM.
--
-- الأثر ليس تجميلياً:
--   · الكثافة تُحسب من صفوف القاعدة ⇒ مرتفعة كذباً.
--   · `map_coverage_*` تقارن الزيارات بعدد الشوارع ⇒ تغطية منخفضة كذباً.
--   · محرّك الزيارات يربط بـ`place_id` فيولّد زيارات لشارع غير موجود.
--
-- ⚠ `map_visits.place_id` **بلا مفتاح أجنبي** (00007 سطر ٤٠) — فحذف الشارع
--   لا يحذف زياراته، وتبقى معلّقة تشير إلى معرّف لم يبق له صف.
--
-- ## لماذا دالتان لا واحدة
--
-- الحذف الصامت أسوأ من الخطأ (قرار مثبَّت منذ الجولة ④: الهجرة لا تحذف شيئاً).
-- فالفصل صريح:
--   `app.map_orphan_report(p_zone, p_rows)` — **قراءة فقط**، لا تحذف حرفاً.
--   `app.map_orphan_purge(p_zone, p_batch, p_rows)` — تحذف، وتُستدعى بقرار
--      صريح من المشغّل بعد رؤية التقرير.
--
-- ## الأمان في `purge` (خمسة شروط، كلها لازمة)
--
--   ① المشغّل مرّر `osm_way_id` لصفوف الملف كاملاً. لا حذف بالكود إطلاقاً:
--      الكود ترقيم محلي يتغيّر، فالحذف به كان سيضرب شوطاً آخر.
--   ② `p_batch` موجود في `map_import_batches` **وفي نفس الزون** — فلا تُستدعى
--      دالة حذف على زون من دفعة زون آخر.
--   ③ الصف بلا `created_at` أحدث من الدفعة ⇒ لا نحذف صفاً أُنشئ بعد رفع الملف
--      (أُضيف يدوياً أو استُورد بملف أحدث).
--   ④ الصف بلا `name_source = 'manual'` ⇒ **لا نحذف صفاً صحّحه موظف**.
--   ⑤ الصف له `osm_way_id` ⇒ الصفوف اليدوية (بلا معرّف OSM) لا تُمسّ أبداً.
--
-- الزيارات: تُحذف زيارات الصف المحذوف لأن `place_id` لم يبق له صف — لكن
-- **فقط** للصفوف التي حُذفت فعلاً في هذه الدفعة (لا حذف بالجملة للزون).
--
-- التراجع: `drop function app.map_orphan_report(uuid, jsonb);`
--           `drop function app.map_orphan_purge(uuid, uuid, jsonb);`
--           والصفوف المحذوفة لا تُستعاد — إعادة الاستيراد من OSM تُعيدها.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① التقرير — قراءة فقط
-- ───────────────────────────────────────────────────────────────────────────
--
-- `p_rows` صفوف الملف كما وردت إلى `map_import_batch` (نفس شكلها: كائنات فيها
-- `osm_way_id`). نستخرج منه مجموعة المعرّفات الموجودة فعلاً في الملف الجديد.
--
-- الشرط ``osm_way_id is not null` — صفّ بلا معرّف OSM أُضيف يدوياً من المحرّر،
-- وغيابه عن ملف OSM **ليس دليل حذف**. لو حذفناه لأتلفنا عمل الموظف.

create or replace function app.map_orphan_report(
  p_zone uuid,
  p_rows jsonb
) returns table (
  place_kind text,
  code       text,
  name       text,
  osm_way_id bigint,
  length_m   numeric
)
language sql
stable
security definer
set search_path = public, app
as $fn$
  /*
   * `jsonb_array_elements` على `p_rows` ثم `nullif(...)::bigint` — نفس تحويل
   * `map_import_batch` بالحرف، كي لا تختلف المجموعتان عند معرّف نصّي أو فارغ.
   */
  with present as (
    select distinct nullif(r->>'osm_way_id','')::bigint as osm
    from jsonb_array_elements(
      case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end
    ) r
    where nullif(r->>'osm_way_id','') is not null
  ),
  orphan_streets as (
    select 'street'::text as place_kind, s.code, s.name, s.osm_way_id, s.length_m
    from public.map_streets s
    where s.zone_id = p_zone
      and s.osm_way_id is not null
      and s.name_source is distinct from 'manual'
      and not exists (select 1 from present p where p.osm = s.osm_way_id)
  ),
  orphan_alleys as (
    select 'alley'::text as place_kind, a.code, a.name, a.osm_way_id, a.length_m
    from public.map_alleys a
    where a.zone_id = p_zone
      and a.osm_way_id is not null
      and a.name_source is distinct from 'manual'
      and not exists (select 1 from present p where p.osm = a.osm_way_id)
  )
  select * from orphan_streets
  union all
  select * from orphan_alleys
  order by place_kind, code
$fn$;

comment on function app.map_orphan_report(uuid, jsonb) is
  'الأشواط الموجودة في القاعدة وغائبة عن الملف الجديد — قراءة فقط، لا تحذف شيئاً';

revoke all on function app.map_orphan_report(uuid, jsonb) from public, anon;
grant execute on function app.map_orphan_report(uuid, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ② الحذف — بقرار صريح، وبالشروط الخمسة
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.map_orphan_purge(
  p_zone  uuid,
  p_batch uuid,
  p_rows  jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  v_ok_batch  boolean;
  v_created   timestamptz;
  v_streets   int := 0;
  v_alleys    int := 0;
  v_visits    int := 0;
  v_kept      int := 0;
begin
  -- ② الدفعة موجودة، وفي نفس الزون، ونعرف وقتها
  select true, b.created_at into v_ok_batch, v_created
  from public.map_import_batches b
  where b.id = p_batch and b.zone_id = p_zone;

  if v_ok_batch is not true then
    raise exception 'MAP_PURGE_BATCH_INVALID: الدفعة % ليست لهذا الزون', p_batch
      using errcode = 'invalid_parameter_value';
  end if;

  /*
   * نُثبّت مجموعة الأشواط الموجودة في الملف في جدول مؤقت — قراءة واحدة
   * بدل `not exists` متكرّر، وأوضح في المراجعة.
   */
  create temporary table if not exists _orphan_present (osm bigint primary key) on commit drop;
  delete from _orphan_present;
  insert into _orphan_present (osm)
  select distinct nullif(r->>'osm_way_id','')::bigint
  from jsonb_array_elements(
    case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end
  ) r
  where nullif(r->>'osm_way_id','') is not null
  on conflict do nothing;

  /*
   * الزيارات أولاً: تُحذف زيارات الصفوف التي **سنحذفها** في هذه الدفعة فقط.
   * الحذف قبل الصف لأن `place_id` بلا FK — لا تتابع تلقائية.
   */
  with doomed as (
    select 'street'::text as k, s.id
    from public.map_streets s
    where s.zone_id = p_zone
      and s.osm_way_id is not null
      and s.name_source is distinct from 'manual'
      and s.created_at <= v_created          -- ③ لم يُنشأ بعد الدفعة
      and not exists (select 1 from _orphan_present p where p.osm = s.osm_way_id)
    union all
    select 'alley'::text, a.id
    from public.map_alleys a
    where a.zone_id = p_zone
      and a.osm_way_id is not null
      and a.name_source is distinct from 'manual'
      and a.created_at <= v_created
      and not exists (select 1 from _orphan_present p where p.osm = a.osm_way_id)
  )
  delete from public.map_visits v
  using doomed d
  where v.zone_id = p_zone and v.place_kind = d.k and v.place_id = d.id;
  get diagnostics v_visits = row_count;

  -- الشوارع
  with doomed as (
    select s.id
    from public.map_streets s
    where s.zone_id = p_zone
      and s.osm_way_id is not null
      and s.name_source is distinct from 'manual'
      and s.created_at <= v_created
      and not exists (select 1 from _orphan_present p where p.osm = s.osm_way_id)
  )
  delete from public.map_streets s using doomed d where s.id = d.id;
  get diagnostics v_streets = row_count;

  -- الأزقة
  with doomed as (
    select a.id
    from public.map_alleys a
    where a.zone_id = p_zone
      and a.osm_way_id is not null
      and a.name_source is distinct from 'manual'
      and a.created_at <= v_created
      and not exists (select 1 from _orphan_present p where p.osm = a.osm_way_id)
  )
  delete from public.map_alleys a using doomed d where a.id = d.id;
  get diagnostics v_alleys = row_count;

  -- ④ ما بقي محميّاً: نشرحه بدل إخفائه
  select count(*) into v_kept
  from (
    select 1 from public.map_streets s
    where s.zone_id = p_zone and s.osm_way_id is not null
      and not exists (select 1 from _orphan_present p where p.osm = s.osm_way_id)
    union all
    select 1 from public.map_alleys a
    where a.zone_id = p_zone and a.osm_way_id is not null
      and not exists (select 1 from _orphan_present p where p.osm = a.osm_way_id)
  ) t;

  return jsonb_build_object(
    'streets_deleted', v_streets,
    'alleys_deleted',  v_alleys,
    'visits_deleted',  v_visits,
    'kept_protected',  v_kept
  );
end $fn$;

comment on function app.map_orphan_purge(uuid, uuid, jsonb) is
  'يحذف الأشواط الغائبة عن الملف الجديد — لا يمسّ الصفوف اليدوية ولا ما أُنشئ بعد الدفعة';

revoke all on function app.map_orphan_purge(uuid, uuid, jsonb) from public, anon;
grant execute on function app.map_orphan_purge(uuid, uuid, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ أغلفة public — PostgREST يكشف public فقط (نمط 20261122001600)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.map_orphan_report(p_zone uuid, p_rows jsonb)
returns table (place_kind text, code text, name text, osm_way_id bigint, length_m numeric)
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_orphan_report(p_zone, p_rows);
end $$;

create or replace function public.map_orphan_purge(p_zone uuid, p_batch uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public, app
as $$
begin
  perform public.map_require_editor();
  return app.map_orphan_purge(p_zone, p_batch, p_rows);
end $$;

comment on function public.map_orphan_report(uuid, jsonb) is
  'تقرير الأشواط اليتيمة — للقراءة، يتطلب صلاحية قراءة الخريطة';
comment on function public.map_orphan_purge(uuid, uuid, jsonb) is
  'حذف الأشواط اليتيمة — يتطلب صلاحية تحرير الخريطة، ودفعة صحيحة للزون';

revoke all on function public.map_orphan_report(uuid, jsonb) from public, anon;
revoke all on function public.map_orphan_purge(uuid, uuid, jsonb) from public, anon;
grant execute on function public.map_orphan_report(uuid, jsonb) to authenticated;
grant execute on function public.map_orphan_purge(uuid, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
