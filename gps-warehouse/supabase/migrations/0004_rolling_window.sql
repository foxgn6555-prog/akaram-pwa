-- 0004 (00382-ب): النافذة الشهرية المتجددة
-- القاعدة (قرار المالك): الشهر المعروض = الشهر السابق فقط؛ الشهر الجاري يُجمَّع يوماً بيوم تلقائياً (يوم الأمس كل ليلة)
-- فيكون جاهزاً صباح اليوم الأول؛ عندها يُمسح الشهر الأقدم بالكامل (مهام، خام، توقفات، ملفات) بلا أثر.
-- الخام يُحذف فور اكتمال حساب توقفات اليوم (raw_retention_days = 0). الأرشيف المضغوط مُلغى (archive_enabled = false)
-- والملفات القديمة تُحذف من التخزين بالدورة التالية.
insert into public.wh_schema_version (version, note) values (4, '00382-ب النافذة الشهرية المتجددة') on conflict (version) do nothing;

alter table public.wh_settings drop constraint if exists wh_settings_raw_retention_days_check;
alter table public.wh_settings alter column raw_retention_days set default 0;
alter table public.wh_settings add constraint wh_settings_raw_retention_days_check check (raw_retention_days between 0 and 31);
alter table public.wh_settings add column if not exists keep_months int not null default 1 check (keep_months between 1 and 12);
alter table public.wh_settings add column if not exists archive_enabled boolean not null default false;
alter table public.wh_settings add column if not exists auto_enqueue boolean not null default true;
alter table public.wh_settings add column if not exists last_rollover_at timestamptz;
alter table public.wh_settings add column if not exists last_rollover jsonb;
update public.wh_settings set raw_retention_days = 0, archive_enabled = false, updated_at = now() where id = 1;

-- حدود النافذة بتوقيت بغداد: المعروض = الشهر السابق، قيد التجميع = الجاري، cutoff = أول يوم يُحتفظ به
create or replace function public.wh_window() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', (now() at time zone 'Asia/Baghdad')::date,
    'collecting_month', date_trunc('month', (now() at time zone 'Asia/Baghdad'))::date,
    'displayed_month', (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '1 month')::date,
    'cutoff', (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - make_interval(months => s.keep_months))::date,
    'keep_months', s.keep_months, 'auto_enqueue', s.auto_enqueue)
  from public.wh_settings s where s.id = 1
$$;
create or replace function public.wh_cutoff() returns date
language sql stable security definer set search_path = public as $$
  select (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - make_interval(months => s.keep_months))::date from public.wh_settings s where s.id = 1
$$;

-- الجدولة اليومية التلقائية: كل يوم ناقص من cutoff حتى الأمس لكل جهاز نشط (on conflict do nothing ⇒ رخيصة وآمنة للتكرار كل دقيقة)
create or replace function public.wh_daily_enqueue() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wh_settings; n int := 0; y date := (now() at time zone 'Asia/Baghdad')::date - 1;
begin
  select * into s from public.wh_settings where id = 1;
  if not s.auto_enqueue then return jsonb_build_object('queued', 0, 'skipped', 'auto_enqueue_off'); end if;
  -- اختصار: إن كان يوم الأمس مجدولاً لكل جهاز نشط فلا حاجة للمسح الكامل (يُستدعى كل دقيقة)
  if not exists (select 1 from public.wh_vehicles v where v.active and v.device_external_id is not null
                 and not exists (select 1 from public.wh_pull_jobs j where j.device_external_id = v.device_external_id and j.day = y)) then
    return jsonb_build_object('queued', 0, 'skipped', 'up_to_date');
  end if;
  with days as (select d::date as day from generate_series(public.wh_cutoff(), y, interval '1 day') d),
  ins as (
    insert into public.wh_pull_jobs (device_external_id, day)
    select v.device_external_id, days.day from public.wh_vehicles v cross join days where v.active and v.device_external_id is not null
    on conflict (device_external_id, day) do nothing
    returning 1)
  select count(*) into n from ins;
  return jsonb_build_object('queued', n, 'from', public.wh_cutoff(), 'to', y);
end $$;

-- التدوير: مسح كل ما قبل cutoff (مهام، خام، توقفات). ملفات الأرشيف تُحذف من التخزين عبر wh_archive_expired ثم تُنسى.
create or replace function public.wh_rollover() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c date := public.wh_cutoff(); n_jobs int; n_raw int; n_stops int; r jsonb;
begin
  delete from public.wh_raw_points where day < c; get diagnostics n_raw = row_count;
  delete from public.wh_stops where day < c; get diagnostics n_stops = row_count;
  delete from public.wh_pull_jobs where day < c; get diagnostics n_jobs = row_count;
  r := jsonb_build_object('cutoff', c, 'jobs', n_jobs, 'raw', n_raw, 'stops', n_stops);
  if n_jobs + n_raw + n_stops > 0 then update public.wh_settings set last_rollover_at = now(), last_rollover = r where id = 1; end if;
  return r;
end $$;

-- الأرشيف المضغوط: لا ملفات جديدة إن كان معطّلاً؛ المنتهي = كل الملفات إن كان معطّلاً، وإلا ما قبل cutoff أو تجاوز مدة الاحتفاظ
create or replace function public.wh_archive_pending(p_limit int default 5) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (select archive_enabled from public.wh_settings where id = 1) then '[]'::jsonb else
  coalesce(jsonb_agg(jsonb_build_object('device_external_id', device_external_id, 'day', day, 'points', points) order by day, device_external_id), '[]'::jsonb) end
  from (select device_external_id, day, points from public.wh_pull_jobs where status = 'done' and archived_at is null and points > 0 order by day, device_external_id limit greatest(1, least(coalesce(p_limit, 5), 50))) x
