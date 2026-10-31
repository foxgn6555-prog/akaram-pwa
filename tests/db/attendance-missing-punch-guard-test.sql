set client_min_messages=warning;
insert into auth.users(id,email) values
 ('39940000-0000-0000-0000-000000000001','missing-ops@test.invalid'),('39940000-0000-0000-0000-000000000002','missing-hr@test.invalid'),
 ('39940000-0000-0000-0000-000000000003','missing-dep@test.invalid'),('39940000-0000-0000-0000-000000000004','missing-fin@test.invalid'),
 ('39940000-0000-0000-0000-000000000005','missing-it@test.invalid');
insert into public.user_roles(user_id,role) values
 ('39940000-0000-0000-0000-000000000001','ops_room'),('39940000-0000-0000-0000-000000000002','hr_officer'),
 ('39940000-0000-0000-0000-000000000003','deputy_director'),('39940000-0000-0000-0000-000000000004','finance_officer'),
 ('39940000-0000-0000-0000-000000000005','it_admin');
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
 ('39940000-0000-0000-0000-000000000011','MP-1','ناقص خروج','2024-01-01','399411'),
 ('39940000-0000-0000-0000-000000000012','MP-2','ناقص دخول','2024-01-01','399412'),
 ('39940000-0000-0000-0000-000000000013','MP-3','بلا بصمة','2024-01-01','399413'),
 ('39940000-0000-0000-0000-000000000014','MP-4','ليلي','2024-01-01','399414'),
 ('39940000-0000-0000-0000-000000000015','MP-5','مرن','2024-01-01','399415');
insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days,kind,required_hours) values
 ('39940000-0000-0000-0000-000000000020','MP-evening','16:00','22:00',0,'{0,1,2,3,4,5,6}','fixed',null),
 ('39940000-0000-0000-0000-000000000021','MP-night','22:00','06:00',0,'{0,1,2,3,4,5,6}','fixed',null),
 ('39940000-0000-0000-0000-000000000022','MP-flex','08:00','20:00',0,'{0,1,2,3,4,5,6}','flexible',6);
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from)
select id, case when employee_number='MP-4' then '39940000-0000-0000-0000-000000000021'::uuid when employee_number='MP-5' then '39940000-0000-0000-0000-000000000022'::uuid else '39940000-0000-0000-0000-000000000020'::uuid end,'2024-01-01'
from public.employees where employee_number like 'MP-%';
create function pg_temp.as_user(u uuid) returns void language sql as $$select set_config('auth.user_id',u::text,false)$$;
create function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$begin execute q; raise exception 'TEST_FAIL expected %',code; exception when others then if sqlerrm not like '%'||code||'%' then raise; end if; end$$;
create function pg_temp.bag(d date,t time) returns timestamptz language sql immutable as $$select ((d+t)::timestamp-interval '3 hours') at time zone 'UTC'$$;
create function pg_temp.punch(e uuid,d date,t time,pin text) returns void language sql as $$ insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('mp-test',pin,e,pg_temp.bag(d,t),'manual') $$;
select set_config('test.mpday',(date_trunc('month',current_date)-interval '2 months'+interval '5 days')::date::text,false);
select pg_temp.as_user('39940000-0000-0000-0000-000000000001');
-- واحد: عدم تجاوز نهاية الشفت، عدم استبدال البصمة، لا حالات يدوية، والتصحيح الصحيح.
do $$declare d date:=current_setting('test.mpday')::date; e uuid:='39940000-0000-0000-0000-000000000011'; a record; c jsonb; begin
 perform pg_temp.punch(e,d,'16:30','399411');
 c:=public.ops_attendance_correction_options(e,d); assert (c->>'count')::int=1 and (c->>'real')::timestamptz=pg_temp.bag(d,'16:30') and (c->>'expected_out')::timestamptz=pg_temp.bag(d,'22:00'),c::text;
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'23:00'),'auto','test reason'),'HR_EDIT_SHIFT_BOUNDS');
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:00'),pg_temp.bag(d,'22:00'),'auto','test reason'),'HR_EDIT_PUNCH_PRESERVE');
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'22:00'),'leave','test reason'),'HR_EDIT_STATUS_OR_TIME');
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'22:00'),'auto','تعطل جهاز الخروج');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_in=pg_temp.bag(d,'16:30') and a.check_out=pg_temp.bag(d,'22:00') and a.status='late' and a.late_minutes=30 and a.manual_punch_correction->>'missing_side'='out',row_to_json(a)::text;
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'21:00'),'auto','test reason'),'HR_EDIT_LIMITED');
 assert (select count(*)=1 from public.biometric_punches where employee_id=e), 'original ledger intact';
 assert exists(select 1 from public.hr_attendance_audit where employee_id=e and work_date=d and action='edit'), 'audit';
 perform pg_temp.punch(e,d,'21:45','399411');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_in=pg_temp.bag(d,'16:30') and a.check_out=pg_temp.bag(d,'21:45') and a.source='auto' and a.manual_punch_correction is null,row_to_json(a)::text;
 assert exists(select 1 from public.hr_attendance_audit where employee_id=e and work_date=d and action='reset_auto' and reason like '%البصمة الحقيقية%'), 'auto correction audit';
