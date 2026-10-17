-- 00241 — صيانة الزعفرانية (٢/٤): «تحويل إلى الصيانة المركزية» بسبب إلزامي.
-- • الحالة نفسها تنتقل (لا حالة جديدة): origin_workshop_key = الزعفرانية، workshop_key = المركزية، بكل سجلها (تحديثات/قطع/مرفقات/مراحل/فنيون).
-- • تصبح للقراءة فقط في ورشة الزعفرانية (ws_visible عبر origin، ws_can_edit = false)، وتُحرَّر فنيّوها.
-- • ساق رحلة جديدة: ورشة (maintenance) → الصيانة المركزية (maintenance) — تؤكد المركزية الوصول بالزر المعتاد.
-- • حدث «تحويل» في سجل الحالة + إشعار مسؤول القاطع وغرفة العمليات وحسابات المركزية + تدقيق.
-- • قائمة اليوم تُرجع عمود الورشة/الأصل/السبب/can_edit (تغيير نوع الإرجاع ⇒ drop ثم إنشاء).

create or replace function public.maintenance_forward_to_central(p_case_id uuid, p_reason text) returns vehicle_maintenance_cases
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); c public.vehicle_maintenance_cases; ws text := app.maintenance_workshop(); ws_name text; nxt int; r text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  if r is null or length(r) < 5 then raise exception 'MAINTENANCE_FORWARD_REASON_REQUIRED'; end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id for update;
  if not found or not app.maintenance_ws_can_edit(c.workshop_key) then raise exception 'MAINTENANCE_CASE_NOT_FOUND'; end if;
  if c.workshop_key = 'central' then raise exception 'MAINTENANCE_FORWARD_ALREADY_CENTRAL'; end if;
  if c.completed_at is not null or c.status not in ('at_maintenance','diagnosing','waiting_parts','in_repair','paused') or c.arrived_at is null or c.readiness_approved_at is not null
  then raise exception 'MAINTENANCE_FORWARD_NOT_ALLOWED'; end if;
  select name into ws_name from public.maintenance_workshops where key = c.workshop_key;

  -- تحرير فنيي الورشة المحوِّلة (يبقون في السجل)
  update public.vehicle_maintenance_case_technicians set released_at = now(), released_by = u, release_notes = 'تحويل الحالة إلى الصيانة المركزية'
   where case_id = c.id and released_at is null;
  -- المراحل: الوصول يُعاد تفعيله عند المركزية؛ المرحلة النشطة تعود معلّقة
  update public.vehicle_maintenance_stages set status = 'pending', started_at = null, started_by = null where case_id = c.id and status = 'active';
  update public.vehicle_maintenance_stages set status = 'active', started_at = now(), started_by = u where case_id = c.id and stage_key = 'arrival';

  update public.vehicle_maintenance_cases
     set origin_workshop_key = c.workshop_key, workshop_key = 'central', forwarded_at = now(), forward_reason = r,
         status = 'to_maintenance', arrived_at = null, updated_at = now()
   where id = c.id returning * into c;

  insert into public.vehicle_maintenance_updates (case_id, status, progress, work_notes, created_by)
  values (c.id, 'to_maintenance', c.progress, 'تحويل إلى الصيانة المركزية من ' || coalesce(ws_name, c.origin_workshop_key) || ' — السبب: ' || r, u);

  select coalesce(max(sequence_no), 0) + 1 into nxt from public.vehicle_trip_legs where departure_id = c.departure_id;
  insert into public.vehicle_trip_legs (departure_id, sequence_no, origin_type, destination_type, departed_at, departed_by, departure_notes)
  values (c.departure_id, nxt, 'maintenance', 'maintenance', now(), u, 'تحويل من ' || coalesce(ws_name, c.origin_workshop_key) || ' إلى الصيانة المركزية: ' || r);

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('vehicle_maintenance_cases', c.id::text, 'UPDATE', jsonb_build_object('action', 'forward_to_central', 'from', c.origin_workshop_key, 'reason', r), u, 'maintenance');

  insert into public.notifications (user_id, title, body, type, link, category)
  select x.user_id, 'تحويل آلية إلى الصيانة المركزية', 'حُوِّلت حالة الصيانة من ' || coalesce(ws_name, c.origin_workshop_key) || ' إلى الصيانة المركزية. السبب: ' || r, 'warning', x.link, 'maintenance'
    from (
      select c.manager_id as user_id, '/manager/vehicle-trips' as link
      union select ur.user_id, '/ops-room/operations-data' from public.user_roles ur where ur.role = 'ops_room'
      union select ur.user_id, '/maintenance/vehicle-cases' from public.user_roles ur where ur.role = 'maintenance' and ur.user_id <> u
              and coalesce((select a.workshop_key from public.maintenance_workshop_accounts a where a.user_id = ur.user_id), 'central') = 'central'
    ) x where x.user_id is not null;
  return c;
