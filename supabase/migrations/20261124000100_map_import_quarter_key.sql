-- ═══════════════════════════════════════════════════════════════════════════
-- إصلاح استيراد الخريطة — الجولة ④
--
-- ## العيب الذي أُصلح (مؤكَّد بالكود لا بالتخمين)
--
-- `app.map_import_batch` كانت تُدرج بـ `on conflict (zone_id, code) do update`،
-- و`code` (`STR-0001`…) يُولَّد بترقيم يبدأ من ١ **في كل ملف** على حدة.
--
-- فالاستيراد المُقسَّم أرباعاً — وهو **الحلّ الذي قدّمناه في الجولة ①** لتفادي
-- الاقتطاع — كان يدمر البيانات:
--
--   ربع ١ ⇒ STR-0001 .. STR-0210
--   ربع ٢ ⇒ STR-0001 .. STR-0190  ⇒ تُحدَّث صفوف الربع ١ لا تُضاف
--   ربع ٣ ⇒ …                      ⇒ تُحدَّث صفوف الربع ٢
--   ربع ٤ ⇒ …                      ⇒ تبقى بيانات الربع الرابع وحده
--
-- النتيجة: ~٧٥٪ من الشوارع تختفي **بصمت** بعد رسالة نجاح. والواجهة كانت تقول
-- «الإدراج يدمج تلقائياً ولا يتكرّر» — صحيحة في «لا يتكرّر» وكاذبة في «يدمج».
--
-- ## لماذا `osm_way_id` هو المفتاح الصحيح
--
-- معرّف الشوط في OSM فريد عالمياً وثابت — لا يتغيّر بين ربع وآخر ولا بين
-- تصدير وآخر. المخطط نفسه كان ينصّ على ذلك: `map_alleys` فيه
-- `unique index (zone_id, osm_way_id)`، لكن `map_streets` لم يكن فيه،
-- والإدراج لم يستخدمه في أيّهما.
--
-- ## بدقة: ماذا تفعل هذه الهجرة
--
--   ① فهرس فريد على `map_streets(zone_id, osm_way_id)` — مرآة `map_alleys`.
--   ② `app.map_next_code` — ترقيم تالٍ للقائم بدل البدء من ١.
--   ③ `app.map_import_batch` — المطابقة بـ`osm_way_id` أولاً، والكود ملاذ أخير،
--      وإدراج/تحديث صريحان بدل `on conflict` على الكود.
--
-- ## تحذير على البيانات القديمة
--
-- الهجرة **لا تحذف** شيئاً — الحذف الصامت أسوأ من الخطأ. لكن إن كان زون قد
-- استُورد أرباعاً قبل هذا الإصلاح، فأرباعه الثلاثة مفقودة بالفعل ولا تُستعاد
-- إلا بإعادة الاستيراد.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① الفهرس الفريد
-- ───────────────────────────────────────────────────────────────────────────
--
-- جزئي (`where … is not null`) لأن الصفوف اليدوية بلا معرّف OSM ولا يجوز
-- أن تتعارض.
--
-- ⚠ قد يفشل الإنشاء لو كان الزون قد استُورد مرتين بمسارين مختلفين لنفس الشوط
-- (أثر العيب نفسه). في هذه الحالة: أعد استيراد الزون بعد حذف صفوفه، ثم أعد
-- تشغيل الهجرة. جعلناه `if not exists` ليكون إعادة التشغيل آمنة.

create unique index if not exists map_streets_zone_osm_uk
  on public.map_streets(zone_id, osm_way_id)
  where osm_way_id is not null;

comment on index public.map_streets_zone_osm_uk is
  'شوط OSM لا يتكرّر في الزون — مفتاح الاستيراد الحقيقي (الكود ترقيم محلي فقط)';

