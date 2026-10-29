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

## الجولة 00381 — محرّك السحب
- طبّق `supabase/migrations/0002_pull_engine.sql` على المشروع الثاني (SQL Editor أو `db push --workdir gps-warehouse`).
- المجدول في المشروع الأول (`00325`) يستدعي `gps-warehouse` بـ `{"action":"pull"}` كل دقيقة عبر Vault (`project_url` / `edge_service_role`) — إن لم تكن أسرار Vault موجودة فطبّق `docs/GPS_PUSH_SCHEDULER_SETUP_AR.md` ثم أعد `db push`.
- كل دورة: 3 مهام (جهاز × يوم) على قطع 3 ساعات من LVN، إدخال في `wh_raw_points`، حساب توقفات اليوم فوراً في `wh_stops`، أرشفة الأيام المنجزة مضغوطة في دلو `gps-archive`، وحذف الخام الأقدم من 3 أيام.
- الأرشيف: `YYYY/MM/YYYY-MM-DD/<device>.json.gz` — `{v, device, day, cols:[epoch,lat,lng,speed,course], points:[[...]]}`.

## الاختبار محلياً
```
rm -rf /tmp/epgdata; MIGRATIONS_DIR=gps-warehouse/supabase/migrations node scripts/db-migrations-test.mjs tests/db-warehouse/pull-engine-test.sql
```
