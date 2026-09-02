-- ═══════════════════════════════════════════════════════════════
-- 00045 · دوال كتابة آمنة لوحدة «مسؤول القسم»
-- المدير لا يرسل manager_id/shift/sectors — تُشتق من ملفه (manager_profiles)
-- وجلسته (auth.uid()) لمنع أي تزوير. العزل يتحقق داخل الدوال عبر RLS.
-- ═══════════════════════════════════════════════════════════════

-- إرسال كتاب مستلزمات (يملأ الهوية من الملف + يختم الإرسال)
create or replace function public.sector_submit_supply(
  p_supply_type text,
  p_quantity integer,
  p_notes text default null,
  p_signed boolean default false
) returns public.sector_supply_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.manager_profiles;
  v_name text;
  v_ref text;
  v_num int;
  v_row public.sector_supply_requests;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  select * into v_profile from public.manager_profiles where user_id = v_uid;
  if v_profile is null then raise exception 'ليس لديك صلاحية مسؤول قسم'; end if;
  if array_length(v_profile.sectors,1) is null then raise exception 'لم تُسند لك قواطع بعد'; end if;
  if not p_signed then raise exception 'التوقيع الإلكتروني (الإقرار) مطلوب'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'العدد غير صالح'; end if;

  select coalesce(full_name, '') into v_name
  from public.employees where user_id = v_uid limit 1;
  if v_name = '' then
    v_name := coalesce(v_uid::text, 'مسؤول قسم');
  end if;

  select count(*) + 1 into v_num from public.sector_supply_requests
    where extract(year from created_at) = extract(year from now());
  v_ref := 'كتاب/مستلزمات/' || extract(year from now())::text || '/' || lpad(v_num::text, 4, '0');

  insert into public.sector_supply_requests (
    manager_id, manager_name, shift, sectors, supply_type, quantity, notes,
    signed, status, ref_no, submitted_at
  ) values (
    v_uid, v_name, v_profile.shift, v_profile.sectors,
    p_supply_type, p_quantity, nullif(trim(coalesce(p_notes,'')),''),
    true, 'submitted_to_deputy', v_ref, now()
  ) returning * into v_row;

  return v_row;
end;
$$;

-- تسجيل بلاغ عطل آلية (الهوية من الملف)
create or replace function public.sector_submit_breakdown(
  p_db_number text,
  p_fault_type text,
  p_notes text default null
) returns public.sector_breakdowns
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.manager_profiles;
  v_name text;
  v_row public.sector_breakdowns;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  select * into v_profile from public.manager_profiles where user_id = v_uid;
  if v_profile is null then raise exception 'ليس لديك صلاحية مسؤول قسم'; end if;
  select coalesce(full_name, '') into v_name
  from public.employees where user_id = v_uid limit 1;
  if v_name = '' then v_name := v_uid::text; end if;

  insert into public.sector_breakdowns (
    manager_id, manager_name, shift, sectors, db_number, fault_type, notes, status
  ) values (
    v_uid, v_name, v_profile.shift, v_profile.sectors,
    p_db_number, p_fault_type, nullif(trim(coalesce(p_notes,'')),''), 'logged'
  ) returning * into v_row;

  return v_row;
end;
$$;

-- تسجيل صورة مرفوعة (الهوية من الملف) — بعد رفع الملف إلى Storage
create or replace function public.sector_register_photo(
  p_storage_path text,
  p_caption text default null
) returns public.sector_photos
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.manager_profiles;
  v_name text;
  v_row public.sector_photos;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  select * into v_profile from public.manager_profiles where user_id = v_uid;
  if v_profile is null then raise exception 'ليس لديك صلاحية مسؤول قسم'; end if;
  select coalesce(full_name, '') into v_name
  from public.employees where user_id = v_uid limit 1;
  if v_name = '' then v_name := v_uid::text; end if;

  insert into public.sector_photos (
    manager_id, manager_name, shift, sectors, caption, storage_path
  ) values (
    v_uid, v_name, v_profile.shift, v_profile.sectors,
    nullif(trim(coalesce(p_caption,'')),''), p_storage_path
  ) returning * into v_row;

  return v_row;
end;
$$;

