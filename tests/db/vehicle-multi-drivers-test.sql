-- اختبار 00322 (00377): سائقون متعددون للآلية (شفتات + أساسي/احتياطي) من لحظة الإضافة، وحراسة الانطلاق. مستقل (بادئة e4).
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('e4000000-0000-0000-0000-000000000001', 'ops-md@t.iq'), ('e4000000-0000-0000-0000-000000000003', 'mgr-md@t.iq'),
  ('e4000000-0000-0000-0000-000000000005', 'gar-md@t.iq'), ('e4000000-0000-0000-0000-00000000000c', 'cont-md@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e4000000-0000-0000-0000-000000000001', 'ops_room'), ('e4000000-0000-0000-0000-000000000003', 'department_manager'),
  ('e4000000-0000-0000-0000-000000000005', 'central_garage_officer'), ('e4000000-0000-0000-0000-00000000000c', 'employee') on conflict do nothing;
insert into public.garage_user_profiles (user_id, parent_sector) values ('e4000000-0000-0000-0000-000000000005', (select parent_sector from public.sectors where id = 1)) on conflict (user_id) do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('e4000000-0000-0000-0000-000000000003', 'morning', '{1}') on conflict (user_id) do update set shift = excluded.shift, sectors = excluded.sectors;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone) values ('e40e0000-0000-0000-0000-00000000000c', 'e4000000-0000-0000-0000-00000000000c', 'MD-CT-1', 'متعهد السائقين', '2024-01-01', '0771') on conflict (id) do nothing;
insert into public.contractor_profiles (user_id, manager_user_id, sector_id) values ('e4000000-0000-0000-0000-00000000000c', 'e4000000-0000-0000-0000-000000000003', 1) on conflict (user_id) do nothing;
insert into public.departments (id, name, code) values ('e40d0000-0000-0000-0000-0000000000a1', 'قسم السائقين MD', 'MDD') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values ('e40d0000-0000-0000-0000-0000000000a2', 'سائق MD', 'MDT1', 'e40d0000-0000-0000-0000-0000000000a1', true, true) on conflict do nothing;
insert into public.employees (id, employee_number, full_name, hire_date, phone, job_title_id) values
  ('e40e0000-0000-0000-0000-000000000001', 'MD-DRV-1', 'سائق أساسي صباحي', '2024-01-01', '07700000021', 'e40d0000-0000-0000-0000-0000000000a2'),
  ('e40e0000-0000-0000-0000-000000000002', 'MD-DRV-2', 'سائق احتياطي صباحي', '2024-01-01', '07700000022', 'e40d0000-0000-0000-0000-0000000000a2'),
  ('e40e0000-0000-0000-0000-000000000003', 'MD-DRV-3', 'سائق مسائي', '2024-01-01', '07700000023', 'e40d0000-0000-0000-0000-0000000000a2'),
  ('e40e0000-0000-0000-0000-000000000004', 'MD-DRV-4', 'سائق آلية ثانية', '2024-01-01', '07700000024', 'e40d0000-0000-0000-0000-0000000000a2') on conflict (id) do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ A) الإضافة بسائقين متعددين: صباحي أساسي (موظف) + صباحي احتياطي (سائق متعهد) + مسائي أساسي ═══
