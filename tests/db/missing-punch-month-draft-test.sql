-- depends: tests/db/missing-punch-month-preview-test.sql
set client_min_messages=warning;
select set_config('test.mpd_m',(date_trunc('month',app.hr_local_date(now()))-interval '3 months')::date::text,false);
-- أكثر من صفحة واحدة، كي لا تحفظ المسودة أول 200 موظف فقط.
insert into public.employees(id,employee_number,full_name,hire_date)
select ('40210000-0000-0000-0001-'||lpad(g::text,12,'0'))::uuid,'MPD-'||g,'موظف مسودة '||g,'2024-01-01'::date from generate_series(1,205) g;
insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
select id,current_setting('test.mpd_m')::date+1,(current_setting('test.mpd_m')::date+time '08:00') at time zone 'UTC','out','audit_backfill'
from public.employees where employee_number like 'MPD-%';
create function pg_temp.fail_approval() returns trigger language plpgsql as $$begin if new.status='approved' then raise exception 'TEST_APPROVAL_FAILURE'; end if; return new; end$$;
do $$ declare m date:=current_setting('test.mpd_m')::date; j jsonb; p1 jsonb; p2 jsonb; b jsonb; a jsonb; settings_ jsonb; x uuid; draft uuid; begin
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_draft_save(%L)',m),'HR_FORBIDDEN');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_draft_get(%L)',m),'HR_FORBIDDEN');
 assert not public.finance_missing_punch_draft_exists(m),'finance sees no draft';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40110000-0000-0000-0000-000000000002','ops-room.attendance','edit','deny','اختبار الصلاحية');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_draft_save(%L)',m),'PERMISSION_DENIED');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40110000-0000-0000-0000-000000000002','ops-room.attendance','edit',null);
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_draft_save(%L)',app.hr_local_date(now())),'HR_MISSING_MONTH_NOT_ENDED');
 assert not (public.ops_missing_punch_draft_get(m)->>'exists')::boolean,'no draft before save';
 select settings into settings_ from public.hr_policy where id=1;
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 update public.hr_policy set settings=settings-'missing_punch_threshold'-'missing_punch_fixed_amount' where id=1;
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_draft_save(%L)',m),'HR_MISSING_SETTINGS_REQUIRED');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 update public.hr_policy set settings=settings_ where id=1;
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');

 select jsonb_build_object('deductions',(select count(*) from public.hr_attendance_deductions),'exports',(select count(*) from public.hr_month_exports),
   'disclosures',(select count(*) from public.disclosures),'attendance',(select count(*) from public.hr_attendance_days)) into b;
 j:=public.ops_missing_punch_draft_save(m); draft:=(j->>'id')::uuid;
 assert (j->>'revision')::int=1 and (j->>'total_employees')::int=205,'save full list';
 j:=public.ops_missing_punch_draft_get(m,100,0);
 assert (j->>'exists')::boolean and jsonb_array_length(j->'rows')=100 and (j->>'total_employees')::int=205,'page one';
 j:=public.ops_missing_punch_draft_get(m,100,200);
 assert jsonb_array_length(j->'rows')=5 and (j->>'total_employees')::int=205,'last page';
 assert (select jsonb_array_length(snapshot->'rows')=205 from public.hr_missing_punch_month_draft_revisions where draft_id=draft and revision=1),'snapshot full';
 p1:=public.ops_missing_punch_month_preview(m,200,0); p2:=public.ops_missing_punch_month_preview(m,200,200);
 select snapshot into j from public.hr_missing_punch_month_draft_revisions where draft_id=draft and revision=1;
 assert (j-'rows')=(p1-'rows') and j->'rows'=(p1->'rows')||(p2->'rows'),'draft matches complete paged live preview';

 insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
 select id,m+2,(m+time '08:00') at time zone 'UTC','out','audit_backfill' from public.employees where employee_number='MPD-1';
 j:=public.ops_missing_punch_draft_get(m); assert (j->>'total_confirmed_days')::int=205,'draft remains frozen before refresh';
 j:=public.ops_missing_punch_draft_save(m); assert (j->>'revision')::int=2 and (j->>'total_confirmed_days')::int=206,'refresh new version';
 assert (select count(*)=2 from public.hr_missing_punch_month_draft_revisions where draft_id=draft),'prior version preserved';
 assert (select (snapshot->>'total_confirmed_days')::int=205 from public.hr_missing_punch_month_draft_revisions where draft_id=draft and revision=1),'prior version unchanged';
 select jsonb_build_object('deductions',(select count(*) from public.hr_attendance_deductions),'exports',(select count(*) from public.hr_month_exports),
   'disclosures',(select count(*) from public.disclosures),'attendance',(select count(*) from public.hr_attendance_days)) into a;
 assert a=b,'saving drafts must not change attendance or finances';
 insert into public.hr_month_exports(period_month,status,review_status,exported_at) values(m,'exported','approved',now()) returning id into x;
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40110000-0000-0000-0000-000000000004','finance.payroll','decide','deny','اختبار الصلاحية');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.finance_payroll_approve_discard_missing_draft(%L,false,true)',x),'PERMISSION_DENIED');
 assert exists(select 1 from public.hr_missing_punch_month_drafts where id=draft),'denied finance action cannot delete draft';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40110000-0000-0000-0000-000000000004','finance.payroll','decide',null);
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000004');
 assert public.finance_missing_punch_draft_exists(m),'finance sees only existence';
 perform pg_temp.expect_err(format('select public.finance_payroll_approve(%L,false)',x),'HR_MISSING_DRAFT_DELETE_CONFIRM');
 assert exists(select 1 from public.hr_missing_punch_month_drafts where id=draft),'old API cannot silently delete draft';
 perform pg_temp.expect_err(format('select public.finance_payroll_approve_discard_missing_draft(%L,false,false)',x),'HR_MISSING_DRAFT_DELETE_CONFIRM');
 -- Force a failure after the BEFORE trigger; the deletion must roll back with the transaction.
 execute 'create trigger z_test_approval_failure after update of status on public.hr_month_exports for each row execute function pg_temp.fail_approval()';
 perform pg_temp.expect_err(format('select public.finance_payroll_approve_discard_missing_draft(%L,false,true)',x),'TEST_APPROVAL_FAILURE');
 assert exists(select 1 from public.hr_missing_punch_month_drafts where id=draft),'failed financial close rolls deletion back';
 assert (select status='exported' from public.hr_month_exports where id=x),'failed financial close rolls status back';
 execute 'drop trigger z_test_approval_failure on public.hr_month_exports';
 perform public.finance_payroll_approve_discard_missing_draft(x,false,true);
 assert app.hr_month_locked(m),'financial export approved';
 assert not exists(select 1 from public.hr_missing_punch_month_drafts where id=draft),'confirmed draft fully removed';
 assert not exists(select 1 from public.hr_missing_punch_month_draft_revisions where draft_id=draft),'all draft versions removed';
 assert not exists(select 1 from app.hr_missing_punch_draft_close_intents),'intent cleaned';
 assert (select count(*) from public.hr_attendance_deductions)=(b->>'deductions')::int,'closure made no missing-punch deduction';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_draft_save(%L)',m),'HR_MONTH_LOCKED');
