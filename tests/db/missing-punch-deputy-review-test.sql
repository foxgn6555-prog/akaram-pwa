set client_min_messages=warning;
insert into auth.users(id,email) values
 ('40130000-0000-0000-0000-000000000001','mpr-it@test.invalid'),('40130000-0000-0000-0000-000000000002','mpr-ops@test.invalid'),
 ('40130000-0000-0000-0000-000000000003','mpr-deputy@test.invalid'),('40130000-0000-0000-0000-000000000004','mpr-finance@test.invalid'),
 ('40130000-0000-0000-0000-000000000005','mpr-super@test.invalid');
insert into public.user_roles(user_id,role) values
 ('40130000-0000-0000-0000-000000000001','it_admin'),('40130000-0000-0000-0000-000000000002','ops_room'),
 ('40130000-0000-0000-0000-000000000003','deputy_director'),('40130000-0000-0000-0000-000000000004','finance_officer'),('40130000-0000-0000-0000-000000000005','super_admin');
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
 ('40130000-0000-0000-0000-000000000010','MR-1','مراجعة 1','2024-01-01','mr1');
insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values
 ('40130000-0000-0000-0000-000000000020','review shift','08:00','16:00',0,'{0,1,2,3,4,5,6}');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values
 ('40130000-0000-0000-0000-000000000010','40130000-0000-0000-0000-000000000020','2024-01-01');
create function pg_temp.as_user(p uuid) returns void language sql as $$select set_config('auth.user_id',p::text,false)$$;
create function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$
begin begin execute q; exception when others then if position(code in sqlerrm)>0 then return; else raise; end if; end; raise exception 'TEST_FAIL expected %',code; end$$;
create function pg_temp.month() returns date language sql as $$select (date_trunc('month',app.hr_local_date(now()))-interval '2 month')::date$$;
update public.hr_policy set settings=settings||'{"auto_evaluate_enabled":false}'::jsonb where id=1;
insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
select 'REVIEW','mr1','40130000-0000-0000-0000-000000000010',((pg_temp.month()+4+v.t)::timestamp-interval '3 hours') at time zone 'UTC','manual'
from (values(time '08:00'),(time '16:00')) v(t);
insert into public.hr_missing_punch_register(id,employee_id,work_date,original_punch,detected_by,requires_review,later_punch)
values('40130000-0000-0000-0000-000000000030','40130000-0000-0000-0000-000000000010',pg_temp.month()+4,
 ((pg_temp.month()+4+time '08:00')::timestamp-interval '3 hours') at time zone 'UTC','daily_snapshot',false,
 ((pg_temp.month()+4+time '16:00')::timestamp-interval '3 hours') at time zone 'UTC');
