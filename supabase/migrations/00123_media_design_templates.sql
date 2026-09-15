-- ═══════════════════════════════════════════════════════════════
-- 00123 · قوالب التصميم — الهوية البصرية القابلة لإعادة الاستخدام
-- قالب = عنوان/قطاع/دورة/غلاف جاهز/أنواع عمل افتراضية؛ يبنيها مسؤول الإعلام
-- وتُستخدم لتسريع إنشاء التصاميم من وحدة التذاكر.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.media_design_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 300),
  sector_parent text check (sector_parent is null or sector_parent in ('karrada', 'zaafaraniya')),
  period_type text not null default 'first_half'
    check (period_type in ('first_half', 'second_half', 'monthly')),
  cover_path text,
  work_types jsonb not null default '[]'::jsonb,
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.media_design_templates is
  'قوالب التصميم لبوابة الإعلام: هوية بصرية جاهزة (غلاف/عنوان/دورة/أنواع عمل)';

alter table public.media_design_templates enable row level security;

create policy "media design templates: قراءة للإعلام"
  on public.media_design_templates
  for select to authenticated
  using (app.has_role(array['media_officer', 'super_admin']));

create trigger trg_media_templates_touch
  before update on public.media_design_templates
  for each row execute function app.set_updated_at();

create trigger trg_audit_media_templates
  after insert or update or delete on public.media_design_templates
  for each row execute function app.audit_trigger();

-- ── RPC ─────────────────────────────────────────────────────────

create or replace function public.media_templates_list(p_include_archived boolean default false)
returns setof public.media_design_templates
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  return query
    select t.* from public.media_design_templates t
     where p_include_archived or t.status = 'active'
     order by t.created_at desc
     limit 200;
end;
$$;

create or replace function public.media_template_create(
  p_title text,
  p_sector_parent text,
  p_period_type text,
  p_cover_path text,
  p_work_types jsonb,
  p_notes text
)
returns public.media_design_templates
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  v_row public.media_design_templates;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'MEDIA_TEMPLATE_TITLE_REQUIRED';
  end if;
  if p_sector_parent is not null and p_sector_parent not in ('karrada', 'zaafaraniya') then
    raise exception 'MEDIA_TEMPLATE_BAD_SECTOR';
  end if;
  insert into public.media_design_templates (
    title, sector_parent, period_type, cover_path, work_types, notes, created_by
  ) values (
    btrim(p_title),
    p_sector_parent,
    coalesce(p_period_type, 'first_half'),
    nullif(btrim(coalesce(p_cover_path, '')), ''),
    coalesce(p_work_types, '[]'::jsonb),
    btrim(coalesce(p_notes, '')),
    auth.uid()
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.media_template_update(
  p_id uuid,
  p_title text,
  p_sector_parent text,
  p_period_type text,
  p_cover_path text,
  p_work_types jsonb,
  p_notes text
)
returns public.media_design_templates
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  v_row public.media_design_templates;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  update public.media_design_templates t set
    title = btrim(coalesce(p_title, t.title)),
    sector_parent = p_sector_parent,
    period_type = coalesce(p_period_type, t.period_type),
    cover_path = nullif(btrim(coalesce(p_cover_path, '')), ''),
    work_types = coalesce(p_work_types, t.work_types),
    notes = btrim(coalesce(p_notes, t.notes))
   where t.id = p_id and t.status = 'active'
  returning * into v_row;
  if v_row is null then
    raise exception 'MEDIA_TEMPLATE_NOT_FOUND';
  end if;
  return v_row;
end;
$$;

-- لا حذف فعلي: أرشفة فقط (سياسة النظام)
create or replace function public.media_template_archive(p_id uuid)
returns public.media_design_templates
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  v_row public.media_design_templates;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  update public.media_design_templates t
     set status = 'archived'
   where t.id = p_id
  returning * into v_row;
  if v_row is null then
    raise exception 'MEDIA_TEMPLATE_NOT_FOUND';
  end if;
  return v_row;
end;
$$;

grant execute on function
  public.media_templates_list(boolean),
  public.media_template_create(text, text, text, text, jsonb, text),
  public.media_template_update(uuid, text, text, text, text, jsonb, text),
  public.media_template_archive(uuid)
  to authenticated;
