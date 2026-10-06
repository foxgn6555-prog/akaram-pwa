-- اختبار 00182: استرداد قاعدة بيانات الآليات من Excel (غرفة العمليات فقط). مستقل (بادئة dc).
set client_min_messages = notice;
insert into auth.users (id, email) values ('dc000000-0000-0000-0000-000000000002', 'ops-f@t.iq'), ('dc000000-0000-0000-0000-000000000003', 'dm-f@t.iq'), ('dc000000-0000-0000-0000-000000000007', 'ops2-f@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('dc000000-0000-0000-0000-000000000002', 'ops_room'), ('dc000000-0000-0000-0000-000000000007', 'ops_room'), ('dc000000-0000-0000-0000-000000000003', 'department_manager') on conflict do nothing;
insert into public.employees (id, employee_number, full_name, hire_date, phone, biometric_pin, is_driver) values
  ('dc000000-0000-0000-0000-0000000000e1', 'DRV-01', 'علي حسين كاظم', '2024-01-01', '0771', 'f1', true),
  ('dc000000-0000-0000-0000-0000000000e2', 'DRV-02', 'حسن عبد الله', '2024-01-01', '0772', 'f2', true)
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare res jsonb; rows jsonb; v record; n int; area4 text := (select name from public.sectors where id = 4);
begin
  -- غير غرفة العمليات ممنوع
  perform pg_temp.as_user('dc000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error($q$ select public.fleet_vehicles_import('[]'::jsonb) $q$, 'OPS_FLEET_MASTER_FORBIDDEN');
  perform pg_temp.expect_error($q$ select * from public.fleet_vehicles_export() $q$, 'OPS_FLEET_MASTER_FORBIDDEN');
  perform pg_temp.as_user('dc000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error($q$ select public.fleet_vehicles_import('{}'::jsonb) $q$, 'FLEET_IMPORT_EMPTY');

  -- محاكاة: 5 صفوف — كامل / بسائق بالاسم / بلا منطقة (خطأ) / بلا لوحة وشاصي وسائق (تحذيرات) / مكرر في الملف
  res := public.fleet_vehicles_import(format($j$[
    {"db_number":"F-100","vehicle_name":"كابسة 100","vehicle_category":"كابسة كبيرة","plate_number":"12345 بغداد","chassis_number":"CH100XYZ","area":"%s","shift":"صباحي","driver":"DRV-01","ownership_type":"آلية ذاتية","model_year":"2019","vehicle_color":"أبيض"},
    {"db_number":"F-101","vehicle_category":"شفل","plate_number":"P101","chassis_number":"CH101XYZ","area":"منطقة 7","shift":"مسائي","driver":"حسن عبد الله","ownership_type":"مؤجرة","lessor_name":"شركة النور","rental_contract_no":"C-7","rental_start_date":"2026-01-01","rental_end_date":"2026-12-31"},
    {"db_number":"F-102","vehicle_name":"قلاب","area":"منطقة غير موجودة","shift":"صباحي"},
    {"db_number":"F-103","vehicle_name":"تنكر ماء","vehicle_category":"تنكر","area":"4","driver":"سائق غير معروف"},
    {"db_number":"f-100","vehicle_name":"مكرر","area":"4"}
  ]$j$, area4)::jsonb, true, true);
  if (res ->> 'dry_run')::boolean is not true or (res ->> 'total')::int <> 5 or (res ->> 'inserted')::int <> 3 or (res ->> 'failed')::int <> 2 then raise exception 'dry run summary wrong: % %', res - 'rows', res -> 'rows'; end if;
  select count(*) into n from public.garage_vehicles where db_number like 'F-1%'; if n <> 0 then raise exception 'dry run must not write'; end if;
  rows := res -> 'rows';
  if not (rows -> 2 -> 'errors') ? 'FLEET_IMPORT_AREA_UNKNOWN' then raise exception 'row3 should fail on area: %', rows -> 2; end if;
  if not (rows -> 4 -> 'errors') ? 'FLEET_IMPORT_DUP_IN_FILE' then raise exception 'row5 dup: %', rows -> 4; end if;
  if not (rows -> 3 -> 'warnings') ? 'FLEET_IMPORT_PLATE_PLACEHOLDER' or not (rows -> 3 -> 'warnings') ? 'FLEET_IMPORT_DRIVER_NOT_LINKED' then raise exception 'row4 warnings: %', rows -> 3; end if;
  if (rows -> 1 ->> 'driver_linked')::boolean is not true or (rows -> 1 ->> 'vehicle_name') <> 'شفل F-101' then raise exception 'row2 wrong: %', rows -> 1; end if;

  -- تنفيذ فعلي
  res := public.fleet_vehicles_import(format($j$[
    {"db_number":"F-100","vehicle_name":"كابسة 100","vehicle_category":"كابسة كبيرة","plate_number":"12345 بغداد","chassis_number":"CH100XYZ","area":"%s","shift":"صباحي","driver":"DRV-01","ownership_type":"آلية ذاتية","model_year":"2019","vehicle_color":"أبيض"},
    {"db_number":"F-101","vehicle_category":"شفل","plate_number":"P101","chassis_number":"CH101XYZ","area":"منطقة 7","shift":"مسائي","driver":"حسن عبد الله","ownership_type":"مؤجرة","lessor_name":"شركة النور","rental_contract_no":"C-7","rental_start_date":"2026-01-01","rental_end_date":"2026-12-31"},
    {"db_number":"F-103","vehicle_name":"تنكر ماء","vehicle_category":"تنكر","area":"4","driver":"سائق غير معروف"}
  ]$j$, area4)::jsonb, false, true);
  if (res ->> 'inserted')::int <> 3 or (res ->> 'failed')::int <> 0 then raise exception 'import summary wrong: %', res - 'rows'; end if;
  select * into v from public.garage_vehicles where db_number = 'F-100';
  if v.vehicle_category <> 'compactor_large' or v.sector_id <> 4 or v.shift <> 'morning' or v.driver_employee_id <> 'dc000000-0000-0000-0000-0000000000e1' or v.driver_name <> 'علي حسين كاظم' or v.model_year <> 2019 or v.image_path <> 'import/no-photo' then raise exception 'F-100 wrong: %', v; end if;
  select count(*) into n from public.garage_driver_assignments a where a.vehicle_id = v.id and a.ends_at is null and a.driver_employee_id = 'dc000000-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'assignment missing'; end if;
  select count(*) into n from public.garage_vehicle_shift_assignments a where a.vehicle_id = v.id and a.ends_at is null; if n <> 1 then raise exception 'shift assignment synced %', n; end if;
  select * into v from public.garage_vehicles where db_number = 'F-101';
  if v.ownership_type <> 'rented' or v.lessor_name <> 'شركة النور' or v.sector_id <> 7 or v.shift <> 'evening' or v.driver_employee_id <> 'dc000000-0000-0000-0000-0000000000e2' then raise exception 'F-101 wrong: %', v; end if;
  select * into v from public.garage_vehicles where db_number = 'F-103';
  if v.plate_number <> 'بلا-لوحة-F-103' or v.chassis_number <> 'بلا-شاصي-F-103' or v.driver_employee_id is not null or v.driver_name <> 'سائق غير معروف' then raise exception 'F-103 wrong: %', v; end if;
  -- إشعار زملاء غرفة العمليات
  select count(*) into n from public.notifications where user_id = 'dc000000-0000-0000-0000-000000000007' and title like 'استرداد قاعدة بيانات الآليات%'; if n <> 1 then raise exception 'ops colleagues should be notified'; end if;

  -- الاسترداد: تحديث الموجود (تغيير السائق والمنطقة) + تجاوز عند تعطيل التحديث
  res := public.fleet_vehicles_import('[{"db_number":"F-103","vehicle_name":"تنكر ماء 2","area":"7","shift":"ليلي","driver":"f1","vehicle_category":"تنكر"}]'::jsonb, false, false);
  if (res ->> 'skipped')::int <> 1 or (res ->> 'updated')::int <> 0 then raise exception 'skip mode wrong: %', res - 'rows'; end if;
  res := public.fleet_vehicles_import('[{"db_number":"F-103","vehicle_name":"تنكر ماء 2","area":"7","shift":"ليلي","driver":"f1","vehicle_category":"تنكر"}]'::jsonb, false, true);
  if (res ->> 'updated')::int <> 1 then raise exception 'update mode wrong: %', res - 'rows'; end if;
  select * into v from public.garage_vehicles where db_number = 'F-103';
  if v.vehicle_name <> 'تنكر ماء 2' or v.sector_id <> 7 or v.shift <> 'night' or v.driver_employee_id <> 'dc000000-0000-0000-0000-0000000000e1' or v.plate_number <> 'بلا-لوحة-F-103' then raise exception 'F-103 update wrong: %', v; end if;
  select count(*) into n from public.garage_driver_assignments a where a.vehicle_id = v.id and a.ends_at is null; if n <> 1 then raise exception 'one active assignment expected, got %', n; end if;

  -- التصدير يرجع الآليات بالأعمدة النصية
  select count(*) into n from public.fleet_vehicles_export() x where x.db_number like 'F-1%'; if n <> 3 then raise exception 'export count %', n; end if;
  select * into v from public.fleet_vehicles_export() x where x.db_number = 'F-100';
  if v.driver_employee_number <> 'DRV-01' or v.has_photo then raise exception 'export row wrong: %', v; end if;
  raise notice 'F1 ✅ استرداد الآليات: محاكاة، إدراج، تحذيرات، تحديث/تجاوز، إشعار، تصدير';
end $$;
select 'test ok' as result;
