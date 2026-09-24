-- ═══════════════════════════════════════════════════════════════
-- 00139 · البصمة المرحلة 2: مصادر قابلة للتوصيل + دفتر بصمات موحّد + مطابقة + اشتقاق حضور.
--   · التقني (بوابة التطوير المركزية): أنماط الأجهزة/المصادر، السحب، سجل العمليات.
--   · البيانات (بوابة الموارد البشرية): دفتر البصمات، ربط PIN، اشتقاق الحضور.
-- الأنماط الأربعة ( قابلة للتوصيل ):
--   adms_push    = جهاز ZKTeco يدفع عبر adms-receiver (القائم من 00025/00026).
--   app_api_pull = سحب من API تطبيق مشترك (عقد موثق: X-API-Key + records[]).
--   lan_pull     = سحب مباشر من جهاز/خدمة على الشبكة الداخلية (JSON بنمط ZKTeco).
--   generic_pull = سحب عام بخريطة حقول قابلة للتهيئة لأي مصدر JSON.
-- ═══════════════════════════════════════════════════════════════

-- ① الأجهزة تصبح مصادر قابلة للتوصيل: نمط + تهيئة
alter table public.biometric_devices
  add column if not exists mode text not null default 'adms_push'
    check (mode in ('adms_push', 'app_api_pull', 'lan_pull', 'generic_pull')),
  add column if not exists config jsonb not null default '{}'::jsonb;

alter table public.biometric_devices drop constraint if exists biometric_devices_config_check;
alter table public.biometric_devices add constraint biometric_devices_config_check
  check (mode = 'adms_push' or (config ? 'base_url'));

-- ② رقم بصمة خاص بالموظف (قد يختلف عن رقمه الوظيفي)
alter table public.employees add column if not exists biometric_pin text;
create unique index if not exists employees_biometric_pin_uq
  on public.employees (biometric_pin)
  where biometric_pin is not null;

-- ③ دفتر البصمات: مجرى نقاط موحّد لكل الطرق (تدقيق + مطابقة + اشتقاق)
create table if not exists public.biometric_punches (
  id           uuid primary key default gen_random_uuid(),
  device_serial text not null,
  device_id    uuid references public.biometric_devices (id) on delete set null,
  pin          text not null,
  employee_id  uuid references public.employees (id) on delete set null,
  punched_at   timestamptz not null,
  direction    text not null default 'unknown'
               check (direction in ('in', 'out', 'unknown')),
  person_name  text,
  method       text not null
               check (method in ('adms_push', 'app_api_pull', 'lan_pull', 'generic_pull', 'manual')),
  raw          jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (device_serial, pin, punched_at, direction)
);
alter table public.biometric_punches enable row level security;
create index if not exists idx_punches_time   on public.biometric_punches (punched_at desc);
create index if not exists idx_punches_pin    on public.biometric_punches (pin);
create index if not exists idx_punches_emp    on public.biometric_punches (employee_id, punched_at desc);

