# اتفاقية مجلدات البوابات — كل بوابة مجلد واحد شامل

> القاعدة: **لا شيء مبعثر** — كل ما يخص بوابة ما موجود داخل `src/portals/<portal>/` حصراً.

## البنية الموحدة لكل بوابة

```
src/portals/<portal>/
├── README.md        ← دليل البوابة (الوحدات + الصفحات + الأدوار + الحالة)
├── XPortal.tsx      ← القوقعة: التخطيط (شريط جانبي + هيدر) — بلا منطق أعمال
├── routes.tsx       ← مسارات البوابة، كل مسار → ملف صفحة داخل pages/
├── pages/           ← كل الصفحات — ملف مستقل لكل صفحة
│   └── <Unit>/Page.tsx
└── (components/ · hooks/ تُضاف هنا عند الحاجة الخاصة بالبوابة)
```

## القوانين

1. **صفحة جديدة = ملف جديد** داخل `pages/<الوحدة>/` + سطر واحد في `routes.tsx`.
2. الصفحات غير المنفذة تعرض `UnitPlaceholder` — استبدال المحتوى يكفي، المسار مربوط.
3. المنطق المشترك بين بوابات → `src/features/` (قانون 4: البوابات عرض فقط).
4. الحماية: `loader` البوابة في `src/router` + `allowedRoles` الصارمة + RLS في الخادم (الحاكم).
5. `buildPortalRoutes` (src/router/unit-routes) يضمن تلقائياً أن كل وحدة في الشريط الجانبي
   لها صفحة — اختبار الانحدار يمنع أي رابط يتيم.

## البوابات

| المجلد | البوابة | الدور الحصري | الحالة |
|--------|---------|--------------|--------|
| `src/portals/it/` | التطوير المركزية (تقنية المعلومات سابقاً) | it_admin + super_admin | ✅ مكتملة (8 صفحات حية) |
| `src/portals/hr/` | الموارد البشرية | hr_officer | صفحات Placeholder جاهزة للاستكمال |
| `src/portals/employee/` | الموظف | employee | Placeholder جاهزة |
| `src/portals/manager/` | مسؤول قسم | department_manager | صفحات جاهزة (Dashboard + فريق + اعتمادات) |
| `src/portals/finance/` | الشؤون المالية | finance_officer | Placeholder جاهزة |
| `src/portals/admin/` | مدير مفوض | super_admin | صفحات جاهزة (Dashboard حي + وحدات) |
| `src/portals/field-ops/` | العمليات الميدانية | field_ops + super_admin | فارغة — هيكل جاهز (00035) |
| `src/portals/admin-ops/` | العمليات الإدارية | admin_ops + super_admin | فارغة — هيكل جاهز (00035) |
| `src/portals/maintenance/` | الصيانة | maintenance + super_admin | فارغة — هيكل جاهز (00035) |
| `src/portals/transfer-station/` | المحطة التحويلية | transfer_station + super_admin | فارغة — هيكل جاهز (00035) |
| `src/portals/executive/` | المدير التنفيذي | executive_director + super_admin | فارغة — هيكل جاهز (00035) |
| `src/portals/deputy/` | معاون المدير المفوض | deputy_director + super_admin | فارغة — هيكل جاهز (00035) |
| `src/portals/ops-room/` | غرفة العمليات | ops_room + super_admin | فارغة — هيكل جاهز (00035) |
