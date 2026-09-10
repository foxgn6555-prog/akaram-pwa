-- 00088 · تنبيهات غرفة العمليات الحية للتأخر والتوقف وعدم التحديث

create or replace function public.operational_live_alerts(p_sector_id smallint default null,p_shift text default null,p_severity text default null)
returns table(alert_id text,alert_type text,severity text,departure_id uuid,case_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,sector_id smallint,area_name text,manager_name text,title text,details text,started_at timestamptz,threshold_minutes integer,elapsed_minutes integer,action_link text)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_shift is not null and p_shift not in('morning','evening','night') then raise exception 'OPS_SHIFT_INVALID';end if;
 if p_severity is not null and p_severity not in('warning','critical') then raise exception 'OPS_ALERT_SEVERITY_INVALID';end if;
 return query
 with raw as(
  -- لم تصل من الكراج إلى موقع العمل خلال 60 دقيقة.
  select 'garage_arrival_delay'::text alert_type,case when now()-d.departed_at>interval '120 minutes' then 'critical' else 'warning' end severity,d.id departure_id,null::uuid case_id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name area_name,d.recipient_manager_name manager_name,
   'تأخر الوصول من الكراج'::text title,format('لم يؤكد مسؤول القسم وصول الآلية DB %s إلى موقع العمل',v.db_number) details,d.departed_at started_at,60 threshold_minutes,floor(extract(epoch from(now()-d.departed_at))/60)::int elapsed_minutes,'/manager/vehicle-trips'::text action_link
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where d.arrived_at is null and d.returned_at is null and now()-d.departed_at>interval '60 minutes'
  union all
  -- انتقال مفتوح بين أي جهتين تجاوز 45 دقيقة.
  select 'leg_transit_delay',case when now()-l.departed_at>interval '90 minutes' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'تأخر انتقال الآلية',format('انتقال DB %s من %s إلى %s ما زال دون تأكيد وصول',v.db_number,l.origin_type,l.destination_type),l.departed_at,45,floor(extract(epoch from(now()-l.departed_at))/60)::int,
   case l.destination_type when 'transfer_station' then '/transfer-station/vehicle-movements' when 'maintenance' then '/maintenance/vehicle-cases' else '/manager/vehicle-trips' end
  from public.vehicle_trip_legs l join public.garage_departures d on d.id=l.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where l.arrived_at is null and now()-l.departed_at>interval '45 minutes'
  union all
  -- بقيت في المحطة أكثر من 60 دقيقة بلا مغادرة.
  select 'station_stay_delay',case when now()-i.arrived_at>interval '180 minutes' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'طول البقاء في المحطة',format('الآلية DB %s داخل المحطة ولم تسجل مغادرتها',v.db_number),i.arrived_at,60,floor(extract(epoch from(now()-i.arrived_at))/60)::int,'/transfer-station/vehicle-movements'
  from public.vehicle_trip_legs i join public.garage_departures d on d.id=i.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where i.destination_type='transfer_station' and i.arrived_at is not null and not exists(select 1 from public.vehicle_trip_legs o where o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station') and now()-i.arrived_at>interval '60 minutes'
  union all
  -- تجاوز الموعد المتوقع للصيانة.
  select 'maintenance_overdue','critical',d.id,c.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'تجاوز موعد إنجاز الصيانة',format('تجاوزت حالة DB %s الموعد المتوقع وما زالت مفتوحة بنسبة %s%%',v.db_number,c.progress),c.expected_completion_at,0,floor(extract(epoch from(now()-c.expected_completion_at))/60)::int,'/maintenance/vehicle-cases'
  from public.vehicle_maintenance_cases c join public.garage_departures d on d.id=c.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where c.completed_at is null and c.expected_completion_at is not null and c.expected_completion_at<now()
  union all
  -- حالة صيانة مفتوحة لم تُحدّث منذ 24 ساعة.
  select 'maintenance_no_update',case when now()-coalesce(u.last_update,c.arrived_at,c.reported_at)>interval '48 hours' then 'critical' else 'warning' end,d.id,c.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'الصيانة دون تحديث',format('حالة صيانة DB %s لم تسجل تحديثاً حديثاً',v.db_number),coalesce(u.last_update,c.arrived_at,c.reported_at),1440,floor(extract(epoch from(now()-coalesce(u.last_update,c.arrived_at,c.reported_at)))/60)::int,'/maintenance/vehicle-cases'
  from public.vehicle_maintenance_cases c join public.garage_departures d on d.id=c.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  left join lateral(select max(mu.created_at) last_update from public.vehicle_maintenance_updates mu where mu.case_id=c.id)u on true
  where c.completed_at is null and c.arrived_at is not null and now()-coalesce(u.last_update,c.arrived_at,c.reported_at)>interval '24 hours'
  union all
  -- رحلة مفتوحة بلا أي نشاط حديث لمدة 12 ساعة.
  select 'trip_stale','critical',d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'رحلة مفتوحة دون تحديث',format('الرحلة المفتوحة للآلية DB %s لم تشهد أي حركة حديثة',v.db_number),a.last_activity,720,floor(extract(epoch from(now()-a.last_activity))/60)::int,'/ops-room/operations-data'
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  cross join lateral(select greatest(d.departed_at,coalesce(d.arrived_at,d.departed_at),coalesce(d.site_departed_at,d.departed_at),coalesce((select max(greatest(l.departed_at,coalesce(l.arrived_at,l.departed_at))) from public.vehicle_trip_legs l where l.departure_id=d.id),d.departed_at))last_activity)a
  where d.returned_at is null and now()-a.last_activity>interval '12 hours'
  union all
  -- عطل قصير مفتوح في الموقع أكثر من أربع ساعات وليس داخل الصيانة.
  select 'breakdown_stale',case when now()-b.created_at>interval '8 hours' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'عطل مفتوح دون حسم',format('العطل المفتوح للآلية DB %s: %s',v.db_number,b.fault_type),b.created_at,240,floor(extract(epoch from(now()-b.created_at))/60)::int,'/manager/breakdown'
  from public.sector_breakdowns b join public.garage_departures d on d.id=b.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where b.status='logged' and b.archived_at is null and now()-b.created_at>interval '4 hours' and not exists(select 1 from public.vehicle_maintenance_cases c where c.breakdown_id=b.id and c.completed_at is null)
 )
 select md5(r.alert_type||':'||coalesce(r.departure_id::text,'')||':'||coalesce(r.case_id::text,'')),r.alert_type,r.severity,r.departure_id,r.case_id,r.vehicle_id,r.vehicle_name,r.db_number,r.driver_name,r.shift,r.sector_id,r.area_name,r.manager_name,r.title,r.details,r.started_at,r.threshold_minutes,r.elapsed_minutes,r.action_link
 from raw r where(p_sector_id is null or r.sector_id=p_sector_id)and(p_shift is null or r.shift=p_shift)and(p_severity is null or r.severity=p_severity)
 order by case r.severity when 'critical' then 0 else 1 end,r.elapsed_minutes desc;
end$$;

revoke all on function public.operational_live_alerts(smallint,text,text) from public,anon;
grant execute on function public.operational_live_alerts(smallint,text,text) to authenticated;
