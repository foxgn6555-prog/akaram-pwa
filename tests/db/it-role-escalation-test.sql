-- 00371: IT أعلى دور؛ super_admin بوابة عادية؛ IT الذاتية مسموحة مع حماية آخر حساب IT.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
 ('90900000-0000-0000-0000-000000000001','sa.it9@t.iq'),
 ('90900000-0000-0000-0000-000000000002','it.it9@t.iq'),
 ('90900000-0000-0000-0000-000000000003','hr.it9@t.iq'),
 ('90900000-0000-0000-0000-000000000004','x.it9@t.iq'),
 ('90900000-0000-0000-0000-000000000005','ghost.it9@t.iq'),
 ('90900000-0000-0000-0000-000000000006','it2.it9@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
 ('90900000-0000-0000-0000-000000000001','super_admin'),
 ('90900000-0000-0000-0000-000000000002','it_admin'),
 ('90900000-0000-0000-0000-000000000003','hr_officer'),
 ('90900000-0000-0000-0000-000000000004','employee'),
 ('90900000-0000-0000-0000-000000000006','it_admin') on conflict do nothing;
do $$ declare msg text; who uuid[]; begin
  -- HR يستطيع الأدوار العادية فقط.
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000003', false);
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', true); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R1 %', msg; end if;
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'it_admin', true); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R2 %', msg; end if;
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'department_manager', true);

  -- super_admin هو دور بوابة عادية ولا يستطيع إدارة الأدوار.
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000001', false);
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'employee', false); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'USERS_FORBIDDEN%' then raise exception 'FAIL R3 super_admin authority %', msg; end if;
  begin perform public.list_platform_users(null); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'USERS_FORBIDDEN%' then raise exception 'FAIL R3b manager user list %', msg; end if;
  begin perform app.require_it(); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'IT_FORBIDDEN%' then raise exception 'FAIL R3c require_it %', msg; end if;

  -- IT تمنح الأدوار العليا، بما فيها IT، وتستطيع تعديل أدوار حسابها.
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000002', false);
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', true);
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'it_admin', true);
  if not exists (select 1 from public.user_roles where user_id = '90900000-0000-0000-0000-000000000004' and role = 'it_admin') then raise exception 'FAIL R4 grant IT'; end if;
  perform public.set_user_role('90900000-0000-0000-0000-000000000002', 'department_manager', true);
  perform public.set_user_role('90900000-0000-0000-0000-000000000002', 'it_admin', false);
  if exists (select 1 from public.user_roles where user_id = '90900000-0000-0000-0000-000000000002' and role = 'it_admin') then raise exception 'FAIL R5 self-edit'; end if;

  -- بعد وجود IT أخرى، يمكن إزالة IT من حساب؛ لا يمكن حذف آخر حساب.
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000006', false);
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'it_admin', false);
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000006', 'it_admin', false); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'LAST_IT_ADMIN%' then raise exception 'FAIL R6 last IT admin %', msg; end if;

  -- خطوة «حساب» لمستخدم حُذف لاحقاً تُحلّ إلى لا أحد (تُخطّى) بدل خطوة معلّقة بلا مُعتمِد.
  who := app.approval_resolve_step(jsonb_build_object('kind','account','user_id','90900000-0000-0000-0000-000000000005'), '90900000-0000-0000-0000-000000000004');
  if cardinality(who) <> 1 then raise exception 'FAIL A1'; end if;
  delete from auth.users where id = '90900000-0000-0000-0000-000000000005';
  who := app.approval_resolve_step(jsonb_build_object('kind','account','user_id','90900000-0000-0000-0000-000000000005'), '90900000-0000-0000-0000-000000000004');
  if cardinality(who) <> 0 then raise exception 'FAIL A2 orphan approver kept'; end if;
  raise notice 'it role management test ok';
end $$;