-- ───────────────────────────────────────────────────────────────────────────
-- ①-ب عمود التباعد — ليبقى مقياس الشكل بعد الاستيراد
-- ───────────────────────────────────────────────────────────────────────────
--
-- كان `maxSegmentM` يُحسب في المعاينة ثم **يُفقد** عند الإدراج: التحذير يظهر
-- قبل الضغط على «أبدأ» ثم لا يبقى أثر. فأي تقرير جودة لاحق — «كم من شبكتنا
-- زاوٍ؟» — لا يستطيع الإجابة لأن الرقم غير محفوظ.
--
-- يُحسب في القاعدة من `path` (لا يُرسَل من المتصفح) لأنه مشتقّ منها تماماً:
-- لو أرسله العميل لكان ممكناً أن يخالف المسار المُخزَّن.

alter table public.map_streets add column if not exists max_segment_m numeric(8,1);
alter table public.map_alleys  add column if not exists max_segment_m numeric(8,1);

comment on column public.map_streets.max_segment_m is
  'أطول مسافة بين عقدتين متتاليتين (متر) — فوق ١٥٠م يكون الشكل المرسوم تقريبياً لا مطابقاً';
comment on column public.map_alleys.max_segment_m is
  'أطول مسافة بين عقدتين متتاليتين (متر) — فوق ١٥٠م يكون الشكل المرسوم تقريبياً لا مطابقاً';

