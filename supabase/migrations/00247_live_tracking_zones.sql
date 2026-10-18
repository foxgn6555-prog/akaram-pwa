-- 00247 · البث المباشر (٣/٤): زونات الخريطة مع من يُسنَد إليها (مسؤول القسم/المتعهد) — لغرفة العمليات
--   كل زون مرتبط بمنطقة (gps_geofences.sector_id)؛ ومسؤول القسم مرتبط بمناطقه (manager_profiles.sectors) والمتعهد بمنطقته (contractor_profiles).
create or replace function public.live_zones_list()
returns table(id uuid, name text, color text, polygon jsonb, sector_id smallint, area_name text, parent_sector text,
              manager_ids uuid[], manager_names text, contractor_id uuid, contractor_name text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.live_is_viewer() then raise exception 'LIVE_FORBIDDEN'; end if;
  return query
  select g.id, g.name, g.color, g.polygon, g.sector_id, s.name, s.parent_sector,
         coalesce((select array_agg(mp.user_id order by mp.user_id) from public.manager_profiles mp
                   join public.user_roles ur on ur.user_id = mp.user_id and ur.role = 'department_manager'
                   where g.sector_id = any(mp.sectors)), '{}'::uuid[]),
         (select string_agg(app.manager_display_name(mp.user_id), '، ' order by mp.user_id) from public.manager_profiles mp
                   join public.user_roles ur on ur.user_id = mp.user_id and ur.role = 'department_manager'
                   where g.sector_id = any(mp.sectors)),
         (select cp.user_id from public.contractor_profiles cp where cp.sector_id = g.sector_id and cp.is_active limit 1),
         (select app.manager_display_name(cp.user_id) from public.contractor_profiles cp where cp.sector_id = g.sector_id and cp.is_active limit 1)
  from public.gps_geofences g
  left join public.sectors s on s.id = g.sector_id
  where g.is_active
  order by s.sort nulls last, g.name;
end$$;
revoke all on function public.live_zones_list() from public, anon;
grant execute on function public.live_zones_list() to authenticated;
