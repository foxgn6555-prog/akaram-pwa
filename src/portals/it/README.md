# البوابة التقنية (IT) — مكتملة

> كل ما يخص هذه البوابة داخل هذا المجلد.

## الوحدات والصفحات (كلها حية ومتصلة بقاعدة البيانات)

| الوحدة | الصفحة | المسار | الملف |
|--------|--------|--------|-------|
| الرئيسية | اللوحة الحية | /it | pages/Dashboard/ITDashboard.tsx |
| إدارة المستخدمين | المستخدمون | /it/user-management | pages/UserManagement/UsersList.tsx |
| إدارة المستخدمين | إنشاء مستخدم | /it/user-management/create | pages/UserManagement/CreateUser.tsx |
| إدارة المستخدمين | الهيكل التنظيمي | /it/user-management/departments | pages/UserManagement/DepartmentsPage.tsx |
| إدارة المستخدمين | أدوار مستخدم | /it/user-management/:userId | pages/UserManagement/UserDetail.tsx |
| قاعدة البيانات | النظرة العامة | /it/database | pages/Database/DatabaseOverview.tsx |
| قاعدة البيانات | تفاصيل جدول | /it/database/tables/:tableName | pages/Database/TableDetailPage.tsx |
| قاعدة البيانات | أخطاء التطبيق | /it/database/errors | pages/Database/ErrorLogs.tsx |

## الأدوار
- `it_admin` (حصراً لهذه البوابة) + `super_admin` (إشراف)

## التبعيات
- الـ SDK: `src/services/users.sdk` · `system.sdk` · `departments.sdk`
- الميزات: `src/features/user-management` · `system` · `departments`
- RPCs: `list_platform_users` · `set_user_role` · `db_stats` · `db_overview` · `db_table_details`
- Edge Function: `admin-users` (لإنشاء الحسابات من التطبيق)
