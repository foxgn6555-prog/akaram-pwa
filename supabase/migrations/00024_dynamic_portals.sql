-- ═══════════════════════════════════════════════════════════════
-- 00024 · البوابات الديناميكية — إنشاء بوابة من داخل IT
--  · النموذجان: تركيب من مكتبة الوحدات/الصفحات أو بوابة فارغة «قيد البناء»
--  · خط أحمر: الصفحات الفعلية مكونات كود مسبقة — هنا تعريف لا كود
-- ═══════════════════════════════════════════════════════════════

create table public.dynamic_portals (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,              -- مسار: /p/{slug}
  name        text not null,
  description text,
  icon        text not null default 'layout-grid',
  color       text not null default '#005f8d',
  is_active   boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- وحدات البوابة الديناميكية (من المكتبة أو فارغة)
create table public.portal_units (
  id          uuid primary key default gen_random_uuid(),
  portal_id   uuid not null references public.dynamic_portals (id) on delete cascade,
  unit_key    text not null,                     -- مفتاح وحدة من المكتبة
  label       text not null,
  icon        text not null default 'folder',
  page_keys   text[] not null default '{}',      -- صفحات الوحدة (مفاتيح المكتبة)
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),

  unique (portal_id, unit_key)
);

alter table public.dynamic_portals enable row level security;
alter table public.portal_units    enable row level security;

-- القراءة: المصادقون (المبدّل وشاشة الاختيار يحتاجانها)
create policy "dp: قراءة للمصادقين" on public.dynamic_portals
  for select to authenticated using (true);

create policy "pu: قراءة للمصادقين" on public.portal_units
  for select to authenticated using (true);

-- الإدارة: IT / Super Admin
create policy "dp: إدارة بواسطة IT" on public.dynamic_portals
  for all to authenticated
  using      (app.has_role(array['it_admin', 'super_admin']))
  with check (app.has_role(array['it_admin', 'super_admin']));

create policy "pu: إدارة بواسطة IT" on public.portal_units
  for all to authenticated
  using      (app.has_role(array['it_admin', 'super_admin']))
  with check (app.has_role(array['it_admin', 'super_admin']));

create index idx_pu_portal on public.portal_units (portal_id);

-- الأدوار الديناميكية: بصيغة portal:{slug} في user_roles (تمديد مدعوم في 00027)

create trigger trg_dp_updated_at
  before update on public.dynamic_portals for each row execute function app.set_updated_at();
create trigger trg_dp_version
  before update on public.dynamic_portals for each row execute function app.bump_version();

do $$ begin
  execute format('create trigger trg_audit_dynamic_portals after insert or update or delete on public.dynamic_portals
                  for each row execute function app.audit_trigger();');
end $$;
