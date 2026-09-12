-- 00105 · تشخيص سبب نقص مسار الانطلاقية من المصدر حتى التخزين.

create or replace function public.gps_trip_route_diagnostics_bulk(p_departure_ids uuid[])
returns table(
 departure_id uuid,diagnosis_code text,expected_seconds bigint,expected_72h_windows integer,
 gps_points bigint,first_fix timestamptz,last_fix timestamptz,leading_gap_seconds bigint,
 trailing_gap_seconds bigint,internal_gap_count bigint,largest_gap_seconds bigint,
 import_status text,import_range_from timestamptz,import_range_to timestamptz,
 chunks_requested integer,chunks_completed integer,source_points integer,valid_points integer,
 stored_points integer,rejected_points integer,error_code text,source_storage_delta integer)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if p_departure_ids is null or cardinality(p_departure_ids)not between 1 and 200 then raise exception'GPS_DIAGNOSTICS_LIMIT';end if;
 return query
 with departures as(
  select d.id,d.departed_at,coalesce(d.returned_at,now())range_end,b.device_id
  from unnest(p_departure_ids)x(id)join public.garage_departures d on d.id=x.id
  left join public.gps_vehicle_bindings b on b.garage_vehicle_id=d.vehicle_id
 ),points as(
  select d.id departure_id,h.fix_time,lag(h.fix_time)over(partition by d.id order by h.fix_time)previous_fix
  from departures d join public.gps_device_position_history h on h.device_id=d.device_id
   and h.fix_time between d.departed_at and d.range_end
 ),stats as(
  select p.departure_id,count(*)gps_points,min(p.fix_time)first_fix,max(p.fix_time)last_fix,
   count(*)filter(where p.previous_fix is not null and p.fix_time-p.previous_fix>interval'10 minutes')gap_count,
   coalesce(max(extract(epoch from(p.fix_time-p.previous_fix)))filter(where p.previous_fix is not null),0)::bigint largest_gap
  from points p group by p.departure_id
 )
 select d.id,
  case when d.device_id is null then'unbound'
   when coalesce(s.gps_points,0)=0 and imp.status='failed' then'import_failed'
   when coalesce(s.gps_points,0)=0 then'no_data'
   when coalesce(imp.rejected_points,0)>0 or coalesce(imp.source_points,0)>coalesce(imp.valid_points,0)then'provider_payload_rejected'
   when coalesce(imp.valid_points,0)>coalesce(imp.stored_points,0)then'storage_deficit'
   when extract(epoch from(s.first_fix-d.departed_at))>300 then'late_first_fix'
   when extract(epoch from(d.range_end-s.last_fix))>300 then'early_last_fix'
   when coalesce(s.gap_count,0)>0 then'internal_gaps'
   when ceil(extract(epoch from(d.range_end-d.departed_at))/259200.0)>1 and coalesce(imp.range_to,imp.range_from)<d.range_end then'windows_not_fully_imported'
   else'healthy'end,
  greatest(extract(epoch from(d.range_end-d.departed_at))::bigint,1),
  ceil(extract(epoch from(d.range_end-d.departed_at))/259200.0)::integer,
  coalesce(s.gps_points,0),s.first_fix,s.last_fix,
  coalesce(greatest(extract(epoch from(s.first_fix-d.departed_at)),0),0)::bigint,
  coalesce(greatest(extract(epoch from(d.range_end-s.last_fix)),0),0)::bigint,
  coalesce(s.gap_count,0),coalesce(s.largest_gap,0),
  imp.status,imp.range_from,imp.range_to,imp.chunks_requested,imp.chunks_completed,
  imp.source_points,imp.valid_points,imp.stored_points,imp.rejected_points,imp.error_code,
  coalesce(imp.source_points,0)-coalesce(imp.stored_points,0)
 from departures d left join stats s on s.departure_id=d.id
 left join lateral(
  select r.status,r.range_from,r.range_to,r.chunks_requested,r.chunks_completed,r.source_points,
   r.valid_points,r.stored_points,r.rejected_points,r.error_code
  from public.gps_history_import_runs r where r.departure_id=d.id order by r.started_at desc limit 1
 )imp on true order by d.departed_at;
end$$;

revoke all on function public.gps_trip_route_diagnostics_bulk(uuid[])from public,anon;
grant execute on function public.gps_trip_route_diagnostics_bulk(uuid[])to authenticated;
