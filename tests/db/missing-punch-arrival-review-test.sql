set client_min_messages=warning;
insert into auth.users(id,email) values('400d0000-0000-0000-0000-000000000001','arrival-ops@test.invalid'),('400d0000-0000-0000-0000-000000000002','arrival-fin@test.invalid');
insert into public.user_roles(user_id,role) values('400d0000-0000-0000-0000-000000000001','ops_room'),('400d0000-0000-0000-0000-000000000002','finance_officer');
insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values('400d0000-0000-0000-0000-000000000010','arrival day','08:00','16:00',0,'{0,1,2,3,4,5,6}'),('400d0000-0000-0000-0000-000000000011','arrival night','22:00','06:00',0,'{0,1,2,3,4,5,6}');
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
 ('400d0000-0000-0000-0000-000000000021','ARR-1','تأخر سحب','2024-01-01','400d21'),
 ('400d0000-0000-0000-0000-000000000022','ARR-2','دفعة كاملة','2024-01-01','400d22'),
 ('400d0000-0000-0000-0000-000000000023','ARR-3','بصمتان قريبتان','2024-01-01','400d23'),
 ('400d0000-0000-0000-0000-000000000024','ARR-4','ربط متأخر','2024-01-01','400d24'),
 ('400d0000-0000-0000-0000-000000000025','ARR-5','ليلي','2024-01-01','400d25'),
 ('400d0000-0000-0000-0000-000000000026','ARR-6','مالياً مقفل','2024-01-01','400d26');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from)
select id,case when employee_number='ARR-5' then '400d0000-0000-0000-0000-000000000011'::uuid else '400d0000-0000-0000-0000-000000000010'::uuid end,'2024-01-01' from public.employees where employee_number like 'ARR-%';
select set_config('auth.user_id','400d0000-0000-0000-0000-000000000001',false);
create function pg_temp.bag(d date,t time) returns timestamptz language sql immutable as $$select ((d+t)::timestamp-interval '3 hours') at time zone 'UTC'$$;
create function pg_temp.punch(e uuid,d date,t time,pin text) returns void language sql as $$insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('arrival-test',pin,e,pg_temp.bag(d,t),'manual')$$;

-- وصل الثاني قبل التقاط اللقطة: لا تضيع الحالة ولا يُحكم أنها مخالفة.
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000021'; j jsonb; begin
 perform pg_temp.punch(e,d,'08:30','400d21');
 assert not exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d),'not yet captured';
 perform pg_temp.punch(e,d,'15:30','400d21');
 assert (select status<>'incomplete' from public.hr_attendance_days where employee_id=e and work_date=d),'actual day complete';
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and detected_by='real_arrival' and requires_review and original_punch=pg_temp.bag(d,'08:30') and later_punch=pg_temp.bag(d,'15:30')),'candidate kept for review';
 j:=public.ops_missing_punch_register(d,500,0);
 assert exists(select 1 from jsonb_array_elements(j->'rows') x where x->>'employee_id'=e::text and x->>'detected_by'='real_arrival' and (x->>'needs_review')::boolean and x->>'later_punch' is not null),'listed as review';
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('arrival-test','400d21',e,pg_temp.bag(d,'15:30'),'manual') on conflict do nothing;
 assert (select count(*)=1 from public.hr_missing_punch_register where employee_id=e and work_date=d),'re-pull idempotent';
end$$;

-- دفعة واحدة تحتوي البصمتين لا تمر بحالة ناقصة قبل الدفعة، فلا تُنشئ واقعة وهمية.
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000022'; begin
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
 ('arrival-test','400d22',e,pg_temp.bag(d,'08:00'),'manual'),('arrival-test','400d22',e,pg_temp.bag(d,'16:00'),'manual');
 assert not exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d),'complete batch no false candidate';
end$$;

