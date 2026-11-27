-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 20261202000300 · تصفير لمرة واحدة — بداية نظيفة لخطّ يعمل (المرحلة ③)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ─── لماذا التصفير، ولماذا لا يمكن تجنّبه ──────────────────────────────────────────────────
-- كل ما في `map_visits` اليوم (516 زيارة بين 9 و25 نوفمبر) نتج عن محرّكات معطوبة:
--   · حذف بنطاق اليوم بدل نطاق النافذة ⇒ بناء الشفت المسائي محا زيارات الصباح
--   · طابور السحب اليدوي كان يبني **زوناً واحداً فقط** من الثمانية
--   · الشهادة كانت تُمنح لأيام بلا نقاط (٢٠ نوفمبر: صفر نقاط، صفر زيارات، شهادة true)
-- فلا صفّ واحد فيها قابل للتحقق، ولا يمكن الجزم بأي رقم يخرج منها.
--
-- ─── القاعدة المطبَّقة، بالحرف ─────────────────────────────────────────────────────────────
--   ① تُحذف **كل** الزيارات: لا صفّ موثوق فيها.
--   ② تُحذف نقاط GPS التي تجاوزت نافذة الاحتفاظ (٣٦ ساعة) — وهي التي كان يجب أن يحذفها
--      التفريغ الآلي ولم يستطع، لأن الشهادة لم تُمنح يوماً واحداً. فالتصفير هنا ينفّذ
--      ما كانت السياسة ستفعله لو عملت.
--   ③ **النقاط الأحدث من ٣٦ ساعة تبقى كما هي** — هي المادة التي يبني منها العامل
--      زيارات الأيام الأخيرة فور تشغيله.
--   ④ يُصفَّر سجل الشهادة كاملاً: كل صفّ فيه شهادة من محرّك لم يعد موجوداً.
--
-- ─── النتيجة بعد هذا الترحيل ──────────────────────────────────────────────────────────────
-- قاعدة تحمل فقط: نقاط آخر ٣٦ ساعة + صفر زيارة + صفر شهادة.
-- ثم يعمل الخطّ وحده بلا تدخّل:
--     كل دقيقة  →  العامل يبني الشفتات الناقصة
--     كل ساعة   →  التفريغ يحذف ما تجاوز ٣٦ ساعة **بعد** أن يُشهَّد يومه
--     كل يوم    →  حذف الزيارات الأقدم من ٣١ يوماً
--
-- ─── ما يُفقد نهائياً ─────────────────────────────────────────────────────────────────────
-- 516 زيارة و153,068 نقطة قديمة. لا مخرَج تقني يحفظها: محرّكها كان خاطئاً، ونقاط
-- معظمها (أيام ٩ و٢٢ نوفمبر، 104 آلاف نقطة) أقدم من أي نافذة بناء معقولة —
-- إعادة بنائها تحتاج ٣٧ دقيقة للزون الواحد وتُنتج زيارات لا يطلبها أحد.
-- النسخة الاحتياطية اليومية في Supabase هي المرجع لو احتِيجت لاحقاً.
--
-- التراجع: لا يوجد — الحذف نهائي.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_visits_before   bigint;
  v_points_before   bigint;
  v_points_kept     bigint;
  v_points_deleted  bigint;
  v_oldest_kept     timestamptz;
  v_cutoff          timestamptz;
  v_keep_hours      int;