end$$;
-- البصمة المجهولة يمكن أن تكون خروجاً لا دخولاً، وتحافظ على ثوانيها.
do $$declare d date:=current_setting('test.mpday')::date; e uuid:='39940000-0000-0000-0000-000000000012'; a record; begin
 perform pg_temp.punch(e,d,'21:32:12','399412');
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'16:00'),pg_temp.bag(d,'21:32:12'),'auto','تعطل جهاز الدخول');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_out=pg_temp.bag(d,'21:32:12') and a.check_in=pg_temp.bag(d,'16:00') and a.manual_punch_correction->>'missing_side'='in',row_to_json(a)::text;
 perform pg_temp.punch(e,d,'16:10','399412');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_in=pg_temp.bag(d,'16:10') and a.check_out=pg_temp.bag(d,'21:32:12') and a.source='auto',row_to_json(a)::text;
end$$;
-- بلا بصمة: المباشر ممنوع والجماعي يطلب موافقة HR.
do $$declare d date:=current_setting('test.mpday')::date; e uuid:='39940000-0000-0000-0000-000000000013'; j jsonb; rid uuid; a record; begin
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:00'),pg_temp.bag(d,'22:00'),'present','test reason'),'HR_EDIT_APPROVAL_REQUIRED');
 j:=public.attendance_edit_preview('employees',array[e],array[d],'full_presence','{"missing_side":"out"}');
 assert (j->'rows'->0->'proposed'->>'needs_approval')::boolean,j::text;
 perform pg_temp.expect_err(format('select public.attendance_edit_create(%L,array[%L::uuid],array[%L::date],%L,%L::jsonb,%L,%L)','employees',e,d,'full_presence','{"missing_side":"out"}','سبب اختبار كاف','direct'),'ATT_EDIT_NOTHING_TO_APPLY');
 j:=public.attendance_edit_create('employees',array[e],array[d],'full_presence','{"missing_side":"out"}','سبب اختبار كاف','hr_request'); rid:=(j->>'id')::uuid;
 assert not exists(select 1 from public.hr_attendance_days where employee_id=e and work_date=d and source='manual'), 'no apply before approval';
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000002');
 perform public.attendance_edit_hr_apply(rid,'موافقة الموارد البشرية');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_in=pg_temp.bag(d,'16:00') and a.check_out=pg_temp.bag(d,'22:00') and a.manual_punch_correction->>'missing_side'='both',row_to_json(a)::text;
 perform pg_temp.punch(e,d,'16:25','399413');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_in=pg_temp.bag(d,'16:25') and a.check_out is null and a.status='incomplete' and a.source='auto', 'one real must not be hidden: '||row_to_json(a)::text;
 perform pg_temp.punch(e,d,'21:50','399413');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_in=pg_temp.bag(d,'16:25') and a.check_out=pg_temp.bag(d,'21:50') and a.source='auto',row_to_json(a)::text;
