-- 00364 — بقع التوقف: سحب نقاط التوقف من LVN مباشرة (سجل get_history) لكل أجهزة GPS الفعّالة
-- المزامنة اللحظية تعتمد على فتح الصفحة فتترك فجوات؛ هنا طابور سحب لكل جهاز (حتى الحد الأقصى بالأيام) بعلامة «مسحوب حتى»،
-- تنفّذه دالة الحافة lvn-gps-sync (action='stops') على دفعات، ثم يُعاد حساب البقع.

alter table public.gps_stop_scan_state
  add column if not exists lvn_pulled_until timestamptz,
  add column if not exists lvn_last_pull_at timestamptz,
  add column if not exists lvn_last_error text,
  add column if not exists lvn_points_total bigint not null default 0;

-- طابور السحب: الأجهزة الأكثر تأخراً أولاً؛ كل عنصر نافذة ≤ 24 ساعة من آخر نقطة مسحوبة (أو أرضية النافذة)
create or replace function public.gps_stop_pull_queue(p_limit integer default 4)
returns table (device_id uuid, external_id text, device_name text, pull_from timestamptz, pull_to timestamptz, pulled_until timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
declare s public.gps_stop_hotspot_settings%rowtype; v_floor timestamptz; v_edge timestamptz := now() - interval '2 minutes';
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  if not s.enabled then return; end if;
  v_floor := now() - make_interval(days => s.max_days);
  return query
    select g.id, g.external_id, g.name,
           greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor) pull_from,
           least(v_edge, greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor) + interval '24 hours') pull_to,
           st.lvn_pulled_until
    from public.gps_devices g
    left join public.gps_stop_scan_state st on st.device_id = g.id
    where g.is_active
      and least(v_edge, greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor) + interval '24 hours')
          - greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor) >= interval '10 minutes'
    order by st.lvn_pulled_until nulls first, g.name
    limit least(greatest(coalesce(p_limit, 4), 1), 20);
end $$;
revoke all on function public.gps_stop_pull_queue(integer) from public, anon, authenticated;
grant execute on function public.gps_stop_pull_queue(integer) to service_role;

create or replace function public.gps_stop_pull_mark(p_device_id uuid, p_until timestamptz, p_points integer default 0, p_error text default null)
returns void language plpgsql volatile security definer set search_path = public, app as $$
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  insert into public.gps_stop_scan_state (device_id, lvn_pulled_until, lvn_last_pull_at, lvn_last_error, lvn_points_total, last_scan_at)
  values (p_device_id, p_until, now(), p_error, greatest(coalesce(p_points, 0), 0), now())
  on conflict (device_id) do update set
    lvn_pulled_until = case when p_error is null then greatest(coalesce(gps_stop_scan_state.lvn_pulled_until, p_until), p_until) else gps_stop_scan_state.lvn_pulled_until end,
    lvn_last_pull_at = now(), lvn_last_error = p_error,
    lvn_points_total = gps_stop_scan_state.lvn_points_total + greatest(coalesce(p_points, 0), 0),
    -- نقاط جديدة قد تسبق العلامة المائية للمسح ⇒ نعيد المسح من بداية النافذة المسحوبة
    scan_from = case when p_error is null and coalesce(p_points, 0) > 0 then least(coalesce(gps_stop_scan_state.scan_from, p_until), p_until - interval '24 hours') else gps_stop_scan_state.scan_from end;
end $$;
revoke all on function public.gps_stop_pull_mark(uuid, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.gps_stop_pull_mark(uuid, timestamptz, integer, text) to service_role;

create or replace function public.gps_stop_hotspots_refresh_service(p_budget_ms integer default 15000)
returns jsonb language plpgsql volatile security definer set search_path = public, app as $$
declare r record;
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  if not pg_try_advisory_xact_lock(hashtext('gps_stop_hotspots_refresh')) then return jsonb_build_object('ok', false, 'busy', true); end if;
  select * into r from app.gps_stop_hotspots_refresh(p_budget_ms);
  return jsonb_build_object('ok', true, 'devices', r.devices, 'upserted', r.upserted, 'purged', r.purged, 'took_ms', r.took_ms, 'caught_up', r.caught_up);
end $$;
revoke all on function public.gps_stop_hotspots_refresh_service(integer) from public, anon, authenticated;
grant execute on function public.gps_stop_hotspots_refresh_service(integer) to service_role;

-- حالة السحب للواجهة
create or replace function public.gps_stop_pull_status()
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare s public.gps_stop_hotspot_settings%rowtype; v_floor timestamptz; j jsonb;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  v_floor := now() - make_interval(days => s.max_days);
  select jsonb_build_object(
    'devices', count(*),
    'caught_up', count(*) filter (where st.lvn_pulled_until >= now() - interval '30 minutes'),
    'never_pulled', count(*) filter (where st.lvn_pulled_until is null),
    'errors', count(*) filter (where st.lvn_last_error is not null),
    'oldest_pulled_until', min(coalesce(st.lvn_pulled_until, v_floor)),
    'last_pull_at', max(st.lvn_last_pull_at),
    'points_total', coalesce(sum(st.lvn_points_total), 0),
    'last_error', (select x.lvn_last_error from public.gps_stop_scan_state x where x.lvn_last_error is not null order by x.lvn_last_pull_at desc nulls last limit 1),
    'pending_hours', coalesce(round(sum(greatest(extract(epoch from now() - greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor)), 0)) / 3600.0, 1), 0))
  into j
  from public.gps_devices g left join public.gps_stop_scan_state st on st.device_id = g.id where g.is_active;
  return j;
end $$;
revoke all on function public.gps_stop_pull_status() from public, anon;
grant execute on function public.gps_stop_pull_status() to authenticated;
