-- 00150 · الجولة 4 من تدقيق الانطلاقيات: الصيانة
-- القرارات المعتمدة:
--  · بعد الصيانة تعود الآلية إلى عملها أو إلى الكراج (كلا المسارين مدعومان ومُثبتان بالاختبار).
--  · تعديل بيانات حالة صيانة مكتملة (نوع العطل/الأولوية/التشخيص/الملاحظات/الفني/الكلف) حصراً من غرفة العمليات،
--    بسبب إلزامي وتدقيق قبل/بعد وإبلاغ الصيانة — نفس نمط تصحيح الوزن.
--  · كلفة القطع تبقى محسوبة من القطع المصروفة؛ التصحيح يمس كلفة الخدمة فقط والكلفة الفعلية = خدمة + قطع.

alter table public.audit_logs drop constraint if exists audit_logs_operation_check;
alter table public.audit_logs add constraint audit_logs_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','ARCHIVE','RESTORE','SEND_FOLDER_TO_DEPUTY','RECORD_WEIGHING','COMPLETE_WEIGHING','SET_DRIVER','CORRECT_WEIGHING','SAVE_VEHICLE_KIND','CORRECT_MAINTENANCE'));

alter table public.vehicle_maintenance_cases
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_by uuid references auth.users(id),
  add column if not exists correction_reason text,
  add column if not exists correction_count integer not null default 0;

create or replace function public.ops_correct_maintenance_case(
  p_case_id uuid, p_reason text,
  p_fault_type text default null, p_priority text default null, p_diagnosis text default null, p_work_notes text default null,
  p_parts_notes text default null, p_assigned_technician text default null, p_estimated_cost numeric default null, p_service_cost numeric default null)
returns public.vehicle_maintenance_cases
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); c public.vehicle_maintenance_cases; old_c public.vehicle_maintenance_cases; v public.garage_vehicles;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'OPS_CORRECTION_REASON_REQUIRED'; end if;
  if p_priority is not null and p_priority not in ('normal','urgent','critical') then raise exception 'MAINTENANCE_PRIORITY_INVALID'; end if;
  if p_fault_type is not null and length(trim(p_fault_type)) < 2 then raise exception 'MAINTENANCE_FAULT_TYPE_REQUIRED'; end if;
  if (p_estimated_cost is not null and p_estimated_cost < 0) or (p_service_cost is not null and p_service_cost < 0) then raise exception 'MAINTENANCE_COST_INVALID'; end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id for update;
  if not found then raise exception 'MAINTENANCE_CASE_NOT_FOUND'; end if;
  if c.completed_at is null then raise exception 'OPS_CORRECTION_NOT_COMPLETED'; end if;
  old_c := c;
  update public.vehicle_maintenance_cases
     set fault_type = coalesce(nullif(trim(p_fault_type), ''), fault_type),
         priority = coalesce(p_priority, priority),
         diagnosis = coalesce(nullif(trim(p_diagnosis), ''), diagnosis),
         work_notes = coalesce(nullif(trim(p_work_notes), ''), work_notes),
         parts_notes = coalesce(nullif(trim(p_parts_notes), ''), parts_notes),
         assigned_technician = coalesce(nullif(trim(p_assigned_technician), ''), assigned_technician),
         estimated_cost = coalesce(p_estimated_cost, estimated_cost),
         service_cost = coalesce(p_service_cost, service_cost),
         actual_cost = coalesce(p_service_cost, service_cost) + parts_actual_cost,
         corrected_at = now(), corrected_by = u, correction_reason = trim(p_reason), correction_count = correction_count + 1, updated_at = now()
   where id = c.id returning * into c;
  if row(c.fault_type, c.priority, c.diagnosis, c.work_notes, c.parts_notes, c.assigned_technician, c.estimated_cost, c.service_cost)
     is not distinct from row(old_c.fault_type, old_c.priority, old_c.diagnosis, old_c.work_notes, old_c.parts_notes, old_c.assigned_technician, old_c.estimated_cost, old_c.service_cost) then
    raise exception 'OPS_CORRECTION_NO_CHANGE';
  end if;
  insert into public.audit_logs (table_name, record_id, operation, old_row, new_row, actor_id, actor_role)
  values ('vehicle_maintenance_cases', c.id::text, 'CORRECT_MAINTENANCE',
          jsonb_build_object('fault_type', old_c.fault_type, 'priority', old_c.priority, 'diagnosis', old_c.diagnosis, 'work_notes', old_c.work_notes, 'parts_notes', old_c.parts_notes, 'assigned_technician', old_c.assigned_technician, 'estimated_cost', old_c.estimated_cost, 'service_cost', old_c.service_cost, 'actual_cost', old_c.actual_cost),
          jsonb_build_object('fault_type', c.fault_type, 'priority', c.priority, 'diagnosis', c.diagnosis, 'work_notes', c.work_notes, 'parts_notes', c.parts_notes, 'assigned_technician', c.assigned_technician, 'estimated_cost', c.estimated_cost, 'service_cost', c.service_cost, 'actual_cost', c.actual_cost, 'reason', trim(p_reason)),
          u, app.current_role());
  select * into v from public.garage_vehicles where id = c.vehicle_id;
  perform app.notify_by_role(array['maintenance'], 'صحّحت غرفة العمليات بيانات حالة صيانة',
    format('DB %s — %s. السبب: %s', v.db_number, c.fault_type, trim(p_reason)), 'info', '/maintenance/vehicle-cases');
  return c;
