-- 00136 · وحدة GBS الحاويات: رمز تسلسلي فريد + صلاحيات + طلب تحديث + اعتماد/رفض + حذف تتالي.
do $$
declare
  o1 uuid := '88000000-0000-0000-0000-000000000001';
  m1 uuid := '88000000-0000-0000-0000-000000000002';
  m2 uuid := '88000000-0000-0000-0000-000000000003';
  x1 uuid := '88000000-0000-0000-0000-000000000004';
  m3 uuid := '88000000-0000-0000-0000-000000000005';
  m4 uuid := '88000000-0000-0000-0000-000000000006';
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; k1 uuid; k4 uuid;
  code1 text; code2 text; code5 text; st text; n bigint;
begin
  insert into auth.users(id, email) values
    (o1, 'gbs-ops@x.iq'), (m1, 'gbs-mgr@x.iq'), (m2, 'gbs-mgr2@x.iq'), (x1, 'gbs-out@x.iq');
  insert into public.user_roles(user_id, role) values
    (o1, 'ops_room'), (m1, 'department_manager'), (m2, 'department_manager');
  -- 00138: اختصاص كل مسؤول = مناطعه المسندة (كلاهما على الجادرية حيث الحاويات)
  insert into public.manager_profiles(user_id, shift, sectors) values
    (m1, 'morning', '{4}'), (m2, 'morning', '{4}');

  -- ① الإضافة من غرفة العمليات + رموز تسلسلية فريدة
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', o1::text, false);
  select s.id, s.code into c1, code1 from public.gbs_container_save(null, 'حاوية الكرادة الأولى', 33.30, 44.40, 'ok', 4::smallint, null, 'قرب الجسر') s;
  select s.id, s.code into c2, code2 from public.gbs_container_save(null, 'حاوية الزعفرانية', 33.20, 44.50, 'ok', 6::smallint, null, null) s;
  if code1 !~ '^GBS-[0-9]{4,}$' or code2 !~ '^GBS-[0-9]{4,}$' or code1 = code2 then
    raise exception 'GBS_CODE_FAIL % %', code1, code2;
  end if;
  if code2 <= code1 then raise exception 'GBS_CODE_ORDER_FAIL % %', code1, code2; end if;

  -- outsider بلا دور: القائمة محجوبة
  perform set_config('request.jwt.claim.sub', x1::text, false);
  begin
    perform public.gbs_containers_list(null, null);
    raise exception 'GBS_OUTSIDER_LIST_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_FORBIDDEN%' then raise; end if;
  end;

  -- ② القائمة + البحث المتقدم + فلترة الحالة
  perform set_config('request.jwt.claim.sub', o1::text, false);
  select count(*) into n from public.gbs_containers_list('الكرادة', null);
  if n <> 1 then raise exception 'GBS_SEARCH_FAIL %', n; end if;
  select count(*) into n from public.gbs_containers_list(null, 'damaged');
  if n <> 0 then raise exception 'GBS_FILTER_FAIL %', n; end if;
  select count(*) into n from public.gbs_containers_list(code1, null);
  if n <> 1 then raise exception 'GBS_SEARCH_CODE_FAIL %', n; end if;

  -- ③ مسؤول القسم لا يعدل ولا يحذف مباشرة
  perform set_config('request.jwt.claim.sub', m1::text, false);
  begin
    perform public.gbs_container_save(c1, 'اسم جديد', 33.3, 44.4, 'damaged', 4::smallint, null, null);
    raise exception 'GBS_MANAGER_SAVE_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_FORBIDDEN%' then raise; end if;
  end;
  begin
    perform public.gbs_container_delete(c2);
    raise exception 'GBS_MANAGER_DELETE_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_FORBIDDEN%' then raise; end if;
  end;

  -- ④ طلب تحديث من مسؤول القسم ⇒ معلق + إشعار لغرفة العمليات + منع التكرار
  select r.id into k1 from (select public.gbs_container_request_update(c1, 'damaged', null, 'تضرر الغطاء') as id) r;
  if k1 is null then raise exception 'GBS_REQUEST_FAIL'; end if;
  perform set_config('role', session_user::text, false);
  select count(*) into n from public.notifications where user_id = o1 and title = 'طلب تحديث حاوية';
  if n < 1 then raise exception 'GBS_REQUEST_NOTIFY_FAIL'; end if;
  select count(*) into n from public.gbs_container_updates where id = k1 and state = 'pending';
  if n <> 1 then raise exception 'GBS_PENDING_FAIL'; end if;
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', m1::text, false);
  begin
    perform public.gbs_container_request_update(c1, 'replace', null, null);
    raise exception 'GBS_DUP_PENDING_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_UPDATE_ALREADY_PENDING%' then raise; end if;
  end;
  -- مسؤول آخر يطلب بشكل مستقل
  perform set_config('request.jwt.claim.sub', m2::text, false);
  perform public.gbs_container_request_update(c1, 'replace', null, 'طلب مستقل');

  -- ⑤ الاعتماد: يطبق الحالة فوراً + سجل المراجعة + إشعار الطالب + عدّاد المعلق
  perform set_config('request.jwt.claim.sub', o1::text, false);
  select count(*) into n from public.gbs_containers_list(null, null) l
   where l.id = c1 and l.pending_count = 2;
  if n <> 1 then raise exception 'GBS_PENDING_COUNT_FAIL %', n; end if;
  select count(*) into n from public.gbs_updates_list('pending') where container_id = c1;
  if n <> 2 then raise exception 'GBS_UPDATES_LIST_FAIL %', n; end if;
  select rv.new_status into st from public.gbs_update_review(k1, true, 'تم التحقق ميدانياً') rv;
  if st <> 'damaged' then raise exception 'GBS_APPROVE_APPLY_FAIL %', st; end if;
  perform set_config('role', session_user::text, false);
  select count(*) into n from public.notifications where user_id = m1 and title = 'تم اعتماد تحديث الحاوية';
  if n < 1 then raise exception 'GBS_APPROVE_NOTIFY_FAIL'; end if;
  select count(*) into n from public.gbs_container_updates
   where id = k1 and state = 'approved' and reviewed_by = o1 and review_note = 'تم التحقق ميدانياً';
  if n <> 1 then raise exception 'GBS_REVIEW_RECORD_FAIL'; end if;
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', o1::text, false);
  begin
    perform public.gbs_update_review(k1, false, null);
    raise exception 'GBS_DOUBLE_REVIEW_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_UPDATE_NOT_PENDING%' then raise; end if;
  end;

  -- ⑥ الرفض: لا يغير الحالة + إشعار الطالب
  select u0.id into k1 from public.gbs_updates_list('pending') u0 where u0.container_id = c1 limit 1;
  select rv.new_status into st from public.gbs_update_review(k1, false, 'غير دقيق') rv;
  if st <> 'damaged' then raise exception 'GBS_REJECT_STATUS_CHANGED %', st; end if;
  perform set_config('role', session_user::text, false);
  select count(*) into n from public.notifications where user_id = m2 and title = 'تم رفض تحديث الحاوية';
  if n < 1 then raise exception 'GBS_REJECT_NOTIFY_FAIL'; end if;
  select count(*) into n from public.gbs_container_updates where id = k1 and state = 'rejected';
  if n <> 1 then raise exception 'GBS_REJECT_RECORD_FAIL'; end if;

  -- ⑦ سجل طلبات مسؤول القسم نفسه
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', m1::text, false);
  select count(*) into n from public.gbs_my_update_requests() where state = 'approved';
  if n <> 1 then raise exception 'GBS_MY_REQUESTS_FAIL %', n; end if;

  -- ⑧ تعديل وحذف من غرفة العمليات + تحقق المدخلات + منع التكرار
  perform set_config('request.jwt.claim.sub', o1::text, false);
  select s.id into c1 from public.gbs_container_save(c1, 'حاوية معدلة', 33.31, 44.41, 'replace', 4::smallint, null, null) s;
  select count(*) into n from public.gbs_containers_list('معدلة', null);
  if n <> 1 then raise exception 'GBS_EDIT_FAIL'; end if;
  select count(*) into n from public.gbs_containers_list(null, 'replace');
  if n <> 1 then raise exception 'GBS_STATUS_AFTER_EDIT_FAIL %', n; end if;
  begin
    perform public.gbs_container_save(null, 'حاوية', 33.3, 44.4, 'broken', 4::smallint, null, null);
    raise exception 'GBS_BAD_STATUS_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_STATUS_INVALID%' then raise; end if;
  end;
  begin
    perform public.gbs_container_save(null, 'حاوية', 999, 44.4, 'ok', 4::smallint, null, null);
    raise exception 'GBS_BAD_POINT_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_POINT_INVALID%' then raise; end if;
  end;
  perform public.gbs_container_delete(c2);
  select count(*) into n from public.gbs_containers_list(null, null) l where l.id = c2;
  if n <> 0 then raise exception 'GBS_DELETE_FAIL'; end if;
  begin
    perform public.gbs_container_delete(c2);
    raise exception 'GBS_DOUBLE_DELETE_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_CONTAINER_NOT_FOUND%' then raise; end if;
  end;

  -- ⑨ القاطع والمنطقة: فلاتر + بحث باسم المنطقة + زونات GPS + تحقق المدخلات
  perform set_config('request.jwt.claim.sub', o1::text, false);
  select count(*) into n from public.gbs_containers_list(null, null, 'karrada', null);
  if n <> 1 then raise exception 'GBS_PARENT_FILTER_FAIL %', n; end if;
  select count(*) into n from public.gbs_containers_list(null, null, null, 4::smallint);
  if n <> 1 then raise exception 'GBS_SECTOR_FILTER_FAIL %', n; end if;
  select count(*) into n from public.gbs_containers_list('الجعفرية', null);
  if n <> 0 then raise exception 'GBS_AREA_SEARCH_NEG_FAIL %', n; end if;
  select count(*) into n from public.gbs_containers_list('الجادرية', null);
  if n <> 1 then raise exception 'GBS_AREA_SEARCH_FAIL %', n; end if;
  select count(*) into n from public.gbs_containers_list(null, null) l
   where l.sector_id = 4 and l.area_name = 'الجادرية' and l.parent_sector = 'karrada';
  if n <> 1 then raise exception 'GBS_AREA_COLUMNS_FAIL %', n; end if;
  begin
    perform public.gbs_container_save(null, 'حاوية', 33.3, 44.4, 'ok', 99::smallint, null, null);
    raise exception 'GBS_BAD_SECTOR_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_SECTOR_INVALID%' then raise; end if;
  end;
  begin
    perform public.gbs_containers_list(null, null, 'bad', null);
    raise exception 'GBS_BAD_PARENT_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_PARENT_INVALID%' then raise; end if;
  end;
  perform set_config('role', session_user::text, false);
  insert into public.gps_geofences(name, source, polygon, color)
  values ('زون اختبار GBS', 'platform', '[[33.30,44.40],[33.32,44.40],[33.32,44.44],[33.30,44.44]]'::jsonb, '#7c3aed');
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', o1::text, false);
  select count(*) into n from public.gbs_zones_list() z where z.name = 'زون اختبار GBS' and z.polygon is not null;
  if n <> 1 then raise exception 'GBS_ZONES_FAIL %', n; end if;
  perform set_config('request.jwt.claim.sub', m1::text, false);
  select count(*) into n from public.gbs_zones_list() z where z.name = 'زون اختبار GBS';
  if n <> 1 then raise exception 'GBS_ZONES_MANAGER_FAIL %', n; end if;
  perform set_config('request.jwt.claim.sub', x1::text, false);
  begin
    perform public.gbs_zones_list();
    raise exception 'GBS_ZONES_OUTSIDER_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_FORBIDDEN%' then raise; end if;
  end;
  perform set_config('role', session_user::text, false);
  delete from public.gps_geofences where name = 'زون اختبار GBS';

  -- ⑩ اختصاص المسؤول (00138): يرى مناطعه فقط + الطلب داخل الاختصاص حصراً + تدقيق مكمل
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', o1::text, false);
  select s.id into c3 from public.gbs_container_save(null, 'حاوية الواثق', 33.28, 44.38, 'ok', 3::smallint, null, null) s;
  select s.id into c4 from public.gbs_container_save(null, 'حاوية الزعفرانية الجديدة', 33.21, 44.51, 'ok', 6::smallint, 'x/y.jpg', null) s;
  perform set_config('role', session_user::text, false);
  insert into auth.users(id, email) values (m4, 'gbs-mgr4@x.iq'), (m3, 'gbs-mgr3@x.iq');
  insert into public.user_roles(user_id, role) values (m4, 'department_manager'), (m3, 'department_manager');
  insert into public.manager_profiles(user_id, shift, sectors) values (m4, 'morning', '{6}'); -- m3 بلا مناطق
  perform set_config('role', 'authenticated', false);

  -- m4 (الزعفرانية فقط): يرى حاويته وحدها مع صورتها
  perform set_config('request.jwt.claim.sub', m4::text, false);
  select count(*) into n from public.gbs_containers_list(null, null);
  if n <> 1 then raise exception 'GBS_JURISDICTION_LIST_FAIL %', n; end if;
  select count(*) into n from public.gbs_containers_list(null, null) l
   where l.id = c4 and l.image_path = 'x/y.jpg' and l.sector_id = 6;
  if n <> 1 then raise exception 'GBS_JURISDICTION_ROW_FAIL %', n; end if;

  -- الطلب خارج الاختصاص مرفوض
  begin
    perform public.gbs_container_request_update(c3, 'damaged', null, null);
    raise exception 'GBS_OUT_OF_SECTOR_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_OUT_OF_SECTOR%' then raise; end if;
  end;

  -- الطلب داخل الاختصاص مقبول ويظهر في سجله
  select r.id into k4 from (select public.gbs_container_request_update(c4, 'missing', null, 'لا أثر لها') as id) r;
  if k4 is null then raise exception 'GBS_JURISDICTION_REQUEST_FAIL'; end if;
  select count(*) into n from public.gbs_my_update_requests() where id = k4 and state = 'pending';
  if n <> 1 then raise exception 'GBS_JURISDICTION_MY_FAIL %', n; end if;

  -- تقاطع الفلتر مع الاختصاص: منطقة خارج الاختصاص → صفر
  select count(*) into n from public.gbs_containers_list(null, null, null, 4::smallint);
  if n <> 0 then raise exception 'GBS_JURISDICTION_FILTER_FAIL %', n; end if;

  -- مسؤول بلا مناطق مسندة: لا يرى شيئاً ولا يطلب شيئاً
  perform set_config('request.jwt.claim.sub', m3::text, false);
  select count(*) into n from public.gbs_containers_list(null, null);
  if n <> 0 then raise exception 'GBS_NO_SECTORS_LIST_FAIL %', n; end if;
  begin
    perform public.gbs_container_request_update(c4, 'damaged', null, null);
    raise exception 'GBS_NO_SECTORS_REQUEST_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_OUT_OF_SECTOR%' then raise; end if;
  end;

  -- غرفة العمليات ترى الكل بلا تقييد (c1 + c3 + c4)
  perform set_config('request.jwt.claim.sub', o1::text, false);
  select count(*) into n from public.gbs_containers_list(null, null);
  if n <> 3 then raise exception 'GBS_OPS_FULL_VIEW_FAIL %', n; end if;

  -- تدقيق مكمل: الرمز لا يعيد أرقاماً محذوفة + حدود المدخلات
  select s.id, s.code into c5, code5 from public.gbs_container_save(null, 'حاوية التدقيق', 33.3, 44.4, 'ok', 1::smallint, null, null) s;
  if code5 <= code2 then raise exception 'GBS_CODE_REUSE_FAIL % %', code5, code2; end if;
  begin
    perform public.gbs_container_save(null, 'x', 33.3, 44.4, 'ok', 1::smallint, null, null);
    raise exception 'GBS_SHORT_LABEL_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_LABEL_INVALID%' then raise; end if;
  end;
  begin
    perform public.gbs_container_save(null, rpad('ط', 121, 'ب'), 33.3, 44.4, 'ok', 1::smallint, null, null);
    raise exception 'GBS_LONG_LABEL_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_LABEL_INVALID%' then raise; end if;
  end;
  begin
    perform public.gbs_container_save(null, 'حاوية', 33.3, 44.4, 'ok', 1::smallint, null, rpad('م', 501, 'ن'));
    raise exception 'GBS_LONG_NOTES_ACCEPTED';
  exception when others then
    if SQLERRM not like '%GBS_NOTES_INVALID%' then raise; end if;
  end;
  perform public.gbs_container_delete(c5);

  -- تنظيف: لا تلوّث بقية الاختبارات
  perform public.gbs_container_delete(c1);
  perform public.gbs_container_delete(c3);
  perform public.gbs_container_delete(c4);
  perform set_config('role', session_user::text, false);
  delete from public.notifications where user_id in (o1, m1, m2, m3, m4);
  delete from public.manager_profiles where user_id in (m1, m2, m3, m4);
  raise notice '✅ GBS الحاويات: رموز/صلاحيات/بحث/تحديث/اعتماد/رفض/حذف/مدخلات/اختصاص المسؤول ناجحة';
end$$;
