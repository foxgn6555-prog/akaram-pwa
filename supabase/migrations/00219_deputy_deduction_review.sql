-- 00219 · 00247 — مرحلة «معاون المدير المفوض» لمراجعة الاستقطاعات (إلزامية بين تصدير غرفة العمليات واطّلاع المالية)
-- المسار: البصمة → غرفة العمليات (تعديلات محدودة، تصدير) → معاون المدير المفوض (إعفاء كلي بسبب / تعديل مبلغ / تخفيض % للجميع / اعتماد) → المالية.
-- المالية لا ترى كشف الشهر ولا تعتمده قبل اعتماد المعاون. كل تصدير جديد من غرفة العمليات يعيد المراجعة إلى «بانتظار».
-- أنواع الاستقطاع المراجَعة: shortfall (نقص ساعات/تأخير) · absence (غياب) · ops (استقطاعات غرفة العمليات اليدوية) · fines (غرامات الكشوفات المعتمدة).
-- التخفيف لا يمسّ أرقام التصدير الأصلية (deductions_total/proposed_net تبقى كما حسبها المحرّك)، بل يُسجَّل تخفيفاً منفصلاً ويُحدَّث الصافي النهائي.

alter table public.hr_month_exports add column if not exists review_status text not null default 'pending' check (review_status in ('pending', 'approved'));
alter table public.hr_month_exports add column if not exists reviewed_by uuid references auth.users (id) on delete set null;
alter table public.hr_month_exports add column if not exists reviewed_at timestamptz;
alter table public.hr_month_exports add column if not exists review_pct numeric(5, 2) not null default 0 check (review_pct >= 0 and review_pct <= 100);
alter table public.hr_month_exports add column if not exists review_pct_reason text;

alter table public.hr_month_export_rows add column if not exists review_relief jsonb not null default '{}'::jsonb;   -- {kind: {mode, amount, reason}}
alter table public.hr_month_export_rows add column if not exists review_relief_amount numeric(14, 2) not null default 0;
alter table public.hr_month_export_rows add column if not exists review_note text;

-- التصديرات القديمة المعتمدة من المالية تُعدّ مراجَعة (لا نكسر الأشهر المقفلة)
update public.hr_month_exports set review_status = 'approved', reviewed_at = coalesce(approved_at, now()) where status = 'approved' and review_status = 'pending';

alter table public.hr_attendance_audit drop constraint if exists hr_attendance_audit_action_check;
alter table public.hr_attendance_audit add constraint hr_attendance_audit_action_check
  check (action in ('edit', 'reset_auto', 'deduction_add', 'deduction_delete', 'export', 'approve', 'waive', 'unwaive', 'confirm', 'reopen', 'auto_blocked', 'deputy_approve'));

