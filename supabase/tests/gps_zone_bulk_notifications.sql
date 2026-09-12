do $$
declare
  ops uuid := '92000000-0000-0000-0000-000000000001';
  employee uuid := '92000000-0000-0000-0000-000000000002';
  it_user uuid := '91000000-0000-0000-0000-000000000100';
  gid uuid;
  vid uuid;
  zid uuid;
  dep uuid;
  aid uuid;
  n bigint;
begin
  insert into auth.users(id,email) values(it_user,'gps-policy-it@x.iq') on conflict do nothing;
  insert into public.user_roles(user_id,role) values(it_user,'it_admin') on conflict do nothing;
  select d.id,b.garage_vehicle_id into gid,vid
  from public.gps_devices d join public.gps_vehicle_bindings b on b.device_id=d.id
  where d.external_id='101';
  select id into dep from public.garage_departures where vehicle_id=vid order by departed_at desc limit 1;

  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub',ops::text,false);
  zid:=public.gps_platform_geofence_save(null,'زون الإسناد الجماعي','[{"lat":33.30,"lng":44.35},{"lat":33.30,"lng":44.37},{"lat":33.32,"lng":44.37}]','#0891b2');
  select count(*) into n from public.gps_zone_vehicle_candidates(zid,'101') where vehicle_id=vid;
  if n<>1 then raise exception 'GPS_ZONE_CANDIDATE_SEARCH_FAIL'; end if;
  n:=public.gps_zone_replace_vehicles(zid,array[vid]);
  if n<>1 then raise exception 'GPS_ZONE_BULK_ASSIGN_FAIL'; end if;
  select count(*) into n from public.gps_zone_vehicle_candidates(zid,null) where vehicle_id=vid and is_assigned;
  if n<>1 then raise exception 'GPS_ZONE_BULK_ASSIGN_STATE_FAIL'; end if;
  begin
    perform public.gps_zone_replace_vehicles(zid,array[vid,vid]);
    raise exception 'GPS_ZONE_DUPLICATE_ACCEPTED';
  exception when others then
    if sqlerrm='GPS_ZONE_DUPLICATE_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GPS_ZONE_VEHICLE_INVALID%' then raise; end if;
  end;
  n:=public.gps_zone_replace_vehicles(zid,array[]::uuid[]);
  if n<>0 then raise exception 'GPS_ZONE_BULK_CLEAR_FAIL'; end if;

  perform set_config('request.jwt.claim.sub',employee::text,false);
  begin
    perform public.gps_alert_notification_policy_save('gps_stale',true,'high',array['ops_room'],true,true,false,true,15,15,3);
    raise exception 'GPS_POLICY_EMPLOYEE_ACCEPTED';
  exception when others then
    if sqlerrm='GPS_POLICY_EMPLOYEE_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GPS_POLICY_FORBIDDEN%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',it_user::text,false);
  perform public.gps_alert_notification_policy_save('gps_stale',true,'critical',array['ops_room'],true,true,true,true,15,15,3);
  select count(*) into n from public.gps_alert_notification_policies_list() where alert_type='gps_stale' and priority='critical' and sound_enabled;
  if n<>1 then raise exception 'GPS_POLICY_SAVE_FAIL'; end if;

  execute 'reset role';
  perform set_config('role','service_role',false);
  insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)
  values(gid,vid,dep,'gps_stale','critical','اختبار إشعار GPS الجماعي','{}') returning id into aid;
  select count(*) into n from public.notifications where user_id=ops and entity_type='gps_alert' and entity_id=aid and priority='critical' and push_allowed and sound_allowed;
  if n<>1 then raise exception 'GPS_ALERT_NOTIFICATION_FAIL'; end if;

  raise notice '✅ GPS الجولة السابعة: الإسناد الجماعي/الحدود/السياسات/الإشعار/العزل ناجحة';
end$$;
