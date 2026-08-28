-- ═══════════════════════════════════════════════════════════════
-- 00026 · أغلفة public — الجولة 2 (نفس قاعدة 00021: PostgREST يكشف public فقط)
-- ═══════════════════════════════════════════════════════════════

-- ── مصفوفة الصلاحيات: هل يرى المستخدم الصفحة؟ (تستهلكها كل البوابات) ──
create or replace function public.page_access(p_page_key text, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.page_access(p_page_key, p_user_id);
end;
$$;

-- نسخة "أدواري الآن" — الطريقة الأساسية من الواجهة
create or replace function public.can_i_see(p_page_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_uid uuid;
begin
  select auth.uid() into v_uid;
  if v_uid is null then
    return false;
  end if;
  return app.page_access(p_page_key, v_uid);
end;
$$;

grant execute on function public.page_access(text, uuid) to authenticated;
grant execute on function public.can_i_see(text)         to authenticated;

-- ── دالة تحويل دفعات البصمة (يستدعيها المستقبل Edge بـ service_role داخلياً؛
--    والنسخة اليدوية للتصحيح عبر authenticated) ──
create or replace function public.biometric_ingest(
  p_sn text, p_raw text, p_table text default 'ATTLOG'
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_device_active boolean;
  v_lines text[];
  v_line text;
  v_inserted integer := 0;
  v_pin text;
  v_dt timestamptz;
  v_status int;
  v_parts text[];
  v_employee uuid;
  v_ok boolean;
begin
  -- هل الجهاز مسجل ونشط؟
  select is_active into v_device_active
  from public.biometric_devices
  where serial_number = p_sn;
  if v_device_active is null or not v_device_active then
    insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note)
    values (p_sn, p_table, p_raw, false, 'DEVICE_UNKNOWN_OR_INACTIVE');
    return 0;
  end if;

  perform app.biometric_touch(p_sn);
  v_lines := string_to_array(p_raw, E'\n');

  foreach v_line in array v_lines loop
    v_line := trim(v_line);
    continue when v_line = '';
    v_parts := regexp_split_to_array(v_line, '\s+');
    v_pin := v_parts[1];
    begin
      v_dt := (v_parts[2] || ' ' || v_parts[3])::timestamptz;
    exception when others then
      insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note)
      values (p_sn, p_table, v_line, false, 'BAD_TIMESTAMP');
      continue;
    end;
    -- الصيغة (مسافات): PIN DateTime(2 parts) Status Verify → status في parts[4]
    v_status := coalesce(nullif(v_parts[4], '')::int, 255);

    -- ربط PIN برقم الموظف الوظيفي
    select e.id into v_employee from public.employees e where e.employee_number = v_pin limit 1;
    v_ok := v_employee is not null;

    insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note)
    values (p_sn, p_table, v_line, v_ok, case when not v_ok then 'EMPLOYEE_NOT_FOUND: ' || v_pin end);

    -- إن تحوّل: سجل حضور (فقط من حالتينا الأساسيتين 0 حضور / 1 انصراف)
    if v_ok and v_status in (0, 1) then
      insert into public.attendance_records (employee_id, work_date, check_in, check_out, status)
      values (
        v_employee, v_dt::date,
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

revoke all on function public.biometric_ingest(text, text, text) from public, anon;

-- ── GPS: استقبال موقع (المستقبل يتحقق من API key قبل النداء) ──
create or replace function public.gps_ingest(
  p_device_unique_id text,
  p_lat double precision,
  p_lon double precision,
  p_speed double precision default null,
  p_heading double precision default null,
  p_ignition boolean default null,
  p_fix_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_vehicle uuid;
begin
  select id into v_vehicle from public.vehicles
  where device_unique_id = p_device_unique_id and is_active limit 1;
  if v_vehicle is null then
    insert into public.integration_logs (provider, direction, status, payload, error_note)
    values ('gps', 'inbound', 'rejected',
            jsonb_build_object('device', p_device_unique_id), 'VEHICLE_NOT_FOUND');
    return null;
  end if;

  insert into public.vehicle_positions
    (vehicle_id, latitude, longitude, speed_kmh, heading, ignition, fix_time)
  values
    (v_vehicle, p_lat, p_lon, p_speed, p_heading, p_ignition, p_fix_time);

  return v_vehicle;
end;
$$;

revoke all on function public.gps_ingest(text, double precision, double precision,
                                         double precision, double precision, boolean, timestamptz)
from public, anon, authenticated;
