# بوابة الموظف

> كل ما يخص هذه البوابة داخل هذا المجلد — لا شيء مبعثر.

## البنية
```
employee/
├── README.md          ← هذا الدليل
├── EmployeePortal.tsx   ← القوقعة (التخطيط)
├── routes.tsx         ← مسارات الصفحات (مرتبة)
└── pages/             ← كل صفحات البوابة (ملف لكل صفحة)
```

## الوحدات والصفحات

| الصفحة | المسار | الملف | الحالة |
|--------|--------|-------|--------|
| الرئيسية | /employee | pages/Dashboard/EmployeeDashboard.tsx | قيد التطوير |
| ملفي الشخصي | /employee/profile | pages/Profile/MyProfile.tsx | قيد التطوير |
| طلباتي | /employee/requests | pages/Requests/MyRequests.tsx | قيد التطوير |
| رواتبي | /employee/payslips | pages/Payroll/MyPayslips.tsx | قيد التطوير |
| وثائقي | /employee/documents | pages/Documents/MyDocuments.tsx | قيد التطوير |
| أصولي | /employee/my-assets | pages/Assets/MyAssets.tsx | قيد التطوير |

## القواعد
- الدور المخوّل: `employee` (+ super_admin للإشراف) — الحارس في loader البوابة، والحكم النهائي RLS.
- الصفحات التي لم يأتي دورها تعرض Placeholder — استبدل محتوى الملف بتنفيذك والمسار مربوط تلقائياً.
- المنطق المشترك يُكتب في `src/features/` — هذا المجلد للعرض فقط (قانون 4).
