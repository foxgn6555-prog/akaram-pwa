-- 00235 · إصلاحات أخطاء ظاهرة في الإنتاج (00265)
--   ① «permission denied for function is_active_contractor» عند رفع الصور من مسؤول القسم:
--      سياسات التخزين (media-photos) تستدعي app.is_active_contractor() بدور authenticated، لكن 00227 سحب الصلاحية
--      دون منحها لـ authenticated ⇒ فشل الرفع لكل المستخدمين (السياسات تُقيَّم جميعها). الإصلاح: منح التنفيذ.
--   ② قراءات بوابة المتابعة لمستخدم بلا نطاق (مدير النظام مثلاً) كانت تُرجع 400 (FOLLOW_UP_NOT_ASSIGNED /
--      GBS_MANAGER_FORBIDDEN) كل دقيقة. القراءة تُرجع فارغاً/أصفاراً بهدوء؛ الكتابة (follow_up_set_headcount، طلب تحديث الحاوية) تبقى صارمة.

-- ① منح التنفيذ لدوال app المستخدمة في سياسات التخزين
grant execute on function app.is_active_contractor(uuid) to authenticated;

-- ② قارئ النطاق بلا رفع خطأ (الدور مطلوب، الإسناد اختياري)
create or replace function app.follow_up_profile_or_null() returns public.follow_up_profiles
language plpgsql stable security definer set search_path = public, app as $$
declare f public.follow_up_profiles;
begin
  if auth.uid() is null or not app.has_role(array['follow_up','super_admin']) then raise exception 'FOLLOW_UP_FORBIDDEN'; end if;
  select * into f from public.follow_up_profiles where user_id = auth.uid() and is_active;
  return f;  -- null إن لم يُسند
end$$;
revoke all on function app.follow_up_profile_or_null() from public, anon;

create or replace function public.follow_up_me()
returns table(user_id uuid, full_name text, parent_sectors text[], sector_ids smallint[], areas jsonb, areas_count int, contractors_count int,
              today date, today_checked_in int, today_counted_by_me int, month_locked boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare f public.follow_up_profiles; ids smallint[]; d date := app.baghdad_today();
begin
  f := app.follow_up_profile_or_null();
  if f.user_id is null then return; end if;
  ids := app.follow_up_sectors(f.user_id);
  return query
  select f.user_id, app.manager_display_name(f.user_id), f.parent_sectors, f.sector_ids,
    coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'parent_sector', s.parent_sector) order by s.id) from public.sectors s where s.id = any(ids)), '[]'::jsonb),
    cardinality(ids),
    (select count(*)::int from public.contractor_profiles cp where cp.is_active and cp.sector_id = any(ids)),
    d,
    (select count(*)::int from public.contractor_checkins c join public.contractor_profiles cp on cp.user_id = c.contractor_user_id and cp.is_active where c.log_date = d and cp.sector_id = any(ids)),
    (select count(*)::int from public.contractor_daily_counts x where x.log_date = d and x.source = 'follow_up' and x.entered_by = f.user_id),
    app.contractor_month_locked(d);
end$$;

create or replace function public.follow_up_contractors(p_date date default null)
returns table(contractor_user_id uuid, contractor_name text, sector_id smallint, area_name text, parent_sector text, shift text,
              checked_in boolean, checkin_at timestamptz, in_zone boolean, contractor_headcount int, my_headcount int, my_updated_at timestamptz, editable boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare f public.follow_up_profiles; ids smallint[]; d date := coalesce(p_date, app.baghdad_today());
begin
  f := app.follow_up_profile_or_null();
  if f.user_id is null then return; end if;
  ids := app.follow_up_sectors(f.user_id);
  return query
  select cp.user_id, app.manager_display_name(cp.user_id), cp.sector_id, s.name, s.parent_sector, cp.shift,
    c.id is not null, c.checked_at, c.in_zone,
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'contractor'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'follow_up'),
    (select x.updated_at from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'follow_up'),
    d = app.baghdad_today() and not app.contractor_month_locked(d)
  from public.contractor_profiles cp
  join public.sectors s on s.id = cp.sector_id
  left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
  where cp.is_active and cp.sector_id = any(ids)
  order by s.parent_sector, s.id;
end$$;

create or replace function public.follow_up_containers_summary()
returns table(containers int, damaged int, missing int, my_pending int, my_approved int, my_rejected int)
language plpgsql stable security definer set search_path=public,app as $$
declare f public.follow_up_profiles; ids smallint[]; u uuid := auth.uid();
begin
  f := app.follow_up_profile_or_null();
  ids := case when f.user_id is null then app.gbs_read_sectors(u) else app.follow_up_sectors(f.user_id) end;
  return query
  select (select count(*)::int from public.gbs_containers c where ids is null or c.sector_id = any(ids)),
         (select count(*)::int from public.gbs_containers c where (ids is null or c.sector_id = any(ids)) and c.status in ('damaged','replace')),
         (select count(*)::int from public.gbs_containers c where (ids is null or c.sector_id = any(ids)) and c.status = 'missing'),
         (select count(*)::int from public.gbs_container_updates x where x.requested_by = u and x.state = 'pending'),
         (select count(*)::int from public.gbs_container_updates x where x.requested_by = u and x.state = 'approved'),
         (select count(*)::int from public.gbs_container_updates x where x.requested_by = u and x.state = 'rejected');
end$$;

-- «طلباتي»: مدير النظام/غرفة العمليات يستعرضان البوابة أيضاً ⇒ طلباتهم (فارغة غالباً) بدل 400
create or replace function public.gbs_my_update_requests()
returns table(id uuid, container_id uuid, code text, label text, proposed_status text,
              photo_path text, note text, state text, created_at timestamptz,
              reviewed_at timestamptz, review_note text,
              kind text, proposed_latitude float8, proposed_longitude float8, accuracy_m float8)
language plpgsql stable security definer set search_path=public,app as $$
declare u uuid := auth.uid();
begin
  if u is null or not app.has_role(array['department_manager','follow_up','super_admin','ops_room']) then
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
