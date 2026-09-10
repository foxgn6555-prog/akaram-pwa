-- 00091 · إصلاح سلامة الربط بين الكراج ومسؤول القسم وتوحيد صناديق الأيام
-- السبب: المسار القديم كان يسمح بانطلاقة recipient_manager_id=NULL، بينما مجلدات المسؤول تعرض المعرف الصريح فقط.

create or replace function public.garage_record_departure(p_vehicle_id uuid,p_notes text default null,p_recipient_manager_id uuid default null)
returns public.garage_departures language plpgsql volatile security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor();v public.garage_vehicles;a public.garage_driver_assignments;d public.garage_departures;v_manager_id uuid:=p_recipient_manager_id;v_manager_name text;matches int;
begin
 if length(coalesce(p_notes,''))>500 then raise exception 'GARAGE_DEPARTURE_NOTES_TOO_LONG';end if;
 select * into v from public.garage_vehicles where id=p_vehicle_id and archived_at is null for update;if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND';end if;
 if exists(select 1 from public.vehicle_maintenance_cases where vehicle_id=v.id and completed_at is null)then raise exception 'GARAGE_VEHICLE_IN_MAINTENANCE';end if;
 select * into a from public.garage_driver_assignments where vehicle_id=p_vehicle_id and ends_at is null;if not found then raise exception 'GARAGE_NO_ACTIVE_ASSIGNMENT';end if;
 if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and returned_at is null)then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';end if;
 if v_manager_id is null then
  select count(*),(array_agg(mp.user_id))[1]into matches,v_manager_id from public.manager_profiles mp where a.sector_id=any(mp.sectors)and mp.shift=a.shift and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager');
  if matches<>1 then raise exception 'GARAGE_RECIPIENT_MANAGER_REQUIRED';end if;
 end if;
 select coalesce(nullif(trim(e.full_name),''),au.email,v_manager_id::text)into v_manager_name from public.manager_profiles mp join auth.users au on au.id=mp.user_id left join public.employees e on e.user_id=mp.user_id where mp.user_id=v_manager_id and a.sector_id=any(mp.sectors)and mp.shift=a.shift and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager');
 if not found then raise exception 'GARAGE_RECIPIENT_MANAGER_INVALID';end if;
 insert into public.garage_departures(vehicle_id,driver_name,shift,sector_id,departed_by,notes,recipient_manager_id,recipient_manager_name)values(v.id,a.driver_name,a.shift,a.sector_id,u,nullif(trim(coalesce(p_notes,'')),''),v_manager_id,v_manager_name)returning * into d;
 insert into public.notifications(user_id,title,body,type,link)values(v_manager_id,'آلية في الطريق إلى موقع العمل',format('%s · DB %s انطلقت من الكراج إلى ورديتك',v.vehicle_name,v.db_number),'info','/manager/vehicle-trips');
 return d;
exception when unique_violation then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';end$$;

create or replace function public.garage_record_shift_departure(p_vehicle_id uuid,p_shift text,p_notes text,p_recipient_manager_id uuid)
returns public.garage_departures language plpgsql security definer set search_path=public,app as $$declare u uuid:=app.require_garage_actor();v public.garage_vehicles;a public.garage_vehicle_shift_assignments;d public.garage_departures;mn text;begin
 if p_recipient_manager_id is null then raise exception 'GARAGE_RECIPIENT_MANAGER_REQUIRED';end if;
 select * into v from public.garage_vehicles where id=p_vehicle_id and archived_at is null for update;if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND';end if;
 if exists(select 1 from public.vehicle_maintenance_cases where vehicle_id=v.id and completed_at is null)then raise exception 'GARAGE_VEHICLE_IN_MAINTENANCE';end if;
 if exists(select 1 from public.garage_departures where vehicle_id=v.id and returned_at is null)then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';end if;
 select * into a from public.garage_vehicle_shift_assignments where vehicle_id=v.id and shift=p_shift and ends_at is null;if not found then raise exception 'GARAGE_SHIFT_ASSIGNMENT_NOT_FOUND';end if;
 select coalesce(nullif(trim(e.full_name),''),au.email,p_recipient_manager_id::text)into mn from public.manager_profiles mp join auth.users au on au.id=mp.user_id left join public.employees e on e.user_id=mp.user_id where mp.user_id=p_recipient_manager_id and mp.shift=p_shift and a.sector_id=any(mp.sectors)and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager');if not found then raise exception 'GARAGE_RECIPIENT_MANAGER_INVALID';end if;
 insert into public.garage_departures(vehicle_id,driver_name,shift,sector_id,departed_by,notes,recipient_manager_id,recipient_manager_name)values(v.id,a.driver_name,p_shift,a.sector_id,u,nullif(trim(coalesce(p_notes,'')),''),p_recipient_manager_id,mn)returning * into d;
 insert into public.notifications(user_id,title,body,type,link)values(p_recipient_manager_id,'آلية في الطريق إلى موقع العمل',format('%s · DB %s انطلقت في الشفت %s',v.vehicle_name,v.db_number,p_shift),'info','/manager/vehicle-trips');
 return d;
