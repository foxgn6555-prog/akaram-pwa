set client_min_messages=warning;
insert into auth.users(id,email) values
 ('40110000-0000-0000-0000-000000000001','mp-preview-it@test.invalid'),
 ('40110000-0000-0000-0000-000000000002','mp-preview-ops@test.invalid'),
 ('40110000-0000-0000-0000-000000000003','mp-preview-deputy@test.invalid'),
 ('40110000-0000-0000-0000-000000000004','mp-preview-finance@test.invalid');
insert into public.user_roles(user_id,role) values
 ('40110000-0000-0000-0000-000000000001','it_admin'),('40110000-0000-0000-0000-000000000002','ops_room'),
 ('40110000-0000-0000-0000-000000000003','deputy_director'),('40110000-0000-0000-0000-000000000004','finance_officer');
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
 ('40110000-0000-0000-0000-000000000011','MP-2','موظف 2','2024-01-01','mp40111'),
 ('40110000-0000-0000-0000-000000000012','MP-3','موظف 3','2024-01-01','mp40112'),
 ('40110000-0000-0000-0000-000000000013','MP-6','موظف 6','2024-01-01','mp40113'),
 ('40110000-0000-0000-0000-000000000014','MP-9','موظف 9','2024-01-01','mp40114'),
 ('40110000-0000-0000-0000-000000000015','MP-LIVE','حالة حية','2024-01-01','mp40115'),
 ('40110000-0000-0000-0000-000000000016','MP-STALE','سحب متأخر','2024-01-01','mp40116'),
 ('40110000-0000-0000-0000-000000000017','MP-PENDING','شفت لم ينته','2024-01-01','mp40117');
insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values('40110000-0000-0000-0000-000000000020','preview shift','08:00','16:00',0,'{0,1,2,3,4,5,6}');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from)
select id,'40110000-0000-0000-0000-000000000020','2024-01-01' from public.employees where employee_number like 'MP-%';
create function pg_temp.as_user(p uuid) returns void language sql as $$select set_config('auth.user_id',p::text,false)$$;
create function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$
begin begin execute q; exception when others then if position(code in sqlerrm)>0 then return; else raise; end if; end; raise exception 'TEST_FAIL expected %',code; end$$;
-- أعداد اصطناعية مفردة لحدود 2،3،6،9، ونوع audit_backfill هو التصحيح المثبت القديم.
insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by)
select e.id, m.d+g.n,((m.d+g.n+time '08:00')::timestamp-interval '3 hours') at time zone 'UTC','out','audit_backfill'
from (select (date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date d) m
join public.employees e on e.employee_number in ('MP-2','MP-3','MP-6','MP-9')
cross join lateral generate_series(1,case e.employee_number when 'MP-2' then 2 when 'MP-3' then 3 when 'MP-6' then 6 else 9 end) g(n);
-- مرشح غير محسوم وإجازة معتمدة لا يدخُلان في الحساب.
do $$declare d date:=(date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date; t uuid; begin
 insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,detected_by,requires_review,later_punch) values
 ('40110000-0000-0000-0000-000000000014',d+10,(d+10+time '05:00')::timestamptz,'real_arrival',true,(d+10+time '13:00')::timestamptz);
 insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,detected_by) values
 ('40110000-0000-0000-0000-000000000014',d+11,(d+11+time '05:00')::timestamptz,'audit_backfill');
 select id into t from public.hr_leave_types where code='official';
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values('40110000-0000-0000-0000-000000000014','leave',t,d+11,d+11,'approved');
end$$;
do $$declare m date:=(date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date; j jsonb; before_ jsonb; after_ jsonb; x jsonb; begin
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 j:=public.ops_missing_punch_month_preview(m,100,0);
 assert not (j->>'settings_configured')::boolean and j->'total_proposed_amount'='null'::jsonb,'unconfigured has no assumed amount';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001'); perform public.it_missing_punch_settings_set(3,1500);
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 select jsonb_build_object('register',(select count(*) from public.hr_missing_punch_register),'attendance',(select count(*) from public.hr_attendance_days),
  'deductions',(select count(*) from public.hr_attendance_deductions),'exports',(select count(*) from public.hr_month_exports),'disclosures',(select count(*) from public.disclosures)) into before_;
 j:=public.ops_missing_punch_month_preview(m,100,0);
 assert (j->>'month_ended')::boolean and (j->>'threshold')::int=3 and (j->>'fixed_amount')::numeric=1500,'settings and closed month';
 assert (j->>'total_employees')::int=4 and (j->>'total_proposed_amount')::numeric=9000 and (j->>'total_review_days')::int=1,'totals exclude review: '||j::text;
 for x in select * from jsonb_array_elements(j->'rows') loop
  if x->>'employee_number'='MP-2' then assert (x->>'confirmed_days')::int=2 and (x->>'threshold_reached')::int=0 and (x->>'proposed_amount')::numeric=0,'2'; end if;
  if x->>'employee_number'='MP-3' then assert (x->>'confirmed_days')::int=3 and (x->>'threshold_reached')::int=1 and (x->>'proposed_amount')::numeric=1500,'3'; end if;
  if x->>'employee_number'='MP-6' then assert (x->>'confirmed_days')::int=6 and (x->>'threshold_reached')::int=2 and (x->>'proposed_amount')::numeric=3000,'6'; end if;
  if x->>'employee_number'='MP-9' then assert (x->>'confirmed_days')::int=9 and (x->>'threshold_reached')::int=3 and (x->>'proposed_amount')::numeric=4500 and (x->>'review_days')::int=1 and (x->>'excluded_leave_days')::int=1,'9'; end if;
 end loop;
 j:=public.ops_missing_punch_month_preview(m,1,1);
 assert jsonb_array_length(j->'rows')=1 and (j->>'total_employees')::int=4 and (j->>'total_proposed_amount')::numeric=9000,'paged, full totals';
 select jsonb_build_object('register',(select count(*) from public.hr_missing_punch_register),'attendance',(select count(*) from public.hr_attendance_days),
  'deductions',(select count(*) from public.hr_attendance_deductions),'exports',(select count(*) from public.hr_month_exports),'disclosures',(select count(*) from public.disclosures)) into after_;
 assert before_=after_,'preview wrote data';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001'); perform public.it_missing_punch_settings_set(3,1000.25);
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 assert (public.ops_missing_punch_month_preview(m)->>'total_proposed_amount')::numeric=6001.50,'decimal amounts exact';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001'); perform public.it_missing_punch_settings_set(1,0);
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 assert (public.ops_missing_punch_month_preview(m)->>'total_proposed_amount')::numeric=0,'configured zero is not missing';
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000001'); perform public.it_missing_punch_settings_set(3,1500);
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 j:=public.ops_missing_punch_month_preview(app.hr_local_date(now()),100,0);
 assert not (j->>'month_ended')::boolean,'current month provisional';
 perform pg_temp.expect_err(format('select public.ops_missing_punch_month_preview(%L)',(m+interval '3 months')::date),'HR_FUTURE_MONTH');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_month_preview(%L)',m),'HR_FORBIDDEN');
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000003');
 assert (public.ops_missing_punch_month_preview(m)->>'total_employees')::int=4,'deputy can review';
end$$;
-- سجل حي غير ملتقط، وسحب ثانٍ بعد اللقطة مع إيقاف التقييم الآلي: الثاني لا يحسب مؤكدًا.
do $$declare m date:=(date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date; live uuid:='40110000-0000-0000-0000-000000000015'; stale uuid:='40110000-0000-0000-0000-000000000016'; j jsonb; begin
 perform pg_temp.as_user('40110000-0000-0000-0000-000000000002');
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
 ('MP-PREV','mp40116',stale,((m+14+time '08:00')::timestamp-interval '3 hours') at time zone 'UTC','manual');
 perform app.hr_capture_missing_punch_daily();
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=stale and detected_by='daily_snapshot'),'stale snapshot fixture';
 update public.hr_policy set settings=settings||'{"auto_evaluate_enabled":false}'::jsonb where id=1;
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
 ('MP-PREV','mp40116',stale,((m+14+time '16:00')::timestamp-interval '3 hours') at time zone 'UTC','manual');
 update public.hr_policy set settings=settings||'{"auto_evaluate_enabled":true}'::jsonb where id=1;
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
 ('MP-PREV','mp40115',live,((m+15+time '08:00')::timestamp-interval '3 hours') at time zone 'UTC','manual');
 -- محاكاة شفت ليلي لم ينتهِ بعد عند انتقال الشهر.
 insert into public.hr_attendance_days(employee_id,work_date,expected_in,expected_out,check_in,status,source)
 values('40110000-0000-0000-0000-000000000017',(m+interval '1 month')::date-1,now()-interval '1 hour',now()+interval '1 hour',now()-interval '30 minutes','incomplete','auto');
 j:=public.ops_missing_punch_month_preview(m,100,0);
 assert (j->>'total_pending_days')::int=1,'ongoing shift not counted';
 assert exists(select 1 from jsonb_array_elements(j->'rows') x where x->>'employee_id'=live::text and (x->>'confirmed_days')::int=1 and (x->>'current_unrecorded_days')::int=1),'live unrecorded';
 assert exists(select 1 from jsonb_array_elements(j->'rows') x where x->>'employee_id'=stale::text and (x->>'review_days')::int=1 and (x->>'confirmed_days')::int=0),'stale daily snapshot needs review';
 insert into public.hr_month_exports(period_month,status,review_status,exported_at) values(m,'approved','approved',now());
 j:=public.ops_missing_punch_month_preview(m,100,0);
 assert (j->>'finance_locked')::boolean and (j->>'total_proposed_amount')::numeric=9000,'locked preview is read-only';
 raise warning 'test ok: preview thresholds, corrections, review, leave, current, locked, roles and no writes';
end$$;
select set_config('test.preview_month',(date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date::text,false);
set role authenticated;
select set_config('auth.user_id','40110000-0000-0000-0000-000000000004',false);
do $$ declare m date:=current_setting('test.preview_month')::date; begin
 perform pg_temp.expect_err(format('select public.ops_missing_punch_month_preview(%L)',m),'HR_FORBIDDEN');
end$$;
select set_config('auth.user_id','40110000-0000-0000-0000-000000000002',false);
do $$ declare m date:=current_setting('test.preview_month')::date; begin
 assert (public.ops_missing_punch_month_preview(m)->>'settings_configured')::boolean,'authorized authenticated caller';
end$$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.ops_missing_punch_month_preview(date,integer,integer)','execute'),'anon cannot invoke';
 raise warning 'test ok: actual role permissions';
end$$;