do $$
declare v public.garage_vehicles; x public.station_external_drivers; n int; l record; drivers jsonb;
begin
  perform pg_temp.as_user('e4000000-0000-0000-0000-000000000001');
  x := public.station_external_driver_save_v2(null, 'سائق متعهد احتياطي', 'e4000000-0000-0000-0000-00000000000c', '07809999991', 'L-MD1');
  drivers := jsonb_build_array(
    jsonb_build_object('shift','morning','role','primary','driver_employee_id','e40e0000-0000-0000-0000-000000000001'),
    jsonb_build_object('shift','morning','role','backup','driver_external_id', x.id),
    jsonb_build_object('shift','evening','role','primary','driver_employee_id','e40e0000-0000-0000-0000-000000000003'));
  v := public.garage_add_vehicle('كابسة متعددة السائقين', 'DB-MD1', 'P-MD1', 'CH-MD0001', 'e4000000-0000-0000-0000-000000000001/md1.jpg', 'morning', null, 1::smallint, 'tipper', 'owned',
         null, null, null, null, null, null, null, null, drivers);
  assert v.driver_employee_id = 'e40e0000-0000-0000-0000-000000000001' and v.driver_name = 'سائق أساسي صباحي', 'A1: سائق الآلية = أساسي الشفت الرئيسي';
  select count(*) into n from public.garage_vehicle_shift_assignments where vehicle_id = v.id and ends_at is null; assert n = 3, 'A2: ثلاثة إسنادات نشطة got ' || n;
  select count(*) into n from public.garage_vehicle_shift_assignments where vehicle_id = v.id and ends_at is null and shift = 'morning' and driver_role = 'backup' and driver_external_id = x.id; assert n = 1, 'A3: احتياطي المتعهد مسجَّل بهويته';
  select count(*) into n from public.garage_driver_assignments where vehicle_id = v.id and ends_at is null; assert n = 1, 'A4: سجل الإسناد الرئيسي واحد';
  -- القائمة تُظهر الدور واسم المتعهد
  select count(*) into n from public.garage_vehicle_shift_assignments_list(v.id) where driver_role = 'backup' and contractor_name = 'متعهد السائقين'; assert n = 1, 'A5: القائمة تُظهر الدور والمتعهد';
  -- أخطاء التحقق
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('خطأ', 'DB-MD9', 'P-MD9', 'CH-MD0009', 'e4000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 1::smallint, 'tipper', 'owned', null,null,null,null,null,null,null,null,
    '[{"shift":"morning","role":"backup","driver_employee_id":"e40e0000-0000-0000-0000-000000000004"}]'::jsonb) $q$, 'FLEET_BACKUP_NEEDS_PRIMARY');
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('خطأ', 'DB-MD9', 'P-MD9', 'CH-MD0009', 'e4000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 1::smallint, 'tipper', 'owned', null,null,null,null,null,null,null,null,
    '[{"shift":"evening","role":"primary","driver_employee_id":"e40e0000-0000-0000-0000-000000000004"}]'::jsonb) $q$, 'FLEET_PRIMARY_DRIVER_REQUIRED');
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('خطأ', 'DB-MD9', 'P-MD9', 'CH-MD0009', 'e4000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 1::smallint, 'tipper', 'owned', null,null,null,null,null,null,null,null,
    '[{"shift":"morning","role":"primary","driver_employee_id":"e40e0000-0000-0000-0000-000000000004"},{"shift":"morning","role":"primary","driver_employee_id":"e40e0000-0000-0000-0000-000000000002"}]'::jsonb) $q$, 'FLEET_DRIVER_SLOT_DUPLICATE');
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('خطأ', 'DB-MD9', 'P-MD9', 'CH-MD0009', 'e4000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 1::smallint, 'tipper', 'owned', null,null,null,null,null,null,null,null,
    '[{"shift":"morning","role":"primary","driver_employee_id":"e40e0000-0000-0000-0000-000000000004"},{"shift":"morning","role":"backup","driver_employee_id":"e40e0000-0000-0000-0000-000000000004"}]'::jsonb) $q$, 'FLEET_DRIVER_DUPLICATE_IN_SHIFT');
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('خطأ', 'DB-MD9', 'P-MD9', 'CH-MD0009', 'e4000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 1::smallint, 'tipper', 'owned', null,null,null,null,null,null,null,null,
    '[{"shift":"morning","role":"driver","driver_employee_id":"e40e0000-0000-0000-0000-000000000004"}]'::jsonb) $q$, 'FLEET_DRIVER_ROLE_INVALID');
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('خطأ', 'DB-MD9', 'P-MD9', 'CH-MD0009', 'e4000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 1::smallint, 'tipper', 'owned', null,null,null,null,null,null,null,null,
    '[{"shift":"afternoon","role":"primary","driver_employee_id":"e40e0000-0000-0000-0000-000000000004"}]'::jsonb) $q$, 'GARAGE_SHIFT_INVALID');
  -- السائق الأساسي الصباحي مشغول بآلية أخرى في الشفت نفسه ⇒ الإضافة كلها تفشل
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('خطأ', 'DB-MD9', 'P-MD9', 'CH-MD0009', 'e4000000-0000-0000-0000-000000000001/x.jpg', 'morning', null, 1::smallint, 'tipper', 'owned', null,null,null,null,null,null,null,null,
    '[{"shift":"morning","role":"primary","driver_employee_id":"e40e0000-0000-0000-0000-000000000004"},{"shift":"morning","role":"backup","driver_employee_id":"e40e0000-0000-0000-0000-000000000001"}]'::jsonb) $q$, 'FLEET_DRIVER_ALREADY_ASSIGNED');
  assert not exists (select 1 from public.garage_vehicles where db_number = 'DB-MD9'), 'A6: الفشل يلغي الآلية كلها';
  -- المسار القديم (سائق واحد) ما زال يعمل بلا p_drivers
  v := public.garage_add_vehicle('كابسة سائق واحد', 'DB-MD2', 'P-MD2', 'CH-MD0002', 'e4000000-0000-0000-0000-000000000001/md2.jpg', 'morning', 'e40e0000-0000-0000-0000-000000000004', 1::smallint, 'tipper', 'owned');
  select count(*) into n from public.garage_vehicle_shift_assignments where vehicle_id = v.id and ends_at is null and driver_role = 'primary'; assert n = 1, 'A7: المسار القديم';
  raise notice 'A ✓ الإضافة بسائقين متعددين';
