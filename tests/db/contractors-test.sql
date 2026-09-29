-- اختبار المتعهدين (00158): تعيين من غرفة العمليات، فريق المتعهد، حضور المتعهد (موقع/سلفي/صورة) ثم حضور العمال،
-- عزل البيانات، شبكة الشهر، وملخص فريق مسؤول القسم. مستقل — كل الفحوص assert.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('c7000000-0000-0000-0000-000000000001', 'ops-c@t.iq'),
  ('c7000000-0000-0000-0000-000000000002', 'cont1@t.iq'),
  ('c7000000-0000-0000-0000-000000000003', 'cont2@t.iq'),
  ('c7000000-0000-0000-0000-000000000004', 'mgr-c@t.iq'),
  ('c7000000-0000-0000-0000-000000000005', 'garage-c@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('c7000000-0000-0000-0000-000000000001', 'ops_room'),
  ('c7000000-0000-0000-0000-000000000002', 'employee'),
  ('c7000000-0000-0000-0000-000000000003', 'employee'),
  ('c7000000-0000-0000-0000-000000000004', 'department_manager'),
  ('c7000000-0000-0000-0000-000000000005', 'central_garage_officer')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('c7000000-0000-0000-0000-000000000004', 'morning', '{1,2}') on conflict do nothing;
insert into public.garage_user_profiles (user_id, parent_sector) values ('c7000000-0000-0000-0000-000000000005', 'karrada') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title) values
  ('c700d000-0000-0000-0000-000000000001', 'قسم المتعهدين (اختبار)', 'CT-DEPT', null, false) on conflict (id) do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, is_contractor_title) values
  ('c700d000-0000-0000-0000-000000000002', 'متعهد', 'CT-T1', 'c700d000-0000-0000-0000-000000000001', true, true),
  ('c700d000-0000-0000-0000-000000000003', 'كاتب', 'CT-T2', 'c700d000-0000-0000-0000-000000000001', true, false) on conflict (id) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, job_title_id, phone) values
  ('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000002', 'CT-1', 'متعهد أرخيته', '2024-01-01', 'c700d000-0000-0000-0000-000000000002', '0770'),
  ('c7000000-0000-0000-0000-0000000000e2', 'c7000000-0000-0000-0000-000000000003', 'CT-2', 'متعهد الرياض', '2024-01-01', 'c700d000-0000-0000-0000-000000000002', null),
  ('c7000000-0000-0000-0000-0000000000e3', null, 'CT-3', 'كاتب عادي', '2024-01-01', 'c700d000-0000-0000-0000-000000000003', null)
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ C1 · الخانة على المسمى + التعيين من غرفة العمليات فقط ═══
do $$
declare ops uuid := 'c7000000-0000-0000-0000-000000000001'; n int; p public.contractor_profiles;
begin
  perform pg_temp.expect_error($q$ update public.departments set is_contractor_title = true where id = 'c700d000-0000-0000-0000-000000000001' $q$, 'departments_contractor_requires_title');
  perform pg_temp.as_user('c7000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-0000000000e1', 1::smallint) $q$, 'CONTRACTOR_FORBIDDEN');
  perform pg_temp.expect_error($q$ select * from public.contractor_me() $q$, 'CONTRACTOR_NOT_ASSIGNED');
  perform pg_temp.as_user(ops);
  select count(*) into n from public.contractor_candidates(null) where employee_number like 'CT-%';
  if n <> 2 then raise exception 'candidates should be the 2 contractor-title employees, got %', n; end if;
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-0000000000e3', 1::smallint) $q$, 'CONTRACTOR_NOT_CONTRACTOR_TITLE');
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-0000000000e1', 99::smallint) $q$, 'CONTRACTOR_SECTOR_INVALID');
  p := public.contractor_assign('c7000000-0000-0000-0000-0000000000e1', 1::smallint, 'morning', 'أرخيته');
  if p.sector_id <> 1 or not p.is_active then raise exception 'assign failed'; end if;
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-0000000000e2', 1::smallint) $q$, 'CONTRACTOR_SECTOR_TAKEN');
  p := public.contractor_assign('c7000000-0000-0000-0000-0000000000e2', 2::smallint);
  select count(*) into n from public.contractor_audit_log where action = 'assign'; if n < 2 then raise exception 'audit assign missing'; end if;
  raise notice 'C1 ok';
end $$;

