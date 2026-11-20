-- 20261120235000 — تنظيف الجلسات الميتة (الجولة ٣-د)
--
-- المشكلة: auth.sessions تراكمت (٢٥٥ صفاً لـ٩ حسابات، أغلبها من ٧–١٣ نوفمبر) لأن كل دخول
--          ينشئ صفاً ولا يُغلق إلا بالخروج. أثرها: قائمة «أجهزتي» تزدحم بأجهزة ميتة،
--          و«إنهاء كل الأجهزة» يحذف ما هو ميت أصلاً بدل أن ينظّف.
--
-- المعيار الآمن: الجلسة التي لم يُحدَّث رمزها منذ p_days (٧ افتراضياً) ميتة عملياً، لأن
--          رمز الوصول لا يعيش أكثر من ١٥ دقيقة بعد تقصيره، ورمز التحديث يُجدَّد تلقائياً
--          ما دام الجهاز مستخدماً. ويُستثنى دائماً **أحدث صف لكل مستخدم** فلا يُفقد
--          أحد جلسته الوحيدة ولو كان جهازه مغلقاً منذ شهور.
--
-- الأثر على المستخدم: لا شيء. الصفوف المحذوفة لا يستطيع صاحبها تجديدها أصلاً؛ فإن كان
--          تطبيق مفتوحاً برمز وصول قديم فسينتهي مع صلاحيته ويُطلب الدخول مرة واحدة.
--
-- التراجع: لا شيء يُستعاد (الحذف نهائي). الدالة نفسها تُسقط بـdrop function app.purge_stale_sessions(int).

do $pre$
begin
  if to_regclass('auth.sessions') is null then
    raise exception 'PURGE_PRECHECK: auth.sessions غير موجودة';
  end if;
end $pre$;

create or replace function app.purge_stale_sessions(p_days int default 7)
returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_days int := greatest(coalesce(p_days, 7), 1);
  v_n int := 0;
begin
  if to_regclass('auth.sessions') is null then
    return 0;
  end if;

  with ranked as (
    select s.id,
           coalesce(s.refreshed_at, s.created_at) as last_act,
           row_number() over (
             partition by s.user_id
             order by coalesce(s.refreshed_at, s.created_at) desc, s.created_at desc
           ) as rn
    from auth.sessions s
  ), gone as (
    delete from auth.sessions s
     using ranked r
     where s.id = r.id
       and r.rn > 1                                  -- أحدث جلسة لكل مستخدم تبقى دائماً
       and r.last_act < now() - make_interval(days => v_days)
    returning 1
  )
  select count(*) into v_n from gone;

  return v_n;
end $$;

revoke all on function app.purge_stale_sessions(int) from public, anon, authenticated;
grant execute on function app.purge_stale_sessions(int) to service_role;

-- تنظيف لمرة واحدة عند التطبيق (٧ أيام): الأقدم من ذلك يُحذف، مع إبقاء أحدث جلسة لكل حساب
do $purge$
declare v_n int;
begin
  v_n := app.purge_stale_sessions(7);
  raise notice 'PURGE_STALE_SESSIONS: deleted=%', v_n;
end $purge$;

do $check$
begin
  if has_function_privilege('anon', 'app.purge_stale_sessions(int)', 'execute') then
    raise exception 'PURGE_CHECK: anon يجب أن يبقى محجوباً';
  end if;
  if has_function_privilege('authenticated', 'app.purge_stale_sessions(int)', 'execute') then
    raise exception 'PURGE_CHECK: authenticated يجب أن يبقى محجوباً';
  end if;
  if not exists (
    select 1 from auth.sessions s
     where s.id = (
       select s2.id from auth.sessions s2
        where s2.user_id = s.user_id
        order by coalesce(s2.refreshed_at, s2.created_at) desc
        limit 1
     )
  ) then
    raise notice 'PURGE_CHECK: بعض المستخدمين بلا جلسات — لا مشكلة';
  end if;
end $check$;
