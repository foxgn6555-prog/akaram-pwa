-- 00407 — إشعارات الهاتف (Push) لم تكن تُرسل إلا والتطبيق مفتوح
--
-- العيب (مؤكَّد بالقياس على قاعدة الإنتاج 2026-11-12):
--   · notification_push_subscriptions = 0 · notification_push_deliveries = 0 · ولا سطر إرسال واحد منذ إنشاء النظام.
--   · لا توجد أي مهمة pg_cron تنادي notification-push-dispatch.
--   · الدالة تُستدعى من المتصفح فقط (scope = self) عند وصول إشعار **والتطبيق مفتوح**،
--     وdoc/WEB_PUSH_SETUP_AR.md نفسه يطلب في الخطوة ٥ «جدولة الاستدعاء كل دقيقة» — ولم يُنفَّذ.
--   ⇒ من هو خارج النظام لا يصله شيء، وهو عكس الغرض من Push.
--
-- الإصلاح: مهمة كل دقيقة تنادي الدالة بمفتاح الخدمة (scope = all) فتوزّع كل الطوابير،
--          بنفس نمط المهمتين القائمتين gps-warehouse-pull-minute وgps-warehouse-hotspots-nightly.
--
-- أمان:
--   · مفتاح الخدمة يُقرأ من vault.decrypted_secrets (لا يُكتب في جدول nor في الواجهة).
--   · الدالة ترفض أي توكن غير توكن الخدمة أو مستخدم موثّق، ونطاق «الكل» لا يُمنح إلا للخدمة.
--   · التصعيدات التي تنفّذها الدالة idempotent (dedupe_key + on conflict do nothing) فلا تكرار كل دقيقة.
--   · عند غياب أي طابور معلّق تكون الدالة خفيفة (استعلامان + صفر إرسال).

select cron.unschedule('notification-push-dispatch-minute')
where exists (select 1 from cron.job where jobname = 'notification-push-dispatch-minute');

select cron.schedule(
  'notification-push-dispatch-minute',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notification-push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_service_role')
    ),
    body := '{"scope":"all"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
