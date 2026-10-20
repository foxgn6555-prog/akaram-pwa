-- اختبار 00311: قفل التصميم المكتمل يشمل نصوص التقرير وإعادة الترتيب. مستقل (بادئة fe).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('fe000000-0000-0000-0000-000000000001', 'dm-e@t.iq'), ('fe000000-0000-0000-0000-000000000003', 'media-e@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fe000000-0000-0000-0000-000000000001', 'department_manager'), ('fe000000-0000-0000-0000-000000000003', 'media_officer')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('fe000000-0000-0000-0000-000000000001', 'morning', '{4}') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare u uuid := 'fe000000-0000-0000-0000-000000000001'; m uuid := 'fe000000-0000-0000-0000-000000000003';
  sub public.media_submissions; d public.media_designs; ph jsonb; rid uuid;
begin
  perform pg_temp.as_user(u);
  sub := public.media_send_photos('street', 'شارع القفل', null, null,
    (select jsonb_agg(jsonb_build_object('storage_path', u::text || '/l' || g || '.jpg', 'caption', '')) from generate_series(1, 2) g), null);
  perform pg_temp.as_user(m);
  select jsonb_agg(jsonb_build_object('photo_id', id, 'work_type', 'كنس')) into ph from public.media_submission_photos where submission_id = sub.id;
  d := public.media_design_create('karrada', 'daily', 'تقرير القفل', 'builtin:c1', ph, '2026-10-07');
  select id into rid from public.media_design_photos where design_id = d.id limit 1;
  -- قبل الإكمال: مسموح
  perform public.media_design_report_save(d.id, '[]'::jsonb, '[]'::jsonb, null, null, null);
  perform public.media_design_photos_reorder(d.id, jsonb_build_array(jsonb_build_object('row_id', rid, 'work_type', 'غسل', 'sort_order', 1)));
  d := public.media_design_complete(d.id);
  if d.status <> 'completed' then raise exception 'L0'; end if;
  -- بعد الإكمال: مقفل
  perform pg_temp.expect_error(format($q$ select public.media_design_report_save('%s', '[]'::jsonb, '[]'::jsonb, null, null, null) $q$, d.id), 'MEDIA_DESIGN_LOCKED');
  perform pg_temp.expect_error(format($q$ select public.media_design_photos_reorder('%s', '[{"row_id":"%s","work_type":"x","sort_order":5}]'::jsonb) $q$, d.id, rid), 'MEDIA_DESIGN_LOCKED');
  if (select work_type from public.media_design_photos where id = rid) <> 'غسل' then raise exception 'L1 reorder applied after completion'; end if;
  raise notice 'media completed design lock test ok';
end $$;
