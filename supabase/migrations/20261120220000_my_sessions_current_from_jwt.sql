-- 20261120220000 — «جلساتي»: تمييز الجلسة الحالية على الخادم لا بالعميل وحده
--
-- لماذا:
--   my_sessions(p_current) كان يستقبل معرّف الجلسة الحالية من العميل (من claim session_id
--   داخل رمز الوصول). إن تعذّر على العميل قراءة الـclaim لأي سبب (رمز بلا claim · استدعاء
--   من مسار آخر) أُعيدت كل الجلسات بـis_current=false ⇒ يظهر زر «إنهاء» على الجلسة
--   الحالية نفسها، وينتهي المستخدم بإنهاء جلسته من حيث لا يقصد.
--
-- ماذا يفعل:
--   يُشتق معرّف الجلسة الحالية من الـJWT على الخادم (auth.jwt() ->> 'session_id')
--   ويُستخدم كقيمة احتياطية عندما لا يُمرَّر p_current. لا تغيير في التوقيع ولا الأذونات.
--
-- التراجع: إعادة تعريف الدالة بالنسخة السابقة (20261120150000) — لا بيانات ولا أعمدة.

do $pre$
begin
  if to_regprocedure('public.my_sessions(uuid)') is null then
    raise exception 'MY_SESSIONS_JWT_PRECHECK: نفّذ 20261120150000 أولاً';
  end if;
end $pre$;

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
declare
  v_me uuid := auth.uid();
  v_current uuid := coalesce(p_current, nullif(auth.jwt() ->> 'session_id', '')::uuid);
begin
  if v_me is null then
    raise exception 'PERMISSION_DENIED' using detail = 'لا جلسة';
  end if;
  return query
    select r.id, r.ip, r.user_agent, r.created_at, r.last_active,
           (v_current is not null and r.id = v_current)
    from app.session_rows(v_me) r;
end $$;
revoke all on function public.my_sessions(uuid) from public, anon;
grant execute on function public.my_sessions(uuid) to authenticated;

-- فحص ذاتي: التوقيع والأذونات كما هي، والدالة تحتوي اشتقاق الجلسة من الـJWT
do $check$
begin
  if has_function_privilege('anon', 'public.my_sessions(uuid)', 'execute') then
    raise exception 'MY_SESSIONS_JWT_CHECK: anon يجب أن يبقى محجوباً';
  end if;
  if not has_function_privilege('authenticated', 'public.my_sessions(uuid)', 'execute') then
    raise exception 'MY_SESSIONS_JWT_CHECK: authenticated يجب أن يبقى مسموحاً';
  end if;
  if position('session_id' in pg_get_functiondef('public.my_sessions(uuid)'::regprocedure)) = 0 then
    raise exception 'MY_SESSIONS_JWT_CHECK: الاشتقاق من الـJWT غير موجود';
  end if;
end $check$;
