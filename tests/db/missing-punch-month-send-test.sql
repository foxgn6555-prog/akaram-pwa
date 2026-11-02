-- depends: tests/db/missing-punch-month-preview-test.sql
set client_min_messages=warning;
select set_config('test.mps_m',(date_trunc('month',app.hr_local_date(now()))-interval '2 months')::date::text,false);
create function pg_temp.test_send_close_failure() returns trigger language plpgsql as $$begin if new.status='approved' then raise exception 'TEST_CLOSE_FAILURE'; end if; return new; end$$;
do $$declare m date:=current_setting('test.mps_m')::date; j jsonb; before_ jsonb; after_ jsonb; draft uuid; x uuid; policy jsonb; begin
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 select settings into policy from public.hr_policy where id=1;
 update public.hr_policy set settings=settings-'missing_punch_threshold'-'missing_punch_fixed_amount' where id=1;
 perform pg_temp.expect_err(format('select app.hr_missing_punch_send_month(%L)',m),'HR_MISSING_SETTINGS_REQUIRED');
 assert not exists(select 1 from public.hr_missing_punch_month_drafts where period_month=m),'unconfigured sends nothing';
 update public.hr_policy set settings=policy where id=1;
 perform pg_temp.expect_err(format('select app.hr_missing_punch_send_month(%L)',app.hr_local_date(now())),'HR_MISSING_MONTH_NOT_ENDED');
 insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
 values('40110000-0000-0000-0000-000000000011',m+1,(m+1+time '05:00')::timestamptz,'out','audit_backfill');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 j:=public.ops_missing_punch_draft_save(m); draft:=(j->>'id')::uuid;
 insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
 values('40110000-0000-0000-0000-000000000011',m+2,(m+2+time '05:00')::timestamptz,'out','audit_backfill');
 select jsonb_build_object('deductions',(select count(*) from public.hr_attendance_deductions),'attendance',(select count(*) from public.hr_attendance_days),
   'exports',(select count(*) from public.hr_month_exports),'disclosures',(select count(*) from public.disclosures)) into before_;
 perform set_config('auth.user_id','',false); -- المجدول بلا هوية مستخدم
 assert app.hr_missing_punch_send_month(m)='sent','automated worker sends without impersonating a user';
 assert app.hr_missing_punch_send_month(m)='already_sent','retries are idempotent';
 assert (select status='sent' and sent_at is not null and current_revision=2 and updated_by is null from public.hr_missing_punch_month_drafts where id=draft),'draft converted to immutable sent revision';
 assert (select count(*)=2 from public.hr_missing_punch_month_draft_revisions where draft_id=draft),'previous draft preserved';
 assert (select (snapshot->>'total_confirmed_days')::int=2 from public.hr_missing_punch_month_draft_revisions where draft_id=draft and revision=2),'send recalculates current data';
 assert (select count(*)=1 from public.notifications where entity_type='missing_punch_month_report' and entity_id=draft),'one notification per deputy';
 assert (select link like '%tab=missing-punch-report%' and user_id='40110000-0000-0000-0000-000000000003' from public.notifications where entity_type='missing_punch_month_report' and entity_id=draft),'notification opens deputy report';
 select jsonb_build_object('deductions',(select count(*) from public.hr_attendance_deductions),'attendance',(select count(*) from public.hr_attendance_days),
   'exports',(select count(*) from public.hr_month_exports),'disclosures',(select count(*) from public.disclosures)) into after_;
 assert before_=after_,'send does not write attendance, payroll, disclosures or deductions';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_draft_save(%L)',m),'HR_MISSING_REPORT_SENT');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report(%L)',m),'HR_FORBIDDEN');
 j:=public.ops_missing_punch_draft_get(m); assert j->>'status'='sent' and j->>'sent_at' is not null,'ops sees sent status';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000004');
 assert public.finance_missing_punch_draft_exists(m),'finance sees existence, not details';
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report(%L)',m),'HR_FORBIDDEN');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40110000-0000-0000-0000-000000000003','deputy.attendance-edits','view','deny','اختبار الصلاحية');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report(%L)',m),'PERMISSION_DENIED');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40110000-0000-0000-0000-000000000003','deputy.attendance-edits','view',null);
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 j:=public.deputy_missing_punch_report(m,1,0);
 assert (j->>'exists')::boolean and (j->>'total_confirmed_days')::int=2 and not (j->>'results_changed')::boolean,'deputy receives correct report';
 assert not (j->>'automatic_send_scheduled')::boolean,'without pg_cron no false scheduling guarantee';
 insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
 values('40110000-0000-0000-0000-000000000011',m+3,(m+3+time '05:00')::timestamptz,'out','audit_backfill');
 j:=public.deputy_missing_punch_report(m); assert (j->>'results_changed')::boolean and (j->>'total_confirmed_days')::int=2,'changed live results warn while sent snapshot stays immutable';
 insert into public.hr_month_exports(period_month,status,review_status,exported_at) values(m,'exported','approved',now()) returning id into x;
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.finance_payroll_approve(%L,false)',x),'HR_MISSING_DRAFT_DELETE_CONFIRM');
 assert exists(select 1 from public.hr_missing_punch_month_drafts where id=draft),'old finance call cannot silently discard sent report';
 execute 'create trigger z_test_send_close_failure after update of status on public.hr_month_exports for each row execute function pg_temp.test_send_close_failure()';
 perform pg_temp.expect_err(format('select public.finance_payroll_approve_discard_missing_draft(%L,false,true)',x),'TEST_CLOSE_FAILURE');
 assert exists(select 1 from public.hr_missing_punch_month_drafts where id=draft),'failed finance close rolls back report';
 assert exists(select 1 from public.notifications where entity_type='missing_punch_month_report' and entity_id=draft),'failed finance close restores notification';
 execute 'drop trigger z_test_send_close_failure on public.hr_month_exports';
 perform public.finance_payroll_approve_discard_missing_draft(x,false,true);
 assert not exists(select 1 from public.hr_missing_punch_month_drafts where id=draft),'confirmed finance close deletes report';
 assert not exists(select 1 from public.hr_missing_punch_month_draft_revisions where draft_id=draft),'all revisions deleted';
 assert not exists(select 1 from public.notifications where entity_type='missing_punch_month_report' and entity_id=draft),'report notifications removed with request';
 assert app.hr_missing_punch_send_month(m)='locked','closed month cannot recreate sent report';
 assert (select count(*) from public.hr_attendance_deductions)=(before_->>'deductions')::int,'no deduction from sent report';
