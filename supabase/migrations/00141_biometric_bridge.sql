-- ═══════════════════════════════════════════════════════════════
-- 00141 · البصمة: نمط «جسر الشبكة الداخلية» zk_bridge — سحب مباشر حقيقي من الجهاز (بروتوكول ZK ثنائي TCP/4370)
--   بواسطة وكيل صغير يعمل داخل شبكة الجهة (tools/zk-bridge) ويرسل إلى Edge biometric-bridge بمفتاح جهاز.
--   ADMS دفع فقط ولا يعيد السجلات القديمة؛ الجسر يسحب كل ما في ذاكرة الجهاز (تعويض الفاقد).
-- ═══════════════════════════════════════════════════════════════

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.biometric_devices drop constraint if exists biometric_devices_mode_check;
alter table public.biometric_devices add constraint biometric_devices_mode_check
  check (mode in ('adms_push', 'app_api_pull', 'lan_pull', 'generic_pull', 'zk_bridge'));

-- قيد التهيئة: zk_bridge لا يحتاج base_url (الوكيل هو من يملك IP الجهاز)
alter table public.biometric_devices drop constraint if exists biometric_devices_config_check;
alter table public.biometric_devices add constraint biometric_devices_config_check
  check (mode in ('adms_push', 'zk_bridge') or (config ? 'base_url'));

alter table public.biometric_punches drop constraint if exists biometric_punches_method_check;
alter table public.biometric_punches add constraint biometric_punches_method_check
  check (method in ('adms_push', 'app_api_pull', 'lan_pull', 'generic_pull', 'zk_bridge', 'manual'));

-- مفتاح الجسر (يُخزَّن مجزأً؛ يُعرض مرة واحدة عند التوليد)
alter table public.biometric_devices
  add column if not exists bridge_key_hash text,
  add column if not exists bridge_key_prefix text,
  add column if not exists bridge_last_seen_at timestamptz,
  add column if not exists bridge_last_error text;

-- ① توليد/تدوير مفتاح الجسر — IT فقط؛ يعيد المفتاح الصريح مرة واحدة
create or replace function public.biometric_bridge_rotate_key(p_device_id uuid)
returns text
language plpgsql security definer set search_path = public, app, extensions as $$
declare v_key text; v_mode text;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
  select mode into v_mode from public.biometric_devices where id = p_device_id;
  if v_mode is null then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;
  if v_mode <> 'zk_bridge' then raise exception 'BIO_MODE_NOT_BRIDGE'; end if;
  v_key := 'zkb_' || encode(gen_random_bytes(24), 'hex');
  update public.biometric_devices
     set bridge_key_hash = encode(digest(v_key, 'sha256'), 'hex'),
         bridge_key_prefix = left(v_key, 10),
         updated_at = now()
   where id = p_device_id;
  return v_key;
end$$;

-- ② التحقق من مفتاح الجسر (يستدعيه Edge بدور الخدمة) — يعيد معرف الجهاز أو NULL
create or replace function app.biometric_bridge_authenticate(p_serial text, p_key text)
returns uuid
language plpgsql security definer set search_path = public, app, extensions as $$
declare v_id uuid;
begin
  if coalesce(p_key, '') = '' or coalesce(p_serial, '') = '' then return null; end if;
  select id into v_id
  from public.biometric_devices
  where serial_number = p_serial and is_active and mode = 'zk_bridge'
    and bridge_key_hash = encode(digest(p_key, 'sha256'), 'hex');
  return v_id;
end$$;

-- ③ استيراد دفعة الجسر (بدور الخدمة بعد التحقق) — بصمات + مستخدمو الجهاز؛ يسجل العملية في biometric_pulls
create or replace function app.biometric_bridge_import(
  p_device_id uuid, p_punches jsonb, p_users jsonb default '[]'::jsonb, p_error text default null)
returns table(received integer, inserted integer, duplicates integer, unmatched integer, users integer)
language plpgsql security definer set search_path = public, app as $$
declare
  d public.biometric_devices; r jsonb;
  v_pin text; v_at timestamptz; v_emp uuid; v_name text;
  n_recv int := 0; n_ins int := 0; n_dup int := 0; n_unm int := 0; n_users int := 0;