end$$;
-- شفت ليلي: 06:00 اليوم التالي حد صحيح و07:00 مرفوض.
do $$declare d date:=current_setting('test.mpday')::date; e uuid:='39940000-0000-0000-0000-000000000014'; a record; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001'); perform pg_temp.punch(e,d,'22:15','399414');
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'22:15'),pg_temp.bag(d+1,'07:00'),'auto','test reason'),'HR_EDIT_SHIFT_BOUNDS');
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'22:15'),pg_temp.bag(d+1,'06:00'),'auto','عطل بصمة ليلي');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_out=pg_temp.bag(d+1,'06:00') and a.worked_minutes=465,row_to_json(a)::text;
end$$;
-- المرن: الخروج الفعلي يعتمد الساعات المطلوبة من الدخول، لا نهاية النافذة الاسمية.
do $$declare d date:=current_setting('test.mpday')::date; e uuid:='39940000-0000-0000-0000-000000000015'; a record; c jsonb; begin
 perform pg_temp.punch(e,d,'09:30','399415'); c:=public.ops_attendance_correction_options(e,d);
 assert (c->>'expected_out')::timestamptz=pg_temp.bag(d,'15:30'),c::text;
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'09:30'),pg_temp.bag(d,'16:00'),'auto','test reason'),'HR_EDIT_SHIFT_BOUNDS');
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'09:30'),pg_temp.bag(d,'15:30'),'auto','عطل بصمة المرن');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.expected_in=pg_temp.bag(d,'09:30') and a.expected_out=pg_temp.bag(d,'15:30') and a.status='present' and a.shortfall_minutes=0,row_to_json(a)::text;
 d:=d+2; perform pg_temp.punch(e,d,'14:00','399415');
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'08:00'),pg_temp.bag(d,'14:00'),'auto','عطل دخول المرن');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.expected_in=pg_temp.bag(d,'08:00') and a.expected_out=pg_temp.bag(d,'14:00') and a.status='present' and a.shortfall_minutes=0,row_to_json(a)::text;
end$$;
-- الجماعي المباشر: يحفظ الأصل، يستبعد بلا بصمة، وينبّه المعاون والتطوير. التراجع لا يُخفي بصمة وصلت لاحقاً.
do $$declare d date:=current_setting('test.mpday')::date+5; e1 uuid:='39940000-0000-0000-0000-000000000011'; e2 uuid:='39940000-0000-0000-0000-000000000012'; j jsonb; rid uuid; a record; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001'); perform pg_temp.punch(e1,d,'16:30','399411');
 j:=public.attendance_edit_create('employees',array[e1,e2],array[d],'full_presence','{"missing_side":"out"}','تعطل بصمة الخروج للجماعة','direct'); rid:=(j->>'id')::uuid;
 assert (j->>'items')::int=1,j::text;
 assert exists(select 1 from public.attendance_edit_items where request_id=rid and employee_id=e2 and not applied and skipped_reason like '%لا بصمات%'), 'no punch skipped';
 assert (select check_in=pg_temp.bag(d,'16:30') and check_out=pg_temp.bag(d,'22:00') from public.hr_attendance_days where employee_id=e1 and work_date=d), 'bulk preserves actual';
 assert (select count(*)=2 from public.notifications where user_id in ('39940000-0000-0000-0000-000000000003','39940000-0000-0000-0000-000000000005') and dedupe_key like 'att_edit_applied:'||rid||'%'), 'bulk notifications';
 perform pg_temp.punch(e1,d,'21:40','399411'); perform pg_temp.as_user('39940000-0000-0000-0000-000000000003');
 perform public.attendance_edit_revert(rid,'مراجعة التراجع عن الطلب');
 select * into a from public.hr_attendance_days where employee_id=e1 and work_date=d;
 assert a.source='auto' and a.check_in=pg_temp.bag(d,'16:30') and a.check_out=pg_temp.bag(d,'21:40'), 'revert must retain real: '||row_to_json(a)::text;
