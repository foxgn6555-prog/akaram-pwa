-- اختبار متابعة الحاويات (00260): المتابِع يرى حاويات نطاقه فقط + الزونات، يطلب تحديث موقع (معلّق)،
-- لا يُطبَّق قبل اعتماد غرفة العمليات، الاعتماد يطبّق الإحداثيات ويحفظ السابقة، الرفض لا يغيّر، العزل خارج النطاق، ملخص الرئيسية. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('fc000000-0000-0000-0000-000000000001', 'it-fc@t.iq'), ('fc000000-0000-0000-0000-000000000002', 'fu-fc@t.iq'),
  ('fc000000-0000-0000-0000-000000000003', 'ops-fc@t.iq'), ('fc000000-0000-0000-0000-000000000004', 'hr-fc@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fc000000-0000-0000-0000-000000000001', 'it_admin'), ('fc000000-0000-0000-0000-000000000002', 'follow_up'),
  ('fc000000-0000-0000-0000-000000000003', 'ops_room'), ('fc000000-0000-0000-0000-000000000004', 'hr_officer')
on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare it uuid := 'fc000000-0000-0000-0000-000000000001'; fu uuid := 'fc000000-0000-0000-0000-000000000002'; ops uuid := 'fc000000-0000-0000-0000-000000000003';
        c_in uuid; c_out uuid; upd uuid; n int; r record; lat0 float8; lng0 float8;
