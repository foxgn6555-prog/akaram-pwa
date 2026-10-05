-- 00175: وحدة «الأشخاص غير المطابقين» + الإرسال التلقائي للموظف الجديد إلى أجهزة البصمة
--   ① تقرير شهري/فترة لكل شخص بصم على جهاز ولم يُربط بموظف: لكل يوم أول/آخر بصمة، عدد البصمات، دقائق العمل، الحالة
--      (present = بصمتان فأكثر، missing = بصمة واحدة فقط، absent = لا بصمة — كل أيام الفترة أيام عمل بما فيها الجمعة، حتى اليوم فقط)
--   ② محفّز: عند إضافة موظف برقم بصمة رقمي (أو تغيير رقمه/اسمه) يُدرج أمر USERINFO تلقائياً لكل أجهزة ADMS النشطة

create or replace function public.biometric_unmatched_report(
  p_from date, p_to date, p_branch_id uuid default null, p_search text default null)
returns table (
  pin text, person_name text, device_serial text, device_name text, branch_id uuid, branch_name text,
  days jsonb, present_days integer, missing_days integer, absent_days integer, total_minutes integer,
  first_seen timestamptz, last_seen timestamptz)
-- ملاحظة: أسماء الأعمدة الناتجة تتعارض مع أعمدة الجداول داخل plpgsql، لذا نستخدم #variable_conflict
language plpgsql stable
security definer
set search_path = public, app
as $$
#variable_conflict use_column
declare v_to date; v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not app.has_role(array['hr_officer', 'it_admin', 'super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'BIO_RANGE_INVALID'; end if;
  if p_to - p_from > 62 then raise exception 'BIO_RANGE_TOO_WIDE'; end if;
  v_to := least(p_to, (now() at time zone 'UTC' + interval '3 hours')::date); -- لا نحكم بالغياب على أيام لم تأتِ بعد

  return query
  with dev as (
    select d.serial_number, d.name, d.branch_id as dev_branch, b.name as dev_branch_name, coalesce(d.timezone_offset, '+03:00') as tz
    from public.biometric_devices d left join public.branches b on b.id = d.branch_id
  ),
  pun as (
    select p.device_serial, p.pin,
           ((p.punched_at at time zone 'UTC') + dv.tz::interval) as local_at,
           ((p.punched_at at time zone 'UTC') + dv.tz::interval)::date as local_day,
           p.punched_at, p.person_name
    from public.biometric_punches p
    join dev dv on dv.serial_number = p.device_serial
    where p.employee_id is null
      and not exists (select 1 from public.employees e where e.biometric_pin = p.pin and e.archived_at is null)
      and p.punched_at >= (p_from::timestamp - interval '1 day') and p.punched_at < (p_to::timestamp + interval '2 days')
      and (p_branch_id is null or dv.dev_branch = p_branch_id)
  ),
  per_day as (
    select device_serial, pin, local_day,
           min(local_at) as first_at, max(local_at) as last_at, count(*)::int as n,
           case when count(*) >= 2 then greatest(0, (extract(epoch from (max(local_at) - min(local_at))) / 60)::int) else 0 end as minutes
    from pun where local_day between p_from and v_to
    group by device_serial, pin, local_day
  ),
  people as (
    select distinct device_serial, pin from per_day
  ),
  named as (
    select pp.device_serial, pp.pin,
           coalesce(
             (select u.name from public.biometric_device_users u where u.device_serial = pp.device_serial and u.pin = pp.pin and coalesce(u.name, '') <> '' limit 1),
             (select pu.person_name from pun pu where pu.device_serial = pp.device_serial and pu.pin = pp.pin and coalesce(pu.person_name, '') <> '' order by pu.punched_at desc limit 1)
           ) as person_name
    from people pp
  ),
  cal as (
    select nm.device_serial, nm.pin, gs::date as d
    from named nm cross join generate_series(p_from, v_to, interval '1 day') gs
  ),
  cells as (
    select c.device_serial, c.pin, c.d,
           pd.first_at, pd.last_at, coalesce(pd.n, 0) as n, coalesce(pd.minutes, 0) as minutes,
           case when pd.n >= 2 then 'present' when pd.n = 1 then 'missing' else 'absent' end as status
    from cal c left join per_day pd on pd.device_serial = c.device_serial and pd.pin = c.pin and pd.local_day = c.d
  )
  select nm.pin, nm.person_name, nm.device_serial, dv.name, dv.dev_branch, dv.dev_branch_name,
         (select jsonb_agg(jsonb_build_object('d', to_char(ce.d, 'YYYY-MM-DD'), 'status', ce.status, 'n', ce.n, 'minutes', ce.minutes,
                   'first', case when ce.first_at is null then null else to_char(ce.first_at, 'HH24:MI') end,
                   'last', case when ce.last_at is null or ce.n < 2 then null else to_char(ce.last_at, 'HH24:MI') end) order by ce.d)
            from cells ce where ce.device_serial = nm.device_serial and ce.pin = nm.pin),
         (select count(*)::int from cells ce where ce.device_serial = nm.device_serial and ce.pin = nm.pin and ce.status = 'present'),
         (select count(*)::int from cells ce where ce.device_serial = nm.device_serial and ce.pin = nm.pin and ce.status = 'missing'),
         (select count(*)::int from cells ce where ce.device_serial = nm.device_serial and ce.pin = nm.pin and ce.status = 'absent'),
         (select coalesce(sum(ce.minutes), 0)::int from cells ce where ce.device_serial = nm.device_serial and ce.pin = nm.pin),
         (select min(pu.punched_at) from pun pu where pu.device_serial = nm.device_serial and pu.pin = nm.pin),
         (select max(pu.punched_at) from pun pu where pu.device_serial = nm.device_serial and pu.pin = nm.pin)
  from named nm join dev dv on dv.serial_number = nm.device_serial
  where v_q is null or nm.pin ilike '%' || v_q || '%' or coalesce(nm.person_name, '') ilike '%' || v_q || '%' or dv.name ilike '%' || v_q || '%'
  order by dv.dev_branch_name nulls last, dv.name, (case when nm.pin ~ '^\d+$' then nm.pin::bigint else null end) nulls last, nm.pin;
end;
$$;
revoke all on function public.biometric_unmatched_report(date, date, uuid, text) from public, anon;
grant execute on function public.biometric_unmatched_report(date, date, uuid, text) to authenticated;

-- ② الإرسال التلقائي إلى الأجهزة عند إضافة/تعديل موظف برقم بصمة رقمي
create or replace function app.trg_employee_biometric_autopush()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare d record;
begin
  if new.archived_at is not null or new.employment_status = 'terminated' then return new; end if;
  if coalesce(new.biometric_pin, '') !~ '^[0-9]{1,9}$' then return new; end if;
  if tg_op = 'UPDATE' and old.biometric_pin is not distinct from new.biometric_pin and old.full_name is not distinct from new.full_name
     and old.employment_status is not distinct from new.employment_status and old.archived_at is not distinct from new.archived_at then
    return new;
  end if;
  for d in select serial_number from public.biometric_devices where is_active and mode = 'adms_push' loop
    perform app.biometric_enqueue(d.serial_number, 'update_user', app.biometric_userinfo_line(new.biometric_pin, new.full_name),
                                  jsonb_build_object('employee_id', new.id, 'pin', new.biometric_pin, 'auto', true), auth.uid());
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_employee_biometric_autopush on public.employees;
create trigger trg_employee_biometric_autopush
  after insert or update of biometric_pin, full_name, employment_status, archived_at on public.employees
  for each row execute function app.trg_employee_biometric_autopush();
revoke all on function app.trg_employee_biometric_autopush() from public, anon, authenticated;
