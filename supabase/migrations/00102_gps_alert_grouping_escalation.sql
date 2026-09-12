-- 00102 · تجميع تكرار تنبيهات GPS وتصعيد غير المعالج منها.

alter table public.gps_operational_alerts
 add column occurrence_count integer not null default 1 check(occurrence_count between 1 and 1000000),
 add column last_detected_at timestamptz not null default now();

create or replace function app.group_open_gps_alert() returns trigger
language plpgsql security definer set search_path=public,app as $$
declare existing_id uuid;
begin
 select id into existing_id from public.gps_operational_alerts
 where device_id=new.device_id and alert_type=new.alert_type and resolved_at is null
 for update;
 if existing_id is null then
  new.occurrence_count:=1;
  new.last_detected_at:=coalesce(new.last_detected_at,now());
  return new;
 end if;
 update public.gps_operational_alerts set
  occurrence_count=least(occurrence_count+1,1000000),
  last_detected_at=now(),
  details=coalesce(new.details,details),
  departure_id=coalesce(new.departure_id,departure_id),
  garage_vehicle_id=coalesce(new.garage_vehicle_id,garage_vehicle_id),
  severity=case when severity='critical' or new.severity='critical' then 'critical' when severity='warning' or new.severity='warning' then 'warning' else 'info' end
 where id=existing_id;
 return null;
end$$;
create trigger trg_group_open_gps_alert before insert on public.gps_operational_alerts for each row execute function app.group_open_gps_alert();

alter table public.gps_alert_notification_policies
 add column escalation_minutes integer not null default 15 check(escalation_minutes between 1 and 1440);

-- OUT row changed, therefore the function must be dropped first.
drop function public.gps_alert_notification_policies_list();
create function public.gps_alert_notification_policies_list()
returns table(alert_type text,enabled boolean,priority text,recipient_roles text[],in_app_enabled boolean,push_enabled boolean,sound_enabled boolean,only_during_departure boolean,escalation_minutes integer,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 return query select p.alert_type,p.enabled,p.priority,p.recipient_roles,p.in_app_enabled,p.push_enabled,p.sound_enabled,p.only_during_departure,p.escalation_minutes,p.updated_at from public.gps_alert_notification_policies p order by p.alert_type;
end$$;

drop function public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean);
create function public.gps_alert_notification_policy_save(p_alert_type text,p_enabled boolean,p_priority text,p_recipient_roles text[],p_in_app boolean,p_push boolean,p_sound boolean,p_only_during_departure boolean,p_escalation_minutes integer)
returns void language plpgsql security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['it_admin','super_admin'])then raise exception'GPS_POLICY_FORBIDDEN';end if;
 if p_alert_type not in('gps_offline','gps_stale','outside_zone','engine_idle')or p_priority not in('low','normal','high','critical')or cardinality(p_recipient_roles)not between 1 and 8 or p_escalation_minutes not between 1 and 1440 then raise exception'GPS_POLICY_INVALID';end if;
 insert into public.gps_alert_notification_policies(alert_type,enabled,priority,recipient_roles,in_app_enabled,push_enabled,sound_enabled,only_during_departure,escalation_minutes,updated_by,updated_at)
 values(p_alert_type,p_enabled,p_priority,p_recipient_roles,p_in_app,p_push,p_sound,p_only_during_departure,p_escalation_minutes,auth.uid(),now())
 on conflict(alert_type)do update set enabled=excluded.enabled,priority=excluded.priority,recipient_roles=excluded.recipient_roles,in_app_enabled=excluded.in_app_enabled,push_enabled=excluded.push_enabled,sound_enabled=excluded.sound_enabled,only_during_departure=excluded.only_during_departure,escalation_minutes=excluded.escalation_minutes,updated_by=excluded.updated_by,updated_at=now();
end$$;

