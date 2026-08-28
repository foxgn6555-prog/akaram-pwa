# بوابة الشؤون المالية

> كل ما يخص هذه البوابة داخل هذا المجلد — لا شيء مبعثر.

## البنية
```
finance/
├── README.md          ← هذا الدليل
├── FinancePortal.tsx   ← القوقعة (التخطيط)
├── routes.tsx         ← مسارات الصفحات (مرتبة)
└── pages/             ← كل صفحات البوابة (ملف لكل صفحة)
```

## الوحدات والصفحات

| الصفحة | المسار | الملف | الحالة |
|--------|--------|-------|--------|
| الرئيسية | /finance | pages/Dashboard/FinanceDashboard.tsx | قيد التطوير |
| الميزانية | /finance/budget | pages/Budget/BudgetOverview.tsx | قيد التطوير |
| الرواتب | /finance/payroll | pages/Payroll/PayrollOverview.tsx | قيد التطوير |
| التقارير المالية | /finance/reports | pages/Reports/FinancialReports.tsx | قيد التطوير |
| تقرير التدقيق | /finance/audit-report | pages/Reports/AuditReport.tsx | قيد التطوير |

## القواعد
- الدور المخوّل: `finance_officer` (+ super_admin للإشراف) — الحارس في loader البوابة، والحكم النهائي RLS.
- الصفحات التي لم يأتي دورها تعرض Placeholder — استبدل محتوى الملف بتنفيذك والمسار مربوط تلقائياً.
- المنطق المشترك يُكتب في `src/features/` — هذا المجلد للعرض فقط (قانون 4).
