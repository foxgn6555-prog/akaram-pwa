# البوابة التقنية (IT) — مكتملة

> كل ما يخص هذه البوابة داخل هذا المجلد.

## الوحدات والصفحات (كلها حية ومتصلة بقاعدة البيانات)

| الوحدة | الصفحة | المسار | الملف |
|--------|--------|--------|-------|
| الرئيسية | اللوحة الحية (ترحيب ذكي + مؤشرات المنظومة + رسوم) | /it | pages/Dashboard/ITDashboard.tsx (+ DashboardWidgets.tsx) |
| إدارة المستخدمين | المستخدمون (فلاتر + حالة + تعطيل سريع) | /it/user-management | pages/UserManagement/UsersList.tsx |
| إدارة المستخدمين | إنشاء مستخدم | /it/user-management/create | pages/UserManagement/CreateUser.tsx |
| إدارة المستخدمين | تفاصيل/إدارة مستخدم (تعديل بيانات + حساب + أدوار) | /it/user-management/:userId | pages/UserManagement/UserDetail.tsx |
| قاعدة البيانات | نظرة عامة + الجداول (Hub) | /it/database | pages/Database/DatabaseHub.tsx |
| الفروع | فروع الشركة (إنشاء/تفعيل/تعطيل) | /it/branches | pages/Branches/BranchesPage.tsx |
| الصلاحيات | مصفوفة الصلاحيات | /it/permissions | pages/Permissions/PermissionsMatrix.tsx |
| التكاملات | البصمة + GPS | /it/integrations/{biometric,gps} | pages/Integrations/* |
| التحديثات | التحديثات والمراقبة | /it/updates | pages/Updates/UpdatesPage.tsx |
| الأرشيف | الأرشيف الهندسي | /it/archive | pages/Archive/ArchivePage.tsx |
| Console | رصد الأخطاء الحي لكل البوابات (مباشر · التنبيهات · الأخطاء مع الشرح · الدليل) | /it/console | pages/Console/ConsolePage.tsx |

## الأدوار
- `it_admin` (حصراً لهذه البوابة) + `super_admin` (إشراف)

## التبعيات
- الـ SDK: `src/services/users.sdk` · `system.sdk` · `departments.sdk`
- الميزات: `src/features/user-management` · `system` · `departments`
- RPCs: `list_platform_users` · `set_user_role` · `set_employee_profile` · `db_stats` · `db_overview` · `db_table_details` · `console_report` · `console_feed` · `console_stats` · `console_resolve`
- Edge Function: `admin-users` (إنشاء · تغيير بريد · تعطيل/تفعيل · إعادة تعيين كلمة مرور — بأكشنات أمنية مدقّقة)
- إدارة المستخدمين الشاملة (00036): تعديل بيانات الموظف المرتبط عبر RPC آمنة + حساب auth عبر Edge Function

## Console — رصد الأخطاء الحي (00166)
- **الالتقاط (كل البوابات):** `src/lib/console/capture.ts` يُركَّب مرة في `main.tsx`: `window.error` (+ أخطاء تحميل الصور/الملفات)، `unhandledrejection`، `console.error/warn`، `logger.error/warn` (يشمل ErrorBoundary)، وأخطاء طبقة البيانات (`SDKError` عبر `lib/console/bus.ts`) بكودها الحقيقي.
- **التصنيف:** `src/lib/console/classify.ts` — 17 نوعاً (chunk_load · offline · server_5xx · auth_expired · permission · rpc_missing · db_constraint · contract_code · validation · react_render · react_warning · null_access · asset_missing · quota · timeout · realtime · unknown) لكل منها عنوان عربي + سبب + خطوات حل + خطورة + المعني. البوابة تُستنتج من المسار (`/media/...` → بوابة الإعلام).
- **الإرسال:** دفعات كل 4 ثوانٍ أو 20 بصمة، تجميع بالبصمة (عدّاد)، حد 200/جلسة، لا إرسال بلا شبكة/جلسة، وفشل الإرسال لا يولّد خطأً. الخادم: `console_report` (≤50/دفعة، 120/ساعة/مستخدم، تجميع 24 ساعة على `fingerprint`).
- **العرض (IT فقط):** `console_feed` (مستوى/بوابة/نوع/حالة/مدة/بحث) + `console_stats` + `console_resolve` (وسم + ملاحظة، لا حذف). حيّ عبر Realtime على `app_errors` + استطلاع كل 10 ثوانٍ.
- المسار القديم `/it/database/errors` يحوّل إلى `/it/console`.
- الاختبارات: `tests/unit/console/*` (مصنّف · راصد · صفحة) + `tests/db/console-test.sql`.
