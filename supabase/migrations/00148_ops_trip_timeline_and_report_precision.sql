-- 00148 · الجولة 2 من تدقيق الانطلاقيات: دقة تقارير غرفة العمليات + تسلسل الرحلة الكامل
-- مبدأ ثابت: البصمة (HR) والانطلاقية (العمليات) مساران منفصلان تماماً؛ هذا الملف يخص الانطلاقية فقط.
--
-- ما يعالجه:
--  1) الملخص المركب لم يكن يُظهر «بدء العمل الفعلي» (وصول الموقع) ولا «مغادرة الموقع» ولا حالة الرحلة الآنية.
--  2) لا يوجد تسلسل موحّد لانطلاقية واحدة (كراج → موقع → محطة/وزن → عطل → صيانة → موقع → كراج) — كان متاحاً لحالة الصيانة فقط.
--  3) تبويب «أوزان المحطة» كان يقبل يوماً واحداً فقط فلا يستجيب لنطاق التاريخ المختار في الصفحة.
--  4) تقرير الحركة بلا تحقق من نطاق التاريخ (يسمح بمسح جدول كامل).
--  5) تفاصيل التنبيهات الحية كانت تطبع رموز الأماكن الإنجليزية (work_site/transfer_station).

-- ─── مسمّيات الأماكن بالعربية (تُستعمل في التقارير والتنبيهات) ───
create or replace function app.trip_place_label(p_type text) returns text
language sql immutable as $$
  select case p_type
    when 'garage' then 'الكراج المركزي'
    when 'work_site' then 'موقع العمل'
    when 'transfer_station' then 'المحطة التحويلية'
    when 'maintenance' then 'الصيانة'
    else coalesce(p_type, '—') end
$$;

-- ─── حالة الرحلة الآنية من بياناتها الفعلية ───
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
  end if;
  if d.site_departed_at is not null then return 'to_garage'; end if;
  if exists (select 1 from public.sector_breakdowns b where b.departure_id = p_departure_id and b.status = 'logged' and b.archived_at is null) then return 'breakdown'; end if;
  return 'at_site';
end$$;
revoke all on function app.trip_status(uuid) from public,anon;

