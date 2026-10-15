-- اختبار وحدة «متابعة المتعهدين والعمال» لمسؤول القاطع (00261): نطاق القواطع الأم، تفاصيل التواجد والصور،
-- الأعداد الثلاثة، كتابة عدد القاطع (اليوم فقط، صف واحد)، فلاتر المتعهد/القاطع، السجل الشهري، الملخص، العزل. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('ac000000-0000-0000-0000-000000000001', 'it-ac@t.iq'), ('ac000000-0000-0000-0000-000000000002', 'sm-ac@t.iq'),
  ('ac000000-0000-0000-0000-000000000003', 'fu-ac@t.iq'), ('ac000000-0000-0000-0000-000000000004', 'mgr-ac@t.iq'),
  ('ac000000-0000-0000-0000-000000000005', 'c1-ac@t.iq'), ('ac000000-0000-0000-0000-000000000006', 'mgr2-ac@t.iq'),
  ('ac000000-0000-0000-0000-000000000007', 'c2-ac@t.iq'), ('ac000000-0000-0000-0000-000000000008', 'sm2-ac@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ac000000-0000-0000-0000-000000000001', 'it_admin'), ('ac000000-0000-0000-0000-000000000002', 'admin_ops'),
  ('ac000000-0000-0000-0000-000000000003', 'follow_up'), ('ac000000-0000-0000-0000-000000000004', 'department_manager'),
  ('ac000000-0000-0000-0000-000000000005', 'employee'), ('ac000000-0000-0000-0000-000000000006', 'department_manager'),
  ('ac000000-0000-0000-0000-000000000007', 'employee'), ('ac000000-0000-0000-0000-000000000008', 'admin_ops')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('ac000000-0000-0000-0000-000000000004', 'morning', '{1}'), ('ac000000-0000-0000-0000-000000000006', 'evening', '{5}') on conflict do nothing;
