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

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ G1 · لا يُسند السائق نفسه إلى آليتين في الشفت نفسه (كل مسارات الإسناد)، ويجوز في شفت مختلف وبعد فكّ الإسناد ═══
do $$
declare ops uuid := 'd6d00000-0000-0000-0000-000000000005'; v1 uuid := 'd6d0a000-0000-0000-0000-000000000001'; v2 uuid := 'd6d0a000-0000-0000-0000-000000000002';
        d1 uuid := 'd6d00000-0000-0000-0000-0000000000d1'; d2 uuid := 'd6d00000-0000-0000-0000-0000000000d2'; d4 uuid := 'd6d00000-0000-0000-0000-0000000000d4'; a public.garage_vehicle_shift_assignments;
begin
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format('select public.garage_set_vehicle_shift_assignment(%L::uuid,%L,%L::uuid,3::smallint,%L)', v2, 'morning', d1, 'تجربة ازدواج'), 'FLEET_DRIVER_ALREADY_ASSIGNED');
  perform pg_temp.expect_error(format('select public.garage_assign_driver(%L::uuid,%L::uuid,%L,3::smallint,%L)', v2, d1, 'morning', 'تجربة ازدواج'), 'FLEET_DRIVER_ALREADY_ASSIGNED');
  perform pg_temp.expect_error(format('select public.garage_add_vehicle(%L,%L,%L,%L,%L,%L,%L::uuid,3::smallint)', 'كابسة مكررة', 'DB-DG9', 'P-DG9', 'CH-DG0009', ops::text || '/dg9.jpg', 'morning', d1), 'FLEET_DRIVER_ALREADY_ASSIGNED');
  assert not exists (select 1 from public.garage_vehicles where db_number = 'DB-DG9'), 'G1: فشل الإضافة يلغي الآلية كلها';
  -- الشفت المختلف مسموح
  a := public.garage_set_vehicle_shift_assignment(v2, 'evening', d1, 3::smallint, 'شفت ثانٍ');
  assert a.driver_employee_id = d1 and a.shift = 'evening', 'G1: الإسناد في شفت آخر مسموح';
  -- إعادة إسناد الآلية نفسها لا تتعارض مع نفسها
  a := public.garage_set_vehicle_shift_assignment(v1, 'morning', d1, 3::smallint, 'إعادة الإسناد ذاته');
  assert a.driver_employee_id = d1, 'G1: إعادة إسناد السائق نفسه على آليته لا تُرفض';
  -- تبديل متبادل: لا يجوز قبل فكّ أحدهما، ويجوز بعد المرور بسائق احتياط حر
  perform pg_temp.expect_error(format('select public.garage_set_vehicle_shift_assignment(%L::uuid,%L,%L::uuid,3::smallint,%L)', v1, 'morning', d2, 'ازدواج معكوس'), 'FLEET_DRIVER_ALREADY_ASSIGNED');
  a := public.garage_set_vehicle_shift_assignment(v1, 'morning', d4, 3::smallint, 'احتياط مؤقت');
  assert a.driver_employee_id = d4, 'G1: السائق الاحتياطي الحر يُسند';
  a := public.garage_set_vehicle_shift_assignment(v2, 'morning', d1, 3::smallint, 'نقل الأول إلى v2');
  assert a.driver_employee_id = d1, 'G1: السائق الأول صار على v2 بعد فكّه من v1';
  perform pg_temp.expect_error(format('select public.garage_set_vehicle_shift_assignment(%L::uuid,%L,%L::uuid,3::smallint,%L)', v1, 'morning', d1, 'ازدواج'), 'FLEET_DRIVER_ALREADY_ASSIGNED');
  -- إرجاع الحالة الأصلية
  a := public.garage_set_vehicle_shift_assignment(v2, 'morning', d2, 3::smallint, 'إرجاع');
  a := public.garage_set_vehicle_shift_assignment(v1, 'morning', d1, 3::smallint, 'إرجاع');
end $$;

