-- اختبار 00237: super_admin يستدعي دوال الصيانة/المحطة/رحلات المدير بلا FORBIDDEN، وموظف عادي ما زال مرفوضاً. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values ('a7000000-0000-0000-0000-000000000001','sa-a7@t.iq'), ('a7000000-0000-0000-0000-000000000002','emp-a7@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('a7000000-0000-0000-0000-000000000001','super_admin'), ('a7000000-0000-0000-0000-000000000002','employee') on conflict do nothing;
do $$
declare n int; q text;
  reads text[] := array[
    'select count(*) from public.maintenance_technicians()',
    'select count(*) from public.maintenance_vehicle_cases()',
    'select count(*) from public.maintenance_case_days(30)',
    'select count(*) from public.maintenance_cases_for_day(current_date)',
    'select count(*) from public.station_movement_days(30,0)',
    'select count(*) from public.station_vehicle_movements()',
    'select count(*) from public.station_visits_for_day(current_date,null,null,null)',
    'select count(*) from public.manager_vehicle_trip_days(30,0)',
    'select count(*) from public.manager_vehicle_trips()',
    'select count(*) from public.manager_vehicle_trips_for_day(current_date)'];
begin
  perform set_config('auth.user_id','a7000000-0000-0000-0000-000000000001',false);
  foreach q in array reads loop
    begin execute q into n;
    exception when others then raise exception 'super_admin blocked: % → %', q, sqlerrm; end;
  end loop;
  perform set_config('auth.user_id','a7000000-0000-0000-0000-000000000002',false);
  foreach q in array reads loop
    begin execute q into n; raise exception 'employee should be refused: %', q;
    exception when others then
      if sqlerrm !~ 'FORBIDDEN' then raise; end if;
    end;
  end loop;
  -- لا دالة بقيت ببوابة maintenance/transfer_station بدون super_admin (باستثناء اشتقاق الأدوار المعروف)
  select count(*) into n from pg_proc where pronamespace='public'::regnamespace
    and prosrc ~ 'if\s+not\s+app\.has_role\(array\[''(maintenance|transfer_station)''\]\)';
  if n <> 0 then raise exception 'still % gated functions without super_admin', n; end if;
  raise notice 'SUPER_ADMIN_PORTAL_ACCESS_OK';
end $$;
