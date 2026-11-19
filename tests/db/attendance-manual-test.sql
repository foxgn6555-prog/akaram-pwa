-- الحضور اليدوي البديل عند تعطل البصمة (20261118130000 + 20261118140000): معاملة كاملة تُرجَع في النهاية — لا تترك مستخدمين ولا تفعيلات ولا صفوف حضور.
-- بادئة a7. تعتمد على الترحيلتين المذكورتين وعلى محرّك الحضور القائم.
--   A) التفعيل: الصلاحية (تقنية المعلومات فقط) والتحقق من كل مدخل ومنع التكرار وإشعارات التفعيل
--   B) المحرّك: يوم النطاق بلا كشف لا ينتج صفاً تلقائياً؛ خارج النطاق/المتعهد/الإجازة/قبل التفعيل كما كانت؛ البصمات الواردة تُخزَّن ولا تؤثر
--   C) قراءة الكشف: حالات الموظفين (مفتوح/إجازة/راحة/نفسه/تعديل آخر)، المستثنون، النوافذ، الصلاحيات
--   D) حفظ الكشف: الأثر المالي (حاضر = بلا نقص، غائب = غياب)، التدقيق، كله أو لا شيء، السبب عند التعديل، النافذة، الاستعادة
--   F) الإيقاف: عودة البصمة، الأيام العالقة تبقى، ظهور الصفحة (تفعيلاتي)
--   E) اعتماد الحضورية: يُمنع برسالة صريحة حتى تكتمل الكشوف ثم يمرّ، وبعده لا كشف ولا تفعيل في الشهر
--   G) أجور المتعهدين في نطاق موقوف البصمة   H) الكتالوج والربط والحراس   I) التذكير اليومي
begin;
set client_min_messages = notice;
select set_config('app.dedup_window_seconds', '0', true);

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('auth.user_id', p::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
-- بصمة (توقيت بغداد +03:00) في يوم معيّن
create or replace function pg_temp.punch(p_emp uuid, p_pin text, p_day date, p_time text) returns void language plpgsql as $$
begin
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, direction, method, raw)
  values ('A7-DEV', p_pin, p_emp, ((p_day::text || ' ' || p_time)::timestamp - interval '3 hours') at time zone 'UTC', 'unknown', 'manual', '{}'::jsonb);
end $$;

-- ═══ بيانات: مستخدمون (تقنية، عمليات، موارد، بوابة المحطة، بوابة الصيانة، معاون، مدير مفوض، متعهد، مدير للمتعهد) ═══
insert into auth.users (id, email) values
  ('a7000000-0000-4000-8000-000000000001', 'a7-it@t.iq'), ('a7000000-0000-4000-8000-000000000002', 'a7-ops@t.iq'), ('a7000000-0000-4000-8000-000000000003', 'a7-hr@t.iq'),
  ('a7000000-0000-4000-8000-000000000004', 'a7-gate@t.iq'), ('a7000000-0000-4000-8000-000000000005', 'a7-gate2@t.iq'), ('a7000000-0000-4000-8000-000000000006', 'a7-deputy@t.iq'),
  ('a7000000-0000-4000-8000-000000000007', 'a7-md@t.iq'), ('a7000000-0000-4000-8000-000000000008', 'a7-contractor@t.iq'), ('a7000000-0000-4000-8000-000000000009', 'a7-mgr@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('a7000000-0000-4000-8000-000000000001', 'it_admin'), ('a7000000-0000-4000-8000-000000000002', 'ops_room'), ('a7000000-0000-4000-8000-000000000003', 'hr_officer'),
  ('a7000000-0000-4000-8000-000000000004', 'transfer_station'), ('a7000000-0000-4000-8000-000000000005', 'maintenance'), ('a7000000-0000-4000-8000-000000000006', 'deputy_director'),
  ('a7000000-0000-4000-8000-000000000007', 'super_admin'), ('a7000000-0000-4000-8000-000000000008', 'employee'), ('a7000000-0000-4000-8000-000000000009', 'department_manager')
on conflict do nothing;

-- هيكل: فرع + قسم المحطة (وفرعه) + قسم آخر + قسم فارغ
insert into public.branches (id, name, code) values ('a7000000-0000-4000-8000-0000000000b1', 'a7 فرع', 'A7B') on conflict (id) do nothing;
insert into public.departments (id, name, code, parent_id) values
  ('a7000000-0000-4000-8000-0000000000d1', 'a7 محطة', 'A7T', null),
  ('a7000000-0000-4000-8000-0000000000d2', 'a7 محطة فرعي', 'A7T1', 'a7000000-0000-4000-8000-0000000000d1'),
  ('a7000000-0000-4000-8000-0000000000d3', 'a7 أخرى', 'A7O', null),
  ('a7000000-0000-4000-8000-0000000000d4', 'a7 فارغ', 'A7E', null)
on conflict (id) do nothing;

-- شفتان: أ (يومي كل الأيام) وب (يوم راحة هو يوم أمس)
do $$ declare d1 date := app.hr_local_date(now()) - 1; rest smallint := extract(dow from app.hr_local_date(now()) - 1)::int; wd smallint[]; begin
  select array_agg(x::smallint) into wd from generate_series(0, 6) x where x <> rest;
  insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
    ('a7000000-0000-4000-8000-0000000000a1', 'a7 صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}'),
    ('a7000000-0000-4000-8000-0000000000a2', 'a7 صباحي بيوم راحة', '08:00', '16:00', 15, wd)
  on conflict (name) do nothing;
end $$;

-- موظفون: المشرف S (حساب بوابة المحطة) · E1 · E2 (القسم الفرعي) · E3 (إجازة) · E4 (بلا بصمة) · E5 (قسم آخر) · E6 (متعهد) · E7 (يوم راحة أمس) · E8 (فرع فقط)
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin, department_id, branch_id) values
  ('a7000000-0000-4000-8000-0000000000e0', 'a7000000-0000-4000-8000-000000000004', 'A7-S', 'a7 مشرف البوابة', '2024-01-01', 'A700', 'a7000000-0000-4000-8000-0000000000d1', 'a7000000-0000-4000-8000-0000000000b1'),
  ('a7000000-0000-4000-8000-0000000000e1', null, 'A7-1', 'a7 موظف أول', '2024-01-01', 'A701', 'a7000000-0000-4000-8000-0000000000d1', 'a7000000-0000-4000-8000-0000000000b1'),
  ('a7000000-0000-4000-8000-0000000000e2', null, 'A7-2', 'a7 موظف ثانٍ', '2024-01-01', 'A702', 'a7000000-0000-4000-8000-0000000000d2', 'a7000000-0000-4000-8000-0000000000b1'),
  ('a7000000-0000-4000-8000-0000000000e3', null, 'A7-3', 'a7 موظف بإجازة', '2024-01-01', 'A703', 'a7000000-0000-4000-8000-0000000000d1', 'a7000000-0000-4000-8000-0000000000b1'),
  ('a7000000-0000-4000-8000-0000000000e4', null, 'A7-4', 'a7 بلا بصمة', '2024-01-01', null, 'a7000000-0000-4000-8000-0000000000d1', 'a7000000-0000-4000-8000-0000000000b1'),
  ('a7000000-0000-4000-8000-0000000000e5', null, 'A7-5', 'a7 قسم آخر', '2024-01-01', 'A705', 'a7000000-0000-4000-8000-0000000000d3', 'a7000000-0000-4000-8000-0000000000b1'),
  ('a7000000-0000-4000-8000-0000000000e6', 'a7000000-0000-4000-8000-000000000008', 'A7-6', 'a7 متعهد', '2024-01-01', 'A706', 'a7000000-0000-4000-8000-0000000000d1', 'a7000000-0000-4000-8000-0000000000b1'),
  ('a7000000-0000-4000-8000-0000000000e7', null, 'A7-7', 'a7 راحة أمس', '2024-01-01', 'A707', 'a7000000-0000-4000-8000-0000000000d1', 'a7000000-0000-4000-8000-0000000000b1'),
  ('a7000000-0000-4000-8000-0000000000e8', null, 'A7-8', 'a7 فرع فقط', '2024-01-01', 'A708', null, 'a7000000-0000-4000-8000-0000000000b1')
on conflict (id) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
  select e.id, case when e.employee_number = 'A7-7' then 'a7000000-0000-4000-8000-0000000000a2'::uuid else 'a7000000-0000-4000-8000-0000000000a1'::uuid end, '2024-01-01'
    from public.employees e where e.employee_number like 'A7-%' and e.employee_number <> 'A7-4';
insert into public.manager_profiles (user_id, shift, sectors) values ('a7000000-0000-4000-8000-000000000009', 'morning', '{1,2,5}') on conflict (user_id) do nothing;
insert into public.contractor_profiles (user_id, manager_user_id, sector_id, shift) values ('a7000000-0000-4000-8000-000000000008', 'a7000000-0000-4000-8000-000000000009', 1, 'morning') on conflict (user_id) do nothing;
-- نموذج رواتب يُظهر خصم الغياب (للتحقق من الأثر المالي)
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;

