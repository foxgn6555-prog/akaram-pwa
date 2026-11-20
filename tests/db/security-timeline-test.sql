-- الجولة ٧ — اللوحة الأمنية الموحّدة (20261120190000): معاملة كاملة تُرجَع في النهاية.
-- بادئة e7.
--   A) الحراسة: تقنية المعلومات فقط · anon ممنوع
--   B) الدمج والترتيب: جلسات + صلاحيات + أدوار في سجل واحد تنازلياً
--   C) التصفية بالحساب · بالمصدر · بالمدة
--   D) الحد الأقصى للصفوف (clamp)
--   E) التسميات العربية وحالات الطلبات
--   F) بطاقات العدّ
begin;
set client_min_messages = notice;

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

insert into auth.users (id, email) values
  ('e7000000-0000-4000-8000-000000000001', 'e7-hr@t.iq'),
  ('e7000000-0000-4000-8000-000000000002', 'e7-it@t.iq'),
  ('e7000000-0000-4000-8000-000000000003', 'e7-plain@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e7000000-0000-4000-8000-000000000001', 'hr_officer'),
  ('e7000000-0000-4000-8000-000000000002', 'it_admin'),
  ('e7000000-0000-4000-8000-000000000003', 'employee')
on conflict do nothing;

-- بيانات نظيفة داخل المعاملة (تُرجَع بالكامل)
delete from public.security_events;
delete from public.permission_audit;
delete from public.role_grant_requests;

insert into public.security_events (user_id, email, event, outcome, ip, created_at) values
  ('e7000000-0000-4000-8000-000000000001', 'e7-hr@t.iq', 'login_success',  'allowed', '10.0.0.1', now() - interval '1 hour'),
  ('e7000000-0000-4000-8000-000000000001', 'e7-hr@t.iq', 'login_failed',   'blocked', '10.0.0.1', now() - interval '2 hours'),
  ('e7000000-0000-4000-8000-000000000003', 'e7-plain@t.iq', 'limit_exceeded', 'blocked', '10.0.0.9', now() - interval '3 hours'),
  ('e7000000-0000-4000-8000-000000000003', 'e7-plain@t.iq', 'login_success', 'allowed', '10.0.0.9', now() - interval '20 days');

insert into public.permission_audit (actor_id, target_user, kind, detail, created_at) values
  ('e7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'level_set',
   '{"unit":"hr.employees","to":"view"}', now() - interval '30 minutes'),
  ('e7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'weird_kind',
   '{}', now() - interval '40 minutes'),
  ('e7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000003', 'template_save',
   '{"name":"قالب"}', now() - interval '15 days');

insert into public.role_grant_requests (target_user, role, is_grant, status, requested_by, requested_at) values
  ('e7000000-0000-4000-8000-000000000001', 'it_admin', true, 'pending',
   'e7000000-0000-4000-8000-000000000002', now() - interval '10 minutes'),
  ('e7000000-0000-4000-8000-000000000003', 'finance_officer', true, 'rejected',
   'e7000000-0000-4000-8000-000000000002', now() - interval '25 days');

-- ═══ A) الحراسة ═══
select pg_temp.as_user('e7000000-0000-4000-8000-000000000002');
do $$ begin
  if (select count(*) from public.it_security_timeline())= 0 then raise exception 'A: IT يجب أن ترى السجل'; end if;
end $$;

select pg_temp.as_user('e7000000-0000-4000-8000-000000000003');
select pg_temp.expect_error($$select * from public.it_security_timeline()$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select public.it_security_overview()$$, 'PERMISSION_DENIED');

set local role anon;
select pg_temp.expect_error($$select * from public.it_security_timeline()$$, 'permission denied');
reset role;

-- ═══ B) الدمج والترتيب (٧ أيام افتراضياً) ═══
select pg_temp.as_user('e7000000-0000-4000-8000-000000000002');
do $$
declare n int; src text; prev timestamptz := 'infinity'; r record; v_sources text[];
begin
  select count(*) into n from public.it_security_timeline();          -- ٤ جلسات حديثة (3) + تدقيق (2) + أدوار (1)
  if n <> 6 then raise exception 'B: يجب أن يعود ٦ صفوف داخل ٧ أيام، جاء %', n; end if;

  select array_agg(distinct source order by source) into v_sources from public.it_security_timeline();
  if v_sources <> array['permissions','roles','session'] then
    raise exception 'B: المصادر الثلاثة يجب أن تظهر، جاء %', v_sources;
  end if;

  for r in select occurred_at from public.it_security_timeline() loop
    if r.occurred_at > prev then raise exception 'B: الترتيب ليس تنازلياً'; end if;
    prev := r.occurred_at;
  end loop;

  -- الأقدم من ٧ أيام مستبعَد
  if exists (select 1 from public.it_security_timeline() where occurred_at < now() - interval '7 days') then
    raise exception 'B: صفوف أقدم من المدة ظهرت';
  end if;
end $$;

