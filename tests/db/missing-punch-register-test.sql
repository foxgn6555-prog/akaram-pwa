-- depends: tests/db/attendance-missing-punch-guard-test.sql
set client_min_messages=warning;
do $$
declare d date:=current_setting('test.mpday')::date; n int; r record; before_count int;
begin
 -- التصحيح الفردي والخروج والدخول الليلي والمرن محفوظة ولو وصلت البصمة الحقيقية فيما بعد.
 assert exists(select 1 from public.hr_missing_punch_register where employee_id='39940000-0000-0000-0000-000000000011' and work_date=d and missing_side='out' and correction_audit_id is not null), 'corrected out recorded';
 assert exists(select 1 from public.hr_missing_punch_register where employee_id='39940000-0000-0000-0000-000000000012' and work_date=d and missing_side='in'), 'corrected in recorded';
 assert exists(select 1 from public.hr_missing_punch_register where employee_id='39940000-0000-0000-0000-000000000014' and work_date=d and missing_side='out'), 'night shift recorded';
 assert exists(select 1 from public.hr_missing_punch_register where employee_id='39940000-0000-0000-0000-000000000015' and work_date=d and missing_side='out'), 'flexible shift recorded';
 assert not exists(select 1 from public.hr_missing_punch_register where employee_id='39940000-0000-0000-0000-000000000013' and work_date=d), 'approved no-punch absence is not a single missing punch';
 select count(*) into before_count from public.hr_missing_punch_register;
 -- تكرار أثر قديم، حتى لو عُدّل سجل التدقيق لاحقاً، لا يضيف سجلاً ثانياً.
 update public.hr_attendance_audit set after=after where id=(select correction_audit_id from public.hr_missing_punch_register where employee_id='39940000-0000-0000-0000-000000000011' and work_date=d);
 assert (select count(*) from public.hr_missing_punch_register)=before_count,'audit repeat idempotent';
 assert app.platform_reset_category_of('hr_missing_punch_register')='attendance','reset category';
 assert exists(select 1 from app.data_retention_catalog() where table_name='hr_missing_punch_register' and not deletable),'no automatic purge';
 -- حضور أمس ببصمة واحدة، بعد الشفت، تُسجّله اللقطة مرة واحدة.
 d:=app.hr_local_date(now())-1;
 perform pg_temp.punch('39940000-0000-0000-0000-000000000011',d,'16:30','399411');
 n:=app.hr_capture_missing_punch_daily();
 if (pg_temp.bag(d,'22:00') <= now()) then
   assert exists(select 1 from public.hr_missing_punch_register where employee_id='39940000-0000-0000-0000-000000000011' and work_date=d and detected_by='daily_snapshot'), 'daily capture';
   n:=app.hr_capture_missing_punch_daily(); assert n=0,'repeat daily capture';
   perform pg_temp.punch('39940000-0000-0000-0000-000000000011',d,'21:45','399411');
   assert (select status<>'incomplete' from public.hr_attendance_days where employee_id='39940000-0000-0000-0000-000000000011' and work_date=d), 'real second punch re-evaluates';
   assert exists(select 1 from public.hr_missing_punch_register where employee_id='39940000-0000-0000-0000-000000000011' and work_date=d), 'evidence remains after real punch';
 end if;
 raise warning 'missing register: correction, no punch, night, flex, daily and repeat checks passed';
end$$;
do $$ declare d date:=current_setting('test.mpday')::date; j jsonb; before_n int; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 j:=public.ops_missing_punch_register(d,1,0);
 assert (j->>'total')::int>=4 and jsonb_array_length(j->'rows')=1,'pagination and total: '||j::text;
 j:=public.ops_missing_punch_register(d,500,0);
 assert exists(select 1 from jsonb_array_elements(j->'rows') x where x->>'employee_id'='39940000-0000-0000-0000-000000000011' and x->>'work_date'=d::text and x->>'missing_side'='out'), 'corrected day listed';
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.ops_missing_punch_register(%L)',d),'HR_FORBIDDEN');
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000003');
 assert (public.ops_missing_punch_register(d)->>'total')::int>=4,'deputy can inspect';
end$$;
set role authenticated;
select set_config('auth.user_id','39940000-0000-0000-0000-000000000004',false);
do $$ begin
 assert (select count(*)=0 from public.hr_missing_punch_register),'finance has no raw register access';
 begin
  insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,detected_by) values('39940000-0000-0000-0000-000000000011',current_date,now(),'daily_snapshot');
  raise exception 'TEST_FAIL direct write permitted';
 exception when insufficient_privilege then null; end;
end$$;
reset role;
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='39940000-0000-0000-0000-000000000012'; j jsonb; begin
 -- أوقات متقاربة ومختلفة ليست بالضرورة تكراراً: تُعرض للمراجعة فقط ولا تُسجل كحالة مؤكدة.
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 perform pg_temp.punch(e,d,'16:30','399412');
 perform pg_temp.punch(e,d,'16:32','399412');
 assert (select status='incomplete' from public.hr_attendance_days where employee_id=e and work_date=d),'fixture engine sees incomplete';
 perform app.hr_capture_missing_punch_daily();
 assert not exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d),'ambiguous punches not auto recorded';
 j:=public.ops_missing_punch_register(d,500,0);
 assert exists(select 1 from jsonb_array_elements(j->'rows') x where x->>'employee_id'=e::text and x->>'work_date'=d::text and (x->>'needs_review')::boolean),'ambiguous shown for review';
end$$;
-- بلا شفت معروف: لا نتجاهله ولا نقرر نوع البصمة، بل نعرضه للمراجعة فقط.
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400b0000-0000-0000-0000-000000000011','REGISTER-NOSHIFT','بلا شفت','2024-01-01','400b11');
do $$ declare d date:=app.hr_local_date(now())-2; j jsonb; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 perform pg_temp.punch('400b0000-0000-0000-0000-000000000011',d,'08:30','400b11');
 j:=public.ops_missing_punch_register(d,500,0);
 assert exists(select 1 from jsonb_array_elements(j->'rows') x where x->>'employee_id'='400b0000-0000-0000-0000-000000000011' and (x->>'needs_review')::boolean), 'no shift shown for review';
 assert not exists(select 1 from public.hr_missing_punch_register where employee_id='400b0000-0000-0000-0000-000000000011'),'no shift not recorded automatically';
end$$;
do $$ declare d date:=app.hr_local_date(now())-1; e uuid:='39940000-0000-0000-0000-000000000011'; t uuid; l uuid; j jsonb; begin
 if exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d) then
   select id into t from public.hr_leave_types where code='unpaid';
   perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
   l:=public.hr_leave_request(e,t,d,d,null,null,null,null,'اختبار مراجعة إجازة معتمدة');
   perform pg_temp.as_user('39940000-0000-0000-0000-000000000002');
   perform public.hr_leave_decide(l,true,null);
   perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
   j:=public.ops_missing_punch_register(d,500,0);
   assert exists(select 1 from jsonb_array_elements(j->'rows') x where x->>'employee_id'=e::text and x->>'work_date'=d::text and (x->>'approved_leave')::boolean), 'approved leave flagged';
   assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d), 'leave does not delete prior evidence';
 end if;
end$$;
do $$ declare d date:=(date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date+1; e uuid:='39940000-0000-0000-0000-000000000014'; begin
 -- استعادة لقطة فائتة من الشهر السابق بعد توقف المجدول.
 perform pg_temp.punch(e,d,'22:15','399414');
 perform app.hr_capture_missing_punch_daily();
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and detected_by='daily_snapshot'), 'previous month catch-up';
end$$;
