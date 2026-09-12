# إعداد المجدول الخادمي الآمن لـ GPS وWeb Push

لا تُحفظ قيمة `service_role` في migration أو الواجهة. ينفذ هذا الإعداد مرة واحدة من SQL Editor في مشروع Supabase بعد وضع القيمتين داخل Vault.

## 1. تفعيل الامتدادات

فعّل `pg_cron` و`pg_net` من Database → Extensions.

## 2. حفظ الأسرار في Vault

أنشئ السرّين التاليين من Dashboard → Vault:

- `project_url`: رابط المشروع مثل `https://PROJECT_REF.supabase.co`.
- `edge_service_role`: مفتاح service-role. لا تستخدم anon key ولا تضع القيمة في المستودع.

## 3. إنشاء الجدولين

نفذ SQL التالي. لا يحتوي SQL نفسه على مفاتيح:

```sql
select cron.unschedule(jobid) from cron.job where jobname in ('lvn-gps-incremental-minute','notification-push-minute');

select cron.schedule(
  'lvn-gps-incremental-minute',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/lvn-gps-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='edge_service_role')
    ),
    body := '{"action":"incremental"}'::jsonb,
    timeout_milliseconds := 50000
  );
  $job$
);

select cron.schedule(
  'notification-push-minute',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/notification-push-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='edge_service_role')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
  $job$
);
```

## 4. التحقق

- افتح غرفة GPS → سلامة التكامل → تشخيص المجدول الخادمي.
- يجب أن يصبح تحديث GPS سليماً خلال ثلاث دقائق.
- يجب ألا تبقى رسائل Push مستحقة أكثر من ثلاث دقائق أو قيد المعالجة أكثر من خمس دقائق.
- راجع `cron.job_run_details` و`net._http_response` عند استمرار اللون الأصفر.

وظيفة التشخيص `gps_scheduler_health()` لا تعرض Vault أو الرموز السرية؛ تعرض الأعمار والعدادات التشغيلية فقط.
