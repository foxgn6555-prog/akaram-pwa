-- depends: tests/db/attendance-missing-punch-guard-test.sql
-- السلسلة الكاملة: تصحيح بصمة + زمنية ثم اعتماد وتصدير ومطابقة كشف المالية.
do $$declare e record; m date:=date_trunc('month',current_setting('test.mpday')::date)::date; x uuid; r record; f record; expected_min int; expected_days numeric; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000004');
 for e in select id from public.employees where employee_number like 'MP-%' loop
  perform public.finance_salary_set(e.id,'monthly',600000,0,'{}','{}',null);
 end loop;
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 perform public.ops_attendance_confirm(m);
 select coalesce(sum(proposed_deduction_minutes),0),coalesce(sum(proposed_deduction_days),0) into expected_min,expected_days
 from public.hr_attendance_days where employee_id='39940000-0000-0000-0000-000000000012' and date_trunc('month',work_date)=m and not deduction_waived;
 assert (select shortfall_minutes=30 from public.hr_attendance_days where employee_id='39940000-0000-0000-0000-000000000012' and work_date=current_setting('test.mpday')::date+13), 'permit + corrected punch retains 30 minute deficit';
 x:=public.ops_month_export(m);
 select * into r from public.hr_month_export_rows where export_id=x and employee_id='39940000-0000-0000-0000-000000000012';
 assert r.id is not null and r.auto_deduction_minutes=expected_min and r.auto_deduction_days=expected_days and r.unevaluated_days=0,'export matches day calculations: '||row_to_json(r)::text;
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000003'); perform public.deputy_payroll_approve(x);
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000004');
 select * into f from public.finance_payroll_sheet(m) where employee_id='39940000-0000-0000-0000-000000000012';
 assert f.auto_deduction_minutes=r.auto_deduction_minutes and f.auto_deduction_days=r.auto_deduction_days and f.auto_deduction_amount=r.auto_deduction_amount,'finance and ops differ: '||row_to_json(f)::text;
end$$;
