set client_min_messages=warning;
insert into auth.users(id,email) values
 ('400e0000-0000-0000-0000-000000000001','it-all@test.invalid'),
 ('400e0000-0000-0000-0000-000000000002','ops-all@test.invalid'),
 ('400e0000-0000-0000-0000-000000000003','dep-all@test.invalid'),
 ('400e0000-0000-0000-0000-000000000004','emp-all@test.invalid');
insert into public.user_roles(user_id,role) values
 ('400e0000-0000-0000-0000-000000000001','it_admin'),
 ('400e0000-0000-0000-0000-000000000002','ops_room'),
 ('400e0000-0000-0000-0000-000000000003','deputy_director'),
 ('400e0000-0000-0000-0000-000000000004','employee');
insert into public.departments(id,code,name,parent_id) values
 ('400e0000-0000-0000-0000-000000000011','ALL-ROOT','قسم مشترك',null),
 ('400e0000-0000-0000-0000-000000000012','ALL-CHILD','فرع مشترك','400e0000-0000-0000-0000-000000000011');
insert into public.employees(id,user_id,employee_number,full_name,hire_date,department_id,biometric_pin) values
 ('400e0000-0000-0000-0000-000000000021',null,'ALL-1','موظف بلا حساب','2024-01-01','400e0000-0000-0000-0000-000000000012',null),
 ('400e0000-0000-0000-0000-000000000022','400e0000-0000-0000-0000-000000000004','ALL-2','موظف بحساب','2024-01-01',null,'all22');
create function pg_temp.as_user(p uuid) returns void language sql as $$select set_config('auth.user_id',p::text,false)$$;
create function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$
begin
 begin execute q; exception when others then if position(code in sqlerrm)>0 then return; else raise; end if; end;
 raise exception 'TEST_FAIL expected %',code;
end$$;
do $$ declare it uuid:='400e0000-0000-0000-0000-000000000001'; ops uuid:='400e0000-0000-0000-0000-000000000002';
 dep uuid:='400e0000-0000-0000-0000-000000000003'; u uuid:='400e0000-0000-0000-0000-000000000004';
 root uuid:='400e0000-0000-0000-0000-000000000011'; child uuid:='400e0000-0000-0000-0000-000000000012';
 e uuid:='400e0000-0000-0000-0000-000000000021'; e2 uuid:='400e0000-0000-0000-0000-000000000022';
 step jsonb:=jsonb_build_array(jsonb_build_object('kind','account','user_id',dep));
 all_role uuid; all_dept uuid; specific uuid; inactive uuid; leave_type uuid; permit_type uuid; l uuid; p uuid; j jsonb; d date:=app.hr_local_date(now())+60;