-- بصمتان مختلفتان متقاربتان تبقيان للمراجعة، وتحديث metadata وحده لا ينشئ مرشحاً جديداً.
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000023'; begin
 perform pg_temp.punch(e,d,'08:00','400d23'); perform pg_temp.punch(e,d,'08:02','400d23');
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and requires_review),'close times review';
 delete from public.hr_missing_punch_register where employee_id=e and work_date=d;
 update public.biometric_punches set person_name='metadata update' where employee_id=e and punched_at=pg_temp.bag(d,'08:02');
 assert not exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d),'metadata update did not create candidate';
end$$;

-- ربط بصمة سُحبت سابقاً بلا موظف يتبع المسار نفسه عند تغيير الموظف.
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000024'; v_id uuid; begin
 perform pg_temp.punch(e,d,'08:15','400d24');
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('arrival-test','400d24',null,pg_temp.bag(d,'16:00'),'manual') returning biometric_punches.id into v_id;
 update public.biometric_punches set employee_id=e where biometric_punches.id=v_id;
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and requires_review),'assignment captured';
end$$;

-- شفت يمتد إلى صباح اليوم التالي يتبع نافذته لا تاريخ البصمة وحده.
do $$ declare d date:=app.hr_local_date(now())-3; e uuid:='400d0000-0000-0000-0000-000000000025'; begin
 perform pg_temp.punch(e,d,'22:15','400d25'); perform pg_temp.punch(e,d+1,'05:45','400d25');
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and requires_review),'night arrival linked to shift date';
end$$;

-- بعد قفل المالية: تبقى صورة الحضور والراتب كما هي، وتُسجل الواقعة للمراجعة فقط.
do $$ declare d date:=(date_trunc('month',app.hr_local_date(now()))-interval '3 months')::date+4; e uuid:='400d0000-0000-0000-0000-000000000026'; b jsonb; exp uuid; begin
 perform pg_temp.punch(e,d,'08:15','400d26');
 select to_jsonb(a) into b from public.hr_attendance_days a where a.employee_id=e and a.work_date=d;
 insert into public.hr_month_exports(period_month,status,review_status,exported_at) values(date_trunc('month',d)::date,'approved','approved',now()) returning id into exp;
 perform pg_temp.punch(e,d,'16:00','400d26');
 assert (select to_jsonb(a)=b from public.hr_attendance_days a where a.employee_id=e and a.work_date=d),'locked attendance unchanged';
 assert (select status='approved' from public.hr_month_exports where id=exp),'finance export remains approved';
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and requires_review),'locked arrival review';
end$$;
do $$ begin
 assert not exists(select 1 from public.integration_logs where endpoint='missing_punch_review' and status='error'),'candidate trigger errors';
 raise warning 'arrival review: before snapshot, batches, metadata, linking, night and finance lock passed';
end$$;
-- تصحيح وقت بصمة مختلفة يعيد احتساب اليوم ويميز الحالة غير المؤكدة للمراجعة.
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000023'; begin
 update public.biometric_punches set punched_at=pg_temp.bag(d,'16:00') where employee_id=e and punched_at=pg_temp.bag(d,'08:02');
 assert (select status<>'incomplete' from public.hr_attendance_days where employee_id=e and work_date=d),'timestamp update reevaluated';
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and requires_review and later_punch=pg_temp.bag(d,'16:00')),'timestamp update review';
end$$;

-- عند إعادة ربط بصمة بموظف آخر يعاد احتساب الطرفين، لا الموظف الجديد وحده.
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
 ('400d0000-0000-0000-0000-000000000027','ARR-7','ربط أصلي','2024-01-01','400d27'),
 ('400d0000-0000-0000-0000-000000000028','ARR-8','ربط جديد','2024-01-01','400d28');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values
 ('400d0000-0000-0000-0000-000000000027','400d0000-0000-0000-0000-000000000010','2024-01-01'),
 ('400d0000-0000-0000-0000-000000000028','400d0000-0000-0000-0000-000000000010','2024-01-01');
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000027'; e2 uuid:='400d0000-0000-0000-0000-000000000028'; begin
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
 ('arrival-test','400d27',e,pg_temp.bag(d,'08:00'),'manual'),('arrival-test','400d27',e,pg_temp.bag(d,'16:00'),'manual');
 assert (select status<>'incomplete' from public.hr_attendance_days where employee_id=e and work_date=d),'original complete';
 update public.biometric_punches set employee_id=e2 where employee_id=e and punched_at=pg_temp.bag(d,'16:00');
 assert (select status='incomplete' from public.hr_attendance_days where employee_id=e and work_date=d),'old employee reevaluated';
 assert (select status='incomplete' from public.hr_attendance_days where employee_id=e2 and work_date=d),'new employee evaluated';