end$$;
-- الجدولة تستدرك الأشهر منذ التفعيل وتعيد محاولة الإعدادات المفقودة دون تزوير وقت انتهائها.
do $$declare m date:=(date_trunc('month',app.hr_local_date(now()))-interval '4 months')::date; t timestamptz:=(app.hr_local_date(now())+time '00:15') at time zone 'Asia/Baghdad'; policy jsonb; begin
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 update app.hr_missing_punch_auto_config set start_month=m where singleton;
 select settings into policy from public.hr_policy where id=1;
 update public.hr_policy set settings=settings-'missing_punch_threshold'-'missing_punch_fixed_amount' where id=1;
 perform app.hr_missing_punch_run_due(t-interval '1 hour');
 perform app.hr_missing_punch_run_due(t+interval '15 minutes');
 assert not exists(select 1 from public.hr_missing_punch_month_drafts where period_month=m),'wrong local hour does not send';
 perform app.hr_missing_punch_run_due(t);
 assert not exists(select 1 from public.hr_missing_punch_month_drafts where period_month=m),'missing settings does not create report';
 assert exists(select 1 from public.integration_logs where endpoint='missing_punch_month_send' and status='error' and payload->>'month'=m::text),'failed month is logged';
 update public.hr_policy set settings=policy where id=1;
 perform app.hr_missing_punch_run_due(t);
 assert exists(select 1 from public.hr_missing_punch_month_drafts where period_month=m and status='sent'),'scheduler retries missed month';
 assert not exists(select 1 from public.hr_missing_punch_month_drafts where period_month=current_setting('test.mps_m')::date),'scheduler skips finance-locked month';
 perform app.hr_missing_punch_run_due(t);
 assert (select current_revision=1 from public.hr_missing_punch_month_drafts where period_month=m),'scheduler does not duplicate';
