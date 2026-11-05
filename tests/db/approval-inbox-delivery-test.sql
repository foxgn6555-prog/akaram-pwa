set client_min_messages=warning;
insert into auth.users(id,email) values
 ('36700000-0000-0000-0000-000000000001','it-367@test.iq'),
 ('36700000-0000-0000-0000-000000000002','ops-367@test.iq'),
 ('36700000-0000-0000-0000-000000000003','mgr-367@test.iq'),
 ('36700000-0000-0000-0000-000000000004','exec-367@test.iq'),
 ('36700000-0000-0000-0000-000000000005','hr-367@test.iq'),
 ('36700000-0000-0000-0000-000000000006','fin-367@test.iq');
insert into public.user_roles(user_id,role) values
 ('36700000-0000-0000-0000-000000000001','it_admin'),('36700000-0000-0000-0000-000000000002','ops_room'),
 ('36700000-0000-0000-0000-000000000003','department_manager'),('36700000-0000-0000-0000-000000000004','executive_director'),
 ('36700000-0000-0000-0000-000000000005','hr_officer'),('36700000-0000-0000-0000-000000000006','finance_officer');
insert into public.departments(id,code,name) values ('36700000-0000-0000-0000-000000000010','DEP367','قسم الاختبار');
insert into public.employees(id,user_id,employee_number,full_name,hire_date,department_id) values
 ('36700000-0000-0000-0000-000000000021','36700000-0000-0000-0000-000000000003','E367-1','مدير','2024-01-01',null),
 ('36700000-0000-0000-0000-000000000022',null,'E367-2','طالب سلسلة','2024-01-01','36700000-0000-0000-0000-000000000010'),
 ('36700000-0000-0000-0000-000000000023',null,'E367-3','طالب مدير مباشر','2024-01-01',null),
 ('36700000-0000-0000-0000-000000000024',null,'E367-4','طالب محال للموارد','2024-01-01',null);
update public.employees set manager_id='36700000-0000-0000-0000-000000000021' where id='36700000-0000-0000-0000-000000000023';
create function pg_temp.as_user(p uuid) returns void language sql as $$select set_config('auth.user_id',p::text,false)$$;
do $$ declare
 it uuid:='36700000-0000-0000-0000-000000000001'; ops uuid:='36700000-0000-0000-0000-000000000002'; mgr uuid:='36700000-0000-0000-0000-000000000003'; ex uuid:='36700000-0000-0000-0000-000000000004'; hr uuid:='36700000-0000-0000-0000-000000000005'; fin uuid:='36700000-0000-0000-0000-000000000006';
 typ uuid; lid uuid; direct uuid; fallback uuid; d date:=app.hr_local_date(now())+110;
begin
 select id into typ from public.hr_leave_types where code='unpaid';
 perform pg_temp.as_user(it);
 perform public.approval_chain_save('employee','leave_time_all',jsonb_build_array(jsonb_build_object('kind','account','user_id',mgr),jsonb_build_object('kind','account','user_id',ex)),true,null,'36700000-0000-0000-0000-000000000010',true);
 perform pg_temp.as_user(ops);
 lid:=public.hr_leave_request('36700000-0000-0000-0000-000000000022',typ,d,d+1);
 assert exists(select 1 from public.notifications n where n.user_id=mgr and n.link='/manager/approvals' and n.dedupe_key like 'approval:%'), 'manager notification link';
 perform pg_temp.as_user(fin);
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=lid), 'other account must not see';
 begin perform public.approval_decide_request('leave',lid,true,null); raise exception 'unauthorized accepted'; exception when others then if sqlerrm not like '%HR_FORBIDDEN%' then raise; end if; end;
 perform pg_temp.as_user(ex);
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=lid), 'second step not yet';
 perform pg_temp.as_user(mgr);
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=lid and x.step_no=1 and x.total_steps=2 and x.type_name is not null), 'manager inbox';
 perform public.approval_decide_request('leave',lid,true,null);
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=lid), 'manager finished';
 assert (select status='pending' from public.hr_leaves where id=lid),'not final yet';
 assert exists(select 1 from public.notifications n where n.user_id=ex and n.link='/executive/approvals' and n.dedupe_key like 'approval:%'), 'executive link';
 perform pg_temp.as_user(ex);
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=lid and x.step_no=2 and jsonb_array_length(x.previous_steps)=1), 'executive inbox';
 perform public.approval_decide_request('leave',lid,true,null);
 assert (select status='approved' from public.hr_leaves where id=lid),'final approved';
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=lid),'completed gone';
 perform pg_temp.as_user(ops);
 direct:=public.hr_leave_request('36700000-0000-0000-0000-000000000023',typ,d,d);
 fallback:=public.hr_leave_request('36700000-0000-0000-0000-000000000024',typ,d,d);
 assert exists(select 1 from public.notifications where user_id=mgr and dedupe_key='leave_req:'||direct and link='/manager/approvals'),'direct notification';
 assert exists(select 1 from public.notifications where user_id=hr and dedupe_key='leave_hr_fallback:'||fallback and link='/hr/approvals'),'HR notification';
 perform pg_temp.as_user(mgr);
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=direct and x.details->>'approval_fallback'='true'),'direct fallback inbox';
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=fallback),'other manager cannot see';
 perform public.approval_decide_request('leave',direct,false,'سبب الرفض');
 assert (select status='rejected' from public.hr_leaves where id=direct),'direct rejected';
 perform pg_temp.as_user(hr);
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=fallback and x.details->>'approval_fallback'='true'),'hr fallback inbox';
 perform public.approval_decide_request('leave',fallback,true,null);
 assert (select status='approved' from public.hr_leaves where id=fallback),'hr approved';
