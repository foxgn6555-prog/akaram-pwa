-- 00399-أ: تمييز الزمنية في كشف الحضور ومجاميعه فقط، بلا تعديل لسجلات الحضور أو كشوف المالية.
insert into auth.users (id, email) values
 ('39910000-0000-0000-0000-000000000001', 'permit-grid@test.invalid'),
 ('39910000-0000-0000-0000-000000000002', 'permit-grid-employee@test.invalid');
insert into public.user_roles (user_id, role) values ('39910000-0000-0000-0000-000000000001', 'ops_room');
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values
 ('39910000-0000-0000-0000-000000000003', 'PERMIT-GRID', 'اختبار عرض الزمنية', '2024-01-01', '399101');
select auth.set_test_user('39910000-0000-0000-0000-000000000001');
do $$ declare m date := (date_trunc('month', current_date) - interval '2 months')::date; e uuid := '39910000-0000-0000-0000-000000000003'; x record; before_rows jsonb; after_rows jsonb; ex uuid;
begin
  insert into public.hr_attendance_days(employee_id,work_date,status,source) values
   (e,m+1,'present','manual'), (e,m+2,'time_permit','manual'), (e,m+3,'leave','manual'), (e,m+4,'absent','manual');
  select jsonb_agg(to_jsonb(a) order by work_date) into before_rows from public.hr_attendance_days a where employee_id=e;
  select * into x from public.ops_attendance_month_grid(m,null,null,'PERMIT-GRID');
  assert x.present_days = 2 and x.leave_days = 1 and x.absent_days = 1, 'زمنية ضمن الحضور لا الإجازة: ' || row_to_json(x)::text;
  assert (select c ->> 's' from jsonb_array_elements(x.days) c where c ->> 'd' = (m+2)::text) = 'time_permit', 'حالة الزمنية مستقلة';
  assert (select c ->> 's' from jsonb_array_elements(x.days) c where c ->> 'd' = (m+3)::text) = 'leave', 'الإجازة مستقلة';
  -- نفس القراءة بعد إقفال المالية؛ لا تلمس الحضور ولا سجل التصدير.
  insert into public.hr_month_exports(period_month,status) values (m,'approved') returning id into ex;
  select * into x from public.ops_attendance_month_grid(m,null,null,'PERMIT-GRID');
  assert x.present_days = 2 and x.leave_days = 1, 'تصنيف القراءة للمقفل';
  select jsonb_agg(to_jsonb(a) order by work_date) into after_rows from public.hr_attendance_days a where employee_id=e;
  assert before_rows = after_rows, 'القراءة لم تغير أيام الحضور';
  assert (select status from public.hr_month_exports where id=ex) = 'approved', 'التصدير المقفل لم يتغير';
end $$;
set role authenticated;
select auth.set_test_user('39910000-0000-0000-0000-000000000002');
do $$ begin
 assert (select count(*) from public.ops_attendance_month_grid((date_trunc('month',current_date) - interval '2 months')::date)) = 0, 'لا يقرأ الموظف كشف العمليات';
end $$;

reset role;
