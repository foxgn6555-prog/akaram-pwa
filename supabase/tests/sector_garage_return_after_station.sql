-- 00135 · العودة للكراج بعد زيارة المحطة: آلة الحالة الموحدة + الأكواد الدقيقة + أهلية الموسعة.
-- العزل: حفظ/حذف/استعادة manager_profiles كاملة (RLS يجاوزها مستخدم الجلسة).
do $$
declare
  g   uuid := '87000000-0000-0000-0000-000000000001';
  st  uuid := '87000000-0000-0000-0000-000000000002';
  m1  uuid := '87000000-0000-0000-0000-000000000003';
  m2  uuid := '87000000-0000-0000-0000-000000000004';
  v1 public.garage_vehicles; v2 public.garage_vehicles; v3 public.garage_vehicles;
  d1 public.garage_departures; d2 public.garage_departures; d3 public.garage_departures;
  l public.vehicle_trip_legs; n bigint;
begin
  create temp table tmp_saved_trip_profiles on commit drop as
  select * from public.manager_profiles;
  delete from public.manager_profiles;

  insert into auth.users(id, email) values
    (g, 'trip-garage@x.iq'), (st, 'trip-station@x.iq'),
    (m1, 'trip-direct@x.iq'), (m2, 'trip-sibling@x.iq');
  insert into public.user_roles(user_id, role) values
    (g, 'central_garage_officer'), (g, 'ops_room'), (st, 'transfer_station'),
    (m1, 'department_manager'), (m2, 'department_manager');
  insert into public.garage_user_profiles(user_id, parent_sector) values (g, 'karrada');
  insert into public.manager_profiles(user_id, shift, sectors) values
    (m1, 'morning', array[4]::smallint[]),
    (m2, 'morning', array[2]::smallint[]);

  -- ① الانحدار الجوهري: زيارة محطة ثم عودة مؤكدة للموقع ⇒ إنهاء الوردية للكراج ينجح
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', g::text, false);
  v1 := public.garage_add_vehicle('كابسة العودة', 'DB-RG1', 'P-RG1', 'C-RG1', g::text || '/x.webp', 'morning', 'سائق العودة', 4::smallint);
  d1 := public.garage_record_shift_departure(v1.id, 'morning', null);
  if d1.recipient_manager_id is distinct from m1 then
    raise exception 'TRIP_RECIPIENT_FAIL %', coalesce(d1.recipient_manager_id::text, 'null');
  end if;

  perform set_config('request.jwt.claim.sub', m1::text, false);
  d1 := public.sector_confirm_vehicle_arrival(d1.id, null);
  l  := public.sector_send_vehicle_to_station(d1.id, null);

  perform set_config('request.jwt.claim.sub', st::text, false);
  l := public.station_confirm_vehicle_arrival(l.id, null);
  l := public.station_dispatch_vehicle(d1.id, 'work_site', null);

  perform set_config('request.jwt.claim.sub', m1::text, false);
  l  := public.sector_confirm_vehicle_site_return(l.id, null);
  d1 := public.sector_send_vehicle_to_garage(d1.id, 'بعد زيارة المحطة');
  if d1.site_departed_at is null or d1.site_departed_by is distinct from m1 then
    raise exception 'RETURN_AFTER_STATION_FAIL';
  end if;
  perform set_config('request.jwt.claim.sub', g::text, false);
  select count(*) into n from public.notifications
   where user_id = g and title = 'الآلية في طريقها إلى الكراج';
  if n < 1 then raise exception 'RETURN_NOTIFY_FAIL'; end if;

  d1 := public.garage_record_return(d1.id);
  if d1.returned_at is null then raise exception 'RETURN_CLOSE_FAIL'; end if;

  -- ② الأكواد الدقيقة: ساق مفتوحة ⇒ TRIP_LEG_ALREADY_OPEN، والآلية في المحطة ⇒ NOT_ALLOWED
  v2 := public.garage_add_vehicle('كابسة الأكواد', 'DB-RG2', 'P-RG2', 'C-RG2', g::text || '/y.webp', 'morning', 'سائق الأكواد', 4::smallint);
  d2 := public.garage_record_shift_departure(v2.id, 'morning', null);
  perform set_config('request.jwt.claim.sub', m1::text, false);
  d2 := public.sector_confirm_vehicle_arrival(d2.id, null);
  l  := public.sector_send_vehicle_to_station(d2.id, null);
  begin
    perform public.sector_send_vehicle_to_garage(d2.id, null);
    raise exception 'OPEN_LEG_BLOCK_FAIL';
  exception when others then
    if SQLERRM not like '%TRIP_LEG_ALREADY_OPEN%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', st::text, false);
  l := public.station_confirm_vehicle_arrival(l.id, null);
  perform set_config('request.jwt.claim.sub', m1::text, false);
  begin
    perform public.sector_send_vehicle_to_garage(d2.id, null);
    raise exception 'AT_STATION_BLOCK_FAIL';
  exception when others then
    if SQLERRM not like '%GARAGE_SITE_DEPARTURE_NOT_ALLOWED%' then raise; end if;
  end;
  -- وصول غير مؤكد ⇒ كود مستقل
  perform set_config('request.jwt.claim.sub', g::text, false);
  v3 := public.garage_add_vehicle('كابسة الأهلية', 'DB-RG3', 'P-RG3', 'C-RG3', g::text || '/z.webp', 'morning', 'سائق الأهلية', 4::smallint);
  d3 := public.garage_record_shift_departure(v3.id, 'morning', null);
  perform set_config('request.jwt.claim.sub', m1::text, false);
  begin
    perform public.sector_send_vehicle_to_garage(d3.id, null);
    raise exception 'NO_ARRIVAL_BLOCK_FAIL';
  exception when others then
    if SQLERRM not like '%GARAGE_ARRIVAL_NOT_CONFIRMED%' then raise; end if;
  end;

  -- ③ الأهلية الموسعة: مسؤول قطاع شقيق ضمن القاطع نفسه ينهي الوردية مكان المستلم
  d3 := public.sector_confirm_vehicle_arrival(d3.id, null);
  perform set_config('request.jwt.claim.sub', m2::text, false);
  d3 := public.sector_send_vehicle_to_garage(d3.id, null);
  if d3.site_departed_at is null or d3.site_departed_by is distinct from m2 then
    raise exception 'ELIGIBLE_WIDENING_FAIL';
  end if;

  -- ④ استعادة ملفات المسؤولين كما كانت
  perform set_config('role', session_user::text, false);
  delete from public.manager_profiles;
  insert into public.manager_profiles select * from tmp_saved_trip_profiles;
end$$;
