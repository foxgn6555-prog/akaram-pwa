-- 00234 · بوابة المتابعة — تحديث الحاوية: الموقع و/أو الحالة في طلب واحد معلّق (إصلاح 00260)
--   · كان المتابِع يستطيع اقتراح الموقع فقط؛ الآن يقترح الحالة (سليمة/متضررة/يجب استبدالها/مفقودة) أيضاً، معاً أو كلاً على حدة.
--   · kind: 'location' | 'status' | 'both' — الاعتماد يطبّق ما طُلب فقط. طلب واحد معلّق لكل حاوية لكل طالب.

alter table public.gbs_container_updates drop constraint if exists gbs_container_updates_kind_check;
alter table public.gbs_container_updates add constraint gbs_container_updates_kind_check check (kind in ('status','location','both'));
alter table public.gbs_container_updates drop constraint if exists gbs_container_updates_location_chk;
alter table public.gbs_container_updates add constraint gbs_container_updates_location_chk
  check (kind = 'status' or (proposed_latitude is not null and proposed_longitude is not null));

drop function if exists public.gbs_container_request_location(uuid, float8, float8, float8, text);
create or replace function public.gbs_container_request_location(
  p_container_id uuid, p_latitude float8 default null, p_longitude float8 default null, p_accuracy float8 default null,
  p_note text default null, p_status text default null)
returns uuid
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); c public.gbs_containers; uid uuid; who text; has_loc boolean; new_status text; k text; status_ar text; body_txt text;
begin
  if u is null or not app.has_role(array['follow_up','department_manager']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  has_loc := p_latitude is not null or p_longitude is not null;
  if has_loc and (p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then
    raise exception 'GBS_LOCATION_INVALID';
  end if;
  if p_status is not null and p_status not in ('ok','damaged','replace','missing') then raise exception 'GBS_STATUS_INVALID'; end if;
  if length(trim(coalesce(p_note,''))) > 500 then raise exception 'GBS_NOTES_INVALID'; end if;
  select * into c from public.gbs_containers where id = p_container_id;
  if not found then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
  if not (c.sector_id = any(coalesce(app.gbs_read_sectors(u), array[c.sector_id]))) then
    raise exception 'GBS_OUT_OF_SECTOR';
  end if;
  new_status := case when p_status is not null and p_status <> c.status then p_status else null end;
  k := case when has_loc and new_status is not null then 'both' when has_loc then 'location' when new_status is not null then 'status' else null end;
  if k is null then raise exception 'GBS_NOTHING_TO_UPDATE'; end if;
  if exists(select 1 from public.gbs_container_updates u0
             where u0.container_id = c.id and u0.requested_by = u and u0.state = 'pending') then
    raise exception 'GBS_UPDATE_ALREADY_PENDING';
  end if;
  insert into public.gbs_container_updates(container_id, requested_by, proposed_status, note, kind,
                                           proposed_latitude, proposed_longitude, accuracy_m, previous_latitude, previous_longitude)
  values(c.id, u, coalesce(new_status, c.status), nullif(trim(coalesce(p_note,'')),''), k,
         p_latitude, p_longitude, p_accuracy, c.latitude, c.longitude)
  returning gbs_container_updates.id into uid;
  who := app.manager_display_name(u);
  status_ar := case new_status when 'ok' then 'سليمة' when 'damaged' then 'متضررة' when 'replace' then 'يجب استبدالها' when 'missing' then 'مفقودة' else null end;
  body_txt := format('%s · %s — %s', c.code, c.label, coalesce(who, 'المتابعة'));
  if has_loc then
    body_txt := body_txt || format(' اقترح موقعاً جديداً (%s, %s)%s', round(p_latitude::numeric, 6), round(p_longitude::numeric, 6),
                case when p_accuracy is not null then format(' · دقة ±%s م', round(p_accuracy)) else '' end);
  end if;
  if new_status is not null then
    body_txt := body_txt || case when has_loc then ' · ' else ' اقترح ' end || 'الحالة: ' || status_ar;
  end if;
  insert into public.notifications(user_id, title, body, type, link)
  select ur.user_id, case k when 'location' then 'طلب تحديث موقع حاوية' when 'status' then 'طلب تحديث حالة حاوية' else 'طلب تحديث موقع وحالة حاوية' end,
         body_txt, 'info', '/ops-room/gbs-containers'
  from public.user_roles ur
  where ur.role in ('ops_room','super_admin');
  return uid;
end$$;
revoke all on function public.gbs_container_request_location(uuid, float8, float8, float8, text, text) from public, anon;
grant execute on function public.gbs_container_request_location(uuid, float8, float8, float8, text, text) to authenticated;

-- المراجعة: 'both' يطبّق الموقع والحالة معاً
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
    if r.kind in ('location','both') then
      update public.gbs_container_updates set previous_latitude = c.latitude, previous_longitude = c.longitude where id = r.id;
      update public.gbs_containers
         set latitude = r.proposed_latitude, longitude = r.proposed_longitude, updated_at = now()
       where id = c.id returning * into c;
    end if;
    if r.kind in ('status','both') then
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
  status_ar := case r.proposed_status
    when 'ok' then 'سليمة' when 'damaged' then 'متضررة'
    when 'replace' then 'يجب استبدالها' else 'مفقودة' end;
  body_txt := format('%s · %s', c.code, c.label);
  if r.kind in ('location','both') then
    body_txt := body_txt || format(' — الموقع المقترح: (%s, %s)', round(r.proposed_latitude::numeric, 6), round(r.proposed_longitude::numeric, 6));
  end if;
  if r.kind in ('status','both') then
    body_txt := body_txt || ' — الحالة المقترحة: ' || status_ar;
  end if;
  if nullif(trim(coalesce(p_review_note,'')),'') is not null then
    body_txt := body_txt || ' · ملاحظة: ' || trim(p_review_note);
  end if;
  lnk := case when exists(select 1 from public.user_roles ur where ur.user_id = r.requested_by and ur.role = 'follow_up')
              then '/follow-up/containers' else '/manager/gbs-containers' end;
  insert into public.notifications(user_id, title, body, type, link, dedupe_key)
  values(r.requested_by,
         case when p_approve then (case r.kind when 'location' then 'تم اعتماد موقع الحاوية الجديد' when 'both' then 'تم اعتماد موقع الحاوية وحالتها' else 'تم اعتماد تحديث الحاوية' end)
              else (case r.kind when 'location' then 'تم رفض تحديث موقع الحاوية' when 'both' then 'تم رفض تحديث موقع الحاوية وحالتها' else 'تم رفض تحديث الحاوية' end) end,
         body_txt,
         case when p_approve then 'success' else 'warning' end,
         lnk,
         'gbs:review:' || r.id::text)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return query select c.id, c.code, c.status;
end$$;
