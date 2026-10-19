-- 00254 · تدقيق المحطة/الصيانة: إغلاق البلاغ القصير بعودة الآلية، طلب الصيانة بانتظار موافقة الكراج (المرحلة/المحطة/الإلغاء بالإرسال إلى الكراج)، ولا قطع بعد التسريح.
-- مستقل. كل الفحوص assert داخل do $$.
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('c4c40000-0000-0000-0000-000000000001', 'garage.sm@t.iq'),   -- central_garage_officer (karrada)
  ('c4c40000-0000-0000-0000-000000000002', 'mgr.sm@t.iq'),      -- department_manager (منطقة 4 صباحي)
  ('c4c40000-0000-0000-0000-000000000003', 'station.sm@t.iq'),  -- transfer_station
  ('c4c40000-0000-0000-0000-000000000004', 'maint.sm@t.iq'),    -- maintenance
  ('c4c40000-0000-0000-0000-000000000005', 'ops.sm@t.iq'),      -- ops_room
  ('c4c40000-0000-0000-0000-000000000006', 'mgr2.sm@t.iq')      -- department_manager (منطقة 8 — غريب)
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('c4c40000-0000-0000-0000-000000000001', 'central_garage_officer'),
  ('c4c40000-0000-0000-0000-000000000002', 'department_manager'),
  ('c4c40000-0000-0000-0000-000000000003', 'transfer_station'),
  ('c4c40000-0000-0000-0000-000000000004', 'maintenance'),
  ('c4c40000-0000-0000-0000-000000000005', 'ops_room'),
  ('c4c40000-0000-0000-0000-000000000006', 'department_manager')
on conflict do nothing;
-- المناطق ثابتة 1..8 (1–4 كرادة، 5–8 زعفرانية): نستخدم 4 للدورة و8 كمنطقة غريبة
insert into public.garage_user_profiles (user_id, parent_sector) values ('c4c40000-0000-0000-0000-000000000001', 'karrada') on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values
  ('c4c40000-0000-0000-0000-000000000002', 'morning', '{4}'), ('c4c40000-0000-0000-0000-000000000006', 'morning', '{8}') on conflict do nothing;
-- (00153) المسميات من الهيكل: قسم الآليات → «سائق كابسة»/«سائق» (يقودان آليات)، قسم الإدارة → «مسؤول قسم»
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('c4c4d000-0000-0000-0000-000000000001', 'قسم الآليات (اختبار)', 'SM-FLEET', null, false, false),
  ('c4c4d000-0000-0000-0000-000000000004', 'قسم الإدارة (اختبار)', 'SM-ADMIN', null, false, false)
on conflict (id) do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('c4c4d000-0000-0000-0000-000000000002', 'سائق كابسة', 'SM-T1', 'c4c4d000-0000-0000-0000-000000000001', true, true),
  ('c4c4d000-0000-0000-0000-000000000003', 'سائق', 'SM-T2', 'c4c4d000-0000-0000-0000-000000000001', true, true),
  ('c4c4d000-0000-0000-0000-000000000005', 'مسؤول قسم', 'SM-T3', 'c4c4d000-0000-0000-0000-000000000004', true, false)
on conflict (id) do nothing;
-- (00156) قسم الصيانة → مسمى «فني هيدروليك» بتخصص صيانة، وموظف فني عليه
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('c4c4d000-0000-0000-0000-000000000006', 'قسم الصيانة (اختبار)', 'SM-MAINT', null, false, false) on conflict (id) do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles, maintenance_specialty) values
  ('c4c4d000-0000-0000-0000-000000000007', 'فني هيدروليك', 'SM-T4', 'c4c4d000-0000-0000-0000-000000000006', true, false, 'hydraulic') on conflict (id) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, job_title_id) values
  ('c4c40000-0000-0000-0000-0000000000f1', null, 'SM-F1', 'فني الدورة', '2024-01-01', 'c4c4d000-0000-0000-0000-000000000007') on conflict (employee_number) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, job_title_id, biometric_pin) values
  ('c4c40000-0000-0000-0000-0000000000e2', 'c4c40000-0000-0000-0000-000000000002', 'SM-M1', 'مسؤول قاطع الدورة', '2024-01-01', 'c4c4d000-0000-0000-0000-000000000005', null),
  ('c4c40000-0000-0000-0000-0000000000d1', null, 'SM-D1', 'سائق الدورة', '2024-01-01', 'c4c4d000-0000-0000-0000-000000000002', 'D1'),
  ('c4c40000-0000-0000-0000-0000000000d2', null, 'SM-D2', 'سائق ثانٍ', '2024-01-01', 'c4c4d000-0000-0000-0000-000000000003', null),
  ('c4c40000-0000-0000-0000-0000000000d3', null, 'SM-D3', 'سائق بديل', '2024-01-01', 'c4c4d000-0000-0000-0000-000000000003', 'D3'),
  ('c4c40000-0000-0000-0000-0000000000d9', null, 'SM-D9', 'سائق مُنهى', '2024-01-01', 'c4c4d000-0000-0000-0000-000000000003', null)
