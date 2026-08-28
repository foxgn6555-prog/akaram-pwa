# سياسة الأمان

## النموذج
الأمان حاكم في **PostgreSQL RLS** — الواجهة حارس راحة فقط. أي ثغرة واجهة لا تتجاوز سياسات الصفوف.

## الضوابط المعمول بها
1. **RLS على كل جدول** (default deny — جدول بلا سياسات = مغلق كلياً).
2. **أدوار من `user_roles`** + حقن الدور الأساسي في JWT عبر `custom_access_token_hook`.
3. **State Machine للطلبات** في DB trigger — لا انتقالات فوضوية حتى بطلبات API مباشرة.
4. **لا كاش لبيانات Supabase** في Service Worker (مساران `/rest/v1` و`/auth/v1` خارج الكاش).
5. **Webhooks موقّعة HMAC** بمقارنة زمنية ثابتة.
6. **Audit Logs** آلية على الجداول الحساسة، قراءتها super_admin فقط.
7. **MFA إلزامي** لـ super_admin + سياسة كلمات مرور (تُفعَّل من لوحة Supabase Auth).
8. تنقية بيانات Sentry (`beforeSend`) — لا بيانات موظفين عند طرف ثالث.

## اختبارات الأمان
`tests/security/` — XSS · CSRF · role-escalation، و`tests/integration/rls.*.test.ts` لكل دور.
`security-scan.yml` — تدقيق تبعيات أسبوعي.

## الإبلاغ عن ثغرة
راسل: security@municipal.example.iq — لا تنشر الثغرة علناً. نرد خلال 48 ساعة عمل.
