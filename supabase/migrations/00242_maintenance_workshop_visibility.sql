-- 00242 — صيانة الزعفرانية (٣/٤): إظهار الورشة وحدث التحويل خارج بوابة الصيانة + فلتر الورشة في الأرشيف والتقارير.
-- • غرفة العمليات: تقرير الصيانة يُرجع الورشة/الأصل/وقت وسبب التحويل (+ فلتر p_workshop)؛ تسلسل الانطلاقة يُظهر «تحويل إلى الصيانة المركزية» وأسماء الورش في الأرجل.
-- • مسؤول القاطع: sector_trip_maintenance_state يُرجع الورشة الحالية والتحويل؛ تسلسل الصيانة (maintenance_case_events) يُظهر حدث التحويل.
-- • أرشيف الصيانة: فلتر الورشة + أعمدة الورشة/الأصل. لا تغيير في أي صلاحية.

create or replace function app.maintenance_workshop_name(p_key text) returns text language sql stable as $$
  select coalesce((select name from public.maintenance_workshops where key = p_key), p_key) $$;

CREATE OR REPLACE FUNCTION public.maintenance_case_events_v150(p_case_id uuid)
 RETURNS TABLE(event_key text, event_type text, title text, details text, happened_at timestamp with time zone, actor_id uuid, status text, progress integer, sequence_no integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare c public.vehicle_maintenance_cases;begin
 select*into c from public.vehicle_maintenance_cases where id=p_case_id;
 if not found or not(app.has_role(array['maintenance','central_garage_officer','ops_room','super_admin'])or c.manager_id=auth.uid())then raise exception'MAINTENANCE_CASE_FORBIDDEN';end if;
 return query
 with events as(
  select'case:reported'::text k,'case'::text t,'تسجيل العطل وإرسال الآلية'::text ttl,c.fault_type::text det,c.reported_at at,c.manager_id actor,'to_maintenance'::text st,0::int prog,0::int seq
  union all select'garage:decision','decision',case c.garage_decision_status when'acknowledged'then'أكد الكراج استلام البلاغ'when'approved'then'اعتمد الكراج حركة الصيانة'when'rejected'then'رفض الكراج حركة الصيانة'else'بانتظار إجراء الكراج'end,coalesce(c.garage_decision_notes,c.dispatch_policy),coalesce(c.garage_decided_at,c.reported_at),c.garage_decided_by,c.garage_decision_status,null,1 where c.garage_decision_status<>'not_required'
  union all select'leg:'||l.id::text||':departed','movement','غادرت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.departure_notes,l.departed_at,l.departed_by,'in_transit',null,l.sequence_no*10 from public.vehicle_trip_legs l where l.departure_id=c.departure_id
  union all select'leg:'||l.id::text||':arrived','movement','وصلت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.arrival_notes,l.arrived_at,l.arrived_by,'arrived',null,l.sequence_no*10+1 from public.vehicle_trip_legs l where l.departure_id=c.departure_id and l.arrived_at is not null
  union all select'update:'||u.id::text,'maintenance_update','تحديث الصيانة: '||u.status,coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason,'تحديث حالة'),u.created_at,u.created_by,u.status,u.progress,1000+row_number()over(order by u.created_at)::int from public.vehicle_maintenance_updates u where u.case_id=c.id and u.status<>'to_maintenance'
  union all select'case:forwarded','forward','تحويل إلى الصيانة المركزية','من '||app.maintenance_workshop_name(c.origin_workshop_key)||' — السبب: '||coalesce(c.forward_reason,''),c.forwarded_at,null::uuid,'to_maintenance',c.progress::int,950 where c.forwarded_at is not null
  union all select'part:'||p.id::text,'part',case p.part_status when'installed'then'تم تركيب قطعة'when'returned'then'أعيدت قطعة للمخزون'else'صُرفت قطعة للصيانة'end,p.part_name||' · '||p.quantity||' '||p.unit,coalesce(p.installed_at,p.returned_at,p.created_at),p.created_by,p.part_status,null,2000+row_number()over(order by p.created_at)::int from public.vehicle_maintenance_parts p where p.case_id=c.id
  union all select'case:ready','readiness','إعلان جاهزية الآلية',coalesce(c.readiness_approval_notes,'اكتملت أعمال الصيانة'),c.ready_at,c.ready_declared_by,'ready',100,3000 where c.ready_at is not null
  union all select'case:approved-ready','readiness','اعتماد الجاهزية للمغادرة',coalesce(c.readiness_approval_notes,'تم اعتماد الجاهزية'),c.readiness_approved_at,c.readiness_approved_by,'ready',100,3001 where c.readiness_approved_at is not null
  union all select'correction:'||a.id::text,'correction','تصحيح من غرفة العمليات',coalesce(a.new_row->>'reason','تصحيح بيانات الحالة'),a.created_at,a.actor_id,'corrected',null,5000+row_number()over(order by a.created_at)::int from public.audit_logs a where a.table_name='vehicle_maintenance_cases' and a.record_id=c.id::text and a.operation='CORRECT_MAINTENANCE'
  union all select'case:completed','completion',case c.status when'returned_to_work'then'تأكيد العودة الفعلية إلى العمل'when'closed_at_garage'then'تأكيد الوصول الفعلي إلى الكراج'else'إغلاق حالة الصيانة'end,coalesce(c.work_notes,c.diagnosis,'اكتملت الدورة'),c.completed_at,null,c.status,100,4000 where c.completed_at is not null
 )select e.k,e.t,e.ttl,e.det,e.at,e.actor,e.st,e.prog,e.seq from events e order by e.at,e.seq;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_case_events_unscoped(p_case_id uuid)
 RETURNS TABLE(event_key text, event_type text, title text, details text, happened_at timestamp with time zone, actor_id uuid, status text, progress integer, sequence_no integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare c public.vehicle_maintenance_cases;begin
 select*into c from public.vehicle_maintenance_cases where id=p_case_id;
 if not found or not(app.has_role(array['maintenance','central_garage_officer','ops_room','super_admin'])or c.manager_id=auth.uid())then raise exception'MAINTENANCE_CASE_FORBIDDEN';end if;
 if not app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
 return query
 with events as(
  select'case:reported'::text k,'case'::text t,'تسجيل العطل وإرسال الآلية'::text ttl,c.fault_type::text det,c.reported_at at,c.manager_id actor,'to_maintenance'::text st,0::int prog,0::int seq
  union all select'garage:decision','decision',case c.garage_decision_status when'acknowledged'then'أكد الكراج استلام البلاغ'when'approved'then'اعتمد الكراج حركة الصيانة'when'rejected'then'رفض الكراج حركة الصيانة'else'بانتظار إجراء الكراج'end,coalesce(c.garage_decision_notes,c.dispatch_policy),coalesce(c.garage_decided_at,c.reported_at),c.garage_decided_by,c.garage_decision_status,null,1 where c.garage_decision_status<>'not_required'
  union all select'leg:'||l.id::text||':departed','movement','غادرت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.departure_notes,l.departed_at,l.departed_by,'in_transit',null,l.sequence_no*10 from public.vehicle_trip_legs l where l.departure_id=c.departure_id
  union all select'leg:'||l.id::text||':arrived','movement','وصلت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.arrival_notes,l.arrived_at,l.arrived_by,'arrived',null,l.sequence_no*10+1 from public.vehicle_trip_legs l where l.departure_id=c.departure_id and l.arrived_at is not null
  union all select'update:'||u.id::text,'maintenance_update','تحديث الصيانة: '||u.status,coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason,'تحديث حالة'),u.created_at,u.created_by,u.status,u.progress,1000+row_number()over(order by u.created_at)::int from public.vehicle_maintenance_updates u where u.case_id=c.id and u.status<>'to_maintenance'
  union all select'case:forwarded','forward','تحويل إلى الصيانة المركزية','من '||app.maintenance_workshop_name(c.origin_workshop_key)||' — السبب: '||coalesce(c.forward_reason,''),c.forwarded_at,null::uuid,'to_maintenance',c.progress::int,950 where c.forwarded_at is not null
  union all select'part:'||p.id::text,'part',case p.part_status when'installed'then'تم تركيب قطعة'when'returned'then'أعيدت قطعة للمخزون'else'صُرفت قطعة للصيانة'end,p.part_name||' · '||p.quantity||' '||p.unit,coalesce(p.installed_at,p.returned_at,p.created_at),p.created_by,p.part_status,null,2000+row_number()over(order by p.created_at)::int from public.vehicle_maintenance_parts p where p.case_id=c.id
  union all select'case:ready','readiness','إعلان جاهزية الآلية',coalesce(c.readiness_approval_notes,'اكتملت أعمال الصيانة'),c.ready_at,c.ready_declared_by,'ready',100,3000 where c.ready_at is not null
  union all select'case:approved-ready','readiness','اعتماد الجاهزية للمغادرة',coalesce(c.readiness_approval_notes,'تم اعتماد الجاهزية'),c.readiness_approved_at,c.readiness_approved_by,'ready',100,3001 where c.readiness_approved_at is not null
  union all select'case:completed','completion',case c.status when'returned_to_work'then'تأكيد العودة الفعلية إلى العمل'when'closed_at_garage'then'تأكيد الوصول الفعلي إلى الكراج'else'إغلاق حالة الصيانة'end,coalesce(c.work_notes,c.diagnosis,'اكتملت الدورة'),c.completed_at,null,c.status,100,4000 where c.completed_at is not null
 )select e.k,e.t,e.ttl,e.det,e.at,e.actor,e.st,e.prog,e.seq from events e order by e.at,e.seq;
