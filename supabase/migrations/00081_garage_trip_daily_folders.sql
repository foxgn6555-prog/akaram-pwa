-- مجلد يومي لحركة الآليات: فهرس خفيف ثم تحميل يوم واحد فقط لتجنب جلب السجل كاملاً.
create index if not exists garage_departures_departed_baghdad_day_idx
on public.garage_departures (((departed_at at time zone 'Asia/Baghdad')::date));

create or replace function public.garage_departure_days(p_limit integer default 60,p_offset integer default 0)
returns table(trip_day date,total_count bigint,open_count bigint,first_departure_at timestamptz,last_activity_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$
begin
 perform app.require_garage_actor();
 if p_limit not between 1 and 90 or p_offset not between 0 and 3650 then raise exception 'GARAGE_DAY_PAGE_INVALID';end if;
 return query select (d.departed_at at time zone 'Asia/Baghdad')::date,count(*),count(*) filter(where d.returned_at is null),min(d.departed_at),max(coalesce(d.returned_at,d.site_departed_at,d.arrived_at,d.departed_at))
 from public.garage_departures d group by 1 order by 1 desc limit p_limit offset p_offset;
end$$;

create or replace function public.garage_departures_for_day(p_day date)
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$
begin
 perform app.require_garage_actor();if p_day is null then raise exception 'GARAGE_DAY_REQUIRED';end if;
 return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,d.notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 where (d.departed_at at time zone 'Asia/Baghdad')::date=p_day order by d.departed_at desc;
end$$;

create or replace function public.manager_vehicle_trip_days(p_limit integer default 60,p_offset integer default 0)
returns table(trip_day date,total_count bigint,open_count bigint,first_departure_at timestamptz,last_activity_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$
declare u uuid:=auth.uid();begin
 if u is null or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;
 if p_limit not between 1 and 90 or p_offset not between 0 and 3650 then raise exception 'GARAGE_DAY_PAGE_INVALID';end if;
 return query select (d.departed_at at time zone 'Asia/Baghdad')::date,count(*),count(*) filter(where d.returned_at is null),min(d.departed_at),max(coalesce(d.returned_at,d.site_departed_at,d.arrived_at,d.departed_at))
 from public.garage_departures d where d.recipient_manager_id=u group by 1 order by 1 desc limit p_limit offset p_offset;
end$$;

create or replace function public.manager_vehicle_trips_for_day(p_day date)
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$
declare u uuid:=auth.uid();begin
 if u is null or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;if p_day is null then raise exception 'GARAGE_DAY_REQUIRED';end if;
 return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 where d.recipient_manager_id=u and (d.departed_at at time zone 'Asia/Baghdad')::date=p_day order by d.departed_at desc;
end$$;

revoke all on function public.garage_departure_days(integer,integer),public.garage_departures_for_day(date),public.manager_vehicle_trip_days(integer,integer),public.manager_vehicle_trips_for_day(date) from public,anon;
grant execute on function public.garage_departure_days(integer,integer),public.garage_departures_for_day(date),public.manager_vehicle_trip_days(integer,integer),public.manager_vehicle_trips_for_day(date) to authenticated;
