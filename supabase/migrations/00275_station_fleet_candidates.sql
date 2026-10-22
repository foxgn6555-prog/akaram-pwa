-- 00275 · المحطة التحويلية (٢/٥) — بحث آليات الكراج لتعليمها «آلية محطة» (غرفة العمليات فقط)
create or replace function public.station_fleet_candidates(p_search text default null, p_only_station boolean default false, p_limit integer default 60)
returns table(id uuid, vehicle_name text, db_number text, plate_number text, vehicle_category text, category_label text,
              station_outbound boolean, is_station_vehicle boolean, driver_name text, has_gps boolean, ownership_type text, sector_name text)
language plpgsql stable security definer set search_path=public,app as $$
declare q text := nullif(trim(coalesce(p_search,'')), '');
begin
  if auth.uid() is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if p_limit not between 1 and 200 then raise exception 'STATION_PAGE_INVALID'; end if;
  return query
  select v.id, v.vehicle_name, v.db_number, v.plate_number, v.vehicle_category, c.label, c.station_outbound, v.is_station_vehicle,
         v.driver_name, (b.device_id is not null), v.ownership_type, s.name
  from public.garage_vehicles v
  join public.vehicle_categories c on c.code = v.vehicle_category
  left join public.gps_vehicle_bindings b on b.garage_vehicle_id = v.id
  left join public.sectors s on s.id = v.sector_id
  where v.archived_at is null
    and (not p_only_station or v.is_station_vehicle)
    and (q is null or v.db_number ilike '%' || q || '%' or v.plate_number ilike '%' || q || '%' or v.vehicle_name ilike '%' || q || '%' or c.label ilike '%' || q || '%')
  order by v.is_station_vehicle desc, c.sort, v.db_number
  limit p_limit;
end $$;
revoke all on function public.station_fleet_candidates(text, boolean, integer) from public, anon;
grant execute on function public.station_fleet_candidates(text, boolean, integer) to authenticated;