-- ═══ قبل أي تفعيل: أيام أمس وقبل أمس تُحتسب بالطريقة المعتادة (غياب تلقائي بعد نهاية الدوام) ═══
do $$ declare t date := app.hr_local_date(now()); e uuid; begin
  foreach e in array array['a7000000-0000-4000-8000-0000000000e1', 'a7000000-0000-4000-8000-0000000000e2', 'a7000000-0000-4000-8000-0000000000e5', 'a7000000-0000-4000-8000-0000000000e6', 'a7000000-0000-4000-8000-0000000000e0']::uuid[] loop
    perform app.hr_evaluate_day(e, t - 1); perform app.hr_evaluate_day(e, t - 2); perform app.hr_evaluate_day(e, t - 3);
  end loop;
  assert (select count(*) from public.hr_attendance_days where employee_id = 'a7000000-0000-4000-8000-0000000000e1' and work_date between t - 3 and t - 1 and source = 'auto' and status = 'absent') = 3, 'A0 غياب تلقائي قبل التفعيل';
  raise notice 'A0 ✅ خط الأساس: غياب تلقائي قبل التفعيل';
end $$;

-- ═══ A) التفعيل: الصلاحية والتحقق ═══
do $$ declare t date := app.hr_local_date(now()); i int;
        d1 uuid := 'a7000000-0000-4000-8000-0000000000d1'; b1 uuid := 'a7000000-0000-4000-8000-0000000000b1'; j jsonb; act uuid; n_before int;
begin
  -- A1: غير التقنية ممنوعة (غرفة العمليات، الموارد، مشرف البوابة نفسه، المدير المفوض)
  foreach i in array array[2, 3, 4, 7] loop
    perform pg_temp.as_user(('a7000000-0000-4000-8000-00000000000' || i)::uuid);
    perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('transfer-station', null, %L::uuid, true, 'تعطل الجهاز') $q$, d1), 'PERMISSION_DENIED');
    perform pg_temp.expect_error($q$ select public.attendance_manual_list() $q$, 'PERMISSION_DENIED');
    perform pg_temp.expect_error($q$ select public.attendance_manual_portal_options() $q$, 'PERMISSION_DENIED');
    perform pg_temp.expect_error(format($q$ select public.attendance_manual_scope_preview(null, %L::uuid, true) $q$, d1), 'PERMISSION_DENIED');
  end loop;
  -- A1ب: منح استثناء execute صريحاً للمدير المفوض يجعل app.can يسمح، لكن لا يتجاوز شرط دور it_admin في دالة الكتابة.
  insert into public.user_permission_overrides (user_id, unit_key, action, effect, reason)
    values ('a7000000-0000-4000-8000-000000000007', 'it.integrations.attendance-manual', 'execute', 'allow', 'a7 individual grant regression');
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000007');
  assert app.can(auth.uid(), 'it.integrations.attendance-manual', 'execute'), 'A1ب الاستثناء الفردي صالح في محرك الصلاحيات العام للاختبار';
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('transfer-station', null, %L::uuid, true, 'استثناء فردي') $q$, d1), 'PERMISSION_DENIED');
  delete from public.user_permission_overrides where user_id = 'a7000000-0000-4000-8000-000000000007' and unit_key = 'it.integrations.attendance-manual' and action = 'execute';
  -- A2: التقنية تتحقق من كل مدخل
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('employee', null, %L::uuid, true, 'سبب كافٍ') $q$, d1), 'ATT_MANUAL_PORTAL_INVALID');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('nope', null, %L::uuid, true, 'سبب كافٍ') $q$, d1), 'ATT_MANUAL_PORTAL_INVALID');
  perform pg_temp.expect_error($q$ select public.attendance_manual_activate(null, null, null, true, 'سبب كافٍ') $q$, 'ATT_MANUAL_PORTAL_INVALID');
  perform pg_temp.expect_error($q$ select public.attendance_manual_activate('transfer-station', null, null, true, 'سبب كافٍ') $q$, 'ATT_MANUAL_SCOPE_REQUIRED');
  perform pg_temp.expect_error($q$ select public.attendance_manual_activate('transfer-station', null, 'a7000000-0000-4000-8000-00000000ffff'::uuid, true, 'سبب كافٍ') $q$, 'ATT_MANUAL_SCOPE_INVALID');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('transfer-station', null, %L::uuid, true, 'ab') $q$, d1), 'ATT_MANUAL_REASON_REQUIRED');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('transfer-station', null, %L::uuid, true, '   ') $q$, d1), 'ATT_MANUAL_REASON_REQUIRED');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('transfer-station', null, %L::uuid, true, 'سبب كافٍ', %L::date) $q$, d1, t + 1), 'ATT_MANUAL_START_INVALID');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('transfer-station', null, %L::uuid, true, 'سبب كافٍ', %L::date) $q$, d1, t - 32), 'ATT_MANUAL_START_INVALID');
  perform pg_temp.expect_error($q$ select public.attendance_manual_activate('transfer-station', null, 'a7000000-0000-4000-8000-0000000000d4'::uuid, true, 'سبب كافٍ') $q$, 'ATT_MANUAL_SCOPE_EMPTY');
  select count(*) into n_before from public.attendance_manual_activations;
  assert n_before = 0, 'A2 لا شيء كُتب بعد كل الرفض: ' || n_before;
  -- A3: معاينة النطاق قبل التفعيل (قسم المحطة وما تحته): S,E1,E2,E3,E4,E7 يدخلون الكشف (E4 بلا بصمة)؛ E6 متعهد مستثنى
  j := public.attendance_manual_scope_preview(null, d1, true);
  assert (j ->> 'employees')::int = 6 and (j ->> 'no_pin')::int = 1 and (j ->> 'contractors')::int = 1 and j -> 'overlapping' = '[]'::jsonb, 'A3 معاينة (يشمل بلا بصمة): ' || j::text;
  j := public.attendance_manual_scope_preview(null, d1, false);
  assert (j ->> 'employees')::int = 5, 'A3 القسم بلا أقسامه الفرعية (S,E1,E3,E4,E7): ' || j::text;
  j := public.attendance_manual_scope_preview(b1, null, true);
  assert (j ->> 'employees')::int = 8, 'A3 الفرع كله (S,E1,E2,E3,E4,E5,E7,E8): ' || j::text;
  j := public.attendance_manual_scope_preview(b1, d1, true);
  assert (j ->> 'employees')::int = 6, 'A3 تقاطع الفرع والقسم: ' || j::text;
  -- A3ب: خيارات التفعيل: 17 بوابة، واقتراح قسم/فرع موظف حساب بوابة المحطة (حساب واحد بدور transfer_station)
  j := public.attendance_manual_portal_options();
  assert jsonb_array_length(j) = 17 and not exists (select 1 from jsonb_array_elements(j) o where o ->> 'portal' in ('employee', 'public')), 'A3ب 17 بوابة قابلة للتفعيل: ' || jsonb_array_length(j);
  assert (select (o ->> 'holders')::int = 1 and o -> 'departments' -> 0 ->> 'id' = d1::text and o -> 'branches' -> 0 ->> 'id' = b1::text and o ->> 'label' = 'المحطة التحويلية'
            from jsonb_array_elements(j) o where o ->> 'portal' = 'transfer-station'), 'A3ب اقتراح النطاق من موظف حساب البوابة';
  raise notice 'A1-A3 ✅ الصلاحية والتحقق والمعاينة وخيارات التفعيل';
end $$;

-- A4: التفعيل الحقيقي (التقنية) — يبدأ قبل يومين، ثم كل ما يلي عليه
select pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
create temp table a7_ctx as select public.attendance_manual_activate('transfer-station', null, 'a7000000-0000-4000-8000-0000000000d1'::uuid, true, 'تعطل جهاز بوابة المحطة', app.hr_local_date(now()) - 2) as j;
do $$ declare j jsonb := (select j from a7_ctx); t date := app.hr_local_date(now()); act uuid := (j ->> 'id')::uuid; a public.attendance_manual_activations; n int;
begin
  assert (j ->> 'employees')::int = 6 and (j ->> 'starts_on')::date = t - 2, 'A4 نتيجة التفعيل (بلا شرط بصمة): ' || j::text;
  -- يُزال الصف التلقائي لأيام النطاق المسجَّلة قبل التفعيل: S وE1 وE2 × (يومان) = 6، وE5 (قسم آخر) وE6 (متعهد) بقيا
  assert (j ->> 'cleared_auto_days')::int = 6, 'A4 صفوف تلقائية أُزيلت: ' || j::text;
  select * into a from public.attendance_manual_activations where id = act;
  assert a.status = 'active' and a.ends_on is null and a.portal = 'transfer-station' and a.department_id = 'a7000000-0000-4000-8000-0000000000d1' and a.include_sub_departments and a.activated_by = 'a7000000-0000-4000-8000-000000000001', 'A4 صف التفعيل: ' || row_to_json(a)::text;
  -- التفعيل يزيل ما بُني تلقائياً قبله لأيام النطاق (الصف التلقائي لموظفي النطاق من يوم البداية فصاعداً) ويُبقي ما قبل البداية وخارج النطاق
  assert not exists (select 1 from public.hr_attendance_days d where d.employee_id in ('a7000000-0000-4000-8000-0000000000e0', 'a7000000-0000-4000-8000-0000000000e1', 'a7000000-0000-4000-8000-0000000000e2') and d.work_date >= t - 2 and d.source = 'auto'), 'A4 صفوف النطاق التلقائية أُزيلت عند التفعيل';
  assert (select count(*) from public.hr_attendance_days d where d.employee_id in ('a7000000-0000-4000-8000-0000000000e1', 'a7000000-0000-4000-8000-0000000000e5', 'a7000000-0000-4000-8000-0000000000e6') and d.work_date = t - 3 and d.source = 'auto') = 3, 'A4 ما قبل البداية وخارج النطاق بلا مساس';
  -- التدقيق العام (audit_logs) يسجّل التفعيل
  assert (select count(*) from public.audit_logs where table_name = 'attendance_manual_activations' and record_id = act::text and operation = 'INSERT') = 1, 'A4 تدقيق التفعيل';
  -- A5: منع التكرار (نفس البوابة والنطاق ما دام ساريًا)
  perform pg_temp.expect_error($q$ select public.attendance_manual_activate('transfer-station', null, 'a7000000-0000-4000-8000-0000000000d1'::uuid, true, 'تكرار') $q$, 'ATT_MANUAL_DUPLICATE_ACTIVE');
  -- لكن نطاق مختلف أو بوابة أخرى مسموح، وتظهر المعاينة التقاطع مع الساري
  assert jsonb_array_length(public.attendance_manual_scope_preview(null, 'a7000000-0000-4000-8000-0000000000d2', true) -> 'overlapping') = 1, 'A5 تقاطع ظاهر في المعاينة';
  -- A6: إشعارات التفعيل: غرفة العمليات + الموارد + المعاون + التقنية + مشرف البوابة؛ لا بوابة الصيانة
  select count(*) into n from public.notifications where dedupe_key = 'att_manual_on:' || act::text;
  assert n = 5, 'A6 عدد إشعارات التفعيل: ' || n;
  assert exists (select 1 from public.notifications where dedupe_key = 'att_manual_on:' || act::text and user_id = 'a7000000-0000-4000-8000-000000000004' and link = '/transfer-station/manual-attendance'), 'A6 رابط صفحة الكشف لمشرف البوابة';
  assert exists (select 1 from public.notifications where dedupe_key = 'att_manual_on:' || act::text and user_id = 'a7000000-0000-4000-8000-000000000002' and link = '/ops-room/manual-attendance'), 'A6 رابط غرفة العمليات';
  assert not exists (select 1 from public.notifications where dedupe_key = 'att_manual_on:' || act::text and user_id = 'a7000000-0000-4000-8000-000000000005'), 'A6 بوابة الصيانة لا تُشعَر';
  raise notice 'A4-A6 ✅ التفعيل، التدقيق، منع التكرار، الإشعارات';
