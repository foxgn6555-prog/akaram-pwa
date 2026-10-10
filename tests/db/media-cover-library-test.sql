-- اختبار 00199: مكتبة الغلافات — إضافة/تكرار/تحديث/أرشفة/عدّاد استخدام/صلاحيات. مستقل (بادئة fc).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('fc000000-0000-0000-0000-000000000001', 'dm-c@t.iq'), ('fc000000-0000-0000-0000-000000000003', 'media-c@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fc000000-0000-0000-0000-000000000001', 'department_manager'), ('fc000000-0000-0000-0000-000000000003', 'media_officer')
on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare u uuid := 'fc000000-0000-0000-0000-000000000001'; m uuid := 'fc000000-0000-0000-0000-000000000003';
  c1 public.media_covers; c2 public.media_covers; c3 public.media_covers; n integer; ids uuid[];
begin
  -- T0 · غير الإعلامي ممنوع
  perform pg_temp.as_user(u);
  perform pg_temp.expect_error($q$ select public.media_cover_add('غلاف', 'media-officer/c.jpg') $q$, 'MEDIA_FORBIDDEN');
  if (select count(*) from public.media_covers_list()) <> 0 then raise exception 'T0 list leaked'; end if;

  perform pg_temp.as_user(m);
  -- T1 · إضافة مع تحقق المدخلات
  perform pg_temp.expect_error($q$ select public.media_cover_add('x', 'media-officer/c.jpg') $q$, 'MEDIA_COVER_INPUT_INVALID');
  perform pg_temp.expect_error($q$ select public.media_cover_add('غلاف يومي', 'media-officer/c.jpg', 'mars') $q$, 'MEDIA_COVER_INPUT_INVALID');
  perform pg_temp.expect_error($q$ select public.media_cover_add('غلاف يومي', 'media-officer/c.jpg', null, 'yearly') $q$, 'MEDIA_COVER_INPUT_INVALID');
  c1 := public.media_cover_add('غلاف يومي الكرادة', 'media-officer/cover-1.jpg', 'karrada', 'daily', 'ليلي');
  c2 := public.media_cover_add('غلاف شهري', 'media-officer/cover-2.jpg');
  if c1.sector_parent <> 'karrada' or c1.period_type <> 'daily' or c1.tags <> 'ليلي' or c1.use_count <> 0 or c1.status <> 'active' then
    raise exception 'T1 wrong %', c1; end if;
  if c2.sector_parent is not null or c2.period_type is not null then raise exception 'T1b wrong %', c2; end if;

  -- T2 · نفس الملف مرتين ⇒ نفس السجل (بلا تكرار) مع تحديث العنوان
  c3 := public.media_cover_add('غلاف يومي (محدّث)', 'media-officer/cover-1.jpg');
  if c3.id <> c1.id or c3.title <> 'غلاف يومي (محدّث)' then raise exception 'T2 duplicated %', c3; end if;
  if (select count(*) from public.media_covers) <> 2 then raise exception 'T2 count'; end if;

  -- T3 · عدّاد الاستخدام والترتيب (الأكثر استخداماً أولاً)
  n := public.media_cover_touch(c2.id); n := public.media_cover_touch(c2.id);
  if n <> 2 then raise exception 'T3 touch %', n; end if;
  select array_agg(id order by ord) into ids from (select id, row_number() over () ord from public.media_covers_list()) x;
  if ids[1] <> c2.id then raise exception 'T3 order'; end if;

  -- T4 · تحديث البيانات الوصفية
  c3 := public.media_cover_update(c2.id, 'غلاف شهري الزعفرانية', 'zaafaraniya', 'monthly', 'رسمي');
  if c3.sector_parent <> 'zaafaraniya' or c3.period_type <> 'monthly' or c3.tags <> 'رسمي' then raise exception 'T4 %', c3; end if;
  perform pg_temp.expect_error(format($q$ select public.media_cover_update('%s', 'x', null, null, '') $q$, c2.id), 'MEDIA_COVER_INPUT_INVALID');
  perform pg_temp.expect_error($q$ select public.media_cover_update(gen_random_uuid(), 'عنوان', null, null, '') $q$, 'MEDIA_COVER_NOT_FOUND');

  -- T5 · أرشفة: تختفي من القائمة الافتراضية، تبقى مع p_include_archived، ولا تُلمس
  c3 := public.media_cover_set_status(c1.id, 'archived');
  if (select count(*) from public.media_covers_list()) <> 1 then raise exception 'T5 archived listed'; end if;
  if (select count(*) from public.media_covers_list(true)) <> 2 then raise exception 'T5 include archived'; end if;
  perform pg_temp.expect_error(format($q$ select public.media_cover_touch('%s') $q$, c1.id), 'MEDIA_COVER_NOT_FOUND');
  perform pg_temp.expect_error(format($q$ select public.media_cover_set_status('%s', 'deleted') $q$, c1.id), 'MEDIA_COVER_INPUT_INVALID');

  -- T6 · إعادة إضافة ملف مؤرشف تعيد تفعيله
  c3 := public.media_cover_add('غلاف يومي عاد', 'media-officer/cover-1.jpg');
  if c3.id <> c1.id or c3.status <> 'active' then raise exception 'T6 %', c3; end if;
  if (select count(*) from public.media_covers_list()) <> 2 then raise exception 'T6 list'; end if;

  raise notice 'media-cover-library-test: ALL OK';
end $$;
