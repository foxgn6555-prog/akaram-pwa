# مستودع GPS التحليلي — المشروع الثاني (00380)

مشروع Supabase منفصل يحمل **الجزء الثقيل فقط** من GPS: السحب الشهري الخام، محرّك التوقفات، البقع، والأرشيف المضغوط.
التشغيلي الحي ومسارات الانطلاقيات تبقى في المشروع الأول. المتصفح **لا يتصل** بهذا المشروع أبداً؛ الوصول حصراً من دالة الحافة
`gps-warehouse` في المشروع الأول بمفتاح الخدمة.

## الربط مرة واحدة (بالماوس)
1. **المشروع الثاني** → SQL Editor → الصق محتوى `supabase/migrations/0001_warehouse_schema.sql` → Run.
2. **المشروع الثاني** → Project Settings → API Keys → Secret keys → أنشئ مفتاحاً جديداً (لا تستخدم أي مفتاح سبق لصقه في محادثة أو رسالة).
3. **المشروع الأول** → Edge Functions → Secrets → أضف:
   - `GPS_WAREHOUSE_URL` = `https://<ref>.supabase.co` (رابط المشروع الثاني بلا `/rest/v1/`)
   - `GPS_WAREHOUSE_SERVICE_KEY` = المفتاح السرّي من الخطوة 2
4. بوابة IT → التكاملات → سلامة تكامل GPS → بطاقة «مستودع GPS التحليلي» → **فحص الاتصال** ثم **إرسال سجل الآليات**.

> بديل الخطوة 1 للجولات القادمة (اختياري): `npx supabase link --workdir gps-warehouse --project-ref <ref>` مرة واحدة، ثم `npx supabase db push --workdir gps-warehouse` مع كل جولة.

## الاختبار محلياً
```
rm -rf /tmp/epgdata; MIGRATIONS_DIR=gps-warehouse/supabase/migrations node scripts/db-migrations-test.mjs tests/db-warehouse/warehouse-schema-test.sql
```
