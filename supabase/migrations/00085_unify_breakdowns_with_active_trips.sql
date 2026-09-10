-- 00085 · توحيد بلاغات الأعطال القديمة مع الرحلة التشغيلية المفتوحة
-- العطل القصير يبقى قابلاً للإغلاق في الموقع، لكنه يرتبط بالانطلاقة ويُستبعد من وقت العمل.

alter table public.sector_breakdowns
  add column departure_id uuid references public.garage_departures(id),
  add column vehicle_id uuid references public.garage_vehicles(id);

create index idx_sector_breakdowns_departure on public.sector_breakdowns(departure_id,created_at desc)
  where departure_id is not null;
create unique index uq_sector_breakdowns_open_departure on public.sector_breakdowns(departure_id)
  where departure_id is not null and status='logged' and archived_at is null;

create or replace function public.sector_submit_breakdown(p_db_number text,p_fault_type text,p_notes text default null)
returns public.sector_breakdowns language plpgsql security definer set search_path=public,app as $$
declare
  u uuid:=auth.uid(); mp public.manager_profiles; nm text; r public.sector_breakdowns;
  d public.garage_departures; v public.garage_vehicles; db text:=upper(trim(coalesce(p_db_number,'')));
  latest_destination text;
begin
  if u is null then raise exception 'NO_AUTH'; end if;
  select * into mp from public.manager_profiles where user_id=u;
  if not found or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(db)<1 or length(db)>30 then raise exception 'BREAKDOWN_DB_INVALID'; end if;
  if length(trim(coalesce(p_fault_type,'')))<3 or length(p_fault_type)>300 then raise exception 'BREAKDOWN_FAULT_INVALID'; end if;
  if length(coalesce(p_notes,''))>1000 then raise exception 'BREAKDOWN_NOTES_TOO_LONG'; end if;

  perform pg_advisory_xact_lock(hashtextextended(u::text||':'||lower(db),0));
  select gv.* into v from public.garage_vehicles gv where lower(trim(gv.db_number))=lower(db) and gv.archived_at is null limit 1;
  if found then
    select gd.* into d from public.garage_departures gd
      where gd.vehicle_id=v.id and gd.recipient_manager_id=u and gd.returned_at is null
      order by gd.departed_at desc limit 1 for update;
    if found then
      select l.destination_type into latest_destination from public.vehicle_trip_legs l
        where l.departure_id=d.id order by l.sequence_no desc limit 1;
      if d.arrived_at is null
         or exists(select 1 from public.vehicle_trip_legs l where l.departure_id=d.id and l.arrived_at is null)
         or (latest_destination is not null and latest_destination<>'work_site') then
        raise exception 'BREAKDOWN_ACTIVE_TRIP_NOT_AT_SITE';
      end if;
    end if;
  end if;

  if d.id is null and not exists(
    select 1 from public.sector_vehicles sv
    where lower(trim(sv.db_number))=lower(db) and sv.archived_at is null and sv.sector_id=any(mp.sectors)
  ) then raise exception 'BREAKDOWN_VEHICLE_NOT_ASSIGNED'; end if;

  if exists(select 1 from public.sector_breakdowns b where b.manager_id=u and lower(trim(b.db_number))=lower(db) and b.status='logged' and b.archived_at is null)
    then raise exception 'BREAKDOWN_ALREADY_OPEN'; end if;
  select coalesce(nullif(trim(e.full_name),''),u::text) into nm from public.employees e where e.user_id=u limit 1;
  nm:=coalesce(nm,u::text);
  insert into public.sector_breakdowns(manager_id,manager_name,shift,sectors,db_number,fault_type,notes,status,departure_id,vehicle_id)
  values(u,nm,coalesce(d.shift,mp.shift),case when d.id is null then mp.sectors else array[d.sector_id]::smallint[] end,db,trim(p_fault_type),nullif(trim(coalesce(p_notes,'')),''),'logged',d.id,v.id)
  returning * into r;
  return r;
end$$;

