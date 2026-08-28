# 🌳 شجرة الملفات النهائية — Municipal PWA v4.0

> **ما هذا؟** النسخة المُنفَّذة فعلياً من الهيكلية (كل ملف أدناه موجود في المستودع)، مع تعليم `[FIX n]` عند مواضع الإصلاح مقارنة بوثيقة v3.0.
> **الحالة:** 400+ ملف — الأساس كامل، والملفات الموسومة `TODO(v4)` هي مهام التنفيذ المهيكلة (كل واحدة لها نموذج مرجعي مكتمل مذكور بجانبها).

---

## سجل الإصلاحات (12 إصلاحاً عن v3.0)

| # | الإصلاح | أين |
|---|---------|-----|
| FIX 1 | إصدارات 2026: React 19 · RRv7 · Tailwind v4 (CSS-first) · Vite 7 · Zod 4 · ESLint 9 Flat | `package.json` · `eslint.config.js` |
| FIX 2 | حذف مجلد `supabase/triggers/` المنفصل — كل الـ triggers داخل migrations (كان لن يعمل أبداً) | `supabase/migrations/*` |
| FIX 3 | تفكيك `00011_rls_policies.sql` الضخم — سياسات كل جدول بجانبه | `supabase/migrations/*` |
| FIX 4 | إضافة `index.html` (كان مفقوداً — شرط Vite) | الجذر |
| FIX 5 | حذف `public/manifest.json` — يولَّد من `src/config/pwa.config.ts` (تعارض في v3) | config |
| FIX 6 | حذف `.env.local` من الشجرة — ملفات البيئة لا تُرفع أبداً | `.gitignore` |
| FIX 7 | فجوة اكتمال: payroll/attendance/assets بلا جداول، audit بلا query-keys — أُضيفت | `00009/10/13` + `audit.keys.ts` |
| FIX 8 | فصل `departments.sdk.ts` عن `employees.sdk.ts` (كانا سيكسران حد 300 سطر) | `services/` |
| FIX 9 | مصفوفة انتقالات الحالة المطابقة للـ DB trigger (كانت ناقصة) | `status.constants.ts` |
| FIX 10 | طبقة Offline كاملة بسياسة تعارض (كانت غائبة رغم PWA) — ADR 006 | `lib/offline/` |
| FIX 11 | طبقة Monitoring (Sentry اختياري + MFA لـ super_admin) — ADR 007 | `lib/monitoring/` |
| FIX 12 | `vite-tsconfig-paths` — مصدر واحد للـ aliases بدل التكرار في ملفين | `vite.config.ts` |

---

## الشجرة

