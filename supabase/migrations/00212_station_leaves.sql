-- 00212 · المحطة التحويلية: وحدة «الطلبات» (الجولة 2 من 5) — إجازات وزمنيات موظفي قسم المحطة فقط
-- نفس آلية الكراج (00208): المحطة تُدخل الطلب نيابةً عن موظف قسمها (سلسلة الموافقات كما هي)، تتابع، تلغي ما أدخلته وهو معلّق،
-- وتبتّ فقط إن كانت المعتمد وفق سلاسل التطوير المركزية. النطاق = app.disclosure_scope_depts() (قسم المحطة وفروعه — 00211).

create or replace function app.garage_can_act_on(p_employee uuid) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare scope uuid[];
begin
  if not app.has_role(array['central_garage_officer','transfer_station']) then return false; end if;
  scope := app.disclosure_scope_depts();
  if scope is null then return true; end if;
  return exists (select 1 from public.employees e where e.id = p_employee and e.archived_at is null and e.department_id = any(scope));
end$$;

-- ③ القائمة: نطاق 'garage' = موظفو قسم الكراج وفروعه
drop function if exists public.hr_leaves_list(text, date, date, text, uuid, text, int);
create or replace function public.hr_leaves_list(p_scope text, p_from date default null, p_to date default null, p_status text default null, p_department uuid default null, p_search text default null, p_limit int default 500)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, kind text, type_code text, type_name text, is_paid boolean, consumes_balance boolean,
              start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, status text, notes text, attachment_path text,
              manager_id uuid, manager_name text, requested_by uuid, decided_at timestamptz, decision_note text, cancelled_reason text, created_at timestamptz, can_decide boolean,
              is_backdated boolean, backdated_reason text, backdated_days int, can_cancel boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare me uuid := app.current_employee_id(); g_scope uuid[];
begin
  if p_scope = 'garage' then
    if not app.has_role(array['central_garage_officer','transfer_station','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
    g_scope := app.disclosure_scope_depts();
  end if;
  return query
  select l.id, l.employee_id, e.employee_number, e.full_name, d.name, l.kind, lt.code, lt.name, lt.is_paid, lt.consumes_balance,
         l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.status, l.notes, l.attachment_path,
         l.manager_id, m.full_name, l.requested_by, l.decided_at, l.decision_note, l.cancelled_reason, l.created_at,
         (l.status = 'pending' and app.hr_can_decide(l.id)), l.is_backdated, l.backdated_reason, l.backdated_days,
         (l.status = 'pending' and (l.requested_by = auth.uid() or app.has_role(array['hr_officer', 'super_admin']) or app.hr_can_decide(l.id)))
  from public.hr_leaves l
  join public.employees e on e.id = l.employee_id
  left join public.employees m on m.id = l.manager_id
  left join public.departments d on d.id = e.department_id
  left join public.hr_leave_types lt on lt.id = l.leave_type_id
  where case p_scope
          when 'mine' then l.employee_id = me
          when 'team' then (l.manager_id = me or e.manager_id = me or app.hr_can_decide(l.id))
          when 'garage' then (g_scope is null or e.department_id = any(g_scope))
          else app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) end
    and (p_from is null or l.end_date >= p_from) and (p_to is null or l.start_date <= p_to)
    and (p_status is null or l.status = p_status)
    and (p_department is null or e.department_id = p_department or e.department_id in (select dd.id from public.departments dd where dd.parent_id = p_department))
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by (l.status = 'pending') desc, l.created_at desc
  limit p_limit;
end$$;
grant execute on function public.hr_leaves_list(text, date, date, text, uuid, text, int) to authenticated;

-- ⑤ ملخص رأس الصفحة
create or replace function public.garage_leaves_summary() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare g_scope uuid[]; v_today date := app.hr_local_date(now()); r jsonb;
begin
  if not app.has_role(array['central_garage_officer','transfer_station','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  select jsonb_build_object(
    'pending',        count(*) filter (where l.status = 'pending'),
    'my_decisions',   count(*) filter (where l.status = 'pending' and app.hr_can_decide(l.id)),
    'on_leave_today', count(*) filter (where l.status = 'approved' and l.kind = 'leave' and l.start_date <= v_today and l.end_date >= v_today),
    'permits_month',  count(*) filter (where l.status = 'approved' and l.kind = 'time_permit' and date_trunc('month', l.start_date) = date_trunc('month', v_today)),
    'scoped',         g_scope is not null)
  into r
  from public.hr_leaves l join public.employees e on e.id = l.employee_id
  where e.archived_at is null and (g_scope is null or e.department_id = any(g_scope))
    and l.end_date >= v_today - 60;
  return r;
end$$;
grant execute on function public.garage_leaves_summary() to authenticated;