end$$;
do $$ declare
 it uuid:='36700000-0000-0000-0000-000000000001'; ops uuid:='36700000-0000-0000-0000-000000000002'; fin uuid:='36700000-0000-0000-0000-000000000006'; mgr uuid:='36700000-0000-0000-0000-000000000003'; ex uuid:='36700000-0000-0000-0000-000000000004';
 j jsonb; id uuid;
begin
 perform pg_temp.as_user(it);
 perform public.approval_chain_save('ops_room','disclosure',jsonb_build_array(jsonb_build_object('kind','account','user_id',fin),jsonb_build_object('kind','account','user_id',ex)),true);
 perform pg_temp.as_user(ops);
 j:=public.disclosure_save(null,jsonb_build_object('target_kind','employee','employee_id','36700000-0000-0000-0000-000000000022','violation_type','delay','details','تفاصيل الاختبار الكامل','log_date',current_date)); id:=(j->>'id')::uuid;
 perform public.disclosure_submit(id);
 perform pg_temp.as_user(mgr);
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=id),'other user cannot see disclosure';
 begin perform public.disclosure_get(id); raise exception 'unexpected disclosure read'; exception when others then if sqlerrm not like '%DISCLOSURE_FORBIDDEN%' then raise; end if; end;
 perform pg_temp.as_user(fin);
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=id and x.request_kind='disclosure' and x.step_no=1),'assigned disclosure in inbox';
 assert exists(select 1 from public.notifications where user_id=fin and link='/finance/approvals' and dedupe_key like 'approval:%'),'finance disclosure link';
 j:=public.disclosure_get(id); assert (j->>'can_decide')::boolean, 'assigned disclosure readable and actionable';
 j:=public.disclosure_decide(id,true,null,null);
 assert j->>'status'='pending','still next step';
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=id),'first approver no longer pending';
 perform pg_temp.as_user(ex);
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=id and x.step_no=2),'next disclosure approver';
 j:=public.disclosure_decide(id,false,'توضيح مطلوب',null);
 assert j->>'status'='returned','disclosure returned to ops';
end$$;
-- وضع الجميع والتفويض: كل معتمد لم يصوت يرى الزمنية فقط، ثم تختفي بعد تصويته دون تجاوز بقية المعتمدين.
insert into auth.users(id,email) values ('36700000-0000-0000-0000-000000000007','hr2-367@test.iq');
insert into public.user_roles(user_id,role) values ('36700000-0000-0000-0000-000000000007','hr_officer');
do $$ declare
 it uuid:='36700000-0000-0000-0000-000000000001'; ops uuid:='36700000-0000-0000-0000-000000000002'; hr uuid:='36700000-0000-0000-0000-000000000005'; hr2 uuid:='36700000-0000-0000-0000-000000000007'; fin uuid:='36700000-0000-0000-0000-000000000006'; typ uuid; pid uuid; d date:=app.hr_local_date(now())+140;
