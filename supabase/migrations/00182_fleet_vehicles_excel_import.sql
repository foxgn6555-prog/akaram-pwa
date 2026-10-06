-- 00182 · قاعدة بيانات الآليات (غرفة العمليات): استرداد/استيراد من Excel + تصدير كامل
-- ─────────────────────────────────────────────────────────────────────────────────
-- • fleet_vehicles_export(): كل الآليات (غير المؤرشفة) بأعمدة نصية عربية جاهزة لملف Excel (وهو نفسه قالب الاستيراد).
-- • fleet_vehicles_import(p_rows, p_dry_run, p_update_existing): صف لكل آلية؛ المعرّف = رقم DB.
--   - الموجود يُحدَّث (استرداد) إن p_update_existing، وإلا يُتجاوز. الجديد يُدرج.
--   - الحقول الناقصة لا توقف الاستيراد: اللوحة/الشاصي يُولَّدان مؤقتاً («بلا-لوحة-DB»)، الصورة مؤقتة (import/no-photo)، وتُسجَّل تحذيرات.
--   - السائق يُطابَق بالرقم الوظيفي أو رقم البصمة أو الاسم الكامل؛ إن لم يُعثر عليه يُحفظ الاسم نصاً مع تحذير (بلا ربط HR).
--   - القاطع/المنطقة إلزامي: رقم المنطقة أو اسمها. الشفت: صباحي/مسائي/ليلي (افتراضي صباحي).
--   - أخطاء الصف لا تمنع بقية الصفوف. المحاكاة (dry_run) لا تكتب شيئاً.

