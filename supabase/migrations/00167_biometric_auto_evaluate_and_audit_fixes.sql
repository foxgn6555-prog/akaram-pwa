-- ═══════════════════════════════════════════════════════════════
-- 00167 · تدقيق البصمة ↔ الحضور ↔ الإجازات — إصلاحات جذرية
--
--  ① [حرج] البصمات الواصلة (ADMS/الجسر/السحب) كانت تُخزَّن في الدفتر فقط ولا تُحتسب في الحضور اليومي
--     (hr_attendance_days) إلا إذا ضغط HR/غرفة العمليات «إعادة الاحتساب» يدوياً. الآن: محفّز على الدفتر
--     يعيد احتساب اليوم المحلي للبصمة واليوم السابق (نوافذ الشفتات الليلية) ويحدّث تنبيهات الشهر —
--     مرة واحدة لكل (موظف، يوم) في الدفعة، ويتجاهل الأشهر المقفولة بالمالية بصمت.
--  ② ربط PIN بموظف (biometric_link_pin) يعبّئ البصمات القديمة → تُحتسب تلقائياً عبر المحفّز نفسه.
--  ③ إلغاء طلب إجازة معلّق ضمن سلسلة موافقات كان يترك مهام السلسلة «pending/waiting» — تُغلق الآن.
--  ④ تاريخ آخر بصمة لكل جهاز (لاستئناف ATTLOGStamp في رد التسجيل بدل إعادة إرسال الذاكرة كلها).
-- ═══════════════════════════════════════════════════════════════

-- ─── ⓪ محفّز مشتقات اليوم كان يتوقف إذا كُتب يوم الحضور من داخل محفّز آخر (pg_trigger_depth>1)
--        → مع الاحتساب التلقائي لن تُحسب النواقص/الاستقطاعات. الحارس الآن علم جلسة ضد التكرار فقط.
create or replace function app.trg_hr_day_metrics() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if current_setting('app.hr_metrics_running', true) = '1' then return null; end if;
  perform set_config('app.hr_metrics_running', '1', true);
  begin
    perform app.hr_compute_day_metrics(new.employee_id, new.work_date);
  exception when others then
    perform set_config('app.hr_metrics_running', '0', true);
    raise;
  end;
  perform set_config('app.hr_metrics_running', '0', true);
  return null;
end$$;

-- ─── ① احتساب آمن: لا يرمي، يتجاهل الشهر المقفول ───
create or replace function app.hr_evaluate_day_safe(p_employee uuid, p_date date) returns boolean
language plpgsql security definer set search_path = public, app as $$
begin
  if p_employee is null or p_date is null then return false; end if;
  if app.hr_month_locked(p_date) then return false; end if;
  perform app.hr_evaluate_day(p_employee, p_date);
  return true;
exception when others then
  -- الاحتساب لا يُفشل استلام البصمة أبداً — يُسجَّل للتدقيق
  insert into public.integration_logs (provider, direction, endpoint, status, payload)
  values ('biometric', 'inbound', 'hr_evaluate_day', 'failed',
          jsonb_build_object('employee_id', p_employee, 'date', p_date, 'error', left(sqlerrm, 300)));
  return false;
end$$;

-- التاريخ المحلي (منطقة الشركة) لبصمة
create or replace function app.hr_local_date(p_at timestamptz) returns date
language sql stable security definer set search_path = public, app as
$$ select ((p_at at time zone 'UTC') + app.hr_tz())::date $$;

-- المحفّز (على مستوى الجملة): كل (موظف، يوم) مرة واحدة + اليوم السابق + تنبيهات الشهر
create or replace function app.trg_biometric_punches_evaluate() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare r record; m record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  for r in
    select distinct n.employee_id, d.work_date
    from new_punches n
    cross join lateral (values (app.hr_local_date(n.punched_at)), (app.hr_local_date(n.punched_at) - 1)) as d(work_date)
    where n.employee_id is not null
  loop
    perform app.hr_evaluate_day_safe(r.employee_id, r.work_date);
  end loop;
  for m in
    select distinct n.employee_id, date_trunc('month', app.hr_local_date(n.punched_at))::date as month
    from new_punches n where n.employee_id is not null
  loop
    begin
      perform app.hr_refresh_alerts(m.employee_id, m.month);
    exception when others then null;
    end;
  end loop;
  return null;
end$$;

-- نسخة التحديث: فقط الصفوف التي تغيّر فيها employee_id (الربط الرجعي) — جداول الانتقال لا تقبل قائمة أعمدة
create or replace function app.trg_biometric_punches_evaluate_upd() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare r record; m record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  for r in
    select distinct n.employee_id, d.work_date
    from new_punches n join old_punches o on o.id = n.id
    cross join lateral (values (app.hr_local_date(n.punched_at)), (app.hr_local_date(n.punched_at) - 1)) as d(work_date)
    where n.employee_id is not null and n.employee_id is distinct from o.employee_id
  loop
    perform app.hr_evaluate_day_safe(r.employee_id, r.work_date);
  end loop;
  for m in
    select distinct n.employee_id, date_trunc('month', app.hr_local_date(n.punched_at))::date as month
    from new_punches n join old_punches o on o.id = n.id
    where n.employee_id is not null and n.employee_id is distinct from o.employee_id
  loop
    begin perform app.hr_refresh_alerts(m.employee_id, m.month); exception when others then null; end;
  end loop;
  return null;
end$$;

drop trigger if exists trg_bio_punches_eval_ins on public.biometric_punches;
create trigger trg_bio_punches_eval_ins
  after insert on public.biometric_punches
  referencing new table as new_punches
  for each statement execute function app.trg_biometric_punches_evaluate();

