-- ═══════════════════════════════════════════════════════════════
-- 00010 · الحضور والانصراف
-- ═══════════════════════════════════════════════════════════════

create table public.attendance_records (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date   date not null,
  check_in    timestamptz,
  check_out   timestamptz,
  status      text not null default 'present'
              check (status in ('present', 'absent', 'on_leave', 'holiday', 'remote')),
  notes       text,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (employee_id, work_date),
  check (check_out is null or check_in is null or check_out > check_in)
);

alter table public.attendance_records enable row level security;

-- الموظف يرى سجله ويسجل دخوله/خروجه اليومي بنفسه
create policy "attendance: قراءة سجلي" on public.attendance_records
  for select to authenticated
  using (employee_id = (select app.current_employee_id()));

create policy "attendance: تسجيل يومي بنفسي" on public.attendance_records
  for insert to authenticated
  with check (employee_id = (select app.current_employee_id())
              and work_date = current_date);

-- الموظف قد يصحّح سجله لنفس اليوم فقط (قبل مراجعة HR)
create policy "attendance: تعديل سجلي اليوم" on public.attendance_records
  for update to authenticated
  using      (employee_id = (select app.current_employee_id()) and work_date = current_date)
  with check (employee_id = (select app.current_employee_id()) and work_date = current_date);

-- HR / Finance / المدير (قسمه) يرون التقارير
create policy "attendance: قراءة للإدارات" on public.attendance_records
  for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'super_admin']));

create policy "attendance: مدير يرى قسمه" on public.attendance_records
  for select to authenticated
  using ((app.has_role(array['department_manager']))
        and exists (
          select 1 from public.employees e
          where e.id = attendance_records.employee_id
            and e.department_id = (select app.current_department_id())
        ));

create policy "attendance: إدارة بواسطة HR" on public.attendance_records
  for update to authenticated
  using      (app.has_role(array['hr_officer', 'super_admin']))
  with check (app.has_role(array['hr_officer', 'super_admin']));

create index idx_attendance_employee_date on public.attendance_records (employee_id, work_date desc);
create index idx_attendance_work_date     on public.attendance_records (work_date desc);

create trigger trg_attendance_updated_at
  before update on public.attendance_records for each row execute function app.set_updated_at();
create trigger trg_attendance_version
  before update on public.attendance_records for each row execute function app.bump_version();
