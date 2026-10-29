-- اختبار 00320: شفتات الموارد البشرية في كل المنصة (الجزء الأول). مستقل (بادئة e3).
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('e3000000-0000-0000-0000-000000000001', 'ops-sh@t.iq'), ('e3000000-0000-0000-0000-000000000002', 'hr-sh@t.iq'),
  ('e3000000-0000-0000-0000-000000000003', 'mgr-sh@t.iq'), ('e3000000-0000-0000-0000-000000000004', 'st-sh@t.iq'), ('e3000000-0000-0000-0000-000000000005', 'gar-sh@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e3000000-0000-0000-0000-000000000005', 'central_garage_officer') on conflict do nothing;
insert into public.garage_user_profiles (user_id, parent_sector) values ('e3000000-0000-0000-0000-000000000005', (select parent_sector from public.sectors where id = 1)) on conflict (user_id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e3000000-0000-0000-0000-000000000001', 'ops_room'), ('e3000000-0000-0000-0000-000000000002', 'hr_officer'),
  ('e3000000-0000-0000-0000-000000000003', 'department_manager'), ('e3000000-0000-0000-0000-000000000004', 'transfer_station') on conflict do nothing;
insert into public.departments (id, name, code) values ('e30d0000-0000-0000-0000-0000000000a1', 'قسم الشفتات', 'SHD') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values ('e30d0000-0000-0000-0000-0000000000a2', 'سائق شفتات', 'SHT1', 'e30d0000-0000-0000-0000-0000000000a1', true, true) on conflict do nothing;
insert into public.employees (id, employee_number, full_name, hire_date, phone, job_title_id) values
  ('e30e0000-0000-0000-0000-000000000001', 'SH-DRV-1', 'سائق الشفت الجديد', '2024-01-01', '07700000011', 'e30d0000-0000-0000-0000-0000000000a2'),
  ('e30e0000-0000-0000-0000-000000000002', 'SH-DRV-2', 'سائق الشفت الثاني', '2024-01-01', '07700000012', 'e30d0000-0000-0000-0000-0000000000a2') on conflict (id) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ A) الرموز: الشفتات الثلاث القديمة مربوطة؛ شفت جديد يحصل على رمز تلقائي ثابت ═══
do $$
declare n int; s public.hr_shifts; o record;
begin
  select count(*) into n from public.hr_shifts where code in ('morning','evening','night');
  assert n = 3, 'A1: الرموز الثلاثة موجودة';
  assert app.shift_label('morning') = 'صباحي' and app.shift_label('zzz') = 'zzz', 'A2: التسمية';
  -- HR تضيف شفتاً جديداً من صفحة الشفتات (إدراج مباشر كما في الواجهة)
  perform pg_temp.as_user('e3000000-0000-0000-0000-000000000002');
  set role authenticated;
  insert into public.hr_shifts (name, start_time, end_time, grace_minutes) values ('وجبة ثانية', '12:00', '20:00', 15) returning * into s;
  reset role;
  assert s.code like 'shift_%' and length(s.code) = 14, 'A3: رمز تلقائي: ' || s.code;
  perform pg_temp.expect_error(format($q$ update public.hr_shifts set code = 'x_%s' where id = '%s' $q$, s.code, s.id), 'HR_SHIFT_CODE_IMMUTABLE');
  -- القائمة تظهر فوراً لأي مستخدم مسجَّل (غرفة العمليات، المحطة) بالترتيب
  perform pg_temp.as_user('e3000000-0000-0000-0000-000000000004');
  select count(*) into n from public.shift_options() where code = s.code and name = 'وجبة ثانية';
  assert n = 1, 'A4: الشفت الجديد في القائمة';
  select code into o from public.shift_options() limit 1; assert o.code = 'morning', 'A5: الترتيب يبدأ بالصباحي';
  select set_config('auth.user_id','', false) into o;
  select count(*) into n from public.shift_options(); assert n = 0, 'A6: بلا جلسة لا قائمة';
  raise notice 'A ✓ الرموز والقائمة';
