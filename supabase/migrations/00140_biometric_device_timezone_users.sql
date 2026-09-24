-- ═══════════════════════════════════════════════════════════════
-- 00140 · البصمة: (١) منطقة زمنية لكل جهاز — أوقات ZKTeco محلية بلا منطقة، وكانت تُقرأ كـ UTC
--                   (إزاحة 3 ساعات لكل بصمة في بغداد). (٢) أسماء المستخدمين من الجهاز (OPERLOG/USERINFO).
-- ═══════════════════════════════════════════════════════════════

-- ① منطقة الجهاز (تنسيق ±HH:MM) — الافتراضي بغداد
alter table public.biometric_devices
  add column if not exists timezone_offset text not null default '+03:00';
alter table public.biometric_devices drop constraint if exists biometric_devices_tz_check;
alter table public.biometric_devices add constraint biometric_devices_tz_check
  check (timezone_offset ~ '^[+-](0[0-9]|1[0-4]):[0-5][0-9]$');

-- ② مستخدمو الجهاز كما يرسلهم (PIN ↔ الاسم) — بيانات مساعدة للربط في HR
create table if not exists public.biometric_device_users (
  device_serial text not null,
  pin           text not null,
  name          text,
  card          text,
  privilege     smallint,
  raw           jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (device_serial, pin)
);
alter table public.biometric_device_users enable row level security;
create policy "bio_users: قراءة HR/IT" on public.biometric_device_users
  for select to authenticated
  using (app.has_role(array['hr_officer', 'it_admin', 'super_admin']));
create index if not exists idx_bio_device_users_pin on public.biometric_device_users (pin);

-- ③ تحويل وقت محلي للجهاز إلى timestamptz بمنطقته — NULL إن كان فاسداً (لا استثناء صامتاً)
--    تنبيه: «at time zone '+03:00'» كنص يُفسَّر بإشارة POSIX معكوسة (يعطي 11:00Z بدل 05:00Z)؛
--    الصحيح استخدام interval — مثبت بالاختبار biometric_device_timezone.sql.
create or replace function app.biometric_local_to_ts(p_local text, p_offset text)
returns timestamptz
language plpgsql immutable as $$
declare v timestamp; o interval;
begin
  if p_local is null or trim(p_local) = '' then return null; end if;
  begin
    v := trim(p_local)::timestamp;
    o := coalesce(nullif(trim(p_offset), ''), '+03:00')::interval;
  exception when others then
    return null;
  end;
  return v at time zone o;
end$$;

-- ④ تحليل سطر OPERLOG بصيغة «USER PIN=1\tName=…\tPri=0\tCard=…» → upsert
create or replace function app.biometric_upsert_device_user(p_sn text, p_line text)
returns boolean
language plpgsql security definer set search_path = public, app as $$
declare
  kv text; k text; v text; body text;
  v_pin text; v_name text; v_card text; v_pri smallint; v_raw jsonb := '{}'::jsonb;
begin
  body := regexp_replace(trim(p_line), '^(USER|OPLOG)\s+', '', 'i');
  if body !~* '(^|\t)PIN=' then return false; end if;
  foreach kv in array regexp_split_to_array(body, E'\t') loop
    k := split_part(kv, '=', 1); v := substr(kv, length(k) + 2);
    if k = '' then continue; end if;
    v_raw := v_raw || jsonb_build_object(k, v);
    if upper(k) = 'PIN' then v_pin := trim(v);
    elsif upper(k) = 'NAME' then v_name := nullif(trim(v), '');
    elsif upper(k) = 'CARD' then v_card := nullif(trim(v), '');
    elsif upper(k) = 'PRI' then begin v_pri := nullif(trim(v), '')::smallint; exception when others then v_pri := null; end;
    end if;
  end loop;
  if v_pin is null or v_pin = '' then return false; end if;
  insert into public.biometric_device_users (device_serial, pin, name, card, privilege, raw, updated_at)
  values (p_sn, v_pin, v_name, v_card, v_pri, v_raw, now())
  on conflict (device_serial, pin) do update set
    name = coalesce(excluded.name, public.biometric_device_users.name),
    card = coalesce(excluded.card, public.biometric_device_users.card),
    privilege = coalesce(excluded.privilege, public.biometric_device_users.privilege),
    raw = excluded.raw, updated_at = now();
  return true;
end$$;

