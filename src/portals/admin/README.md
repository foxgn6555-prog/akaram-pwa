# بوابة الإدارة العليا

> كل ما يخص هذه البوابة داخل هذا المجلد — لا شيء مبعثر.

## البنية
```
admin/
├── README.md          ← هذا الدليل
├── AdminPortal.tsx   ← القوقعة (التخطيط)
├── routes.tsx         ← مسارات الصفحات (مرتبة)
└── pages/             ← كل صفحات البوابة (ملف لكل صفحة)
```

## الوحدات والصفحات

| الصفحة | المسار | الملف | الحالة |
|--------|--------|-------|--------|
| الرئيسية | /admin | pages/Dashboard/AdminDashboard.tsx | قيد التطوير |
| إدارة البوابات | /admin/portals | pages/Portals/PortalManager.tsx | قيد التطوير |
| الأدوار والصلاحيات | /admin/roles | pages/Portals/RoleAssignment.tsx | قيد التطوير |
| الإعدادات | /admin/settings | pages/Settings/GeneralSettings.tsx | قيد التطوير |
| سجل التدقيق | /admin/audit-logs | pages/AuditLogs/AuditLogViewer.tsx | قيد التطوير |
| النسخ الاحتياطي | /admin/backup | pages/Backup/DataBackup.tsx | قيد التطوير |

## القواعد
- الدور المخوّل: `super_admin` (+ super_admin للإشراف) — الحارس في loader البوابة، والحكم النهائي RLS.
- الصفحات التي لم يأتي دورها تعرض Placeholder — استبدل محتوى الملف بتنفيذك والمسار مربوط تلقائياً.
- المنطق المشترك يُكتب في `src/features/` — هذا المجلد للعرض فقط (قانون 4).
