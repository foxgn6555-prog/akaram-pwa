-- 00155 · اعتماد جاهزية الصيانة: أسباب فشل واضحة ومنع الوصول إلى حالة عالقة
-- المشكلة: كان يمكن إعلان الحالة «جاهزة» بلا تشخيص أو ملاحظات عمل، ثم يفشل maintenance_approve_readiness
--          بكود عام MAINTENANCE_READINESS_NOT_APPROVABLE، والواجهة تخفي «إضافة تحديث» بعد الجاهزية ⇒ حالة عالقة.
-- الحل الجذري: (1) إعلان الجاهزية يتطلب التشخيص وملاحظات العمل (كود واضح لكل نقص)
--              (2) الاعتماد يشخّص السبب الدقيق (غير مفتوحة / ليست جاهزة / نقص بيانات / قطع غير مركبة / معتمدة مسبقاً)
--              (3) الواجهة تسمح بالتحديث وهي جاهزة قبل الاعتماد وتُظهر النواقص قبل الضغط.

create or replace function public.maintenance_update_case(p_case_id uuid,p_status text,p_progress integer,p_diagnosis text default null,p_work_notes text default null,p_parts_notes text default null,p_expected_completion_at timestamptz default null,p_assigned_technician text default null,p_estimated_cost numeric default null,p_actual_cost numeric default null,p_delay_reason text default null,p_assigned_technician_id uuid default null)
returns public.vehicle_maintenance_cases language plpgsql security definer set search_path=public,app as $$
declare u uuid:=auth.uid();c public.vehicle_maintenance_cases;tech_name text;
begin
  if not app.has_role(array['maintenance'])then raise exception 'MAINTENANCE_FORBIDDEN';end if;
  if p_status not in('at_maintenance','diagnosing','waiting_parts','in_repair','paused','ready')or p_progress not between 0 and 100 then raise exception 'MAINTENANCE_UPDATE_INVALID';end if;
  if p_status='ready'and(p_progress<>100 or exists(select 1 from public.vehicle_maintenance_parts where case_id=p_case_id and part_status='issued'))then raise exception 'MAINTENANCE_READY_REQUIRES_INSTALLED_PARTS';end if;
  if p_actual_cost<0 or p_estimated_cost<0 then raise exception 'MAINTENANCE_COST_INVALID';end if;
  -- (00155) «جاهزة» تتطلب تشخيصاً مكتوباً وملاحظات عمل — وإلا يتعذر اعتماد الجاهزية لاحقاً
  if p_status='ready' then
    select * into c from public.vehicle_maintenance_cases where id=p_case_id;
    if found and coalesce(nullif(trim(coalesce(p_diagnosis,'')),''),c.diagnosis) is null then raise exception 'MAINTENANCE_READY_REQUIRES_DIAGNOSIS';end if;
    if found and coalesce(nullif(trim(coalesce(p_work_notes,'')),''),c.work_notes) is null then raise exception 'MAINTENANCE_READY_REQUIRES_WORK_NOTES';end if;
  end if;
  if p_assigned_technician_id is not null then
    select coalesce(nullif(trim(e.full_name),''),au.email,p_assigned_technician_id::text)into tech_name from auth.users au left join public.employees e on e.user_id=au.id where au.id=p_assigned_technician_id and exists(select 1 from public.user_roles ur where ur.user_id=au.id and ur.role='maintenance');
    if not found then raise exception 'MAINTENANCE_TECHNICIAN_INVALID';end if;
  else tech_name:=nullif(trim(coalesce(p_assigned_technician,'')),'');end if;
  update public.vehicle_maintenance_cases set
    status=p_status,progress=p_progress,
    diagnosis=case when p_diagnosis is null then diagnosis else nullif(trim(p_diagnosis),'') end,
    work_notes=case when p_work_notes is null then work_notes else nullif(trim(p_work_notes),'') end,
    parts_notes=case when p_parts_notes is null then parts_notes else nullif(trim(p_parts_notes),'') end,
    expected_completion_at=coalesce(p_expected_completion_at,expected_completion_at),
    assigned_technician=coalesce(tech_name,assigned_technician),assigned_technician_id=coalesce(p_assigned_technician_id,assigned_technician_id),
    estimated_cost=coalesce(p_estimated_cost,estimated_cost),
    service_cost=coalesce(p_actual_cost,service_cost),actual_cost=coalesce(p_actual_cost,service_cost)+parts_actual_cost,
    delay_reason=case when p_delay_reason is null then delay_reason else nullif(trim(p_delay_reason),'') end,
    ready_at=case when p_status='ready'then coalesce(ready_at,now())else ready_at end,
    ready_declared_by=case when p_status='ready'then u else ready_declared_by end,
    readiness_approved_at=case when p_status='ready'then null else readiness_approved_at end,
    readiness_approved_by=case when p_status='ready'then null else readiness_approved_by end,
    readiness_approval_notes=case when p_status='ready'then null else readiness_approval_notes end,
    updated_at=now()
  where id=p_case_id and arrived_at is not null and completed_at is null returning * into c;
  if not found then raise exception 'MAINTENANCE_CASE_NOT_OPEN';end if;
  insert into public.vehicle_maintenance_updates(case_id,status,progress,diagnosis,work_notes,parts_notes,assigned_technician,assigned_technician_id,estimated_cost,actual_cost,delay_reason,expected_completion_at,created_by)
  values(c.id,c.status,c.progress,c.diagnosis,c.work_notes,c.parts_notes,c.assigned_technician,c.assigned_technician_id,c.estimated_cost,c.actual_cost,c.delay_reason,c.expected_completion_at,u);
  return c;
end$$;

create or replace function public.maintenance_approve_readiness(p_case_id uuid, p_notes text default null)
returns public.vehicle_maintenance_cases
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id for update;
  if not found or c.completed_at is not null or c.arrived_at is null then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  if c.readiness_approved_at is not null then raise exception 'MAINTENANCE_READINESS_ALREADY_APPROVED'; end if;
  if c.status <> 'ready' or c.progress <> 100 then raise exception 'MAINTENANCE_READINESS_NOT_READY'; end if;
  if c.diagnosis is null then raise exception 'MAINTENANCE_READY_REQUIRES_DIAGNOSIS'; end if;
  if c.work_notes is null then raise exception 'MAINTENANCE_READY_REQUIRES_WORK_NOTES'; end if;
  if exists (select 1 from public.vehicle_maintenance_parts p where p.case_id = c.id and p.part_status = 'issued') then raise exception 'MAINTENANCE_READY_REQUIRES_INSTALLED_PARTS'; end if;
  update public.vehicle_maintenance_cases
     set readiness_approved_at = now(),
         readiness_approved_by = u,
         readiness_approval_notes = nullif(trim(coalesce(p_notes, '')), ''),
         updated_at = now()
   where id = c.id
   returning * into c;

  update public.vehicle_maintenance_stages
     set status = 'completed',
         completed_at = now(),
         completed_by = u,
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
   where case_id = c.id and stage_key = 'inspection';
  update public.vehicle_maintenance_stages
     set status = 'active',
         started_at = now(),
         started_by = u
   where case_id = c.id and stage_key = 'handover';

  return c;
end;
$$;