```
municipal-pwa/
│
├── 📁 .github/
│   ├── 📁 workflows/
│   │   ├── ci.yml                    # lint + typecheck + env-check + unit/security + coverage gate
│   │   ├── cd-staging.yml            # نشر staging عند push إلى develop
│   │   ├── cd-production.yml         # نشر production عند push إلى main
│   │   ├── e2e.yml                   # Playwright على كل PR
│   │   └── security-scan.yml         # تدقيق تبعيات أسبوعي
│   ├── PULL_REQUEST_TEMPLATE.md      # قائمة فحوصات إلزامية (قوانين SDK/Keys/RLS)
│   └── CODEOWNERS                    # مراجعة إلزامية: migrations + services + workflows
│
├── 📁 docs/
│   ├── 📁 adr/                       # 7 قرارات معمارية موثقة (كانت 4)
│   │   ├── 001-feature-driven.md
│   │   ├── 002-sdk-layer.md          # + فصل departments عن employees [FIX 8]
│   │   ├── 003-rls-strategy.md       # + سياسات مع كل migration [FIX 3]
│   │   ├── 004-pwa-workbox.md        # + حظر كاش Supabase + توليد manifest [FIX 5]
│   │   ├── 005-single-tenant.md      # ★ جديد: قرار "شركة واحدة" + مسار التراجع
│   │   ├── 006-offline-conflict-policy.md  # ★ جديد: سياسة التعارض [FIX 10]
│   │   └── 007-monitoring-sentry.md  # ★ جديد: المراقبة + MFA [FIX 11]
│   ├── portals.md                    # البوابات + الأدوار + تدفق الدخول
│   ├── database-schema.md            # خريطة 15 migration + قواعد ثابتة + ERD
│   ├── storage-buckets.md            # 3 buckets + سياساتها + اتفاقية المسارات
│   ├── deployment.md                 # البيئات الثلاث + خطوات النشر
│   ├── onboarding.md                 # دليل المطور الجديد + مهام أولى
│   └── offline-policy.md             # ★ جديد: ملخص تنفيذي لسياسة ADR 006
│
├── 📁 supabase/
│   ├── config.toml                   # + تعطيل self-signup + قسم الـ hook (موثق)
│   ├── 📁 migrations/                # جدول + RLS + فهارس + triggers معاً لكل domain
│   │   ├── 00001_init_extensions.sql       # pg_trgm + مخطط app
│   │   ├── 00002_auth_helpers.sql          # has_role · current_employee_id · set_updated_at · bump_version
│   │   ├── 00003_roles_permissions.sql     # user_roles + custom_access_token_hook (JWT)
│   │   ├── 00004_departments.sql           # + RLS + فهرس
│   │   ├── 00005_employees.sql             # + RLS (نفسه/HR/مدير قسمه/إدارات) + trgm search
│   │   ├── 00006_requests.sql              # + State Machine trigger + version [FIX 2,3,9]
│   │   ├── 00007_notifications.sql         # + إشعار تلقائي (SECURITY DEFINER)
│   │   ├── 00008_documents.sql             # metadata فقط
│   │   ├── 00009_payroll.sql               # ★ كان مفقوداً في v3 [FIX 7]
│   │   ├── 00010_attendance.sql            # ★ كان مفقوداً في v3 [FIX 7]
│   │   ├── 00011_budget.sql                # + قيد spent <= allocated
│   │   ├── 00012_it_tickets.sql            # + ticket_number توليدي
│   │   ├── 00013_it_assets.sql             # ★ كان مفقوداً في v3 [FIX 7] + قيد حالة متسق
│   │   ├── 00014_audit_logs.sql            # trigger audit عام + إرفاق آلي بـ 8 جداول
│   │   └── 00015_storage_buckets.sql       # buckets + سياسات storage (كانت في v3 بلا فهارس مسارات)
│   ├── 📁 functions/webhooks/              # Edge Function وحيدة: webhooks موقّعة HMAC
│   │   ├── index.ts
│   │   └── 📁 _shared/{cors.ts, hmac.ts}
│   ├── 📁 seed/                            # 01 roles · 02 departments · 03 admin · 04 test data
│   └── 📁 tests/                           # pgTAP: rls_policies + triggers
│
├── 📁 src/
│   ├── 📁 services/                  # ━━━ قانون SDK: نقطة Supabase الوحيدة (ESLint يفرض) ━━━
│   │   ├── client.ts                 # singleton + sdkGuard (أخطاء موحدة) + كشف NETWORK
│   │   ├── auth.sdk.ts               # ★ مكتمل: login/logout/session/roles/portal detection
│   │   ├── employees.sdk.ts          # ★ مكتمل (النموذج المرجعي) — departments فُصلت [FIX 8]
│   │   ├── departments.sdk.ts        # TODO — نموذج: employees.sdk
│   │   ├── requests.sdk.ts           # TODO — نموذج: employees.sdk + workflow في 00006
│   │   ├── notifications.sdk.ts · documents.sdk.ts · storage.sdk.ts      # TODO
│   │   ├── payroll.sdk.ts · attendance.sdk.ts · budget.sdk.ts            # TODO
│   │   ├── reports.sdk.ts · tickets.sdk.ts · assets.sdk.ts · audit.sdk.ts # TODO
│   │   └── index.ts                  # barrel واحد
│   │
│   ├── 📁 lib/
│   │   ├── 📁 query-keys/            # 13 factory + index (أُضيف audit.keys.ts المفقود [FIX 7])
│   │   │   ├── auth.keys.ts · employees.keys.ts · departments.keys.ts · requests.keys.ts
│   │   │   ├── notifications.keys.ts · documents.keys.ts · payroll.keys.ts · attendance.keys.ts
│   │   │   ├── reports.keys.ts · budget.keys.ts · tickets.keys.ts · assets.keys.ts · audit.keys.ts
│   │   │   └── index.ts
│   │   ├── 📁 utils/                 # date (date-fns + ar) · format (IQD) · file · permissions · string
│   │   ├── 📁 constants/             # roles · portals (+ accessiblePortals) · status (+ مصفوفة الانتقالات [FIX 9]) · storage · api
│   │   ├── 📁 errors/                # AppError → SDKError/AuthError + error.handler (رسائل آمنة)
│   │   ├── 📁 realtime/              # SubscriptionManager + channels factory
│   │   ├── 📁 offline/               # ★ جديد [FIX 10]: types · conflict.resolver (3 استراتيجيات) · mutation-queue
│   │   └── 📁 monitoring/            # ★ جديد [FIX 11]: sentry (اختياري) + logger موحد
│   │
│   ├── 📁 stores/                    # Zustand — UI فقط (قانون 5): ui.store · portal.store
│   │
│   ├── 📁 components/
│   │   ├── 📁 ui/                    # Button ★ · Toast ★ · Input · Select · Modal · DataTable
│   │   │                             # FormField · Badge · Card · Skeleton · Avatar
│   │   ├── 📁 layout/                # AppShell · Sidebar/ · Header/ (NotificationBell · UserMenu) · PageWrapper · Footer
│   │   ├── 📁 auth/                  # ProtectedRoute ★ · PortalGuard ★ · SessionTimeout
│   │   └── 📁 feedback/              # ErrorBoundary ★ · LoadingSpinner ★ · EmptyState ★ · OfflineBanner ★ (طابور) · RetryButton
│   │
│   ├── 📁 features/                  # ━━━ 13 ميزة — كل واحدة: hooks/schemas/components/types/index ━━━
│   │   ├── auth/                     # ★ مكتملة: useAuth · usePortalAccess · usePermissions + Zod
│   │   ├── employees/                # ★ مكتملة (النموذج المرجعي) + useCreateEmployee (كانت ناقصة عن صفحة AddEmployee)
│   │   ├── departments/              # TODO — hooks + OrgChart
│   │   ├── requests/                 # ★ schema مكتمل (4 أنواع payload + refine تواريخ) — hooks TODO
│   │   ├── notifications/            # TODO + useUnreadCount/useMarkAsRead (أُضيفت)
│   │   ├── documents/                # TODO + useDeleteDocument (أُضيف)
│   │   ├── payroll/                  # TODO + payroll.schema (كانت مفقودة رغم GeneratePayslips) [FIX 7]
│   │   ├── attendance/ · budget/ · reports/ · it-tickets/ · assets/ · audit/   # TODO
│   │
│   ├── 📁 portals/                   # ━━━ 7 بوابات: قوقعة + routes + pages (قانون 4) ━━━
│   │   ├── public/                   # ★ مكتملة: LoginPage (RHF+Zod) · PortalSelector (توجيه ذكي)
│   │   ├── employee/                 # ★ قوقعة مكتملة — الصفحات TODO
│   │   ├── hr/ · manager/ · finance/ · it/ · admin/    # قوقع موحدة + routes.tsx جاهزة
│   │
│   ├── 📁 router/                    # index.tsx (createBrowserRouter + redirect حقيقي) · routes.config · portal.router
│   │   └── 📁 guards/                # auth.guard · role.guard · portal.guard (جلسة→بوابة→403)
│   │
│   ├── 📁 config/                    # ★ مكان واحد لكل إعداد: supabase (تحقق صارم) · app · portals · pwa (المصدر الوحيد للـ manifest [FIX 5]) · query-client · sentry
│   ├── 📁 i18n/                      # i18next + ar/ (8 namespaces) — جاهز لإضافة en
│   ├── 📁 styles/                    # globals (Tailwind v4 @theme [FIX 1]) · portals.css · rtl.css · print.css
│   ├── 📁 types/                     # database.types (توليد آلي) · portal · auth · globals
│   ├── 📁 workers/sw.ts              # Workbox: AppShell + حظر كاش Supabase + offline fallback [FIX 5]
│   ├── App.tsx · main.tsx · vite-env.d.ts
│
├── 📁 tests/                         # ━━━ 4 مستويات ━━━
│   ├── 📁 unit/                      # ★ query-keys · auth.schema · permissions · auth.sdk — مكتملة كنماذج
│   ├── 📁 integration/               # rls.employee/hr/manager/finance/it/admin (أُضيف finance+it [FIX 7])
│   ├── 📁 e2e/                       # auth/ · portals/ · flows/ · pwa/ (Playwright)
│   ├── 📁 security/                  # xss · csrf · role-escalation
│   ├── 📁 __mocks__/                 # supabase.mock (chain كامل) · router.mock · pwa.mock
│   ├── 📁 fixtures/                  # ★ بيانات اختبار مشتركة
│   └── setup.ts
│
├── 📁 public/
│   ├── offline.html                  # ★ مكتملة
│   ├── robots.txt                    # Disallow: / (نظام داخلي)
│   └── 📁 icons/README.md            # المواصفات + أمر التوليد
│   # manifest.json حُذف — يولَّد من pwa.config [FIX 5]
│
├── 📁 scripts/
│   ├── check-env.ts                  # ★ Zod: يمنع build ناقص الإعدادات
│   ├── generate-types.sh · seed-local.sh · db-reset.sh
│   └── scaffold-feature.sh           # ★ مولّد هيكلة ميزات يضمن الاتفاقية
│
├── index.html                        # ★ [FIX 4] — كان مفقوداً كلياً
├── package.json                      # ★ [FIX 1] + scripts إنتاجية
├── vite.config.ts                    # ★ pwa.config مصدر واحد + manualChunks + vite-tsconfig-paths [FIX 12]
├── vitest.config.ts · playwright.config.ts
├── tsconfig.json · tsconfig.paths.json   # المصدر الوحيد للـ aliases
├── eslint.config.js                  # ★ Flat Config + فرض قانون SDK آلياً
├── .prettierrc · .prettierignore · .editorconfig · .gitignore
├── .env.example · .nvmrc
├── README.md · CHANGELOG.md · SECURITY.md · CONTRIBUTING.md · TREE.md
└── (لا .env.local — حُذف من الشجرة [FIX 6])
```