-- ═══ C) التصفية ═══
do $$
declare n int; v_sources text[];
begin
  select count(*) into n from public.it_security_timeline(p_user => 'e7000000-0000-4000-8000-000000000001');
  if n <> 5 then raise exception 'C: حساب الموارد البشرية له ٥ صفوف (جلستان + تدقيقان + دور)، جاء %', n; end if;

  select array_agg(distinct source) into v_sources
    from public.it_security_timeline(p_user => 'e7000000-0000-4000-8000-000000000001');
  if v_sources <> array['permissions','roles','session'] then
    raise exception 'C: كل مصادر هذا الحساب يجب أن تظهر، جاء %', v_sources;
  end if;

  select count(*) into n from public.it_security_timeline(p_source => 'session');
  if n <> 3 then raise exception 'C: الجلسات فقط ٣، جاء %', n; end if;

  select count(*) into n from public.it_security_timeline(p_source => 'roles');
  if n <> 1 then raise exception 'C: الأدوار فقط ١، جاء %', n; end if;

  -- مدة ٣٠ يوماً تُدخل القديم
  select count(*) into n from public.it_security_timeline(p_days => 30);
  if n <> 9 then raise exception 'C: ٣٠ يوماً يجب أن تعيد ٩ صفوف، جاء %', n; end if;

  -- حساب بلا أحداث
  select count(*) into n from public.it_security_timeline(p_user => gen_random_uuid());
  if n <> 0 then raise exception 'C: حساب مجهول يجب أن يعيد صفراً'; end if;
end $$;

-- ═══ D) الحد الأقصى ═══
do $$
declare n int;
begin
  select count(*) into n from public.it_security_timeline(p_limit => 1);
  if n <> 1 then raise exception 'D: الحد ١ يجب أن يعيد صفاً واحداً، جاء %', n; end if;
  select count(*) into n from public.it_security_timeline(p_limit => 0);
  if n <> 1 then raise exception 'D: الحد ٠ يُرفع إلى ١، جاء %', n; end if;
  select count(*) into n from public.it_security_timeline(p_limit => 100000);
  if n <> 6 then raise exception 'D: الحد الكبير لا يتجاوز المتاح، جاء %', n; end if;
end $$;

select pg_temp.expect_error($$select * from public.it_security_timeline(p_source => 'bogus')$$, 'INVALID_INPUT');

-- ═══ E) التسميات ═══
do $$
declare v text;
begin
  select summary into v from public.it_security_timeline(p_source => 'session', p_user => 'e7000000-0000-4000-8000-000000000001')
   where kind = 'login_success';
  if v not like 'دخول ناجح%' then raise exception 'E: تسمية الدخول الناجح، جاء [%]', v; end if;

  select summary into v from public.it_security_timeline(p_source => 'permissions')
   where kind = 'level_set';
  if v not like 'ضبط سقف صفحة%' or v not like '%hr.employees%' then
    raise exception 'E: تسمية ضبط السقف، جاء [%]', v;
  end if;

  select summary into v from public.it_security_timeline(p_source => 'permissions')
   where kind = 'weird_kind';
  if v not like 'تدقيق صلاحيات: weird_kind%' then raise exception 'E: الارتداد للنوع الخام، جاء [%]', v; end if;

  select summary into v from public.it_security_timeline(p_source => 'roles')
   where outcome = 'pending';
  if v not like 'طلب منح دور%' or v not like '%بانتظار الاعتماد%' then
    raise exception 'E: تسمية طلب الدور، جاء [%]', v;
  end if;

  -- الفاعل والمستهدف مفصولان
  if not exists (
    select 1 from public.it_security_timeline(p_source => 'permissions')
     where actor_id = 'e7000000-0000-4000-8000-000000000002'
       and target_id = 'e7000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'E: الفاعل/المستهدف غير صحيحين';
  end if;
end $$;

-- ═══ F) بطاقات العدّ ═══
do $$
declare v jsonb;
begin
  v := public.it_security_overview(7);
  if (v ->> 'days')::int <> 7 then raise exception 'F: المدة غير معادة'; end if;
  if (v -> 'session' ->> 'total')::int <> 3 then raise exception 'F: أحداث الجلسات ٧ أيام = ٣، جاء %', v -> 'session' ->> 'total'; end if;
  if (v -> 'session' ->> 'blocked')::int <> 2 then raise exception 'F: المرفوضة = ٢'; end if;
  if (v -> 'session' ->> 'logins')::int <> 1 then raise exception 'F: الدخول الناجح = ١'; end if;
  if (v -> 'permissions' ->> 'total')::int <> 2 then raise exception 'F: تدقيق الصلاحيات = ٢'; end if;
  if (v -> 'permissions' ->> 'level_sets')::int <> 1 then raise exception 'F: ضبط السقوف = ١'; end if;
  if (v -> 'roles' ->> 'pending')::int <> 1 then raise exception 'F: الطلبات المعلّقة = ١'; end if;

  v := public.it_security_overview(30);
  if (v -> 'session' ->> 'total')::int <> 4 then raise exception 'F: ٣٠ يوماً = ٤ أحداث'; end if;
  if (v -> 'roles' ->> 'rejected')::int <> 1 then raise exception 'F: المرفوضة = ١'; end if;
  if (v -> 'last_event_at') is null then raise exception 'F: آخر حدث غير معاد'; end if;

  -- حد المدة
  v := public.it_security_overview(0);
  if (v ->> 'days')::int <> 1 then raise exception 'F: المدة الدنيا يوم واحد'; end if;
end $$;

rollback;
