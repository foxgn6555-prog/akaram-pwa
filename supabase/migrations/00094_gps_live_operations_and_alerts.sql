-- GPS round 2: live operations map, geofence management and operational alerts.

create table if not exists public.gps_operational_alerts(
 id uuid primary key default gen_random_uuid(),device_id uuid not null references public.gps_devices(id) on delete cascade,
 garage_vehicle_id uuid references public.garage_vehicles(id) on delete cascade,departure_id uuid references public.garage_departures(id) on delete cascade,
 alert_type text not null check(alert_type in('gps_offline','gps_stale','outside_zone','engine_idle')),
 severity text not null check(severity in('info','warning','critical')),title text not null,details jsonb not null default '{}',
 opened_at timestamptz not null default now(),resolved_at timestamptz,created_at timestamptz not null default now()
);
create unique index if not exists gps_one_open_alert_idx on public.gps_operational_alerts(device_id,alert_type)where resolved_at is null;
create index if not exists gps_alerts_opened_idx on public.gps_operational_alerts(resolved_at,opened_at desc);
alter table public.gps_operational_alerts enable row level security;
create policy "gps alerts authorized read" on public.gps_operational_alerts for select to authenticated using(app.has_role(array['ops_room','it_admin','super_admin']));

create or replace function public.gps_lvn_geofences(p_vehicle_id uuid default null)
returns table(id uuid,name text,source text,color text,is_assigned boolean)
language plpgsql stable security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 return query select g.id,g.name,g.source,g.color,exists(select 1 from public.gps_vehicle_geofences vg where vg.geofence_id=g.id and vg.garage_vehicle_id=p_vehicle_id)
 from public.gps_geofences g where g.is_active order by g.source,g.name;
end$$;
create or replace function public.gps_unassign_vehicle_geofence(p_vehicle_id uuid,p_geofence_id uuid)
returns void language plpgsql security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 delete from public.gps_vehicle_geofences where garage_vehicle_id=p_vehicle_id and geofence_id=p_geofence_id;
end$$;

create or replace function public.gps_lvn_live_map()
returns table(device_id uuid,device_name text,external_id text,latitude float8,longitude float8,speed float8,course float8,address text,fix_time timestamptz,
 online_status text,engine_status text,operational_status text,garage_vehicle_id uuid,vehicle_name text,db_number text,driver_name text,
 departure_id uuid,trip_stage text,assigned_zone_count bigint,inside_assigned_zone boolean)
language plpgsql stable security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 return query select d.id,d.name,d.external_id,p.latitude,p.longitude,p.speed,p.course,p.address,p.fix_time,d.online_status,d.engine_status,
 case when coalesce(p.speed,0)>0 then'moving'when d.engine_status='on'then'idle'when d.engine_status='off'then'parked'else'unknown'end,
 b.garage_vehicle_id,v.vehicle_name,v.db_number,coalesce(dep.driver_name,d.driver_name),dep.id,
 case when dep.id is null then'none'when dep.site_departed_at is not null then'returning_to_garage'when dep.arrived_at is not null then'at_work'else'to_work'end,
 (select count(*)from public.gps_vehicle_geofences vg where vg.garage_vehicle_id=b.garage_vehicle_id),
 exists(select 1 from public.gps_vehicle_geofences vg join public.gps_geofences g on g.id=vg.geofence_id and g.is_active where vg.garage_vehicle_id=b.garage_vehicle_id and app.gps_point_in_polygon(p.latitude,p.longitude,g.polygon))
 from public.gps_devices d join public.gps_device_positions p on p.device_id=d.id left join public.gps_vehicle_bindings b on b.device_id=d.id
 left join public.garage_vehicles v on v.id=b.garage_vehicle_id left join lateral(select x.* from public.garage_departures x where x.vehicle_id=b.garage_vehicle_id and x.returned_at is null order by x.departed_at desc limit 1)dep on true
 where d.is_active and p.latitude is not null and p.longitude is not null order by(dep.id is not null)desc,p.fix_time desc;
end$$;

create or replace function public.gps_lvn_map_geofences()
returns table(id uuid,name text,source text,color text,polygon jsonb)
language plpgsql stable security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 return query select g.id,g.name,g.source,g.color,g.polygon from public.gps_geofences g where g.is_active order by g.name;
end$$;