begin
  select coalesce(keep_hours, 36) into v_keep_hours from public.gps_history_purge_settings where id = 1;
  v_keep_hours := coalesce(v_keep_hours, 36);
  v_cutoff := now() - make_interval(hours => v_keep_hours);

  select count(*) into v_visits_before from public.map_visits;
  select count(*) into v_points_before from public.gps_device_position_history;

  -- ① كل الزيارات
  delete from public.map_visits;

  -- ② النقاط خارج نافذة الاحتفاظ فقط
  delete from public.gps_device_position_history h where h.fix_time < v_cutoff;

  -- ④ سجل الشهادة
  delete from public.gps_visit_builds;

  select count(*), min(fix_time) into v_points_kept, v_oldest_kept
    from public.gps_device_position_history;
  v_points_deleted := v_points_before - v_points_kept;

  -- ③ إثبات أن النقاط الحديثة لم تُمسّ
  if v_points_kept = 0 then
    raise exception 'VISIT_RESET_WOULD_EMPTY_FEED: التصفير كان سيحذف كل النقاط — أوقف نفسه. '
                    'الاحتفاظ % ساعة والحدّ % . راجع تدفّق السحب أولاً.', v_keep_hours, v_cutoff;
  end if;
  if v_oldest_kept < v_cutoff then
    raise exception 'VISIT_RESET_KEPT_TOO_OLD: بقي نقطة أقدم من الحدّ (%) — غير متوقّع', v_oldest_kept;
  end if;

  perform app.data_retention_log(null, 'map_visits', 'one_time_reset_pipeline',
    jsonb_build_object(
      'visits_deleted', v_visits_before,
      'points_before', v_points_before,
      'points_deleted', v_points_deleted,
      'points_kept', v_points_kept,
      'keep_hours', v_keep_hours,
      'cutoff', v_cutoff,
      'oldest_kept', v_oldest_kept,
      'rule', 'حُذفت كل الزيارات وكل النقاط خارج نافذة الاحتفاظ؛ بقيت نقاط النافذة ليبنيها العامل.'));
end $$;

comment on table public.gps_visit_builds is
  'سجل بناء الزيارات لكل (زون × يوم × شفت). built/empty شرط إلزامي قبل حذف نقاط اليوم — لا حذف على الثقة. صُفِّر في 20261202000300 مع استبدال المحرّك، ويُعاد بناؤه آلياً.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- إغلاق الطوابير الميتة — لا تُحذف صفوفها (سجل تدقيق)
-- ───────────────────────────────────────────────────────────────────────────────────────────
update app.visit_build_queue
   set status = 'superseded', finished_at = coalesce(finished_at, clock_timestamp())
 where status in ('pending', 'processing');

update app.manual_pull_visit_queue
   set status = 'superseded', finished_at = coalesce(finished_at, clock_timestamp())
 where status in ('pending', 'processing');

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- تصفير عدّادات التفريغ لتعكس الوضع الجديد
-- ───────────────────────────────────────────────────────────────────────────────────────────
update public.gps_history_purge_settings
   set last_rows = 0,
       last_skipped = '[]'::jsonb,
       last_skipped_rows = 0,
       last_error = null,
       updated_at = now()
 where id = 1;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- إثبات الحالة النهائية — يفشل الترحيل إن لم تتحقق
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_visits bigint;
  v_ledger bigint;
  v_points bigint;
  v_hours  int;
begin
  select count(*) into v_visits from public.map_visits;
  if v_visits <> 0 then
    raise exception 'VISIT_RESET_INCOMPLETE: بقي % زيارة', v_visits;
  end if;

  select count(*) into v_ledger from public.gps_visit_builds;
  if v_ledger <> 0 then
    raise exception 'VISIT_LEDGER_RESET_INCOMPLETE: بقي % صفّ في سجل البناء', v_ledger;
  end if;

  select count(*) into v_points from public.gps_device_position_history;
  if v_points = 0 then
    raise exception 'VISIT_RESET_NO_FEED: الجدول خالٍ تماماً — تدفّق السحب متوقف، أصلحه قبل التصفير';
  end if;

  select keep_hours into v_hours from public.gps_history_purge_settings where id = 1;
  if v_hours <> 36 then
    raise exception 'PURGE_WINDOW_NOT_36H: الاحتفاظ % ساعة والمطلوب ٣٦', v_hours;
  end if;
end $$;
