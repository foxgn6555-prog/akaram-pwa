-- depends: tests/db/disclosures-finance-chain-test.sql
set client_min_messages=warning;
insert into auth.users(id,email) values('40230000-0000-0000-0000-000000000001','recheck-real-it@t.iq');
insert into public.user_roles(user_id,role) values('40230000-0000-0000-0000-000000000001','it_admin');
select auth.set_test_user('40230000-0000-0000-0000-000000000001');
select public.it_missing_punch_settings_set(1,1000);
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$declare m date:=(date_trunc('month',current_date)-interval '5 months')::date; x uuid; d uuid; before_count int; before_salary jsonb; after_salary jsonb; begin
 insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
 values('fc000000-0000-0000-0000-0000000000e9',m+5,(m+5+time '08:00') at time zone 'UTC','out','audit_backfill');
 x:=public.ops_month_export_reviewed(m);
 before_salary:=(select jsonb_agg(jsonb_build_object('id',r.id,'net',r.final_net,'ded',r.ops_deduction_amount) order by r.id) from public.hr_month_export_rows r where r.export_id=x);
 select count(*) into before_count from public.hr_attendance_deductions;
 d:=(public.ops_missing_punch_draft_save(m)->>'id')::uuid;
 perform auth.set_test_user(null);
 assert app.hr_missing_punch_send_month(m)='sent','scheduled send from actual export';
 assert (select count(*) from public.hr_month_export_rows where export_id=x)>0,'real export has employees';
 perform auth.set_test_user('fc000000-0000-0000-0000-000000000003');
 assert (public.deputy_missing_punch_report_recheck(m,2)->>'revision')::int=3,'deputy rechecks report';
 after_salary:=(select jsonb_agg(jsonb_build_object('id',r.id,'net',r.final_net,'ded',r.ops_deduction_amount) order by r.id) from public.hr_month_export_rows r where r.export_id=x);
 assert before_salary=after_salary,'recheck did not alter real payroll';
 assert (select count(*) from public.hr_attendance_deductions)=before_count,'recheck added no deduction';
 perform auth.set_test_user('fc000000-0000-0000-0000-000000000007');
 assert public.finance_missing_punch_draft_exists(m),'sent report presented to finance';
 perform public.finance_payroll_approve_discard_missing_draft(x,false,true);
 after_salary:=(select jsonb_agg(jsonb_build_object('id',r.id,'net',r.final_net,'ded',r.ops_deduction_amount) order by r.id) from public.hr_month_export_rows r where r.export_id=x);
 assert before_salary=after_salary,'rechecked report closure did not alter payroll rows';
 assert (select count(*) from public.hr_attendance_deductions)=before_count,'rechecked report closure adds no deduction';
 assert app.hr_month_locked(m) and not exists(select 1 from public.hr_missing_punch_month_drafts where id=d),'real finance close deletes report';
end$$;
