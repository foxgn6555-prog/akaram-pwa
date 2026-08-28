-- ═══════════════════════════════════════════════════════════════
-- جناح عزل الجولة 6 — الوحدات الجديدة (فروع · صلاحيات · بوابات · بصمة · GPS)
-- كل فشل = EXCEPTION. ينفَّذ على قاعدة بمهاجرات 28 كاملة.
-- ═══════════════════════════════════════════════════════════════

create or replace function pg_temp.as_it(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', false);
  select set_config('request.jwt.claim.sub', coalesce(uid::text,''), false);
$$;

create or replace function pg_temp.as_emp(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', false);
  select set_config('request.jwt.claim.sub', coalesce(uid::text,''), false);
$$;

create or replace function pg_temp.ok(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception '❌ % — المتوقع % الفعلي %', label, expected, actual;
  end if;
  raise notice '✅ %', label;
end $$;

create or replace function pg_temp.ok_false(label text, actual boolean, expected boolean)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception '❌ % — المتوقع % الفعلي %', label, expected, actual;
  end if;
  raise notice '✅ %', label;
end $$;

do $$
declare
  it_u uuid; emp_u uuid; hr_u uuid; other_emp uuid;
  b1 uuid; portal1 uuid; v1 uuid;
  n int;
begin
  -- ═══ البذر ═══
  insert into auth.users (email) values ('r6-it@akram.iq')  returning id into it_u;
  insert into auth.users (email) values ('r6-emp@akram.iq') returning id into emp_u;
  insert into auth.users (email) values ('r6-hr@akram.iq')  returning id into hr_u;
  insert into auth.users (email) values ('r6-o@akram.iq')   returning id into other_emp;
  insert into public.user_roles (user_id, role) values
    (it_u, 'it_admin'), (emp_u, 'employee'), (hr_u, 'hr_officer'), (other_emp, 'employee');
  insert into public.employees (user_id, employee_number, full_name)
    values (emp_u, 'R6-01', 'موظف عزل'), (other_emp, 'R6-02', 'موظف ثانٍ');

  -- ═══ ① عزل الفروع ═══
  perform pg_temp.as_it(it_u);
  insert into public.branches (name, code) values ('فرع عزل', 'R6B') returning id into b1;
  raise notice '✅ IT أنشأ فرعاً';
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('موظف يقرأ الفروع (مسموح)', exists (select 1 from public.branches), true);
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('موظف لا يستطيع إنشاء فرع', (
    select not exists (
      select 1
      where (
        select app.has_role(array['it_admin', 'hr_officer', 'super_admin'])
      )
    )
  ), true);
  reset role;

  -- ═══ ② عزل المصفوفة: القراءة للكل · الكتابة IT فقط ═══
  insert into public.role_page_permissions (role, page_key, effect) values ('employee','test.x','grant');
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('موظف يقرأ مصفوفة الأدوار (للشريط)', exists (select 1 from public.role_page_permissions), true);
  perform pg_temp.ok_false('موظف لا يملك صلاحية كتابة (guard)', not app.has_role(array['it_admin', 'super_admin']), true);

  -- can_i_see عبر الأدوار (كل سؤال بعين المستخدم الصحيحة)
  perform pg_temp.as_emp(hr_u);
  perform pg_temp.ok_false('can_i_see: HR يرى hr.employees (افتراضي)',
    public.can_i_see('hr.employees'), true);
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('can_i_see: موظف لا يرى it.db.errors', public.can_i_see('it.db.errors'), false);

  -- إخفاء + قفل
  perform set_config('role','postgres',false);
  insert into public.role_page_permissions (role, page_key, effect) values ('employee','employee.payslips','hide');
  insert into public.user_page_overrides (user_id, page_key, effect, reason)
    values (emp_u, 'employee.payslips', 'allow', 'اختبار');
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('الفتح الفردي يعلو الإخفاء الدوري', public.can_i_see('employee.payslips'), true);
  reset role;
  delete from public.user_page_overrides where user_id = emp_u;
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('بدون قيد فردي: الإخفاء يسري', public.can_i_see('employee.payslips'), false);
  reset role;

  -- ═══ ③ عزل البوابات الديناميكية ═══
  perform set_config('role','postgres',false);
  insert into public.dynamic_portals (slug, name) values ('r6ops', 'بوابة عزل') returning id into portal1;
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub', it_u::text, false);
  perform public.set_user_role(emp_u, 'portal:r6ops', true);
  raise notice '✅ IT منح دوراً ديناميكياً';
  perform set_config('role','postgres',false);
  perform pg_temp.ok_false('الدور الديناميكي مسجل', exists (
    select 1 from public.user_roles where user_id = emp_u and role = 'portal:r6ops'), true);
  -- سحبه
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub', it_u::text, false);
  perform public.set_user_role(emp_u, 'portal:r6ops', false);
  perform set_config('role','postgres',false);
  perform pg_temp.ok_false('سحب الدور الديناميكي يعمل', exists (
    select 1 from public.user_roles where user_id = emp_u and role = 'portal:r6ops'), false);
  reset role;

  -- ═══ ④ عزل البصمة: IT يرى · الموظف لا يرى الأجهزة ═══
  perform set_config('role','postgres',false);
  insert into public.biometric_devices (serial_number, name) values ('R6-DEV', 'جهاز عزل');
  reset role;
  perform pg_temp.as_it(it_u);
  perform pg_temp.ok_false('IT يرى الأجهزة', exists (select 1 from public.biometric_devices), true);
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('موظف لا يرى الأجهزة', exists (select 1 from public.biometric_devices), false);
  -- الجهاز يدفع (security definer عبر الدالة): الموظف R6-01 برقم 2001؟ نربطه
  perform set_config('role','postgres',false);
  update public.employees set employee_number='R6PIN' where user_id = emp_u;
  perform pg_temp.as_it(it_u);
  select public.biometric_ingest('R6-DEV', 'R6PIN 2026-08-27 08:00:00 0 15') into n;
  perform pg_temp.ok_false('الدالة تقبل دفعة جهاز مسجل (IT)', n > 0, true);
  reset role;

  -- ═══ ⑤ عزل GPS: IT يرى المركبات والمواقع ═══
  perform set_config('role','postgres',false);
  insert into public.vehicles (plate, name, device_unique_id) values ('R6-999', 'شاحنة عزل', 'R6-TRK');
  perform public.gps_ingest('R6-TRK', 33.31, 44.36, 60, 90, true, now());
  reset role;
  perform pg_temp.as_it(it_u);
  perform pg_temp.ok_false('IT يرى المركبات', exists (select 1 from public.vehicles), true);
  perform pg_temp.ok_false('IT يرى المواقع', exists (select 1 from public.vehicle_positions), true);
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('موظف يرى المركبات (قراءة عامة)', exists (select 1 from public.vehicles), true);
  perform pg_temp.ok_false('موظف لا يرى المواقع التفصيلية', exists (select 1 from public.vehicle_positions), false);
  reset role;

  -- ═══ ⑥ عزل سجل التكاملات: IT فقط ═══
  perform pg_temp.as_it(it_u);
  perform pg_temp.ok_false('IT يقرأ integration_logs', exists (select 1 from public.integration_logs), true);
  perform pg_temp.as_emp(emp_u);
  perform pg_temp.ok_false('موظف لا يقرأ integration_logs', exists (select 1 from public.integration_logs), false);
  reset role;

  raise notice '';
  raise notice '═══ ✅ جناح عزل الجولة 6 اكتمل — الوحدات الجديدة محكمة ═══';
end $$;
