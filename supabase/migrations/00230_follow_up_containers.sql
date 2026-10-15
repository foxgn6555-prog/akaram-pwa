-- 00230 · بوابة المتابعة — متابعة الحاويات (00260)
--   · المتابِع يرى حاويات مناطق نطاقه (نفس عزل مسؤول القسم) + الزونات.
--   · «تحديث الموقع»: يقترح إحداثيات GPS الحالية كطلب تحديث معلّق (kind='location')
--     تعتمده/ترفضه غرفة العمليات بالآلية نفسها (gbs_container_updates / gbs_update_review).
--   · الاعتماد يطبّق الإحداثيات الجديدة ويحفظ الإحداثيات السابقة للتدقيق.

-- ① أعمدة طلب الموقع
alter table public.gbs_container_updates
  add column if not exists kind text not null default 'status' check (kind in ('status','location')),
  add column if not exists proposed_latitude float8 check (proposed_latitude is null or proposed_latitude between -90 and 90),
  add column if not exists proposed_longitude float8 check (proposed_longitude is null or proposed_longitude between -180 and 180),
  add column if not exists accuracy_m float8 check (accuracy_m is null or accuracy_m >= 0),
  add column if not exists previous_latitude float8,
  add column if not exists previous_longitude float8;
alter table public.gbs_container_updates drop constraint if exists gbs_container_updates_location_chk;
alter table public.gbs_container_updates add constraint gbs_container_updates_location_chk
  check (kind <> 'location' or (proposed_latitude is not null and proposed_longitude is not null));

-- ② اختصاص القراءة: مسؤول القسم → مناطقه؛ المتابِع → نطاق متابعته
create or replace function app.gbs_read_sectors(p_user uuid default auth.uid())
returns smallint[]
language sql stable security definer set search_path=public,app as $$
  select case
    when app.has_role(array['ops_room','super_admin']) then null::smallint[]
    when app.has_role(array['department_manager']) then app.gbs_manager_sectors(p_user)
    when app.has_role(array['follow_up']) then app.follow_up_sectors(p_user)
    else '{}'::smallint[] end
$$;
revoke all on function app.gbs_read_sectors(uuid) from public, anon;
grant execute on function app.gbs_read_sectors(uuid) to authenticated;

-- ③ القائمة: + follow_up
create or replace function public.gbs_containers_list(p_search text default null, p_status text default null,
                                           p_parent text default null, p_sector_id smallint default null)
