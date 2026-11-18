-- ═══════════════════════════════════════════════════════════════
-- مسار الصرف: إقفال الشهر ← طلب صرف للمدير المفوض ← قراره ← صرف المالية من القاصة
--
--   الواقع قبل هذا الترحيل: اعتماد المالية لكشف الموظفين (finance_payroll_approve) يقفل الشهر ويرحّل أقساط السلف فقط،
--   ولا يكتب شيئاً في القاصة ولا يمر بالمدير المفوض.
--
--   ما يضيفه (قرارات المالك):
--     • طلب صرف واحد لكل (نوع، شهر)، يُنشأ تلقائياً بنفس معاملة اعتماد المالية، بأرقام وأسماء مجمَّدة.
--     • المدير المفوض (super_admin) وحده يعتمد أو يرفض (الرفض بسبب إلزامي)، والكل أو لا شيء.
--     • عند الاعتماد: إشعار للمالية فقط، ولا يُخصم شيء. المالية تنفّذ الصرف: حركة قاصة واحدة نهائية بنوع الطلب،
--       وإن لم يكف الرصيد تُرفض العملية كلها بالرمز TREASURY_INSUFFICIENT.
--     • عند الرفض: يعود الطلب للمالية بالسبب، والكشف يبقى مقفلاً، وللمالية إعادة الإرسال (نسخة جديدة).
--
--   ما لا يلمسه: لا تعديل على finance_payroll_approve ولا على finance_treasury_confirm ولا على أي دالة قاصة.
--   الربط بالإقفال عبر trigger بعد تحديث حالة الكشف إلى approved (سابقة: trg_notify_deputy_on_export)،
--   وهو يعمل في معاملة الاعتماد نفسها: إن فشل إنشاء الطلب أُلغي الاعتماد كله فلا يبقى شهر مقفل بلا طلب.
--
--   يعتمد على الترحيل السابق (أنواع القاصة payroll وcontractor_wages) — يُنفَّذ قبل هذا الملف.
--   التراجع: drop trigger trg_disbursement_open_payroll on public.hr_month_exports؛ ثم حذف الدوال والجداول الثلاثة (لا بيانات قبل أول إقفال).
-- ═══════════════════════════════════════════════════════════════

-- ① الجداول (RLS مفعّل؛ القراءة للمالية والمدير المفوض، والكتابة عبر الدوال فقط)
create sequence if not exists public.payroll_disbursement_seq;

create table public.payroll_disbursements (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  kind text not null check (kind in ('employee_payroll', 'contractor_wages')),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  version int not null default 1 check (version >= 1),
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'paid', 'rejected')),
  source_export_id uuid references public.hr_month_exports(id),
  supersedes_id uuid references public.payroll_disbursements(id),
  people_count int not null default 0 check (people_count >= 0),
  payable_count int not null default 0 check (payable_count >= 0),
  gross_total numeric(14,2) not null default 0,
  deductions_total numeric(14,2) not null default 0,
  net_total numeric(14,2) not null check (net_total > 0),
  prev_net_total numeric(14,2),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  treasury_tx_id uuid unique references public.treasury_transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_disbursements_employee_source check (kind <> 'employee_payroll' or source_export_id is not null),
  constraint payroll_disbursements_status_fields check (
    (status = 'pending_approval' and decided_at is null and paid_at is null and treasury_tx_id is null)
    or (status = 'approved' and decided_at is not null and paid_at is null and treasury_tx_id is null)
    or (status = 'rejected' and decided_at is not null and paid_at is null and treasury_tx_id is null)
    or (status = 'paid' and decided_at is not null and paid_at is not null and treasury_tx_id is not null))
);
-- طلب فعّال واحد لكل (نوع، شهر): بانتظار القرار أو معتمد أو مصروف. المرفوض لا يحجز الشهر.
create unique index payroll_disbursements_one_active on public.payroll_disbursements (kind, period_month) where status in ('pending_approval', 'approved', 'paid');
create unique index payroll_disbursements_version_uq on public.payroll_disbursements (kind, period_month, version);
create index payroll_disbursements_status_idx on public.payroll_disbursements (status, period_month desc);

