-- 00253 · بلاغ العطل في أي مرحلة من الرحلة (قرار الإدارة — خيار ب)
--   كان البلاغ مرفوضاً (BREAKDOWN_ACTIVE_TRIP_NOT_AT_SITE) ما لم تكن الآلية في موقع العمل؛ الآن يُقبل في الطريق إلى الموقع/المحطة،
--   وفي المحطة، وفي طريق العودة، ويُسجَّل موضع الآلية وقت البلاغ (trip_stage) ويظهر في الخط الزمني.
--   الاستثناء الوحيد: آلية بيد الصيانة (to_maintenance/at_maintenance) ⇒ BREAKDOWN_TRIP_IN_MAINTENANCE.
--   مرحلة الرحلة (app.trip_status) لم تتغيّر: الموضع الفعلي للآلية يبقى هو المصدر، والعطل علامة فوقه.

alter table public.sector_breakdowns add column if not exists trip_stage text
  check (trip_stage is null or trip_stage in ('to_site','at_site','to_station','at_station','to_garage'));
-- البلاغات القديمة المرتبطة بانطلاقة كانت كلها من موقع العمل
update public.sector_breakdowns set trip_stage = 'at_site' where trip_stage is null and departure_id is not null;

create or replace function app.breakdown_stage_label(p_stage text) returns text language sql immutable as $$
  select case p_stage
    when 'to_site' then 'في الطريق إلى موقع العمل'
    when 'at_site' then 'في موقع العمل'
    when 'to_station' then 'في الطريق إلى المحطة'
    when 'at_station' then 'في المحطة'
    when 'to_garage' then 'في طريق العودة إلى الكراج'
    else 'خارج الرحلة' end
$$;

create or replace function public.sector_submit_breakdown(p_db_number text,p_fault_type text,p_notes text default null)
returns public.sector_breakdowns language plpgsql security definer set search_path=public,app as $$
declare
  u uuid:=auth.uid(); mp public.manager_profiles; nm text; r public.sector_breakdowns;
  d public.garage_departures; v public.garage_vehicles; db text:=upper(trim(coalesce(p_db_number,'')));
  stage text;
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
      -- 00253: البلاغ مسموح في أي مرحلة من الرحلة (طريق/موقع/محطة/عودة) — ما عدا وهي بيد الصيانة
      stage := app.trip_status(d.id);
      if stage in ('to_maintenance','at_maintenance') then raise exception 'BREAKDOWN_TRIP_IN_MAINTENANCE'; end if;
      if stage = 'breakdown' then stage := 'at_site'; end if;
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
  insert into public.sector_breakdowns(manager_id,manager_name,shift,sectors,db_number,fault_type,notes,status,departure_id,vehicle_id,trip_stage)
  values(u,nm,coalesce(d.shift,mp.shift),case when d.id is null then mp.sectors else array[d.sector_id]::smallint[] end,db,trim(p_fault_type),nullif(trim(coalesce(p_notes,'')),''),'logged',d.id,v.id,stage)
  returning * into r;
  return r;
end$$;

-- الخط الزمني: عنوان البلاغ يذكر موضع الآلية وقت العطل
CREATE OR REPLACE FUNCTION public.operational_departure_timeline(p_departure_id uuid)
 RETURNS TABLE(event_key text, event_type text, title text, details text, happened_at timestamp with time zone, minutes_since_prev integer, sequence_no integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
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
  select 'leg:'||l.id::text||':departed','movement',case when l.origin_type='maintenance' and l.destination_type='maintenance' then 'غادرت الورشة الفرعية باتجاه الصيانة المركزية' else 'غادرت '||app.trip_place_label(l.origin_type)||' إلى '||app.trip_place_label(l.destination_type) end,l.departure_notes,l.departed_at,100+l.sequence_no*10
  from public.vehicle_trip_legs l where l.departure_id=d.id
  union all
  select 'leg:'||l.id::text||':arrived','movement',case when l.origin_type='maintenance' and l.destination_type='maintenance' then 'وصلت إلى الصيانة المركزية' else 'وصلت إلى '||app.trip_place_label(l.destination_type) end,l.arrival_notes,l.arrived_at,100+l.sequence_no*10+1
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
  select 'breakdown:'||b.id::text,'breakdown','بلاغ عطل — '||app.breakdown_stage_label(b.trip_stage),b.fault_type||coalesce(' · '||b.notes,''),b.created_at,500
  from public.sector_breakdowns b where b.departure_id=d.id
  union all
  select 'breakdown:'||b.id::text||':resolved','breakdown','حُسم العطل ('||app.breakdown_stage_label(b.trip_stage)||')',b.fault_type,b.resolved_at,501
  from public.sector_breakdowns b where b.departure_id=d.id and b.resolved_at is not null
  union all
  select 'case:'||c.id::text||':reported','maintenance','إحالة إلى الصيانة',c.fault_type||' · أولوية '||case c.priority when 'critical' then 'حرجة' when 'urgent' then 'عاجلة' else 'عادية' end||' · الورشة: '||app.maintenance_workshop_name(coalesce(c.origin_workshop_key,c.workshop_key)),c.reported_at,600
  from public.vehicle_maintenance_cases c where c.departure_id=d.id
  union all
  select 'case:'||c.id::text||':arrived','maintenance','استلمتها الصيانة',c.diagnosis,c.arrived_at,601
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.arrived_at is not null
  union all
  select 'case:'||u.id::text||':update','maintenance','تحديث الصيانة: '||case u.status when 'diagnosing' then 'قيد التشخيص' when 'waiting_parts' then 'بانتظار القطع' when 'in_repair' then 'قيد الإصلاح' when 'paused' then 'متوقفة مؤقتاً' when 'ready' then 'جاهزة' when 'at_maintenance' then 'داخل الصيانة' else u.status end||format(' (%s%%)',u.progress),
         coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason),u.created_at,700
  from public.vehicle_maintenance_updates u join public.vehicle_maintenance_cases c on c.id=u.case_id where c.departure_id=d.id and u.status<>'to_maintenance'
  union all
  select 'case:'||c.id::text||':forwarded','maintenance','تحويل إلى الصيانة المركزية','من '||app.maintenance_workshop_name(c.origin_workshop_key)||' — السبب: '||coalesce(c.forward_reason,''),c.forwarded_at,650
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.forwarded_at is not null
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
end$function$;
