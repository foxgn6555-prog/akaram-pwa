-- الجولة ١ — أساس الجلسات والأحداث الأمنية (20261120120000): معاملة كاملة تُرجَع في النهاية.
-- بادئة a8. لا تترك سياسات ولا أحداثاً ولا جدول جلسات.
--   A) القيم الافتراضية: جهاز واحد، enforce=false، نمط single، ولا صف في الجدول
--   B) حراسة الخادم: غير it_admin يُرفض في القراءة والكتابة والقوائم
--   C) التحقق من المدخلات: الحد 1..10 · ملاحظة ≤ 500 · حساب غير موجود
--   D) الحفظ: upsert صحيح · updated_by · حدث policy_changed بقيَم قبل/بعد
--   E) العودة إلى جهاز واحد ⇒ النمط single
--   F/G) القوائم: البحث · عدد الجلسات النشطة · سجل الأحداث
--   H) الحاوية service_role: تقبل التسجيل وتقصّ الحقول الطويلة · authenticated لا يستطيع
--   I) RLS: قراءة مباشرة للجداول ممنوعة على authenticated
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

create or replace function pg_temp.expect(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'ASSERT_FAILED: %', p_msg; end if;
end $$;

-- ═══ بيانات: تقنية المعلومات · مدير مفوض · موظف عادي ═══
insert into auth.users (id, email) values
  ('a8000000-0000-4000-8000-000000000001', 'a8-it@t.iq'),
  ('a8000000-0000-4000-8000-000000000002', 'a8-md@t.iq'),
  ('a8000000-0000-4000-8000-000000000003', 'a8-emp@t.iq')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('a8000000-0000-4000-8000-000000000001', 'it_admin'),
  ('a8000000-0000-4000-8000-000000000002', 'super_admin'),
  ('a8000000-0000-4000-8000-000000000003', 'employee')
on conflict do nothing;

-- ═══ A) القيم الافتراضية ═══
do $$
declare v jsonb;
begin
  v := app.session_policy_for('a8000000-0000-4000-8000-000000000003');
  if (v ->> 'max_sessions')::int <> 1 then raise exception 'A: الحد الافتراضي يجب أن يكون 1'; end if;
  if (v ->> 'enforce')::boolean is not false then raise exception 'A: الافتراضي بلا فرض'; end if;
  if v ->> 'mode' <> 'single' then raise exception 'A: النمط الافتراضي single'; end if;
  if (select count(*) from public.account_session_policy) <> 0 then raise exception 'A: يجب ألا يُنشأ صف تلقائياً'; end if;
end $$;

-- ═══ B) الحراسة: غير it_admin مرفوض (حتى المدير المفوض) ═══
select pg_temp.as_user('a8000000-0000-4000-8000-000000000003');
select pg_temp.expect_error($$select public.session_policy_get('a8000000-0000-4000-8000-000000000003')$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select * from public.session_policy_list()$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select * from public.security_events_list()$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select public.session_policy_set('a8000000-0000-4000-8000-000000000003', 2, true)$$, 'PERMISSION_DENIED');

select pg_temp.as_user('a8000000-0000-4000-8000-000000000002');
select pg_temp.expect_error($$select public.session_policy_set('a8000000-0000-4000-8000-000000000003', 2, true)$$, 'PERMISSION_DENIED');

-- ولا شيء كُتب بسبب المحاولات المرفوضة
do $$ begin
  if (select count(*) from public.account_session_policy) <> 0 then raise exception 'B: كُتب صف رغم الرفض'; end if;
  if (select count(*) from public.security_events) <> 0 then raise exception 'B: كُتب حدث رغم الرفض'; end if;
end $$;

-- ═══ C) التحقق من المدخلات (حساب تقنية المعلومات) ═══
select pg_temp.as_user('a8000000-0000-4000-8000-000000000001');
select pg_temp.expect_error($$select public.session_policy_set('a8000000-0000-4000-8000-000000000003', 0, true)$$, 'INVALID_INPUT');
select pg_temp.expect_error($$select public.session_policy_set('a8000000-0000-4000-8000-000000000003', 11, true)$$, 'INVALID_INPUT');
select pg_temp.expect_error($$select public.session_policy_set('a8000000-0000-4000-8000-000000000003', 2, true, repeat('س', 501))$$, 'INVALID_INPUT');
select pg_temp.expect_error($$select public.session_policy_set('a8000000-0000-4000-8000-0000000000ff', 2, true)$$, 'USER_NOT_FOUND');

-- ═══ D) الحفظ والصواب قبل/بعد ═══
do $$
declare v jsonb; ev record;
begin
  v := public.session_policy_set('a8000000-0000-4000-8000-000000000003', 3, true, 'ثلاثة أجهزة مسموحة');
  if (v ->> 'max_sessions')::int <> 3 or (v ->> 'enforce')::boolean is not true then
    raise exception 'D: القيمة المُعادة غير مطابقة: %', v;
  end if;
  if v ->> 'mode' <> 'multi' then raise exception 'D: النمط يجب أن يكون multi'; end if;

  if (select updated_by from public.account_session_policy where user_id = 'a8000000-0000-4000-8000-000000000003')
     <> 'a8000000-0000-4000-8000-000000000001' then
    raise exception 'D: updated_by لم يُسجَّل';
  end if;

  select * into ev from public.security_events where event = 'policy_changed' order by id desc limit 1;
  if ev.id is null then raise exception 'D: لم يُسجَّل حدث تغيير السياسة'; end if;
  if ev.user_id <> 'a8000000-0000-4000-8000-000000000003' then raise exception 'D: الحدث على حساب خاطئ'; end if;
  if (ev.detail ->> 'after_max')::int <> 3 or (ev.detail ->> 'before_max')::int <> 1 then
    raise exception 'D: تفاصيل الحدث غير صحيحة: %', ev.detail;
  end if;