create table public.payroll_disbursement_lines (
  id uuid primary key default gen_random_uuid(),
  disbursement_id uuid not null references public.payroll_disbursements(id) on delete cascade,
  person_id uuid,
  person_number text,
  full_name text not null,
  group_name text,
  sub_group_name text,
  job_title text,
  gross_amount numeric(14,2) not null default 0,
  deductions_total numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0 check (net_amount >= 0),
  adjusted boolean not null default false,
  has_deduction boolean not null default false,
  has_advance boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  sort_key text not null default ''
);
create index payroll_disbursement_lines_idx on public.payroll_disbursement_lines (disbursement_id, group_name, sub_group_name);

create table public.payroll_disbursement_events (
  id bigint generated always as identity primary key,
  disbursement_id uuid not null references public.payroll_disbursements(id) on delete cascade,
  event text not null check (event in ('created', 'approved', 'rejected', 'paid', 'resubmitted')),
  actor uuid references auth.users(id) on delete set null,
  note text,
  amount numeric(14,2),
  created_at timestamptz not null default now()
);
create index payroll_disbursement_events_idx on public.payroll_disbursement_events (disbursement_id, id);

alter table public.payroll_disbursements enable row level security;
alter table public.payroll_disbursement_lines enable row level security;
alter table public.payroll_disbursement_events enable row level security;
create policy "payroll_disbursements: قراءة" on public.payroll_disbursements for select to authenticated using (app.has_role(array['finance_officer', 'super_admin']));
create policy "payroll_disbursement_lines: قراءة" on public.payroll_disbursement_lines for select to authenticated using (app.has_role(array['finance_officer', 'super_admin']));
create policy "payroll_disbursement_events: قراءة" on public.payroll_disbursement_events for select to authenticated using (app.has_role(array['finance_officer', 'super_admin']));
revoke all on public.payroll_disbursements, public.payroll_disbursement_lines, public.payroll_disbursement_events from anon;
revoke insert, update, delete, truncate on public.payroll_disbursements, public.payroll_disbursement_lines, public.payroll_disbursement_events from authenticated;
revoke all on sequence public.payroll_disbursement_seq from anon, authenticated;

-- ② مساعدات
create or replace function app.disbursement_next_no() returns text language sql as $$
  select 'DSB-' || to_char(now() at time zone 'Asia/Baghdad', 'YYYY') || '-' || lpad(nextval('public.payroll_disbursement_seq')::text, 4, '0')
$$;

