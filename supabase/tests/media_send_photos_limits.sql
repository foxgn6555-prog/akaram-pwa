-- اختبار حدود إرسال الصور (1..500) وسلامة مسارات التخزين ودورة التصميم
-- «يمكن للمسؤول إرسال ما يريد من 1 إلى 500 صورة» — وما بعدها يُرفض صراحةً
do $$
declare
  mgr uuid := '00000000-0000-0000-0000-000000000131';
  media_u uuid := '00000000-0000-0000-0000-000000000132';
  v_row public.media_submissions;
  d public.media_designs;
  v_pid uuid;
  photos500 jsonb;
  photos501 jsonb;
begin
  insert into auth.users (id, email) values (mgr, 'media-limits-mgr@akram.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (mgr, 'department_manager')
    on conflict (user_id, role) do nothing;
  insert into public.manager_profiles (user_id, sectors)
  values (mgr, array[1]::smallint[])
    on conflict (user_id) do update set sectors = array[1]::smallint[];
  insert into auth.users (id, email) values (media_u, 'media-limits-officer@akram.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (media_u, 'media_officer')
    on conflict (user_id, role) do nothing;

  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', mgr::text, false);

  -- صورة واحدة: تُقبل وعدّادها 1
  select * into v_row from public.media_send_photos(
    'street', 'شارع الاختبار', null, null,
    jsonb_build_array(jsonb_build_object('storage_path', mgr::text || '/t-1.jpg', 'caption', '')));
  if v_row.photo_count <> 1 then raise exception 'LIMIT FAIL: single photo count=%', v_row.photo_count; end if;
  if v_row.sector_parent <> 'karrada' then raise exception 'SECTOR DERIVE FAIL'; end if;

  -- 500 صورة (الحد الأقصى): تُقبل كاملة
  select jsonb_agg(jsonb_build_object(
           'storage_path', mgr::text || '/bulk-' || g || '.jpg', 'caption', 'وصف ' || g))
    into photos500
    from generate_series(1, 500) g;
  select * into v_row from public.media_send_photos(
    'campaign', 'حملة الحد الأقصى', 'كنس الشوارع', null, photos500);
  if v_row.photo_count <> 500 then raise exception 'LIMIT FAIL: 500 count=%', v_row.photo_count; end if;

  -- 501 صورة: تُرفض صراحةً
  select jsonb_agg(jsonb_build_object(
           'storage_path', mgr::text || '/over-' || g || '.jpg', 'caption', ''))
    into photos501
    from generate_series(1, 501) g;
  begin
    perform public.media_send_photos('campaign', 'حملة زائدة', 'كنس الشوارع', null, photos501);
    raise exception 'LIMIT FAIL: 501 accepted';
  exception
    when others then
      if position('MEDIA_PHOTOS_COUNT_INVALID' in sqlerrm) = 0 then
        raise exception 'unexpected %', sqlerrm;
      end if;
  end;

  -- صفر صور: تُرفض
  begin
    perform public.media_send_photos('campaign', 'حملة فارغة', 'كنس الشوارع', null, '[]'::jsonb);
    raise exception 'LIMIT FAIL: 0 accepted';
  exception
    when others then
      if position('MEDIA_PHOTOS_COUNT_INVALID' in sqlerrm) = 0 then
        raise exception 'unexpected %', sqlerrm;
      end if;
  end;

  -- مسار تخزين خارج نطاق المرسل: يُرفض
  begin
    perform public.media_send_photos(
      'street', 'شارع', null, null,
      jsonb_build_array(jsonb_build_object('storage_path', 'other-user/evil.jpg', 'caption', '')));
    raise exception 'PATH FAIL: foreign path accepted';
  exception
    when others then
      if position('MEDIA_PHOTO_PATH_INVALID' in sqlerrm) = 0 then
        raise exception 'unexpected %', sqlerrm;
      end if;
  end;

  -- مسؤول الإعلام: إنشاء تصميم بمصفوفة صور (jsonb array) ثم إضافة صورة
  perform set_config('request.jwt.claim.sub', media_u::text, false);
  select id into v_pid from public.media_submission_photos
   where submission_id = v_row.id limit 1;
  select * into d from public.media_design_create(
    'karrada', 'first_half', 'تصميم اختبار الحدود', null,
    jsonb_build_array(jsonb_build_object('photo_id', v_pid::text, 'work_type', 'كنس الشوارع', 'caption', 'م')));
  if d.photo_count <> 1 then raise exception 'DESIGN CREATE FAIL'; end if;
  select id into v_pid from public.media_submission_photos
   where submission_id = v_row.id and id <> v_pid limit 1;
  select * into d from public.media_design_add_photos(
    d.id,
    jsonb_build_array(jsonb_build_object('photo_id', v_pid::text, 'work_type', 'غسل الشارع', 'caption', '')));
  if d.photo_count <> 2 then raise exception 'DESIGN ADD PHOTOS FAIL'; end if;

  -- تنظيف
  reset role;
  delete from public.media_design_photos where design_id in (
    select id from public.media_designs where created_by = media_u);
  delete from public.media_designs where created_by = media_u;
  delete from public.media_submission_photos where submission_id in (
    select id from public.media_submissions where submitted_by = mgr);
  delete from public.media_submissions where submitted_by = mgr;
  delete from public.manager_profiles where user_id = mgr;
  delete from public.user_roles where user_id in (mgr, media_u);
  delete from auth.users where id in (mgr, media_u);
  raise notice '✅ حدود الصور 1..500 مطبقة، المسارات معزولة بالمرسل، ودورة التصميم تقبل مصفوفات jsonb';
end $$;
