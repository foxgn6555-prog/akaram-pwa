# الجولة ١ — أساس الجلسات والأحداث الأمنية

**التاريخ:** 2026-11-20 · **الفرع:** `arena/0065458d-akaram-pwa` (من `port-00134`)
**الحالة:** منفّذة ومختبرة محلياً — **لم تُدمج ولم تُنشر ولم تُطبَّق على قاعدة الإنتاج**.

---

## ١) الهدف

بناء **البنية التحتية** للمتطلبين ⑥ (عدد مستخدمي الحساب) و⑦ (إدارة الجلسات) بلا أي واجهة وبلا أي تغيير في سلوك الدخول الحالي.
السياسات **معطّلة افتراضياً** (`enforce = false`) ⇒ لا يُمنع أي مستخدم من الدخول اليوم.

---

## ٢) ما نُفّذ

| # | العنصر | التفصيل |
|---|---|---|
| ١ | `account_session_policy` | سياسة لكل حساب: `max_sessions` (1–10) · `enforce` · `note` · `updated_by` |
| ٢ | `security_events` | سجل أحداث: `login_success` `login_failed` `device_conflict` `limit_exceeded` `session_revoked` `switch_approved` `switch_denied` `policy_changed` — مع IP وUser-Agent و`session_id` وبصمة الجهاز المشفّرة، وأعمدة `country/city` فارغة (تُملأ في الجولة ٤) |
| ٣ | `app.session_policy_for` | يُعيد السياسة الفعلية (الافتراضي: جهاز واحد، بلا فرض) |
| ٤ | `app.session_active_count` | عدّ الجلسات النشطة من **`auth.sessions`** (GoTrue) — بلا سجل موازٍ |
| ٥ | `public.security_event_record` | الحاوية الوحيدة لخدمة الحافة (`service_role` فقط) — يستدعيها `staff-login` |
| ٦ | `session_policy_get` · `session_policy_set` · `session_policy_list` · `security_events_list` | دوال بوابة IT (بلا واجهة). الحراسة: `it_admin` صراحةً في الخادم + `PERMISSION_DENIED` بلا تفاصيل |
| ٧ | `staff-login` | تسجيل الأحداث الأمنية: نجاح الدخول (بمعرّف الجلسة من claim `session_id`) · بيانات خاطئة · قفل المصدر · تقييد Auth — **بلا أي حجب**، وأي فشل في التسجيل لا يُفشل الدخول |

---

## ٣) الملفات

| الملف | نوع التغيير |
|---|---|
| `supabase/migrations/20261120120000_session_security_core.sql` | **جديد** (ترحيل واحد) |
| `tests/db/session-security-core-test.sql` | **جديد** (اختبار محصّن begin/rollback) |
| `supabase/functions/staff-login/index.ts` | تعديل: +٣ دوال مساعدة + تسجيل الأحداث (لا تغيير في أي مسار إرجاع قائم) |
| `docs/rounds/round-01-session-core.md` | هذا التقرير |

**لم يُلمس:** لا جدول قائم، لا عمود قائم، لا دالة قائمة، لا الصلاحيات (`app.can`)، لا RLS قائمة، لا واجهة، لا ترحيل قائم.

---

## ٤) النتائج

### قاعدة البيانات — PostgreSQL 16 محلياً
- تطبيق **412 ترحيلاً** على قاعدة فارغة: ✅ نجح بالكامل (411 قائمة + الجديد).
- `tests/db/session-security-core-test.sql`: ✅ نجح — ٩ مجموعات فحص:
  A القيم الافتراضية · B رفض غير `it_admin` (حتى المدير المفوض) · C التحقق من المدخلات · D الحفظ وقيم قبل/بعد · E العودة إلى جهاز واحد · F القوائم وعدّ الجلسات · G سجل الأحداث · H حاوية `service_role` وقصّ الحقول · I منع القراءة المباشرة (RLS).

