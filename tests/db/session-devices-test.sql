-- الجولة ٣ — إدارة الجلسات والأجهزة (20261120150000): معاملة كاملة تُرجَع في النهاية.
-- بادئة c1. جدول auth.sessions محاكى داخل المعاملة فقط.
--   A) بوابة الحد: سياسة مفروضة بحد 2 ⇒ الجلسة الثالثة محجوبة، وغير المفروضة تمرّ
--   B) قائمة جلساتي: تُعيد جلسات المستخدم فقط وتميّز الجلسة الحالية
--   C) إنهاء جلسة: جلسة غيري مرفوضة، وجلستي تُحذف فعلياً
--   D) إنهاء الجلسات الأخرى: تُبقي الجلسة الحالية فقط (من claim session_id)
--   E) تطبيق الانتقال وإبطال الجلسة الجديدة + الأحداث المسجّلة
--   F) الحراسة: authenticated لا يستدعي دوال خدمة الحافة
begin;
set client_min_messages = notice;

create or replace function pg_temp.as_user(p uuid, p_session uuid default null) returns void language plpgsql as $$
declare v_claims text;
begin
  v_claims := json_build_object('sub', p, 'role', 'authenticated',
                                'session_id', coalesce(p_session::text, ''))::text;
  perform set_config('auth.user_id', p::text, true);
  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('auth.jwt', v_claims, true);
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ جدول الجلسات المحاكى + مستخدمون ═══
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz default now(),
  not_after timestamptz,
  ip inet,
  user_agent text
);

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'c1-emp@t.iq'),
  ('c1000000-0000-4000-8000-000000000002', 'c1-it@t.iq'),
  ('c1000000-0000-4000-8000-000000000003', 'c1-other@t.iq')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('c1000000-0000-4000-8000-000000000001', 'employee'),
  ('c1000000-0000-4000-8000-000000000002', 'it_admin'),
  ('c1000000-0000-4000-8000-000000000003', 'employee')
on conflict do nothing;

insert into auth.sessions (id, user_id, ip, user_agent, created_at, refreshed_at) values
  ('c1000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-000000000001', '10.0.0.1', 'C1-OLD-1', now() - interval '2 days', now() - interval '1 day'),
  ('c1000000-0000-4000-8000-0000000000a2', 'c1000000-0000-4000-8000-000000000001', '10.0.0.2', 'C1-OLD-2', now() - interval '1 day',  now() - interval '2 hours'),
  ('c1000000-0000-4000-8000-0000000000a3', 'c1000000-0000-4000-8000-000000000001', '10.0.0.3', 'C1-NEW',   now(),                     now()),
  ('c1000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-000000000003', '10.9.9.9', 'OTHER-UA', now(),                     now());

-- ═══ A) بوابة الحد ═══
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
do $$
declare g jsonb;
begin
  -- بلا سياسة (افتراضي enforce=false): لا حجب حتى مع وجود 3 جلسات
  g := public.session_gate_check('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a3');
  if (g ->> 'blocked')::boolean then raise exception 'A: لا حجب قبل فرض السياسة'; end if;
  if (g ->> 'active')::int <> 2 then raise exception 'A: الجلسات الأخرى يجب أن تكون 2، جاء %', g ->> 'active'; end if;
  if jsonb_array_length(g -> 'others') <> 2 then raise exception 'A: قائمة الجلسات الأخرى غير صحيحة'; end if;

  -- فرض الحد = 2 ⇒ محجوبة (جلستان أخرتان)
  perform public.session_policy_set('c1000000-0000-4000-8000-000000000001', 2, true, 'اختبار الحد');
  g := public.session_gate_check('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a3');
  if not (g ->> 'blocked')::boolean then raise exception 'A: يجب الحجب عند بلوغ الحد'; end if;
  if (g ->> 'max')::int <> 2 then raise exception 'A: الحد الأقصى غير صحيح'; end if;

  -- رفع الحد إلى 5 ⇒ تمرّ
  perform public.session_policy_set('c1000000-0000-4000-8000-000000000001', 5, true, null);
  g := public.session_gate_check('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a3');
  if (g ->> 'blocked')::boolean then raise exception 'A: لا حجب بعد رفع الحد'; end if;

  -- إعادة إلى 2 للاختبارات التالية
  perform public.session_policy_set('c1000000-0000-4000-8000-000000000001', 2, true, null);
end $$;

