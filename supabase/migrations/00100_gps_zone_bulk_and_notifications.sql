-- 00100 · إسناد الزونات دفعة واحدة وسياسة إشعارات تنبيهات GPS.

create table public.gps_alert_notification_policies(
 alert_type text primary key check(alert_type in('gps_offline','gps_stale','outside_zone','engine_idle')),
 enabled boolean not null default true,
 priority text not null check(priority in('low','normal','high','critical')),
 recipient_roles text[] not null default array['ops_room'],
 in_app_enabled boolean not null default true,
 push_enabled boolean not null default true,
 sound_enabled boolean not null default true,
 only_during_departure boolean not null default true,
 updated_by uuid references auth.users(id)on delete set null,
 updated_at timestamptz not null default now(),
 check(cardinality(recipient_roles)between 1 and 8)
);
insert into public.gps_alert_notification_policies(alert_type,priority,recipient_roles,in_app_enabled,push_enabled,sound_enabled,only_during_departure)values
 ('gps_offline','critical',array['ops_room'],true,true,true,true),
 ('gps_stale','high',array['ops_room'],true,true,false,true),
 ('outside_zone','high',array['ops_room'],true,true,true,true),
 ('engine_idle','normal',array['ops_room'],true,false,false,true)
on conflict do nothing;
alter table public.gps_alert_notification_policies enable row level security;
create policy "gps alert policies authorized read"on public.gps_alert_notification_policies for select to authenticated using(app.has_role(array['ops_room','it_admin','super_admin']));
create trigger trg_audit_gps_alert_notification_policies after insert or update or delete on public.gps_alert_notification_policies for each row execute function app.audit_trigger();

create or replace function public.gps_alert_notification_policies_list()
returns table(alert_type text,enabled boolean,priority text,recipient_roles text[],in_app_enabled boolean,push_enabled boolean,sound_enabled boolean,only_during_departure boolean,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin perform app.require_gps_operator();return query select p.alert_type,p.enabled,p.priority,p.recipient_roles,p.in_app_enabled,p.push_enabled,p.sound_enabled,p.only_during_departure,p.updated_at from public.gps_alert_notification_policies p order by p.alert_type;end$$;
create or replace function public.gps_alert_notification_policy_save(p_alert_type text,p_enabled boolean,p_priority text,p_recipient_roles text[],p_in_app boolean,p_push boolean,p_sound boolean,p_only_during_departure boolean)
returns void language plpgsql security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['it_admin','super_admin'])then raise exception'GPS_POLICY_FORBIDDEN';end if;
 if p_alert_type not in('gps_offline','gps_stale','outside_zone','engine_idle')or p_priority not in('low','normal','high','critical')or cardinality(p_recipient_roles)not between 1 and 8 then raise exception'GPS_POLICY_INVALID';end if;
 insert into public.gps_alert_notification_policies(alert_type,enabled,priority,recipient_roles,in_app_enabled,push_enabled,sound_enabled,only_during_departure,updated_by,updated_at)
 values(p_alert_type,p_enabled,p_priority,p_recipient_roles,p_in_app,p_push,p_sound,p_only_during_departure,auth.uid(),now())
 on conflict(alert_type)do update set enabled=excluded.enabled,priority=excluded.priority,recipient_roles=excluded.recipient_roles,in_app_enabled=excluded.in_app_enabled,push_enabled=excluded.push_enabled,sound_enabled=excluded.sound_enabled,only_during_departure=excluded.only_during_departure,updated_by=excluded.updated_by,updated_at=now();
end$$;