end$$;

-- عند إيقاف الاحتساب الآلي، لا تُغيَّر الحضورية أو يُدّعى الالتقاط الفوري.
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400d0000-0000-0000-0000-000000000029','ARR-9','إيقاف آلي','2024-01-01','400d29');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('400d0000-0000-0000-0000-000000000029','400d0000-0000-0000-0000-000000000010','2024-01-01');
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000029'; b jsonb; begin
 perform pg_temp.punch(e,d,'08:00','400d29');
 select to_jsonb(a) into b from public.hr_attendance_days a where a.employee_id=e and a.work_date=d;
 update public.hr_policy set settings=settings||'{"auto_evaluate_enabled":false}'::jsonb where id=1;
 perform pg_temp.punch(e,d,'16:00','400d29');
 update public.biometric_punches set punched_at=pg_temp.bag(d,'15:45') where employee_id=e and punched_at=pg_temp.bag(d,'16:00');
 assert (select to_jsonb(a)=b from public.hr_attendance_days a where a.employee_id=e and a.work_date=d),'disabled auto leaves attendance';
 assert not exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d),'no immediate automatic capture while disabled';
 perform app.hr_evaluate_day(e,d);
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and requires_review),'manual evaluation captures review';
 update public.hr_policy set settings=settings||'{"auto_evaluate_enabled":true}'::jsonb where id=1;
end$$;

-- فشل السجل نفسه لا يمنع استقبال البصمة ولا إعادة احتساب الحضور.
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400d0000-0000-0000-0000-000000000030','ARR-10','حراسة البصمة','2024-01-01','400d30');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('400d0000-0000-0000-0000-000000000030','400d0000-0000-0000-0000-000000000010','2024-01-01');
create function pg_temp.force_register_failure() returns trigger language plpgsql as $$begin raise exception 'TEST_REGISTER_STORAGE_ERROR'; end$$;
create trigger test_force_register_failure before insert on public.hr_missing_punch_register for each row execute function pg_temp.force_register_failure();
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000030'; begin
 perform pg_temp.punch(e,d,'08:00','400d30'); perform pg_temp.punch(e,d,'16:00','400d30');
 assert (select count(*)=2 from public.biometric_punches where employee_id=e),'both real punches persisted';
 assert (select status<>'incomplete' from public.hr_attendance_days where employee_id=e and work_date=d),'attendance still reevaluated';
 assert exists(select 1 from public.integration_logs where endpoint='missing_punch_review' and status='error' and payload->>'error' like '%TEST_REGISTER_STORAGE_ERROR%'), 'failure was logged: '||(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb)::text from public.integration_logs l where endpoint='missing_punch_review');