end$$;
revoke all on function public.ops_correct_maintenance_case(uuid,text,text,text,text,text,text,text,numeric,numeric) from public, anon;
grant execute on function public.ops_correct_maintenance_case(uuid,text,text,text,text,text,text,text,numeric,numeric) to authenticated;

-- التسلسل الزمني للحالة يعرض كل تصحيح من غرفة العمليات
create or replace function public.maintenance_case_events(p_case_id uuid)
returns table(event_key text,event_type text,title text,details text,happened_at timestamptz,actor_id uuid,status text,progress integer,sequence_no integer)
language plpgsql stable security definer set search_path=public,app as $$declare c public.vehicle_maintenance_cases;begin
 select*into c from public.vehicle_maintenance_cases where id=p_case_id;
 if not found or not(app.has_role(array['maintenance','central_garage_officer','ops_room','super_admin'])or c.manager_id=auth.uid())then raise exception'MAINTENANCE_CASE_FORBIDDEN';end if;
 return query
 with events as(
  select'case:reported'::text k,'case'::text t,'تسجيل العطل وإرسال الآلية'::text ttl,c.fault_type::text det,c.reported_at at,c.manager_id actor,'to_maintenance'::text st,0::int prog,0::int seq
  union all select'garage:decision','decision',case c.garage_decision_status when'acknowledged'then'أكد الكراج استلام البلاغ'when'approved'then'اعتمد الكراج حركة الصيانة'when'rejected'then'رفض الكراج حركة الصيانة'else'بانتظار إجراء الكراج'end,coalesce(c.garage_decision_notes,c.dispatch_policy),coalesce(c.garage_decided_at,c.reported_at),c.garage_decided_by,c.garage_decision_status,null,1 where c.garage_decision_status<>'not_required'
  union all select'leg:'||l.id::text||':departed','movement','غادرت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.departure_notes,l.departed_at,l.departed_by,'in_transit',null,l.sequence_no*10 from public.vehicle_trip_legs l where l.departure_id=c.departure_id
  union all select'leg:'||l.id::text||':arrived','movement','وصلت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.arrival_notes,l.arrived_at,l.arrived_by,'arrived',null,l.sequence_no*10+1 from public.vehicle_trip_legs l where l.departure_id=c.departure_id and l.arrived_at is not null
  union all select'update:'||u.id::text,'maintenance_update','تحديث الصيانة: '||u.status,coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason,'تحديث حالة'),u.created_at,u.created_by,u.status,u.progress,1000+row_number()over(order by u.created_at)::int from public.vehicle_maintenance_updates u where u.case_id=c.id
  union all select'part:'||p.id::text,'part',case p.part_status when'installed'then'تم تركيب قطعة'when'returned'then'أعيدت قطعة للمخزون'else'صُرفت قطعة للصيانة'end,p.part_name||' · '||p.quantity||' '||p.unit,coalesce(p.installed_at,p.returned_at,p.created_at),p.created_by,p.part_status,null,2000+row_number()over(order by p.created_at)::int from public.vehicle_maintenance_parts p where p.case_id=c.id
  union all select'case:ready','readiness','إعلان جاهزية الآلية',coalesce(c.readiness_approval_notes,'اكتملت أعمال الصيانة'),c.ready_at,c.ready_declared_by,'ready',100,3000 where c.ready_at is not null
  union all select'case:approved-ready','readiness','اعتماد الجاهزية للمغادرة',coalesce(c.readiness_approval_notes,'تم اعتماد الجاهزية'),c.readiness_approved_at,c.readiness_approved_by,'ready',100,3001 where c.readiness_approved_at is not null
  union all select'correction:'||a.id::text,'correction','تصحيح من غرفة العمليات',coalesce(a.new_row->>'reason','تصحيح بيانات الحالة'),a.created_at,a.actor_id,'corrected',null,5000+row_number()over(order by a.created_at)::int from public.audit_logs a where a.table_name='vehicle_maintenance_cases' and a.record_id=c.id::text and a.operation='CORRECT_MAINTENANCE'
  union all select'case:completed','completion',case c.status when'returned_to_work'then'تأكيد العودة الفعلية إلى العمل'when'closed_at_garage'then'تأكيد الوصول الفعلي إلى الكراج'else'إغلاق حالة الصيانة'end,coalesce(c.work_notes,c.diagnosis,'اكتملت الدورة'),c.completed_at,null,c.status,100,4000 where c.completed_at is not null
 )select e.k,e.t,e.ttl,e.det,e.at,e.actor,e.st,e.prog,e.seq from events e order by e.at,e.seq;