create or replace function app.disbursement_kind_label(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'employee_payroll' then 'رواتب الموظفين' when 'contractor_wages' then 'أجور المتعهدين' else coalesce(p_kind, '') end
$$;

create or replace function app.disbursement_json(d public.payroll_disbursements) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select to_jsonb(d) || jsonb_build_object(
    'kind_label', app.disbursement_kind_label(d.kind),
    'requested_by_name', case when d.requested_by is null then null else app.user_display_name(d.requested_by) end,
    'decided_by_name', case when d.decided_by is null then null else app.user_display_name(d.decided_by) end,
    'paid_by_name', case when d.paid_by is null then null else app.user_display_name(d.paid_by) end,
    'treasury_ref_no', (select t.ref_no from public.treasury_transactions t where t.id = d.treasury_tx_id),
    'other_adjustments', d.net_total - (d.gross_total - d.deductions_total),
    -- طلب مرفوض أُعيد إرساله: معرّف ورقم ونسخة الطلب الذي حلّ محله (null = لم يُعَد إرساله بعد)
    'resubmitted_id', (select n.id from public.payroll_disbursements n where n.supersedes_id = d.id order by n.version desc limit 1),
    'resubmitted_no', (select n.request_no from public.payroll_disbursements n where n.supersedes_id = d.id order by n.version desc limit 1),
    'resubmitted_version', (select n.version from public.payroll_disbursements n where n.supersedes_id = d.id order by n.version desc limit 1),
    -- أجور المتعهدين: الأيام والمبالغ المحجوبة بسبب غياب البصمة (من لقطة الأسطر المجمَّدة؛ null لرواتب الموظفين)
    'blocked_days', case when d.kind = 'contractor_wages' then (select coalesce(sum((l.details ->> 'blocked_days')::int), 0) from public.payroll_disbursement_lines l where l.disbursement_id = d.id) end,
    'blocked_amount', case when d.kind = 'contractor_wages' then (select coalesce(sum((l.details ->> 'blocked_amount')::numeric), 0) from public.payroll_disbursement_lines l where l.disbursement_id = d.id) end)
$$;

-- ③ إنشاء طلب رواتب الموظفين من كشف مُقفَل (داخلية: يستدعيها trigger الإقفال فقط)
create or replace function app.disbursement_open_payroll(p_export uuid) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare x public.hr_month_exports; v_id uuid; v_ver int; v_net numeric; v_gross numeric; v_ded numeric; v_cnt int; v_pay int; v_prev numeric; v_no text; v_by uuid; u record; v_amt text;
begin
  select * into x from public.hr_month_exports where id = p_export;
  if x.id is null or x.status <> 'approved' then return null; end if;
  if exists (select 1 from public.payroll_disbursements d where d.kind = 'employee_payroll' and d.period_month = x.period_month and d.status in ('pending_approval', 'approved', 'paid')) then
    raise exception 'DISBURSEMENT_ACTIVE_EXISTS';
  end if;
  select coalesce(sum(greatest(0, coalesce(r.final_net, r.proposed_net, 0))), 0), coalesce(sum(coalesce(r.gross_amount, 0)), 0), coalesce(sum(coalesce(r.deductions_total, 0)), 0),
         count(*), count(*) filter (where greatest(0, coalesce(r.final_net, r.proposed_net, 0)) > 0)
    into v_net, v_gross, v_ded, v_cnt, v_pay
    from public.hr_month_export_rows r where r.export_id = p_export;
  if v_net <= 0 then return null; end if;   -- لا شيء يُصرف ⇒ لا طلب
  v_ver := coalesce((select max(d.version) from public.payroll_disbursements d where d.kind = 'employee_payroll' and d.period_month = x.period_month), 0) + 1;
  v_prev := (select d.net_total from public.payroll_disbursements d where d.kind = 'employee_payroll' and d.period_month = (x.period_month - interval '1 month')::date and d.status in ('approved', 'paid') order by d.version desc limit 1);
  v_by := coalesce(x.approved_by, auth.uid());
  v_no := app.disbursement_next_no();
  insert into public.payroll_disbursements (request_no, kind, period_month, version, source_export_id, people_count, payable_count, gross_total, deductions_total, net_total, prev_net_total, requested_by)
  values (v_no, 'employee_payroll', x.period_month, v_ver, p_export, v_cnt, v_pay, v_gross, v_ded, v_net, v_prev, v_by) returning id into v_id;
  insert into public.payroll_disbursement_lines (disbursement_id, person_id, person_number, full_name, group_name, sub_group_name, job_title, gross_amount, deductions_total, net_amount, adjusted, has_deduction, has_advance, details, sort_key)
  select v_id, r.employee_id, r.employee_number, coalesce(r.full_name, ''), coalesce(r.branch_name, 'بلا فرع'), coalesce(r.department_name, 'بلا قسم'), r.job_title,
         coalesce(r.gross_amount, 0), coalesce(r.deductions_total, 0), greatest(0, coalesce(r.final_net, r.proposed_net, 0)),
         (r.final_net is not null and r.final_net is distinct from r.proposed_net), coalesce(r.deductions_total, 0) > 0, coalesce(r.advance_installment, 0) > 0,
         jsonb_strip_nulls(jsonb_build_object(
           'no_profile', r.pay_type is null, 'pay_type', r.pay_type, 'contract_type', r.contract_type,
           'working_days', r.working_days, 'days_present', r.days_present, 'days_late', r.days_late, 'days_absent', r.days_absent, 'days_leave', r.days_leave,
           'days_leave_paid', r.days_leave_paid, 'days_leave_unpaid', r.days_leave_unpaid, 'late_minutes', r.late_minutes, 'early_minutes', r.early_minutes,
           'payable_days', r.payable_days, 'unevaluated_days', r.unevaluated_days,
           'base_salary', r.base_salary, 'daily_rate', r.daily_rate, 'allowances_total', r.allowances_total, 'fixed_deductions_total', r.fixed_deductions_total,
           'ops_deduction_amount', coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0), 'auto_deduction_amount', r.auto_deduction_amount,
           'advance_installment', r.advance_installment, 'overtime_amount', r.overtime_amount, 'review_relief_amount', r.review_relief_amount,
           'rented_tax_amount', r.rented_tax_amount, 'uncollected_amount', r.uncollected_amount,
           'proposed_net', r.proposed_net, 'final_net', r.final_net, 'finance_note', r.finance_note)),
         app.hr_employee_sort_key(r.employee_number)
    from public.hr_month_export_rows r where r.export_id = p_export;
  insert into public.payroll_disbursement_events (disbursement_id, event, actor, amount) values (v_id, 'created', v_by, v_net);
  v_amt := to_char(v_net, 'FM999,999,999,990');
  for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
    perform app.hr_notify(u.user_id, 'طلب صرف جديد بانتظار قرارك',
      format('%s · %s · شهر %s · %s مستفيداً · %s د.ع', v_no, app.disbursement_kind_label('employee_payroll'), to_char(x.period_month, 'YYYY-MM'), v_pay, v_amt),
      '/admin/disbursements/' || v_id::text, 'disb_created:' || v_id::text, 'warning');
  end loop;
  return v_id;
