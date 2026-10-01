-- 00164 · الإعلام/مسؤول القسم: تفاصيل الحملة (موقع، تاريخ تنفيذ، مراقبون، عمال، آليات) + دمج التذاكر في الإعلام + تقرير غرفة العمليات
-- «تقرير متابعة وتوثيق حملات التنظيف والخدمات» (حملات / حملات مدارس / تنظيف شوارع) مع فلاتر القاطع/القسم/التاريخ.
-- · الصور تبقى إلزامية للتذكرة (قرار المستخدم)؛ عمود «الصور» في التقرير يُشتق من photo_count.
-- · الدمج: تذاكر عدة (نفس القاطع) → تذكرة واحدة بمسمى واحد؛ الصور تنتقل إليها (معرّفاتها ثابتة فلا تنكسر التصاميم)، والأصول تُؤرشف بإشارة «دُمجت في …».

alter table public.media_submissions
  add column if not exists location text,
  add column if not exists exec_date date,
  add column if not exists supervisors_count integer not null default 0 check (supervisors_count >= 0),
  add column if not exists workers_count integer not null default 0 check (workers_count >= 0),
  add column if not exists veh_tipper integer not null default 0 check (veh_tipper >= 0),
  add column if not exists veh_tanker integer not null default 0 check (veh_tanker >= 0),
  add column if not exists veh_compactor integer not null default 0 check (veh_compactor >= 0),
  add column if not exists veh_loader integer not null default 0 check (veh_loader >= 0),
  add column if not exists veh_sweeper integer not null default 0 check (veh_sweeper >= 0),
  add column if not exists merged_into uuid references public.media_submissions(id) on delete set null,
  add column if not exists merged_count integer not null default 0;
update public.media_submissions set exec_date = event_date where exec_date is null;
create index if not exists media_submissions_exec on public.media_submissions (mode, sector_parent, exec_date desc);
comment on column public.media_submissions.location is 'موقع الحملة (الحملات) — للشوارع العنوان هو اسم الشارع، وللمدارس اسم المدرسة';

-- غرفة العمليات تقرأ التذكرات (التقرير)
drop policy if exists "media submissions: قراءة" on public.media_submissions;
create policy "media submissions: قراءة" on public.media_submissions for select to authenticated
  using (app.has_role(array['media_officer','super_admin','ops_room']) or submitted_by = auth.uid());

create or replace function app.media_apply_details(p_id uuid, p_details jsonb) returns void language plpgsql security definer set search_path = public, app as $$
declare d jsonb := coalesce(p_details, '{}'::jsonb); v jsonb := coalesce(d -> 'vehicles', '{}'::jsonb);
  f_int int; -- مؤقت
begin
  if d ? 'exec_date' and nullif(d ->> 'exec_date', '') is not null and (d ->> 'exec_date')::date > (now() at time zone 'Asia/Baghdad')::date + 1 then
    raise exception 'MEDIA_EXEC_DATE_INVALID';
  end if;
  for f_int in select x from unnest(array[coalesce((d ->> 'supervisors')::int, 0), coalesce((d ->> 'workers')::int, 0),
      coalesce((v ->> 'tipper')::int, 0), coalesce((v ->> 'tanker')::int, 0), coalesce((v ->> 'compactor')::int, 0), coalesce((v ->> 'loader')::int, 0), coalesce((v ->> 'sweeper')::int, 0)]) x loop
    if f_int < 0 or f_int > 10000 then raise exception 'MEDIA_COUNT_INVALID'; end if;
  end loop;
  update public.media_submissions set
    location = nullif(trim(coalesce(d ->> 'location', '')), ''),
    exec_date = coalesce(nullif(d ->> 'exec_date', '')::date, exec_date, event_date),
    supervisors_count = coalesce((d ->> 'supervisors')::int, 0),
    workers_count = coalesce((d ->> 'workers')::int, 0),
    veh_tipper = coalesce((v ->> 'tipper')::int, 0), veh_tanker = coalesce((v ->> 'tanker')::int, 0), veh_compactor = coalesce((v ->> 'compactor')::int, 0),
    veh_loader = coalesce((v ->> 'loader')::int, 0), veh_sweeper = coalesce((v ->> 'sweeper')::int, 0)
  where id = p_id;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'MEDIA_COUNT_INVALID';
