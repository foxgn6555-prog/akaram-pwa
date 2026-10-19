-- 00249 · الموارد البشرية — وحدة «تقارير سلوك الموظفين» (تحليل حضوريات البصمة)
--   · فترات: شهري / ربع سنوي / نصف سنوي / سنوي + الفترة السابقة للمقارنة.
--   · للموظفين الذين لديهم بصمة فعلاً فقط (رقم بصمة + يوم واحد على الأقل ببصمة دخول/خروج داخل الفترة).
--   · درجة الانضباط (0–100) بأوزان ثابتة وفق معايير قياس الحضور المتعارف عليها:
--       الالتزام بالحضور 40 · الانضباط بوقت الدخول 25 · الالتزام بوقت الخروج 15 · اكتمال البصمة 10 · استقرار وقت الحضور 10
--     - A الالتزام = 1 − 2 × (أيام الغياب بلا إجازة ÷ أيام الدوام المتوقعة) [المتوقعة = المجدولة − الإجازة/الزمنية المعتمدة؛ الإجازة محايدة؛ كل يوم غياب يُحتسب مضاعفاً]
--     - P الانضباط = 1 − (أيام التأخير ÷ أيام الحضور)، مخفَّض بمتوسط دقائق التأخير (كل 60 د متوسطاً تُنقص النصف)
--     - E الخروج   = 1 − (أيام الخروج المبكر ÷ أيام الحضور)، مخفَّض بمتوسط دقائق الخروج المبكر بالطريقة نفسها
--     - C الاكتمال = 1 − (أيام البصمة الناقصة ÷ أيام الحضور)
--     - S الاستقرار = 1 − min(1, الانحراف المعياري لوقت الدخول بالدقائق ÷ 60)   (أقل من 3 أيام ⇒ 1)
--   · بوابات (Gates) مهنية: التأخير المزمن (≥30% من أيام الحضور) أو الغياب المرتفع (≥10% من الأيام المتوقعة و≥ يومين) ⇒ الدرجة لا تتجاوز 69.9 مهما بلغت بقية المؤشرات.
--   · التصنيف: ≥90 ممتاز · ≥80 جيد جداً · ≥70 جيد · ≥60 مقبول · <60 ضعيف.
--   · القراءة: الموارد البشرية + المدير المفوض ومعاونه (قراءة فقط).

create or replace function app.hr_behavior_period(p_kind text, p_anchor date)
returns table (period_from date, period_to date, period_to_effective date, prev_from date, prev_to date, label text)
language plpgsql stable as $$
declare s date; l interval; today date := app.hr_local_date(now());
begin
  if p_kind not in ('monthly', 'quarterly', 'half_yearly', 'yearly') then raise exception 'HR_BEHAVIOR_KIND_INVALID'; end if;
  s := case p_kind
    when 'monthly' then date_trunc('month', p_anchor)::date
    when 'quarterly' then date_trunc('quarter', p_anchor)::date
    when 'half_yearly' then make_date(extract(year from p_anchor)::int, case when extract(month from p_anchor) <= 6 then 1 else 7 end, 1)
    else date_trunc('year', p_anchor)::date end;
  l := case p_kind when 'monthly' then interval '1 month' when 'quarterly' then interval '3 month' when 'half_yearly' then interval '6 month' else interval '1 year' end;
  period_from := s; period_to := (s + l - interval '1 day')::date;
  period_to_effective := least(period_to, today - 1);
  prev_from := (s - l)::date; prev_to := (s - interval '1 day')::date;
  label := case p_kind
    when 'monthly' then to_char(s, 'YYYY-MM')
    when 'quarterly' then 'Q' || extract(quarter from s)::text || ' ' || extract(year from s)::text
    when 'half_yearly' then 'H' || case when extract(month from s) = 1 then '1' else '2' end || ' ' || extract(year from s)::text
    else extract(year from s)::text end;
  return next;
end$$;