end$$;

create or replace function app.trg_disbursement_on_payroll_approved() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.disbursement_open_payroll(new.id);
  return null;
end$$;

create trigger trg_disbursement_open_payroll after update of status on public.hr_month_exports
  for each row when (old.status is distinct from new.status and new.status = 'approved')
  execute function app.trg_disbursement_on_payroll_approved();

-- ④ القراءة (المالية والمدير المفوض فقط)
create or replace function public.disbursement_list(p_kind text default null, p_status text default null, p_month date default null, p_search text default null, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare v_first text := case when app.has_role(array['super_admin']) then 'pending_approval' else 'approved' end; v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'DISBURSEMENT_FORBIDDEN'; end if;
  if p_kind is not null and p_kind not in ('employee_payroll', 'contractor_wages') then raise exception 'DISBURSEMENT_FILTER_INVALID'; end if;
  if p_status is not null and p_status not in ('pending_approval', 'approved', 'paid', 'rejected') then raise exception 'DISBURSEMENT_FILTER_INVALID'; end if;
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(app.disbursement_json(d) order by (d.status = v_first) desc, d.period_month desc, d.requested_at desc, d.id), '[]'::jsonb)
              from (select x.* from public.payroll_disbursements x
                    where (p_kind is null or x.kind = p_kind) and (p_status is null or x.status = p_status)
                      and (p_month is null or x.period_month = date_trunc('month', p_month)::date)
                      and (v_q is null or strpos(lower(x.request_no), lower(v_q)) > 0)
                    order by (x.status = v_first) desc, x.period_month desc, x.requested_at desc, x.id
                    limit greatest(1, least(coalesce(p_limit, 100), 500))) d),
    'counts', (select jsonb_build_object('pending_approval', count(*) filter (where status = 'pending_approval'), 'approved', count(*) filter (where status = 'approved'),
                                         'paid', count(*) filter (where status = 'paid'), 'rejected', count(*) filter (where status = 'rejected'),
                                         'rejected_open', count(*) filter (where status = 'rejected' and not exists (select 1 from public.payroll_disbursements n where n.supersedes_id = payroll_disbursements.id))) from public.payroll_disbursements),
    'balance', app.treasury_balance());
end$$;

create or replace function public.disbursement_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare d public.payroll_disbursements; v_bal numeric;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'DISBURSEMENT_FORBIDDEN'; end if;
  select * into d from public.payroll_disbursements where id = p_id;
  if d.id is null then raise exception 'DISBURSEMENT_NOT_FOUND'; end if;
  v_bal := app.treasury_balance();
  return jsonb_build_object(
    'request', app.disbursement_json(d),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'event', e.event, 'actor', e.actor, 'actor_name', case when e.actor is null then null else app.user_display_name(e.actor) end,
                                                           'note', e.note, 'amount', e.amount, 'created_at', e.created_at) order by e.id), '[]'::jsonb)
               from public.payroll_disbursement_events e where e.disbursement_id = d.id),
    'balance', v_bal,
    'balance_after', v_bal - d.net_total,
    'shortfall', greatest(0, d.net_total - v_bal),
    'facets', jsonb_build_object(
      'groups', (select coalesce(jsonb_agg(jsonb_build_object('group', g.group_name, 'sub_group', g.sub_group_name, 'count', g.n, 'net', g.net) order by g.group_name, g.sub_group_name), '[]'::jsonb)
                 from (select l.group_name, l.sub_group_name, count(*) n, sum(l.net_amount) net from public.payroll_disbursement_lines l where l.disbursement_id = d.id group by 1, 2) g),
      'flags', (select jsonb_build_object('all', count(*), 'deduction', count(*) filter (where l.has_deduction), 'adjusted', count(*) filter (where l.adjusted),
                                          'advance', count(*) filter (where l.has_advance), 'zero', count(*) filter (where l.net_amount = 0))
                from public.payroll_disbursement_lines l where l.disbursement_id = d.id)));
end$$;

