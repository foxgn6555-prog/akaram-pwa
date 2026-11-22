-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122001600_map_public_rpc_wrappers.sql
-- أغلفة public للدوال التي تناديها الواجهة — ١٧ دالة.
--
-- المشكلة التي يحلّها: كل دوال الخريطة في schema `app`، وPostgREST يكشف
-- `public` فقط (لا db_schemas، ولا .schema('app') في العميل). فكان كل
-- rpc('map_*') يفشل بـ PGRST202 — أي كل أزرار الخريطة.
--
-- النمط من 00032_public_rpc_round3.sql (archive_counts …).
-- التواقيع والأعمدة المُرجعة منسوخة حرفياً من تعريفات app.map_* — لا تقدير.
--
-- إصلاح ثانٍ: الحرّاس. دوال app تعمل security definer، فالـRLS على جداول
-- map_* يُقيَّم بهوية المالك لا المستخدم — أي أن RLS لا يحمي. لذلك يُنفَّذ
-- حارس الدور في الغلاف نفسه، **قبل** أي تعديل.
--
-- التراجع: drop function public.map_* ;
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ⓪ حرّاس موحّدون
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.map_require_editor()
returns void language plpgsql stable security definer set search_path = public, app
as $$
begin
  if coalesce(app.has_role(array['ops_room', 'it_admin', 'super_admin']), false) is not true then
    raise exception 'MAP_FORBIDDEN: لا تملك صلاحية تعديل بيانات التخطيط الجغرافي'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

