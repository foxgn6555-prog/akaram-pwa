-- 00293 (00349 الجولة C) — إصلاح نقاط الاختناق التي كشفها اختبار الحِمل المحلي (scripts/db-load-test.mjs)
--   لا تغيير في السلوك أو النتائج — أداء فقط.
--
-- 1) app.biometric_touch: كانت كل بصمة تحدّث صف الجهاز نفسه (last_seen_at) داخل معاملتها ⇒ 500 بصمة متزامنة
--    تصطف خلف قفل صف واحد (متوسط الانتظار 270 ms، الأقصى 2 ث). الآن: إن كان الصف مقفولاً من بصمة أخرى
--    في اللحظة نفسها نتخطى التحديث (skip locked) لأن تلك البصمة ستكتب now() أصلاً — النتيجة نفسها بلا اصطفاف.
create or replace function app.biometric_touch(p_sn text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.biometric_devices d
     set last_seen_at = now()
   where d.id = (select x.id from public.biometric_devices x where x.serial_number = p_sn and x.is_active for update skip locked);
$$;
revoke all on function app.biometric_touch(text) from public, anon, authenticated;

-- 2) app.station_mark_arrivals: تُستدعى مرتين لكل موقع GPS (تاريخ + حالي) وتنفّذ استعلامين ديناميكيين على سجلات
--    الخروج حتى عندما لا توجد أي آلية خارجة متتبَّعة لهذا الجهاز (الحالة الغالبة: 300 جهاز × كل ثانية).
--    الآن: فحص سريع عبر فهرس جزئي ⇒ خروج فوري إن لم يكن للجهاز سجل خروج مفتوح متتبَّع بالـ GPS.
create index if not exists ts_saksat_open_gps_device_idx on public.ts_saksat_records (device_id, exit_time)
  where arrived_at is null and tracking = 'gps' and archived_at is null;
create index if not exists ts_carrier_open_gps_device_idx on public.ts_carrier_records (device_id, exit_time)
  where arrived_at is null and tracking = 'gps' and archived_at is null;

create or replace function app.station_mark_arrivals(p_device_id uuid, p_lat double precision, p_lng double precision, p_fix timestamptz)
returns integer language plpgsql security definer set search_path=public,app as $$
declare n integer := 0; r record; t text;
begin
  if p_device_id is null or p_lat is null or p_lng is null or p_fix is null then return 0; end if;
  -- 00293: خروج سريع — لا سجل خروج مفتوح متتبَّع لهذا الجهاز (الفهرسان الجزئيان أعلاه)
  if not exists (select 1 from public.ts_saksat_records s where s.device_id = p_device_id and s.arrived_at is null and s.tracking = 'gps' and s.archived_at is null)
     and not exists (select 1 from public.ts_carrier_records s where s.device_id = p_device_id and s.arrived_at is null and s.tracking = 'gps' and s.archived_at is null) then
    return 0;
  end if;
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
revoke all on function app.station_mark_arrivals(uuid,double precision,double precision,timestamptz) from public, anon;

-- 3) مفاتيح أجنبية بلا فهرس على مسارات ساخنة (كشفها التشخيص بعد الحِمل). أعمدة التدقيق (*_by) تُركت عمداً:
--    لا تُستخدم في ترشيح أو ربط متكرر، وفهرستها تكلفة كتابة بلا عائد.
create index if not exists approval_tasks_chain_idx on public.approval_tasks (chain_id);
create index if not exists biometric_punches_device_idx on public.biometric_punches (device_id, punched_at desc);
create index if not exists employee_shift_assignments_shift_idx on public.employee_shift_assignments (shift_id);
create index if not exists hire_requests_department_idx on public.hire_requests (department_id);
create index if not exists hire_requests_job_title_idx on public.hire_requests (job_title_id);
create index if not exists hire_requests_employee_idx on public.hire_requests (employee_id) where employee_id is not null;
create index if not exists hire_requests_chain_idx on public.hire_requests (chain_id);
create index if not exists hire_requests_shift_idx on public.hire_requests (shift_id) where shift_id is not null;
create index if not exists live_track_points_user_idx on public.live_track_points (user_id, recorded_at desc);