end$$;
-- طلب معلّق: وصول بصمة يغيّر الواقع، لا يطبق المقترح القديم ولا يُطبّق جزء منه.
do $$declare d date:=current_setting('test.mpday')::date+7; e uuid:='39940000-0000-0000-0000-000000000013'; j jsonb; rid uuid; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 j:=public.attendance_edit_create('employees',array[e],array[d],'full_presence','{"missing_side":"out"}','طلب حضور بدون بصمة','hr_request'); rid:=(j->>'id')::uuid;
 perform pg_temp.punch(e,d,'16:25','399413'); perform pg_temp.as_user('39940000-0000-0000-0000-000000000002');
 perform pg_temp.expect_err(format('select public.attendance_edit_hr_apply(%L,%L)',rid,'موافقة'),'HR_EDIT_PUNCH_PRESERVE');
 assert (select status='approved' from public.attendance_edit_requests where id=rid), 'request remains approved';
 assert not exists(select 1 from public.attendance_edit_items where request_id=rid and applied), 'no partial apply';
 assert (select source='auto' and check_in=pg_temp.bag(d,'16:25') and check_out is null from public.hr_attendance_days where employee_id=e and work_date=d),'stale proposal did not replace actual';
end$$;
-- لا يمكن إرسال تغيير حالة أو تعيين أوقات مباشرة بواسطة API.
do $$declare d date:=current_setting('test.mpday')::date; e uuid:='39940000-0000-0000-0000-000000000011'; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 perform pg_temp.expect_err(format('select public.attendance_edit_preview(%L,array[%L::uuid],array[%L::date],%L,%L::jsonb)','employees',e,d,'set_status','{"status":"leave"}'),'HR_EDIT_STATUS_OR_TIME');
 perform pg_temp.expect_err(format('select public.attendance_edit_preview(%L,array[%L::uuid],array[%L::date],%L,%L::jsonb)','employees',e,d,'full_presence','{}'),'HR_EDIT_STATUS_OR_TIME');
 perform pg_temp.expect_err(format('select public.attendance_edit_create(%L,array[%L::uuid],array[%L::date],%L,%L::jsonb,%L,%L)','employees',e,d,'set_times','{"check_in":"16:00","check_out":"22:00"}','سبب للاختبار','direct'),'HR_EDIT_STATUS_OR_TIME');
 assert not has_function_privilege('authenticated','app.hr_apply_punch_correction(uuid,date,timestamptz,timestamptz,text,text,boolean)','EXECUTE'), 'no bypass helper';
 assert not has_function_privilege('authenticated','app.attendance_edit_apply_day_00351_raw(uuid,date,timestamptz,timestamptz,text,text)','EXECUTE'), 'no raw bypass';
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.ops_attendance_correction_options(%L,%L)',e,d),'HR_FORBIDDEN');
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'22:00'),'auto','test reason'),'HR_FORBIDDEN');
end$$;
-- بعد اعتماد الحضورية: تصل البصمة وتُعلّق للمراجعة ولا يتغير اليوم.
do $$declare d date:=(date_trunc('month',current_date)-interval '3 months'+interval '5 days')::date; m date:=date_trunc('month',d)::date; e uuid:='39940000-0000-0000-0000-000000000011'; a record; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001'); perform pg_temp.punch(e,d,'16:30','399411');
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'22:00'),'auto','عطل جهاز مؤكد');
 insert into public.hr_attendance_confirmations(period_month,status) values(m,'confirmed');
 perform pg_temp.punch(e,d,'21:40','399411');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.source='manual' and a.check_out=pg_temp.bag(d,'22:00'),row_to_json(a)::text;
 assert exists(select 1 from public.hr_attendance_pending_auto where employee_id=e and work_date=d), 'confirmed queued';
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'21:40'),'auto','test reason'),'HR_ATTENDANCE_CONFIRMED');
 perform public.ops_attendance_reopen(m,'إعادة التدقيق بعد وصول البصمة');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.source='auto' and a.check_in=pg_temp.bag(d,'16:30') and a.check_out=pg_temp.bag(d,'21:40'), 'reopening applies real punch: '||row_to_json(a)::text;
