-- 00221 · بيانات المحلة والزقاق في وحدة الشكاوى:
--  · سجل «المحلات» لكل منطقة من المناطق التشغيلية الثماني (public.sectors 1..8 داخل قاطعي الكرادة/الزعفرانية)؛
--    يديره موظف الشكاوي من صفحة «بيانات المحلة والزقاق» في الإعدادات والتواصل.
--  · الغاية: عند كتابة المحلة على صور البريد يُقترح الاسم من السجل، وتُربط التذكرة تلقائياً بالمنطقة
--    ثم بمسؤول القسم الذي تضم مناطقه تلك المنطقة (manager_profiles.sectors) لتسريع الإسناد.
--  · قائمة المسؤولين (complaint_list_managers) تعيد الآن مناطق كل مسؤول حتى يُقترح المسؤول المناسب.

-- توحيد كتابة الأسماء العربية للمقارنة: إزالة «محلة/محلّة» البادئة والتشكيل، وتوحيد الهمزات والتاء المربوطة والياء والمسافات.
create or replace function app.normalize_arabic_name(p_text text)
returns text language sql immutable strict as $$
  select regexp_replace(
           translate(
             regexp_replace(regexp_replace(lower(trim(coalesce(p_text,''))), '^\s*محل[ةه]\s+', ''), '[\u064B-\u0652\u0640]', '', 'g'),
             'أإآةىؤئ', 'ااا' || 'ه' || 'ي' || 'وي'),
           '\s+', ' ', 'g')
$$;
comment on function app.normalize_arabic_name(text) is 'صيغة موحدة لمقارنة أسماء المحلات/المناطق (بلا بادئة «محلة» ولا تشكيل، همزات وتاء مربوطة موحدة)';

create table if not exists public.complaint_neighborhoods (
  id          uuid primary key default gen_random_uuid(),
  sector_id   smallint not null references public.sectors(id) check (sector_id between 1 and 8),
  name        text not null check (length(trim(name)) between 2 and 60),
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.complaint_neighborhoods is 'محلات كل منطقة تشغيلية (1..8) — تُستخدم لاقتراح المحلة أثناء فرز صور الشكاوى وربطها بمسؤول القسم المناسب';
create unique index if not exists complaint_neighborhoods_sector_name_key
  on public.complaint_neighborhoods (sector_id, app.normalize_arabic_name(name));

alter table public.complaint_neighborhoods enable row level security;
drop policy if exists "complaint neighborhoods: select" on public.complaint_neighborhoods;
create policy "complaint neighborhoods: select" on public.complaint_neighborhoods for select to authenticated
  using (app.has_role(array['complaints_officer','super_admin','department_manager','ops_room']));
-- لا إدراج/تعديل مباشر: كل الكتابة عبر complaint_neighborhood_save.
grant select on public.complaint_neighborhoods to authenticated;

-- حفظ/تعديل محلة (موظف الشكاوي أو المدير العام فقط)
create or replace function public.complaint_neighborhood_save(p_id uuid, p_sector_id smallint, p_name text, p_is_active boolean default true)
returns uuid language plpgsql security definer set search_path=public,app as $$
declare v_id uuid; v_name text := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g');
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_NEIGHBORHOOD_FORBIDDEN'; end if;
  if p_sector_id is null or p_sector_id not between 1 and 8 then raise exception 'COMPLAINT_NEIGHBORHOOD_SECTOR_INVALID'; end if;
  if length(v_name) < 2 or length(v_name) > 60 then raise exception 'COMPLAINT_NEIGHBORHOOD_NAME_INVALID'; end if;
  if exists (select 1 from public.complaint_neighborhoods n where n.sector_id = p_sector_id
             and app.normalize_arabic_name(n.name) = app.normalize_arabic_name(v_name) and n.id is distinct from p_id)
  then raise exception 'COMPLAINT_NEIGHBORHOOD_DUPLICATE'; end if;
  if p_id is null then
    insert into public.complaint_neighborhoods(sector_id, name, is_active, created_by)
    values (p_sector_id, v_name, coalesce(p_is_active, true), auth.uid()) returning id into v_id;
  else
    update public.complaint_neighborhoods set sector_id = p_sector_id, name = v_name, is_active = coalesce(p_is_active, true), updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'COMPLAINT_NEIGHBORHOOD_NOT_FOUND'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.complaint_neighborhood_save(uuid, smallint, text, boolean) from public, anon;
grant execute on function public.complaint_neighborhood_save(uuid, smallint, text, boolean) to authenticated;

-- قائمة المحلات مع اسم المنطقة والقاطع الأب
create or replace function public.complaint_neighborhoods_list()
returns table(id uuid, sector_id smallint, sector_name text, parent_sector text, name text, is_active boolean, usage_count bigint)
language sql stable security definer set search_path=public,app as $$
  select n.id, n.sector_id, s.name, s.parent_sector, n.name, n.is_active,
         (select count(*) from public.complaint_items i
           join public.complaints c on c.id = i.complaint_id
           where app.normalize_arabic_name(coalesce(i.neighborhood,'')) = app.normalize_arabic_name(n.name)
             and c.sector = s.parent_sector)
  from public.complaint_neighborhoods n
  join public.sectors s on s.id = n.sector_id
  where app.has_role(array['complaints_officer','super_admin','department_manager','ops_room'])
  order by s.parent_sector, s.id, n.name
$$;
revoke all on function public.complaint_neighborhoods_list() from public, anon;
grant execute on function public.complaint_neighborhoods_list() to authenticated;

-- مسؤولو الأقسام مع مناطقهم (لاقتراح المسؤول من المحلة)
drop function if exists public.complaint_list_managers();
create or replace function public.complaint_list_managers()
returns table(user_id uuid, full_name text, job_title text, sector_ids smallint[])
language sql stable security definer set search_path = public, app as $$
  select ur.user_id, coalesce(e.full_name, 'مسؤول قسم') as full_name, e.job_title,
         coalesce(mp.sectors, '{}'::smallint[]) as sector_ids
  from public.user_roles ur
  left join public.employees e on e.user_id = ur.user_id
  left join public.manager_profiles mp on mp.user_id = ur.user_id
  where ur.role = 'department_manager'
    and app.has_role(array['complaints_officer','super_admin'])
  order by coalesce(e.full_name, ur.user_id::text)
$$;
revoke all on function public.complaint_list_managers() from public, anon;
grant execute on function public.complaint_list_managers() to authenticated;
