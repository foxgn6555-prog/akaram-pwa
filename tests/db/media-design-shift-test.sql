-- اختبار 00200: شفت التصميم + وسم شفت الغلاف. مستقل (بادئة fe).
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
  sub public.media_submissions; d public.media_designs; ph jsonb; c public.media_covers; js jsonb;
begin
  perform pg_temp.as_user(u);
  sub := public.media_send_photos('street', 'شارع 52', null, null,
    (select jsonb_agg(jsonb_build_object('storage_path', u::text || '/s' || g || '.jpg', 'caption', '')) from generate_series(1, 2) g), null);
  perform pg_temp.as_user(m);
  select jsonb_agg(jsonb_build_object('photo_id', id, 'work_type', 'كنس')) into ph from public.media_submission_photos where submission_id = sub.id;
  -- T1 · يُنشأ بلا شفت، وغلاف قالب جاهز يُقبل كمسار نصي
  d := public.media_design_create('karrada', 'daily', 'تقرير يومي', 'builtin:c1', ph, '2026-10-07');
  if d.shift is not null or d.cover_image_path <> 'builtin:c1' then raise exception 'T1 %', d; end if;
  -- T2 · ضبط الشفت ليلي ثم صباحي ثم إلغاء؛ قيمة غير صالحة تُرفض؛ يظهر في التفاصيل
  d := public.media_design_set_shift(d.id, 'night');
  if d.shift <> 'night' then raise exception 'T2a'; end if;
  d := public.media_design_set_shift(d.id, 'morning');
  if d.shift <> 'morning' then raise exception 'T2b'; end if;
  perform pg_temp.expect_error(format($q$ select public.media_design_set_shift('%s', 'evening') $q$, d.id), 'MEDIA_DESIGN_INPUT_INVALID');
  select design into js from public.media_design_detail(d.id) limit 1;
  if js->>'shift' <> 'morning' then raise exception 'T2c detail % ', js->>'shift'; end if;
  d := public.media_design_set_shift(d.id, null);
  if d.shift is not null then raise exception 'T2d'; end if;
  -- T3 · غير الإعلامي ممنوع؛ المكتمل مقفل
  perform pg_temp.as_user(u);
  perform pg_temp.expect_error(format($q$ select public.media_design_set_shift('%s', 'night') $q$, d.id), 'MEDIA_FORBIDDEN');
  perform pg_temp.as_user(m);
  d := public.media_design_complete(d.id);
  perform pg_temp.expect_error(format($q$ select public.media_design_set_shift('%s', 'night') $q$, d.id), 'MEDIA_DESIGN_LOCKED');
  -- T4 · وسم شفت الغلاف في المكتبة
  c := public.media_cover_add('غلاف ليلي', 'media-officer/n.jpg', 'karrada', 'daily', '');
  c := public.media_cover_set_shift(c.id, 'night');
  if c.shift <> 'night' then raise exception 'T4'; end if;
  perform pg_temp.expect_error(format($q$ select public.media_cover_set_shift('%s', 'x') $q$, c.id), 'MEDIA_COVER_INPUT_INVALID');
  raise notice 'media-design-shift-test: ALL OK';
end $$;