returns table(id uuid, code text, label text, latitude float8, longitude float8,
              status text, image_path text, notes text, updated_at timestamptz, pending_count bigint,
              sector_id smallint, area_name text, parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$
declare jur smallint[];
begin
  if not app.has_role(array['ops_room','department_manager','follow_up','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if p_status is not null and p_status not in ('ok','damaged','replace','missing') then
    raise exception 'GBS_STATUS_INVALID';
  end if;
  if p_parent is not null and p_parent not in ('karrada','zaafaraniya') then
    raise exception 'GBS_PARENT_INVALID';
  end if;
  jur := app.gbs_read_sectors(auth.uid());
  return query
  select c.id, c.code, c.label, c.latitude, c.longitude, c.status, c.image_path, c.notes, c.updated_at,
         (select count(*) from public.gbs_container_updates u
           where u.container_id = c.id and u.state = 'pending'),
         c.sector_id, s.name, s.parent_sector
  from public.gbs_containers c
  join public.sectors s on s.id = c.sector_id
  where (jur is null or c.sector_id = any(jur))
    and (p_status is null or c.status = p_status)
    and (p_parent is null or s.parent_sector = p_parent)
    and (p_sector_id is null or c.sector_id = p_sector_id)
    and (nullif(trim(coalesce(p_search,'')),'') is null
         or c.code ilike '%' || trim(p_search) || '%'
         or c.label ilike '%' || trim(p_search) || '%'
         or s.name ilike '%' || trim(p_search) || '%'
         or coalesce(c.notes,'') ilike '%' || trim(p_search) || '%')
  order by c.code;
end$$;

create or replace function public.gbs_zones_list()
returns table(id uuid, name text, source text, color text, polygon jsonb)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','department_manager','follow_up','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  return query select g.id, g.name, g.source, g.color, g.polygon
  from public.gps_geofences g where g.is_active order by g.name;
end$$;

-- ④ طلب تحديث الموقع — المتابِع (داخل نطاقه)، معلّق حتى اعتماد غرفة العمليات
create or replace function public.gbs_container_request_location(
  p_container_id uuid, p_latitude float8, p_longitude float8, p_accuracy float8 default null, p_note text default null)
returns uuid
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); c public.gbs_containers; uid uuid; who text;
begin
  if u is null or not app.has_role(array['follow_up','department_manager']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'GBS_LOCATION_INVALID';
  end if;
  if length(trim(coalesce(p_note,''))) > 500 then raise exception 'GBS_NOTES_INVALID'; end if;
  select * into c from public.gbs_containers where id = p_container_id;
  if not found then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
  if not (c.sector_id = any(coalesce(app.gbs_read_sectors(u), array[c.sector_id]))) then
    raise exception 'GBS_OUT_OF_SECTOR';
  end if;
  if exists(select 1 from public.gbs_container_updates u0
             where u0.container_id = c.id and u0.requested_by = u and u0.state = 'pending' and u0.kind = 'location') then
    raise exception 'GBS_UPDATE_ALREADY_PENDING';
  end if;
  insert into public.gbs_container_updates(container_id, requested_by, proposed_status, note, kind,
                                           proposed_latitude, proposed_longitude, accuracy_m, previous_latitude, previous_longitude)
  values(c.id, u, c.status, nullif(trim(coalesce(p_note,'')),''), 'location',
         p_latitude, p_longitude, p_accuracy, c.latitude, c.longitude)
  returning gbs_container_updates.id into uid;
  who := app.manager_display_name(u);
  insert into public.notifications(user_id, title, body, type, link)
  select ur.user_id, 'طلب تحديث موقع حاوية',
         format('%s · %s — اقترح %s موقعاً جديداً (%s, %s)%s', c.code, c.label, coalesce(who, 'المتابعة'),
                round(p_latitude::numeric, 6), round(p_longitude::numeric, 6),
                case when p_accuracy is not null then format(' · دقة ±%s م', round(p_accuracy)) else '' end),
         'info', '/ops-room/gbs-containers'
  from public.user_roles ur
  where ur.role in ('ops_room','super_admin');
  return uid;
end$$;

-- ⑤ القوائم: + النوع والإحداثيات المقترحة
drop function if exists public.gbs_updates_list(text);
create function public.gbs_updates_list(p_state text default 'pending')
returns table(id uuid, container_id uuid, code text, label text, proposed_status text,
              photo_path text, note text, state text, requested_by uuid, requester_name text,
              created_at timestamptz, reviewed_at timestamptz, review_note text,
              kind text, proposed_latitude float8, proposed_longitude float8, accuracy_m float8,
              current_latitude float8, current_longitude float8, area_name text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if not app.has_role(array['ops_room','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if coalesce(p_state,'pending') not in ('pending','approved','rejected') then
    raise exception 'GBS_STATE_INVALID';
  end if;
  return query
  select u0.id, u0.container_id, c.code, c.label, u0.proposed_status, u0.photo_path, u0.note,
         u0.state, u0.requested_by,
         coalesce(nullif(e.full_name,''), au.email, u0.requested_by::text),
         u0.created_at, u0.reviewed_at, u0.review_note,
         u0.kind, u0.proposed_latitude, u0.proposed_longitude, u0.accuracy_m,
         c.latitude, c.longitude, s.name
  from public.gbs_container_updates u0
  join public.gbs_containers c on c.id = u0.container_id
  join public.sectors s on s.id = c.sector_id
  left join public.employees e on e.user_id = u0.requested_by
  left join auth.users au on au.id = u0.requested_by
  where u0.state = coalesce(p_state,'pending')
  order by u0.created_at desc;
end$$;
revoke all on function public.gbs_updates_list(text) from public, anon;
grant execute on function public.gbs_updates_list(text) to authenticated;

drop function if exists public.gbs_my_update_requests();
create function public.gbs_my_update_requests()
returns table(id uuid, container_id uuid, code text, label text, proposed_status text,
              photo_path text, note text, state text, created_at timestamptz,
              reviewed_at timestamptz, review_note text,
              kind text, proposed_latitude float8, proposed_longitude float8, accuracy_m float8)
language plpgsql stable security definer set search_path=public,app as $$
declare u uuid := auth.uid();
begin
  if u is null or not app.has_role(array['department_manager','follow_up']) then
    raise exception 'GBS_MANAGER_FORBIDDEN';
  end if;
  return query
  select u0.id, u0.container_id, c.code, c.label, u0.proposed_status, u0.photo_path, u0.note,
         u0.state, u0.created_at, u0.reviewed_at, u0.review_note,
         u0.kind, u0.proposed_latitude, u0.proposed_longitude, u0.accuracy_m
  from public.gbs_container_updates u0
  join public.gbs_containers c on c.id = u0.container_id
  where u0.requested_by = u
  order by u0.created_at desc;
end$$;
revoke all on function public.gbs_my_update_requests() from public, anon;
grant execute on function public.gbs_my_update_requests() to authenticated;

-- ⑥ المراجعة: اعتماد طلب الموقع يطبّق الإحداثيات؛ رابط التبليغ حسب بوابة الطالب
create or replace function public.gbs_update_review(p_update_id uuid, p_approve boolean, p_review_note text default null)
returns table(container_id uuid, code text, new_status text)
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); r public.gbs_container_updates; c public.gbs_containers; status_ar text; body_txt text; lnk text;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if length(trim(coalesce(p_review_note,''))) > 500 then
    raise exception 'GBS_NOTES_INVALID';
  end if;
  select * into r from public.gbs_container_updates where id = p_update_id for update;
  if not found or r.state <> 'pending' then
    raise exception 'GBS_UPDATE_NOT_PENDING';
  end if;
  select * into c from public.gbs_containers where id = r.container_id;
  if not found then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
  if p_approve then
    if r.kind = 'location' then
      update public.gbs_container_updates set previous_latitude = c.latitude, previous_longitude = c.longitude where id = r.id;
      update public.gbs_containers
         set latitude = r.proposed_latitude, longitude = r.proposed_longitude, updated_at = now()
       where id = c.id returning * into c;
    else
      update public.gbs_containers
         set status = r.proposed_status, updated_at = now()
       where id = c.id returning * into c;
    end if;
  end if;
  update public.gbs_container_updates
     set state = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = u, reviewed_at = now(),
         review_note = nullif(trim(coalesce(p_review_note,'')),'')
   where id = r.id;
  if r.kind = 'location' then
    body_txt := format('%s · %s — الموقع المقترح: (%s, %s)', c.code, c.label,
                       round(r.proposed_latitude::numeric, 6), round(r.proposed_longitude::numeric, 6));
  else
    status_ar := case r.proposed_status
      when 'ok' then 'سليمة' when 'damaged' then 'متضررة'
      when 'replace' then 'يجب استبدالها' else 'مفقودة' end;
    body_txt := format('%s · %s — الحالة المقترحة: %s', c.code, c.label, status_ar);
  end if;
  if nullif(trim(coalesce(p_review_note,'')),'') is not null then
    body_txt := body_txt || ' · ملاحظة: ' || trim(p_review_note);
  end if;
  lnk := case when exists(select 1 from public.user_roles ur where ur.user_id = r.requested_by and ur.role = 'follow_up')
              then '/follow-up/containers' else '/manager/gbs-containers' end;
  insert into public.notifications(user_id, title, body, type, link, dedupe_key)
  values(r.requested_by,
         case when p_approve then (case when r.kind = 'location' then 'تم اعتماد موقع الحاوية الجديد' else 'تم اعتماد تحديث الحاوية' end)
              else (case when r.kind = 'location' then 'تم رفض تحديث موقع الحاوية' else 'تم رفض تحديث الحاوية' end) end,
         body_txt,
         case when p_approve then 'success' else 'warning' end,
         lnk,
         'gbs:review:' || r.id::text)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return query select c.id, c.code, c.status;
end$$;

-- ⑦ ملخص للرئيسية: حاويات نطاقي + طلباتي المعلقة
create or replace function public.follow_up_containers_summary()
returns table(containers int, damaged int, missing int, my_pending int, my_approved int, my_rejected int)
language plpgsql stable security definer set search_path=public,app as $$
declare f public.follow_up_profiles; ids smallint[];
begin
  f := app.require_follow_up(); ids := app.follow_up_sectors(f.user_id);
  return query
  select (select count(*)::int from public.gbs_containers c where c.sector_id = any(ids)),
         (select count(*)::int from public.gbs_containers c where c.sector_id = any(ids) and c.status in ('damaged','replace')),
         (select count(*)::int from public.gbs_containers c where c.sector_id = any(ids) and c.status = 'missing'),
         (select count(*)::int from public.gbs_container_updates x where x.requested_by = f.user_id and x.state = 'pending'),
         (select count(*)::int from public.gbs_container_updates x where x.requested_by = f.user_id and x.state = 'approved'),
         (select count(*)::int from public.gbs_container_updates x where x.requested_by = f.user_id and x.state = 'rejected');
end$$;

revoke all on function
  public.gbs_container_request_location(uuid, float8, float8, float8, text),
  public.follow_up_containers_summary()
from public, anon;
grant execute on function
  public.gbs_container_request_location(uuid, float8, float8, float8, text),
  public.follow_up_containers_summary()
to authenticated;