create or replace function public.disbursement_lines(p_id uuid, p_group text default null, p_sub_group text default null, p_flag text default null, p_search text default null,
                                                     p_sort text default 'number', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare v_q text := lower(nullif(trim(coalesce(p_search, '')), '')); v_lim int := greatest(1, least(coalesce(p_limit, 50), 200)); v_off int := greatest(0, coalesce(p_offset, 0));
        v_sort text := coalesce(p_sort, 'number'); v_total bigint; v_net numeric; v_rows jsonb;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'DISBURSEMENT_FORBIDDEN'; end if;
  if not exists (select 1 from public.payroll_disbursements where id = p_id) then raise exception 'DISBURSEMENT_NOT_FOUND'; end if;
  if p_flag is not null and p_flag not in ('all', 'deduction', 'adjusted', 'advance', 'zero') then raise exception 'DISBURSEMENT_FILTER_INVALID'; end if;
  with f as (
    select l.* from public.payroll_disbursement_lines l
     where l.disbursement_id = p_id
       and (p_group is null or p_group = '' or l.group_name = p_group)
       and (p_sub_group is null or p_sub_group = '' or l.sub_group_name = p_sub_group)
       and (p_flag is null or p_flag = 'all' or (p_flag = 'deduction' and l.has_deduction) or (p_flag = 'adjusted' and l.adjusted)
            or (p_flag = 'advance' and l.has_advance) or (p_flag = 'zero' and l.net_amount = 0))
       and (v_q is null or strpos(lower(coalesce(l.full_name, '') || ' ' || coalesce(l.person_number, '') || ' ' || coalesce(l.job_title, '')), v_q) > 0)
  ), page as (
    select f.*, row_number() over (order by
        case v_sort when 'net_desc' then -f.net_amount when 'net_asc' then f.net_amount when 'deduction_desc' then -f.deductions_total end,
        case when v_sort = 'name' then f.full_name end, f.sort_key, f.id) rn
      from f order by rn limit v_lim offset v_off
  )
  select (select count(*) from f), (select coalesce(sum(net_amount), 0) from f),
         (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'person_id', p.person_id, 'person_number', p.person_number, 'full_name', p.full_name,
                                                      'group_name', p.group_name, 'sub_group_name', p.sub_group_name, 'job_title', p.job_title,
                                                      'gross_amount', p.gross_amount, 'deductions_total', p.deductions_total, 'net_amount', p.net_amount,
                                                      'adjusted', p.adjusted, 'has_deduction', p.has_deduction, 'has_advance', p.has_advance, 'details', p.details) order by p.rn), '[]'::jsonb) from page p)
    into v_total, v_net, v_rows;
  return jsonb_build_object('total', v_total, 'net_total', v_net, 'limit', v_lim, 'offset', v_off, 'rows', v_rows);
end$$;

create or replace function public.disbursement_counts() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when app.has_role(array['finance_officer', 'super_admin'])
    then (select jsonb_build_object('pending_approval', count(*) filter (where status = 'pending_approval'), 'approved', count(*) filter (where status = 'approved')) from public.payroll_disbursements)
    else jsonb_build_object('pending_approval', 0, 'approved', 0) end
$$;

