-- 00106 · تقدم تدقيق جميع نوافذ الانطلاقية الطويلة ومنع إعادة النافذة الناجحة دون طلب صريح.

create or replace function public.gps_trip_history_windows(p_departure_id uuid)
returns table(
 window_index integer,range_from timestamptz,range_to timestamptz,status text,
 run_id uuid,chunks_requested integer,chunks_completed integer,source_points integer,
 valid_points integer,stored_points integer,rejected_points integer,error_code text,finished_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$declare d public.garage_departures%rowtype;v_end timestamptz;v_count integer;begin
 perform app.require_gps_operator();
 select * into d from public.garage_departures where id=p_departure_id;
 if not found then raise exception'GPS_DEPARTURE_NOT_FOUND';end if;
 v_end:=coalesce(d.returned_at,now());v_count:=greatest(1,ceil(extract(epoch from(v_end-d.departed_at))/259200.0)::integer);
 return query
 with windows as(
  select g i,d.departed_at+g*interval'72 hours' f,least(v_end,d.departed_at+(g+1)*interval'72 hours')t
  from generate_series(0,v_count-1)g
 )select w.i,w.f,w.t,coalesce(r.status,'pending'),r.id,r.chunks_requested,r.chunks_completed,
  r.source_points,r.valid_points,r.stored_points,r.rejected_points,r.error_code,r.finished_at
 from windows w left join lateral(
  select x.* from public.gps_history_import_runs x where x.departure_id=p_departure_id
   and abs(extract(epoch from(x.range_from-w.f)))<1
  order by x.started_at desc limit 1
 )r on true order by w.i;
end$$;

revoke all on function public.gps_trip_history_windows(uuid)from public,anon;
grant execute on function public.gps_trip_history_windows(uuid)to authenticated;