create or replace function app.notify_gps_operational_alert()returns trigger language plpgsql security definer set search_path=public,app as $$declare p public.gps_alert_notification_policies;v public.garage_vehicles;begin
 select*into p from public.gps_alert_notification_policies where alert_type=new.alert_type and enabled;
 if not found or(p.only_during_departure and new.departure_id is null)then return new;end if;
 select*into v from public.garage_vehicles where id=new.garage_vehicle_id;
 insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key,in_app_visible,push_allowed,sound_allowed)
 select distinct ur.user_id,new.title,format('%s%s%s',coalesce(v.vehicle_name,'جهاز GPS'),case when v.db_number is not null then' · DB '||v.db_number else''end,case when new.alert_type='outside_zone'then' — تحقق من المسار والزون'when new.alert_type='gps_offline'then' — الاتصال منقطع أثناء الانطلاقية'else' — القراءة متأخرة أثناء الانطلاقية'end),case when p.priority='critical'then'error'else'warning'end,'gps',p.priority,'/ops-room/gps','gps_alert',new.id,'فتح غرفة GPS','gps_alert:'||new.id::text,p.in_app_enabled,p.push_enabled,p.sound_enabled
 from public.user_roles ur where ur.role=any(p.recipient_roles)
 on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 return new;
end$$;
create trigger trg_notify_gps_operational_alert after insert on public.gps_operational_alerts for each row execute function app.notify_gps_operational_alert();

create or replace function public.gps_zone_vehicle_candidates(p_geofence_id uuid,p_search text default null)
returns table(vehicle_id uuid,vehicle_name text,db_number text,plate_number text,vehicle_category text,is_assigned boolean,device_id uuid,device_name text)
language plpgsql stable security definer set search_path=public,app as $$declare q text:='%'||lower(trim(coalesce(p_search,'')))||'%';begin
 perform app.require_gps_operator();if not exists(select 1 from public.gps_geofences where id=p_geofence_id and is_active)then raise exception'GPS_ZONE_TARGET_INVALID';end if;
 return query select v.id,v.vehicle_name,v.db_number,v.plate_number,v.vehicle_category,vg.geofence_id is not null,b.device_id,d.name
 from public.garage_vehicles v left join public.gps_vehicle_geofences vg on vg.garage_vehicle_id=v.id and vg.geofence_id=p_geofence_id left join public.gps_vehicle_bindings b on b.garage_vehicle_id=v.id left join public.gps_devices d on d.id=b.device_id
 where v.archived_at is null and(coalesce(p_search,'')=''or lower(concat_ws(' ',v.vehicle_name,v.db_number,v.plate_number,v.vehicle_category,d.name))like q)
 order by(vg.geofence_id is not null)desc,v.db_number limit 500;
end$$;
create or replace function public.gps_zone_replace_vehicles(p_geofence_id uuid,p_vehicle_ids uuid[])
returns integer language plpgsql security definer set search_path=public,app as $$declare u uuid:=app.require_gps_operator();n integer;requested integer;begin
 if p_vehicle_ids is null or cardinality(p_vehicle_ids)>200 then raise exception'GPS_ZONE_VEHICLE_LIMIT';end if;
 if not exists(select 1 from public.gps_geofences where id=p_geofence_id and is_active)then raise exception'GPS_ZONE_TARGET_INVALID';end if;
 select count(distinct x)into requested from unnest(p_vehicle_ids)x;
 if requested<>cardinality(p_vehicle_ids)or exists(select 1 from unnest(p_vehicle_ids)x left join public.garage_vehicles v on v.id=x and v.archived_at is null where v.id is null)then raise exception'GPS_ZONE_VEHICLE_INVALID';end if;
 delete from public.gps_vehicle_geofences where geofence_id=p_geofence_id and not(garage_vehicle_id=any(p_vehicle_ids));
 insert into public.gps_vehicle_geofences(garage_vehicle_id,geofence_id,assigned_by,assigned_at)select x,p_geofence_id,u,now()from unnest(p_vehicle_ids)x on conflict do nothing;
 select count(*)into n from public.gps_vehicle_geofences where geofence_id=p_geofence_id;return n;
end$$;

revoke all on table public.gps_alert_notification_policies from anon,authenticated;grant select on table public.gps_alert_notification_policies to authenticated;
revoke all on function app.notify_gps_operational_alert(),public.gps_alert_notification_policies_list(),public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean),public.gps_zone_vehicle_candidates(uuid,text),public.gps_zone_replace_vehicles(uuid,uuid[])from public,anon;
grant execute on function public.gps_alert_notification_policies_list(),public.gps_zone_vehicle_candidates(uuid,text),public.gps_zone_replace_vehicles(uuid,uuid[])to authenticated;
grant execute on function public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean)to authenticated;
