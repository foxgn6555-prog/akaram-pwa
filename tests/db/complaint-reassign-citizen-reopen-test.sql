-- 00302 · إعادة إسناد عنصر شكوى بسبب + إعادة فتح شكوى مواطن منتهية بسبب
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('cb000000-0000-0000-0000-00000000000a','cb-comp@t.iq'),('cb000000-0000-0000-0000-00000000000b','cb-mgr@t.iq'),('cb000000-0000-0000-0000-00000000000c','cb-mgr2@t.iq'),('cb000000-0000-0000-0000-00000000000d','cb-ops@t.iq') on conflict do nothing;
insert into public.user_roles (user_id, role) values ('cb000000-0000-0000-0000-00000000000a','complaints_officer'),('cb000000-0000-0000-0000-00000000000b','department_manager'),('cb000000-0000-0000-0000-00000000000c','department_manager'),('cb000000-0000-0000-0000-00000000000d','ops_room') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values ('cb000000-0000-0000-0000-0000000000e1','cb000000-0000-0000-0000-00000000000b','CB-M1','سالم أحمد','2024-01-01'),('cb000000-0000-0000-0000-0000000000e2','cb000000-0000-0000-0000-00000000000c','CB-M2','كريم جاسم','2024-01-01') on conflict (employee_number) do nothing;
insert into public.complaints (id, reference_no, sector, municipal_center, source, received_at, status) values ('cb000000-0000-0000-0000-0000000000c1','CMP-CB-1','karrada','الرياض','manual',now(),'under_review') on conflict do nothing;
insert into public.complaint_items (id, complaint_id, sequence_no, title, status) values ('cb000000-0000-0000-0000-00000000001a','cb000000-0000-0000-0000-0000000000c1',1,'أ','under_review') on conflict do nothing;
select auth.set_test_user('cb000000-0000-0000-0000-00000000000a');
do $$ declare i1 uuid := 'cb000000-0000-0000-0000-00000000001a'; c1 uuid := 'cb000000-0000-0000-0000-0000000000c1'; m1 uuid := 'cb000000-0000-0000-0000-00000000000b'; m2 uuid := 'cb000000-0000-0000-0000-00000000000c'; r record; msg text; begin
  -- لا إعادة إسناد لعنصر غير مسند
  begin perform public.complaint_reassign_item(i1, m2, 'سبب'); msg := 'NO'; exception when others then msg := sqlerrm; end;
  if msg <> 'COMPLAINT_REASSIGN_STATE_INVALID' then raise exception 'FAIL R1 %', msg; end if;
  perform public.complaint_assign_items(array[i1], m1);
  -- بلا سبب / نفس المسؤول / غير مسؤول
  begin perform public.complaint_reassign_item(i1, m2, '  '); msg := 'NO'; exception when others then msg := sqlerrm; end;
  if msg <> 'COMPLAINT_REASSIGN_REASON_REQUIRED' then raise exception 'FAIL R2 %', msg; end if;
  begin perform public.complaint_reassign_item(i1, m1, 'سبب'); msg := 'NO'; exception when others then msg := sqlerrm; end;
  if msg <> 'COMPLAINT_REASSIGN_SAME_MANAGER' then raise exception 'FAIL R3 %', msg; end if;
  begin perform public.complaint_reassign_item(i1, 'cb000000-0000-0000-0000-00000000000d', 'سبب'); msg := 'NO'; exception when others then msg := sqlerrm; end;
  if msg <> 'COMPLAINT_MANAGER_INVALID' then raise exception 'FAIL R4 %', msg; end if;
  -- المسؤول بدأ العمل ثم غاب → إعادة إسناد
  perform set_config('auth.user_id', m1::text, false); perform public.complaint_start_item(i1);
  perform set_config('auth.user_id', 'cb000000-0000-0000-0000-00000000000a', false);
  perform public.complaint_reassign_item(i1, m2, 'غياب المسؤول');
  select * into r from public.complaint_items where id = i1;
  if r.assigned_to <> m2 or r.status <> 'assigned' or r.started_at is not null then raise exception 'FAIL R5 % % %', r.assigned_to, r.status, r.started_at; end if;
  select status into msg from public.complaints where id = c1; if msg <> 'assigned' then raise exception 'FAIL R6 parent %', msg; end if;
  select note into msg from public.complaint_status_history where item_id = i1 and to_status = 'assigned' order by created_at desc limit 1;
  if msg not like 'إعادة إسناد من سالم أحمد إلى كريم جاسم — غياب المسؤول' then raise exception 'FAIL R7 %', msg; end if;
  if not exists (select 1 from public.notifications where user_id = m1 and title like 'سُحب منك موقع شكوى%') then raise exception 'FAIL R8 old mgr not notified'; end if;
  if not exists (select 1 from public.notifications where user_id = m2 and title like 'شكوى مسندة إليك (إعادة إسناد)%') then raise exception 'FAIL R9 new mgr not notified'; end if;
  -- المسؤول القديم لا يستطيع البدء، الجديد يستطيع
  perform set_config('auth.user_id', m1::text, false);
  begin perform public.complaint_start_item(i1); msg := 'NO'; exception when others then msg := sqlerrm; end;
  if msg <> 'COMPLAINT_START_FORBIDDEN' then raise exception 'FAIL R10 %', msg; end if;
  perform set_config('auth.user_id', m2::text, false); perform public.complaint_start_item(i1);
  -- مدير غير مخوّل لا يعيد الإسناد
  begin perform public.complaint_reassign_item(i1, m1, 'سبب'); msg := 'NO'; exception when others then msg := sqlerrm; end;
  if msg <> 'COMPLAINT_ASSIGN_FORBIDDEN' then raise exception 'FAIL R11 %', msg; end if;
