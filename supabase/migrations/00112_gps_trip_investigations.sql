-- 00112 · أحداث زونات الانطلاقية وملاحظات التحقيق المدققة.

create table public.gps_trip_investigations(
 id uuid primary key default gen_random_uuid(),departure_id uuid not null references public.garage_departures(id)on delete cascade,
 event_type text not null check(event_type in('route','stop','gap','zone_enter','zone_exit')),
 event_at timestamptz not null,note text not null check(length(btrim(note))between 3 and 1000),
 status text not null default'open'check(status in('open','in_review','resolved')),
 assigned_to uuid references auth.users(id)on delete set null,created_by uuid not null references auth.users(id)on delete restrict,
 updated_by uuid not null references auth.users(id)on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index gps_trip_investigations_departure_idx on public.gps_trip_investigations(departure_id,event_at desc);
alter table public.gps_trip_investigations enable row level security;
create policy "gps investigations authorized read"on public.gps_trip_investigations for select to authenticated using(app.has_role(array['ops_room','it_admin','super_admin']));
create trigger trg_audit_gps_trip_investigations after insert or update or delete on public.gps_trip_investigations for each row execute function app.audit_trigger();

create or replace function public.gps_trip_zone_events(p_departure_id uuid)
returns table(id bigint,event_type text,occurred_at timestamptz,geofence_id uuid,geofence_name text,latitude float8,longitude float8)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if not exists(select 1 from public.garage_departures gd where gd.id=p_departure_id)then raise exception'GPS_DEPARTURE_NOT_FOUND';end if;
 return query select e.id,e.event_type,e.occurred_at,e.geofence_id,g.name,e.latitude,e.longitude
 from public.gps_zone_events e join public.gps_geofences g on g.id=e.geofence_id where e.departure_id=p_departure_id order by e.occurred_at;
end$$;

create or replace function public.gps_trip_investigations_list(p_departure_id uuid)
returns table(id uuid,event_type text,event_at timestamptz,note text,status text,assigned_to uuid,created_by uuid,actor_name text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 return query select i.id,i.event_type,i.event_at,i.note,i.status,i.assigned_to,i.created_by,coalesce(e.full_name,'محقق غرفة العمليات'),i.created_at,i.updated_at
 from public.gps_trip_investigations i left join public.employees e on e.user_id=i.created_by where i.departure_id=p_departure_id order by i.event_at,i.created_at;
end$$;

create or replace function public.gps_trip_investigation_save(p_id uuid,p_departure_id uuid,p_event_type text,p_event_at timestamptz,p_note text,p_status text default'open',p_assigned_to uuid default null)
returns uuid language plpgsql security definer set search_path=public,app as $$declare result_id uuid;d public.garage_departures%rowtype;begin
 perform app.require_gps_operator();
 if p_event_type not in('route','stop','gap','zone_enter','zone_exit')or p_status not in('open','in_review','resolved')or length(btrim(coalesce(p_note,'')))not between 3 and 1000 then raise exception'GPS_INVESTIGATION_INVALID';end if;
 select gd.* into d from public.garage_departures gd where gd.id=p_departure_id;if not found then raise exception'GPS_DEPARTURE_NOT_FOUND';end if;
 if p_event_at<d.departed_at or p_event_at>coalesce(d.returned_at,now())+interval'1 minute'then raise exception'GPS_INVESTIGATION_TIME_INVALID';end if;
 if p_assigned_to is not null and not exists(select 1 from auth.users au where au.id=p_assigned_to)then raise exception'GPS_INVESTIGATION_ASSIGNEE_INVALID';end if;
 if p_id is null then insert into public.gps_trip_investigations(departure_id,event_type,event_at,note,status,assigned_to,created_by,updated_by)values(p_departure_id,p_event_type,p_event_at,btrim(p_note),p_status,p_assigned_to,auth.uid(),auth.uid())returning id into result_id;
 else update public.gps_trip_investigations set note=btrim(p_note),status=p_status,assigned_to=p_assigned_to,updated_by=auth.uid(),updated_at=now()where id=p_id and departure_id=p_departure_id returning id into result_id;if result_id is null then raise exception'GPS_INVESTIGATION_NOT_FOUND';end if;end if;
 return result_id;
end$$;

revoke all on table public.gps_trip_investigations from anon,authenticated;
grant select on table public.gps_trip_investigations to authenticated;
revoke all on function public.gps_trip_zone_events(uuid),public.gps_trip_investigations_list(uuid),public.gps_trip_investigation_save(uuid,uuid,text,timestamptz,text,text,uuid)from public,anon;
grant execute on function public.gps_trip_zone_events(uuid),public.gps_trip_investigations_list(uuid),public.gps_trip_investigation_save(uuid,uuid,text,timestamptz,text,text,uuid)to authenticated;