-- تسجيل/تحديث حضور عامل (يُتحقق أن العاملة ضمن قواطع المدير)
create or replace function public.sector_set_attendance(
  p_worker_id uuid,
  p_log_date date,
  p_is_present boolean,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.manager_profiles;
  v_worker public.sector_workers;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  select * into v_profile from public.manager_profiles where user_id = v_uid;
  if v_profile is null then raise exception 'ليس لديك صلاحية مسؤول قسم'; end if;
  select * into v_worker from public.sector_workers where id = p_worker_id and archived_at is null;
  if v_worker is null then raise exception 'العامل غير موجود'; end if;
  if not (v_worker.sector_id = any(v_profile.sectors)) then
    raise exception 'هذا العامل ليس ضمن قواطعك';
  end if;

  insert into public.sector_attendance (
    manager_id, worker_id, worker_name, sector_id, shift, log_date, is_present, note
  ) values (
    v_uid, v_worker.id, v_worker.full_name, v_worker.sector_id,
    v_profile.shift, p_log_date, p_is_present, nullif(trim(coalesce(p_note,'')),'')
  )
  on conflict (worker_id, log_date, shift)
  do update set is_present = excluded.is_present, note = excluded.note, manager_id = v_uid;
end;
$$;

-- إضافة عامل للفريق (المدير يضيف ضمن قواطعه) — sector_id يجب أن يكون ضمن قواطعه
create or replace function public.sector_add_worker(
  p_full_name text, p_sector_id smallint, p_shift text,
  p_phone text default null, p_job_title text default null
) returns public.sector_workers
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.manager_profiles;
  v_row public.sector_workers;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  select * into v_profile from public.manager_profiles where user_id = v_uid;
  if v_profile is null then raise exception 'NO_PROFILE'; end if;
  if not (p_sector_id = any(v_profile.sectors))
     and not app.has_role(array['it_admin','super_admin','hr_officer']) then
    raise exception 'لا يمكنك الإضافة لقاطع خارج قواطعك';
  end if;
  insert into public.sector_workers (full_name, sector_id, shift, phone, job_title, created_by)
  values (p_full_name, p_sector_id, p_shift::text, nullif(trim(coalesce(p_phone,'')),''),
          nullif(trim(coalesce(p_job_title,'')),''), v_uid)
  returning * into v_row;
  return v_row;
end;
$$;

-- إضافة آلية للفريق
create or replace function public.sector_add_vehicle(
  p_db_number text, p_sector_id smallint, p_shift text,
  p_vehicle_type text default null, p_driver_name text default null
) returns public.sector_vehicles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.manager_profiles;
  v_row public.sector_vehicles;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  select * into v_profile from public.manager_profiles where user_id = v_uid;
  if v_profile is null then raise exception 'NO_PROFILE'; end if;
  if not (p_sector_id = any(v_profile.sectors))
     and not app.has_role(array['it_admin','super_admin','hr_officer']) then
    raise exception 'لا يمكنك الإضافة لقاطع خارج قواطعك';
  end if;
  insert into public.sector_vehicles (db_number, sector_id, shift, vehicle_type, driver_name, created_by)
  values (p_db_number, p_sector_id, p_shift::text,
          nullif(trim(coalesce(p_vehicle_type,'')),''),
          nullif(trim(coalesce(p_driver_name,'')),''), v_uid)
  returning * into v_row;
  return v_row;
end;
$$;

-- صلاحيات تنفيذ الدوال
revoke all on function public.sector_submit_supply(text,integer,text,boolean) from public;
grant execute on function public.sector_submit_supply(text,integer,text,boolean) to authenticated;
revoke all on function public.sector_submit_breakdown(text,text,text) from public;
grant execute on function public.sector_submit_breakdown(text,text,text) to authenticated;
revoke all on function public.sector_register_photo(text,text) from public;
grant execute on function public.sector_register_photo(text,text) to authenticated;
revoke all on function public.sector_set_attendance(uuid,date,boolean,text) from public;
grant execute on function public.sector_set_attendance(uuid,date,boolean,text) to authenticated;
revoke all on function public.sector_add_worker(text,smallint,text,text,text) from public;
grant execute on function public.sector_add_worker(text,smallint,text,text,text) to authenticated;
revoke all on function public.sector_add_vehicle(text,smallint,text,text,text) from public;
grant execute on function public.sector_add_vehicle(text,smallint,text,text,text) to authenticated;

-- الإدارة (IT/HR) تدير ملفات المديرين: إسناد شفت/قواطع
revoke all on function app.current_manager_sectors() from public;
grant execute on function app.current_manager_sectors() to authenticated;
revoke all on function app.manager_manages_sector(smallint) from public;
grant execute on function app.manager_manages_sector(smallint) to authenticated;
revoke all on function app.manager_owns_sectors(smallint[]) from public;
grant execute on function app.manager_owns_sectors(smallint[]) to authenticated;