create or replace function public.gps_lvn_open_alerts(p_limit integer default 100)
returns table(id uuid,device_id uuid,device_name text,garage_vehicle_id uuid,vehicle_name text,db_number text,departure_id uuid,alert_type text,severity text,title text,details jsonb,opened_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 if p_limit not between 1 and 500 then raise exception'GPS_PAGE_INVALID';end if;
 return query select a.id,a.device_id,d.name,a.garage_vehicle_id,v.vehicle_name,v.db_number,a.departure_id,a.alert_type,a.severity,a.title,a.details,a.opened_at
 from public.gps_operational_alerts a join public.gps_devices d on d.id=a.device_id left join public.garage_vehicles v on v.id=a.garage_vehicle_id
 where a.resolved_at is null order by case a.severity when'critical'then 1 when'warning'then 2 else 3 end,a.opened_at desc limit p_limit;
end$$;

create or replace function public.gps_evaluate_operational_alerts()returns void language plpgsql security definer set search_path=public,app as $$begin
 -- Resolve conditions that are no longer present.
 update public.gps_operational_alerts a set resolved_at=now()where a.resolved_at is null and(
  (a.alert_type='gps_offline'and exists(select 1 from public.gps_devices d where d.id=a.device_id and d.online_status='online'))or
  (a.alert_type='gps_stale'and exists(select 1 from public.gps_device_positions p where p.device_id=a.device_id and p.fix_time>=now()-interval'5 minutes'))or
  (a.alert_type='outside_zone'and exists(select 1 from public.gps_device_positions p join public.gps_vehicle_bindings b on b.device_id=p.device_id where p.device_id=a.device_id and exists(select 1 from public.gps_vehicle_geofences vg join public.gps_geofences g on g.id=vg.geofence_id and g.is_active where vg.garage_vehicle_id=b.garage_vehicle_id and app.gps_point_in_polygon(p.latitude,p.longitude,g.polygon)))));
 -- Offline and stale alerts only matter during an active departure.
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)
 select d.id,b.garage_vehicle_id,dep.id,'gps_offline','critical','انقطع اتصال GPS أثناء الانطلاقة',jsonb_build_object('last_seen_at',d.last_seen_at)
 from public.gps_devices d join public.gps_vehicle_bindings b on b.device_id=d.id join public.garage_departures dep on dep.vehicle_id=b.garage_vehicle_id and dep.returned_at is null
 where d.online_status='offline' on conflict(device_id,alert_type)where resolved_at is null do nothing;
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)
 select d.id,b.garage_vehicle_id,dep.id,'gps_stale','warning','توقفت قراءات GPS أثناء الانطلاقة',jsonb_build_object('fix_time',p.fix_time)
 from public.gps_devices d join public.gps_device_positions p on p.device_id=d.id join public.gps_vehicle_bindings b on b.device_id=d.id join public.garage_departures dep on dep.vehicle_id=b.garage_vehicle_id and dep.returned_at is null
 where p.fix_time<now()-interval'5 minutes' on conflict(device_id,alert_type)where resolved_at is null do nothing;
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)
 select d.id,b.garage_vehicle_id,dep.id,'outside_zone','critical','الآلية خارج الزون التشغيلي المخصص',jsonb_build_object('latitude',p.latitude,'longitude',p.longitude,'address',p.address)
 from public.gps_devices d join public.gps_device_positions p on p.device_id=d.id join public.gps_vehicle_bindings b on b.device_id=d.id join public.garage_departures dep on dep.vehicle_id=b.garage_vehicle_id and dep.returned_at is null
 where exists(select 1 from public.gps_vehicle_geofences vg where vg.garage_vehicle_id=b.garage_vehicle_id)
 and not exists(select 1 from public.gps_vehicle_geofences vg join public.gps_geofences g on g.id=vg.geofence_id and g.is_active where vg.garage_vehicle_id=b.garage_vehicle_id and app.gps_point_in_polygon(p.latitude,p.longitude,g.polygon))
 on conflict(device_id,alert_type)where resolved_at is null do nothing;
end$$;

revoke all on function public.gps_lvn_geofences(uuid),public.gps_unassign_vehicle_geofence(uuid,uuid),public.gps_lvn_live_map(),public.gps_lvn_map_geofences(),public.gps_lvn_open_alerts(integer)from public,anon;
grant execute on function public.gps_lvn_geofences(uuid),public.gps_unassign_vehicle_geofence(uuid,uuid),public.gps_lvn_live_map(),public.gps_lvn_map_geofences(),public.gps_lvn_open_alerts(integer)to authenticated;
revoke all on function public.gps_evaluate_operational_alerts()from public,anon,authenticated;
grant execute on function public.gps_evaluate_operational_alerts()to service_role;
