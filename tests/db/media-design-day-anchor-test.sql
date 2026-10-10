-- اختبار 00198: تثبيت يوم التصميم عند التحديث + يوم مرجعي عند الإنشاء + حذف صور دفعة. مستقل (بادئة fd).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('fd000000-0000-0000-0000-000000000001', 'dm-a@t.iq'), ('fd000000-0000-0000-0000-000000000003', 'media-a@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fd000000-0000-0000-0000-000000000001', 'department_manager'), ('fd000000-0000-0000-0000-000000000003', 'media_officer')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('fd000000-0000-0000-0000-000000000001', 'morning', '{4}') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare u uuid := 'fd000000-0000-0000-0000-000000000001'; m uuid := 'fd000000-0000-0000-0000-000000000003';
  sub public.media_submissions; d public.media_designs; ph jsonb; ids uuid[]; n integer;
  today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  perform pg_temp.as_user(u);
  sub := public.media_send_photos('street', 'شارع الرياض 77', null, null,
    (select jsonb_agg(jsonb_build_object('storage_path', u::text || '/a' || g || '.jpg', 'caption', '')) from generate_series(1, 6) g), null);
  perform pg_temp.as_user(m);
  select jsonb_agg(jsonb_build_object('photo_id', x.id, 'work_type', case when x.rn <= 3 then 'كنس' else 'غسل' end)) into ph
    from (select id, row_number() over (order by id) rn from public.media_submission_photos where submission_id = sub.id) x;

  -- T1 · إنشاء يومي بيوم مرجعي صريح (ليس اليوم) ⇒ الفترة = ذلك اليوم
  d := public.media_design_create('karrada', 'daily', 'تقرير يومي 7/10', null, ph, '2026-10-07');
  if d.period_start <> '2026-10-07' or d.period_end <> '2026-10-07' then raise exception 'T1 ref day wrong: % %', d.period_start, d.period_end; end if;
  if d.photo_count <> 6 then raise exception 'T1 count wrong %', d.photo_count; end if;

  -- T2 · تحديث العنوان/الغلاف فقط (نفس النوع، بلا يوم مرجعي) ⇒ التاريخ لا ينزلق إلى اليوم
  d := public.media_design_update(d.id, 'تقرير يومي 7/10 معدّل', 'daily', 'x/cover.jpg');
  if d.period_start <> '2026-10-07' or d.cover_image_path <> 'x/cover.jpg' or d.title <> 'تقرير يومي 7/10 معدّل' then raise exception 'T2 drifted: %', d; end if;

  -- T3 · يوم مرجعي جديد ⇒ يتغير اليوم فقط
  d := public.media_design_update(d.id, d.title, 'daily', d.cover_image_path, '2026-10-08');
  if d.period_start <> '2026-10-08' or d.period_end <> '2026-10-08' then raise exception 'T3 ref day not applied: %', d; end if;

  -- T4 · تغيير النوع بلا يوم مرجعي ⇒ يُحسب من يوم التصميم الحالي (8/10 ⇒ الأسبوع 3/10–9/10) لا من اليوم
  d := public.media_design_update(d.id, d.title, 'weekly', d.cover_image_path);
  if d.period_start <> '2026-10-03' or d.period_end <> '2026-10-09' then raise exception 'T4 weekly from anchor wrong: % %', d.period_start, d.period_end; end if;
  d := public.media_design_update(d.id, d.title, 'first_half', d.cover_image_path);
  if d.period_start <> '2026-10-01' or d.period_end <> '2026-10-14' then raise exception 'T4 first_half wrong: % %', d.period_start, d.period_end; end if;

  -- T5 · إنشاء بلا يوم مرجعي ⇒ اليوم (بغداد) كما في السابق
  d := public.media_design_create('karrada', 'daily', 'تقرير اليوم', null, ph);
  if d.period_start <> today then raise exception 'T5 today wrong %', d.period_start; end if;

  -- T6 · حذف دفعة: كل صور فقرة «كنس» (3) بضغطة ⇒ يبقى 3؛ قائمة فارغة/معرّف غريب مرفوضان؛ ثم حذف الكل ⇒ 0
  select array_agg(id) into ids from public.media_design_photos where design_id = d.id and work_type = 'كنس';
  n := public.media_design_photos_remove(ids);
  if n <> 3 or (select count(*) from public.media_design_photos where design_id = d.id) <> 3 then raise exception 'T6 group remove wrong %', n; end if;
  perform pg_temp.expect_error($q$ select public.media_design_photos_remove('{}'::uuid[]) $q$, 'MEDIA_DESIGN_PHOTOS_INVALID');
  perform pg_temp.expect_error($q$ select public.media_design_photos_remove(array['fd000000-0000-0000-0000-00000000ffff']::uuid[]) $q$, 'MEDIA_DESIGN_PHOTO_NOT_FOUND');
  select array_agg(id) into ids from public.media_design_photos where design_id = d.id;
  n := public.media_design_photos_remove(ids);
  if n <> 0 then raise exception 'T6 remove all wrong %', n; end if;
  if (select photo_count from public.media_designs where id = d.id) <> 0 then raise exception 'T6 photo_count not synced'; end if;

  -- T7 · التصميم المكتمل مقفل أمام الحذف الدفعي
  perform pg_temp.as_user(m);
  d := public.media_design_create('karrada', 'daily', 'تقرير مكتمل', null, ph, '2026-10-05');
  select array_agg(id) into ids from public.media_design_photos where design_id = d.id;
  d := public.media_design_complete(d.id);
  perform pg_temp.expect_error(format($q$ select public.media_design_photos_remove(%L::uuid[]) $q$, ids), 'MEDIA_DESIGN_LOCKED');
  raise notice 'T1-T7 OK';
end $$;

-- T8 · تصميمان لنفس القاطع ونفس اليوم (شفت صباحي + ليلي) مسموحان
do $$
declare m uuid := 'fd000000-0000-0000-0000-000000000003'; ph jsonb; d1 public.media_designs; d2 public.media_designs;
begin
  perform pg_temp.as_user(m);
  select jsonb_agg(jsonb_build_object('photo_id', id, 'work_type', 'كنس')) into ph from (select id from public.media_submission_photos limit 1) x;
  d1 := public.media_design_create('zaafaraniya', 'daily', 'الشفت الصباحي', null, ph, '2026-10-09');
  d2 := public.media_design_create('zaafaraniya', 'daily', 'الشفت الليلي', null, ph, '2026-10-09');
  if d1.id = d2.id or d1.period_start <> d2.period_start then raise exception 'T8 two designs same day failed'; end if;
  raise notice 'T8 OK';
end $$;
