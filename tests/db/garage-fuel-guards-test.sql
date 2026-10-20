-- 00252 · حراسة سائق الانطلاقة: سائق مُنهى لا ينطلق، سائق واحد لا يُسند/لا ينطلق بآليتين معاً، وإنهاء خدمة سائق يبلّغ غرفة العمليات.
-- مستقل. كل الفحوص assert داخل do $$.
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('d6d00000-0000-0000-0000-000000000001', 'garage.dg@t.iq'),
  ('d6d00000-0000-0000-0000-000000000002', 'mgr.dg@t.iq'),
  ('d6d00000-0000-0000-0000-000000000005', 'ops.dg@t.iq'),
  ('d6d00000-0000-0000-0000-000000000007', 'hr.dg@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d6d00000-0000-0000-0000-000000000001', 'central_garage_officer'),
  ('d6d00000-0000-0000-0000-000000000002', 'department_manager'),
  ('d6d00000-0000-0000-0000-000000000005', 'ops_room'),
  ('d6d00000-0000-0000-0000-000000000007', 'hr_officer')
on conflict do nothing;
insert into public.garage_user_profiles (user_id, parent_sector) values ('d6d00000-0000-0000-0000-000000000001', 'karrada') on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('d6d00000-0000-0000-0000-000000000002', 'morning', '{3}') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('d6d0d000-0000-0000-0000-000000000001', 'قسم الآليات (حراسة)', 'DG-FLEET', null, false, false) on conflict (id) do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('d6d0d000-0000-0000-0000-000000000002', 'سائق', 'DG-T1', 'd6d0d000-0000-0000-0000-000000000001', true, true) on conflict (id) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, job_title_id) values
  ('d6d00000-0000-0000-0000-0000000000d1', null, 'DG-D1', 'سائق الحراسة الأول', '2024-01-01', 'd6d0d000-0000-0000-0000-000000000002'),
  ('d6d00000-0000-0000-0000-0000000000d2', null, 'DG-D2', 'سائق الحراسة الثاني', '2024-01-01', 'd6d0d000-0000-0000-0000-000000000002'),
  ('d6d00000-0000-0000-0000-0000000000d3', null, 'DG-D3', 'سائق الحراسة الثالث', '2024-01-01', 'd6d0d000-0000-0000-0000-000000000002'),
  ('d6d00000-0000-0000-0000-0000000000d4', null, 'DG-D4', 'سائق احتياط', '2024-01-01', 'd6d0d000-0000-0000-0000-000000000002')
on conflict (employee_number) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, driver_employee_id, shift, sector_id, vehicle_category, created_by) values
  ('d6d0a000-0000-0000-0000-000000000001', 'كابسة الحراسة 1', 'DB-DG1', 'P-DG1', 'CH-DG0001', 'garage/dg1.jpg', 'سائق الحراسة الأول', 'd6d00000-0000-0000-0000-0000000000d1', 'morning', 3, 'compactor_large', 'd6d00000-0000-0000-0000-000000000005'),
  ('d6d0a000-0000-0000-0000-000000000002', 'كابسة الحراسة 2', 'DB-DG2', 'P-DG2', 'CH-DG0002', 'garage/dg2.jpg', 'سائق الحراسة الثاني', 'd6d00000-0000-0000-0000-0000000000d2', 'morning', 3, 'compactor_large', 'd6d00000-0000-0000-0000-000000000005'),
  ('d6d0a000-0000-0000-0000-000000000003', 'كابسة الحراسة 3', 'DB-DG3', 'P-DG3', 'CH-DG0003', 'garage/dg3.jpg', 'سائق الحراسة الثالث', 'd6d00000-0000-0000-0000-0000000000d3', 'morning', 3, 'compactor_large', 'd6d00000-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.garage_vehicle_shift_assignments (vehicle_id, shift, driver_name, driver_employee_id, sector_id, change_reason, created_by) values
  ('d6d0a000-0000-0000-0000-000000000001', 'morning', 'سائق الحراسة الأول', 'd6d00000-0000-0000-0000-0000000000d1', 3, 'تهيئة', 'd6d00000-0000-0000-0000-000000000005'),
  ('d6d0a000-0000-0000-0000-000000000002', 'morning', 'سائق الحراسة الثاني', 'd6d00000-0000-0000-0000-0000000000d2', 3, 'تهيئة', 'd6d00000-0000-0000-0000-000000000005'),
  ('d6d0a000-0000-0000-0000-000000000003', 'morning', 'سائق الحراسة الثالث', 'd6d00000-0000-0000-0000-0000000000d3', 3, 'تهيئة', 'd6d00000-0000-0000-0000-000000000005');

insert into auth.users (id, email) values ('d6d00000-0000-0000-0000-000000000009','it.dg@t.iq') on conflict do nothing;
insert into public.user_roles (user_id, role) values ('d6d00000-0000-0000-0000-000000000009','it_admin') on conflict do nothing;

-- 00308: لا تعبئة لآلية مؤرشفة · لا حركات على خزان له طلب تصفير معلّق (وإلا تفشل موافقة IT إلى الأبد)
do $$ declare t public.garage_tanks; m public.garage_inventory_movements; z public.garage_tank_zero_requests; msg text;
  v1 uuid := 'd6d0a000-0000-0000-0000-000000000001'; v3 uuid := 'd6d0a000-0000-0000-0000-000000000003'; begin
  perform set_config('auth.user_id','d6d00000-0000-0000-0000-000000000001', false);
  t := public.garage_add_tank('gas_oil', 'خزان كاز 00308', 'liter', 10000, 5000, 20);
  update public.garage_vehicles set archived_at = now(), archived_by = 'd6d00000-0000-0000-0000-000000000001', archive_reason = 'اختبار' where id = v3;
  begin m := public.garage_fill_vehicle(t.id, v3, 100, null, null); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg <> 'GARAGE_VEHICLE_ARCHIVED' then raise exception 'FAIL F1 expected GARAGE_VEHICLE_ARCHIVED got %', msg; end if;
  m := public.garage_fill_vehicle(t.id, v1, 100, null, null);
  if (select current_quantity from public.garage_tanks where id = t.id) <> 4900 then raise exception 'FAIL F2 quantity'; end if;
  z := public.garage_request_tank_zero(t.id, 'تصفية الخزان للصيانة');
  begin m := public.garage_add_tank_stock(t.id, 100, null); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg <> 'GARAGE_TANK_ZERO_PENDING' then raise exception 'FAIL F3 expected GARAGE_TANK_ZERO_PENDING got %', msg; end if;
  begin m := public.garage_fill_vehicle(t.id, v1, 10, null, null); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg <> 'GARAGE_TANK_ZERO_PENDING' then raise exception 'FAIL F4 expected GARAGE_TANK_ZERO_PENDING got %', msg; end if;
  perform set_config('auth.user_id','d6d00000-0000-0000-0000-000000000009', false);
  z := public.garage_decide_tank_zero(z.id, true, 'موافق');
  if z.status <> 'executed' or (select current_quantity from public.garage_tanks where id = t.id) <> 0 then raise exception 'FAIL F5 zero not executed'; end if;
  perform set_config('auth.user_id','d6d00000-0000-0000-0000-000000000001', false);
  m := public.garage_add_tank_stock(t.id, 100, null);   -- بعد البتّ تعود الحركات
  if (select current_quantity from public.garage_tanks where id = t.id) <> 100 then raise exception 'FAIL F6'; end if;
  raise notice 'garage fuel guards test ok';
end $$;
