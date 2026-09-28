-- 00152 · مرحلة الرحلة من مصدر واحد (app.trip_status) لكل البوابات
-- الخلل: مسار الصيانة لا يسجّل مغادرة الموقع (site_departed_at) فيختفي زر «وصول إلى الكراج» من واجهة الكراج؛
--        وإرسال المسؤول للآلية إلى الكراج لا يفتح ساقاً، فبعد جولة محطة→موقع تبدو الآلية «في الطريق للكراج» وهي تعمل.
-- الإصلاح: (1) أي ساق تنطلق من موقع العمل تثبّت site_departed_at تلقائياً (trigger)
--          (2) الإرسال إلى الكراج يفتح ساقاً work_site→garage
--          (3) app.trip_status يعتمد على الساق الأخيرة (العودة للموقع = تعمل في الموقع)
--          (4) garage_record_return يقبل فقط عندما trip_status = to_garage
--          (5) دوال الكراج والمسؤول تُرجع trip_status لتوحيد الشارات والأزرار

-- (1) trigger
create or replace function app.sync_site_departure_from_leg() returns trigger
language plpgsql security definer set search_path=public,app as $$
declare ts timestamptz := coalesce(new.departed_at, now());
begin
  if new.origin_type = 'work_site' then
    -- يحترم قيد الترتيب garage_departure_handover_order: لا يُثبّت إلا بعد وصول مؤكد وقبل العودة
    update public.garage_departures
       set site_departed_at = coalesce(site_departed_at, ts),
           site_departed_by = coalesce(site_departed_by, coalesce(new.departed_by, arrived_by)),
           site_departure_notes = coalesce(site_departure_notes, new.departure_notes)
     where id = new.departure_id
       and arrived_at is not null and ts >= arrived_at
       and (returned_at is null or returned_at >= ts);
  end if;
  return new;
end$$;
drop trigger if exists trg_sync_site_departure_from_leg on public.vehicle_trip_legs;
create trigger trg_sync_site_departure_from_leg after insert on public.vehicle_trip_legs
for each row execute function app.sync_site_departure_from_leg();

-- (3) trip_status
create or replace function app.trip_status(p_departure_id uuid) returns text
language plpgsql stable security definer set search_path=public,app as $$
declare d public.garage_departures; l public.vehicle_trip_legs;
begin
  select * into d from public.garage_departures where id = p_departure_id;
  if not found then return null; end if;
  if d.returned_at is not null then return 'returned'; end if;
  if d.arrived_at is null then return 'to_site'; end if;
  select * into l from public.vehicle_trip_legs where departure_id = p_departure_id order by sequence_no desc limit 1;
  if found then
    if l.arrived_at is null then
      return case l.destination_type when 'transfer_station' then 'to_station' when 'maintenance' then 'to_maintenance' when 'garage' then 'to_garage' else 'to_site' end;
    end if;
    if l.destination_type = 'transfer_station' then return 'at_station'; end if;
    if l.destination_type = 'maintenance' then return 'at_maintenance'; end if;
    if l.destination_type = 'garage' then return 'to_garage'; end if;
    -- الساق الأخيرة عادت إلى موقع العمل: الآلية تعمل في الموقع بغضّ النظر عن site_departed_at القديم
  elsif d.site_departed_at is not null then
    return 'to_garage';
  end if;
  if exists (select 1 from public.vehicle_maintenance_cases mc where mc.departure_id = p_departure_id and mc.completed_at is null) then return 'at_maintenance'; end if;
  if exists (select 1 from public.sector_breakdowns b where b.departure_id = p_departure_id and b.status = 'logged' and b.archived_at is null) then return 'breakdown'; end if;
  return 'at_site';
end$$;

-- (2) الإرسال إلى الكراج يفتح ساقاً
create or replace function public.sector_send_vehicle_to_garage(p_departure_id uuid, p_notes text default null)
returns public.garage_departures language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.garage_departures; st text;
begin
  if u is null or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(coalesce(p_notes,'')) > 500 then raise exception 'GARAGE_STAGE_NOTES_TOO_LONG'; end if;
  select * into d from public.garage_departures where id = p_departure_id and returned_at is null for update;
  if not found then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  if not (d.recipient_manager_id = u or app.sector_stage_eligible(u, d.sector_id))
  then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  if d.arrived_at is null then raise exception 'GARAGE_ARRIVAL_NOT_CONFIRMED'; end if;
  if exists(select 1 from public.vehicle_trip_legs where departure_id = d.id and arrived_at is null)
  then raise exception 'TRIP_LEG_ALREADY_OPEN'; end if;
  st := app.trip_status(d.id);
  if st not in ('at_site','breakdown') then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  update public.garage_departures
     set site_departed_at = now(), site_departed_by = u,
         site_departure_notes = nullif(trim(coalesce(p_notes,'')),'')
   where id = d.id returning * into d;
  insert into public.vehicle_trip_legs(departure_id, sequence_no, origin_type, destination_type, departed_by, departure_notes)
  values (d.id, app.next_trip_leg_sequence(d.id), 'work_site', 'garage', u, nullif(trim(coalesce(p_notes,'')),''));
  insert into public.notifications(user_id, title, body, type, link)
  values (d.departed_by, 'الآلية في طريقها إلى الكراج',
          format('أنهت الآلية DB %s ورديتها وغادرت موقع العمل باتجاه الكراج', (select db_number from public.garage_vehicles where id = d.vehicle_id)),
          'warning', '/central-garage/drivers-dispatch');
  return d;
