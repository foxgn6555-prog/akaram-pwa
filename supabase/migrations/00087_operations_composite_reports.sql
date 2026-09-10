-- 00087 · تقارير غرفة العمليات المركبة: الوقت المنتج والحركة والمحطة والصيانة والتوقف

create or replace function public.operational_station_visits(p_from date,p_to date)
returns table(visit_id uuid,departure_id uuid,visit_number bigint,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,sector_id smallint,area_name text,manager_name text,inbound_departed_at timestamptz,arrived_at timestamptz,dispatched_at timestamptz,outbound_destination text,status text,transit_minutes integer,stay_minutes integer)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'OPS_DATE_RANGE_INVALID';end if;
 return query
 with inbound as(
  select i.*,row_number() over(partition by i.departure_id order by i.sequence_no) visit_no
  from public.vehicle_trip_legs i where i.destination_type='transfer_station'
 )
 select i.id,i.departure_id,i.visit_no,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,i.departed_at,i.arrived_at,o.departed_at,o.destination_type,
 case when i.arrived_at is null then 'in_transit' when o.id is null then 'at_station' else 'dispatched' end,
 case when i.arrived_at is null then null else floor(extract(epoch from(i.arrived_at-i.departed_at))/60)::int end,
 case when i.arrived_at is null then null else floor(extract(epoch from(coalesce(o.departed_at,now())-i.arrived_at))/60)::int end
 from inbound i join public.garage_departures d on d.id=i.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 left join public.vehicle_trip_legs o on o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station'
 where(i.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to order by i.departed_at desc;
end$$;

create or replace function public.operational_vehicle_kpis(p_from date,p_to date,p_search text default null,p_sector_id smallint default null,p_shift text default null)
returns table(departure_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,sector_id smallint,area_name text,manager_name text,started_at timestamptz,completed_at timestamptz,total_minutes integer,movement_minutes integer,productive_minutes integer,station_minutes integer,maintenance_minutes integer,downtime_minutes integer,other_minutes integer,station_visit_count integer,breakdown_count integer,maintenance_count integer)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'OPS_DATE_RANGE_INVALID';end if;
 if p_shift is not null and p_shift not in('morning','evening','night') then raise exception 'OPS_SHIFT_INVALID';end if;
 return query
 with base as(
  select d.*,v.vehicle_name,v.db_number,s.name area_name,
   floor(extract(epoch from(coalesce(d.returned_at,now())-d.departed_at)/60))::int total_m,
   coalesce(case when d.arrived_at is not null then floor(extract(epoch from(d.arrived_at-d.departed_at)/60))::int else 0 end,0)
    +coalesce((select sum(floor(extract(epoch from(l.arrived_at-l.departed_at)/60))::int) from public.vehicle_trip_legs l where l.departure_id=d.id and l.arrived_at is not null),0)::int movement_m,
   coalesce((select sum(floor(extract(epoch from(coalesce(o.departed_at,now())-i.arrived_at)/60))::int) from public.vehicle_trip_legs i left join public.vehicle_trip_legs o on o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station' where i.departure_id=d.id and i.destination_type='transfer_station' and i.arrived_at is not null),0)::int station_m,
   coalesce((select sum(floor(extract(epoch from(coalesce(c.departed_maintenance_at,c.completed_at,now())-c.arrived_at)/60))::int) from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.arrived_at is not null),0)::int maintenance_m,
   coalesce((select sum(floor(extract(epoch from(coalesce(b.resolved_at,now())-b.created_at)/60))::int) from public.sector_breakdowns b where b.departure_id=d.id),0)::int downtime_m,
   coalesce((select count(*) from public.vehicle_trip_legs i where i.departure_id=d.id and i.destination_type='transfer_station'),0)::int station_visits,
   coalesce((select count(*) from public.sector_breakdowns b where b.departure_id=d.id),0)::int breakdowns,
   coalesce((select count(*) from public.vehicle_maintenance_cases c where c.departure_id=d.id),0)::int maintenances,
   coalesce(case when d.arrived_at is null then 0 else floor(extract(epoch from(coalesce((select min(l.departed_at) from public.vehicle_trip_legs l where l.departure_id=d.id),d.site_departed_at,d.returned_at,now())-d.arrived_at)/60))::int end,0)
   +coalesce((select sum(floor(extract(epoch from(coalesce((select n.departed_at from public.vehicle_trip_legs n where n.departure_id=w.departure_id and n.sequence_no=w.sequence_no+1),d.site_departed_at,d.returned_at,now())-w.arrived_at)/60))::int) from public.vehicle_trip_legs w where w.departure_id=d.id and w.destination_type='work_site' and w.arrived_at is not null),0)::int site_m,
   coalesce((select sum(floor(extract(epoch from(coalesce(b.resolved_at,now())-b.created_at)/60))::int) from public.sector_breakdowns b where b.departure_id=d.id and not exists(select 1 from public.vehicle_maintenance_cases c where c.breakdown_id=b.id)),0)::int short_fault_m
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where(d.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to
   and(p_search is null or trim(p_search)='' or v.db_number ilike '%'||trim(p_search)||'%' or v.vehicle_name ilike '%'||trim(p_search)||'%' or d.driver_name ilike '%'||trim(p_search)||'%' or d.recipient_manager_name ilike '%'||trim(p_search)||'%')
   and(p_sector_id is null or d.sector_id=p_sector_id) and(p_shift is null or d.shift=p_shift)
 ),calc as(select b.*,greatest(0,b.site_m-b.short_fault_m)::int productive_m from base b)
 select c.id,c.vehicle_id,c.vehicle_name,c.db_number,c.driver_name,c.shift,c.sector_id,c.area_name,c.recipient_manager_name,c.departed_at,c.returned_at,c.total_m,c.movement_m,c.productive_m,c.station_m,c.maintenance_m,c.downtime_m,greatest(0,c.total_m-c.movement_m-c.productive_m-c.station_m-c.maintenance_m)::int,c.station_visits,c.breakdowns,c.maintenances
 from calc c order by c.departed_at desc;
end$$;

revoke all on function public.operational_station_visits(date,date),public.operational_vehicle_kpis(date,date,text,smallint,text) from public,anon;
grant execute on function public.operational_station_visits(date,date),public.operational_vehicle_kpis(date,date,text,smallint,text) to authenticated;