-- مسار الصيانة يعيد استخدام العطل القصير المفتوح المرتبط بالرحلة بدلاً من إنشاء سجل موازٍ.
create or replace function public.sector_send_vehicle_to_maintenance(p_departure_id uuid,p_fault_type text,p_priority text default 'normal',p_notes text default null)
returns public.vehicle_maintenance_cases language plpgsql security definer set search_path=public,app as $$
declare u uuid:=auth.uid();d public.garage_departures;v public.garage_vehicles;b public.sector_breakdowns;c public.vehicle_maintenance_cases;l public.vehicle_trip_legs;nm text;
begin
 if not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;
 if length(trim(coalesce(p_fault_type,'')))<3 or p_priority not in('normal','urgent','critical') then raise exception 'MAINTENANCE_INPUT_INVALID';end if;
 select * into d from public.garage_departures where id=p_departure_id and recipient_manager_id=u and arrived_at is not null and returned_at is null for update;
 if not found or exists(select 1 from public.vehicle_trip_legs where departure_id=d.id and arrived_at is null) then raise exception 'TRIP_NOT_AT_MANAGER_SITE';end if;
 if exists(select 1 from public.vehicle_trip_legs where departure_id=d.id order by sequence_no desc limit 1)
    and (select destination_type from public.vehicle_trip_legs where departure_id=d.id order by sequence_no desc limit 1)<>'work_site'
 then raise exception 'TRIP_NOT_AT_MANAGER_SITE';end if;
 if exists(select 1 from public.vehicle_maintenance_cases where departure_id=d.id and completed_at is null) then raise exception 'MAINTENANCE_CASE_ALREADY_OPEN';end if;
 select * into v from public.garage_vehicles where id=d.vehicle_id;
 select * into b from public.sector_breakdowns where manager_id=u and lower(trim(db_number))=lower(trim(v.db_number)) and status='logged' and archived_at is null order by created_at desc limit 1 for update;
 if found then
   if b.departure_id is not null and b.departure_id<>d.id then raise exception 'BREAKDOWN_ALREADY_OPEN';end if;
   update public.sector_breakdowns set departure_id=d.id,vehicle_id=v.id,fault_type=trim(p_fault_type),notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes) where id=b.id returning * into b;
 else
   select coalesce(nullif(e.full_name,''),au.email,u::text) into nm from auth.users au left join public.employees e on e.user_id=au.id where au.id=u;
   insert into public.sector_breakdowns(manager_id,manager_name,shift,sectors,db_number,fault_type,notes,status,departure_id,vehicle_id)
   values(u,nm,d.shift,array[d.sector_id]::smallint[],v.db_number,trim(p_fault_type),nullif(trim(coalesce(p_notes,'')),''),'logged',d.id,v.id) returning * into b;
 end if;
 insert into public.vehicle_maintenance_cases(departure_id,breakdown_id,vehicle_id,manager_id,fault_type,priority) values(d.id,b.id,v.id,u,trim(p_fault_type),p_priority) returning * into c;
 insert into public.vehicle_trip_legs(departure_id,sequence_no,origin_type,destination_type,departed_by,departure_notes) values(d.id,app.next_trip_leg_sequence(d.id),'work_site','maintenance',u,nullif(trim(coalesce(p_notes,'')),'')) returning * into l;
 insert into public.notifications(user_id,title,body,type,link) select ur.user_id,'آلية في الطريق إلى الصيانة',format('الآلية DB %s تعطلت وغادرت موقع العمل إلى الصيانة',v.db_number),'error','/maintenance/vehicle-cases' from public.user_roles ur where ur.role='maintenance';
 return c;
end$$;

-- وقت التوقف هو كامل فترة العطل المرتبط بالرحلة؛ حالة الصيانة تستخدم السجل نفسه فلا يحدث احتساب مزدوج.
create or replace function public.operational_garage_trips(p_from date,p_to date)
returns table(id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,area_name text,manager_name text,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,total_minutes integer,work_minutes integer,downtime_minutes integer)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 return query select d.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,s.name,d.recipient_manager_name,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,
 case when d.returned_at is null then null else floor(extract(epoch from(d.returned_at-d.departed_at))/60)::int end,
 case when d.arrived_at is null then null else greatest(0,floor(extract(epoch from(coalesce(d.site_departed_at,d.returned_at,now())-d.arrived_at))/60)::int-coalesce((select sum(floor(extract(epoch from(coalesce(b.resolved_at,now())-b.created_at))/60)::int) from public.sector_breakdowns b where b.departure_id=d.id),0))::int end,
 coalesce((select sum(floor(extract(epoch from(coalesce(b.resolved_at,now())-b.created_at))/60)::int) from public.sector_breakdowns b where b.departure_id=d.id),0)::int
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 where(d.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to order by d.departed_at desc;
end$$;

revoke all on function public.sector_submit_breakdown(text,text,text),public.sector_send_vehicle_to_maintenance(uuid,text,text,text),public.operational_garage_trips(date,date) from public,anon;
grant execute on function public.sector_submit_breakdown(text,text,text),public.sector_send_vehicle_to_maintenance(uuid,text,text,text),public.operational_garage_trips(date,date) to authenticated;
