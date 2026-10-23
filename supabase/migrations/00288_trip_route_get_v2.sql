-- 00288 (00345) — trip_route_get_v2: المسار + بيانات الانطلاقية (المركبة، السائق، القاطع، الشفت، أوقات المغادرة/الوصول/العودة) لترويسة التقارير والتصدير
create or replace function public.trip_route_get_v2(p_departure uuid, p_max_points int default 3000) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare base jsonb; trip jsonb;
begin
  base := public.trip_route_get(p_departure, p_max_points);   -- يتحقق من الصلاحية ووجود الانطلاقية
  select jsonb_build_object('departure_id', d.id, 'vehicle_id', d.vehicle_id, 'vehicle_name', v.vehicle_name, 'db_number', v.db_number, 'plate_number', v.plate_number,
           'vehicle_category', v.vehicle_category, 'driver_name', d.driver_name, 'shift', d.shift, 'sector_id', d.sector_id, 'sector_name', s.name,
           'departed_at', d.departed_at, 'site_arrived_at', d.arrived_at, 'site_departed_at', d.site_departed_at, 'returned_at', d.returned_at,
           'departed_by_name', app.user_display_name(d.departed_by), 'returned_by_name', app.user_display_name(d.returned_by), 'notes', d.notes,
           'device_name', (select g.name from public.gps_devices g join public.gps_vehicle_bindings b on b.device_id = g.id where b.garage_vehicle_id = d.vehicle_id limit 1),
           'device_external_id', (select g.external_id from public.gps_devices g join public.gps_vehicle_bindings b on b.device_id = g.id where b.garage_vehicle_id = d.vehicle_id limit 1))
    into trip
    from public.garage_departures d join public.garage_vehicles v on v.id = d.vehicle_id left join public.sectors s on s.id = d.sector_id
    where d.id = p_departure;
  return base || jsonb_build_object('trip', trip);
end$$;
revoke all on function public.trip_route_get_v2(uuid, int) from public, anon;
grant execute on function public.trip_route_get_v2(uuid, int) to authenticated, service_role;