on conflict (employee_number) do nothing;
update public.employees set employment_status = 'terminated', terminated_at = current_date - 10 where employee_number = 'SM-D9';
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, driver_employee_id, shift, sector_id, vehicle_category, created_by) values
  ('c4c4a000-0000-0000-0000-000000000001', 'كابسة الدورة', 'DB-SM1', 'P-SM1', 'CH-SM0001', 'garage/sm1.jpg', 'سائق الدورة', 'c4c40000-0000-0000-0000-0000000000d1', 'morning', 4, 'compactor_large', 'c4c40000-0000-0000-0000-000000000005'),
  ('c4c4a000-0000-0000-0000-000000000002', 'كابسة ثانية', 'DB-SM2', 'P-SM2', 'CH-SM0002', 'garage/sm2.jpg', 'سائق ثانٍ', 'c4c40000-0000-0000-0000-0000000000d2', 'morning', 4, 'compactor_large', 'c4c40000-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.garage_vehicle_shift_assignments (vehicle_id, shift, driver_name, driver_employee_id, sector_id, change_reason, created_by) values
  ('c4c4a000-0000-0000-0000-000000000001', 'morning', 'سائق الدورة', 'c4c40000-0000-0000-0000-0000000000d1', 4, 'تهيئة الاختبار', 'c4c40000-0000-0000-0000-000000000005'),
  ('c4c4a000-0000-0000-0000-000000000002', 'morning', 'سائق ثانٍ', 'c4c40000-0000-0000-0000-0000000000d2', 4, 'تهيئة الاختبار', 'c4c40000-0000-0000-0000-000000000005');

-- مساعد: تبديل المستخدم الحالي
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
-- مساعد: توقع فشل بكود محدد
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare garage uuid:='c4c40000-0000-0000-0000-000000000001'; mgr uuid:='c4c40000-0000-0000-0000-000000000002'; st uuid:='c4c40000-0000-0000-0000-000000000003';
        mt uuid:='c4c40000-0000-0000-0000-000000000004'; ops uuid:='c4c40000-0000-0000-0000-000000000005';
        v uuid:='c4c4a000-0000-0000-0000-000000000001'; tech uuid:='c4c40000-0000-0000-0000-0000000000f1';
        d public.garage_departures; c public.vehicle_maintenance_cases; l public.vehicle_trip_legs; b public.sector_breakdowns; inv public.maintenance_inventory_items; n int;
begin
  -- ═══ A · بلاغ قصير مفتوح ثم عودة إلى الكراج ⇒ يُغلق تلقائياً ويُسمح ببلاغ الغد
  perform pg_temp.as_user(garage); d := public.garage_record_shift_departure(v, 'morning');
  perform pg_temp.as_user(mgr); d := public.sector_confirm_vehicle_arrival(d.id);
  b := public.sector_submit_breakdown('DB-SM1', 'عطل بسيط في الموقع');
  perform public.sector_send_vehicle_to_garage(d.id);
  perform pg_temp.as_user(garage); d := public.garage_record_return(d.id);
  select * into b from public.sector_breakdowns where id = b.id;
  assert b.status = 'resolved' and b.resolution_notes like '%بعودة الآلية إلى الكراج%', format('A: البلاغ أُغلق بعودة الآلية (فعلي %s)', b.status);
  perform pg_temp.as_user(garage); d := public.garage_record_shift_departure(v, 'morning');
  perform pg_temp.as_user(mgr); d := public.sector_confirm_vehicle_arrival(d.id);
  b := public.sector_submit_breakdown('DB-SM1', 'عطل اليوم التالي');
  assert b.status = 'logged', 'A: بلاغ اليوم التالي مقبول';
  perform public.sector_return_vehicle_to_work(b.id, 'حُلّ');

  -- ═══ B · سياسة «موافقة الكراج»: المرحلة عطل مُبلَّغ، المحطة ممنوعة، الكراج مسموح ويلغي الطلب ويبلّغ
  insert into public.notification_workflow_policies (event_key, sector_id, mode) values ('maintenance_dispatch', 4, 'approval_required');
  c := public.sector_send_vehicle_to_maintenance(d.id, 'عطل محرك', 'normal');
  assert c.garage_decision_status = 'awaiting_approval', 'B: بانتظار الموافقة';
  assert app.trip_status(d.id) = 'breakdown', format('B: المرحلة عطل مُبلَّغ لا داخل الصيانة (فعلي %s)', app.trip_status(d.id));
  perform pg_temp.expect_error(format('select public.sector_send_vehicle_to_station(%L)', d.id), 'MAINTENANCE_APPROVAL_PENDING');
  perform pg_temp.expect_error(format('select public.sector_send_vehicle_to_maintenance(%L,%L,%L)', d.id, 'عطل آخر', 'normal'), 'MAINTENANCE_CASE_ALREADY_OPEN');
  perform public.sector_send_vehicle_to_garage(d.id);
  select * into c from public.vehicle_maintenance_cases where id = c.id;
  assert c.garage_decision_status = 'cancelled' and c.status = 'cancelled' and c.completed_at is not null, format('B: الطلب أُلغي (فعلي %s/%s)', c.garage_decision_status, c.status);
  select count(*) into n from public.notifications where title = 'أُلغي طلب صيانة بانتظار موافقتكم' and user_id in (garage, mt);
  assert n = 2, format('B: تبليغ الكراج والصيانة (فعلي %s)', n);
  assert app.trip_status(d.id) = 'to_garage', 'B: في طريق العودة';
  perform pg_temp.as_user(garage);
  perform pg_temp.expect_error(format('select public.garage_decide_maintenance_dispatch(%L,%L)', c.id, 'approve'), 'MAINTENANCE_APPROVAL_NOT_ALLOWED');
  d := public.garage_record_return(d.id);
  assert (select status from public.sector_breakdowns where id = c.breakdown_id) = 'resolved', 'B: بلاغ العطل المرتبط أُغلق بالعودة';
  d := public.garage_record_shift_departure(v, 'morning');
  assert d.id is not null, 'B: انطلاقة الغد لا تُحجب بطلب ملغى';
  -- الموافقة العادية ما زالت تعمل
  perform pg_temp.as_user(mgr); d := public.sector_confirm_vehicle_arrival(d.id);
  c := public.sector_send_vehicle_to_maintenance(d.id, 'عطل فرامل', 'normal');
  perform pg_temp.as_user(garage); c := public.garage_decide_maintenance_dispatch(c.id, 'approve');
  assert c.garage_decision_status = 'approved' and app.trip_status(d.id) = 'to_maintenance', 'B: الموافقة تفتح ساق الصيانة';
  delete from public.notification_workflow_policies where sector_id = 4;

  -- ═══ C · لا قطع بعد تسريح الآلية من الورشة
  perform pg_temp.as_user(mt); c := public.maintenance_confirm_arrival(c.id);
  inv := public.maintenance_inventory_create('SM-P1', 'قطعة', 'قطعة', 1); perform public.maintenance_inventory_receive(inv.id, 5, 1000, 'x');
  perform public.maintenance_issue_and_install(c.id, inv.id, 1);
  c := public.maintenance_complete_case(c.id, 'تلف', 'استبدال', array[tech]::uuid[]);
  c := public.maintenance_dispatch_vehicle(c.id, 'work_site');
  perform pg_temp.expect_error(format('select public.maintenance_issue_and_install(%L,%L,1)', c.id, inv.id), 'MAINTENANCE_VEHICLE_ALREADY_DISPATCHED');
  assert (select current_quantity from public.maintenance_inventory_items where id = inv.id) = 4, 'C: المخزن لم يُخصم عند الرفض';
  assert (select count(*) from public.vehicle_maintenance_parts where case_id = c.id) = 1, 'C: قطعة واحدة فقط';
  select * into l from public.vehicle_trip_legs where departure_id = d.id and arrived_at is null;
  perform pg_temp.as_user(mgr); perform public.sector_confirm_vehicle_site_return(l.id);
  perform public.sector_send_vehicle_to_garage(d.id);
  perform pg_temp.as_user(garage); d := public.garage_record_return(d.id);
  assert d.returned_at is not null, 'C: الدورة أُغلقت';
end $$;