end$$;
-- صلاحية فعلية للدور authenticated وعزل الجداول والدوال الداخلية.
select set_config('test.mps_auto',(date_trunc('month',app.hr_local_date(now()))-interval '4 months')::date::text,false);
select set_config('auth.user_id','40110000-0000-0000-0000-000000000003',false);
set role authenticated;
do $$declare m date:=current_setting('test.mps_auto')::date; begin
 assert (public.deputy_missing_punch_report(m)->>'exists')::boolean,'authenticated deputy can read';
 perform pg_temp.expect_err(format('select app.hr_missing_punch_send_month(%L)',m),'permission denied');
 perform pg_temp.expect_err('select app.hr_missing_punch_run_scheduled()','permission denied');
 perform pg_temp.expect_err('select count(*) from public.hr_missing_punch_month_drafts','permission denied');
end$$;
reset role;

-- لقطة كاملة تتجاوز حد صفحة المعاينة، مع مقارنة الصفحات والإجماليات.
insert into public.employees(id,employee_number,full_name,hire_date)
select ('40310000-0000-0000-0001-'||lpad(g::text,12,'0'))::uuid,'MPS-'||g,'موظف وارد '||g,'2024-01-01'::date from generate_series(1,205) g;
insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
select id,(date_trunc('month',app.hr_local_date(now()))-interval '5 months')::date+1,now()-interval '5 months','out','audit_backfill'
from public.employees where employee_number like 'MPS-%';
do $$declare m date:=(date_trunc('month',app.hr_local_date(now()))-interval '5 months')::date; p1 jsonb; p2 jsonb; j jsonb; begin
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 p1:=public.ops_missing_punch_month_preview(m,200,0); p2:=public.ops_missing_punch_month_preview(m,200,200);
 perform set_config('auth.user_id','',false); assert app.hr_missing_punch_send_month(m)='sent','send complete report';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 j:=public.deputy_missing_punch_report(m,200,0);
 assert (j->>'total_employees')::int=205 and jsonb_array_length(j->'rows')=200,'first page and full total';
 assert j->'rows'=p1->'rows','first page matches live preview';
 j:=public.deputy_missing_punch_report(m,200,200);
 assert jsonb_array_length(j->'rows')=5 and j->'rows'=p2->'rows','second page not truncated';
end$$;

-- إذا تعذر إنشاء إشعار المعاون فلا يُحفظ كشف مرسل ناقص، ويجوز للمجدول المحاولة لاحقاً.
create function pg_temp.fail_send_notification() returns trigger language plpgsql as $$begin if new.entity_type='missing_punch_month_report' then raise exception 'TEST_NOTIFICATION_FAILURE'; end if; return new; end$$;
create trigger z_test_send_notification before insert on public.notifications for each row execute function pg_temp.fail_send_notification();
do $$declare m date:=(date_trunc('month',app.hr_local_date(now()))-interval '6 months')::date; begin
 perform pg_temp.expect_err(format('select app.hr_missing_punch_send_month(%L)',m),'TEST_NOTIFICATION_FAILURE');
 assert not exists(select 1 from public.hr_missing_punch_month_drafts where period_month=m),'notification error rolls back sending';
end$$;
drop trigger z_test_send_notification on public.notifications;
-- إصلاح الجدولة محصور بالتطوير، ولا يدعي النجاح عند غياب الإضافة.
insert into auth.users(id,email) values('40310000-0000-0000-0000-000000000999','schedule-it@t.iq');
insert into public.user_roles(user_id,role) values('40310000-0000-0000-0000-000000000999','it_admin');
do $$ begin
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 perform pg_temp.expect_err('select public.it_missing_punch_schedule_repair()','IT_FORBIDDEN');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40310000-0000-0000-0000-000000000999','it.integrations.auto-deductions','edit','deny','اختبار الجدولة');
 perform pg_temp.as_user('40310000-0000-0000-0000-000000000999');
 perform pg_temp.expect_err('select public.it_missing_punch_schedule_repair()','PERMISSION_DENIED');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40310000-0000-0000-0000-000000000999','it.integrations.auto-deductions','edit',null);
 perform pg_temp.as_user('40310000-0000-0000-0000-000000000999');
 perform pg_temp.expect_err('select public.it_missing_punch_schedule_repair()','HR_CRON_UNAVAILABLE');
end$$;
do $$begin
 assert exists(select 1 from app.data_retention_catalog() where data_key='hr_missing_punch_month_drafts' and not deletable and description like '%مرسل%'),'retention catalog describes sent report and remains protected';
 assert app.platform_reset_category_of('hr_missing_punch_month_drafts')='attendance','reset category preserved';
end$$;