/** مقاييس السلوك لكل موظف لديه بصمة ضمن المدى (صفوف الحضور المشتقّة من البصمة فقط). */
create or replace function app.hr_behavior_metrics(p_from date, p_to date)
returns table (
  employee_id uuid, scheduled_days int, leave_days int, expected_days int, worked_days int, present_days int,
  late_days int, late_minutes int, early_days int, early_minutes int, absent_days int, incomplete_days int,
  extra_minutes int, avg_in_offset numeric, sd_in_offset numeric, perfect_days int, max_perfect_streak int,
  idx_attendance numeric, idx_punctuality numeric, idx_early numeric, idx_complete numeric, idx_consistency numeric, score numeric
) language sql stable as $$
  with d as (
    select a.employee_id, a.work_date, a.status, a.late_minutes, a.early_minutes,
           a.check_in is not null or a.check_out is not null as punched,
           a.check_in is not null and a.check_out is not null as complete,
           case when a.check_in is not null and a.expected_in is not null then round(extract(epoch from (a.check_in - a.expected_in)) / 60)::int end as in_offset,
           case when a.check_out is not null and a.expected_out is not null then greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60))::int else 0 end as extra,
           a.status in ('present') and a.check_in is not null and a.check_out is not null as perfect
    from public.hr_attendance_days a
    join public.employees e on e.id = a.employee_id
    where a.work_date between p_from and p_to and not a.is_rest_day and e.biometric_pin is not null and e.archived_at is null
  ),
  streaks as (
    select employee_id, max(cnt) as max_streak from (
      select employee_id, count(*) cnt from (
        select employee_id, work_date, perfect, row_number() over (partition by employee_id order by work_date) - row_number() over (partition by employee_id, perfect order by work_date) as grp
        from d) g where perfect group by employee_id, grp) s group by employee_id
  ),
  agg as (
    select d.employee_id,
      count(*)::int as scheduled_days,
      count(*) filter (where status in ('leave', 'time_permit') and not punched)::int as leave_days,
      count(*) filter (where punched)::int as worked_days,
      count(*) filter (where punched or status = 'time_permit')::int as present_days,
      count(*) filter (where late_minutes > 0 and punched)::int as late_days,
      coalesce(sum(late_minutes) filter (where punched), 0)::int as late_minutes,
      count(*) filter (where early_minutes > 0 and punched)::int as early_days,
      coalesce(sum(early_minutes) filter (where punched), 0)::int as early_minutes,
      count(*) filter (where status = 'absent')::int as absent_days,
      count(*) filter (where punched and not complete)::int as incomplete_days,
      coalesce(sum(extra), 0)::int as extra_minutes,
      round(avg(in_offset), 1) as avg_in_offset,
      round(coalesce(stddev_samp(in_offset), 0), 1) as sd_in_offset,
      count(*) filter (where perfect)::int as perfect_days,
      count(in_offset)::int as in_samples
    from d group by d.employee_id
  ),
  idx as (
    select a.*, coalesce(s.max_streak, 0)::int as max_perfect_streak,
      greatest(0, a.scheduled_days - a.leave_days)::int as expected_days,
      case when a.scheduled_days - a.leave_days <= 0 then 1 else greatest(0, 1 - 2 * a.absent_days::numeric / (a.scheduled_days - a.leave_days)) end as i_a,
      (a.late_days::numeric / a.worked_days) >= 0.3 or a.absent_days >= greatest(2, ceil((a.scheduled_days - a.leave_days) * 0.1)) as gated,
      case when a.worked_days = 0 then 1 else (1 - a.late_days::numeric / a.worked_days) * (1 - least(1, case when a.late_days = 0 then 0 else a.late_minutes::numeric / a.late_days / 60 end) / 2) end as i_p,
      case when a.worked_days = 0 then 1 else (1 - a.early_days::numeric / a.worked_days) * (1 - least(1, case when a.early_days = 0 then 0 else a.early_minutes::numeric / a.early_days / 60 end) / 2) end as i_e,
      case when a.worked_days = 0 then 1 else 1 - a.incomplete_days::numeric / a.worked_days end as i_c,
      case when a.in_samples < 3 then 1 else 1 - least(1, a.sd_in_offset / 60) end as i_s
    from agg a left join streaks s on s.employee_id = a.employee_id
    where a.worked_days > 0
  )
  select employee_id, scheduled_days, leave_days, expected_days, worked_days, present_days, late_days, late_minutes, early_days, early_minutes, absent_days, incomplete_days,
    extra_minutes, avg_in_offset, sd_in_offset, perfect_days, max_perfect_streak,
    round(i_a, 4), round(i_p, 4), round(i_e, 4), round(i_c, 4), round(i_s, 4),
    case when gated then least(69.9, round(40 * i_a + 25 * i_p + 15 * i_e + 10 * i_c + 10 * i_s, 1)) else round(40 * i_a + 25 * i_p + 15 * i_e + 10 * i_c + 10 * i_s, 1) end as score
  from idx