do $$declare m date:=pg_temp.month(); v_id uuid:='40130000-0000-0000-0000-000000000030'; j jsonb; row_ jsonb; h text; after_ jsonb; before_ jsonb; begin
 perform pg_temp.as_user('40130000-0000-0000-0000-000000000001'); perform public.it_missing_punch_settings_set(1,1000);
 perform pg_temp.as_user('40130000-0000-0000-0000-000000000002');
 j:=public.ops_missing_punch_month_preview(m); assert (j->>'total_confirmed_days')::int=0 and (j->>'total_review_days')::int=1 and (j->>'total_proposed_amount')::numeric=0,'ambiguous initially excluded';
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_reviews(%L)',m),'HR_FORBIDDEN');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_review_decide(%L,%L,%L,%L)',v_id,'confirmed','سبب تحقق صحيح','x'),'HR_FORBIDDEN');
 perform pg_temp.as_user('40130000-0000-0000-0000-000000000005');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_reviews(%L)',m),'HR_FORBIDDEN');
 perform pg_temp.as_user('40130000-0000-0000-0000-000000000003');
 j:=public.deputy_missing_punch_reviews(m); assert (j->>'total')::int=1 and jsonb_array_length(j->'rows')=1,'candidate list';
 row_:=j->'rows'->0; h:=row_->>'evidence_hash'; assert jsonb_array_length(row_->'evidence'->'punches')=2,'actual punch evidence shown';
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_review_decide(%L,%L,%L,%L)',v_id,'confirmed','قصير',h),'HR_REVIEW_REASON_REQUIRED');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_review_decide(%L,%L,%L,%L)',v_id,'x','التحقق من دليل الجهاز','x'),'HR_REVIEW_DECISION_INVALID');
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_review_decide(%L,%L,%L,%L)',v_id,'confirmed','التحقق من دليل الجهاز','wrong'),'HR_REVIEW_EVIDENCE_CHANGED');
 select jsonb_build_object('deductions',(select count(*) from public.hr_attendance_deductions),'exports',(select count(*) from public.hr_month_exports),'disclosures',(select count(*) from public.disclosures),'attendance',(select count(*) from public.hr_attendance_days)) into before_;
 perform public.deputy_missing_punch_review_decide(v_id,'excluded','راجعت دليل الجهاز واستبعدتها',h);
 j:=public.ops_missing_punch_register(m); assert j->'rows'->0->>'deputy_decision'='excluded','register displays current exclusion';
 j:=public.ops_missing_punch_month_preview(m); row_:=j->'rows'->0;
 assert (row_->>'confirmed_days')::int=0 and (row_->>'review_days')::int=0 and (row_->>'excluded_review_days')::int=1,'exclusion classification';
 j:=public.deputy_missing_punch_reviews(m); row_:=j->'rows'->0; assert row_->>'current_decision'='excluded' and row_->>'last_reason'='راجعت دليل الجهاز واستبعدتها','decision shown';
 perform public.deputy_missing_punch_review_decide(v_id,'confirmed','راجعت دليل الجهاز وأكدت النقص',row_->>'evidence_hash');
 j:=public.ops_missing_punch_month_preview(m); row_:=j->'rows'->0;
 assert (row_->>'confirmed_days')::int=1 and (row_->>'proposed_amount')::numeric=1000,'confirmed evidence enters preview only';
 assert (select count(*)=2 from public.hr_missing_punch_review_decisions where register_id=v_id),'append-only history';
 -- Re-pulling the identical punch and updating raw metadata do not invalidate it.
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
 ('REVIEW','mr1','40130000-0000-0000-0000-000000000010',((m+4+time '08:00')::timestamp-interval '3 hours') at time zone 'UTC','manual') on conflict do nothing;
 update public.biometric_punches set raw='{"pulled_again":true}'::jsonb where employee_id='40130000-0000-0000-0000-000000000010';
 assert (public.ops_missing_punch_month_preview(m)->>'total_confirmed_days')::int=1,'identical pull and irrelevant metadata preserve review';
 -- Arrival with auto evaluation off still invalidates the decision, including middle timestamps.
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
 ('REVIEW','mr1','40130000-0000-0000-0000-000000000010',((m+4+time '12:00')::timestamp-interval '3 hours') at time zone 'UTC','manual');
 j:=public.ops_missing_punch_month_preview(m); assert (j->>'total_confirmed_days')::int=0 and (j->>'total_review_days')::int=1,'new evidence invalidates prior decision';
 assert public.ops_missing_punch_register(m)->'rows'->0->'deputy_decision'='null'::jsonb,'register does not display stale decision';
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_review_decide(%L,%L,%L,%L)',v_id,'confirmed','التحقق من دليل الجهاز',h),'HR_REVIEW_EVIDENCE_CHANGED');
 j:=public.deputy_missing_punch_reviews(m); row_:=j->'rows'->0;
 assert row_->'current_decision'='null'::jsonb and row_->>'last_decision'='confirmed' and jsonb_array_length(row_->'evidence'->'punches')=3,'stale decision and new evidence visible';
 perform public.deputy_missing_punch_review_decide(v_id,'confirmed','راجعت جميع البصمات والجهاز',row_->>'evidence_hash');
 -- A previously reviewed snapshot is not silently reclassified when other punches are unlinked.
 update public.biometric_punches set employee_id=null where employee_id='40130000-0000-0000-0000-000000000010' and punched_at <> ((m+4+time '08:00')::timestamp-interval '3 hours') at time zone 'UTC';
 j:=public.ops_missing_punch_month_preview(m); assert (j->>'total_confirmed_days')::int=0 and (j->>'total_review_days')::int=1,'previously reviewed stale snapshot still needs review';
 assert (public.deputy_missing_punch_reviews(m)->>'total')::int=1,'stale snapshot remains in deputy list';
 -- Approved leave wins even over a prior confirmation; it changes signature too.
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status)
 select '40130000-0000-0000-0000-000000000010','leave',lt.id,m+4,m+4,'approved' from public.hr_leave_types lt where lt.code='official' limit 1;
 j:=public.ops_missing_punch_month_preview(m); row_:=j->'rows'->0;
 assert (row_->>'confirmed_days')::int=0 and (row_->>'excluded_leave_days')::int=1,'leave precedence';
 j:=public.deputy_missing_punch_reviews(m); row_:=j->'rows'->0;
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_review_decide(%L,%L,%L,%L)',v_id,'confirmed','التحقق من دليل الجهاز',row_->>'evidence_hash'),'HR_APPROVED_LEAVE_CONFLICT');
 select jsonb_build_object('deductions',(select count(*) from public.hr_attendance_deductions),'exports',(select count(*) from public.hr_month_exports),'disclosures',(select count(*) from public.disclosures),'attendance',(select count(*) from public.hr_attendance_days)) into after_;
 assert before_=after_,'review must not change attendance or financial data';
 insert into public.hr_month_exports(period_month,status,review_status,exported_at) values(m,'approved','approved',now());
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_review_decide(%L,%L,%L,%L)',v_id,'excluded','التحقق من دليل الجهاز',row_->>'evidence_hash'),'HR_MONTH_LOCKED');
 assert (public.deputy_missing_punch_reviews(m)->>'finance_locked')::boolean,'locked month read only';
end$$;
do $$begin
 assert app.platform_reset_category_of('hr_missing_punch_review_decisions')='attendance','reset mapping';
 assert exists(select 1 from app.data_retention_catalog() where table_name='hr_missing_punch_review_decisions' and not deletable),'protected retention';
 assert not has_table_privilege('authenticated','public.hr_missing_punch_review_decisions','select'),'direct evidence access denied';
 assert not has_table_privilege('authenticated','public.hr_missing_punch_review_decisions','insert'),'direct write denied';
 assert not has_function_privilege('anon','public.deputy_missing_punch_reviews(date,integer,integer)','execute'),'anon list denied';
 assert not has_function_privilege('anon','public.deputy_missing_punch_review_decide(uuid,text,text,text)','execute'),'anon decide denied';
end$$;
select set_config('test.mpr_month',pg_temp.month()::text,false);
set role authenticated;
select set_config('auth.user_id','40130000-0000-0000-0000-000000000003',false);
do $$begin assert (public.deputy_missing_punch_reviews(current_setting('test.mpr_month')::date)->>'total')::int=1,'authenticated deputy access'; end$$;
select set_config('auth.user_id','40130000-0000-0000-0000-000000000002',false);
do $$begin
 perform pg_temp.expect_err(format('select public.deputy_missing_punch_reviews(%L)',current_setting('test.mpr_month')::date),'HR_FORBIDDEN');
 perform pg_temp.expect_err('select count(*) from public.hr_missing_punch_review_decisions','permission denied');
end$$;
reset role;