-- ═══ C2 · فريقي: إضافة/إزالة عمال، القاطع والمنطقة تلقائيان، عزل بين المتعهدين ═══
do $$
declare c1 uuid := 'c7000000-0000-0000-0000-000000000002'; c2 uuid := 'c7000000-0000-0000-0000-000000000003'; w public.contractor_workers; n int; me record;
begin
  perform pg_temp.as_user(c1);
  w := public.contractor_add_worker('عامل أول', '0781');
  if w.sector_id <> 1 or w.parent_sector <> 'karrada' then raise exception 'worker sector should come from contractor: % %', w.sector_id, w.parent_sector; end if;
  perform public.contractor_add_worker('عامل ثانٍ', null);
  perform public.contractor_add_worker('عامل ثالث', null);
  perform pg_temp.expect_error($q$ select public.contractor_add_worker('عامل أول') $q$, 'CONTRACTOR_WORKER_DUPLICATE');
  perform pg_temp.expect_error($q$ select public.contractor_add_worker('x') $q$, 'CONTRACTOR_WORKER_NAME_INVALID');
  select * into me from public.contractor_me();
  if me.workers_count <> 3 or me.area_name <> 'أرخيته' or me.checked_in_today then raise exception 'me wrong: %', me; end if;
  perform pg_temp.as_user(c2);
  select count(*) into n from public.contractor_my_workers(); if n <> 0 then raise exception 'isolation: c2 sees c1 workers'; end if;
  perform pg_temp.expect_error(format($q$ select public.contractor_remove_worker('%s') $q$, w.id), 'CONTRACTOR_WORKER_NOT_FOUND');
  perform pg_temp.as_user(c1);
  perform public.contractor_remove_worker(w.id, 'ترك العمل');
  select count(*) into n from public.contractor_my_workers(); if n <> 2 then raise exception 'remove failed'; end if;
  raise notice 'C2 ok';
end $$;

-- ═══ C3 · حضور المتعهد قبل العمال؛ الموقع والصورتان إلزامية؛ داخل/خارج الزون؛ مرة واحدة يومياً ═══
do $$
declare c1 uuid := 'c7000000-0000-0000-0000-000000000002'; ops uuid := 'c7000000-0000-0000-0000-000000000001'; wid uuid; c public.contractor_checkins; n int; me record;
begin
  perform pg_temp.as_user(c1);
  select id into wid from public.contractor_my_workers() limit 1;
  perform pg_temp.expect_error(format($q$ select public.contractor_mark_attendance('%s', 'present') $q$, wid), 'CONTRACTOR_CHECKIN_REQUIRED');
  perform pg_temp.expect_error($q$ select public.contractor_checkin(null, 44.4, 5, 'u/selfie.jpg', 'u/team.jpg') $q$, 'CONTRACTOR_LOCATION_REQUIRED');
  perform pg_temp.expect_error($q$ select public.contractor_checkin(33.3, 44.4, 5, '', 'u/team.jpg') $q$, 'CONTRACTOR_SELFIE_REQUIRED');
  perform pg_temp.expect_error($q$ select public.contractor_checkin(33.3, 44.4, 5, 'u/selfie.jpg', null) $q$, 'CONTRACTOR_TEAM_PHOTO_REQUIRED');
  -- لا زونات للمنطقة 1 → in_zone null
  c := public.contractor_checkin(33.30, 44.40, 8, 'u/selfie.jpg', 'u/team.jpg');
  if c.in_zone is not null or c.workers_count_at_checkin <> 2 or c.log_date <> app.baghdad_today() then raise exception 'checkin wrong: %', c; end if;
  perform pg_temp.expect_error($q$ select public.contractor_checkin(33.3, 44.4, 5, 'u/s2.jpg', 'u/t2.jpg') $q$, 'CONTRACTOR_ALREADY_CHECKED_IN');
  -- منطقة 2 لها زون مربع؛ متعهدها يسجل خارجه → in_zone=false + إشعار غرفة العمليات
  insert into public.gps_geofences (name, source, polygon, sector_id) values ('زون الرياض', 'platform',
    '[{"lat":33.0,"lng":44.0},{"lat":33.0,"lng":44.1},{"lat":33.1,"lng":44.1},{"lat":33.1,"lng":44.0}]'::jsonb, 2);
  perform pg_temp.as_user('c7000000-0000-0000-0000-000000000003');
  c := public.contractor_checkin(33.5, 44.5, 8, 'v/selfie.jpg', 'v/team.jpg');
  if c.in_zone is not false then raise exception 'should be out of zone'; end if;
  select count(*) into n from public.notifications where user_id = ops and dedupe_key like 'contractor_out_of_zone:%';
  if n <> 1 then raise exception 'ops should get out-of-zone notification, got %', n; end if;
  if app.point_in_sector_zones(2::smallint, 33.05, 44.05) is not true then raise exception 'inside point should be true'; end if;
  -- العمال: حاضر/غائب فقط، اليوم أو أمس، تعديل نفس اليوم يستبدل
  perform pg_temp.as_user(c1);
  perform pg_temp.expect_error(format($q$ select public.contractor_mark_attendance('%s', 'leave') $q$, wid), 'CONTRACTOR_STATUS_INVALID');
  perform pg_temp.expect_error(format($q$ select public.contractor_mark_attendance('%s', 'present', current_date + 1) $q$, wid), 'CONTRACTOR_DATE_FUTURE');
  perform pg_temp.expect_error(format($q$ select public.contractor_mark_attendance('%s', 'present', current_date - 5) $q$, wid), 'CONTRACTOR_DATE_LOCKED');
  n := public.contractor_mark_all('present'); if n <> 2 then raise exception 'mark_all should mark 2, got %', n; end if;
  perform public.contractor_mark_attendance(wid, 'absent');
  select * into me from public.contractor_me();
  if me.today_present <> 1 or me.today_absent <> 1 or me.today_unmarked <> 0 or not me.checked_in_today then raise exception 'today counters wrong: %', me; end if;
  select count(*) into n from public.contractor_worker_attendance where contractor_employee_id = 'c7000000-0000-0000-0000-0000000000e1' and log_date = app.baghdad_today();
  if n <> 2 then raise exception 'one row per worker per day expected, got %', n; end if;
  -- شبكة الشهر
  select count(*) into n from public.contractor_month_grid() g where (g.days ->> extract(day from app.baghdad_today())::int::text) is not null;
  if n <> 2 then raise exception 'month grid should have today for 2 workers, got %', n; end if;
  raise notice 'C3 ok';
