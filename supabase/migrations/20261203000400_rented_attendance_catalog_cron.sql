-- 20261203000400 · حضوريات الآليات المؤجرة — كتالوج الصلاحيات + المزامنة اليومية
--  ① وحدتان جديدتان:
--       ops-room.rented-attendance      «حضوريات الآليات المؤجرة» (غرفة العمليات) — إعدادات التفريغ + الكشف + الإرسال
--       finance.rented-salaries         «رواتب الآليات المؤجرة»   (المالية)        — تحديد الرواتب + الدفع
--  ② ربط دوال الكتابة بالوحدات (permission_write_bindings) — يُفرَض في قاعدة البيانات لا في الواجهة فقط.
--  ③ مهمة cron يومية 00:20Z = 03:20 بغداد: تزامن يوم الأمس فتصبح الحضوريات جاهزة قبل بداية العمل.
--
-- ملاحظة: وحدة «ضريبة الآليات المؤجرة» القائمة (deputy.rented-tax / 00251) تبقى كما هي؛
--         ضريبة الحضوريات هنا تعمل على مستوى الآلية وتُضبط من صفحة الحضوريات نفسها.
--
-- ⚠️ لا تُطبَّق على الإنتاج إلا بموافقة صريحة من المستخدم.

-- ── ① الوحدات وربط دوال الكتابة ─────────────────────────────────────────────
-- الوحدات تُزرع في الترحيل التالي (20261203000500) من المولّد الرسمي لكتالوج الصلاحيات،
-- كي يبقى اختبار العقد (tests/contract/permission-catalog.test.ts) صادقاً:
--   ops-room.rented-attendance · finance.rented-salaries · deputy.rented-vehicles
--
-- ⚠️ لا تُدرج الصفوف يدوياً هنا — أي انحراف عن المولّد يُفشل العقد.

-- ── ③ المزامنة اليومية ─────────────────────────────────────────────────────
-- تُشغَّل 00:20Z (= 03:20 بغداد) فتزامن يوم الأمس. آمنة للتكرار (idempotent).
create or replace function app.rented_attendance_daily_tick()
returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_yesterday date := ((now() at time zone 'Asia/Baghdad')::date - 1);
begin
  perform app.rented_attendance_sync_day(v_yesterday);
  -- ترميم الأمس البعيد: آخر 7 أيام (رخيص، ويغطي انقطاع cron)
  perform app.rented_attendance_sync_range(v_yesterday - 6, v_yesterday);
end$$;

revoke all on function app.rented_attendance_daily_tick() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'rented-attendance-daily';
    perform cron.schedule('rented-attendance-daily', '20 0 * * *',
                         $job$ select app.rented_attendance_daily_tick() $job$);
  else
    raise notice 'pg_cron غير متاح — المزامنة اليومية لحضوريات المؤجرة تتطلب تفعيله (المزامنة عند فتح الوحدة تعمل بلا cron)';
  end if;
end$$;