-- ⑤ مستقبل ADMS — نفس التوقيع؛ الوقت يُفسَّر بمنطقة الجهاز، OPERLOG يُلتقط، الاسم يُرفق بالبصمة
create or replace function public.biometric_ingest(
  p_sn text, p_raw text, p_table text default 'ATTLOG'
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_device_id uuid;
  v_device_active boolean;
  v_tz text;
  v_lines text[];
  v_line text;
  v_inserted integer := 0;
  v_pin text;
  v_dt timestamptz;
  v_status int;
  v_parts text[];
  v_employee uuid;
  v_ok boolean;
  v_push_id bigint;
  v_name text;
begin
  select id, is_active, timezone_offset into v_device_id, v_device_active, v_tz
  from public.biometric_devices
  where serial_number = p_sn;
  if v_device_active is null or not v_device_active then
    insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note)
    values (p_sn, p_table, p_raw, false, 'DEVICE_UNKNOWN_OR_INACTIVE');
    return 0;
  end if;

  perform app.biometric_touch(p_sn);
  v_lines := string_to_array(coalesce(p_raw, ''), E'\n');

  -- OPERLOG: مستخدمون/عمليات — نلتقط أسماء المستخدمين ونؤرشف الباقي
  if upper(p_table) = 'OPERLOG' then
    foreach v_line in array v_lines loop
      v_line := trim(v_line);
      continue when v_line = '';
      v_ok := app.biometric_upsert_device_user(p_sn, v_line);
      insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note, ledger_at)
      values (p_sn, p_table, v_line, true, case when v_ok then 'USER' else 'OPLOG' end, now());
      if v_ok then v_inserted := v_inserted + 1; end if;
    end loop;
    insert into public.integration_logs (provider, direction, endpoint, status, payload)
    values ('biometric', 'inbound', 'adms/OPERLOG', 'success', jsonb_build_object('sn', p_sn, 'users', v_inserted));
    return v_inserted;
  end if;

  foreach v_line in array v_lines loop
    v_line := trim(v_line);
    continue when v_line = '';
    -- ATTLOG: PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>status<TAB>verify<TAB>workcode… (بعض الطرازات مسافات)
    v_parts := regexp_split_to_array(v_line, E'\t');
    if array_length(v_parts, 1) < 2 then v_parts := regexp_split_to_array(v_line, '\s+'); v_parts := array[v_parts[1], v_parts[2] || ' ' || v_parts[3], v_parts[4], v_parts[5]]; end if;
    v_pin := nullif(trim(coalesce(v_parts[1], '')), '');
    v_dt := app.biometric_local_to_ts(v_parts[2], v_tz);
    if v_pin is null or v_dt is null then
      insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note, ledger_at)
      values (p_sn, p_table, v_line, false, 'BAD_TIMESTAMP', now());
      continue;
    end if;
    begin
      v_status := coalesce(nullif(trim(coalesce(v_parts[3], '')), '')::int, 255);
    exception when others then
      v_status := 255;
    end;

    select e.id into v_employee
    from public.employees e
    where e.biometric_pin = v_pin or e.employee_number = v_pin
    order by (case when e.biometric_pin = v_pin then 0 else 1 end)
    limit 1;
    v_ok := v_employee is not null;
    select u.name into v_name from public.biometric_device_users u where u.device_serial = p_sn and u.pin = v_pin;

    insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note, ledger_at)
    values (p_sn, p_table, v_line, v_ok,
            case when not v_ok then 'EMPLOYEE_NOT_FOUND: ' || v_pin end, now())
    returning id into v_push_id;

    insert into public.biometric_punches
      (device_serial, device_id, pin, employee_id, punched_at, direction, person_name, method, raw)
    values
      (p_sn, v_device_id, v_pin, v_employee, v_dt,
       case v_status when 0 then 'in' when 1 then 'out' else 'unknown' end,
       v_name, 'adms_push', jsonb_build_object('status', v_status, 'push_id', v_push_id, 'tz', v_tz))
    on conflict (device_serial, pin, punched_at, direction) do nothing;

    if v_ok and v_status in (0, 1) then
      insert into public.attendance_records (employee_id, work_date, check_in, check_out, status)
      values (
        v_employee, (v_dt at time zone v_tz::interval)::date,
        case when v_status = 0 then v_dt end,
        case when v_status = 1 then v_dt end,
        'present'
      )
      on conflict (employee_id, work_date) do update set
        check_in  = coalesce(public.attendance_records.check_in,  excluded.check_in),
        check_out = coalesce(public.attendance_records.check_out, excluded.check_out),
        updated_at = now();
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  insert into public.integration_logs (provider, direction, endpoint, status, payload)
  values ('biometric', 'inbound', 'adms/' || p_table, 'success',
          jsonb_build_object('sn', p_sn, 'records', v_inserted));

  return v_inserted;
end;
$$;