$$;

create or replace function app.hr_behavior_grade(p_score numeric) returns text language sql immutable as $$
  select case when p_score is null then null when p_score >= 90 then 'excellent' when p_score >= 80 then 'very_good' when p_score >= 70 then 'good' when p_score >= 60 then 'fair' else 'poor' end
$$;

create or replace function app.hr_behavior_can_read() returns boolean language sql stable as $$
  select app.has_role(array['hr_officer', 'super_admin', 'executive_director', 'deputy_director'])
$$;

/** التقرير الدوري: ملخص + اتجاه زمني + أيام الأسبوع + الأقسام + ترتيب الموظفين مع مقارنة الفترة السابقة */
create or replace function public.hr_behavior_report(p_kind text, p_anchor date, p_department uuid default null, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare pr record; v_emp jsonb; v_sum jsonb; v_trend jsonb := '[]'; v_wd jsonb; v_dep jsonb; b_from date; b_to date; b_step interval; b_label text; r record;
begin
  if not app.hr_behavior_can_read() then raise exception 'HR_FORBIDDEN'; end if;
  select * into pr from app.hr_behavior_period(p_kind, p_anchor);
  if pr.period_to_effective < pr.period_from then
    return jsonb_build_object('period', to_jsonb(pr) || jsonb_build_object('kind', p_kind), 'employees', '[]'::jsonb, 'summary', null, 'trend', '[]'::jsonb, 'weekdays', '[]'::jsonb, 'departments', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(x order by x.rank), '[]') into v_emp from (
    select c.employee_id, e.employee_number, e.full_name, e.department_id, d.name as department_name, b.name as branch_name, e.job_title,
      c.scheduled_days, c.leave_days, c.expected_days, c.worked_days, c.present_days, c.late_days, c.late_minutes, c.early_days, c.early_minutes, c.absent_days, c.incomplete_days,
      c.extra_minutes, c.avg_in_offset, c.sd_in_offset, c.perfect_days, c.max_perfect_streak,
      jsonb_build_object('attendance', c.idx_attendance, 'punctuality', c.idx_punctuality, 'early', c.idx_early, 'complete', c.idx_complete, 'consistency', c.idx_consistency) as indices,
      c.score, app.hr_behavior_grade(c.score) as grade, p.score as prev_score, case when p.score is null then null else round(c.score - p.score, 1) end as delta,
      app.hr_behavior_grade(p.score) as prev_grade,
      dense_rank() over (order by c.score desc, c.late_minutes asc, e.full_name) as rank,
      (c.late_days::numeric / nullif(c.worked_days, 0)) >= 0.3 as chronic_late,
      c.absent_days >= greatest(2, ceil(c.expected_days * 0.1)) as high_absence
    from app.hr_behavior_metrics(pr.period_from, pr.period_to_effective) c
    join public.employees e on e.id = c.employee_id
    left join public.departments d on d.id = e.department_id left join public.branches b on b.id = e.branch_id
    left join app.hr_behavior_metrics(pr.prev_from, pr.prev_to) p on p.employee_id = c.employee_id
    where (p_department is null or e.department_id = p_department) and (p_branch is null or e.branch_id = p_branch)
  ) x;

  select jsonb_build_object(
    'employees', count(*), 'avg_score', round(avg(c.score), 1),
    'prev_avg_score', round(avg(c.prev_score), 1),
    'attendance_rate', round(100 * sum(c.present_days)::numeric / nullif(sum(c.expected_days), 0), 1),
    'punctuality_rate', round(100 * (1 - sum(c.late_days)::numeric / nullif(sum(c.worked_days), 0)), 1),
    'early_leave_rate', round(100 * sum(c.early_days)::numeric / nullif(sum(c.worked_days), 0), 1),
    'absence_rate', round(100 * sum(c.absent_days)::numeric / nullif(sum(c.expected_days), 0), 1),
    'incomplete_rate', round(100 * sum(c.incomplete_days)::numeric / nullif(sum(c.worked_days), 0), 1),
    'late_minutes', sum(c.late_minutes), 'early_minutes', sum(c.early_minutes), 'extra_minutes', sum(c.extra_minutes), 'absent_days', sum(c.absent_days),
    'avg_late_minutes_per_late_day', round(sum(c.late_minutes)::numeric / nullif(sum(c.late_days), 0), 1),
    'chronic_late', count(*) filter (where c.late_days::numeric / nullif(c.worked_days, 0) >= 0.3),
    'perfect', count(*) filter (where c.score >= 99.5),
    'grades', jsonb_build_object(
      'excellent', count(*) filter (where c.score >= 90), 'very_good', count(*) filter (where c.score >= 80 and c.score < 90), 'good', count(*) filter (where c.score >= 70 and c.score < 80),
      'fair', count(*) filter (where c.score >= 60 and c.score < 70), 'poor', count(*) filter (where c.score < 60)),
    'improved', count(*) filter (where p.score is not null and c.score - p.score >= 2), 'declined', count(*) filter (where p.score is not null and c.score - p.score <= -2)
  ) into v_sum from jsonb_to_recordset(v_emp) as c(employee_id uuid, score numeric, prev_score numeric, present_days int, expected_days int, late_days int, worked_days int, early_days int, absent_days int, incomplete_days int, late_minutes int, early_minutes int, extra_minutes int)
  left join lateral (select c.prev_score as score) p on true;

  -- الاتجاه الزمني: أسابيع للشهري، أشهر لغيره
  b_step := case when p_kind = 'monthly' then interval '7 day' else interval '1 month' end;
  b_from := pr.period_from;
  while b_from <= pr.period_to_effective loop
    b_to := least(pr.period_to_effective, (b_from + b_step - interval '1 day')::date);
    b_label := case when p_kind = 'monthly' then to_char(b_from, 'MM-DD') else to_char(b_from, 'YYYY-MM') end;
    select jsonb_build_object('label', b_label, 'from', b_from, 'to', b_to, 'avg_score', round(avg(m.score), 1),
      'late_rate', round(100 * sum(m.late_days)::numeric / nullif(sum(m.worked_days), 0), 1),
      'absence_rate', round(100 * sum(m.absent_days)::numeric / nullif(sum(m.expected_days), 0), 1),
      'early_rate', round(100 * sum(m.early_days)::numeric / nullif(sum(m.worked_days), 0), 1),
      'employees', count(*)) into r
    from app.hr_behavior_metrics(b_from, b_to) m where m.employee_id in (select (x ->> 'employee_id')::uuid from jsonb_array_elements(v_emp) x);
    v_trend := v_trend || r.jsonb_build_object;
    b_from := (b_from + b_step)::date;
  end loop;

  -- أيام الأسبوع (0 = الأحد)
  select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'late_days', late_days, 'absent_days', absent_days, 'early_days', early_days, 'worked_days', worked_days,
      'late_rate', round(100 * late_days::numeric / nullif(worked_days, 0), 1)) order by dow), '[]') into v_wd
  from (
    select extract(dow from a.work_date)::int as dow,
      count(*) filter (where a.late_minutes > 0 and a.check_in is not null) as late_days,
      count(*) filter (where a.status = 'absent') as absent_days,
      count(*) filter (where a.early_minutes > 0 and a.check_out is not null) as early_days,
      count(*) filter (where a.check_in is not null or a.check_out is not null) as worked_days
    from public.hr_attendance_days a where a.work_date between pr.period_from and pr.period_to_effective and not a.is_rest_day and a.employee_id in (select (x ->> 'employee_id')::uuid from jsonb_array_elements(v_emp) x)
    group by 1) w;

  select coalesce(jsonb_agg(jsonb_build_object('department_id', id, 'name', name, 'employees', n, 'avg_score', avg_score, 'late_rate', late_rate, 'absence_rate', absence_rate) order by avg_score desc nulls last), '[]') into v_dep
  from (
    select d.id, coalesce(d.name, 'بلا قسم') as name, count(*) n, round(avg(c.score), 1) avg_score,
      round(100 * sum(c.late_days)::numeric / nullif(sum(c.worked_days), 0), 1) late_rate, round(100 * sum(c.absent_days)::numeric / nullif(sum(c.expected_days), 0), 1) absence_rate
    from jsonb_to_recordset(v_emp) as c(employee_id uuid, score numeric, late_days int, worked_days int, absent_days int, expected_days int)
    join public.employees e on e.id = c.employee_id left join public.departments d on d.id = e.department_id group by d.id, d.name) q;

  return jsonb_build_object('period', to_jsonb(pr) || jsonb_build_object('kind', p_kind), 'summary', v_sum, 'trend', v_trend, 'weekdays', v_wd, 'departments', v_dep, 'employees', v_emp,
    'weights', jsonb_build_object('attendance', 40, 'punctuality', 25, 'early', 15, 'complete', 10, 'consistency', 10));
