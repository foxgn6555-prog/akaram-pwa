-- 20261120190000_security_timeline.sql — اللوحة الأمنية الموحّدة (الجولة ٧)
--
-- المتطلب: شاشة واحدة تجمع كل ما يخص الأمان والحسابات، بتصفية زمنية وحساب:
--   ① أحداث الدخول والجلسات       (public.security_events — الجولة ١/٣)
--   ② تدقيق الصلاحيات وأسقف الصفحات (public.permission_audit + account_page_levels — الجولة ٦)
--   ③ طلبات منح/سحب الأدوار        (public.role_grant_requests — الجولة ٢)
--
-- نجمعها في الخادم (لا في الواجهة) كي تكون مصدراً واحداً قابلاً للتصفية والعدّ،
-- ونظل نقرأ الجداول الأصلية كما هي — لا جدول جديد ولا نسخ بيانات.
--
-- ما تضيفه الترحيلة: دالتان — it_security_timeline (السجل الموحّد) وit_security_overview (بطاقات العدّ).
-- كلتاهما محروستان بـ app.require_it_admin('view') وسحبهما عن anon/عامة.
--
-- التراجع: drop الدالتين فقط.

-- ⓪ فحص مسبق
do $pre$
begin
  if to_regclass('public.security_events') is null then
    raise exception 'TIMELINE_PRECHECK: نفّذ 20261120120000 أولاً (security_events)';
  end if;
  if to_regclass('public.permission_audit') is null then
    raise exception 'TIMELINE_PRECHECK: جدول تدقيق الصلاحيات غير موجود';
  end if;
  if to_regclass('public.role_grant_requests') is null then
    raise exception 'TIMELINE_PRECHECK: جدول طلبات الأدوار غير موجود';
  end if;
  if to_regprocedure('app.require_it_admin(text)') is null then
    raise exception 'TIMELINE_PRECHECK: app.require_it_admin غير موجودة';
  end if;
end $pre$;

