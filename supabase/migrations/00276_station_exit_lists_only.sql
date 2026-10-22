-- 00276 · المحطة التحويلية (٣/٥) — الخروج بالقوائم فقط
--   يُغلق الإدخال المباشر في ts_saksat_records / ts_carrier_records (كان يسمح بأسماء نصية حرة).
--   المصدر الوحيد للسجلات الجديدة: station_record_exit (آلية محطة + سائق من القوائم + وجهة).
--   السجلات القديمة تبقى كما هي للقراءة والأرشفة.
drop policy if exists "ts_saksat: كتابة المحطة" on public.ts_saksat_records;
drop policy if exists "ts_carrier: كتابة المحطة" on public.ts_carrier_records;

-- التعديل المباشر من المحطة يبقى للأرشفة/الحالة فقط: لا تغيير للسائق/الآلية/الوجهة/الوصول بعد التسجيل
create or replace function app.station_exit_lock_fields() returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' or coalesce(current_setting('app.station_arrival', true), '') = '1' then return new; end if;
  if new.driver_name is distinct from old.driver_name or new.vehicle_id is distinct from old.vehicle_id
     or new.driver_kind is distinct from old.driver_kind or new.driver_employee_id is distinct from old.driver_employee_id
     or new.external_driver_id is distinct from old.external_driver_id or new.destination_id is distinct from old.destination_id
     or new.exit_time is distinct from old.exit_time or new.arrived_at is distinct from old.arrived_at
     or new.tracking is distinct from old.tracking or new.device_id is distinct from old.device_id then
    raise exception 'STATION_EXIT_FIELDS_LOCKED';
  end if;
  return new;
end $$;
-- تسجيل الوصول الآلي يمرّ عبر علم جلسة محلي (المعاملة فقط)
create or replace function app.station_mark_arrivals(p_device_id uuid, p_lat double precision, p_lng double precision, p_fix timestamptz)
returns integer language plpgsql security definer set search_path=public,app as $$
declare n integer := 0; r record; t text;
begin
  if p_device_id is null or p_lat is null or p_lng is null or p_fix is null then return 0; end if;
  perform set_config('app.station_arrival', '1', true);
  foreach t in array array['ts_saksat_records','ts_carrier_records'] loop
    for r in execute format($q$
      select s.id, s.driver_name, s.vehicle_type, v.db_number, d.name dest_name, s.exit_time
      from public.%I s
      join public.station_destinations d on d.id = s.destination_id
      join public.gps_geofences g on g.id = d.geofence_id and g.is_active
      left join public.garage_vehicles v on v.id = s.vehicle_id
      where s.device_id = $1 and s.arrived_at is null and s.tracking = 'gps' and s.archived_at is null
        and s.exit_time <= $2 and s.exit_time >= $2 - interval '24 hours'
        and app.gps_point_in_polygon($3, $4, g.polygon)
      for update of s skip locked $q$, t) using p_device_id, p_fix, p_lat, p_lng
    loop
      execute format('update public.%I set arrived_at = $1, arrival_latitude = $2, arrival_longitude = $3 where id = $4', t) using p_fix, p_lat, p_lng, r.id;
      insert into public.notifications (user_id, title, body, type, link)
      select ur.user_id, 'وصلت الآلية إلى ' || r.dest_name,
        format('%s DB %s بقيادة %s وصلت إلى %s بعد %s دقيقة من الخروج', coalesce(r.vehicle_type,'آلية'), coalesce(r.db_number,'—'), r.driver_name, r.dest_name,
               greatest(0, floor(extract(epoch from (p_fix - r.exit_time)) / 60))::int),
        'success', '/ops-room/station-outbound'
      from public.user_roles ur where ur.role = 'ops_room';
      n := n + 1;
    end loop;
  end loop;
  perform set_config('app.station_arrival', '', true);
  return n;
end $$;

create trigger trg_ts_saksat_lock before update on public.ts_saksat_records for each row execute function app.station_exit_lock_fields();
create trigger trg_ts_carrier_lock before update on public.ts_carrier_records for each row execute function app.station_exit_lock_fields();
