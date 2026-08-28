-- ═══ اختبارات RLS عبر pgTAP ═══
-- التشغيل: pgalter / supabase test db (يتطلب extension pgTAP)
-- مبدأ الاختبار: لكل دور → authenticate as → تحقق من السماح/المنع
begin;
select plan(24);

-- مثال: الموظف يرى نفسه فقط
-- set jwt.claims.sub = '<employee-user-uuid>';
-- select is(
--   (select count(*) from public.employees), 1,
--   'الموظف يرى سجله فقط');

-- مثال: مدير القسم يقرأ طلبات قسمه ولا يقرأ طلبات أقسام أخرى
-- مثال: finance يقرأ payslips ولا يستطيع الكتابة في employees

select * from finish();
rollback;
