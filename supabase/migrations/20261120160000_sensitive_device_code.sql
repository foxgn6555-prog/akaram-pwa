-- 20261120160000 — التحقق الإضافي للحسابات الحساسة (الجولة ٣-ب)
--
-- المشكلة: «الانتقال» بكلمة المرور وحدها يسمح بالاستيلاء على حساب حسّاس (طرد صاحبه).
-- الحل (الخيار ١): رمز موافقة يُنشئه صاحب الحساب من جهازه الحالي، ويُدخله الجهاز الجديد.
--
-- ما تفعله هذه الترحيلة:
--   ① جدول public.device_switch_codes — الرمز **مُجزَّأ** (sha256) ولا يُخزَّن صريحاً،
--      صلاحية 10 دقائق، محاولات محدودة، ويُستهلك مرة واحدة.
--   ② public.device_switch_code_create() — لصاحب الحساب: يُلغي الرموز السابقة ويُعيد رمزاً واحداً.
--   ③ public.device_switch_code_verify(...) — لخدمة الدخول فقط (service_role).
--   ④ public.session_is_sensitive(...) — هل الحساب يحمل دوراً من الجدول الحسّاس (service_role).
--   ⑤ public.admin_session_list / admin_session_end — تقنية المعلومات تُنهي جلسة أي حساب
--      (حالة فقدان الجهاز) مع تدقيق.
--
-- التراجع: إسقاط الجدول والدوال الخمس.

-- ⓪ فحص مسبق
do $pre$
begin
  if to_regclass('public.sensitive_roles') is null then
    raise exception 'DEVICE_CODE_PRECHECK: نفّذ 20261120130000 أولاً';
  end if;
  if to_regprocedure('app.session_revoke(uuid,uuid,uuid)') is null then
    raise exception 'DEVICE_CODE_PRECHECK: نفّذ 20261120150000 أولاً';
  end if;
end $pre$;

-- ① جدول رموز الموافقة
create table if not exists public.device_switch_codes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  code_hash        text not null,
  created_by_session uuid,
  expires_at       timestamptz not null,
  attempts         int not null default 0,
  used_at          timestamptz,
  used_session     uuid,
  created_at       timestamptz not null default now()
);

comment on table public.device_switch_codes is
  'رموز موافقة صاحب الحساب على جهاز جديد. تُخزَّن مجزَّأة، صالحة 10 دقائق، تُستهلك مرة واحدة.';

alter table public.device_switch_codes enable row level security;
revoke all on table public.device_switch_codes from anon, authenticated;

create index if not exists idx_device_switch_codes_user
  on public.device_switch_codes (user_id, created_at desc);

-- هل الحساب يحمل دوراً حسّاساً نشطاً؟
create or replace function app.user_has_sensitive_role(p_user uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.sensitive_roles sr on sr.role = ur.role and sr.active
    where ur.user_id = p_user
  )
$$;
revoke all on function app.user_has_sensitive_role(uuid) from public, anon, authenticated;

-- ② إنشاء رمز (صاحب الحساب)
create or replace function public.device_switch_code_create()
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_me uuid := auth.uid();
  v_code text;
  v_exp timestamptz := now() + interval '10 minutes';
begin
  if v_me is null then
    raise exception 'PERMISSION_DENIED' using detail = 'لا جلسة';
  end if;

  -- رمز واحد ساري: إلغاء ما قبله
  delete from public.device_switch_codes c
   where c.user_id = v_me and c.used_at is null;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into public.device_switch_codes (user_id, code_hash, created_by_session, expires_at)
  values (v_me, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
          nullif(auth.jwt() ->> 'session_id', '')::uuid, v_exp);

  perform app.security_event('switch_approved', 'info', v_me, null, null, null, null, null,
                             jsonb_build_object('action', 'device_code_created'));

  return jsonb_build_object('code', v_code, 'expires_at', v_exp);
end $$;
revoke all on function public.device_switch_code_create() from public, anon;
grant execute on function public.device_switch_code_create() to authenticated;