end$$;

-- ─── خلل مكتشف بالتدقيق: الكراج كان يستطيع إغلاق انطلاقية آليةٍ ما زالت داخل الصيانة أو المحطة أو الموقع
--     عندما لا يكون للانطلاقية مسؤول قسم مسجَّل (الشرط القديم اعتمد على recipient_manager_id فقط).
--     القاعدة الآن تعتمد على الموقع الفعلي للآلية من سيقان الرحلة.
create or replace function public.garage_record_return(p_departure_id uuid)
returns public.garage_departures language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor(); d public.garage_departures; l public.vehicle_trip_legs; last_leg public.vehicle_trip_legs; c public.vehicle_maintenance_cases;
begin
  select * into d from public.garage_departures where id=p_departure_id and returned_at is null for update;
  if not found then raise exception 'GARAGE_OPEN_DEPARTURE_NOT_FOUND'; end if;
  if not app.garage_vehicle_allowed(d.vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  select * into l from public.vehicle_trip_legs where departure_id=d.id and arrived_at is null for update;
  if found then
    if l.destination_type<>'garage' then raise exception 'GARAGE_VEHICLE_NOT_SENT_BACK'; end if;
    update public.vehicle_trip_legs set arrived_at=now(),arrived_by=u,arrival_notes='أكد الكراج الوصول' where id=l.id;
  else
    select * into last_leg from public.vehicle_trip_legs where departure_id=d.id order by sequence_no desc limit 1;
    if found and last_leg.destination_type in ('transfer_station','maintenance') then raise exception 'GARAGE_VEHICLE_NOT_SENT_BACK'; end if;
    if d.site_departed_at is null and (d.recipient_manager_id is not null or d.arrived_at is not null) then raise exception 'GARAGE_VEHICLE_NOT_SENT_BACK'; end if;
    if exists (select 1 from public.vehicle_maintenance_cases mc where mc.departure_id=d.id and mc.completed_at is null) then raise exception 'GARAGE_VEHICLE_NOT_SENT_BACK'; end if;
  end if;
  update public.garage_departures set arrived_at=coalesce(arrived_at,now()),arrived_by=coalesce(arrived_by,u),site_departed_at=coalesce(site_departed_at,now()),site_departed_by=coalesce(site_departed_by,u),returned_at=now(),returned_by=u where id=d.id returning * into d;
  update public.vehicle_maintenance_cases set status='closed_at_garage',completed_at=now(),updated_at=now() where departure_id=d.id and status='to_garage' and completed_at is null returning * into c;
  if found then update public.sector_breakdowns set status='resolved',resolved_at=now(),resolved_by=u,resolution_notes='أغلقت الحالة بعد وصول الآلية من الصيانة إلى الكراج' where id=c.breakdown_id; end if;
  if d.recipient_manager_id is not null then
    insert into public.notifications(user_id,title,body,type,link) values(d.recipient_manager_id,'وصلت الآلية إلى الكراج',format('أكد الكراج استلام الآلية DB %s وإغلاق الانطلاقة',(select db_number from public.garage_vehicles where id=d.vehicle_id)),'success','/manager/vehicle-trips');
  end if;
  return d;
end$$;
