-- اختبار 00246 · البث المباشر (الأساس): صفة الحساب، نافذة شفت HR (مع عبور منتصف الليل)، رفض خارج الشفت/بلا شفت،
-- الجلسة والنقاط وداخل/خارج الزون، إنهاء تلقائي بنهاية الشفت، الخريطة والبيانات لغرفة العمليات فقط، الإعدادات IT فقط، الاحتفاظ.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('1a000000-0000-0000-0000-000000000001', 'lt-it@t.iq'), ('1a000000-0000-0000-0000-000000000002', 'lt-mgr@t.iq'),
  ('1a000000-0000-0000-0000-000000000003', 'lt-cont@t.iq'), ('1a000000-0000-0000-0000-000000000004', 'lt-ops@t.iq'),
  ('1a000000-0000-0000-0000-000000000005', 'lt-hr@t.iq'), ('1a000000-0000-0000-0000-000000000006', 'lt-mgr-noshift@t.iq'),
  ('1a000000-0000-0000-0000-000000000007', 'lt-night@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('1a000000-0000-0000-0000-000000000001', 'it_admin'), ('1a000000-0000-0000-0000-000000000002', 'department_manager'),
  ('1a000000-0000-0000-0000-000000000003', 'employee'), ('1a000000-0000-0000-0000-000000000004', 'ops_room'),
  ('1a000000-0000-0000-0000-000000000005', 'hr_officer'), ('1a000000-0000-0000-0000-000000000006', 'department_manager'),
  ('1a000000-0000-0000-0000-000000000007', 'department_manager')
on conflict do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (1, 'S1', 'الكرادة', 1, 'karrada'), (2, 'S2', 'الرياض', 2, 'karrada') on conflict (id) do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values
  ('1a000000-0000-0000-0000-000000000002', 'morning', '{1,2}'), ('1a000000-0000-0000-0000-000000000006', 'morning', '{1}'), ('1a000000-0000-0000-0000-000000000007', 'night', '{2}')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values
  ('1a000000-0000-0000-0000-0000000000e2', '1a000000-0000-0000-0000-000000000002', 'LT-M', 'مسؤول البث', '2024-01-01'),
  ('1a000000-0000-0000-0000-0000000000e3', '1a000000-0000-0000-0000-000000000003', 'LT-C', 'متعهد البث', '2024-01-01'),
  ('1a000000-0000-0000-0000-0000000000e6', '1a000000-0000-0000-0000-000000000006', 'LT-N', 'مسؤول بلا شفت', '2024-01-01'),
  ('1a000000-0000-0000-0000-0000000000e7', '1a000000-0000-0000-0000-000000000007', 'LT-NT', 'مسؤول ليلي', '2024-01-01')
on conflict (employee_number) do nothing;
-- زون منطقة 2 (مربع)؛ منطقة 1 بلا زون
insert into public.gps_geofences (name, source, polygon, sector_id) values ('زون الرياض البث', 'platform',
  '[{"lat":33.0,"lng":44.0},{"lat":33.0,"lng":44.1},{"lat":33.1,"lng":44.1},{"lat":33.1,"lng":44.0}]'::jsonb, 2);
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare mgr uuid := '1a000000-0000-0000-0000-000000000002'; cont uuid := '1a000000-0000-0000-0000-000000000003'; ops uuid := '1a000000-0000-0000-0000-000000000004';
        it uuid := '1a000000-0000-0000-0000-000000000001'; noshift uuid := '1a000000-0000-0000-0000-000000000006'; nightu uuid := '1a000000-0000-0000-0000-000000000007';
        now_bg time := (now() at time zone 'Asia/Baghdad')::time; sh_on uuid; sh_off uuid; sh_night uuid; j jsonb; r record; n int; sid uuid; w record;
begin
  -- شفتان: «ساري» يغطي الآن (−1h..+3h)، و«خارج» لا يغطيه؛ وشفت ليلي 22:00→06:00
  insert into public.hr_shifts (name, start_time, end_time) values
    ('شفت ساري للاختبار', (now_bg - interval '1 hour')::time, (now_bg + interval '3 hours')::time),
    ('شفت خارج للاختبار', (now_bg + interval '4 hours')::time, (now_bg + interval '6 hours')::time),
    ('شفت ليلي للاختبار', '22:00', '06:00');
  select id into sh_on from public.hr_shifts where name = 'شفت ساري للاختبار';
  select id into sh_off from public.hr_shifts where name = 'شفت خارج للاختبار';
  select id into sh_night from public.hr_shifts where name = 'شفت ليلي للاختبار';
  insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
    ('1a000000-0000-0000-0000-0000000000e2', sh_on, '2024-01-01'), ('1a000000-0000-0000-0000-0000000000e3', sh_on, '2024-01-01'),
    ('1a000000-0000-0000-0000-0000000000e7', sh_night, '2024-01-01');
  -- إسناد المتعهد إلى منطقة 2 (ذات الزون)
  perform pg_temp.as_user(it);
  perform public.contractor_assign(cont, mgr, 2::smallint, 'اختبار البث');

  -- ═══ L1 · صفة الحساب والمناطق ═══
  if app.live_kind_of(mgr) <> 'manager' or app.live_kind_of(cont) <> 'contractor' or app.live_kind_of(ops) <> 'none' then raise exception 'L1 kind'; end if;
  if app.live_sectors_of(mgr) <> '{1,2}'::smallint[] or app.live_sectors_of(cont) <> '{2}'::smallint[] then raise exception 'L1 sectors'; end if;
  raise notice 'L1 ✅ الصفة والمناطق';

  -- ═══ L2 · نافذة الشفت: عبور منتصف الليل ═══
  select * into w from app.live_shift_window(nightu, ('2026-10-18 23:30'::timestamp at time zone 'Asia/Baghdad'));
  if not w.within or w.shift_start <> ('2026-10-18 22:00'::timestamp at time zone 'Asia/Baghdad') or w.shift_end <> ('2026-10-19 06:00'::timestamp at time zone 'Asia/Baghdad') then raise exception 'L2 night start-side: %', w; end if;
  select * into w from app.live_shift_window(nightu, ('2026-10-19 03:00'::timestamp at time zone 'Asia/Baghdad'));
  if not w.within or w.shift_start <> ('2026-10-18 22:00'::timestamp at time zone 'Asia/Baghdad') then raise exception 'L2 night after-midnight: %', w; end if;
  select * into w from app.live_shift_window(nightu, ('2026-10-19 12:00'::timestamp at time zone 'Asia/Baghdad'));
  if w.within then raise exception 'L2 night noon should be outside'; end if;
  select count(*) into n from app.live_shift_window(noshift); if n <> 0 then raise exception 'L2 noshift should return nothing'; end if;
  raise notice 'L2 ✅ نافذة الشفت الليلي وبلا شفت';

  -- ═══ L3 · الحالة والرفض: بلا شفت / غير مؤهل / خارج الشفت ═══
  perform pg_temp.as_user(noshift);
  j := public.live_share_status();
  if (j ->> 'allowed')::boolean or j ->> 'reason' <> 'LIVE_NO_SHIFT' or j ->> 'kind' <> 'manager' then raise exception 'L3 noshift status: %', j; end if;
  perform pg_temp.expect_error($q$ select public.live_share_ping(33.05, 44.05, 5) $q$, 'LIVE_NO_SHIFT');
  perform pg_temp.as_user(ops);
  j := public.live_share_status();
  if j ->> 'reason' <> 'LIVE_NOT_ELIGIBLE' then raise exception 'L3 ops status: %', j; end if;
  perform pg_temp.expect_error($q$ select public.live_share_ping(33.05, 44.05, 5) $q$, 'LIVE_NOT_ELIGIBLE');
  -- المسؤول على شفت خارج ⇒ LIVE_OUTSIDE_SHIFT
  update public.employee_shift_assignments set shift_id = sh_off where employee_id = '1a000000-0000-0000-0000-0000000000e2';
  perform pg_temp.as_user(mgr);
  j := public.live_share_status();
  if (j ->> 'allowed')::boolean or j ->> 'reason' <> 'LIVE_OUTSIDE_SHIFT' then raise exception 'L3 outside: %', j; end if;
  perform pg_temp.expect_error($q$ select public.live_share_ping(33.05, 44.05, 5) $q$, 'LIVE_OUTSIDE_SHIFT');
  update public.employee_shift_assignments set shift_id = sh_on where employee_id = '1a000000-0000-0000-0000-0000000000e2';
  perform pg_temp.expect_error($q$ select public.live_share_ping(95, 44.05, 5) $q$, 'LIVE_LOCATION_INVALID');
  raise notice 'L3 ✅ الرفض: بلا شفت / غير مؤهل / خارج الشفت / إحداثيات';

  -- ═══ L4 · نبضات المسؤول: جلسة واحدة، داخل الزون (منطقة 2) ثم خارجه، العدادات ═══
  j := public.live_share_status();
  if not (j ->> 'allowed')::boolean or j ->> 'active_session_id' is not null or (j ->> 'interval_minutes')::int <> 15 or not (j ->> 'zone_defined')::boolean then raise exception 'L4 status before: %', j; end if;
  j := public.live_share_ping(33.05, 44.05, 6);
  sid := (j ->> 'session_id')::uuid;
  if not (j ->> 'in_zone')::boolean or (j ->> 'zone_sector_id')::int <> 2 or (j ->> 'point_count')::int <> 1 then raise exception 'L4 ping1: %', j; end if;
  j := public.live_share_ping(33.5, 44.5, 9);
  if (j ->> 'session_id')::uuid <> sid or (j ->> 'in_zone')::boolean or (j ->> 'point_count')::int <> 2 then raise exception 'L4 ping2: %', j; end if;
  select * into r from public.live_track_sessions where id = sid;
  if r.kind <> 'manager' or r.first_in_zone is not true or r.last_in_zone is not false or r.out_of_zone_count <> 1 or r.point_count <> 2 or r.sectors <> '{1,2}'::smallint[] then raise exception 'L4 session: %', r; end if;
  j := public.live_share_status();
  if (j ->> 'active_session_id')::uuid <> sid or (j ->> 'point_count')::int <> 2 then raise exception 'L4 status after: %', j; end if;
  raise notice 'L4 ✅ جلسة المسؤول والنقاط وداخل/خارج الزون';

  -- ═══ L5 · المتعهد يبث؛ غير المخوّل لا يرى؛ غرفة العمليات ترى الاثنين مع الفلتر ═══
  perform pg_temp.as_user(cont);
  j := public.live_share_ping(33.02, 44.02, 4);
  if not (j ->> 'in_zone')::boolean then raise exception 'L5 contractor in zone'; end if;
  perform pg_temp.expect_error($q$ select * from public.live_map_current() $q$, 'LIVE_FORBIDDEN');
  perform pg_temp.expect_error($q$ select * from public.live_sessions_list(current_date, current_date) $q$, 'LIVE_FORBIDDEN');
  perform pg_temp.as_user('1a000000-0000-0000-0000-000000000005');
  perform pg_temp.expect_error($q$ select * from public.live_map_current() $q$, 'LIVE_FORBIDDEN');
  perform pg_temp.as_user(ops);
  select count(*) into n from public.live_map_current() m where m.user_id in (mgr, cont); if n <> 2 then raise exception 'L5 map should show 2, got %', n; end if;
  select count(*) into n from public.live_map_current('contractor') m where m.user_id in (mgr, cont); if n <> 1 then raise exception 'L5 kind filter'; end if;
  select * into r from public.live_map_current() m where m.user_id = mgr;
  if r.full_name <> 'مسؤول البث' or r.area_names <> app.live_sector_names('{1,2}'::smallint[]) or r.latitude <> 33.5 or r.in_zone is not false or r.stale then raise exception 'L5 map row: %', r; end if;
  perform pg_temp.expect_error($q$ select * from public.live_map_current('x') $q$, 'LIVE_KIND_INVALID');
  -- البيانات
  select * into r from public.live_sessions_list((now() at time zone 'Asia/Baghdad')::date, (now() at time zone 'Asia/Baghdad')::date, 'contractor') l where l.user_id = cont;
  if r.manager_name <> 'مسؤول البث' or r.first_in_zone is not true or r.point_count <> 1 or r.ended_at is not null or r.area_names <> app.live_sector_names('{2}'::smallint[]) then raise exception 'L5 list row: %', r; end if;
  select count(*) into n from public.live_sessions_list((now() at time zone 'Asia/Baghdad')::date, (now() at time zone 'Asia/Baghdad')::date, null, mgr); if n <> 1 then raise exception 'L5 user filter'; end if;
  select count(*) into n from public.live_session_points(sid); if n <> 2 then raise exception 'L5 points'; end if;
  perform pg_temp.expect_error($q$ select * from public.live_sessions_list(current_date, current_date - 1) $q$, 'LIVE_RANGE_INVALID');
  raise notice 'L5 ✅ الخريطة والبيانات لغرفة العمليات فقط مع الفلاتر';

  -- ═══ L6 · الإيقاف اليدوي ثم نبضة جديدة = جلسة جديدة؛ نهاية الشفت تُنهي تلقائياً وتختفي من الخريطة ═══
  perform pg_temp.as_user(mgr);
  if not public.live_share_stop() then raise exception 'L6 stop'; end if;
  select * into r from public.live_track_sessions where id = sid; if r.ended_at is null or r.end_reason <> 'manual' then raise exception 'L6 manual end'; end if;
  j := public.live_share_ping(33.05, 44.05, 6);
  if (j ->> 'session_id')::uuid = sid then raise exception 'L6 should open new session'; end if;
  -- محاكاة انتهاء الشفت للجلسة الجديدة
  update public.live_track_sessions set shift_start = now() - interval '9 hours', shift_end = now() - interval '1 minute' where id = (j ->> 'session_id')::uuid;
  perform pg_temp.as_user(ops);
  select count(*) into n from public.live_map_current() m where m.user_id = mgr; if n <> 0 then raise exception 'L6 ended shift still on map'; end if;
  select * into r from public.live_track_sessions where id = (j ->> 'session_id')::uuid;
  if r.ended_at is null or r.end_reason <> 'shift_end' or r.ended_at <> r.shift_end then raise exception 'L6 auto end: %', r; end if;
  raise notice 'L6 ✅ إيقاف يدوي / إنهاء تلقائي بنهاية الشفت';

  -- ═══ L7 · الإعدادات: IT فقط؛ الحدود؛ الاحتفاظ يحذف القديم ═══
  perform pg_temp.expect_error($q$ select public.live_track_settings_set(10, 30) $q$, 'IT_FORBIDDEN');
  j := public.live_track_settings_get(); if (j ->> 'ping_interval_minutes')::int <> 15 or (j ->> 'retention_days')::int <> 30 then raise exception 'L7 defaults: %', j; end if;
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.live_track_settings_set(0, 30) $q$, 'LIVE_INTERVAL_INVALID');
  perform pg_temp.expect_error($q$ select public.live_track_settings_set(10, 3) $q$, 'LIVE_RETENTION_INVALID');
  j := public.live_track_settings_set(10, 7); if (j ->> 'ping_interval_minutes')::int <> 10 then raise exception 'L7 set'; end if;
  update public.live_track_sessions set started_at = now() - interval '9 days' where id = sid;
  update public.live_track_points set recorded_at = now() - interval '9 days' where session_id = sid;
  perform app.live_housekeeping();
  if exists (select 1 from public.live_track_sessions where id = sid) or exists (select 1 from public.live_track_points where session_id = sid) then raise exception 'L7 retention'; end if;
  perform public.live_track_settings_set(15, 30);
  raise notice 'L7 ✅ الإعدادات والاحتفاظ';
end $$;
-- تنظيف
delete from public.live_track_sessions where user_id::text like '1a000000-%';
delete from public.contractor_profiles where user_id = '1a000000-0000-0000-0000-000000000003';
delete from public.employee_shift_assignments where employee_id::text like '1a000000-%';
delete from public.hr_shifts where name like '%للاختبار';
delete from public.gps_geofences where name = 'زون الرياض البث';
