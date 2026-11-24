-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 20261128000300 · الجولة ③ — تقرير الأزقة المزارة: اسم التبويب + الأعمدة الـ٢٦ + أرشيف
--                 الملفات المرفوعة ببصمة SHA-256
--
-- المشكلة التي يحلّها هذا الترحيل — ملموسة، لا نظرية:
--   ملف Excel يُبنى في المتصفح ثم يُنزَّل إلى «التنزيلات» على جهاز غرفة العمليات.
--   بعد أسبوع: لا أحد يعرف أي نسخة هي المعتمدة، ولا هل عُدّل الملف بعد إنشائه،
--   ولا مَن أنشأه ولا بأي فلتر. وإذا ضاع الجهاز ضاع التقرير الرسمي، **ولأن
--   نقاط GPS الخام تُحذف بعد 48 ساعة (قرار المالك 2026-11-24)، لا يمكن إعادة
--   بناء التقرير لاحقاً** — التقرير المرفوع هو الدليل الوحيد.
--
-- الحل المكوَّن من ثلاث قطع، وكل قطعة تُحلّ عطباً قائماً:
--
--   ① اسم التبويب: كان `kind.label.slice(0, 28)` — قطعٌ أعمى عند 28 حرفاً بلا
--      أي وعي بحدود Excel. الاسم المعتمد اليوم «ورقة الشركة» يمرّ سالمة، لكن
--      أي نوع جديد عنوانه أطول يُقصّ في منتصف كلمة عربية. هنا دالة تطبيع واحدة
--      تنزع المحارف الممنوعة (`\ / * ? : [ ]`) وتقصّ عند 31 حرفاً (حد Excel)
--      وتضمن عدم التكرار داخل المصنف. تعريف واحد — الشاشة والملف والطباعة.
--
--   ② الأعمدة الـ٢٦: `app.map_vehicle_visits_grouped` تُرجع 26 حقلاً بالضبط،
--      والواجهة تعرضها عبر `GROUPED_COLUMNS` في `grouped-export.ts`. لكن
--      PostgREST قد يعيد ترتيب المفاتيح، والواجهة تعتمد على **الترتيب** في
--      الأوراق المطبوعة. هنا دالة تُرجع ترتيب الأعمدة المعتمد ومعه العدد
--      المتوقّع — فاختبار واحد يُثبت أن القاعدة والواجهة لا تنفصلان.
--
--   ③ أرشيف الملفات: bucket خاص `map-reports` + جدول `map_report_files`
--      يسجّل لكل ملف: مَن رفعه، أي يوم، أي نوع تصدير، كم صفّاً، بصمة SHA-256،
--      الحجم. البصمة تُحسب في العميل (Web Crypto) ويرفض الخادم أي سجل بصمة غير
--      صالحة. الملف في Storage، والسجل في القاعدة — والاثنان مرتبطان بالمسار.
--      **لا حذف تلقائي**: هذه سجلات رسمية، وأي حذف يحتاج طلب احتفاظ صريح.
--
-- التراجع:
--   drop function public.map_report_column_order();
--   drop function public.map_report_register_file(text,text,int,text,bigint,text,date);
--   drop function app.map_report_validate_sha256(text);
--   drop function app.map_report_sheet_name(text);
--   drop table public.map_report_files;
--   delete from storage.buckets where id = 'map-reports';
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ① اسم التبويب: قاعدة واحدة، مطبِّعة، تعرف حدود Excel
-- ───────────────────────────────────────────────────────────────────────────────────────
-- حدود Excel الحقيقية: 31 حرفاً · ممنوع \ / * ? : [ ] · لا اسم فارغ · لا تكرار.
-- هذه الدالة تُعيد اسماً صالحاً دائماً — لا ترمي استثناءً أبداً. التصدير
-- الرسمي لا يجوز أن يفشل بسبب عنوان.
create or replace function app.map_report_sheet_name(p_raw text, p_used text[] default '{}')
returns text
language plpgsql immutable set search_path = public, app, pg_catalog as $$
declare
  base text;
  cand text;
  n int := 2;
