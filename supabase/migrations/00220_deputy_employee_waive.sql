-- 00220 · 00249 — إعفاء موظف بعينه من كل استقطاعات الشهر (بسبب) دون المساس ببقية الموظفين، وإلغاء الإعفاء الكلي
-- يُسجَّل كإعفاء على الأنواع الأربعة للصف نفسه فقط (نقص ساعات/غياب/يدوي/غرامات)، ولا يغيّر نسبة التخفيض العام ولا صفوف الآخرين.

create or replace function public.deputy_employee_waive(p_row uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare r public.hr_month_export_rows; x public.hr_month_exports; before_b jsonb; after_b jsonb; e jsonb; k text; j jsonb := '{}'::jsonb;
begin
  select * into r from public.hr_month_export_rows where id = p_row;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  x := app.deputy_assert_editable(r.export_id);
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  before_b := app.deputy_row_breakdown(r, x.review_pct);
  if (before_b ->> 'reviewable_total')::numeric <= 0 then raise exception 'HR_NOTHING_TO_WAIVE'; end if;
  e := jsonb_build_object('mode', 'waive', 'amount', 0, 'reason', trim(p_reason), 'by', auth.uid(), 'at', now(), 'employee_waive', true);
  foreach k in array array['shortfall', 'absence', 'ops', 'fines'] loop
    if (before_b -> k ->> 'original')::numeric > 0 then j := j || jsonb_build_object(k, e); end if;
  end loop;
  update public.hr_month_export_rows set review_relief = review_relief || j, review_note = coalesce(nullif(review_note, ''), 'إعفاء كلي: ' || trim(p_reason)) where id = p_row;
  perform app.deputy_recompute(r.export_id);
  select * into r from public.hr_month_export_rows where id = p_row;
  after_b := app.deputy_row_breakdown(r, x.review_pct);
  insert into public.hr_deduction_review_audit (export_id, row_id, employee_id, action, kind, before, after, reason, actor)
  values (r.export_id, p_row, r.employee_id, 'waive', null, jsonb_build_object('relief_total', before_b ->> 'relief_total', 'reviewable_total', before_b ->> 'reviewable_total'),
          jsonb_build_object('relief', after_b ->> 'relief_total', 'employee_waive', true), trim(p_reason), auth.uid());
  return after_b;
end$$;
grant execute on function public.deputy_employee_waive(uuid, text) to authenticated;

create or replace function public.deputy_employee_restore(p_row uuid)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare r public.hr_month_export_rows; x public.hr_month_exports; before_b jsonb; after_b jsonb;
begin
  select * into r from public.hr_month_export_rows where id = p_row;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  x := app.deputy_assert_editable(r.export_id);
  before_b := app.deputy_row_breakdown(r, x.review_pct);
  update public.hr_month_export_rows set review_relief = '{}'::jsonb, review_note = case when review_note like 'إعفاء كلي:%' then null else review_note end where id = p_row;
  perform app.deputy_recompute(r.export_id);
  select * into r from public.hr_month_export_rows where id = p_row;
  after_b := app.deputy_row_breakdown(r, x.review_pct);
  insert into public.hr_deduction_review_audit (export_id, row_id, employee_id, action, kind, before, after, actor)
  values (r.export_id, p_row, r.employee_id, 'clear', null, jsonb_build_object('relief_total', before_b ->> 'relief_total'), jsonb_build_object('relief', after_b ->> 'relief_total', 'employee_restore', true), auth.uid());
  return after_b;
end$$;
grant execute on function public.deputy_employee_restore(uuid) to authenticated;

-- عمود «معفى كلياً» في قائمة المراجعة
drop function if exists public.deputy_deduction_review(date);
create or replace function public.deputy_deduction_review(p_month date)
returns table(export_id uuid, export_version int, review_status text, review_pct numeric, row_id uuid, employee_id uuid, employee_number text, full_name text,
  department_name text, branch_name text, job_title text, pay_type text, shift_minutes int, day_rate numeric,
  shortfall_minutes int, shortfall_amount numeric, absence_days numeric, absence_amount numeric, ops_amount numeric, ops_reasons text, fines_amount numeric, fines_count int,
  reviewable_total numeric, relief_total numeric, pct_relief numeric, deductions_total numeric, deductions_after numeric, gross_amount numeric, proposed_net numeric, final_net numeric,
  review_note text, breakdown jsonb, hour_bank_enabled boolean, employee_waived boolean)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1),
  rows_b as (select r, app.deputy_row_breakdown(r, x.review_pct) as b, x.version as ver, x.review_status as rs, x.review_pct as pct from x join public.hr_month_export_rows r on r.export_id = x.id)
  select (r).export_id, ver, rs, pct, (r).id, (r).employee_id, (r).employee_number, (r).full_name, (r).department_name, (r).branch_name, (r).job_title, (r).pay_type, (r).shift_minutes, (r).day_rate,
         (r).auto_deduction_minutes, (b -> 'shortfall' ->> 'original')::numeric,
         coalesce((r).auto_absence_days, 0), (b -> 'absence' ->> 'original')::numeric,
         (b -> 'ops' ->> 'original')::numeric, (r).ops_deduction_reasons, (b -> 'fines' ->> 'original')::numeric,
         (select count(*)::int from public.hr_attendance_deductions d where d.employee_id = (r).employee_id and d.period_month = date_trunc('month', p_month)::date and d.source_disclosure_id is not null),
         (b ->> 'reviewable_total')::numeric, (b ->> 'relief_total')::numeric, (b ->> 'pct_relief')::numeric, (r).deductions_total, (b ->> 'deductions_after')::numeric,
         (r).gross_amount, (r).proposed_net, (r).final_net, (r).review_note, b, (r).hour_bank_enabled,
         (b ->> 'reviewable_total')::numeric > 0 and (b ->> 'relief_total')::numeric >= (b ->> 'reviewable_total')::numeric
  from rows_b
  where app.has_role(array['deputy_director', 'finance_officer', 'super_admin'])
  order by (r).department_name nulls last, app.hr_employee_sort_key((r).employee_number), (r).full_name
$$;
grant execute on function public.deputy_deduction_review(date) to authenticated;