end $$;

-- ═══ C4 · مسؤول القسم: متعهد المنطقة + الأعداد + آليات تعمل الآن في منطقته ═══
do $$
declare mgr uuid := 'c7000000-0000-0000-0000-000000000004'; r record; n int;
begin
  perform pg_temp.as_user(mgr);
  select count(*) into n from public.manager_team_summary(); if n <> 2 then raise exception 'manager has 2 areas, got %', n; end if;
  select * into r from public.manager_team_summary() t where t.sector_id = 1;
  if r.contractor_name <> 'متعهد أرخيته' or r.workers_count <> 2 or r.today_present <> 1 or r.today_absent <> 1 or not r.contractor_checked_in then raise exception 'summary area1 wrong: %', r; end if;
  select * into r from public.manager_team_summary() t where t.sector_id = 2;
  if r.in_zone is not false or r.vehicles_now <> 0 then raise exception 'summary area2 wrong: %', r; end if;
  perform pg_temp.as_user('c7000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error($q$ select * from public.manager_team_summary() $q$, 'MANAGER_FORBIDDEN');
  -- إلغاء تعيين بسبب
  perform pg_temp.as_user('c7000000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error($q$ select public.contractor_unassign('c7000000-0000-0000-0000-0000000000e2', '') $q$, 'CONTRACTOR_REASON_REQUIRED');
  perform public.contractor_unassign('c7000000-0000-0000-0000-0000000000e2', 'انتهاء العقد');
  perform pg_temp.as_user(mgr);
  select * into r from public.manager_team_summary() t where t.sector_id = 2;
  if r.contractor_name is not null then raise exception 'unassigned contractor should disappear'; end if;
  raise notice 'C4 ok';
end $$;

-- ═══ C5 · HR: حفظ مسمى بخانة «متعهد» يظهر في العرض ويغذّي قائمة المرشحين ═══
do $$
declare hr uuid := 'c7000000-0000-0000-0000-000000000006'; tid uuid; n int;
begin
  insert into auth.users (id, email) values (hr, 'hr-c@t.iq') on conflict do nothing;
  insert into public.user_roles (user_id, role) values (hr, 'hr_officer') on conflict do nothing;
  perform pg_temp.as_user(hr);
  tid := public.hr_department_save(null, 'متعهد نظافة', 'CT-T9', 'c700d000-0000-0000-0000-000000000001', true, null, true, false, null, true);
  select count(*) into n from public.hr_departments_overview() o where o.id = tid and o.is_contractor_title; if n <> 1 then raise exception 'overview should flag contractor title'; end if;
  -- ليست مسمى → الخانة تُهمل
  tid := public.hr_department_save(null, 'قسم فرعي', 'CT-D9', 'c700d000-0000-0000-0000-000000000001', true, null, false, false, null, true);
  select count(*) into n from public.departments d where d.id = tid and d.is_contractor_title; if n <> 0 then raise exception 'non-title must not be contractor'; end if;
  raise notice 'C5 ok';
end $$;
