-- 00250 · تقارير سلوك الموظفين — سلسلة فترات متتالية للمقارنة (آخر N فترة من النوع نفسه تنتهي بالمرساة)
--   تُعيد ملخصاً لكل فترة + درجة كل موظف في كل فترة (null حيث لا بصمات) + ميل الاتجاه (انحدار خطي بسيط) لتصنيف «متحسن/متراجع/مستقر».
create or replace function public.hr_behavior_series(p_kind text, p_anchor date, p_count int default 6, p_department uuid default null, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare pr record; i int; a date; v_periods jsonb := '[]'; v_scores jsonb := '{}'; k text; rec record; n int := least(greatest(coalesce(p_count, 6), 2), 12); v_emp jsonb;
begin
  if not app.hr_behavior_can_read() then raise exception 'HR_FORBIDDEN'; end if;
  for i in reverse n - 1 .. 0 loop
    a := (select case p_kind when 'monthly' then (date_trunc('month', p_anchor) - (i || ' month')::interval)::date
                             when 'quarterly' then (date_trunc('quarter', p_anchor) - (i * 3 || ' month')::interval)::date
                             when 'half_yearly' then (make_date(extract(year from p_anchor)::int, case when extract(month from p_anchor) <= 6 then 1 else 7 end, 1) - (i * 6 || ' month')::interval)::date
                             else (date_trunc('year', p_anchor) - (i || ' year')::interval)::date end);
    select * into pr from app.hr_behavior_period(p_kind, a);
    if pr.period_to_effective < pr.period_from then continue; end if;
    select jsonb_build_object('label', pr.label, 'from', pr.period_from, 'to', pr.period_to_effective,
        'employees', count(*), 'avg_score', round(avg(m.score), 1),
        'attendance_rate', round(100 * (1 - sum(m.absent_days)::numeric / nullif(sum(m.expected_days), 0)), 1),
        'punctuality_rate', round(100 * (1 - sum(m.late_days)::numeric / nullif(sum(m.worked_days), 0)), 1),
        'absence_rate', round(100 * sum(m.absent_days)::numeric / nullif(sum(m.expected_days), 0), 1),
        'early_rate', round(100 * sum(m.early_days)::numeric / nullif(sum(m.worked_days), 0), 1),
        'late_minutes', coalesce(sum(m.late_minutes), 0), 'chronic_late', count(*) filter (where m.late_days::numeric / nullif(m.worked_days, 0) >= 0.3),
        'grades', jsonb_build_object('excellent', count(*) filter (where m.score >= 90), 'very_good', count(*) filter (where m.score >= 80 and m.score < 90), 'good', count(*) filter (where m.score >= 70 and m.score < 80), 'fair', count(*) filter (where m.score >= 60 and m.score < 70), 'poor', count(*) filter (where m.score < 60))),
      coalesce(jsonb_object_agg(m.employee_id::text, m.score), '{}')
    into rec
    from app.hr_behavior_metrics(pr.period_from, pr.period_to_effective) m join public.employees e on e.id = m.employee_id
    where (p_department is null or e.department_id = p_department) and (p_branch is null or e.branch_id = p_branch);
    v_periods := v_periods || rec.jsonb_build_object;
    -- scores[employee] = مصفوفة بطول الفترات (null حيث لا بصمات)
    for k in select distinct key from jsonb_object_keys(v_scores) key union select key from jsonb_object_keys(rec.coalesce) key loop
      v_scores := jsonb_set(v_scores, array[k], coalesce(v_scores -> k, (select jsonb_agg('null'::jsonb) from generate_series(1, jsonb_array_length(v_periods) - 1)), '[]'::jsonb) || coalesce(rec.coalesce -> k, 'null'::jsonb));
    end loop;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name, 'department_name', d.name, 'scores', s.value,
      'last_score', sl.last_score, 'first_score', sl.first_score, 'slope', sl.slope, 'periods_with_data', sl.cnt,
      'trend', case when sl.cnt < 2 then 'insufficient' when sl.slope >= 1.5 then 'improving' when sl.slope <= -1.5 then 'declining' else 'stable' end)
      order by sl.slope desc nulls last, e.full_name), '[]') into v_emp
  from jsonb_each(v_scores) s join public.employees e on e.id = s.key::uuid left join public.departments d on d.id = e.department_id
  cross join lateral (
    select count(*) filter (where v is not null) cnt, round(regr_slope(v::double precision, idx::double precision)::numeric, 2) slope,
           (array_agg(v order by idx desc) filter (where v is not null))[1] last_score, (array_agg(v order by idx) filter (where v is not null))[1] first_score
    from (select (ordinality - 1)::numeric idx, nullif(val, 'null')::numeric v from jsonb_array_elements_text(s.value) with ordinality as t(val, ordinality)) q) sl;
  return jsonb_build_object('kind', p_kind, 'periods', v_periods, 'employees', v_emp);
end$$;
revoke all on function public.hr_behavior_series(text, date, int, uuid, uuid) from public, anon;
grant execute on function public.hr_behavior_series(text, date, int, uuid, uuid) to authenticated;
