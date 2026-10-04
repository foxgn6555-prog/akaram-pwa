-- 00172: (١) إصلاح جذري — المستقبل adms-receiver يستدعي RPC باسم biometric_touch في public، لكن الدالة كانت في app فقط
--         (PostgREST لا يرى app) ⇒ نبضات الجهاز (getrequest كل 10 ثوانٍ) كانت تصل ولا تُحدّث «آخر اتصال»،
--         فيظهر الجهاز «غير متصل» ولا يتحول إلى «متصل» إلا عند وصول بصمة (biometric_ingest يستدعي app.biometric_touch داخلياً).
--     (٢) طابور أوامر بسيط: جلب أسماء مستخدمي الجهاز (DATA QUERY USERINFO) — الجهاز لا يرسل الأسماء من تلقاء نفسه،
--         يرسلها فقط عندما يُطلب منه؛ يُطلب تلقائياً عند التسجيل/عند وجود PIN بلا اسم (كل 12 ساعة كحد أقصى)،
--         ويدوياً من بوابة التطوير المركزي («جلب أسماء المستخدمين»).

-- ① الغلاف العام لدور الخدمة فقط
create or replace function public.biometric_touch(p_sn text)
returns void
language sql
security definer
set search_path = public, app
as $$
  select app.biometric_touch(p_sn);
$$;
revoke all on function public.biometric_touch(text) from public, anon, authenticated;

-- ② طابور الأوامر
alter table public.biometric_devices
  add column if not exists users_queried_at timestamptz,
  add column if not exists users_query_requested boolean not null default true;

comment on column public.biometric_devices.users_queried_at is 'آخر مرة طُلب فيها من الجهاز إرسال أسماء مستخدميه (DATA QUERY USERINFO)';
comment on column public.biometric_devices.users_query_requested is 'طلب يدوي/أولي معلّق: يُرسل الأمر في أول نبضة قادمة ثم يُصفَّر';

-- الأمر التالي للجهاز (يستدعيه المستقبل في كل نبضة getrequest). يعيد null إن لا شيء.
create or replace function public.biometric_command_next(p_sn text)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  d record;
  v_need boolean;
begin
  select id, users_queried_at, users_query_requested into d
  from public.biometric_devices where serial_number = p_sn and is_active;
  if d.id is null then return null; end if;

  -- حاجة تلقائية: بصمات خلال 7 أيام لها PIN بلا اسم من الجهاز، ولم نسأل خلال 12 ساعة
  v_need := d.users_query_requested
         or (coalesce(d.users_queried_at, '-infinity'::timestamptz) < now() - interval '12 hours'
             and exists (
               select 1 from public.biometric_punches p
               left join public.biometric_device_users u on u.device_serial = p.device_serial and u.pin = p.pin
               where p.device_serial = p_sn and p.punched_at > now() - interval '7 days'
                 and (u.name is null or u.name = '')
               limit 1));
  if not v_need then return null; end if;

  update public.biometric_devices
     set users_queried_at = now(), users_query_requested = false, updated_at = now()
   where id = d.id;
  insert into public.integration_logs (provider, direction, endpoint, status, payload)
  values ('biometric', 'outbound', 'adms/command', 'success', jsonb_build_object('sn', p_sn, 'cmd', 'DATA QUERY USERINFO'));
  -- معرّف الأمر = ثواني الحقبة (فريد عملياً؛ الجهاز يعيده في devicecmd)
  return 'C:' || extract(epoch from now())::bigint::text || ':DATA QUERY USERINFO';
end;
$$;
revoke all on function public.biometric_command_next(text) from public, anon, authenticated;

-- طلب يدوي من IT: يُرسل في أول نبضة قادمة
create or replace function public.biometric_request_users(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
  update public.biometric_devices set users_query_requested = true, updated_at = now() where id = p_device_id;
  if not found then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.biometric_request_users(uuid) from public, anon;
grant execute on function public.biometric_request_users(uuid) to authenticated;
