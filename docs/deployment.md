# النشر والبيئات

## البيئات
| البيئة | الفرع | قاعدة البيانات | ملاحظات |
|--------|-------|----------------|---------|
| Development | محلي | `supabase start` (54321) | بذور 04_test_employees |
| Staging | `develop` | مشروع Supabase منفصل | بيانات شبه حقيقية ملقّحة |
| Production | `main` | مشروع Supabase إنتاجي | نسخ احتياطي يومي PITR |

## خطوات النشر
1. `supabase link --project-ref <staging|prod>` ثم `supabase db push` (المهاجرات بالترتيب).
2. فعّل `custom_access_token_hook` من لوحة Auth (انظر تعليق config.toml).
3. فعّل MFA لـ super_admin + سياسة كلمات المرور من لوحة Auth.
4. اضبط `VITE_*` في GitHub Environment المقابل → push للفرع يشغّل CD.
5. بعد أول إصدار: تحقق من Sentry + اختبار دخول كل بوابة يدوياً (قائمة docs/onboarding.md).

## قواعد
- `main` محمي: PR + مراجعة + CI أخضر فقط.
- migration مدموج = لا يُعدَّل أبداً؛ أصلحه بـ migration جديد.
