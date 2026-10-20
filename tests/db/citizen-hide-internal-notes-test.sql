-- 00310: الملاحظات الداخلية واسم المكلَّف لا يصلان إلى المواطن
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('c1000000-0000-0000-0000-000000000001','ops.c10@t.iq'),('c1000000-0000-0000-0000-000000000002','mgr.c10@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('c1000000-0000-0000-0000-000000000001','ops_room'),('c1000000-0000-0000-0000-000000000002','department_manager') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values ('c1000000-0000-0000-0000-0000000000e2','c1000000-0000-0000-0000-000000000002','C10-M','مسؤول القسم السرّي','2024-01-01') on conflict (employee_number) do nothing;
do $$ declare tok uuid; j jsonb; c jsonb; mine jsonb; full_j jsonb; begin
  j := public.citizen_sign_in('مواطن اختبار عاشر', '07701234510');
  tok := (j ->> 'token')::uuid;
  c := public.citizen_complaint_submit(tok, 'مواطن اختبار عاشر', 'تفاصيل شكوى كافية الطول للاختبار', null, null, 'شارع 10', null);
  perform set_config('auth.user_id','c1000000-0000-0000-0000-000000000001', false);
  perform public.ops_citizen_complaint_assign((c ->> 'id')::uuid, 'c1000000-0000-0000-0000-000000000002', null);
  perform public.citizen_complaint_add_note((c ->> 'id')::uuid, 'ملاحظة داخلية سرية جداً');
  perform set_config('auth.user_id','', false);
  mine := public.citizen_my_complaints(tok);
  if mine::text like '%سرية جداً%' then raise exception 'FAIL N1 internal note leaked to citizen'; end if;
  if mine::text like '%السرّي%' then raise exception 'FAIL N2 assignee name leaked to citizen'; end if;
  if not exists (select 1 from jsonb_array_elements(mine -> 0 -> 'events') e where e ->> 'kind' = 'assigned') then raise exception 'FAIL N3 assigned event should remain visible'; end if;
  perform set_config('auth.user_id','c1000000-0000-0000-0000-000000000001', false);
  full_j := app.citizen_complaint_json((select x from public.citizen_complaints x where id = (c ->> 'id')::uuid), true);
  if full_j::text not like '%سرية جداً%' or full_j ->> 'assignee_name' <> 'مسؤول القسم السرّي' then raise exception 'FAIL N4 staff view must keep note and assignee'; end if;
  raise notice 'citizen hide internal notes test ok';
end $$;