---

## ماتريكس الميزات ↔ الجداول ↔ البوابات

| Feature | Migration | SDK | Query Keys | البوابات المستهلكة |
|---------|-----------|-----|------------|---------------------|
| auth | 00002/00003 | ✅ | ✅ | الكل |
| employees | 00005 | ✅ | ✅ | HR · IT · Manager(قسمه) |
| departments | 00004 | TODO | ✅ | HR · Manager · Employee(الهيكل) |
| requests | 00006 | TODO | ✅ | Employee · Manager · HR |
| notifications | 00007 | TODO | ✅ | الكل |
| documents | 00008 | TODO | ✅ | Employee · HR |
| payroll | 00009 ★ | TODO | ✅ | Employee · HR · Finance |
| attendance | 00010 ★ | TODO | ✅ | Employee · HR · Manager |
| budget | 00011 | TODO | ✅ | Finance · Manager(قسمه) |
| it-tickets | 00012 | TODO | ✅ | الكل(فتح) · IT(إدارة) |
| assets | 00013 ★ | TODO | ✅ | IT · Employee(أصوله) |
| audit | 00014 ★ | TODO | ✅ (أُضيف [FIX 7]) | Admin |
| storage | 00015 | TODO | — | Employee · HR |

## خارطة التنفيذ المحدّثة

