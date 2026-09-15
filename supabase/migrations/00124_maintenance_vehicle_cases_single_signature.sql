-- ═══════════════════════════════════════════════════════════════
-- 00124 · توحيد توقيع maintenance_vehicle_cases
-- إصلاح خطأ 400 من PostgREST (PGRST202) الناتج عن وجود أكثر من
-- توقيع (overloads) للدالة في بيئات النشر — نُبقى توقيعاً واحداً فقط.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  r record;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'maintenance_vehicle_cases'
  loop
    execute format('drop function %s', r.oid::regprocedure);
  end loop;
end $$;

create or replace function public.maintenance_vehicle_cases()
returns table(
  case_id uuid,
  departure_id uuid,
  breakdown_id uuid,
  vehicle_id uuid,
  vehicle_name text,
  db_number text,
  driver_name text,
  shift text,
  area_name text,
  manager_name text,
  status text,
  fault_type text,
  priority text,
  reported_at timestamptz,
  arrived_at timestamptz,
  diagnosis text,
  work_notes text,
  parts_notes text,
  progress smallint,
  expected_completion_at timestamptz,
  ready_at timestamptz,
  departed_maintenance_at timestamptz,
  completed_at timestamptz,
  assigned_technician text,
  service_cost numeric,
  parts_actual_cost numeric,
  actual_cost numeric,
  readiness_approved_at timestamptz,
  stage_key text,
  stage_no smallint
)
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  return query
  select c.id, c.departure_id, c.breakdown_id, c.vehicle_id,
         v.vehicle_name, v.db_number, d.driver_name, d.shift, s.name,
         d.recipient_manager_name, c.status, c.fault_type, c.priority,
         c.reported_at, c.arrived_at, c.diagnosis, c.work_notes, c.parts_notes,
         c.progress, c.expected_completion_at, c.ready_at,
         c.departed_maintenance_at, c.completed_at,
         c.assigned_technician, c.service_cost, c.parts_actual_cost, c.actual_cost,
         c.readiness_approved_at,
         coalesce(st.stage_key,
                  case
                    when c.completed_at is not null then 'handover'
                    else null
                  end),
         coalesce(st.stage_no, 0)
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
    left join public.vehicle_maintenance_stages st
      on st.case_id = c.id and st.status = 'active'
   where c.garage_decision_status not in ('awaiting_approval', 'rejected')
     and (c.completed_at is null
          or (c.completed_at at time zone 'Asia/Baghdad')::date
             >= (now() at time zone 'Asia/Baghdad')::date - 30)
   order by (c.completed_at is null) desc, c.reported_at desc;
end;
$$;

grant execute on function public.maintenance_vehicle_cases() to authenticated;
