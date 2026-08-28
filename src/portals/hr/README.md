# بوابة الموارد البشرية

> كل ما يخص هذه البوابة داخل هذا المجلد — لا شيء مبعثر.

## البنية
```
hr/
├── README.md          ← هذا الدليل
├── HrPortal.tsx   ← القوقعة (التخطيط)
├── routes.tsx         ← مسارات الصفحات (مرتبة)
└── pages/             ← كل صفحات البوابة (ملف لكل صفحة)
```

## الوحدات والصفحات

| الصفحة | المسار | الملف | الحالة |
|--------|--------|-------|--------|
| الرئيسية | /hr | pages/Dashboard/HRDashboard.tsx | قيد التطوير |
| الموظفون | /hr/employees | pages/Employees/EmployeesList.tsx | قيد التطوير |
| الطلبات | /hr/requests | pages/Requests/AllRequests.tsx | قيد التطوير |
| الحضور | /hr/attendance | pages/Attendance/AttendanceLog.tsx | قيد التطوير |
| الرواتب | /hr/payroll | pages/Payroll/PayrollManager.tsx | قيد التطوير |
| التقارير | /hr/reports | pages/Reports/HRReports.tsx | قيد التطوير |

## القواعد
- الدور المخوّل: `hr_officer` (+ super_admin للإشراف) — الحارس في loader البوابة، والحكم النهائي RLS.
- الصفحات التي لم يأتي دورها تعرض Placeholder — استبدل محتوى الملف بتنفيذك والمسار مربوط تلقائياً.
- المنطق المشترك يُكتب في `src/features/` — هذا المجلد للعرض فقط (قانون 4).
