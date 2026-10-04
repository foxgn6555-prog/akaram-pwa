-- 00173: تشخيص اتصال جهاز البصمة (ADMS) من بوابة التطوير المركزي
--   · طوابع منفصلة: آخر تسجيل (options)، آخر نبضة (getrequest)، عدّاد النبضات — لمعرفة أي مرحلة تتوقف عندها
--   · public_url: العنوان المُدخل في الجهاز (أو وسيط Cloudflare) ليُختبر من المتصفح
--   · biometric_device_diagnostics: فحوصات جاهزة (مسجّل؟ ينبض؟ يدفع؟ أسماء؟ غير مطابَق؟) + آخر الأحداث

alter table public.biometric_devices
  add column if not exists last_registered_at timestamptz,
  add column if not exists last_heartbeat_at  timestamptz,
  add column if not exists heartbeat_count    bigint not null default 0,
  add column if not exists public_url         text;

comment on column public.biometric_devices.public_url is 'العنوان المُدخل في الجهاز (مضيف الوسيط أو رابط الدالة) — يُختبر من المتصفح في التشخيص';

-- اللمس بنوعه (يستبدل غلاف 00172 بتوقيع واحد ذي قيمة افتراضية — لا تحميل زائد)
drop function if exists public.biometric_touch(text);
create or replace function public.biometric_touch(p_sn text, p_kind text default 'heartbeat')
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if p_kind = 'register' then
    update public.biometric_devices
       set last_seen_at = now(), last_registered_at = now(), updated_at = now()
     where serial_number = p_sn and is_active;
  else
    update public.biometric_devices
       set last_seen_at = now(), last_heartbeat_at = now(), heartbeat_count = heartbeat_count + 1
     where serial_number = p_sn and is_active;
  end if;
end;
$$;
revoke all on function public.biometric_touch(text, text) from public, anon, authenticated;

-- تسجيل حدث التسجيل في سجل التكامل (مرة لكل تسجيل — ليس لكل نبضة)
create or replace function public.biometric_log_register(p_sn text, p_known boolean)
returns void
language sql
security definer
set search_path = public, app
as $$
  insert into public.integration_logs (provider, direction, endpoint, status, payload)
  values ('biometric', 'inbound', 'adms/register', case when p_known then 'success' else 'rejected' end,
          jsonb_build_object('sn', p_sn, 'known', p_known));
$$;
revoke all on function public.biometric_log_register(text, boolean) from public, anon, authenticated;