-- أطول ضلع في مسار — الصيغة نفسها المستخدمة في الواجهة (longestSegmentM)
create or replace function app.map_max_segment_m(p_path jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $fn$
  select coalesce(max(app.map_distance_m(
      (e->0->>0)::float8, (e->0->>1)::float8,
      (e->1->>0)::float8, (e->1->>1)::float8
    )), 0)
  from jsonb_array_elements(
    case when jsonb_typeof(p_path) = 'array' and jsonb_array_length(p_path) >= 2
         then (select jsonb_agg(jsonb_build_array(p_path->i, p_path->(i+1)))
                 from generate_series(0, jsonb_array_length(p_path) - 2) i)
         else '[]'::jsonb end
  ) e
$fn$;

comment on function app.map_max_segment_m(jsonb) is
  'أطول ضلع بين عقدتين متتاليتين — يقابل longestSegmentM في الواجهة';

-- ───────────────────────────────────────────────────────────────────────────
-- ② ترقيم تالٍ للقائم
-- ───────────────────────────────────────────────────────────────────────────
--
-- لماذا دالة مستقلة: نفس المنطق يحتاجه الشارع والزقاق، وتكراره في فرعين
-- كان سيصير نسختين تنحرفان. وهي **صغيرة ونقية** فتُختبر وحدها.
--
-- `p_table` اسم الجدول — نتحقق منه ضد قائمة بيضاء صريحة قبل بناء الاستعلام.
-- بناء SQL ديناميكي بـ`format(%I)` آمن، لكن القائمة البيضاء أوضح في المراجعة
-- وأمنع لخطأ إملائي أن يصل إلى القاعدة.

create or replace function app.map_next_code(
  p_zone  uuid,
  p_table text,
  p_code  text
) returns text
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  v_prefix text := split_part(p_code, '-', 1);
  v_max    int;
  v_next   int;
begin
  if p_table not in ('map_streets', 'map_alleys') then
    raise exception 'MAP_NEXT_CODE_TABLE_INVALID: %', p_table
      using errcode = 'invalid_parameter_value';
  end if;

  /*
   * نقرأ أكبر رقم موجود بنفس البادئة. الشرط `code ~ '^[A-Z]{3}-[0-9]+$'`
   * يحمي من صفوف شاذة (كود يدوي غير مطابق) كان `::int` عليها سيرفع استثناء
   * ويُسقط الصف من الاستيراد بلا سبب مفهوم.
   */
  execute format(
    'select coalesce(max((split_part(code, %L, 2))::int), 0)
       from public.%I
      where zone_id = $1
        and code like $2
        and code ~ %L',
    '-', p_table, '^[A-Z]{3}-[0-9]+$'
  ) into v_max using p_zone, v_prefix || '-%';

  v_next := v_max + 1;
  -- حماية من تجاوز أربع خانات (9999 صفاً بنفس النوع في زون واحد)
  if v_next > 9999 then
    raise exception 'MAP_CODE_EXHAUSTED: نفد نطاق الأكواد للبادئة %', v_prefix
      using errcode = 'program_limit_exceeded';
  end if;

  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end $fn$;

comment on function app.map_next_code(uuid, text, text) is
  'الكود التالي المتاح لبادئة في جدول — يمنع تصادم الأرباع الذي كان يستبدل الصفوف';

revoke all on function app.map_next_code(uuid, text, text) from public, anon;
grant execute on function app.map_next_code(uuid, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ إعادة كتابة app.map_import_batch
-- ───────────────────────────────────────────────────────────────────────────
--
-- الدالة أصلها في 20261122001300 (في مخطط `app`، ويُغلفها
-- `public.map_import_batch` من 20261122001600 — الغلاف لا يُمسّ).
-- التغيير محصور في **منطق المطابقة**: بقية الدالة منقولة حرفياً من الأصل
-- (الحرّاس، سجل الدفعة، المحلات، جدول التخطي، الإحصاء) كي لا يتغيّر سلوك
-- غير مقصود.

create or replace function app.map_import_batch(
  p_zone     uuid,
  p_rows     jsonb,
  p_mahallas jsonb default '{}'::jsonb,
  p_batch    uuid  default null,
  p_meta     jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_zone      record;
  v_batch     uuid := coalesce(p_batch, gen_random_uuid());
  v_row       jsonb;
  v_mah       record;
  v_mah_id    uuid;
  v_code      text;
  v_kind      text;
  v_name      text;
  v_newname   text;
  v_path      jsonb;
  v_width     numeric;
  v_osm       bigint;
  v_link      text;
  v_mah_num   text;
  v_inserted  int := 0;
  v_updated   int := 0;
  v_skipped   int := 0;
  v_errors    jsonb := '[]'::jsonb;
  v_existing_code text;
  /*
   * بدائل قياسية لـ`v_existing`: نحفظ الاسم ومصدره في متغيّرات مستقلة.
   * السبب: `v_existing := null` ثم قراءة حقل منه ترفع "record is not
   * assigned yet" في بعض المحرّكات (PGlite/Postgres 18) — سلوك يختلف عن
   * إبقاء الـrecord بلا إسناد. المتغيّرات القياسية تُلغي الاحتمال كلها.
   */
  v_ex_name   text;
  v_ex_src    text;
begin
  -- ⓐ الزون موجود؟
  select z.id, z.name, z.geofence_id into v_zone
  from public.map_zones z where z.id = p_zone;
  if v_zone.id is null then
    raise exception 'MAP_IMPORT_ZONE_NOT_FOUND: الزون % غير موجود في map_zones', p_zone
      using errcode = 'no_data_found';
  end if;

  -- ⓑ سجل الدفعة (يُنشأ مرة، ويُحدَّث مع كل قطعة)
  insert into public.map_import_batches (
    id, zone_id, file_name, file_bytes, geofence_id, preview, created_by
  ) values (
    v_batch, p_zone,
    nullif(p_meta->>'file_name',''),
    nullif(p_meta->>'file_bytes','')::bigint,
    v_zone.geofence_id,
    coalesce(p_meta->'preview','{}'::jsonb),
    auth.uid()
  ) on conflict (id) do nothing;

  -- ⓒ المحلات أولاً — الأزقة تُربط بها بالكود
  for v_mah in select * from jsonb_to_recordset(
      case when jsonb_typeof(p_mahallas) = 'array' then p_mahallas else '[]'::jsonb end
    ) as x(code text, osm_number text, name text)
  loop
    begin
      insert into public.map_mahallas (zone_id, code, osm_number, name, boundary_state, created_by)
      values (p_zone, v_mah.code, nullif(v_mah.osm_number,'')::text, v_mah.name, 'open', auth.uid())
      on conflict (zone_id, code) do update
        set updated_at = now()
      returning id into v_mah_id;
    exception when others then
      -- محلة مرفوضة لا تُسقط الاستيراد؛ نكتفي بالإبلاغ
      v_errors := v_errors || jsonb_build_object(
        'code', v_mah.code, 'kind', 'mahalla', 'error', sqlerrm);
    end;
  end loop;

  -- ⓓ العناصر
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'MAP_IMPORT_ROWS_INVALID: p_rows ليست مصفوفة'
      using errcode = 'invalid_parameter_value';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_code   := v_row->>'code';
    v_kind   := v_row->>'kind';
    v_name   := nullif(trim(coalesce(v_row->>'name','')), '');
    v_osm    := nullif(v_row->>'osm_way_id','')::bigint;
    v_width  := coalesce(nullif(v_row->>'width_m','')::numeric, 6.0);
    v_link   := nullif(v_row->>'link_source','');
    v_mah_num:= nullif(v_row->>'mahalla_num','');
    v_path   := v_row->'path';

    begin
      if v_kind = 'alley' then
        -- الزقاق يحتاج محلة: من الرقم، وإلا «غير محدّدة» (MHL-0000)
        v_mah_id := null;
        if v_mah_num is not null then
          select id into v_mah_id from public.map_mahallas
          where zone_id = p_zone and osm_number = v_mah_num limit 1;
        end if;
        if v_mah_id is null then
          select id into v_mah_id from public.map_mahallas
          where zone_id = p_zone and code = 'MHL-0000' limit 1;
        end if;
        -- إن لم تُنشأ «غير محدّدة» في هذه الدفعة، نُنشئها الآن
        if v_mah_id is null then
          insert into public.map_mahallas (zone_id, code, osm_number, name, boundary_state, created_by)
          values (p_zone, 'MHL-0000', null, 'غير محدّدة — تحتاج ربطاً بمحلة', 'open', auth.uid())
          on conflict (zone_id, code) do update set updated_at = now()
          returning id into v_mah_id;
        end if;

        /*
         * ══ المطابقة: شوط OSM أولاً — هذا هو الإصلاح ═══════════════════
         * `osm_way_id` فريد عالمياً وثابت بين الأرباع، بخلاف `code` الذي
         * يُرقَّم من ١ في كل ملف. فالمطابقة بالكود كانت تجعل ربعاً يستبدل
         * ربعاً آخر بصمت (٧٥٪ فقدان بعد أربعة أرباع).
         *
         * النتيجة: `v_existing_code` يحمل كود الصف الموجود فعلاً (قد يختلف
         * عن v_code القادم من الملف) — وهو ما نُحدّثه.
         */
        /*
         * ⚠ عيبان أُمسكا **بالتشغيل** لا بقراءة الكود، في نسختين متتاليتين
         * من هذا الإصلاح:
         *
         *   ١) الإدراج كان يُنفَّذ دائماً ثم يُتبَع بتحديث. فالصف الموجود
         *      يصطدم بـ`unique (zone_id, code)`، فيقفز إلى معالج الاستثناء
         *      ويُحسب «متخطّى» — أي أن الدالة كانت تعمل قبل الإصلاح وتفشل
         *      بعده. الحلّ: فرعان صريحان IF/ELSE.
         *
         *   ٢) `select … into v_existing` لا يُسند الـrecord إن لم يجد صفاً،
         *      وقيمة `null` المُسندة صراحةً تجعل قراءة أي حقل منه ترفع
         *      «record is not assigned yet». الحلّ: متغيّرات قياسية
         *      (`v_existing_code`, `v_ex_name`, `v_ex_src`) — لا record.
         */
        v_existing_code := null;
        v_ex_name := null;
        v_ex_src  := null;
        if v_osm is not null then
          select code, name, name_source into v_existing_code, v_ex_name, v_ex_src
          from public.map_alleys where zone_id = p_zone and osm_way_id = v_osm limit 1;
        end if;
        if v_existing_code is null then
          select code, name, name_source into v_existing_code, v_ex_name, v_ex_src
          from public.map_alleys where zone_id = p_zone and code = v_code;
          -- الكود مشغول لشوط آخر ⇒ ليس هو: نُرقّم جديداً
          if not found or (v_osm is not null and exists (
               select 1 from public.map_alleys
               where zone_id = p_zone and code = v_code
                 and osm_way_id is distinct from v_osm)) then
            v_existing_code := null;
            v_ex_name := null;
            v_ex_src  := null;
          end if;
        end if;

        -- جديد وكوده مشغول ⇒ نُرقّم تالياً للقائم بدل الاستبدال
        if v_existing_code is null and exists (
          select 1 from public.map_alleys where zone_id = p_zone and code = v_code
        ) then
          v_code := app.map_next_code(p_zone, 'map_alleys', v_code);
        end if;

        /*
         * `_ex_src` قد تكون null (لا صف موجود). المقارنة `=` مع null تُرجع
         * null لا false — والشرط المركّب مع `and` يُعالج ذلك (null ⇒ لا
         * نأخذ الفرع). لكن نستخدم `v_name is not null` صريحاً أيضاً ليكون
         * السلوك مقروءاً بلا معرفة بدقائق SQL.
         */
        if v_ex_src = 'manual' and v_name is not null then
          v_newname := v_ex_name;   -- لا يطغى OSM على تصحيح موظف
        else
          v_newname := v_name;
        end if;

        /*
         * فرعان صريحان — **لا `on conflict`**.
         *
         * العيب الذي كان في نسختي الأولى من هذا الإصلاح: كنت أُدرج دائماً ثم
         * أُحدّث. فالصف الموجود كان يصطدم بـ`unique (zone_id, code)`، ويقفز
         * إلى معالج الاستثناء (محسوباً «متخطّى») فيبقى مساره القديم. أي أن
         * الدالة كانت **تعمل قبل الإصلاح** و**تفشل بعده** — وهذا ما كشفه
         * التشغيل على PostgreSQL، لا قراءة الكود.
         */
        if v_existing_code is null then
          /*
           * `length_m` كان **لا يُعبَّأ أبداً** فكان يبقى صفراً لكل صف مستورد:
           * الجدول يعرّفه `not null default 0` والإدراج لم يذكره. أي أن
           * كل استعلام «أطول الشوارع» أو تقرير الكثافة من القاعدة كان
           * يقرأ أصفاراً. يُحسب الآن من `path` في القاعدة نفسها.
           */
          insert into public.map_alleys (
            zone_id, mahalla_id, code, name, path, width_m, width_source,
            osm_way_id, link_source, name_source, length_m, max_segment_m, created_by
          ) values (
            p_zone, v_mah_id, v_code, v_newname, v_path, v_width,
            coalesce(nullif(v_row->>'width_source',''), 'default'),
            v_osm, coalesce(v_link,'manual'), 'osm',
            app.map_line_length_m(v_path), app.map_max_segment_m(v_path), auth.uid()
          );
          v_inserted := v_inserted + 1;
        else
          update public.map_alleys
             set path          = v_path,
                 width_m       = v_width,
                 osm_way_id    = coalesce(v_osm, osm_way_id),
                 mahalla_id    = v_mah_id,
                 name          = v_newname,
                 length_m      = app.map_line_length_m(v_path),
                 max_segment_m = app.map_max_segment_m(v_path),
                 updated_at    = now()
           where zone_id = p_zone and code = v_existing_code;
          v_updated := v_updated + 1;
        end if;

      else
        -- الشارع بأنواعه الأربعة (نفس منطق الأزقة: osm_way_id أولاً)
        v_existing_code := null;
        v_ex_name := null;
        v_ex_src  := null;
        if v_osm is not null then
          select code, name, name_source into v_existing_code, v_ex_name, v_ex_src
          from public.map_streets where zone_id = p_zone and osm_way_id = v_osm limit 1;
        end if;
        if v_existing_code is null then
          select code, name, name_source into v_existing_code, v_ex_name, v_ex_src
          from public.map_streets where zone_id = p_zone and code = v_code;
          if not found or (v_osm is not null and exists (
               select 1 from public.map_streets
               where zone_id = p_zone and code = v_code
                 and osm_way_id is distinct from v_osm)) then
            v_existing_code := null;
            v_ex_name := null;
            v_ex_src  := null;
          end if;
        end if;

        if v_existing_code is null and exists (
          select 1 from public.map_streets where zone_id = p_zone and code = v_code
        ) then
          v_code := app.map_next_code(p_zone, 'map_streets', v_code);
        end if;

        if v_ex_src = 'manual' and v_name is not null then
          v_newname := v_ex_name;
        else
          v_newname := v_name;
        end if;

        if v_existing_code is null then
          insert into public.map_streets (
            zone_id, code, name, kind, path, width_m, osm_way_id,
            name_source, length_m, max_segment_m, created_by
          ) values (
            p_zone, v_code, v_newname, v_kind, v_path, v_width, v_osm,
            'osm', app.map_line_length_m(v_path), app.map_max_segment_m(v_path), auth.uid()
          );
          v_inserted := v_inserted + 1;
        else
          update public.map_streets
             set path          = v_path,
                 width_m       = v_width,
                 osm_way_id    = coalesce(v_osm, osm_way_id),
                 name          = v_newname,
                 length_m      = app.map_line_length_m(v_path),
                 max_segment_m = app.map_max_segment_m(v_path),
                 updated_at    = now()
           where zone_id = p_zone and code = v_existing_code;
          v_updated := v_updated + 1;
        end if;
      end if;

    exception when others then
      -- عنصر مرفوض: يُسجَّل بكوده وسببه، والبقية تكمل
      declare
        v_ctx text;
      begin
        get stacked diagnostics v_ctx = pg_exception_context;
        raise notice 'MAP_IMPORT_ROW_ERROR code=% ctx=% err=%', v_code, v_ctx, sqlerrm;
      end;
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object('code', v_code, 'kind', v_kind, 'error', sqlerrm);
      begin
        insert into public.map_import_skips (zone_id, table_name, code, name, error_code, error_msg)
        values (
          p_zone,
          case when v_kind = 'alley' then 'map_alleys' else 'map_streets' end,
          coalesce(v_code,'?'), v_name,
          split_part(sqlerrm, ':', 1), sqlerrm
        )
        on conflict (zone_id, table_name, code) do update
          set error_msg = excluded.error_msg, created_at = now();
      exception when others then
        null;  -- جدول التخطي نفسه قد يرفض — لا نُسقط الدفعة لأجله
      end;
    end;
  end loop;

  -- ⓔ تحديث سجل الدفعة
  update public.map_import_batches b set
    rows_total    = b.rows_total + jsonb_array_length(p_rows),
    rows_inserted = b.rows_inserted + v_inserted,
    rows_updated  = b.rows_updated + v_updated,
    rows_skipped  = b.rows_skipped + v_skipped
  where b.id = v_batch;

  return jsonb_build_object(
    'batch_id',  v_batch,
    'inserted',  v_inserted,
    'updated',   v_updated,
    'skipped',   v_skipped,
    'errors',    v_errors
  );
end $$;

comment on function app.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) is
  'إدراج دفعة استيراد OSM: يطابق بـosm_way_id (ثابت بين الأرباع) لا بالكود المحلي — يُصلح استبدال الأرباع';