end $$;

-- ═══ B) الإسناد لاحقاً: احتياطي على شفت، إنهاؤه، ومنع إزالة الأساسي؛ سائق المتعهد كأساسي ═══
do $$
declare v uuid := (select id from public.garage_vehicles where db_number = 'DB-MD2'); x uuid := (select id from public.station_external_drivers where license_no = 'L-MD1'); a public.garage_vehicle_shift_assignments; n int; g public.garage_vehicles;
begin
  perform pg_temp.as_user('e4000000-0000-0000-0000-000000000001');
  -- احتياطي بلا أساسي في المسائي مرفوض
  perform pg_temp.expect_error(format($q$ select public.garage_set_vehicle_shift_assignment('%s', 'evening', 'e40e0000-0000-0000-0000-000000000002', 1::smallint, 'سبب كافٍ', 'backup') $q$, v), 'FLEET_BACKUP_NEEDS_PRIMARY');
  -- الشخص نفسه أساسياً واحتياطياً مرفوض
  perform pg_temp.expect_error(format($q$ select public.garage_set_vehicle_shift_assignment('%s', 'morning', 'e40e0000-0000-0000-0000-000000000004', 1::smallint, 'سبب كافٍ', 'backup') $q$, v), 'FLEET_DRIVER_DUPLICATE_IN_SHIFT');
  -- سائق متعهد مشغول احتياطياً بالآلية الأولى في الصباحي ⇒ مرفوض هنا
  perform pg_temp.expect_error(format($q$ select public.garage_set_vehicle_shift_assignment('%s', 'morning', null, 1::smallint, 'سبب كافٍ', 'backup', '%s') $q$, v, x), 'FLEET_DRIVER_ALREADY_ASSIGNED');
  a := public.garage_set_vehicle_shift_assignment(v, 'morning', 'e40e0000-0000-0000-0000-000000000002', 1::smallint, 'احتياطي صباحي', 'backup');
  assert a.driver_role = 'backup', 'B1: احتياطي';
  select * into g from public.garage_vehicles where id = v; assert g.driver_employee_id = 'e40e0000-0000-0000-0000-000000000004', 'B2: الاحتياطي لا يغيّر سائق الآلية';
  select count(*) into n from public.garage_vehicle_shift_assignments where vehicle_id = v and shift = 'morning' and ends_at is null; assert n = 2, 'B3: أساسي + احتياطي';
  -- استبدال الاحتياطي يغلق الاحتياطي فقط
  perform public.garage_set_vehicle_shift_assignment(v, 'morning', 'e40e0000-0000-0000-0000-000000000003', 1::smallint, 'تبديل الاحتياطي', 'backup');
  select count(*) into n from public.garage_vehicle_shift_assignments where vehicle_id = v and shift = 'morning' and ends_at is null and driver_role = 'primary' and driver_employee_id = 'e40e0000-0000-0000-0000-000000000004'; assert n = 1, 'B4: الأساسي بقي';
  -- إنهاء الاحتياطي؛ الأساسي لا يُزال
  select * into a from public.garage_vehicle_shift_assignments where vehicle_id = v and shift = 'morning' and ends_at is null and driver_role = 'backup';
  perform public.garage_end_vehicle_shift_assignment(a.id, 'لم يعد مطلوباً');
  select count(*) into n from public.garage_vehicle_shift_assignments where vehicle_id = v and ends_at is null; assert n = 1, 'B5: الاحتياطي أُنهي';
  select * into a from public.garage_vehicle_shift_assignments where vehicle_id = v and ends_at is null;
  perform pg_temp.expect_error(format($q$ select public.garage_end_vehicle_shift_assignment('%s', 'سبب كافٍ') $q$, a.id), 'FLEET_PRIMARY_CANNOT_BE_REMOVED');
  -- سائق متعهد كأساسي في المسائي ⇒ إسناد بهويته
  a := public.garage_set_vehicle_shift_assignment(v, 'evening', null, 1::smallint, 'سائق متعهد مسائي', 'primary', x);
  assert a.driver_external_id = x and a.driver_employee_id is null and a.driver_name = 'سائق متعهد احتياطي', 'B6: إسناد متعهد';
  perform pg_temp.expect_error(format($q$ select public.garage_set_vehicle_shift_assignment('%s', 'evening', 'e40e0000-0000-0000-0000-000000000002', 1::smallint, 'سبب كافٍ', 'primary', '%s') $q$, v, x), 'FLEET_DRIVER_ONE_ONLY');
  -- ⑤ الإسناد الرئيسي بسائق متعهد ينقل الهوية إلى إسناد الشفت (إصلاح 00375)
  perform public.garage_assign_driver(v, null, 'evening', 1::smallint, 'إسناد متعهد كرئيسي', x);
  select * into g from public.garage_vehicles where id = v; assert g.driver_external_id = x and g.driver_employee_id is null and g.shift = 'evening', 'B7a: سائق الآلية = المتعهد';
  select count(*) into n from public.garage_vehicle_shift_assignments where vehicle_id = v and shift = 'evening' and ends_at is null and driver_role = 'primary' and driver_external_id = x; assert n = 1, 'B7: مزامنة driver_external_id';
  -- المتعهد مشغول احتياطياً بالآلية الأولى صباحاً ⇒ لا يصير أساسياً بآلية ثانية صباحاً
  perform pg_temp.expect_error(format($q$ select public.garage_assign_driver('%s', null, 'morning', 1::smallint, 'سبب كافٍ', '%s') $q$, v, x), 'FLEET_DRIVER_ALREADY_ASSIGNED');
  raise notice 'B ✓ الإسناد اللاحق';
