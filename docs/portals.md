# البوابات والأدوار والصلاحيات

| البوابة | الدور | مسار JWT | المسار | ملاحظات |
|---------|-------|----------|--------|---------|
| Public | — | — | `/` | دخول/استعادة كلمة مرور |
| Employee | `employee` | `role: employee` | `/employee/*` | الافتراضي لكل موظف |
| HR | `hr_officer` | `role: hr_officer` | `/hr/*` | يدير الموظفين والأدوار والحضور والرواتب |
| Manager | `department_manager` | `role: department_manager` | `/manager/*` | **مسؤول قسم** — يرى قسمه فقط (يفرضه RLS) |
| Finance | `finance_officer` | `role: finance_officer` | `/finance/*` | الميزانية + اعتماد كشوف الرواتب |
| IT | `it_admin` | `role: it_admin` | `/it/*` | **التطوير المركزية** — المستخدمون + الفروع + التحكم الكامل |
| Admin | `super_admin` | `role: super_admin` | `/admin/*` | **مدير مفوض** — الإعدادات + التدقيق + MFA إلزامي |
| Field Ops | `field_ops` | `role: field_ops` | `/field-ops/*` | **العمليات الميدانية** — هيكل جاهز (فارغة) |
| Admin Ops | `admin_ops` | `role: admin_ops` | `/admin-ops/*` | **العمليات الإدارية** — هيكل جاهز (فارغة) |
| Maintenance | `maintenance` | `role: maintenance` | `/maintenance/*` | **الصيانة** — هيكل جاهز (فارغة) |
| Transfer Station | `transfer_station` | `role: transfer_station` | `/transfer-station/*` | **المحطة التحويلية** — هيكل جاهز (فارغة) |
| Executive | `executive_director` | `role: executive_director` | `/executive/*` | **المدير التنفيذي** — هيكل جاهز (فارغة) |
| Deputy | `deputy_director` | `role: deputy_director` | `/deputy/*` | **معاون المدير المفوض** — هيكل جاهز (فارغة) |
| Ops Room | `ops_room` | `role: ops_room` | `/ops-room/*` | **غرفة العمليات** — هيكل جاهز (فارغة) |

## تدفق الدخول
```
Login → Supabase Auth (JWT + custom_access_token_hook يحقن الدور الأساسي)
      → resolvePortal(user_roles):
          دور واحد      → دخول مباشر للبوابة
          البوابة الافتراضية → بوابة الدور ذي الأولوية العليا (ROLE_PRIORITY) — بلا شاشة اختيار
          استثناء صريح    → super_admin يدخل «التطوير المركزية» /it مباشرة (ROLE_DEFAULT_PORTAL)
      → portalGuard في loader كل بوابة (جلسة → بوابة → 403)
```

## مبدأ حاكم
الواجهة **حارس راحة** فقط. الحكم النهائي على كل قراءة/كتابة هو RLS في PostgreSQL —
اختبر دائماً عبر `tests/integration/rls.*.test.ts`.