-- صورة مؤقتة مسموحة للسجلات المستوردة (الشرط القديم: طول > 4 فقط، يبقى)
create or replace function app.fleet_norm_text(p text) returns text language sql immutable as $$
  select lower(trim(regexp_replace(replace(replace(replace(replace(replace(coalesce(p, ''), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ة', 'ه'), 'ى', 'ي'), '\s+', ' ', 'g')))
$$;

create or replace function app.fleet_resolve_sector(p text) returns smallint language plpgsql stable security definer set search_path = public, app as $$
declare t text := trim(coalesce(p, '')); v smallint; n text;
begin
  if t = '' then return null; end if;
  if t ~ '^\d+$' then select id into v from public.sectors where id = t::smallint; return v; end if;
  n := regexp_replace(t, '^(منطقة|المنطقة|قاطع|القاطع)\s*', '');
  if n ~ '^\d+$' then select id into v from public.sectors where id = n::smallint; return v; end if;
  select id into v from public.sectors s where app.fleet_norm_text(s.name) = app.fleet_norm_text(t) or app.fleet_norm_text(s.name) = app.fleet_norm_text(n) limit 1;
  return v;
end$$;

create or replace function app.fleet_resolve_driver(p text) returns public.employees language plpgsql stable security definer set search_path = public, app as $$
declare t text := trim(coalesce(p, '')); e public.employees;
begin
  if t = '' then return null; end if;
  select * into e from public.employees where employment_status is distinct from 'terminated' and (employee_number = t or biometric_pin = t) limit 1;
  if e.id is null then select * into e from public.employees where employment_status is distinct from 'terminated' and app.fleet_norm_text(full_name) = app.fleet_norm_text(t) limit 1; end if;
  return e;
end$$;

create or replace function public.fleet_vehicles_export()
returns table(db_number text, vehicle_name text, vehicle_category text, plate_number text, chassis_number text, sector_id smallint, area_name text, parent_sector text, shift text,
              driver_name text, driver_employee_number text, ownership_type text, lessor_name text, rental_contract_no text, rental_start_date date, rental_end_date date,
              model_year smallint, vehicle_color text, specifications text, has_photo boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_fleet_master_actor();
  return query
  select v.db_number, v.vehicle_name, v.vehicle_category, v.plate_number, v.chassis_number, v.sector_id, s.name, s.parent_sector, v.shift,
         v.driver_name, e.employee_number, v.ownership_type, v.lessor_name, v.rental_contract_no, v.rental_start_date, v.rental_end_date,
         v.model_year, v.vehicle_color, v.specifications, v.image_path not like 'import/%', v.created_at
  from public.garage_vehicles v join public.sectors s on s.id = v.sector_id left join public.employees e on e.id = v.driver_employee_id
  where v.archived_at is null
  order by s.parent_sector, s.id, v.db_number;
end$$;
revoke all on function public.fleet_vehicles_export() from public, anon;
grant execute on function public.fleet_vehicles_export() to authenticated;

create or replace function public.fleet_vehicles_import(p_rows jsonb, p_dry_run boolean default true, p_update_existing boolean default true)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  u uuid := app.require_fleet_master_actor();
  r jsonb; i int := 0; results jsonb := '[]'::jsonb; errs text[]; warns text[]; seen text[] := '{}';
  v_db text; v_name text; v_plate text; v_chassis text; v_sector smallint; v_shift text; v_cat text; v_own text; v_lessor text; v_year smallint; v_action text; v_id uuid;
  e public.employees; v_driver text; existing public.garage_vehicles; t text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'FLEET_IMPORT_EMPTY'; end if;
  if jsonb_array_length(p_rows) > 3000 then raise exception 'FLEET_IMPORT_TOO_LARGE'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; errs := '{}'; warns := '{}'; v_action := 'skipped'; v_id := null; e := null; existing := null;
    v_db := nullif(trim(coalesce(r ->> 'db_number', '')), '');
    v_name := nullif(trim(coalesce(r ->> 'vehicle_name', '')), '');
    if v_db is null then errs := array_append(errs, 'FLEET_IMPORT_DB_REQUIRED');
    elsif lower(v_db) = any(seen) then errs := array_append(errs, 'FLEET_IMPORT_DUP_IN_FILE'); end if;
    seen := array_append(seen, lower(coalesce(v_db, '')));

    -- التصنيف
    t := app.fleet_norm_text(r ->> 'vehicle_category');
    v_cat := case
      when t in ('compactor_small', 'كابسه صغيره', 'كابسه صغيرة', 'كابسة صغيرة') then 'compactor_small'
      when t in ('compactor_large', 'كابسه كبيره', 'كابسة كبيرة') then 'compactor_large'
      when t like 'كابس%' then 'compactor_large'
      when t in ('truck', 'كميون', 'شاحنه', 'لوري') then 'truck'
      when t in ('shovel', 'شفل', 'شفل كبير', 'شفل صغير') then 'shovel'
      when t in ('tipper', 'قلاب') then 'tipper'
      when t in ('tanker', 'تنكر', 'صهريج', 'حوضيه') then 'tanker'
      when t in ('sweeper', 'كناسه', 'مكنسه') then 'sweeper'
      when t in ('strat', 'استرات', 'سترات') then 'strat'
      when t = '' then 'other'
      else null end;
    if v_cat is null then warns := array_append(warns, 'FLEET_IMPORT_CATEGORY_UNKNOWN'); v_cat := 'other'; end if;
    if v_name is null then
      if v_db is not null then v_name := (case v_cat when 'compactor_small' then 'كابسة صغيرة' when 'compactor_large' then 'كابسة كبيرة' when 'truck' then 'كميون' when 'shovel' then 'شفل' when 'tipper' then 'قلاب' when 'tanker' then 'تنكر' when 'sweeper' then 'كناسة' when 'strat' then 'استرات' else 'آلية' end) || ' ' || v_db; warns := array_append(warns, 'FLEET_IMPORT_NAME_GENERATED'); end if;
    end if;

    -- اللوحة والشاصي
    v_plate := nullif(trim(coalesce(r ->> 'plate_number', '')), '');
    if v_plate is null and v_db is not null then v_plate := 'بلا-لوحة-' || v_db; warns := array_append(warns, 'FLEET_IMPORT_PLATE_PLACEHOLDER'); end if;
    v_chassis := nullif(trim(coalesce(r ->> 'chassis_number', '')), '');
    if v_chassis is null and v_db is not null then v_chassis := 'بلا-شاصي-' || v_db; warns := array_append(warns, 'FLEET_IMPORT_CHASSIS_PLACEHOLDER'); end if;

    -- المنطقة والشفت
    v_sector := app.fleet_resolve_sector(coalesce(nullif(trim(coalesce(r ->> 'area', '')), ''), r ->> 'sector_id'));
    if v_sector is null then errs := array_append(errs, 'FLEET_IMPORT_AREA_UNKNOWN'); end if;
    t := app.fleet_norm_text(r ->> 'shift');
    v_shift := case when t in ('', 'morning', 'صباحي', 'صباحيه', 'الصباحيه', 'صباح') then 'morning' when t in ('evening', 'مسائي', 'مسائيه', 'المسائيه', 'مساء', 'عصر') then 'evening' when t in ('night', 'ليلي', 'ليليه', 'الليليه', 'ليل') then 'night' else null end;
    if v_shift is null then errs := array_append(errs, 'FLEET_IMPORT_SHIFT_INVALID'); end if;

    -- الملكية
    t := app.fleet_norm_text(r ->> 'ownership_type');
    v_own := case when t in ('', 'owned', 'ذاتيه', 'اليه ذاتيه', 'مملوكه', 'ملك', 'ذاتي') then 'owned' when t in ('rented', 'مؤجره', 'موجره', 'اليه مؤجره', 'ايجار', 'مستأجره', 'مستاجره') then 'rented' else null end;
    if v_own is null then errs := array_append(errs, 'FLEET_IMPORT_OWNERSHIP_INVALID'); end if;
    v_lessor := nullif(trim(coalesce(r ->> 'lessor_name', '')), '');
    if v_own = 'rented' and coalesce(length(v_lessor), 0) < 2 then errs := array_append(errs, 'GARAGE_LESSOR_REQUIRED'); end if;
    begin perform (r ->> 'rental_start_date')::date; perform (r ->> 'rental_end_date')::date; exception when others then errs := array_append(errs, 'FLEET_IMPORT_DATE_INVALID'); end;
    begin v_year := nullif(trim(coalesce(r ->> 'model_year', '')), '')::smallint; if v_year is not null and (v_year < 1950 or v_year > 2100) then errs := array_append(errs, 'FLEET_IMPORT_YEAR_INVALID'); end if; exception when others then errs := array_append(errs, 'FLEET_IMPORT_YEAR_INVALID'); end;

    -- السائق
    v_driver := nullif(trim(coalesce(r ->> 'driver', '')), '');
    e := app.fleet_resolve_driver(coalesce(nullif(trim(coalesce(r ->> 'driver_employee_number', '')), ''), v_driver));
    if e.id is null and v_driver is not null then e := app.fleet_resolve_driver(v_driver); end if;
    if e.id is null then
      if v_driver is null then v_driver := 'غير مسنَد'; warns := array_append(warns, 'FLEET_IMPORT_DRIVER_MISSING'); else warns := array_append(warns, 'FLEET_IMPORT_DRIVER_NOT_LINKED'); end if;
    else v_driver := e.full_name; end if;

    if v_db is not null then select * into existing from public.garage_vehicles where lower(trim(db_number)) = lower(v_db); end if;
    if existing.id is not null then
      if existing.archived_at is not null then errs := array_append(errs, 'FLEET_IMPORT_DB_ARCHIVED');
      elsif not p_update_existing then v_action := 'skipped'; warns := array_append(warns, 'FLEET_IMPORT_EXISTS_SKIPPED');
      else v_action := 'updated'; end if;
    elsif cardinality(errs) = 0 then v_action := 'inserted'; end if;

    if cardinality(errs) = 0 and not p_dry_run and v_action <> 'skipped' then
      begin
        if v_action = 'inserted' then
          insert into public.garage_vehicles (vehicle_name, db_number, plate_number, chassis_number, image_path, shift, driver_name, driver_employee_id, sector_id, created_by, vehicle_category, ownership_type, lessor_name, rental_contract_no, rental_start_date, rental_end_date, model_year, vehicle_color, specifications)
          values (v_name, v_db, v_plate, v_chassis, 'import/no-photo', v_shift, v_driver, e.id, v_sector, u, v_cat, v_own,
                  case when v_own = 'rented' then v_lessor end, case when v_own = 'rented' then nullif(trim(coalesce(r ->> 'rental_contract_no', '')), '') end,
                  case when v_own = 'rented' then (r ->> 'rental_start_date')::date end, case when v_own = 'rented' then (r ->> 'rental_end_date')::date end,
                  v_year, nullif(trim(coalesce(r ->> 'vehicle_color', '')), ''), nullif(trim(coalesce(r ->> 'specifications', '')), ''))
          returning id into v_id;
          if e.id is not null then
            insert into public.garage_driver_assignments (vehicle_id, driver_name, driver_employee_id, shift, sector_id, assigned_by, change_reason) values (v_id, e.full_name, e.id, v_shift, v_sector, u, 'استرداد من Excel');
          end if;
          warns := array_append(warns, 'FLEET_IMPORT_PHOTO_MISSING');
        else
          v_id := existing.id;
          update public.garage_vehicles set vehicle_name = v_name,
            plate_number = case when (r ->> 'plate_number') is not null and trim(r ->> 'plate_number') <> '' then v_plate else plate_number end,
            chassis_number = case when (r ->> 'chassis_number') is not null and trim(r ->> 'chassis_number') <> '' then v_chassis else chassis_number end,
            sector_id = v_sector, shift = v_shift, vehicle_category = v_cat, ownership_type = v_own,
            lessor_name = case when v_own = 'rented' then v_lessor end, rental_contract_no = case when v_own = 'rented' then nullif(trim(coalesce(r ->> 'rental_contract_no', '')), '') end,
            rental_start_date = case when v_own = 'rented' then (r ->> 'rental_start_date')::date end, rental_end_date = case when v_own = 'rented' then (r ->> 'rental_end_date')::date end,
            model_year = coalesce(v_year, model_year), vehicle_color = coalesce(nullif(trim(coalesce(r ->> 'vehicle_color', '')), ''), vehicle_color), specifications = coalesce(nullif(trim(coalesce(r ->> 'specifications', '')), ''), specifications),
            driver_name = case when e.id is not null then e.full_name else driver_name end, driver_employee_id = coalesce(e.id, driver_employee_id), updated_at = now()
          where id = existing.id;
          if e.id is not null and (existing.driver_employee_id is distinct from e.id or existing.shift <> v_shift or existing.sector_id <> v_sector) then
            if not exists (select 1 from public.garage_departures d where d.vehicle_id = existing.id and d.returned_at is null) then
              update public.garage_driver_assignments set ends_at = now(), change_reason = 'استرداد من Excel' where vehicle_id = existing.id and ends_at is null;
              insert into public.garage_driver_assignments (vehicle_id, driver_name, driver_employee_id, shift, sector_id, assigned_by, change_reason) values (existing.id, e.full_name, e.id, v_shift, v_sector, u, 'استرداد من Excel');
            else warns := array_append(warns, 'FLEET_IMPORT_VEHICLE_IN_FIELD'); end if;
          end if;
        end if;
      exception when unique_violation then errs := array_append(errs, 'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE'); v_action := 'skipped';
        when others then errs := array_append(errs, sqlerrm); v_action := 'skipped';
      end;
    end if;
    if cardinality(errs) > 0 then v_action := 'skipped'; end if;

    results := results || jsonb_build_object('row', i, 'db_number', v_db, 'vehicle_name', v_name, 'area', (select name from public.sectors where id = v_sector), 'driver', v_driver, 'driver_linked', e.id is not null,
      'action', v_action, 'ok', cardinality(errs) = 0, 'id', v_id, 'errors', to_jsonb(errs), 'warnings', to_jsonb(warns));
  end loop;

  if not p_dry_run then
    insert into public.notifications (user_id, title, body, type, category, priority, link, dedupe_key)
    select n.user_id, 'استرداد قاعدة بيانات الآليات من Excel', app.manager_display_name(u) || ' · مُدرج ' || (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'inserted') || ' · محدَّث ' || (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'updated'), 'info', 'system', 'normal', '/ops-room/vehicles-database', 'fleet_import:' || now()::text || ':' || n.user_id::text
    from unnest(app.ops_room_users()) as n(user_id) where n.user_id <> u
    on conflict do nothing;
  end if;

  return jsonb_build_object('dry_run', p_dry_run, 'total', i,
    'inserted', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'inserted'),
    'updated', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'updated'),
    'skipped', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'skipped'),
    'failed', (select count(*) from jsonb_array_elements(results) x where not (x ->> 'ok')::boolean),
    'rows', results);
end$$;
revoke all on function public.fleet_vehicles_import(jsonb, boolean, boolean) from public, anon;
grant execute on function public.fleet_vehicles_import(jsonb, boolean, boolean) to authenticated;
