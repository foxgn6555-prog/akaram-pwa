-- ═══════════════════════════════════════════════════════════════
-- 00005 · الموظفون + RLS + الفهارس + ربط إدارة القسم
-- قرارات معمارية:
--  · لا عمود role هنا — الأدوار في user_roles فقط (مصدر واحد للحقيقة)
--  · user_id اختياري: يُملأ عند أول دخول ( HR ينشئ الموظف قبل حسابه)
-- ═══════════════════════════════════════════════════════════════

create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid unique references auth.users (id) on delete set null,
  employee_number   text not null unique,
  full_name         text not null,
  email             text unique,
  phone             text,
  department_id     uuid references public.departments (id) on delete set null,
  manager_id        uuid references public.employees (id) on delete set null,
  job_title         text,
  hire_date         date not null default current_date,
  employment_status text not null default 'active'
                    check (employment_status in ('active', 'on_leave', 'suspended', 'terminated')),
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.employees enable row level security;

-- ── SELECT ──
-- الموظف يرى نفسه
create policy "employees: قراءة نفسي" on public.employees
  for select to authenticated
  using (user_id = auth.uid());

-- HR / Finance / IT / Super Admin يرون الجميع
create policy "employees: قراءة للإدارات" on public.employees
  for select to authenticated
  using (app.has_role(
    array['hr_officer', 'finance_officer', 'it_admin', 'super_admin']));

-- مدير القسم يرى موظفي قسمه
create policy "employees: مدير يرى قسمه" on public.employees
  for select to authenticated
  using (department_id = (select app.current_department_id())
         and (app.has_role(array['department_manager'])));

-- ── INSERT / UPDATE / DELETE ──
create policy "employees: إنشاء بواسطة HR" on public.employees
  for insert to authenticated
  with check (app.has_role(array['hr_officer', 'super_admin']));

create policy "employees: تعديل بواسطة HR" on public.employees
  for update to authenticated
  using      (app.has_role(array['hr_officer', 'super_admin'])
              or user_id = auth.uid())          -- الموظف يحدّث بياناته الشخصية
  with check (app.has_role(array['hr_officer', 'super_admin'])
              or user_id = auth.uid());

create policy "employees: حذف بواسطة Super Admin" on public.employees
  for delete to authenticated
  using (app.has_role(array['super_admin']));

-- ── فهارس مسرّعة للـ RLS والاستعلامات ──
create index idx_employees_user          on public.employees (user_id);
create index idx_employees_department    on public.employees (department_id);
create index idx_employees_manager       on public.employees (manager_id);
create index idx_employees_status        on public.employees (employment_status);
create index idx_employees_name_trgm     on public.employees using gin (full_name gin_trgm_ops);

-- ربط إدارة القسم (تأجيل مقصود من 00004)
alter table public.departments
  add constraint departments_manager_fk
  foreign key (manager_id) references public.employees (id) on delete set null;

create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function app.set_updated_at();

create trigger trg_employees_version
  before update on public.employees
  for each row execute function app.bump_version();
