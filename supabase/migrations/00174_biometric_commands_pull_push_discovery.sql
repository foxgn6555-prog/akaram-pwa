-- 00174: وحدة أوامر أجهزة ADMS — سحب عند الطلب، إرسال الموظفين إلى الأجهزة، اكتشاف الأجهزة غير المسجّلة، عناوين الخوادم
--   الجهاز يسأل المنصة في كل نبضة (getrequest) «هل من أمر؟» — فنرد بأمر من الطابور بصيغة C:{id}:{command}
--   ثم يؤكد التنفيذ عبر POST /iclock/devicecmd (ID=..&Return=0). الأوامر المدعومة:
--     DATA QUERY USERINFO                       → الجهاز يرسل أسماء مستخدميه (OPERLOG/USERINFO)
--     DATA QUERY ATTLOG StartTime=..\tEndTime=.. → الجهاز يعيد إرسال بصمات الفترة (لأجهزة الفروع التي تتصل متأخرة أو لإعادة السحب)
--     DATA UPDATE USERINFO PIN=..\tName=..        → إضافة/تحديث موظف على الجهاز (الوجه/البصمة تُسجَّل على الجهاز لاحقاً)
--     DATA DELETE USERINFO PIN=..                 → حذف مستخدم من الجهاز
--   كل أمر مسجّل بمن طلبه ومتى أُرسل ومتى نُفّذ ونتيجته.

-- ① طابور الأوامر
create table if not exists public.biometric_device_commands (
  id            bigint generated always as identity primary key,
  device_serial text not null,
  kind          text not null check (kind in ('query_userinfo', 'query_attlog', 'update_user', 'delete_user', 'custom')),
  command       text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'done', 'failed')),
  return_code   integer,
  note          text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  acked_at      timestamptz
);
create index if not exists idx_bio_cmds_serial_status on public.biometric_device_commands (device_serial, status, created_at);
alter table public.biometric_device_commands enable row level security;
drop policy if exists "bio_cmds: قراءة HR/IT" on public.biometric_device_commands;
create policy "bio_cmds: قراءة HR/IT" on public.biometric_device_commands
  for select to authenticated using (app.has_role(array['hr_officer', 'it_admin', 'super_admin']));