insert into public.sector_manager_profiles (user_id, parent_sectors) values ('ac000000-0000-0000-0000-000000000002', '{karrada}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone) values
  ('ac000000-0000-0000-0000-0000000000e1', 'ac000000-0000-0000-0000-000000000005', 'AC-C1', 'متعهد أرخيته ق', '2024-01-01', '07701'),
  ('ac000000-0000-0000-0000-0000000000e2', 'ac000000-0000-0000-0000-000000000007', 'AC-C2', 'متعهد سندباد ق', '2024-01-01', '07702')
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
declare it uuid := 'ac000000-0000-0000-0000-000000000001'; sm uuid := 'ac000000-0000-0000-0000-000000000002'; fu uuid := 'ac000000-0000-0000-0000-000000000003';
        c1 uuid := 'ac000000-0000-0000-0000-000000000005'; c2 uuid := 'ac000000-0000-0000-0000-000000000007'; sm2 uuid := 'ac000000-0000-0000-0000-000000000008';
        r record; n int;
begin
  perform pg_temp.as_user(it);
  perform public.contractor_assign(c1, 'ac000000-0000-0000-0000-000000000004', 1::smallint);
  perform public.contractor_assign(c2, 'ac000000-0000-0000-0000-000000000006', 5::smallint);
  perform public.follow_up_assign(fu, '{karrada}', '{}');
  -- المتعهد 1 يثبت تواجده بعدد 16؛ المتابعة تكتب 15
  perform pg_temp.as_user(c1);
  perform public.contractor_checkin(33.3, 44.4, 6, 'x/s.jpg', 'x/t.jpg', 16);
  perform pg_temp.as_user(fu);
  perform public.follow_up_set_headcount(c1, 15);
  -- مسؤول قاطع الكرادة: يرى المتعهد 1 فقط (المتعهد 2 في الزعفرانية)
  perform pg_temp.as_user(sm);
  select count(*) into n from public.sector_manager_contractors(); if n <> 1 then raise exception 'sm should see 1, got %', n; end if;
  select * into r from public.sector_manager_contractors() x where x.contractor_user_id = c1;
  if not r.checked_in or r.latitude <> 33.3 or r.accuracy_m <> 6 or r.selfie_path <> 'x/s.jpg' or r.team_photo_path <> 'x/t.jpg'
     or r.contractor_headcount <> 16 or r.follow_up_headcount <> 15 or r.my_headcount is not null or not r.editable
     or r.contractor_phone <> '07701' or r.department_manager_name is null or r.parent_sector <> 'karrada' then raise exception 'row wrong: %', r; end if;
  -- فلاتر
  select count(*) into n from public.sector_manager_contractors(null, c2); if n <> 0 then raise exception 'filter by out-of-scope contractor must be empty'; end if;
  select count(*) into n from public.sector_manager_contractors(null, null, 'karrada'); if n <> 1 then raise exception 'parent filter'; end if;
  perform pg_temp.expect_error($q$ select * from public.sector_manager_contractors(null, null, 'zaafaraniya') $q$, 'PARENT_SECTOR_OUT_OF_SCOPE');
  -- كتابة عدد القاطع
  perform pg_temp.expect_error(format($q$ select public.sector_manager_set_headcount('%s', 10) $q$, c2), 'CONTRACTOR_OUT_OF_SCOPE');
  perform pg_temp.expect_error(format($q$ select public.sector_manager_set_headcount('%s', 0) $q$, c1), 'CONTRACTOR_COUNT_INVALID');
  perform public.sector_manager_set_headcount(c1, 13);
  perform public.sector_manager_set_headcount(c1, 14);
  select count(*) into n from public.contractor_daily_counts where contractor_user_id = c1 and source = 'sector_manager'; if n <> 1 then raise exception 'one admin_ops row expected'; end if;
  select * into r from public.sector_manager_contractors() x where x.contractor_user_id = c1;
  if r.my_headcount <> 14 or r.contractor_headcount <> 16 or r.follow_up_headcount <> 15 then raise exception 'three counts wrong: %', r; end if;
  -- الأعداد الأخرى لم تتأثر
  if (select headcount from public.contractor_daily_counts where contractor_user_id = c1 and source = 'contractor') <> 16 then raise exception 'contractor count changed'; end if;
  if (select headcount from public.contractor_daily_counts where contractor_user_id = c1 and source = 'follow_up') <> 15 then raise exception 'follow_up count changed'; end if;
  -- الملخص
  select * into r from public.sector_manager_contractors_summary();
  if r.contractors <> 1 or r.checked_in <> 1 or r.counted_by_me <> 1 or r.month_locked then raise exception 'summary wrong: %', r; end if;
  -- السجل الشهري
  select count(*) into n from public.sector_manager_contractor_month(c1); if n < 1 then raise exception 'month empty'; end if;
  select * into r from public.sector_manager_contractor_month(c1) x where x.log_date = app.baghdad_today();
  if not r.checked_in or r.contractor_headcount <> 16 or r.follow_up_headcount <> 15 or r.admin_ops_headcount <> 14 then raise exception 'month row wrong: %', r; end if;
  perform pg_temp.expect_error(format($q$ select * from public.sector_manager_contractor_month('%s') $q$, c2), 'CONTRACTOR_OUT_OF_SCOPE');
  -- يوم سابق للقراءة فقط
  select * into r from public.sector_manager_contractors(app.baghdad_today() - 1) x where x.contractor_user_id = c1;
  if r.editable or r.checked_in then raise exception 'yesterday wrong: %', r; end if;
  -- قفل الشهر
  insert into public.contractor_month_approvals (month, approved_source, approved_by) values (date_trunc('month', app.baghdad_today())::date, 'sector_manager', it);
  perform pg_temp.expect_error(format($q$ select public.sector_manager_set_headcount('%s', 9) $q$, c1), 'CONTRACTOR_MONTH_LOCKED');
  delete from public.contractor_month_approvals;
  -- مسؤول قاطع بلا إسناد / دور آخر
  perform pg_temp.as_user(sm2);
  perform pg_temp.expect_error($q$ select * from public.sector_manager_contractors() $q$, 'SECTOR_MANAGER_NOT_ASSIGNED');
  perform pg_temp.as_user(fu);
  perform pg_temp.expect_error($q$ select * from public.sector_manager_contractors() $q$, 'PARENT_SECTOR_MANAGER_FORBIDDEN');
  raise notice 'A1 ok';
end $$;
