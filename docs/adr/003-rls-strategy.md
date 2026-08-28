# ADR 003 — استراتيجية RLS

**الحالة:** مقبول · **التاريخ:** 2026-08

## القرار
1. **سياسات كل جدول داخل migration الجدول نفسه** (تصحيح عن v3: كانت في ملف 00011 واحد ضخم).
2. دوال helpers في مخطط `app` (`has_role`, `current_employee_id`...) تلف بـ `(select ...)` في كل policy لأداء InitPlan.
3. المصدر الوحيد للأدوار: جدول `user_roles` — JWT يحمل الدور الأساسي فقط عبر `custom_access_token_hook`.
4. Workflow transitions تفرضها triggers في DB، والواجهة تعكسها فقط (status.constants mirror).

## النتيجة
الأمان حاكم في الخادم مهما خُطئ في الواجهة. ملفات migration قابلة للمراجعة سطراً بسطر.
