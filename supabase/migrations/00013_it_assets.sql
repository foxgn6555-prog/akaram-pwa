-- ═══════════════════════════════════════════════════════════════
-- 00013 · أصول تقنية المعلومات (تسليم/استرجاع)
-- ═══════════════════════════════════════════════════════════════

create table public.it_assets (
  id             uuid primary key default gen_random_uuid(),
  asset_tag      text not null unique,
  name           text not null,
  category       text not null default 'laptop'
                 check (category in ('laptop', 'desktop', 'phone', 'printer', 'network', 'furniture', 'other')),
  serial_number  text unique,
  status         text not null default 'available'
                 check (status in ('available', 'assigned', 'maintenance', 'retired')),
  assigned_to    uuid references public.employees (id) on delete set null,
  assigned_at    timestamptz,
  purchase_date  date,
  warranty_until date,
  specs          jsonb not null default '{}',
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- الأصل المُسلَّم يجب أن تكون حالته assigned
  check ( (assigned_to is null and status <> 'assigned')
       or (assigned_to is not null and status = 'assigned') )
);

alter table public.it_assets enable row level security;

create policy "assets: قراءة الأصول بواسطة IT" on public.it_assets
  for select to authenticated
  using (app.has_role(array['it_admin', 'super_admin']));

-- الموظف يرى الأصول المُسلَّمة إليه
create policy "assets: قراءة أصولي" on public.it_assets
  for select to authenticated
  using (assigned_to = (select app.current_employee_id()));

create policy "assets: إدارة بواسطة IT" on public.it_assets
  for all to authenticated
  using      (app.has_role(array['it_admin', 'super_admin']))
  with check (app.has_role(array['it_admin', 'super_admin']));

create index idx_assets_assigned on public.it_assets (assigned_to) where assigned_to is not null;
create index idx_assets_status   on public.it_assets (status);

create trigger trg_assets_updated_at
  before update on public.it_assets for each row execute function app.set_updated_at();
create trigger trg_assets_version
  before update on public.it_assets for each row execute function app.bump_version();