-- التشخيص (IT + HR للقراءة)
create or replace function public.biometric_device_diagnostics(p_device_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  d record;
  v_last_punch_at timestamptz; v_last_received_at timestamptz; v_punches_24h int; v_punches_total int;
  v_unmatched_pins int; v_users_named int; v_events jsonb; v_checks jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then raise exception 'BIO_FORBIDDEN'; end if;
  select * into d from public.biometric_devices where id = p_device_id;
  if d.id is null then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;

  select max(punched_at), max(created_at), count(*) filter (where created_at > v_now - interval '24 hours'), count(*)
    into v_last_punch_at, v_last_received_at, v_punches_24h, v_punches_total
  from public.biometric_punches where device_serial = d.serial_number;

  select count(distinct p.pin) into v_unmatched_pins
  from public.biometric_punches p where p.device_serial = d.serial_number and p.employee_id is null and p.punched_at > v_now - interval '30 days';

  select count(*) into v_users_named from public.biometric_device_users u where u.device_serial = d.serial_number and coalesce(u.name, '') <> '';

  select coalesce(jsonb_agg(jsonb_build_object('at', l.created_at, 'endpoint', l.endpoint, 'status', l.status, 'payload', l.payload, 'error', l.error_note) order by l.created_at desc), '[]'::jsonb)
    into v_events
  from (select * from public.integration_logs l where l.provider = 'biometric' and l.payload->>'sn' = d.serial_number order by l.created_at desc limit 12) l;

  -- الفحوصات بالترتيب الذي يحدث به الاتصال فعلاً
  v_checks := v_checks || jsonb_build_object('key', 'registered', 'label', 'الجهاز سجّل نفسه في المنصة (طلب options)',
    'status', case when d.last_registered_at is null then 'fail' else 'ok' end,
    'at', d.last_registered_at,
    'hint', case when d.last_registered_at is null then 'لم يصل أي طلب تسجيل بهذا الرقم التسلسلي — راجع العنوان/المنفذ/HTTPS على الجهاز وتأكد أن SN المسجّل هنا مطابق تماماً' else null end);
  v_checks := v_checks || jsonb_build_object('key', 'heartbeat', 'label', 'نبض دوري (getrequest كل ~10 ثوانٍ)',
    'status', case when d.last_heartbeat_at is null then 'fail' when d.last_heartbeat_at > v_now - interval '2 minutes' then 'ok' else 'warn' end,
    'at', d.last_heartbeat_at, 'count', d.heartbeat_count,
    'hint', case when d.last_heartbeat_at is null then 'سجّل لكنه لا ينبض: غالباً الجهاز يرفض الرد أو انقطعت شبكته بعد التسجيل — أعد تشغيله، وجرّب HTTPS=OFF/المنفذ 80 عبر الوسيط'
                 when d.last_heartbeat_at <= v_now - interval '2 minutes' then 'كان ينبض ثم توقف — تحقق من شبكة الجهاز/الكهرباء، وراقب سجل الوسيط' else null end);
  v_checks := v_checks || jsonb_build_object('key', 'push', 'label', 'بصمات وصلت فعلاً من الجهاز',
    'status', case when v_punches_total = 0 then 'warn' else 'ok' end,
    'at', v_last_received_at, 'count', v_punches_total, 'count_24h', v_punches_24h, 'last_punch_at', v_last_punch_at,
    'hint', case when v_punches_total = 0 then 'لا بصمات بعد — اجعل شخصاً يبصم؛ يجب أن تصل خلال ثوانٍ (Realtime=1)' else null end);
  v_checks := v_checks || jsonb_build_object('key', 'users', 'label', 'أسماء المستخدمين من الجهاز',
    'status', case when v_users_named > 0 then 'ok' when d.users_query_requested then 'warn' else 'warn' end,
    'count', v_users_named, 'pending', d.users_query_requested, 'queried_at', d.users_queried_at,
    'hint', case when v_users_named = 0 then case when d.users_query_requested then 'الطلب معلّق — يُرسل في أول نبضة قادمة' else 'اضغط «جلب أسماء المستخدمين» ثم انتظر نبضة' end else null end);
  v_checks := v_checks || jsonb_build_object('key', 'unmatched', 'label', 'أرقام (PIN) بلا موظف خلال 30 يوماً',
    'status', case when v_unmatched_pins = 0 then 'ok' else 'warn' end, 'count', v_unmatched_pins,
    'hint', case when v_unmatched_pins > 0 then 'اربطها من دفتر البصمة — لن تظهر في الحضور قبل الربط' else null end);

  return jsonb_build_object(
    'device_id', d.id, 'serial_number', d.serial_number, 'name', d.name, 'mode', d.mode, 'is_active', d.is_active,
    'public_url', d.public_url, 'timezone_offset', d.timezone_offset,
    'last_seen_at', d.last_seen_at, 'last_registered_at', d.last_registered_at, 'last_heartbeat_at', d.last_heartbeat_at, 'heartbeat_count', d.heartbeat_count,
    'last_punch_at', v_last_punch_at, 'last_received_at', v_last_received_at, 'punches_total', v_punches_total, 'punches_24h', v_punches_24h,
    'unmatched_pins', v_unmatched_pins, 'users_named', v_users_named, 'users_query_pending', d.users_query_requested,
    'checks', v_checks, 'events', v_events, 'server_time', v_now);
end;
$$;
revoke all on function public.biometric_device_diagnostics(uuid) from public, anon;
grant execute on function public.biometric_device_diagnostics(uuid) to authenticated;