-- ③ التحقق (خدمة الدخول فقط)
create or replace function public.device_switch_code_verify(p_user uuid, p_code text, p_session uuid)
returns boolean
language plpgsql security definer set search_path = public, app as $$
declare
  v_row public.device_switch_codes;
  v_hash text;
begin
  if p_user is null or p_session is null or coalesce(btrim(p_code), '') = '' then
    return false;
  end if;
  if p_code !~ '^[0-9]{6}$' then
    return false;
  end if;

  select * into v_row
    from public.device_switch_codes c
   where c.user_id = p_user and c.used_at is null
   order by c.created_at desc
   limit 1
   for update;

  if v_row.id is null then return false; end if;

  if v_row.attempts >= 5 then
    -- استُنفدت المحاولات: يُبطَل الرمز
    update public.device_switch_codes set used_at = now() where id = v_row.id;
    perform app.security_event('switch_denied', 'blocked', p_user, null, p_session, null, null, null,
                               jsonb_build_object('reason', 'attempts_exhausted'));
    return false;
  end if;

  update public.device_switch_codes set attempts = attempts + 1 where id = v_row.id;

  if v_row.expires_at <= now() then
    perform app.security_event('switch_denied', 'blocked', p_user, null, p_session, null, null, null,
                               jsonb_build_object('reason', 'expired'));
    return false;
  end if;

  v_hash := encode(sha256(convert_to(btrim(p_code), 'UTF8')), 'hex');
  if v_hash <> v_row.code_hash then
    perform app.security_event('switch_denied', 'blocked', p_user, null, p_session, null, null, null,
                               jsonb_build_object('reason', 'wrong_code'));
    return false;
  end if;

  update public.device_switch_codes
     set used_at = now(), used_session = p_session
   where id = v_row.id;

  return true;
end $$;
revoke all on function public.device_switch_code_verify(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.device_switch_code_verify(uuid, text, uuid) to service_role;

-- ④ هل الحساب حسّاس؟ (خدمة الدخول فقط)
create or replace function public.session_is_sensitive(p_user uuid)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.user_has_sensitive_role(p_user)
$$;
revoke all on function public.session_is_sensitive(uuid) from public, anon, authenticated;
grant execute on function public.session_is_sensitive(uuid) to service_role;

-- ⑤ تقنية المعلومات: عرض جلسات حساب وإنهاؤها (حالة فقدان الجهاز)
create or replace function public.admin_session_list(p_user uuid)
returns table (id uuid, ip inet, user_agent text, created_at timestamptz, last_active timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it_admin('view');
  return query select r.id, r.ip, r.user_agent, r.created_at, r.last_active from app.session_rows(p_user) r;
end $$;
revoke all on function public.admin_session_list(uuid) from public, anon;
grant execute on function public.admin_session_list(uuid) to authenticated;

create or replace function public.admin_session_end(p_user uuid, p_session uuid default null)
returns int
language plpgsql security definer set search_path = public, app as $$
declare v_n int;
begin
  perform app.require_it_admin('edit');
  v_n := app.session_revoke(p_user, p_session, null);
  perform app.security_event('session_revoked', 'allowed', p_user, null, p_session, null, null, null,
                             jsonb_build_object('scope', case when p_session is null then 'all' else 'single' end,
                                                'by_it', auth.uid()));
  return v_n;
end $$;
revoke all on function public.admin_session_end(uuid, uuid) from public, anon;
grant execute on function public.admin_session_end(uuid, uuid) to authenticated;

-- ⑥ فحص ذاتي
do $check$
begin
  if to_regclass('public.device_switch_codes') is null then
    raise exception 'DEVICE_CODE_CHECK: الجدول لم يُنشأ';
  end if;
  if app.user_has_sensitive_role(null) then
    raise exception 'DEVICE_CODE_CHECK: null ليس حساباً حسّاساً';
  end if;
end $check$;