| المرحلة | المدة | المحتوى |
|---------|-------|---------|
| 1 — الأساس | أسبوع 1-2 | `supabase db reset` (15 migration جاهزة) · استكمال SDKs · بوابة Employee كاملة |
| 2 — البوابات الرئيسية | أسبوع 3-4 | HR + Manager · اختبارات RLS integration · Realtime |
| 3 — المتخصصة | أسبوع 5-6 | Finance + IT + Storage + Reports |
| 4 — الإدارة والإطلاق | أسبوع 7-8 | Admin + Audit + E2E كاملة + Sentry + Security Audit |
| 5 — ما بعد الإطلاق | مستمر | Offline المتقدم (IndexedDB) · i18n EN · تحسينات أداء |

---

*Municipal PWA v4.0 — شركة بلدية واحدة · Feature-Driven · RLS-Hardened*
*مبنية على v3.0 FINAL مع 12 إصلاحاً معمرياً موثقاً — 2026*


---

# 🌳 ملحق الجولات 2-5 — البوابة التقنية الشاملة (2026-08)

## مهاجرات إضافية (00022-00028)

```
supabase/migrations/
├── 00022_branches.sql              # الفروع + employees.branch_id
├── 00023_page_permissions.sql      # role_page_permissions · user_page_overrides · app.page_access
├── 00024_dynamic_portals.sql       # dynamic_portals · portal_units (إنشاء بوابة من IT)
├── 00025_integrations.sql          # biometric_devices · biometric_pushes · gps_providers · vehicles · vehicle_positions · gps_events · integration_logs · system_settings
├── 00026_public_rpc_round2.sql     # page_access · can_i_see · biometric_ingest · gps_ingest (أغلفة public)
├── 00027_round2_rls_fixes.sql      # set_user_role يمدد للأدوار الديناميكية + page_registry بذور
└── 00028_dynamic_roles.sql         # فتح user_roles CHECK لصيغة portal:{slug}
```