-- ④ سجل عمليات السحب/المعالجة (تدقيق تقني)
create table if not exists public.biometric_pulls (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.biometric_devices (id) on delete cascade,
  mode         text not null,
  status       text not null check (status in ('success', 'partial', 'failed')),
  received     integer not null default 0,
  inserted     integer not null default 0,
  duplicates   integer not null default 0,
  unmatched    integer not null default 0,
  error        text,
  triggered_by uuid references auth.users (id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
alter table public.biometric_pulls enable row level security;
create index if not exists idx_pulls_time on public.biometric_pulls (started_at desc);

-- سياسات القراءة: الدفتر (بيانات) لـ HR + IT؛ سجل العمليات (تقني) لـ IT فقط.
-- الكتابة حصراً عبر الدوال الآمنة أدناه (لا سياسات insert/update/delete).
create policy "bio_punches: قراءة HR/IT" on public.biometric_punches
  for select to authenticated
  using (app.has_role(array['hr_officer', 'it_admin', 'super_admin']));

create policy "bio_pulls: قراءة IT" on public.biometric_pulls
  for select to authenticated
  using (app.has_role(array['it_admin', 'super_admin']));

-- HR يحتاج رؤية الأجهزة (أسماء المصادر) في دفتر البصمات — قراءة فقط
create policy "bio: قراءة بواسطة HR" on public.biometric_devices
  for select to authenticated
  using (app.has_role(array['hr_officer']));

-- ⑤ تعليم الدفعات الخام ADMS كُمعالجة (عمود تتبع)
alter table public.biometric_pushes add column if not exists ledger_at timestamptz;

-- ─────────────────────────── الدوال ───────────────────────────

-- ⑥ الاستيراد الموحّد (تستخدمه كل طرق السحب) — تقني: IT/المدير الخارق
create or replace function public.biometric_import_punches(
  p_device_id uuid, p_logs jsonb, p_method text default null)
returns table(received integer, inserted integer, duplicates integer, unmatched integer)
language plpgsql security definer set search_path = public, app as $$
declare
  d public.biometric_devices;
  r jsonb;
  v_pin text; v_at timestamptz; v_dir text; v_name text; v_serial text;
  v_emp uuid;
  n_recv int := 0; n_ins int := 0; n_dup int := 0; n_unm int := 0;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  select * into d from public.biometric_devices where id = p_device_id;
  if not found then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;
  if not d.is_active then raise exception 'BIO_DEVICE_INACTIVE'; end if;
  if jsonb_typeof(coalesce(p_logs, '[]'::jsonb)) <> 'array' then
    raise exception 'BIO_IMPORT_INVALID';
  end if;

  for r in select * from jsonb_array_elements(p_logs) loop
    n_recv := n_recv + 1;
    v_pin := trim(coalesce(r ->> 'pin', ''));
    if v_pin = '' or (r ->> 'at') is null then
      raise exception 'BIO_IMPORT_INVALID';
    end if;
    begin
      v_at := (r ->> 'at')::timestamptz;
    exception when others then
      raise exception 'BIO_IMPORT_INVALID';
    end;
    v_dir := lower(coalesce(r ->> 'direction', 'unknown'));
    if v_dir not in ('in', 'out', 'unknown') then v_dir := 'unknown'; end if;
    v_name := nullif(trim(coalesce(r ->> 'name', '')), '');
    v_serial := coalesce(nullif(trim(coalesce(r ->> 'device_serial', '')), ''), d.serial_number);

    select e.id into v_emp
    from public.employees e
    where e.biometric_pin = v_pin or e.employee_number = v_pin
    order by (case when e.biometric_pin = v_pin then 0 else 1 end)
    limit 1;

    insert into public.biometric_punches
      (device_serial, device_id, pin, employee_id, punched_at, direction, person_name, method, raw)
    values
      (v_serial, d.id, v_pin, v_emp, v_at, v_dir, v_name,
       coalesce(nullif(p_method, ''), d.mode), r)
    on conflict (device_serial, pin, punched_at, direction) do nothing;

    if found then
      n_ins := n_ins + 1;
      if v_emp is null then n_unm := n_unm + 1; end if;
    else
      n_dup := n_dup + 1;
    end if;
  end loop;

  update public.biometric_devices set last_seen_at = now(), updated_at = now() where id = d.id;

  insert into public.biometric_pulls
    (device_id, mode, status, received, inserted, duplicates, unmatched, triggered_by, finished_at)
  values
    (d.id, coalesce(nullif(p_method, ''), d.mode),
     case when n_ins = 0 and n_recv > 0 then 'partial' else 'success' end,
     n_recv, n_ins, n_dup, n_unm, auth.uid(), now());

  return query select n_recv, n_ins, n_dup, n_unm;
end$$;

-- ⑦ معالجة الدفعات الخام ADMS إلى الدفتر — تقني: IT
create or replace function public.biometric_process_pushes(p_limit integer default 500)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  p record;
  v_parts text[]; v_pin text; v_at timestamptz; v_status int; v_dir text; v_emp uuid;
  n int := 0;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  for p in
    select id, device_sn, raw_payload
    from public.biometric_pushes
    where table_name = 'ATTLOG' and ledger_at is null
    order by id
    limit greatest(1, least(p_limit, 5000))
  loop
    v_parts := regexp_split_to_array(trim(p.raw_payload), '\s+');
    v_pin := nullif(v_parts[1], '');
    v_at := null;
    if v_pin is not null and array_length(v_parts, 1) >= 3 then
      begin
        v_at := (v_parts[2] || ' ' || v_parts[3])::timestamptz;
      exception when others then
        v_at := null;
      end;
    end if;
    -- سطر مشوّه (بلا PIN أو وقت صالح): يُعلَّم كمعالَج ويُتجاوَز
    if v_pin is null or v_at is null then
      update public.biometric_pushes set ledger_at = now() where id = p.id;
      continue;
    end if;
    v_status := coalesce(nullif(v_parts[4], '')::int, 255);
    v_dir := case v_status when 0 then 'in' when 1 then 'out' else 'unknown' end;

    select e.id into v_emp
    from public.employees e
    where e.biometric_pin = v_pin or e.employee_number = v_pin
    order by (case when e.biometric_pin = v_pin then 0 else 1 end)
    limit 1;

    insert into public.biometric_punches
      (device_serial, device_id, pin, employee_id, punched_at, direction, method, raw)
    select p.device_sn, d.id, v_pin, v_emp, v_at, v_dir, 'adms_push',
           jsonb_build_object('status', v_status, 'push_id', p.id)
    from public.biometric_devices d
    where d.serial_number = p.device_sn
    on conflict (device_serial, pin, punched_at, direction) do nothing;
    if found then n := n + 1; end if;

    update public.biometric_pushes set ledger_at = now() where id = p.id;
  end loop;
  return n;
end$$;

-- ⑦ب إعادة تعريف مستقبل ADMS (00026) — نفس التوقيع والعقد (يعيد عدد سجلات الحضور المحوَّلة):
--   · إصلاح جذري: السطر المشوّه لا يُسقِط الدفعة كلها (كان NULL الوقت يمرّ صامتاً ثم يفشل الإدراج).
--   · كل سطر صالح يُكتب فوراً في الدفتر الموحّد (biometric_punches) بنمط adms_push.
--   · المطابقة تراعي biometric_pin قبل الرقم الوظيفي.
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
begin
  select id, is_active into v_device_id, v_device_active
  from public.biometric_devices
  where serial_number = p_sn;
  if v_device_active is null or not v_device_active then
    insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note)
    values (p_sn, p_table, p_raw, false, 'DEVICE_UNKNOWN_OR_INACTIVE');
    return 0;
  end if;

  perform app.biometric_touch(p_sn);
  v_lines := string_to_array(coalesce(p_raw, ''), E'\n');

  foreach v_line in array v_lines loop
    v_line := trim(v_line);
    continue when v_line = '';
    v_parts := regexp_split_to_array(v_line, '\s+');
    v_pin := nullif(v_parts[1], '');
    v_dt := null;
    if v_pin is not null and array_length(v_parts, 1) >= 3 then
      begin
        v_dt := (v_parts[2] || ' ' || v_parts[3])::timestamptz;
      exception when others then
        v_dt := null;
      end;
    end if;
    if v_pin is null or v_dt is null then
      insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note, ledger_at)
      values (p_sn, p_table, v_line, false, 'BAD_TIMESTAMP', now());
      continue;
    end if;
    begin
      v_status := coalesce(nullif(v_parts[4], '')::int, 255);
    exception when others then
      v_status := 255;
    end;

    select e.id into v_employee
    from public.employees e
    where e.biometric_pin = v_pin or e.employee_number = v_pin
    order by (case when e.biometric_pin = v_pin then 0 else 1 end)
    limit 1;
    v_ok := v_employee is not null;

    insert into public.biometric_pushes (device_sn, table_name, raw_payload, parsed_ok, error_note, ledger_at)
    values (p_sn, p_table, v_line, v_ok,
            case when not v_ok then 'EMPLOYEE_NOT_FOUND: ' || v_pin end,
            case when p_table = 'ATTLOG' then now() end)
    returning id into v_push_id;

    if p_table = 'ATTLOG' then
      insert into public.biometric_punches
        (device_serial, device_id, pin, employee_id, punched_at, direction, method, raw)
      values
        (p_sn, v_device_id, v_pin, v_employee, v_dt,
         case v_status when 0 then 'in' when 1 then 'out' else 'unknown' end,
         'adms_push', jsonb_build_object('status', v_status, 'push_id', v_push_id))
      on conflict (device_serial, pin, punched_at, direction) do nothing;
    end if;

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

