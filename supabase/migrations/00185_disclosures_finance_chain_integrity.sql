-- 00185 · الكشوفات — الجولة A: سلامة سلسلة «كشف معتمد → استقطاع في الحضورية → كشف المالية»
--
-- ① استقطاع ناتج عن كشف لا يُحذف من صفحة الحضوريات (يُدار من وحدة الكشوفات فقط) — كان الحذف ممكناً بلا أثر على الكشف.
-- ② حالة التصدير: إن اعتُمد كشف بعد أن صدّرت غرفة العمليات الشهر (ولم تعتمده المالية بعد) → تُبلَّغ غرفة العمليات
--    «أعد تصدير الشهر» والكشف يعرض حالة استقطاعه (بانتظار التصدير / في كشف المالية / معتمد).
-- ③ `hr_month_export_status(p_month)`: آخر تصدير + عدد التغييرات بعده (تعديلات حضور/إعفاءات/استقطاعات) → لافتة في
--    الحضوريات وفي كشف المالية؛ واعتماد المالية لكشف قديم (توجد تغييرات بعده) يتطلب تأكيداً صريحاً (p_force).
-- ④ `hr_employee_month_deductions(p_employee, p_month)`: تفاصيل استقطاعات الموظف للشهر مع مرجع الكشف — للمالية وHR وغرفة العمليات.

-- ─── ① حماية استقطاع الكشف ────────────────────────────────────────────────────
create or replace function public.ops_deduction_delete(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare r record;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into r from public.hr_attendance_deductions where id = p_id;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if r.source_disclosure_id is not null then raise exception 'HR_DEDUCTION_FROM_DISCLOSURE'; end if;
  if app.hr_month_locked(r.period_month) then raise exception 'HR_MONTH_LOCKED'; end if;
  delete from public.hr_attendance_deductions where id = p_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, reason, actor)
  values (r.employee_id, r.period_month, 'deduction_delete', to_jsonb(r), trim(p_reason), auth.uid());
end$$;

