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

## المنطقة الزمنية (00140) — حرج
- أجهزة ZKTeco ترسل الوقت **المحلي بلا منطقة**؛ لكل جهاز `timezone_offset` (افتراضي `+03:00` بغداد) يحوّله إلى وقت صحيح.
- رد التسجيل يرسل للجهاز `TimeZone=3` المشتق من الحقل نفسه (كان `-3` = إزاحة 6 ساعات).
- فخ SQL مثبت بالاختبار: `at time zone '+03:00'` كنص = إشارة POSIX معكوسة؛ الصحيح `at time zone interval '+03:00'`.
- OPERLOG: أسماء المستخدمين من الجهاز تُحفظ في `biometric_device_users` وتظهر في دفتر HR بجانب PIN غير المطابَق وتُقترح في نموذج الربط.

## وكيل الشبكة الداخلية zk_bridge (00141)
- سحب مباشر حقيقي من الجهاز عبر المنفذ 4370 (node-zklib) من حاسوب داخل الجهة: `tools/zk-bridge/` (README هناك).
- مصادقة بمفتاح لكل جهاز `zkb_…` (RPC `biometric_bridge_rotate_key` لـ IT؛ يُخزَّن SHA-256 فقط، يُعرض مرة واحدة).
- Edge `biometric-bridge` (بلا JWT — `--no-verify-jwt`) → `biometric_bridge_authenticate_public` → `biometric_bridge_import_public` (service_role فقط).
- يرسل الوقت المحلي للجهاز؛ التحويل بمنطقة الجهاز في القاعدة. يرسل مستخدمي الجهاز أيضاً (أسماء).
- كل دفعة/فشل تُسجَّل في `biometric_pulls` بنمط `zk_bridge`؛ آخر اتصال/خطأ على `biometric_devices.bridge_*`.
- اختبارات: SQL `biometric_bridge.sql` (9 كتل) + Vitest `bridge-protocol` 16 (تطابق نسخة الوكيل مع Edge + دورة الوكيل بلا جهاز).

## النشر
1. `supabase db push` (00139 + 00140 + 00141)
2. `supabase functions deploy adms-receiver --no-verify-jwt` و`supabase functions deploy biometric-bridge --no-verify-jwt` (الجهاز/الوكيل لا يحملان JWT)
3. `supabase functions deploy biometric-pull` — يحتاج `SUPABASE_ANON_KEY` ضمن أسرار الدوال (متوفر افتراضياً).
4. في بوابة التطوير المركزية: سجّل مصدر `app_api_pull` برابط المزود ومفتاحه → «اختبار الاتصال» → «اسحب الآن».

## الاختبارات
- SQL: `hr_biometric_sources.sql` (11 كتلة) + `biometric_device_timezone.sql` (9 كتل: منطقة الجهاز/TAB/OPERLOG/منتصف الليل/الدفعات المتراكمة).
- Vitest: `biometric-providers` 18 · `adms-protocol` 11 · `BiometricPage` 16 · `BiometricLedger` 6 · `biometric.sdk` 6 · `hr-units` 4.