-- ⑤ القرار (المدير المفوض وحده)
create or replace function app.disbursement_decide__raw(p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.payroll_disbursements; v_note text := nullif(trim(coalesce(p_note, '')), ''); u record; v_label text; v_amt text; v_me text := app.user_display_name(auth.uid());
begin
  if not app.has_role(array['super_admin']) then raise exception 'DISBURSEMENT_FORBIDDEN'; end if;
  if p_approve is null then raise exception 'DISBURSEMENT_DECISION_INVALID'; end if;
  select * into d from public.payroll_disbursements where id = p_id for update;
  if d.id is null then raise exception 'DISBURSEMENT_NOT_FOUND'; end if;
  if d.status <> 'pending_approval' then raise exception 'DISBURSEMENT_NOT_PENDING'; end if;
  if not p_approve and length(coalesce(v_note, '')) < 3 then raise exception 'DISBURSEMENT_REASON_REQUIRED'; end if;
  update public.payroll_disbursements set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = v_note, updated_at = now()
   where id = d.id returning * into d;
  insert into public.payroll_disbursement_events (disbursement_id, event, actor, note, amount) values (d.id, case when p_approve then 'approved' else 'rejected' end, auth.uid(), v_note, d.net_total);
  v_label := app.disbursement_kind_label(d.kind);
  v_amt := to_char(d.net_total, 'FM999,999,999,990');
  if p_approve then
    for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'finance_officer' loop
      perform app.hr_notify(u.user_id, 'اعتُمد صرف ' || v_label || ' — بانتظار تنفيذك',
        format('%s · شهر %s · %s د.ع · اعتمده %s. لا يُخصم شيء من القاصة قبل أن تنفّذ الصرف.', d.request_no, to_char(d.period_month, 'YYYY-MM'), v_amt, v_me),
        '/finance/disbursements/' || d.id::text, 'disb_approved:' || d.id::text, 'success');
    end loop;
  else
    for u in select distinct x.user_id from (select ur.user_id from public.user_roles ur where ur.role = 'finance_officer' union select d.requested_by) x where x.user_id is not null loop
      perform app.hr_notify(u.user_id, 'رُفض طلب صرف ' || v_label,
        format('%s · شهر %s · %s د.ع · السبب: %s', d.request_no, to_char(d.period_month, 'YYYY-MM'), v_amt, v_note),
        '/finance/disbursements/' || d.id::text, 'disb_rejected:' || d.id::text, 'warning');
    end loop;
  end if;
  return app.disbursement_json(d);
end$$;

-- ⑥ الصرف (المالية): حركة قاصة واحدة نهائية بنوع الطلب، وإن لم يكف الرصيد تُرفض العملية كلها
create or replace function app.disbursement_pay__raw(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.payroll_disbursements; t public.treasury_transactions; v_note text := nullif(trim(coalesce(p_note, '')), ''); v_me text := app.user_display_name(auth.uid());
        u record; v_label text; v_amt text; v_kind text;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'DISBURSEMENT_FORBIDDEN'; end if;
  select * into d from public.payroll_disbursements where id = p_id for update;
  if d.id is null then raise exception 'DISBURSEMENT_NOT_FOUND'; end if;
  if d.status = 'paid' then raise exception 'DISBURSEMENT_ALREADY_PAID'; end if;
  if d.status <> 'approved' then raise exception 'DISBURSEMENT_NOT_APPROVED'; end if;
  perform pg_advisory_xact_lock(hashtext('treasury_balance'));
  if app.treasury_balance() < d.net_total then raise exception 'TREASURY_INSUFFICIENT'; end if;
  v_kind := case d.kind when 'employee_payroll' then 'payroll' else 'contractor_wages' end;
  v_label := app.disbursement_kind_label(d.kind);
  insert into public.treasury_transactions (ref_no, kind, amount, type_name, details, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at, finance_note)
  values (app.treasury_next_ref(), v_kind, d.net_total, v_label, format('شهر %s · طلب %s · %s مستفيداً', to_char(d.period_month, 'YYYY-MM'), d.request_no, d.payable_count),
          'confirmed', true, auth.uid(), v_me, auth.uid(), now(), v_note)
  returning * into t;
  update public.payroll_disbursements set status = 'paid', paid_by = auth.uid(), paid_at = now(), treasury_tx_id = t.id, updated_at = now() where id = d.id returning * into d;
  insert into public.payroll_disbursement_events (disbursement_id, event, actor, note, amount) values (d.id, 'paid', auth.uid(), v_note, d.net_total);
  v_amt := to_char(d.net_total, 'FM999,999,999,990');
  for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
    perform app.hr_notify(u.user_id, 'تم صرف ' || v_label || ' من القاصة',
      format('%s · شهر %s · %s د.ع · حركة القاصة %s · نفّذه %s', d.request_no, to_char(d.period_month, 'YYYY-MM'), v_amt, t.ref_no, v_me),
      '/admin/disbursements/' || d.id::text, 'disb_paid:' || d.id::text, 'success');
  end loop;
  if d.requested_by is not null and d.requested_by is distinct from auth.uid() then
    perform app.hr_notify(d.requested_by, 'تم صرف ' || v_label || ' من القاصة',
      format('%s · شهر %s · %s د.ع · حركة القاصة %s', d.request_no, to_char(d.period_month, 'YYYY-MM'), v_amt, t.ref_no),
      '/finance/disbursements/' || d.id::text, 'disb_paid:' || d.id::text, 'success');
  end if;
  return app.disbursement_json(d);
end$$;

-- ⑦ إعادة الإرسال بعد الرفض: نسخة جديدة بالأرقام المجمَّدة نفسها (الكشف مقفل فلا يتغير شيء)
create or replace function app.disbursement_resubmit__raw(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.payroll_disbursements; n public.payroll_disbursements; v_note text := nullif(trim(coalesce(p_note, '')), ''); u record; v_label text; v_no text;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'DISBURSEMENT_FORBIDDEN'; end if;
  select * into d from public.payroll_disbursements where id = p_id for update;
  if d.id is null then raise exception 'DISBURSEMENT_NOT_FOUND'; end if;
  if d.status <> 'rejected' then raise exception 'DISBURSEMENT_NOT_REJECTED'; end if;
  if exists (select 1 from public.payroll_disbursements x where x.kind = d.kind and x.period_month = d.period_month and x.status in ('pending_approval', 'approved', 'paid')) then
    raise exception 'DISBURSEMENT_ACTIVE_EXISTS';
  end if;
  v_no := app.disbursement_next_no();
  insert into public.payroll_disbursements (request_no, kind, period_month, version, source_export_id, supersedes_id, people_count, payable_count, gross_total, deductions_total, net_total, prev_net_total, requested_by)
  values (v_no, d.kind, d.period_month, (select max(x.version) from public.payroll_disbursements x where x.kind = d.kind and x.period_month = d.period_month) + 1,
          d.source_export_id, d.id, d.people_count, d.payable_count, d.gross_total, d.deductions_total, d.net_total, d.prev_net_total, auth.uid())
  returning * into n;
  insert into public.payroll_disbursement_lines (disbursement_id, person_id, person_number, full_name, group_name, sub_group_name, job_title, gross_amount, deductions_total, net_amount, adjusted, has_deduction, has_advance, details, sort_key)
  select n.id, l.person_id, l.person_number, l.full_name, l.group_name, l.sub_group_name, l.job_title, l.gross_amount, l.deductions_total, l.net_amount, l.adjusted, l.has_deduction, l.has_advance, l.details, l.sort_key
    from public.payroll_disbursement_lines l where l.disbursement_id = d.id;
  insert into public.payroll_disbursement_events (disbursement_id, event, actor, note, amount) values (d.id, 'resubmitted', auth.uid(), v_note, d.net_total);
  insert into public.payroll_disbursement_events (disbursement_id, event, actor, note, amount) values (n.id, 'created', auth.uid(), v_note, n.net_total);
  v_label := app.disbursement_kind_label(n.kind);
  for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
    perform app.hr_notify(u.user_id, 'أُعيد إرسال طلب صرف ' || v_label || ' بانتظار قرارك',
      format('%s (النسخة %s) · شهر %s · %s د.ع%s', n.request_no, n.version, to_char(n.period_month, 'YYYY-MM'), to_char(n.net_total, 'FM999,999,999,990'), case when v_note is null then '' else ' · ملاحظة المالية: ' || v_note end),
      '/admin/disbursements/' || n.id::text, 'disb_created:' || n.id::text, 'warning');
  end loop;
  return app.disbursement_json(n);
end$$;

-- أغلفة الدوال (حارس التكرار/التزامن ثم الأصل، كبقية دوال الكتابة — 00291)
create or replace function public.disbursement_decide(p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.guard_duplicate('disbursement_decide', jsonb_build_object('p_id', p_id, 'p_approve', p_approve, 'p_note', p_note));
  perform app.guard_record_lock(p_id);
  return app.disbursement_decide__raw(p_id, p_approve, p_note);
end$$;

create or replace function public.disbursement_pay(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.guard_duplicate('disbursement_pay', jsonb_build_object('p_id', p_id, 'p_note', p_note));
  perform app.guard_record_lock(p_id);
  return app.disbursement_pay__raw(p_id, p_note);
end$$;

create or replace function public.disbursement_resubmit(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.guard_duplicate('disbursement_resubmit', jsonb_build_object('p_id', p_id, 'p_note', p_note));
  perform app.guard_record_lock(p_id);
  return app.disbursement_resubmit__raw(p_id, p_note);
end$$;

-- الامتيازات: الدوال العامة للمسجَّلين فقط، والداخلية لا تُنادى من الواجهة
revoke all on function public.disbursement_list(text, text, date, text, int), public.disbursement_get(uuid),
  public.disbursement_lines(uuid, text, text, text, text, text, int, int), public.disbursement_counts(),
  public.disbursement_decide(uuid, boolean, text), public.disbursement_pay(uuid, text), public.disbursement_resubmit(uuid, text) from public, anon;
grant execute on function public.disbursement_list(text, text, date, text, int), public.disbursement_get(uuid),
  public.disbursement_lines(uuid, text, text, text, text, text, int, int), public.disbursement_counts(),
  public.disbursement_decide(uuid, boolean, text), public.disbursement_pay(uuid, text), public.disbursement_resubmit(uuid, text) to authenticated;
revoke all on function app.disbursement_open_payroll(uuid), app.trg_disbursement_on_payroll_approved(), app.disbursement_next_no(),
  app.disbursement_decide__raw(uuid, boolean, text), app.disbursement_pay__raw(uuid, text), app.disbursement_resubmit__raw(uuid, text) from public, anon, authenticated;

-- ⑧ تسجيل الجداول الجديدة في كتالوجي التصفير والاحتفاظ (اختبار data-retention-catalog يشترط كل جدول في public)
--    التصفير: ضمن فئة «الرواتب» نفسها مع hr_month_exports وtreasury_transactions كي يُحذف الطلب معهما (مفاتيح أجنبية إليهما).
create or replace function app.platform_reset_catalog_disbursements() returns table(key text, label text, grp text, sort integer, tables text[], buckets text[])
language sql immutable as $$
  select c.key, c.label, c.grp, c.sort,
         case when c.key = 'payroll' then c.tables || array['payroll_disbursements', 'payroll_disbursement_lines', 'payroll_disbursement_events'] else c.tables end,
         c.buckets
    from app.platform_reset_catalog_00368() c
$$;

create or replace function app.platform_reset_catalog() returns table(key text, label text, grp text, sort integer, tables text[], buckets text[])
language sql immutable as $$
  select c.key, c.label, c.grp, c.sort,
    case
      when c.key = 'attendance' then c.tables || array[
        'unmatched_archive_device_users', 'unmatched_archive_punches',
        'unmatched_unit_people_edits', 'unmatched_unit_day_edits',
        'unmatched_unit_audit', 'unmatched_unit_independent_people']
      when c.key = 'accounts' then c.tables || array['unmatched_unit_permissions']
      else c.tables
    end,
    c.buckets
  from app.platform_reset_catalog_disbursements() c
$$;

--    الاحتفاظ: سجلات مالية محمية من الحذف الزمني (deletable = false) كبقية سجلات الرواتب.
create or replace function app.data_retention_catalog_disbursements() returns table(data_key text, portal_key text, label text, description text, table_name text, time_column text, keep_where text, safety_lock text, deletable boolean, default_months integer, default_export_required boolean)
language sql immutable as $$
  select * from app.data_retention_catalog_00368()
  union all select 'payroll_disbursements', 'finance', 'طلبات صرف الرواتب والأجور', 'طلب الصرف المرفوع للمدير المفوض: حالته وقراره وحركة القاصة المرتبطة به.', 'payroll_disbursements', null::text, null::text, 'سجل مالي محمي من الحذف الزمني التلقائي', false, 0, false
  union all select 'payroll_disbursement_lines', 'finance', 'أسطر طلبات الصرف', 'الأسماء والمبالغ المجمَّدة التي اعتمدها المدير المفوض.', 'payroll_disbursement_lines', null::text, null::text, 'سجل مالي محمي من الحذف الزمني التلقائي', false, 0, false
  union all select 'payroll_disbursement_events', 'finance', 'سجل أحداث طلبات الصرف', 'من أنشأ ومن اعتمد أو رفض ومن صرف ومتى.', 'payroll_disbursement_events', null::text, null::text, 'سجل مالي محمي من الحذف الزمني التلقائي', false, 0, false
$$;

--    الدالة العليا للكتالوج طويلة ومعرّبة؛ نعيد توجيه مرجعها من الطبقة 00368 إلى طبقتنا بتعديل نصها الحي نفسه حرفاً بحرف (لا نسخ يدوي)،
--    مع حارس: إن لم يكن المرجع القديم مذكوراً مرة واحدة بالضبط تتوقف الترحيلة ولا يتغير شيء.
do $redirect$
declare v_def text; v_old constant text := 'app.data_retention_catalog_00368()'; v_new constant text := 'app.data_retention_catalog_disbursements()'; v_hits int;
begin
  v_def := pg_get_functiondef('app.data_retention_catalog()'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_hits <> 1 then raise exception 'REDIRECT_GUARD: expected exactly one reference to %, found %', v_old, v_hits; end if;
  execute replace(v_def, v_old, v_new);
end
$redirect$;