end $$;

-- ═══ B) المحرّك: الكشف هو المصدر الوحيد في أيام النطاق ═══
do $$ declare t date := app.hr_local_date(now()); e1 uuid := 'a7000000-0000-4000-8000-0000000000e1'; e2 uuid := 'a7000000-0000-4000-8000-0000000000e2'; e3 uuid := 'a7000000-0000-4000-8000-0000000000e3';
        e5 uuid := 'a7000000-0000-4000-8000-0000000000e5'; e6 uuid := 'a7000000-0000-4000-8000-0000000000e6'; lv uuid; n int;
begin
  -- B1: لا غياب تلقائي ولا صف للنطاق: إعادة الاحتساب لا تُنتج صفاً (يوم أمس وقبل أمس)
  perform app.hr_evaluate_day(e1, t - 1); perform app.hr_evaluate_day(e1, t - 2);
  assert not exists (select 1 from public.hr_attendance_days where employee_id = e1 and work_date in (t - 1, t - 2)), 'B1 لا صف تلقائي لموظف نطاق مفعَّل';
  -- ونطاق الشهر كله كذلك (احتساب الشهر عند الاعتماد)
  perform app.hr_evaluate_month(date_trunc('month', t - 1)::date);
  assert not exists (select 1 from public.hr_attendance_days where employee_id in (e1, e2) and work_date in (t - 1, t - 2)), 'B1 احتساب الشهر لا يُنتج غياباً لموظف نطاق مفعَّل';
  -- B2: خارج النطاق (قسم آخر) والمتعهد يبقيان كما كانا: غياب تلقائي
  assert (select count(*) from public.hr_attendance_days where employee_id in (e5, e6) and work_date in (t - 1, t - 2) and source = 'auto' and status = 'absent') = 4, 'B2 خارج النطاق والمتعهد بلا تغيير';
  -- B3: قبل بدء التفعيل (t-3) يبقى الغياب التلقائي لموظف النطاق
  assert (select status from public.hr_attendance_days where employee_id = e1 and work_date = t - 3) = 'absent', 'B3 قبل التفعيل بلا تغيير';
  -- B4: البصمات الواردة في يوم نطاق مفعَّل تُخزَّن ولا تُنتج صفاً
  perform pg_temp.punch(e2, 'A702', t - 2, '08:00'); perform pg_temp.punch(e2, 'A702', t - 2, '16:05');
  assert (select count(*) from public.biometric_punches where employee_id = e2 and punched_at >= ((t - 2)::timestamp - interval '3 hours') at time zone 'UTC' and punched_at < ((t - 1)::timestamp - interval '3 hours') at time zone 'UTC') = 2, 'B4 البصمات محفوظة';
  assert not exists (select 1 from public.hr_attendance_days where employee_id = e2 and work_date = t - 2), 'B4 لا أثر للبصمة على يوم نطاق مفعَّل';
  -- B5: الإجازة المعتمدة تبقى كما هي: صف «إجازة» رغم النطاق
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000007');
  insert into public.hr_leaves (employee_id, kind, leave_type_id, start_date, end_date, status)
    values (e3, 'leave', (select id from public.hr_leave_types where code = 'official'), t - 1, t - 1, 'pending') returning id into lv;
  perform public.hr_leave_decide(lv, true);
  assert (select status from public.hr_attendance_days where employee_id = e3 and work_date = t - 1) = 'leave', 'B5 الإجازة المعتمدة تُنتج صف إجازة في نطاق مفعَّل';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  raise notice 'B1-B5 ✅ لا غياب تلقائي، خارج النطاق/المتعهد/قبل التفعيل كما كانت، البصمة تُخزَّن بلا أثر، الإجازة تبقى';
end $$;

-- ═══ C) قراءة الكشف ═══
do $$ declare t date := app.hr_local_date(now()); act uuid := (select (j ->> 'id')::uuid from a7_ctx); j jsonb; st jsonb; x jsonb;
begin
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004');   -- مشرف بوابة المحطة (هو S)
  j := public.manual_att_sheet_get(act, t - 1);
  select jsonb_object_agg(e ->> 'number', e ->> 'state') into st from jsonb_array_elements(j -> 'employees') e;
  assert st = '{"A7-S":"self","A7-1":"open","A7-2":"open","A7-3":"leave","A7-4":"no_shift","A7-7":"rest"}'::jsonb, 'C1 حالات أمس: ' || st::text;
  -- 20261119120000: بلا بصمة صاروا داخل الكشف، فـ«excluded.no_pin» صفر ويُعلَن عددهم في «included_no_pin»
  assert (j -> 'excluded' ->> 'no_pin')::int = 0 and (j -> 'included_no_pin')::int = 1 and (j -> 'excluded' ->> 'contractors')::int = 1, 'C1 المشمولون بلا بصمة والمتعهدون: ' || j::text;
  assert exists (select 1 from jsonb_array_elements(j -> 'employees') e where e ->> 'number' = 'A7-4' and e ->> 'state' = 'no_shift' and (e ->> 'has_shift')::boolean = false),
    'C1ب الموظف بلا رقم بصمة داخل الكشف ومقفل بسبب غياب الشفت (لا يُستبعد بصمت): ' || (j -> 'employees')::text;
  assert j ->> 'lock' is null and (j ->> 'date')::date = t - 1 and (j ->> 'to')::date = t and (j ->> 'from')::date = t - 2, 'C1 النافذة: ' || j::text;
  assert jsonb_array_length(j -> 'days') = 3 and (j -> 'days' -> 0 ->> 'date')::date = t, 'C1 شريط الأيام';
  -- اليوم الافتراضي = آخر يوم مغطّى (اليوم)
  assert (public.manual_att_sheet_get(act) ->> 'date')::date = t, 'C2 اليوم الافتراضي';
  -- بصمات اليوم المعروضة معلومة فقط: E2 له بصمتان في t-2
  x := (select e from jsonb_array_elements(public.manual_att_sheet_get(act, t - 2) -> 'employees') e where e ->> 'number' = 'A7-2');
  assert (x ->> 'punches')::int = 2 and x ->> 'state' = 'open' and x ->> 'entry' is null, 'C2 بصمات معلوماتية: ' || x::text;
  -- خارج النافذة/المدى
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_get(%L::uuid, %L::date) $q$, act, t - 3), 'ATT_MANUAL_DATE_OUT_OF_RANGE');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_get(%L::uuid, %L::date) $q$, act, t + 1), 'ATT_MANUAL_DATE_OUT_OF_RANGE');
  perform pg_temp.expect_error($q$ select public.manual_att_sheet_get('a7000000-0000-4000-8000-00000000ffff'::uuid) $q$, 'ATT_MANUAL_NOT_FOUND');
  -- غرفة العمليات (مستوى أعلى) ترى المشرف مفتوحاً (لا يسجّل أحد حضور نفسه)
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000002');
  select jsonb_object_agg(e ->> 'number', e ->> 'state') into st from jsonb_array_elements(public.manual_att_sheet_get(act, t - 1) -> 'employees') e;
  assert st ->> 'A7-S' = 'open', 'C3 المستوى الأعلى يسجّل للمشرف';
  -- بوابة أخرى والموارد البشرية والموظف العادي: ممنوعون
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000005');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_get(%L::uuid, null) $q$, act), 'PERMISSION_DENIED');
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000003');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_get(%L::uuid, null) $q$, act), 'PERMISSION_DENIED');
  -- تفعيلاتي: مشرف البوابة (1)، الصيانة (0)، الموارد (0)، غرفة العمليات (1)، التقنية (1)
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004'); assert jsonb_array_length(public.manual_att_my_activations()) = 1, 'C4 تفعيلاتي للمشرف';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000005'); assert jsonb_array_length(public.manual_att_my_activations()) = 0, 'C4 تفعيلاتي للصيانة';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000003'); assert jsonb_array_length(public.manual_att_my_activations()) = 0, 'C4 تفعيلاتي للموارد';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000002'); assert jsonb_array_length(public.manual_att_my_activations()) = 1, 'C4 تفعيلاتي لغرفة العمليات';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001'); assert jsonb_array_length(public.manual_att_my_activations()) = 1, 'C4 تفعيلاتي للتقنية';
  raise notice 'C1-C4 ✅ حالات الموظفين، المستثنون، النافذة، الصلاحيات، تفعيلاتي';
