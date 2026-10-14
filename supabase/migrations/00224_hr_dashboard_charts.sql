-- 00224 · الموارد البشرية — رسومات «الرئيسية»: يوسّع hr_dashboard_stats بمفاتيح جديدة دون المساس بالقديمة
-- attendance_30d (اتجاه 30 يوماً) · movement_6m (تعيين/إنهاء 6 أشهر) · by_contract · by_status · by_gender · tenure · leaves_month · leaves_pending
-- · month_attendance (نسبة حضور الشهر) · incomplete_profiles (ملفات تنقصها بصمة/مسمى/مدير). بلا رواتب — الأرقام المالية للمالية حصراً.

create or replace function public.hr_dashboard_stats()
returns jsonb language sql stable security definer set search_path = public, app as $$
  select case when not app.has_role(array['hr_officer', 'super_admin']) then null else jsonb_build_object(
    'employees_active', (select count(*) from public.employees where archived_at is null and employment_status <> 'terminated'),
    'employees_terminated', (select count(*) from public.employees where archived_at is null and employment_status = 'terminated'),
    'hired_this_month', (select count(*) from public.employees where archived_at is null and hire_date >= date_trunc('month', current_date)),
    'terminated_this_month', (select count(*) from public.employees where archived_at is null and terminated_at >= date_trunc('month', current_date)),
    'by_department', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(d.name, 'بلا قسم'), 'count', c) order by c desc), '[]'::jsonb)
                      from (select department_id, count(*) c from public.employees where archived_at is null and employment_status <> 'terminated' group by department_id) x
                      left join public.departments d on d.id = x.department_id),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(b.name, 'بلا فرع'), 'count', c) order by c desc), '[]'::jsonb)
                  from (select branch_id, count(*) c from public.employees where archived_at is null and employment_status <> 'terminated' group by branch_id) x
                  left join public.branches b on b.id = x.branch_id),
    'today', (select jsonb_build_object(
        'present', count(*) filter (where status in ('present', 'early_leave', 'time_permit')),
        'late', count(*) filter (where status = 'late'),
        'absent', count(*) filter (where status = 'absent'),
        'incomplete', count(*) filter (where status = 'incomplete'),
        'leave', count(*) filter (where status = 'leave'))
      from public.hr_attendance_days where work_date = current_date),
    'leaves_today', (select count(*) from public.hr_leaves where status = 'approved' and current_date between start_date and end_date),
    'salary_pending', (select count(*) from public.employee_salary_profiles sp join public.employees e on e.id = sp.employee_id
                       where sp.status = 'pending' and e.employment_status <> 'terminated'),
    'unmatched_punches', (select count(*) from public.biometric_punches where employee_id is null and punched_at >= now() - interval '30 days'),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'count', (select count(*) from public.employees e
                 where e.archived_at is null and e.employment_status <> 'terminated' and (select shift_id from app.hr_effective_shift(e.id, current_date)) = s.id))), '[]'::jsonb)
               from public.hr_shifts s where s.is_active),
    -- 00224: رسومات الرئيسية
    'attendance_30d', (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'),
                          'present', coalesce(a.present, 0), 'late', coalesce(a.late, 0), 'absent', coalesce(a.absent, 0), 'incomplete', coalesce(a.incomplete, 0), 'leave', coalesce(a.leave, 0)) order by g.d), '[]'::jsonb)
                       from generate_series(current_date - 29, current_date, interval '1 day') g(d)
                       left join (select work_date,
                                         count(*) filter (where status in ('present', 'early_leave', 'time_permit')) present,
                                         count(*) filter (where status = 'late') late,
                                         count(*) filter (where status = 'absent') absent,
                                         count(*) filter (where status = 'incomplete') incomplete,
                                         count(*) filter (where status = 'leave') leave
                                  from public.hr_attendance_days where not is_rest_day and work_date >= current_date - 29 group by work_date) a on a.work_date = g.d::date),
    'movement_6m', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.m, 'YYYY-MM'),
                          'hired', (select count(*) from public.employees e where e.archived_at is null and e.hire_date >= m.m::date and e.hire_date < (m.m + interval '1 month')::date),
                          'terminated', (select count(*) from public.employees e where e.archived_at is null and e.terminated_at >= m.m::date and e.terminated_at < (m.m + interval '1 month')::date)) order by m.m), '[]'::jsonb)
                    from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m(m)),
    'by_contract', (select jsonb_build_object('monthly', count(*) filter (where contract_type = 'monthly'), 'daily', count(*) filter (where contract_type = 'daily'))
                    from public.employees where archived_at is null and employment_status <> 'terminated'),
    'by_status', (select jsonb_build_object('active', count(*) filter (where employment_status = 'active'), 'on_leave', count(*) filter (where employment_status = 'on_leave'), 'suspended', count(*) filter (where employment_status = 'suspended'))
                  from public.employees where archived_at is null and employment_status <> 'terminated'),
    'by_gender', (select jsonb_build_object('male', count(*) filter (where gender = 'male'), 'female', count(*) filter (where gender = 'female'), 'unknown', count(*) filter (where gender is null))
                  from public.employees where archived_at is null and employment_status <> 'terminated'),
    'tenure', (select jsonb_build_object('lt1', count(*) filter (where hire_date > current_date - interval '1 year'),
                                         'y1_3', count(*) filter (where hire_date <= current_date - interval '1 year' and hire_date > current_date - interval '3 years'),
                                         'gt3', count(*) filter (where hire_date <= current_date - interval '3 years'))
               from public.employees where archived_at is null and employment_status <> 'terminated'),
    'leaves_month', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', c) order by c desc), '[]'::jsonb)
                     from (select coalesce(lt.name, case l.kind when 'time_permit' then 'زمنية' else 'إجازة' end) name, count(*) c
                           from public.hr_leaves l left join public.hr_leave_types lt on lt.id = l.leave_type_id
                           where l.status = 'approved' and l.start_date >= date_trunc('month', current_date) and l.start_date < (date_trunc('month', current_date) + interval '1 month')
                           group by 1) x),
    'leaves_pending', (select count(*) from public.hr_leaves where status = 'pending'),
    'month_attendance', (select jsonb_build_object('present', count(*) filter (where status in ('present', 'early_leave', 'time_permit', 'late')),
                                                   'absent', count(*) filter (where status = 'absent'),
                                                   'late', count(*) filter (where status = 'late'),
                                                   'days', count(*))
                         from public.hr_attendance_days where not is_rest_day and work_date >= date_trunc('month', current_date) and work_date <= current_date),
    'incomplete_profiles', (select count(*) from public.employees where archived_at is null and employment_status <> 'terminated' and (biometric_pin is null or job_title_id is null or manager_id is null))
  ) end
$$;
grant execute on function public.hr_dashboard_stats() to authenticated;
