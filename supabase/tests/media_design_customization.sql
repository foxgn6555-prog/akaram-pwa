-- تخصيص المصمم: سحب وإفلات (نقل/ترتيب)، أبعاد الصور، ألوان القالب، وملخص صفحة الجدول
do $$
declare
  mgr uuid := '00000000-0000-0000-0000-000000000151';
  media_u uuid := '00000000-0000-0000-0000-000000000152';
  v_sub public.media_submissions;
  v_pid1 uuid;
  v_pid2 uuid;
  d public.media_designs;
  row1 uuid;
  row2 uuid;
begin
  insert into auth.users (id, email) values (mgr, 'custom-mgr@akram.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (mgr, 'department_manager')
    on conflict (user_id, role) do nothing;
  insert into public.manager_profiles (user_id, sectors)
  values (mgr, array[1]::smallint[])
    on conflict (user_id) do update set sectors = array[1]::smallint[];
  insert into auth.users (id, email) values (media_u, 'custom-officer@akram.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (media_u, 'media_officer')
    on conflict (user_id, role) do nothing;

  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', mgr::text, false);
  select * into v_sub from public.media_send_photos(
    'street', 'شارع التخصيص', null, null,
    jsonb_build_array(
      jsonb_build_object('storage_path', mgr::text || '/c-1.jpg', 'caption', ''),
      jsonb_build_object('storage_path', mgr::text || '/c-2.jpg', 'caption', '')));
  select id into v_pid1 from public.media_submission_photos where submission_id = v_sub.id order by sort_order limit 1;
  select id into v_pid2 from public.media_submission_photos where submission_id = v_sub.id order by sort_order offset 1 limit 1;

  perform set_config('request.jwt.claim.sub', media_u::text, false);
  select * into d from public.media_design_create(
    'karrada', 'first_half', 'تصميم التخصيص', null,
    jsonb_build_array(
      jsonb_build_object('photo_id', v_pid1::text, 'work_type', 'كنس الشوارع', 'caption', ''),
      jsonb_build_object('photo_id', v_pid2::text, 'work_type', 'كنس الشوارع', 'caption', '')));
  select id into row1 from public.media_design_photos where design_id = d.id order by sort_order limit 1;
  select id into row2 from public.media_design_photos where design_id = d.id order by sort_order offset 1 limit 1;

  -- سحب وإفلات: نقل الصورة الثانية لنوع عمل آخر بترتيب جديد
  perform public.media_design_photos_reorder(
    d.id,
    jsonb_build_array(
      jsonb_build_object('row_id', row1::text, 'work_type', 'كنس الشوارع', 'sort_order', 1),
      jsonb_build_object('row_id', row2::text, 'work_type', 'غسل المدارس', 'sort_order', 1)));
  if (select work_type from public.media_design_photos where id = row2) <> 'غسل المدارس' then
    raise exception 'REORDER MOVE FAIL';
  end if;
  if (select count(*) from public.media_design_photos where design_id = d.id and work_type = 'غسل المدارس') <> 1 then
    raise exception 'REORDER COUNT FAIL';
  end if;

  -- أبعاد الصورة داخل القالب
  perform public.media_design_report_save(
    d.id, null,
    jsonb_build_array(jsonb_build_object('row_id', row1::text, 'text', 'كنس شارع المستنك', 'fit', 'cover', 'zoom', '2')));
  if (select display_fit || ':' || display_zoom::text from public.media_design_photos where id = row1) <> 'cover:2' then
    raise exception 'FIT/ZOOM FAIL';
  end if;

  -- fit غير صالح يُرفض
  begin
    perform public.media_design_report_save(
      d.id, null,
      jsonb_build_array(jsonb_build_object('row_id', row1::text, 'text', '', 'fit', 'stretch', 'zoom', null)));
    raise exception 'FIT INVALID FAIL';
  exception
    when others then
      if position('MEDIA_PHOTO_FIT_INVALID' in sqlerrm) = 0 then raise exception 'unexpected %', sqlerrm; end if;
  end;
  -- تقريب خارج المدى يُرفض
  begin
    perform public.media_design_report_save(
      d.id, null,
      jsonb_build_array(jsonb_build_object('row_id', row1::text, 'text', '', 'fit', null, 'zoom', '5')));
    raise exception 'ZOOM INVALID FAIL';
  exception
    when others then
      if position('MEDIA_PHOTO_ZOOM_INVALID' in sqlerrm) = 0 then raise exception 'unexpected %', sqlerrm; end if;
  end;

  -- ملخص صفحة الجدول والألوان يُحفظان على التصميم
  perform public.media_design_report_save(
    d.id, null, null,
    jsonb_build_object('companyName', 'شركة جزيرة الاكارم وفيرست ترايد', 'dateValue', 'من 1 الى 14 اب 2026',
                       'rows', jsonb_build_array(jsonb_build_object('t', '1', 'work', 'كنس الشوارع'))),
    jsonb_build_object('barFrom', '#ffffff', 'barTo', '#000000', 'border', '#123456', 'barText', '#111111'));
  if (select summary->>'dateValue' from public.media_designs where id = d.id) <> 'من 1 الى 14 اب 2026' then
    raise exception 'SUMMARY FAIL';
  end if;
  if (select template_colors->>'border' from public.media_designs where id = d.id) <> '#123456' then
    raise exception 'COLORS FAIL';
  end if;
  -- نمط القوالب والخط يُحفظ على التصميم
  perform public.media_design_report_save(
    d.id, null, null, null, null,
    jsonb_build_object('photoLayout', 'mosaic', 'sheetStyle', 'double', 'summaryTheme', 'green', 'font', 'amiri'));
  if (select (template_style->>'photoLayout') || ':' || (template_style->>'font')
      from public.media_designs where id = d.id) <> 'mosaic:amiri' then
    raise exception 'STYLE FAIL';
  end if;

  -- ملخص بصيغة غير كائن يُرفض
  begin
    perform public.media_design_report_save(d.id, null, null, '[]'::jsonb, null);
    raise exception 'SUMMARY TYPE FAIL';
  exception
    when others then
      if position('MEDIA_REPORT_PAYLOAD_INVALID' in sqlerrm) = 0 then raise exception 'unexpected %', sqlerrm; end if;
  end;

  -- تنظيف
  reset role;
  delete from public.media_design_photos where design_id = d.id;
  delete from public.media_design_sheets where design_id = d.id;
  delete from public.media_designs where id = d.id;
  delete from public.media_submission_photos where submission_id = v_sub.id;
  delete from public.media_submissions where id = v_sub.id;
  delete from public.manager_profiles where user_id = mgr;
  delete from public.user_roles where user_id in (mgr, media_u);
  delete from auth.users where id in (mgr, media_u);
  raise notice '✅ سحب وإفلات وأبعاد الصور وألوان القالب وملخص الجدول محفوظة ومقيّدة';
end $$;
