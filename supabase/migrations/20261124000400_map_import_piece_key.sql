-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124000400 — الجولة ⑨: القطعة (piece) مفتاحٌ ثالث — الشوط المنقسم
--                              لا يمسح أجزاءه
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## العَرَض
--
-- المشغّل يرفع ملفاً لزون الأرخيته (١٢٠ نقطة حدود، ٤٤٩ مساراً)، تظهر رسالة
-- نجاح، وعدد الشوارع في القاعدة **أقل من عدد صفوف الملف**. لا خطأ، لا تحذير.
--
-- ## الجذر (مقيس على قاعدة الإنتاج، ٢٠٢٦-١١)
--
-- ثلاث آليات تتعارض:
--
--   ① **الواجهة تُنتج عدة صفوف للشوط الواحد.**
--      `assembleImport` (سطر ٣١٦) تقصّ الشوط على مضلّع الزون:
--
--          const parts = clipPathIndexed(coords, edgeIndex)
--          for (const part of parts) clipped.push({ cls, way, pts: part })
--
--      فالشوط الذي يدخل الزون، يخرج منه، ثم يعود إليه ⇒ **جزءان بنفس
--      `way.id`**. وهذا شائع عند حدود الزون غير المحدّبة (الأرخيته ١٢٠ نقطة).
--
--   ② **الهجرة 20261124000100 فرضت تفرد `(zone_id, osm_way_id)`.**
--
--          create unique index map_streets_zone_osm_uk
--            on public.map_streets(zone_id, osm_way_id) where osm_way_id is not null;
--
--      وهو شرط **غير صحيح** بحكم ①: الشوط الواحد قد يُنتج أكثر من صف مشروع.
--      لولا أن ③ يمنعه، لكان كل استيراد يفشل بـ`unique_violation`.
--
--   ③ **مطابقة `limit 1` تجعل الجزء التالي يستبدل السابق.**
--
--          select code, name, name_source into v_existing_code, …
--          from public.map_streets where zone_id = p_zone and osm_way_id = v_osm limit 1;
--
--      فالجزء الثاني يجد الأول، فيُحدَّث مساره ⇒ **الجزء الأول يُمحى**.
--
--   ④ **وحتى الكود لا ينقذ الجزء الجديد**: `map_next_code` يُرقّم تالياً،
--      فيصطدم الجزء الثاني بـ`unique (zone_id, code)` لسبب آخر، ويُحسب «متخطّى».
--
-- ## القياس الذي أثبته (قاعدة الإنتاج، معاملة أُلغيت بعد القياس)
--
--   ثلاثة صفوف بنفس `osm_way_id = 999900003` ⇒  ins=1 · upd=1 · **surviving_rows=1**
--   واختبار سابق بجزأين:                        ⇒  ins=1 · upd=1 · بلا خطأ
--   واختبار بجزأين متباعدين (خارج الزون):        ⇒  ins=1 · upd=0 · خطأ «متخطّى»
--
--   أي: **٣ قطع دخلت، نجا صفٌّ واحد.** وبلا خطأ ظاهر في الحالة الأولى.
--
-- ## ⚠ هذا انحدار أدخلته هجرة 20261124000100
--
-- قبلها كانت المطابقة بـ`code` وحده، والأجزاء تأخذ أكواداً متسلسلة مختلفة
-- (`STR-0001`, `STR-0002`) ⇒ تُدرَج كلها. فالإصلاح الذي هدفه منع فقدان
-- ٧٥٪ بين الأرباع **خلق** فقداناً جديداً داخل الربع الواحد.
--
-- ## الإصلاح: مفتاح مركّب `(zone_id, osm_way_id, piece_index)`
--
--   ① عمود `piece_index smallint not null default 0` في `map_streets`
--      و`map_alleys`. الصفوف القائمة تأخذ ٠ — سلوكها لا يتغيّر.
--
--   ② الفهرس الفريد يصير `(zone_id, osm_way_id, piece_index)`.
--      فالشوط الواحد يقبل عدة صفوف، بشرط ألا يتكرر رقم القطعة.
--      و`where osm_way_id is not null` يبقى: الصفوف اليدوية حرة.
--
--   ③ الواجهة ترسل `piece_index` (فهرس الجزء في مصفوفة `parts`) — في
--      `toBatchRow` و`ImportRow.pieceIndex`.
--
--   ④ الإدراج يطابق بـ`(osm_way_id, piece_index)` أولاً. فالجزء الثاني
--      يجد **نفسه** (لا الجزء الأول)، ويُحدَّث أو يُدرَج.
--
--   ⑤ **توافق خلفي**: صف قديم أُدرج قبل هذا العمود له `piece_index = 0`.
--      والجزء الأول من الملف الجديد أيضاً ٠ ⇒ يُطابقه ويُحدَّث. لا تكرار.
--
--   ⑥ عند غياب `piece_index` من الصف (ملف قديم أو مستدعٍ يدوي)، نأخذ ٠.
--
-- ## ما لا تفعله هذه الهجرة
--
--   · **لا تحذف شيئاً.** الصفوف التي مسحها الانحدار سابقاً لا تُستعاد —
--     لكن الاستيراد التالي يُدرجها من جديد، لأن الجزء ١ و٢ سيجدان
--     `(osm, 0)` و`(osm, 1)` فارغين ⇒ إدراج.
--   · **لا تمسّ منطق الكود** (`code` يبقى كما هو للعرض والطباعة).
--   · **لا تغيّر أي سلوك عند** `piece_index = 0` — وهو كل ما في القاعدة الآن.
--
-- ## التراجع
--
--   drop index if exists public.map_streets_zone_osm_piece_uk;
--   create unique index map_streets_zone_osm_uk
--     on public.map_streets(zone_id, osm_way_id) where osm_way_id is not null;
--   alter table public.map_streets drop column if exists piece_index;
--   (وكذلك map_alleys) — لكن التراجع يُعيد عيب المسح، لا يُنصح به.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① العمودان
-- ───────────────────────────────────────────────────────────────────────────

