# منظومة البصمة — المصادر القابلة للتوصيل (00139)

## الفصل المعتمد
| الجانب | البوابة | المسار | المحتوى |
|---|---|---|---|
| **التقني** | التطوير المركزية | `/it/integrations/biometric` | تسجيل المصادر بأنماطها، التهيئة (رابط/مفتاح/خريطة حقول)، اختبار الاتصال، «اسحب الآن»، معالجة دفعات ADMS، سجل العمليات |
| **البيانات** | الموارد البشرية | `/hr/biometric` | دفتر البصمات الموحّد، غير المطابَقين، ربط PIN بموظف، اشتقاق الحضور اليومي |

## الأنماط الأربعة (تعمل معاً في آن واحد)
| النمط | `mode` | الاتجاه | متى |
|---|---|---|---|
| جهاز ZKTeco دفع | `adms_push` | الجهاز → المنصة | الجهاز مهيأ بـ Cloud Server URL = `…/functions/v1/adms-receiver` |
| API تطبيق مشترك | `app_api_pull` | المنصة → API المزود | **المرحلة الحالية (مؤقت)** |
| شبكة داخلية | `lan_pull` | المنصة → الجهاز/الخدمة داخلياً | يتطلب وصول الخادم للعنوان الداخلي (VPN/نفق) |
| عام | `generic_pull` | المنصة → أي JSON | خريطة حقول + مسار المصفوفة |

## عقد `app_api_pull` (يلتزم به التطبيق المزود)
```
GET {base_url}{path}?from=<ISO>&to=<ISO>
Headers: X-API-Key: <api_key>      (أو Authorization: Bearer …)
200 → { "records": [ { "pin": "7001", "at": "2026-09-20T08:02:00+03:00",
                       "direction": "in|out|0|1|…", "name": "اختياري", "device_serial": "اختياري" } ] }
```
- تُقبل أيضاً مصفوفة مباشرة أو المفاتيح `data/items/logs/result`؛ وأسماء بديلة للحقول
  (`employee_number/user_id/badge` للـ PIN، `timestamp/punched_at/time` للوقت، `type/status/punch` للاتجاه).
- الأوقات بلا منطقة تُفسَّر بـ `timezone_offset` المهيأ (مثل `+03:00`)، وإلا UTC. epoch ثوانٍ/ملّي مقبول.
- الاتجاه: `0/in/check-in/دخول/حضور` = دخول، `1/out/check-out/خروج/انصراف` = خروج، غير ذلك = غير محدد
  (قابل للتخصيص عبر `in_values/out_values`).

## عقد `lan_pull`
- JSON بنمط ZKTeco: `{ data: [ { user_id|uid|pin, timestamp|checktime, punch|status|checktype, sn } ] }`
- أو نص ATTLOG خام: `PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>status<TAB>verify` سطر لكل بصمة (المشوّه يُتجاوَز).
- اعتماد Basic (`basic_user/basic_pass`) أو مفتاح في ترويسة.

## مسار البيانات
```
مصدر → (Edge biometric-pull | adms-receiver) → biometric_import_punches / biometric_ingest
     → biometric_punches (unique: جهاز+PIN+وقت+اتجاه ⇒ لا تكرار أبداً)
     → مطابقة: employees.biometric_pin أولاً ثم employee_number
     → HR: biometric_attendance_derive(يوم) → attendance_records (دمج محروس، idempotent)
```

## الأخطاء المرمّزة (تُترجم في الواجهة)
`BIO_FORBIDDEN · BIO_DEVICE_NOT_FOUND · BIO_DEVICE_INACTIVE · BIO_MODE_NOT_PULLABLE · BIO_CONFIG_BASE_URL ·
BIO_CONFIG_MAPPING · BIO_WINDOW_INVALID · BIO_WINDOW_TOO_LARGE · BIO_SOURCE_UNREACHABLE · BIO_SOURCE_UNAUTHORIZED ·
BIO_SOURCE_HTTP · BIO_RESPONSE_SHAPE · BIO_RECORD_PIN · BIO_RECORD_TIME · BIO_IMPORT_INVALID · BIO_PIN_TAKEN ·
BIO_PIN_INVALID · BIO_EMPLOYEE_NOT_FOUND · BIO_DATE_INVALID`

## النشر
1. `supabase db push` (00139)
2. `supabase functions deploy biometric-pull` — يحتاج `SUPABASE_ANON_KEY` ضمن أسرار الدوال (متوفر افتراضياً).
3. في بوابة التطوير المركزية: سجّل مصدر `app_api_pull` برابط المزود ومفتاحه → «اختبار الاتصال» → «اسحب الآن».

## الاختبارات
- SQL: `supabase/tests/hr_biometric_sources.sql` (11 كتلة: الأنماط، الاستيراد، التكرار، ADMS، المطابقة، الربط، الاشتقاق، السجل، الصلاحيات).
- Vitest: `biometric-providers` 18 · `BiometricPage` 14 · `BiometricLedger` 6 · `biometric.sdk` 6 · `hr-units` 4.