begin
  -- ① نزع المحارف الممنوعة واستبدالها بشرطة قصيرة (نفس ما تفعله الواجهة)
  base := regexp_replace(coalesce(p_raw, ''), '[\\/*?:\[\]]', '–', 'g');
  -- ② ضغط الفراغات وتشذيب الأطراف
  base := btrim(regexp_replace(base, '\s+', ' ', 'g'));
  -- ③ القصّ عند 31 حرفاً — بالحروف لا بالبايتات (النص العربي بايتان لكل حرف
  --    في UTF-8، والقصّ بالبايتات يقطع الحرف نصفين فيصير «؟»)
  if char_length(base) > 31 then base := left(base, 31); end if;
  -- ④ اسم احتياطي عند الفراغ
  if base = '' then base := 'ورقة'; end if;

  -- ⑤ ضمان عدم التكرار داخل المصنف: « (2)» ثم « (3)» …
  cand := base;
  while cand = any(coalesce(p_used, '{}'::text[])) loop
    cand := left(base, 31 - char_length(' (' || n || ')')) || ' (' || n || ')';
    n := n + 1;
    if n > 99 then exit; end if;  -- حماية من حلقة لا تنتهي لو مُرِّرت قائمة غريبة
  end loop;
  return cand;
end $$;

comment on function app.map_report_sheet_name(text, text[]) is
  'اسم تبويب Excel صالح دائماً: ينزع / \ * ? : [ ]، يقصّ إلى 31 حرفاً، يضمن عدم التكرار، ويُعيد «ورقة» عند الفراغ. لا يرمي استثناءً أبداً — التصدير الرسمي لا يسقط لعنوان.';

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ② عقد الأعمدة الـ٢٦: ترتيب مرجعي واحد يُثبت تطابق القاعدة والواجهة
-- ───────────────────────────────────────────────────────────────────────────────────────
-- تُرجع ترتيب الأعمدة كما تُرجعها app.map_vehicle_visits_grouped **بالاسم**.
-- القيمة المرجعة مصفوفة نصوص مرتّبة؛ والواجهة تقارنها بـ GROUPED_COLUMNS.
-- لا أرقام مكتوبة هنا: الترتيب يُقرأ من information_schema، فإذا أضاف أحدهم
-- عموداً في الترحيل ولم يُحدّث الواجهة، يظهر الفرق فوراً في اختبار العقد بدل
-- أن يُكتشف بعد طباعة تقرير ناقص.
create or replace function app.map_grouped_report_column_order()
returns text[]
language sql stable set search_path = public, app, pg_catalog as $$
  -- ⚠ `returns table (...)` **لا** ينشئ نوعاً مركّباً مسمّى — `prorettype` هو
  -- `record` المجرّد ولا صفّ له في pg_type. لذلك يُقرأ الترتيب من
  -- `proargnames` مقروناً بـ`proargmodes`: الأعمدة المُرجعة وحدها هي التي
  -- وضعها 't' (table)، والمعاملات قبلها وضعها 'i' (in) أو 'b' (inout).
  -- هذا هو المصدر الذي يستخدمه PostgREST نفسه لبناء نتيجة الدالة.
  select coalesce(
           array_agg(nm.name::text order by nm.ord),
           '{}'::text[]
         )
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral unnest(p.proargnames, p.proargmodes)
      with ordinality as nm(name, mode, ord)
   where ns.nspname = 'app'
     and p.proname = 'map_vehicle_visits_grouped'
     and nm.mode = 't';
$$;

comment on function app.map_grouped_report_column_order() is
  'ترتيب أعمدة التقرير المعتمد كما تُرجعها app.map_vehicle_visits_grouped — مرجع للواجهة والاختبارات. الواجهة تضيف seq في المقدمة أثناء التصدير.';

create or replace function public.map_grouped_report_column_order()
returns text[]
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform public.map_require_reader();
  return app.map_grouped_report_column_order();
end $$;

comment on function public.map_grouped_report_column_order() is
  'غلاف عام لترتيب أعمدة التقرير المعتمد — يُستدعى من الواجهة واختبار العقد.';