end$$;

-- إرسال الصور مع التفاصيل (التوقيع القديم يُستبدل بتوقيع يحمل p_details)
drop function if exists public.media_send_photos(text, text, text, text, jsonb);
create or replace function public.media_send_photos(p_mode text, p_title text, p_work_type text default null, p_notes text default null, p_photos jsonb default null, p_details jsonb default null)
returns public.media_submissions language plpgsql volatile security definer set search_path = public, app as $$
declare u uuid := auth.uid(); mp public.manager_profiles; v_parent text; v_name text; v_row public.media_submissions; ph jsonb; v_path text; v_caption text; v_seq integer := 0; v_count integer := 0;
begin
  if not app.has_role(array['department_manager']) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if p_mode not in ('street', 'campaign', 'school') or length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 200 then raise exception 'MEDIA_SUBMISSION_INPUT_INVALID'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) < 1 or jsonb_array_length(p_photos) > 500 then raise exception 'MEDIA_PHOTOS_COUNT_INVALID'; end if;
  select * into mp from public.manager_profiles where user_id = u;
  if mp is null then raise exception 'MEDIA_MANAGER_PROFILE_MISSING'; end if;
  if not app.manager_owns_sectors(mp.sectors) then raise exception 'MEDIA_SECTORS_INVALID'; end if;
  select distinct s.parent_sector into v_parent from public.sectors s where s.id = any (mp.sectors) limit 1;
  if v_parent is null then raise exception 'MEDIA_SECTOR_DERIVE_FAILED'; end if;
  select e.full_name into v_name from public.employees e where e.user_id = u limit 1;
  if v_name is null or trim(v_name) = '' then v_name := u::text; end if;
  insert into public.media_submissions (mode, title, work_type, sector_parent, sector_ids, event_date, notes, photo_count, submitted_by, submitted_by_name)
  values (p_mode, trim(p_title), nullif(trim(coalesce(p_work_type, '')), ''), v_parent, mp.sectors, (now() at time zone 'Asia/Baghdad')::date, nullif(trim(coalesce(p_notes, '')), ''), 0, u, v_name)
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

-- تذكراتي (مسؤول القسم) مفلترة بالتاريخ (تاريخ التنفيذ أو تاريخ الإرسال)
create or replace function public.media_my_submissions(p_from date default null, p_to date default null, p_mode text default null)
returns setof public.media_submissions language sql stable security definer set search_path = public, app as $$
  select s.* from public.media_submissions s
  where s.submitted_by = auth.uid()
    and (p_from is null or coalesce(s.exec_date, s.event_date) >= p_from)
    and (p_to is null or coalesce(s.exec_date, s.event_date) <= p_to)
    and (p_mode is null or s.mode = p_mode)
  order by s.created_at desc limit 500 $$;

