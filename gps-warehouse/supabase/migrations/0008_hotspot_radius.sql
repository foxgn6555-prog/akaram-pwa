-- 0008 (00389-ب): نصف قطر البقعة قابل للتغيير + إعادة بناء الأشهر — نسخة ٢ (إصلاح مهلة التنفيذ)
-- يُنفَّذ مرة واحدة على مشروع مستودع GPS (SQL Editor ← New query ← لصق ← Run)
--
-- سبب النسخة الثانية: النسخة الأولى كانت تُعيد البناء كاملاً في نداء واحد عبر الجسر،
-- فتجاوزت مهلة التنفيذ (statement timeout) في PostgREST:
--   GPS_WAREHOUSE_RPC_FAILED: canceling statement due to statement timeout
-- العلاج: (١) رفع مهلة التنفيذ داخل الدالة نفسها، (٢) إتاحة ضبط القيمة وحدها بلا إعادة بناء،
--          (٣) إعادة البناء على مراحل واضحة. لا تغيير في أي جدول أو في محرّك التجميع.
--
-- الاستخدام من لوحة SQL لهذا المستودع (بلا حدود مهلة):
--   select public.wh_hotspots_set_radius(40);                    -- اضبط 40 م وأعد بناء الأشهر
--   select public.wh_hotspots_set_radius(40, null, false);       -- اضبط القيمة فقط بلا إعادة بناء
--   select public.wh_hotspots_set_radius(40, array['2026-10-01','2026-11-01']::date[]);
--   select * from public.wh_hotspots_rebuild_status();           -- كم بقي بلا إسناد وكم بقعة تنتظر التجميع
--
-- ما لا تمسّه: التوقفات الخام، النافذة الشهرية، الأصناف، التكرار، أي جدول آخر.

insert into public.wh_schema_version (version, note)
values (8, '00389 نصف قطر البقع قابل للتغيير + إعادة بناء الأشهر (نسخة ٢: بلا مهلة)')
on conflict (version) do nothing;

-- ⓪ حذف النسخة الأولى (وسيطان) كي لا يبقى تحميل مزدوج يجعل النداء بوسيطين غامضاً
drop function if exists public.wh_hotspots_set_radius(int, date[]);

-- ١) ضبط نصف القطر (+ إعادة بناء اختيارية) — يرفع مهلة التنفيذ لأنه عملية ثقيلة بطبيعتها
create or replace function public.wh_hotspots_set_radius(
  p_radius_m int,
  p_months date[] default null,
  p_rebuild boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.wh_settings; old_r int; months date[]; m date; rebuilt date[] := '{}'; pending int;
begin
  -- إعادة بناء شهر = حذف بقعه + إفراغ إسناد كل توقفاته (حتى ٣٠ ألف صف) — تحتاج مهلة أطول من الافتراضية
  perform set_config('statement_timeout', '600000', true);

  if p_radius_m is null or p_radius_m < 20 or p_radius_m > 500 then
    raise exception 'WH_RADIUS_INVALID' using hint = 'المسموح 20..500 متراً';
  end if;

  select * into s from public.wh_settings where id = 1 for update;
  if s.id is null then raise exception 'WH_SETTINGS_MISSING'; end if;
  old_r := s.hotspot_radius_m;
  update public.wh_settings set hotspot_radius_m = p_radius_m, updated_at = now() where id = 1;

  if p_rebuild then
    months := coalesce(p_months, (
      select array_agg(distinct x order by x) from (
        select month as x from public.wh_hotspots where month >= public.wh_cutoff()
        union select date_trunc('month', (now() at time zone 'Asia/Baghdad'))::date
        union select (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '1 month')::date
      ) q));
    foreach m in array coalesce(months, '{}') loop
      perform public.wh_hotspots_rebuild(m);   -- يمسح بقع الشهر ويُفرغ إسناد توقفاته (التوقفات نفسها تبقى)
      rebuilt := rebuilt || date_trunc('month', m)::date;
    end loop;
  end if;

  select count(*) into pending
  from public.wh_stops
  where class = 'valid' and hotspot_id is null and month >= public.wh_cutoff();

  return jsonb_build_object(
    'old_radius_m', old_r,
    'radius_m', p_radius_m,
    'rebuilt_months', to_jsonb(rebuilt),
    'rebuilt', p_rebuild,
    'stops_pending', pending,
    'note', 'التجميع يعود تلقائياً عبر wh_maintenance كل دقيقة (١٠٠٠ توقف/دقيقة). لا تعِد النسخ إلى المشروع الأول قبل أن يصبح stops_pending صفراً');
end $$;

-- ٢) حالة إعادة البناء — للقراءة فقط، خفيفة، تُستدعى بعد التغيير لمتابعة التقدّم
create or replace function public.wh_hotspots_rebuild_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'radius_m', (select hotspot_radius_m from public.wh_settings where id = 1),
    'cutoff', public.wh_cutoff(),
    'stops_pending', (select count(*) from public.wh_stops where class = 'valid' and hotspot_id is null and month >= public.wh_cutoff()),
    'hotspots_total', (select count(*) from public.wh_hotspots where month >= public.wh_cutoff()),
    'hotspots_dirty', (select count(*) from public.wh_hotspots where month >= public.wh_cutoff() and dirty),
    'by_month', coalesce((
      select jsonb_object_agg(to_char(month, 'YYYY-MM'), jsonb_build_object(
        'hotspots', hotspots, 'dirty', dirty,
        'stops_pending', (select count(*) from public.wh_stops st where st.class = 'valid' and st.hotspot_id is null and st.month = q.month)))
      from (select month, count(*) hotspots, count(*) filter (where dirty) dirty
            from public.wh_hotspots where month >= public.wh_cutoff() group by month) q), '{}'::jsonb),
    'ready_to_copy', (
      (select count(*) from public.wh_stops where class = 'valid' and hotspot_id is null and month >= public.wh_cutoff()) = 0
      and not exists (select 1 from public.wh_hotspots where month >= public.wh_cutoff() and dirty)
    ),
    'checked_at', now()
  )
$$;

-- المالك وحده (مفتاح الخدمة عبر الجسر / لوحة SQL) — لا وصول للمجهول ولا للمستخدم المسجَّل
revoke all on function public.wh_hotspots_set_radius(int, date[], boolean) from public, anon, authenticated;
revoke all on function public.wh_hotspots_rebuild_status() from public, anon, authenticated;
