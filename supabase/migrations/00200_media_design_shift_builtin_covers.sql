-- 00200 · بوابة الإعلام — الشفت على التصميم + أغلفة القوالب الجاهزة:
--   1) media_designs.shift ('morning' | 'night' | null) يُعرض على الغلاف الديناميكي («الشفت الصباحي/الليلي») ويُرشَّح به في صفحة التصاميم.
--   2) media_design_set_shift: تغيير الشفت (مسودة فقط) مع صلاحية الإعلام.
--   3) media_covers.shift: وسم الشفت في مكتبة الغلافات للترشيح.
--   مسار الغلاف قد يكون قالباً جاهزاً بصيغة 'builtin:<id>' (نصوصه تُولَّد من بيانات التصميم) — لا تغيير في الأعمدة لذلك.
alter table public.media_designs add column if not exists shift text check (shift is null or shift in ('morning', 'night'));
alter table public.media_covers add column if not exists shift text check (shift is null or shift in ('morning', 'night'));
create index if not exists media_designs_shift_idx on public.media_designs (shift) where shift is not null;

create or replace function public.media_design_set_shift(p_id uuid, p_shift text)
returns public.media_designs
language plpgsql volatile security definer
set search_path = public, app
as $$
declare d public.media_designs;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if p_shift is not null and p_shift not in ('morning', 'night') then raise exception 'MEDIA_DESIGN_INPUT_INVALID'; end if;
  select * into d from public.media_designs where id = p_id for update;
  if not found then raise exception 'MEDIA_DESIGN_NOT_FOUND'; end if;
  if d.status = 'completed' then raise exception 'MEDIA_DESIGN_LOCKED'; end if;
  update public.media_designs set shift = p_shift where id = p_id returning * into d;
  return d;
end $$;
grant execute on function public.media_design_set_shift(uuid, text) to authenticated;

-- وسم الشفت عند إضافة/تعديل غلاف المكتبة
create or replace function public.media_cover_set_shift(p_id uuid, p_shift text)
returns public.media_covers
language plpgsql volatile security definer
set search_path = public, app
as $$
declare c public.media_covers;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if p_shift is not null and p_shift not in ('morning', 'night') then raise exception 'MEDIA_COVER_INPUT_INVALID'; end if;
  update public.media_covers set shift = p_shift, updated_at = now() where id = p_id returning * into c;
  if not found then raise exception 'MEDIA_COVER_NOT_FOUND'; end if;
  return c;
end $$;
grant execute on function public.media_cover_set_shift(uuid, text) to authenticated;