-- ═══ G2 · سائق في الميدان بآلية لا ينطلق بآلية ثانية (إسناد قديم ازدواجي)، ويُمنع تحويله إليها من غرفة العمليات ═══
do $$
declare garage uuid := 'd6d00000-0000-0000-0000-000000000001'; ops uuid := 'd6d00000-0000-0000-0000-000000000005';
        v1 uuid := 'd6d0a000-0000-0000-0000-000000000001'; v2 uuid := 'd6d0a000-0000-0000-0000-000000000002'; v3 uuid := 'd6d0a000-0000-0000-0000-000000000003';
        d1 uuid := 'd6d00000-0000-0000-0000-0000000000d1'; d3 uuid := 'd6d00000-0000-0000-0000-0000000000d3'; d4 uuid := 'd6d00000-0000-0000-0000-0000000000d4'; dep public.garage_departures; dep3 public.garage_departures;
begin
  -- بيانات تاريخية: إسناد ازدواجي موجود قبل الحارس (إدخال مباشر مع تعطيل التحقق لمحاكاة القديم)
  alter table public.garage_vehicle_shift_assignments disable trigger trg_guard_driver_shift_assignment;
  update public.garage_vehicle_shift_assignments set ends_at = now() where vehicle_id = v2 and shift = 'morning' and ends_at is null;
  insert into public.garage_vehicle_shift_assignments (vehicle_id, shift, driver_name, driver_employee_id, sector_id, change_reason, created_by)
  values (v2, 'morning', 'سائق الحراسة الأول', d1, 3, 'قديم', ops);
  alter table public.garage_vehicle_shift_assignments enable trigger trg_guard_driver_shift_assignment;

  perform pg_temp.as_user(garage);
  dep := public.garage_record_shift_departure(v1, 'morning');
  assert dep.driver_employee_id = d1, 'G2: الانطلاقة الأولى بالسائق الأول';
  perform pg_temp.expect_error(format('select public.garage_record_shift_departure(%L::uuid,%L)', v2, 'morning'), 'GARAGE_DRIVER_IN_FIELD');
  assert not exists (select 1 from public.garage_departures where vehicle_id = v2 and returned_at is null), 'G2: لا انطلاقة ثانية للسائق نفسه';
  -- غرفة العمليات لا تستطيع تحويل انطلاقة مفتوحة أخرى إلى سائق هو في الميدان
  dep3 := public.garage_record_shift_departure(v3, 'morning');
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format('select public.ops_set_departure_driver(%L::uuid,%L::uuid,%L)', dep3.id, d1, 'تحويل خاطئ'), 'GARAGE_DRIVER_IN_FIELD');
  -- السائق الثالث في الميدان أيضاً ⇒ لا يُسند إلى v2 أصلاً (الحارس الأول)؛ سائق الاحتياط الحر يُسند وتنطلق
  perform pg_temp.expect_error(format('select public.garage_set_vehicle_shift_assignment(%L::uuid,%L,%L::uuid,3::smallint,%L)', v2, 'morning', d3, 'تصحيح خاطئ'), 'FLEET_DRIVER_ALREADY_ASSIGNED');
  perform public.garage_set_vehicle_shift_assignment(v2, 'morning', d4, 3::smallint, 'تصحيح');
  perform pg_temp.as_user(garage);
  dep3 := public.garage_record_shift_departure(v2, 'morning');
  assert dep3.driver_employee_id = d4, 'G2: بعد تصحيح الإسناد تنطلق v2 بسائق حر';
  update public.garage_departures set returned_at = now(), returned_by = garage where vehicle_id = v3 and returned_at is null;
  update public.garage_departures set returned_at = now(), returned_by = garage where id in (dep.id, dep3.id);
end $$;

-- ═══ G3 · إنهاء الخدمة: تبليغ غرفة العمليات بالآليات المرتبطة، ومنع الانطلاقة بعدها (الكراج + طلبات الإجراءات) ═══
do $$
declare hr uuid := 'd6d00000-0000-0000-0000-000000000007'; ops uuid := 'd6d00000-0000-0000-0000-000000000005'; garage uuid := 'd6d00000-0000-0000-0000-000000000001';
        v1 uuid := 'd6d0a000-0000-0000-0000-000000000001'; d1 uuid := 'd6d00000-0000-0000-0000-0000000000d1'; d2 uuid := 'd6d00000-0000-0000-0000-0000000000d2';
        n int; body_txt text; dep public.garage_departures;
