-- 00363 — بقع التوقف: شمول الأجهزة غير المربوطة بآلية (كل أجهزة GPS الفعّالة)
-- p_budget_ms: سقف زمني للمسح (التشغيل الدوري 120 ث؛ التحديث الكسول من الخريطة 3 ث) — ما لم يُنجز يُستكمل في الدورة التالية.
-- يُمسح كل جهاز على شرائح 24 ساعة كي لا تُحمَّل أيام الإعداد الأول دفعة واحدة.
create or replace function app.gps_stop_hotspots_refresh(p_budget_ms integer default 120000)
returns table (devices integer, upserted integer, purged integer, took_ms integer, caught_up boolean)
language plpgsql volatile security definer set search_path = public, app as $$
declare
  s public.gps_stop_hotspot_settings%rowtype; d record; r record; t0 timestamptz := clock_timestamp();
  v_devices integer := 0; v_up integer := 0; v_purged integer := 0; v_floor timestamptz; v_from timestamptz; v_to timestamptz;
  v_done boolean := true;
begin
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  if not s.enabled then return query select 0, 0, 0, 0, true; return; end if;
  v_floor := now() - make_interval(days => s.max_days);
  -- 00363: كل أجهزة GPS الفعّالة (المربوطة بآلية وغير المربوطة) — غير المربوطة تُعرض باسم الجهاز
  for d in select g.id device_id, st.scan_from from public.gps_devices g
           left join public.gps_stop_scan_state st on st.device_id = g.id
           where g.is_active
           order by st.last_scan_at nulls first loop
    if extract(epoch from clock_timestamp() - t0) * 1000 > p_budget_ms then v_done := false; exit; end if;
    v_devices := v_devices + 1;
    v_from := greatest(coalesce(d.scan_from, v_floor), v_floor);
    v_to := least(now(), v_from + interval '24 hours');
    loop
      select * into r from app.gps_stop_scan_device(d.device_id, v_from, v_to);
      v_up := v_up + coalesce(r.upserted, 0);
      -- العلامة المائية: بداية التوقف المفتوح أو آخر نقطة؛ وإن خلت الشريحة من نقاط نقفز إلى نهايتها
      v_from := coalesce(r.next_scan_from, v_to);
      insert into public.gps_stop_scan_state (device_id, scan_from, last_fix_at, last_scan_at, last_points)
      values (d.device_id, v_from, r.last_fix, now(), coalesce(r.points, 0))
      on conflict (device_id) do update set scan_from = excluded.scan_from,
        last_fix_at = coalesce(excluded.last_fix_at, gps_stop_scan_state.last_fix_at), last_scan_at = now(), last_points = excluded.last_points;
      exit when v_to >= now();
      -- نهاية الشريحة تتقدم دائماً 24 ساعة (حتى لو بقيت البداية عند توقف مفتوح طويل) ⇒ لا حلقة لا نهائية
      v_to := least(now(), v_to + interval '24 hours');
      if extract(epoch from clock_timestamp() - t0) * 1000 > p_budget_ms then v_done := false; exit; end if;
    end loop;
    exit when not v_done;
  end loop;
  -- إعادة تقييم الاستبعاد (قد تتغير القائمة) ثم حذف ما تجاوز الحد الأقصى
  update public.gps_stop_events e set excluded = x.reason is not null, excluded_reason = x.reason
    from (select e2.id, app.gps_stop_is_excluded(e2.latitude, e2.longitude) reason from public.gps_stop_events e2 where e2.ended_at >= v_floor) x
    where x.id = e.id and (e.excluded <> (x.reason is not null) or e.excluded_reason is distinct from x.reason);
  delete from public.gps_stop_events where ended_at < v_floor;
  get diagnostics v_purged = row_count;
  update public.gps_stop_hotspot_settings set last_refresh_at = now(),
    last_refresh_ms = (extract(epoch from clock_timestamp() - t0) * 1000)::integer where id = 1;
  return query select v_devices, v_up, v_purged, (extract(epoch from clock_timestamp() - t0) * 1000)::integer, v_done;
end $$;
