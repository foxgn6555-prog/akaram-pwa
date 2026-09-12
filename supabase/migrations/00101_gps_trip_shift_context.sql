-- 00101 · سياق الشفتات والسائقين المتداخل زمنياً مع انطلاقية GPS.

create or replace function public.gps_trip_shift_context(p_departure_id uuid)
returns table(
 assignment_id uuid,
 shift text,
 driver_name text,
 sector_id smallint,
 area_name text,
 starts_at timestamptz,
 ends_at timestamptz,
 overlap_from timestamptz,
 overlap_to timestamptz,
 overlap_seconds bigint,
 is_departure_driver boolean
)
language plpgsql stable security definer set search_path=public,app as $$
declare
 d public.garage_departures;
begin
 perform app.require_gps_operator();
 select * into d from public.garage_departures where id=p_departure_id;
 if not found then raise exception 'GPS_DEPARTURE_NOT_FOUND'; end if;
 return query
 select a.id,a.shift,a.driver_name,a.sector_id,s.name,a.starts_at,a.ends_at,
  greatest(a.starts_at,d.departed_at),
  least(coalesce(a.ends_at,now()),coalesce(d.returned_at,now())),
  greatest(0,extract(epoch from(least(coalesce(a.ends_at,now()),coalesce(d.returned_at,now()))-greatest(a.starts_at,d.departed_at)))::bigint),
  lower(trim(a.driver_name))=lower(trim(d.driver_name))
 from public.garage_vehicle_shift_assignments a
 join public.sectors s on s.id=a.sector_id
 where a.vehicle_id=d.vehicle_id
  and a.starts_at<coalesce(d.returned_at,now())
  and coalesce(a.ends_at,now())>d.departed_at
 order by greatest(a.starts_at,d.departed_at),a.shift;
end$$;

create or replace function public.gps_scheduler_health()
returns table(
 last_incremental_at timestamptz,
 incremental_age_seconds bigint,
 gps_schedule_healthy boolean,
 push_pending bigint,
 push_overdue bigint,
 push_processing_stuck bigint,
 push_failed_24h bigint,
 active_push_subscriptions bigint,
 push_schedule_healthy boolean
)
language plpgsql stable security definer set search_path=public,app as $$
declare last_sync timestamptz;
begin
 perform app.require_gps_operator();
 select max(coalesce(finished_at,started_at)) into last_sync from public.gps_sync_runs where sync_type='incremental' and status in('success','partial');
 return query select last_sync,
  case when last_sync is null then null else extract(epoch from(now()-last_sync))::bigint end,
  last_sync is not null and last_sync>now()-interval'3 minutes',
  (select count(*) from public.notification_push_deliveries where status='pending'),
  (select count(*) from public.notification_push_deliveries where status='pending' and next_attempt_at<now()-interval'3 minutes'),
  (select count(*) from public.notification_push_deliveries where status='processing' and claimed_at<now()-interval'5 minutes'),
  (select count(*) from public.notification_push_deliveries where status='failed' and created_at>now()-interval'24 hours'),
  (select count(*) from public.notification_push_subscriptions where is_active),
  not exists(select 1 from public.notification_push_deliveries where(status='pending' and next_attempt_at<now()-interval'3 minutes')or(status='processing' and claimed_at<now()-interval'5 minutes'));
end$$;

revoke all on function public.gps_trip_shift_context(uuid),public.gps_scheduler_health() from public,anon;
grant execute on function public.gps_trip_shift_context(uuid),public.gps_scheduler_health() to authenticated;
