# مخطط قاعدة البيانات

> المصدر الحاكم: `supabase/migrations/` — هذا الملف ملخص تنقلي فقط.

## الترتيب (كل migration: جدول + RLS + فهارس + triggers معاً)

| # | الملف | الجداول/المحتوى |
|---|-------|-----------------|
| 00001 | init_extensions | pg_trgm + مخطط `app` |
| 00002 | auth_helpers | jwt_claim · has_role · current_employee_id · set_updated_at · bump_version |
| 00003 | roles_permissions | `user_roles` + custom_access_token_hook (حقن role في JWT) |
| 00004 | departments | الأقسام (شجرة parent_id) |
| 00005 | employees | الموظفون + ربط manager_id بالأقسام |
| 00006 | requests | الطلبات + validate_request_transition (State Machine) + version |
| 00007 | notifications | الإشعارات + توليد تلقائي عند تغيّر حالة الطلب |
| 00008 | documents | وثائق metadata (الملفات في Storage) |
| 00009 | payroll | `payrolls` + `payslips` |
| 00010 | attendance | سجلات الحضور (تسجيل ذاتي يومي) |
| 00011 | budget | تخصيصات الميزانية السنوية |
| 00012 | it_tickets | تذاكر الدعم |
| 00013 | it_assets | أصول IT (تسليم/استرجاع مع قيد حالة) |
| 00014 | audit_logs | سجل تدقيق generic + إرفاق آلي بالجداول الحساسة |
| 00015 | storage_buckets | 3 buckets + سياساتها |
| 00016 | login_security | `login_attempts` + إقفال الدخول (5/15د) + unlock إداري |
| 00017 | app_errors | سجل أخطاء التطبيق — وحدة قاعدة البيانات (البوابة التقنية) |
| 00018 | it_admin_rpcs | list_platform_users · set_user_role (منع ذاته + تدقيق) · db_stats · db_overview |
| 00021 | public_rpc_wrappers | أغلفة public لكل دوال RPC — **PostgREST لا يكشف إلا public** (إصلاح 404) |

## قواعد ثابتة
1. **لا migration بدون RLS** — إن أنشأت جدولاً بلا سياسات فهو مغلق كلياً افتراضياً (آمن).
2. كل جدول قابل للتعديل يحمل `version` (ADR 006) و`updated_at` تلقائي.
3. الأدوار في `user_roles` فقط — لا تُكرر في employees.
4. لتوليد الأنواع: `npm run db:types`.

## ERD مختصر
```
departments 1─* employees *─1 employees(manager)
employees 1─* requests / attendance_records / payslips / documents / it_tickets
auth.users 1─* login_attempts / app_errors (تبليغ الأخطاء من العميل)
payrolls 1─* payslips
auth.users 1─* user_roles      auth.users 1─1 employees(user_id)
audit_logs ← triggers من: employees/departments/requests/payrolls/payslips/budget/it_assets/user_roles
```