end $$;

-- ═══ C) الانطلاق بالأساسي أو الاحتياطي، وحراسة سائق المتعهد في الميدان ═══
do $$
declare v1 uuid := (select id from public.garage_vehicles where db_number = 'DB-MD1'); v2 uuid := (select id from public.garage_vehicles where db_number = 'DB-MD2');
        x uuid := (select id from public.station_external_drivers where license_no = 'L-MD1'); d public.garage_departures;
begin
  perform pg_temp.as_user('e4000000-0000-0000-0000-000000000005');
  perform pg_temp.expect_error(format($q$ select public.garage_record_shift_departure('%s', 'morning', null, null, 'driver') $q$, v1), 'FLEET_DRIVER_ROLE_INVALID');
  perform pg_temp.expect_error(format($q$ select public.garage_record_shift_departure('%s', 'evening', null, null, 'backup') $q$, v1), 'GARAGE_BACKUP_DRIVER_NOT_FOUND');
  -- الآلية الأولى تنطلق بالاحتياطي (سائق المتعهد)
  d := public.garage_record_shift_departure(v1, 'morning', null, null, 'backup');
  assert d.driver_role = 'backup' and d.driver_external_id = x and d.driver_employee_id is null and d.driver_name = 'سائق متعهد احتياطي', 'C1: انطلاقة بالاحتياطي بهوية المتعهد';
  -- الآلية الثانية أساسيّها المسائي هو سائق المتعهد نفسه (B7) ⇒ في الميدان
  perform pg_temp.expect_error(format($q$ select public.garage_record_shift_departure('%s', 'evening') $q$, v2), 'GARAGE_DRIVER_IN_FIELD');
  -- العودة ثم انطلاقة بالأساسي
  update public.garage_departures set returned_at = now(), returned_by = 'e4000000-0000-0000-0000-000000000005' where id = d.id; -- إغلاق مباشر للاختبار
  d := public.garage_record_shift_departure(v1, 'morning');
  assert d.driver_role = 'primary' and d.driver_employee_id = 'e40e0000-0000-0000-0000-000000000001', 'C2: انطلاقة بالأساسي';
  raise notice 'C ✓ الانطلاق';
end $$;
