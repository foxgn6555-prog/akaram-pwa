set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('ca000000-0000-0000-0000-00000000000a','ca-comp@t.iq'),('ca000000-0000-0000-0000-00000000000b','ca-mgr@t.iq'),('ca000000-0000-0000-0000-00000000000c','ca-mgr2@t.iq'),('ca000000-0000-0000-0000-00000000000d','ca-ops@t.iq') on conflict do nothing;
insert into public.user_roles (user_id, role) values ('ca000000-0000-0000-0000-00000000000a','complaints_officer'),('ca000000-0000-0000-0000-00000000000b','department_manager'),('ca000000-0000-0000-0000-00000000000c','department_manager'),('ca000000-0000-0000-0000-00000000000d','ops_room') on conflict do nothing;
insert into public.complaints (id, reference_no, sector, municipal_center, source, received_at, status) values ('ca000000-0000-0000-0000-0000000000c1','CMP-CA-1','karrada','الرياض','manual',now(),'under_review') on conflict do nothing;
insert into public.complaint_items (id, complaint_id, sequence_no, title, status) values ('ca000000-0000-0000-0000-00000000001a','ca000000-0000-0000-0000-0000000000c1',1,'أ','under_review'),('ca000000-0000-0000-0000-00000000001b','ca000000-0000-0000-0000-0000000000c1',2,'ب','under_review') on conflict do nothing;
-- 00301 · حالة الشكوى الأم تتبع عناصرها في مسار العنصر الواحد، وحدث إسناد شكوى المواطن يسجّل الحالة السابقة
select auth.set_test_user('ca000000-0000-0000-0000-00000000000a');
do $$ declare st text; c1 uuid := 'ca000000-0000-0000-0000-0000000000c1'; i1 uuid := 'ca000000-0000-0000-0000-00000000001a'; i2 uuid := 'ca000000-0000-0000-0000-00000000001b'; begin
  perform public.complaint_assign_items(array[i1, i2], 'ca000000-0000-0000-0000-00000000000b');
  select status into st from public.complaints where id=c1; if st <> 'assigned' then raise exception 'FAIL S1 %', st; end if;
  perform set_config('auth.user_id','ca000000-0000-0000-0000-00000000000b',false);
  perform public.complaint_start_item(i1);
  select status into st from public.complaints where id=c1; if st <> 'in_progress' then raise exception 'FAIL S2 %', st; end if;
  insert into public.complaint_media (item_id, media_kind, storage_path, mime_type, captured_at, is_active) values (i1,'after','ca/1a-after.jpg','image/jpeg', clock_timestamp()+interval '1 second', true);
  perform public.complaint_complete_item(i1, 'تم');
  select status into st from public.complaints where id=c1; if st <> 'in_progress' then raise exception 'FAIL S3 parent % while item 2 still assigned', st; end if;
  perform set_config('auth.user_id','ca000000-0000-0000-0000-00000000000a',false);
  perform public.complaint_review_item(i1, false, 'أعد المعالجة');
  select status into st from public.complaints where id=c1; if st <> 'in_progress' then raise exception 'FAIL S4 %', st; end if;
  perform set_config('auth.user_id','ca000000-0000-0000-0000-00000000000b',false);
  perform public.complaint_start_item(i1);
  insert into public.complaint_media (item_id, media_kind, storage_path, mime_type, captured_at, is_active) values (i1,'after','ca/1a-after2.jpg','image/jpeg', clock_timestamp()+interval '1 second', true);
  perform public.complaint_complete_item(i1, 'تم 2');
  perform public.complaint_start_item(i2);
  insert into public.complaint_media (item_id, media_kind, storage_path, mime_type, captured_at, is_active) values (i2,'after','ca/1b-after.jpg','image/jpeg', clock_timestamp()+interval '1 second', true);
  perform public.complaint_complete_item(i2, 'تم');
  select status into st from public.complaints where id=c1; if st <> 'quality_review' then raise exception 'FAIL S5 % (all items processed)', st; end if;
  perform set_config('auth.user_id','ca000000-0000-0000-0000-00000000000a',false);
  perform public.complaint_review_item(i1, true, null);
  select status into st from public.complaints where id=c1; if st <> 'quality_review' then raise exception 'FAIL S6 %', st; end if;
  perform public.complaint_review_item(i2, true, null);
  select status into st from public.complaints where id=c1; if st <> 'ready_to_send' then raise exception 'FAIL S7 % (expected ready_to_send)', st; end if;
  -- المرسلة لا تُمس
  update public.complaints set status='sent', sent_at=now() where id=c1;
  if app.complaint_sync_parent_status(c1) <> 'sent' then raise exception 'FAIL S8 sent touched'; end if;
end $$;
select auth.set_test_user('ca000000-0000-0000-0000-00000000000d');
do $$ declare c uuid; ev record; begin
  insert into public.citizen_accounts (full_name, phone) values ('مواطن تجريبي ثالث','07700000001') returning id into c;
  insert into public.citizen_complaints (ref_no, citizen_id, full_name, phone, details) values ('CC-T-1', c, 'مواطن تجريبي ثالث','07700000001','تفاصيل تجريبية طويلة كفاية') returning id into c;
  perform public.ops_citizen_complaint_assign(c, 'ca000000-0000-0000-0000-00000000000b', null);
  select * into ev from public.citizen_complaint_events where complaint_id=c and kind='assigned';
  if ev.from_status <> 'new' or ev.to_status <> 'in_progress' then raise exception 'FAIL S9 from % to %', ev.from_status, ev.to_status; end if;
  raise notice 'test ok: complaint-parent-status-sync (00301)';
end $$;