end$$;
do $$begin
 assert app.platform_reset_category_of('hr_missing_punch_month_drafts')='attendance','reset draft category';
 assert app.platform_reset_category_of('hr_missing_punch_month_draft_revisions')='attendance','reset versions category';
 assert exists(select 1 from app.data_retention_catalog() where table_name='hr_missing_punch_month_drafts' and not deletable),'retention draft';
 assert not has_table_privilege('authenticated','public.hr_missing_punch_month_drafts','select'),'no direct draft select';
 assert not has_table_privilege('authenticated','public.hr_missing_punch_month_draft_revisions','insert'),'no direct revision insert';
 assert not has_table_privilege('authenticated','app.hr_missing_punch_draft_close_intents','insert'),'no forged close intent';
 assert not has_function_privilege('anon','public.ops_missing_punch_draft_save(date)','execute'),'anon denied';
end$$;
select set_config('test.mpd_auth_m',(date_trunc('month',app.hr_local_date(now()))-interval '4 months')::date::text,false);
set role authenticated;
select set_config('auth.user_id','40110000-0000-0000-0000-000000000002',false);
do $$declare m date:=current_setting('test.mpd_auth_m')::date; begin
 perform public.ops_missing_punch_draft_save(m);
 assert (public.ops_missing_punch_draft_get(m)->>'exists')::boolean,'authenticated ops can save and read';
 perform pg_temp.expect_err('select count(*) from public.hr_missing_punch_month_drafts','permission denied');
 perform pg_temp.expect_err('insert into app.hr_missing_punch_draft_close_intents(transaction_id,export_id,actor) values(1,gen_random_uuid(),gen_random_uuid())','permission denied');
end$$;
select set_config('auth.user_id','40110000-0000-0000-0000-000000000004',false);
do $$declare m date:=current_setting('test.mpd_auth_m')::date; begin
 assert public.finance_missing_punch_draft_exists(m),'finance only sees existence';
 perform pg_temp.expect_err(format('select public.ops_missing_punch_draft_get(%L)',m),'HR_FORBIDDEN');
end$$;
reset role;