end $$;

-- ═══ E) العودة إلى جهاز واحد ⇒ single ═══
do $$
declare v jsonb;
begin
  v := public.session_policy_set('a8000000-0000-4000-8000-000000000003', 1, true);
  if v ->> 'mode' <> 'single' then raise exception 'E: النمط يجب أن يعود single'; end if;
  if v ->> 'note' is not null then raise exception 'E: الملاحظة يجب أن تُمسح عند تمرير null'; end if;
end $$;

-- ═══ F) القوائم والبحث وعدد الجلسات النشطة ═══
-- جدول جلسات محاكى (GoTrue) داخل المعاملة فقط
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz default now(),
  not_after timestamptz,
  ip inet,
  user_agent text
);
insert into auth.sessions (user_id, ip, user_agent) values
  ('a8000000-0000-4000-8000-000000000003', '10.0.0.1', 'A8-A'),
  ('a8000000-0000-4000-8000-000000000003', '10.0.0.2', 'A8-B');

do $$
declare r record; n int;
begin
  if app.session_active_count('a8000000-0000-4000-8000-000000000003') <> 2 then
    raise exception 'F: عدّ الجلسات يجب أن يكون 2';
  end if;

  select * into r from public.session_policy_list('a8-emp', 10) where email = 'a8-emp@t.iq';
  if r.user_id is null then raise exception 'F: البحث لم يُعد الحساب المطلوب'; end if;
  if r.active_sessions <> 2 then raise exception 'F: active_sessions يجب أن يكون 2، جاء %', r.active_sessions; end if;
  if r.max_sessions <> 1 or r.enforce is not true then raise exception 'F: سياسة الحساب غير مطابقة'; end if;

  select count(*) into n from public.session_policy_list('a8-it', 10);
  if n <> 1 then raise exception 'F: البحث يجب أن يُعيد صفاً واحداً، جاء %', n; end if;

  -- حساب بلا صف سياسة يظهر بالقيم الافتراضية
  select * into r from public.session_policy_list('a8-md', 10) where email = 'a8-md@t.iq';
  if r.max_sessions <> 1 or r.enforce is not false then raise exception 'F: الافتراضي في القائمة غير مطابق'; end if;

  -- الحد الأقصى للقائمة يُقصّ ولا يرفع استثناءً
  perform * from public.session_policy_list(null, 100000);
end $$;

-- ═══ G) سجل الأحداث ═══
do $$
declare n int;
begin
  if (select count(*) from public.security_events_list(null, null, 1000)) < 2 then
    raise exception 'G: سجل الأحداث يجب أن يحوي حدثَي تغيير سياسة على الأقل';
  end if;
  select count(*) into n from public.security_events_list('a8000000-0000-4000-8000-000000000003', 'policy_changed', 1000);
  if n < 2 then raise exception 'G: تصفية الأحداث بالحساب والنوع غير صحيحة (%)', n; end if;
  select count(*) into n from public.security_events_list(null, 'login_success', 1000);
  if n <> 0 then raise exception 'G: لا يوجد حدث دخول بعد'; end if;
end $$;

-- ═══ H) الحاوية الخاصة بخدمة الحافة ═══
set local role service_role;
select public.security_event_record(
  'login_success', 'allowed', 'a8000000-0000-4000-8000-000000000003', 'a8-emp@t.iq',
  gen_random_uuid(), 'hash-a8', '203.0.113.9', repeat('U', 1000), '{"via":"test"}'::jsonb
);
reset role;

do $$
declare e record;
begin
  select * into e from public.security_events where event = 'login_success' order by id desc limit 1;
  if e.id is null then raise exception 'H: لم يُسجَّل حدث الدخول'; end if;
  if e.ip <> '203.0.113.9'::inet then raise exception 'H: IP غير محفوظ'; end if;
  if char_length(e.user_agent) <> 400 then raise exception 'H: user_agent يجب أن يُقصّ إلى 400، جاء %', char_length(e.user_agent); end if;
  if e.source_hash <> 'hash-a8' then raise exception 'H: بصمة الجهاز غير محفوظة'; end if;
  if e.detail ->> 'via' <> 'test' then raise exception 'H: تفاصيل الحدث غير محفوظة'; end if;
  if e.email <> 'a8-emp@t.iq' then raise exception 'H: البريد يجب أن يُخزَّن بأحرف صغيرة'; end if;
end $$;

-- authenticated لا يستطيع التسجيل المباشر
set local role authenticated;
select pg_temp.expect_error($$select public.security_event_record('login_failed')$$, 'permission denied');
reset role;
select pg_temp.as_user('a8000000-0000-4000-8000-000000000001');

-- ═══ I) RLS: لا قراءة مباشرة للجداول ═══
set local role authenticated;
select pg_temp.expect_error($$select count(*) from public.security_events$$, 'permission denied');
select pg_temp.expect_error($$select count(*) from public.account_session_policy$$, 'permission denied');
reset role;

-- ═══ خلاصة ═══
do $$
declare n int;
begin
  select count(*) into n from public.account_session_policy;
  if n <> 1 then raise exception 'SUMMARY: يجب أن يبقى صف سياسة واحد، جاء %', n; end if;
  select count(*) into n from public.security_events where event = 'policy_changed';
  if n <> 2 then raise exception 'SUMMARY: يجب حدثا تغيير سياسة (3 ثم 1)، جاء %', n; end if;
  if exists (select 1 from public.security_events where event = 'login_failed') then
    raise exception 'SUMMARY: نجح تسجيل مرفوض من authenticated';
  end if;
end $$;

rollback;