-- ⑧ دفتر البصمات للعرض — بيانات: HR + تقني: IT
create or replace function public.biometric_punches_list(
  p_from date default null, p_to date default null, p_pin text default null,
  p_device_id uuid default null, p_unmatched_only boolean default false, p_limit integer default 300)
returns table(id uuid, device_serial text, pin text, employee_id uuid,
              employee_name text, employee_number text, punched_at timestamptz,
              direction text, person_name text, method text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'it_admin', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  return query
  select b.id, b.device_serial, b.pin, b.employee_id,
         e.full_name, e.employee_number,
         b.punched_at, b.direction, b.person_name, b.method
  from public.biometric_punches b
  left join public.employees e on e.id = b.employee_id
  where (p_from is null or b.punched_at >= p_from::timestamptz)
    and (p_to is null or b.punched_at < (p_to + 1)::timestamptz)
    and (nullif(trim(coalesce(p_pin, '')), '') is null or b.pin ilike '%' || trim(p_pin) || '%')
    and (p_device_id is null or b.device_id = p_device_id)
    and (not coalesce(p_unmatched_only, false) or b.employee_id is null)
  order by b.punched_at desc
  limit greatest(1, least(p_limit, 1000));
end$$;

-- ⑨ ربط PIN بموظف + تعبئة رجعية — بيانات: HR
create or replace function public.biometric_link_pin(p_pin text, p_employee_id uuid)
returns void
language plpgsql security definer set search_path = public, app as $$
declare v_pin text := trim(coalesce(p_pin, ''));
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  if v_pin = '' then raise exception 'BIO_PIN_INVALID'; end if;
  if not exists (select 1 from public.employees e where e.id = p_employee_id) then
    raise exception 'BIO_EMPLOYEE_NOT_FOUND';
  end if;
  if exists (select 1 from public.employees e
              where e.biometric_pin = v_pin and e.id <> p_employee_id) then
    raise exception 'BIO_PIN_TAKEN';
  end if;
  update public.employees set biometric_pin = v_pin where id = p_employee_id;
  update public.biometric_punches set employee_id = p_employee_id
   where pin = v_pin and employee_id is null;
end$$;

-- ⑩ اشتقاق الحضور اليومي من الدفتر — بيانات: HR
create or replace function public.biometric_attendance_derive(p_date date)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  r record;
  v_in timestamptz; v_out timestamptz; v_uin timestamptz; v_uout timestamptz;
  v_ein timestamptz; v_eout timestamptz; v_min timestamptz; v_mout timestamptz;
  n int := 0;
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  if p_date is null then raise exception 'BIO_DATE_INVALID'; end if;
  for r in
    select employee_id
    from public.biometric_punches
    where employee_id is not null
      and punched_at >= p_date::timestamptz
      and punched_at < (p_date + 1)::timestamptz
    group by employee_id
  loop
    select min(p.punched_at) into v_in
    from public.biometric_punches p
    where p.employee_id = r.employee_id and p.direction = 'in'
      and p.punched_at >= p_date::timestamptz and p.punched_at < (p_date + 1)::timestamptz;
    select max(p.punched_at) into v_out
    from public.biometric_punches p
    where p.employee_id = r.employee_id and p.direction = 'out'
      and p.punched_at >= p_date::timestamptz and p.punched_at < (p_date + 1)::timestamptz;
    -- البصمات مجهولة الاتجاه (أجهزة لا تميّز دخول/خروج): أول بصمة = دخول، آخر بصمة = خروج،
    -- وتُستخدم لتكملة أي جانب ناقص (أو توسيعه) دون إلغاء الاتجاهات الصريحة.
    select min(p.punched_at), max(p.punched_at) into v_uin, v_uout
    from public.biometric_punches p
    where p.employee_id = r.employee_id and p.direction = 'unknown'
      and p.punched_at >= p_date::timestamptz and p.punched_at < (p_date + 1)::timestamptz;
    if v_uin is not null then
      v_in := least(coalesce(v_in, v_uin), v_uin);
      if v_uout is distinct from v_uin or v_in < v_uout then
        v_out := greatest(coalesce(v_out, v_uout), v_uout);
      end if;
    end if;
    if v_out is not null and v_in is not null and v_out <= v_in then v_out := null; end if;
    if v_in is null and v_out is null then continue; end if;

    -- دمج مع سجل قائم (إن وجد) مع حماية قيد check_out > check_in
    select check_in, check_out into v_ein, v_eout
    from public.attendance_records
    where employee_id = r.employee_id and work_date = p_date;
    v_min := least(coalesce(v_ein, v_in), coalesce(v_in, v_ein));
    v_mout := greatest(coalesce(v_eout, v_out), coalesce(v_out, v_eout));
    if v_mout is not null and v_min is not null and v_mout <= v_min then
      v_mout := null;
    end if;

    insert into public.attendance_records (employee_id, work_date, check_in, check_out, status)
    values (r.employee_id, p_date, v_min, v_mout, 'present')
    on conflict (employee_id, work_date) do update set
      check_in   = excluded.check_in,
      check_out  = excluded.check_out,
      status     = case when public.attendance_records.status in ('present', 'absent')
                        then 'present' else public.attendance_records.status end,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end$$;

-- ⑪ سجل عمليات السحب — تقني: IT
create or replace function public.biometric_pulls_list(p_device_id uuid default null, p_limit integer default 50)
returns table(id uuid, device_id uuid, device_name text, mode text, status text,
              received integer, inserted integer, duplicates integer, unmatched integer,
              error text, triggered_by uuid, started_at timestamptz, finished_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['it_admin', 'super_admin']) then
    raise exception 'BIO_FORBIDDEN';
  end if;
  return query
  select p.id, p.device_id, d.name, p.mode, p.status, p.received, p.inserted,
         p.duplicates, p.unmatched, p.error, p.triggered_by, p.started_at, p.finished_at
  from public.biometric_pulls p
  join public.biometric_devices d on d.id = p.device_id
  where (p_device_id is null or p.device_id = p_device_id)
  order by p.started_at desc
  limit greatest(1, least(p_limit, 500));
end$$;

-- ─────────────────────────── الصلاحيات ───────────────────────────
revoke all on function
  public.biometric_import_punches(uuid, jsonb, text),
  public.biometric_process_pushes(integer),
  public.biometric_punches_list(date, date, text, uuid, boolean, integer),
  public.biometric_link_pin(text, uuid),
  public.biometric_attendance_derive(date),
  public.biometric_pulls_list(uuid, integer)
from public, anon;

grant execute on function
  public.biometric_import_punches(uuid, jsonb, text),
  public.biometric_process_pushes(integer),
  public.biometric_punches_list(date, date, text, uuid, boolean, integer),
  public.biometric_link_pin(text, uuid),
  public.biometric_attendance_derive(date),
  public.biometric_pulls_list(uuid, integer)
to authenticated;
