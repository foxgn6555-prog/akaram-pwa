-- اختبار وحدة «حضوريات العمال» في غرفة العمليات (00262): الكشف الشهري (3 أعمدة × أيام)، فلتر القاطع، حالة الشهر،
-- تصحيح رقم بسبب + تدقيق + تبليغ، اعتماد جهة واحدة ⇒ قفل كل الجهات، إعادة فتح بسبب، العزل. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('0c000000-0000-0000-0000-000000000001', 'it-oc@t.iq'), ('0c000000-0000-0000-0000-000000000002', 'ops-oc@t.iq'),
  ('0c000000-0000-0000-0000-000000000003', 'fu-oc@t.iq'), ('0c000000-0000-0000-0000-000000000004', 'mgr-oc@t.iq'),
  ('0c000000-0000-0000-0000-000000000005', 'c1-oc@t.iq'), ('0c000000-0000-0000-0000-000000000006', 'mgr2-oc@t.iq'),
  ('0c000000-0000-0000-0000-000000000007', 'c2-oc@t.iq'), ('0c000000-0000-0000-0000-000000000008', 'fin-oc@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('0c000000-0000-0000-0000-000000000001', 'it_admin'), ('0c000000-0000-0000-0000-000000000002', 'ops_room'),
  ('0c000000-0000-0000-0000-000000000003', 'follow_up'), ('0c000000-0000-0000-0000-000000000004', 'department_manager'),
  ('0c000000-0000-0000-0000-000000000005', 'employee'), ('0c000000-0000-0000-0000-000000000006', 'department_manager'),
  ('0c000000-0000-0000-0000-000000000007', 'employee'), ('0c000000-0000-0000-0000-000000000008', 'finance_officer')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('0c000000-0000-0000-0000-000000000004', 'morning', '{1}'), ('0c000000-0000-0000-0000-000000000006', 'evening', '{5}') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare it uuid := '0c000000-0000-0000-0000-000000000001'; ops uuid := '0c000000-0000-0000-0000-000000000002'; fu uuid := '0c000000-0000-0000-0000-000000000003';
        c1 uuid := '0c000000-0000-0000-0000-000000000005'; c2 uuid := '0c000000-0000-0000-0000-000000000007'; fin uuid := '0c000000-0000-0000-0000-000000000008';
        d date := app.baghdad_today(); m date := date_trunc('month', app.baghdad_today())::date; r record; n int;
begin
  perform pg_temp.as_user(it);
  perform public.contractor_assign(c1, '0c000000-0000-0000-0000-000000000004', 1::smallint);
  perform public.contractor_assign(c2, '0c000000-0000-0000-0000-000000000006', 5::smallint);
  perform public.follow_up_assign(fu, '{karrada,zaafaraniya}', '{}');
  -- اليوم: المتعهد 1 = 16، المتابعة = 15؛ المتعهد 2 = 10
  perform pg_temp.as_user(c1); perform public.contractor_checkin(33.3, 44.4, 5, 'x/s.jpg', 'x/t.jpg', 16);
  perform pg_temp.as_user(c2); perform public.contractor_checkin(33.2, 44.5, 5, 'y/s.jpg', 'y/t.jpg', 10);
  perform pg_temp.as_user(fu); perform public.follow_up_set_headcount(c1, 15);
  -- غير مخوّل
  perform pg_temp.as_user(fin);
  perform pg_temp.expect_error($q$ select * from public.ops_contractor_headcounts_sheet() $q$, 'OPS_ROOM_FORBIDDEN');
  -- الكشف: متعهدان × أيام الشهر حتى اليوم
  perform pg_temp.as_user(ops);
  select count(distinct contractor_user_id) into n from public.ops_contractor_headcounts_sheet(); if n <> 2 then raise exception 'sheet contractors %', n; end if;
  select count(*) into n from public.ops_contractor_headcounts_sheet() x where x.contractor_user_id = c1;
  if n <> extract(day from d)::int then raise exception 'days rows % expected %', n, extract(day from d); end if;
  select * into r from public.ops_contractor_headcounts_sheet() x where x.contractor_user_id = c1 and x.log_date = d;
  if r.contractor_headcount <> 16 or r.follow_up_headcount <> 15 or r.sector_manager_headcount is not null or not r.checked_in or r.shift <> 'morning' then raise exception 'sheet row wrong: %', r; end if;
  select count(distinct contractor_user_id) into n from public.ops_contractor_headcounts_sheet(null, 'zaafaraniya'); if n <> 1 then raise exception 'parent filter'; end if;
  perform pg_temp.expect_error($q$ select * from public.ops_contractor_headcounts_sheet(null, 'mansour') $q$, 'PARENT_SECTOR_INVALID');
  -- حالة الشهر قبل الاعتماد
  select * into r from public.ops_contractor_month_status();
  if r.approved or r.is_locked or r.contractors <> 2 or r.days_with_contractor <> 2 or r.days_with_follow_up <> 1 then raise exception 'status wrong: %', r; end if;
  -- تصحيح: سبب إلزامي، يوم مستقبلي مرفوض، جهة غير صحيحة
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_count_correct('%s', '%s', 'contractor', 12, '') $q$, c1, d), 'CONTRACTOR_REASON_REQUIRED');
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_count_correct('%s', '%s', 'contractor', 12, 'سبب كافٍ') $q$, c1, d + 1), 'CONTRACTOR_DATE_INVALID');
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_count_correct('%s', '%s', 'ops', 12, 'سبب كافٍ') $q$, c1, d), 'CONTRACTOR_SOURCE_INVALID');
  -- تصحيح يوم أمس لجهة بلا رقم (إنشاء) وتصحيح رقم المتعهد اليوم (تعديل) مع تبليغه
  perform public.ops_contractor_count_correct(c1, d - 1, 'sector_manager', 11, 'ورد من مسؤول القاطع هاتفياً');
  perform public.ops_contractor_count_correct(c1, d, 'contractor', 14, 'عدّ ميداني من غرفة العمليات');
  select * into r from public.ops_contractor_headcounts_sheet() x where x.contractor_user_id = c1 and x.log_date = d;
  if r.contractor_headcount <> 14 or r.contractor_edit_reason <> 'عدّ ميداني من غرفة العمليات' or r.follow_up_headcount <> 15 then raise exception 'corrected row wrong: %', r; end if;
  select * into r from public.ops_contractor_headcounts_sheet() x where x.contractor_user_id = c1 and x.log_date = d - 1;
  if r.sector_manager_headcount <> 11 then raise exception 'created row wrong: %', r; end if;
  if not exists (select 1 from public.contractor_audit_log where action = 'ops_correct_contractor' and contractor_user_id = c1 and reason = 'عدّ ميداني من غرفة العمليات' and (before_data->>'headcount')::int = 16 and (after_data->>'headcount')::int = 14) then raise exception 'audit missing'; end if;
  if not exists (select 1 from public.notifications where user_id = c1 and title = 'صحّحت غرفة العمليات عدداً سجّلته') then raise exception 'contractor notification missing'; end if;
  select count(*) into n from public.ops_contractor_audit(); if n <> 2 then raise exception 'audit list % expected 2', n; end if;
  -- اعتماد: جهة غير صحيحة، شهر مستقبلي، ثم اعتماد المتابعة ⇒ قفل كل الجهات
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_month_approve('%s', 'ops') $q$, m), 'CONTRACTOR_SOURCE_INVALID');
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_month_approve('%s', 'follow_up') $q$, (m + interval '1 month')::date), 'CONTRACTOR_MONTH_FUTURE');
  perform public.ops_contractor_month_approve(m, 'follow_up');
  select * into r from public.ops_contractor_month_status();
  if not r.approved or not r.is_locked or r.approved_source <> 'follow_up' or r.approved_by_name is null then raise exception 'approved status wrong: %', r; end if;
  if not exists (select 1 from public.notifications where user_id = fin and title like 'اعتُمدت حضوريات عمال المتعهدين%') then raise exception 'finance notification missing'; end if;
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_month_approve('%s', 'contractor') $q$, m), 'CONTRACTOR_MONTH_LOCKED');
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_count_correct('%s', '%s', 'contractor', 9, 'سبب كافٍ') $q$, c1, d), 'CONTRACTOR_MONTH_LOCKED');
  perform pg_temp.as_user(fu);
  perform pg_temp.expect_error(format($q$ select public.follow_up_set_headcount('%s', 9) $q$, c1), 'CONTRACTOR_MONTH_LOCKED');
  perform pg_temp.as_user(c1);
  perform pg_temp.expect_error($q$ select public.contractor_set_headcount(9) $q$, 'CONTRACTOR_MONTH_LOCKED');
  -- إعادة فتح بسبب ثم تغيير الجهة المعتمدة
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_month_reopen('%s', '') $q$, m), 'CONTRACTOR_REASON_REQUIRED');
  perform public.ops_contractor_month_reopen(m, 'خطأ في اختيار الجهة');
  select * into r from public.ops_contractor_month_status();
  if r.is_locked or r.reopen_reason <> 'خطأ في اختيار الجهة' or r.reopened_by_name is null then raise exception 'reopen status wrong: %', r; end if;
  perform pg_temp.expect_error(format($q$ select public.ops_contractor_month_reopen('%s', 'مرة أخرى') $q$, m), 'CONTRACTOR_MONTH_NOT_LOCKED');
  perform public.ops_contractor_month_approve(m, 'sector_manager');
  select * into r from public.ops_contractor_month_status();
  if not r.is_locked or r.approved_source <> 'sector_manager' then raise exception 'reapprove wrong: %', r; end if;
  select count(*) into n from public.ops_contractor_audit() x where x.action in ('month_approve','month_reopen'); if n <> 3 then raise exception 'month audit % expected 3', n; end if;
  raise notice 'O1 ok';
end $$;
