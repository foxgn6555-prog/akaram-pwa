-- ═══════════════════════════════════════════════════════════════
-- 00009 · الرواتب — دفعتان: كشف الرواتب الشهري + قسائم الموظفين
-- ═══════════════════════════════════════════════════════════════

create table public.payrolls (
  id           uuid primary key default gen_random_uuid(),
  period_month date not null check (period_month = date_trunc('month', period_month)),
  status       text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  notes        text,
  created_by   uuid references auth.users (id) on delete set null,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (period_month)
);

create table public.payslips (
  id           uuid primary key default gen_random_uuid(),
  payroll_id   uuid not null references public.payrolls (id) on delete cascade,
  employee_id  uuid not null references public.employees (id) on delete cascade,
  base_salary  numeric(12, 2) not null check (base_salary >= 0),
  allowances   jsonb not null default '{}',   -- {transport: 50000, housing: ...}
  deductions   jsonb not null default '{}',
  net_salary   numeric(12, 2) not null check (net_salary >= 0),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (payroll_id, employee_id)
);

alter table public.payrolls enable row level security;
alter table public.payslips  enable row level security;

-- الموظف يرى قسائمه فقط
create policy "payslips: قراءة قسائمي" on public.payslips
  for select to authenticated
  using (employee_id = (select app.current_employee_id()));

-- HR / Finance / Super Admin يرون كل الكشوف
create policy "payslips: قراءة للإدارات" on public.payslips
  for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'super_admin']));

create policy "payrolls: قراءة للإدارات" on public.payrolls
  for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'super_admin']));

-- الكتابة: Finance / HR (توليد الكشوف) / Super Admin
create policy "payrolls: إدارة بواسطة المالية" on public.payrolls
  for all to authenticated
  using      (app.has_role(array['finance_officer', 'hr_officer', 'super_admin']))
  with check (app.has_role(array['finance_officer', 'hr_officer', 'super_admin']));

create policy "payslips: إدارة بواسطة المالية" on public.payslips
  for all to authenticated
  using      (app.has_role(array['finance_officer', 'hr_officer', 'super_admin']))
  with check (app.has_role(array['finance_officer', 'hr_officer', 'super_admin']));

create index idx_payrolls_period    on public.payrolls (period_month desc);
create index idx_payslips_payroll   on public.payslips (payroll_id);
create index idx_payslips_employee  on public.payslips (employee_id);

create trigger trg_payrolls_updated_at
  before update on public.payrolls for each row execute function app.set_updated_at();
create trigger trg_payrolls_version
  before update on public.payrolls for each row execute function app.bump_version();
create trigger trg_payslips_updated_at
  before update on public.payslips for each row execute function app.set_updated_at();
