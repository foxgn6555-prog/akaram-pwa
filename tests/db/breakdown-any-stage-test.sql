-- 00253 · بلاغ العطل في أي مرحلة من الرحلة: في الطريق إلى الموقع، في الموقع، في الطريق إلى المحطة، في المحطة، في طريق العودة؛
--         ممنوع فقط بيد الصيانة؛ المرحلة لا تتغيّر بالبلاغ؛ الخط الزمني يذكر موضع الآلية؛ الحلّ يعمل من أي مرحلة.
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('b5b00000-0000-0000-0000-000000000001', 'garage.bs@t.iq'),
  ('b5b00000-0000-0000-0000-000000000002', 'mgr.bs@t.iq'),
  ('b5b00000-0000-0000-0000-000000000003', 'station.bs@t.iq'),
  ('b5b00000-0000-0000-0000-000000000005', 'ops.bs@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('b5b00000-0000-0000-0000-000000000001', 'central_garage_officer'),
  ('b5b00000-0000-0000-0000-000000000002', 'department_manager'),
  ('b5b00000-0000-0000-0000-000000000003', 'transfer_station'),
  ('b5b00000-0000-0000-0000-000000000005', 'ops_room')
on conflict do nothing;
insert into public.garage_user_profiles (user_id, parent_sector) values ('b5b00000-0000-0000-0000-000000000001', 'karrada') on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('b5b00000-0000-0000-0000-000000000002', 'morning', '{2}') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('b5b0d000-0000-0000-0000-000000000001', 'قسم الآليات (أعطال)', 'BS-FLEET', null, false, false) on conflict (id) do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('b5b0d000-0000-0000-0000-000000000002', 'سائق', 'BS-T1', 'b5b0d000-0000-0000-0000-000000000001', true, true) on conflict (id) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, job_title_id) values
  ('b5b00000-0000-0000-0000-0000000000d1', null, 'BS-D1', 'سائق الأعطال', '2024-01-01', 'b5b0d000-0000-0000-0000-000000000002') on conflict (employee_number) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, driver_employee_id, shift, sector_id, vehicle_category, created_by) values
  ('b5b0a000-0000-0000-0000-000000000001', 'كابسة الأعطال', 'DB-BS1', 'P-BS1', 'CH-BS0001', 'garage/bs1.jpg', 'سائق الأعطال', 'b5b00000-0000-0000-0000-0000000000d1', 'morning', 2, 'compactor_large', 'b5b00000-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.garage_vehicle_shift_assignments (vehicle_id, shift, driver_name, driver_employee_id, sector_id, change_reason, created_by) values
  ('b5b0a000-0000-0000-0000-000000000001', 'morning', 'سائق الأعطال', 'b5b00000-0000-0000-0000-0000000000d1', 2, 'تهيئة', 'b5b00000-0000-0000-0000-000000000005');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare garage uuid := 'b5b00000-0000-0000-0000-000000000001'; mgr uuid := 'b5b00000-0000-0000-0000-000000000002';
        st uuid := 'b5b00000-0000-0000-0000-000000000003'; ops uuid := 'b5b00000-0000-0000-0000-000000000005';
        v uuid := 'b5b0a000-0000-0000-0000-000000000001'; d public.garage_departures; l public.vehicle_trip_legs; b public.sector_breakdowns; n int;
begin
  -- B1 · في الطريق إلى الموقع (قبل تأكيد الوصول)
  perform pg_temp.as_user(garage); d := public.garage_record_shift_departure(v, 'morning');
  perform pg_temp.as_user(mgr);
  assert app.trip_status(d.id) = 'to_site', 'B1: المرحلة to_site';
  b := public.sector_submit_breakdown('DB-BS1', 'انفجار إطار في الطريق');
  assert b.departure_id = d.id and b.trip_stage = 'to_site', 'B1: البلاغ مقبول في الطريق ومسجّل موضعه';
  assert app.trip_status(d.id) = 'to_site', 'B1: البلاغ لا يغيّر مرحلة الرحلة';
  perform pg_temp.expect_error(format('select public.sector_submit_breakdown(%L,%L)', 'DB-BS1', 'بلاغ مكرر'), 'BREAKDOWN_ALREADY_OPEN');
  b := public.sector_return_vehicle_to_work(b.id, 'بُدّل الإطار وأكملت');
  assert b.status = 'resolved', 'B1: حُلّ من الطريق';

  -- B2 · في موقع العمل (السلوك القديم باقٍ) ثم الحلّ من غرفة العمليات
  d := public.sector_confirm_vehicle_arrival(d.id, 'وصلت');
  b := public.sector_submit_breakdown('DB-BS1', 'عطل مكبس');
  assert b.trip_stage = 'at_site' and app.trip_status(d.id) = 'breakdown', 'B2: في الموقع المرحلة تُظهر العطل كما كانت';
  perform pg_temp.as_user(ops);
  b := public.ops_resolve_breakdown(d.id, 'حُلّ ميدانياً');
  assert b.status = 'resolved' and app.trip_status(d.id) = 'at_site', 'B2: بعد الحلّ تعود at_site';

  -- B3 · في الطريق إلى المحطة
  perform pg_temp.as_user(mgr);
  l := public.sector_send_vehicle_to_station(d.id, 'حمولة');
  assert app.trip_status(d.id) = 'to_station', 'B3: to_station';
  b := public.sector_submit_breakdown('DB-BS1', 'عطل محرك في الطريق إلى المحطة');
  assert b.trip_stage = 'to_station' and app.trip_status(d.id) = 'to_station', 'B3: مقبول في الطريق إلى المحطة والمرحلة ثابتة';
  -- المحطة تستقبلها رغم العطل المفتوح (أُصلحت على الطريق) ثم يُحلّ البلاغ
  perform pg_temp.as_user(st); perform public.station_confirm_vehicle_arrival(l.id, 'وصلت');
  assert app.trip_status(d.id) = 'at_station', 'B3: وصلت المحطة';
  perform pg_temp.as_user(mgr); b := public.sector_return_vehicle_to_work(b.id, 'أُصلح على الطريق');

  -- B4 · في المحطة
  b := public.sector_submit_breakdown('DB-BS1', 'عطل هيدروليك داخل المحطة');
  assert b.trip_stage = 'at_station', 'B4: مقبول في المحطة';
  perform pg_temp.as_user(st); perform public.ts_record_weighing(l.id, 7.1); perform public.ts_complete_weighing(l.id, 'transfer_station', 'compactor_large');
  l := public.station_dispatch_vehicle(d.id, 'work_site', 'عودة');
  perform pg_temp.as_user(mgr); b := public.sector_return_vehicle_to_work(b.id, 'أُصلح في المحطة');
  perform public.sector_confirm_vehicle_site_return(l.id);
  assert app.trip_status(d.id) = 'at_site', 'B4: عادت إلى الموقع';

  -- B5 · في طريق العودة إلى الكراج، ثم البلاغ لا يمنع تسجيل العودة
  perform public.sector_send_vehicle_to_garage(d.id);
  assert app.trip_status(d.id) = 'to_garage', 'B5: to_garage';
  b := public.sector_submit_breakdown('DB-BS1', 'تسرب زيت في طريق العودة');
  assert b.trip_stage = 'to_garage', 'B5: مقبول في طريق العودة';
  perform public.sector_return_vehicle_to_work(b.id, 'أُصلح');
  perform pg_temp.as_user(garage); d := public.garage_record_return(d.id);
  assert d.returned_at is not null, 'B5: العودة مسجّلة';

  -- B6 · الخط الزمني يذكر موضع الآلية وقت كل بلاغ
  perform pg_temp.as_user(ops);
  select count(*) into n from public.operational_departure_timeline(d.id) t where t.event_type = 'breakdown' and t.title like 'بلاغ عطل — %';
  assert n = 5, format('B6: خمسة بلاغات في الخط الزمني (فعلي %s)', n);
  assert exists (select 1 from public.operational_departure_timeline(d.id) t where t.title = 'بلاغ عطل — في الطريق إلى المحطة'), 'B6: عنوان الطريق إلى المحطة';
  assert exists (select 1 from public.operational_departure_timeline(d.id) t where t.title = 'بلاغ عطل — في المحطة'), 'B6: عنوان المحطة';
  assert exists (select 1 from public.operational_departure_timeline(d.id) t where t.title = 'حُسم العطل (في طريق العودة إلى الكراج)'), 'B6: عنوان الحسم بالموضع';

  -- B7 · بيد الصيانة ⇒ مرفوض
  perform pg_temp.as_user(garage); d := public.garage_record_shift_departure(v, 'morning');
  perform pg_temp.as_user(mgr); d := public.sector_confirm_vehicle_arrival(d.id);
  perform public.sector_send_vehicle_to_maintenance(d.id, 'عطل كبير', 'urgent');
  assert app.trip_status(d.id) = 'to_maintenance', 'B7: to_maintenance';
  perform pg_temp.expect_error(format('select public.sector_submit_breakdown(%L,%L)', 'DB-BS1', 'بلاغ أثناء الصيانة'), 'BREAKDOWN_TRIP_IN_MAINTENANCE');
end $$;