$$;
create or replace function public.wh_archive_expired(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path) order by f.day), '[]'::jsonb)
  from (select a.id, a.path, a.day from public.wh_archive_files a, public.wh_settings s
        where s.id = 1 and (not s.archive_enabled or a.day < public.wh_cutoff() or a.day < ((now() at time zone 'Asia/Baghdad')::date - (s.archive_retention_months * interval '1 month'))::date)
        order by a.day limit greatest(1, least(coalesce(p_limit, 50), 500))) f
$$;

-- الصيانة (كل دورة): حذف خام الأيام المنجزة (فوراً عند 0)، الجدولة اليومية، التدوير
create or replace function public.wh_maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wh_settings; n int; cutoff date; enq jsonb; roll jsonb;
begin
  select * into s from public.wh_settings where id = 1;
  cutoff := (now() at time zone 'Asia/Baghdad')::date - s.raw_retention_days;
  delete from public.wh_raw_points r where r.day < cutoff and r.device_external_id is not null
    and exists (select 1 from public.wh_pull_jobs j where j.device_external_id = r.device_external_id and j.day = r.day and j.status = 'done');
  get diagnostics n = row_count;
  enq := case when s.paused then jsonb_build_object('queued', 0, 'skipped', 'paused') else public.wh_daily_enqueue() end;
  roll := public.wh_rollover();
  return jsonb_build_object('raw_deleted', n, 'cutoff', cutoff, 'enqueue', enq, 'rollover', roll);
end $$;

-- الجدولة اليدوية لشهر: ممنوعة لما قبل النافذة
create or replace function public.wh_enqueue_month(p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; n int;
begin
  if p_month is null then raise exception 'WH_MONTH_REQUIRED'; end if;
  if m > date_trunc('month', (now() at time zone 'Asia/Baghdad'))::date then raise exception 'WH_MONTH_IN_FUTURE'; end if;
  if m < public.wh_cutoff() then raise exception 'WH_MONTH_EXPIRED'; end if;
  with days as (select d::date as day from generate_series(m, least((m + interval '1 month' - interval '1 day')::date, (now() at time zone 'Asia/Baghdad')::date - 1), interval '1 day') d),
  ins as (
    insert into public.wh_pull_jobs (device_external_id, day)
    select v.device_external_id, days.day from public.wh_vehicles v cross join days where v.active and v.device_external_id is not null
    on conflict (device_external_id, day) do update set status = 'queued', next_try_at = now(), error_code = null, error_message = null
      where public.wh_pull_jobs.status = 'failed'
    returning 1
  ) select count(*) into n from ins;
  return jsonb_build_object('month', m, 'queued', n, 'total', (select count(*) from public.wh_pull_jobs where day >= m and day < (m + interval '1 month')::date));
end $$;

-- التقدّم: دور كل شهر (معروض/قيد التجميع/خارج النافذة) + النافذة
create or replace function public.wh_progress() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'window', public.wh_window(),
    'months', coalesce((select jsonb_agg(m order by m ->> 'month' desc) from (
        select jsonb_build_object('month', to_char(date_trunc('month', day), 'YYYY-MM'),
          'role', case when date_trunc('month', day)::date = date_trunc('month', (now() at time zone 'Asia/Baghdad'))::date then 'collecting'
                       when date_trunc('month', day)::date = (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '1 month')::date then 'displayed'
                       when date_trunc('month', day)::date < public.wh_cutoff() then 'expired' else 'kept' end,
          'total', count(*), 'done', count(*) filter (where status = 'done'),
          'queued', count(*) filter (where status = 'queued'), 'running', count(*) filter (where status = 'running'), 'failed', count(*) filter (where status = 'failed'),
          'points', coalesce(sum(points), 0), 'stops', coalesce(sum(stops), 0), 'devices', count(distinct device_external_id),
          'first_started_at', min(started_at), 'last_finished_at', max(finished_at) filter (where status = 'done'),
          'done_last_hour', count(*) filter (where status = 'done' and finished_at > now() - interval '1 hour')) m
        from public.wh_pull_jobs group by date_trunc('month', day)) x), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('device_external_id', device_external_id, 'day', day, 'error_code', error_code, 'attempts', attempts, 'at', finished_at) order by finished_at desc)
        from (select * from public.wh_pull_jobs where error_code is not null order by finished_at desc nulls last limit 10) e), '[]'::jsonb),
    'paused', (select paused from public.wh_settings where id = 1),
    'last_rollover_at', (select last_rollover_at from public.wh_settings where id = 1),
    'last_rollover', (select last_rollover from public.wh_settings where id = 1),
    'stops_by_class', coalesce((select jsonb_object_agg(class, c) from (select class, count(*) c from public.wh_stops group by class) y), '{}'::jsonb));
$$;

revoke all on function public.wh_window(), public.wh_cutoff(), public.wh_daily_enqueue(), public.wh_rollover(), public.wh_archive_pending(int), public.wh_archive_expired(int),
  public.wh_maintenance(), public.wh_enqueue_month(date), public.wh_progress() from public, anon, authenticated;