revoke all on function public.map_grouped_report_column_order() from public, anon;
grant execute on function public.map_grouped_report_column_order() to authenticated;
revoke all on function app.map_grouped_report_column_order() from public, anon, authenticated;
grant execute on function app.map_grouped_report_column_order() to service_role;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ③ أرشيف ملفات التقارير: bucket خاص + جدول سجلات + تحقق البصمة
-- ───────────────────────────────────────────────────────────────────────────────────────

-- bucket خاص — القراءة والكتابة بالسياسات لا بالرابط العام.
-- الحد 25 م.ب: تقرير 30 يوماً × 149 آلية ≈ 19 م.ب في أسوأ حالة (26 عموداً،
-- نصفها نصّي طويل). 25 م.ب سقف آمن مع هامش.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map-reports', 'map-reports', false, 26214400,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- جدول السجل: كل صفّ = ملف رُفع فعلاً إلى Storage.
create table if not exists public.map_report_files (
  id            uuid primary key default gen_random_uuid(),
  -- المسار داخل bucket — مفتاح الربط مع storage.objects
  storage_path  text not null unique,
  kind_id       text not null,                  -- sheet | alley | street | driver | vehicle | mahalla | uncertain | full
  kind_label    text not null,                  -- الاسم العربي كما يراه المستخدم
  zone_id       uuid references public.map_zones(id) on delete set null,
  zone_name     text,                           -- نسخة نصية: الزون قد يُعاد تسميته، والتقرير الرسمي لا يتغيّر
  day           date not null,                  -- يوم التقرير (بغداد)
  filter_count  int  not null default 0 check (filter_count >= 0),
  rows_count    int  not null default 0 check (rows_count >= 0),
  sheet_name    text not null,                  -- اسم التبويب بعد التطبيع — للأرشفة والبحث
  sha256        text not null,
  bytes         bigint not null check (bytes > 0),
  uploaded_by   uuid not null default auth.uid(),
  uploaded_by_name text,                        -- نسخة نصية: الحساب قد يُعطَّل، والسجل يبقى مقروءاً
  created_at    timestamptz not null default now(),
  -- البصمة 64 حرفاً سداسياً صغيراً — لا مرونة، لأن قيمة مشوّهة تُبطل الغرض
  constraint map_report_files_sha256_valid check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint map_report_files_kind_valid check (kind_id in
    ('sheet','alley','street','driver','vehicle','mahalla','uncertain','full')),
  constraint map_report_files_path_prefix check (storage_path like 'reports/%')
);

comment on table public.map_report_files is
  'أرشيف ملفات تقارير الخريطة: كل ملف Excel رُفع فعلاً، ببصمة SHA-256 وحجمه ومَن رفعه. نقاط GPS الخام تُحذف بعد 48 ساعة، فهذا السجل هو الدليل الدائم على محتوى التقرير المعتمد.';

create index if not exists map_report_files_day_idx
  on public.map_report_files (day desc, kind_id);
create index if not exists map_report_files_zone_idx
  on public.map_report_files (zone_id, day desc) where zone_id is not null;
create index if not exists map_report_files_uploader_idx
  on public.map_report_files (uploaded_by, created_at desc);

-- ⚠ فحص صلب: RLS وسياسة القراءة **لا تحميان** الإدراج المباشر لو مُنح
-- الدور صلاحية الإدراج على الجدول. RLS هنا تعمل بهوية المستخدم لا بهوية
-- المالك (الجدول ليس security definer)، لكن سياسة إدراج غائبة = منع،
-- بينما صلاحية جدول ممنوحة قد تُقرأ خطأً ككفاية. السحب من authenticated
-- يجعل المنع قاطعاً على مستويين: صلاحية + سياسة.
revoke insert, update on public.map_report_files from authenticated, anon;
grant select on public.map_report_files to authenticated;

alter table public.map_report_files enable row level security;

