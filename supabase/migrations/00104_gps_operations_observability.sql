-- 00104 · مراقبة مؤشرات الانطلاقية، صفحات محطات المسار وسجل تفاعل التصعيد.

create index if not exists gps_alerts_open_priority_detected_idx on public.gps_operational_alerts(severity,last_detected_at desc)where resolved_at is null;
create index if not exists notifications_gps_alert_history_idx on public.notifications(entity_id,created_at desc)where entity_type='gps_alert';
create index if not exists garage_departures_vehicle_window_idx on public.garage_departures(vehicle_id,departed_at,returned_at);

create or replace function public.gps_trip_route_events_page(p_departure_id uuid,p_event_type text default null,p_limit integer default 20,p_offset integer default 0)
returns table(event_type text,event_start timestamptz,event_end timestamptz,duration_seconds bigint,latitude float8,longitude float8,address text,total_count bigint)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if p_event_type is not null and p_event_type not in('stop','gap')then raise exception'GPS_ROUTE_EVENT_TYPE_INVALID';end if;
 if p_limit not between 1 and 100 or p_offset<0 then raise exception'GPS_PAGE_INVALID';end if;
 return query select e.event_type,e.event_start,e.event_end,e.duration_seconds,e.latitude,e.longitude,e.address,count(*)over()
 from public.gps_trip_route_events(p_departure_id)e where p_event_type is null or e.event_type=p_event_type
 order by e.event_start limit p_limit offset p_offset;
end$$;

create or replace function public.gps_alert_escalation_history(p_alert_id uuid)
returns table(notification_id uuid,level integer,user_id uuid,created_at timestamptz,is_read boolean,read_at timestamptz,dismissed_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if not exists(select 1 from public.gps_operational_alerts where id=p_alert_id)then raise exception'GPS_ALERT_NOT_FOUND';end if;
 return query select n.id,split_part(n.dedupe_key,':',4)::integer,n.user_id,n.created_at,n.is_read,n.read_at,n.dismissed_at
 from public.notifications n where n.entity_type='gps_alert'and n.entity_id=p_alert_id and n.dedupe_key like'gps_alert:%:escalation:%'
 order by n.created_at,n.user_id;
end$$;

create or replace function public.gps_alert_escalations_bulk(p_alert_ids uuid[])
returns table(alert_id uuid,notification_id uuid,level integer,user_id uuid,created_at timestamptz,is_read boolean,read_at timestamptz,dismissed_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if p_alert_ids is null or cardinality(p_alert_ids)not between 1 and 200 then raise exception'GPS_ALERT_EXPORT_LIMIT';end if;
 return query select n.entity_id,n.id,split_part(n.dedupe_key,':',4)::integer,n.user_id,n.created_at,n.is_read,n.read_at,n.dismissed_at
 from public.notifications n where n.entity_type='gps_alert'and n.entity_id=any(p_alert_ids)and n.dedupe_key like'gps_alert:%:escalation:%'
 order by n.entity_id,n.created_at,n.user_id;
end$$;

revoke all on function public.gps_trip_route_events_page(uuid,text,integer,integer),public.gps_alert_escalation_history(uuid),public.gps_alert_escalations_bulk(uuid[])from public,anon;
grant execute on function public.gps_trip_route_events_page(uuid,text,integer,integer),public.gps_alert_escalation_history(uuid),public.gps_alert_escalations_bulk(uuid[])to authenticated;
