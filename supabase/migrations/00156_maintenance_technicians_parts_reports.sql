-- 00156 · إعادة ترتيب الصيانة: فنيون من الهيكل التنظيمي، قطع وكلف تلقائية، تقارير كاملة التفاصيل
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- (أ) الفنيون: خانة «تخصص صيانة» على عقدة المسمى الوظيفي (كخانة «يقود آليات»). كل موظف مُعيَّن على مسمى
--     بتخصص صيانة هو فني متاح للتعيين. يمكن تعيين فني أو أكثر على الحالة الواحدة (جدول ربط بتاريخ تعيين/إنهاء).
-- (ب) القطع: تُصرف من المخزن فقط أثناء التحديث، بكلفة المخزن (المتوسط المرجّح لأسعار أوامر الشراء) —
--     كلفة القطع والكلفة الفعلية تُحتسبان تلقائياً (كانت كذلك منذ 00090؛ هنا نُلزم بها ونعرضها بوضوح).
-- (ج) الجاهزية تتطلب فنياً معيَّناً واحداً على الأقل (كود واضح MAINTENANCE_READY_REQUIRES_TECHNICIAN).
-- (د) التقارير: maintenance_cases_for_day / maintenance_vehicle_cases / maintenance_archive_list تُعاد
--     بأعمدة كاملة (الفنيون، القطع، الأوقات المحسوبة، الكلف، التصحيح)، ودالة جديدة لغرفة العمليات
--     operational_maintenance_report تعرض كل التفاصيل (بدل الصف الخام الذي أظهر «—» في الجدول).
-- (هـ) التسلسل الزمني يتضمن أحداث تعيين/إنهاء الفنيين.

-- ═══════════════ (أ) تخصص الصيانة على المسمى الوظيفي ═══════════════
alter table public.departments add column if not exists maintenance_specialty text;
alter table public.departments drop constraint if exists departments_maintenance_specialty_check;
alter table public.departments add constraint departments_maintenance_specialty_check
  check (maintenance_specialty is null or maintenance_specialty in ('mechanical','electrical','bodywork','tires','hydraulic','ac','general'));
alter table public.departments drop constraint if exists departments_specialty_requires_title;
alter table public.departments add constraint departments_specialty_requires_title check (maintenance_specialty is null or is_job_title);
comment on column public.departments.maintenance_specialty is 'المسمى فني صيانة بهذا التخصص (mechanical/electrical/bodywork/tires/hydraulic/ac/general) — null: ليس فنياً';

create or replace function app.maintenance_specialty_label(p text) returns text language sql immutable as $$
  select case p when 'mechanical' then 'ميكانيك' when 'electrical' then 'كهرباء' when 'bodywork' then 'سمكرة وحدادة'
                when 'tires' then 'إطارات' when 'hydraulic' then 'هيدروليك' when 'ac' then 'تبريد وتكييف' when 'general' then 'فني عام' else coalesce(p, '') end
$$;

-- الهيكل: العرض والحفظ والمسميات (إضافة التخصص)
drop function if exists public.hr_departments_overview();
create function public.hr_departments_overview()
returns table(id uuid, name text, code text, parent_id uuid, is_active boolean, manager_id uuid, manager_name text,
              employees_active int, employees_total int, children int, created_at timestamptz, is_job_title boolean, drives_vehicles boolean,
              maintenance_specialty text)
language sql stable security definer set search_path = public, app as $$
  select d.id, d.name, d.code, d.parent_id, d.is_active, d.manager_id, m.full_name,
    (select count(*)::int from public.employees e where e.employment_status <> 'terminated' and e.archived_at is null
        and (case when d.is_job_title then e.job_title_id = d.id else e.department_id = d.id end)),
    (select count(*)::int from public.employees e where (case when d.is_job_title then e.job_title_id = d.id else e.department_id = d.id end)),
    (select count(*)::int from public.departments c where c.parent_id = d.id and c.is_active),
    d.created_at, d.is_job_title, d.drives_vehicles, d.maintenance_specialty
  from public.departments d
  left join public.employees m on m.id = d.manager_id
  where d.archived_at is null and app.has_role(array['hr_officer', 'super_admin', 'it_admin'])
  order by d.name;
