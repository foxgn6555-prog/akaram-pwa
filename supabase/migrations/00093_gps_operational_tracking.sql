-- GPS operational tracking: engine state, geofences, historical routes and garage departure correlation.

alter table public.gps_devices
  add column if not exists engine_status text not null default 'unknown'
  check (engine_status in ('on','off','unknown'));

create table public.gps_geofences (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.gps_providers(id) on delete cascade,
  external_id text,
  name text not null check (length(trim(name)) between 2 and 160),
  source text not null check (source in ('lvn','platform')),
  polygon jsonb not null check (jsonb_typeof(polygon)='array' and jsonb_array_length(polygon)>=3),
  color text not null default '#2563eb',
  is_active boolean not null default true,
  raw_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id,external_id)
);

create table public.gps_vehicle_geofences (
  garage_vehicle_id uuid not null references public.garage_vehicles(id) on delete cascade,
  geofence_id uuid not null references public.gps_geofences(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (garage_vehicle_id,geofence_id)
);

create index gps_geofences_source_idx on public.gps_geofences(source,is_active);
create index gps_history_route_idx on public.gps_device_position_history(device_id,fix_time)
  where latitude is not null and longitude is not null;

alter table public.gps_geofences enable row level security;
alter table public.gps_vehicle_geofences enable row level security;
create policy "gps geofences authorized read" on public.gps_geofences for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']));
create policy "gps vehicle geofences authorized read" on public.gps_vehicle_geofences for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']));

create or replace function app.lvn_engine_status(p_sensors jsonb)
returns text language plpgsql immutable set search_path=pg_catalog as $$
declare s jsonb;n text;v text;
begin
  if jsonb_typeof(p_sensors)<>'array' then return 'unknown';end if;
  for s in select value from jsonb_array_elements(p_sensors)loop
    n:=lower(coalesce(s->>'name',s->>'key',''));
    v:=lower(trim(coalesce(s->>'value',s->>'val','')));
    if n~'(acc|ignition|engine|محرك|تشغيل)'then
      if v~'(^|[^a-z])(on|1|true|yes|running|active)([^a-z]|$)'or v in('تشغيل','يعمل','مفتوح')then return 'on';end if;
      if v~'(^|[^a-z])(off|0|false|no|stopped|inactive)([^a-z]|$)'or v in('متوقف','مطفأ','مغلق')then return 'off';end if;
    end if;
  end loop;
  return 'unknown';
end$$;

update public.gps_devices set engine_status=app.lvn_engine_status(sensors);
create or replace function app.gps_set_engine_status()returns trigger language plpgsql security definer set search_path=public,app as $$begin new.engine_status:=app.lvn_engine_status(new.sensors);return new;end$$;
create trigger gps_devices_engine_status before insert or update of sensors on public.gps_devices for each row execute function app.gps_set_engine_status();

create or replace function app.gps_point_in_polygon(p_lat double precision,p_lng double precision,p_polygon jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare inside boolean:=false;n int;i int;j int;xi float8;yi float8;xj float8;yj float8;
begin
 if p_lat is null or p_lng is null or jsonb_typeof(p_polygon)<>'array'then return false;end if;
 n:=jsonb_array_length(p_polygon);if n<3 then return false;end if;j:=n-1;
 for i in 0..n-1 loop
   xi:=coalesce((p_polygon->i->>'lng')::float8,(p_polygon->i->>1)::float8);
   yi:=coalesce((p_polygon->i->>'lat')::float8,(p_polygon->i->>0)::float8);
   xj:=coalesce((p_polygon->j->>'lng')::float8,(p_polygon->j->>1)::float8);
   yj:=coalesce((p_polygon->j->>'lat')::float8,(p_polygon->j->>0)::float8);
   if ((yi>p_lat)<>(yj>p_lat))and(p_lng<(xj-xi)*(p_lat-yi)/nullif(yj-yi,0)+xi)then inside:=not inside;end if;
   j:=i;
 end loop;return inside;
exception when others then return false;
end$$;

create or replace function public.gps_lvn_devices_v2(
 p_search text default null,p_online text default null,p_operational text default null,
 p_binding text default null,p_freshness text default null,p_owner text default null,p_model text default null,
 p_trip text default null,p_zone text default null,p_limit integer default 50,p_offset integer default 0)
returns table(
 id uuid,external_id text,device_name text,imei text,vin text,plate_number text,registration_number text,
 object_owner text,device_model text,driver_name text,online_status text,engine_status text,operational_status text,
 alarm text,last_seen_at timestamptz,latitude float8,longitude float8,speed float8,speed_unit text,course float8,
 power text,address text,fix_time timestamptz,garage_vehicle_id uuid,garage_vehicle_name text,garage_db_number text,
 active_departure_id uuid,departure_driver text,departed_at timestamptz,trip_stage text,assigned_zone_count bigint,
 inside_assigned_zone boolean,total_count bigint)
language plpgsql stable security definer set search_path=public,app as $$
declare u uuid:=auth.uid();q text:='%'||lower(trim(coalesce(p_search,'')))||'%';
begin
 if u is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 if p_limit not between 1 and 100 or p_offset<0 then raise exception'GPS_PAGE_INVALID';end if;
 if coalesce(p_online,'')not in('','online','offline','unknown')
 or coalesce(p_operational,'')not in('','moving','idle','parked','unknown')
 or coalesce(p_binding,'')not in('','bound','unbound')or coalesce(p_freshness,'')not in('','fresh','stale')
 or coalesce(p_trip,'')not in('','active','inactive')or coalesce(p_zone,'')not in('','inside','outside','unassigned')
 then raise exception'GPS_FILTER_INVALID';end if;
 return query
 with base as(
  select d.*,p.latitude,p.longitude,p.speed,p.speed_unit,p.course,p.power,p.address,p.fix_time,
   b.garage_vehicle_id,v.vehicle_name garage_vehicle_name,v.db_number garage_db_number,
   dep.id active_departure_id,dep.driver_name departure_driver,dep.departed_at,
   case when dep.id is null then 'none' when dep.site_departed_at is not null then 'returning_to_garage'
        when dep.arrived_at is not null then 'at_work' else 'to_work' end trip_stage,
   case when coalesce(p.speed,0)>0 then 'moving' when d.engine_status='on' then 'idle'
        when d.engine_status='off' then 'parked' else 'unknown' end operational_status,
   (select count(*)from public.gps_vehicle_geofences vg where vg.garage_vehicle_id=b.garage_vehicle_id) zone_count,
   exists(select 1 from public.gps_vehicle_geofences vg join public.gps_geofences gf on gf.id=vg.geofence_id and gf.is_active
          where vg.garage_vehicle_id=b.garage_vehicle_id and app.gps_point_in_polygon(p.latitude,p.longitude,gf.polygon)) inside_zone
  from public.gps_devices d left join public.gps_device_positions p on p.device_id=d.id
  left join public.gps_vehicle_bindings b on b.device_id=d.id left join public.garage_vehicles v on v.id=b.garage_vehicle_id
  left join lateral(select x.* from public.garage_departures x where x.vehicle_id=b.garage_vehicle_id and x.returned_at is null order by x.departed_at desc limit 1)dep on true
  where d.is_active)
 select x.id,x.external_id,x.name,x.imei,x.vin,x.plate_number,x.registration_number,x.object_owner,x.device_model,
  x.driver_name,x.online_status,x.engine_status,x.operational_status,x.alarm,x.last_seen_at,x.latitude,x.longitude,x.speed,
  x.speed_unit,x.course,x.power,x.address,x.fix_time,x.garage_vehicle_id,x.garage_vehicle_name,x.garage_db_number,
  x.active_departure_id,x.departure_driver,x.departed_at,x.trip_stage,x.zone_count,x.inside_zone,count(*)over()
 from base x where(coalesce(p_search,'')=''or lower(concat_ws(' ',x.name,x.external_id,x.imei,x.vin,x.plate_number,x.registration_number,x.object_owner,x.device_model,x.driver_name,x.garage_vehicle_name,x.garage_db_number,x.address))like q)
 and(coalesce(p_online,'')=''or x.online_status=p_online)and(coalesce(p_operational,'')=''or x.operational_status=p_operational)
 and(coalesce(p_binding,'')=''or(p_binding='bound'and x.garage_vehicle_id is not null)or(p_binding='unbound'and x.garage_vehicle_id is null))
 and(coalesce(p_freshness,'')=''or(p_freshness='fresh'and x.fix_time>=now()-interval'30 minutes')or(p_freshness='stale'and(x.fix_time is null or x.fix_time<now()-interval'30 minutes')))
 and(coalesce(p_owner,'')=''or x.object_owner=p_owner)and(coalesce(p_model,'')=''or x.device_model=p_model)
 and(coalesce(p_trip,'')=''or(p_trip='active'and x.active_departure_id is not null)or(p_trip='inactive'and x.active_departure_id is null))
 and(coalesce(p_zone,'')=''or(p_zone='inside'and x.zone_count>0 and x.inside_zone)or(p_zone='outside'and x.zone_count>0 and not x.inside_zone)or(p_zone='unassigned'and x.zone_count=0))
 order by(x.active_departure_id is not null)desc,x.online_status='online'desc,x.fix_time desc nulls last,x.name limit p_limit offset p_offset;
end$$;

create or replace function public.gps_lvn_device_detail(p_device_id uuid)returns jsonb language plpgsql stable security definer set search_path=public,app as $$declare r jsonb;begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 select to_jsonb(x)into r from(select d.id,d.external_id,d.name,d.imei,d.sim_number,d.msisdn,d.vin,d.plate_number,d.registration_number,
 d.object_owner,d.device_model,d.group_id,d.driver_name,d.protocol,d.online_status,d.engine_status,
 case when coalesce(p.speed,0)>0 then'moving'when d.engine_status='on'then'idle'when d.engine_status='off'then'parked'else'unknown'end operational_status,
 d.alarm,d.is_active,d.vendor_updated_at,d.last_seen_at,d.sensors,d.services,p.latitude,p.longitude,p.speed,p.speed_unit,p.course,p.altitude,p.power,p.address,p.fix_time,
 b.garage_vehicle_id,v.vehicle_name garage_vehicle_name,v.db_number garage_db_number,v.plate_number garage_plate_number,
 dep.id active_departure_id,dep.driver_name departure_driver,dep.departed_at,
 case when dep.id is null then'none'when dep.site_departed_at is not null then'returning_to_garage'when dep.arrived_at is not null then'at_work'else'to_work'end trip_stage,
 coalesce((select jsonb_agg(jsonb_build_object('id',gf.id,'name',gf.name,'source',gf.source,'color',gf.color,
 'inside',app.gps_point_in_polygon(p.latitude,p.longitude,gf.polygon)))from public.gps_vehicle_geofences vg join public.gps_geofences gf on gf.id=vg.geofence_id and gf.is_active where vg.garage_vehicle_id=b.garage_vehicle_id),'[]')assigned_zones
 from public.gps_devices d left join public.gps_device_positions p on p.device_id=d.id left join public.gps_vehicle_bindings b on b.device_id=d.id
 left join public.garage_vehicles v on v.id=b.garage_vehicle_id
 left join lateral(select q.* from public.garage_departures q where q.vehicle_id=b.garage_vehicle_id and q.returned_at is null order by q.departed_at desc limit 1)dep on true
 where d.id=p_device_id)x;if r is null then raise exception'GPS_DEVICE_NOT_FOUND';end if;return r;end$$;

create or replace function public.gps_lvn_route(p_device_id uuid,p_day date)
returns table(latitude float8,longitude float8,speed float8,course float8,address text,fix_time timestamptz,engine_status text,operational_status text)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 if p_day is null or p_day>(now()at time zone'Asia/Baghdad')::date then raise exception'GPS_ROUTE_DAY_INVALID';end if;
 return query select h.latitude,h.longitude,h.speed,h.course,h.address,h.fix_time,
  app.lvn_engine_status(coalesce(h.raw_data->'sensors','[]'::jsonb)),
  case when coalesce(h.speed,0)>0 then'moving'when app.lvn_engine_status(coalesce(h.raw_data->'sensors','[]'))='on'then'idle'
       when app.lvn_engine_status(coalesce(h.raw_data->'sensors','[]'))='off'then'parked'else'unknown'end
 from public.gps_device_position_history h where h.device_id=p_device_id
 and(h.fix_time at time zone'Asia/Baghdad')::date=p_day and h.latitude is not null and h.longitude is not null
 order by h.fix_time limit 10000;
end$$;

create or replace function public.gps_lvn_trip_history(p_from date,p_to date)
returns table(departure_id uuid,vehicle_id uuid,device_id uuid,db_number text,vehicle_name text,driver_name text,
 departed_at timestamptz,returned_at timestamptz,gps_points bigint,first_fix timestamptz,last_fix timestamptz,gps_coverage text)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>90 then raise exception'GPS_DATE_RANGE_INVALID';end if;
 return query select d.id,d.vehicle_id,b.device_id,v.db_number,v.vehicle_name,d.driver_name,d.departed_at,d.returned_at,
  count(h.id),min(h.fix_time),max(h.fix_time),case when b.device_id is null then'unbound'when count(h.id)=0 then'no_data'
  when min(h.fix_time)>d.departed_at+interval'5 minutes'then'partial'else'covered'end
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id
 left join public.gps_vehicle_bindings b on b.garage_vehicle_id=d.vehicle_id
 left join public.gps_device_position_history h on h.device_id=b.device_id and h.fix_time between d.departed_at and coalesce(d.returned_at,now())
 where(d.departed_at at time zone'Asia/Baghdad')::date between p_from and p_to
 group by d.id,d.vehicle_id,b.device_id,v.db_number,v.vehicle_name,d.driver_name,d.departed_at,d.returned_at order by d.departed_at desc;
end$$;

create or replace function public.gps_lvn_geofences(p_vehicle_id uuid default null)
returns table(id uuid,name text,source text,color text,is_assigned boolean)
language plpgsql stable security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 return query select g.id,g.name,g.source,g.color,exists(select 1 from public.gps_vehicle_geofences vg where vg.geofence_id=g.id and vg.garage_vehicle_id=p_vehicle_id)
 from public.gps_geofences g where g.is_active order by g.source,g.name;
end$$;

create or replace function public.gps_assign_vehicle_geofence(p_vehicle_id uuid,p_geofence_id uuid)
returns void language plpgsql security definer set search_path=public,app as $$
begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 if not exists(select 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null)
 or not exists(select 1 from public.gps_geofences where id=p_geofence_id and is_active)then raise exception'GPS_ZONE_TARGET_INVALID';end if;
 insert into public.gps_vehicle_geofences values(p_vehicle_id,p_geofence_id,auth.uid(),now())on conflict do nothing;
end$$;
create or replace function public.gps_unassign_vehicle_geofence(p_vehicle_id uuid,p_geofence_id uuid)
returns void language plpgsql security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 delete from public.gps_vehicle_geofences where garage_vehicle_id=p_vehicle_id and geofence_id=p_geofence_id;
end$$;

revoke all on function app.lvn_engine_status(jsonb),app.gps_point_in_polygon(float8,float8,jsonb),app.gps_set_engine_status()from public,anon,authenticated;
revoke all on function public.gps_lvn_devices_v2(text,text,text,text,text,text,text,text,text,integer,integer),public.gps_lvn_route(uuid,date),public.gps_lvn_trip_history(date,date),public.gps_lvn_geofences(uuid),public.gps_assign_vehicle_geofence(uuid,uuid),public.gps_unassign_vehicle_geofence(uuid,uuid)from public,anon;
grant execute on function public.gps_lvn_devices_v2(text,text,text,text,text,text,text,text,text,integer,integer),public.gps_lvn_route(uuid,date),public.gps_lvn_trip_history(date,date),public.gps_lvn_geofences(uuid),public.gps_assign_vehicle_geofence(uuid,uuid),public.gps_unassign_vehicle_geofence(uuid,uuid)to authenticated;