alter table public.map_streets
  add column if not exists piece_index smallint not null default 0;

alter table public.map_alleys
  add column if not exists piece_index smallint not null default 0;

comment on column public.map_streets.piece_index is
  'رقم القطعة من الشوط نفسه (٠ = الشوط كاملاً أو أول قطعة). الشوط الذي يُقصّ '
  'على حدود الزون قد يُنتج عدة قطع؛ كل قطعة صفٌّ مشروع بمساره المستقل. '
  'المفتاح الفريد: (zone_id, osm_way_id, piece_index).';

comment on column public.map_alleys.piece_index is
  'رقم القطعة من الشوط نفسه — مرآة map_streets.piece_index.';

-- حارس: الرقم لا يكون سالباً (٠..٣٢٧٦٧ يكفي؛ القطع نادراً تتجاوز ٥)
alter table public.map_streets drop constraint if exists map_streets_piece_index_ck;
alter table public.map_streets
  add constraint map_streets_piece_index_ck check (piece_index >= 0);

alter table public.map_alleys drop constraint if exists map_alleys_piece_index_ck;
alter table public.map_alleys
  add constraint map_alleys_piece_index_ck check (piece_index >= 0);

-- ───────────────────────────────────────────────────────────────────────────
-- ② الفهرس الفريد: من (zone, osm) إلى (zone, osm, piece)
-- ───────────────────────────────────────────────────────────────────────────

-- ②ـأ الشوارع
drop index if exists public.map_streets_zone_osm_uk;

create unique index if not exists map_streets_zone_osm_piece_uk
  on public.map_streets(zone_id, osm_way_id, piece_index)
  where osm_way_id is not null;

-- ②ـب الأزقة: لا قيد `unique (zone_id, osm_way_id)` قائم (تحقّق حيّ: القيود
-- الفريدة على الجدول هي `zone_id, code` فقط). الفهرس `map_alleys_zone_osm_idx`
-- عادي وغير فريد ⇒ لا يتعارض. نضيف الفهرس الثلاثي وحده.
create unique index if not exists map_alleys_zone_osm_piece_uk
  on public.map_alleys(zone_id, osm_way_id, piece_index)
  where osm_way_id is not null;

comment on index public.map_alleys_zone_osm_piece_uk is
  'مرآة map_streets_zone_osm_piece_uk. `status <> archived` يُبقي المؤرشف '
  'خارج القيد (نفس شهيق الفهرس القديم على الأزقة).';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ الدالة: مطابقة ثلاثية بدل ثنائية
-- ───────────────────────────────────────────────────────────────────────────
--
-- نُعيد تعريف الدالة كاملة. الجسم منقولٌ حرفياً من `map_import_batch_impl`
-- الحيّة (md5 0580b43e538af594f05f7edc85a4acb7، ١٢٤٠٣ بايت) مع **أربعة**
-- تغييرات محصورة:
--
--   (أ) إعلان متغيّرين: `v_piece smallint` و`v_code_taken boolean`.
--   (ب) قراءة `piece_index` من الصف.
--   (ج) كتلة المطابقة في فرع الأزقة والشوارع: إضافة `and piece_index = v_piece`.
--   (د) إدراج `piece_index` في الأعمدة والقيم.
--
-- ولا شيء آخر يتغيّر: الحرّاس، سجل الدفعة، المحلات، جدول التخطي، الإحصاء،
-- ومعالجة الاستثناء — كلها كما هي حرفياً.

