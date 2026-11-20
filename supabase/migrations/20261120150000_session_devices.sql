-- 20261120150000 — إدارة الجلسات والأجهزة (الجولة ٣)
--
-- ما تفعله هذه الترحيلة:
--   ① قراءة الجلسات الفعلية من auth.sessions (GoTrue) — لا سجل موازٍ.
--   ② إنهاء جلسة (لي) أو كل الجلسات الأخرى — إبطال فعلي بحذف صف الجلسة
--      (GoTrue يرفض التحديث بعد حذف الجلسة ⇒ لا تستمر الجلسة المنتهية).
--   ③ بوابة الحد الأقصى: session_gate_check تقارن الجلسات النشطة بسياسة الحساب
--      (account_session_policy، الجولة ١). تُستدعى من staff-login فقط (service_role).
--   ④ تطبيق «الانتقال»: session_switch_apply تُبقي الجلسة الجديدة وتحذف ما عداها،
--      وتسجّل switch_approved في security_events.
--   ⑤ الإبقاء بلا تغيير: عندما يكون enforce=false (الافتراضي) لا يُمنع أي دخول.
--
-- ملاحظة أمنية موثّقة: حذف صف الجلسة يُبطل رمز التحديث فوراً، أما رمز الوصول القائم
-- فينتهي بانتهاء صلاحيته (افتراضياً ساعة) — هذا حدّ GoTrue لا يمكن تجاوزه من الطبقة العلوية.
--
-- التراجع: إسقاط الدوال الست — لا جدول جديد ولا عمود جديد.

-- ⓪ فحص مسبق
do $pre$
begin
  if to_regprocedure('app.session_policy_for(uuid)') is null then
    raise exception 'SESSION_DEVICES_PRECHECK: نفّذ 20261120120000 أولاً';
  end if;
end $pre$;

