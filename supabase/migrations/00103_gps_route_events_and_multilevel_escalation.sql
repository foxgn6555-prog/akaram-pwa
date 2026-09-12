-- 00103 · مؤشرات حركة/توقف الانطلاقية ومحطات المسار والتصعيد متعدد المستويات.

create or replace function public.gps_trip_route_events(p_departure_id uuid)
returns table(event_type text,event_start timestamptz,event_end timestamptz,duration_seconds bigint,latitude float8,longitude float8,address text)
language plpgsql stable security definer set search_path=public,app as $$declare d public.garage_departures;did uuid;begin
 perform app.require_gps_operator();
 select x.* into d from public.garage_departures x where x.id=p_departure_id;
 if not found then raise exception'GPS_DEPARTURE_NOT_FOUND';end if;
 select b.device_id into did from public.gps_vehicle_bindings b where b.garage_vehicle_id=d.vehicle_id;
 if did is null then return;end if;
 return query
 with ordered as(
  select h.*,lag(h.fix_time)over(order by h.fix_time)prev_fix,lead(h.fix_time)over(order by h.fix_time)next_fix,
   lag(coalesce(h.speed,0)<=1)over(order by h.fix_time)prev_stopped
  from public.gps_device_position_history h where h.device_id=did and h.fix_time between d.departed_at and coalesce(d.returned_at,now())
 ),marked as(
  select o.*,sum(case when coalesce(o.speed,0)<=1 and not coalesce(o.prev_stopped,false)then 1 else 0 end)over(order by o.fix_time)stop_group from ordered o
 ),stops as(
  select 'stop'::text kind,min(m.fix_time)started,max(coalesce(m.next_fix,m.fix_time))ended,
   sum(least(greatest(extract(epoch from(coalesce(m.next_fix,m.fix_time)-m.fix_time)),0),300))::bigint seconds,
   (array_agg(m.latitude order by m.fix_time))[1]lat,(array_agg(m.longitude order by m.fix_time))[1]lng,(array_agg(m.address order by m.fix_time))[1]addr
  from marked m where coalesce(m.speed,0)<=1 group by m.stop_group
  having sum(least(greatest(extract(epoch from(coalesce(m.next_fix,m.fix_time)-m.fix_time)),0),300))>=120
 ),gaps as(
  select 'gap'::text,o.prev_fix,o.fix_time,extract(epoch from(o.fix_time-o.prev_fix))::bigint,o.latitude,o.longitude,o.address from ordered o where o.fix_time-o.prev_fix>interval'10 minutes'
 )
 select * from stops union all select * from gaps order by 2;
end$$;

create or replace function public.gps_trip_route_metrics_bulk(p_departure_ids uuid[])
returns table(departure_id uuid,moving_seconds bigint,stopped_seconds bigint,stop_count bigint,gap_count bigint,largest_gap_seconds bigint,stored_points bigint)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if p_departure_ids is null or cardinality(p_departure_ids)not between 1 and 200 then raise exception'GPS_TRIP_METRICS_LIMIT';end if;
 return query
 with deps as(
  select d.id,d.departed_at,coalesce(d.returned_at,now())range_end,b.device_id from public.garage_departures d left join public.gps_vehicle_bindings b on b.garage_vehicle_id=d.vehicle_id where d.id=any(p_departure_ids)
 ),points as(
  select d.id departure_id,h.fix_time,coalesce(h.speed,0)speed,lead(h.fix_time)over(partition by d.id order by h.fix_time)next_fix,lag(h.fix_time)over(partition by d.id order by h.fix_time)prev_fix,
   lag(coalesce(h.speed,0)<=1)over(partition by d.id order by h.fix_time)prev_stopped
  from deps d join public.gps_device_position_history h on h.device_id=d.device_id and h.fix_time between d.departed_at and d.range_end
 ),marked as(
  select p.*,sum(case when p.speed<=1 and not coalesce(p.prev_stopped,false)then 1 else 0 end)over(partition by p.departure_id order by p.fix_time)stop_group from points p
 ),stop_groups as(
  select m.departure_id,m.stop_group,sum(least(greatest(extract(epoch from(coalesce(m.next_fix,m.fix_time)-m.fix_time)),0),300))seconds from marked m where m.speed<=1 group by m.departure_id,m.stop_group
 ),stats as(
  select m.departure_id,
   coalesce(sum(least(greatest(extract(epoch from(coalesce(m.next_fix,m.fix_time)-m.fix_time)),0),300))filter(where m.speed>1),0)::bigint moving,
   coalesce(sum(least(greatest(extract(epoch from(coalesce(m.next_fix,m.fix_time)-m.fix_time)),0),300))filter(where m.speed<=1),0)::bigint stopped,
   count(*)filter(where m.prev_fix is not null and m.fix_time-m.prev_fix>interval'10 minutes')gaps,
   coalesce(max(extract(epoch from(m.fix_time-m.prev_fix)))filter(where m.prev_fix is not null and m.fix_time-m.prev_fix>interval'10 minutes'),0)::bigint largest,
   count(*)points_count from marked m group by m.departure_id
 ),stop_stats as(select sg.departure_id,count(*)filter(where sg.seconds>=120)stops from stop_groups sg group by sg.departure_id)
 select d.id,coalesce(s.moving,0),coalesce(s.stopped,0),coalesce(ss.stops,0),coalesce(s.gaps,0),coalesce(s.largest,0),coalesce(s.points_count,0)
 from deps d left join stats s on s.departure_id=d.id left join stop_stats ss on ss.departure_id=d.id;
end$$;

