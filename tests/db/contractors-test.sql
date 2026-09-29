-- اختبار المتعهدين (00158→00159): حساب متعهد من التطوير المركزية مُسند إلى مسؤول قسم (المنطقة/القاطع/الشفت من ملفه)،
-- فريق المتعهد، حضور المتعهد (موقع/سلفي/صورة) ثم حضور العمال، عزل البيانات، شبكة الشهر، وملخص فريق مسؤول القسم. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('c7000000-0000-0000-0000-000000000001', 'it-c@t.iq'),
  ('c7000000-0000-0000-0000-000000000002', 'cont1@t.iq'),
  ('c7000000-0000-0000-0000-000000000003', 'cont2@t.iq'),
  ('c7000000-0000-0000-0000-000000000004', 'mgr-c@t.iq'),
  ('c7000000-0000-0000-0000-000000000005', 'ops-c@t.iq'),
  ('c7000000-0000-0000-0000-000000000007', 'mgr-c2@t.iq'),
  ('c7000000-0000-0000-0000-000000000008', 'plain@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('c7000000-0000-0000-0000-000000000001', 'it_admin'),
  ('c7000000-0000-0000-0000-000000000002', 'employee'),
  ('c7000000-0000-0000-0000-000000000003', 'employee'),
  ('c7000000-0000-0000-0000-000000000004', 'department_manager'),
  ('c7000000-0000-0000-0000-000000000005', 'ops_room'),
  ('c7000000-0000-0000-0000-000000000007', 'department_manager'),
  ('c7000000-0000-0000-0000-000000000008', 'hr_officer')
on conflict do nothing;
-- مسؤول 1: منطقتان (1,2) صباحي؛ مسؤول 2: منطقة واحدة (5) مسائي
insert into public.manager_profiles (user_id, shift, sectors) values
  ('c7000000-0000-0000-0000-000000000004', 'morning', '{1,2}'), ('c7000000-0000-0000-0000-000000000007', 'evening', '{5}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone) values
  ('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000002', 'CT-1', 'متعهد أرخيته', '2024-01-01', '0770'),
  ('c7000000-0000-0000-0000-0000000000e4', 'c7000000-0000-0000-0000-000000000004', 'CT-M', 'مسؤول الكرادة', '2024-01-01', null)
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ C1 · الإسناد من التطوير المركزية فقط: مسؤول القسم → منطقة من مناطقه → الشفت من المسؤول ═══
do $$
declare it uuid := 'c7000000-0000-0000-0000-000000000001'; n int; p public.contractor_profiles; r record;
begin
  perform pg_temp.as_user('c7000000-0000-0000-0000-000000000005');   -- غرفة العمليات: ترى الخيارات لكن لا تُسند
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000004', 1::smallint) $q$, 'CONTRACTOR_FORBIDDEN');
  perform pg_temp.as_user('c7000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error($q$ select * from public.contractor_me() $q$, 'CONTRACTOR_NOT_ASSIGNED');
  perform pg_temp.as_user(it);
  select count(*) into n from public.contractor_manager_options() where user_id in ('c7000000-0000-0000-0000-000000000004','c7000000-0000-0000-0000-000000000007');
  if n <> 2 then raise exception 'manager options should list both managers, got %', n; end if;
  select * into r from public.contractor_manager_options() o where o.user_id = 'c7000000-0000-0000-0000-000000000004';
  if r.full_name <> 'مسؤول الكرادة' or jsonb_array_length(r.areas) <> 2 then raise exception 'manager option wrong: %', r; end if;
  -- ليس مسؤول قسم
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000008', 1::smallint) $q$, 'CONTRACTOR_MANAGER_INVALID');
  -- الحساب ليس بدور employee (بوابة المتعهد)
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-000000000008', 'c7000000-0000-0000-0000-000000000004', 1::smallint) $q$, 'CONTRACTOR_ROLE_REQUIRED');
  -- المسؤول له منطقتان → يجب اختيار واحدة، ومن مناطقه فقط
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000004') $q$, 'CONTRACTOR_SECTOR_REQUIRED');
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000004', 5::smallint) $q$, 'CONTRACTOR_SECTOR_NOT_MANAGERS');
  p := public.contractor_assign('c7000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000004', 1::smallint, 'أرخيته');
  if p.sector_id <> 1 or p.shift <> 'morning' or not p.is_active then raise exception 'assign failed: %', p; end if;
  -- منطقة واحدة = متعهد واحد
  perform pg_temp.expect_error($q$ select public.contractor_assign('c7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000004', 1::smallint) $q$, 'CONTRACTOR_SECTOR_TAKEN');
  -- المسؤول 2 له منطقة واحدة → تُشتق تلقائياً مع شفته
  p := public.contractor_assign('c7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000007');
  if p.sector_id <> 5 or p.shift <> 'evening' then raise exception 'auto sector/shift failed: %', p; end if;
  -- نقله إلى المسؤول 1 منطقة 2
  p := public.contractor_assign('c7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000004', 2::smallint);
  if p.sector_id <> 2 or p.shift <> 'morning' then raise exception 'reassign failed'; end if;
  select * into r from public.contractor_profile_for_user('c7000000-0000-0000-0000-000000000003');
  if r.manager_name <> 'مسؤول الكرادة' or r.area_name <> 'الرياض' then raise exception 'profile_for_user wrong: %', r; end if;
  select count(*) into n from public.contractor_audit_log where action = 'assign'; if n < 3 then raise exception 'audit assign missing'; end if;
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
declare c1 uuid := 'c7000000-0000-0000-0000-000000000002'; ops uuid := 'c7000000-0000-0000-0000-000000000005'; wid uuid; c public.contractor_checkins; n int; me record;
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
  select count(*) into n from public.contractor_worker_attendance where contractor_user_id = 'c7000000-0000-0000-0000-000000000002' and log_date = app.baghdad_today();
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
  -- مسؤول آخر لا يرى متعهدي غيره
  perform pg_temp.as_user('c7000000-0000-0000-0000-000000000007');
  select count(*) into n from public.manager_team_summary() t where t.contractor_name is not null; if n <> 0 then raise exception 'manager2 should see no contractors'; end if;
  -- إلغاء الإسناد بسبب (التطوير المركزية)
  perform pg_temp.as_user('c7000000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error($q$ select public.contractor_unassign('c7000000-0000-0000-0000-000000000003', '') $q$, 'CONTRACTOR_REASON_REQUIRED');
  perform public.contractor_unassign('c7000000-0000-0000-0000-000000000003', 'انتهاء العقد');
  perform pg_temp.as_user(mgr);
  select * into r from public.manager_team_summary() t where t.sector_id = 2;
  if r.contractor_name is not null then raise exception 'unassigned contractor should disappear'; end if;
  raise notice 'C4 ok';
end $$;

