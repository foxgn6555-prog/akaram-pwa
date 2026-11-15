-- بيانات البث المباشر: اليوم/الفترة بتوقيت بغداد تشمل الجلسات العابرة لمنتصف الليل.
-- كانت القائمة تُرشّح حسب يوم بداية الجلسة فقط، فتختفي الجلسات الليلية التي بدأت أمس وما زالت/انتهت اليوم.
-- تعديل عرضي فقط: تقاطع فترة الجلسة مع مدى الأيام المطلوبة، دون تغيير محرك البث أو النقاط أو الصلاحيات.

create or replace function public.live_sessions_list(p_from date, p_to date, p_kind text default null, p_user uuid default null)
returns table(session_id uuid, user_id uuid, kind text, full_name text, sectors smallint[], area_names text, manager_name text, shift_name text,
              shift_start timestamptz, shift_end timestamptz, started_at timestamptz, last_seen_at timestamptz, ended_at timestamptz, end_reason text,
              first_lat double precision, first_lng double precision, first_in_zone boolean, last_lat double precision, last_lng double precision, last_in_zone boolean,
              point_count integer, out_of_zone_count integer, duration_minutes integer)
language plpgsql security definer set search_path = public, app as $$
declare
  v_from timestamptz;
  v_to_exclusive timestamptz;
begin
  if not app.live_is_viewer() then raise exception 'LIVE_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'LIVE_RANGE_INVALID'; end if;
  if p_kind is not null and p_kind not in ('manager','contractor') then raise exception 'LIVE_KIND_INVALID'; end if;
  perform app.live_housekeeping();

  -- مدى الأيام بتوقيت بغداد: [بداية p_from, بداية اليوم التالي لـ p_to)
  v_from := (p_from::timestamp at time zone 'Asia/Baghdad');
  v_to_exclusive := ((p_to + 1)::timestamp at time zone 'Asia/Baghdad');

  return query
  select s.id, s.user_id, s.kind, app.manager_display_name(s.user_id), s.sectors, app.live_sector_names(s.sectors),
         case when s.kind = 'contractor' then (select app.manager_display_name(cp.manager_user_id) from public.contractor_profiles cp where cp.user_id = s.user_id) end,
         s.shift_name, s.shift_start, s.shift_end, s.started_at, s.last_seen_at, s.ended_at, s.end_reason,
         s.first_lat, s.first_lng, s.first_in_zone, s.last_lat, s.last_lng, s.last_in_zone, s.point_count, s.out_of_zone_count,
         (extract(epoch from (coalesce(s.ended_at, least(now(), s.shift_end)) - s.started_at)) / 60)::int
  from public.live_track_sessions s
  where s.started_at < v_to_exclusive
    and coalesce(s.ended_at, s.shift_end, now()) >= v_from
    and (p_kind is null or s.kind = p_kind)
    and (p_user is null or s.user_id = p_user)
  order by s.started_at desc;
end$$;

revoke all on function public.live_sessions_list(date, date, text, uuid) from public, anon;
grant execute on function public.live_sessions_list(date, date, text, uuid) to authenticated;