end$$;
-- المقفل مالياً لا يتغير، ويُسجَّل اختلاف البصمة للمراجعة دون أي تغيير على الراتب.
do $$declare d date:=(date_trunc('month',current_date)-interval '4 months'+interval '5 days')::date; m date:=date_trunc('month',d)::date; e uuid:='39940000-0000-0000-0000-000000000011'; a record; begin
 perform pg_temp.punch(e,d,'16:30','399411'); perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'22:00'),'auto','عطل جهاز مقفل');
 insert into public.hr_month_exports(period_month,status) values(m,'approved'); perform pg_temp.punch(e,d,'21:40','399411');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.source='manual' and a.check_out=pg_temp.bag(d,'22:00'),row_to_json(a)::text;
 assert exists(select 1 from public.hr_attendance_audit where employee_id=e and work_date=d and action='auto_blocked' and reason like '%مقفل مالياً%'), 'closed review audit';
 assert (select status='approved' from public.hr_month_exports where period_month=m),'financial export untouched';
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'21:40'),'auto','test reason'),'HR_MONTH_LOCKED');
end$$;
-- سلسلة الحضور بلا بصمة: لا تطبيق قبل موافقة المعاون، ولا يكفي اعتماد السلسلة قبل تنفيذ HR.
do $$declare d date:=current_setting('test.mpday')::date+9; e uuid:='39940000-0000-0000-0000-000000000013'; j jsonb; rid uuid; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000005');
 perform public.approval_chain_save('ops_room','attendance_edit','[{"kind":"hierarchy","role":"deputy_director"}]'::jsonb,true);
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 j:=public.attendance_edit_create('employees',array[e],array[d],'full_presence','{"missing_side":"out"}','طلب حضور موثق لا بصمة','hr_request'); rid:=(j->>'id')::uuid;
 assert j->>'status'='pending_approval' and (j->>'via_chain')::boolean,j::text;
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000002');
 perform pg_temp.expect_err(format('select public.attendance_edit_hr_apply(%L,null)',rid),'ATT_EDIT_NOT_EDITABLE');
 assert not exists(select 1 from public.hr_attendance_days where employee_id=e and work_date=d and source='manual'), 'no unapproved presence';
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000003');
 perform public.approval_decide_request('attendance_edit',rid,true,null);
 assert (select status='approved' from public.attendance_edit_requests where id=rid), 'chain approved';
 assert not exists(select 1 from public.hr_attendance_days where employee_id=e and work_date=d and source='manual'), 'not before HR apply';
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000002'); perform public.attendance_edit_hr_apply(rid,'راجعت الأدلة');
 assert (select source='manual' and check_in=pg_temp.bag(d,'16:00') and check_out=pg_temp.bag(d,'22:00') from public.hr_attendance_days where employee_id=e and work_date=d), 'approved presence applied';