-- ═══ B) جلساتي ═══
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a3');
do $$
declare n int; cur int;
begin
  select count(*), count(*) filter (where is_current) into n, cur from public.my_sessions('c1000000-0000-4000-8000-0000000000a3');
  if n <> 3 then raise exception 'B: يجب عرض 3 جلسات، جاء %', n; end if;
  if cur <> 1 then raise exception 'B: يجب تمييز جلسة واحدة كحالية، جاء %', cur; end if;
  if exists (select 1 from public.my_sessions('c1000000-0000-4000-8000-0000000000a3')
              where id = 'c1000000-0000-4000-8000-0000000000b1') then
    raise exception 'B: ظهرت جلسة مستخدم آخر';
  end if;
end $$;

-- ═══ C) إنهاء جلسة ═══
select pg_temp.expect_error(
  $$select public.session_end('c1000000-0000-4000-8000-0000000000b1')$$, 'SESSION_NOT_FOUND');

do $$
declare n int;
begin
  n := public.session_end('c1000000-0000-4000-8000-0000000000a1');
  if n <> 1 then raise exception 'C: يجب حذف جلسة واحدة، جاء %', n; end if;
  if exists (select 1 from auth.sessions where id = 'c1000000-0000-4000-8000-0000000000a1') then
    raise exception 'C: لم تُحذف الجلسة فعلياً';
  end if;
  if not exists (select 1 from auth.sessions where id = 'c1000000-0000-4000-8000-0000000000b1') then
    raise exception 'C: حُذفت جلسة مستخدم آخر';
  end if;
end $$;

-- ═══ D) إنهاء الآخرين ═══
do $$
declare n int;
begin
  n := public.session_end_others();
  if n <> 1 then raise exception 'D: يجب حذف جلسة واحدة (a2) والإبقاء على a3، جاء %', n; end if;
  if not exists (select 1 from auth.sessions where id = 'c1000000-0000-4000-8000-0000000000a3') then
    raise exception 'D: لا يجوز حذف الجلسة الحالية';
  end if;
  if exists (select 1 from auth.sessions where id = 'c1000000-0000-4000-8000-0000000000a2') then
    raise exception 'D: لم تُحذف الجلسة الأخرى';
  end if;
end $$;

-- ═══ E) الانتقال وإبطال الجلسة الجديدة + الأحداث ═══
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
do $$
declare n int;
begin
  -- جلستان: a3 (قديمة) و d4 (الجديدة)
  insert into auth.sessions (id, user_id, ip, user_agent) values
    ('c1000000-0000-4000-8000-0000000000d4', 'c1000000-0000-4000-8000-000000000001', '10.0.0.4', 'C1-D4');

  n := public.session_switch_apply('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000d4');
  if n <> 1 then raise exception 'E: الانتقال يجب أن يحذف جلسة واحدة، جاء %', n; end if;
  if exists (select 1 from auth.sessions where id = 'c1000000-0000-4000-8000-0000000000a3') then
    raise exception 'E: الجلسة السابقة لم تُحذف عند الانتقال';
  end if;
  if not exists (select 1 from auth.sessions where id = 'c1000000-0000-4000-8000-0000000000d4') then
    raise exception 'E: الجلسة الجديدة يجب أن تبقى';
  end if;

  -- إبطال جلسة جديدة عند تجاوز الحد
  n := public.session_revoke_new('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000d4');
  if n <> 1 then raise exception 'E: يجب إبطال الجلسة الجديدة، جاء %', n; end if;

  if not exists (select 1 from public.security_events where event = 'switch_approved' and user_id = 'c1000000-0000-4000-8000-000000000001') then
    raise exception 'E: لم يُسجَّل حدث الانتقال';
  end if;
  if not exists (select 1 from public.security_events where event = 'limit_exceeded' and user_id = 'c1000000-0000-4000-8000-000000000001') then
    raise exception 'E: لم يُسجَّل حدث تجاوز الحد';
  end if;
  if (select count(*) from public.security_events where event = 'session_revoked') < 2 then
    raise exception 'E: أحداث إنهاء الجلسات ناقصة';
  end if;
end $$;

-- ═══ F) الحراسة ═══
set local role authenticated;
select pg_temp.expect_error($$select public.session_gate_check('c1000000-0000-4000-8000-000000000001', null)$$, 'permission denied');
select pg_temp.expect_error($$select public.session_switch_apply('c1000000-0000-4000-8000-000000000001', null)$$, 'permission denied');
select pg_temp.expect_error($$select public.session_revoke_new('c1000000-0000-4000-8000-000000000001', null)$$, 'permission denied');
reset role;

set local role anon;
select pg_temp.expect_error($$select * from public.my_sessions(null)$$, 'permission denied');
reset role;

rollback;