end$$;
revoke all on function public.maintenance_forward_to_central(uuid, text) from public, anon;
grant execute on function public.maintenance_forward_to_central(uuid, text) to authenticated;

-- قائمة اليوم مع أعمدة الورشة (نوع الإرجاع تغيّر)
drop function if exists public.maintenance_cases_for_day(date);
CREATE OR REPLACE FUNCTION public.maintenance_cases_for_day(p_day date)
 RETURNS TABLE(case_id uuid, departure_id uuid, breakdown_id uuid, vehicle_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text, sector_id integer, manager_name text, status text, fault_type text, priority text, reported_at timestamp with time zone, arrived_at timestamp with time zone, diagnosis text, work_notes text, parts_notes text, progress smallint, expected_completion_at timestamp with time zone, ready_at timestamp with time zone, departed_maintenance_at timestamp with time zone, completed_at timestamp with time zone, assigned_technician text, estimated_cost numeric, actual_cost numeric, service_cost numeric, parts_actual_cost numeric, delay_reason text, assigned_technician_id uuid, ready_declared_by uuid, readiness_approved_at timestamp with time zone, readiness_approved_by uuid, readiness_approval_notes text, stage_key text, stage_no smallint, technicians text, technician_count integer, parts_count integer, parts_summary text, wait_minutes integer, maintenance_minutes integer, corrected_at timestamp with time zone, correction_reason text, correction_count integer, updates_count integer, last_update_at timestamp with time zone, workshop_key text, workshop_name text, origin_workshop_key text, origin_workshop_name text, forwarded_at timestamp with time zone, forward_reason text, can_edit boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;
  return query
  select c.id,c.departure_id,c.breakdown_id,c.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,se.name,d.sector_id::int,d.recipient_manager_name,
         c.status,c.fault_type,c.priority,c.reported_at,c.arrived_at,c.diagnosis,c.work_notes,c.parts_notes,c.progress,
         c.expected_completion_at,c.ready_at,c.departed_maintenance_at,c.completed_at,c.assigned_technician,
         c.estimated_cost,c.actual_cost,c.service_cost,c.parts_actual_cost,c.delay_reason,c.assigned_technician_id,c.ready_declared_by,
         c.readiness_approved_at,c.readiness_approved_by,c.readiness_approval_notes,
         coalesce(st.stage_key, case when c.completed_at is not null then 'handover' end), coalesce(st.stage_no,0)::smallint,
         app.maintenance_technicians_text(c.id),
         (select count(*)::int from public.vehicle_maintenance_case_technicians ct where ct.case_id=c.id and ct.released_at is null),
         (select count(*)::int from public.vehicle_maintenance_parts p where p.case_id=c.id and p.part_status in('issued','installed')),
         app.maintenance_parts_summary(c.id),
         case when c.arrived_at is null then null else greatest(0,round(extract(epoch from (c.arrived_at-c.reported_at))/60))::int end,
         case when c.arrived_at is null then null else greatest(0,round(extract(epoch from (coalesce(c.departed_maintenance_at,c.completed_at,now())-c.arrived_at))/60))::int end,
         c.corrected_at,c.correction_reason,c.correction_count,
         (select count(*)::int from public.vehicle_maintenance_updates mu where mu.case_id=c.id),
         (select max(mu.created_at) from public.vehicle_maintenance_updates mu where mu.case_id=c.id),
         c.workshop_key, w.name, c.origin_workshop_key, ow.name, c.forwarded_at, c.forward_reason, app.maintenance_ws_can_edit(c.workshop_key)
  from public.vehicle_maintenance_cases c
  join public.maintenance_workshops w on w.key=c.workshop_key
  left join public.maintenance_workshops ow on ow.key=c.origin_workshop_key
  join public.garage_departures d on d.id=c.departure_id
  join public.garage_vehicles v on v.id=c.vehicle_id
  join public.sectors se on se.id=d.sector_id
  left join public.vehicle_maintenance_stages st on st.case_id=c.id and st.status='active'
  where c.reported_at<p_day+1 and(c.completed_at is null or c.completed_at>=p_day) and app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key)
  order by(c.completed_at is null)desc,c.reported_at desc;
end$function$;

revoke all on function public.maintenance_cases_for_day(date) from public, anon;
grant execute on function public.maintenance_cases_for_day(date) to authenticated;
