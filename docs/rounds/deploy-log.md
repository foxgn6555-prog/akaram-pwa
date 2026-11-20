# سجل النشر إلى الإنتاج — الجولات ١–٨

**التاريخ:** 2026-11-20 · **المشروع:** `rzpitdsuwgprzfvrlkdn` · **الفرع:** `arena/0065458d-akaram-pwa` (من `0f16d60`)

## ① النطاق المعتمَد

وافق المستخدم على البنود ①–④ وبقاء البند ⑤ مطفأً:

| # | البند | الحالة |
|---|-------|--------|
| ① | دمج الفرع في `port-00134` | نُفِّذ عبر طلب دمج |
| ② | تطبيق الترحيلات التسعة على قاعدة الإنتاج | ✅ 9/9 مطبَّقة |
| ③ | نشر الدالة الحدّية `staff-login` | ✅ v13 → v14 |
| ④ | نشر الواجهة (تلقائي مع الدمج) | `.github/workflows/deploy.yml` |
| ⑤ | إبقاء فرض حد الجلسات مطفأً | ✅ `enforce_on = 0` |

الترتيب المنفَّذ: **قاعدة البيانات ← الدالة الحدّية ← الواجهة**، لأن أي دفع إلى `port-00134` ينشر الواجهة فوراً
(`deploy.yml` بلا مُرشِّح مسارات)، فلا يجوز أن تصل واجهة تستدعي دوالاً غير موجودة.

## ② الترحيلات التسعة — من الملف إلى نسخة الإنتاج

| # | ملف المستودع | نسخة `schema_migrations` | التحقق بعد التطبيق |
|---|--------------|--------------------------|--------------------|
| 1 | `20261120120000_session_security_core.sql` | `20261120171034 session_security_core_r1` | `security_events` · `account_session_policy` · `app.require_it_admin` · `security_events_list` موجودة |
| 2 | `20261120130000_sensitive_roles_policy.sql` | `20261120171251 sensitive_roles_policy_r1` | 9 أدوار (9 نشطة) · الحارس يقرأ الجدول · `app.set_user_role` مُرقَّع |
| 3 | `20261120140000_role_grants_it_only.sql` | `20261120171302 role_grants_it_only_r1` | شرط `hr_officer` أُزيل · مسار `app.role_grant_approved` باقٍ |
| 4 | `20261120150000_session_devices.sql` | `20261120171314 session_devices_r1` | 7 دوال جلسات موجودة وقواعد الوصول صحيحة |
| 5 | `20261120160000_sensitive_device_code.sql` | `20261120171328 sensitive_device_code_r1` | `device_switch_codes` + رموز الأجهزة الحساسة |
| 6 | `20261120170000_support_tickets.sql` | `20261120171341 support_tickets_r1` | الجدول فارغ (0) · الحاوية `support-attachments` · سياستان على `storage.objects` |
| 7 | `20261120180000_account_page_levels.sql` | `20261120171356 account_page_levels_r1` | `app.can` صار يحترم السقف (`app.level_permits`) |
| 8 | `20261120190000_security_timeline.sql` | `20261120171409 security_timeline_r1` | `it_security_timeline` + `it_security_overview` |
| 9 | `20261120200000_round8_hardening.sql` | `20261120171419 round8_hardening_r1` | الجداول الأربعة: `authenticated:SELECT` فقط · `anon` بلا قراءة |

الإجمالي بعد النشر: **433 ترحيلة** (424 قبلها + 9)، ولا نسخة مكرّرة.

### اكتشاف أثناء النشر — تعارض المرساة (أُصلح قبل التطبيق)

الترحيلة ② تُرقّع نص `app.set_user_role` بمرساة نصية. المرساة الأصلية كانت تضم سطر تعليق
(`-- V-36: …`) + سطر الشرط. قاعدة الإنتاج كانت قد طُبِّقت عليها الترحيلات السابقة بمسار **يجرّد
تعليقات SQL**، فنص الدالة في الإنتاج يخلو من سطر التعليق ⇒ المرساة تُطابق **صفر مرة** وترفع الاستثناء
`SENSITIVE_ROLES_PRECHECK: مرساة الترقيع غير موجودة مرة واحدة بالضبط`، فيُلغى التطبيق بالكامل.

- الإصلاح (التزام `84fb1f7`): المرساة صارت **سطر الشرط وحده** — وهو يظهر مرة واحدة بالضبط في النسختين
  (الإنتاج بلا تعليقات: `p_role_line_span = 80`، والمستودع بتعليقات).
- إثبات محلي: إعادة بناء كاملة `OK applied=420`، **ومحاكاة إنتاج** (دالة أُعيد إنشاؤها بلا تعليقات ثم
  تطبيق الترحيلات ② و③ مجرّدة التعليقات) نجحت، ثم 8/9 حزم DB ناجحة والحزمة التاسعة
  (`sensitive-role-approval`) بفشلها القائم سابقاً نفسه `GARAGE_UNAUTHENTICATED` المطابق للأساس `0f16d60`.

