-- ═══════════════════════════════════════════════════════════════
-- 00004 · الأقسام + RLS + Indexes   (سياسات كل domain داخل migration الـ domain — ADR 003)
-- ═══════════════════════════════════════════════════════════════

create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  parent_id  uuid references public.departments (id) on delete set null,
  manager_id uuid,                        -- FK للموظفين تُضاف في 00005 (تجنّب المرجعية الدائرية)
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.departments is 'أقسام الشركة — هيكل شجري عبر parent_id';

alter table public.departments enable row level security;

-- القراءة: كل موظف مُصادق (الهيكل التنظيمي معلوم داخلياً)
create policy "departments: قراءة للمصادقين" on public.departments
  for select to authenticated
  using (true);

-- الكتابة: HR / Super Admin فقط
create policy "departments: إدارة بواسطة HR" on public.departments
  for all to authenticated
  using      (app.has_role(array['hr_officer', 'super_admin']))
  with check (app.has_role(array['hr_officer', 'super_admin']));

create index idx_departments_parent on public.departments (parent_id);
create index idx_departments_active on public.departments (is_active) where is_active;

-- updated_at تلقائي
create trigger trg_departments_updated_at
  before update on public.departments
  for each row execute function app.set_updated_at();