-- القراءة: من يملك صلاحية قراءة الخريطة
drop policy if exists "map_report_files: قراءة لمن يقرأ الخريطة" on public.map_report_files;
create policy "map_report_files: قراءة لمن يقرأ الخريطة"
  on public.map_report_files for select to authenticated
  using (coalesce(app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']), false));

-- الكتابة: تُمنع مباشرة. الإدراج يمرّ عبر الدالة أدناه وحدها، لأنها
-- تتحقق من البصمة والحجم والمسار وتُعيد الصفّ كاملاً. RLS بلا سياسة إدراج
-- يعني: `insert into public.map_report_files` من العميل يفشل دائماً.
drop policy if exists "map_report_files: لا إدراج مباشر" on public.map_report_files;

-- الحذف: للإدارة العليا فقط ولطلب احتفاظ صريح.
drop policy if exists "map_report_files: حذف لمدير النظام" on public.map_report_files;
create policy "map_report_files: حذف لمدير النظام"
  on public.map_report_files for delete to authenticated
  using (coalesce(app.has_role(array['super_admin']), false));

-- Storage: رفع في مجلد المستخدم نفسه، وقراءة لمن يقرأ الخريطة
drop policy if exists "map-reports: رفع لمن يصدّر" on storage.objects;
create policy "map-reports: رفع لمن يصدّر"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'map-reports'
    and coalesce(app.has_role(array['ops_room','it_admin','super_admin']), false)
    and (name like 'reports/' || auth.uid()::text || '/%')
  );

drop policy if exists "map-reports: قراءة لمن يقرأ الخريطة" on storage.objects;
create policy "map-reports: قراءة لمن يقرأ الخريطة"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'map-reports'
    and coalesce(app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']), false)
  );

drop policy if exists "map-reports: حذف لمدير النظام" on storage.objects;
create policy "map-reports: حذف لمدير النظام"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'map-reports'
    and coalesce(app.has_role(array['super_admin']), false)
  );

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ④ تسجيل الملف بعد رفعه: تحقق كامل قبل أن يصير السجل دليلاً
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.map_report_register_file(
  p_path        text,
  p_kind_id     text,
  p_kind_label  text,
  p_day         date,
  p_sheet_name  text,
  p_sha256      text,
  p_bytes       bigint,
  p_zone_id     uuid default null,
  p_zone_name   text default null,
  p_filter_count int default 0,
  p_rows_count  int default 0
) returns public.map_report_files
language plpgsql volatile security definer set search_path = public, app as $$
declare
  v_row public.map_report_files;
  v_path text;
begin
  -- الصلاحية: من يملك التصدير ورفع الملف
  if auth.uid() is null or not coalesce(app.has_role(array['ops_room','it_admin','super_admin']), false) then
    raise exception 'MAP_REPORT_FORBIDDEN: لا تملك صلاحية أرشفة تقارير الخريطة'
      using errcode = 'insufficient_privilege';
  end if;

  -- البصمة: 64 حرفاً سداسياً صغيراً — نرفض بصمة مشوّهة بدل تسجيل دليل لا يُتحقَّق منه
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'MAP_REPORT_SHA256_INVALID: بصمة SHA-256 غير صالحة (متوقع 64 حرفاً سداسياً صغيراً)'
      using errcode = 'check_violation';
  end if;

  -- الحجم: يجب أن يكون موجباً، ولا يتجاوز حد الـbucket
  if p_bytes is null or p_bytes <= 0 or p_bytes > 26214400 then
    raise exception 'MAP_REPORT_SIZE_INVALID: حجم الملف غير صالح (يجب أن يكون بين 1 بايت و25 م.ب)'
      using errcode = 'check_violation';
  end if;

  -- المسار: يجب أن يبدأ بـreports/ وأن يقع تحت مجلد المستخدم نفسه.
  -- هذا يمنع تسجيل ملف رفعه شخص آخر كأنه ملفك، ويمنع التقاط ملف من bucket آخر.
  if p_path is null or p_path not like 'reports/%' then
    raise exception 'MAP_REPORT_PATH_INVALID: مسار الملف يجب أن يبدأ بـreports/'
      using errcode = 'check_violation';
  end if;
  if p_path not like 'reports/' || auth.uid()::text || '/%' then
    raise exception 'MAP_REPORT_PATH_FORBIDDEN: المسار يجب أن يقع داخل مجلدك (%/…)',
      auth.uid()::text using errcode = 'insufficient_privilege';
  end if;

  -- اسم التبويب: نطبّعه هنا أيضاً — لا نثق بالعميل في سجل رسمي
  v_path := p_path;

  insert into public.map_report_files (
    storage_path, kind_id, kind_label, zone_id, zone_name, day,
    filter_count, rows_count, sheet_name, sha256, bytes, uploaded_by, uploaded_by_name
  ) values (
    v_path, p_kind_id, p_kind_label, p_zone_id, p_zone_name, p_day,
    coalesce(p_filter_count, 0), coalesce(p_rows_count, 0),
    app.map_report_sheet_name(p_sheet_name, '{}'),
    p_sha256, p_bytes, auth.uid(), app.user_display_name(auth.uid())
  )
  on conflict (storage_path) do update
    set kind_id = excluded.kind_id,
        kind_label = excluded.kind_label,
        zone_id = excluded.zone_id,
        zone_name = excluded.zone_name,
        day = excluded.day,
        filter_count = excluded.filter_count,
        rows_count = excluded.rows_count,
        sheet_name = excluded.sheet_name,
        sha256 = excluded.sha256,
        bytes = excluded.bytes,
        uploaded_by = excluded.uploaded_by,
        uploaded_by_name = excluded.uploaded_by_name,
        created_at = now()
  returning * into v_row;

  return v_row;