end$$;
drop trigger test_force_register_failure on public.hr_missing_punch_register;
-- حتى فشل محرك التقييم لا يعطّل حفظ البصمة الحقيقية؛ يُسجَّل خطأ التكامل بقيمة مقبولة.
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400d0000-0000-0000-0000-000000000031','ARR-11','تعذر تقييم','2024-01-01','400d31');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('400d0000-0000-0000-0000-000000000031','400d0000-0000-0000-0000-000000000010','2024-01-01');
select pg_temp.punch('400d0000-0000-0000-0000-000000000031',app.hr_local_date(now())-2,'08:00','400d31');
create function pg_temp.force_attendance_failure() returns trigger language plpgsql as $$begin if new.employee_id='400d0000-0000-0000-0000-000000000031' then raise exception 'TEST_ATTENDANCE_STORAGE_ERROR'; end if; return new; end$$;
create trigger test_force_attendance_failure before update on public.hr_attendance_days for each row execute function pg_temp.force_attendance_failure();
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000031'; begin
 perform pg_temp.punch(e,d,'16:00','400d31');
 assert (select count(*)=2 from public.biometric_punches where employee_id=e),'real punch preserved on evaluation error';
 assert (select status='incomplete' from public.hr_attendance_days where employee_id=e and work_date=d),'failed evaluation unchanged';
 assert exists(select 1 from public.integration_logs where endpoint='hr_evaluate_day' and status='error' and payload->>'error' like '%TEST_ATTENDANCE_STORAGE_ERROR%'),'evaluation failure logged';
end$$;
drop trigger test_force_attendance_failure on public.hr_attendance_days;
-- لقطة سبقت بصمة وصلت لاحقاً: دون دليل اكتمال السحب تُراجع ولا تُعامل كواقعة محسومة.
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400d0000-0000-0000-0000-000000000032','ARR-12','لقطة ثم سحب','2024-01-01','400d32');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('400d0000-0000-0000-0000-000000000032','400d0000-0000-0000-0000-000000000010','2024-01-01');
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000032'; begin
 perform pg_temp.punch(e,d,'08:00','400d32');
 perform app.hr_capture_missing_punch_daily();
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and detected_by='daily_snapshot' and not requires_review),'snapshot created';
 perform pg_temp.punch(e,d,'16:00','400d32');
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and detected_by='daily_snapshot' and requires_review and later_punch=pg_temp.bag(d,'16:00')),'late arrival makes snapshot uncertain';
end$$;
-- بعد إزالة ربط بصمة زائدة خطأً، تصحيح يدوي مثبت يحسم المرشح ويبقي أثره.
do $$ declare d date:=app.hr_local_date(now())-2; e uuid:='400d0000-0000-0000-0000-000000000032'; begin
 update public.biometric_punches set employee_id=null where employee_id=e and punched_at=pg_temp.bag(d,'16:00');
 assert (select status='incomplete' from public.hr_attendance_days where employee_id=e and work_date=d),'relink reevaluates original';
 perform app.hr_apply_punch_correction(e,d,pg_temp.bag(d,'08:00'),pg_temp.bag(d,'16:00'),'present','تصحيح مثبت',false);
 assert exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d and not requires_review and correction_audit_id is not null and later_punch=pg_temp.bag(d,'16:00')),'manual correction resolves review and preserves evidence';
end$$;
-- إجازة معتمدة مع صف حضور ناقص قديم في شهر مقفل: لا تلتقط كواقعة جديدة ولا يتغير الصف.
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values('400d0000-0000-0000-0000-000000000033','ARR-13','إجازة مقفلة','2024-01-01','400d33');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values('400d0000-0000-0000-0000-000000000033','400d0000-0000-0000-0000-000000000010','2024-01-01');
do $$ declare d date:=(date_trunc('month',app.hr_local_date(now()))-interval '4 months')::date+4; e uuid:='400d0000-0000-0000-0000-000000000033'; t uuid; b jsonb; begin
 perform pg_temp.punch(e,d,'08:00','400d33');
 select id into t from public.hr_leave_types where code='official';
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',t,d,d,'approved');
 insert into public.hr_month_exports(period_month,status,review_status,exported_at) values(date_trunc('month',d)::date,'approved','approved',now());
 select to_jsonb(a) into b from public.hr_attendance_days a where a.employee_id=e and a.work_date=d;
 perform pg_temp.punch(e,d,'16:00','400d33');
 assert (select to_jsonb(a)=b from public.hr_attendance_days a where a.employee_id=e and a.work_date=d),'locked leave attendance unchanged';
 assert not exists(select 1 from public.hr_missing_punch_register where employee_id=e and work_date=d),'approved leave excluded';
end$$;