end$$;
revoke all on function public.hr_behavior_report(text, date, uuid, uuid) from public, anon;
grant execute on function public.hr_behavior_report(text, date, uuid, uuid) to authenticated;

/** بطاقة موظف: المقاييس الحالية والسابقة + اتجاه + أيام الأسبوع + السجل اليومي */
create or replace function public.hr_behavior_employee(p_employee uuid, p_kind text, p_anchor date)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare pr record; cur record; prv record; v_days jsonb; v_wd jsonb; v_trend jsonb := '[]'; b_from date; b_to date; b_step interval; r record; v_hist jsonb;
begin
  if not (app.hr_behavior_can_read() or coalesce(p_employee = app.current_employee_id(), false)) then raise exception 'HR_FORBIDDEN'; end if;
  select * into pr from app.hr_behavior_period(p_kind, p_anchor);
  select * into cur from app.hr_behavior_metrics(pr.period_from, pr.period_to_effective) m where m.employee_id = p_employee;
  select * into prv from app.hr_behavior_metrics(pr.prev_from, pr.prev_to) m where m.employee_id = p_employee;
  select coalesce(jsonb_agg(jsonb_build_object('date', a.work_date, 'dow', extract(dow from a.work_date)::int, 'status', a.status, 'late', a.late_minutes, 'early', a.early_minutes,
      'in', a.check_in, 'out', a.check_out, 'expected_in', a.expected_in, 'expected_out', a.expected_out, 'worked', a.worked_minutes,
      'in_offset', case when a.check_in is not null and a.expected_in is not null then round(extract(epoch from (a.check_in - a.expected_in)) / 60)::int end,
      'extra', case when a.check_out is not null and a.expected_out is not null then greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60))::int else 0 end,
      'source', a.source) order by a.work_date), '[]') into v_days
  from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date between pr.period_from and pr.period_to_effective and not a.is_rest_day;
  select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'late_days', late_days, 'absent_days', absent_days, 'early_days', early_days, 'worked_days', worked_days, 'avg_in_offset', avg_in_offset) order by dow), '[]') into v_wd
  from (select extract(dow from a.work_date)::int dow, count(*) filter (where a.late_minutes > 0 and a.check_in is not null) late_days, count(*) filter (where a.status = 'absent') absent_days,
    count(*) filter (where a.early_minutes > 0 and a.check_out is not null) early_days, count(*) filter (where a.check_in is not null or a.check_out is not null) worked_days,
    round(avg(extract(epoch from (a.check_in - a.expected_in)) / 60), 1) avg_in_offset
    from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date between pr.period_from and pr.period_to_effective and not a.is_rest_day group by 1) w;
  -- توزيع وقت الدخول (سلال 15 دقيقة حول الموعد)
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'days', n) order by bucket), '[]') into v_hist
  from (select greatest(-60, least(90, floor(extract(epoch from (a.check_in - a.expected_in)) / 60 / 15) * 15))::int bucket, count(*) n
    from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date between pr.period_from and pr.period_to_effective and not a.is_rest_day and a.check_in is not null and a.expected_in is not null group by 1) h;
  b_step := case when p_kind = 'monthly' then interval '7 day' else interval '1 month' end; b_from := pr.period_from;
  while b_from <= pr.period_to_effective loop
    b_to := least(pr.period_to_effective, (b_from + b_step - interval '1 day')::date);
    select jsonb_build_object('label', case when p_kind = 'monthly' then to_char(b_from, 'MM-DD') else to_char(b_from, 'YYYY-MM') end, 'from', b_from, 'to', b_to,
      'score', m.score, 'late_days', m.late_days, 'absent_days', m.absent_days, 'early_days', m.early_days, 'late_minutes', m.late_minutes) into r
    from app.hr_behavior_metrics(b_from, b_to) m where m.employee_id = p_employee;
    if r.jsonb_build_object is not null then v_trend := v_trend || r.jsonb_build_object; end if;
    b_from := (b_from + b_step)::date;
  end loop;
  return jsonb_build_object(
    'period', to_jsonb(pr) || jsonb_build_object('kind', p_kind),
    'employee', (select jsonb_build_object('id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name, 'department_name', d.name, 'branch_name', b.name, 'job_title', e.job_title, 'hire_date', e.hire_date, 'biometric_pin', e.biometric_pin)
                 from public.employees e left join public.departments d on d.id = e.department_id left join public.branches b on b.id = e.branch_id where e.id = p_employee),
    'current', case when cur.employee_id is null then null else to_jsonb(cur) || jsonb_build_object('grade', app.hr_behavior_grade(cur.score)) end,
    'previous', case when prv.employee_id is null then null else to_jsonb(prv) || jsonb_build_object('grade', app.hr_behavior_grade(prv.score)) end,
    'rank', (select r2.rank from (select m.employee_id, dense_rank() over (order by m.score desc, m.late_minutes asc) rank from app.hr_behavior_metrics(pr.period_from, pr.period_to_effective) m) r2 where r2.employee_id = p_employee),
    'population', (select count(*) from app.hr_behavior_metrics(pr.period_from, pr.period_to_effective)),
    'trend', v_trend, 'weekdays', v_wd, 'in_histogram', v_hist, 'days', v_days,
    'weights', jsonb_build_object('attendance', 40, 'punctuality', 25, 'early', 15, 'complete', 10, 'consistency', 10));
end$$;
revoke all on function public.hr_behavior_employee(uuid, text, date) from public, anon;
grant execute on function public.hr_behavior_employee(uuid, text, date) to authenticated;