begin
 perform pg_temp.as_user(ops);
 perform pg_temp.expect_err(format('select public.approval_chain_save(%L,%L,%L::jsonb)', 'employee','leave_time_all',step::text),'IT_FORBIDDEN');
 perform pg_temp.as_user(it);
 all_role:=public.approval_chain_save('employee','leave_time_all',step,true);
 assert (app.approval_chain_for_employee(e2,'leave','annual')).id=all_role,'role leave';
 assert (app.approval_chain_for_employee(e2,'time_permit','permit_paid')).id=all_role,'role permit';
 assert (app.approval_chain_for_employee(e2,'advance',null)).id is null,'not advances';
 assert (app.approval_chain_for_employee(e2,'platform_reset',null)).id is null,'not platform reset';
 perform pg_temp.expect_err(format('select public.approval_chain_save(%L,%L,%L::jsonb,true,%L)', 'employee','leave',step::text,'sick'),'APPROVAL_ALL_OVERLAP');
 perform pg_temp.expect_err(format('select public.approval_chain_save(%L,%L,%L::jsonb,true,%L)', 'employee','time_permit',step::text,'permit_paid'),'APPROVAL_ALL_OVERLAP');
 inactive:=public.approval_chain_save('employee','time_permit',step,false,'permit_paid');
 perform pg_temp.expect_err(format('update public.approval_chains set is_active=true where id=%L',inactive),'APPROVAL_ALL_OVERLAP');
 perform pg_temp.expect_err(format('select public.approval_chain_save(%L,%L,%L::jsonb,true,%L)', 'field_ops','leave_time_all',step::text,'annual'),'APPROVAL_SUBTYPE_NOT_ALLOWED');
 perform pg_temp.expect_err(format('select public.approval_chain_save(%L,%L,%L::jsonb)', 'field_ops','leave_time_all', '[{"kind":"account","user_id":"400e0000-0000-0000-0000-000000000003","condition":{"field":"days","op":"gte","value":3}}]'),'APPROVAL_ALL_CONDITION_NOT_ALLOWED');
 perform pg_temp.expect_err(format('update public.approval_chains set steps=%L::jsonb where id=%L', '[{"kind":"account","user_id":"400e0000-0000-0000-0000-000000000003","condition":{"field":"days","op":"gte","value":3}}]',all_role),'APPROVAL_ALL_CONDITION_NOT_ALLOWED');
 -- الاتجاه الآخر: النوع المحدد أولاً ثم المشتركة ممنوعة؛ المسودة المعطلة محفوظة.
 specific:=public.approval_chain_save('field_ops','leave',step,true,'annual');
 perform pg_temp.expect_err(format('select public.approval_chain_save(%L,%L,%L::jsonb)', 'field_ops','leave_time_all',step::text),'APPROVAL_ALL_OVERLAP');
 inactive:=public.approval_chain_save('field_ops','leave_time_all',step,false);
 perform pg_temp.expect_err(format('select public.approval_chain_save(%L,%L,%L::jsonb,true)', 'field_ops','leave_time_all',step::text),'APPROVAL_ALL_OVERLAP');
 assert exists(select 1 from public.approval_chain_versions where chain_id=inactive and action='created'),'versions retained';
 -- سلسلة القسم الأب تشمل الفرع وبلا حساب؛ سلسلة فرعية محددة تبقى أولى لنوعها فقط.
 all_dept:=public.approval_chain_save('employee','leave_time_all',step,true,null,root,true);
 assert (app.approval_chain_for_employee(e,'leave','unpaid')).id=all_dept,'parent leave';
 assert (app.approval_chain_for_employee(e,'time_permit','permit_unpaid')).id=all_dept,'parent permit';
 specific:=public.approval_chain_save('employee','leave',step,true,null,child,true);
 assert (app.approval_chain_for_employee(e,'leave','unpaid')).id=specific,'child leave first';
 assert (app.approval_chain_for_employee(e,'time_permit','permit_unpaid')).id=all_dept,'parent permit fallback';
 perform pg_temp.expect_err(format('select public.approval_chain_save(%L,%L,%L::jsonb,true,null,%L)', 'employee','time_permit',step::text,root),'APPROVAL_ALL_OVERLAP');
 j:=public.approval_diagnose(e,'time_permit','permit_unpaid');
 assert j->'chain'->>'id'=all_dept::text,'diagnosis picks shared chain';
 assert exists(select 1 from jsonb_array_elements(j->'department_path') dp cross join lateral jsonb_array_elements(dp->'chains') c where c->>'id'=all_dept::text and c->>'request_type'='leave_time_all' and (c->>'applies')::boolean),'diagnostic path includes shared chain';
 -- طلبات حقيقية من غرفة العمليات: تظل الأنواع والمحرك كما هما والمهام باسم نوعها الفعلي.
 select id into leave_type from public.hr_leave_types where code='unpaid';
 select id into permit_type from public.hr_leave_types where code='permit_unpaid';
 perform pg_temp.as_user(ops);
 l:=public.hr_leave_request(e,leave_type,d,d);
 p:=public.hr_leave_request(e,permit_type,d+1,d+1,'09:00','10:00');
 assert (select chain_id=specific and kind='leave' and status='pending' from public.hr_leaves where id=l),'real leave uses child';
 assert (select chain_id=all_dept and kind='time_permit' and status='pending' from public.hr_leaves where id=p),'real permit uses shared';
 assert exists(select 1 from public.approval_tasks where request_kind='time_permit' and request_id=p and chain_id=all_dept and status='pending' and dep=any(approvers)),'permit task actual kind';
 perform pg_temp.as_user(dep); perform public.hr_leave_decide(l,true,'موافق'); perform public.hr_leave_decide(p,true,'موافق');
 assert (select status='approved' from public.hr_leaves where id=l),'leave approved';
 assert (select status='approved' from public.hr_leaves where id=p),'permit approved';
 -- تعطيل السلسلة الفرعية ثم طلب إجازة متعددة الأيام على المشتركة نفسها.
 perform pg_temp.as_user(it); perform public.approval_chain_save('employee','leave',step,false,null,child,true);
 perform pg_temp.as_user(ops); l:=public.hr_leave_request(e,leave_type,d+2,d+3);
 assert (select chain_id=all_dept and kind='leave' and days=2 and status='pending' from public.hr_leaves where id=l),'multi-day leave uses shared chain';
 assert exists(select 1 from public.approval_tasks where request_kind='leave' and request_id=l and chain_id=all_dept and status='pending' and dep=any(approvers)),'leave task actual kind';
 -- تعطيل سلسلة لا يمس الطلبات والمهام التي فتحت من قبل.
 perform pg_temp.as_user(it); perform public.approval_chain_save('employee','leave_time_all',step,false,null,root,true);
 assert (select chain_id=all_dept and status='pending' from public.hr_leaves where id=l),'pending request unchanged';
 assert exists(select 1 from public.approval_tasks where request_id=l and chain_id=all_dept and status='pending' and dep=any(approvers)),'pending approval unchanged';
 perform pg_temp.as_user(dep); perform public.hr_leave_decide(l,true,'موافق');
 assert (select status='approved' from public.hr_leaves where id=l),'existing request can still finish';
 raise warning 'test ok: combined chains, exact-scope exclusion, real requests, diagnostic and precedence';
end$$;