create table if not exists public.hr_deduction_review_audit (
  id          uuid primary key default gen_random_uuid(),
  export_id   uuid not null references public.hr_month_exports (id) on delete cascade,
  row_id      uuid references public.hr_month_export_rows (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete cascade,
  action      text not null check (action in ('waive', 'amount', 'clear', 'percent', 'approve', 'reopen')),
  kind        text check (kind in ('shortfall', 'absence', 'ops', 'fines')),
  before      jsonb, after jsonb,
  reason      text,
  actor       uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_hr_ded_review_audit_export on public.hr_deduction_review_audit (export_id, created_at desc);
alter table public.hr_deduction_review_audit enable row level security;
drop policy if exists "ded_review_audit: قراءة" on public.hr_deduction_review_audit;
create policy "ded_review_audit: قراءة" on public.hr_deduction_review_audit for select to authenticated
  using (app.has_role(array['deputy_director', 'finance_officer', 'super_admin']));

create or replace function app.deputy_roles() returns text[] language sql immutable as $$ select array['deputy_director', 'super_admin']::text[] $$;

-- تفكيك استقطاعات صف التصدير إلى أنواعه الأربعة + التخفيف الحالي + الصافي بعد المراجعة
create or replace function app.deputy_row_breakdown(p_row public.hr_month_export_rows, p_pct numeric) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare r public.hr_month_export_rows := p_row;
        v_minute_rate numeric; v_short numeric; v_abs numeric; v_ops numeric; v_fines numeric; v_fix_min numeric;
        k text; orig numeric; rel numeric; mode text; total_rel numeric := 0; remaining numeric := 0; pct_rel numeric; j jsonb := '{}'::jsonb; e jsonb;
begin
  -- نقص الساعات: أجر الدقيقة × الدقائق (أو المبلغ الثابت للدقيقة إن كانت القاعدة ثابتة)، ولا يتجاوز مبلغ الاستقطاع التلقائي كله
  v_minute_rate := case when coalesce(r.pay_type, '') = 'daily' then round(coalesce(r.daily_rate, 0) / greatest(coalesce(r.shift_minutes, 480), 1), 4)
                        else round(coalesce(r.day_rate, 0) / greatest(coalesce(r.shift_minutes, 480), 1), 4) end;
  if r.auto_deduction_basis = 'fixed' then
    select coalesce((x ->> 'fixed_shortfall_minute_amount')::numeric, 0) into v_fix_min from app.hr_deduction_rule_for(r.employee_id, (select period_month from public.hr_month_exports where id = r.export_id)) x;
    v_short := round(coalesce(v_fix_min, 0) * coalesce(r.auto_deduction_minutes, 0), 2);
  elsif r.auto_deduction_basis = 'disabled' then v_short := 0;
  else v_short := round(v_minute_rate * coalesce(r.auto_deduction_minutes, 0), 2);
  end if;
  v_short := least(v_short, coalesce(r.auto_deduction_amount, 0));
  v_abs := greatest(0, round(coalesce(r.auto_deduction_amount, 0) - v_short, 2));
  -- اليدوية والغرامات من سجل استقطاعات الشهر (المصدر نفسه الذي قرأه التصدير)
  select coalesce(sum(case when d.source_disclosure_id is null then d.amount + round(d.days * coalesce(r.day_rate, 0), 2) else 0 end), 0),
         coalesce(sum(case when d.source_disclosure_id is not null then d.amount + round(d.days * coalesce(r.day_rate, 0), 2) else 0 end), 0)
    into v_ops, v_fines
  from public.hr_attendance_deductions d join public.hr_month_exports x on x.id = r.export_id
  where d.employee_id = r.employee_id and d.period_month = x.period_month and d.created_at <= x.exported_at;
  -- إن اختلف السجل الحي عن المخزَّن (استقطاع أُضيف بعد التصدير) نلتزم بالمخزَّن في الصف
  if round(v_ops + v_fines, 2) <> round(coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0), 2) then
    v_ops := greatest(0, round(coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0) - v_fines, 2));
  end if;

  foreach k in array array['shortfall', 'absence', 'ops', 'fines'] loop
    orig := case k when 'shortfall' then v_short when 'absence' then v_abs when 'ops' then v_ops else v_fines end;
    e := coalesce(r.review_relief -> k, '{}'::jsonb);
    mode := e ->> 'mode';
    rel := case when mode = 'waive' then orig when mode = 'amount' then greatest(0, orig - coalesce((e ->> 'amount')::numeric, orig)) else 0 end;
    rel := least(rel, orig);
    total_rel := total_rel + rel; remaining := remaining + (orig - rel);
    j := j || jsonb_build_object(k, jsonb_build_object('original', orig, 'relief', rel, 'after', round(orig - rel, 2), 'mode', coalesce(mode, 'none'), 'reason', e ->> 'reason', 'set_amount', (e ->> 'amount')::numeric));
  end loop;
  pct_rel := round(remaining * coalesce(p_pct, 0) / 100, 2);
  total_rel := round(total_rel + pct_rel, 2);
  return j || jsonb_build_object(
    'pct', coalesce(p_pct, 0), 'pct_relief', pct_rel,
    'reviewable_total', round(v_short + v_abs + v_ops + v_fines, 2),
    'relief_total', total_rel,
    'deductions_after', greatest(0, round(coalesce(r.deductions_total, 0) - total_rel, 2)),
    'final_net_after', case when r.pay_type is null then null else greatest(0, round(coalesce(r.gross_amount, 0) - (coalesce(r.deductions_total, 0) - total_rel), 2)) end,
    'minute_rate', v_minute_rate);
end$$;

