-- اختبار 00165: أنواع التقرير يومي/أسبوعي — النطاقات، القيود، الإنشاء والتحديث. مستقل (بادئة fc).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('fc000000-0000-0000-0000-000000000001', 'dm-p@t.iq'), ('fc000000-0000-0000-0000-000000000003', 'media-p@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fc000000-0000-0000-0000-000000000001', 'department_manager'), ('fc000000-0000-0000-0000-000000000003', 'media_officer')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('fc000000-0000-0000-0000-000000000001', 'morning', '{4}') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ T1 · النطاقات: يومي = اليوم نفسه، أسبوعي = السبت→الجمعة، القديمة لم تتغير ═══
do $$
declare s date; e date;
begin
  -- 2026-10-01 خميس → الأسبوع 2026-09-26 (سبت) … 2026-10-02 (جمعة)
  select period_start, period_end into s, e from app.media_period_range('weekly', '2026-10-01');
  if s <> '2026-09-26' or e <> '2026-10-02' then raise exception 'weekly thu wrong: % %', s, e; end if;
  select period_start, period_end into s, e from app.media_period_range('weekly', '2026-09-26'); -- سبت
  if s <> '2026-09-26' or e <> '2026-10-02' then raise exception 'weekly sat wrong: % %', s, e; end if;
  select period_start, period_end into s, e from app.media_period_range('weekly', '2026-10-02'); -- جمعة
  if s <> '2026-09-26' or e <> '2026-10-02' then raise exception 'weekly fri wrong: % %', s, e; end if;
  select period_start, period_end into s, e from app.media_period_range('weekly', '2026-09-27'); -- أحد
  if s <> '2026-09-26' or e <> '2026-10-02' then raise exception 'weekly sun wrong: % %', s, e; end if;
  select period_start, period_end into s, e from app.media_period_range('daily', '2026-10-01');
  if s <> '2026-10-01' or e <> '2026-10-01' then raise exception 'daily wrong: % %', s, e; end if;
  select period_start, period_end into s, e from app.media_period_range('daily');
  if s <> (now() at time zone 'Asia/Baghdad')::date or e <> s then raise exception 'daily today wrong: % %', s, e; end if;
  select period_start, period_end into s, e from app.media_period_range('first_half', '2026-10-20');
  if s <> '2026-10-01' or e <> '2026-10-14' then raise exception 'first_half wrong: % %', s, e; end if;
  select period_start, period_end into s, e from app.media_period_range('second_half', '2026-10-03');
  if s <> '2026-10-15' or e <> '2026-10-31' then raise exception 'second_half wrong: % %', s, e; end if;
  select period_start, period_end into s, e from app.media_period_range('monthly', '2026-02-10');
  if s <> '2026-02-01' or e <> '2026-02-28' then raise exception 'monthly wrong: % %', s, e; end if;
  raise notice 'T1 OK';
end $$;

-- ═══ T2 · إنشاء تصميم يومي/أسبوعي وتحديثه بين الأنواع، ورفض نوع مجهول ═══
do $$
declare u uuid := 'fc000000-0000-0000-0000-000000000001'; m uuid := 'fc000000-0000-0000-0000-000000000003';
  sub public.media_submissions; d public.media_designs; ph jsonb; today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  perform pg_temp.as_user(u);
  sub := public.media_send_photos('street', 'شارع الرياض 99', null, null,
    (select jsonb_agg(jsonb_build_object('storage_path', u::text || '/q' || g || '.jpg', 'caption', '')) from generate_series(1, 2) g), null);
  perform pg_temp.as_user(m);
  select jsonb_agg(jsonb_build_object('photo_id', id, 'work_type', 'تنظيف الشوارع')) into ph from public.media_submission_photos where submission_id = sub.id;
  d := public.media_design_create('karrada', 'daily', 'تقرير يومي', null, ph);
  if d.period_type <> 'daily' or d.period_start <> today or d.period_end <> today then raise exception 'daily design wrong: %', d; end if;
  d := public.media_design_update(d.id, 'تقرير أسبوعي', 'weekly', null);
  if d.period_type <> 'weekly' or d.period_end - d.period_start <> 6 or extract(isodow from d.period_start) <> 6 then raise exception 'weekly design wrong: %', d; end if;
  if today < d.period_start or today > d.period_end then raise exception 'weekly range must contain today: %', d; end if;
  d := public.media_design_update(d.id, 'تقرير نصف شهري', 'first_half', null);
  if d.period_type <> 'first_half' then raise exception 'back to first_half failed'; end if;
  perform pg_temp.expect_error(format($q$ select public.media_design_create('karrada', 'yearly', 'x y', null, %L::jsonb) $q$, ph), 'MEDIA_DESIGN_INPUT_INVALID');
  perform pg_temp.expect_error(format($q$ select public.media_design_update(%L, 'x y', 'yearly', null) $q$, d.id), 'MEDIA_DESIGN_INPUT_INVALID');
  -- القوالب تقبل النوعين الجديدين
  insert into public.media_design_templates (title, period_type, created_by) values ('قالب يومي', 'daily', m), ('قالب أسبوعي', 'weekly', m);
  perform pg_temp.expect_error($q$ insert into public.media_design_templates (title, period_type) values ('قالب', 'yearly') $q$, 'period_type_check');
  raise notice 'T2 OK';
end $$;
