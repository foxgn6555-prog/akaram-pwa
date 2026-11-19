# النشر والبيئات

## البيئات
| البيئة | الفرع | قاعدة البيانات | ملاحظات |
|--------|-------|----------------|---------|
| Development | محلي | `supabase start` (54321) | بذور 04_test_employees |
| Staging | `develop` | مشروع Supabase منفصل | بيانات شبه حقيقية ملقّحة |
| Production | `main` | مشروع Supabase إنتاجي | نسخ احتياطي يومي PITR |

## خطوات النشر
1. **الإنتاج — لا `db push`.** الترحيلة تُطبَّق بمراجعة: SQL الملف يُنفَّذ على الإنتاج، ثم يُسجَّل صفّه في `supabase_migrations.schema_migrations` (INSERT فقط). `scripts/db-push.mjs` يرفض الإنتاج إلا بعلم `--allow-production` صريح. أما التجربة/المحلي فـ`supabase link --project-ref <staging>` ثم `supabase db push`.
2. فعّل `custom_access_token_hook` من لوحة Auth (انظر تعليق config.toml).
3. فعّل MFA لـ super_admin + سياسة كلمات المرور من لوحة Auth.
4. اضبط `VITE_*` في GitHub Environment المقابل → push للفرع يشغّل CD. يشمل ذلك `VITE_VAPID_PUBLIC_KEY` (المفتاح العام فقط) في الإنتاج/التجربة؛ يفحصه `npm run env:check` قبل البناء. المفتاح الخاص `VAPID_PRIVATE_KEY` يبقى في Supabase Edge Function Secrets ولا يبدأ بـ `VITE_`.
5. بعد أول إصدار: تحقق من Sentry + اختبار دخول كل بوابة يدوياً (قائمة docs/onboarding.md).

## قواعد
- `main` محمي: PR + مراجعة + CI أخضر فقط.
- migration مدموج = لا يُعدَّل أبداً؛ أصلحه بـ migration جديد.

## سجل الترحيلات والانحراف (drift)
بعض الترحيلات طُبّقت على الإنتاج مرة بمعرّف طابع زمني مولّد، فنظيرها في المستودع يحمل اسماً آخر
(00405–00408 · 20261113160000 · 20261115120000/130000 · 20261117120000–170000). النتيجة: `db push`
يعدّها «غير مطبَّقة» ويعيد تنفيذها — وأخطرها `20261117160000_permission_catalog_disbursements`
الذي يبدأ بـ`delete from permission_write_bindings` فيمحو روابط الصلاحيات كلها.

- **الحالة الحالية:** سُجّلت المعرّفات المحلية الـ13 في السجل (2026-11-19)، فلا شيء قابل لإعادة التنفيذ.
- **الفحص قبل أي دفع:** `npm run check:migrations` (بلا قاعدة بيانات؛ يقارن الملفات بلقطة `docs/migration-history.json`).
  وهو مدمج إلزامياً في بداية `npm run db:push`.
- **تحديث اللقطة** بعد أي ترحيلة جديدة: نفّذ `scripts/migration-history-snapshot.sql` على الإنتاج (قراءة فقط)
  وضع النسخ في `docs/migration-history.json`، ثم أعد الفحص.
- **قاعدة ثابتة:** ترحيلة مدموجة لا تُعدَّل ولا تُعاد؛ أي إصلاح جديد = ملف جديد. والملفات التي تعتمد على
  «ترقيع بالمرساة» (anchor patch) مقبولة ومسجَّلة، مثل `20261118130000` و`20261119120000`.