-- إدراج مع منع التكرار (نفس الأمر معلّق مسبقاً → نعيد معرّفه)
create or replace function app.biometric_enqueue(p_sn text, p_kind text, p_command text, p_payload jsonb default '{}'::jsonb, p_by uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public, app
as $$
declare v_id bigint;
begin
  select id into v_id from public.biometric_device_commands
  where device_serial = p_sn and status = 'queued' and kind = p_kind and command = p_command
  order by id limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.biometric_device_commands (device_serial, kind, command, payload, created_by)
  values (p_sn, p_kind, p_command, coalesce(p_payload, '{}'::jsonb), p_by)
  returning id into v_id;
  insert into public.integration_logs (provider, direction, endpoint, status, payload)
  values ('biometric', 'outbound', 'adms/command', 'success', jsonb_build_object('sn', p_sn, 'cmd', p_kind, 'id', v_id, 'queued', true));
  return v_id;
end;
$$;
revoke all on function app.biometric_enqueue(text, text, text, jsonb, uuid) from public, anon, authenticated;

-- ② الأمر التالي (يستبدل نسخة 00172): يُدرج طلب الأسماء التلقائي ثم يسلّم أقدم أمر معلّق
create or replace function public.biometric_command_next(p_sn text)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  d record; c record; v_need boolean;
begin
  select id, users_queried_at, users_query_requested into d
  from public.biometric_devices where serial_number = p_sn and is_active;
  if d.id is null then return null; end if;

  -- أوامر أُرسلت ولم يؤكدها الجهاز خلال 30 دقيقة → فاشلة (الجهاز لا يرد على devicecmd في بعض البرامج الثابتة، فنعتبرها منتهية)
  update public.biometric_device_commands set status = 'failed', note = 'TIMEOUT_NO_ACK'
  where device_serial = p_sn and status = 'sent' and sent_at < now() - interval '30 minutes';

  -- طلب الأسماء التلقائي (نفس منطق 00172) يصبح أمراً في الطابور
  v_need := d.users_query_requested
         or (coalesce(d.users_queried_at, '-infinity'::timestamptz) < now() - interval '12 hours'
             and exists (
               select 1 from public.biometric_punches p
               left join public.biometric_device_users u on u.device_serial = p.device_serial and u.pin = p.pin
               where p.device_serial = p_sn and p.punched_at > now() - interval '7 days' and (u.name is null or u.name = '')
               limit 1));
  if v_need then
    perform app.biometric_enqueue(p_sn, 'query_userinfo', 'DATA QUERY USERINFO');
    update public.biometric_devices set users_queried_at = now(), users_query_requested = false, updated_at = now() where id = d.id;
  end if;

  select * into c from public.biometric_device_commands
  where device_serial = p_sn and status = 'queued' order by id limit 1;
  if c.id is null then return null; end if;

  update public.biometric_device_commands set status = 'sent', sent_at = now() where id = c.id;
  return 'C:' || c.id::text || ':' || c.command;
end;
$$;
revoke all on function public.biometric_command_next(text) from public, anon, authenticated;

-- تأكيد التنفيذ من الجهاز (devicecmd: ID=..&Return=..&CMD=..)
create or replace function public.biometric_command_ack(p_sn text, p_id bigint, p_return integer, p_cmd text default null)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  update public.biometric_device_commands
     set status = case when coalesce(p_return, 0) = 0 then 'done' else 'failed' end,
         return_code = p_return, acked_at = now(),
         note = case when coalesce(p_return, 0) = 0 then null else 'DEVICE_RETURN_' || p_return::text end
   where id = p_id and device_serial = p_sn and status in ('sent', 'queued');
  if found then
    insert into public.integration_logs (provider, direction, endpoint, status, payload)
    values ('biometric', 'inbound', 'adms/devicecmd', case when coalesce(p_return, 0) = 0 then 'success' else 'error' end,
            jsonb_build_object('sn', p_sn, 'id', p_id, 'return', p_return, 'cmd', p_cmd));
  end if;
end;
$$;
revoke all on function public.biometric_command_ack(text, bigint, integer, text) from public, anon, authenticated;

-- ③ أوامر من الواجهة
create or replace function app.biometric_device_sn(p_device_id uuid, p_require_adms boolean default true)
returns text
language plpgsql stable
security definer
set search_path = public, app
as $$
declare v_sn text; v_mode text; v_active boolean;
begin
  select serial_number, mode, is_active into v_sn, v_mode, v_active from public.biometric_devices where id = p_device_id;
  if v_sn is null then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;
  if p_require_adms and v_mode <> 'adms_push' then raise exception 'BIO_MODE_NOT_ADMS'; end if;
  if not v_active then raise exception 'BIO_DEVICE_INACTIVE'; end if;
  return v_sn;
end;
$$;

-- طلب الأسماء (يستبدل نسخة 00172 — يُدرج مباشرة في الطابور)
create or replace function public.biometric_request_users(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_sn text;
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then raise exception 'BIO_FORBIDDEN'; end if;
  v_sn := app.biometric_device_sn(p_device_id);
  perform app.biometric_enqueue(v_sn, 'query_userinfo', 'DATA QUERY USERINFO', '{}'::jsonb, auth.uid());
  update public.biometric_devices set users_queried_at = now(), users_query_requested = false where id = p_device_id;
end;
$$;

-- سحب بصمات فترة من الجهاز (الوقت يُرسل بتوقيت الجهاز المحلي)
create or replace function public.biometric_query_attlog(p_device_id uuid, p_from timestamptz, p_to timestamptz)
returns bigint
language plpgsql
security definer
set search_path = public, app
as $$
declare v_sn text; v_tz text; v_cmd text; v_id bigint;
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then raise exception 'BIO_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'BIO_RANGE_INVALID'; end if;
  if p_to - p_from > interval '92 days' then raise exception 'BIO_RANGE_TOO_WIDE'; end if;
  v_sn := app.biometric_device_sn(p_device_id);
  select coalesce(timezone_offset, '+03:00') into v_tz from public.biometric_devices where id = p_device_id;
  v_cmd := 'DATA QUERY ATTLOG StartTime=' || to_char((p_from at time zone 'UTC') + v_tz::interval, 'YYYY-MM-DD HH24:MI:SS')
        || E'\tEndTime=' || to_char((p_to at time zone 'UTC') + v_tz::interval, 'YYYY-MM-DD HH24:MI:SS');
  v_id := app.biometric_enqueue(v_sn, 'query_attlog', v_cmd, jsonb_build_object('from', p_from, 'to', p_to), auth.uid());
  -- يظهر في «سجل عمليات السحب» كطلب معلّق — يكتمل عند وصول البيانات (تُحتسب في biometric_punches)؛ لا يتكرر للأمر نفسه
  if not exists (select 1 from public.biometric_pulls where mode = 'adms_query' and error = 'QUEUED_CMD_' || v_id::text) then
    insert into public.biometric_pulls (device_id, mode, status, received, inserted, triggered_by, started_at, finished_at, error)
    values (p_device_id, 'adms_query', 'partial', 0, 0, auth.uid(), now(), null, 'QUEUED_CMD_' || v_id::text);
  end if;
  return v_id;
end;
$$;

-- اسم المستخدم على الجهاز: حقل Name في ZKTeco محدود بـ 24 بايت (≈ 12 حرفاً عربياً) — نقصّ على حدود الأحرف لا البايتات
create or replace function app.biometric_device_name(p_name text, p_max_bytes integer default 24)
returns text
language plpgsql immutable
as $$
declare v text := trim(regexp_replace(coalesce(p_name, ''), E'[\\t\\n\\r]+', ' ', 'g'));
begin
  while octet_length(v) > p_max_bytes and length(v) > 0 loop
    v := left(v, length(v) - 1);
  end loop;
  return trim(v);
end;
$$;

-- سطر USERINFO لموظف
create or replace function app.biometric_userinfo_line(p_pin text, p_name text, p_card text default null)
returns text
language sql immutable
as $$
  select 'DATA UPDATE USERINFO PIN=' || p_pin
      || E'\tName=' || app.biometric_device_name(p_name)
      || E'\tPri=0\tPasswd=\tCard=' || coalesce(p_card, '')
      || E'\tGrp=1\tTZ=0000000100000000';
$$;

-- إرسال موظف إلى جهاز (أو كل أجهزة ADMS النشطة إن لم يُحدَّد)
create or replace function public.biometric_push_employee(p_employee_id uuid, p_device_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare e record; d record; v_n integer := 0;
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then raise exception 'BIO_FORBIDDEN'; end if;
  select id, full_name, biometric_pin, employment_status into e from public.employees where id = p_employee_id and archived_at is null;
  if e.id is null then raise exception 'HR_EMPLOYEE_NOT_FOUND'; end if;
  if coalesce(e.biometric_pin, '') = '' then raise exception 'BIO_PIN_REQUIRED'; end if;
  if e.biometric_pin !~ '^[0-9]{1,9}$' then raise exception 'BIO_PIN_NOT_NUMERIC'; end if;
  for d in
    select serial_number from public.biometric_devices
    where is_active and mode = 'adms_push' and (p_device_id is null or id = p_device_id)
  loop
    perform app.biometric_enqueue(d.serial_number, 'update_user', app.biometric_userinfo_line(e.biometric_pin, e.full_name),
                                  jsonb_build_object('employee_id', e.id, 'pin', e.biometric_pin), auth.uid());
    v_n := v_n + 1;
  end loop;
  if p_device_id is not null and v_n = 0 then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;
  return v_n;
end;
$$;

-- مزامنة كل الموظفين النشطين (ذوي رقم بصمة رقمي) إلى جهاز
create or replace function public.biometric_push_all_employees(p_device_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare v_sn text; e record; v_n integer := 0;
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then raise exception 'BIO_FORBIDDEN'; end if;
  v_sn := app.biometric_device_sn(p_device_id);
  for e in
    select id, full_name, biometric_pin from public.employees
    where archived_at is null and employment_status <> 'terminated' and coalesce(biometric_pin, '') ~ '^[0-9]{1,9}$'
    order by biometric_pin::bigint
  loop
    perform app.biometric_enqueue(v_sn, 'update_user', app.biometric_userinfo_line(e.biometric_pin, e.full_name),
                                  jsonb_build_object('employee_id', e.id, 'pin', e.biometric_pin), auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- حذف مستخدم من جهاز
create or replace function public.biometric_delete_device_user(p_device_id uuid, p_pin text)
returns bigint
language plpgsql
security definer
set search_path = public, app
as $$
declare v_sn text;
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then raise exception 'BIO_FORBIDDEN'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{1,9}$' then raise exception 'BIO_PIN_NOT_NUMERIC'; end if;
  v_sn := app.biometric_device_sn(p_device_id);
  return app.biometric_enqueue(v_sn, 'delete_user', 'DATA DELETE USERINFO PIN=' || p_pin, jsonb_build_object('pin', p_pin), auth.uid());
end;
$$;

-- قائمة الأوامر لجهاز
create or replace function public.biometric_commands_list(p_device_id uuid, p_limit integer default 30)
returns table (id bigint, kind text, command text, status text, return_code integer, note text, created_at timestamptz, sent_at timestamptz, acked_at timestamptz, created_by_name text)
language sql stable
security definer
set search_path = public, app
as $$
  select c.id, c.kind, c.command, c.status, c.return_code, c.note, c.created_at, c.sent_at, c.acked_at,
         app.manager_display_name(c.created_by)
  from public.biometric_device_commands c
  join public.biometric_devices d on d.serial_number = c.device_serial
  where d.id = p_device_id and app.has_role(array['it_admin', 'super_admin', 'hr_officer'])
  order by c.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
$$;

-- ④ اكتشاف الأجهزة: اتصلت بعنواننا ولم تُسجَّل (من سجل التسجيل خلال 30 يوماً)
create or replace function public.biometric_unregistered_devices()
returns table (serial_number text, first_seen timestamptz, last_seen timestamptz, attempts bigint)
language sql stable
security definer
set search_path = public, app
as $$
  select l.payload->>'sn', min(l.created_at), max(l.created_at), count(*)
  from public.integration_logs l
  where app.has_role(array['it_admin', 'super_admin'])
    and l.provider = 'biometric' and l.endpoint = 'adms/register' and l.status = 'rejected'
    and l.created_at > now() - interval '30 days'
    and coalesce(l.payload->>'sn', '') <> ''
    and not exists (select 1 from public.biometric_devices d where d.serial_number = l.payload->>'sn')
  group by l.payload->>'sn'
  order by max(l.created_at) desc;
$$;

-- ⑤ عناوين الخوادم (الدالة مباشرة أو وسطاء) — تُعرض في شاشة الأجهزة ليستخدمها الفنيون
create table if not exists public.biometric_adms_endpoints (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  host       text not null unique,
  note       text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.biometric_adms_endpoints enable row level security;
drop policy if exists "bio_endpoints: قراءة" on public.biometric_adms_endpoints;
create policy "bio_endpoints: قراءة" on public.biometric_adms_endpoints
  for select to authenticated using (app.has_role(array['hr_officer', 'it_admin', 'super_admin']));
drop policy if exists "bio_endpoints: إدارة IT" on public.biometric_adms_endpoints;
create policy "bio_endpoints: إدارة IT" on public.biometric_adms_endpoints
  for all to authenticated using (app.has_role(array['it_admin', 'super_admin'])) with check (app.has_role(array['it_admin', 'super_admin']));

-- صلاحيات
revoke all on function public.biometric_request_users(uuid) from public, anon;
revoke all on function public.biometric_query_attlog(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.biometric_push_employee(uuid, uuid) from public, anon;
revoke all on function public.biometric_push_all_employees(uuid) from public, anon;
revoke all on function public.biometric_delete_device_user(uuid, text) from public, anon;
revoke all on function public.biometric_commands_list(uuid, integer) from public, anon;
revoke all on function public.biometric_unregistered_devices() from public, anon;
grant execute on function public.biometric_request_users(uuid), public.biometric_query_attlog(uuid, timestamptz, timestamptz),
  public.biometric_push_employee(uuid, uuid), public.biometric_push_all_employees(uuid), public.biometric_delete_device_user(uuid, text),
  public.biometric_commands_list(uuid, integer), public.biometric_unregistered_devices() to authenticated;
revoke all on function app.biometric_device_sn(uuid, boolean), app.biometric_userinfo_line(text, text, text), app.biometric_device_name(text, integer) from public, anon, authenticated;

-- ⑥ اكتمال طلب السحب: عند وصول بصمات من جهاز له طلب adms_query معلّق نحدّث السجل (محفّز خفيف على biometric_punches)
create or replace function app.trg_biometric_pull_progress()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  update public.biometric_pulls p
     set received = p.received + 1, inserted = p.inserted + 1, status = 'success', finished_at = now()
   where p.id = (select x.id from public.biometric_pulls x
                 where x.mode = 'adms_query' and x.device_id = new.device_id and x.started_at > now() - interval '2 days'
                 order by x.started_at desc limit 1);
  return new;
end;
$$;
drop trigger if exists trg_bio_pull_progress on public.biometric_punches;
create trigger trg_bio_pull_progress after insert on public.biometric_punches
  for each row when (new.method = 'adms_push') execute function app.trg_biometric_pull_progress();
revoke all on function app.trg_biometric_pull_progress() from public, anon, authenticated;