end$function$;

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
  select 'breakdown:'||b.id::text,'breakdown','بلاغ عطل في موقع العمل',b.fault_type||coalesce(' · '||b.notes,''),b.created_at,500
  from public.sector_breakdowns b where b.departure_id=d.id
  union all
  select 'breakdown:'||b.id::text||':resolved','breakdown','حُسم العطل في الموقع',b.fault_type,b.resolved_at,501
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

CREATE OR REPLACE FUNCTION public.sector_trip_maintenance_state(p_departure_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare d public.garage_departures;r jsonb;begin select*into d from public.garage_departures where id=p_departure_id;if not found or not(d.recipient_manager_id=auth.uid()or app.has_role(array['central_garage_officer','ops_room','super_admin']))then raise exception'MAINTENANCE_STATE_FORBIDDEN';end if;select to_jsonb(x)into r from(select c.id case_id,c.dispatch_policy,c.garage_decision_status decision_status,c.garage_decision_notes,c.reported_at,c.workshop_key,app.maintenance_workshop_name(c.workshop_key) workshop_name,c.origin_workshop_key,app.maintenance_workshop_name(c.origin_workshop_key) origin_workshop_name,c.forwarded_at,c.forward_reason,c.completed_at from public.vehicle_maintenance_cases c where c.departure_id=d.id order by c.reported_at desc limit 1)x;return coalesce(r,'{}');end$function$;

drop function if exists public.operational_maintenance_report(date, date);
CREATE OR REPLACE FUNCTION public.operational_maintenance_report(p_from date, p_to date, p_workshop text DEFAULT NULL::text)
 RETURNS TABLE(case_id uuid, id uuid, departure_id uuid, vehicle_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text, sector_id integer, parent_sector text, manager_name text, status text, stage_key text, fault_type text, priority text, progress smallint, technicians text, technician_count integer, reported_at timestamp with time zone, arrived_at timestamp with time zone, ready_at timestamp with time zone, readiness_approved_at timestamp with time zone, departed_maintenance_at timestamp with time zone, completed_at timestamp with time zone, expected_completion_at timestamp with time zone, wait_minutes integer, maintenance_minutes integer, overdue boolean, diagnosis text, work_notes text, delay_reason text, parts_count integer, parts_summary text, estimated_cost numeric, service_cost numeric, parts_actual_cost numeric, actual_cost numeric, updates_count integer, last_update_at timestamp with time zone, corrected_at timestamp with time zone, correction_reason text, correction_count integer, workshop_key text, workshop_name text, origin_workshop_key text, origin_workshop_name text, forwarded_at timestamp with time zone, forward_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  return query
  select c.id, c.id, c.departure_id, c.vehicle_id, v.vehicle_name, v.db_number, d.driver_name, d.shift, s.name, d.sector_id::int, s.parent_sector, d.recipient_manager_name,
         c.status, coalesce(st.stage_key, case when c.completed_at is not null then 'handover' end), c.fault_type, c.priority, c.progress,
         app.maintenance_technicians_text(c.id),
         (select count(*)::int from public.vehicle_maintenance_case_technicians ct where ct.case_id = c.id and ct.released_at is null),
         c.reported_at, c.arrived_at, c.ready_at, c.readiness_approved_at, c.departed_maintenance_at, c.completed_at, c.expected_completion_at,
         case when c.arrived_at is null then null else greatest(0, round(extract(epoch from (c.arrived_at - c.reported_at)) / 60))::int end,
         case when c.arrived_at is null then null else greatest(0, round(extract(epoch from (coalesce(c.departed_maintenance_at, c.completed_at, now()) - c.arrived_at)) / 60))::int end,
         c.expected_completion_at is not null and c.departed_maintenance_at is null and c.completed_at is null and now() > c.expected_completion_at,
         c.diagnosis, c.work_notes, c.delay_reason,
         (select count(*)::int from public.vehicle_maintenance_parts p where p.case_id = c.id and p.part_status in ('issued', 'installed')),
         app.maintenance_parts_summary(c.id),
         c.estimated_cost, c.service_cost, c.parts_actual_cost, coalesce(c.actual_cost, 0),
         (select count(*)::int from public.vehicle_maintenance_updates mu where mu.case_id = c.id),
         (select max(mu.created_at) from public.vehicle_maintenance_updates mu where mu.case_id = c.id),
         c.corrected_at, c.correction_reason, c.correction_count,
         c.workshop_key, app.maintenance_workshop_name(c.workshop_key), c.origin_workshop_key, app.maintenance_workshop_name(c.origin_workshop_key), c.forwarded_at, c.forward_reason
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
    left join public.vehicle_maintenance_stages st on st.case_id = c.id and st.status = 'active'
   where ((c.reported_at at time zone 'Asia/Baghdad')::date between p_from and p_to or c.completed_at is null)
     and (p_workshop is null or p_workshop = '' or c.workshop_key = p_workshop or c.origin_workshop_key = p_workshop)
   order by (c.completed_at is null) desc, c.reported_at desc;
end$function$;
revoke all on function public.operational_maintenance_report(date, date, text) from public, anon;
grant execute on function public.operational_maintenance_report(date, date, text) to authenticated;

drop function if exists public.maintenance_archive_list(text, date, date);
CREATE OR REPLACE FUNCTION public.maintenance_archive_list(p_search text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_workshop text DEFAULT NULL::text)
 RETURNS TABLE(case_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text, sector_id integer, manager_name text, fault_type text, priority text, reported_at timestamp with time zone, arrived_at timestamp with time zone, ready_at timestamp with time zone, readiness_approved_at timestamp with time zone, departed_maintenance_at timestamp with time zone, completed_at timestamp with time zone, final_status text, diagnosis text, work_notes text, delay_reason text, progress smallint, technicians text, technician_count integer, parts_count integer, parts_summary text, estimated_cost numeric, service_cost numeric, parts_actual_cost numeric, actual_cost numeric, wait_minutes integer, maintenance_minutes integer, duration_days numeric, corrected_at timestamp with time zone, correction_reason text, workshop_key text, workshop_name text, origin_workshop_key text, origin_workshop_name text, forwarded_at timestamp with time zone, forward_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  return query
  select c.id, v.vehicle_name, v.db_number, d.driver_name, d.shift, s.name, d.sector_id::int, d.recipient_manager_name, c.fault_type, c.priority,
         c.reported_at, c.arrived_at, c.ready_at, c.readiness_approved_at, c.departed_maintenance_at, c.completed_at,
         c.status, c.diagnosis, c.work_notes, c.delay_reason, c.progress,
         app.maintenance_technicians_text(c.id),
         (select count(*)::int from public.vehicle_maintenance_case_technicians ct where ct.case_id = c.id and ct.released_at is null),
         (select count(*)::int from public.vehicle_maintenance_parts p where p.case_id = c.id and p.part_status in ('issued', 'installed')),
         app.maintenance_parts_summary(c.id),
         c.estimated_cost, c.service_cost, c.parts_actual_cost, coalesce(c.actual_cost, 0),
         case when c.arrived_at is null then null else greatest(0, round(extract(epoch from (c.arrived_at - c.reported_at)) / 60))::int end,
         case when c.arrived_at is null then null else greatest(0, round(extract(epoch from (coalesce(c.departed_maintenance_at, c.completed_at) - c.arrived_at)) / 60))::int end,
         round(extract(epoch from (c.completed_at - c.reported_at)) / 86400.0, 1),
         c.corrected_at, c.correction_reason,
         c.workshop_key, app.maintenance_workshop_name(c.workshop_key), c.origin_workshop_key, app.maintenance_workshop_name(c.origin_workshop_key), c.forwarded_at, c.forward_reason
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
   where c.completed_at is not null and app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key)
     and (p_workshop is null or p_workshop = '' or c.workshop_key = p_workshop or c.origin_workshop_key = p_workshop)
     and (p_from is null or (c.completed_at at time zone 'Asia/Baghdad')::date >= p_from)
     and (p_to is null or (c.completed_at at time zone 'Asia/Baghdad')::date <= p_to)
     and (p_search is null or trim(p_search) = '' or v.vehicle_name ilike '%' || trim(p_search) || '%' or v.db_number ilike '%' || trim(p_search) || '%'
          or d.driver_name ilike '%' || trim(p_search) || '%' or coalesce(c.assigned_technician, '') ilike '%' || trim(p_search) || '%')
   order by c.completed_at desc limit 500;
end$function$;
revoke all on function public.maintenance_archive_list(text, date, date, text) from public, anon;
grant execute on function public.maintenance_archive_list(text, date, date, text) to authenticated;