end $$;

-- ═══ B) الكراج: آلية وإسناد وانطلاقة على الشفت الجديد؛ رمز غير موجود مرفوض ═══
do $$
declare c text := (select code from public.hr_shifts where name = 'وجبة ثانية'); v public.garage_vehicles; a public.garage_driver_assignments; n int; d public.garage_departures; res jsonb;
begin
  perform pg_temp.as_user('e3000000-0000-0000-0000-000000000001');
  v := public.garage_add_vehicle('كابسة الشفت الجديد', 'DB-SH1', 'P-SH1', 'CH-SH0001', 'e3000000-0000-0000-0000-000000000001/a.jpg', c, 'e30e0000-0000-0000-0000-000000000001', 1::smallint, 'tipper', 'owned');
  assert v.shift = c, 'B1: آلية على الشفت الجديد';
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('كابسة خطأ', 'DB-SH2', 'P-SH2', 'CH-SH0002', 'e3000000-0000-0000-0000-000000000001/b.jpg', 'afternoon', 'e30e0000-0000-0000-0000-000000000001', 1::smallint, 'tipper', 'owned') $q$, 'GARAGE_SHIFT_INVALID');
  a := public.garage_assign_driver(v.id, 'e30e0000-0000-0000-0000-000000000002', c, 1::smallint, 'تبديل سائق للاختبار');
  assert a.shift = c, 'B2: إسناد على الشفت الجديد';
  perform pg_temp.expect_error(format($q$ select public.garage_assign_driver('%s', 'e30e0000-0000-0000-0000-000000000002', 'afternoon', 1::smallint, 'سبب كافٍ') $q$, v.id), 'GARAGE_ASSIGNMENT_INVALID');
  perform public.garage_set_vehicle_shift_assignment(v.id, 'morning', 'e30e0000-0000-0000-0000-000000000001', 1::smallint, 'شفت صباحي إضافي');
  select count(*) into n from public.garage_vehicle_shift_assignments where vehicle_id = v.id and ends_at is null; assert n = 2, 'B3: إسناد شفتين (جديد + صباحي)';
  perform pg_temp.expect_error(format($q$ select public.garage_set_vehicle_shift_assignment('%s', 'afternoon', 'e30e0000-0000-0000-0000-000000000001', 1::smallint, 'سبب كافٍ') $q$, v.id), 'GARAGE_SHIFT_ASSIGNMENT_INVALID');
  -- مسؤول قسم على الشفت الجديد (يلزم للانطلاقة التلقائية)
  insert into public.manager_profiles (user_id, shift, sectors) values ('e3000000-0000-0000-0000-000000000003', c, '{1}') on conflict (user_id) do update set shift = excluded.shift, sectors = excluded.sectors;
  perform pg_temp.as_user('e3000000-0000-0000-0000-000000000005');
  d := public.garage_record_shift_departure(v.id, c, null);
  assert d.recipient_manager_id = 'e3000000-0000-0000-0000-000000000003', 'B4b: مسؤول القسم على الشفت الجديد';
  assert d.shift = c, 'B4: انطلاقة على الشفت الجديد';
  perform pg_temp.expect_error(format($q$ select public.garage_record_shift_departure('%s', 'afternoon') $q$, v.id), 'GARAGE_SHIFT_INVALID');
  perform pg_temp.as_user('e3000000-0000-0000-0000-000000000001');
  select count(*) into n from public.garage_search_vehicles(null, null, c, 50, 0, false) where db_number = 'DB-SH1'; assert n = 1, 'B5: البحث بالشفت الجديد';
  perform pg_temp.expect_error($q$ select count(*) from public.garage_search_vehicles(null, null, 'afternoon', 50, 0, false) $q$, 'GARAGE_SHIFT_INVALID');
  -- القيد على مستوى الجدول (أي كتابة مباشرة)
  perform pg_temp.expect_error(format($q$ update public.garage_vehicles set shift = 'afternoon' where id = '%s' $q$, v.id), 'SHIFT_INVALID');
  -- استيراد Excel: اسم الشفت الجديد كما كتبته HR، أو مرادف قديم
  res := public.fleet_vehicles_import($j$[
    {"db_number":"SH-IMP-1","vehicle_name":"قلاب استيراد","vehicle_category":"قلاب","plate_number":"P-I1","chassis_number":"CH-IMP-0001","area":"1","shift":"وجبة ثانية"},
    {"db_number":"SH-IMP-2","vehicle_name":"قلاب استيراد 2","vehicle_category":"قلاب","plate_number":"P-I2","chassis_number":"CH-IMP-0002","area":"1","shift":"الصباحي"},
    {"db_number":"SH-IMP-3","vehicle_name":"قلاب استيراد 3","vehicle_category":"قلاب","plate_number":"P-I3","chassis_number":"CH-IMP-0003","area":"1","shift":"وجبة غير موجودة"}
  ]$j$::jsonb, false, true);
  assert (select shift from public.garage_vehicles where db_number = 'SH-IMP-1') = c, 'B6: استيراد باسم الشفت الجديد: ' || (res -> 'rows' -> 0)::text;
  assert (select shift from public.garage_vehicles where db_number = 'SH-IMP-2') = 'morning', 'B7: مرادف الصباحي';
  assert (res -> 'rows' -> 2 -> 'errors') ? 'FLEET_IMPORT_SHIFT_INVALID', 'B8: شفت مجهول مرفوض';
  raise notice 'B ✓ الكراج والاستيراد';
