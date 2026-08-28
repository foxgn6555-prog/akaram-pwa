# بوابة مدير القسم

> كل ما يخص هذه البوابة داخل هذا المجلد — لا شيء مبعثر.

## البنية
```
manager/
├── README.md          ← هذا الدليل
├── ManagerPortal.tsx   ← القوقعة (التخطيط)
├── routes.tsx         ← مسارات الصفحات (مرتبة)
└── pages/             ← كل صفحات البوابة (ملف لكل صفحة)
```

## الوحدات والصفحات

| الصفحة | المسار | الملف | الحالة |
|--------|--------|-------|--------|
| الرئيسية | /manager | pages/Dashboard/ManagerDashboard.tsx | قيد التطوير |
| فريقي | /manager/team | pages/Team/TeamOverview.tsx | قيد التطوير |
| الاعتمادات | /manager/approvals | pages/Approvals/PendingApprovals.tsx | قيد التطوير |
| الحضور | /manager/attendance | pages/Attendance/ManagerAttendance.tsx | قيد التطوير |
| تقارير القسم | /manager/reports | pages/Reports/DepartmentReports.tsx | قيد التطوير |

## القواعد
- الدور المخوّل: `department_manager` (+ super_admin للإشراف) — الحارس في loader البوابة، والحكم النهائي RLS.
- الصفحات التي لم يأتي دورها تعرض Placeholder — استبدل محتوى الملف بتنفيذك والمسار مربوط تلقائياً.
- المنطق المشترك يُكتب في `src/features/` — هذا المجلد للعرض فقط (قانون 4).
