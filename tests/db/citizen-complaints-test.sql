-- اختبار 00168 · استقبال شكاوى المواطنين + الدعم الفني المباشر
-- مستقل: مستخدمون ca…01 (ops_room) ca…02 (department_manager) ca…03 (موظف عادي) ca…04 (deputy_director)
insert into auth.users (id, email) values
  ('ca000000-0000-0000-0000-000000000001', 'cc-ops@test.local'),
  ('ca000000-0000-0000-0000-000000000002', 'cc-mgr@test.local'),
  ('ca000000-0000-0000-0000-000000000003', 'cc-emp@test.local'),
  ('ca000000-0000-0000-0000-000000000004', 'cc-dep@test.local')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ca000000-0000-0000-0000-000000000001', 'ops_room'),
  ('ca000000-0000-0000-0000-000000000002', 'department_manager'),
  ('ca000000-0000-0000-0000-000000000003', 'employee'),
  ('ca000000-0000-0000-0000-000000000004', 'deputy_director')
on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number) values
  ('cb000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'موظف غرفة العمليات', 'CC-1'),
  ('cb000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000002', 'مسؤول قسم الكرادة', 'CC-2')
on conflict (id) do nothing;

-- ═══ T1 · دخول المواطن: تطبيع الهاتف، رفض الاسم القصير، إعادة الدخول تجدد الرمز ═══
select auth.set_test_user(null);
do $$ declare a jsonb; b jsonb; begin
  a := public.citizen_sign_in('علي حسين', '+964 770 123 4567');
  if a ->> 'phone' <> '07701234567' then raise exception 'T1: phone not normalised: %', a; end if;
  begin perform public.citizen_sign_in('ع', '07701234567'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_NAME_INVALID' then raise; end if; end;
  begin perform public.citizen_sign_in('علي حسين', '12345'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_PHONE_INVALID' then raise; end if; end;
  b := public.citizen_sign_in('علي حسين كاظم', '07701234567');
  if (a ->> 'token') = (b ->> 'token') then raise exception 'T1: token must rotate on re-sign-in'; end if;
  if (select count(*) from public.citizen_accounts where phone = '07701234567') <> 1 then raise exception 'T1: duplicate account'; end if;
  perform set_config('test.cc_token', b ->> 'token', false);
  raise notice 'T1 OK';
end $$;

-- ═══ T2 · تقديم شكوى: اسم ثلاثي إلزامي، تفاصيل، موقع، صور داخل مجلد الرمز فقط، إشعار غرفة العمليات ═══
do $$ declare t uuid := current_setting('test.cc_token')::uuid; c jsonb; begin
  begin perform public.citizen_complaint_submit(t, 'علي حسين', 'نفايات متراكمة منذ أسبوع في الشارع'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_NAME_TRIPLE_REQUIRED' then raise; end if; end;
  begin perform public.citizen_complaint_submit(t, 'علي حسين كاظم', 'قصير'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_DETAILS_SHORT' then raise; end if; end;
  begin perform public.citizen_complaint_submit(t, 'علي حسين كاظم', 'نفايات متراكمة منذ أسبوع', 33.3, 44.4, null, array['someone-else/x.jpg']); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_PHOTO_PATH_INVALID' then raise; end if; end;
  begin perform public.citizen_complaint_submit(gen_random_uuid(), 'علي حسين كاظم', 'نفايات متراكمة منذ أسبوع'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_SESSION_INVALID' then raise; end if; end;
  c := public.citizen_complaint_submit(t, 'علي  حسين كاظم', 'نفايات متراكمة منذ أسبوع قرب المدرسة', 33.3152, 44.3661, 'الكرادة - شارع 62', array[t::text || '/a.jpg', t::text || '/b.jpg']);
  if c ->> 'status' <> 'new' or c ->> 'ref_no' !~ '^CC-\d{4}-\d{5}$' or jsonb_array_length(c -> 'photos') <> 2 or c ->> 'full_name' <> 'علي حسين كاظم' then
    raise exception 'T2: bad complaint json: %', c; end if;
  if c ? 'phone' and c ->> 'phone' is not null then raise exception 'T2: citizen view must not expose phone'; end if;
  if (select count(*) from public.notifications where user_id = 'ca000000-0000-0000-0000-000000000001' and title like 'شكوى مواطن جديدة%') <> 1 then raise exception 'T2: ops not notified'; end if;
  perform set_config('test.cc_id', c ->> 'id', false);
  -- الحد اليومي 5
  perform public.citizen_complaint_submit(t, 'علي حسين كاظم', 'شكوى ثانية عن حاوية مكسورة'), public.citizen_complaint_submit(t, 'علي حسين كاظم', 'شكوى ثالثة عن حاوية مكسورة'),
          public.citizen_complaint_submit(t, 'علي حسين كاظم', 'شكوى رابعة عن حاوية مكسورة'), public.citizen_complaint_submit(t, 'علي حسين كاظم', 'شكوى خامسة عن حاوية مكسورة');
  begin perform public.citizen_complaint_submit(t, 'علي حسين كاظم', 'شكوى سادسة عن حاوية مكسورة'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_DAILY_LIMIT' then raise; end if; end;
  if jsonb_array_length(public.citizen_my_complaints(t)) <> 5 then raise exception 'T2: my complaints'; end if;
  raise notice 'T2 OK';
end $$;

-- ═══ T3 · غرفة العمليات: لا «قيد المعالجة» بلا إسناد؛ الإسناد لمسؤول قسم فقط ويجعلها قيد المعالجة ويُشعره ═══
select auth.set_test_user('ca000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.ops_citizen_complaints_list(); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_FORBIDDEN' then raise; end if; end;
  raise notice 'T3a OK (employee forbidden)';
end $$;
select auth.set_test_user('ca000000-0000-0000-0000-000000000001');
do $$ declare cid uuid := current_setting('test.cc_id')::uuid; c jsonb; l jsonb; begin
  l := public.ops_citizen_complaints_list();
  if jsonb_array_length(l) <> 5 or (l -> 0 ->> 'phone') <> '07701234567' then raise exception 'T3: list: %', jsonb_array_length(l); end if;
  if jsonb_array_length(public.ops_citizen_complaints_list(null, '0770')) <> 5 then raise exception 'T3: phone search'; end if;
  begin perform public.citizen_complaint_set_status(cid, 'in_progress'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_ASSIGNEE_REQUIRED' then raise; end if; end;
  begin perform public.ops_citizen_complaint_assign(cid, 'ca000000-0000-0000-0000-000000000003'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_ASSIGNEE_NOT_MANAGER' then raise; end if; end;
  if (select count(*) from public.ops_citizen_managers()) < 1 then raise exception 'T3: managers list empty'; end if;
  c := public.ops_citizen_complaint_assign(cid, 'ca000000-0000-0000-0000-000000000002', 'يرجى المعالجة اليوم');
  if c ->> 'status' <> 'in_progress' or c ->> 'assignee_name' <> 'مسؤول قسم الكرادة' then raise exception 'T3: assign: %', c; end if;
  if (select count(*) from public.notifications where user_id = 'ca000000-0000-0000-0000-000000000002' and dedupe_key like 'cc_assign:%') <> 1 then raise exception 'T3: manager not notified'; end if;
  begin perform public.citizen_complaint_set_status(cid, 'on_hold', ''); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_NOTE_REQUIRED' then raise; end if; end;
  c := public.citizen_complaint_set_status(cid, 'on_hold', 'بانتظار آلية');
  if c ->> 'status' <> 'on_hold' or c ->> 'hold_reason' <> 'بانتظار آلية' then raise exception 'T3: hold: %', c; end if;
  raise notice 'T3 OK';
end $$;

-- ═══ T4 · مسؤول القسم: يرى المسندة له فقط، ينجزها بملاحظة، لا يستطيع لمس شكوى غيره؛ المواطن يرى الحالة ويقيّم ═══
select auth.set_test_user('ca000000-0000-0000-0000-000000000002');
do $$ declare cid uuid := current_setting('test.cc_id')::uuid; other uuid; c jsonb; begin
  if jsonb_array_length(public.mgr_citizen_complaints()) <> 1 then raise exception 'T4: mgr list'; end if;
  select x.id into other from public.citizen_complaints x where x.id <> cid limit 1;
  begin perform public.citizen_complaint_set_status(other, 'resolved', 'تمت'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_FORBIDDEN' then raise; end if; end;
  perform public.citizen_complaint_add_note(cid, 'تم إرسال فرقة');
  c := public.citizen_complaint_set_status(cid, 'resolved', 'رُفعت النفايات وغُسل الموقع');
  if c ->> 'status' <> 'resolved' or c ->> 'resolved_at' is null then raise exception 'T4: resolve: %', c; end if;
  if jsonb_array_length(c -> 'events') <> 5 then raise exception 'T4: events timeline expected 5 got %', jsonb_array_length(c -> 'events'); end if;
  if (select count(*) from public.notifications where user_id = 'ca000000-0000-0000-0000-000000000001' and title like 'تحديث شكوى مواطن%') <> 1 then raise exception 'T4: ops not notified of mgr updates'; end if;
  raise notice 'T4a OK';
end $$;
select auth.set_test_user(null);
do $$ declare t uuid := current_setting('test.cc_token')::uuid; cid uuid := current_setting('test.cc_id')::uuid; m jsonb; begin
  select x into m from jsonb_array_elements(public.citizen_my_complaints(t)) x where x ->> 'id' = cid::text;
  if m ->> 'status_label' <> 'تمت المعالجة' or m ->> 'resolution_note' <> 'رُفعت النفايات وغُسل الموقع' then raise exception 'T4: citizen view: %', m; end if;
  if (m -> 'events' -> 1) ? 'actor' and (m -> 'events' -> 1 ->> 'actor') is not null then raise exception 'T4: actor names must be hidden from citizen'; end if;
  perform public.citizen_complaint_rate(t, cid, 5);
  begin perform public.citizen_complaint_rate(t, (select x.id from public.citizen_complaints x where x.status = 'new' limit 1), 4); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_COMPLAINT_NOT_RATABLE' then raise; end if; end;
  raise notice 'T4 OK';
end $$;

-- ═══ T5 · الدعم المباشر: طلب → طابور → استلام → رسائل متبادلة (تزايدية) → إغلاق → تقييم ═══
do $$ declare t uuid := current_setting('test.cc_token')::uuid; s jsonb; begin
  s := public.citizen_chat_request(t);
  if s ->> 'status' <> 'waiting' or (s ->> 'queue_position')::int <> 1 then raise exception 'T5: request: %', s; end if;
  if (public.citizen_chat_request(t) ->> 'id') <> (s ->> 'id') then raise exception 'T5: duplicate session'; end if;
  perform public.citizen_chat_send(t, 'السلام عليكم، الحاوية في شارعنا ممتلئة منذ ثلاثة أيام');
  perform set_config('test.cc_session', s ->> 'id', false);
  raise notice 'T5a OK';
end $$;
select auth.set_test_user('ca000000-0000-0000-0000-000000000001');
do $$ declare sid uuid := current_setting('test.cc_session')::uuid; q jsonb; s jsonb; begin
  q := public.ops_citizen_chat_queue();
  if jsonb_array_length(q) <> 1 or q -> 0 ->> 'status' <> 'waiting' or (q -> 0 ->> 'unread')::int <> 1 or q -> 0 ->> 'citizen_name' <> 'علي حسين كاظم' then raise exception 'T5: queue: %', q; end if;
  s := public.ops_citizen_chat_accept(sid);
  if s ->> 'status' <> 'active' or s ->> 'agent_name' <> 'موظف غرفة العمليات' then raise exception 'T5: accept: %', s; end if;
  perform public.ops_citizen_chat_send(sid, 'وعليكم السلام، سيتم إرسال كابسة خلال ساعة');
  if (select first_reply_at from public.citizen_chat_sessions where id = sid) is null then raise exception 'T5: first_reply_at'; end if;
  raise notice 'T5b OK';
end $$;
-- موظف عمليات آخر لا يستطيع الرد على محادثة زميله
insert into auth.users (id, email) values ('ca000000-0000-0000-0000-000000000005', 'cc-ops2@test.local') on conflict do nothing;
insert into public.user_roles (user_id, role) values ('ca000000-0000-0000-0000-000000000005', 'ops_room') on conflict do nothing;
select auth.set_test_user('ca000000-0000-0000-0000-000000000005');
do $$ declare sid uuid := current_setting('test.cc_session')::uuid; begin
  begin perform public.ops_citizen_chat_send(sid, 'مرحبا'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_CHAT_TAKEN' then raise; end if; end;
  raise notice 'T5c OK';
end $$;
select auth.set_test_user(null);
do $$ declare t uuid := current_setting('test.cc_token')::uuid; s jsonb; last bigint; begin
  s := public.citizen_chat_state(t, 0);
  if s ->> 'status' <> 'active' or jsonb_array_length(s -> 'messages') <> 4 then raise exception 'T5: state: %', s; end if; -- system + citizen + system(join) + agent
  last := (s -> 'messages' -> 3 ->> 'id')::bigint;
  if jsonb_array_length(public.citizen_chat_state(t, last) -> 'messages') <> 0 then raise exception 'T5: incremental fetch'; end if;
  perform public.citizen_chat_send(t, 'شكراً جزيلاً');
  if jsonb_array_length(public.citizen_chat_state(t, last) -> 'messages') <> 1 then raise exception 'T5: incremental fetch 2'; end if;
  begin perform public.citizen_chat_rate(t, (s ->> 'id')::uuid, 5); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_CHAT_NOT_RATABLE' then raise; end if; end;
  raise notice 'T5d OK';
end $$;
select auth.set_test_user('ca000000-0000-0000-0000-000000000001');
select public.ops_citizen_chat_close(current_setting('test.cc_session')::uuid);
select auth.set_test_user(null);
do $$ declare t uuid := current_setting('test.cc_token')::uuid; s jsonb; begin
  s := public.citizen_chat_state(t, 0);
  if s ->> 'status' <> 'closed' or s ->> 'closed_by' <> 'agent' then raise exception 'T5: closed: %', s; end if;
  begin perform public.citizen_chat_send(t, 'بعد الإغلاق'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_CHAT_CLOSED' then raise; end if; end;
  perform public.citizen_chat_rate(t, (s ->> 'id')::uuid, 4, 'خدمة سريعة');
  if (select rating from public.citizen_chat_sessions where id = (s ->> 'id')::uuid) <> 4 then raise exception 'T5: rating not saved'; end if;
  -- طلب جديد بعد الإغلاق يفتح جلسة جديدة
  if (public.citizen_chat_request(t) ->> 'id') = (s ->> 'id') then raise exception 'T5: new session expected'; end if;
  perform public.citizen_chat_close(t);
  raise notice 'T5 OK';
end $$;

-- ═══ T6 · إعدادات الصفحة العامة + التقرير (معاون المدير المفوض) + منع الموظف ═══
select auth.set_test_user('ca000000-0000-0000-0000-000000000001');
do $$ declare i jsonb; begin
  i := public.ops_citizen_settings_save('نبذة مختصرة', '[{"label":"الخط الساخن","number":"07700000000"}]'::jsonb, 'من 8 إلى 8', 'بغداد - الكرادة');
  if i ->> 'about' <> 'نبذة مختصرة' or jsonb_array_length(i -> 'phones') <> 1 then raise exception 'T6: settings: %', i; end if;
  raise notice 'T6a OK';
end $$;
select auth.set_test_user(null);
do $$ declare i jsonb := public.citizen_portal_info(); begin
  if i ->> 'address' <> 'بغداد - الكرادة' or i ->> 'org_name' <> 'شركة جزيرة الأكارم' then raise exception 'T6: public info: %', i; end if;
  raise notice 'T6b OK';
end $$;
select auth.set_test_user('ca000000-0000-0000-0000-000000000004');
do $$ declare r jsonb := public.citizen_complaints_report(current_date - 7, current_date); begin
  if (r -> 'complaints' ->> 'total')::int <> 5 or (r -> 'complaints' ->> 'resolved')::int <> 1 or (r -> 'complaints' ->> 'new')::int <> 4 then raise exception 'T6: report complaints: %', r -> 'complaints'; end if;
  if (r -> 'complaints' ->> 'avg_rating')::numeric <> 5 or jsonb_array_length(r -> 'complaints' -> 'by_assignee') <> 2 then raise exception 'T6: report rating/assignee: %', r -> 'complaints'; end if;
  if (r -> 'support' ->> 'sessions')::int <> 2 or (r -> 'support' ->> 'answered')::int <> 1 or (r -> 'support' ->> 'avg_rating')::numeric <> 4 then raise exception 'T6: report support: %', r -> 'support'; end if;
  if jsonb_array_length(r -> 'complaints' -> 'oldest_open') <> 4 then raise exception 'T6: oldest_open'; end if;
  raise notice 'T6c OK';
end $$;
select auth.set_test_user('ca000000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.citizen_complaints_report(current_date - 7, current_date); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_FORBIDDEN' then raise; end if; end;
  begin perform public.mgr_citizen_complaints(); exception when others then raise exception 'T6: mgr list should be empty not error: %', sqlerrm; end;
  if jsonb_array_length(public.mgr_citizen_complaints()) <> 0 then raise exception 'T6: employee sees complaints'; end if;
  raise notice 'T6 OK';
end $$;



-- ═══ T7 (00169) · صورة في المحادثة داخل مجلد الرمز فقط + أرشيف الأيام/اليوم ═══
select auth.set_test_user(null);
do $$ declare t uuid := current_setting('test.cc_token')::uuid; s jsonb; begin
  s := public.citizen_chat_request(t);
  begin perform public.citizen_chat_send(t, '', 'other/x.jpg'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_PHOTO_PATH_INVALID' then raise; end if; end;
  begin perform public.citizen_chat_send(t, '', null); raise exception 'should fail';
  exception when others then if sqlerrm <> 'CITIZEN_MESSAGE_INVALID' then raise; end if; end;
  perform public.citizen_chat_send(t, '', t::text || '/chat-1.jpg');
  s := public.citizen_chat_state(t, 0);
  if (s -> 'messages' -> -1 ->> 'attachment') <> t::text || '/chat-1.jpg' or (s -> 'messages' -> -1 ->> 'body') <> '📷 صورة' then raise exception 'T7: attachment: %', s -> 'messages' -> -1; end if;
  perform public.citizen_chat_close(t);
  raise notice 'T7a OK';
end $$;
select auth.set_test_user('ca000000-0000-0000-0000-000000000001');
do $$ declare d jsonb := public.ops_citizen_chat_days(); hday jsonb; begin
  if jsonb_array_length(d) <> 1 or (d -> 0 ->> 'count')::int <> 3 or (d -> 0 ->> 'closed')::int <> 3 then raise exception 'T7: days: %', d; end if;
  hday := public.ops_citizen_chat_history((d -> 0 ->> 'day')::date);
  if jsonb_array_length(hday) <> 3
     or (select sum((x ->> 'attachments')::int) from jsonb_array_elements(hday) x) <> 1
     or not exists (select 1 from jsonb_array_elements(hday) x where (x ->> 'rating')::int = 4 and x ->> 'agent_name' = 'موظف غرفة العمليات' and (x ->> 'wait_minutes') is not null)
  then raise exception 'T7: history: %', hday; end if;
  if jsonb_array_length(public.ops_citizen_chat_history(current_date - 400)) <> 0 then raise exception 'T7: empty day'; end if;
  raise notice 'T7 OK';
end $$;
select 'CITIZEN COMPLAINTS TESTS PASSED' as result;
