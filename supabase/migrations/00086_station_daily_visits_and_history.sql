-- 00086 · مجلدات أيام المحطة وسجل كل زيارة ومدة البقاء والفلاتر

create or replace function public.station_movement_days(p_limit integer default 60,p_offset integer default 0)
returns table(visit_day date,visit_count bigint,vehicle_count bigint,open_count bigint,first_arrival_at timestamptz,last_activity_at timestamptz,total_stay_minutes bigint)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['transfer_station']) then raise exception 'STATION_FORBIDDEN';end if;
 if p_limit not between 1 and 180 or p_offset<0 then raise exception 'STATION_DAYS_PAGE_INVALID';end if;
 return query
 with visits as(
  select i.departure_id,i.departed_at,i.arrived_at,o.departed_at as dispatched_at
  from public.vehicle_trip_legs i
  left join public.vehicle_trip_legs o on o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station'
  where i.destination_type='transfer_station'
 )
 select (v.departed_at at time zone 'Asia/Baghdad')::date,count(*),count(distinct v.departure_id),count(*) filter(where v.dispatched_at is null),min(v.arrived_at),max(coalesce(v.dispatched_at,v.arrived_at,v.departed_at)),
 coalesce(sum(case when v.arrived_at is null then 0 else floor(extract(epoch from(coalesce(v.dispatched_at,now())-v.arrived_at))/60)::bigint end),0)::bigint
 from visits v group by 1 order by 1 desc limit p_limit offset p_offset;
end$$;

create or replace function public.station_visits_for_day(p_day date,p_search text default null,p_status text default null,p_sector_id smallint default null)
returns table(visit_id uuid,departure_id uuid,visit_number bigint,inbound_sequence integer,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,sector_id smallint,area_name text,manager_name text,inbound_departed_at timestamptz,arrived_at timestamptz,dispatched_at timestamptz,outbound_destination text,status text,transit_minutes integer,stay_minutes integer,inbound_notes text,arrival_notes text,dispatch_notes text)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['transfer_station']) then raise exception 'STATION_FORBIDDEN';end if;
 if p_day is null then raise exception 'STATION_DAY_REQUIRED';end if;
 if p_status is not null and p_status not in('in_transit','at_station','dispatched') then raise exception 'STATION_STATUS_INVALID';end if;
 return query
 with inbound as(
  select i.*,row_number() over(partition by i.departure_id order by i.sequence_no) as visit_no
  from public.vehicle_trip_legs i where i.destination_type='transfer_station'
 ),visits as(
  select i.id visit_id,i.departure_id,i.visit_no,i.sequence_no,d.vehicle_id,gv.vehicle_name,gv.db_number,d.driver_name,d.shift,d.sector_id,s.name area_name,d.recipient_manager_name,
   i.departed_at,i.arrived_at,o.departed_at dispatched_at,o.destination_type outbound_destination,
   case when i.arrived_at is null then 'in_transit' when o.id is null then 'at_station' else 'dispatched' end visit_status,
   case when i.arrived_at is null then null else floor(extract(epoch from(i.arrived_at-i.departed_at))/60)::int end transit_minutes,
   case when i.arrived_at is null then null else floor(extract(epoch from(coalesce(o.departed_at,now())-i.arrived_at))/60)::int end stay_minutes,
   i.departure_notes,i.arrival_notes,o.departure_notes dispatch_notes
  from inbound i join public.garage_departures d on d.id=i.departure_id join public.garage_vehicles gv on gv.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  left join public.vehicle_trip_legs o on o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station'
  where(i.departed_at at time zone 'Asia/Baghdad')::date=p_day
 )
 select v.visit_id,v.departure_id,v.visit_no,v.sequence_no,v.vehicle_id,v.vehicle_name,v.db_number,v.driver_name,v.shift,v.sector_id,v.area_name,v.recipient_manager_name,v.departed_at,v.arrived_at,v.dispatched_at,v.outbound_destination,v.visit_status,v.transit_minutes,v.stay_minutes,v.departure_notes,v.arrival_notes,v.dispatch_notes
 from visits v
 where(p_search is null or trim(p_search)='' or v.db_number ilike '%'||trim(p_search)||'%' or v.vehicle_name ilike '%'||trim(p_search)||'%' or v.driver_name ilike '%'||trim(p_search)||'%')
 and(p_status is null or v.visit_status=p_status) and(p_sector_id is null or v.sector_id=p_sector_id)
 order by case v.visit_status when 'in_transit' then 0 when 'at_station' then 1 else 2 end,v.departed_at desc;
end$$;

revoke all on function public.station_movement_days(integer,integer),public.station_visits_for_day(date,text,text,smallint) from public,anon;
grant execute on function public.station_movement_days(integer,integer),public.station_visits_for_day(date,text,text,smallint) to authenticated;