begin
  perform pg_temp.as_user(hr);
  perform public.hr_employee_terminate(d1, 'resignation', current_date, 'استقالة أثناء الاختبار');
  select count(*), max(body) into n, body_txt from public.notifications where user_id = ops and link = '/ops-room/vehicles-database' and title like 'سائق مُنهى الخدمة%';
  assert n = 1, format('G3: تبليغ واحد لغرفة العمليات (فعلي %s)', n);
  assert body_txt like '%DB-DG1%' and body_txt like '%سائق الحراسة الأول%', 'G3: التبليغ يذكر السائق وآليته';
  -- لا تُفَكّ الإسنادات تلقائياً (القرار لغرفة العمليات)
  assert exists (select 1 from public.garage_vehicle_shift_assignments where vehicle_id = v1 and shift = 'morning' and ends_at is null and driver_employee_id = d1), 'G3: الإسناد باقٍ حتى تقرر غرفة العمليات';
  -- الكراج لا يستطيع إطلاق الآلية بالسائق المُنهى
  perform pg_temp.as_user(garage);
  perform pg_temp.expect_error(format('select public.garage_record_shift_departure(%L::uuid,%L)', v1, 'morning'), 'GARAGE_DRIVER_TERMINATED');
  -- غرفة العمليات تعيد الإسناد ⇒ تنطلق
  perform pg_temp.as_user(ops);
  perform public.garage_set_vehicle_shift_assignment(v1, 'morning', d2, 3::smallint, 'بديل عن مُنهى');
  perform pg_temp.as_user(garage);
  dep := public.garage_record_shift_departure(v1, 'morning');
  assert dep.driver_employee_id = d2, 'G3: الانطلاقة بالبديل';
  update public.garage_departures set returned_at = now(), returned_by = garage where id = dep.id;
  -- موظف غير مرتبط بآلية: لا تبليغ
  perform pg_temp.as_user(hr);
  insert into public.employees (id, employee_number, full_name, hire_date, job_title_id) values ('d6d00000-0000-0000-0000-0000000000d8', 'DG-D8', 'سائق بلا آلية', '2024-01-01', 'd6d0d000-0000-0000-0000-000000000002');
  perform public.hr_employee_terminate('d6d00000-0000-0000-0000-0000000000d8', 'resignation', current_date, 'استقالة بلا آلية');
  select count(*) into n from public.notifications where user_id = ops and link = '/ops-room/vehicles-database' and title like 'سائق مُنهى الخدمة%';
  assert n = 1, 'G3: لا تبليغ لموظف غير مرتبط بآلية';
  -- مسار طلبات الإجراءات (termination_execute) يبلّغ أيضاً
  insert into public.termination_requests (id, requester_user_id, requester_role, target_kind, target_employee_id, target_name, target_label, termination_type, last_day, reason, status)
  values ('d6d0e000-0000-0000-0000-000000000001', hr, 'hr_officer', 'employee', d2, 'سائق الحراسة الثاني', 'سائق', 'dismissal', current_date, 'فصل أثناء الاختبار', 'pending');
  perform app.termination_execute('d6d0e000-0000-0000-0000-000000000001');
  select count(*) into n from public.notifications where user_id = ops and link = '/ops-room/vehicles-database' and body like '%DB-DG1%' and body like '%سائق الحراسة الثاني%';
  assert n = 1, format('G3: مسار الإجراءات يبلّغ غرفة العمليات (فعلي %s)', n);
  perform pg_temp.as_user(garage);
  perform pg_temp.expect_error(format('select public.garage_record_shift_departure(%L::uuid,%L)', v1, 'morning'), 'GARAGE_DRIVER_TERMINATED');
end $$;