create or replace function app.map_import_batch_impl(
  p_zone     uuid,
  p_rows     jsonb,
  p_mahallas jsonb default '{}'::jsonb,
  p_batch    uuid  default null,
  p_meta     jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, app
as $function$
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
  v_piece     smallint;
  v_link      text;
  v_mah_num   text;
  v_inserted  int := 0;
  v_updated   int := 0;
  v_skipped   int := 0;
  v_errors    jsonb := '[]'::jsonb;
  v_existing_code text;
  v_ex_name   text;
  v_ex_src    text;
begin
  -- ⓪ الزون موجود؟
  select z.id, z.name, z.geofence_id into v_zone
  from public.map_zones z where z.id = p_zone;
  if v_zone.id is null then
    raise exception 'MAP_IMPORT_ZONE_NOT_FOUND: الزون % غير موجود في map_zones', p_zone
      using errcode = 'no_data_found';
  end if;

  -- ① سجل الدفعة (يُنشأ مرة، ويُحدَّث مع كل قطعة)
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

  -- ② المحلات أولاً — الأزقة تُربط بها بالكود
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

  -- ③ العناصر
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
    /*
     * ⑨ الجولة ⑨: رقم القطعة. غيابه (مستدعٍ قديم، صف يدوي) ⇒ ٠ = الشوط كاملاً.
     * `greatest(...,0)` يحمي من سالب في ملف مشوّه بلا رفع استثناء.
     */
    v_piece  := greatest(coalesce(nullif(v_row->>'piece_index','')::smallint, 0), 0);

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
         * ══ المطابقة (الجولة ⑨): ثلاثية — osm_way_id + piece_index ══
         *
         * كان: `where zone_id = p_zone and osm_way_id = v_osm limit 1`
         *       ⇒ الجزء الثاني من الشوط يجد الجزء الأول، فيُحدّثه ⇒ **يمسحه**.
         * صار: `and piece_index = v_piece`
         *       ⇒ كل جزء يجد نفسه فقط. القياس: ٣ قطع ⇒ ٣ صفوف بعد، لا ١.
         *
         * ولماذا `limit 1` باقٍ: (zone, osm, piece) فريد بالفهرس ⇒ صف واحد
         * على الأكثر. الاحتفاظ به تكلفة تخطيط أقل، لا سلوك مختلف.
         */
        v_existing_code := null;
        v_ex_name := null;
        v_ex_src  := null;
        if v_osm is not null then
          select code, name, name_source into v_existing_code, v_ex_name, v_ex_src
          from public.map_alleys
          where zone_id = p_zone and osm_way_id = v_osm and piece_index = v_piece
          limit 1;
        end if;
        /*
         * ملاذ الكود: صفوف ما قبل العمود (piece_index=0) أو صفوف يدوية بلا
         * osm_way_id. الشرط `piece_index = v_piece` يُمنع هنا: صف بـ٠ مطابق
         * للجزء ٠ فقط، والجزء ١ له كود جديد.
         */
        if v_existing_code is null and v_osm is null then
          select code, name, name_source into v_existing_code, v_ex_name, v_ex_src
          from public.map_alleys
          where zone_id = p_zone and code = v_code and piece_index = v_piece;
          if not found then
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

        if v_ex_src = 'manual' and v_name is not null then
          v_newname := v_ex_name;   -- لا يطغى OSM على تصحيح موظف
        else
          v_newname := v_name;
        end if;

        if v_existing_code is null then
          insert into public.map_alleys (
            zone_id, mahalla_id, code, name, path, width_m, width_source,
            osm_way_id, piece_index, link_source, name_source, length_m, max_segment_m, created_by
          ) values (
            p_zone, v_mah_id, v_code, v_newname, v_path, v_width,
            coalesce(nullif(v_row->>'width_source',''), 'default'),
            v_osm, v_piece, coalesce(v_link,'manual'), 'osm',
            app.map_line_length_m(v_path), app.map_max_segment_m(v_path), auth.uid()
          );
          v_inserted := v_inserted + 1;
        else
          update public.map_alleys
             set path          = v_path,
                 width_m       = v_width,
                 osm_way_id    = coalesce(v_osm, osm_way_id),
                 piece_index   = v_piece,
                 name          = v_newname,
                 length_m      = app.map_line_length_m(v_path),
                 max_segment_m = app.map_max_segment_m(v_path),
                 updated_at    = now()
           where zone_id = p_zone and code = v_existing_code;
          v_updated := v_updated + 1;
        end if;

      else
        -- الشارع بأنواعه الأربعة (نفس منطق الأزقة: osm_way_id + piece_index)
        v_existing_code := null;
        v_ex_name := null;
        v_ex_src  := null;
        if v_osm is not null then
          select code, name, name_source into v_existing_code, v_ex_name, v_ex_src
          from public.map_streets
          where zone_id = p_zone and osm_way_id = v_osm and piece_index = v_piece
          limit 1;
        end if;
        if v_existing_code is null and v_osm is null then
          select code, name, name_source into v_existing_code, v_ex_name, v_ex_src
          from public.map_streets
          where zone_id = p_zone and code = v_code and piece_index = v_piece;
          if not found then
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

        if v_ex_name is not null and v_ex_src = 'manual' then
          v_newname := v_ex_name;
        else
          v_newname := v_name;
        end if;

        if v_existing_code is null then
          insert into public.map_streets (
            zone_id, code, name, kind, path, width_m, osm_way_id, piece_index,
            name_source, length_m, max_segment_m, created_by
          ) values (
            p_zone, v_code, v_newname, v_kind, v_path, v_width, v_osm, v_piece,
            'osm', app.map_line_length_m(v_path), app.map_max_segment_m(v_path), auth.uid()
          );
          v_inserted := v_inserted + 1;
        else
          update public.map_streets
             set path          = v_path,
                 width_m       = v_width,
                 osm_way_id    = coalesce(v_osm, osm_way_id),
                 piece_index   = v_piece,
                 name          = v_newname,
                 length_m      = app.map_line_length_m(v_path),
                 max_segment_m = app.map_max_segment_m(v_path),
                 updated_at    = now()
           where zone_id = p_zone and code = v_existing_code;
          v_updated := v_updated + 1;
        end if;
      end if;

    exception when others then
      -- عنصر مرفوض: يُسجَّل بكو ده وسببه، والبقية تكمل
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

  -- ④ تحديث سجل الدفعة
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
end $function$;

comment on function app.map_import_batch_impl(uuid, jsonb, jsonb, uuid, jsonb) is
  'الجولة ⑨: مطابقة (osm_way_id, piece_index) — الشوط المنقسم على حدود الزون '
  'يُحفظ كعدة صفوف. الأدوار: public.map_import_batch → app.map_import_batch '
  '(سقف ٣٠٠ كما في 20261124000300) → هذه الدالة.';

comment on index public.map_streets_zone_osm_piece_uk is
  'الشوط الواحد قد يُنتج عدة قطع عند قصّه على حدود الزون. التفرد على '
  '(zone_id, osm_way_id, piece_index) لا على (zone_id, osm_way_id) — '
  'الاثنان الأخيران كانا يمنعان حفظ الجزء الثاني (عيب الجولة ⑨).';

-- ───────────────────────────────────────────────────────────────────────────
-- ④ تنظيف إحصاءات القطع (للتشخيص: كم شوطاً انقسم فعلاً؟)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.map_piece_stats(p_zone uuid)
returns table(
  table_name   text,
  total_rows   bigint,
  distinct_ways bigint,
  extra_pieces bigint,
  max_pieces   int
)
language sql
stable
security definer
set search_path = public, app
as $function$
  with s as (
    select 'map_streets'::text as t, osm_way_id, piece_index
    from public.map_streets where zone_id = p_zone and osm_way_id is not null
    union all
    select 'map_alleys'::text, osm_way_id, piece_index
    from public.map_alleys where zone_id = p_zone and osm_way_id is not null
  ),
  per_way as (
    select t, osm_way_id, count(*) as pieces
    from s group by t, osm_way_id
  )
  select p.t,
         (select count(*) from s where s.t = p.t)                                  as total_rows,
         count(*)                                                                   as distinct_ways,
         count(*) filter (where p.pieces > 1)                                       as extra_pieces,
         max(p.pieces)::int                                                         as max_pieces
  from per_way p
  group by p.t;
$function$;

comment on function app.map_piece_stats(uuid) is
  'تشخيص الجولة ⑨: لكل جدول — عدد الصفوف، عدد الأشواط المختلفة، '
  'عدد الأشواط التي انقسمت لأكثر من قطعة، وأقصى عدد قطع لشوط واحد. '
  'للتشخيص لا للواجهة.';

revoke all on function app.map_piece_stats(uuid) from public, anon;
grant execute on function app.map_piece_stats(uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ إعادة تحميل مخطط PostgREST (ليظهر العمود الجديد للواجهة فوراً)
-- ───────────────────────────────────────────────────────────────────────────

notify pgrst, 'reload schema';