end$$;

-- (4) استلام الكراج
create or replace function public.garage_record_return(p_departure_id uuid)
returns public.garage_departures language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor(); d public.garage_departures; l public.vehicle_trip_legs; c public.vehicle_maintenance_cases; st text;
begin
  select * into d from public.garage_departures where id=p_departure_id and returned_at is null for update;
  if not found then raise exception 'GARAGE_OPEN_DEPARTURE_NOT_FOUND'; end if;
  if not app.garage_vehicle_allowed(d.vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  st := app.trip_status(d.id);
  -- يُسمح فقط عندما تكون الآلية في طريقها إلى الكراج (أو انطلاقة قديمة بلا مستلم لم تصل)
  if not (st = 'to_garage' or (st = 'to_site' and d.recipient_manager_id is null)) then raise exception 'GARAGE_VEHICLE_NOT_SENT_BACK'; end if;
  select * into l from public.vehicle_trip_legs where departure_id=d.id and arrived_at is null for update;
  if found then
    if l.destination_type<>'garage' then raise exception 'GARAGE_VEHICLE_NOT_SENT_BACK'; end if;
    update public.vehicle_trip_legs set arrived_at=now(),arrived_by=u,arrival_notes='أكد الكراج الوصول' where id=l.id;
  end if;
  update public.garage_departures set arrived_at=coalesce(arrived_at,now()),arrived_by=coalesce(arrived_by,u),site_departed_at=coalesce(site_departed_at,now()),site_departed_by=coalesce(site_departed_by,u),returned_at=now(),returned_by=u where id=d.id returning * into d;
  update public.vehicle_maintenance_cases set status='closed_at_garage',completed_at=now(),updated_at=now() where departure_id=d.id and status='to_garage' and completed_at is null returning * into c;
  if found then update public.sector_breakdowns set status='resolved',resolved_at=now(),resolved_by=u,resolution_notes='أغلقت الحالة بعد وصول الآلية من الصيانة إلى الكراج' where id=c.breakdown_id; end if;
  if d.recipient_manager_id is not null then
    insert into public.notifications(user_id,title,body,type,link) values(d.recipient_manager_id,'وصلت الآلية إلى الكراج',format('أكد الكراج استلام الآلية DB %s وإغلاق الانطلاقة',(select db_number from public.garage_vehicles where id=d.vehicle_id)),'success','/manager/vehicle-trips');
  end if;
  return d;
end$$;

-- (5) دوال القوائم تُرجع trip_status
drop function if exists public.manager_vehicle_trips_for_day(date);
create function public.manager_vehicle_trips_for_day(p_day date)
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text,trip_status text)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=auth.uid();begin
 if u is null or not app.has_role(array['department_manager'])then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;if p_day is null then raise exception 'GARAGE_DAY_REQUIRED';end if;
 return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector,app.trip_status(d.id) from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id where(d.recipient_manager_id=u or(d.recipient_manager_id is null and exists(select 1 from public.manager_profiles mp where mp.user_id=u and d.sector_id=any(mp.sectors)and d.shift=mp.shift)))and(d.departed_at at time zone 'Asia/Baghdad')::date=p_day order by d.departed_at desc;
end$$;

drop function if exists public.manager_vehicle_trips();
create function public.manager_vehicle_trips()
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text,trip_status text)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=auth.uid();begin if u is null or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector,app.trip_status(d.id) from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id where(d.recipient_manager_id=u or d.recipient_manager_id is null and exists(select 1 from public.manager_profiles mp where mp.user_id=u and d.sector_id=any(mp.sectors) and d.shift=mp.shift)) and(d.returned_at is null or (d.returned_at at time zone 'Asia/Baghdad')::date=(now() at time zone 'Asia/Baghdad')::date) order by(d.returned_at is null)desc,d.departed_at desc;end$$;

drop function if exists public.garage_today_departures();
create function public.garage_today_departures()
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text,trip_status text)language plpgsql stable security definer set search_path=public,app as $$begin perform app.require_garage_actor();return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,d.notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector,app.trip_status(d.id) from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id where app.garage_vehicle_allowed(d.vehicle_id)and(d.returned_at is null or(d.departed_at at time zone'Asia/Baghdad')::date=(now()at time zone'Asia/Baghdad')::date)order by(d.returned_at is null)desc,d.departed_at desc;end$$;

drop function if exists public.garage_departures_for_day(date);
create function public.garage_departures_for_day(p_day date)returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text,trip_status text)language plpgsql stable security definer set search_path=public,app as $$begin perform app.require_garage_actor();return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,d.notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector,app.trip_status(d.id) from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id where app.garage_vehicle_allowed(d.vehicle_id)and(d.departed_at at time zone'Asia/Baghdad')::date=p_day order by d.departed_at desc;end$$;

revoke all on function public.manager_vehicle_trips_for_day(date),public.manager_vehicle_trips(),public.garage_today_departures(),public.garage_departures_for_day(date),public.sector_send_vehicle_to_garage(uuid,text),public.garage_record_return(uuid) from public,anon;
grant execute on function public.manager_vehicle_trips_for_day(date),public.manager_vehicle_trips(),public.garage_today_departures(),public.garage_departures_for_day(date),public.sector_send_vehicle_to_garage(uuid,text),public.garage_record_return(uuid) to authenticated;
revoke all on function app.sync_site_departure_from_leg() from public,anon,authenticated;