end $$;

-- C5: ملخص المعلّق لغرفة العمليات أفقه «حتى أمس» كبوابة الاعتماد تماماً — يوم اليوم (ما زال مفتوحاً) لا يدخل فيه
--     (وإلا قال الشريط «10» وقالت رسالة المنع «9»). عدّاد التقنية يشمل اليوم لأنه «ما بقي لتسجيله».
do $$ declare t date := app.hr_local_date(now()); m date := date_trunc('month', app.hr_local_date(now()))::date; v_last date; n_block int; n_today int; n_list int; n_prev int; s jsonb;
        act uuid := (select (j ->> 'id')::uuid from a7_ctx);
begin
  v_last := least((m + interval '1 month - 1 day')::date, t - 1);
  n_block := case when v_last < m then 0 else (select count(distinct (p.employee_id, p.work_date)) from app.manual_att_pending_days(m, v_last) p) end;
  select count(distinct (p.employee_id, p.work_date)) into n_today from app.manual_att_pending_days(m, t) p;
  assert n_today > n_block, 'C5 اليوم فيه معلّق وإلا كان الاختبار فارغاً: ' || n_today || ' / ' || n_block;
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000002');
  s := public.attendance_manual_pending_summary(m);
  assert (s ->> 'total')::int = n_block, 'C5 ملخص المعلّق = رقم المنع (حتى أمس): ' || s::text || ' المتوقع ' || n_block;
  -- عدّاد التقنية (قائمة التفعيلات) يشمل اليوم: أكبر مما حتى أمس
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  select (x ->> 'pending_days')::int into n_list from jsonb_array_elements(public.attendance_manual_list(true)) x where (x ->> 'id')::uuid = act;
  select count(distinct (p.employee_id, p.work_date)) into n_prev from app.manual_att_pending_days((select a.starts_on from public.attendance_manual_activations a where a.id = act), t - 1, act) p;
  assert n_list > n_prev, 'C5 عدّاد التقنية يشمل اليوم: ' || n_list || ' / ' || n_prev;
  raise notice 'C5 ✅ ملخص المعلّق = رقم المنع حتى أمس (اليوم خارجه) وعدّاد التقنية يشمل اليوم';
end $$;

-- ═══ D) حفظ الكشف ═══
do $$ declare t date := app.hr_local_date(now()); act uuid := (select (j ->> 'id')::uuid from a7_ctx); r jsonb; a record;
        e1 uuid := 'a7000000-0000-4000-8000-0000000000e1'; e2 uuid := 'a7000000-0000-4000-8000-0000000000e2'; e3 uuid := 'a7000000-0000-4000-8000-0000000000e3';
        e5 uuid := 'a7000000-0000-4000-8000-0000000000e5'; e6 uuid := 'a7000000-0000-4000-8000-0000000000e6'; s uuid := 'a7000000-0000-4000-8000-0000000000e0'; e7 uuid := 'a7000000-0000-4000-8000-0000000000e7';
        n_rows int; n_audit int;
begin
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004');
  -- D1: كله أو لا شيء — موظف بإجازة في الدفعة يُسقط الكل
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present'), jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act, t - 1, e1, e3), 'ATT_MANUAL_EMPLOYEE_LOCKED');
  assert not exists (select 1 from public.hr_attendance_days where employee_id = e1 and work_date = t - 1) and not exists (select 1 from public.attendance_manual_entries where work_date = t - 1), 'D1 لم يُكتب شيء';
  -- D2: لا يسجّل المشرف حضور نفسه، ولا يوم الراحة، ولا من خارج النطاق، ولا المتعهد
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act, t - 1, s), 'ATT_MANUAL_EMPLOYEE_LOCKED');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act, t - 1, e7), 'ATT_MANUAL_EMPLOYEE_LOCKED');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act, t - 1, e5), 'ATT_MANUAL_EMPLOYEE_NOT_IN_SCOPE');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act, t - 1, e6), 'ATT_MANUAL_EMPLOYEE_NOT_IN_SCOPE');
  -- D3: مدخلات غير صالحة
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, '[]'::jsonb, null) $q$, act, t - 1), 'ATT_MANUAL_ENTRIES_REQUIRED');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, '{}'::jsonb, null) $q$, act, t - 1), 'ATT_MANUAL_ENTRIES_REQUIRED');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'leave')), null) $q$, act, t - 1, e1), 'ATT_MANUAL_ENTRY_INVALID');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', 'غير-معرّف', 'status', 'present')), null) $q$, act, t - 1), 'ATT_MANUAL_ENTRY_INVALID');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present'), jsonb_build_object('employee_id', %L, 'status', 'absent')), null) $q$, act, t - 1, e1, e1), 'ATT_MANUAL_DUPLICATE_ENTRY');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act, t + 1, e1), 'HR_FUTURE_DATE');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act, t - 3, e1), 'ATT_MANUAL_DATE_OUT_OF_RANGE');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, null, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act, e1), 'ATT_MANUAL_DATE_REQUIRED');
  -- D4: الحفظ الصحيح: E1 حاضر وE2 غائب (أمس)
  r := public.manual_att_sheet_save(act, t - 1, jsonb_build_array(jsonb_build_object('employee_id', e1, 'status', 'present'), jsonb_build_object('employee_id', e2, 'status', 'absent')), null);
  assert (r ->> 'saved')::int = 2 and (r ->> 'present')::int = 1 and (r ->> 'absent')::int = 1 and (r ->> 'changed')::int = 0 and (r ->> 'pending_left')::int = 0, 'D4 نتيجة الحفظ: ' || r::text;
  -- الأثر المالي: الحاضر يوم كامل بأوقات الشفت بلا نقص ولا خصم؛ الغائب غياب كالحقيقي (يوم استقطاع ونقص = دقائق الشفت)
  select * into a from public.hr_attendance_days where employee_id = e1 and work_date = t - 1;
  assert a.status = 'present' and a.source = 'manual' and a.worked_minutes = 480 and a.required_minutes = 480 and a.shortfall_minutes = 0 and a.proposed_deduction_days = 0
         and a.check_in = a.expected_in and a.check_out = a.expected_out and a.late_minutes = 0 and a.edited_by = 'a7000000-0000-4000-8000-000000000004' and a.edit_reason like 'كشف حضور يدوي — المحطة التحويلية%', 'D4 حاضر: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e2 and work_date = t - 1;
  assert a.status = 'absent' and a.source = 'manual' and a.check_in is null and a.shortfall_minutes = 480 and a.proposed_deduction_days = 1, 'D4 غائب: ' || row_to_json(a)::text;
  -- مدخلات الكشف والتدقيق
  assert (select count(*) from public.attendance_manual_entries where activation_id = act and work_date = t - 1) = 2, 'D4 مدخلات الكشف';
  select count(*) into n_audit from public.hr_attendance_audit where work_date = t - 1 and employee_id in (e1, e2) and action = 'edit' and actor = 'a7000000-0000-4000-8000-000000000004' and after -> 'manual_sheet' ->> 'activation' = act::text;
  assert n_audit = 2, 'D4 تدقيق الكشف: ' || n_audit;
  -- D5: البصمة التي تصل لاحقاً ليوم محفوظ لا تغيّر شيئاً (اليدوي يغلب) لكنها تُخزَّن
  perform pg_temp.punch(e2, 'A702', t - 1, '08:00'); perform pg_temp.punch(e2, 'A702', t - 1, '16:00');
  assert (select status from public.hr_attendance_days where employee_id = e2 and work_date = t - 1) = 'absent', 'D5 اليدوي يغلب البصمة الواردة';
  -- D6: إعادة الحفظ بالقيمة نفسها = بلا تغيير (لا مراجعة جديدة ولا تدقيق)
  r := public.manual_att_sheet_save(act, t - 1, jsonb_build_array(jsonb_build_object('employee_id', e1, 'status', 'present')), null);
  assert (r ->> 'saved')::int = 0 and (r ->> 'unchanged')::int = 1, 'D6 بلا تغيير: ' || r::text;
  assert (select revision from public.attendance_manual_entries where employee_id = e1 and work_date = t - 1) = 1, 'D6 المراجعة ثابتة';
  -- D7: تغيير مُدخَل سابق يحتاج سبباً، ويُدقَّق بالسبب
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'absent')), null) $q$, act, t - 1, e1), 'ATT_MANUAL_NOTE_REQUIRED');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'absent')), 'x') $q$, act, t - 1, e1), 'ATT_MANUAL_NOTE_REQUIRED');
  assert (select status from public.hr_attendance_days where employee_id = e1 and work_date = t - 1) = 'present', 'D7 لم يتغير شيء بعد الرفض';
  r := public.manual_att_sheet_save(act, t - 1, jsonb_build_array(jsonb_build_object('employee_id', e1, 'status', 'absent')), 'خطأ في الإدخال الأول');
  assert (r ->> 'changed')::int = 1 and (r ->> 'saved')::int = 0, 'D7 نتيجة التعديل: ' || r::text;
  select * into a from public.hr_attendance_days where employee_id = e1 and work_date = t - 1;
  assert a.status = 'absent' and a.proposed_deduction_days = 1 and a.edit_reason like '%تعديل: خطأ في الإدخال الأول', 'D7 الصف بعد التعديل: ' || row_to_json(a)::text;
  assert (select revision from public.attendance_manual_entries where employee_id = e1 and work_date = t - 1) = 2
     and (select note from public.attendance_manual_entries where employee_id = e1 and work_date = t - 1) = 'خطأ في الإدخال الأول', 'D7 المراجعة والسبب';
  assert exists (select 1 from public.hr_attendance_audit where employee_id = e1 and work_date = t - 1 and action = 'edit' and reason like '%تعديل: خطأ في الإدخال الأول' and (before ->> 'status') = 'present' and (after ->> 'status') = 'absent'), 'D7 تدقيق التعديل (قبل/بعد)';
  -- نعيده حاضراً (بسبب) كي تبقى الأيام التالية متوقعة
  perform public.manual_att_sheet_save(act, t - 1, jsonb_build_array(jsonb_build_object('employee_id', e1, 'status', 'present')), 'عودة إلى حاضر بعد المراجعة');
  -- D8: تعديل من مسار آخر (غرفة العمليات) على يوم محفوظ ⇒ الحالة «other» ولا يُستبدل من الكشف
  update public.hr_attendance_days set status = 'late', late_minutes = 30 where employee_id = e1 and work_date = t - 1;   -- يبقى مصدره يدوياً لكن الحالة تغيّرت خارج الكشف
  assert (select e ->> 'state' from jsonb_array_elements(public.manual_att_sheet_get(act, t - 1) -> 'employees') e where e ->> 'number' = 'A7-1') = 'open', 'D8 متأخر ما زال متسقاً مع «حاضر» (يُحتسب حضوراً)';
  update public.hr_attendance_days set status = 'absent' where employee_id = e1 and work_date = t - 1;
  assert (select e ->> 'state' from jsonb_array_elements(public.manual_att_sheet_get(act, t - 1) -> 'employees') e where e ->> 'number' = 'A7-1') = 'other', 'D8 تعارض مع المدخَل ⇒ تعديل من مسار آخر';
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), 'محاولة') $q$, act, t - 1, e1), 'ATT_MANUAL_EMPLOYEE_LOCKED');
  update public.hr_attendance_days set status = 'present', late_minutes = 0 where employee_id = e1 and work_date = t - 1;   -- إعادة الاتساق
  -- D9: المشرف لا يحفظ أبعد من نافذة 7 أيام، أمّا غرفة العمليات فتتجاوزها ضمن التفعيل
  raise notice 'D1-D8 ✅ كله أو لا شيء، الأثر المالي، التدقيق، السبب، الاتساق';