-- ─── ③ حالة التصدير والتغييرات بعده ───────────────────────────────────────────
create or replace function app.hr_month_export_status(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  x as (select * from public.hr_month_exports, m where period_month = m.f and status in ('exported', 'approved') order by version desc limit 1)
  select case when x.id is null then jsonb_build_object('export_id', null, 'status', null, 'changes_after', 0, 'deductions_after', 0, 'disclosure_deductions_after', 0, 'needs_reexport', false)
    else jsonb_build_object(
      'export_id', x.id, 'version', x.version, 'status', x.status, 'exported_at', x.exported_at,
      'changes_after', (select count(*) from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve')),
      'deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at),
      'disclosure_deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at and d.source_disclosure_id is not null),
      'needs_reexport', x.status = 'exported' and exists (select 1 from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve')))
    end
  from (select 1) one left join x on true
$$;

create or replace function public.hr_month_export_status(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'it_admin', 'super_admin']) then app.hr_month_export_status(p_month) else '{}'::jsonb end
$$;
grant execute on function public.hr_month_export_status(date) to authenticated;

-- اعتماد المالية: إن وُجدت تغييرات بعد التصدير يلزم تأكيد صريح (الواجهة تعرض العدد وتطلب التأكيد)
drop function if exists public.finance_payroll_approve(uuid);
create or replace function public.finance_payroll_approve(p_export uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public, app as $$
declare x record; st jsonb;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into x from public.hr_month_exports where id = p_export;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if exists (select 1 from public.hr_month_export_rows where export_id = p_export and final_net is null) then raise exception 'HR_SALARY_MISSING'; end if;
  st := app.hr_month_export_status(x.period_month);
  if (st ->> 'needs_reexport')::boolean and not coalesce(p_force, false) then raise exception 'HR_EXPORT_STALE'; end if;
  update public.hr_month_exports set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_export;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select r.employee_id, x.period_month, 'approve', jsonb_build_object('export_id', p_export, 'final_net', r.final_net, 'forced_stale', (st ->> 'needs_reexport')::boolean and p_force), 'اعتماد رواتب الشهر', auth.uid()
  from public.hr_month_export_rows r where r.export_id = p_export;
end$$;
grant execute on function public.finance_payroll_approve(uuid, boolean) to authenticated;

-- ─── ② استقطاع كشف بعد تصدير الشهر → تبليغ غرفة العمليات بإعادة التصدير ──────
create or replace function app.hr_ded_disclosure_after_export() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare x record; d record; u uuid;
begin
  if new.source_disclosure_id is null then return new; end if;
  select * into x from public.hr_month_exports where period_month = new.period_month and status = 'exported' order by version desc limit 1;
  if not found then return new; end if;
  select ref_no into d from public.disclosures where id = new.source_disclosure_id;
  -- (حالة «بانتظار إعادة التصدير» تُحسب مباشرة في disclosure_deduction_state ولا تُخزَّن)
  for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'ops_room' loop
    perform app.hr_notify(u, 'أعد تصدير شهر ' || to_char(new.period_month, 'YYYY-MM') || ' إلى المالية',
      'اعتُمد الكشف ' || coalesce(d.ref_no, '') || ' بمبلغ ' || to_char(new.amount, 'FM999,999,999') || ' د.ع بعد تصدير الشهر — لن يظهر في كشف الرواتب حتى إعادة التصدير',
      '/ops-room/attendance', 'reexport_needed:' || new.period_month::text || ':' || new.source_disclosure_id::text, 'warning');
  end loop;
  return new;
end$$;
drop trigger if exists trg_hr_ded_disclosure_after_export on public.hr_attendance_deductions;
create trigger trg_hr_ded_disclosure_after_export after insert on public.hr_attendance_deductions
  for each row execute function app.hr_ded_disclosure_after_export();

-- حالة استقطاع الكشف في بيانات الكشف
create or replace function app.disclosure_deduction_state(d public.disclosures) returns text
language sql stable security definer set search_path = public, app as $$
  select case
    when d.deduction_id is null then null
    when not exists (select 1 from public.hr_attendance_deductions where id = d.deduction_id) then 'missing'
    else coalesce((select case when x.status = 'approved' then 'approved' else 'exported' end
                   from public.hr_month_exports x, public.hr_attendance_deductions dd
                   where dd.id = d.deduction_id and x.period_month = dd.period_month and x.status in ('exported', 'approved') and x.exported_at >= dd.created_at
                   order by x.version desc limit 1), 'awaiting_export')
  end $$;

create or replace function app.disclosure_json(d public.disclosures) returns jsonb language sql stable security definer set search_path = public, app as $$
  select to_jsonb(d) - 'created_by' || jsonb_build_object(
    'type_label', (select label from public.disclosure_types where key = d.violation_type),
    'target_label', app.disclosure_target_label(d),
    'amount_by_name', app.manager_display_name(d.amount_by),
    'returned_by_name', app.manager_display_name(d.returned_by),
    'approved_by_name', app.manager_display_name(d.approved_by),
    'cancelled_by_name', app.manager_display_name(d.cancelled_by),
    'current_step', (select t.step_label from public.approval_tasks t where t.request_kind = 'disclosure' and t.request_id = d.id and t.status = 'pending' order by t.step_no limit 1),
    'current_approvers', (select coalesce(jsonb_agg(app.manager_display_name(a)), '[]'::jsonb) from public.approval_tasks t, unnest(t.approvers) a where t.request_kind = 'disclosure' and t.request_id = d.id and t.status = 'pending'),
    'can_decide', (auth.uid() = any(app.approval_current_approvers('disclosure', d.id))),
    'employee_name', (select full_name from public.employees where id = d.employee_id),
    'deduction_posted', d.deduction_id is not null,
    'deduction_state', app.disclosure_deduction_state(d)) $$;

-- ─── ④ تفاصيل استقطاعات الموظف للشهر (مع مرجع الكشف) ─────────────────────────
create or replace function public.hr_employee_month_deductions(p_employee uuid, p_month date)
returns table(id uuid, amount numeric, days numeric, reason text, created_at timestamptz, created_by_name text,
              source_disclosure_id uuid, disclosure_ref text, disclosure_type text, disclosure_date date)
language sql stable security definer set search_path = public, app as $$
  select d.id, d.amount, d.days, d.reason, d.created_at, app.manager_display_name(d.created_by),
         d.source_disclosure_id, x.ref_no, (select label from public.disclosure_types where key = x.violation_type), x.log_date
  from public.hr_attendance_deductions d
  left join public.disclosures x on x.id = d.source_disclosure_id
  where app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'it_admin', 'super_admin'])
    and d.employee_id = p_employee and d.period_month = date_trunc('month', p_month)::date
  order by d.created_at
$$;
grant execute on function public.hr_employee_month_deductions(uuid, date) to authenticated;
