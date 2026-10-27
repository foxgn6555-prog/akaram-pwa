-- 00305 · الكشوفات — فقرة «المُعدّون» لمعاون المدير المفوض (00360)
--   · public.disclosure_preparers(p_month): لكل موظف سجّل كشوفاً في الشهر: الجهة، المسجَّل، مسودة، قيد القرار، معتمد، مُعاد، ملغى، مبلغ المعتمد، ومقارنة بالشهر السابق.
--   · التجميع بحساب المستخدم (prepared_by) لا بالاسم النصي — تغيّر اسم العرض لا يقسم الموظف، وتشابه الأسماء لا يدمج اثنين. الاسم يُعرض من الموارد البشرية وقت القراءة.
--   · التصحيح نفسه في «حسب المُعدّ» داخل disclosure_report وdisclosure_stats.
--   · الشهر = شهر الكشف (period_month من تاريخ المخالفة) كبقية التقارير والاستقطاع.

create or replace function app.disclosure_preparer_unit(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when p_user is null then '—'
    when exists (select 1 from public.user_roles where user_id = p_user and role in ('ops_room', 'super_admin')) then 'غرفة العمليات'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'central_garage_officer') then 'الكراج المركزي'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'transfer_station') then 'المحطة التحويلية'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then 'مسؤول قاطع'
    else 'أخرى' end
$$;
revoke all on function app.disclosure_preparer_unit(uuid) from public, anon;

create or replace function public.disclosure_preparers(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, current_date))::date; pm date; v_rows jsonb; v_tot jsonb;
begin
  if not app.has_role(array['deputy_director', 'executive_director', 'super_admin', 'it_admin']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  pm := (m - interval '1 month')::date;
  with base as (
    select coalesce(d.prepared_by::text, 'name:' || coalesce(d.prepared_by_name, '—')) as k, d.prepared_by, d.prepared_by_name, d.period_month, d.status, d.amount, d.resubmit_count, d.created_at
    from public.disclosures d where d.archived_at is null and d.period_month in (m, pm)),
  cur as (
    select k, max(prepared_by::text)::uuid as uid, max(prepared_by_name) as nm, count(*) as registered,
      count(*) filter (where status = 'draft') as draft, count(*) filter (where status = 'pending') as pending, count(*) filter (where status = 'returned') as returned,
      count(*) filter (where status = 'approved') as approved, count(*) filter (where status = 'cancelled') as cancelled,
      count(*) filter (where resubmit_count > 0) as resubmitted, coalesce(sum(amount) filter (where status = 'approved'), 0) as amount_approved, max(created_at) as last_at
    from base where period_month = m group by k),
  prv as (select k, count(*) as registered, count(*) filter (where status = 'approved') as approved from base where period_month = pm group by k),
  allk as (select k from cur union select k from prv)
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', a.k, 'user_id', c.uid, 'name', coalesce(app.manager_display_name(c.uid), c.nm, (select max(prepared_by_name) from base b where b.k = a.k), '—'),
      'unit', app.disclosure_preparer_unit(coalesce(c.uid, (select max(prepared_by::text)::uuid from base b where b.k = a.k))),
      'registered', coalesce(c.registered, 0), 'draft', coalesce(c.draft, 0), 'pending', coalesce(c.pending, 0), 'returned', coalesce(c.returned, 0),
      'approved', coalesce(c.approved, 0), 'cancelled', coalesce(c.cancelled, 0), 'resubmitted', coalesce(c.resubmitted, 0), 'amount_approved', coalesce(c.amount_approved, 0),
      'approval_rate', case when coalesce(c.registered, 0) - coalesce(c.draft, 0) - coalesce(c.pending, 0) > 0
                            then round(100.0 * coalesce(c.approved, 0) / (coalesce(c.registered, 0) - coalesce(c.draft, 0) - coalesce(c.pending, 0)), 1) end,
      'prev_registered', coalesce(p.registered, 0), 'prev_approved', coalesce(p.approved, 0), 'delta', coalesce(c.registered, 0) - coalesce(p.registered, 0), 'last_at', c.last_at)
    order by coalesce(c.registered, 0) desc, coalesce(c.approved, 0) desc, coalesce(app.manager_display_name(c.uid), c.nm)), '[]'::jsonb)
  into v_rows from allk a left join cur c on c.k = a.k left join prv p on p.k = a.k;
  select jsonb_build_object('preparers', count(*) filter (where registered > 0), 'registered', coalesce(sum(registered), 0), 'draft', coalesce(sum(draft), 0), 'pending', coalesce(sum(pending), 0),
      'returned', coalesce(sum(returned), 0), 'approved', coalesce(sum(approved), 0), 'cancelled', coalesce(sum(cancelled), 0), 'amount_approved', coalesce(sum(amount_approved), 0),
      'prev_registered', coalesce(sum(prev_registered), 0), 'prev_approved', coalesce(sum(prev_approved), 0))
  into v_tot from jsonb_to_recordset(v_rows) as r(registered int, draft int, pending int, returned int, approved int, cancelled int, amount_approved numeric, prev_registered int, prev_approved int);
  return jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'prev_month', to_char(pm, 'YYYY-MM'), 'rows', v_rows, 'totals', v_tot,
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(x, 'YYYY-MM'), 'count', n) order by x desc), '[]'::jsonb)
               from (select period_month x, count(*) n from public.disclosures where archived_at is null group by period_month order by period_month desc limit 24) q));