## الوحدات الجديدة في البوابة التقنية (7 وحدات)

```
src/portals/it/
├── pages/
│   ├── Dashboard/ITDashboard.tsx           # لوحة حية
│   ├── UserManagement/                     # المستخدمون · إنشاء · تفاصيل · الهيكل · Hub
│   ├── Database/                           # نظرة عامة · تفاصيل جدول · أخطاء · Hub
│   ├── Branches/BranchesPage.tsx           # 🆕 فروع الشركة
│   ├── Permissions/PermissionsMatrix.tsx   # 🆕 مصفوفة الصلاحيات (دورة 3 حالات + قيود فردية)
│   ├── Integrations/BiometricPage.tsx      # 🆕 أجهزة البصمة (حالة حية + رابط ADMS)
│   ├── Integrations/GpsPage.tsx            # 🆕 تتبع الشاحنات (سرعة حية + إحداثيات)
│   └── Updates/UpdatesPage.tsx             # 🆕 سجل التكاملات المباشر
└── routes.tsx                              # 15 مسار
```

## Edge Functions (تكاملات حية)

```
supabase/functions/
├── adms-receiver/    # ZKTeco ADMS Push: تسجيل · نبض · دفع حضور · تأكيد
├── gps-receiver/     # Traccar JSON + OsmAnd GET · تحقق API key · تحويل knots→km/h
├── admin-users/      # إنشاء مستخدم (service_role داخلي)
└── webhooks/         # موقعة HMAC
```

## طبقة الوصول الجديدة

```
src/services/: branches.sdk · permissions.sdk · portals.sdk · integrations.sdk
src/features/: branches/ · permissions/ · portals/ (UNIT_LIBRARY) · integrations/
src/lib/query-keys/: branches · permissions · portals · integrations
```

## الاختبارات (الجولة 6)

```
supabase/tests/round6_isolation.sql   # 21 تأكيد عزل: الفروع · المصفوفة · can_i_see
                                      # · البوابات الديناميكية · البصمة · GPS · السجل
tests/e2e/portals/it-full.spec.ts     # الرحلة الكاملة عبر 7 وحدات + طي الشريط
```

## أوامر التشغيل

```bash
npm run functions:deploy    # نشر adms-receiver + gps-receiver
npm run simulate -- --url <URL> --key <ANON> --api-key <GPS_KEY>   # محاكاة جهاز حقيقي
npm run db:push             # تطبيق المهاجرات الجديدة
```

*إجمالي الاختبارات: 162 وحدة + 28 مهاجرة + أجنحة SQL (15+15+29+10+21) + E2E.*
