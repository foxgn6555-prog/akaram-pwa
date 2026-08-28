# أمن صفحة تسجيل الدخول — جزيرة الأكرام

## طبقات الحماية (من الحاكم إلى المكمّل)

| الطبقة | الآلية | الموقع | لماذا |
|--------|--------|--------|-------|
| **1 · قاعدة البيانات** | `login_attempts` + RPCs: `is_login_locked` / `record_login_attempt` / `login_lock_remaining_seconds` | `00016_login_security.sql` | الحاكم المطلق — 5 محاولات فاشلة/15د → قفل. الجدول بلا سياسات RLS → صفر وصول مباشر |
| **2 · Supabase Auth** | PKCE + Rate Limiting مدمج (لكل IP/بريد) + CAPTCHA اختياري | config.toml (معلّق) | حماية أصلية من المنصة نفسها |
| **3 · المتصفح** | `login-guard.ts`: عدّاد محلي + إقفال + عد تنازلي | `src/features/auth/security/` | يمنع الضرب المبكر ويحسّن UX دون اعتماد أمني عليه |

## الأساسيات المطبقة في صفحة الدخول

1. **Zod صارم** قبل أي اتصال (بريد صالح + كلمة مرور ≥ 8).
2. **رسالة خطأ موحدة** — «البريد أو كلمة المرور غير صحيحة» بلا تفرقة تسرّب وجود الحساب (اختبار يتحقق من ذلك).
3. **PKCE flow** في `client.ts` + `autoRefreshToken`.
4. **CSP** في `index.html` (default-src 'self' · connect-src للمشروع فقط).
   - ملاحظة معيارية: توجيه `frame-ancestors` يُتجاهل في `<meta>` حسب مواصفة CSP — لذا الحماية الفعلية ضد
     النقر المزيف عبر سكربت frame-busting + توجيه الاستضافة (في Netlify/Vercel: `_headers` بـ
     `X-Frame-Options: DENY` و CSP بـ frame-ancestors — تعمل فقط كـ HTTP header).
5. **حقول معطلة أثناء القفل** مع عد تنازلي مرئي (دقيقة:ثانية).
6. **لا تخزين كلمات مرور** في أي مكان — `autocomplete` صحيح (`username`/`current-password`).
7. **تسجيل كل المحاولات** على الخادم مع نظافة تلقائية (30 يوماً) — والنجاح يمحو العداد.

## فتح القفل إدارياً
```sql
select app.unlock_login('employee@akram.iq');  -- super_admin / الدعم
```

## تفعيل CAPTCHA (توصية production)
1. مفاتيح hCaptcha/Turnstile → ألغِ تعليق `[auth.captcha]` في config.toml.
2. أضف `captchaToken` إلى `signInWithPassword` في auth.sdk.
3. أضف مفاتيح الموقع للواجهة في `.env.local`.

## الاختبارات المرتبطة
- `tests/unit/features/login-guard.test.ts` — عدّاد/إقفال/مسح (6 حالات)
- `tests/unit/features/LoginPage.test.tsx` — الهوية، التحقق، التوجيه، عدم تسرّب الرسائل (7 حالات)
- `tests/integration/login.security.test.ts` — الـ RPCs على الخادم (يتطلب supabase محلي)
- `tests/e2e/auth/login.spec.ts` — السيناريو الكامل عبر متصفح حقيقي
- `.github/workflows/db-smoke.yml` — المهاجرات على قاعدة فارغة عند كل PR