end$$;

-- توافق السجلات القديمة: الرحلة ذات المستلم NULL تظهر للمسؤول الوحيد المطابق للقاطع والشفت.
create or replace function public.manager_vehicle_trip_days(p_limit integer default 60,p_offset integer default 0)
returns table(trip_day date,total_count bigint,open_count bigint,first_departure_at timestamptz,last_activity_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=auth.uid();begin
 if u is null or not app.has_role(array['department_manager'])then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;if p_limit not between 1 and 90 or p_offset not between 0 and 3650 then raise exception 'GARAGE_DAY_PAGE_INVALID';end if;
 return query select(d.departed_at at time zone 'Asia/Baghdad')::date,count(*),count(*)filter(where d.returned_at is null),min(d.departed_at),max(coalesce(d.returned_at,d.site_departed_at,d.arrived_at,d.departed_at))from public.garage_departures d where d.recipient_manager_id=u or(d.recipient_manager_id is null and exists(select 1 from public.manager_profiles mp where mp.user_id=u and d.sector_id=any(mp.sectors)and d.shift=mp.shift))group by 1 order by 1 desc limit p_limit offset p_offset;
end$$;
create or replace function public.manager_vehicle_trips_for_day(p_day date)
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=auth.uid();begin
 if u is null or not app.has_role(array['department_manager'])then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;if p_day is null then raise exception 'GARAGE_DAY_REQUIRED';end if;
 return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id where(d.recipient_manager_id=u or(d.recipient_manager_id is null and exists(select 1 from public.manager_profiles mp where mp.user_id=u and d.sector_id=any(mp.sectors)and d.shift=mp.shift)))and(d.departed_at at time zone 'Asia/Baghdad')::date=p_day order by d.departed_at desc;
end$$;

-- فحص مركزي سريع لأي انطلاقة لا تظهر في صندوق المستلم أو بلا إشعار.
create or replace function public.vehicle_portal_link_health(p_from timestamptz default now()-interval '7 days')
returns table(departure_id uuid,db_number text,recipient_manager_id uuid,recipient_manager_name text,departed_at timestamptz,link_status text,notification_count bigint,open_leg_count bigint)
language plpgsql stable security definer set search_path=public,app as $$begin
 if not app.has_role(array['central_garage_officer','ops_room','super_admin'])then raise exception 'VEHICLE_LINK_HEALTH_FORBIDDEN';end if;
 return query select d.id,v.db_number,d.recipient_manager_id,d.recipient_manager_name,d.departed_at,
 case when d.recipient_manager_id is null then 'legacy_unassigned' when not exists(select 1 from public.manager_profiles mp where mp.user_id=d.recipient_manager_id and d.sector_id=any(mp.sectors)and d.shift=mp.shift)then 'recipient_profile_mismatch' when not exists(select 1 from public.user_roles ur where ur.user_id=d.recipient_manager_id and ur.role='department_manager')then 'recipient_role_missing' when(select count(*)from public.vehicle_trip_legs l where l.departure_id=d.id and l.arrived_at is null)>1 then 'multiple_open_legs' else 'ok' end,
 (select count(*)from public.notifications n where n.user_id=d.recipient_manager_id and n.link='/manager/vehicle-trips' and n.created_at between d.departed_at-interval '5 seconds' and d.departed_at+interval '5 seconds'),
 (select count(*)from public.vehicle_trip_legs l where l.departure_id=d.id and l.arrived_at is null)
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id where d.departed_at>=p_from order by d.departed_at desc;
end$$;

revoke all on function public.garage_record_departure(uuid,text,uuid),public.garage_record_shift_departure(uuid,text,text,uuid),public.manager_vehicle_trip_days(integer,integer),public.manager_vehicle_trips_for_day(date),public.vehicle_portal_link_health(timestamptz) from public,anon;
grant execute on function public.garage_record_departure(uuid,text,uuid),public.garage_record_shift_departure(uuid,text,text,uuid),public.manager_vehicle_trip_days(integer,integer),public.manager_vehicle_trips_for_day(date),public.vehicle_portal_link_health(timestamptz) to authenticated;
