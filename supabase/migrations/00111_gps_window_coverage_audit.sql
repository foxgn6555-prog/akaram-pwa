-- 00111 · تدقيق كل نافذة من LVN إلى القبول والتخزين والرسم دون الاكتفاء بآخر تشغيل.

create or replace function public.gps_trip_window_coverage_audit(p_departure_id uuid)
returns table(
 window_index integer,range_from timestamptz,range_to timestamptz,expected_seconds bigint,
 import_status text,run_id uuid,chunks_requested integer,chunks_completed integer,
 source_points integer,valid_points integer,reported_stored_points integer,rejected_points integer,
 actual_stored_points bigint,renderable_points bigint,first_fix timestamptz,last_fix timestamptz,
 leading_gap_seconds bigint,trailing_gap_seconds bigint,internal_gap_count bigint,largest_gap_seconds bigint,
 covered_seconds bigint,coverage_percent numeric,source_acceptance_percent numeric,storage_match_percent numeric,
 render_complete boolean,diagnosis_code text,error_code text,finished_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$
declare d public.garage_departures%rowtype;v_device uuid;v_end timestamptz;v_count integer;begin
 perform app.require_gps_operator();
 select * into d from public.garage_departures where id=p_departure_id;
 if not found then raise exception'GPS_DEPARTURE_NOT_FOUND';end if;
 select b.device_id into v_device from public.gps_vehicle_bindings b where b.garage_vehicle_id=d.vehicle_id;
 v_end:=coalesce(d.returned_at,now());
 v_count:=greatest(1,ceil(extract(epoch from(v_end-d.departed_at))/259200.0)::integer);
 return query
 with windows as(
  select g i,d.departed_at+g*interval'72 hours' f,least(v_end,d.departed_at+(g+1)*interval'72 hours')t
  from generate_series(0,v_count-1)g
 ),window_runs as(
  select w.*,r.id rid,r.status rstatus,r.chunks_requested rq,r.chunks_completed rc,r.source_points sp,
   r.valid_points vp,r.stored_points rsp,r.rejected_points rp,r.error_code ec,r.finished_at fin
  from windows w left join lateral(
   select x.* from public.gps_history_import_runs x where x.departure_id=p_departure_id
    and abs(extract(epoch from(x.range_from-w.f)))<1 order by x.started_at desc limit 1
  )r on true
 ),points as(
  select w.i,h.fix_time,lag(h.fix_time)over(partition by w.i order by h.fix_time)prev
  from windows w join public.gps_device_position_history h on h.device_id=v_device
   and h.fix_time between w.f and w.t and h.latitude is not null and h.longitude is not null
 ),stats as(
  select p.i,count(*) actual,min(p.fix_time) first_fix,max(p.fix_time) last_fix,
   count(*)filter(where p.prev is not null and p.fix_time-p.prev>interval'10 minutes') gaps,
   coalesce(max(extract(epoch from(p.fix_time-p.prev)))filter(where p.prev is not null),0)::bigint largest,
   coalesce(sum(least(extract(epoch from(p.fix_time-p.prev)),300))filter(where p.prev is not null),0)::bigint covered
  from points p group by p.i
 )select w.i,w.f,w.t,greatest(extract(epoch from(w.t-w.f))::bigint,1),
  coalesce(w.rstatus,'pending'),w.rid,w.rq,w.rc,w.sp,w.vp,w.rsp,w.rp,
  coalesce(s.actual,0),least(coalesce(s.actual,0),100000),s.first_fix,s.last_fix,
  coalesce(greatest(extract(epoch from(s.first_fix-w.f)),0),0)::bigint,
  coalesce(greatest(extract(epoch from(w.t-s.last_fix)),0),0)::bigint,
  coalesce(s.gaps,0),coalesce(s.largest,0),coalesce(s.covered,0),
  least(100,round(100*coalesce(s.covered,0)/greatest(extract(epoch from(w.t-w.f)),1),1)),
  case when coalesce(w.sp,0)=0 then 0 else round(100*coalesce(w.vp,0)::numeric/w.sp,1)end,
  case when coalesce(w.vp,0)=0 then(case when coalesce(s.actual,0)=0 then 100 else 0 end)
   else least(100,round(100*coalesce(s.actual,0)::numeric/w.vp,1))end,
  coalesce(s.actual,0)<=100000,
  case when v_device is null then'unbound'
   when w.rid is null then'not_audited'
   when w.rstatus='failed' then'import_failed'
   when coalesce(w.rp,0)>0 or coalesce(w.sp,0)>coalesce(w.vp,0)then'provider_payload_rejected'
   when coalesce(w.vp,0)>coalesce(s.actual,0)then'storage_deficit'
   when coalesce(s.actual,0)>100000 then'render_limit'
   when coalesce(s.actual,0)=0 then'no_data'
   when extract(epoch from(s.first_fix-w.f))>300 then'late_first_fix'
   when extract(epoch from(w.t-s.last_fix))>300 then'early_last_fix'
   when coalesce(s.gaps,0)>0 then'internal_gaps'
   when w.rstatus<>'success' then'window_incomplete'
   else'healthy'end,w.ec,w.fin
 from window_runs w left join stats s on s.i=w.i order by w.i;
end$$;

revoke all on function public.gps_trip_window_coverage_audit(uuid)from public,anon;
grant execute on function public.gps_trip_window_coverage_audit(uuid)to authenticated;
