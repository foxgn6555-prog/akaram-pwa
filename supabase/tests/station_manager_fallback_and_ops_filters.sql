-- 00132 · ارتداد مسؤول القسم للقاطع الأب + صف لكل زيارة وأعمدة الفلاتر في جدول العمليات.
-- ملاحظة: manager_profiles محمي بـ RLS (المدير يرى ملفه فقط) لذا تُنفذ assertions على الملفات
-- بهوية الجلسة الأصلية (superuser) وليس authenticated.
do $$
declare
  g uuid:='86000000-0000-0000-0000-000000000001';
  st uuid:='86000000-0000-0000-0000-000000000002';
  op uuid:='86000000-0000-0000-0000-000000000003';
  fm uuid:='86000000-0000-0000-0000-000000000004';
  m1 uuid:='86000000-0000-0000-0000-000000000005';
  m3 uuid:='86000000-0000-0000-0000-000000000006';
  v public.garage_vehicles; d public.garage_departures; l public.vehicle_trip_legs;
  s public.ts_visit_weighing_steps; n bigint;
begin
  insert into auth.users(id,email) values(g,'fb-garage@x.iq'),(st,'fb-station@x.iq'),(op,'fb-ops@x.iq'),(fm,'fb-fallback@x.iq'),(m1,'fb-direct@x.iq'),(m3,'fb-direct2@x.iq');
  insert into public.user_roles(user_id,role) values(g,'central_garage_officer'),(g,'ops_room'),(st,'transfer_station'),(op,'ops_room'),(fm,'department_manager'),(m1,'department_manager'),(m3,'department_manager');
  insert into public.garage_user_profiles(user_id,parent_sector) values(g,'karrada'),(fm,'karrada'),(m1,'karrada');
  insert into public.manager_profiles(user_id,shift,sectors) values(fm,'morning',array[2]::smallint[]);

  -- ① منطقة بلا مدير مباشر ⇒ يرتد لأي مدير يغطي قطاعاً شقيقاً ضمن القاطع (كرادة) ويبلغه
  delete from public.manager_profiles mp
   using public.user_roles ur
   where mp.user_id = ur.user_id and ur.role = 'department_manager' and 4 = any(mp.sectors);
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub',g::text,false);
  v := public.garage_add_vehicle('كابسة الارتداد','DB-FB1','P-FB1','C-FB1',g::text||'/x.webp','morning','سائق الارتداد',4::smallint);
  d := public.garage_record_shift_departure(v.id,'morning',null);
  if d.recipient_manager_id is null then raise exception 'FALLBACK_MANAGER_MISSING'; end if;

  -- معاينة نافذة الانطلاق (00133) تعكس الارتداد نفسه الذي سيسجله الخادم
  select count(*) into n from public.garage_shift_dispatch_recipients(v.id,'morning') r
   where r.pick_rank = 1 and r.resolution = 'parent_fallback'
     and r.user_id = d.recipient_manager_id;
  if n <> 1 then raise exception 'PREVIEW_FALLBACK_COUNT_FAIL %', n; end if;
  select count(*) into n from public.garage_shift_dispatch_recipients(v.id,'morning') r
   where r.resolution = 'parent_fallback' and r.user_id = d.recipient_manager_id;
  if n <> 1 then raise exception 'PREVIEW_FALLBACK_MATCH_FAIL %', n; end if;

  perform set_config('role', session_user::text, false);
  select count(*) into n from public.manager_profiles mp
   where mp.user_id = d.recipient_manager_id
     and exists (select 1 from public.sectors sx where sx.id = any(mp.sectors) and sx.parent_sector = 'karrada');
  if n < 1 then raise exception 'FALLBACK_MANAGER_WRONG_PARENT % recipient=%', n, d.recipient_manager_id; end if;
  select count(*) into n from public.notifications
   where user_id = d.recipient_manager_id and category = 'departure' and entity_id = d.id;
  if n <> 1 then raise exception 'FALLBACK_MANAGER_NOTIFICATION_FAIL %', n; end if;

  -- إغلاق انطلاقة الارتداد: وصول ← عودة للكراج ← تسجيل رجوع
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub', d.recipient_manager_id::text, false);
  d := public.sector_confirm_vehicle_arrival(d.id, null);
  d := public.sector_send_vehicle_to_garage(d.id, null);
  perform set_config('request.jwt.claim.sub', g::text, false);
  d := public.garage_record_return(d.id);

  -- ② مدير مباشر وحيد للمنطقة ⇒ الانطلاقة تصله حصراً (لا ارتداد مع وجود مباشر)
  perform set_config('role', session_user::text, false);
  delete from public.manager_profiles mp
   using public.user_roles ur
   where mp.user_id = ur.user_id and ur.role = 'department_manager' and 4 = any(mp.sectors);
  insert into public.manager_profiles(user_id,shift,sectors) values(m1,'morning',array[4]::smallint[]);
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub', g::text, false);
  v := public.garage_add_vehicle('كابسة الفلاتر','DB-FB3','P-FB3','C-FB3',g::text||'/x.webp','morning','سائق الفلاتر',4::smallint);
  d := public.garage_record_shift_departure(v.id,'morning',null);
  if d.recipient_manager_id is distinct from m1 then raise exception 'DIRECT_MANAGER_FAIL %', coalesce(d.recipient_manager_id::text,'null'); end if;

  -- المعاينة مباشرة عند وجود مدير مباشر، وصف لكل مدير عند التداخل
  select count(*) into n from public.garage_shift_dispatch_recipients(v.id,'morning') r
   where r.resolution = 'direct' and r.user_id = m1;
  if n <> 1 then raise exception 'PREVIEW_DIRECT_FAIL %', n; end if;
  perform set_config('role', session_user::text, false);
  insert into public.manager_profiles(user_id,shift,sectors) values(m3,'morning',array[4]::smallint[]);
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub', g::text, false);
  select count(*) into n from public.garage_shift_dispatch_recipients(v.id,'morning') r
   where r.resolution = 'direct';
  if n <> 2 then raise exception 'PREVIEW_AMBIGUOUS_FAIL %', n; end if;
  perform set_config('role', session_user::text, false);
  delete from public.manager_profiles where user_id = m3;
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub', g::text, false);

  -- زيارتان متتاليتان للمحطة ضمن نفس الانطلاقة
  perform set_config('request.jwt.claim.sub', m1::text, false);
  d := public.sector_confirm_vehicle_arrival(d.id, null);
  for i in 1..2 loop
    l := public.sector_send_vehicle_to_station(d.id, 'زيارة فلاتر ' || i);
    perform set_config('request.jwt.claim.sub', st::text, false);
    l := public.station_confirm_vehicle_arrival(l.id, null);
    s := public.ts_record_weighing(l.id, 4 + i);
    s := public.ts_complete_weighing(l.id, 'press', 'compactor_medium');
    if i = 1 then
      l := public.station_dispatch_vehicle(d.id, 'work_site', 'عودة');
      perform set_config('request.jwt.claim.sub', m1::text, false);
      l := public.sector_confirm_vehicle_site_return(l.id, null);
    else
      l := public.station_dispatch_vehicle(d.id, 'garage', 'إنهاء');
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', g::text, false);
  d := public.garage_record_return(d.id);

  -- ③ جدول العمليات: صف واحد لكل زيارة (بلا تكرار) + أعمدة فلاتر القاطع/المنطقة
  perform set_config('request.jwt.claim.sub', op::text, false);
  select count(*) into n from public.ops_station_workflow(null, null) where departure_id = d.id;
  if n <> 2 then raise exception 'WORKFLOW_VISIT_ROWS_FAIL %', n; end if;
  select count(distinct visit_id) into n from public.ops_station_workflow(null, null) where departure_id = d.id;
  if n <> 2 then raise exception 'WORKFLOW_DISTINCT_VISITS_FAIL %', n; end if;
  select count(*) into n from public.ops_station_workflow(null, null)
   where departure_id = d.id and sector_id = 4 and parent_sector = 'karrada';
  if n <> 2 then raise exception 'WORKFLOW_FILTER_COLUMNS_FAIL %', n; end if;

  raise notice '✅ ارتداد مسؤول القسم وفلاتر العمليات وعدم تكرار الصفوف ناجحة';
end$$;