-- ─── 1) الملخص المركب: بدء العمل الفعلي + مغادرة الموقع + الحالة ───
drop function if exists public.operational_vehicle_kpis(date,date,text,smallint,text);
create function public.operational_vehicle_kpis(p_from date,p_to date,p_search text default null,p_sector_id smallint default null,p_shift text default null)
returns table(departure_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,driver_employee_id uuid,shift text,sector_id smallint,area_name text,manager_name text,
              started_at timestamptz,work_started_at timestamptz,site_departed_at timestamptz,completed_at timestamptz,trip_status text,
              total_minutes integer,movement_minutes integer,productive_minutes integer,station_minutes integer,maintenance_minutes integer,downtime_minutes integer,other_minutes integer,
              station_visit_count integer,breakdown_count integer,maintenance_count integer)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'OPS_DATE_RANGE_INVALID';end if;
 if p_shift is not null and p_shift not in('morning','evening','night') then raise exception 'OPS_SHIFT_INVALID';end if;
 return query
 select d.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.driver_employee_id,d.shift,d.sector_id,s.name,d.recipient_manager_name,
        d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,app.trip_status(d.id),
        m.total_minutes,m.movement_minutes,m.productive_minutes,m.station_minutes,m.maintenance_minutes,m.downtime_minutes,m.other_minutes,m.station_visit_count,m.breakdown_count,m.maintenance_count
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 cross join lateral app.trip_minutes(d.id) m
 where(d.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to
  and(p_search is null or trim(p_search)='' or v.db_number ilike '%'||trim(p_search)||'%' or v.vehicle_name ilike '%'||trim(p_search)||'%' or d.driver_name ilike '%'||trim(p_search)||'%' or d.recipient_manager_name ilike '%'||trim(p_search)||'%')
  and(p_sector_id is null or d.sector_id=p_sector_id) and(p_shift is null or d.shift=p_shift)
 order by d.departed_at desc;
end$$;
revoke all on function public.operational_vehicle_kpis(date,date,text,smallint,text) from public,anon;
grant execute on function public.operational_vehicle_kpis(date,date,text,smallint,text) to authenticated;

-- ─── 2) تسلسل الرحلة الكامل لانطلاقية واحدة ───
create or replace function public.operational_departure_timeline(p_departure_id uuid)
returns table(event_key text,event_type text,title text,details text,happened_at timestamptz,minutes_since_prev integer,sequence_no integer)
language plpgsql stable security definer set search_path=public,app as $$
declare d public.garage_departures; v public.garage_vehicles;
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 select * into d from public.garage_departures where id=p_departure_id;
 if not found then raise exception 'OPS_DEPARTURE_NOT_FOUND';end if;
 select * into v from public.garage_vehicles where id=d.vehicle_id;
 return query
 with ev as(
  select 'departure:garage'::text k,'departure'::text t,'انطلقت من الكراج المركزي'::text ttl,
         format('السائق %s · %s · %s',d.driver_name,case d.shift when 'morning' then 'صباحي' when 'evening' then 'مسائي' else 'ليلي' end,coalesce((select s.name from public.sectors s where s.id=d.sector_id),''))::text det,
         d.departed_at at,0::int seq
  union all
  select 'departure:site-arrived','work_start','وصلت موقع العمل — بدء العمل الفعلي',coalesce('أكد الوصول: '||d.recipient_manager_name,'تأكيد الوصول'),d.arrived_at,1 where d.arrived_at is not null
  union all
  select 'leg:'||l.id::text||':departed','movement','غادرت '||app.trip_place_label(l.origin_type)||' إلى '||app.trip_place_label(l.destination_type),l.departure_notes,l.departed_at,100+l.sequence_no*10
  from public.vehicle_trip_legs l where l.departure_id=d.id
  union all
  select 'leg:'||l.id::text||':arrived','movement','وصلت إلى '||app.trip_place_label(l.destination_type),l.arrival_notes,l.arrived_at,100+l.sequence_no*10+1
  from public.vehicle_trip_legs l where l.departure_id=d.id and l.arrived_at is not null
  union all
  select 'weighing:'||st.id::text,'weighing',case when st.violation then 'وزن في المحطة — نقص عن الحد الأدنى' else 'وزن في المحطة' end,
         format('%s طن · %s%s%s',st.weight_tons,case st.destination when 'press' then 'المكبس' when 'transfer_station' then 'المحطة التحويلية' else '—' end,
                coalesce(' · '||k.label,''),case when st.violation then format(' · النقص %s طن عن الحد %s',st.deficit_tons,k.min_tons) else '' end),
         st.weighed_at,100+l.sequence_no*10+2
  from public.ts_visit_weighing_steps st join public.vehicle_trip_legs l on l.id=st.visit_leg_id left join public.ts_vehicle_kinds k on k.kind=st.vehicle_kind where l.departure_id=d.id
  union all
  select 'weighing:'||st.id::text||':done','weighing','اكتملت عملية المحطة',null,st.completed_at,100+l.sequence_no*10+3
  from public.ts_visit_weighing_steps st join public.vehicle_trip_legs l on l.id=st.visit_leg_id where l.departure_id=d.id and st.completed_at is not null
  union all
  select 'breakdown:'||b.id::text,'breakdown','بلاغ عطل في موقع العمل',b.fault_type||coalesce(' · '||b.notes,''),b.created_at,500
  from public.sector_breakdowns b where b.departure_id=d.id
  union all
  select 'breakdown:'||b.id::text||':resolved','breakdown','حُسم العطل في الموقع',b.fault_type,b.resolved_at,501
  from public.sector_breakdowns b where b.departure_id=d.id and b.resolved_at is not null
  union all
  select 'case:'||c.id::text||':reported','maintenance','إحالة إلى الصيانة',c.fault_type||' · أولوية '||case c.priority when 'critical' then 'حرجة' when 'urgent' then 'عاجلة' else 'عادية' end,c.reported_at,600
  from public.vehicle_maintenance_cases c where c.departure_id=d.id
  union all
  select 'case:'||c.id::text||':arrived','maintenance','استلمتها الصيانة',c.diagnosis,c.arrived_at,601
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.arrived_at is not null
  union all
  select 'case:'||u.id::text||':update','maintenance','تحديث الصيانة: '||case u.status when 'diagnosing' then 'قيد التشخيص' when 'waiting_parts' then 'بانتظار القطع' when 'in_repair' then 'قيد الإصلاح' when 'paused' then 'متوقفة مؤقتاً' when 'ready' then 'جاهزة' when 'at_maintenance' then 'داخل الصيانة' else u.status end||format(' (%s%%)',u.progress),
         coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason),u.created_at,700
  from public.vehicle_maintenance_updates u join public.vehicle_maintenance_cases c on c.id=u.case_id where c.departure_id=d.id
  union all
  select 'case:'||c.id::text||':ready','maintenance','الآلية جاهزة للمغادرة',null,c.ready_at,800
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.ready_at is not null
  union all
  select 'case:'||c.id::text||':completed','maintenance',case c.status when 'returned_to_work' then 'أُغلقت حالة الصيانة — عادت إلى العمل' when 'closed_at_garage' then 'أُغلقت حالة الصيانة — وصلت الكراج' else 'أُغلقت حالة الصيانة' end,c.work_notes,c.completed_at,801
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.completed_at is not null
  union all
  select 'departure:site-departed','departure','غادرت موقع العمل باتجاه الكراج',null,d.site_departed_at,900 where d.site_departed_at is not null
  union all
  select 'departure:returned','departure','عادت إلى الكراج المركزي — انتهاء الانطلاقية',d.notes,d.returned_at,999 where d.returned_at is not null
 ), ordered as(
  select e.*, row_number() over(order by e.at,e.seq) rn, lag(e.at) over(order by e.at,e.seq) prev_at from ev e where e.at is not null
 )
 select o.k,o.t,o.ttl,o.det,o.at,case when o.prev_at is null then 0 else floor(extract(epoch from(o.at-o.prev_at))/60)::int end,o.rn::int from ordered o order by o.rn;
