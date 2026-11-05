-- depends: tests/db/attendance-missing-punch-guard-test.sql
-- 00368/00406: لا يظهر في الحضوريات ولا الرواتب إلا المرتبط ببصمة.
-- موظف بلا PIN: لا يبحث عنه في «تعديل جماعي»، لا يدخل نطاق طلبات التعديل،
-- ولا يدخل ملخص الشهر المغذي لكشف الرواتب حتى لو وجد له يوم يدوي قديم.
do $$declare e uuid:='ba000000-0000-0000-0000-000000000001'; d date:=(date_trunc('month',current_date)-interval '6 months'+interval '5 days')::date; m date:=date_trunc('month',d)::date; begin
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values(e,'AUD-NOPIN','فحص بلا ربط','2024-01-01',null);
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values(e,'39940000-0000-0000-0000-000000000020','2024-01-01');
-- يوم يدوي قديم (كما كان ممكناً قبل 00368) لا يجب أن يسرّبه إلى كشف الرواتب
insert into public.hr_attendance_days(employee_id,work_date,check_in,check_out,status,source)
values(e,d,pg_temp.bag(d,'16:00'),pg_temp.bag(d,'22:00'),'present','manual');
perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
-- البحث لا يعرض غير المرتبط
assert not exists(select 1 from public.attendance_edit_employee_search('فحص بلا ربط') where id=e), 'unlinked must not appear in employee search';
-- المعاينة والإنشاء يرفضان النطاق الفارغ بعد استبعاد غير المرتبط
perform pg_temp.expect_err(format('select public.attendance_edit_preview(%L,array[%L::uuid],array[%L::date],%L,%L::jsonb)','employees',e,d,'full_presence','{"missing_side":"out"}'),'ATT_EDIT_SCOPE_EMPTY');
perform pg_temp.expect_err(format('select public.attendance_edit_create(%L,array[%L::uuid],array[%L::date],%L,%L::jsonb,%L,%L)','employees',e,d,'full_presence','{"missing_side":"out"}','إثبات حضور موثق','hr_request'),'ATT_EDIT_SCOPE_EMPTY');
-- ملخص الشهر (مصدر صفوف كشف الرواتب) لا يتضمن غير المرتبط رغم يومه اليدوي
assert not exists(select 1 from app.hr_month_summary(m) where employee_id=e), 'unlinked must not appear in payroll month summary';
-- والمرتبط ببصمة ما زال يعمل (موظف fixture MP-3 بلا بصمات في يوم آخر)
assert exists(select 1 from public.attendance_edit_employee_search('MP-3')), 'linked employee must remain searchable';
raise notice 'LINKED_ONLY_OK: unlinked excluded from search, edit scope and payroll summary';
end$$;
