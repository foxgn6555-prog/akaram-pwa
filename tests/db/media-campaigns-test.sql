-- اختبار 00164: تفاصيل الحملة من مسؤول القسم + تذكراتي بالتاريخ + دمج التذاكر في الإعلام + تقرير غرفة العمليات. مستقل (بادئة fb).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('fb000000-0000-0000-0000-000000000001', 'dm4-m@t.iq'), ('fb000000-0000-0000-0000-000000000002', 'dm7-m@t.iq'),
  ('fb000000-0000-0000-0000-000000000003', 'media-m@t.iq'), ('fb000000-0000-0000-0000-000000000004', 'ops-m@t.iq'), ('fb000000-0000-0000-0000-000000000005', 'emp-m@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fb000000-0000-0000-0000-000000000001', 'department_manager'), ('fb000000-0000-0000-0000-000000000002', 'department_manager'),
  ('fb000000-0000-0000-0000-000000000003', 'media_officer'), ('fb000000-0000-0000-0000-000000000004', 'ops_room'), ('fb000000-0000-0000-0000-000000000005', 'employee')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('fb000000-0000-0000-0000-000000000001', 'morning', '{4}'), ('fb000000-0000-0000-0000-000000000002', 'morning', '{7}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone, biometric_pin) values
  ('fb000000-0000-0000-0000-0000000000e1', 'fb000000-0000-0000-0000-000000000001', 'MC-M4', 'مسؤول قسم 4', '2024-01-01', '0781', 'm1')
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
create or replace function pg_temp.photos(p_user uuid, p_n int) returns jsonb language sql as
$$ select jsonb_agg(jsonb_build_object('storage_path', p_user::text || '/p' || g || '.jpg', 'caption', '')) from generate_series(1, p_n) g $$;
create table pg_temp.ids (k text primary key, v uuid);

-- ═══ T1 · الإرسال مع التفاصيل: تحقق المدخلات، الصور إلزامية، الأعداد والآليات تُحفظ، exec_date افتراضياً اليوم ═══
do $$
declare u uuid := 'fb000000-0000-0000-0000-000000000001'; r public.media_submissions; d jsonb;
begin
  perform pg_temp.as_user(u);
  perform pg_temp.expect_error($q$ select public.media_send_photos('campaign', 'حملة', null, null, '[]'::jsonb, '{}'::jsonb) $q$, 'MEDIA_PHOTOS_COUNT_INVALID');
  perform pg_temp.expect_error(format($q$ select public.media_send_photos('campaign', 'حملة', 'غسل الشارع', null, %L::jsonb, '{"supervisors": -1}'::jsonb) $q$, pg_temp.photos(u, 1)), 'MEDIA_COUNT_INVALID');
  perform pg_temp.expect_error(format($q$ select public.media_send_photos('campaign', 'حملة', 'غسل الشارع', null, %L::jsonb, '{"exec_date": "2099-01-01"}'::jsonb) $q$, pg_temp.photos(u, 1)), 'MEDIA_EXEC_DATE_INVALID');
  d := '{"location": "ساحة الفردوس", "exec_date": "2026-09-28", "supervisors": 2, "workers": 15, "vehicles": {"tipper": 1, "tanker": 2, "compactor": 0, "loader": 1, "sweeper": 0}}';
  r := public.media_send_photos('campaign', 'حملة تنظيف الكرادة', 'غسل الشارع', 'ملاحظة', pg_temp.photos(u, 3), d);
  if r.location <> 'ساحة الفردوس' or r.exec_date <> '2026-09-28' or r.supervisors_count <> 2 or r.workers_count <> 15 or r.veh_tanker <> 2 or r.veh_loader <> 1 or r.photo_count <> 3 or r.sector_parent <> 'karrada' then raise exception 'details wrong: %', r; end if;
  insert into pg_temp.ids values ('c1', r.id);
  -- شارع بلا تفاصيل: exec_date = اليوم، الأعداد صفر
  r := public.media_send_photos('street', 'شارع الكرادة داخل', null, null, pg_temp.photos(u, 2), null);
  if r.exec_date <> r.event_date or r.supervisors_count <> 0 or r.location is not null then raise exception 'street defaults wrong: %', r; end if;
  insert into pg_temp.ids values ('s1', r.id);
  r := public.media_send_photos('street', 'شارع الكرادة داخل', null, null, pg_temp.photos(u, 4), '{"exec_date": "2026-09-20", "workers": 6}');
  insert into pg_temp.ids values ('s2', r.id);
  perform pg_temp.as_user('fb000000-0000-0000-0000-000000000002');
  r := public.media_send_photos('school', 'مدرسة الزعفرانية', 'غسل المدرسة', null, pg_temp.photos('fb000000-0000-0000-0000-000000000002', 1), '{"exec_date": "2026-09-28", "workers": 4}');
  insert into pg_temp.ids values ('k1', r.id);
  raise notice 'T1 ✅ الإرسال مع التفاصيل';
end $$;

-- ═══ T2 · تذكراتي بالتاريخ ═══
do $$
declare n int;
begin
  perform pg_temp.as_user('fb000000-0000-0000-0000-000000000001');
  select count(*) into n from public.media_my_submissions(); if n <> 3 then raise exception 'mine all %', n; end if;
  select count(*) into n from public.media_my_submissions('2026-09-28', '2026-09-28'); if n <> 1 then raise exception 'mine day %', n; end if;
  select count(*) into n from public.media_my_submissions('2026-09-20', '2026-09-28', 'street'); if n <> 1 then raise exception 'mine street %', n; end if;
  select count(*) into n from public.media_my_submissions((now() at time zone 'Asia/Baghdad')::date, (now() at time zone 'Asia/Baghdad')::date); if n <> 1 then raise exception 'mine today %', n; end if;
  perform pg_temp.as_user('fb000000-0000-0000-0000-000000000002');
  select count(*) into n from public.media_my_submissions(); if n <> 1 then raise exception 'other manager sees only his: %', n; end if;
  raise notice 'T2 ✅ تذكراتي بالتاريخ';
end $$;

-- ═══ T3 · الدمج في الإعلام: الإعلام فقط، ≥2، نفس القاطع، نشطة؛ الصور تنتقل بمعرّفاتها؛ الأصول تُؤرشف ═══
do $$
declare s1 uuid := (select v from pg_temp.ids where k = 's1'); s2 uuid := (select v from pg_temp.ids where k = 's2'); k1 uuid := (select v from pg_temp.ids where k = 'k1'); c1 uuid := (select v from pg_temp.ids where k = 'c1');
  r public.media_submissions; m record; n int; pid uuid;
begin
  perform pg_temp.as_user('fb000000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error(format($q$ select public.media_submissions_merge(array['%s','%s']::uuid[], 'شارع الكرادة داخل') $q$, s1, s2), 'MEDIA_FORBIDDEN');
  perform pg_temp.as_user('fb000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error(format($q$ select public.media_submissions_merge(array['%s']::uuid[], 'x y') $q$, s1), 'MEDIA_MERGE_MIN_TWO');
  perform pg_temp.expect_error(format($q$ select public.media_submissions_merge(array['%s','%s']::uuid[], 'شارع') $q$, s1, k1), 'MEDIA_MERGE_DIFFERENT_SECTORS');
  select id into pid from public.media_submission_photos where submission_id = s1 limit 1;
  r := public.media_submissions_merge(array[s1, s2], 'شارع الكرادة داخل — غسل', 'غسل الشارع');
  if r.photo_count <> 6 or r.merged_count <> 2 or r.work_type <> 'غسل الشارع' or r.exec_date <> '2026-09-20' or r.workers_count <> 6 or r.status <> 'submitted' then raise exception 'merged wrong: %', r; end if;
  select count(*) into n from public.media_submission_photos where submission_id = r.id; if n <> 6 then raise exception 'photos moved %', n; end if;
  select submission_id into m from public.media_submission_photos where id = pid; if m.submission_id <> r.id then raise exception 'photo id must be stable'; end if;
  select * into m from public.media_submissions where id = s1; if m.status <> 'archived' or m.merged_into <> r.id or m.archive_reason not like 'دُمجت في%' or m.photo_count <> 0 then raise exception 'origin not archived: %', m; end if;
  perform pg_temp.expect_error(format($q$ select public.media_submissions_merge(array['%s','%s']::uuid[], 'مرة ثانية') $q$, s1, c1), 'MEDIA_MERGE_NOT_ACTIVE');
  -- قائمة الإعلام: المدموجة تظهر نشطة، والأصول في الأرشيف
  select count(*) into n from public.media_submissions_list('karrada', 'active') l where l.id = r.id; if n <> 1 then raise exception 'merged not listed'; end if;
  select count(*) into n from public.media_submissions_list('karrada', 'archived') l where l.id in (s1, s2); if n <> 2 then raise exception 'origins not archived in list'; end if;
  insert into pg_temp.ids values ('merged', r.id);
  raise notice 'T3 ✅ الدمج';
end $$;

-- ═══ T4 · تقرير غرفة العمليات: صلاحية، فلاتر النوع/القاطع/القسم/التاريخ، الأصول المدموجة لا تتكرر، عمود الصور ═══
do $$
declare n int; r record;
begin
  perform pg_temp.as_user('fb000000-0000-0000-0000-000000000005');
  perform pg_temp.expect_error($q$ select * from public.ops_campaigns_report() $q$, 'OPS_ROOM_FORBIDDEN');
  perform pg_temp.as_user('fb000000-0000-0000-0000-000000000004');
  select count(*) into n from public.ops_campaigns_report() x where x.id in (select v from pg_temp.ids); if n <> 3 then raise exception 'report rows % (expected c1 + merged + k1)', n; end if;
  select count(*) into n from public.ops_campaigns_report('school') x where x.id in (select v from pg_temp.ids); if n <> 1 then raise exception 'school filter %', n; end if;
  select count(*) into n from public.ops_campaigns_report(null, 'karrada') x where x.id in (select v from pg_temp.ids); if n <> 2 then raise exception 'parent filter %', n; end if;
  select count(*) into n from public.ops_campaigns_report(null, null, 7::smallint) x where x.id in (select v from pg_temp.ids); if n <> 1 then raise exception 'sector filter %', n; end if;
  select count(*) into n from public.ops_campaigns_report(null, null, null, '2026-09-28', '2026-09-28') x where x.id in (select v from pg_temp.ids); if n <> 2 then raise exception 'date filter %', n; end if;
  select * into r from public.ops_campaigns_report('campaign') x where x.id = (select v from pg_temp.ids where k = 'c1');
  if r.location <> 'ساحة الفردوس' or r.department_names is null or r.sector_parent_name <> 'الكرادة' or not r.has_photos or r.veh_tanker <> 2 then raise exception 'report row wrong: %', r; end if;
  raise notice 'T4 ✅ تقرير غرفة العمليات';
end $$;