end $$;
-- شكوى مواطن: إعادة فتح بسبب
select auth.set_test_user('cb000000-0000-0000-0000-00000000000d');
do $$ declare c uuid; r record; msg text; m1 uuid := 'cb000000-0000-0000-0000-00000000000b'; begin
  insert into public.citizen_accounts (full_name, phone) values ('مواطن تجريبي رابع','07700000002') returning id into c;
  insert into public.citizen_complaints (ref_no, citizen_id, full_name, phone, details) values ('CC-T-2', c, 'مواطن تجريبي رابع','07700000002','تفاصيل تجريبية طويلة كفاية') returning id into c;
  perform public.ops_citizen_complaint_assign(c, m1, null);
  perform set_config('auth.user_id', m1::text, false);
  perform public.citizen_complaint_set_status(c, 'resolved', 'تمت المعالجة');
  update public.citizen_complaints set citizen_rating = 4 where id = c;
  begin perform public.citizen_complaint_set_status(c, 'in_progress', null); msg := 'NO'; exception when others then msg := sqlerrm; end;
  if msg <> 'CITIZEN_NOTE_REQUIRED' then raise exception 'FAIL C1 reopen without note: %', msg; end if;
  perform public.citizen_complaint_set_status(c, 'in_progress', 'المواطن أبلغ أن المشكلة عادت');
  select * into r from public.citizen_complaints where id = c;
  if r.status <> 'in_progress' or r.resolved_at is not null or r.resolution_note is not null or r.citizen_rating is not null then raise exception 'FAIL C2 % % % %', r.status, r.resolved_at, r.resolution_note, r.citizen_rating; end if;
  select note into msg from public.citizen_complaint_events where complaint_id = c and from_status = 'resolved';
  if msg not like 'إعادة فتح بعد الإنهاء — السبب: المواطن أبلغ أن المشكلة عادت%ملاحظة الإنهاء السابقة: تمت المعالجة%تقييم المواطن السابق: 4/5' then raise exception 'FAIL C3 %', msg; end if;
  if not exists (select 1 from public.notifications where user_id = 'cb000000-0000-0000-0000-00000000000d' and title like 'إعادة فتح شكوى مواطن%') then raise exception 'FAIL C4 ops not notified'; end if;
  -- الإنهاء مجدداً ما زال يتطلب ملاحظة ويعمل
  perform public.citizen_complaint_set_status(c, 'resolved', 'عولجت نهائياً');
  select * into r from public.citizen_complaints where id = c; if r.status <> 'resolved' or r.resolution_note <> 'عولجت نهائياً' then raise exception 'FAIL C5'; end if;
  raise notice 'test ok: complaint-reassign-citizen-reopen (00302)';
end $$;