end $$;

-- D8ب: الإذن الساعي ليس إجازة يومية؛ يزامن الحالة اليدوية ويحفظ الأصل ثم يستعيده عند الإلغاء.
do $$ declare t date := app.hr_local_date(now()); act uuid := (select (j ->> 'id')::uuid from a7_ctx); typ uuid; p uuid; r jsonb; a record; st text;
        e1 uuid := 'a7000000-0000-4000-8000-0000000000e1'; e2 uuid := 'a7000000-0000-4000-8000-0000000000e2';
begin
  select id into typ from public.hr_leave_types where code = 'permit_official';
  assert typ is not null, 'D8ب نوع الإذن الساعي الرسمي موجود';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000007');
  -- قبل إدخال الكشف، الإذن لا ينشئ حضوراً ولا يزيل اليوم من المعلّق.
  insert into public.hr_leaves (employee_id, kind, leave_type_id, start_date, end_date, start_time, end_time, minutes, status)
    values (e1, 'time_permit', typ, t - 2, t - 2, '08:00', '09:00', 60, 'pending') returning id into p;
  perform public.hr_leave_decide(p, true);
  assert not exists (select 1 from public.hr_attendance_days where employee_id = e1 and work_date = t - 2)
     and exists (select 1 from app.manual_att_pending_days(t - 2, t - 2, act) where employee_id = e1), 'D8ب الزمنية وحدها لا تسجل اليوم ولا تزيله من المعلّق';
  r := public.manual_att_sheet_save(act, t - 2, jsonb_build_array(jsonb_build_object('employee_id', e1, 'status', 'present')), null);
  select * into a from public.hr_attendance_days where employee_id = e1 and work_date = t - 2;
  assert (r ->> 'saved')::int = 1 and a.status = 'time_permit' and a.approved_permit_original ->> 'status' = 'present'
     and not exists (select 1 from app.manual_att_pending_days(t - 2, t - 2, act) where employee_id = e1), 'D8ب بعد التسجيل يتزامن الإذن ويغلق معلّق الموظف';
  perform public.hr_leave_cancel(p, 'إلغاء زمنية قبل تسجيل الكشف');
  select * into a from public.hr_attendance_days where employee_id = e1 and work_date = t - 2;
  assert a.status = 'present' and a.approved_permit_original is null, 'D8ب إلغاء الإذن بعد التسجيل يستعيد الأصل';

  insert into public.hr_leaves (employee_id, kind, leave_type_id, start_date, end_date, start_time, end_time, minutes, status)
    values (e1, 'time_permit', typ, t - 1, t - 1, '08:00', '09:00', 60, 'pending') returning id into p;
  perform public.hr_leave_decide(p, true);
  select * into a from public.hr_attendance_days where employee_id = e1 and work_date = t - 1;
  select e ->> 'state' into st from jsonb_array_elements(public.manual_att_sheet_get(act, t - 1) -> 'employees') e where e ->> 'number' = 'A7-1';
  assert a.status = 'time_permit' and a.source = 'manual' and a.approved_permit_original ->> 'status' = 'present'
     and a.worked_minutes = 480 and a.shortfall_minutes = 0 and a.permit_minutes = 60 and st = 'open'
     and not exists (select 1 from app.manual_att_pending_days(t - 1, t - 1, act) where employee_id = e1), 'D8ب حضور يدوي حاضر مع زمنية: الأصل محفوظ، لا نقص ولا يوم معلّق: ' || row_to_json(a)::text || ' / ' || st;
  perform public.hr_leave_cancel(p, 'إلغاء زمنية اختبار الحضور');
  select * into a from public.hr_attendance_days where employee_id = e1 and work_date = t - 1;
  assert a.status = 'present' and a.approved_permit_original is null and a.worked_minutes = 480, 'D8ب إلغاء الزمنية يستعيد الحالة اليدوية حاضر';

  insert into public.hr_leaves (employee_id, kind, leave_type_id, start_date, end_date, start_time, end_time, minutes, status)
    values (e2, 'time_permit', typ, t - 1, t - 1, '08:00', '09:00', 60, 'pending') returning id into p;
  perform public.hr_leave_decide(p, true);
  select * into a from public.hr_attendance_days where employee_id = e2 and work_date = t - 1;
  assert a.status = 'absent' and a.approved_permit_original ->> 'status' = 'absent' and a.shortfall_minutes = 480
     and a.proposed_deduction_days = 1 and a.permit_minutes = 0, 'D8ب الزمنية الساعية لا تحوّل الغياب اليدوي إلى إجازة يومية: ' || row_to_json(a)::text;
  perform public.hr_leave_cancel(p, 'إلغاء زمنية اختبار الغياب');
  select * into a from public.hr_attendance_days where employee_id = e2 and work_date = t - 1;
  assert a.status = 'absent' and a.approved_permit_original is null and a.shortfall_minutes = 480, 'D8ب إلغاء الزمنية يستعيد الغياب اليدوي';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004');
  raise notice 'D8ب ✅ الزمنية لا تعفي من الكشف: الحاضر يبقى حاضراً ويُستعاد أصله، والغياب يبقى غياباً';
end $$;

-- D9: نافذة الأيام السابقة: تفعيل بدأ قبل 12 يوماً (بوابة الصيانة، نطاق الفرع فقط) — المشرف مقيَّد بـ 7 أيام، والمستوى الأعلى لا
do $$ declare t date := app.hr_local_date(now()); j jsonb; act2 uuid; e8 uuid := 'a7000000-0000-4000-8000-0000000000e8'; r jsonb; m date;
begin
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  -- بداية قبل 12 يوماً قد تقع في شهر سابق؛ نتجنّب أي شهر معتمد/مقفل (لا وجود له هنا)
  j := public.attendance_manual_activate('maintenance', 'a7000000-0000-4000-8000-0000000000b1'::uuid, null, true, 'تعطل جهاز الصيانة', t - 12);
  act2 := (j ->> 'id')::uuid;
  assert (j ->> 'employees')::int = 8, 'D9 موظفو الفرع (يشمل بلا بصمة): ' || j::text;
  -- المشرّف (صلاحية بوابة الصيانة) لا يملك أصلاً بوابة أخرى: نستعمل مستخدم الصيانة
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000005');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', %L, 'status', 'present')), null) $q$, act2, t - 9, e8), 'ATT_MANUAL_WINDOW_CLOSED');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_get(%L::uuid, %L::date) $q$, act2, t - 9), 'ATT_MANUAL_DATE_OUT_OF_RANGE');
  r := public.manual_att_sheet_save(act2, t - 7, jsonb_build_array(jsonb_build_object('employee_id', e8, 'status', 'present')), null);
  assert (r ->> 'saved')::int = 1, 'D9 داخل النافذة: ' || r::text;
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000002');   -- غرفة العمليات: تتجاوز النافذة
  r := public.manual_att_sheet_save(act2, t - 9, jsonb_build_array(jsonb_build_object('employee_id', e8, 'status', 'present')), null);
  assert (r ->> 'saved')::int = 1, 'D9 المستوى الأعلى يتجاوز النافذة: ' || r::text;
  assert jsonb_array_length(public.manual_att_sheet_get(act2, t - 9) -> 'days') >= 10, 'D9 شريط الأيام الأطول للمستوى الأعلى';
  -- إيقاف تفعيل الصيانة (لا أيام معلّقة نهتم بها هنا) — نُبقيه لاختبار الإيقاف بآخر يوم مبكر
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  r := public.attendance_manual_deactivate(act2, t - 8, 'إصلاح الجهاز مبكراً');
  assert (r ->> 'ends_on')::date = t - 8, 'D9 إيقاف بآخر يوم مبكر: ' || r::text;
  raise notice 'D9 ✅ نافذة الأيام السابقة للمشرف والمستوى الأعلى';