end $$;

comment on function public.map_report_register_file(text,text,text,date,text,text,bigint,uuid,text,int,int) is
  'يسجّل ملف تقرير Excel بعد رفعه إلى bucket map-reports. يتحقق من البصمة (64 سداسياً) والحجم (≤25 م.ب) والمسار (داخل مجلد المستخدم)، ويطبّع اسم التبويب، ويحفظ نسخة نصية من اسم الرافع واسم الزون لأنها قد تتغيّر والسجل الرسمي لا.';

revoke all on function public.map_report_register_file(text,text,text,date,text,text,bigint,uuid,text,int,int) from public, anon;
grant execute on function public.map_report_register_file(text,text,text,date,text,text,bigint,uuid,text,int,int) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ⑤ قائمة الأرشيف للواجهة: ملف واحد يُعرض في تبويب «الأرشيف»
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.map_report_files_list(
  p_zone uuid default null,
  p_from date default null,
  p_to date default null,
  p_kind text default null,
  p_limit int default 100
) returns table (
  id uuid, storage_path text, kind_id text, kind_label text,
  zone_id uuid, zone_name text, day date, filter_count int, rows_count int,
  sheet_name text, sha256 text, bytes bigint,
  uploaded_by uuid, uploaded_by_name text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform public.map_require_reader();
  return query
    select f.id, f.storage_path, f.kind_id, f.kind_label,
           f.zone_id, f.zone_name, f.day, f.filter_count, f.rows_count,
           f.sheet_name, f.sha256, f.bytes,
           f.uploaded_by, f.uploaded_by_name, f.created_at
      from public.map_report_files f
     where (p_zone is null or f.zone_id = p_zone)
       and (p_from is null or f.day >= p_from)
       and (p_to is null or f.day <= p_to)
       and (p_kind is null or f.kind_id = p_kind)
     order by f.day desc, f.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

comment on function public.map_report_files_list(uuid,date,date,text,int) is
  'قائمة ملفات تقارير الخريطة المؤرشفة — مفلترة بالزون واليوم والنوع، بحدّ 500 صفّ أقصى.';

revoke all on function public.map_report_files_list(uuid,date,date,text,int) from public, anon;
grant execute on function public.map_report_files_list(uuid,date,date,text,int) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ⑥ تحقق من وجود الملف فعلاً في Storage — يمنع سجلاً بلا ملف
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function app.map_report_file_uploaded(p_path text)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from storage.objects o
     where o.bucket_id = 'map-reports' and o.name = p_path
  );
$$;

comment on function app.map_report_file_uploaded(text) is
  'هل الملف موجود فعلاً في bucket map-reports؟ يُستخدم لفحص سلامة الأرشيف: سجل بلا ملف = عطب.';

revoke all on function app.map_report_file_uploaded(text) from public, anon, authenticated;
grant execute on function app.map_report_file_uploaded(text) to service_role;
