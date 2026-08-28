# المفاتيح والأسرار — أين تضع ماذا؟

## أنواع المفاتيح ومواضعها (الصيغة الجديدة لـ Supabase)

| المفتاح | الشكل | يوضع في | يصل للمتصفح؟ |
|---------|-------|---------|:------------:|
| **Project URL** | `https://xxxx.supabase.co` | `VITE_SUPABASE_URL` في `.env.local` | نعم (عام بالضرورة) |
| **Publishable** (بديل anon) | `sb_publishable_...` | `VITE_SUPABASE_ANON_KEY` في `.env.local` | نعم (مصمَّم لذلك — الحماية من RLS) |
| **Secret** (بديل service_role) | `sb_secret_...` | متغير **بلا** `VITE_` + أسرار CI + أسرار Edge Functions | **أبداً** |
| **Access Token** (CLI) | `sbp_...` | `SUPABASE_ACCESS_TOKEN` في `.env.local` | **أبداً** |
| **DB Password** | — | `SUPABASE_DB_PASSWORD` في `.env.local` | **أبداً** |

## طبقات الحماية المطبقة (5 طبقات)

1. **`.gitignore`**: `.env.local` وكل `.env*` مستثناة من المستودع منذ اليوم الأول.
2. **درع الكود** (`supabase.config.ts`): لو وُضِع `sb_secret_` في متغير `VITE_` → التطبيق يرفض الإقلاع برسالة عربية.
3. **درع البناء** (`scripts/check-env.ts`): نفس الفحص قبل أي build/CI.
4. **فاحص الأسرار** (`scripts/check-secrets.sh`): يمسح الملفات المتتبعة/المرحّلة عن أنماط `sb_secret_ / sb_publishable_ / eyJ... / sbp_...` — يعمل:
   - محلياً: `npm run secrets:check` + خطاف pre-commit (ثبّته مرة: `npm run hooks:install`)
   - في CI: خطوة إلزامية قبل كل شيء في `ci.yml`
5. **فصل الأدوار**: الواجهة تستخدم publishable فقط؛ secret يقرؤه الخادم/الاختبارات/الـ Edge Functions من env حصراً.

## تطبيق المهاجرات مباشرة من الترمينال

```bash
# ① املأ في .env.local:
#    SUPABASE_ACCESS_TOKEN   → Account → Access Tokens
#    SUPABASE_PROJECT_REF    → من رابط المشروع (https://XXXX.supabase.co)
#    SUPABASE_DB_PASSWORD    → كلمة مرور القاعدة

# ② ثم:
npm run db:push                # = npx supabase link + npx supabase db push
npm run db:push -- --dry-run   # معاينة دون تطبيق
```

السكربت يعرض أيضاً `migration list` لرؤية المطبق/المعلق، وبعد أول تطبيق فعّل
`custom_access_token_hook` من: Dashboard → Authentication → Hooks.

## تدوير المفاتيح (Rotation)

> **التوصية الحالية:** هذه المفاتيح وردت في محادثة — يُنصح بتدوير `sb_secret_` بعد إتمام الربط:
> Dashboard → API Keys → ⋯ → **Rotate secret** ثم حدّث القيمة في `.env.local` وأسرار CI.
> مفتاح `sb_publishable_` تدويره اختياري (مصمَّم للعلانية، والحماية الحقيقية من RLS).

## قاعدة ذهبية

> أي قيمة تبدأ بـ `VITE_` ستُضمَّن في حزمة المتصفح ويمكن لأي موظف قراءتها من DevTools.
> لا تضع بعد `VITE_` سوى: الرابط و`sb_publishable_`. كل ما عداهما سر.