-- ① السجل الموحّد
create or replace function public.it_security_timeline(
  p_user   uuid default null,
  p_days   int  default 7,
  p_source text default null,
  p_limit  int  default 300
) returns table (
  occurred_at  timestamptz,
  source       text,
  kind         text,
  outcome      text,
  actor_id     uuid,
  actor_label  text,
  target_id    uuid,
  target_label text,
  summary      text,
  detail       jsonb
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_days   int := least(greatest(coalesce(p_days, 7), 1), 365);
  v_limit  int := least(greatest(coalesce(p_limit, 300), 1), 500);
  v_since  timestamptz := now() - make_interval(days => v_days);
begin
  perform app.require_it_admin('view');
  if p_source is not null and p_source not in ('session', 'permissions', 'roles') then
    raise exception 'INVALID_INPUT' using detail = 'source';
  end if;

  return query
  select t.* from (
    -- ① أحداث الدخول والجلسات
    select se.created_at            as occurred_at,
           'session'::text          as source,
           se.event::text           as kind,
           se.outcome::text         as outcome,
           se.user_id               as actor_id,
           coalesce(se.email, app.user_display_name(se.user_id))  as actor_label,
           se.user_id               as target_id,
           coalesce(se.email, app.user_display_name(se.user_id))  as target_label,
           (case se.event
              when 'login_success'  then 'دخول ناجح'
              when 'login_failed'   then 'محاولة دخول فاشلة'
              when 'device_conflict' then 'دخول من جهاز مختلف'
              when 'limit_exceeded' then 'تجاوز حد الأجهزة'
              when 'session_revoked' then 'إنهاء جلسة'
              when 'switch_approved' then 'انتقال إلى جهاز جديد (معتمد)'
              when 'switch_denied'   then 'انتقال مرفوض'
              when 'policy_changed'  then 'تغيير سياسة الأجهزة'
              else se.event::text
            end)
            || coalesce(' · ' || se.ip::text, '')                          as summary,
           jsonb_build_object('ip', se.ip, 'country', se.country, 'city', se.city,
                              'user_agent', se.user_agent, 'detail', se.detail) as detail
      from public.security_events se
     where se.created_at >= v_since
       and (p_user is null or se.user_id = p_user)

    union all

    -- ② تدقيق الصلاحيات وأسقف الصفحات
    select pa.created_at,
           'permissions'::text,
           pa.kind::text,
           'info'::text,
           pa.actor_id,
           app.user_display_name(pa.actor_id),
           pa.target_user,
           app.user_display_name(pa.target_user),
           (case pa.kind
              when 'level_set'       then 'ضبط سقف صفحة لحساب'
              when 'level_clear'     then 'إزالة سقف صفحة'
              when 'override_set'    then 'استثناء صلاحية لحساب'
              when 'template_save'   then 'حفظ قالب صلاحيات'
              when 'template_rules'  then 'تعديل قواعد قالب'
              when 'template_delete' then 'حذف قالب صلاحيات'
              when 'template_assign' then 'إسناد قالب لحساب'
              else 'تدقيق صلاحيات: ' || pa.kind::text
            end)
            || coalesce(' · ' || (pa.detail ->> 'unit'), '')               as summary,
           pa.detail
      from public.permission_audit pa
     where pa.created_at >= v_since
       and (p_user is null or pa.target_user = p_user)

    union all

    -- ③ طلبات منح/سحب الأدوار
    select r.requested_at,
           'roles'::text,
           (case when r.is_grant then 'role_grant' else 'role_revoke' end),
           r.status::text,
           r.requested_by,
           app.user_display_name(r.requested_by),
           r.target_user,
           app.user_display_name(r.target_user),
           (case when r.is_grant then 'طلب منح دور ' else 'طلب سحب دور ' end)
            || coalesce(app.approval_role_label(r.role), r.role)
            || (case r.status
                  when 'pending'   then ' — بانتظار الاعتماد'
                  when 'approved'  then ' — معتمد'
                  when 'rejected'  then ' — مرفوض'
                  when 'cancelled' then ' — ملغى'
                  else ''
                end),
           jsonb_build_object('role', r.role, 'is_grant', r.is_grant, 'status', r.status,
                              'decided_by', r.decided_by, 'decided_at', r.decided_at,
                              'note', r.note)
      from public.role_grant_requests r
     where r.requested_at >= v_since
       and (p_user is null or r.target_user = p_user)
  ) t
  where p_source is null or t.source = p_source
  order by t.occurred_at desc
  limit v_limit;
end$$;

comment on function public.it_security_timeline(uuid, int, text, int) is
  'سجل أمني موحّد (جلسات + صلاحيات + أدوار) لتقنية المعلومات. تصفية بحساب ومدة ومصدر.';

revoke all on function public.it_security_timeline(uuid, int, text, int) from public, anon;
grant execute on function public.it_security_timeline(uuid, int, text, int) to authenticated;

-- ② بطاقات العدّ
create or replace function public.it_security_overview(p_days int default 7) returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_days  int := least(greatest(coalesce(p_days, 7), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_out   jsonb;
begin
  perform app.require_it_admin('view');

  select jsonb_build_object(
    'days', v_days,
    'session', jsonb_build_object(
      'total',    (select count(*) from public.security_events where created_at >= v_since),
      'blocked',  (select count(*) from public.security_events where created_at >= v_since and outcome = 'blocked'),
      'logins',   (select count(*) from public.security_events where created_at >= v_since and event = 'login_success'),
      'failed',   (select count(*) from public.security_events where created_at >= v_since and event = 'login_failed')
    ),
    'permissions', jsonb_build_object(
      'total',      (select count(*) from public.permission_audit where created_at >= v_since),
      'level_sets', (select count(*) from public.permission_audit where created_at >= v_since and kind = 'level_set')
    ),
    'roles', jsonb_build_object(
      'total',    (select count(*) from public.role_grant_requests where requested_at >= v_since),
      'pending',  (select count(*) from public.role_grant_requests where requested_at >= v_since and status = 'pending'),
      'approved', (select count(*) from public.role_grant_requests where requested_at >= v_since and status = 'approved'),
      'rejected', (select count(*) from public.role_grant_requests where requested_at >= v_since and status = 'rejected')
    ),
    'accounts', jsonb_build_object(
      'with_policy',  (select count(*) from public.account_session_policy where enforce),
      'with_levels',  (select count(distinct user_id) from public.account_page_levels)
    ),
    'last_event_at', (select max(created_at) from public.security_events)
  ) into v_out;

  return v_out;
end$$;

comment on function public.it_security_overview(int) is
  'عدّادات اللوحة الأمنية (جلسات/صلاحيات/أدوار/حسابات) خلال مدة محددة — لتقنية المعلومات فقط.';

revoke all on function public.it_security_overview(int) from public, anon;
grant execute on function public.it_security_overview(int) to authenticated;

-- ③ فحص ذاتي
do $check$
declare v jsonb;
begin
  if to_regprocedure('public.it_security_timeline(uuid,int,text,int)') is null then
    raise exception 'TIMELINE_CHECK: الدالة غير موجودة';
  end if;
  if to_regprocedure('public.it_security_overview(int)') is null then
    raise exception 'TIMELINE_CHECK: دالة العدّ غير موجودة';
  end if;
  if app.approval_role_label('it_admin') is null then
    raise exception 'TIMELINE_CHECK: app.approval_role_label لا تُرجع تسمية';
  end if;
exception when others then
  raise;
end $check$;