### الاختبارات العامة
| الفحص | النتيجة |
|---|---|
| `npm test` | **2963 اختباراً ناجحاً** · 411 ملفاً · 1 skipped · 9 todo — **بلا أي انحدار** |
| `npm run lint` | ✅ بلا تحذيرات |
| `npm run typecheck` | ✅ بلا أخطاء |
| `scripts/db-tests.sh --list` | الاختبار الجديد مصنَّف **محصّن** ⇒ حاجز في CI |

### تأكيد عدم الانحدار
`tests/db/permissions-enforce-test.sql` و`tests/db/sensitive-role-approval-test.sql` يفشلان **قبل** ترحيلي وبعده بنفس الرسالة ⇒ فشل قائم مسبقاً في بيئة المحاكاة المحلية، لا علاقة له بالجولة.

---

## ٥) التراجع

```sql
drop function public.security_events_list(uuid, text, int);
drop function public.session_policy_list(text, int);
drop function public.session_policy_set(uuid, int, boolean, text);
drop function public.session_policy_get(uuid);
drop function public.security_event_record(text, text, uuid, text, uuid, text, inet, text, jsonb);
drop function app.require_it_admin(text);
drop function app.security_event(text, text, uuid, text, uuid, text, inet, text, jsonb);
drop function app.session_active_count(uuid);
drop function app.session_policy_for(uuid);
drop table public.security_events;
drop table public.account_session_policy;
```
`staff-login`: إرجاع الملف إلى الإصدار السابق (التسجيل غير حاجب، فلا أثر وظيفي).

---

## ٦) المخاطر والقيود المعروفة

1. **الحراسة بدور `it_admin` مؤقتة** — تُستبدل بوحدة صلاحيات `it.security.sessions` في الجولة ٣ حين تُبنى الشاشة (الكتالوج مشتق من الشريط الجانبي، فلا وحدة بلا صفحة).
2. **`auth.sessions`** يحوي `ip` و`user_agent`، ولا يحوي بصمة الجهاز — البصمة (`source_hash`) تُخزَّن في `security_events` فقط. ربط الجلسة بجهازها يحتاج مطابقة IP/UA في الجولة ٣.
3. **لا فرض بعد** — `enforce=false` لكل الحسابات. الفرض والتجاوز والانتقال الآمن في الجولة ٣.
4. **الموقع الجغرافي غير مسجَّل** — الأعمدة جاهزة، والتعبئة قرار الجولة ٤ (اقتراحك: IP + دولة بلا خدمة خارجية).
5. **`staff-login` لم يُنشر** — الكود في الفرع فقط؛ الدالة المنشورة حالياً بلا تسجيل. النشر يحتاج موافقتك الصريحة.

---

## ٧) شروط بدء الجولة ٢

- موافقتك على هذا التقرير.
- تطبيق الترحيل على قاعدة الإنتاج يأتي مع النشر (لا `db push` يدوي من هنا).
- الجولة ٢ تحتاج قراراً واحداً: هل تُنشأ قائمة الأدوار التسعة في جدول `sensitive_roles` أم في ثابت مركزي بالكود + قيد في قاعدة البيانات؟

---

## ملحق — بيئة الاختبار المحلية (للاستخدام في الجولات القادمة)

لا يوجد Docker في بيئة العمل، لذا شُغّلت **PostgreSQL 16.2 حقيقية** محلياً:
- حزمة `pgserver` (PyPI) + محاكاة Supabase (`tests/db/supabase-mock.sql`).
- بدائل محلية للامتدادات غير المتوفرة (`pgcrypto` بـ`sha256` المدمج، `pg_cron` كجدول، `pg_trgm` بلا فهرس ثلاثي) — **في بيئة الاختبار فقط، خارج المستودع**؛ الحكم النهائي لـCI (Supabase CLI + Postgres حقيقي).
- السكربت: يعيد بناء القاعدة ويطبّق كل الترحيلات بالترتيب ثم يشغّل ملف الاختبار.