-- إعادة احتساب التخفيف والصافي لصفوف تصدير (تُستدعى بعد كل تعديل)
create or replace function app.deputy_recompute(p_export uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare x record; r public.hr_month_export_rows; b jsonb;
begin
  select * into x from public.hr_month_exports where id = p_export;
  for r in select * from public.hr_month_export_rows where export_id = p_export loop
    b := app.deputy_row_breakdown(r, x.review_pct);
    update public.hr_month_export_rows
       set review_relief_amount = (b ->> 'relief_total')::numeric,
           final_net = case when pay_type is null then null when adjusted_at is not null then final_net else (b ->> 'final_net_after')::numeric end
     where id = r.id;
  end loop;
end$$;

create or replace function app.deputy_assert_editable(p_export uuid) returns public.hr_month_exports
language plpgsql stable security definer set search_path = public, app as $$
declare x public.hr_month_exports;
begin
  if not app.has_role(app.deputy_roles()) then raise exception 'HR_FORBIDDEN'; end if;
  select * into x from public.hr_month_exports where id = p_export;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if x.review_status = 'approved' then raise exception 'HR_REVIEW_APPROVED'; end if;
  return x;
end$$;

-- ── واجهات المعاون ──
-- الأشهر: آخر تصدير لكل شهر مع حالته ومجاميعه
create or replace function public.deputy_payroll_months()
returns table(period_month date, export_id uuid, version int, export_status text, exported_at timestamptz, review_status text, reviewed_at timestamptz, reviewed_by_name text,
  review_pct numeric, rows_count int, employees_with_deductions int, deductions_total numeric, relief_total numeric, net_total numeric)
language sql stable security definer set search_path = public, app as $$
  with x as (select distinct on (period_month) * from public.hr_month_exports where status in ('exported', 'approved') order by period_month desc, version desc)
  select x.period_month, x.id, x.version, x.status, x.exported_at, x.review_status, x.reviewed_at, case when x.reviewed_by is null then null else app.manager_display_name(x.reviewed_by) end, x.review_pct, x.rows_count,
         (select count(*)::int from public.hr_month_export_rows r where r.export_id = x.id and coalesce(r.auto_deduction_amount, 0) + coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0) > 0),
         (select coalesce(sum(coalesce(r.auto_deduction_amount, 0) + coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0)), 0) from public.hr_month_export_rows r where r.export_id = x.id),
         (select coalesce(sum(r.review_relief_amount), 0) from public.hr_month_export_rows r where r.export_id = x.id),
         (select coalesce(sum(r.final_net), 0) from public.hr_month_export_rows r where r.export_id = x.id)
  from x
  where app.has_role(array['deputy_director', 'finance_officer', 'super_admin'])
  order by x.period_month desc
$$;
grant execute on function public.deputy_payroll_months() to authenticated;

-- قائمة الموظفين لشهر: كل موظف مع استقطاعاته مفكّكة والتخفيف والصافي بعد المراجعة (بلا أساسي/مخصصات — فقط ما يخص الاستقطاع)
create or replace function public.deputy_deduction_review(p_month date)
returns table(export_id uuid, export_version int, review_status text, review_pct numeric, row_id uuid, employee_id uuid, employee_number text, full_name text,
  department_name text, branch_name text, job_title text, pay_type text, shift_minutes int, day_rate numeric,
  shortfall_minutes int, shortfall_amount numeric, absence_days numeric, absence_amount numeric, ops_amount numeric, ops_reasons text, fines_amount numeric, fines_count int,
  reviewable_total numeric, relief_total numeric, pct_relief numeric, deductions_total numeric, deductions_after numeric, gross_amount numeric, proposed_net numeric, final_net numeric,
  review_note text, breakdown jsonb, hour_bank_enabled boolean)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1),
  rows_b as (select r, app.deputy_row_breakdown(r, x.review_pct) as b, x.version as ver, x.review_status as rs, x.review_pct as pct from x join public.hr_month_export_rows r on r.export_id = x.id)
  select (r).export_id, ver, rs, pct, (r).id, (r).employee_id, (r).employee_number, (r).full_name, (r).department_name, (r).branch_name, (r).job_title, (r).pay_type, (r).shift_minutes, (r).day_rate,
         (r).auto_deduction_minutes, (b -> 'shortfall' ->> 'original')::numeric,
         coalesce((r).auto_absence_days, 0), (b -> 'absence' ->> 'original')::numeric,
         (b -> 'ops' ->> 'original')::numeric, (r).ops_deduction_reasons, (b -> 'fines' ->> 'original')::numeric,
         (select count(*)::int from public.hr_attendance_deductions d where d.employee_id = (r).employee_id and d.period_month = date_trunc('month', p_month)::date and d.source_disclosure_id is not null),
         (b ->> 'reviewable_total')::numeric, (b ->> 'relief_total')::numeric, (b ->> 'pct_relief')::numeric, (r).deductions_total, (b ->> 'deductions_after')::numeric,
         (r).gross_amount, (r).proposed_net, (r).final_net, (r).review_note, b, (r).hour_bank_enabled
  from rows_b
  where app.has_role(array['deputy_director', 'finance_officer', 'super_admin'])
  order by (r).department_name nulls last, app.hr_employee_sort_key((r).employee_number), (r).full_name
