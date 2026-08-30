# البوابة التقنية (IT) — مكتملة

> كل ما يخص هذه البوابة داخل هذا المجلد.

## الوحدات والصفحات (كلها حية ومتصلة بقاعدة البيانات)

| الوحدة | الصفحة | المسار | الملف |
|--------|--------|--------|-------|
| الرئيسية | اللوحة الحية (ترحيب ذكي + مؤشرات المنظومة + رسوم) | /it | pages/Dashboard/ITDashboard.tsx (+ DashboardWidgets.tsx) |
| إدارة المستخدمين | المستخدمون (فلاتر + حالة + تعطيل سريع) | /it/user-management | pages/UserManagement/UsersList.tsx |
| إدارة المستخدمين | إنشاء مستخدم | /it/user-management/create | pages/UserManagement/CreateUser.tsx |
| إدارة المستخدمين | الهيكل التنظيمي | /it/user-management/departments | pages/UserManagement/DepartmentsPage.tsx |
| إدارة المستخدمين | تفاصيل/إدارة مستخدم (تعديل بيانات + حساب + أدوار) | /it/user-management/:userId | pages/UserManagement/UserDetail.tsx |
| قاعدة البيانات | نظرة عامة + الجداول (Hub) | /it/database | pages/Database/DatabaseHub.tsx |
| الفروع | فروع الشركة (إنشاء/تفعيل/تعطيل) | /it/branches | pages/Branches/BranchesPage.tsx |
| الصلاحيات | مصفوفة الصلاحيات | /it/permissions | pages/Permissions/PermissionsMatrix.tsx |
| التكاملات | البصمة + GPS | /it/integrations/{biometric,gps} | pages/Integrations/* |
| التحديثات | التحديثات والمراقبة | /it/updates | pages/Updates/UpdatesPage.tsx |
| الأرشيف | الأرشيف الهندسي | /it/archive | pages/Archive/ArchivePage.tsx |
| مصمم التدفقات | FlowBridge (محرك تدفقات بصري مضمّن) | /it/flowbridge | pages/FlowBridge/FlowBridgePage.tsx |

## الأدوار
- `it_admin` (حصراً لهذه البوابة) + `super_admin` (إشراف)

## التبعيات
- الـ SDK: `src/services/users.sdk` · `system.sdk` · `departments.sdk`
- الميزات: `src/features/user-management` · `system` · `departments`
- RPCs: `list_platform_users` · `set_user_role` · `set_employee_profile` · `db_stats` · `db_overview` · `db_table_details`
- Edge Function: `admin-users` (إنشاء · تغيير بريد · تعطيل/تفعيل · إعادة تعيين كلمة مرور — بأكشنات أمنية مدقّقة)
- إدارة المستخدمين الشاملة (00036): تعديل بيانات الموظف المرتبط عبر RPC آمنة + حساب auth عبر Edge Function