begin
  select * into d from public.biometric_devices where id = p_device_id;
  if not found then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;

  if p_error is not null then
    update public.biometric_devices set bridge_last_seen_at = now(), bridge_last_error = left(p_error, 500) where id = d.id;
    insert into public.biometric_pulls (device_id, mode, status, error, finished_at)
    values (d.id, 'zk_bridge', 'failed', left(p_error, 900), now());
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  -- مستخدمو الجهاز أولاً (كي تُرفق الأسماء بالبصمات)
  for r in select * from jsonb_array_elements(coalesce(p_users, '[]'::jsonb)) loop
    v_pin := nullif(trim(coalesce(r ->> 'pin', '')), '');
    continue when v_pin is null;
    insert into public.biometric_device_users (device_serial, pin, name, card, privilege, raw, updated_at)
    values (d.serial_number, v_pin, nullif(trim(coalesce(r ->> 'name', '')), ''), nullif(trim(coalesce(r ->> 'card', '')), ''),
            (case when (r ->> 'privilege') ~ '^\d+$' then (r ->> 'privilege')::smallint end), r, now())
    on conflict (device_serial, pin) do update set
      name = coalesce(excluded.name, public.biometric_device_users.name),
      card = coalesce(excluded.card, public.biometric_device_users.card),
      privilege = coalesce(excluded.privilege, public.biometric_device_users.privilege),
      raw = excluded.raw, updated_at = now();
    n_users := n_users + 1;
  end loop;

  if jsonb_typeof(coalesce(p_punches, '[]'::jsonb)) <> 'array' then raise exception 'BIO_IMPORT_INVALID'; end if;
  for r in select * from jsonb_array_elements(p_punches) loop
    n_recv := n_recv + 1;
    v_pin := nullif(trim(coalesce(r ->> 'pin', '')), '');
    -- الوكيل يرسل الوقت المحلي للجهاز (local) أو ISO (at)؛ المحلي يُفسَّر بمنطقة الجهاز
    v_at := case
      when (r ->> 'at') is not null then (r ->> 'at')::timestamptz
      else app.biometric_local_to_ts(r ->> 'local', d.timezone_offset)
    end;
    if v_pin is null or v_at is null then raise exception 'BIO_IMPORT_INVALID'; end if;

    select e.id into v_emp from public.employees e
    where e.biometric_pin = v_pin or e.employee_number = v_pin
    order by (case when e.biometric_pin = v_pin then 0 else 1 end) limit 1;
    select u.name into v_name from public.biometric_device_users u where u.device_serial = d.serial_number and u.pin = v_pin;

    insert into public.biometric_punches
      (device_serial, device_id, pin, employee_id, punched_at, direction, person_name, method, raw)
    values
      (d.serial_number, d.id, v_pin, v_emp, v_at,
       case lower(coalesce(r ->> 'direction', 'unknown')) when 'in' then 'in' when 'out' then 'out' else 'unknown' end,
       v_name, 'zk_bridge', r)
    on conflict (device_serial, pin, punched_at, direction) do nothing;
    if found then n_ins := n_ins + 1; if v_emp is null then n_unm := n_unm + 1; end if;
    else n_dup := n_dup + 1; end if;
  end loop;

  update public.biometric_devices
     set last_seen_at = now(), bridge_last_seen_at = now(), bridge_last_error = null, updated_at = now()
   where id = d.id;
  insert into public.biometric_pulls
    (device_id, mode, status, received, inserted, duplicates, unmatched, finished_at)
  values (d.id, 'zk_bridge', case when n_ins = 0 and n_recv > 0 then 'partial' else 'success' end,
          n_recv, n_ins, n_dup, n_unm, now());
  return query select n_recv, n_ins, n_dup, n_unm, n_users;
end$$;

revoke all on function app.biometric_bridge_authenticate(text, text), app.biometric_bridge_import(uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.biometric_bridge_rotate_key(uuid) from public, anon;
grant execute on function public.biometric_bridge_rotate_key(uuid) to authenticated;

-- ④ أغلفة عامة لدور الخدمة فقط (PostgREST لا يرى schema app) — يستدعيها Edge biometric-bridge
create or replace function public.biometric_bridge_authenticate_public(p_serial text, p_key text)
returns uuid language sql security definer set search_path = public, app as
$$ select app.biometric_bridge_authenticate(p_serial, p_key) $$;

create or replace function public.biometric_bridge_import_public(
  p_device_id uuid, p_punches jsonb, p_users jsonb default '[]'::jsonb, p_error text default null)
returns table(received integer, inserted integer, duplicates integer, unmatched integer, users integer)
language sql security definer set search_path = public, app as
$$ select * from app.biometric_bridge_import(p_device_id, p_punches, p_users, p_error) $$;

revoke all on function public.biometric_bridge_authenticate_public(text, text),
              public.biometric_bridge_import_public(uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.biometric_bridge_authenticate_public(text, text),
                          public.biometric_bridge_import_public(uuid, jsonb, jsonb, text)
  to service_role;
