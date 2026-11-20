-- الجولة ٣-ب — رمز موافقة الجهاز للحسابات الحساسة (20261120160000): معاملة تُرجَع كاملة.
-- بادئة d1.
--   A) تصنيف الحساب الحسّاس من الجدول القابل للتعديل (وتعطيل الدور يُلغي التصنيف)
--   B) إنشاء رمز: ستة أرقام · يُخزَّن مجزَّأً لا صريحاً · رمز واحد ساري (الجديد يُلغي القديم)
--   C) التحقق: خطأ ⇒ رفض · صحيح ⇒ نجاح واستهلاك مرة واحدة · انتهاء الصلاحية ⇒ رفض · استنفاد المحاولات ⇒ إبطال
--   D) تقنية المعلومات: عرض جلسات حساب وإنهاؤها + التدقيق · وغيرها ممنوع
--   E) الحراسة: authenticated لا يستدعي دوال خدمة الحافة
begin;
set client_min_messages = notice;

create or replace function pg_temp.as_user(p uuid, p_session uuid default null) returns void language plpgsql as $$
declare v_claims text;
begin
  v_claims := json_build_object('sub', p, 'role', 'authenticated', 'session_id', coalesce(p_session::text, ''))::text;
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
  ('d1000000-0000-4000-8000-000000000001', 'd1-fin@t.iq'),
  ('d1000000-0000-4000-8000-000000000002', 'd1-emp@t.iq'),
  ('d1000000-0000-4000-8000-000000000003', 'd1-it@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d1000000-0000-4000-8000-000000000001', 'finance_officer'),
  ('d1000000-0000-4000-8000-000000000002', 'employee'),
  ('d1000000-0000-4000-8000-000000000003', 'it_admin')
on conflict do nothing;

-- ═══ A) التصنيف ═══
do $$ begin
  if not app.user_has_sensitive_role('d1000000-0000-4000-8000-000000000001') then
    raise exception 'A: finance_officer يجب أن يكون حساباً حسّاساً';
  end if;
  if app.user_has_sensitive_role('d1000000-0000-4000-8000-000000000002') then
    raise exception 'A: الموظف العادي ليس حساباً حسّاساً';
  end if;
end $$;

-- تعطيل حماية الدور يُلغي التصنيف
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select public.sensitive_role_set('finance_officer', false, 'اختبار');
do $$ begin
  if app.user_has_sensitive_role('d1000000-0000-4000-8000-000000000001') then
    raise exception 'A: تعطيل الدور لم يُلغِ التصنيف';
  end if;
end $$;
select public.sensitive_role_set('finance_officer', true, null);

-- ═══ B) إنشاء الرمز ═══
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000e1');
do $$
declare v jsonb; v_code text; v_hash text;
begin
  v := public.device_switch_code_create();
  v_code := v ->> 'code';
  if v_code !~ '^[0-9]{6}$' then raise exception 'B: الرمز يجب أن يكون 6 أرقام، جاء %', v_code; end if;
  if (v ->> 'expires_at')::timestamptz <= now() then raise exception 'B: الصلاحية يجب أن تكون مستقبلية'; end if;

  select code_hash into v_hash from public.device_switch_codes
   where user_id = 'd1000000-0000-4000-8000-000000000001' and used_at is null;
  if v_hash = v_code then raise exception 'B: خُزِّن الرمز صريحاً!'; end if;
  if v_hash <> encode(sha256(convert_to(v_code, 'UTF8')), 'hex') then raise exception 'B: التجزئة غير مطابقة'; end if;

  -- رمز جديد يُلغي القديم
  perform public.device_switch_code_create();
  if (select count(*) from public.device_switch_codes
       where user_id = 'd1000000-0000-4000-8000-000000000001' and used_at is null) <> 1 then
    raise exception 'B: يجب أن يبقى رمز ساري واحد فقط';
  end if;
end $$;

