-- 20261121003000 — جدولة تنظيف الجلسات الميتة (الجولة ٣-د)
--
-- تُشغّل app.purge_stale_sessions(7) كل يوم ٠٣:٠٠ (توقيت الخادم UTC) عبر pg_cron.
-- الحماية: إن لم يكن pg_cron مثبّتاً (بيئات محلية/اختبار) تُتجاهل الجدولة بلا فشل.
-- التراجع: select cron.unschedule('purge_stale_sessions');

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'PURGE_CRON_SKIP: pg_cron غير متاح في هذه البيئة';
    return;
  end if;
  -- idempotent: cron.schedule باسم موجود يُحدّث الجدولة بدل تكرارها
  execute $q$select cron.schedule('purge_stale_sessions', '0 3 * * *', 'select app.purge_stale_sessions(7)')$q$;
  raise notice 'PURGE_CRON_OK: purge_stale_sessions @ 03:00 UTC';
end $cron$;
