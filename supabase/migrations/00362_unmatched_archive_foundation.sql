-- 00403-ب: لقطات مستقلة للأشخاص غير المطابقين، دون تعديل الدفتر أو الحضور الرسمي.
-- تحفظ فقط الأشخاص غير المطابقين المعروفين عند الترحيل وما يُلتقط بعدها؛ لا يمكن استنتاج
-- من كان غير مطابق قبل الترحيل ثم رُبط بالفعل. لا مفاتيح أجنبية إلى الجداول الأصلية.
create table public.unmatched_archive_device_users (
  device_serial text not null,
  pin text not null,
  original_user jsonb not null,
  latest_name text,
  original_device jsonb,
  captured_at timestamptz not null default now(),
  primary key (device_serial, pin)
);
create table public.unmatched_archive_punches (
  source_punch_id uuid primary key,
  device_serial text not null,
  pin text not null,
  punched_at timestamptz not null,
  direction text not null,
  original_punch jsonb not null,
  original_device jsonb,
  captured_at timestamptz not null default now(),
  unique (device_serial, pin, punched_at, direction)
);
create index unmatched_archive_punch_person_time_idx
  on public.unmatched_archive_punches (device_serial, pin, punched_at, source_punch_id);
alter table public.unmatched_archive_device_users enable row level security;
alter table public.unmatched_archive_punches enable row level security;
revoke all on public.unmatched_archive_device_users, public.unmatched_archive_punches from public, anon, authenticated;

-- تُنشأ المحفزات أولاً؛ أقفال DDL تمنع فجوة بين تثبيتها والنسخ الأولي.
-- جداول انتقال على مستوى العبارة، بترتيب ثابت، ولا تغيّر المصدر بأي شكل.
create function app.unmatched_archive_capture_users() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  insert into public.unmatched_archive_device_users (device_serial, pin, original_user, latest_name, original_device)
  select u.device_serial, u.pin, to_jsonb(u), u.name, case when d.id is null then null else jsonb_build_object('id',d.id,'serial_number',d.serial_number,'name',d.name,'branch_id',d.branch_id,'timezone_offset',d.timezone_offset) end
  from new_unmatched_users u
  left join public.biometric_devices d on d.serial_number = u.device_serial
  where not exists (select 1 from public.employees e where e.biometric_pin = u.pin and e.archived_at is null)
  order by u.device_serial, u.pin
  on conflict (device_serial, pin) do update set latest_name = excluded.latest_name
    where public.unmatched_archive_device_users.latest_name is distinct from excluded.latest_name;
  return null;
end $$;
create trigger trg_unmatched_archive_users_insert after insert on public.biometric_device_users
  referencing new table as new_unmatched_users for each statement execute function app.unmatched_archive_capture_users();
create trigger trg_unmatched_archive_users_update after update on public.biometric_device_users
  referencing new table as new_unmatched_users for each statement execute function app.unmatched_archive_capture_users();

create function app.unmatched_archive_capture_insert() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  insert into public.unmatched_archive_punches (source_punch_id, device_serial, pin, punched_at, direction, original_punch, original_device)
  select p.id, p.device_serial, p.pin, p.punched_at, p.direction, to_jsonb(p), case when d.id is null then null else jsonb_build_object('id',d.id,'serial_number',d.serial_number,'name',d.name,'branch_id',d.branch_id,'timezone_offset',d.timezone_offset) end
  from new_unmatched_punches p
  left join public.biometric_devices d on d.serial_number = p.device_serial
  where p.employee_id is null
    and not exists (select 1 from public.employees e where e.biometric_pin = p.pin and e.archived_at is null)
  order by p.device_serial, p.pin, p.punched_at, p.id
  on conflict do nothing;
  return null;
end $$;
create trigger trg_unmatched_archive_punch_insert after insert on public.biometric_punches
  referencing new table as new_unmatched_punches for each statement execute function app.unmatched_archive_capture_insert();

-- الربط الحالي يحدّث employee_id: التقط الصف القديم إن لم يكن قد حُفظ، ثم اترك العملية تستمر كما هي.
create function app.unmatched_archive_capture_link() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  insert into public.unmatched_archive_punches (source_punch_id, device_serial, pin, punched_at, direction, original_punch, original_device)
  select o.id, o.device_serial, o.pin, o.punched_at, o.direction, to_jsonb(o), case when d.id is null then null else jsonb_build_object('id',d.id,'serial_number',d.serial_number,'name',d.name,'branch_id',d.branch_id,'timezone_offset',d.timezone_offset) end
  from old_unmatched_punches o
  join new_unmatched_punches n on n.id = o.id
  left join public.biometric_devices d on d.serial_number = o.device_serial
  where o.employee_id is null and n.employee_id is not null
  order by o.device_serial, o.pin, o.punched_at, o.id
  on conflict do nothing;
  return null;
end $$;
create trigger trg_unmatched_archive_punch_link after update on public.biometric_punches
  referencing old table as old_unmatched_punches new table as new_unmatched_punches
  for each statement execute function app.unmatched_archive_capture_link();
