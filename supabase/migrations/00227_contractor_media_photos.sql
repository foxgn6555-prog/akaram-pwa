-- 00227 — إرسال الصور من بوابة المتعهد (الجولة 00257)
-- المتعهد يرسل الصور (شارع/حملة/مدارس) تماماً كمسؤول القسم، والتذكرة تُنسب إلى منطقته وقاطع مسؤول قسمه
-- (المتعهد مرتبط بمسؤول قسمه عبر contractor_profiles.manager_user_id + sector_id — المنطقة واحدة من مناطق المسؤول).
-- اسم المرسل يحمل علامة «متعهد — منطقة …» فتظهر تلقائياً في بوابة الإعلام وتقرير حملات غرفة العمليات.

-- 1) من هو متعهد نشط؟ (للسياسات والدوال)
create or replace function app.is_active_contractor(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.contractor_profiles cp where cp.user_id = p_user and cp.is_active)
$$;
revoke all on function app.is_active_contractor(uuid) from public, anon;

-- 2) تمييز نوع المرسل في التذكرة
alter table public.media_submissions add column if not exists submitter_kind text not null default 'manager';
alter table public.media_submissions drop constraint if exists media_submissions_submitter_kind_chk;
alter table public.media_submissions add constraint media_submissions_submitter_kind_chk check (submitter_kind in ('manager', 'contractor'));
alter table public.media_submissions add column if not exists contractor_manager_user_id uuid references auth.users(id);
create index if not exists media_submissions_contractor_mgr_idx on public.media_submissions (contractor_manager_user_id) where contractor_manager_user_id is not null;

-- 3) التخزين: المتعهد يرفع ويقرأ داخل مجلده فقط (نفس قاعدة مسؤول القسم)
drop policy if exists "media photos: رفع من متعهد" on storage.objects;
create policy "media photos: رفع من متعهد"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media-photos' and app.is_active_contractor() and (name like auth.uid()::text || '/%'));
drop policy if exists "media photos: قراءة المتعهد لمرفوعاته" on storage.objects;
create policy "media photos: قراءة المتعهد لمرفوعاته"
  on storage.objects for select to authenticated
  using (bucket_id = 'media-photos' and app.is_active_contractor() and (name like auth.uid()::text || '/%'));

-- 4) الإرسال: مسؤول قسم (كما كان) أو متعهد نشط (منطقته + قاطعها + مسؤول قسمه)
create or replace function public.media_send_photos(p_mode text, p_title text, p_work_type text default null, p_notes text default null, p_photos jsonb default null, p_details jsonb default null)
returns public.media_submissions language plpgsql volatile security definer set search_path = public, app as $$
declare u uuid := auth.uid(); mp public.manager_profiles; cp public.contractor_profiles; v_parent text; v_name text; v_area text;
        v_sectors smallint[]; v_kind text := 'manager'; v_mgr uuid; v_row public.media_submissions; ph jsonb; v_path text; v_caption text; v_seq integer := 0; v_count integer := 0;
begin
  if u is null then raise exception 'MEDIA_FORBIDDEN'; end if;
  if p_mode not in ('street', 'campaign', 'school') or length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 200 then raise exception 'MEDIA_SUBMISSION_INPUT_INVALID'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) < 1 or jsonb_array_length(p_photos) > 500 then raise exception 'MEDIA_PHOTOS_COUNT_INVALID'; end if;
  select e.full_name into v_name from public.employees e where e.user_id = u limit 1;
  if v_name is null or trim(v_name) = '' then v_name := u::text; end if;

  select * into cp from public.contractor_profiles where user_id = u and is_active;
  if cp.user_id is not null then
    -- متعهد: منطقته الواحدة وقاطعها، ومسؤول قسمه للربط
    v_kind := 'contractor'; v_mgr := cp.manager_user_id; v_sectors := array[cp.sector_id];
    select s.parent_sector, s.name into v_parent, v_area from public.sectors s where s.id = cp.sector_id;
    if v_parent is null then raise exception 'MEDIA_SECTOR_DERIVE_FAILED'; end if;
    v_name := v_name || ' (متعهد — منطقة ' || v_area || ')';
  else
    if not app.has_role(array['department_manager']) then raise exception 'MEDIA_FORBIDDEN'; end if;
    select * into mp from public.manager_profiles where user_id = u;
    if mp is null then raise exception 'MEDIA_MANAGER_PROFILE_MISSING'; end if;
    if not app.manager_owns_sectors(mp.sectors) then raise exception 'MEDIA_SECTORS_INVALID'; end if;
    v_sectors := mp.sectors;
    select distinct s.parent_sector into v_parent from public.sectors s where s.id = any (mp.sectors) limit 1;
    if v_parent is null then raise exception 'MEDIA_SECTOR_DERIVE_FAILED'; end if;
  end if;

  insert into public.media_submissions (mode, title, work_type, sector_parent, sector_ids, event_date, notes, photo_count, submitted_by, submitted_by_name, submitter_kind, contractor_manager_user_id)
  values (p_mode, trim(p_title), nullif(trim(coalesce(p_work_type, '')), ''), v_parent, v_sectors, app.baghdad_today(), nullif(trim(coalesce(p_notes, '')), ''), 0, u, v_name, v_kind, v_mgr)
  returning * into v_row;
  for ph in select * from jsonb_array_elements(p_photos) loop
    v_path := ph->>'storage_path'; v_caption := ph->>'caption';
    if length(coalesce(v_path, '')) < 5 or v_path not like u::text || '/%' then raise exception 'MEDIA_PHOTO_PATH_INVALID'; end if;
    v_seq := v_seq + 1; v_count := v_count + 1;
    insert into public.media_submission_photos (submission_id, storage_path, caption, sort_order, created_by) values (v_row.id, v_path, nullif(trim(coalesce(v_caption, '')), ''), v_seq, u);
  end loop;
  update public.media_submissions set photo_count = v_count where id = v_row.id;
  perform app.media_apply_details(v_row.id, p_details);
  select * into v_row from public.media_submissions where id = v_row.id;
  return v_row;
end$$;
revoke all on function public.media_send_photos(text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.media_send_photos(text, text, text, text, jsonb, jsonb) to authenticated;

-- 5) تذاكر متعهدي مسؤول القسم (تظهر له في «فريقي» ضمن ملخص اليوم): عدد تذاكر اليوم لكل متعهد
create or replace function public.manager_contractor_photos_today()
returns table(contractor_user_id uuid, tickets_today int, photos_today int)
language sql stable security definer set search_path = public, app as $$
  select s.submitted_by, count(*)::int, coalesce(sum(s.photo_count), 0)::int
  from public.media_submissions s
  where s.submitter_kind = 'contractor' and s.contractor_manager_user_id = auth.uid()
    and s.status <> 'archived' and coalesce(s.exec_date, s.event_date) = app.baghdad_today()
  group by s.submitted_by
$$;
revoke all on function public.manager_contractor_photos_today() from public, anon;
grant execute on function public.manager_contractor_photos_today() to authenticated;