-- ⑥ معالجة الدفعات الخام المتراكمة (قبل 00139) — بمنطقة الجهاز أيضاً
create or replace function public.biometric_process_pushes(p_limit integer default 500)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  p record;
  v_parts text[]; v_pin text; v_at timestamptz; v_status int; v_dir text; v_emp uuid; v_tz text; v_dev uuid;
  n int := 0;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  for p in
    select b.id, b.device_sn, b.raw_payload, d.id as device_id, d.timezone_offset
    from public.biometric_pushes b
    left join public.biometric_devices d on d.serial_number = b.device_sn
    where b.table_name = 'ATTLOG' and b.ledger_at is null
    order by b.id
    limit greatest(1, least(p_limit, 5000))
  loop
    v_tz := coalesce(p.timezone_offset, '+03:00'); v_dev := p.device_id;
    v_parts := regexp_split_to_array(trim(p.raw_payload), E'\t');
    if array_length(v_parts, 1) < 2 then v_parts := regexp_split_to_array(trim(p.raw_payload), '\s+'); v_parts := array[v_parts[1], v_parts[2] || ' ' || v_parts[3], v_parts[4], v_parts[5]]; end if;
    v_pin := nullif(trim(coalesce(v_parts[1], '')), '');
    v_at := app.biometric_local_to_ts(v_parts[2], v_tz);
    if v_pin is null or v_at is null or v_dev is null then
      update public.biometric_pushes set ledger_at = now() where id = p.id;
      continue;
    end if;
    begin v_status := coalesce(nullif(trim(coalesce(v_parts[3], '')), '')::int, 255); exception when others then v_status := 255; end;
    v_dir := case v_status when 0 then 'in' when 1 then 'out' else 'unknown' end;

    select e.id into v_emp from public.employees e
    where e.biometric_pin = v_pin or e.employee_number = v_pin
    order by (case when e.biometric_pin = v_pin then 0 else 1 end) limit 1;

    insert into public.biometric_punches
      (device_serial, device_id, pin, employee_id, punched_at, direction, person_name, method, raw)
    select p.device_sn, v_dev, v_pin, v_emp, v_at, v_dir, u.name, 'adms_push',
           jsonb_build_object('status', v_status, 'push_id', p.id, 'tz', v_tz)
    from (select 1) x
    left join public.biometric_device_users u on u.device_serial = p.device_sn and u.pin = v_pin
    on conflict (device_serial, pin, punched_at, direction) do nothing;
    if found then n := n + 1; end if;
    update public.biometric_pushes set ledger_at = now() where id = p.id;
  end loop;
  return n;
end$$;

-- ⑦ قائمة الدفتر: إرفاق اسم الجهاز للـ PIN غير المطابَق إن عُرف
drop function if exists public.biometric_punches_list(date, date, text, uuid, boolean, integer);
create or replace function public.biometric_punches_list(
  p_from date default null, p_to date default null, p_pin text default null,
  p_device_id uuid default null, p_unmatched_only boolean default false, p_limit integer default 300)
returns table(id uuid, device_serial text, pin text, employee_id uuid,
              employee_name text, employee_number text, punched_at timestamptz,
              direction text, person_name text, method text, device_user_name text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'it_admin', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  return query
  select b.id, b.device_serial, b.pin, b.employee_id,
         e.full_name, e.employee_number,
         b.punched_at, b.direction, b.person_name, b.method, u.name
  from public.biometric_punches b
  left join public.employees e on e.id = b.employee_id
  left join public.biometric_device_users u on u.device_serial = b.device_serial and u.pin = b.pin
  where (p_from is null or b.punched_at >= p_from::timestamptz)
    and (p_to is null or b.punched_at < (p_to + 1)::timestamptz)
    and (nullif(trim(coalesce(p_pin, '')), '') is null or b.pin ilike '%' || trim(p_pin) || '%')
    and (p_device_id is null or b.device_id = p_device_id)
    and (not coalesce(p_unmatched_only, false) or b.employee_id is null)
  order by b.punched_at desc
  limit greatest(1, least(p_limit, 1000));
end$$;

-- ⑧ أسماء الجهاز لـ HR (اقتراح الربط)
create or replace function public.biometric_device_users_list(p_search text default null, p_limit integer default 100)
returns table(device_serial text, pin text, name text, card text, updated_at timestamptz,
              employee_id uuid, employee_name text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'it_admin', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  return query
  select u.device_serial, u.pin, u.name, u.card, u.updated_at, e.id, e.full_name
  from public.biometric_device_users u
  left join public.employees e on e.biometric_pin = u.pin or e.employee_number = u.pin
  where nullif(trim(coalesce(p_search, '')), '') is null
     or u.pin ilike '%' || trim(p_search) || '%' or u.name ilike '%' || trim(p_search) || '%'
  order by u.updated_at desc
  limit greatest(1, least(p_limit, 1000));
end$$;

revoke all on function
  app.biometric_local_to_ts(text, text),
  app.biometric_upsert_device_user(text, text)
from public, anon, authenticated;

revoke all on function
  public.biometric_punches_list(date, date, text, uuid, boolean, integer),
  public.biometric_device_users_list(text, integer)
from public, anon;
grant execute on function
  public.biometric_punches_list(date, date, text, uuid, boolean, integer),
  public.biometric_device_users_list(text, integer)
to authenticated;
