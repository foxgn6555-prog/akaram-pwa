-- 00205 (جولة 00218): «الأفراد» في تقارير الإدارة العليا — مَن بالاسم، لا مجاميع فقط:
--   · السائقون: بصمات مقابل انطلاقات (هل بصم السائق في أيام انطلاقه؟)
--   · الأكثر غياباً · الأكثر تأخراً · الأكثر التزاماً (حضور كامل ووقت وصول مبكر)
--   · الأكثر كشوفات مخالفات · الأكثر استقطاعاً في شهر الفترة (استقطاعات مؤكدة + أيام مقترحة من الحضور)
-- دقائق التأخير: العمود late_minutes، وإن كان صفراً مع حالة late تُحسب من (الدخول − المتوقع) حتى لا يضيع تأخير مُدخل يدوياً.
-- للصلاحيات التنفيذية فقط (app.is_executive). قراءة صافية، بلا تعديل.
create or replace function public.exec_people(p_from date, p_to date, p_limit int default 10)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  j_drivers jsonb; j_absent jsonb; j_late jsonb; j_committed jsonb; j_disc jsonb; j_ded jsonb; j_sum jsonb;
  v_month date := date_trunc('month', p_to)::date; tz interval := app.hr_tz(); lim int := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if not app.is_executive() then raise exception 'EXEC_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'EXEC_RANGE_INVALID'; end if;
  if p_to - p_from > 400 then raise exception 'EXEC_RANGE_TOO_WIDE'; end if;

  /* ── السائقون: أيام الانطلاق مقابل أيام البصمة ── */
  with dep as (
    select d.driver_employee_id as emp, (d.departed_at + tz)::date as day, count(*) as trips
    from public.garage_departures d
    where d.driver_employee_id is not null and (d.departed_at + tz)::date between p_from and p_to
    group by 1, 2
  ), per as (
    select dep.emp, count(*) as dep_days, sum(dep.trips) as trips,
           count(*) filter (where exists (select 1 from public.biometric_punches b where b.employee_id = dep.emp and (b.punched_at + tz)::date = dep.day)) as punched_days,
           count(*) filter (where exists (select 1 from public.hr_attendance_days a where a.employee_id = dep.emp and a.work_date = dep.day and a.status in ('present', 'late', 'early_leave', 'time_permit'))) as attended_days
    from dep group by 1
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'name', e.full_name, 'number', e.employee_number, 'department', coalesce(dp.name, 'بدون قسم'),
        'dep_days', per.dep_days, 'trips', per.trips, 'punched_days', per.punched_days, 'attended_days', per.attended_days,
        'missing_days', per.dep_days - per.punched_days,
        'match_pct', round(per.punched_days::numeric * 100 / nullif(per.dep_days, 0)))
        order by (per.dep_days - per.punched_days) desc, per.dep_days desc) from (select * from per order by (dep_days - punched_days) desc, dep_days desc limit lim) per
        join public.employees e on e.id = per.emp left join public.departments dp on dp.id = e.department_id), '[]'::jsonb),
    'drivers', (select count(*) from per),
    'dep_days', coalesce((select sum(dep_days) from per), 0),
    'punched_days', coalesce((select sum(punched_days) from per), 0),
    'unlinked_departures', (select count(*) from public.garage_departures d where d.driver_employee_id is null and (d.departed_at + tz)::date between p_from and p_to))
  into j_drivers;

  /* ── الأكثر غياباً ── */
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', x.employee_id, 'name', e.full_name, 'number', e.employee_number, 'department', coalesce(dp.name, 'بدون قسم'), 'job_title', e.job_title,
      'absent', x.absent, 'late', x.late, 'present', x.present, 'leave', x.leave, 'working_days', x.working_days,
      'absent_pct', round(x.absent::numeric * 100 / nullif(x.working_days, 0)),
      'deduction_days', x.ded_days) order by x.absent desc, x.late desc), '[]'::jsonb)
  into j_absent
  from (
    select a.employee_id,
           count(*) filter (where a.status = 'absent') as absent, count(*) filter (where a.status = 'late') as late,
           count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit')) as present,
           count(*) filter (where a.status in ('leave', 'time_permit')) as leave, count(*) as working_days,
           coalesce(sum(a.proposed_deduction_days) filter (where not coalesce(a.deduction_waived, false)), 0) as ded_days
    from public.hr_attendance_days a where a.work_date between p_from and p_to and not a.is_rest_day group by 1
    having count(*) filter (where a.status = 'absent') > 0 order by 2 desc, 3 desc limit lim) x
  join public.employees e on e.id = x.employee_id left join public.departments dp on dp.id = e.department_id;

  /* ── الأكثر تأخراً (بالدقائق) ── */
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', x.employee_id, 'name', e.full_name, 'number', e.employee_number, 'department', coalesce(dp.name, 'بدون قسم'),
      'late_days', x.late_days, 'late_minutes', x.late_minutes, 'avg_late', round(x.late_minutes::numeric / nullif(x.late_days, 0)), 'working_days', x.working_days) order by x.late_minutes desc), '[]'::jsonb)
  into j_late
  from (
    select a.employee_id, count(*) filter (where greatest(a.late_minutes, case when a.status = 'late' and a.check_in is not null and a.expected_in is not null then (extract(epoch from (a.check_in - a.expected_in)) / 60)::int else 0 end) > 0) as late_days, coalesce(sum(greatest(a.late_minutes, case when a.status = 'late' and a.check_in is not null and a.expected_in is not null then (extract(epoch from (a.check_in - a.expected_in)) / 60)::int else 0 end)), 0) as late_minutes, count(*) as working_days
    from public.hr_attendance_days a where a.work_date between p_from and p_to and not a.is_rest_day group by 1
    having coalesce(sum(greatest(a.late_minutes, case when a.status = 'late' and a.check_in is not null and a.expected_in is not null then (extract(epoch from (a.check_in - a.expected_in)) / 60)::int else 0 end)), 0) > 0 order by 3 desc limit lim) x
  join public.employees e on e.id = x.employee_id left join public.departments dp on dp.id = e.department_id;

  /* ── الأكثر التزاماً: لا غياب، أقل تأخير، وصول مبكر — يُشترط ثلاثة أيام عمل على الأقل ── */
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', x.employee_id, 'name', e.full_name, 'number', e.employee_number, 'department', coalesce(dp.name, 'بدون قسم'), 'job_title', e.job_title,
      'working_days', x.working_days, 'present', x.present, 'absent', x.absent, 'late_days', x.late_days, 'late_minutes', x.late_minutes,
      'attendance_pct', round(x.present::numeric * 100 / nullif(x.working_days, 0)),
      'avg_in', to_char(x.avg_in, 'HH24:MI'), 'avg_early_minutes', round(coalesce(x.avg_early, 0)), 'score', x.score)
      order by x.score desc, x.late_minutes asc, x.avg_early desc nulls last), '[]'::jsonb)
  into j_committed
  from (
    select a.employee_id, count(*) as working_days,
           count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit')) as present,
           count(*) filter (where a.status = 'absent') as absent,
           count(*) filter (where greatest(a.late_minutes, case when a.status = 'late' and a.check_in is not null and a.expected_in is not null then (extract(epoch from (a.check_in - a.expected_in)) / 60)::int else 0 end) > 0) as late_days, coalesce(sum(greatest(a.late_minutes, case when a.status = 'late' and a.check_in is not null and a.expected_in is not null then (extract(epoch from (a.check_in - a.expected_in)) / 60)::int else 0 end)), 0) as late_minutes,
           avg((a.check_in + tz)::time - time '00:00') filter (where a.check_in is not null) as avg_in,
           avg(extract(epoch from (a.expected_in - a.check_in)) / 60) filter (where a.check_in is not null and a.expected_in is not null) as avg_early,
           round(count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit'))::numeric * 100 / nullif(count(*), 0))
             - least(30, coalesce(sum(greatest(a.late_minutes, case when a.status = 'late' and a.check_in is not null and a.expected_in is not null then (extract(epoch from (a.check_in - a.expected_in)) / 60)::int else 0 end)), 0) / 10.0) as score
    from public.hr_attendance_days a where a.work_date between p_from and p_to and not a.is_rest_day group by 1
    having count(*) >= 3 and count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit')) > 0
    order by score desc, late_minutes asc limit lim) x
  join public.employees e on e.id = x.employee_id left join public.departments dp on dp.id = e.department_id;

  /* ── الأكثر كشوفات مخالفات (الموظفون المرتبطون بالكشف) ── */
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', x.employee_id, 'name', coalesce(e.full_name, x.driver_name), 'number', e.employee_number, 'department', coalesce(dp.name, x.department_name, 'بدون قسم'),
      'count', x.c, 'approved', x.approved, 'pending', x.pending, 'amount', x.amount, 'top_violation', x.top_violation) order by x.c desc, x.amount desc), '[]'::jsonb)
  into j_disc
  from (
    select d.employee_id, max(d.driver_name) as driver_name, max(d.department_name) as department_name, count(*) as c,
           count(*) filter (where d.status = 'approved') as approved, count(*) filter (where d.status in ('pending', 'submitted_to_deputy', 'returned')) as pending,
           coalesce(sum(d.amount) filter (where d.status = 'approved'), 0) as amount,
           (select coalesce(t.label, d2.violation_type) from public.disclosures d2 left join public.disclosure_types t on t.key = d2.violation_type
              where d2.employee_id = d.employee_id and d2.log_date between p_from and p_to and d2.archived_at is null group by 1 order by count(*) desc limit 1) as top_violation
    from public.disclosures d where d.employee_id is not null and d.log_date between p_from and p_to and d.archived_at is null and d.status <> 'draft'
    group by d.employee_id order by c desc limit lim) x
  left join public.employees e on e.id = x.employee_id left join public.departments dp on dp.id = e.department_id;

  /* ── الأكثر استقطاعاً في شهر الفترة: مؤكد (hr_attendance_deductions) + أيام مقترحة من الحضور ── */
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', x.employee_id, 'name', e.full_name, 'number', e.employee_number, 'department', coalesce(dp.name, 'بدون قسم'),
      'amount', x.amount, 'days', x.days, 'proposed_days', x.proposed_days, 'items', x.items, 'reasons', x.reasons) order by x.amount desc, x.days desc, x.proposed_days desc), '[]'::jsonb)
  into j_ded
  from (
    select coalesce(k.employee_id, a.employee_id) as employee_id,
           coalesce(k.amount, 0) as amount, coalesce(k.days, 0) as days, coalesce(a.pd, 0) as proposed_days, coalesce(k.items, 0) as items, k.reasons
    from (select employee_id, sum(amount) as amount, sum(days) as days, count(*) as items,
                 string_agg(distinct left(reason, 40), ' · ') as reasons
          from public.hr_attendance_deductions where period_month = v_month group by 1) k
    full join (select employee_id, sum(proposed_deduction_days) as pd from public.hr_attendance_days
               where work_date between v_month and (v_month + interval '1 month - 1 day')::date and not coalesce(deduction_waived, false) group by 1 having sum(proposed_deduction_days) > 0) a
      on a.employee_id = k.employee_id
    order by coalesce(k.amount, 0) desc, coalesce(k.days, 0) desc, coalesce(a.pd, 0) desc limit lim) x
  join public.employees e on e.id = x.employee_id left join public.departments dp on dp.id = e.department_id;

  /* ── ملخص ── */
  select jsonb_build_object(
    'employees', (select count(distinct employee_id) from public.hr_attendance_days where work_date between p_from and p_to and not is_rest_day),
    'perfect', (select count(*) from (select employee_id from public.hr_attendance_days where work_date between p_from and p_to and not is_rest_day
                 group by 1 having count(*) filter (where status in ('absent', 'late')) = 0 and coalesce(sum(late_minutes), 0) = 0 and count(*) >= 3) z),
    'with_absence', (select count(distinct employee_id) from public.hr_attendance_days where work_date between p_from and p_to and not is_rest_day and status = 'absent'),
    'with_disclosures', (select count(distinct employee_id) from public.disclosures where employee_id is not null and log_date between p_from and p_to and archived_at is null and status <> 'draft'),
    'deduction_month', to_char(v_month, 'YYYY-MM'),
    'deducted', (select count(distinct employee_id) from public.hr_attendance_deductions where period_month = v_month))
  into j_sum;

  return jsonb_build_object('period', jsonb_build_object('from', p_from, 'to', p_to, 'generated_at', now()),
    'summary', j_sum, 'drivers', j_drivers, 'absent', j_absent, 'late', j_late, 'committed', j_committed, 'disclosures', j_disc, 'deductions', j_ded);
end$$;
grant execute on function public.exec_people(date, date, int) to authenticated;
