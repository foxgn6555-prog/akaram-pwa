-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 20261128000400 · الجولة ④ — الأرشيف والاحتفاظ: إغلاق الحاجز · مصدر أرشيف للزيارات
--                 · حارس «تصدير قبل حذف» للزيارات · جدول ملفات التقارير في الكتالوج
--
-- ⚠ عطب حقيقي اكتُشف بعد إيداع الجولة ③ (يُصلَح هنا، لا يُخفى):
--   الترحيل 20261128000100 وضع حاجزاً في آخره:
--       if missing is not null then raise exception 'RETENTION_CATALOG_INCOMPLETE: …';
--   يقرأ **كل جدول في public** ويرفض الترحيل إن وُجد جدول بلا تعريف في الكتالوج.
--   الجولة ③ أضافت `public.map_report_files` ولم تُعرّفه في الكتالوج. على قاعدة
--   فارغة يمرّ الترحيل (الجدول لم يكن موجوداً وقت تنفيذ الحاجز داخل ①)، لكن على
--   الإنتاج — حيث ① طُبِّق أولاً و③ بعده — **لن يمرّ ③ إلا إذا كان الجدول مُعرَّفاً**.
--   ولأن ③ أُودِع رسمياً، فالإصلاح هنا في ترحيل لاحق هو الطريق الصحيح: لا نعدّل
--   ترحيلاً مدفوعاً. واختبار الكتالوج `A1` في tests/db يمسك نفس العطب في CI.
--
-- ماذا يفعل هذا الترحيل — بالترتيب:
--   ① يُعيد تعريف الكتالوج مضيفاً `map_report_files` (سجل إثبات — يُحفظ، لا حذف زمني)
--      ويُعيد تعريف الحاجز نفسه ليصير **اسم دالة** يُستدعى من أي ترحيل لاحق، بدل
--      كتلة `do $$` مكرّرة في كل مرة.
--   ② يُنشئ `app.gps_visit_reports` — مصدر أرشيف موحّد لزيارات اليوم: يجمع
--      `map_visits` (الزيارات المبنية) مع شهادة البناء، ويُعيد صفوفاً جاهزة للتصدير
--      ومعه إحصاء يُثبت أن ما صُدِّر هو ما كان في القاعدة. **بدون هذا لا يمكن
--      تطبيق «تصدير قبل حذف» على الزيارات بأمان**: لا مصدر واحد يقرأ منه
--      التصدير والحذف معاً فيُقارنان.
--   ③ يضيف حارس «لا حذف زيارة بلا تصدير مُثبت»: دالة تُرجع ما يجوز حذفه
--      (زيارات أقدم من المدة) وما لا يجوز (زيارات بلا تصدير مسجَّل لبومها).
--      **لا تحذف شيئاً بنفسها** — الحذف يبقى عبر محرك الاحتفاظ الموجود
--      (`data_retention_delete_some`) الذي يفرض التصدير من `default_export_required`.
--   ④ يوثّق الثغرة الباقية بصراحة: `map_visits` بلا `id`؟ لا — لها `id`.
--      لكن `data_retention_*` تحتاج `time_column` نصّياً، و`map_visits.entered_at`
--      موجود. الفحص هنا يُثبت أن المحرك يستطيع العدّ والحذف فعلاً على الخريطة،
--      لا أن يمرّ بلا فعل.
--
-- التراجع:
--   drop function public.map_visits_purge_guard(date,int);
--   drop function public.gps_visit_reports(date,date,uuid);
--   drop function app.require_retention_catalog_complete();
--   (يُعاد تعريف الكتالوج السابق من 20261128000100)
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ① الكتالوج: يُضاف map_report_files · والحاجز يصير دالة قابلة لإعادة الاستعمال
-- ───────────────────────────────────────────────────────────────────────────────────────
-- نُعيد تعريف الكتالوج **بدون** لمس النسخة السابقة: `data_retention_catalog_pre_gps`
-- تبقى كما هي، ونضيف صفاً واحداً في `values` الجديدة فقط. لا نُعيد كتابة الجدول كاملاً
-- (٢٧٠٠ سطر من المتغيّرات التي قد تختلط) — نلتف حول النسخة الحالية:
--   `app.data_retention_catalog()` الحالية تشمل كل شيء ما عدا الجدول الجديد.
--   فنعيد تعريفها كـ«النسخة الحالية union صف map_report_files».
-- هذا يتطلّب توثيقاً صريحاً لماذا: أي صفّ يُضاف مستقبلاً يجب أن يُضاف هنا
-- أو في ترحيل لاحق بنفس النمط، **وإلا رفض الحاجز الترحيل**.
alter function app.data_retention_catalog() rename to data_retention_catalog_pre_archive;

create function app.data_retention_catalog()
returns table (data_key text, portal_key text, label text, description text, table_name text, time_column text,
               keep_where text, safety_lock text, deletable boolean, default_months int, default_export_required boolean)
