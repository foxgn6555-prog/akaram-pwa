-- depends: tests/db/missing-punch-month-preview-test.sql
set client_min_messages=warning;
select set_config('test.mpr_m',(date_trunc('month',app.hr_local_date(now()))-interval '2 months')::date::text,false);
do $$declare m date:=current_setting('test.mpr_m')::date; day_ date:=m+5; e uuid:='40110000-0000-0000-0000-000000000011'; j jsonb; c jsonb; draft uuid; x uuid; rev int; before_ jsonb; after_ jsonb; policy jsonb; begin
 insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
 values(e,day_,(day_+time '05:00')::timestamptz,'out','audit_backfill');
 assert app.hr_missing_punch_send_month(m)='sent','send report for recheck';
 select id,current_revision into draft,rev from public.hr_missing_punch_month_drafts where period_month=m;
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_recheck(%L,%s)',m,rev),'HR_FORBIDDEN');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_case(%L,%s,%L,%L)',m,rev,e,day_),'HR_FORBIDDEN');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_recheck(%L,%s)',m,rev),'HR_FORBIDDEN');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40110000-0000-0000-0000-000000000003','deputy.attendance-edits','execute','deny','اختبار الصلاحية');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_recheck(%L,%s)',m,rev),'PERMISSION_DENIED');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 perform public.it_user_permission_override_set('40110000-0000-0000-0000-000000000003','deputy.attendance-edits','execute',null);
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 j:=public.deputy_missing_punch_report(m); assert not (j->>'has_evidence')::boolean,'old sent report has no stored evidence';
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_case(%L,%s,%L,%L)',m,rev,e,day_),'HR_MISSING_RECHECK_REQUIRED');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_recheck(%L,%s)',m,rev+1),'HR_MISSING_REPORT_CHANGED');
 select jsonb_build_object('attendance',(select count(*) from public.hr_attendance_days),'deductions',(select count(*) from public.hr_attendance_deductions),
   'exports',(select count(*) from public.hr_month_exports),'payroll_rows',(select count(*) from public.hr_month_export_rows),'disclosures',(select count(*) from public.disclosures)) into before_;
 j:=public.deputy_missing_punch_report_recheck(m,rev); rev:=(j->>'revision')::int;
 assert rev=2 and (select status='sent' and updated_by=auth.uid() from public.hr_missing_punch_month_drafts where id=draft),'only refreshed version, not approval';
 assert (select count(*)=2 from public.hr_missing_punch_month_draft_revisions where draft_id=draft),'prior version preserved';
 assert (select evidence is not null and jsonb_array_length(evidence->'cases')=1 from public.hr_missing_punch_month_draft_revisions where draft_id=draft and revision=rev),'case evidence stored';
 j:=public.deputy_missing_punch_report(m); assert (j->>'has_evidence')::boolean and not (j->>'results_changed')::boolean and not (j->>'evidence_changed')::boolean,'fresh version';
 perform set_config('TimeZone','Asia/Baghdad',true);
 j:=public.deputy_missing_punch_report(m); assert not (j->>'evidence_changed')::boolean,'session timezone must not cause a false evidence difference';
 perform set_config('TimeZone','UTC',true);
 c:=public.deputy_missing_punch_report_case(m,rev,e,day_);
 assert c->>'source'='audit_backfill' and c->'evidence'->'register'->>'original' is not null,'saved original is reviewable';
 assert c->'shift'->>'shift_name'='preview shift','effective shift saved as evidence';
 update public.hr_shifts set name='preview shift changed' where id='40110000-0000-0000-0000-000000000020';
 j:=public.deputy_missing_punch_report(m);
 assert (j->>'evidence_changed')::boolean and not (j->>'results_changed')::boolean,'shift-only change detected';
 update public.hr_shifts set name='preview shift' where id='40110000-0000-0000-0000-000000000020';
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_case(%L,%s,%L,%L)',m,rev-1,e,day_),'HR_MISSING_REPORT_CHANGED');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_case(%L,%s,%L,%L)',m,rev,e,day_+1),'HR_NOT_FOUND');
 -- أدلة تتغير دون أن تتغير أيام الناقصة أو المبلغ؛ لا يعتمد فحص الأدلة على المجاميع فقط.
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001');
 select settings into policy from public.hr_policy where id=1;
 update public.hr_policy set settings=settings||'{"auto_evaluate_enabled":false}'::jsonb where id=1;
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
 values('RECHECK-BIO','mp40111',e,(day_+time '06:00')::timestamptz,'manual');
 update public.hr_policy set settings=policy where id=1;
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 j:=public.deputy_missing_punch_report(m);
 assert not (j->>'results_changed')::boolean and (j->>'evidence_changed')::boolean,'evidence-only change is detected';
 c:=public.deputy_missing_punch_report_case(m,rev,e,day_);
 assert jsonb_array_length(c->'evidence'->'punches')=0,'saved evidence stays frozen';
 j:=public.deputy_missing_punch_report_recheck(m,rev); rev:=(j->>'revision')::int;
 c:=public.deputy_missing_punch_report_case(m,rev,e,day_);
 assert jsonb_array_length(c->'evidence'->'punches')=1,'new version preserves new evidence';
 assert (select jsonb_array_length(evidence->'cases'->0->'evidence'->'punches')=0 from public.hr_missing_punch_month_draft_revisions where draft_id=draft and revision=2),'previous evidence version unchanged';
 j:=public.deputy_missing_punch_report(m); assert not (j->>'evidence_changed')::boolean,'refreshed evidence now matches';
 select jsonb_build_object('attendance',(select count(*) from public.hr_attendance_days),'deductions',(select count(*) from public.hr_attendance_deductions),
   'exports',(select count(*) from public.hr_month_exports),'payroll_rows',(select count(*) from public.hr_month_export_rows),'disclosures',(select count(*) from public.disclosures)) into after_;
 assert before_=after_,'recheck did not alter attendance, export, payroll or deductions';
 insert into public.hr_month_exports(period_month,status,review_status,exported_at) values(m,'exported','approved',now()) returning id into x;
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.finance_payroll_approve(%L,false)',x),'HR_MISSING_DRAFT_DELETE_CONFIRM');
 perform public.finance_payroll_approve_discard_missing_draft(x,false,true);
 assert not exists(select 1 from public.hr_missing_punch_month_drafts where id=draft),'finance deletion still works as before';
 assert not exists(select 1 from public.hr_missing_punch_month_draft_revisions where draft_id=draft),'all recheck revisions and evidence removed';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_report_recheck(%L,%s)',m,rev),'HR_MONTH_LOCKED');