create or replace function public.gps_trip_route_events_bulk(p_departure_ids uuid[],p_limit integer default 10000)
returns table(departure_id uuid,event_type text,event_start timestamptz,event_end timestamptz,duration_seconds bigint,latitude float8,longitude float8,address text)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if p_departure_ids is null or cardinality(p_departure_ids)not between 1 and 200 or p_limit not between 1 and 10000 then raise exception'GPS_TRIP_EVENTS_LIMIT';end if;
 return query select x.id,e.event_type,e.event_start,e.event_end,e.duration_seconds,e.latitude,e.longitude,e.address
 from unnest(p_departure_ids)x(id) cross join lateral public.gps_trip_route_events(x.id)e limit p_limit;
end$$;

alter table public.gps_alert_notification_policies
 add column escalation_repeat_minutes integer not null default 15 check(escalation_repeat_minutes between 1 and 1440),
 add column escalation_levels integer not null default 3 check(escalation_levels between 1 and 5);

drop function public.gps_alert_notification_policies_list();
create function public.gps_alert_notification_policies_list()
returns table(alert_type text,enabled boolean,priority text,recipient_roles text[],in_app_enabled boolean,push_enabled boolean,sound_enabled boolean,only_during_departure boolean,escalation_minutes integer,escalation_repeat_minutes integer,escalation_levels integer,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin perform app.require_gps_operator();return query select p.alert_type,p.enabled,p.priority,p.recipient_roles,p.in_app_enabled,p.push_enabled,p.sound_enabled,p.only_during_departure,p.escalation_minutes,p.escalation_repeat_minutes,p.escalation_levels,p.updated_at from public.gps_alert_notification_policies p order by p.alert_type;end$$;

drop function public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean,integer);
create function public.gps_alert_notification_policy_save(p_alert_type text,p_enabled boolean,p_priority text,p_recipient_roles text[],p_in_app boolean,p_push boolean,p_sound boolean,p_only_during_departure boolean,p_escalation_minutes integer,p_escalation_repeat_minutes integer,p_escalation_levels integer)
returns void language plpgsql security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['it_admin','super_admin'])then raise exception'GPS_POLICY_FORBIDDEN';end if;
 if p_alert_type not in('gps_offline','gps_stale','outside_zone','engine_idle')or p_priority not in('low','normal','high','critical')or cardinality(p_recipient_roles)not between 1 and 8 or p_escalation_minutes not between 1 and 1440 or p_escalation_repeat_minutes not between 1 and 1440 or p_escalation_levels not between 1 and 5 then raise exception'GPS_POLICY_INVALID';end if;
 insert into public.gps_alert_notification_policies(alert_type,enabled,priority,recipient_roles,in_app_enabled,push_enabled,sound_enabled,only_during_departure,escalation_minutes,escalation_repeat_minutes,escalation_levels,updated_by,updated_at)
 values(p_alert_type,p_enabled,p_priority,p_recipient_roles,p_in_app,p_push,p_sound,p_only_during_departure,p_escalation_minutes,p_escalation_repeat_minutes,p_escalation_levels,auth.uid(),now())
 on conflict(alert_type)do update set enabled=excluded.enabled,priority=excluded.priority,recipient_roles=excluded.recipient_roles,in_app_enabled=excluded.in_app_enabled,push_enabled=excluded.push_enabled,sound_enabled=excluded.sound_enabled,only_during_departure=excluded.only_during_departure,escalation_minutes=excluded.escalation_minutes,escalation_repeat_minutes=excluded.escalation_repeat_minutes,escalation_levels=excluded.escalation_levels,updated_by=excluded.updated_by,updated_at=now();
end$$;

create or replace function public.notification_evaluate_gps_escalations()returns integer
language plpgsql security definer set search_path=public,app as $$declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'then raise exception'GPS_ESCALATION_SERVICE_ONLY';end if;
 insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key,in_app_visible,push_allowed,sound_allowed)
 select distinct ur.user_id,format('تصعيد GPS — المستوى %s',lvl),format('%s · %s — متكرر %s مرة دون معالجة منذ %s دقيقة',coalesce(v.vehicle_name,d.name),a.title,a.occurrence_count,floor(extract(epoch from(now()-a.opened_at))/60)),'error','gps','critical','/ops-room/gps','gps_alert',a.id,'معالجة التنبيه','gps_alert:'||a.id::text||':escalation:'||lvl,p.in_app_enabled,p.push_enabled,p.sound_enabled
 from public.gps_operational_alerts a join public.gps_devices d on d.id=a.device_id left join public.garage_vehicles v on v.id=a.garage_vehicle_id join public.gps_alert_notification_policies p on p.alert_type=a.alert_type and p.enabled cross join lateral generate_series(1,p.escalation_levels)lvl join public.user_roles ur on ur.role=any(p.recipient_roles)
 where a.resolved_at is null and a.acknowledged_at is null and extract(epoch from(now()-a.opened_at))/60>=p.escalation_minutes+(lvl-1)*p.escalation_repeat_minutes and(not p.only_during_departure or a.departure_id is not null)
 on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 get diagnostics n=row_count;return n;
end$$;

revoke all on function public.gps_trip_route_events(uuid),public.gps_trip_route_metrics_bulk(uuid[]),public.gps_trip_route_events_bulk(uuid[],integer),public.gps_alert_notification_policies_list(),public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean,integer,integer,integer) from public,anon;
revoke all on function public.notification_evaluate_gps_escalations() from authenticated;
grant execute on function public.gps_trip_route_events(uuid),public.gps_trip_route_metrics_bulk(uuid[]),public.gps_trip_route_events_bulk(uuid[],integer),public.gps_alert_notification_policies_list(),public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean,integer,integer,integer) to authenticated;
grant execute on function public.notification_evaluate_gps_escalations() to service_role;