end$$;
-- إعادة سحب نفس السجل لا تكرره، أما بصمتان مختلفتان ومتقاربتان فتحتاجان مراجعة لا تخميناً.
do $$declare d date:=current_setting('test.mpday')::date+11; e uuid:='39940000-0000-0000-0000-000000000011'; a record; c jsonb; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001'); perform pg_temp.punch(e,d,'16:30','399411');
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values('mp-test','399411',e,pg_temp.bag(d,'16:30'),'manual') on conflict do nothing;
 assert (select count(*)=1 from public.biometric_punches where employee_id=e and punched_at=pg_temp.bag(d,'16:30')), 'repeat pull is idempotent';
 c:=public.ops_attendance_correction_options(e,d); assert (c->>'count')::int=1,c::text;
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'22:00'),'auto','عطل الخروج بعد تكرار السحب');
 perform pg_temp.punch(e,d,'21:45','399411'); select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.source='auto' and a.check_in=pg_temp.bag(d,'16:30') and a.check_out=pg_temp.bag(d,'21:45'),row_to_json(a)::text;
 d:=d+1; perform pg_temp.punch(e,d,'16:30','399411'); perform pg_temp.punch(e,d,'16:31','399411');
 c:=public.ops_attendance_correction_options(e,d); assert c ? 'skipped', 'distinct real events need review';
 perform pg_temp.expect_err(format('select public.ops_attendance_edit(%L,%L,%L,%L,%L,%L)',e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'22:00'),'auto','تجربة منع التخمين'),'HR_EDIT_LIMITED');
 assert (select count(*)=2 from public.biometric_punches where employee_id=e and punched_at>=pg_temp.bag(d,'16:30') and punched_at<=pg_temp.bag(d,'16:31')), 'both events remain in ledger';
 d:=d+1; perform pg_temp.punch(e,d,'16:30','399411');
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'16:30'),pg_temp.bag(d,'22:00'),'auto','إكمال قبل وصول بصمة أخرى');
 perform pg_temp.punch(e,d,'16:31','399411'); select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.source='auto' and a.status='incomplete' and a.check_out is null, 'new ambiguous real punch clears assumed time without guessing: '||row_to_json(a)::text;
end$$;

-- الزمنية لا تمحو التأخير غير المغطّى بعد تصحيح بصمة ناقصة.
do $$declare d date:=current_setting('test.mpday')::date+13; e uuid:='39940000-0000-0000-0000-000000000012'; t uuid; a record; begin
 select id into t from public.hr_leave_types where code='permit_official';
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,start_time,end_time,minutes,status)
 values(e,'time_permit',t,d,d,'16:00','16:30',30,'approved');
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001'); perform pg_temp.punch(e,d,'17:00','399412');
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'17:00'),pg_temp.bag(d,'22:00'),'auto','عطل جهاز الخروج مع زمنية');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.late_minutes=30 and a.shortfall_minutes=30 and a.check_in=pg_temp.bag(d,'17:00'),row_to_json(a)::text;
end$$;
-- إجازة معتمدة تحمي اليوم، والبصمة الجديدة لا تخفيها؛ بعد الإلغاء تظهر الحقيقة.
do $$declare d date:=current_setting('test.mpday')::date+15; e uuid:='39940000-0000-0000-0000-000000000012'; t uuid; l uuid; a record; begin
 perform pg_temp.punch(e,d,'17:00','399412'); perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'17:00'),pg_temp.bag(d,'22:00'),'auto','عطل خروج قبل إجازة');
 select id into t from public.hr_leave_types where code='official';
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',t,d,d,'pending') returning id into l;
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000002'); perform public.hr_leave_decide(l,true);
 perform pg_temp.punch(e,d,'21:40','399412');
 assert (select status='leave' from public.hr_attendance_days where employee_id=e and work_date=d), 'leave remains higher priority';
 perform public.hr_leave_cancel(l,'إلغاء الإجازة للاختبار'); select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.source='auto' and a.check_in=pg_temp.bag(d,'17:00') and a.check_out=pg_temp.bag(d,'21:40') and a.approved_leave_original is null,row_to_json(a)::text;
end$$;
-- اختلاف منطقة جلسة القاعدة لا يغيّر التوقيت المقترح أو البصمة الأصلية.
do $$declare d date:=current_setting('test.mpday')::date+18; e uuid:='39940000-0000-0000-0000-000000000014'; c jsonb; a record; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001'); perform set_config('TimeZone','Asia/Baghdad',true);
 perform pg_temp.punch(e,d,'22:15','399414'); c:=public.ops_attendance_correction_options(e,d);
 assert (c->>'expected_out')::timestamptz=pg_temp.bag(d+1,'06:00'), c::text;
 perform public.ops_attendance_edit(e,d,pg_temp.bag(d,'22:15'),pg_temp.bag(d+1,'06:00'),'auto','اختبار منطقة التوقيت');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.check_in=pg_temp.bag(d,'22:15') and a.check_out=pg_temp.bag(d+1,'06:00'), row_to_json(a)::text;
 perform set_config('TimeZone','UTC',true);
end$$;
