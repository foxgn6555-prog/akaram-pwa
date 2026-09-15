-- تحرير تقرير التصميم: ورقات النص لكل نوع عمل + العبارات فوق الصور تُحفظ في القاعدة
do $$
declare
  mgr uuid := '00000000-0000-0000-0000-000000000141';
  media_u uuid := '00000000-0000-0000-0000-000000000142';
  v_sub public.media_submissions;
  v_pid1 uuid;
  v_pid2 uuid;
  d public.media_designs;
  row1 uuid;
  row2 uuid;
  v_text text;
begin
  insert into auth.users (id, email) values (mgr, 'report-edit-mgr@akram.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (mgr, 'department_manager')
    on conflict (user_id, role) do nothing;
  insert into public.manager_profiles (user_id, sectors)
  values (mgr, array[1]::smallint[])
    on conflict (user_id) do update set sectors = array[1]::smallint[];
  insert into auth.users (id, email) values (media_u, 'report-edit-officer@akram.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (media_u, 'media_officer')
    on conflict (user_id, role) do nothing;

  -- مسؤول القسم يرسل صورتين ليبنِيَ الإعلام تصميماً منهما
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', mgr::text, false);
  select * into v_sub from public.media_send_photos(
    'street', 'شارع التقرير', null, null,
    jsonb_build_array(
      jsonb_build_object('storage_path', mgr::text || '/r-1.jpg', 'caption', 'كنس شارع'),
      jsonb_build_object('storage_path', mgr::text || '/r-2.jpg', 'caption', '')));
  select id into v_pid1 from public.media_submission_photos where submission_id = v_sub.id order by sort_order limit 1;
  select id into v_pid2 from public.media_submission_photos where submission_id = v_sub.id order by sort_order offset 1 limit 1;

  -- مسؤول الإعلام ينشئ التصميم ويحفظ تحرير التقرير
  perform set_config('request.jwt.claim.sub', media_u::text, false);
  select * into d from public.media_design_create(
    'karrada', 'first_half', 'تقرير تحرير النصوص', null,
    jsonb_build_array(
      jsonb_build_object('photo_id', v_pid1::text, 'work_type', 'كنس الشوارع', 'caption', 'كنس شارع'),
      jsonb_build_object('photo_id', v_pid2::text, 'work_type', 'كنس الشوارع', 'caption', '')));
  select id into row1 from public.media_design_photos where design_id = d.id order by sort_order limit 1;
  select id into row2 from public.media_design_photos where design_id = d.id order by sort_order offset 1 limit 1;

  perform public.media_design_report_save(
    d.id,
    jsonb_build_array(jsonb_build_object('work_type', 'كنس الشوارع', 'text', 'أعمال كنس الشوارع الجهد البشري /توزيع العمال')),
    jsonb_build_array(jsonb_build_object('row_id', row1::text, 'text', 'كنس شارع المستنك')));
  -- تحديث ثانٍ لنفس الورقة (upsert): النص الأحدث هو المعتمد
  perform public.media_design_report_save(
    d.id,
    jsonb_build_array(jsonb_build_object('work_type', 'كنس الشوارع', 'text', 'أعمال كنس الشوارع — الجهد البشري')),
    jsonb_build_array(jsonb_build_object('row_id', row2::text, 'text', 'رفع النفايات')));

  select sheet_text into v_text from public.media_design_sheets
   where design_id = d.id and work_type = 'كنس الشوارع';
  if v_text <> 'أعمال كنس الشوارع — الجهد البشري' then
    raise exception 'SHEET UPSERT FAIL: %', v_text;
  end if;
  if (select count(*) from public.media_design_sheets where design_id = d.id) <> 1 then
    raise exception 'SHEET DUP FAIL';
  end if;
  if (select report_caption from public.media_design_photos where id = row1) <> 'كنس شارع المستنك'
     or (select report_caption from public.media_design_photos where id = row2) <> 'رفع النفايات' then
    raise exception 'CAPTION SAVE FAIL';
  end if;
  if (select count(*) from public.media_design_sheets_list(d.id)) <> 1 then
    raise exception 'SHEETS LIST FAIL';
  end if;

  -- نص أطول من الحد يُرفض
  begin
    perform public.media_design_report_save(
      d.id,
      jsonb_build_array(jsonb_build_object('work_type', 'كنس الشوارع', 'text', repeat('ط', 301))),
      null);
    raise exception 'LENGTH FAIL: accepted';
  exception
    when others then
      if position('MEDIA_REPORT_TEXT_TOO_LONG' in sqlerrm) = 0 then
        raise exception 'unexpected %', sqlerrm;
      end if;
  end;

  -- مسؤول القسم ممنوع من حفظ تحرير التقرير
  perform set_config('request.jwt.claim.sub', mgr::text, false);
  begin
    perform public.media_design_report_save(d.id, null, null);
    raise exception 'FORBIDDEN FAIL: manager saved';
  exception
    when others then
      if position('MEDIA_FORBIDDEN' in sqlerrm) = 0 then
        raise exception 'unexpected %', sqlerrm;
      end if;
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
  raise notice '✅ تحرير تقرير التصميم: الورقات upsert والعبارات فوق الصور محفوظة والصلاحيات معزولة';
end $$;
