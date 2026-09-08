-- اختبار انطلاق السائقين من الكراج: خروج إلى الوردية، تفرد الانطلاقة المفتوحة، العودة، وقائمة اليوم.
do $$
-- اختبار انطلاق السائقين: خروج من الكراج إلى الوردية، تفرد الانطلاقة المفتوحة، العودة، والعزل.
do $$
declare
  garage_u uuid := '75000000-0000-0000-0000-000000000001';
  v public.garage_vehicles;
  dep public.garage_departures;
  dep2 public.garage_departures;
  n bigint;
begin
  insert into auth.users(id,email) values (garage_u,'garage-departures@akram.iq');
  insert into public.user_roles(user_id,role) values (garage_u,'central_garage_officer');
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub',garage_u::text,false);

  v := public.garage_add_vehicle('كابسة انطلاق','DB-750','بغداد 750','CHASSIS-750',
    garage_u::text||'/vehicle.webp','morning','سائق الانطلاق',1::smallint);

  -- ① تسجيل الانطلاق: ينسخ السائق والوردية والموقع من الانطلاقية الحالية
  dep := public.garage_record_departure(v.id, null);
  if dep.driver_name<>'سائق الانطلاق' or dep.shift<>'morning' or dep.sector_id<>1 then
    raise exception 'DEPARTURE_SNAPSHOT_FAIL'; end if;
  if dep.departed_at is null or abs(extract(epoch from(now()-dep.departed_at)))>10 then
    raise exception 'DEPARTURE_SERVER_TIME_FAIL'; end if;
  if dep.returned_at is not null then raise exception 'DEPARTURE_NOT_OPEN_FAIL'; end if;

  -- ② لا انطلاقة مفتوحة ثانية لنفس الآلية
  begin
    perform public.garage_record_departure(v.id, null);
    raise exception 'DOUBLE_DEPARTURE_ACCEPTED';
  exception when others then
    if sqlerrm='DOUBLE_DEPARTURE_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_DEPARTURE_ALREADY_OPEN%' then raise; end if;
  end;

  -- ③ العودة تغلق الانطلاقة وتسجل الوقت والمنفذ
  dep2 := public.garage_record_return(dep.id);
  if dep2.returned_at is null or dep2.returned_at<dep2.departed_at then
    raise exception 'RETURN_TIME_FAIL'; end if;
  select count(*) into n from public.garage_departures where vehicle_id=v.id and returned_at is null;
  if n<>0 then raise exception 'OPEN_DEPARTURE_LEFT_FAIL'; end if;

  -- ④ بعد العودة يمكن انطلاق جديد (دورة عمل كاملة)
  dep := public.garage_record_departure(v.id, 'انطلاقة مسائية');
  if dep.notes<>'انطلاقة مسائية' then raise exception 'DEPARTURE_NOTES_FAIL'; end if;
  perform public.garage_record_return(dep.id);

  -- ⑤ قائمة اليوم تتضمن الانطلاقات المسجلة اليوم
  select count(*) into n from public.garage_today_departures() where vehicle_id=v.id;
  if n<2 then raise exception 'TODAY_DEPARTURES_FAIL'; end if;

  -- ⑥ العودة على انطلاقة مغلقة ترفض
  begin
    perform public.garage_record_return(dep.id);
    raise exception 'DOUBLE_RETURN_ACCEPTED';
  exception when others then
    if sqlerrm='DOUBLE_RETURN_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_OPEN_DEPARTURE_NOT_FOUND%' then raise; end if;
  end;

  reset role;
  delete from public.garage_departures where vehicle_id=v.id;
  delete from public.garage_vehicles where id=v.id;
  delete from public.user_roles where user_id=garage_u;
  delete from auth.users where id=garage_u;
  raise notice '✅ انطلاق السائقين: خروج من الكراج، تفرد الانطلاقة، العودة، وقائمة اليوم — كلها سليمة';
end $$;