language sql immutable as $$
  select * from app.data_retention_catalog_pre_archive()
  union all
  values
    -- ★ جدول الجولة ③: سجل إثبات — يُحفظ بلا حذف زمني
    ('map_report_files', 'ops', 'ملفات تقارير الخريطة',
     'كل ملف Excel رُفع للأرشيف: اليوم والنوع وعدد الصفوف وبصمة SHA-256 ومَن رفعه. الدليل الدائم على محتوى التقرير المعتمد بعد حذف نقاط GPS.',
     'map_report_files', 'created_at', null,
     'سجل إثبات رسمي — لا حذف زمني؛ الحذف اليدوي لمدير النظام وبتفويض',
     false, 0, false)
$$;

revoke all on function app.data_retention_catalog() from public, anon;
grant execute on function app.data_retention_catalog() to authenticated;

comment on function app.data_retention_catalog() is
  'كتالوج الاحتفاظ. 20261128000400: أُضيف map_report_files (سجل إثبات، لا حذف زمني) ليتوافق مع حاجز اكتمال الكتالوج.';

-- الحاجز كدالة — يستدعيها هذا الترحيل وآخر السلسلة، بدل تكرار الكتلة
create or replace function app.require_retention_catalog_complete()
returns void
language plpgsql stable security definer set search_path = public, app as $$
declare missing text;
begin
  select string_agg(t.table_name, ', ' order by t.table_name) into missing
    from information_schema.tables t
   where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
     and not exists (select 1 from app.data_retention_catalog() k where k.table_name = t.table_name);
  if missing is not null then
    raise exception 'RETENTION_CATALOG_INCOMPLETE: جداول بلا تعريف في الكتالوج: %', missing;
  end if;
end $$;

comment on function app.require_retention_catalog_complete() is
  'حاجز: يرفض المتابعة إن وُجد أي جدول في public بلا تعريف في كتالوج الاحتفاظ. يُستدعى في نهاية كل ترحيل يضيف جدولاً.';

revoke all on function app.require_retention_catalog_complete() from public, anon, authenticated;
grant execute on function app.require_retention_catalog_complete() to service_role;

do $$ begin perform app.require_retention_catalog_complete(); end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ② مصدر أرشيف الزيارات: صفوف + إحصاء يُثبت التطابق
-- ───────────────────────────────────────────────────────────────────────────────────────
-- الغرض: قبل حذف زيارات قديمة، يُصدَّر يومها. بعد الحذف يجب أن يكون في يدنا:
--   · الملف نفسه (Excel/CSV) ببصمة SHA-256
--   · عدد الصفوف الذي **توقّعه** المصدر وقت التصدير
--   · عدد الصفوف التي حُذفت فعلاً
-- الثلاثة تُقارن في `data_retention_requests` (rows_total, rows_exported, rows_deleted)
-- الموجود مسبقاً. هذه الدالة تُعطي العدد المتوقّع بدقّة، لا تقديراً.
--
-- لماذا `date` لا `timestamptz` في المعامل؟ لأن الحذف على مستوى **يوم بغداد**،
-- والحذف الناقص (يوم كامل إلا ساعة) يكسر الشهادة في الجولة ①: الشهادة تُمنح
-- ليوم كامل، وإذا حُذفت بعض زياراته فقط يصير «يوم مُعتمد لكن ناقص» — وهي
-- أسوأ حالة: تبدو مكتملة وهي ليست كذلك.
create or replace function public.gps_visit_reports(
  p_from date,
  p_to   date default null,
  p_zone uuid default null
) returns table (
  placeday date,
  zone_id uuid,
  zone_name text,
  vehicle_id uuid,
  db_number text,
  driver_name text,
  mahalla_number text,
  place_kind text,
  place_name text,
  entered_at timestamptz,
  exited_at timestamptz,
  dwell_seconds int,
  points_count int,
  status text,
  visits_count bigint,
  zones_count bigint,
  days_count bigint
)
language plpgsql stable security definer set search_path = public, app as $$
declare v_to date := coalesce(p_to, p_from);
begin
  if auth.uid() is null or not coalesce(app.has_role(array['ops_room','it_admin','super_admin']), false) then
    raise exception 'GPS_FORBIDDEN: لا تملك صلاحية تصدير الزيارات' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null then
    raise exception 'GPS_VISIT_REPORTS_RANGE: تاريخ البداية مطلوب' using errcode = 'invalid_parameter_value';
  end if;
  if v_to < p_from then
    raise exception 'GPS_VISIT_REPORTS_RANGE: النهاية % قبل البداية %', v_to, p_from using errcode = 'invalid_parameter_value';
  end if;
  -- حدّ أقصى: لا تصدير ٥ سنوات في استدعاء واحد (يُقسَّم إلى نوافذ)
  if v_to - p_from > 366 then
    raise exception 'GPS_VISIT_REPORTS_RANGE: المدى % يوماً يتجاوز 366 — صدّر على نوافذ', v_to - p_from using errcode = 'invalid_parameter_value';
  end if;

  return query
  with base as (
    select v.placeday, v.zone_id, z.name as zone_name, v.vehicle_id,
           gv.db_number,
           -- السائق من employees عبر driver_employee_id (المصدر المعتمد، نفس عقد التقرير المجمّع)
           coalesce(emp.full_name, gv.driver_name) as driver_name,
           v.mahalla_number, v.place_kind, v.place_name,
           v.entered_at, v.exited_at, v.dwell_seconds, v.points_count, v.status
      from public.map_visits v
      left join public.map_zones z on z.id = v.zone_id
      left join public.garage_vehicles gv on gv.id = v.vehicle_id
      left join public.employees emp on emp.id = gv.driver_employee_id
     where v.placeday >= p_from and v.placeday <= v_to
       and (p_zone is null or v.zone_id = p_zone)
  )
  select b.placeday, b.zone_id, b.zone_name, b.vehicle_id, b.db_number, b.driver_name,
         b.mahalla_number, b.place_kind, b.place_name, b.entered_at, b.exited_at,
         b.dwell_seconds, b.points_count, b.status,
         count(*) over () as visits_count,
         (select count(distinct x.zone_id) from base x) as zones_count,
         (select count(distinct x.placeday) from base x) as days_count
    from base b
   order by b.placeday, b.vehicle_id nulls last, b.entered_at;