end $$;

-- ═══ F) الإيقاف: عودة البصمة، الأيام العالقة، ظهور الصفحة ═══
do $$ declare t date := app.hr_local_date(now()); act uuid := (select (j ->> 'id')::uuid from a7_ctx); r jsonb; e2 uuid := 'a7000000-0000-4000-8000-0000000000e2'; e1 uuid := 'a7000000-0000-4000-8000-0000000000e1';
        n_pend int; st text;
begin
  -- F1: غير التقنية لا توقف
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_deactivate(%L::uuid) $q$, act), 'PERMISSION_DENIED');
  insert into public.user_permission_overrides (user_id, unit_key, action, effect, reason)
    values ('a7000000-0000-4000-8000-000000000007', 'it.integrations.attendance-manual', 'execute', 'allow', 'a7 individual grant regression');
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000007');
  assert app.can(auth.uid(), 'it.integrations.attendance-manual', 'execute'), 'F1 الاستثناء الفردي صالح في محرك الصلاحيات العام للاختبار';
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_deactivate(%L::uuid) $q$, act), 'PERMISSION_DENIED');
  delete from public.user_permission_overrides where user_id = 'a7000000-0000-4000-8000-000000000007' and unit_key = 'it.integrations.attendance-manual' and action = 'execute';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  perform pg_temp.expect_error($q$ select public.attendance_manual_deactivate('a7000000-0000-4000-8000-00000000ffff'::uuid) $q$, 'ATT_MANUAL_NOT_FOUND');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_deactivate(%L::uuid, %L::date) $q$, act, t + 1), 'ATT_MANUAL_END_INVALID');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_deactivate(%L::uuid, %L::date) $q$, act, t - 4), 'ATT_MANUAL_END_INVALID');   -- أبعد من «يوم قبل البداية»
  -- F1ب: إذا اختير بأثر رجعي أن آخر يوم مغطّى كان أمس، يجب أن تُستبدل أي كتابة يدوية لليوم (بعده) ببصمة الجهاز المخزنة.
  -- هذه الحالة غير الظاهرة في المسار المعتاد مهمة: قد يكون كشف اليوم حُفظ قبل أن يؤكد IT وقت إصلاح الجهاز.
  perform pg_temp.punch(e1, 'A701', t, '08:00'); perform pg_temp.punch(e1, 'A701', t, '16:00');
  r := public.manual_att_sheet_save(act, t, jsonb_build_array(jsonb_build_object('employee_id', e1, 'status', 'absent')), null);
  assert (r ->> 'saved')::int = 1 and exists (select 1 from public.hr_attendance_days where employee_id = e1 and work_date = t and source = 'manual' and status = 'absent'), 'F1ب تجهيز كشف اليوم السابق لإيقاف مبكر';
  -- F2: الإيقاف بآخر يوم مغطّى = أمس ⇒ اليوم يعود للبصمة؛ أمس وقبل أمس يبقيان تحت الكشف
  r := public.attendance_manual_deactivate(act, t - 1, 'أُصلح الجهاز ظهراً');
  assert (r ->> 'ends_on')::date = t - 1 and (r ->> 'pending_days')::int > 0, 'F2 نتيجة الإيقاف: ' || r::text;
  assert (select status from public.attendance_manual_activations where id = act) = 'ended' and (select ended_by from public.attendance_manual_activations where id = act) = 'a7000000-0000-4000-8000-000000000001', 'F2 حالة الإيقاف';
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_deactivate(%L::uuid) $q$, act), 'ATT_MANUAL_ALREADY_ENDED');
  -- بصمة اليوم بعد الإيقاف تُنتج صفاً تلقائياً (البصمة عادت)؛ بصمة أمس لا (يوم تحت الكشف)
  perform pg_temp.punch(e2, 'A702', t, '08:00'); perform pg_temp.punch(e2, 'A702', t, '16:00');
  assert exists (select 1 from public.hr_attendance_days where employee_id = e2 and work_date = t and source = 'auto' and status = 'present'), 'F2 البصمة عادت لليوم بعد آخر يوم مغطّى';
  assert exists (select 1 from public.hr_attendance_days where employee_id = e1 and work_date = t and source = 'auto' and status = 'present' and check_in is not null and check_out is not null), 'F2 يوم حُفظ يدوياً ثم استُبعد من التفعيل يُعاد احتسابه من البصمات المخزنة';
  assert exists (select 1 from public.attendance_manual_entries where employee_id = e1 and work_date = t and activation_id = act and status = 'absent'), 'F2 سجل الكشف القديم يُحفظ لأثر التدقيق حتى بعد عودة البصمة';
  assert exists (select 1 from public.hr_attendance_audit where employee_id = e1 and work_date = t and action = 'reset_auto' and before ->> 'status' = 'absent' and after ->> 'status' = 'present' and reason like '%إيقاف الحضور اليدوي%'), 'F2 إعادة الاحتساب اليدوي موثقة قبل/بعد وسببها';
  assert coalesce((select (c ->> 'days')::int from jsonb_array_elements(public.attendance_manual_month_counts(date_trunc('month', t)::date)) c where c ->> 'employee_id' = e1::text), 0)
      = (select count(*) from public.hr_attendance_days h where h.employee_id = e1 and h.work_date >= date_trunc('month', t)::date and h.work_date < (date_trunc('month', t) + interval '1 month')::date and h.source = 'manual' and h.edit_reason like 'كشف حضور يدوي%'),
    'F2 عدّادات «يدوي» تتبع صفوف الكشف الفعلية لا المُدخَل التاريخي الذي أعيد احتسابه من البصمات';
  perform pg_temp.punch('a7000000-0000-4000-8000-0000000000e7'::uuid, 'A707', t - 2, '08:00');
  assert not exists (select 1 from public.hr_attendance_days where employee_id = 'a7000000-0000-4000-8000-0000000000e7' and work_date = t - 2), 'F2 يوم داخل التفعيل لا يتأثر ببصمة واردة';
  -- إشعار الإيقاف
  assert (select count(*) from public.notifications where dedupe_key = 'att_manual_off:' || act::text) = 5, 'F2 إشعارات الإيقاف';
  -- F3: بعد الإيقاف يبقى الكشف متاحاً للأيام العالقة (المنتهي ما دام فيه معلّق) ويظهر في «تفعيلاتي»
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004');
  assert jsonb_array_length(public.manual_att_my_activations()) = 1 and (public.manual_att_my_activations() -> 0 ->> 'status') = 'ended' and (public.manual_att_my_activations() -> 0 ->> 'pending')::int > 0, 'F3 المنتهي المعلّق ما زال ظاهراً';
  assert (public.manual_att_sheet_get(act, t - 2) ->> 'date')::date = t - 2, 'F3 كشف يوم عالق بعد الإيقاف';
  assert (public.manual_att_sheet_get(act) ->> 'date')::date = t - 1 and (public.manual_att_sheet_get(act) ->> 'to')::date = t - 1, 'F3 آخر يوم مغطّى بعد الإيقاف';
  raise notice 'F1-F3 ✅ الإيقاف، عودة البصمة بعد آخر يوم، الأيام العالقة، الظهور';
end $$;

-- ═══ I) التذكير اليومي (قبل اكتمال الكشوف) ═══
do $$ declare t date := app.hr_local_date(now()); act uuid := (select (j ->> 'id')::uuid from a7_ctx); n1 int; n2 int; n3 int;
begin
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  select count(*) into n1 from public.notifications where dedupe_key like 'att_manual_rem:' || act::text || ':%';
  assert n1 = 0, 'I0 لا تذكير قبل التشغيل';
  n2 := app.manual_att_remind();
  assert n2 >= 2, 'I1 تذكير لمشرف البوابة وغرفة العمليات على الأقل: ' || n2;
  select count(*) into n1 from public.notifications where dedupe_key = 'att_manual_rem:' || act::text || ':' || t::text;
  assert n1 = 2 and exists (select 1 from public.notifications where dedupe_key = 'att_manual_rem:' || act::text || ':' || t::text and user_id = 'a7000000-0000-4000-8000-000000000004' and link = '/transfer-station/manual-attendance'), 'I1 التذكير لمشرف البوابة وغرفة العمليات: ' || n1;
  perform app.manual_att_remind();
  select count(*) into n3 from public.notifications where dedupe_key = 'att_manual_rem:' || act::text || ':' || t::text;
  assert n3 = n1, 'I2 لا تكرار في اليوم نفسه';
  raise notice 'I ✅ التذكير اليومي بمفتاح يومي';
