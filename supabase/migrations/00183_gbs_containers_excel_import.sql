-- 00183 · حاويات GBS: استيراد/استرداد من Excel + تصدير كامل (غرفة العمليات فقط)
-- ─────────────────────────────────────────────────────────────────────────
-- • gbs_containers_export(): كل الحاويات بأعمدة جاهزة لملف Excel (وهو نفسه قالب الاستيراد).
-- • gbs_containers_import(p_rows, p_dry_run, p_update_existing):
--   - المعرّف: الرمز (GBS-0001). صف برمز موجود يُحدَّث (استرداد) أو يُتجاوز؛ صف بلا رمز = حاوية جديدة برمز مولَّد.
--   - إلزامي: الوصف/الموقع (label) والإحداثيات (خط العرض والطول) والمنطقة (رقم أو اسم).
--   - الحالة بالعربية: سليمة/متضررة/يجب استبدالها/مفقودة (افتراضي سليمة).
--   - الصور لا تُستورد. المحاكاة لا تكتب شيئاً. أخطاء الصف لا توقف البقية.

create or replace function public.gbs_containers_export()
returns table(code text, label text, latitude float8, longitude float8, status text, sector_id smallint, area_name text, parent_sector text, notes text, has_photo boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','super_admin']) then raise exception 'GBS_FORBIDDEN'; end if;
  return query select c.code, c.label, c.latitude, c.longitude, c.status, c.sector_id, s.name, s.parent_sector, c.notes, c.image_path is not null, c.updated_at
  from public.gbs_containers c join public.sectors s on s.id = c.sector_id order by s.parent_sector, s.id, c.code;
end$$;
revoke all on function public.gbs_containers_export() from public, anon;
grant execute on function public.gbs_containers_export() to authenticated;

create or replace function public.gbs_containers_import(p_rows jsonb, p_dry_run boolean default true, p_update_existing boolean default true)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  u uuid := auth.uid(); r jsonb; i int := 0; results jsonb := '[]'::jsonb; errs text[]; warns text[]; seen text[] := '{}';
  v_code text; v_label text; v_lat float8; v_lng float8; v_status text; v_sector smallint; v_notes text; v_action text; v_id uuid; existing public.gbs_containers; t text;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'GBS_FORBIDDEN'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'GBS_IMPORT_EMPTY'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'GBS_IMPORT_TOO_LARGE'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; errs := '{}'; warns := '{}'; v_action := 'skipped'; v_id := null; existing := null;
    v_code := upper(nullif(trim(coalesce(r ->> 'code', '')), ''));
    if v_code is not null and v_code = any(seen) then errs := array_append(errs, 'GBS_IMPORT_DUP_IN_FILE'); end if;
    if v_code is not null then seen := array_append(seen, v_code); end if;
    v_label := nullif(trim(coalesce(r ->> 'label', '')), '');
    if v_label is null or length(v_label) < 2 then errs := array_append(errs, 'GBS_LABEL_INVALID'); elsif length(v_label) > 120 then v_label := left(v_label, 120); warns := array_append(warns, 'GBS_IMPORT_LABEL_TRUNCATED'); end if;
    -- الإحداثيات: عمودان أو عمود واحد «lat, lng»
    begin
      t := trim(coalesce(r ->> 'coords', ''));
      if t <> '' and (r ->> 'latitude') is null then
        v_lat := split_part(replace(t, '،', ','), ',', 1)::float8; v_lng := split_part(replace(t, '،', ','), ',', 2)::float8;
      else
        v_lat := nullif(trim(coalesce(r ->> 'latitude', '')), '')::float8; v_lng := nullif(trim(coalesce(r ->> 'longitude', '')), '')::float8;
      end if;
    exception when others then v_lat := null; v_lng := null; end;
    if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then errs := array_append(errs, 'GBS_POINT_INVALID');
    elsif v_lat not between 29 and 38 or v_lng not between 38 and 49 then warns := array_append(warns, 'GBS_IMPORT_POINT_OUTSIDE_IRAQ'); end if;
    -- الحالة
    t := app.fleet_norm_text(r ->> 'status');
    v_status := case when t in ('', 'ok', 'سليمه', 'سليم', 'جيده', 'جيد', 'صالحه') then 'ok' when t in ('damaged', 'متضرره', 'متضرر', 'تالفه', 'تالف', 'مكسوره') then 'damaged'
      when t in ('replace', 'يجب استبدالها', 'استبدال', 'تستبدل', 'للاستبدال', 'بحاجه استبدال') then 'replace' when t in ('missing', 'مفقوده', 'مفقود', 'غير موجوده', 'مسروقه') then 'missing' else null end;
    if v_status is null then errs := array_append(errs, 'GBS_STATUS_INVALID'); end if;
    v_sector := app.fleet_resolve_sector(coalesce(nullif(trim(coalesce(r ->> 'area', '')), ''), r ->> 'sector_id'));
    if v_sector is null then errs := array_append(errs, 'GBS_IMPORT_AREA_UNKNOWN'); end if;
    v_notes := nullif(trim(coalesce(r ->> 'notes', '')), ''); if length(coalesce(v_notes, '')) > 500 then v_notes := left(v_notes, 500); warns := array_append(warns, 'GBS_IMPORT_NOTES_TRUNCATED'); end if;

    if v_code is not null then select * into existing from public.gbs_containers where upper(code) = v_code; end if;
    if existing.id is not null then
      if not p_update_existing then warns := array_append(warns, 'GBS_IMPORT_EXISTS_SKIPPED'); else v_action := 'updated'; end if;
    elsif cardinality(errs) = 0 then v_action := 'inserted'; end if;

    if cardinality(errs) = 0 and not p_dry_run and v_action <> 'skipped' then
      begin
        if v_action = 'inserted' then
          if v_code is null then v_code := 'GBS-' || lpad(nextval('public.gbs_container_code_seq')::text, 4, '0'); end if;
          insert into public.gbs_containers (code, label, latitude, longitude, status, sector_id, notes, created_by) values (v_code, v_label, v_lat, v_lng, v_status, v_sector, v_notes, u) returning id into v_id;
        else
          v_id := existing.id;
          update public.gbs_containers set label = v_label, latitude = v_lat, longitude = v_lng, status = v_status, sector_id = v_sector, notes = coalesce(v_notes, notes), updated_at = now() where id = existing.id;
        end if;
      exception when unique_violation then errs := array_append(errs, 'GBS_IMPORT_CODE_DUPLICATE'); v_action := 'skipped';
        when others then errs := array_append(errs, sqlerrm); v_action := 'skipped'; end;
    end if;
    if cardinality(errs) > 0 then v_action := 'skipped'; end if;
    results := results || jsonb_build_object('row', i, 'code', v_code, 'label', v_label, 'area', (select name from public.sectors where id = v_sector), 'status', v_status, 'latitude', v_lat, 'longitude', v_lng,
      'action', v_action, 'ok', cardinality(errs) = 0, 'id', v_id, 'errors', to_jsonb(errs), 'warnings', to_jsonb(warns));
  end loop;

  if not p_dry_run then
    insert into public.notifications (user_id, title, body, type, category, priority, link, dedupe_key)
    select n.user_id, 'استرداد حاويات GBS من Excel', app.manager_display_name(u) || ' · مُدرج ' || (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'inserted') || ' · محدَّث ' || (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'updated'), 'info', 'system', 'normal', '/ops-room/gbs-containers', 'gbs_import:' || now()::text || ':' || n.user_id::text
    from unnest(app.ops_room_users()) as n(user_id) where n.user_id <> u on conflict do nothing;
  end if;
  return jsonb_build_object('dry_run', p_dry_run, 'total', i,
    'inserted', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'inserted'),
    'updated', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'updated'),
    'skipped', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'skipped'),
    'failed', (select count(*) from jsonb_array_elements(results) x where not (x ->> 'ok')::boolean), 'rows', results);
end$$;
revoke all on function public.gbs_containers_import(jsonb, boolean, boolean) from public, anon;
grant execute on function public.gbs_containers_import(jsonb, boolean, boolean) to authenticated;