$$;
grant execute on function public.deputy_deduction_review(date) to authenticated;

-- إعفاء كلي لنوع / تعديل مبلغه يدوياً / إلغاء التخفيف — بسبب إلزامي
create or replace function public.deputy_deduction_adjust(p_row uuid, p_kind text, p_mode text, p_amount numeric default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare r public.hr_month_export_rows; x public.hr_month_exports; before_b jsonb; after_b jsonb; orig numeric; e jsonb;
begin
  select * into r from public.hr_month_export_rows where id = p_row;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  x := app.deputy_assert_editable(r.export_id);
  if p_kind not in ('shortfall', 'absence', 'ops', 'fines') then raise exception 'HR_KIND_INVALID'; end if;
  if p_mode not in ('waive', 'amount', 'clear') then raise exception 'HR_MODE_INVALID'; end if;
  if p_mode <> 'clear' and coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  before_b := app.deputy_row_breakdown(r, x.review_pct);
  orig := (before_b -> p_kind ->> 'original')::numeric;
  if p_mode = 'amount' then
    if p_amount is null or p_amount < 0 then raise exception 'HR_AMOUNT_INVALID'; end if;
    if p_amount > orig then raise exception 'HR_AMOUNT_ABOVE_ORIGINAL'; end if;
  end if;
  if p_mode = 'clear' then
    update public.hr_month_export_rows set review_relief = review_relief - p_kind where id = p_row;
  else
    e := jsonb_build_object('mode', p_mode, 'amount', case when p_mode = 'amount' then round(p_amount, 2) else 0 end, 'reason', trim(p_reason), 'by', auth.uid(), 'at', now());
    update public.hr_month_export_rows set review_relief = review_relief || jsonb_build_object(p_kind, e) where id = p_row;
  end if;
  perform app.deputy_recompute(r.export_id);
  select * into r from public.hr_month_export_rows where id = p_row;
  after_b := app.deputy_row_breakdown(r, x.review_pct);
  insert into public.hr_deduction_review_audit (export_id, row_id, employee_id, action, kind, before, after, reason, actor)
  values (r.export_id, p_row, r.employee_id, p_mode, p_kind, before_b -> p_kind, after_b -> p_kind, nullif(trim(p_reason), ''), auth.uid());
  return after_b;
end$$;
grant execute on function public.deputy_deduction_adjust(uuid, text, text, numeric, text) to authenticated;

-- تخفيض بنسبة مئوية يُطبَّق على ما تبقى من استقطاعات الجميع (بعد الإعفاءات الفردية)
create or replace function public.deputy_deduction_percent(p_export uuid, p_pct numeric, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare x public.hr_month_exports;
begin
  x := app.deputy_assert_editable(p_export);
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'HR_PCT_INVALID'; end if;
  if p_pct > 0 and coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  update public.hr_month_exports set review_pct = round(p_pct, 2), review_pct_reason = nullif(trim(p_reason), '') where id = p_export;
  perform app.deputy_recompute(p_export);
  insert into public.hr_deduction_review_audit (export_id, action, before, after, reason, actor)
  values (p_export, 'percent', jsonb_build_object('pct', x.review_pct), jsonb_build_object('pct', round(p_pct, 2)), nullif(trim(p_reason), ''), auth.uid());
end$$;
grant execute on function public.deputy_deduction_percent(uuid, numeric, text) to authenticated;

-- ملاحظة حرة على صف (اختيارية)
create or replace function public.deputy_deduction_note(p_row uuid, p_note text)
returns void language plpgsql security definer set search_path = public, app as $$
declare r public.hr_month_export_rows;
begin
  select * into r from public.hr_month_export_rows where id = p_row;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  perform app.deputy_assert_editable(r.export_id);
  update public.hr_month_export_rows set review_note = nullif(trim(p_note), '') where id = p_row;
end$$;
grant execute on function public.deputy_deduction_note(uuid, text) to authenticated;

-- اعتماد المعاون ⇒ الشهر يصبح مرئياً للمالية (مع إشعارها)
create or replace function public.deputy_payroll_approve(p_export uuid)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare x public.hr_month_exports; t record;
begin
  x := app.deputy_assert_editable(p_export);
  perform app.deputy_recompute(p_export);
  update public.hr_month_exports set review_status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_export;
  select count(*)::int as n, coalesce(sum(review_relief_amount), 0) as relief, count(*) filter (where review_relief_amount > 0)::int as n_relief into t from public.hr_month_export_rows where export_id = p_export;
  insert into public.hr_deduction_review_audit (export_id, action, after, actor)
  values (p_export, 'approve', jsonb_build_object('rows', t.n, 'relief_total', t.relief, 'rows_with_relief', t.n_relief, 'pct', x.review_pct), auth.uid());
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select r.employee_id, x.period_month, 'deputy_approve', jsonb_build_object('export_id', p_export, 'relief', r.review_relief_amount, 'final_net', r.final_net), 'اعتماد معاون المدير المفوض لاستقطاعات الشهر', auth.uid()
  from public.hr_month_export_rows r where r.export_id = p_export;
  perform app.notify_by_role(array['finance_officer'], 'كشف رواتب ' || to_char(x.period_month, 'YYYY-MM') || ' جاهز للمالية',
    'اعتمد معاون المدير المفوض استقطاعات الشهر' || case when t.relief > 0 then ' (تخفيف إجمالي ' || to_char(t.relief, 'FM999,999,999,990') || ' د.ع على ' || t.n_relief || ' موظفاً)' else ' بلا تخفيف' end, 'info', '/finance/payroll');
  return jsonb_build_object('export_id', p_export, 'rows', t.n, 'relief_total', t.relief, 'rows_with_relief', t.n_relief);
end$$;
grant execute on function public.deputy_payroll_approve(uuid) to authenticated;

-- إعادة فتح المراجعة (قبل اعتماد المالية فقط)
create or replace function public.deputy_review_reopen(p_export uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare x public.hr_month_exports;
begin
  if not app.has_role(app.deputy_roles()) then raise exception 'HR_FORBIDDEN'; end if;
  select * into x from public.hr_month_exports where id = p_export;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if x.review_status <> 'approved' then raise exception 'HR_REVIEW_NOT_APPROVED'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  update public.hr_month_exports set review_status = 'pending', reviewed_by = null, reviewed_at = null where id = p_export;
  insert into public.hr_deduction_review_audit (export_id, action, reason, actor) values (p_export, 'reopen', trim(p_reason), auth.uid());
end$$;
grant execute on function public.deputy_review_reopen(uuid, text) to authenticated;

create or replace function public.deputy_review_audit(p_export uuid)
returns table(id uuid, row_id uuid, employee_number text, full_name text, action text, kind text, before jsonb, after jsonb, reason text, actor_name text, created_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.row_id, r.employee_number, r.full_name, a.action, a.kind, a.before, a.after, a.reason, case when a.actor is null then null else app.manager_display_name(a.actor) end, a.created_at
  from public.hr_deduction_review_audit a left join public.hr_month_export_rows r on r.id = a.row_id
  where a.export_id = p_export and app.has_role(array['deputy_director', 'finance_officer', 'super_admin'])
  order by a.created_at desc
$$;
grant execute on function public.deputy_review_audit(uuid) to authenticated;

-- اعتماد المعاون ليس «تغييراً بعد التصدير» (لا يستوجب إعادة تصدير)
create or replace function app.hr_month_export_status(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  x as (select * from public.hr_month_exports, m where period_month = m.f and status in ('exported', 'approved') order by version desc limit 1),
  cov as (select coalesce(sum(unevaluated_days), 0)::int as unevaluated, count(*) filter (where unevaluated_days > 0)::int as employees from app.hr_month_coverage(p_month))
  select case when x.id is null then jsonb_build_object('export_id', null, 'status', null, 'changes_after', 0, 'deductions_after', 0, 'disclosure_deductions_after', 0, 'needs_reexport', false,
                                                       'unevaluated_days', cov.unevaluated, 'unevaluated_employees', cov.employees)
    else jsonb_build_object(
      'export_id', x.id, 'version', x.version, 'status', x.status, 'exported_at', x.exported_at,
      'changes_after', (select count(*) from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve', 'deputy_approve')),
      'deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at),
      'disclosure_deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at and d.source_disclosure_id is not null),
      'needs_reexport', x.status = 'exported' and exists (select 1 from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve', 'deputy_approve')),
      'unevaluated_days', case when x.status = 'approved' then 0 else cov.unevaluated end,
      'unevaluated_employees', case when x.status = 'approved' then 0 else cov.employees end)
    end
  from (select 1) one cross join cov left join x on true
$$;

-- ── بوابة المالية: لا كشف قبل اعتماد المعاون ──
create or replace function app.hr_export_visible_to_finance(x public.hr_month_exports) returns boolean
language sql stable security definer set search_path = public, app as $$
  select x.review_status = 'approved' or app.has_role(array['super_admin'])
$$;

drop function if exists public.finance_payroll_sheet(date);
create or replace function public.finance_payroll_sheet(p_month date)
returns table(export_id uuid, export_version int, export_status text, exported_at timestamptz, row_id uuid, employee_id uuid, employee_number text, full_name text,
  department_name text, branch_name text, job_title text, contract_type text, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
  days_leave int, late_minutes int, early_minutes int, ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  auto_deduction_minutes int, auto_deduction_days numeric, auto_deduction_amount numeric, overtime_minutes int, shortfall_minutes int,
  pay_type text, base_salary numeric, daily_rate numeric, allowances_total numeric, fixed_deductions_total numeric, proposed_net numeric, final_net numeric, finance_note text,
  days_leave_paid int, days_leave_unpaid int, auto_absence_days numeric, auto_shortfall_days numeric, ops_deduction_days_amount numeric,
  payable_days numeric, gross_amount numeric, deductions_total numeric, scheduled_days int, unevaluated_days int, shift_minutes int,
  period_from date, period_to date, covered_days int, days_in_month int, day_rate numeric, proration_ratio numeric, auto_deduction_capped boolean,
  auto_deduction_basis text, auto_deduction_days_capped boolean, advance_installment numeric, auto_deduction_rule text, days_rest int, salary_model text,
  hour_bank_enabled boolean, hour_bank_required_minutes int, hour_bank_credited_minutes int, hour_bank_net_minutes int, hour_bank_credit_days numeric,
  review_status text, reviewed_at timestamptz, review_pct numeric, review_relief_amount numeric, review_note text, review_relief jsonb)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1)
  select x.id, x.version, x.status, x.exported_at, r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons,
         r.auto_deduction_minutes, r.auto_deduction_days, r.auto_deduction_amount, r.overtime_minutes, r.shortfall_minutes,
         r.pay_type, r.base_salary, r.daily_rate, r.allowances_total, r.fixed_deductions_total,
         r.proposed_net, r.final_net, r.finance_note,
         r.days_leave_paid, r.days_leave_unpaid, r.auto_absence_days, r.auto_shortfall_days, r.ops_deduction_days_amount,
         r.payable_days, r.gross_amount, r.deductions_total, r.scheduled_days, r.unevaluated_days, r.shift_minutes,
         r.period_from, r.period_to, r.covered_days, r.days_in_month, r.day_rate, r.proration_ratio, r.auto_deduction_capped,
         r.auto_deduction_basis, r.auto_deduction_days_capped, r.advance_installment, r.auto_deduction_rule, r.days_rest, r.salary_model,
         r.hour_bank_enabled, r.hour_bank_required_minutes, r.hour_bank_credited_minutes, r.hour_bank_net_minutes, r.hour_bank_credit_days,
         x.review_status, x.reviewed_at, x.review_pct, r.review_relief_amount, r.review_note, r.review_relief
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin']) and app.hr_export_visible_to_finance(x)
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;

-- حالة الشهر للمالية (تُستخدم في اللافتات): بانتظار المعاون؟
create or replace function public.finance_payroll_gate(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1)
  select case when x.id is null then jsonb_build_object('exported', false, 'visible', false, 'review_status', null)
              else jsonb_build_object('exported', true, 'export_id', x.id, 'version', x.version, 'review_status', x.review_status, 'reviewed_at', x.reviewed_at, 'review_pct', x.review_pct,
                                      'visible', app.hr_export_visible_to_finance(x),
                                      'relief_total', (select coalesce(sum(review_relief_amount), 0) from public.hr_month_export_rows r where r.export_id = x.id)) end
  from (select 1) one left join x on true
  where app.has_role(array['finance_officer', 'deputy_director', 'super_admin'])
$$;
grant execute on function public.finance_payroll_gate(date) to authenticated;

create or replace function public.finance_payroll_approve(p_export uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public, app as $$
declare x record; st jsonb; n_bad int;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into x from public.hr_month_exports where id = p_export;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if x.review_status <> 'approved' then raise exception 'HR_DEPUTY_REVIEW_PENDING'; end if;
  select count(*) into n_bad from public.finance_payroll_reconcile(x.period_month) rc where rc.row_id in (select id from public.hr_month_export_rows where export_id = p_export) and not rc.money_ok;
  if n_bad > 0 then raise exception 'HR_PAYROLL_RECONCILE_MISMATCH'; end if;
  if exists (select 1 from public.hr_month_export_rows where export_id = p_export and final_net is null) then raise exception 'HR_SALARY_MISSING'; end if;
  st := app.hr_month_export_status(x.period_month);
  if (st ->> 'needs_reexport')::boolean and not coalesce(p_force, false) then raise exception 'HR_EXPORT_STALE'; end if;
  update public.hr_month_exports set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_export;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select r.employee_id, x.period_month, 'approve', jsonb_build_object('export_id', p_export, 'final_net', r.final_net, 'deputy_relief', r.review_relief_amount, 'forced_stale', (st ->> 'needs_reexport')::boolean and p_force), 'اعتماد راتب الشهر', auth.uid()
  from public.hr_month_export_rows r where r.export_id = p_export;
  perform app.advance_post_installments(p_export);
end$$;

-- تعديل المالية للصافي: فقط بعد اعتماد المعاون
create or replace function public.finance_payroll_adjust(p_row uuid, p_final_net numeric, p_note text)
returns void language plpgsql security definer set search_path = public, app as $$
declare r record;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select er.*, x.status as x_status, x.review_status as x_review into r from public.hr_month_export_rows er join public.hr_month_exports x on x.id = er.export_id where er.id = p_row;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if r.x_status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if r.x_review <> 'approved' then raise exception 'HR_DEPUTY_REVIEW_PENDING'; end if;
  if p_final_net is null or p_final_net < 0 then raise exception 'HR_AMOUNT_INVALID'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if r.pay_type is null then raise exception 'HR_SALARY_MISSING'; end if;
  if r.gross_amount is not null and p_final_net > r.gross_amount then raise exception 'HR_FINAL_ABOVE_GROSS'; end if;
  update public.hr_month_export_rows set final_net = round(p_final_net, 2), finance_note = trim(p_note), adjusted_by = auth.uid(), adjusted_at = now() where id = p_row;
end$$;

-- قراءة التصديرات للمعاون أيضاً
drop policy if exists "hr_exports: قراءة" on public.hr_month_exports;
create policy "hr_exports: قراءة" on public.hr_month_exports for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'deputy_director', 'super_admin']));

-- إشعار المعاون عند كل تصدير جديد من غرفة العمليات (بلا تغيير في دالة التصدير)
create or replace function app.notify_deputy_on_export() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  perform app.notify_by_role(array['deputy_director'], 'كشف استقطاعات ' || to_char(new.period_month, 'YYYY-MM') || ' بانتظار مراجعتك',
    'صدّرت غرفة العمليات حضورية الشهر (إصدار ' || new.version || '). المالية لن ترى الكشف قبل اعتمادك.', 'warning', '/deputy/deductions');
  return new;
end$$;
drop trigger if exists trg_notify_deputy_on_export on public.hr_month_exports;
create trigger trg_notify_deputy_on_export after insert on public.hr_month_exports for each row execute function app.notify_deputy_on_export();
