-- 00309: لا تصعيد صلاحيات عبر set_user_role · خطوة «حساب» محذوف تُخطّى
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('90900000-0000-0000-0000-000000000001','sa.it9@t.iq'),('90900000-0000-0000-0000-000000000002','it.it9@t.iq'),('90900000-0000-0000-0000-000000000003','hr.it9@t.iq'),('90900000-0000-0000-0000-000000000004','x.it9@t.iq'),('90900000-0000-0000-0000-000000000005','ghost.it9@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('90900000-0000-0000-0000-000000000001','super_admin'),('90900000-0000-0000-0000-000000000002','it_admin'),('90900000-0000-0000-0000-000000000003','hr_officer'),('90900000-0000-0000-0000-000000000004','employee') on conflict do nothing;
do $$ declare msg text; who uuid[]; begin
  -- HR يحاول منح super_admin لحساب آخر
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000003', false);
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', true); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R1 %', msg; end if;
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'it_admin', true); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R2 %', msg; end if;
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'department_manager', true);   -- الأدوار العادية ما زالت متاحة
  -- IT يحاول منح super_admin / سحبه من المدير المفوض
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000002', false);
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', true); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R3 %', msg; end if;
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000001', 'super_admin', false); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R4 %', msg; end if;
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'it_admin', true);   -- IT يمنح IT
  if not exists (select 1 from public.user_roles where user_id = '90900000-0000-0000-0000-000000000004' and role = 'it_admin') then raise exception 'FAIL R5'; end if;
  -- المدير المفوض يمنح super_admin ثم لا يمكن سحب الأخير
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000001', false);
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', true);
  delete from public.user_roles where role = 'super_admin' and user_id <> '90900000-0000-0000-0000-000000000004' and user_id <> '90900000-0000-0000-0000-000000000001';
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', false);
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000004', false);
  perform public.set_user_role('90900000-0000-0000-0000-000000000001', 'super_admin', false);   -- هو IT؛ يجب أن يفشل
  raise exception 'FAIL R6 IT removed super admin';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if sqlerrm not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R6b %', sqlerrm; end if;
end $$;
do $$ declare who uuid[]; begin
  -- خطوة «حساب» لمستخدم حُذف لاحقاً تُحلّ إلى لا أحد (تُخطّى) بدل خطوة معلّقة بلا مُعتمِد
  who := app.approval_resolve_step(jsonb_build_object('kind','account','user_id','90900000-0000-0000-0000-000000000005'), '90900000-0000-0000-0000-000000000004');
  if cardinality(who) <> 1 then raise exception 'FAIL A1'; end if;
  delete from auth.users where id = '90900000-0000-0000-0000-000000000005';
  who := app.approval_resolve_step(jsonb_build_object('kind','account','user_id','90900000-0000-0000-0000-000000000005'), '90900000-0000-0000-0000-000000000004');
  if cardinality(who) <> 0 then raise exception 'FAIL A2 orphan approver kept'; end if;
  raise notice 'it role escalation test ok';
end $$;
