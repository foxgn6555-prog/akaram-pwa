-- ═══════════════════════════════════════════════════════════════
-- 00011 · الميزانية والتخصيصات (Finance)
-- ═══════════════════════════════════════════════════════════════

create table public.budget_allocations (
  id               uuid primary key default gen_random_uuid(),
  fiscal_year      integer not null check (fiscal_year between 2020 and 2100),
  department_id    uuid not null references public.departments (id) on delete restrict,
  category         text not null,                          -- بند الميزانية
  allocated_amount numeric(14, 2) not null check (allocated_amount >= 0),
  spent_amount     numeric(14, 2) not null default 0 check (spent_amount >= 0),
  notes            text,
  created_by       uuid references auth.users (id) on delete set null,
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (fiscal_year, department_id, category),
  check (spent_amount <= allocated_amount)
);

alter table public.budget_allocations enable row level security;

create policy "budget: قراءة للمالية و HR" on public.budget_allocations
  for select to authenticated
  using (app.has_role(array['finance_officer', 'hr_officer', 'super_admin']));

create policy "budget: مدير يرى قسمه" on public.budget_allocations
  for select to authenticated
  using ((app.has_role(array['department_manager']))
        and department_id = (select app.current_department_id()));

create policy "budget: إدارة بواسطة المالية" on public.budget_allocations
  for all to authenticated
  using      (app.has_role(array['finance_officer', 'super_admin']))
  with check (app.has_role(array['finance_officer', 'super_admin']));

create index idx_budget_year   on public.budget_allocations (fiscal_year desc);
create index idx_budget_dept   on public.budget_allocations (department_id);

create trigger trg_budget_updated_at
  before update on public.budget_allocations for each row execute function app.set_updated_at();
create trigger trg_budget_version
  before update on public.budget_allocations for each row execute function app.bump_version();