end$$;
-- صلاحيات حقيقية أمام العميل، ولا كشف بيانات مجمّعة عبر الدالة الداخلية.
select set_config('test.mpr_m2',(date_trunc('month',app.hr_local_date(now()))-interval '4 months')::date::text,false);
select app.hr_missing_punch_send_month(current_setting('test.mpr_m2')::date);
select set_config('auth.user_id','40110000-0000-0000-0000-000000000003',false);
set role authenticated;
do $$declare m date:=current_setting('test.mpr_m2')::date; begin
 assert (public.deputy_missing_punch_report_recheck(m,1)->>'revision')::int=2,'authenticated deputy can recheck';
 perform pg_temp.expect_err(format('select app.hr_missing_punch_recheck_pack(%L)',m),'permission denied');
 perform pg_temp.expect_err('select evidence from public.hr_missing_punch_month_draft_revisions','permission denied');
end$$;
reset role;
-- أكثر من صفحة واحدة: تُحفظ كل الأدلة لا الصفحة الأولى فقط.
insert into public.employees(id,employee_number,full_name,hire_date)
select ('40410000-0000-0000-0001-'||lpad(g::text,12,'0'))::uuid,'MPR-'||g,'موظف تحقق '||g,'2024-01-01'::date from generate_series(1,205) g;
insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
select id,(date_trunc('month',app.hr_local_date(now()))-interval '5 months')::date+1,now()-interval '5 months','out','audit_backfill'
from public.employees where employee_number like 'MPR-%';
do $$declare m date:=(date_trunc('month',app.hr_local_date(now()))-interval '5 months')::date; j jsonb; c jsonb; begin
 assert app.hr_missing_punch_send_month(m)='sent','send full month';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 perform public.deputy_missing_punch_report_recheck(m,1);
 assert (select jsonb_array_length(r.evidence->'cases')=205 from public.hr_missing_punch_month_draft_revisions r join public.hr_missing_punch_month_drafts d on d.id=r.draft_id where d.period_month=m and r.revision=2),'all 205 evidence cases saved';
 j:=public.deputy_missing_punch_report(m,200,200); assert (j->>'total_employees')::int=205 and jsonb_array_length(j->'rows')=5,'last page remains accessible';
 c:=public.deputy_missing_punch_report_case(m,2,'40410000-0000-0000-0001-000000000205',m+1);
 assert c->>'employee_id'='40410000-0000-0000-0001-000000000205','case beyond first page accessible';
end$$;
-- المرشح الحي الملتبس ظاهر بأدلته، لكنه ليس سجلاً يمكن حسمه في لوحة المراجعة الحالية.
do $$declare m date:=(date_trunc('month',app.hr_local_date(now()))-interval '6 months')::date; e uuid:='40110000-0000-0000-0000-000000000012'; c jsonb; j jsonb; begin
 insert into public.hr_attendance_days(employee_id,work_date,status,source,check_in) values(e,m+1,'incomplete','manual',(m+1+time '05:00')::timestamptz);
 assert app.hr_missing_punch_send_month(m)='sent','send live candidate';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 perform public.deputy_missing_punch_report_recheck(m,1);
 j:=public.deputy_missing_punch_report(m); assert (j->>'total_review_days')::int=1,'live candidate remains review, not confirmed';
 c:=public.deputy_missing_punch_report_case(m,2,e,m+1);
 assert c->>'source'='current' and c->'register_id'='null'::jsonb,'live case is visibly unrecorded';
 assert (public.deputy_missing_punch_reviews(m)->>'total')::int=0,'no false claim live candidate can be decided';
end$$;
