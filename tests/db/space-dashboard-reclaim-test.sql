-- اختبار 00370: لوحة المساحة + طابور استرداد المساحة (IT فقط). بادئة sp.
set client_min_messages = notice;
insert into auth.users (id, email) values ('5b000000-0000-0000-0000-000000000001', 'it-sp@t.iq'), ('5b000000-0000-0000-0000-000000000002', 'ops-sp@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('5b000000-0000-0000-0000-000000000001', 'it_admin'), ('5b000000-0000-0000-0000-000000000002', 'ops_room') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare it1 uuid := '5b000000-0000-0000-0000-000000000001'; ops uuid := '5b000000-0000-0000-0000-000000000002'; j jsonb; n int; m record; r record;
begin
  -- S1: الصلاحية
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error('select public.space_overview()', 'IT_FORBIDDEN');
  perform pg_temp.expect_error($q$select public.space_settings_set('pro')$q$, 'IT_FORBIDDEN');
  perform pg_temp.expect_error('select public.space_reclaim_now()', 'IT_FORBIDDEN');
  -- S2: الافتراضي = الخطة المجانية 500 MB / 1 GB، واللوحة تعيد الأرقام الأساسية
  perform pg_temp.as_user(it1);
  j := public.space_overview();
  assert j ->> 'plan' = 'free' and (j ->> 'db_limit_bytes')::bigint = 500 * 1024 * 1024 and (j ->> 'storage_limit_bytes')::bigint = 1024 * 1024 * 1024, 'S2: ' || j::text;
  assert (j ->> 'db_bytes')::bigint > 0 and (j ->> 'db_free_bytes')::bigint = (j ->> 'db_limit_bytes')::bigint - (j ->> 'db_bytes')::bigint, 'S2b';
  assert jsonb_typeof(j -> 'tables') = 'array' and jsonb_array_length(j -> 'tables') between 1 and 12, 'S2c';
  assert jsonb_typeof(j -> 'buckets') = 'array' and (j -> 'reclaim' ->> 'queued')::int = 0, 'S2d';
  -- S3: Pro بزر واحد = 8 GB / 100 GB؛ مخصص يتطلب الحدين؛ خطة غير معروفة مرفوضة
  j := public.space_settings_set('pro');
  assert (j ->> 'db_limit_bytes')::bigint = 8::bigint * 1024 * 1024 * 1024 and (j ->> 'storage_limit_bytes')::bigint = 100::bigint * 1024 * 1024 * 1024 and j ->> 'plan' = 'pro', 'S3: ' || j::text;
  perform pg_temp.expect_error($q$select public.space_settings_set('custom')$q$, 'SPACE_LIMITS_REQUIRED');
  perform pg_temp.expect_error($q$select public.space_settings_set('gold')$q$, 'SPACE_PLAN_INVALID');
  j := public.space_settings_set('custom', 2000000000, 3000000000, 30);
  assert (j ->> 'db_limit_bytes')::bigint = 2000000000 and (j ->> 'bloat_threshold_pct')::int = 30, 'S3b';
  -- S4: التنبيهات: حدّ صغير جداً ⇒ خطر 90%
  j := public.space_settings_set('custom', 1024 * 1024, 1024 * 1024);
  assert (j -> 'alerts' -> 0 ->> 'kind') = 'db' and (j -> 'alerts' -> 0 ->> 'level') = 'danger', 'S4: ' || (j -> 'alerts')::text;
  -- S5: قياس الانتفاخ: جدول يُملأ ثم يُحذف منه 80% ⇒ نسبة شطب عالية
  create table public.zz_space_bloat (id bigserial primary key, pad text);
  insert into public.zz_space_bloat (pad) select repeat('x', 500) from generate_series(1, 20000);
  delete from public.zz_space_bloat where id % 5 <> 0;
  -- داخل المعاملة نفسها لا تُفرَّغ إحصاءات pg_stat ولا تُعدّ الصفوف المحذوفة «ميتة» بعد؛ pgstattuple_approx يكشف جزءاً منها (≥ 20%) — بعد الإيداع في الواقع تكون ≈ 80%
  select * into m from app.space_table_bloat('zz_space_bloat');
  assert m.total_bytes > 1024 * 1024 and m.reclaimable_pct >= 20, 'S5: ' || m::text;
  -- S6: المخطِّط يختار المنتفخ تلقائياً؛ بلا pg_cron يُسجَّل «مُتخطّى» ويُبلَّغ IT
  perform public.space_settings_set('free', null, null, 20);
  j := public.space_reclaim_now();
  select count(*) into n from public.space_reclaim_log where table_name = 'zz_space_bloat' and reason = 'bloat'; assert n = 1, 'S6: اختيار تلقائي ' || n;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    select * into r from public.space_reclaim_log where table_name = 'zz_space_bloat';
    assert r.status = 'skipped' and r.note = 'PG_CRON_MISSING', 'S6b: ' || r::text;
    select count(*) into n from public.notifications where user_id = it1 and title = 'تعذر ضغط بعض الجداول'; assert n >= 1, 'S6c: إشعار IT';
    assert (j ->> 'skipped')::int >= 1, 'S6d: ' || j::text;
  end if;
  -- S7: الطلب الصريح يُسجَّل مرة واحدة فقط ما دام مفتوحاً؛ الجدول غير الموجود يُهمل
  assert app.space_reclaim_enqueue(array['zz_space_bloat', 'no_such_table'], 'manual') = 1, 'S7';
  assert app.space_reclaim_enqueue(array['zz_space_bloat'], 'manual') = 0, 'S7b: لا تكرار';
  -- S8: اللوحة تعرض السجل والقابل للاسترداد
  j := public.space_overview();
  assert (j -> 'reclaim' -> 'log') is not null and jsonb_array_length(j -> 'reclaim' -> 'log') >= 2, 'S8: السجل في اللوحة';
  assert (j ->> 'db_reclaimable_bytes')::bigint > 0, 'S8b: القابل للاسترداد > 0';
  -- S9: الإنهاء لا يمسّ ما لم يحن موعده
  update public.space_reclaim_log set status = 'scheduled', scheduled_for = now() + interval '1 hour', cron_job = 'space-reclaim:zz_space_bloat' where table_name = 'zz_space_bloat' and status = 'queued';
  j := app.space_reclaim_finish(); assert (j ->> 'finished')::int = 0, 'S9';
  update public.space_reclaim_log set scheduled_for = now() - interval '10 minutes' where table_name = 'zz_space_bloat' and status = 'scheduled';
  j := app.space_reclaim_finish(); assert (j ->> 'finished')::int = 1, 'S9b';
  select * into r from public.space_reclaim_log where table_name = 'zz_space_bloat' and reason = 'manual';
  assert r.status = 'done' and r.after_bytes > 0, 'S9c: ' || r::text;
  drop table public.zz_space_bloat;
  raise notice 'space ok';
end $$;