end $$;

-- ═══ C) مسؤولو الأقسام والمتعهدون: الشفت الجديد مقبول، والمجهول مرفوض؛ ومنع حذف شفت مستخدم ═══
do $$
declare c text := (select code from public.hr_shifts where name = 'وجبة ثانية'); n int; sh text;
begin
  perform pg_temp.as_user('e3000000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error($q$ update public.manager_profiles set shift = 'afternoon' where user_id = 'e3000000-0000-0000-0000-000000000003' $q$, 'SHIFT_INVALID');
  -- الشفت الموقوف يبقى صالحاً للبيانات القائمة
  update public.hr_shifts set is_active = false where code = c;
  select count(*) into n from public.shift_options() where code = c; assert n = 0, 'C1: الموقوف لا يظهر في القائمة';
  select count(*) into n from public.shift_options(true) where code = c; assert n = 1, 'C1b: يظهر مع الموقوفة';
  perform pg_temp.expect_error($q$ select public.garage_add_vehicle('كابسة موقوف', 'DB-SH3', 'P-SH3', 'CH-SH0003', 'e3000000-0000-0000-0000-000000000001/c.jpg', (select code from public.hr_shifts where name = 'وجبة ثانية'), 'e30e0000-0000-0000-0000-000000000001', 1::smallint, 'tipper', 'owned') $q$, 'GARAGE_SHIFT_INVALID');
  update public.hr_shifts set is_active = true where code = c;
  -- حذف شفت مستخدم ممنوع (آليات/مسؤول قسم عليه)
  perform pg_temp.expect_error(format($q$ delete from public.hr_shifts where code = '%s' $q$, c), 'HR_SHIFT_IN_USE');
  perform pg_temp.expect_error($q$ delete from public.hr_shifts where code = 'morning' $q$, 'HR_SHIFT_IN_USE');
  -- شفت غير مستخدم يُحذف
  insert into public.hr_shifts (name, start_time, end_time) values ('شفت مؤقت', '01:00', '05:00') returning code into sh;
  delete from public.hr_shifts where code = sh;
  select count(*) into n from public.hr_shifts where code = sh; assert n = 0, 'C2: حذف غير المستخدم';
  raise notice 'C ✓ مسؤولو الأقسام والحذف';
end $$;