revoke all on function app.unmatched_archive_capture_users(), app.unmatched_archive_capture_insert(), app.unmatched_archive_capture_link()
  from public, anon, authenticated, service_role;

-- البيانات الحالية غير المطابقة، بما في ذلك مستخدمو الأجهزة الذين لم يبصموا بعد.
insert into public.unmatched_archive_device_users (device_serial, pin, original_user, latest_name, original_device)
select u.device_serial, u.pin, to_jsonb(u), u.name, case when d.id is null then null else jsonb_build_object('id',d.id,'serial_number',d.serial_number,'name',d.name,'branch_id',d.branch_id,'timezone_offset',d.timezone_offset) end
from public.biometric_device_users u left join public.biometric_devices d on d.serial_number = u.device_serial
where not exists (select 1 from public.employees e where e.biometric_pin = u.pin and e.archived_at is null)
order by u.device_serial, u.pin on conflict do nothing;
insert into public.unmatched_archive_punches (source_punch_id, device_serial, pin, punched_at, direction, original_punch, original_device)
select p.id, p.device_serial, p.pin, p.punched_at, p.direction, to_jsonb(p), case when d.id is null then null else jsonb_build_object('id',d.id,'serial_number',d.serial_number,'name',d.name,'branch_id',d.branch_id,'timezone_offset',d.timezone_offset) end
from public.biometric_punches p left join public.biometric_devices d on d.serial_number = p.device_serial
where p.employee_id is null
  and not exists (select 1 from public.employees e where e.biometric_pin = p.pin and e.archived_at is null)
order by p.device_serial, p.pin, p.punched_at, p.id on conflict do nothing;

-- واجهة قراءة أساسية للأرشيف فقط، تمهيداً لربطها بالشاشات اللاحقة.
create function public.biometric_unmatched_archive_people(p_limit integer default 100, p_offset integer default 0)
returns table (device_serial text, pin text, device_person_name text, device_name text, punch_count bigint, first_punch timestamptz, last_punch timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['hr_officer', 'it_admin', 'super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
  return query
  with identities as (
    select u.device_serial, u.pin from public.unmatched_archive_device_users u
    union select p.device_serial, p.pin from public.unmatched_archive_punches p
  ), page as (
    select x.device_serial, x.pin from identities x order by x.device_serial, x.pin
    limit greatest(1, least(coalesce(p_limit,100),500)) offset greatest(0,coalesce(p_offset,0))
  )
  select i.device_serial, i.pin,
    coalesce(nullif(u.latest_name, ''), nullif(u.original_user->>'name', ''), (select nullif(p.original_punch->>'person_name','') from public.unmatched_archive_punches p where p.device_serial=i.device_serial and p.pin=i.pin and nullif(p.original_punch->>'person_name','') is not null order by p.punched_at desc, p.source_punch_id desc limit 1)),
    coalesce(u.original_device->>'name', (select p.original_device->>'name' from public.unmatched_archive_punches p where p.device_serial=i.device_serial and p.pin=i.pin order by p.punched_at, p.source_punch_id limit 1)),
    coalesce(s.n, 0), s.first_at, s.last_at
  from page i left join public.unmatched_archive_device_users u on u.device_serial=i.device_serial and u.pin=i.pin
    left join lateral (
      select count(*) n, min(p.punched_at) first_at, max(p.punched_at) last_at
      from public.unmatched_archive_punches p where p.device_serial=i.device_serial and p.pin=i.pin
    ) s on true
  order by i.device_serial, i.pin;
end $$;

create function public.biometric_unmatched_archive_punches(p_device_serial text, p_pin text, p_limit integer default 100, p_after_at timestamptz default null, p_after_id uuid default null)
returns table (source_punch_id uuid, punched_at timestamptz, original_punch jsonb, original_device jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['hr_officer', 'it_admin', 'super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
  if nullif(trim(p_device_serial),'') is null or nullif(trim(p_pin),'') is null then raise exception 'BIO_ARCHIVE_PERSON_REQUIRED'; end if;
  if (p_after_at is null) <> (p_after_id is null) then raise exception 'BIO_ARCHIVE_CURSOR_INVALID'; end if;
  return query select p.source_punch_id, p.punched_at, p.original_punch, p.original_device
    from public.unmatched_archive_punches p
    where p.device_serial=p_device_serial and p.pin=p_pin
      and (p_after_at is null or (p.punched_at,p.source_punch_id) > (p_after_at,p_after_id))
    order by p.punched_at,p.source_punch_id limit greatest(1,least(coalesce(p_limit,100),500));
end $$;
revoke all on function public.biometric_unmatched_archive_people(integer,integer), public.biometric_unmatched_archive_punches(text,text,integer,timestamptz,uuid) from public, anon;
grant execute on function public.biometric_unmatched_archive_people(integer,integer), public.biometric_unmatched_archive_punches(text,text,integer,timestamptz,uuid) to authenticated;