$$;
grant execute on function public.hr_departments_overview() to authenticated;

drop function if exists public.hr_department_save(uuid, text, text, uuid, boolean, uuid, boolean, boolean);
create function public.hr_department_save(p_id uuid, p_name text, p_code text, p_parent uuid, p_is_active boolean default true, p_manager uuid default null,
                                          p_is_job_title boolean default false, p_drives_vehicles boolean default false, p_maintenance_specialty text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid := p_id; v_cur uuid; v_n int; v_code text := upper(trim(coalesce(p_code, ''))); v_title boolean := coalesce(p_is_job_title, false);
        v_drives boolean := coalesce(p_drives_vehicles, false) and coalesce(p_is_job_title, false); parent_rec public.departments;
        v_spec text := case when coalesce(p_is_job_title, false) then nullif(trim(coalesce(p_maintenance_specialty, '')), '') else null end;
begin
  if not app.has_role(array['hr_officer', 'super_admin', 'it_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'HR_DEPT_NAME_REQUIRED'; end if;
  if v_code = '' then raise exception 'HR_DEPT_CODE_REQUIRED'; end if;
  if v_spec is not null and v_spec not in ('mechanical','electrical','bodywork','tires','hydraulic','ac','general') then raise exception 'HR_MAINTENANCE_SPECIALTY_INVALID'; end if;
  if exists (select 1 from public.departments d where d.code = v_code and (p_id is null or d.id <> p_id)) then raise exception 'HR_DEPT_CODE_TAKEN'; end if;
  if p_parent is not null then
    if p_id is not null and p_parent = p_id then raise exception 'HR_DEPT_CYCLE'; end if;
    select * into parent_rec from public.departments where id = p_parent and archived_at is null;
    if not found then raise exception 'HR_DEPT_PARENT_INVALID'; end if;
    if parent_rec.is_job_title then raise exception 'HR_DEPT_PARENT_IS_JOB_TITLE'; end if;
    if p_id is not null then
      v_cur := p_parent;
      for v_n in 1..64 loop
        exit when v_cur is null;
        if v_cur = p_id then raise exception 'HR_DEPT_CYCLE'; end if;
        select parent_id into v_cur from public.departments where id = v_cur;
      end loop;
    end if;
  end if;
  if v_title and p_parent is null then raise exception 'HR_JOB_TITLE_PARENT_REQUIRED'; end if;
  if v_title and exists (select 1 from public.departments d where d.parent_id = p_parent and d.is_job_title and d.archived_at is null
                          and lower(trim(d.name)) = lower(trim(p_name)) and (p_id is null or d.id <> p_id)) then raise exception 'HR_JOB_TITLE_NAME_TAKEN'; end if;
  if p_manager is not null and not exists (select 1 from public.employees where id = p_manager and employment_status <> 'terminated') then raise exception 'HR_DEPT_MANAGER_INVALID'; end if;

  if p_id is null then
    insert into public.departments (name, code, parent_id, is_active, manager_id, is_job_title, drives_vehicles, maintenance_specialty)
    values (trim(p_name), v_code, p_parent, coalesce(p_is_active, true), p_manager, v_title, v_drives, v_spec) returning id into v_id;
  else
    if not exists (select 1 from public.departments where id = p_id) then raise exception 'HR_NOT_FOUND'; end if;
    if v_title and exists (select 1 from public.departments where parent_id = p_id and archived_at is null) then raise exception 'HR_JOB_TITLE_HAS_CHILDREN'; end if;
    if not v_title and exists (select 1 from public.employees where job_title_id = p_id and employment_status <> 'terminated') then raise exception 'HR_JOB_TITLE_IN_USE'; end if;
    if p_is_active is false then
      if exists (select 1 from public.employees where (department_id = p_id or job_title_id = p_id) and employment_status <> 'terminated') then raise exception 'HR_DEPT_HAS_EMPLOYEES'; end if;
      if exists (select 1 from public.departments where parent_id = p_id and is_active) then raise exception 'HR_DEPT_HAS_CHILDREN'; end if;
    end if;
    update public.departments set name = trim(p_name), code = v_code, parent_id = p_parent, is_active = coalesce(p_is_active, true), manager_id = p_manager,
                                  is_job_title = v_title, drives_vehicles = v_drives, maintenance_specialty = v_spec, updated_at = now()
     where id = p_id;
  end if;
  return v_id;
end$$;
grant execute on function public.hr_department_save(uuid, text, text, uuid, boolean, uuid, boolean, boolean, text) to authenticated;

drop function if exists public.hr_job_titles(boolean);
create function public.hr_job_titles(p_include_inactive boolean default false)
returns table(id uuid, name text, code text, department_id uuid, department_name text, drives_vehicles boolean, is_active boolean, employees_active int, maintenance_specialty text)
language sql stable security definer set search_path = public, app as $$
  select t.id, t.name, t.code, p.id, p.name, t.drives_vehicles, t.is_active,
         (select count(*)::int from public.employees e where e.job_title_id = t.id and e.employment_status <> 'terminated' and e.archived_at is null),
         t.maintenance_specialty
  from public.departments t join public.departments p on p.id = t.parent_id
  where t.is_job_title and t.archived_at is null and (p_include_inactive or t.is_active)
    and app.has_role(array['hr_officer', 'super_admin', 'it_admin', 'ops_room', 'finance_officer'])
  order by p.name, t.name;
$$;
grant execute on function public.hr_job_titles(boolean) to authenticated;

-- ═══════════════ الفنيون المتاحون (موظفون بمسمى تخصص صيانة) ═══════════════
create or replace function public.maintenance_technician_options(p_search text default null)
returns table(employee_id uuid, full_name text, employee_number text, job_title text, specialty text, specialty_label text, employment_status text, open_cases int)
language plpgsql stable security definer set search_path = public, app as $$
declare q text := trim(coalesce(p_search, ''));
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  return query
  select e.id, e.full_name, e.employee_number, t.name, t.maintenance_specialty, app.maintenance_specialty_label(t.maintenance_specialty), e.employment_status,
         (select count(*)::int from public.vehicle_maintenance_case_technicians ct join public.vehicle_maintenance_cases c on c.id = ct.case_id
           where ct.employee_id = e.id and ct.released_at is null and c.completed_at is null)
  from public.employees e join public.departments t on t.id = e.job_title_id
  where e.employment_status <> 'terminated' and e.archived_at is null and t.maintenance_specialty is not null and t.is_active
    and (q = '' or e.full_name ilike '%' || q || '%' or e.employee_number ilike '%' || q || '%' or t.name ilike '%' || q || '%')
  order by t.maintenance_specialty, e.full_name limit 300;
end$$;
revoke all on function public.maintenance_technician_options(text) from public, anon;
grant execute on function public.maintenance_technician_options(text) to authenticated;

-- ═══════════════ جدول تعيين الفنيين على الحالات ═══════════════
create table if not exists public.vehicle_maintenance_case_technicians (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vehicle_maintenance_cases(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  specialty text not null,
  technician_name text not null,
  notes text,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references auth.users(id),
  released_at timestamptz,
  released_by uuid references auth.users(id),
  release_notes text
);
create unique index if not exists maintenance_case_technicians_active_uq on public.vehicle_maintenance_case_technicians(case_id, employee_id) where released_at is null;
create index if not exists maintenance_case_technicians_case on public.vehicle_maintenance_case_technicians(case_id);
alter table public.vehicle_maintenance_case_technicians enable row level security;
drop policy if exists "maintenance case technicians authorized read" on public.vehicle_maintenance_case_technicians;
create policy "maintenance case technicians authorized read" on public.vehicle_maintenance_case_technicians for select
  using (app.has_role(array['maintenance', 'ops_room', 'super_admin', 'central_garage_officer']));
drop trigger if exists trg_audit_maintenance_case_technicians on public.vehicle_maintenance_case_technicians;
create trigger trg_audit_maintenance_case_technicians after insert or update or delete on public.vehicle_maintenance_case_technicians for each row execute function app.audit_trigger();

-- نص الفنيين النشطين «اسم (تخصص)، …» + مزامنة الحقل القديم assigned_technician للتوافق
create or replace function app.maintenance_technicians_text(p_case_id uuid) returns text language sql stable as $$
  select string_agg(ct.technician_name || ' (' || app.maintenance_specialty_label(ct.specialty) || ')', '، ' order by ct.assigned_at)
  from public.vehicle_maintenance_case_technicians ct where ct.case_id = p_case_id and ct.released_at is null
$$;
create or replace function app.maintenance_sync_technicians(p_case_id uuid) returns void language sql as $$
  update public.vehicle_maintenance_cases set assigned_technician = app.maintenance_technicians_text(p_case_id), updated_at = now() where id = p_case_id
$$;

create or replace function public.maintenance_assign_technician(p_case_id uuid, p_employee_id uuid, p_notes text default null)
returns public.vehicle_maintenance_case_technicians language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); c public.vehicle_maintenance_cases; e public.employees; t public.departments; r public.vehicle_maintenance_case_technicians;
begin
  if not app.has_role(array['maintenance']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id for update;
  if not found or c.arrived_at is null or c.completed_at is not null then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  select * into e from public.employees where id = p_employee_id;
  if not found or e.employment_status = 'terminated' or e.archived_at is not null then raise exception 'MAINTENANCE_TECHNICIAN_INVALID'; end if;
  select * into t from public.departments where id = e.job_title_id and maintenance_specialty is not null;
  if not found then raise exception 'MAINTENANCE_TECHNICIAN_NOT_TECHNICIAN_TITLE'; end if;
  if exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c.id and employee_id = e.id and released_at is null) then raise exception 'MAINTENANCE_TECHNICIAN_ALREADY_ASSIGNED'; end if;
  insert into public.vehicle_maintenance_case_technicians(case_id, employee_id, specialty, technician_name, notes, assigned_by)
  values (c.id, e.id, t.maintenance_specialty, e.full_name, nullif(trim(coalesce(p_notes, '')), ''), u) returning * into r;
  perform app.maintenance_sync_technicians(c.id);
  return r;
end$$;

create or replace function public.maintenance_release_technician(p_case_id uuid, p_employee_id uuid, p_notes text default null)
returns public.vehicle_maintenance_case_technicians language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); r public.vehicle_maintenance_case_technicians;
begin
  if not app.has_role(array['maintenance']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  if not exists (select 1 from public.vehicle_maintenance_cases where id = p_case_id and completed_at is null) then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  update public.vehicle_maintenance_case_technicians set released_at = now(), released_by = u, release_notes = nullif(trim(coalesce(p_notes, '')), '')
   where case_id = p_case_id and employee_id = p_employee_id and released_at is null returning * into r;
  if not found then raise exception 'MAINTENANCE_TECHNICIAN_NOT_ASSIGNED'; end if;
  perform app.maintenance_sync_technicians(p_case_id);
  return r;
end$$;

create or replace function public.maintenance_case_technicians(p_case_id uuid)
returns table(id uuid, case_id uuid, employee_id uuid, technician_name text, employee_number text, specialty text, specialty_label text, notes text,
              assigned_at timestamptz, released_at timestamptz, release_notes text, active boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare c public.vehicle_maintenance_cases;
begin
  select * into c from public.vehicle_maintenance_cases where id = p_case_id;
  if not found or not (app.has_role(array['maintenance', 'central_garage_officer', 'ops_room', 'super_admin']) or c.manager_id = auth.uid()) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
  return query
  select ct.id, ct.case_id, ct.employee_id, ct.technician_name, e.employee_number, ct.specialty, app.maintenance_specialty_label(ct.specialty), ct.notes,
         ct.assigned_at, ct.released_at, ct.release_notes, ct.released_at is null
  from public.vehicle_maintenance_case_technicians ct join public.employees e on e.id = ct.employee_id
  where ct.case_id = p_case_id order by ct.released_at is not null, ct.assigned_at;
end$$;
revoke all on function public.maintenance_assign_technician(uuid, uuid, text), public.maintenance_release_technician(uuid, uuid, text), public.maintenance_case_technicians(uuid) from public, anon;
grant execute on function public.maintenance_assign_technician(uuid, uuid, text), public.maintenance_release_technician(uuid, uuid, text), public.maintenance_case_technicians(uuid) to authenticated;

-- ═══════════════ (ج) التحديث والجاهزية: فني معيَّن إلزامي عند «جاهزة» ═══════════════
-- p_assigned_technician / p_assigned_technician_id أصبحا مهملين (التعيين عبر maintenance_assign_technician)؛ نُبقي التوقيع للتوافق.
create or replace function public.maintenance_update_case(p_case_id uuid,p_status text,p_progress integer,p_diagnosis text default null,p_work_notes text default null,p_parts_notes text default null,p_expected_completion_at timestamptz default null,p_assigned_technician text default null,p_estimated_cost numeric default null,p_actual_cost numeric default null,p_delay_reason text default null,p_assigned_technician_id uuid default null)
returns public.vehicle_maintenance_cases language plpgsql security definer set search_path=public,app as $$
declare u uuid:=auth.uid();c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['maintenance'])then raise exception 'MAINTENANCE_FORBIDDEN';end if;
  if p_status not in('at_maintenance','diagnosing','waiting_parts','in_repair','paused','ready')or p_progress not between 0 and 100 then raise exception 'MAINTENANCE_UPDATE_INVALID';end if;
  if p_actual_cost<0 or p_estimated_cost<0 then raise exception 'MAINTENANCE_COST_INVALID';end if;
  select * into c from public.vehicle_maintenance_cases where id=p_case_id for update;
  if not found or c.arrived_at is null or c.completed_at is not null then raise exception 'MAINTENANCE_CASE_NOT_OPEN';end if;
  if p_status='ready' then
    if p_progress<>100 then raise exception 'MAINTENANCE_READINESS_NOT_READY';end if;
    if coalesce(nullif(trim(coalesce(p_diagnosis,'')),''),c.diagnosis) is null then raise exception 'MAINTENANCE_READY_REQUIRES_DIAGNOSIS';end if;
    if coalesce(nullif(trim(coalesce(p_work_notes,'')),''),c.work_notes) is null then raise exception 'MAINTENANCE_READY_REQUIRES_WORK_NOTES';end if;
    if not exists(select 1 from public.vehicle_maintenance_case_technicians where case_id=c.id and released_at is null) then raise exception 'MAINTENANCE_READY_REQUIRES_TECHNICIAN';end if;
    if exists(select 1 from public.vehicle_maintenance_parts where case_id=c.id and part_status='issued') then raise exception 'MAINTENANCE_READY_REQUIRES_INSTALLED_PARTS';end if;
  end if;
  update public.vehicle_maintenance_cases set
    status=p_status,progress=p_progress,
    diagnosis=case when p_diagnosis is null then diagnosis else nullif(trim(p_diagnosis),'') end,
    work_notes=case when p_work_notes is null then work_notes else nullif(trim(p_work_notes),'') end,
    parts_notes=case when p_parts_notes is null then parts_notes else nullif(trim(p_parts_notes),'') end,
    expected_completion_at=coalesce(p_expected_completion_at,expected_completion_at),
    assigned_technician=coalesce(app.maintenance_technicians_text(c.id),assigned_technician),
    estimated_cost=coalesce(p_estimated_cost,estimated_cost),
    service_cost=coalesce(p_actual_cost,service_cost),actual_cost=coalesce(p_actual_cost,service_cost)+parts_actual_cost,
    delay_reason=case when p_delay_reason is null then delay_reason else nullif(trim(p_delay_reason),'') end,
    ready_at=case when p_status='ready'then coalesce(ready_at,now())else ready_at end,
    ready_declared_by=case when p_status='ready'then u else ready_declared_by end,
    readiness_approved_at=case when p_status='ready'then null else readiness_approved_at end,
    readiness_approved_by=case when p_status='ready'then null else readiness_approved_by end,
    readiness_approval_notes=case when p_status='ready'then null else readiness_approval_notes end,
    updated_at=now()
  where id=c.id returning * into c;
  insert into public.vehicle_maintenance_updates(case_id,status,progress,diagnosis,work_notes,parts_notes,assigned_technician,assigned_technician_id,estimated_cost,actual_cost,delay_reason,expected_completion_at,created_by)
  values(c.id,c.status,c.progress,c.diagnosis,c.work_notes,c.parts_notes,c.assigned_technician,c.assigned_technician_id,c.estimated_cost,c.actual_cost,c.delay_reason,c.expected_completion_at,u);
  return c;
end$$;

create or replace function public.maintenance_approve_readiness(p_case_id uuid, p_notes text default null)
returns public.vehicle_maintenance_cases language plpgsql volatile security definer set search_path = public, app as $$
declare u uuid := auth.uid(); c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['maintenance']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id for update;
  if not found or c.completed_at is not null or c.arrived_at is null then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  if c.readiness_approved_at is not null then raise exception 'MAINTENANCE_READINESS_ALREADY_APPROVED'; end if;
  if c.status <> 'ready' or c.progress <> 100 then raise exception 'MAINTENANCE_READINESS_NOT_READY'; end if;
  if c.diagnosis is null then raise exception 'MAINTENANCE_READY_REQUIRES_DIAGNOSIS'; end if;
  if c.work_notes is null then raise exception 'MAINTENANCE_READY_REQUIRES_WORK_NOTES'; end if;
  if not exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c.id and released_at is null) then raise exception 'MAINTENANCE_READY_REQUIRES_TECHNICIAN'; end if;
  if exists (select 1 from public.vehicle_maintenance_parts p where p.case_id = c.id and p.part_status = 'issued') then raise exception 'MAINTENANCE_READY_REQUIRES_INSTALLED_PARTS'; end if;
  update public.vehicle_maintenance_cases
     set readiness_approved_at = now(), readiness_approved_by = u, readiness_approval_notes = nullif(trim(coalesce(p_notes, '')), ''), updated_at = now()
   where id = c.id returning * into c;
  update public.vehicle_maintenance_stages set status = 'completed', completed_at = now(), completed_by = u, notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
   where case_id = c.id and stage_key = 'inspection';
  update public.vehicle_maintenance_stages set status = 'active', started_at = now(), started_by = u where case_id = c.id and stage_key = 'handover';
  return c;
end$$;

-- صرف قطعة مع تركيب فوري (سلاسة: خطوة واحدة من حوار التحديث)
create or replace function public.maintenance_issue_and_install(p_case_id uuid, p_item_id uuid, p_quantity numeric, p_notes text default null, p_install_now boolean default true)
returns public.vehicle_maintenance_parts language plpgsql security definer set search_path = public, app as $$
declare p public.vehicle_maintenance_parts;
begin
  p := public.maintenance_issue_inventory(p_case_id, p_item_id, p_quantity, p_notes);
  if coalesce(p_install_now, false) then p := public.maintenance_install_issued_part(p.id); end if;
  return p;
end$$;
revoke all on function public.maintenance_issue_and_install(uuid, uuid, numeric, text, boolean) from public, anon;
grant execute on function public.maintenance_issue_and_install(uuid, uuid, numeric, text, boolean) to authenticated;

-- ═══════════════ (د) القوائم والتقارير بأعمدة كاملة ═══════════════
-- ملخص القطع «اسم ×كمية وحدة، …» (المصروفة/المركّبة فقط)
create or replace function app.maintenance_parts_summary(p_case_id uuid) returns text language sql stable as $$
  select string_agg(p.part_name || ' ×' || trim(to_char(p.quantity, 'FM999999990.###')) || ' ' || p.unit || case when p.part_status = 'issued' then ' (لم تُركَّب)' else '' end, '، ' order by p.created_at)
  from public.vehicle_maintenance_parts p where p.case_id = p_case_id and p.part_status in ('issued', 'installed')
$$;

drop function if exists public.maintenance_cases_for_day(date);
create function public.maintenance_cases_for_day(p_day date)
returns table(case_id uuid,departure_id uuid,breakdown_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,area_name text,sector_id int,manager_name text,
              status text,fault_type text,priority text,reported_at timestamptz,arrived_at timestamptz,diagnosis text,work_notes text,parts_notes text,progress smallint,
              expected_completion_at timestamptz,ready_at timestamptz,departed_maintenance_at timestamptz,completed_at timestamptz,assigned_technician text,
              estimated_cost numeric,actual_cost numeric,service_cost numeric,parts_actual_cost numeric,delay_reason text,assigned_technician_id uuid,ready_declared_by uuid,
              readiness_approved_at timestamptz,readiness_approved_by uuid,readiness_approval_notes text,stage_key text,stage_no smallint,
              technicians text,technician_count int,parts_count int,parts_summary text,wait_minutes int,maintenance_minutes int,
              corrected_at timestamptz,correction_reason text,correction_count int,updates_count int,last_update_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if not app.has_role(array['maintenance']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;
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
         (select max(mu.created_at) from public.vehicle_maintenance_updates mu where mu.case_id=c.id)
  from public.vehicle_maintenance_cases c
  join public.garage_departures d on d.id=c.departure_id
  join public.garage_vehicles v on v.id=c.vehicle_id
  join public.sectors se on se.id=d.sector_id
  left join public.vehicle_maintenance_stages st on st.case_id=c.id and st.status='active'
  where c.reported_at<p_day+1 and(c.completed_at is null or c.completed_at>=p_day)
  order by(c.completed_at is null)desc,c.reported_at desc;
end$$;
revoke all on function public.maintenance_cases_for_day(date) from public,anon;
grant execute on function public.maintenance_cases_for_day(date) to authenticated;

drop function if exists public.maintenance_archive_list(text, date, date);
create function public.maintenance_archive_list(p_search text default null, p_from date default null, p_to date default null)
returns table(case_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text, sector_id int, manager_name text, fault_type text, priority text,
              reported_at timestamptz, arrived_at timestamptz, ready_at timestamptz, readiness_approved_at timestamptz, departed_maintenance_at timestamptz, completed_at timestamptz,
              final_status text, diagnosis text, work_notes text, delay_reason text, progress smallint,
              technicians text, technician_count int, parts_count int, parts_summary text,
              estimated_cost numeric, service_cost numeric, parts_actual_cost numeric, actual_cost numeric,
              wait_minutes int, maintenance_minutes int, duration_days numeric, corrected_at timestamptz, correction_reason text)
language plpgsql stable security definer set search_path = public, app as $$
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
         c.corrected_at, c.correction_reason
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
   where c.completed_at is not null
     and (p_from is null or (c.completed_at at time zone 'Asia/Baghdad')::date >= p_from)
     and (p_to is null or (c.completed_at at time zone 'Asia/Baghdad')::date <= p_to)
     and (p_search is null or trim(p_search) = '' or v.vehicle_name ilike '%' || trim(p_search) || '%' or v.db_number ilike '%' || trim(p_search) || '%'
          or d.driver_name ilike '%' || trim(p_search) || '%' or coalesce(c.assigned_technician, '') ilike '%' || trim(p_search) || '%')
   order by c.completed_at desc limit 500;
end$$;
revoke all on function public.maintenance_archive_list(text, date, date) from public, anon;
grant execute on function public.maintenance_archive_list(text, date, date) to authenticated;

-- تقرير غرفة العمليات الكامل (يحل محل الصف الخام operational_maintenance_cases في الجدول؛ الدالة القديمة تبقى)
create or replace function public.operational_maintenance_report(p_from date, p_to date)
returns table(case_id uuid, id uuid, departure_id uuid, vehicle_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text, sector_id int, parent_sector text, manager_name text,
              status text, stage_key text, fault_type text, priority text, progress smallint,
              technicians text, technician_count int,
              reported_at timestamptz, arrived_at timestamptz, ready_at timestamptz, readiness_approved_at timestamptz, departed_maintenance_at timestamptz, completed_at timestamptz, expected_completion_at timestamptz,
              wait_minutes int, maintenance_minutes int, overdue boolean,
              diagnosis text, work_notes text, delay_reason text, parts_count int, parts_summary text,
              estimated_cost numeric, service_cost numeric, parts_actual_cost numeric, actual_cost numeric,
              updates_count int, last_update_at timestamptz, corrected_at timestamptz, correction_reason text, correction_count int)
language plpgsql stable security definer set search_path = public, app as $$
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
         c.corrected_at, c.correction_reason, c.correction_count
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
    left join public.vehicle_maintenance_stages st on st.case_id = c.id and st.status = 'active'
   where (c.reported_at at time zone 'Asia/Baghdad')::date between p_from and p_to or c.completed_at is null
   order by (c.completed_at is null) desc, c.reported_at desc;
end$$;
revoke all on function public.operational_maintenance_report(date, date) from public, anon;
grant execute on function public.operational_maintenance_report(date, date) to authenticated;

-- ═══════════════ (هـ) التسلسل الزمني: أحداث الفنيين ═══════════════
alter function public.maintenance_case_events(uuid) rename to maintenance_case_events_v150;
create function public.maintenance_case_events(p_case_id uuid)
returns table(event_key text,event_type text,title text,details text,happened_at timestamptz,actor_id uuid,status text,progress integer,sequence_no integer)
language sql stable security definer set search_path=public,app as $$
  with base as (select * from public.maintenance_case_events_v150(p_case_id)),
  tech as (
    select 'tech:'||ct.id::text||':assigned' k,'technician'::text t,'تعيين فني: '||ct.technician_name ttl,
           app.maintenance_specialty_label(ct.specialty)||coalesce(' · '||ct.notes,'') det,ct.assigned_at at,ct.assigned_by actor,null::text st,null::int prog,1500 seq
    from public.vehicle_maintenance_case_technicians ct where ct.case_id=p_case_id
    union all
    select 'tech:'||ct.id::text||':released','technician','إنهاء عمل الفني: '||ct.technician_name,
           app.maintenance_specialty_label(ct.specialty)||coalesce(' · '||ct.release_notes,''),ct.released_at,ct.released_by,null,null,1501
    from public.vehicle_maintenance_case_technicians ct where ct.case_id=p_case_id and ct.released_at is not null)
  select * from (select b.event_key,b.event_type,b.title,b.details,b.happened_at,b.actor_id,b.status,b.progress,b.sequence_no from base b
                 union all select k,t,ttl,det,at,actor,st,prog,seq from tech) x order by x.happened_at,x.sequence_no
$$;
revoke all on function public.maintenance_case_events(uuid), public.maintenance_case_events_v150(uuid) from public, anon;
grant execute on function public.maintenance_case_events(uuid) to authenticated;
