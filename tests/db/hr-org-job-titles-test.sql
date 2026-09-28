-- اختبار وظيفي لـ 00153: المسميات الوظيفية من الهيكل التنظيمي (لا نص حر) · الاشتقاق · القيادة · الاستيراد · قائمة سائقي غرفة العمليات
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('a153a000-0000-0000-0000-00000000000a', 'hr153@t.iq'), ('a153a000-0000-0000-0000-00000000000e', 'ops153@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('a153a000-0000-0000-0000-00000000000a', 'hr_officer'), ('a153a000-0000-0000-0000-00000000000e', 'ops_room')
on conflict do nothing;

create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

select auth.set_test_user('a153a000-0000-0000-0000-00000000000a');

-- ── ① بناء الهيكل: قسم أب → مسميات؛ القواعد ───────────────────────
do $$
declare fleet uuid; admin uuid; t_driver uuid; t_mech uuid; t_mgr uuid; ov record;
begin
  fleet := public.hr_department_save(null, 'قسم الآليات', 'J-FLEET', null);
  admin := public.hr_department_save(null, 'قسم الإدارة', 'J-ADMIN', null);
  -- مسمى بلا أب مرفوض
  perform pg_temp.expect_error(format('select public.hr_department_save(null, %L, %L, null, true, null, true, true)', 'سائق', 'J-X1'), 'HR_JOB_TITLE_PARENT_REQUIRED');
  t_driver := public.hr_department_save(null, 'سائق كابسة', 'J-T-DRV', fleet, true, null, true, true);
  t_mech := public.hr_department_save(null, 'ميكانيكي', 'J-T-MECH', fleet, true, null, true, false);
  t_mgr := public.hr_department_save(null, 'مسؤول قسم', 'J-T-MGR', admin, true, null, true, false);
  -- اسم مكرر داخل القسم نفسه مرفوض، ومسموح في قسم آخر
  perform pg_temp.expect_error(format('select public.hr_department_save(null, %L, %L, %L, true, null, true, false)', 'سائق كابسة', 'J-X2', fleet), 'HR_JOB_TITLE_NAME_TAKEN');
  perform public.hr_department_save(null, 'سائق كابسة', 'J-T-DRV2', admin, true, null, true, true);
  -- المسمى لا يكون أباً
  perform pg_temp.expect_error(format('select public.hr_department_save(null, %L, %L, %L)', 'فرع تحت مسمى', 'J-X3', t_driver), 'HR_DEPT_PARENT_IS_JOB_TITLE');
  -- «يقود آليات» بلا «مسمى» يُهمل (قيد الجدول)
  t_mgr := public.hr_department_save(null, 'قسم عادي', 'J-PLAIN', null, true, null, false, true);
  assert (select drives_vehicles from public.departments where id = t_mgr) = false, '① drives بلا title = false';
  t_mgr := (select id from public.departments where code = 'J-T-MGR');
  -- العرض يحمل الأعلام
  select * into ov from public.hr_departments_overview() o where o.id = t_driver;
  assert ov.is_job_title and ov.drives_vehicles, '① overview flags';
  assert (select count(*) from public.hr_job_titles()) = 4, format('① 4 مسميات (فعلي %s)', (select count(*) from public.hr_job_titles()));
  perform set_config('t.fleet', fleet::text, false); perform set_config('t.admin', admin::text, false);
  perform set_config('t.drv', t_driver::text, false); perform set_config('t.mech', t_mech::text, false); perform set_config('t.mgr', t_mgr::text, false);
  raise notice '① ok';
end $$;

-- ── ② الموظف: لا نص حر؛ الاشتقاق (المسمى/القسم/القيادة)؛ الانتشار عند التعديل ─────
do $$
declare e1 uuid; e2 uuid; e public.employees; drv uuid := current_setting('t.drv')::uuid; mech uuid := current_setting('t.mech')::uuid; fleet uuid := current_setting('t.fleet')::uuid;
begin
  perform pg_temp.expect_error($q$select public.hr_employee_create('{"employee_number":"J-1","full_name":"علي","job_title":"سائق"}'::jsonb)$q$, 'HR_JOB_TITLE_FREE_TEXT_FORBIDDEN');
  perform pg_temp.expect_error(format($q$select public.hr_employee_create('{"employee_number":"J-1","full_name":"علي","job_title_id":"%s"}'::jsonb)$q$, fleet), 'HR_JOB_TITLE_INVALID');
  e1 := public.hr_employee_create(jsonb_build_object('employee_number', 'J-1', 'full_name', 'علي السائق', 'job_title_id', drv));
  select * into e from public.employees where id = e1;
  assert e.job_title = 'سائق كابسة' and e.department_id = fleet and e.is_driver, '② الاشتقاق عند الإنشاء';
  -- تعديل نص المسمى مرفوض، والقسم لا يُعدَّل مباشرة ما دام مشتقاً
  perform pg_temp.expect_error(format($q$select public.hr_employee_update(%L, '{"job_title":"x"}'::jsonb)$q$, e1), 'HR_JOB_TITLE_FREE_TEXT_FORBIDDEN');
  perform public.hr_employee_update(e1, jsonb_build_object('department_id', current_setting('t.admin')));
  assert (select department_id from public.employees where id = e1) = fleet, '② القسم يبقى أب المسمى';
  -- الكتابة المباشرة في العمود النصي تُلغى بالـ trigger
  update public.employees set job_title = 'نص حر', is_driver = false where id = e1;
  select * into e from public.employees where id = e1;
  assert e.job_title = 'سائق كابسة' and e.is_driver, '② trigger يعيد الاشتقاق';
  -- نقل الموظف إلى ميكانيكي: يفقد صفة السائق
  perform public.hr_employee_update(e1, jsonb_build_object('job_title_id', mech));
  select * into e from public.employees where id = e1;
  assert e.job_title = 'ميكانيكي' and not e.is_driver, '② نقل المسمى يحدّث القيادة';
  perform public.hr_employee_update(e1, jsonb_build_object('job_title_id', drv));
  -- موظف بلا مسمى: نصه فارغ وليس سائقاً، وقسمه يُعدَّل مباشرة
  e2 := public.hr_employee_create(jsonb_build_object('employee_number', 'J-2', 'full_name', 'بلا مسمى', 'department_id', fleet));
  select * into e from public.employees where id = e2;
  assert e.job_title is null and not e.is_driver and e.job_title_id is null, '② بلا مسمى';
  perform public.hr_employee_update(e2, jsonb_build_object('department_id', current_setting('t.admin')));
  assert (select department_id from public.employees where id = e2) = current_setting('t.admin')::uuid, '② القسم المباشر لمن بلا مسمى';
  -- إعادة تسمية المسمى وتبديل خانة القيادة تنتشر
  perform public.hr_department_save(drv, 'سائق كابسة كبيرة', 'J-T-DRV', fleet, true, null, true, false);
  select * into e from public.employees where id = e1;
  assert e.job_title = 'سائق كابسة كبيرة' and not e.is_driver, '② الانتشار من الهيكل';
  perform public.hr_department_save(drv, 'سائق كابسة', 'J-T-DRV', fleet, true, null, true, true);
  assert (select is_driver from public.employees where id = e1), '② عودة القيادة';
  -- تحويل مسمى عليه موظفون إلى قسم مرفوض؛ تعطيله مرفوض
  perform pg_temp.expect_error(format('select public.hr_department_save(%L, %L, %L, %L, true, null, false, false)', drv, 'سائق كابسة', 'J-T-DRV', fleet), 'HR_JOB_TITLE_IN_USE');
  perform pg_temp.expect_error(format('select public.hr_department_save(%L, %L, %L, %L, false, null, true, true)', drv, 'سائق كابسة', 'J-T-DRV', fleet), 'HR_DEPT_HAS_EMPLOYEES');
  -- قائمة الموظفين تحمل المعرّف والعلم
  assert (select l.is_driver from public.hr_employees_list() l where l.id = e1), '② القائمة is_driver';
  assert (select count(*) from public.hr_employees_list(null, drv) l) = 1, '② الفلترة بالمسمى';
  perform set_config('t.e1', e1::text, false);
  raise notice '② ok';
end $$;

-- ── ③ الاستيراد: المسمى بالاسم؛ غير المطابق = استيراد بلا مسمى + تحذير ─────
do $$
declare r jsonb; row1 jsonb; row2 jsonb;
begin
  r := public.hr_employees_import(jsonb_build_array(
    jsonb_build_object('employee_number', 'J-10', 'full_name', 'مستورد سائق', 'department', 'قسم الآليات', 'job_title', 'سائق كابسة'),
    jsonb_build_object('employee_number', 'J-11', 'full_name', 'مستورد غامض', 'job_title', 'قائد مركبة')
  ), false);
  assert (r ->> 'ok')::int = 2 and (r ->> 'failed')::int = 0 and (r ->> 'warned')::int = 1, format('③ ok=2 warned=1 (%s)', r - 'rows');
  row1 := r -> 'rows' -> 0; row2 := r -> 'rows' -> 1;
  assert (row1 ->> 'job_title_id') = current_setting('t.drv'), '③ مطابقة المسمى بالاسم داخل القسم';
  assert (select is_driver from public.employees where employee_number = 'J-10'), '③ المستورد سائق';
  assert row2 -> 'warnings' ? 'HR_IMPORT_JOB_TITLE_UNKNOWN' and (row2 ->> 'job_title_id') is null, '③ تحذير المسمى المجهول';
  assert (select job_title is null from public.employees where employee_number = 'J-11'), '③ استورد بلا مسمى';
  raise notice '③ ok';
end $$;

-- ── ④ غرفة العمليات: قائمة السائقين = مسميات القيادة فقط ─────
select auth.set_test_user('a153a000-0000-0000-0000-00000000000e');
do $$
begin
  assert exists (select 1 from public.fleet_driver_options() where employee_number = 'J-1'), '④ سائق كابسة يظهر';
  assert exists (select 1 from public.fleet_driver_options() where employee_number = 'J-10'), '④ المستورد يظهر';
  assert not exists (select 1 from public.fleet_driver_options('بلا مسمى') where employee_number = 'J-2'), '④ بلا مسمى لا يظهر حتى بالبحث';
  assert not exists (select 1 from public.fleet_driver_options('J-11') where employee_number = 'J-11'), '④ المسمى المجهول لا يظهر';
  perform pg_temp.expect_error(format('select app.require_fleet_driver(%L)', (select id from public.employees where employee_number = 'J-2')), 'FLEET_DRIVER_NOT_DRIVER_TITLE');
  raise notice '④ ok';
end $$;
select auth.set_test_user(null);
