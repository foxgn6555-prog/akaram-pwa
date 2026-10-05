-- 00176: إرسال الموظف إلى أجهزة مختارة (لا إلى الكل) + حماية مستخدمي الجهاز الحاليين + تعيين مسؤول على الجهاز
--   • الإرسال التلقائي عند إضافة الموظف → أجهزة فرع الموظف فقط (بلا فرع → لا إرسال تلقائي)
--   • الإرسال اليدوي → قائمة أجهزة يختارها المستخدم (p_device_ids)
--   • سطر USERINFO يحافظ على صلاحية المستخدم (Pri) وبطاقته (Card) إن كان معروفاً على الجهاز، ولا يمسح كلمة المرور
--     (النسخة السابقة كانت ترسل Pri=0 وPasswd= فارغة فتُسقط صلاحية مسؤول الجهاز لو تطابق رقمه مع رقم موظف)
--   • biometric_set_device_admin: يرفع مستخدماً إلى مسؤول (Pri=14) لاستعادة الدخول إلى قائمة الجهاز عند «رفض الوصول»

create or replace function app.biometric_userinfo_line(p_pin text, p_name text, p_card text default null, p_pri integer default 0, p_with_passwd boolean default false)
returns text
language sql immutable
as $$
  select 'DATA UPDATE USERINFO PIN=' || p_pin
      || E'\tName=' || app.biometric_device_name(p_name)
      || E'\tPri=' || coalesce(p_pri, 0)::text
      || case when p_with_passwd then E'\tPasswd=' else '' end
      || E'\tCard=' || coalesce(p_card, '')
      || E'\tGrp=1\tTZ=0000000100000000';
$$;
drop function if exists app.biometric_userinfo_line(text, text, text);

-- سطر لجهاز بعينه: يحافظ على Pri/Card المعروفين للمستخدم على هذا الجهاز
create or replace function app.biometric_userinfo_line_for(p_sn text, p_pin text, p_name text)
returns text
language sql stable
security definer
set search_path = public, app
as $$
  select app.biometric_userinfo_line(p_pin, p_name, u.card, coalesce(u.privilege, 0)::int, false)
  from (select 1) x left join public.biometric_device_users u on u.device_serial = p_sn and u.pin = p_pin;
$$;
revoke all on function app.biometric_userinfo_line_for(text, text, text), app.biometric_userinfo_line(text, text, text, integer, boolean) from public, anon, authenticated;

-- إرسال موظف إلى أجهزة مختارة (null = أجهزة فرع الموظف)
drop function if exists public.biometric_push_employee(uuid, uuid);
create or replace function public.biometric_push_employee(p_employee_id uuid, p_device_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare e record; d record; v_n integer := 0;
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then raise exception 'BIO_FORBIDDEN'; end if;
  select id, full_name, biometric_pin, branch_id into e from public.employees where id = p_employee_id and archived_at is null;
  if e.id is null then raise exception 'HR_EMPLOYEE_NOT_FOUND'; end if;
  if coalesce(e.biometric_pin, '') = '' then raise exception 'BIO_PIN_REQUIRED'; end if;
  if e.biometric_pin !~ '^[0-9]{1,9}$' then raise exception 'BIO_PIN_NOT_NUMERIC'; end if;
  for d in
    select serial_number from public.biometric_devices
    where is_active and mode = 'adms_push'
      and ((p_device_ids is not null and id = any (p_device_ids)) or (p_device_ids is null and branch_id is not null and branch_id = e.branch_id))
  loop
    perform app.biometric_enqueue(d.serial_number, 'update_user', app.biometric_userinfo_line_for(d.serial_number, e.biometric_pin, e.full_name),
                                  jsonb_build_object('employee_id', e.id, 'pin', e.biometric_pin), auth.uid());
    v_n := v_n + 1;
  end loop;
  if p_device_ids is not null and cardinality(p_device_ids) > 0 and v_n = 0 then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;
  return v_n;
end;
$$;
revoke all on function public.biometric_push_employee(uuid, uuid[]) from public, anon;
grant execute on function public.biometric_push_employee(uuid, uuid[]) to authenticated;

-- مزامنة كل الموظفين إلى جهاز: تحافظ على صلاحيات المستخدمين الحاليين
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
    perform app.biometric_enqueue(v_sn, 'update_user', app.biometric_userinfo_line_for(v_sn, e.biometric_pin, e.full_name),
                                  jsonb_build_object('employee_id', e.id, 'pin', e.biometric_pin), auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- المحفّز التلقائي: أجهزة فرع الموظف فقط
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
  if new.branch_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.biometric_pin is not distinct from new.biometric_pin and old.full_name is not distinct from new.full_name
     and old.employment_status is not distinct from new.employment_status and old.archived_at is not distinct from new.archived_at
     and old.branch_id is not distinct from new.branch_id then
    return new;
  end if;
  for d in select serial_number from public.biometric_devices where is_active and mode = 'adms_push' and branch_id = new.branch_id loop
    perform app.biometric_enqueue(d.serial_number, 'update_user', app.biometric_userinfo_line_for(d.serial_number, new.biometric_pin, new.full_name),
                                  jsonb_build_object('employee_id', new.id, 'pin', new.biometric_pin, 'auto', true), auth.uid());
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_employee_biometric_autopush on public.employees;
create trigger trg_employee_biometric_autopush
  after insert or update of biometric_pin, full_name, employment_status, archived_at, branch_id on public.employees
  for each row execute function app.trg_employee_biometric_autopush();

-- تعيين مسؤول على الجهاز (Pri=14 = مسؤول أعلى) — لاستعادة الدخول إلى قائمة الجهاز
create or replace function public.biometric_set_device_admin(p_device_id uuid, p_pin text, p_name text default null)
returns bigint
language plpgsql
security definer
set search_path = public, app
as $$
declare v_sn text; v_name text;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{1,9}$' then raise exception 'BIO_PIN_NOT_NUMERIC'; end if;
  v_sn := app.biometric_device_sn(p_device_id);
  select coalesce(nullif(trim(coalesce(p_name, '')), ''), u.name, e.full_name, 'Admin') into v_name
  from (select 1) x
  left join public.biometric_device_users u on u.device_serial = v_sn and u.pin = p_pin
  left join public.employees e on e.biometric_pin = p_pin and e.archived_at is null;
  return app.biometric_enqueue(v_sn, 'update_user',
    app.biometric_userinfo_line(p_pin, v_name, (select card from public.biometric_device_users where device_serial = v_sn and pin = p_pin), 14, false),
    jsonb_build_object('pin', p_pin, 'admin', true), auth.uid());
end;
$$;
revoke all on function public.biometric_set_device_admin(uuid, text, text) from public, anon;
grant execute on function public.biometric_set_device_admin(uuid, text, text) to authenticated;