end$$;
revoke all on function public.disclosure_preparers(date) from public, anon;
grant execute on function public.disclosure_preparers(date) to authenticated;

-- «حسب المُعدّ» في التقرير الشامل والإحصاءات: بالحساب لا بالاسم
create or replace function public.disclosure_report(p_from date, p_to date, p_type text default null, p_sector text default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare f date := coalesce(p_from, date_trunc('month', current_date)::date); t date := coalesce(p_to, (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if t < f then raise exception 'DISCLOSURE_RANGE_INVALID'; end if;
  if t - f > 400 then raise exception 'DISCLOSURE_RANGE_TOO_WIDE'; end if;
  return (
    with d as (
      select x.*, app.disclosure_deduction_state(x) as ded_state
      from public.disclosures x
      where x.log_date between f and t and x.archived_at is null and x.status <> 'draft'
        and (p_type is null or x.violation_type = p_type) and (p_sector is null or x.sector = p_sector))
    select jsonb_build_object(
      'from', f, 'to', t,
      'totals', (select jsonb_build_object('count', count(*), 'pending', count(*) filter (where status = 'pending'), 'returned', count(*) filter (where status = 'returned'),
                   'approved', count(*) filter (where status = 'approved'), 'cancelled', count(*) filter (where status = 'cancelled'),
                   'amount_approved', coalesce(sum(amount) filter (where status = 'approved'), 0), 'amount_pending', coalesce(sum(amount) filter (where status in ('pending','returned')), 0),
                   'employees', count(distinct employee_id) filter (where target_kind = 'employee'), 'vehicles', count(distinct coalesce(vehicle_id::text, db_number)) filter (where target_kind = 'vehicle'),
                   'avg_decision_hours', round(coalesce(avg(extract(epoch from (approved_at - submitted_at)) / 3600) filter (where status = 'approved' and submitted_at is not null and approved_at is not null), 0)::numeric, 1))
                 from d),
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'label', coalesce(ty.label, k), 'count', n, 'approved', a, 'amount', amt) order by n desc, k), '[]'::jsonb)
                  from (select violation_type k, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt from d group by violation_type) q
                  left join public.disclosure_types ty on ty.key = q.k),
      'by_penalty', (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(penalty_type, 'none'), 'count', n) order by n desc), '[]'::jsonb) from (select penalty_type, count(*) n from d group by penalty_type) q),
      'by_target', (select coalesce(jsonb_object_agg(target_kind, n), '{}'::jsonb) from (select target_kind, count(*) n from d group by target_kind) q),
      'by_sector', (select coalesce(jsonb_agg(jsonb_build_object('sector', coalesce(sector, 'غير محدد'), 'count', n, 'approved', a, 'amount', amt) order by n desc), '[]'::jsonb)
                    from (select sector, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt from d group by sector) q),
      'by_shift', (select coalesce(jsonb_object_agg(coalesce(shift, 'morning'), n), '{}'::jsonb) from (select shift, count(*) n from d group by shift) q),
      'by_preparer', (select coalesce(jsonb_agg(jsonb_build_object('user_id', uid, 'name', nm, 'unit', app.disclosure_preparer_unit(uid), 'count', n, 'approved', a, 'returned', r, 'pending', p, 'cancelled', c, 'amount', amt) order by n desc, nm), '[]'::jsonb)
                      from (select max(prepared_by::text)::uuid uid, coalesce(app.manager_display_name(max(prepared_by::text)::uuid), max(prepared_by_name), '—') nm, count(*) n,
                                   count(*) filter (where status = 'approved') a, count(*) filter (where resubmit_count > 0 or status = 'returned') r,
                                   count(*) filter (where status = 'pending') p, count(*) filter (where status = 'cancelled') c, coalesce(sum(amount) filter (where status = 'approved'), 0) amt
                            from d group by coalesce(prepared_by::text, 'name:' || coalesce(prepared_by_name, '—'))) q),
      'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(pm, 'YYYY-MM'), 'count', n, 'approved', a, 'amount', amt) order by pm), '[]'::jsonb)
                   from (select date_trunc('month', log_date)::date pm, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt from d group by 1) q),
      'top_employees', (select coalesce(jsonb_agg(jsonb_build_object('employee_id', employee_id, 'name', nm, 'employee_number', en, 'department', dp, 'count', n, 'approved', a, 'amount', amt) order by n desc, amt desc), '[]'::jsonb)
                        from (select employee_id, max(driver_name) nm, max(employee_number) en, max(department_name) dp, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt
                              from d where target_kind = 'employee' and employee_id is not null group by employee_id order by n desc, amt desc limit 15) q),
      'top_vehicles', (select coalesce(jsonb_agg(jsonb_build_object('db_number', db, 'driver_name', dn, 'contractor_name', cn, 'count', n, 'approved', a, 'amount', amt) order by n desc, amt desc), '[]'::jsonb)
                       from (select db_number db, max(driver_name) dn, max(contractor_name) cn, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt
                             from d where target_kind = 'vehicle' group by db_number order by n desc, amt desc limit 15) q),
      'deductions', (select jsonb_build_object(
                       'with_amount', count(*) filter (where status = 'approved' and amount > 0),
                       'posted', count(*) filter (where status = 'approved' and deduction_id is not null),
                       'awaiting_export', count(*) filter (where ded_state = 'awaiting_export'),
                       'exported', count(*) filter (where ded_state = 'exported'),
                       'approved_by_finance', count(*) filter (where ded_state = 'approved'),
                       'missing', count(*) filter (where ded_state = 'missing'),
                       'not_linked', count(*) filter (where status = 'approved' and amount > 0 and deduction_id is null),
                       'amount_posted', coalesce(sum(amount) filter (where status = 'approved' and deduction_id is not null), 0))
                     from d),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ref_no', ref_no, 'log_date', log_date, 'target_kind', target_kind, 'db_number', db_number, 'driver_name', driver_name,
                        'employee_number', employee_number, 'department_name', department_name, 'sector', sector, 'shift', shift, 'violation_type', violation_type, 'penalty_type', penalty_type,
                        'status', status, 'amount', amount, 'prepared_by_name', prepared_by_name, 'deduction_state', ded_state, 'approved_at', approved_at) order by log_date desc, created_at desc), '[]'::jsonb)
               from (select * from d order by log_date desc limit 2000) r)
    ));
