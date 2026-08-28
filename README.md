# جزيرة الأكرام — النظام الإلكتروني (Municipal PWA v4.1)

تطبيق PWA داخلي لإدارة شركة بلدية واحدة: 7 بوابات، 13 ميزة، أمان RLS حاكم في PostgreSQL.

> **v4.0 = وثيقة v3.0 النهائية + 12 إصلاحاً معمارياً.** القائمة الكاملة: [`TREE.md`](./TREE.md) وقسم "سجل الإصلاحات".

## البدء السريع

```bash
nvm use                 # Node 22
npm ci
cp .env.example .env.local   # املأ من: supabase status
npm run db:reset && npm run db:seed
npm run db:types
npm run dev             # http://localhost:5173
```

> أول مرة: أنشئ مستخدم admin من Studio (`http://localhost:54323`) ثم امنحه دور
> `super_admin` في `user_roles` (انظر `supabase/seed/01_roles.sql`).

## البنية — 60 ثانية

```
src/
├── services/     → طبقة SDK: نقطة Supabase الوحيدة (ESLint يمنع ما عداه)
├── lib/          → query-keys · utils · constants · errors · realtime · offline · monitoring
├── stores/       → Zustand (UI فقط) — بيانات السيرفر حكر على TanStack Query
├── components/   → ui (Design System) · layout · auth · feedback — بلا منطق أعمال
├── features/     → 13 ميزة، كل واحدة: hooks + schemas + components + types + index
├── portals/      → 7 بوابات: قوقعة + routes + pages (تستهلك features)
├── router/       → التوجيه المركزي + الحارسات (جلسة → بوابة → 403)
├── config/       → إعدادات app/supabase/pwa/query/sentry — مكان واحد لكل إعداد
├── i18n/ styles/ types/ workers/
supabase/
├── migrations/   → 15 migration: جدول + RLS + فهارس + triggers معاً لكل domain
├── functions/    → Edge Functions (webhooks موقّعة HMAC فقط)
└── seed/ tests/
tests/            → unit · integration(RLS) · e2e(Playwright) · security
```

## القوانين الخمسة (تعمل، لا مجرد وثائق)

| القانون | كيف يُفرض |
|---------|-----------|
| 1. لا Supabase خارج `services/` | ESLint `no-restricted-imports` يرفض البناء |
| 2. لا Query Keys inline | مركزية في `lib/query-keys` + مراجعة CODEOWNERS |
| 3. Features عبر `index.ts` فقط | اتفاقية + مراجعة |
| 4. Portals بلا منطق أعمال | اتفاقية + مراجعة |
| 5. Zustand = UI فقط | اتفاقية + مراجعة |

## الأوامر

| الأمر | الوظيفة |
|-------|---------|
| `npm run dev / build / preview` | تطوير/بناء/معاينة |
| `npm run lint / typecheck / format` | الجودة |
| `npm test` / `test:coverage` | unit + security (+ بوابة تغطية 70%) |
| `npm run test:e2e` | Playwright |
| `npm run db:reset / db:seed / db:types` | قاعدة البيانات المحلية |
| `npm run db:push` | **تطبيق المهاجرات على البعيد مباشرة** (`npx supabase db push`) |
| `npm run secrets:check` | فحص تسريب المفاتيح (يعمل آلياً في CI و pre-commit) |
| `npm run hooks:install` | تثبيت خطاف git لفحص الأسرار |
| `npm run feature:new -- <name>` | توليد هيكلة ميزة جديدة |
| `npm run env:check` | فحص البيئة قبل البناء |

## الوثائق

`docs/` — 7 قرارات معمارية (ADR) · البوابات · مخطط DB · Storage · النشر · دليل المطور · سياسة Offline.

## الإصدارات التقنية

React 19 · React Router 7 · Vite 7 · TypeScript 5.8 · Tailwind CSS **4** (CSS-first — لا tailwind.config)
TanStack Query 5 · Zustand 5 · Zod 4 · Supabase JS 2 · vite-plugin-pwa 1 · Vitest 3 · Playwright 1.5+