-- دمج تذاكر (الإعلام): نفس القاطع، كلها نشطة، ≥ 2 → تذكرة واحدة بمسمى واحد
create or replace function public.media_submissions_merge(p_ids uuid[], p_title text, p_work_type text default null, p_notes text default null)
returns public.media_submissions language plpgsql volatile security definer set search_path = public, app as $$
declare n int; parents int; first_row public.media_submissions; v_row public.media_submissions; u uuid := auth.uid();
begin
  if not app.has_role(array['media_officer', 'super_admin']) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) < 2 then raise exception 'MEDIA_MERGE_MIN_TWO'; end if;
  if length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 200 then raise exception 'MEDIA_SUBMISSION_INPUT_INVALID'; end if;
  select count(*), count(distinct sector_parent) into n, parents from public.media_submissions where id = any(p_ids) and status = 'submitted';
  if n <> cardinality(p_ids) then raise exception 'MEDIA_MERGE_NOT_ACTIVE'; end if;
  if parents <> 1 then raise exception 'MEDIA_MERGE_DIFFERENT_SECTORS'; end if;
  select * into first_row from public.media_submissions where id = any(p_ids) order by coalesce(exec_date, event_date), created_at limit 1;
  insert into public.media_submissions (mode, title, work_type, sector_parent, sector_ids, event_date, exec_date, notes, photo_count, submitted_by, submitted_by_name, location,
    supervisors_count, workers_count, veh_tipper, veh_tanker, veh_compactor, veh_loader, veh_sweeper, merged_count)
  select first_row.mode, trim(p_title), nullif(trim(coalesce(p_work_type, first_row.work_type, '')), ''), first_row.sector_parent,
    (select array_agg(distinct x) from public.media_submissions m, unnest(m.sector_ids) x where m.id = any(p_ids)),
    min(coalesce(m.exec_date, m.event_date)), min(coalesce(m.exec_date, m.event_date)),
    coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'دمج ' || n || ' تذاكر: ' || string_agg(m.title, '، ' order by m.created_at)),
    sum(m.photo_count), first_row.submitted_by, string_agg(distinct m.submitted_by_name, '، '), first_row.location,
    sum(m.supervisors_count), sum(m.workers_count), sum(m.veh_tipper), sum(m.veh_tanker), sum(m.veh_compactor), sum(m.veh_loader), sum(m.veh_sweeper), n
  from public.media_submissions m where m.id = any(p_ids)
  returning * into v_row;
  -- نقل الصور بترتيب متسلسل (المعرّفات ثابتة — التصاميم السابقة لا تتأثر)
  with ordered as (select p.id, row_number() over (order by m.created_at, p.sort_order) rn from public.media_submission_photos p join public.media_submissions m on m.id = p.submission_id where p.submission_id = any(p_ids))
  update public.media_submission_photos p set submission_id = v_row.id, sort_order = o.rn from ordered o where o.id = p.id;
  update public.media_submissions set status = 'archived', archived_at = now(), archived_by = u, archive_reason = 'دُمجت في «' || trim(p_title) || '»', merged_into = v_row.id, photo_count = 0 where id = any(p_ids);
  return v_row;
end$$;

-- تقرير غرفة العمليات: متابعة وتوثيق حملات التنظيف والخدمات
create or replace function public.ops_campaigns_report(p_mode text default null, p_sector_parent text default null, p_sector_id smallint default null, p_from date default null, p_to date default null)
returns table(id uuid, mode text, title text, location text, work_type text, sector_parent text, sector_parent_name text, sector_ids smallint[], department_names text, exec_date date, event_date date,
  supervisors_count int, workers_count int, veh_tipper int, veh_tanker int, veh_compactor int, veh_loader int, veh_sweeper int, photo_count int, has_photos boolean, notes text, submitted_by_name text, status text, merged_count int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  return query
  select s.id, s.mode, s.title, s.location, s.work_type, s.sector_parent, app.parent_sector_name(s.sector_parent), s.sector_ids,
    (select string_agg(x.name, '، ' order by x.name) from public.sectors x where x.id = any(s.sector_ids)),
    coalesce(s.exec_date, s.event_date), s.event_date, s.supervisors_count, s.workers_count, s.veh_tipper, s.veh_tanker, s.veh_compactor, s.veh_loader, s.veh_sweeper,
    s.photo_count, s.photo_count > 0, s.notes, s.submitted_by_name, s.status, s.merged_count, s.created_at
  from public.media_submissions s
  where s.merged_into is null
    and (p_mode is null or s.mode = p_mode)
    and (p_sector_parent is null or s.sector_parent = p_sector_parent)
    and (p_sector_id is null or p_sector_id = any(s.sector_ids))
    and (p_from is null or coalesce(s.exec_date, s.event_date) >= p_from)
    and (p_to is null or coalesce(s.exec_date, s.event_date) <= p_to)
  order by coalesce(s.exec_date, s.event_date) desc, s.created_at desc
  limit 2000;
end$$;

revoke all on function public.media_send_photos(text, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.media_my_submissions(date, date, text) from public, anon;
revoke all on function public.media_submissions_merge(uuid[], text, text, text) from public, anon;
revoke all on function public.ops_campaigns_report(text, text, smallint, date, date) from public, anon;
grant execute on function public.media_send_photos(text, text, text, text, jsonb, jsonb), public.media_my_submissions(date, date, text),
  public.media_submissions_merge(uuid[], text, text, text), public.ops_campaigns_report(text, text, smallint, date, date) to authenticated;
