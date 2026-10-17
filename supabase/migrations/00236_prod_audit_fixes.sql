-- 00236 · إصلاحات من فحص قاعدة بيانات الإنتاج مباشرة (00267)
--   ① maintenance_technicians: auth.users.email في Supabase الحقيقي varchar(255) لا text ⇒ «structure of query does not match function result type».
--   ② maintenance_vehicle_cases: coalesce(st.stage_no, 0) يُرجع integer والعمود المعلن smallint ⇒ الخطأ نفسه (42804) — صفحة حالات الصيانة لا تفتح.
--   ③ maintenance_case_technicians: «column reference "id" is ambiguous» (عمود الإخراج id مقابل where id = …).
--   ④ audit_logs_operation_check: قيمة 'SEND_TO_OPS' (إرسال دفتر الوزن إلى غرفة العمليات من محطة التحويل) سقطت من القائمة في 00130 ⇒ الإرسال يفشل.

-- ① 
create or replace function public.maintenance_technicians()
returns table(user_id uuid,display_name text,email text) language plpgsql stable security definer set search_path=public,app as $$
begin if not app.has_role(array['maintenance']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;
return query select ur.user_id,coalesce(nullif(trim(e.full_name),''),u.email::text,ur.user_id::text),u.email::text from public.user_roles ur join auth.users u on u.id=ur.user_id left join public.employees e on e.user_id=ur.user_id where ur.role='maintenance' order by 2;end$$;

-- ②
create or replace function public.maintenance_vehicle_cases()
returns table(
  case_id uuid, departure_id uuid, breakdown_id uuid, vehicle_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text,
  manager_name text, status text, fault_type text, priority text, reported_at timestamptz, arrived_at timestamptz, diagnosis text, work_notes text, parts_notes text,
  progress smallint, expected_completion_at timestamptz, ready_at timestamptz, departed_maintenance_at timestamptz, completed_at timestamptz, assigned_technician text,
  service_cost numeric, parts_actual_cost numeric, actual_cost numeric, readiness_approved_at timestamptz, stage_key text, stage_no smallint)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['maintenance']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  return query
  select c.id, c.departure_id, c.breakdown_id, c.vehicle_id,
         v.vehicle_name::text, v.db_number::text, d.driver_name::text, d.shift::text, s.name::text,
         d.recipient_manager_name::text, c.status::text, c.fault_type::text, c.priority::text,
         c.reported_at, c.arrived_at, c.diagnosis::text, c.work_notes::text, c.parts_notes::text,
         c.progress::smallint, c.expected_completion_at, c.ready_at, c.departed_maintenance_at, c.completed_at,
         c.assigned_technician::text, c.service_cost, c.parts_actual_cost, c.actual_cost, c.readiness_approved_at,
         coalesce(st.stage_key, case when c.completed_at is not null then 'handover' else null end)::text,
         coalesce(st.stage_no, 0)::smallint
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
    left join public.vehicle_maintenance_stages st on st.case_id = c.id and st.status = 'active'
   where c.garage_decision_status not in ('awaiting_approval', 'rejected')
     and (c.completed_at is null or (c.completed_at at time zone 'Asia/Baghdad')::date >= (now() at time zone 'Asia/Baghdad')::date - 30)
   order by (c.completed_at is null) desc, c.reported_at desc;
end;
$$;

-- ③
create or replace function public.maintenance_case_technicians(p_case_id uuid)
returns table(id uuid, case_id uuid, employee_id uuid, technician_name text, employee_number text, specialty text, specialty_label text, notes text,
              assigned_at timestamptz, released_at timestamptz, release_notes text, active boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare c public.vehicle_maintenance_cases;
begin
  select * into c from public.vehicle_maintenance_cases vmc where vmc.id = p_case_id;
  if not found or not (app.has_role(array['maintenance', 'central_garage_officer', 'ops_room', 'super_admin']) or c.manager_id = auth.uid()) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
  return query
  select ct.id, ct.case_id, ct.employee_id, ct.technician_name, e.employee_number, ct.specialty, app.maintenance_specialty_label(ct.specialty), ct.notes,
         ct.assigned_at, ct.released_at, ct.release_notes, ct.released_at is null
  from public.vehicle_maintenance_case_technicians ct join public.employees e on e.id = ct.employee_id
  where ct.case_id = p_case_id order by ct.released_at is not null, ct.assigned_at;
end$$;

-- ④
alter table public.audit_logs drop constraint if exists audit_logs_operation_check;
alter table public.audit_logs add constraint audit_logs_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','ARCHIVE','RESTORE','SEND_FOLDER_TO_DEPUTY','RECORD_WEIGHING','COMPLETE_WEIGHING',
                       'SET_DRIVER','CORRECT_WEIGHING','SAVE_VEHICLE_KIND','CORRECT_MAINTENANCE','RESOLVE_BREAKDOWN','SEND_TO_OPS'));