end$$;
revoke all on function public.disclosure_report(date, date, text, text) from public, anon;
grant execute on function public.disclosure_report(date, date, text, text) to authenticated;

create or replace function public.disclosure_stats(p_month date default null) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, current_date))::date;
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer','transfer_station','admin_ops']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  perform app.disclosure_scope_check();  -- الكراج بلا قسم ⇒ GARAGE_NO_DEPARTMENT · مسؤول قاطع بلا قواطع ⇒ SECTOR_MANAGER_NOT_ASSIGNED
  return jsonb_build_object(
    'month', to_char(m, 'YYYY-MM'),
    'total', (select count(*) from public.disclosures where period_month = m and archived_at is null and app.disclosure_in_scope(disclosures)),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.disclosures where period_month = m and archived_at is null and app.disclosure_in_scope(disclosures) group by status) s),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'label', t.label, 'count', n) order by n desc), '[]'::jsonb) from (select violation_type, count(*) n from public.disclosures where period_month = m and archived_at is null and app.disclosure_in_scope(disclosures) group by violation_type) x join public.disclosure_types t on t.key = x.violation_type),
    'by_preparer', (select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'count', n) order by n desc, nm), '[]'::jsonb) from (select coalesce(app.manager_display_name(max(prepared_by::text)::uuid), max(prepared_by_name), '—') nm, count(*) n from public.disclosures where period_month = m and archived_at is null and app.disclosure_in_scope(disclosures) group by coalesce(prepared_by::text, 'name:' || coalesce(prepared_by_name, '—'))) x),
    'amount_approved', (select coalesce(sum(amount), 0) from public.disclosures where period_month = m and status = 'approved' and app.disclosure_in_scope(disclosures)),
    'amount_pending', (select coalesce(sum(amount), 0) from public.disclosures where period_month = m and status = 'pending' and app.disclosure_in_scope(disclosures)),
    'deductions_posted', (select count(*) from public.disclosures where period_month = m and deduction_id is not null and app.disclosure_in_scope(disclosures)),
    'inbox', (select count(*) from public.disclosures d where d.status = 'pending' and exists (select 1 from public.approval_tasks t where t.request_kind = 'disclosure' and t.request_id = d.id and t.status = 'pending' and auth.uid() = any(t.approvers))),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(pm, 'YYYY-MM'), 'count', n) order by pm desc), '[]'::jsonb) from (select period_month pm, count(*) n from public.disclosures where archived_at is null and app.disclosure_in_scope(disclosures) group by period_month order by pm desc limit 24) y));
end$$;