begin
 select id into typ from public.hr_leave_types where code='permit_unpaid';
 perform pg_temp.as_user(it);
 perform public.approval_chain_save('employee','leave_time_all',jsonb_build_array(jsonb_build_object('kind','hierarchy','role','hr_officer','mode','all')),true,null,'36700000-0000-0000-0000-000000000010',true);
 perform pg_temp.as_user(hr);
 perform public.approval_delegation_set(fin,current_date,current_date+2);
 perform pg_temp.as_user(ops);
 pid:=public.hr_leave_request('36700000-0000-0000-0000-000000000022',typ,d,d,'09:00','10:00');
 perform pg_temp.as_user(fin);
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=pid and x.request_kind='time_permit'),'delegate sees permit';
 perform public.approval_decide_request('time_permit',pid,true,null);
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=pid),'delegate voted, no repeat';
 perform pg_temp.as_user(hr);
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=pid),'principal voted via delegate';
 assert (select status='pending' from public.hr_leaves where id=pid),'all mode waits';
 -- إعادة التنبيه لا تنشئ إشعاراً لمَن صوّت أو من صوّت مفوَّضه.
 delete from public.notifications n where n.user_id in (fin,hr) and n.dedupe_key in (select 'approval:'||t.id::text from public.approval_tasks t where t.request_id=pid);
 perform app.approval_notify_step('time_permit',pid,1);
 assert not exists(select 1 from public.notifications n where n.user_id in (fin,hr) and n.dedupe_key in (select 'approval:'||t.id::text from public.approval_tasks t where t.request_id=pid)), 'do not notify already-voted users';
 perform pg_temp.as_user(hr2);
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=pid),'other HR sees permit';
 perform public.approval_decide_request('time_permit',pid,true,null);
 assert (select status='approved' from public.hr_leaves where id=pid),'all finished';
end$$;
-- التنفيذ كدور authenticated نفسه لا كمالك الجداول: تبقى البيانات محصورة ويُمنع استدعاء الأغلفة الخاصة.
do $$ declare typ uuid; id uuid; begin
 perform pg_temp.as_user('36700000-0000-0000-0000-000000000002');
 select t.id into typ from public.hr_leave_types t where t.code='unpaid';
 id:=public.hr_leave_request('36700000-0000-0000-0000-000000000024',typ,app.hr_local_date(now())+200,app.hr_local_date(now())+200);
 perform set_config('test.approval_367_id',id::text,false);
end$$;
set role authenticated;
select pg_temp.as_user('36700000-0000-0000-0000-000000000006');
do $$ begin
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=current_setting('test.approval_367_id')::uuid), 'authenticated unrelated user cannot read fallback';
 begin perform app.approval_my_tasks_chain_00367(); raise exception 'private approval function executable'; exception when insufficient_privilege then null; end;
 begin perform app.disclosure_get_scoped_00367(gen_random_uuid()); raise exception 'private disclosure function executable'; exception when insufficient_privilege then null; end;
end$$;
select pg_temp.as_user('36700000-0000-0000-0000-000000000005');
do $$ begin
 assert exists(select 1 from public.approval_my_tasks() x where x.request_id=current_setting('test.approval_367_id')::uuid), 'authenticated HR sees own fallback';
 perform public.approval_decide_request('leave',current_setting('test.approval_367_id')::uuid,true,null);
 assert not exists(select 1 from public.approval_my_tasks() x where x.request_id=current_setting('test.approval_367_id')::uuid), 'authenticated decision removed task';
end$$;
reset role;
set role authenticated;
select pg_temp.as_user('36700000-0000-0000-0000-000000000006');
do $$ begin
 begin perform public.list_platform_users(null); raise exception 'directory exposed'; exception when others then if sqlerrm not like '%USERS_FORBIDDEN%' then raise; end if; end;
 assert exists(select 1 from public.approval_delegate_candidates('مدير') c where c.id='36700000-0000-0000-0000-000000000003' and c.label='مدير'), 'restricted name lookup';
 assert not exists(select 1 from public.approval_delegate_candidates('م')), 'no bulk search';
 assert exists(select 1 from public.approval_delegate_candidates('hr-367@test.iq') c where c.id='36700000-0000-0000-0000-000000000005'), 'exact account email lookup when no name';
 assert not exists(select 1 from public.approval_delegate_candidates('fin-367@test.iq')), 'cannot select self';
end$$;
reset role;
-- وحدات الوارد مسجَّلة فعلياً في نظام الصلاحيات: الدور الصحيح يراها، وغير صاحب البوابة لا يراها.
set role authenticated;
select pg_temp.as_user('36700000-0000-0000-0000-000000000003');
do $$ begin
 assert public.can_i('manager.approvals','view'), 'manager portal approval permission';
 assert not public.can_i('finance.approvals','view'), 'other portal remains forbidden';
 assert (public.my_permissions()->'manager.approvals') ? 'view', 'permission reaches shell';
end$$;
select pg_temp.as_user('36700000-0000-0000-0000-000000000005');
do $$ begin assert public.can_i('hr.approvals','view'), 'HR approval permission'; end$$;
select pg_temp.as_user('36700000-0000-0000-0000-000000000006');
do $$ begin assert public.can_i('finance.approvals','view'), 'finance approval permission'; end$$;
reset role;