-- ② إعادة الربط (employee_id) — التعبئة الرجعية عند ربط PIN
drop trigger if exists trg_bio_punches_eval_upd on public.biometric_punches;
create trigger trg_bio_punches_eval_upd
  after update on public.biometric_punches
  referencing old table as old_punches new table as new_punches
  for each statement execute function app.trg_biometric_punches_evaluate_upd();

-- ③ إلغاء الطلب يغلق مهام السلسلة المفتوحة
create or replace function public.hr_leave_cancel(p_leave uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; me uuid := app.current_employee_id(); d date;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status not in ('pending', 'approved') then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not (app.has_role(array['hr_officer', 'super_admin']) or l.employee_id = me or app.hr_can_decide(p_leave)) then raise exception 'HR_FORBIDDEN'; end if;
  if l.status = 'approved' then
    if not app.has_role(array['hr_officer', 'super_admin']) and l.start_date <= current_date then raise exception 'HR_LEAVE_STARTED'; end if;
    if app.hr_month_locked(l.start_date) then raise exception 'HR_MONTH_LOCKED'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
    insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
    select employee_id, year, 'reversal', -days, leave_id, 'إلغاء: ' || trim(p_reason), auth.uid() from public.hr_leave_ledger where leave_id = p_leave and kind in ('consume', 'permit');
  end if;
  update public.hr_leaves set status = 'cancelled', cancelled_reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = coalesce(decided_by, auth.uid()) where id = p_leave;
  -- مهام سلسلة الموافقات المفتوحة تُغلق (لا تبقى معلّقة في لوحات المعتمِدين/الخط الزمني)
  update public.approval_tasks set status = 'skipped', note = coalesce(note, 'أُلغي الطلب من صاحبه/HR قبل اكتمال السلسلة')
   where request_kind = l.kind and request_id = l.id and status in ('pending', 'waiting');
  if l.status = 'approved' then
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
  end if;
end$$;
grant execute on function public.hr_leave_cancel(uuid, text) to authenticated;

-- ④ آخر بصمة محلية للجهاز (لاستئناف ADMS) — دور الخدمة فقط
create or replace function public.biometric_last_stamp(p_sn text) returns text
language sql stable security definer set search_path = public, app as $$
  select to_char((max(p.punched_at) at time zone 'UTC') + coalesce(d.timezone_offset, '+03:00')::interval, 'YYYY-MM-DD HH24:MI:SS')
  from public.biometric_punches p
  join public.biometric_devices d on d.serial_number = p.device_serial
  where p.device_serial = p_sn
  group by d.timezone_offset
  limit 1
$$;
revoke all on function public.biometric_last_stamp(text) from public, anon, authenticated;

revoke all on function app.hr_evaluate_day_safe(uuid, date), app.hr_local_date(timestamptz), app.trg_biometric_punches_evaluate(), app.trg_biometric_punches_evaluate_upd()
  from public, anon, authenticated;

-- ─── ⑤ احتساب يومي مجدول: الغياب يُسجَّل حتى لو لم يبصم أحد (لم يكن هناك أي جدولة — الغياب كان يظهر فقط
--        عند ضغط «إعادة الاحتساب» يدوياً). يعيد احتساب أمس واليوم (وأمس الأول للشفتات الليلية) لكل الموظفين النشطين.
create or replace function app.hr_evaluate_daily() returns integer
language plpgsql security definer set search_path = public, app as $$
declare today date := app.hr_local_date(now()); e record; d date; n int := 0;
begin
  for e in select id from public.employees
           where archived_at is null and biometric_pin is not null
             and (employment_status <> 'terminated' or (terminated_at is not null and terminated_at >= today - 2)) loop
    d := today - 2;
    while d <= today loop
      if app.hr_evaluate_day_safe(e.id, d) then n := n + 1; end if;
      d := d + 1;
    end loop;
    begin perform app.hr_refresh_alerts(e.id, today); exception when others then null; end;
    if extract(day from today) <= 2 then
      begin perform app.hr_refresh_alerts(e.id, today - 2); exception when others then null; end;
    end if;
  end loop;
  insert into public.integration_logs (provider, direction, endpoint, status, payload)
  values ('biometric', 'inbound', 'hr_evaluate_daily', 'success', jsonb_build_object('days_evaluated', n, 'local_date', today));
  return n;
end$$;
revoke all on function app.hr_evaluate_daily() from public, anon, authenticated;

-- غلاف عام لـ HR/غرفة العمليات (زر «احتساب اليوم») — نفس المنطق بلا نطاق يدوي
create or replace function public.hr_attendance_evaluate_today() returns integer
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  return app.hr_evaluate_daily();
end$$;
grant execute on function public.hr_attendance_evaluate_today() to authenticated;

-- الجدولة عبر pg_cron إن كانت متاحة (Supabase: Database → Extensions → pg_cron). 00:30 UTC = 03:30 بغداد، وكل ساعة نهاراً لتحديث «اليوم».
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron غير متاح — فعّله من لوحة Supabase ثم أعد تشغيل هذا الترحيل (الاحتساب عند وصول البصمة يعمل بلا جدولة)';
    return;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('hr_evaluate_daily', 'hr_evaluate_hourly');
    perform cron.schedule('hr_evaluate_daily', '30 0 * * *', $job$ select app.hr_evaluate_daily() $job$);
    perform cron.schedule('hr_evaluate_hourly', '5 4-20 * * *', $job$ select app.hr_evaluate_daily() $job$);
  end if;
end $$;