-- ① صفوف الجلسات (تُعيد لا شيء إن غاب جدول الجلسات في بيئة الاختبار المحلي)
create or replace function app.session_rows(p_user uuid)
returns table (id uuid, ip inet, user_agent text, created_at timestamptz, last_active timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if p_user is null or to_regclass('auth.sessions') is null then
    return;
  end if;
  return query
    select s.id, s.ip, s.user_agent, s.created_at, coalesce(s.refreshed_at::timestamptz, s.created_at)
    from auth.sessions s
    where s.user_id = p_user
    order by coalesce(s.refreshed_at::timestamptz, s.created_at) desc;
end $$;
revoke all on function app.session_rows(uuid) from public, anon, authenticated;

-- ② الحذف الفعلي: جلسة محددة أو كل الجلسات مع استثناء واحدة
create or replace function app.session_revoke(p_user uuid, p_session uuid default null, p_keep uuid default null)
returns int
language plpgsql security definer set search_path = public, app as $$
declare v_count int := 0;
begin
  if p_user is null or to_regclass('auth.sessions') is null then
    return 0;
  end if;
  with removed as (
    delete from auth.sessions s
     where s.user_id = p_user
       and (p_session is null or s.id = p_session)
       and (p_keep is null or s.id <> p_keep)
    returning 1
  )
  select count(*) into v_count from removed;
  return v_count;
end $$;
revoke all on function app.session_revoke(uuid, uuid, uuid) from public, anon, authenticated;

-- ③ قراءة جلساتي
create or replace function public.my_sessions(p_current uuid default null)
returns table (
  id          uuid,
  ip          inet,
  user_agent  text,
  created_at  timestamptz,
  last_active timestamptz,
  is_current  boolean
)
language plpgsql stable security definer set search_path = public, app as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'PERMISSION_DENIED' using detail = 'لا جلسة';
  end if;
  return query
    select r.id, r.ip, r.user_agent, r.created_at, r.last_active,
           (p_current is not null and r.id = p_current)
    from app.session_rows(v_me) r;
end $$;
revoke all on function public.my_sessions(uuid) from public, anon;
grant execute on function public.my_sessions(uuid) to authenticated;

-- ④ إنهاء جلسة واحدة من جلساتي
create or replace function public.session_end(p_session uuid)
returns int
language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := auth.uid(); v_n int;
begin
  if v_me is null then
    raise exception 'PERMISSION_DENIED' using detail = 'لا جلسة';
  end if;
  -- لا يمكن إنهاء جلسة لا تخصّني: الحذف مقيّد بالمعرّف + المستخدم
  v_n := app.session_revoke(v_me, p_session, null);
  if v_n = 0 then
    raise exception 'SESSION_NOT_FOUND' using detail = p_session::text;
  end if;
  perform app.security_event('session_revoked', 'allowed', v_me, null, p_session, null, null, null,
                             jsonb_build_object('scope', 'single'));
  return v_n;
end $$;
revoke all on function public.session_end(uuid) from public, anon;
grant execute on function public.session_end(uuid) to authenticated;

-- ⑤ إنهاء كل الجلسات الأخرى (يبقى الجهاز الحالي)
--    معرّف الجلسة الحالية يأتي من claim session_id في رمز الوصول
create or replace function public.session_end_others()
returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_me uuid := auth.uid();
  v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_n int;
begin
  if v_me is null then
    raise exception 'PERMISSION_DENIED' using detail = 'لا جلسة';
  end if;
  v_n := app.session_revoke(v_me, null, v_current);
  perform app.security_event('session_revoked', 'allowed', v_me, null, v_current, null, null, null,
                             jsonb_build_object('scope', 'others', 'revoked', v_n));
  return v_n;
end $$;
revoke all on function public.session_end_others() from public, anon;
grant execute on function public.session_end_others() to authenticated;

-- ⑥ بوابة الحد الأقصى — لخدمة الدخول فقط (service_role)
create or replace function public.session_gate_check(p_user uuid, p_session uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_policy jsonb := app.session_policy_for(p_user);
  v_max int := (v_policy ->> 'max_sessions')::int;
  v_enforce boolean := (v_policy ->> 'enforce')::boolean;
  v_active int := 0;
  v_others jsonb := '[]'::jsonb;
begin
  if p_user is null then
    return jsonb_build_object('enforce', false, 'max', v_max, 'active', 0, 'blocked', false, 'others', '[]'::jsonb);
  end if;
  if to_regclass('auth.sessions') is not null then
    select count(*)::int into v_active
      from auth.sessions s
     where s.user_id = p_user and (p_session is null or s.id <> p_session);
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'ip', host(x.ip), 'user_agent', x.user_agent,
                                                 'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
      into v_others
      from (select s.id, s.ip, s.user_agent, s.created_at
              from auth.sessions s
             where s.user_id = p_user and (p_session is null or s.id <> p_session)
             order by s.created_at desc limit 5) x;
  end if;
  return jsonb_build_object(
    'enforce', v_enforce,
    'max', v_max,
    'active', v_active,
    'blocked', v_enforce and v_active >= v_max,
    'others', v_others
  );
end $$;
revoke all on function public.session_gate_check(uuid, uuid) from public, anon, authenticated;
grant execute on function public.session_gate_check(uuid, uuid) to service_role;

-- ⑦ تطبيق الانتقال: تُبقي الجلسة الجديدة وتحذف ما عداها
create or replace function public.session_switch_apply(p_user uuid, p_keep uuid)
returns int
language plpgsql security definer set search_path = public, app as $$
declare v_n int;
begin
  if p_user is null or p_keep is null then
    raise exception 'INVALID_INPUT' using detail = 'session_switch_apply';
  end if;
  v_n := app.session_revoke(p_user, null, p_keep);
  perform app.security_event('switch_approved', 'allowed', p_user, null, p_keep, null, null, null,
                             jsonb_build_object('revoked', v_n));
  return v_n;
end $$;
revoke all on function public.session_switch_apply(uuid, uuid) from public, anon, authenticated;
grant execute on function public.session_switch_apply(uuid, uuid) to service_role;

-- ⑧ إبطال الجلسة الجديدة عند تجاوز الحد (لا نترك جلسة معلّقة بلا استعمال)
create or replace function public.session_revoke_new(p_user uuid, p_session uuid)
returns int
language plpgsql security definer set search_path = public, app as $$
declare v_n int;
begin
  if p_user is null or p_session is null then
    raise exception 'INVALID_INPUT' using detail = 'session_revoke_new';
  end if;
  v_n := app.session_revoke(p_user, p_session, null);
  perform app.security_event('limit_exceeded', 'blocked', p_user, null, p_session, null, null, null,
                             jsonb_build_object('revoked_new', v_n));
  return v_n;
end $$;
revoke all on function public.session_revoke_new(uuid, uuid) from public, anon, authenticated;
grant execute on function public.session_revoke_new(uuid, uuid) to service_role;

-- ⑨ فحص ذاتي
do $check$
begin
  if to_regprocedure('public.my_sessions(uuid)') is null
     or to_regprocedure('public.session_gate_check(uuid,uuid)') is null
     or to_regprocedure('public.session_switch_apply(uuid,uuid)') is null
     or to_regprocedure('public.session_revoke_new(uuid,uuid)') is null then
    raise exception 'SESSION_DEVICES_CHECK: دالة ناقصة';
  end if;
  if app.session_policy_for(gen_random_uuid()) ->> 'enforce' <> 'false' then
    raise exception 'SESSION_DEVICES_CHECK: السياسة الافتراضية يجب أن تكون بلا فرض';
  end if;
end $check$;