end $$;

-- ═══ E) اعتماد الحضورية ═══
do $$ declare t date := app.hr_local_date(now()); act uuid := (select (j ->> 'id')::uuid from a7_ctx); m date := date_trunc('month', app.hr_local_date(now()) - 1)::date; v_last date;
        n_expect int; r jsonb; pr record; ents jsonb; msg text; orphan_row jsonb; orphan_day jsonb;
begin
  v_last := least((m + interval '1 month - 1 day')::date, t - 1);
  select count(distinct (p.employee_id, p.work_date)) into n_expect from app.manual_att_pending_days(m, v_last) p;
  assert n_expect > 0, 'E0 أيام معلّقة قبل الاعتماد';
  -- E1: غرفة العمليات لا تعتمد: رسالة صريحة بالعدد (لا «أيام غير محتسبة» العامة)
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000002');
  begin perform public.ops_attendance_confirm(m); raise exception 'EXPECTED_ERROR_NOT_RAISED'; exception when others then msg := sqlerrm; end;
  assert msg = 'ATT_MANUAL_SHEETS_PENDING: ' || n_expect, 'E1 رسالة المنع: [' || msg || '] المتوقع ' || n_expect;
  assert (public.attendance_manual_pending_summary(m) ->> 'total')::int = n_expect and jsonb_array_length(public.attendance_manual_pending_summary(m) -> 'items') = 2, 'E1 ملخص المعلّق (تفعيل المحطة + تفعيل الصيانة المنتهي): ' || public.attendance_manual_pending_summary(m)::text;
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_pending_summary(%L::date) $q$, m), 'PERMISSION_DENIED');
  -- E2: غرفة العمليات (المستوى الأعلى) تُكمل كل الكشوف العالقة في الشهر (بما فيها يوم المشرف نفسه وتفعيل الصيانة المنتهي)
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000002');
  for pr in select distinct p.activation_id, p.work_date from app.manual_att_pending_days(m, v_last) p order by 1, 2 loop
    select coalesce(jsonb_agg(jsonb_build_object('employee_id', e ->> 'id', 'status', 'present')), '[]'::jsonb) into ents
      from jsonb_array_elements(public.manual_att_sheet_get(pr.activation_id, pr.work_date) -> 'employees') e where e ->> 'state' = 'open' and e ->> 'entry' is null;
    if jsonb_array_length(ents) > 0 then perform public.manual_att_sheet_save(pr.activation_id, pr.work_date, ents, null); end if;
  end loop;
  select count(distinct (p.employee_id, p.work_date)) into n_expect from app.manual_att_pending_days(m, v_last) p;
  assert n_expect = 0, 'E2 لا أيام معلّقة بعد الإكمال: ' || n_expect;
  -- E2ب: حتى مع وجود إدخال حاضر، لا يكفي تطابق اختيار المراجع معه إذا كان صف الحضور متعارضاً؛ يجب إصلاح الصف نفسه.
  update public.hr_attendance_days set status = 'absent' where employee_id = 'a7000000-0000-4000-8000-0000000000e2' and work_date = t - 2;
  assert (select e ->> 'state' from jsonb_array_elements(public.manual_att_sheet_get(act, t - 2) -> 'employees') e where e ->> 'number' = 'A7-2') = 'other', 'E2ب اختلاف الحالة اليدوية عن إدخال الكشف يتطلب مراجعة';
  r := public.manual_att_sheet_save(act, t - 2, jsonb_build_array(jsonb_build_object('employee_id', 'a7000000-0000-4000-8000-0000000000e2', 'status', 'present')), 'إصلاح تعارض مع إدخال الكشف');
  assert (r ->> 'changed')::int = 1 and exists (select 1 from public.hr_attendance_days where employee_id = 'a7000000-0000-4000-8000-0000000000e2' and work_date = t - 2 and status = 'present')
     and exists (select 1 from public.attendance_manual_entries where employee_id = 'a7000000-0000-4000-8000-0000000000e2' and work_date = t - 2 and status = 'present' and revision = 2), 'E2ب اختيار حالة الإدخال نفسه يُصلح الصف المتعارض بدلاً من تجاهله: ' || r::text;
  -- E2ج: سجل source=manual بلا إدخال مطابق ليس مكتملاً؛ يظل مانعاً للاعتماد حتى مراجعة مخوّلة.
  delete from public.attendance_manual_entries where employee_id = 'a7000000-0000-4000-8000-0000000000e2' and work_date = t - 2;
  assert exists (select 1 from public.hr_attendance_days h where h.employee_id = 'a7000000-0000-4000-8000-0000000000e2' and h.work_date = t - 2 and h.source = 'manual')
     and not exists (select 1 from public.attendance_manual_entries en where en.employee_id = 'a7000000-0000-4000-8000-0000000000e2' and en.work_date = t - 2), 'E2ج تجهيز سجل يدوي يتيم';
  select count(*) into n_expect from app.manual_att_pending_days(t - 2, t - 2, act) p where p.employee_id = 'a7000000-0000-4000-8000-0000000000e2';
  assert n_expect = 1, 'E2ج السجل اليتيم يبقى ضمن الأيام المعلّقة: ' || n_expect;
  orphan_row := (select e from jsonb_array_elements(public.manual_att_sheet_get(act, t - 2) -> 'employees') e where e ->> 'number' = 'A7-2');
  orphan_day := (select d from jsonb_array_elements(public.manual_att_sheet_get(act, t - 2) -> 'days') d where d ->> 'date' = (t - 2)::text);
  assert orphan_row ->> 'state' = 'other' and (public.manual_att_sheet_get(act, t - 2) ->> 'can_review')::boolean
     and (orphan_day ->> 'pending')::int = 1, 'E2ج يُعرض كتعارض بانتظار مراجعة مخوّلة: ' || orphan_row::text || ' / ' || orphan_day::text;
  -- مسجّل البوابة يرى التعارض لكن لا يستطيع اعتماده بنفسه.
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004');
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', 'a7000000-0000-4000-8000-0000000000e2', 'status', 'present')), 'مراجعة') $q$, act, t - 2), 'ATT_MANUAL_EMPLOYEE_LOCKED');
  -- حتى بعد اكتمال بقية الكشوف، يوقف السجل اليتيم اعتماد الشهر وحده.
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format($q$ select app.manual_att_assert_complete(%L::date) $q$, m), 'ATT_MANUAL_SHEETS_PENDING');
  begin perform public.ops_attendance_confirm(m); raise exception 'EXPECTED_ERROR_NOT_RAISED'; exception when others then msg := sqlerrm; end;
  assert msg = 'ATT_MANUAL_SHEETS_PENDING: 1', 'E2ج السجل اليتيم وحده منع اعتماد الشهر: ' || msg;
  -- مسؤول غرفة العمليات يراجع السجل بسجل تدقيق وسبب؛ إنشاء إدخال الكشف المطابق يزيل المانع.
  r := public.manual_att_sheet_save(act, t - 2, jsonb_build_array(jsonb_build_object('employee_id', 'a7000000-0000-4000-8000-0000000000e2', 'status', 'present')), 'مراجعة سجل يدوي قديم');
  assert (r ->> 'changed')::int = 1 and (r ->> 'saved')::int = 0
     and exists (select 1 from public.hr_attendance_days h where h.employee_id = 'a7000000-0000-4000-8000-0000000000e2' and h.work_date = t - 2 and h.edit_reason like '%مراجعة سجل يدوي سابق%')
     and exists (select 1 from public.attendance_manual_entries en where en.employee_id = 'a7000000-0000-4000-8000-0000000000e2' and en.work_date = t - 2), 'E2ج توثيق المراجعة وإنشاء المطابقة: ' || r::text;
  select count(distinct (p.employee_id, p.work_date)) into n_expect from app.manual_att_pending_days(m, v_last) p;
  assert n_expect = 0, 'E2ج بعد المراجعة زال المانع: ' || n_expect;
  -- E3: الاعتماد يمرّ الآن
  r := public.ops_attendance_confirm(m)::jsonb;
  assert r ->> 'status' = 'confirmed', 'E3 اعتُمد الشهر: ' || r::text;
  -- E4: بعد الاعتماد لا كشف ولا تفعيل في الشهر المعتمد
  perform pg_temp.expect_error(format($q$ select public.manual_att_sheet_save(%L::uuid, %L::date, jsonb_build_array(jsonb_build_object('employee_id', 'a7000000-0000-4000-8000-0000000000e1', 'status', 'absent')), 'محاولة بعد الاعتماد') $q$, act, t - 1), 'HR_ATTENDANCE_CONFIRMED');
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_activate('hr', null, 'a7000000-0000-4000-8000-0000000000d3'::uuid, true, 'شهر معتمد', %L::date) $q$, t - 1), 'HR_ATTENDANCE_CONFIRMED');
  -- E5: بعد اكتمال الكشوف يختفي المنتهي من «تفعيلاتي»
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004');
  assert jsonb_array_length(public.manual_att_my_activations()) = 0, 'E5 المنتهي المكتمل لا يظهر';
  -- E6: عدّادات الشهر لشارة «يدوي»
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000003');
  assert jsonb_array_length(public.attendance_manual_month_counts(m)) >= 3 and (select (c ->> 'days')::int from jsonb_array_elements(public.attendance_manual_month_counts(m)) c where c ->> 'employee_id' = 'a7000000-0000-4000-8000-0000000000e1') >= 1, 'E6 عدّادات الشهر';
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000004');
  perform pg_temp.expect_error(format($q$ select public.attendance_manual_month_counts(%L::date) $q$, m), 'PERMISSION_DENIED');
  raise notice 'E ✅ المنع بالرسالة الصريحة، الإكمال، الاعتماد، القفل بعده، الاختفاء، العدّادات';
