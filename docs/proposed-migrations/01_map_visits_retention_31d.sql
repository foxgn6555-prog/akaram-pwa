-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 01_map_visits_retention_31d — حفظ الزيارات ٣١ يوماً، والتصدير لم يعد إلزامياً (الدورة⑥ — مقترح)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- مقترح للدورة⑥: لا يُطبّق على الإنتاج قبل مراجعة المالك والموافقة الصريحة.
-- يغيّر معاملة `map_visits` في كتالوج الاحتفاظ من «٣٠ يوماً + تصدير إلزامي»
-- إلى «٣١ يوماً + تصدير غير إلزامي (export_required = false)».
--
-- المنطق: الزيارات تُعاد بناؤها من نقاط GPS المسجّلة (سجل البناء gps_visit_builds
-- وشهادة gps_day_is_certified)، فهي قابلة لإعادة الإنشاء من مصدرها ⇒ لا حاجة
-- لإجبار التصدير قبل الحذف، ويُمدد نافذة الاحتفاظ إلى ٣١ يوماً بدلاً من ٣٠ لتغطية
-- نهاية الشهر بكاملها.
--
-- يُطبّق على ترحيلات 20261128000100 و 20261128000400 القائمة، ويتبع نمط إعادة
-- التعريف (rename → union) المستخدم فيهما، ولا يُمسّ أي ترحيل مطبق مسبقاً. يُنفّذ
-- حاجز اكتمال الكتالوج في النهاية.
--
-- التراجع: إعادة تعريف الكتالوج إلى النسخة السابقة وإرجاع p_keep_days إلى ٣٠.

-- ─────────────────────────────────────────────────────────────────────────────
-- ① الكتالوج: صف map_visits — export_required true → false، المدة ٣١ يوماً
--    تُتبع هذه الدالة نمط 20261128000100/20261128000400: إعادة تسمية النسخة
--    الحالية ثم إعادة تعريفها كـ union على النسخة السابقة مع صف map_visits المحدث
--    (يُستبعد الصف القديم بـ data_key <> 'map_visits' ويُضاف الصف الجديد).
-- ─────────────────────────────────────────────────────────────────────────────
alter function app.data_retention_catalog() rename to data_retention_catalog_pre_retention_31d;

create function app.data_retention_catalog()
returns table (data_key text, portal_key text, label text, description text, table_name text, time_column text,
               keep_where text, safety_lock text, deletable boolean, default_months int, default_export_required boolean)
language sql immutable as $$
  select * from app.data_retention_catalog_pre_retention_31d() where data_key <> 'map_visits'
  union all
  values
    -- ★ التعديل المقترح: المدة ٣١ يوماً، والتصدير قبل الحذف لم يعد إلزامياً
    --   (كان في 20261128000100: default_months = 1، default_export_required = true)
    ('map_visits', 'ops', 'زيارات الأزقة والشوارع',
     'صفّ لكل دخول آلية لزقاق أو شارع: وقت الدخول والخروج والمكوث. مصدر كل تقارير التغطية والتقرير المعتمد.',
     'map_visits', 'entered_at', null,
     'تُحذف الزيارة فقط بعد بلوغ placeday ٣١ يوماً؛ التصدير قبل الحذف لم يعد إلزامياً لأن الزيارات تُعاد بناؤها من نقاط GPS المسجّلة في gps_visit_builds (سجل البناء مع شهادة اليوم).',
     true, 1, false)
$$;

revoke all on function app.data_retention_catalog() from public, anon;
grant execute on function app.data_retention_catalog() to authenticated;

comment on function app.data_retention_catalog() is
  'كتالوج الاحتفاظ. 01_map_visits_retention_31d (مقترح الجولة⑥): map_visits ٣١ يوماً، export_required = false.';


-- ─────────────────────────────────────────────────────────────────────────────
-- ② حارس الحذف: المهلة الافتراضية ٣٠ → ٣١ يوماً (map_visits_purge_guard.p_keep_days)
--    وهذا هو المعامل الذي يُستخدم عند تقدير «هل بلغ الزيارة عمر الحذف؟».
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.map_visits_purge_guard(
  p_cutoff date,
  p_keep_days int default 31
) returns table (
  placeday date,
  visits bigint,
  days_old int,
  exported boolean,
  can_purge boolean,
  reason text
)
language plpgsql stable security definer set search_path = public, app as $$
declare v_cut date := coalesce(p_cutoff, (current_date - greatest(1, coalesce(p_keep_days, 31))));
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
  'لكل يوم زيارات أقدم من القاطع: هل يُجاز حذفه؟ يُعدّ اليوم مُصدَّراً فقط إذا وُجد طلب احتفاظ قاطعه **بعد** اليوم (لأن المحرك يحذف < cutoff) وله بصمة أو عدد صفوف. يوم بلا إثبات يبقى محظوراً. لا تحذف — تُبلّغ فقط. 01_map_visits_retention_31d: المهلة الافتراضية ٣١ يوماً.';

revoke all on function public.map_visits_purge_guard(date,int) from public, anon;
grant execute on function public.map_visits_purge_guard(date,int) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- ③ حاجز اكتمال الكتالوج: التأكد من عدم وجود جدول جديد بلا تعريف
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin perform app.require_retention_catalog_complete(); end $$;