create or replace function public.notification_evaluate_gps_escalations() returns integer
language plpgsql security definer set search_path=public,app as $$declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception'GPS_ESCALATION_SERVICE_ONLY';end if;
 insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key,in_app_visible,push_allowed,sound_allowed)
 select distinct ur.user_id,'تصعيد تنبيه GPS غير معالج',format('%s · %s — متكرر %s مرة دون معالجة منذ %s دقيقة',coalesce(v.vehicle_name,d.name),a.title,a.occurrence_count,floor(extract(epoch from(now()-a.opened_at))/60)),'error','gps','critical','/ops-room/gps','gps_alert',a.id,'معالجة التنبيه','gps_alert:'||a.id::text||':escalation',p.in_app_enabled,p.push_enabled,p.sound_enabled
 from public.gps_operational_alerts a
 join public.gps_devices d on d.id=a.device_id
 left join public.garage_vehicles v on v.id=a.garage_vehicle_id
 join public.gps_alert_notification_policies p on p.alert_type=a.alert_type and p.enabled
 join public.user_roles ur on ur.role=any(p.recipient_roles)
 where a.resolved_at is null and a.acknowledged_at is null
  and now()-a.opened_at>make_interval(mins=>p.escalation_minutes)
  and(not p.only_during_departure or a.departure_id is not null)
 on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 get diagnostics n=row_count;return n;
end$$;

drop function public.gps_lvn_open_alerts(integer);
create function public.gps_lvn_open_alerts(p_limit integer default 100)
returns table(id uuid,device_id uuid,device_name text,garage_vehicle_id uuid,vehicle_name text,db_number text,departure_id uuid,alert_type text,severity text,title text,details jsonb,opened_at timestamptz,acknowledged_at timestamptz,acknowledged_by uuid,occurrence_count integer,last_detected_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();if p_limit not between 1 and 500 then raise exception'GPS_PAGE_INVALID';end if;
 return query select a.id,a.device_id,d.name,a.garage_vehicle_id,v.vehicle_name,v.db_number,a.departure_id,a.alert_type,a.severity,a.title,a.details,a.opened_at,a.acknowledged_at,a.acknowledged_by,a.occurrence_count,a.last_detected_at
 from public.gps_operational_alerts a join public.gps_devices d on d.id=a.device_id left join public.garage_vehicles v on v.id=a.garage_vehicle_id
 where a.resolved_at is null order by a.acknowledged_at nulls first,case a.severity when'critical'then 1 when'warning'then 2 else 3 end,a.last_detected_at desc limit p_limit;
end$$;

create or replace function public.gps_trip_shift_context_bulk(p_departure_ids uuid[])
returns table(departure_id uuid,assignment_id uuid,shift text,driver_name text,area_name text,overlap_from timestamptz,overlap_to timestamptz,overlap_seconds bigint,is_departure_driver boolean)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if p_departure_ids is null or cardinality(p_departure_ids)not between 1 and 200 then raise exception'GPS_TRIP_CONTEXT_LIMIT';end if;
 return query select d.id,a.id,a.shift,a.driver_name,s.name,greatest(a.starts_at,d.departed_at),least(coalesce(a.ends_at,now()),coalesce(d.returned_at,now())),greatest(0,extract(epoch from(least(coalesce(a.ends_at,now()),coalesce(d.returned_at,now()))-greatest(a.starts_at,d.departed_at)))::bigint),lower(trim(a.driver_name))=lower(trim(d.driver_name))
 from public.garage_departures d join public.garage_vehicle_shift_assignments a on a.vehicle_id=d.vehicle_id and a.starts_at<coalesce(d.returned_at,now())and coalesce(a.ends_at,now())>d.departed_at join public.sectors s on s.id=a.sector_id
 where d.id=any(p_departure_ids) order by d.departed_at,greatest(a.starts_at,d.departed_at);
end$$;

revoke all on function app.group_open_gps_alert(),public.notification_evaluate_gps_escalations(),public.gps_alert_notification_policies_list(),public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean,integer),public.gps_lvn_open_alerts(integer),public.gps_trip_shift_context_bulk(uuid[]) from public,anon;
revoke all on function public.notification_evaluate_gps_escalations() from authenticated;
grant execute on function public.notification_evaluate_gps_escalations() to service_role;
grant execute on function public.gps_alert_notification_policies_list(),public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean,integer),public.gps_lvn_open_alerts(integer),public.gps_trip_shift_context_bulk(uuid[]) to authenticated;
