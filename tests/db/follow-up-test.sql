-- اختبار بوابة المتابعة (00259): الدور follow_up، الإسناد من التطوير المركزية (قاطع كامل و/أو مناطق)، نطاق المتعهدين،
-- عدد المتعهد يظهر وعدد المتابعة يُكتب (اليوم نفسه، صف واحد)، العزل، وقفل الشهر. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-000000000001', 'it-f@t.iq'), ('f0000000-0000-0000-0000-000000000002', 'fu1@t.iq'), ('f0000000-0000-0000-0000-000000000003', 'fu2@t.iq'),
  ('f0000000-0000-0000-0000-000000000004', 'mgr-f@t.iq'), ('f0000000-0000-0000-0000-000000000005', 'cont-f@t.iq'), ('f0000000-0000-0000-0000-000000000006', 'mgr-f2@t.iq'),
  ('f0000000-0000-0000-0000-000000000007', 'cont-f2@t.iq'), ('f0000000-0000-0000-0000-000000000008', 'plain-f@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('f0000000-0000-0000-0000-000000000001', 'it_admin'), ('f0000000-0000-0000-0000-000000000002', 'follow_up'), ('f0000000-0000-0000-0000-000000000003', 'follow_up'),
  ('f0000000-0000-0000-0000-000000000004', 'department_manager'), ('f0000000-0000-0000-0000-000000000005', 'employee'),
  ('f0000000-0000-0000-0000-000000000006', 'department_manager'), ('f0000000-0000-0000-0000-000000000007', 'employee'), ('f0000000-0000-0000-0000-000000000008', 'hr_officer')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('f0000000-0000-0000-0000-000000000004', 'morning', '{1}'), ('f0000000-0000-0000-0000-000000000006', 'evening', '{5}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values
  ('f0000000-0000-0000-0000-0000000000e1', 'f0000000-0000-0000-0000-000000000002', 'FU-1', 'متابع الكرادة', '2024-01-01'),
  ('f0000000-0000-0000-0000-0000000000e2', 'f0000000-0000-0000-0000-000000000005', 'FU-C', 'متعهد أرخيته ف', '2024-01-01'),
  ('f0000000-0000-0000-0000-0000000000e3', 'f0000000-0000-0000-0000-000000000007', 'FU-C2', 'متعهد زعفرانية ف', '2024-01-01')
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ U1 · الإسناد: IT فقط، الدور مطلوب، نطاق مطلوب، قاطع كامل أو مناطق، الاتحاد صحيح ═══
do $$
declare it uuid := 'f0000000-0000-0000-0000-000000000001'; fu1 uuid := 'f0000000-0000-0000-0000-000000000002'; fu2 uuid := 'f0000000-0000-0000-0000-000000000003'; f public.follow_up_profiles; r record; n int; nk int;
begin
  perform pg_temp.as_user('f0000000-0000-0000-0000-000000000008');
  perform pg_temp.expect_error($q$ select public.follow_up_assign('f0000000-0000-0000-0000-000000000002', '{karrada}') $q$, 'IT_FORBIDDEN');
  perform pg_temp.as_user(fu1);
  perform pg_temp.expect_error($q$ select * from public.follow_up_me() $q$, 'FOLLOW_UP_NOT_ASSIGNED');
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.follow_up_assign('f0000000-0000-0000-0000-000000000008', '{karrada}') $q$, 'FOLLOW_UP_ROLE_REQUIRED');
  perform pg_temp.expect_error($q$ select public.follow_up_assign('f0000000-0000-0000-0000-000000000002') $q$, 'FOLLOW_UP_SCOPE_REQUIRED');
  perform pg_temp.expect_error($q$ select public.follow_up_assign('f0000000-0000-0000-0000-000000000002', '{mansour}') $q$, 'FOLLOW_UP_PARENT_INVALID');
  perform pg_temp.expect_error($q$ select public.follow_up_assign('f0000000-0000-0000-0000-000000000002', '{}', '{999}') $q$, 'FOLLOW_UP_SECTOR_INVALID');
  select count(*) into nk from public.sectors where parent_sector = 'karrada';
  -- متابع 1: قاطع الكرادة كاملاً + منطقة 5 (من الزعفرانية)
  f := public.follow_up_assign(fu1, '{karrada}', '{5}', 'متابع');
  if cardinality(app.follow_up_sectors(fu1)) <> nk + 1 then raise exception 'union scope wrong: %', app.follow_up_sectors(fu1); end if;
  -- متابع 2: منطقتان محددتان فقط
  f := public.follow_up_assign(fu2, '{}', '{1,2}');
  if app.follow_up_sectors(fu2) <> '{1,2}'::smallint[] then raise exception 'explicit scope wrong'; end if;
  select * into r from public.follow_up_profile_for_user(fu1);
  if r.scope_label <> 'الكرادة (كامل) + السندباد' or r.areas_count <> nk + 1 then raise exception 'profile label wrong: %', r; end if;
  select count(*) into n from public.follow_up_scope_options(); if n < nk then raise exception 'scope options'; end if;
  -- الحساب يرى ملفه فقط؛ آخر ممنوع
  perform pg_temp.as_user(fu2);
  perform pg_temp.expect_error($q$ select * from public.follow_up_profile_for_user('f0000000-0000-0000-0000-000000000002') $q$, 'IT_FORBIDDEN');
  raise notice 'U1 ok';
end $$;

-- ═══ U2 · النطاق والأعداد: متعهدو نطاقي فقط، عدد المتعهد يظهر، أكتب عددي (مختلف)، صف واحد، خارج النطاق ممنوع ═══
do $$
declare it uuid := 'f0000000-0000-0000-0000-000000000001'; fu1 uuid := 'f0000000-0000-0000-0000-000000000002'; fu2 uuid := 'f0000000-0000-0000-0000-000000000003';
        c1 uuid := 'f0000000-0000-0000-0000-000000000005'; c2 uuid := 'f0000000-0000-0000-0000-000000000007'; r record; n int; me record;
begin
  perform pg_temp.as_user(it);
  perform public.contractor_assign(c1, 'f0000000-0000-0000-0000-000000000004', 1::smallint);
  perform public.contractor_assign(c2, 'f0000000-0000-0000-0000-000000000006', 5::smallint);
  -- المتعهد 1 يثبت تواجده بعدد 16
  perform pg_temp.as_user(c1);
  perform public.contractor_checkin(33.3, 44.4, 5, 'x/s.jpg', 'x/t.jpg', 16);
  -- متابع 2 (مناطق 1,2): يرى المتعهد 1 فقط
  perform pg_temp.as_user(fu2);
  select count(*) into n from public.follow_up_contractors(); if n <> 1 then raise exception 'fu2 should see 1 contractor, got %', n; end if;
  select * into r from public.follow_up_contractors() x where x.contractor_user_id = c1;
  if not r.checked_in or r.contractor_headcount <> 16 or r.my_headcount is not null or not r.editable then raise exception 'row wrong: %', r; end if;
  perform pg_temp.expect_error(format($q$ select public.follow_up_set_headcount('%s', 10) $q$, c2), 'FOLLOW_UP_OUT_OF_SCOPE');
  perform pg_temp.expect_error(format($q$ select public.follow_up_set_headcount('%s', -1) $q$, c1), 'CONTRACTOR_COUNT_INVALID');
  perform public.follow_up_set_headcount(c1, 14);
  perform public.follow_up_set_headcount(c1, 15);   -- تعديل اليوم نفسه يستبدل
  select count(*) into n from public.contractor_daily_counts where contractor_user_id = c1 and source = 'follow_up'; if n <> 1 then raise exception 'one follow_up row expected'; end if;
  select * into r from public.follow_up_contractors() x where x.contractor_user_id = c1;
  if r.my_headcount <> 15 or r.contractor_headcount <> 16 then raise exception 'counts wrong: %', r; end if;
  -- عدد المتعهد لم يتأثر
  select headcount into n from public.contractor_daily_counts where contractor_user_id = c1 and source = 'contractor'; if n <> 16 then raise exception 'contractor count must stay 16'; end if;
  -- متابع 1 (الكرادة كاملاً + 5): يرى المتعهدين الاثنين
  perform pg_temp.as_user(fu1);
  select count(*) into n from public.follow_up_contractors(); if n <> 2 then raise exception 'fu1 should see 2, got %', n; end if;
  select * into me from public.follow_up_me();
  if me.contractors_count <> 2 or me.today_checked_in <> 1 or me.today_counted_by_me <> 0 or me.month_locked then raise exception 'me wrong: %', me; end if;
  perform public.follow_up_set_headcount(c2, 8);
  select * into me from public.follow_up_me(); if me.today_counted_by_me <> 1 then raise exception 'counted_by_me'; end if;
  -- يوم سابق: للقراءة فقط
  select * into r from public.follow_up_contractors(app.baghdad_today() - 1) x where x.contractor_user_id = c1;
  if r.editable then raise exception 'past day must not be editable'; end if;
  -- قفل الشهر
  insert into public.contractor_month_approvals (month, approved_source, approved_by) values (date_trunc('month', app.baghdad_today())::date, 'follow_up', it);
  perform pg_temp.expect_error(format($q$ select public.follow_up_set_headcount('%s', 9) $q$, c1), 'CONTRACTOR_MONTH_LOCKED');
  delete from public.contractor_month_approvals;
  -- غير المتابع ممنوع
  perform pg_temp.as_user(c1);
  perform pg_temp.expect_error($q$ select * from public.follow_up_contractors() $q$, 'FOLLOW_UP_FORBIDDEN');
  -- إلغاء الإسناد
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.follow_up_unassign('f0000000-0000-0000-0000-000000000003', '') $q$, 'FOLLOW_UP_REASON_REQUIRED');
  perform public.follow_up_unassign(fu2, 'انتقال');
  perform pg_temp.as_user(fu2);
  perform pg_temp.expect_error($q$ select * from public.follow_up_me() $q$, 'FOLLOW_UP_NOT_ASSIGNED');
  raise notice 'U2 ok';
end $$;