## ③ التحقق بعد التطبيق (قراءة فقط على الإنتاج)

**الحالة العامة**

| المقياس | القيمة |
|---------|--------|
| ترحيلات | 433 |
| صفوف `account_session_policy` | 0 · المفروضة (`enforce`) = **0** |
| `sensitive_roles` | 9 صفوف · 9 نشطة |
| `permission_units` | 241 (بلا تغيير) |
| `user_roles` | 54 (بلا تغيير — لم تُكتب أي بيانات) |
| `security_events` / `support_tickets` / `device_switch_codes` / `account_page_levels` | 0 / 0 / 0 / 0 |

**مصفوفة تنفيذ الدوال (27 دالة جديدة/مُعدَّلة)**

| الفئة | الدوال | `anon` | `authenticated` | `service_role` |
|-------|--------|--------|-----------------|----------------|
| ذاتية فقط | `my_sessions` · `session_end` · `session_end_others` · `device_switch_code_create` · `my_unit_levels` · `support_contact` · `support_ticket_create` | ✗ | ✓ | — |
| تقنية المعلومات فقط | `security_events_list` · `session_policy_get/set` · `admin_session_list/end` · `sensitive_roles_list` · `sensitive_role_set` · `support_tickets_list` · `support_ticket_decide` · `it_account_levels` · `it_account_level_set` · `it_account_level_clear` · `it_security_timeline` · `it_security_overview` | ✗ | ✓ (الحارس داخلي) | — |
| داخلية (بلا منح) | `session_gate_check` · `session_switch_apply` · `session_revoke_new` · `session_is_sensitive` · `device_switch_code_verify` · `security_event_record` | ✗ | ✗ | ✓ |

**الجداول** — RLS مفعّل على العشرة، والجداول الستة الجديدة بلا أي صلاحية لـ`anon`/`authenticated`،
والجداول الأربعة المُصلَّبة (`permission_audit`, `role_grant_requests`, `user_permission_overrides`,
`user_permission_template`) تحتفظ بـ`authenticated:SELECT` فقط — وهو ما تتوقعه الواجهة.

## ④ الدالة الحدّية `staff-login`

| البند | قبل | بعد |
|-------|-----|-----|
| النسخة | 13 | **14** |
| `verify_jwt` | false | false (بلا تغيير) |
| المصدر | لا يطابق المستودع | مطابق لـ`supabase/functions/staff-login/index.ts` |
| متغيّرات البيئة | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS` | لا حاجة لمفتاح جديد |

كل RPC تستدعيه الدالة منفَّذة لـ`service_role` (تحقّق صريح): `security_event_record`,
`login_guard_status/record_failure/record_success`, `session_gate_check`, `session_is_sensitive`,
`device_switch_code_verify`, `session_revoke_new`, `session_switch_apply`.

ملاحظة شفافية: في حمولة تطبيق الترحيلة ⑦ تكرّر تعريف `it_account_level_set` مرتين متطابقتين
(`create or replace` + منح مكرّر غير ضار). التعريفان متطابقان ونفس الملف في المستودع يحتوي نسخة واحدة،
والحالة النهائية في الإنتاج مطابقة للمستودع.

## ⑤ الواجهة

النشر يتم آلياً بدفع `port-00134` (`deploy.yml`: `npm ci` ← `env:check` ← `build` ← رفع فرع `deploy`).
لا يعمل هذا المسار على الفرع `arena/…`، ولا تُشغَّل `ci.yml`/`db-tests.yml` على `port-00134`.

## ⑥ التراجع (إن لزم)

| الطبقة | الخطوة |
|--------|--------|
| الواجهة | إعادة نشر بناء سابق من فرع `deploy` |
| الدالة الحدّية | إعادة نشر النسخة 13 |
| قاعدة البيانات | تراجع بترتيب عكسي ⑨→① (كلها إضافية) — الاستثناء ⑦ (`app.can`) يُعاد بإعادة تطبيق نص `00371` |
| البيانات | لا تراجع مطلوب: لم تُكتب أي بيانات تشغيلية في هذه العملية |

## ⑦ نقاط مراقبة بعد النشر

1. `enforce` يبقى `false` — أي تفعيل لاحق يمر بجولة مستقلة وموافقة صريحة.
2. أول دخول بعد النشر: `staff-login` v14 يسجّل في `security_events` (تسجيل غير حاجب: أي فشل في السجل لا يمنع الدخول).
3. `sensitive-role-approval` فشل محلي قائم سابقاً (غير مرتبط بهذه الجولة) — يحتاج جولة إصلاح مستقلة.
