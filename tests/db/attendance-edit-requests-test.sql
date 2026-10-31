-- depends: tests/db/attendance-missing-punch-guard-test.sql
-- 00399-د: الطلبات والسلاسل والنطاقات على قواعد تصحيح الناقصة الجديدة.
insert into public.departments(id,code,name,parent_id) values
 ('39940000-0000-0000-0000-000000000030','MP-DEPT','قسم الاختبار',null),
 ('39940000-0000-0000-0000-000000000031','MP-SUB','الشعبة','39940000-0000-0000-0000-000000000030');
update public.employees set department_id='39940000-0000-0000-0000-000000000030' where id='39940000-0000-0000-0000-000000000011';
update public.employees set department_id='39940000-0000-0000-0000-000000000031' where id='39940000-0000-0000-0000-000000000012';
do $$ declare d date:=current_setting('test.mpday')::date+20; e uuid:='39940000-0000-0000-0000-000000000011'; dep uuid:='39940000-0000-0000-0000-000000000030'; j jsonb; r record; rid uuid;
begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 j:=public.attendance_edit_preview('department_tree',array[dep],array[d,d+1],'full_presence','{"missing_side":"out"}');
 assert (j->>'employees')::int=2 and (j->>'days')::int=2 and (j->>'items')::int=4 and (j->>'skipped')::int=0,j::text;
 assert not exists(select 1 from jsonb_array_elements(j->'rows') x where not (x->'proposed'->>'needs_approval')::boolean), 'no punches require approval';
 assert (public.attendance_edit_preview('department',array[dep],array[d],'full_presence','{"missing_side":"out"}')->>'employees')::int=1, 'department excludes child';
 j:=public.attendance_edit_create('department_tree',array[dep],array[d,d+1],'full_presence','{"missing_side":"out"}','الحضور موثق لجميع الأيام','hr_request'); rid:=(j->>'id')::uuid;
 assert j->>'status'='pending_approval' and (j->>'items')::int=4,j::text;
 assert not exists(select 1 from public.hr_attendance_days where employee_id in (e,'39940000-0000-0000-0000-000000000012') and work_date in (d,d+1) and source='manual'), 'nothing applied pending approval';
 select * into r from public.attendance_edit_list() x where x.id=rid;
 assert r.items_count=4 and r.status='pending_approval' and r.can_cancel,'request list';
 j:=public.attendance_edit_detail(rid);
 assert jsonb_array_length(j->'items')=4,'request detail';
 perform public.attendance_edit_cancel(rid,'إلغاء الطلب');
 assert (select status='cancelled' from public.attendance_edit_requests where id=rid),'cancel state';
 assert not exists(select 1 from public.approval_tasks where request_id=rid and request_kind='attendance_edit' and status in ('pending','waiting')),'cancel approval tasks';
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000004');
 perform pg_temp.expect_err(format('select public.attendance_edit_detail(%L)',rid),'HR_FORBIDDEN');
 perform pg_temp.expect_err('select * from public.attendance_edit_list()','HR_FORBIDDEN');
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000003');
 perform pg_temp.expect_err(format('select public.attendance_edit_create(%L,array[%L::uuid],array[%L::date],%L,%L::jsonb,%L,%L)','employees',e,d,'full_presence','{"missing_side":"out"}','سبب اختبار كاف','hr_request'),'ATT_EDIT_MODE_INVALID');
end$$;
