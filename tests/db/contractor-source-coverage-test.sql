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

-- 00303 · اعتماد شهر المتعهدين على جهة لا تغطي كل الأيام: رفض + فجوات مرئية + إقرار صريح + «أيام غير مغطاة» للمالية
do $$
declare it uuid := '0c000000-0000-0000-0000-000000000001'; ops uuid := '0c000000-0000-0000-0000-000000000002'; fu uuid := '0c000000-0000-0000-0000-000000000003';
        c1 uuid := '0c000000-0000-0000-0000-000000000005'; c2 uuid := '0c000000-0000-0000-0000-000000000007'; fin uuid := '0c000000-0000-0000-0000-000000000008';
        d date := app.baghdad_today(); m date := date_trunc('month', app.baghdad_today())::date; r record; msg text; n int;
begin
  perform pg_temp.as_user(it);
  perform public.contractor_assign(c1, '0c000000-0000-0000-0000-000000000004', 1::smallint);
  perform public.contractor_assign(c2, '0c000000-0000-0000-0000-000000000006', 5::smallint);
  perform public.follow_up_assign(fu, '{karrada,zaafaraniya}', '{}');
  perform pg_temp.as_user(c1); perform public.contractor_checkin(33.3, 44.4, 5, 'x/s.jpg', 'x/t.jpg', 16);
  perform pg_temp.as_user(c2); perform public.contractor_checkin(33.2, 44.5, 5, 'y/s.jpg', 'y/t.jpg', 10);
  if d = m then raise notice 'test ok: contractor-source-coverage (00303) — skipped yesterday part (1st of month)'; end if;
  insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c1, 1, greatest(m, d-1), 'contractor', 12, c1) on conflict do nothing;
  perform pg_temp.as_user(fu); perform public.follow_up_set_headcount(c1, 15);
  perform pg_temp.as_user(ops);
  -- الفجوات لجهة «المتابعة»: c2 اليوم (+ c1 أمس إن وُجد)
  select count(*) into n from public.ops_contractor_coverage_gaps(m, 'follow_up');
  if n <> (case when d = m then 1 else 2 end) then raise exception 'FAIL G1 gaps % ', n; end if;
  select * into r from public.ops_contractor_coverage_gaps(m, 'follow_up') g where g.contractor_user_id = c2;
  if r.contractor_count <> 10 or r.follow_up_count is not null or r.log_date <> d then raise exception 'FAIL G2 % % %', r.contractor_count, r.follow_up_count, r.log_date; end if;
  -- جهة «المتعهد» تغطي كل شيء ⇒ لا فجوات
  select count(*) into n from public.ops_contractor_coverage_gaps(m, 'contractor'); if n <> 0 then raise exception 'FAIL G3 %', n; end if;
  perform pg_temp.expect_error('select public.ops_contractor_coverage_gaps(null, ''x'')', 'CONTRACTOR_SOURCE_INVALID');
  -- الاعتماد على «المتابعة» مرفوض بعدد الفجوات
  perform pg_temp.expect_error(format('select public.ops_contractor_month_approve(%L, ''follow_up'')', m), 'CONTRACTOR_SOURCE_COVERAGE_GAP:' || (case when d = m then 1 else 2 end));
  if exists (select 1 from public.contractor_month_approvals where month = m) then raise exception 'FAIL G4 approval row created despite gap'; end if;
  -- تصحيح العمليات يسدّ فجوة c2 اليوم (أي جهة، بسبب)
  perform public.ops_contractor_count_correct(c2, d, 'follow_up', 10, 'مطابقة صور المتعهد');
  select count(*) into n from public.ops_contractor_coverage_gaps(m, 'follow_up'); if n <> (case when d = m then 0 else 1 end) then raise exception 'FAIL G5 %', n; end if;
  -- إقرار صريح رغم الفجوة المتبقية ⇒ يُعتمد ويُسجَّل
  perform public.ops_contractor_month_approve(m, 'follow_up', true);
  if not app.contractor_month_locked(d) then raise exception 'FAIL G6 not locked'; end if;
  select after_data into r from public.contractor_audit_log where action = 'month_approve' and log_date = m and after_data ->> 'approved_source' = 'follow_up';
  if (r.after_data ->> 'coverage_gaps')::int <> (case when d = m then 0 else 1 end) or (r.after_data ->> 'forced')::boolean <> (d <> m) then raise exception 'FAIL G7 %', r.after_data; end if;
  -- المالية ترى الأيام غير المغطاة
  perform pg_temp.as_user(fin);
  select * into r from public.finance_contractor_wages_sheet(m) s where s.contractor_user_id = c1;
  if r.uncovered_days <> (case when d = m then 0 else 1 end) or r.paid_days <> 1 then raise exception 'FAIL G8 uncovered % paid %', r.uncovered_days, r.paid_days; end if;
  select * into r from public.finance_contractor_wages_sheet(m) s where s.contractor_user_id = c2;
  if r.uncovered_days <> 0 or r.paid_days <> 1 or r.worker_days <> 9 then raise exception 'FAIL G9 % % %', r.uncovered_days, r.paid_days, r.worker_days; end if;
  -- بلا فجوات: الاعتماد بلا إقرار يعمل (إعادة فتح ثم اعتماد «المتعهد»)
  perform pg_temp.as_user(ops); perform public.ops_contractor_month_reopen(m, 'فحص');
  perform public.ops_contractor_month_approve(m, 'contractor');
  select after_data into r from public.contractor_audit_log where action = 'month_approve' and log_date = m and after_data ->> 'approved_source' = 'contractor';
  if (r.after_data ->> 'coverage_gaps')::int <> 0 or (r.after_data ->> 'forced')::boolean then raise exception 'FAIL G10 %', r.after_data; end if;
  raise notice 'test ok: contractor-source-coverage (00303)';
end $$;
