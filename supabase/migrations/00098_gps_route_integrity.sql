-- 00098 · اكتمال مسارات LVN وربطها زمنياً بالانطلاقيات
-- يحفظ سجل استيراد التاريخ، يقارن المستلم بالمخزن، ويحسب الفجوات والتغطية دون افتراض أن اليوم = UTC.

create table public.gps_history_import_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.gps_providers(id) on delete cascade,
  device_id uuid not null references public.gps_devices(id) on delete cascade,
  departure_id uuid references public.garage_departures(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  range_from timestamptz not null,
  range_to timestamptz not null,
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  chunks_requested integer not null default 0 check (chunks_requested >= 0),
  chunks_completed integer not null default 0 check (chunks_completed >= 0),
  source_points integer not null default 0 check (source_points >= 0),
  valid_points integer not null default 0 check (valid_points >= 0),
  inserted_points integer not null default 0 check (inserted_points >= 0),
  stored_points integer not null default 0 check (stored_points >= 0),
  duplicate_points integer not null default 0 check (duplicate_points >= 0),
  rejected_points integer not null default 0 check (rejected_points >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check (range_to > range_from),
  check (range_to - range_from <= interval '72 hours'),
  check (chunks_completed <= chunks_requested),
  check ((status='running' and finished_at is null) or (status<>'running' and finished_at is not null))
);
create index gps_history_import_device_idx on public.gps_history_import_runs(device_id,range_from desc);
create index gps_history_import_departure_idx on public.gps_history_import_runs(departure_id,started_at desc) where departure_id is not null;
create unique index gps_history_one_running_idx on public.gps_history_import_runs(device_id) where status='running';
alter table public.gps_history_import_runs enable row level security;
create policy "gps history imports authorized read" on public.gps_history_import_runs for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']));

create or replace function public.gps_history_import_target(
  p_device_id uuid default null,p_departure_id uuid default null,p_day date default null)
returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare r jsonb;v_today date:=(now() at time zone 'Asia/Baghdad')::date;
begin
 if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then raise exception 'GPS_FORBIDDEN';end if;
 if (p_departure_id is not null)::int + (p_day is not null)::int <> 1 then raise exception 'GPS_HISTORY_TARGET_INVALID';end if;
 if p_departure_id is not null then
  select jsonb_build_object(
    'device_id',b.device_id,'external_id',gd.external_id,'departure_id',d.id,
    'range_from',d.departed_at,'range_to',least(coalesce(d.returned_at,now()),d.departed_at+interval '72 hours'),
    'range_truncated',coalesce(d.returned_at,now())>d.departed_at+interval '72 hours') into r
  from public.garage_departures d
  join public.gps_vehicle_bindings b on b.garage_vehicle_id=d.vehicle_id
  join public.gps_devices gd on gd.id=b.device_id and gd.is_active
  where d.id=p_departure_id;
 else
  if p_device_id is null or p_day is null or p_day>v_today then raise exception 'GPS_ROUTE_DAY_INVALID';end if;
  select jsonb_build_object(
    'device_id',gd.id,'external_id',gd.external_id,'departure_id',null,
    'range_from',(p_day::timestamp at time zone 'Asia/Baghdad'),
    'range_to',least(((p_day+1)::timestamp at time zone 'Asia/Baghdad'),now()),
    'range_truncated',false) into r
  from public.gps_devices gd where gd.id=p_device_id and gd.is_active;
 end if;
 if r is null then raise exception 'GPS_HISTORY_TARGET_NOT_FOUND';end if;
 return r;
end$$;

create or replace function public.lvn_apply_history_points(
 p_provider_id uuid,p_device_id uuid,p_points jsonb,p_source_points integer,
 p_range_from timestamptz,p_range_to timestamptz)
returns table(valid_count integer,inserted_count integer,stored_count integer,rejected_count integer)
language plpgsql security definer set search_path=public,app as $$
declare inserted integer:=0;valid integer:=0;stored integer:=0;source_count integer:=greatest(coalesce(p_source_points,0),0);
begin
 if auth.role()<>'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED';end if;
 if p_range_from is null or p_range_to is null or p_range_to<=p_range_from or p_range_to-p_range_from>interval '72 hours' then raise exception 'GPS_HISTORY_RANGE_INVALID';end if;
 if jsonb_typeof(p_points)<>'array' then raise exception 'GPS_HISTORY_POINTS_INVALID';end if;
 if not exists(select 1 from public.gps_devices where id=p_device_id and provider_id=p_provider_id) then raise exception 'GPS_DEVICE_NOT_FOUND';end if;
 with normalized as(
  select distinct on(fix_time)
   fix_time,latitude,longitude,speed,course,altitude,address,raw_data
  from(
   select nullif(x->>'fix_time','')::timestamptz fix_time,
    app.lvn_num(coalesce(x->>'latitude',x->>'lat')) latitude,
    app.lvn_num(coalesce(x->>'longitude',x->>'lng')) longitude,
    app.lvn_num(x->>'speed') speed,app.lvn_num(x->>'course') course,
    app.lvn_num(x->>'altitude') altitude,nullif(x->>'address','') address,x raw_data
   from jsonb_array_elements(p_points)x
  )q where fix_time>=p_range_from and fix_time<=p_range_to
   and latitude between -90 and 90 and longitude between -180 and 180
  order by fix_time
 ),ins as(
  insert into public.gps_device_position_history(device_id,latitude,longitude,speed,speed_unit,course,altitude,address,fix_time,raw_data)
  select p_device_id,n.latitude,n.longitude,n.speed,null,n.course,n.altitude,n.address,n.fix_time,n.raw_data from normalized n
  on conflict(device_id,fix_time)do nothing returning 1
 )select (select count(*)from normalized),(select count(*)from ins) into valid,inserted;
 select count(*) into stored from public.gps_device_position_history h where h.device_id=p_device_id and h.fix_time between p_range_from and p_range_to and h.latitude is not null and h.longitude is not null;
 return query select valid,inserted,stored,greatest(source_count-valid,0);
end$$;

create or replace function public.gps_lvn_trip_integrity(p_from date,p_to date)
returns table(
 departure_id uuid,vehicle_id uuid,device_id uuid,db_number text,vehicle_name text,driver_name text,
 departed_at timestamptz,returned_at timestamptz,gps_points bigint,first_fix timestamptz,last_fix timestamptz,
 covered_seconds bigint,total_seconds bigint,coverage_percent numeric,gap_count bigint,largest_gap_seconds bigint,
 gps_coverage text,last_import_status text,source_points integer,stored_points integer,imported_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>90 or p_to>(now()at time zone'Asia/Baghdad')::date then raise exception'GPS_DATE_RANGE_INVALID';end if;
 return query
 with departures as(
  select d.*,b.device_id,v.db_number,v.vehicle_name,coalesce(d.returned_at,now()) range_end
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id
  left join public.gps_vehicle_bindings b on b.garage_vehicle_id=d.vehicle_id
  where(d.departed_at at time zone'Asia/Baghdad')::date between p_from and p_to
 ),points as(
  select d.id departure_id,h.fix_time,lag(h.fix_time)over(partition by d.id order by h.fix_time)previous_fix
  from departures d join public.gps_device_position_history h on h.device_id=d.device_id and h.fix_time between d.departed_at and d.range_end
 ),stats as(
  select p.departure_id,count(*) gps_points,min(fix_time)first_fix,max(fix_time)last_fix,
   coalesce(sum(least(extract(epoch from(fix_time-previous_fix)),300))filter(where previous_fix is not null),0)::bigint covered_seconds,
   count(*)filter(where previous_fix is not null and fix_time-previous_fix>interval'10 minutes') gap_count,
   coalesce(max(extract(epoch from(fix_time-previous_fix)))filter(where previous_fix is not null),0)::bigint largest_gap
  from points p group by p.departure_id
 )
 select d.id,d.vehicle_id,d.device_id,d.db_number,d.vehicle_name,d.driver_name,d.departed_at,d.returned_at,
  coalesce(s.gps_points,0),s.first_fix,s.last_fix,coalesce(s.covered_seconds,0),
  greatest(extract(epoch from(d.range_end-d.departed_at))::bigint,1),
  least(100,round(100*coalesce(s.covered_seconds,0)/greatest(extract(epoch from(d.range_end-d.departed_at)),1),1)),
  coalesce(s.gap_count,0),coalesce(s.largest_gap,0),
  case when d.device_id is null then'unbound' when coalesce(s.gps_points,0)=0 then'no_data'
   when s.first_fix>d.departed_at+interval'5 minutes' or s.last_fix<d.range_end-interval'5 minutes' or coalesce(s.gap_count,0)>0 then'partial'
   else'covered'end,
  imp.status,imp.source_points,imp.stored_points,imp.finished_at
 from departures d left join stats s on s.departure_id=d.id
 left join lateral(select r.status,r.source_points,r.stored_points,r.finished_at from public.gps_history_import_runs r where r.departure_id=d.id order by r.started_at desc limit 1)imp on true
 order by d.departed_at desc;
end$$;

create or replace function public.gps_lvn_route_window(p_device_id uuid,p_from timestamptz,p_to timestamptz,p_limit integer default 5000,p_offset integer default 0)
returns table(latitude float8,longitude float8,speed float8,course float8,address text,fix_time timestamptz,engine_status text,operational_status text,total_count bigint)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval'72 hours' or p_to>now()+interval'1 minute' then raise exception'GPS_HISTORY_RANGE_INVALID';end if;
 if p_limit not between 1 and 5000 or p_offset<0 then raise exception'GPS_PAGE_INVALID';end if;
 return query select h.latitude,h.longitude,h.speed,h.course,h.address,h.fix_time,
  app.lvn_engine_status(coalesce(h.raw_data->'sensors',h.raw_data->'sensors_data','[]'::jsonb)),
  case when coalesce(h.speed,0)>0 then'moving'when app.lvn_engine_status(coalesce(h.raw_data->'sensors',h.raw_data->'sensors_data','[]'))='on'then'idle'
       when app.lvn_engine_status(coalesce(h.raw_data->'sensors',h.raw_data->'sensors_data','[]'))='off'then'parked'else'unknown'end,
  count(*)over()
 from public.gps_device_position_history h where h.device_id=p_device_id and h.fix_time between p_from and p_to
 and h.latitude is not null and h.longitude is not null order by h.fix_time limit p_limit offset p_offset;
end$$;

revoke all on table public.gps_history_import_runs from anon,authenticated;
grant select on table public.gps_history_import_runs to authenticated;
revoke all on function public.gps_history_import_target(uuid,uuid,date),public.gps_lvn_trip_integrity(date,date),public.gps_lvn_route_window(uuid,timestamptz,timestamptz,integer,integer)from public,anon;
grant execute on function public.gps_history_import_target(uuid,uuid,date),public.gps_lvn_trip_integrity(date,date),public.gps_lvn_route_window(uuid,timestamptz,timestamptz,integer,integer)to authenticated;
revoke all on function public.lvn_apply_history_points(uuid,uuid,jsonb,integer,timestamptz,timestamptz)from public,anon,authenticated;
grant execute on function public.lvn_apply_history_points(uuid,uuid,jsonb,integer,timestamptz,timestamptz)to service_role;