create or replace function public.map_require_reader()
returns void language plpgsql stable security definer set search_path = public, app
as $$
begin
  if coalesce(app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']), false) is not true then
    raise exception 'MAP_FORBIDDEN: لا تملك صلاحية قراءة بيانات التخطيط الجغرافي'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

comment on function public.map_require_editor() is
  'حارس دور موحّد للكتابة في الخريطة — ترمي MAP_FORBIDDEN.';
comment on function public.map_require_reader() is
  'حارس دور موحّد للقراءة في الخريطة — ترمي MAP_FORBIDDEN.';

revoke all on function public.map_require_editor(), public.map_require_reader() from public, anon;
grant execute on function public.map_require_editor(), public.map_require_reader() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ① الاستيراد  ② الزيارات  ③ التغطية  ④ المثراة  ⑤ التصدير
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.map_osm_script(p_zone uuid)
returns text
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return app.map_osm_script(p_zone);
end $$;

create or replace function public.map_zone_polygon(p_zone uuid)
returns text
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return app.map_zone_polygon(p_zone);
end $$;

create or replace function public.map_import_batch(p_zone uuid, p_rows jsonb, p_mahallas jsonb default '{}'::jsonb, p_batch uuid default null, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, app
as $$
begin
  perform public.map_require_editor();
  return app.map_import_batch(p_zone, p_rows, p_mahallas, p_batch, p_meta);
end $$;

create or replace function public.map_build_visits(p_zone uuid, p_from timestamptz, p_to timestamptz, p_vehicle uuid default null, p_min_dwell_seconds integer default 60, p_max_gap_seconds integer default 300, p_replace boolean default true)
returns table (visits_created integer, visits_merged integer, places_scanned integer)
language plpgsql security definer set search_path = public, app
as $$
begin
  perform public.map_require_editor();
  return query select * from app.map_build_visits(p_zone, p_from, p_to, p_vehicle, p_min_dwell_seconds, p_max_gap_seconds, p_replace);
end $$;

create or replace function public.map_coverage_summary(p_zone uuid, p_day date)
returns table ( place_kind text, places_total integer, places_visited integer, places_confirmed integer, places_uncertain integer, coverage_pct numeric )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_coverage_summary(p_zone, p_day);
end $$;

create or replace function public.map_coverage_by_place(p_zone uuid, p_day date, p_kind text default null)
returns table ( place_kind text, place_id uuid, place_code text, place_name text, mahalla_code text, width_m numeric, length_m numeric, visited boolean, confirmed boolean, uncertain_visits integer, visits_count integer, first_entered_at timestamptz, last_exited_at timestamptz, total_dwell_seconds integer, vehicles_count integer, max_depth_m numeric )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_coverage_by_place(p_zone, p_day, p_kind);
end $$;

create or replace function public.map_coverage_by_vehicle(p_zone uuid, p_day date)
returns table ( vehicle_id uuid, vehicle_name text, db_number text, plate_number text, shift text, driver_name text, in_fleet boolean, unbound_devices integer, visits_count integer, confirmed_count integer, uncertain_count integer, places_count integer, total_dwell_seconds integer, first_at timestamptz, last_at timestamptz )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_coverage_by_vehicle(p_zone, p_day);
end $$;

create or replace function public.map_coverage_rollup(p_zone uuid, p_day date)
returns table ( places_total integer, places_visited integer, places_confirmed integer, places_uncertain integer, places_not_entered integer, visits_total integer, visits_confirmed integer, visits_uncertain integer, coverage_pct numeric, confirmed_pct numeric, uncertain_pct numeric, vehicles_active integer, total_dwell_seconds integer )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_coverage_rollup(p_zone, p_day);
end $$;

create or replace function public.map_unvisited_places(p_zone uuid, p_day date, p_kind text default null)
returns table ( place_kind text, place_id uuid, place_code text, place_name text, mahalla_code text, length_m numeric, width_m numeric )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_unvisited_places(p_zone, p_day, p_kind);
end $$;

create or replace function public.map_coverage_trend(p_zone uuid, p_until date, p_days integer default 14)
returns table ( day date, places_total integer, places_visited integer, places_confirmed integer, places_uncertain integer, coverage_pct numeric, visits_total integer )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_coverage_trend(p_zone, p_until, p_days);
end $$;

create or replace function public.map_visits_enriched(p_zone uuid, p_day date, p_vehicle uuid default null, p_kind text default null)
returns table ( id uuid, vehicle_id uuid, device_id uuid, place_kind text, place_id uuid, place_code text, place_name text, placeday date, seq smallint, entered_at timestamptz, exited_at timestamptz, dwell_seconds integer, points_count smallint, max_depth_m numeric, status text, reason text, vehicle_name text, db_number text, driver_name text, shift text, shift_source text, driver_source text, department_manager_names text, sector_id smallint, sector_name text )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_visits_enriched(p_zone, p_day, p_vehicle, p_kind);
end $$;

create or replace function public.map_vehicles_day(p_zone uuid, p_day date)
returns table ( vehicle_id uuid, vehicle_name text, db_number text, plate_number text, fleet_shift text, fleet_driver text, shift text, driver_name text, shift_source text, visits_count integer, confirmed_count integer, uncertain_count integer, places_count integer, total_dwell_seconds integer, first_at timestamptz, last_at timestamptz )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_vehicles_day(p_zone, p_day);
end $$;

create or replace function public.map_unvisited_enriched(p_zone uuid, p_day date, p_kind text default null)
returns table ( place_kind text, place_id uuid, place_code text, place_name text, mahalla_code text, length_m numeric, width_m numeric, department_manager_names text )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_unvisited_enriched(p_zone, p_day, p_kind);
end $$;

create or replace function public.map_sector_managers(p_sectors smallint[])
returns table ( sector_id smallint, manager_names text, manager_shifts text, managers_count integer )
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_sector_managers(p_sectors);
end $$;

create or replace function public.map_export_prefs_get(p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public, app
as $$
begin
  perform public.map_require_reader();
  return app.map_export_prefs_get(p_kind);
end $$;

create or replace function public.map_export_prefs_set(p_kind text, p_columns jsonb)
returns jsonb
language plpgsql security definer set search_path = public, app
as $$
begin
  perform public.map_require_editor();
  return app.map_export_prefs_set(p_kind, p_columns);
end $$;

create or replace function public.map_export_log_add(p_zone uuid, p_kind text, p_from date, p_to date, p_rows integer, p_columns jsonb)
returns uuid
language plpgsql security definer set search_path = public, app
as $$
begin
  perform public.map_require_editor();
  return app.map_export_log_add(p_zone, p_kind, p_from, p_to, p_rows, p_columns);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيات: لا anon إطلاقاً · authenticated حسب الدور داخل الغلاف
-- ═══════════════════════════════════════════════════════════════════════════
revoke all on function
  public.map_osm_script(uuid),
  public.map_zone_polygon(uuid),
  public.map_import_batch(uuid,jsonb,jsonb,uuid,jsonb),
  public.map_build_visits(uuid,timestamptz,timestamptz,uuid,integer,integer,boolean),
  public.map_coverage_summary(uuid,date),
  public.map_coverage_by_place(uuid,date,text),
  public.map_coverage_by_vehicle(uuid,date),
  public.map_coverage_rollup(uuid,date),
  public.map_unvisited_places(uuid,date,text),
  public.map_coverage_trend(uuid,date,integer),
  public.map_visits_enriched(uuid,date,uuid,text),
  public.map_vehicles_day(uuid,date),
  public.map_unvisited_enriched(uuid,date,text),
  public.map_sector_managers(smallint[]),
  public.map_export_prefs_get(text),
  public.map_export_prefs_set(text,jsonb),
  public.map_export_log_add(uuid,text,date,date,integer,jsonb)
  from public, anon;

grant execute on function
  public.map_osm_script(uuid),
  public.map_zone_polygon(uuid),
  public.map_import_batch(uuid,jsonb,jsonb,uuid,jsonb),
  public.map_build_visits(uuid,timestamptz,timestamptz,uuid,integer,integer,boolean),
  public.map_coverage_summary(uuid,date),
  public.map_coverage_by_place(uuid,date,text),
  public.map_coverage_by_vehicle(uuid,date),
  public.map_coverage_rollup(uuid,date),
  public.map_unvisited_places(uuid,date,text),
  public.map_coverage_trend(uuid,date,integer),
  public.map_visits_enriched(uuid,date,uuid,text),
  public.map_vehicles_day(uuid,date),
  public.map_unvisited_enriched(uuid,date,text),
  public.map_sector_managers(smallint[]),
  public.map_export_prefs_get(text),
  public.map_export_prefs_set(text,jsonb),
  public.map_export_log_add(uuid,text,date,date,integer,jsonb)
  to authenticated;

notify pgrst, 'reload schema';