end $$;

-- ═══ G) أجور المتعهدين في نطاق موقوف البصمة (شهر آذار 2040 — تفعيل مُدرج مباشرة لاستقلال التاريخ) ═══
do $$ declare c uuid := 'a7000000-0000-4000-8000-000000000008'; e6 uuid := 'a7000000-0000-4000-8000-0000000000e6'; m date := '2040-03-01'; w record; st jsonb; ga uuid := gen_random_uuid(); i int;
begin
  insert into public.attendance_manual_activations (id, portal, department_id, include_sub_departments, starts_on, reason) values (ga, 'transfer-station', 'a7000000-0000-4000-8000-0000000000d1', true, '2040-03-10', 'اختبار أجور المتعهدين');
  insert into public.contractor_month_approvals (month, approved_source, approved_by, is_locked) values (m, 'follow_up', 'a7000000-0000-4000-8000-000000000002', true);
  insert into public.contractor_rates (contractor_user_id, month, contractor_daily_wage, worker_daily_wage, set_by) values (c, m, 50000, 30000, 'a7000000-0000-4000-8000-000000000002');
  -- أعداد: 4 آذار (خارج، نقص بالبصمة) · 5 آذار (خارج، بلا سجل) · 12 آذار (داخل، بلا سجل) · 13 آذار (داخل، فيه نقص)
  for i in select unnest(array[4, 5, 12, 13]) loop
    insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c, 1, make_date(2040, 3, i), 'follow_up', 5, 'a7000000-0000-4000-8000-000000000002');
  end loop;
  -- صفّا حضور بنقص 180 دقيقة (دخول 08:00 وخروج 13:00 من شفت 8-16) — أحدهما خارج التفعيل والآخر داخله
  for i in select unnest(array[4, 13]) loop
    insert into public.hr_attendance_days (employee_id, work_date, shift_name, expected_in, expected_out, check_in, check_out, worked_minutes, status, source)
    values (e6, make_date(2040, 3, i), 'x', make_date(2040, 3, i)::timestamp + time '05:00', make_date(2040, 3, i)::timestamp + time '13:00', make_date(2040, 3, i)::timestamp + time '05:00', make_date(2040, 3, i)::timestamp + time '10:00', 300, 'present', 'auto');
  end loop;
  assert (select shortfall_minutes from public.hr_attendance_days where employee_id = e6 and work_date = '2040-03-04') = 180, 'G0 نقص 180: ' || (select shortfall_minutes from public.hr_attendance_days where employee_id = e6 and work_date = '2040-03-04')::text;
  -- G1: خارج التفعيل كما كان: يوم بنقص ⇒ يُدفع باستقطاع، ويوم بلا سجل ⇒ محجوب
  select * into w from app.contractor_wage_days(m, c) where log_date = '2040-03-04';
  assert w.state = 'paid' and w.deduction > 0 and w.day_pay = w.base_pay - w.deduction, 'G1 خارج التفعيل باستقطاع: ' || row_to_json(w)::text;
  select * into w from app.contractor_wage_days(m, c) where log_date = '2040-03-05';
  assert w.state = 'blocked' and w.block_reason = 'no_record' and w.day_pay = 0, 'G1 بلا سجل محجوب: ' || row_to_json(w)::text;
  -- G2: داخل نطاق موقوف: يُدفع من العدد المرسَل (أجر المتعهد + أجور (العدد−1) عاملاً) بلا سجل وبلا استقطاع
  select * into w from app.contractor_wage_days(m, c) where log_date = '2040-03-12';
  assert w.state = 'paid' and w.block_reason is null and w.base_pay = 50000 + 30000 * 4 and w.day_pay = w.base_pay and w.deduction = 0 and w.blocked_pay = 0, 'G2 داخل التفعيل بلا سجل: ' || row_to_json(w)::text;
  select * into w from app.contractor_wage_days(m, c) where log_date = '2040-03-13';
  assert w.state = 'paid' and w.deduction = 0 and w.day_pay = w.base_pay, 'G2 داخل التفعيل رغم نقص السجل: ' || row_to_json(w)::text;
  -- G3: المتعهد لا يدخل «بانتظار الكشف» ولا يُمنع تلقائياً (يبقى المحرّك كما هو له)
  assert not app.manual_att_blocks_auto(e6, '2040-03-12') and app.manual_att_stopped(e6, '2040-03-12') and not app.manual_att_stopped(e6, '2040-03-05'), 'G3 المتعهد خارج الكشف وداخل النطاق الموقوف';
  -- G4: جاهزية الصرف: «لا بصمة» تُحجب إلا إن بقي يوم بلا سجل خارج التفعيل
  update public.employees set biometric_pin = null where id = e6;
  st := app.contractor_wages_state(m);
  assert st -> 'blockers' ? 'no_fingerprint', 'G4 أيام خارج التفعيل بلا بصمة ⇒ حجب: ' || st::text;
  delete from public.contractor_daily_counts where contractor_user_id = c and log_date in ('2040-03-04', '2040-03-05');
  st := app.contractor_wages_state(m);
  assert not (st -> 'blockers' ? 'no_fingerprint') and (st ->> 'contractors')::int = 1, 'G4 كل الأيام داخل التفعيل ⇒ لا حجب بصمة: ' || st::text;
  assert (st ->> 'net_total')::numeric = 2 * (50000 + 30000 * 4), 'G4 صافي الأجور من الأعداد: ' || st::text;
  update public.employees set biometric_pin = 'A706' where id = e6;
  delete from public.attendance_manual_activations where id = ga;
  raise notice 'G ✅ أجور المتعهد من الأعداد في النطاق الموقوف، وبلا تغيير خارجه، وحجب البصمة مشروط';
end $$;

-- ═══ H) الكتالوج والربط والحراس ═══
do $$ declare r record; n int;
begin
  perform pg_temp.as_user('a7000000-0000-4000-8000-000000000001');
  select count(*) into n from public.permission_units where key like '%.manual-attendance' and actions = '{view,create}';
  assert n = 17, 'H1 وحدات الكشف: ' || n;
  assert exists (select 1 from public.permission_units where key = 'it.integrations.attendance-manual' and actions = '{view,execute}'), 'H1 وحدة التفعيل';
  assert not exists (select 1 from public.permission_units where key = 'employee.manual-attendance' or key = 'public.manual-attendance'), 'H1 لا كشف في بوابة المتعهد ولا العامة';
  assert (select count(*) from public.permission_write_bindings where fn in ('attendance_manual_activate', 'attendance_manual_deactivate') and unit_key = 'it.integrations.attendance-manual' and action = 'execute') = 2, 'H2 الربط';
  assert not exists (select 1 from public.permission_write_bindings where fn = 'manual_att_sheet_save'), 'H2 دالة الكشف معفاة (التفويض داخلها)';
  for r in select x.fn from unnest(array['attendance_manual_activate', 'attendance_manual_deactivate', 'manual_att_sheet_save']) x(fn) loop
    assert r.fn = any (app.guarded_write_functions()), 'H3 ضمن قائمة المحمية: ' || r.fn;
    assert exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn and p.prosecdef and p.prosrc like '%app.guard_duplicate(%'), 'H3 غلاف محمي: ' || r.fn;
    assert not has_function_privilege('anon', (select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn limit 1), 'execute'), 'H3 anon محروم: ' || r.fn;
    assert not has_function_privilege('authenticated', (select p.oid from pg_proc p where p.pronamespace = 'app'::regnamespace and p.proname = r.fn || '__raw' limit 1), 'execute'), 'H3 الأصل غير مكشوف: ' || r.fn;
  end loop;
  assert not exists (select 1 from app.write_guard_audit() a where a.fn in ('attendance_manual_activate', 'attendance_manual_deactivate', 'manual_att_sheet_save') and not a.guarded), 'H3 تدقيق الحراس';
  -- H4: القراءات لا تُكشف للزوار
  assert not has_function_privilege('anon', 'public.manual_att_sheet_get(uuid, date)'::regprocedure, 'execute') and not has_function_privilege('anon', 'public.manual_att_my_activations()'::regprocedure, 'execute')
     and not has_function_privilege('anon', 'public.attendance_manual_list(boolean)'::regprocedure, 'execute'), 'H4 anon محروم من القراءات';
  -- H5: كتالوجا الاحتفاظ والتصفير
  assert (select count(*) from app.data_retention_catalog() where table_name in ('attendance_manual_activations', 'attendance_manual_entries') and not deletable and time_column is null) = 2, 'H5 الاحتفاظ';
  assert app.platform_reset_tables(array['attendance']) @> array['attendance_manual_entries', 'attendance_manual_activations'], 'H5 التصفير ضمن فئة الحضور';
  assert not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('attendance_manual_activations', 'attendance_manual_entries') and grantee in ('anon', 'authenticated')), 'H6 لا امتيازات مباشرة على الجدولين';
  raise notice 'H ✅ الكتالوج والربط والحراس والامتيازات والاحتفاظ والتصفير';
end $$;

rollback;