end$$;
revoke all on function public.operational_departure_timeline(uuid) from public,anon;
grant execute on function public.operational_departure_timeline(uuid) to authenticated;

-- ─── 3) أوزان المحطة ضمن نطاق تاريخ ───
create or replace function public.ops_station_workflow_range(p_from date,p_to date,p_search text default null)
returns table (
  visit_id uuid, departure_id uuid, trip_day date, db_number text, vehicle_name text,
  driver_name text, shift text, area_name text, manager_name text,
  sector_id smallint, parent_sector text,
  inbound_departed_at timestamptz, arrived_at timestamptz, weighed_at timestamptz,
  completed_at timestamptz, dispatched_at timestamptz,
  weight_tons numeric, destination text, destination_label text,
  vehicle_kind text, kind_label text, min_tons numeric,
  violation boolean, deficit_tons numeric,
  transit_minutes integer, weigh_wait_minutes integer, process_minutes integer, stay_minutes integer
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','transfer_station','super_admin']) then raise exception 'OPS_WORKFLOW_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'OPS_DATE_RANGE_INVALID'; end if;
  return query
  select i.id, i.departure_id, (i.departed_at at time zone 'Asia/Baghdad')::date,
         gv.db_number, gv.vehicle_name, d.driver_name, d.shift, s.name, d.recipient_manager_name,
         d.sector_id, s.parent_sector,
         i.departed_at, i.arrived_at, st.weighed_at, st.completed_at, o.departed_at,
         st.weight_tons, st.destination,
         case st.destination when 'press' then 'المكبس' when 'transfer_station' then 'المحطة التحويلية' end,
         st.vehicle_kind, k.label, k.min_tons,
         coalesce(st.violation, false), st.deficit_tons,
         case when i.arrived_at is null then null else floor(extract(epoch from (i.arrived_at - i.departed_at)) / 60)::int end,
         case when st.weighed_at is null or i.arrived_at is null or st.weighed_at < i.arrived_at then null
              else floor(extract(epoch from (st.weighed_at - i.arrived_at)) / 60)::int end,
         case when st.completed_at is null or i.arrived_at is null then null
              else floor(extract(epoch from (st.completed_at - i.arrived_at)) / 60)::int end,
         case when i.arrived_at is null then null else floor(extract(epoch from (coalesce(o.departed_at, now()) - i.arrived_at)) / 60)::int end
  from public.vehicle_trip_legs i
  join public.garage_departures d on d.id = i.departure_id
  join public.garage_vehicles gv on gv.id = d.vehicle_id
  join public.sectors s on s.id = d.sector_id
  left join public.ts_visit_weighing_steps st on st.visit_leg_id = i.id
  left join public.ts_vehicle_kinds k on k.kind = st.vehicle_kind
  left join lateral (
    select oo.departed_at from public.vehicle_trip_legs oo
    where oo.departure_id = i.departure_id and oo.sequence_no = i.sequence_no + 1 and oo.origin_type = 'transfer_station'
    order by oo.id limit 1
  ) o on true
  where i.destination_type = 'transfer_station'
    and (i.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to
    and (p_search is null or trim(p_search) = ''
         or gv.db_number ilike '%' || trim(p_search) || '%'
         or gv.vehicle_name ilike '%' || trim(p_search) || '%'
         or d.driver_name ilike '%' || trim(p_search) || '%')
  order by i.departed_at desc
  limit 2000;
end$$;
revoke all on function public.ops_station_workflow_range(date,date,text) from public, anon;
grant execute on function public.ops_station_workflow_range(date,date,text) to authenticated;

-- ─── 4) تقرير الحركة: تحقق النطاق + مسمّيات عربية جاهزة ───
drop function if exists public.operational_vehicle_movements(date,date);
create function public.operational_vehicle_movements(p_from date,p_to date)
returns table(leg_id uuid,departure_id uuid,vehicle_id uuid,db_number text,vehicle_name text,driver_name text,shift text,sector_id smallint,area_name text,manager_name text,origin_type text,destination_type text,origin_label text,destination_label text,departed_at timestamptz,arrived_at timestamptz,duration_minutes integer,departure_notes text,arrival_notes text)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'OPS_DATE_RANGE_INVALID';end if;
 return query
 select l.id,d.id,d.vehicle_id,v.db_number,v.vehicle_name,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,l.origin_type,l.destination_type,
        app.trip_place_label(l.origin_type),app.trip_place_label(l.destination_type),l.departed_at,l.arrived_at,
        case when l.arrived_at is null then null else floor(extract(epoch from(l.arrived_at-l.departed_at))/60)::int end,l.departure_notes,l.arrival_notes
 from public.vehicle_trip_legs l join public.garage_departures d on d.id=l.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 where(l.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to order by l.departed_at desc;
end$$;
revoke all on function public.operational_vehicle_movements(date,date) from public,anon;
grant execute on function public.operational_vehicle_movements(date,date) to authenticated;

-- ─── 5) تنبيهات حية بتفاصيل عربية ───
create or replace function public.operational_live_alerts(p_sector_id smallint default null,p_shift text default null,p_severity text default null)
returns table(alert_id text,alert_type text,severity text,departure_id uuid,case_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,sector_id smallint,area_name text,manager_name text,title text,details text,started_at timestamptz,threshold_minutes integer,elapsed_minutes integer,action_link text)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_shift is not null and p_shift not in('morning','evening','night') then raise exception 'OPS_SHIFT_INVALID';end if;
 if p_severity is not null and p_severity not in('warning','critical') then raise exception 'OPS_ALERT_SEVERITY_INVALID';end if;
 return query
 with raw as(
  select 'garage_arrival_delay'::text alert_type,case when now()-d.departed_at>interval '120 minutes' then 'critical' else 'warning' end severity,d.id departure_id,null::uuid case_id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name area_name,d.recipient_manager_name manager_name,
   'تأخر الوصول من الكراج'::text title,format('لم يؤكد مسؤول القسم وصول الآلية DB %s إلى موقع العمل',v.db_number) details,d.departed_at started_at,60 threshold_minutes,floor(extract(epoch from(now()-d.departed_at))/60)::int elapsed_minutes,'/manager/vehicle-trips'::text action_link
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where d.arrived_at is null and d.returned_at is null and now()-d.departed_at>interval '60 minutes'
  union all
  select 'leg_transit_delay',case when now()-l.departed_at>interval '90 minutes' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'تأخر انتقال الآلية',format('انتقال DB %s من %s إلى %s ما زال دون تأكيد وصول',v.db_number,app.trip_place_label(l.origin_type),app.trip_place_label(l.destination_type)),l.departed_at,45,floor(extract(epoch from(now()-l.departed_at))/60)::int,
   case l.destination_type when 'transfer_station' then '/transfer-station/vehicle-movements' when 'maintenance' then '/maintenance/vehicle-cases' else '/manager/vehicle-trips' end
  from public.vehicle_trip_legs l join public.garage_departures d on d.id=l.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where l.arrived_at is null and d.returned_at is null and now()-l.departed_at>interval '45 minutes'
  union all
  select 'station_stay_delay',case when now()-i.arrived_at>interval '180 minutes' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'طول البقاء في المحطة',format('الآلية DB %s داخل المحطة ولم تسجل مغادرتها',v.db_number),i.arrived_at,60,floor(extract(epoch from(now()-i.arrived_at))/60)::int,'/transfer-station/vehicle-movements'
  from public.vehicle_trip_legs i join public.garage_departures d on d.id=i.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where i.destination_type='transfer_station' and i.arrived_at is not null and d.returned_at is null and not exists(select 1 from public.vehicle_trip_legs o where o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station') and now()-i.arrived_at>interval '60 minutes'
  union all
  select 'maintenance_overdue','critical',d.id,c.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'تجاوز موعد إنجاز الصيانة',format('تجاوزت حالة DB %s الموعد المتوقع وما زالت مفتوحة بنسبة %s%%',v.db_number,c.progress),c.expected_completion_at,0,floor(extract(epoch from(now()-c.expected_completion_at))/60)::int,'/maintenance/vehicle-cases'
  from public.vehicle_maintenance_cases c join public.garage_departures d on d.id=c.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where c.completed_at is null and c.expected_completion_at is not null and c.expected_completion_at<now()
  union all
  select 'maintenance_no_update',case when now()-coalesce(u.last_update,c.arrived_at,c.reported_at)>interval '48 hours' then 'critical' else 'warning' end,d.id,c.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'الصيانة دون تحديث',format('حالة صيانة DB %s لم تسجل تحديثاً حديثاً',v.db_number),coalesce(u.last_update,c.arrived_at,c.reported_at),1440,floor(extract(epoch from(now()-coalesce(u.last_update,c.arrived_at,c.reported_at)))/60)::int,'/maintenance/vehicle-cases'
  from public.vehicle_maintenance_cases c join public.garage_departures d on d.id=c.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  left join lateral(select max(mu.created_at) last_update from public.vehicle_maintenance_updates mu where mu.case_id=c.id)u on true
  where c.completed_at is null and c.arrived_at is not null and now()-coalesce(u.last_update,c.arrived_at,c.reported_at)>interval '24 hours'
  union all
  select 'trip_stale','critical',d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'رحلة مفتوحة دون تحديث',format('الرحلة المفتوحة للآلية DB %s لم تشهد أي حركة حديثة',v.db_number),a.last_activity,720,floor(extract(epoch from(now()-a.last_activity))/60)::int,'/ops-room/operations-data'
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  cross join lateral(select greatest(d.departed_at,coalesce(d.arrived_at,d.departed_at),coalesce(d.site_departed_at,d.departed_at),coalesce((select max(greatest(l.departed_at,coalesce(l.arrived_at,l.departed_at))) from public.vehicle_trip_legs l where l.departure_id=d.id),d.departed_at))last_activity)a
  where d.returned_at is null and now()-a.last_activity>interval '12 hours'
  union all
  select 'breakdown_stale',case when now()-b.created_at>interval '8 hours' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'عطل مفتوح دون حسم',format('العطل المفتوح للآلية DB %s: %s',v.db_number,b.fault_type),b.created_at,240,floor(extract(epoch from(now()-b.created_at))/60)::int,'/manager/breakdown'
  from public.sector_breakdowns b join public.garage_departures d on d.id=b.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where b.status='logged' and b.archived_at is null and d.returned_at is null and now()-b.created_at>interval '4 hours' and not exists(select 1 from public.vehicle_maintenance_cases c where c.breakdown_id=b.id and c.completed_at is null)
 )
 select md5(r.alert_type||':'||coalesce(r.departure_id::text,'')||':'||coalesce(r.case_id::text,'')),r.alert_type,r.severity,r.departure_id,r.case_id,r.vehicle_id,r.vehicle_name,r.db_number,r.driver_name,r.shift,r.sector_id,r.area_name,r.manager_name,r.title,r.details,r.started_at,r.threshold_minutes,r.elapsed_minutes,r.action_link
 from raw r where(p_sector_id is null or r.sector_id=p_sector_id)and(p_shift is null or r.shift=p_shift)and(p_severity is null or r.severity=p_severity)
 order by case r.severity when 'critical' then 0 else 1 end,r.elapsed_minutes desc;
end$$;
revoke all on function public.operational_live_alerts(smallint,text,text) from public,anon;
grant execute on function public.operational_live_alerts(smallint,text,text) to authenticated;