begin
  -- حاويتان: واحدة في منطقة 1 (الكرادة) وأخرى في منطقة 5 (الزعفرانية)
  perform pg_temp.as_user(ops);
  select id into c_in from public.gbs_container_save(null, 'حاوية اختبار داخل', 33.3100, 44.4100, 'ok', 1::smallint, null, null);
  select id into c_out from public.gbs_container_save(null, 'حاوية اختبار خارج', 33.2500, 44.5000, 'ok', 5::smallint, null, null);
  -- قبل الإسناد: المتابِع لا يرى شيئاً
  perform pg_temp.as_user(fu);
  select count(*) into n from public.gbs_containers_list();
  if n <> 0 then raise exception 'unassigned follow_up should see 0, got %', n; end if;
  -- الإسناد: منطقة 1 فقط
  perform pg_temp.as_user(it);
  perform public.follow_up_assign(fu, '{}', '{1}');
  perform pg_temp.as_user(fu);
  select count(*) into n from public.gbs_containers_list();
  if n < 1 or exists(select 1 from public.gbs_containers_list() l where l.id = c_out) then raise exception 'scope isolation failed'; end if;
  if not exists(select 1 from public.gbs_containers_list() l where l.id = c_in) then raise exception 'in-scope container missing'; end if;
  perform * from public.gbs_zones_list();
  -- خارج النطاق مرفوض
  perform pg_temp.expect_error(format($q$ select public.gbs_container_request_location('%s', 33.3, 44.4) $q$, c_out), 'GBS_OUT_OF_SECTOR');
  perform pg_temp.expect_error(format($q$ select public.gbs_container_request_location('%s', 95, 44.4) $q$, c_in), 'GBS_LOCATION_INVALID');
  -- طلب صحيح → معلّق، الحاوية لم تتغير
  upd := public.gbs_container_request_location(c_in, 33.3150, 44.4150, 7.5, 'الحاوية نُقلت قرب المدرسة');
  select latitude, longitude into lat0, lng0 from public.gbs_containers where id = c_in;
  if lat0 <> 33.3100 or lng0 <> 44.4100 then raise exception 'coords changed before approval'; end if;
  perform pg_temp.expect_error(format($q$ select public.gbs_container_request_location('%s', 33.3, 44.4) $q$, c_in), 'GBS_UPDATE_ALREADY_PENDING');
  select * into r from public.gbs_my_update_requests() x where x.id = upd;
  if r.kind <> 'location' or r.state <> 'pending' or r.proposed_latitude <> 33.3150 or r.accuracy_m <> 7.5 then raise exception 'my request wrong: %', r; end if;
  select count(*) into n from public.gbs_containers_list() l where l.id = c_in and l.pending_count = 1;
  if n <> 1 then raise exception 'pending_count not 1'; end if;
  -- غرفة العمليات ترى الطلب بنوعه وإحداثياته الحالية والمقترحة ثم ترفض
  perform pg_temp.as_user(ops);
  select * into r from public.gbs_updates_list('pending') x where x.id = upd;
  if r.kind <> 'location' or r.current_latitude <> 33.3100 or r.proposed_longitude <> 44.4150 or r.area_name is null then raise exception 'ops list wrong: %', r; end if;
  perform public.gbs_update_review(upd, false, 'الموقع غير دقيق');
  select latitude into lat0 from public.gbs_containers where id = c_in;
  if lat0 <> 33.3100 then raise exception 'reject must not move container'; end if;
  if not exists(select 1 from public.notifications where user_id = fu and link = '/follow-up/containers' and title like 'تم رفض تحديث موقع%') then raise exception 'reject notification missing'; end if;
  -- طلب ثانٍ ثم اعتماد → تُطبَّق الإحداثيات وتُحفظ السابقة
  perform pg_temp.as_user(fu);
  upd := public.gbs_container_request_location(c_in, 33.3200, 44.4200, 5, null);
  perform pg_temp.as_user(ops);
  perform public.gbs_update_review(upd, true, null);
  select latitude, longitude into lat0, lng0 from public.gbs_containers where id = c_in;
  if lat0 <> 33.3200 or lng0 <> 44.4200 then raise exception 'approve did not apply coords'; end if;
  select * into r from public.gbs_container_updates where id = upd;
  if r.state <> 'approved' or r.previous_latitude <> 33.3100 or r.previous_longitude <> 44.4100 then raise exception 'previous coords not kept: %', r; end if;
  if not exists(select 1 from public.notifications where user_id = fu and title = 'تم اعتماد موقع الحاوية الجديد') then raise exception 'approve notification missing'; end if;
  -- الحالة لم تتغير باعتماد الموقع
  if (select status from public.gbs_containers where id = c_in) <> 'ok' then raise exception 'status must stay'; end if;
  -- 00234: الحالة أيضاً — حالة فقط (بلا إحداثيات) ⇒ kind=status ويُطبَّق عند الاعتماد دون تغيير الموقع
  perform pg_temp.as_user(fu);
  perform pg_temp.expect_error(format($q$ select public.gbs_container_request_location('%s', null, null, null, null, 'bad') $q$, c_in), 'GBS_STATUS_INVALID');
  perform pg_temp.expect_error(format($q$ select public.gbs_container_request_location('%s', null, null, null, null, 'ok') $q$, c_in), 'GBS_NOTHING_TO_UPDATE');
  upd := public.gbs_container_request_location(c_in, null, null, null, 'الحاوية مكسورة', 'damaged');
  select * into r from public.gbs_container_updates where id = upd;
  if r.kind <> 'status' or r.proposed_status <> 'damaged' or r.proposed_latitude is not null then raise exception 'status-only request wrong: %', r; end if;
  if not exists(select 1 from public.notifications where link = '/ops-room/gbs-containers' and title = 'طلب تحديث حالة حاوية' and body like '%الحالة: متضررة%') then raise exception 'status notify missing'; end if;
  perform pg_temp.as_user(ops);
  perform public.gbs_update_review(upd, true, null);
  select * into r from public.gbs_containers where id = c_in;
  if r.status <> 'damaged' or r.latitude <> 33.3200 then raise exception 'status approve wrong: %', r; end if;
  -- موقع + حالة معاً ⇒ kind=both ويُطبَّق الاثنان
  perform pg_temp.as_user(fu);
  upd := public.gbs_container_request_location(c_in, 33.3300, 44.4300, 4, null, 'replace');
  select * into r from public.gbs_container_updates where id = upd;
  if r.kind <> 'both' then raise exception 'both expected: %', r.kind; end if;
  perform pg_temp.as_user(ops);
  perform public.gbs_update_review(upd, true, 'تم');
  select * into r from public.gbs_containers where id = c_in;
  if r.status <> 'replace' or r.latitude <> 33.3300 or r.longitude <> 44.4300 then raise exception 'both approve wrong: %', r; end if;
  if not exists(select 1 from public.notifications where user_id = fu and title = 'تم اعتماد موقع الحاوية وحالتها') then raise exception 'both notify missing'; end if;
  -- ملخص الرئيسية
  perform pg_temp.as_user(fu);
  select * into r from public.follow_up_containers_summary();
  if r.containers < 1 or r.my_pending <> 0 or r.my_approved <> 3 or r.my_rejected <> 1 then raise exception 'summary wrong: %', r; end if;
  -- غير مخوّل
  perform pg_temp.as_user('fc000000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error($q$ select * from public.gbs_containers_list() $q$, 'GBS_FORBIDDEN');
  perform pg_temp.expect_error(format($q$ select public.gbs_container_request_location('%s', 33.3, 44.4) $q$, c_in), 'GBS_FORBIDDEN');
  raise notice 'C1 ok';
end $$;