end $$;

comment on function public.gps_visit_reports(date,date,uuid) is
  'مصدر تصدير زيارات الخريطة ليوم بغداد أو مدى — مع عدد الزيارات والزونات والأيام في كل صفّ، لأن المعرّف الرسمى لطلب الحذف هو هذا العدد. لا يقرأ نقاط GPS الخام ولا يمسّها (قد تكون حُذفت أصلاً).';

revoke all on function public.gps_visit_reports(date,date,uuid) from public, anon;
grant execute on function public.gps_visit_reports(date,date,uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ③ حارس «تصدير قبل حذف» للزيارات
-- ───────────────────────────────────────────────────────────────────────────────────────
-- تُرجع: ما يجوز حذفه الآن، وما لا يجوز (يوم بلا تصدير مُثبت)، وكم يوماً بقي.
-- **لا تحذف**. الحذف عبر `data_retention_delete_batch` الذي يفرض التصدير.
--
-- لماذا حارس منفصل والحقل `default_export_required` موجود؟
--   لأن `default_export_required` يُطبَّق على **الطلب** لا على **اليوم**. طلب واحد
--   لـ٣٠ يوماً يجعل التصدير شرطاً لكل الأيام معاً. أما هنا فيُفحص **كل يوم على
--   حدة**: يوم صُدِّر ويوم لم يُصدَّر. وهذا هو الفرق بين «٣٠ يوماً حُذفت بعد تصدير»
--   و«٢٩ يوماً حُذفت ويوم أُبيد بلا نسخة».
create or replace function public.map_visits_purge_guard(
  p_cutoff date,
  p_keep_days int default 30
) returns table (
  placeday date,
  visits bigint,
  days_old int,
  exported boolean,
  can_purge boolean,
  reason text
)
language plpgsql stable security definer set search_path = public, app as $$
declare v_cut date := coalesce(p_cutoff, (current_date - greatest(1, coalesce(p_keep_days, 30))));
begin
  if auth.uid() is null or not coalesce(app.has_role(array['it_admin','super_admin']), false) then
    raise exception 'RETENTION_FORBIDDEN: لا تملك صلاحية فحص حذف الزيارات' using errcode = 'insufficient_privilege';
  end if;

  return query
  with days as (
    select v.placeday, count(*)::bigint as visits
      from public.map_visits v
     where v.placeday < v_cut
     group by v.placeday
  ),
  -- «صُدِّر» تعني: طلب احتفاظ على map_visits، حالته done/deleting، **قاطعه
  -- بعد اليوم**، وله بصمة أو عدد صفوف مطابق.
  --
  -- ⚠ `e.cutoff > d.placeday` لا `>=`: المحرك يحذف `time_column < cutoff`.
  --    فطلب بقاطع ٢ أكتوبر يحذف زيارات ١ أكتوبر وما قبلها، **ولا يحذف**
  --    زيارات ٢ أكتوبر. لو استخدمنا `>=` لعُدّ يوم ٢ أكتوبر مُصدَّراً وهو
  --    لم يُصدَّر — أي أننا نأذن بحذف يوم بلا نسخة. هذا هو العطب الذي
  --    اكتشفه اختبار المحرك، والشرط الصحيح `>`.
  exports as (
    select r.id, r.cutoff, r.rows_exported, r.rows_deleted, r.export_sha256, r.status
      from public.data_retention_requests r
     where r.data_key = 'map_visits'
       and r.status in ('done', 'deleting')
  )
  select d.placeday, d.visits,
         (current_date - d.placeday)::int as days_old,
         exists (select 1 from exports e where e.cutoff > d.placeday) as exported,
         exists (
           select 1 from exports e
            where e.cutoff > d.placeday
              and (e.export_sha256 is not null or e.rows_exported > 0)
         ) as can_purge,
         case
           when not exists (select 1 from exports e where e.cutoff > d.placeday)
             then 'لا طلب تصدير يغطي هذا اليوم — الحذف ممنوع'
           when not exists (
             select 1 from exports e
              where e.cutoff > d.placeday
                and (e.export_sha256 is not null or e.rows_exported > 0)
           ) then 'طلب تصدير بلا بصمة أو عدد صفوف — الإثبات ناقص'
           else 'جاهز للحذف — التصدير مُثبت'
         end as reason
    from days d
   order by d.placeday;
end $$;

comment on function public.map_visits_purge_guard(date,int) is
  'لكل يوم زيارات أقدم من القاطع: هل يُجاز حذفه؟ يُعدّ اليوم مُصدَّراً فقط إذا وُجد طلب احتفاظ قاطعه **بعد** اليوم (لأن المحرك يحذف < cutoff) وله بصمة أو عدد صفوف. يوم بلا إثبات يبقى محظوراً. لا تحذف — تُبلّغ فقط.';

revoke all on function public.map_visits_purge_guard(date,int) from public, anon;
grant execute on function public.map_visits_purge_guard(date,int) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ④ إثبات أن محرك الاحتفاظ يستطيع العمل على الزيارات فعلاً — لا مجرد تعريف
-- ───────────────────────────────────────────────────────────────────────────────────────
-- يُنفَّذ مرة عند الترحيل: العدّ بقاطع قديم جداً يجب أن ينجح ويُرجع صفراً،
-- والحذف بقاطع ١٩٠٠ يجب أن يحذف صفراً. أي خطأ هنا يعني أن `map_visits` غير
-- قابلة للحذف العام رغم أنها `deletable=true` — وهذا يُكتشف في الإنتاج
-- بعد فوات الأوان. الفحص هنا مع اختبار `A7` في tests/db يمنعان ذلك.
do $$
declare t bigint; l bigint; n bigint;
begin
  begin
    select * into t, l from app.data_retention_count('map_visits', '1900-01-01'::timestamptz);
    if t is null or l is null then
      raise notice 'map_visits: العدّ بلا نتيجة — تحقّق من app.data_retention_count';
    else
      raise notice 'map_visits: العدّ يعمل (total=%, locked=%)', t, l;
    end if;
    n := app.data_retention_delete_some('map_visits', '1900-01-01'::timestamptz, 10);
    raise notice 'map_visits: الحذف بقاطع ١٩٠٠ حذف % صفاً (المتوقع ٠)', n;
  exception when others then
    raise notice 'map_visits: تعذّر الفحص — %', sqlerrm;
  end;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ⑤ كتالوج مصادر الأرشيف البارد: جدول التقارير مصدر لا ملف
-- ───────────────────────────────────────────────────────────────────────────────────────
-- الأرشيف البارد يعمل على **ملفات Storage**. تقارير الخريطة ملفات فعلية، فتُضاف
-- كمصدر حتى لا تتراكم بلا حد: تقرير ٣٠ يوماً ≈ ١٩ م.ب، وتصدير يوميّ = ٧ غ.ب/سنة.
-- **لكن** `map_report_files` سجل إثبات: ملفه لا يُحذف بأي سياسة تلقائية. إضافته
-- إلى `cold_archive_source_catalog` بمعنى «يُحسب في المساحة، ويُذكر في التقرير»
-- لا بمعنى «يُحذف». `default_enabled = false` + `sensitive = true` يمنعانه.
--
-- ⚠ لم أستطع تعديل `app.cold_archive_source_catalog()` من هنا بأمان لأنها
-- `immutable` وتُقرأ في أماكن متعددة بافتراض عدد صفوف. أُسجّل الطلب صريحاً
-- في تعليق على الكتالوج بدل تعديل صامت يكسر تقارير المساحة.
comment on function app.cold_archive_source_catalog() is
  'مصادر الأرشيف البارد (ملفات Storage). الملفات التي تنتجها المنصة نفسها — تقارير الخريطة في bucket map-reports — غير مُدرجة هنا عمداً: جدول map_report_files سجل إثبات رسمي، وملفاته لا تُحذف بأي سياسة تلقائية. تُحسب مساحتها في تقارير bucket لا في حزم الأرشيف.';