-- ═══ C) التحقق ═══
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
do $$
declare v_code text; v_ok boolean;
begin
  -- رمز جديد معروف
  delete from public.device_switch_codes;
  insert into public.device_switch_codes (user_id, code_hash, expires_at)
  values ('d1000000-0000-4000-8000-000000000001', encode(sha256(convert_to('123456','UTF8')),'hex'), now() + interval '10 minutes');

  v_ok := public.device_switch_code_verify('d1000000-0000-4000-8000-000000000001', '000000', gen_random_uuid());
  if v_ok then raise exception 'C: رُمز خاطئ قُبِل'; end if;
  if (select attempts from public.device_switch_codes order by created_at desc limit 1) <> 1 then
    raise exception 'C: عدّاد المحاولات لم يزد';
  end if;

  v_ok := public.device_switch_code_verify('d1000000-0000-4000-8000-000000000001', '123456', 'd1000000-0000-4000-8000-0000000000e1');
  if not v_ok then raise exception 'C: الرمز الصحيح رُفض'; end if;

  -- استهلاك مرة واحدة
  v_ok := public.device_switch_code_verify('d1000000-0000-4000-8000-000000000001', '123456', 'd1000000-0000-4000-8000-0000000000e1');
  if v_ok then raise exception 'C: استُخدم الرمز مرتين'; end if;

  -- انتهاء الصلاحية
  delete from public.device_switch_codes;
  insert into public.device_switch_codes (user_id, code_hash, expires_at)
  values ('d1000000-0000-4000-8000-000000000001', encode(sha256(convert_to('654321','UTF8')),'hex'), now() - interval '1 minute');
  v_ok := public.device_switch_code_verify('d1000000-0000-4000-8000-000000000001', '654321', gen_random_uuid());
  if v_ok then raise exception 'C: رُمز منتهٍ قُبِل'; end if;

  -- استنفاد المحاولات
  delete from public.device_switch_codes;
  insert into public.device_switch_codes (user_id, code_hash, expires_at, attempts)
  values ('d1000000-0000-4000-8000-000000000001', encode(sha256(convert_to('111111','UTF8')),'hex'), now() + interval '10 minutes', 5);
  v_ok := public.device_switch_code_verify('d1000000-0000-4000-8000-000000000001', '111111', gen_random_uuid());
  if v_ok then raise exception 'C: قُبل رمز بعد استنفاد المحاولات'; end if;

  -- صيغة غير صحيحة
  if public.device_switch_code_verify('d1000000-0000-4000-8000-000000000001', '12ab', null) then
    raise exception 'C: قُبل رمز بصيغة خاطئة أو بلا جلسة';
  end if;

  if not public.session_is_sensitive('d1000000-0000-4000-8000-000000000001') then
    raise exception 'C: session_is_sensitive لم تُعرّف الحساب';
  end if;
end $$;

-- ═══ D) تقنية المعلومات: جلسات حساب وإنهاؤها ═══
insert into auth.sessions (user_id, ip, user_agent) values
  ('d1000000-0000-4000-8000-000000000001', '10.1.1.1', 'D1-A'),
  ('d1000000-0000-4000-8000-000000000001', '10.1.1.2', 'D1-B');

select pg_temp.as_user('d1000000-0000-4000-8000-000000000002');   -- موظف عادي
select pg_temp.expect_error($$select * from public.admin_session_list('d1000000-0000-4000-8000-000000000001')$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select public.admin_session_end('d1000000-0000-4000-8000-000000000001', null)$$, 'PERMISSION_DENIED');

select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');   -- تقنية المعلومات
do $$
declare n int;
begin
  select count(*) into n from public.admin_session_list('d1000000-0000-4000-8000-000000000001');
  if n <> 2 then raise exception 'D: يجب عرض جلستين، جاء %', n; end if;

  n := public.admin_session_end('d1000000-0000-4000-8000-000000000001', null);
  if n <> 2 then raise exception 'D: يجب إنهاء جلستين، جاء %', n; end if;
  if exists (select 1 from auth.sessions where user_id = 'd1000000-0000-4000-8000-000000000001') then
    raise exception 'D: بقيت جلسات مفتوحة';
  end if;
  if not exists (select 1 from public.security_events
                  where event = 'session_revoked' and (detail ->> 'by_it') is not null) then
    raise exception 'D: الإنهاء بواسطة IT لم يُسجَّل في التدقيق';
  end if;
end $$;

-- ═══ E) الحراسة ═══
set local role authenticated;
select pg_temp.expect_error($$select public.device_switch_code_verify('d1000000-0000-4000-8000-000000000001','123456',null)$$, 'permission denied');
select pg_temp.expect_error($$select public.session_is_sensitive('d1000000-0000-4000-8000-000000000001')$$, 'permission denied');
select pg_temp.expect_error($$select count(*) from public.device_switch_codes$$, 'permission denied');
reset role;

rollback;
