-- ═══════════════════════════════════════════════════════════════
-- 00022 · الفروع — البوابة التقنية (وحدة الفروع)
--  · الشركة قد تملك عدة فروع؛ كل فرع له رمز فريد
--  · الموظف ينتمي لفرع (اختياري — المركز الرئيسي بلا فرع محدد)
-- ═══════════════════════════════════════════════════════════════

create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  city       text,
  address    text,
  phone      text,
  is_active  boolean not null default true,
  version    integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.branches enable row level security;

-- القراءة: كل المصادقين (الموظف يرى اسم فرعه، الإدارات ترى الكل)
create policy "branches: قراءة للمصادقين" on public.branches
  for select to authenticated
  using (true);

-- الإدارة: IT / HR / Super Admin
create policy "branches: إدارة بواسطة IT وHR" on public.branches
  for all to authenticated
  using      (app.has_role(array['it_admin', 'hr_officer', 'super_admin']))
  with check (app.has_role(array['it_admin', 'hr_officer', 'super_admin']));

create index idx_branches_active on public.branches (is_active) where is_active;

-- ربط الموظف بالفرع
alter table public.employees add column branch_id uuid references public.branches (id) on delete set null;
create index idx_employees_branch on public.employees (branch_id);

create trigger trg_branches_updated_at
  before update on public.branches for each row execute function app.set_updated_at();
create trigger trg_branches_version
  before update on public.branches for each row execute function app.bump_version();

-- تدقيق
do $$ begin
  execute format('create trigger trg_audit_branches after insert or update or delete on public.branches
                  for each row execute function app.audit_trigger();');
end $$;
