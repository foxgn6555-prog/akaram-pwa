-- 00370: تقنية المعلومات تدير جميع الأدوار، مع منع تعديل الذات وحماية آخر super_admin.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('90900000-0000-0000-0000-000000000001','sa.it9@t.iq'),('90900000-0000-0000-0000-000000000002','it.it9@t.iq'),('90900000-0000-0000-0000-000000000003','hr.it9@t.iq'),('90900000-0000-0000-0000-000000000004','x.it9@t.iq'),('90900000-0000-0000-0000-000000000005','ghost.it9@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('90900000-0000-0000-0000-000000000001','super_admin'),('90900000-0000-0000-0000-000000000002','it_admin'),('90900000-0000-0000-0000-000000000003','hr_officer'),('90900000-0000-0000-0000-000000000004','employee') on conflict do nothing;
do $$ declare msg text; who uuid[]; begin
  -- HR ما زال ممنوعاً من منح الأدوار العالية
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000003', false);
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', true); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R1 %', msg; end if;
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'it_admin', true); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'ROLE_ESCALATION_FORBIDDEN%' then raise exception 'FAIL R2 %', msg; end if;
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'department_manager', true);

  -- IT يمنح ويسحب super_admin من الآخرين؛ لا يستطيع تعديل أدواره بنفسه.
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000002', false);
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', true);
  if not exists (select 1 from public.user_roles where user_id = '90900000-0000-0000-0000-000000000004' and role = 'super_admin') then raise exception 'FAIL R3 grant'; end if;
  perform public.set_user_role('90900000-0000-0000-0000-000000000001', 'super_admin', false);
  if exists (select 1 from public.user_roles where user_id = '90900000-0000-0000-0000-000000000001' and role = 'super_admin') then raise exception 'FAIL R4 revoke'; end if;
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000002', 'it_admin', false); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'SELF_MODIFY_FORBIDDEN%' then raise exception 'FAIL R5 self-edit %', msg; end if;
  begin perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', false); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg not like 'LAST_SUPER_ADMIN%' then raise exception 'FAIL R6 last super_admin %', msg; end if;

  -- IT يعيد دور المدير المفوض؛ ثم يظل المدير المفوض قادراً على إدارة الدور.
  perform public.set_user_role('90900000-0000-0000-0000-000000000001', 'super_admin', true);
  perform set_config('auth.user_id','90900000-0000-0000-0000-000000000001', false);
  perform public.set_user_role('90900000-0000-0000-0000-000000000004', 'super_admin', false);
end $$;
do $$ declare who uuid[]; begin
  -- خطوة «حساب» لمستخدم حُذف لاحقاً تُحلّ إلى لا أحد (تُخطّى) بدل خطوة معلّقة بلا مُعتمِد
  who := app.approval_resolve_step(jsonb_build_object('kind','account','user_id','90900000-0000-0000-0000-000000000005'), '90900000-0000-0000-0000-000000000004');
  if cardinality(who) <> 1 then raise exception 'FAIL A1'; end if;
  delete from auth.users where id = '90900000-0000-0000-0000-000000000005';
  who := app.approval_resolve_step(jsonb_build_object('kind','account','user_id','90900000-0000-0000-0000-000000000005'), '90900000-0000-0000-0000-000000000004');
  if cardinality(who) <> 0 then raise exception 'FAIL A2 orphan approver kept'; end if;
  raise notice 'it role management test ok';
end $$;
