-- 00191 · السُّلَف (الجولة 00191)
-- غرفة العمليات تُدخل طلب سلفة لموظف → سلسلة موافقات (نوع طلب جديد 'advance') → المالية تُبلَّغ وتسلّم نقداً من القاصة
-- → تُستقطع الأقساط تلقائياً من كشف الرواتب الشهري ابتداءً من الشهر التالي للتسليم.
-- الرؤية: المالية فقط (غرفة العمليات ترى حالة طلباتها فقط؛ المعتمِدون يرون مهامهم؛ لا شيء في بوابة الموظف).

-- ═══════════════ ① الأنواع (تديرها التطوير المركزية) ═══════════════
create table if not exists public.advance_types (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  max_amount       numeric(14,2) check (max_amount is null or max_amount > 0),       -- سقف المبلغ (فارغ = بلا سقف)
  max_installments int not null default 12 check (max_installments between 1 and 60),
  is_active        boolean not null default true,
  sort_order       int not null default 100,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.advance_types enable row level security;
drop policy if exists "advance_types: read" on public.advance_types;
create policy "advance_types: read" on public.advance_types for select to authenticated
  using (app.has_role(array['it_admin','finance_officer','ops_room','super_admin']));
insert into public.advance_types (name, max_amount, max_installments, sort_order) values
  ('سلفة نقدية عادية', null, 12, 10), ('سلفة طارئة', null, 6, 20), ('سلفة زواج', null, 24, 30), ('سلفة علاج', null, 12, 40)
on conflict (name) do nothing;

-- سياسة السلف داخل hr_policy (وحدة السياسات في التطوير المركزية)
update public.hr_policy set settings = settings
  || jsonb_build_object('advance_max_installment_ratio', coalesce((settings ->> 'advance_max_installment_ratio')::numeric, 0.5))
  || jsonb_build_object('advance_block_if_open', coalesce((settings ->> 'advance_block_if_open')::boolean, true))
where id = 1;

-- ═══════════════ ② السلف والأقساط والسجل ═══════════════
create sequence if not exists public.advance_ref_seq;
create table if not exists public.advances (
  id               uuid primary key default gen_random_uuid(),
  ref_no           text not null unique,
  employee_id      uuid not null references public.employees (id),
  employee_name    text not null,
  employee_number  text,
  type_id          uuid not null references public.advance_types (id),
  type_name        text not null,
  amount           numeric(14,2) not null check (amount > 0),
  requested_amount numeric(14,2) not null,
  repayment_method text not null check (repayment_method in ('equal','fixed','percent','single')),
  installments     int check (installments is null or installments between 1 and 60),     -- equal
  monthly_amount   numeric(14,2) check (monthly_amount is null or monthly_amount > 0),       -- fixed
  percent          numeric(5,2) check (percent is null or (percent > 0 and percent <= 100)), -- percent
  notes            text check (notes is null or length(notes) <= 1000),
  status           text not null default 'pending' check (status in ('pending','approved','delivered','settled','rejected','cancelled')),
  requested_by     uuid not null references auth.users (id),
  requested_by_name text,
  chain_id         uuid references public.approval_chains (id) on delete set null,
  approved_at      timestamptz,
  rejected_at      timestamptz,
  reject_note      text,
  delivered_at     timestamptz,
  delivered_by     uuid references auth.users (id),
  delivery_note    text,
  start_month      date check (start_month is null or start_month = date_trunc('month', start_month)::date),
  treasury_tx_id   uuid references public.treasury_transactions (id),
  repaid_total     numeric(14,2) not null default 0 check (repaid_total >= 0),
  settled_at       timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_advances_employee on public.advances (employee_id, status);
create index if not exists idx_advances_status on public.advances (status, created_at desc);
alter table public.advances enable row level security;
drop policy if exists "advances: finance read" on public.advances;
create policy "advances: finance read" on public.advances for select to authenticated using (app.has_role(array['finance_officer','super_admin']));

create table if not exists public.advance_installments (
  id            uuid primary key default gen_random_uuid(),
  advance_id    uuid not null references public.advances (id) on delete cascade,
  period_month  date not null check (period_month = date_trunc('month', period_month)::date),
  amount        numeric(14,2) not null check (amount > 0),
  source        text not null check (source in ('payroll','cash')),
  export_id     uuid references public.hr_month_exports (id) on delete set null,
  treasury_tx_id uuid references public.treasury_transactions (id),
  note          text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_advance_inst_payroll on public.advance_installments (advance_id, period_month) where source = 'payroll';
alter table public.advance_installments enable row level security;
drop policy if exists "advance_inst: finance read" on public.advance_installments;
create policy "advance_inst: finance read" on public.advance_installments for select to authenticated using (app.has_role(array['finance_officer','super_admin']));

create table if not exists public.advance_events (
  id          bigserial primary key,
  advance_id  uuid not null references public.advances (id) on delete cascade,
  action      text not null,
  actor       uuid references auth.users (id),
  actor_name  text,
  amount      numeric(14,2),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_advance_events on public.advance_events (advance_id, id);
alter table public.advance_events enable row level security;
drop policy if exists "advance_events: finance read" on public.advance_events;
create policy "advance_events: finance read" on public.advance_events for select to authenticated using (app.has_role(array['finance_officer','super_admin']));

-- عمود قسط السلفة في صفوف كشف الشهر
alter table public.hr_month_export_rows add column if not exists advance_installment numeric(14,2) not null default 0;

-- القاصة: حركتا «تسليم سلفة» (خروج) و«تسديد سلفة نقداً» (دخول)
alter table public.treasury_transactions drop constraint if exists treasury_transactions_kind_check;
alter table public.treasury_transactions add constraint treasury_transactions_kind_check check (kind in ('receipt','reward','gps_payment','advance','advance_repayment'));

-- ═══════════════ ③ محرك الموافقات: نوع 'advance' ═══════════════
alter table public.approval_chains drop constraint if exists approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check check (request_type in ('leave','time_permit','supplies','termination','disclosure','advance'));
alter table public.approval_tasks drop constraint if exists approval_tasks_request_kind_check;
alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (request_kind in ('leave','time_permit','supplies','termination','disclosure','advance'));

create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if coalesce(p_requester_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
  perform app.approval_validate_steps(p_steps);
  select jsonb_agg(case when s ->> 'kind' = 'hierarchy' then jsonb_build_object('kind', 'hierarchy', 'role', s ->> 'role') else jsonb_build_object('kind', 'account', 'user_id', s ->> 'user_id') end order by o)
    into clean from jsonb_array_elements(p_steps) with ordinality t(s, o);
  insert into public.approval_chains (requester_role, request_type, steps, is_active, updated_by)
  values (p_requester_role, p_request_type, clean, coalesce(p_active, true), auth.uid())
  on conflict (requester_role, request_type) do update set steps = excluded.steps, is_active = excluded.is_active, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return v_id;
end$$;

-- ═══════════════ ④ دوال مساعدة ═══════════════
create or replace function app.advance_method_label(p_method text) returns text language sql immutable as $$
  select case p_method when 'equal' then 'أقساط شهرية متساوية' when 'fixed' then 'مبلغ شهري ثابت' when 'percent' then 'نسبة من الراتب' when 'single' then 'دفعة واحدة' else coalesce(p_method, '') end $$;

create or replace function app.advance_status_label(p_status text) returns text language sql immutable as $$
  select case p_status when 'pending' then 'قيد الموافقة' when 'approved' then 'معتمدة — بانتظار التسليم' when 'delivered' then 'مسلَّمة — قيد الاستقطاع'
                       when 'settled' then 'مسدَّدة' when 'rejected' then 'مرفوضة' when 'cancelled' then 'ملغاة' else coalesce(p_status, '') end $$;

-- الراتب الشهري التقديري للموظف (للسقف فقط؛ لا يُعرض لغرفة العمليات)
create or replace function app.advance_monthly_salary(p_employee uuid) returns numeric language sql stable security definer set search_path = public as $$
  select case when sp.pay_type = 'daily' then coalesce(sp.daily_rate, 0) * 30 else coalesce(sp.base_salary, 0) end
  from public.employee_salary_profiles sp where sp.employee_id = p_employee and sp.status = 'defined' $$;

-- القسط المستحق لشهر معيّن (يُقيَّد بالمتبقي)؛ p_gross = إجمالي راتب الشهر (لطريقة النسبة)
create or replace function app.advance_installment_amount(a public.advances, p_gross numeric) returns numeric language plpgsql immutable as $$
declare remaining numeric := greatest(0, a.amount - a.repaid_total); x numeric;
begin
  if remaining <= 0 then return 0; end if;
  x := case a.repayment_method
         when 'equal'   then ceil(a.amount / greatest(a.installments, 1))
         when 'fixed'   then a.monthly_amount
         when 'percent' then round(coalesce(p_gross, 0) * a.percent / 100)
         else remaining end;
  return least(remaining, greatest(0, round(coalesce(x, 0))));
end$$;

-- القسط الشهري التقديري (للتحقق من السقف وقت الطلب): النسبة تُحسب من الراتب التقديري
create or replace function app.advance_estimated_installment(p_method text, p_amount numeric, p_installments int, p_monthly numeric, p_percent numeric, p_salary numeric) returns numeric
language sql immutable as $$
  select case p_method when 'equal' then ceil(p_amount / greatest(coalesce(p_installments, 1), 1))
                       when 'fixed' then coalesce(p_monthly, 0)
                       when 'percent' then round(coalesce(p_salary, 0) * coalesce(p_percent, 0) / 100)
                       else p_amount end $$;

create or replace function app.advance_log(p_id uuid, p_action text, p_amount numeric default null, p_note text default null) returns void
language sql security definer set search_path = public, app as $$
  insert into public.advance_events (advance_id, action, actor, actor_name, amount, note)
  values (p_id, p_action, auth.uid(), case when auth.uid() is null then null else app.user_display_name(auth.uid()) end, p_amount, nullif(trim(coalesce(p_note, '')), '')) $$;

create or replace function app.advance_json(a public.advances) returns jsonb language sql stable security definer set search_path = public, app as $$
  select to_jsonb(a) || jsonb_build_object(
    'status_label', app.advance_status_label(a.status),
    'method_label', app.advance_method_label(a.repayment_method),
    'remaining', greatest(0, a.amount - a.repaid_total),
    'estimated_installment', app.advance_installment_amount(a, app.advance_monthly_salary(a.employee_id)),
    'delivered_by_name', case when a.delivered_by is null then null else app.user_display_name(a.delivered_by) end,
    'current_step', (select jsonb_build_object('step_no', t.step_no, 'label', t.step_label, 'approvers', (select coalesce(jsonb_agg(app.manager_display_name(u)), '[]'::jsonb) from unnest(t.approvers) u))
                     from public.approval_tasks t where t.request_kind = 'advance' and t.request_id = a.id and t.status = 'pending' order by t.step_no limit 1),
    'installments_posted', (select count(*) from public.advance_installments i where i.advance_id = a.id),
    'next_deduction_month', case when a.status = 'delivered' then greatest(a.start_month, date_trunc('month', current_date)::date) end) $$;

-- ═══════════════ ⑤ التطوير المركزية: الأنواع ═══════════════
create or replace function public.advance_types_list(p_all boolean default false) returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order, t.name), '[]'::jsonb) from public.advance_types t
  where app.has_role(array['it_admin','finance_officer','ops_room','super_admin']) and (coalesce(p_all, false) or t.is_active) $$;

create or replace function public.advance_type_save(p_id uuid, p_name text, p_max_amount numeric, p_max_installments int, p_is_active boolean default true, p_sort_order int default 100)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare v_id uuid;
begin
  perform app.require_it();
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'ADVANCE_TYPE_NAME_INVALID'; end if;
  if p_max_amount is not null and p_max_amount <= 0 then raise exception 'ADVANCE_TYPE_MAX_INVALID'; end if;
  if coalesce(p_max_installments, 0) not between 1 and 60 then raise exception 'ADVANCE_TYPE_MAX_INVALID'; end if;
  if p_id is null then
    insert into public.advance_types (name, max_amount, max_installments, is_active, sort_order) values (trim(p_name), p_max_amount, p_max_installments, coalesce(p_is_active, true), coalesce(p_sort_order, 100)) returning id into v_id;
  else
    update public.advance_types set name = trim(p_name), max_amount = p_max_amount, max_installments = p_max_installments, is_active = coalesce(p_is_active, true), sort_order = coalesce(p_sort_order, 100), updated_at = now() where id = p_id returning id into v_id;
    if v_id is null then raise exception 'ADVANCE_TYPE_NOT_FOUND'; end if;
  end if;
  return (select to_jsonb(t) from public.advance_types t where t.id = v_id);
end$$;

-- سياسة السلف: قراءة (المالية + العمليات + التطوير) — hr_policy_set للتعديل (التطوير فقط)
create or replace function public.advance_policy() returns jsonb language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object('max_installment_ratio', app.hr_policy_num('advance_max_installment_ratio', 0.5), 'block_if_open', app.hr_policy_bool('advance_block_if_open', true))
  where app.has_role(array['it_admin','finance_officer','ops_room','super_admin']) $$;

-- بحث موظف لغرفة العمليات والمالية (بلا أي بيانات مالية)
create or replace function public.advance_employee_lookup(p_q text) returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title, 'department_name', d.name,
           'open_advance', (select a.ref_no from public.advances a where a.employee_id = e.id and a.status in ('pending','approved','delivered') order by a.created_at desc limit 1)) order by e.full_name), '[]'::jsonb)
  from (select * from public.employees e where e.archived_at is null and (e.employment_status is null or e.employment_status <> 'terminated')
          and (trim(coalesce(p_q, '')) = '' or e.full_name ilike '%' || trim(p_q) || '%' or e.employee_number ilike '%' || trim(p_q) || '%') order by e.full_name limit 20) e
  left join public.departments d on d.id = e.department_id
  where app.has_role(array['ops_room','finance_officer','super_admin']) $$;

-- ═══════════════ ⑥ إنشاء الطلب (غرفة العمليات) ═══════════════
create or replace function app.advance_validate(p_type public.advance_types, p_employee uuid, p_amount numeric, p_method text, p_installments int, p_monthly numeric, p_percent numeric, p_exclude uuid default null) returns void
language plpgsql stable security definer set search_path = public, app as $$
declare sal numeric; ratio numeric := app.hr_policy_num('advance_max_installment_ratio', 0.5); inst numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'ADVANCE_AMOUNT_INVALID'; end if;
  if p_type.max_amount is not null and p_amount > p_type.max_amount then raise exception 'ADVANCE_AMOUNT_EXCEEDS_TYPE_MAX'; end if;
  if p_method not in ('equal','fixed','percent','single') then raise exception 'ADVANCE_METHOD_INVALID'; end if;
  if p_method = 'equal' and (coalesce(p_installments, 0) < 1 or p_installments > p_type.max_installments) then raise exception 'ADVANCE_INSTALLMENTS_INVALID'; end if;
  if p_method = 'fixed' and (coalesce(p_monthly, 0) <= 0 or p_monthly > p_amount) then raise exception 'ADVANCE_MONTHLY_INVALID'; end if;
  if p_method = 'fixed' and ceil(p_amount / p_monthly) > p_type.max_installments then raise exception 'ADVANCE_INSTALLMENTS_INVALID'; end if;
  if p_method = 'percent' and (coalesce(p_percent, 0) <= 0 or p_percent > 100) then raise exception 'ADVANCE_PERCENT_INVALID'; end if;
  sal := app.advance_monthly_salary(p_employee);
  if sal is not null and sal > 0 and ratio > 0 then
    inst := app.advance_estimated_installment(p_method, p_amount, p_installments, p_monthly, p_percent, sal);
    if inst > round(sal * ratio) then raise exception 'ADVANCE_INSTALLMENT_EXCEEDS_CAP'; end if;
  end if;
end$$;

create or replace function public.advance_request_create(p_employee uuid, p_type uuid, p_amount numeric, p_method text, p_installments int default null, p_monthly numeric default null, p_percent numeric default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare e record; t public.advance_types; v_id uuid; v_chain uuid; who uuid[]; borrower uuid; c public.approval_chains; s jsonb; i int := 0; first_step int; a public.advances;
begin
  perform app.require_ops_room();
  select * into e from public.employees x where x.id = p_employee and x.archived_at is null and (x.employment_status is null or x.employment_status <> 'terminated');
  if e.id is null then raise exception 'ADVANCE_EMPLOYEE_NOT_FOUND'; end if;
  select * into t from public.advance_types x where x.id = p_type and x.is_active;
  if t.id is null then raise exception 'ADVANCE_TYPE_NOT_FOUND'; end if;
  if app.hr_policy_bool('advance_block_if_open', true) and exists (select 1 from public.advances x where x.employee_id = p_employee and x.status in ('pending','approved','delivered')) then
    raise exception 'ADVANCE_ALREADY_OPEN';
  end if;
  perform app.advance_validate(t, p_employee, p_amount, p_method, p_installments, p_monthly, p_percent);
  insert into public.advances (ref_no, employee_id, employee_name, employee_number, type_id, type_name, amount, requested_amount, repayment_method, installments, monthly_amount, percent, notes, requested_by, requested_by_name)
  values ('ADV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.advance_ref_seq')::text, 5, '0'), e.id, e.full_name, e.employee_number, t.id, t.name, round(p_amount), round(p_amount), p_method,
          case when p_method = 'equal' then p_installments end, case when p_method = 'fixed' then round(p_monthly) end, case when p_method = 'percent' then p_percent end,
          nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), app.user_display_name(auth.uid()))
  returning id into v_id;
  -- السلسلة: حسب دور الموظف المقترض إن كان له حساب، وإلا حسب دور غرفة العمليات (الطالبة)
  borrower := e.user_id;
  if borrower is not null then c := app.approval_chain_for(borrower, 'advance'); end if;
  if c.id is null then c := app.approval_chain_for(auth.uid(), 'advance'); borrower := null; end if;
  if c.id is not null then
    for s in select * from jsonb_array_elements(c.steps) loop
      i := i + 1;
      who := app.approval_resolve_step(s, coalesce(borrower, auth.uid()));
      who := array_remove(array_remove(who, auth.uid()), e.user_id);   -- لا الطالب ولا المقترض يوافقان
      insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note)
      values ('advance', v_id, c.id, i, app.approval_step_label(s), who, case when cardinality(who) = 0 then 'skipped' else 'waiting' end,
              case when cardinality(who) = 0 then 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً' end);
    end loop;
    v_chain := c.id;
  else
    -- بلا سلسلة مضبوطة: المعاون ثم المدير المفوض
    select coalesce(array_agg(distinct ur.user_id), '{}') into who from public.user_roles ur where ur.role = 'deputy_director' and ur.user_id not in (auth.uid(), coalesce(e.user_id, auth.uid()));
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status, note)
    values ('advance', v_id, 1, 'معاون المدير (افتراضي — بلا سلسلة مضبوطة)', who, case when cardinality(who) = 0 then 'skipped' else 'waiting' end, case when cardinality(who) = 0 then 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً' end);
    select coalesce(array_agg(distinct ur.user_id), '{}') into who from public.user_roles ur where ur.role = 'super_admin' and ur.user_id not in (auth.uid(), coalesce(e.user_id, auth.uid()));
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status, note)
    values ('advance', v_id, 2, 'المدير المفوض (افتراضي — بلا سلسلة مضبوطة)', who, case when cardinality(who) = 0 then 'skipped' else 'waiting' end, case when cardinality(who) = 0 then 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً' end);
  end if;
  select min(step_no) into first_step from public.approval_tasks where request_kind = 'advance' and request_id = v_id and status = 'waiting';
  if first_step is null then
    delete from public.approval_tasks where request_kind = 'advance' and request_id = v_id;
    delete from public.advances where id = v_id;
    raise exception 'APPROVAL_NO_APPROVER';
  end if;
  update public.approval_tasks set status = 'pending' where request_kind = 'advance' and request_id = v_id and step_no = first_step;
  update public.advances set chain_id = v_chain where id = v_id;
  perform app.advance_log(v_id, 'created', round(p_amount), p_notes);
  perform app.approval_notify_step('advance', v_id, first_step);
  select * into a from public.advances where id = v_id;
  return app.advance_json(a);
end$$;

-- ═══════════════ ⑦ القرار (المعتمِدون) — مع إمكانية تعديل المبلغ/الأقساط ═══════════════
create or replace function public.advance_decide(p_id uuid, p_approve boolean, p_note text default null, p_amount numeric default null, p_installments int default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare a public.advances; t public.advance_types; fin boolean; u uuid;
begin
  select * into a from public.advances where id = p_id;
  if a.id is null then raise exception 'ADVANCE_NOT_FOUND'; end if;
  if a.status <> 'pending' then raise exception 'ADVANCE_NOT_PENDING'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 2 then raise exception 'APPROVAL_REASON_REQUIRED'; end if;
  if p_approve and (p_amount is not null or p_installments is not null) then
    select * into t from public.advance_types where id = a.type_id;
    perform app.advance_validate(t, a.employee_id, coalesce(p_amount, a.amount), a.repayment_method, coalesce(p_installments, a.installments), a.monthly_amount, a.percent);
    if a.repayment_method <> 'equal' and p_installments is not null then raise exception 'ADVANCE_INSTALLMENTS_INVALID'; end if;
    update public.advances set amount = round(coalesce(p_amount, amount)), installments = coalesce(p_installments, installments), updated_at = now() where id = p_id;
    perform app.advance_log(p_id, 'amended', round(coalesce(p_amount, a.amount)), 'تعديل أثناء الموافقة: المبلغ ' || to_char(round(coalesce(p_amount, a.amount)), 'FM999,999,999') || case when p_installments is not null then ' · الأقساط ' || p_installments else '' end);
  end if;
  fin := app.approval_decide('advance', p_id, p_approve, p_note);
  perform app.advance_log(p_id, case when p_approve then 'step_approved' else 'rejected' end, null, p_note);
  select * into a from public.advances where id = p_id;
  if not p_approve then
    update public.advances set status = 'rejected', rejected_at = now(), reject_note = trim(p_note), updated_at = now() where id = p_id;
    perform app.hr_notify(a.requested_by, 'رُفض طلب السلفة ' || a.ref_no, a.employee_name || ' · ' || a.type_name || ' · السبب: ' || trim(p_note), '/ops-room/advances', 'advance_rej:' || a.id::text, 'warning');
  elsif fin then
    update public.advances set status = 'approved', approved_at = now(), updated_at = now() where id = p_id;
    perform app.advance_log(p_id, 'approved', a.amount, null);
    for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'finance_officer' loop
      perform app.hr_notify(u, 'سلفة معتمدة جاهزة للتسليم — ' || a.ref_no, a.employee_name || ' · ' || a.type_name || ' · ' || to_char(a.amount, 'FM999,999,999') || ' د.ع · ' || app.advance_method_label(a.repayment_method), '/finance/advances', 'advance_ok:' || a.id::text, 'success');
    end loop;
    perform app.hr_notify(a.requested_by, 'اكتملت الموافقات على السلفة ' || a.ref_no, a.employee_name || ' · أُحيلت إلى المالية للتسليم', '/ops-room/advances', 'advance_ok_ops:' || a.id::text, 'info');
  end if;
  select * into a from public.advances where id = p_id;
  return app.advance_json(a);
end$$;

-- توجيه القرار العام (يشمل السلف)
create or replace function public.approval_decide_request(p_kind text, p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_kind = 'supplies' then perform public.supply_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'termination' then perform public.termination_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'disclosure' then perform public.disclosure_decide(p_request, p_approve, p_note, null);
  elsif p_kind = 'advance' then perform public.advance_decide(p_request, p_approve, p_note, null, null);
  elsif p_kind in ('leave','time_permit') then perform public.hr_leave_decide(p_request, p_approve, p_note);
  else raise exception 'APPROVAL_TYPE_INVALID'; end if;
end$$;

-- إشعار الخطوة (يشمل السلف)
create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text; link text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if t.id is null then return; end if;
  if p_kind = 'advance' then
    select a.* into l from public.advances a where a.id = p_request;
    title := 'طلب سلفة بانتظار قرارك (خطوة ' || p_step || ') — ' || l.type_name;
    body := l.employee_name || ' · ' || to_char(l.amount, 'FM999,999,999') || ' د.ع · ' || app.advance_method_label(l.repayment_method) || ' · ' || l.ref_no;
  elsif p_kind = 'disclosure' then
    select d.*, ty.label as type_label into l from public.disclosures d join public.disclosure_types ty on ty.key = d.violation_type where d.id = p_request;
    title := 'كشف بانتظار قرارك (خطوة ' || p_step || ') — ' || l.type_label;
    body := app.disclosure_target_label((select x from public.disclosures x where x.id = p_request)) || ' · ' || l.log_date::text || case when l.amount is not null then ' · ' || to_char(l.amount, 'FM999,999,999') || ' د.ع' else '' end || ' · أعدّه ' || coalesce(l.prepared_by_name, '');
  elsif p_kind = 'supplies' then
    select r.* into l from public.sector_supply_requests r where r.id = p_request;
    title := 'طلب مستلزمات بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.manager_name || ' · ' || coalesce(l.ref_no, '') || ' · ' || coalesce(app.supply_summary(l.items), l.supply_type);
  elsif p_kind = 'termination' then
    select r.* into l from public.termination_requests r where r.id = p_request;
    title := 'طلب إنهاء خدمة بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.target_name || ' (' || l.target_label || ') · ' || app.termination_type_label(l.termination_type) || ' · آخر يوم ' || l.last_day::text || ' · طلبه ' || app.manager_display_name(l.requester_user_id);
  else
    select l1.*, e.full_name, lt.name as type_name into l from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id left join public.hr_leave_types lt on lt.id = l1.leave_type_id where l1.id = p_request;
    title := 'طلب ' || coalesce(l.type_name, 'إجازة') || ' بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.full_name || ' · ' || l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end
            || case when l.kind = 'time_permit' then ' · ' || to_char(l.start_time, 'HH24:MI') || '–' || to_char(l.end_time, 'HH24:MI') else '' end;
  end if;
  foreach u in array t.approvers loop
    link := case when p_kind = 'disclosure' then (case when exists (select 1 from public.user_roles where user_id = u and role = 'deputy_director') then '/deputy/statements' when exists (select 1 from public.user_roles where user_id = u and role = 'super_admin') then '/admin/disclosures' else app.approval_link_for(u) end) else app.approval_link_for(u) end;
    perform app.hr_notify(u, title, body, link, 'approval:' || t.id::text, 'info');
  end loop;
end$$;

-- مهام الموافقة: تشمل السلف (details: الموظف، النوع، المبلغ، الطريقة)
drop function if exists public.approval_my_tasks();
create or replace function public.approval_my_tasks()
returns table(task_id uuid, request_kind text, request_id uuid, step_no int, total_steps int, step_label text, requester_user_id uuid, requester_name text, requester_role text, requester_role_label text,
              area_name text, parent_sector text, type_name text, start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, notes text, attachment_path text, created_at timestamptz, previous_steps jsonb, items jsonb, ref_no text, details jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  with base as (
    select t.*, e.user_id as req_user, e.full_name as req_name, lt.name as type_name, l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.notes, l.attachment_path, l.created_at as req_created, null::jsonb as items, null::text as ref_no, null::jsonb as details, null::text as fixed_role
    from public.approval_tasks t join public.hr_leaves l on l.id = t.request_id and t.request_kind in ('leave','time_permit') join public.employees e on e.id = l.employee_id left join public.hr_leave_types lt on lt.id = l.leave_type_id
    where t.status = 'pending' and auth.uid() = any(t.approvers) and l.status = 'pending'
    union all
    select t.*, r.manager_id, r.manager_name, 'مستلزمات القواطع', null, null, null, null, null, null, r.notes, null, r.created_at, r.items, r.ref_no, null, null
    from public.approval_tasks t join public.sector_supply_requests r on r.id = t.request_id and t.request_kind = 'supplies'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and r.approval_status = 'pending'
    union all
    select t.*, q.requester_user_id, app.manager_display_name(q.requester_user_id), 'إنهاء خدمة', q.last_day, q.last_day, null, null, null, null, q.reason, q.attachment_path, q.created_at, null, null,
      jsonb_build_object('target_name', q.target_name, 'target_label', q.target_label, 'target_kind', q.target_kind, 'type', q.termination_type, 'type_label', app.termination_type_label(q.termination_type), 'last_day', q.last_day), q.requester_role
    from public.approval_tasks t join public.termination_requests q on q.id = t.request_id and t.request_kind = 'termination'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending'
    union all
    select t.*, a.requested_by, coalesce(a.requested_by_name, app.manager_display_name(a.requested_by)), 'سلفة', null, null, null, null, null, null, a.notes, null, a.created_at, null, a.ref_no,
      jsonb_build_object('employee_name', a.employee_name, 'employee_number', a.employee_number, 'type_name', a.type_name, 'amount', a.amount, 'requested_amount', a.requested_amount,
        'method', a.repayment_method, 'method_label', app.advance_method_label(a.repayment_method), 'installments', a.installments, 'monthly_amount', a.monthly_amount, 'percent', a.percent,
        'estimated_installment', app.advance_installment_amount(a, app.advance_monthly_salary(a.employee_id))), 'ops_room'
    from public.approval_tasks t join public.advances a on a.id = t.request_id and t.request_kind = 'advance'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and a.status = 'pending'
  )
  select b.id, b.request_kind, b.request_id, b.step_no,
    (select count(*)::int from public.approval_tasks x where x.request_kind = b.request_kind and x.request_id = b.request_id and x.status <> 'skipped'),
    b.step_label, b.req_user, b.req_name, coalesce(c.requester_role, b.fixed_role), app.approval_role_label(coalesce(c.requester_role, b.fixed_role)),
    (select string_agg(s.name, '، ') from public.sectors s where s.parent_sector = any(app.user_parent_sectors(b.req_user))
       and (s.id in (select cp.sector_id from public.contractor_profiles cp where cp.user_id = b.req_user and cp.is_active)
            or s.id in (select unnest(mp.sectors) from public.manager_profiles mp where mp.user_id = b.req_user))),
    (select string_agg(app.parent_sector_name(x), '، ') from unnest(app.user_parent_sectors(b.req_user)) x),
    b.type_name, b.start_date, b.end_date, b.start_time, b.end_time, b.days, b.minutes, b.notes, b.attachment_path, b.req_created,
    coalesce((select jsonb_agg(jsonb_build_object('step_no', p.step_no, 'label', p.step_label, 'status', p.status, 'decided_by', app.manager_display_name(p.decided_by), 'decided_at', p.decided_at, 'note', p.note) order by p.step_no)
              from public.approval_tasks p where p.request_kind = b.request_kind and p.request_id = b.request_id and p.step_no < b.step_no), '[]'::jsonb),
    b.items, b.ref_no, b.details
  from base b left join public.approval_chains c on c.id = b.chain_id
  order by b.req_created;
end$$;
revoke all on function public.approval_my_tasks() from public, anon;
grant execute on function public.approval_my_tasks() to authenticated;

create or replace function public.approval_timeline(p_kind text, p_request uuid)
returns table(step_no int, step_label text, status text, approvers jsonb, decided_by_name text, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = public, app as $$
declare requester uuid;
begin
  if p_kind = 'supplies' then select r.manager_id into requester from public.sector_supply_requests r where r.id = p_request;
  elsif p_kind = 'termination' then select r.requester_user_id into requester from public.termination_requests r where r.id = p_request;
  elsif p_kind = 'advance' then select a.requested_by into requester from public.advances a where a.id = p_request;
  else select e.user_id into requester from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id where l1.id = p_request; end if;
  if requester is null and not found then raise exception 'HR_NOT_FOUND'; end if;
  if not (auth.uid() = requester or app.has_role(array['it_admin','hr_officer','super_admin','ops_room'])
          or (p_kind = 'advance' and app.has_role(array['finance_officer']))
          or exists (select 1 from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request and auth.uid() = any(t.approvers))) then
    raise exception 'HR_FORBIDDEN';
  end if;
  return query
  select t.step_no, t.step_label, t.status,
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', a, 'name', app.manager_display_name(a))), '[]'::jsonb) from unnest(t.approvers) a),
    app.manager_display_name(t.decided_by), t.decided_at, t.note
  from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request order by t.step_no;
end$$;

-- ═══════════════ ⑧ المالية: التسليم، التسديد النقدي، الإلغاء ═══════════════
create or replace function public.advance_deliver(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare a public.advances; tx uuid; m date := (date_trunc('month', current_date) + interval '1 month')::date;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'ADVANCE_FORBIDDEN'; end if;
  select * into a from public.advances where id = p_id for update;
  if a.id is null then raise exception 'ADVANCE_NOT_FOUND'; end if;
  if a.status <> 'approved' then raise exception 'ADVANCE_NOT_APPROVED'; end if;
  insert into public.treasury_transactions (ref_no, kind, amount, type_name, employee_id, employee_name, employee_number, details, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at, finance_note)
  values (app.treasury_next_ref(), 'advance', a.amount, 'تسليم سلفة — ' || a.type_name, a.employee_id, a.employee_name, a.employee_number, a.ref_no || ' · ' || app.advance_method_label(a.repayment_method), 'confirmed', true,
          auth.uid(), app.user_display_name(auth.uid()), auth.uid(), now(), nullif(trim(coalesce(p_note, '')), ''))
  returning id into tx;
  update public.advances set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(), delivery_note = nullif(trim(coalesce(p_note, '')), ''), start_month = m, treasury_tx_id = tx, updated_at = now() where id = p_id;
  perform app.advance_log(p_id, 'delivered', a.amount, p_note);
  perform app.hr_notify(a.requested_by, 'سُلّمت السلفة ' || a.ref_no, a.employee_name || ' · ' || to_char(a.amount, 'FM999,999,999') || ' د.ع · يبدأ الاستقطاع من شهر ' || to_char(m, 'YYYY-MM'), '/ops-room/advances', 'advance_dlv:' || a.id::text, 'success');
  select * into a from public.advances where id = p_id;
  return app.advance_json(a);
end$$;

create or replace function public.advance_settle_cash(p_id uuid, p_amount numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare a public.advances; tx uuid; remaining numeric; amt numeric := round(coalesce(p_amount, 0));
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'ADVANCE_FORBIDDEN'; end if;
  select * into a from public.advances where id = p_id for update;
  if a.id is null then raise exception 'ADVANCE_NOT_FOUND'; end if;
  if a.status <> 'delivered' then raise exception 'ADVANCE_NOT_DELIVERED'; end if;
  remaining := a.amount - a.repaid_total;
  if amt <= 0 or amt > remaining then raise exception 'ADVANCE_SETTLE_AMOUNT_INVALID'; end if;
  insert into public.treasury_transactions (ref_no, kind, amount, type_name, employee_id, employee_name, employee_number, details, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at, finance_note)
  values (app.treasury_next_ref(), 'advance_repayment', amt, 'تسديد سلفة نقداً — ' || a.type_name, a.employee_id, a.employee_name, a.employee_number, a.ref_no, 'confirmed', true,
          auth.uid(), app.user_display_name(auth.uid()), auth.uid(), now(), nullif(trim(coalesce(p_note, '')), ''))
  returning id into tx;
  insert into public.advance_installments (advance_id, period_month, amount, source, treasury_tx_id, note, created_by)
  values (p_id, date_trunc('month', current_date)::date, amt, 'cash', tx, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  update public.advances set repaid_total = repaid_total + amt, status = case when repaid_total + amt >= amount then 'settled' else status end,
         settled_at = case when repaid_total + amt >= amount then now() else settled_at end, updated_at = now() where id = p_id;
  perform app.advance_log(p_id, 'cash_settlement', amt, p_note);
  select * into a from public.advances where id = p_id;
  if a.status = 'settled' then perform app.advance_log(p_id, 'settled', a.amount, null); end if;
  return app.advance_json(a);
end$$;

-- الإلغاء: غرفة العمليات لطلب قيد الموافقة، المالية لسلفة معتمدة لم تُسلَّم
create or replace function public.advance_cancel(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare a public.advances;
begin
  select * into a from public.advances where id = p_id for update;
  if a.id is null then raise exception 'ADVANCE_NOT_FOUND'; end if;
  if length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'APPROVAL_REASON_REQUIRED'; end if;
  if a.status = 'pending' then
    if not (app.has_role(array['ops_room','super_admin']) or app.has_role(array['finance_officer'])) then raise exception 'ADVANCE_FORBIDDEN'; end if;
  elsif a.status = 'approved' then
    if not app.has_role(array['finance_officer','super_admin']) then raise exception 'ADVANCE_FORBIDDEN'; end if;
  else raise exception 'ADVANCE_NOT_CANCELLABLE'; end if;
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الطلب' where request_kind = 'advance' and request_id = p_id and status in ('pending','waiting');
  update public.advances set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason), updated_at = now() where id = p_id;
  perform app.advance_log(p_id, 'cancelled', null, p_reason);
  if a.requested_by <> auth.uid() then
    perform app.hr_notify(a.requested_by, 'أُلغيت السلفة ' || a.ref_no, a.employee_name || ' · ' || trim(p_reason), '/ops-room/advances', 'advance_cxl:' || a.id::text, 'warning');
  end if;
  select * into a from public.advances where id = p_id;
  return app.advance_json(a);
end$$;

-- ═══════════════ ⑨ القوائم والتفاصيل ═══════════════
-- المالية: كل السلف بفلاتر؛ غرفة العمليات: طلباتها (حالة فقط، بلا أقساط/رواتب)
create or replace function public.advances_list(p_status text default null, p_from date default null, p_to date default null, p_q text default null, p_limit int default 300)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare fin boolean := app.has_role(array['finance_officer','super_admin']); ops boolean := app.has_role(array['ops_room']);
begin
  if not (fin or ops) then raise exception 'ADVANCE_FORBIDDEN'; end if;
  return (
    select coalesce(jsonb_agg(
      case when fin then app.advance_json(a)
           else jsonb_build_object('id', a.id, 'ref_no', a.ref_no, 'employee_id', a.employee_id, 'employee_name', a.employee_name, 'employee_number', a.employee_number, 'type_name', a.type_name,
                  'amount', a.amount, 'requested_amount', a.requested_amount, 'repayment_method', a.repayment_method, 'method_label', app.advance_method_label(a.repayment_method),
                  'installments', a.installments, 'monthly_amount', a.monthly_amount, 'percent', a.percent, 'notes', a.notes, 'status', a.status, 'status_label', app.advance_status_label(a.status),
                  'requested_by', a.requested_by, 'requested_by_name', a.requested_by_name, 'created_at', a.created_at, 'approved_at', a.approved_at, 'rejected_at', a.rejected_at, 'reject_note', a.reject_note,
                  'delivered_at', a.delivered_at, 'cancelled_at', a.cancelled_at, 'cancel_reason', a.cancel_reason,
                  'current_step', (select jsonb_build_object('step_no', t.step_no, 'label', t.step_label) from public.approval_tasks t where t.request_kind = 'advance' and t.request_id = a.id and t.status = 'pending' order by t.step_no limit 1)) end
      order by a.created_at desc), '[]'::jsonb)
    from public.advances a
    where a.id in (select x.id from public.advances x
          where (p_status is null or p_status = '' or x.status = p_status or (p_status = 'open' and x.status in ('pending','approved','delivered')))
            and (p_from is null or (x.created_at at time zone 'Asia/Baghdad')::date >= p_from)
            and (p_to is null or (x.created_at at time zone 'Asia/Baghdad')::date <= p_to)
            and (trim(coalesce(p_q, '')) = '' or x.employee_name ilike '%' || trim(p_q) || '%' or coalesce(x.employee_number, '') ilike '%' || trim(p_q) || '%' or x.ref_no ilike '%' || trim(p_q) || '%')
          order by x.created_at desc limit least(greatest(coalesce(p_limit, 300), 1), 2000)));
end$$;

create or replace function public.advance_get(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare a public.advances;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'ADVANCE_FORBIDDEN'; end if;
  select * into a from public.advances where id = p_id;
  if a.id is null then raise exception 'ADVANCE_NOT_FOUND'; end if;
  return app.advance_json(a) || jsonb_build_object(
    'installment_rows', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'period_month', i.period_month, 'amount', i.amount, 'source', i.source, 'export_id', i.export_id, 'note', i.note, 'created_at', i.created_at) order by i.created_at), '[]'::jsonb) from public.advance_installments i where i.advance_id = p_id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'actor_name', e.actor_name, 'amount', e.amount, 'note', e.note, 'created_at', e.created_at) order by e.id), '[]'::jsonb) from public.advance_events e where e.advance_id = p_id),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('step_no', t.step_no, 'label', t.step_label, 'status', t.status, 'decided_by', app.manager_display_name(t.decided_by), 'decided_at', t.decided_at, 'note', t.note,
                   'approvers', (select coalesce(jsonb_agg(app.manager_display_name(u)), '[]'::jsonb) from unnest(t.approvers) u)) order by t.step_no), '[]'::jsonb)
                 from public.approval_tasks t where t.request_kind = 'advance' and t.request_id = p_id));
end$$;

-- ملخص للمالية (بطاقات)
create or replace function public.advances_summary() returns jsonb language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'awaiting_delivery', (select count(*) from public.advances where status = 'approved'),
    'awaiting_delivery_amount', (select coalesce(sum(amount), 0) from public.advances where status = 'approved'),
    'pending', (select count(*) from public.advances where status = 'pending'),
    'active', (select count(*) from public.advances where status = 'delivered'),
    'outstanding', (select coalesce(sum(amount - repaid_total), 0) from public.advances where status = 'delivered'),
    'delivered_total', (select coalesce(sum(amount), 0) from public.advances where status in ('delivered','settled')),
    'repaid_total', (select coalesce(sum(repaid_total), 0) from public.advances where status in ('delivered','settled')))
  where app.has_role(array['finance_officer','super_admin']) $$;

-- ═══════════════ ⑩ كشف الرواتب: قسط السلفة تلقائياً ═══════════════
-- بعد إدراج صفوف التصدير: يُحتسب القسط لكل موظف لديه سلفة مسلَّمة بدأ شهر استقطاعها، ويُطرح من الصافي (لا يتجاوز الصافي)
create or replace function app.advance_apply_to_export(p_export uuid, p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare n int;
begin
  with due as (
    select r.id as row_id, least(coalesce(r.proposed_net, 0), sum(app.advance_installment_amount(a, r.gross_amount))) as inst
    from public.hr_month_export_rows r
    join public.advances a on a.employee_id = r.employee_id and a.status = 'delivered' and a.start_month <= p_month and a.amount > a.repaid_total
    where r.export_id = p_export and r.pay_type is not null
    group by r.id, r.proposed_net)
  update public.hr_month_export_rows r
     set advance_installment = round(d.inst),
         deductions_total = coalesce(r.deductions_total, 0) + round(d.inst),
         proposed_net = greatest(0, coalesce(r.proposed_net, 0) - round(d.inst)),
         final_net = greatest(0, coalesce(r.final_net, r.proposed_net, 0) - round(d.inst))
  from due d where d.row_id = r.id and d.inst > 0;
  get diagnostics n = row_count;
  return n;
end$$;

-- إعادة تعريف ops_month_export (نسخة 00188 كاملة) مع استدعاء app.advance_apply_to_export قبل الإرجاع
-- (لا ترقيع نصي لتعريف الدالة: نهايات الأسطر على الخادم قد تختلف عن المحلية)
create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_prorate_allow boolean := app.hr_policy_bool('prorate_allowances', true);
        v_cap numeric := app.hr_policy_num('auto_deduction_cap_ratio', 1);
        v_auto_on boolean := app.hr_policy_bool('auto_deduction_enabled', true);
        v_mode text := coalesce(app.hr_policy() ->> 'auto_deduction_amount_mode', 'salary');
        v_fix_day numeric := app.hr_policy_num('fixed_absent_day_amount', 0);
        v_fix_min numeric := app.hr_policy_num('fixed_shortfall_minute_amount', 0);
        v_max_days numeric := app.hr_policy_num('max_auto_deduction_days_per_month', 0);
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  n_eval := app.hr_evaluate_month(m);
  update public.hr_month_exports set status = 'superseded' where period_month = m and status = 'exported';
  select coalesce(max(version), 0) + 1 into v_ver from public.hr_month_exports where period_month = m;
  insert into public.hr_month_exports (period_month, version, exported_by) values (m, v_ver, auth.uid()) returning id into v_id;
  perform app.hr_overtime_credit(m);

  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    auto_deduction_minutes, auto_deduction_days, shift_minutes, overtime_minutes, shortfall_minutes, auto_deduction_amount,
    days_leave_paid, days_leave_unpaid, auto_absence_days, auto_shortfall_days, ops_deduction_days_amount, payable_days, gross_amount, deductions_total,
    scheduled_days, unevaluated_days, period_from, period_to, covered_days, days_in_month, day_rate, proration_ratio, auto_deduction_capped,
    auto_deduction_basis, auto_deduction_days_capped,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, s.auto_days, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days, per.period_from, per.period_to, per.covered_days, per.days_in_month, calc.day_rate, calc.ratio, calc.capped,
    case when not v_auto_on then 'disabled' else v_mode end, calc.days_capped,
    sp.pay_type, sp.base_salary, sp.daily_rate, calc.allow, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  join app.hr_month_period(m) per on per.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.allowances, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') al
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.fixed_deductions, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') fd
  cross join lateral (
    select y.*,
      case when sp.employee_id is null then null else greatest(0, round(y.gross - y.deductions, 2)) end as net
    from (
      select x.day_rate, x.ratio, x.payable_days, x.ops_days_amount, x.allow, x.auto_days_eff, x.days_capped,
        x.auto_raw > x.auto_cap as capped,
        least(x.auto_raw, x.auto_cap) as auto_amount,
        x.gross,
        case when sp.employee_id is null then null else round(fd.total + s.ded_amount + x.ops_days_amount + least(x.auto_raw, x.auto_cap), 2) end as deductions
      from (
        select r.*,
          case when sp.employee_id is null then null
               when sp.pay_type = 'daily' then round(sp.daily_rate * r.payable_days + r.allow, 2)
               else round(r.base_due + r.allow, 2) end as gross,
          case when sp.employee_id is null then 0
               when sp.pay_type = 'daily' then round(v_cap * (sp.daily_rate * r.payable_days + r.allow), 2)
               else round(v_cap * (r.base_due + r.allow), 2) end as auto_cap
        from (
          select rates.day_rate, rates.ratio, dd.auto_days_eff, dd.days_capped,
            case when sp.pay_type = 'daily' then (s.days_present + s.days_leave_paid)::numeric else null end as payable_days,
            case when sp.pay_type = 'daily' then 0
                 when per.full_month or not v_prorate then sp.base_salary
                 else least(sp.base_salary, round(rates.day_rate * per.covered_days, 2)) end as base_due,
            case when sp.pay_type = 'monthly' and v_prorate and v_prorate_allow and not per.full_month then round(al.total * rates.ratio, 2) else al.total end as allow,
            -- مبلغ الاستقطاع التلقائي: متوقف ⇒ 0 · salary ⇒ أجر الدقيقة/اليوم من الراتب · fixed ⇒ مبالغ ثابتة من السياسة
            case when not v_auto_on then 0
                 when v_mode = 'fixed' then round(v_fix_min * s.auto_minutes + v_fix_day * dd.auto_days_eff, 2)
                 else round(rates.minute_rate * s.auto_minutes + rates.day_rate * dd.auto_days_eff, 2) end as auto_raw,
            round(rates.day_rate * s.ded_days, 2) as ops_days_amount
          from (
            select dr.day_rate,
              case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then round(sp.daily_rate / greatest(s.shift_minutes, 1), 4) else round(dr.day_rate / greatest(s.shift_minutes, 1), 4) end as minute_rate,
              case when per.full_month or not v_prorate or sp.pay_type = 'daily' or sp.employee_id is null or sp.base_salary = 0 then 1
                   else least(1, round(least(sp.base_salary, dr.day_rate * per.covered_days) / sp.base_salary, 6)) end as ratio
            from (select case when sp.employee_id is null then 0
                              when sp.pay_type = 'daily' then sp.daily_rate
                              when v_basis = 'calendar_days' then round(sp.base_salary / per.days_in_month, 4)
                              else round(sp.base_salary / 30, 4) end as day_rate) dr
          ) rates,
          lateral (
            -- أيام الاستقطاع المؤثرة: اليومي لا يُخصم غيابه (غير مدفوع أصلاً)؛ سقف أيام شهري اختياري
            select case when v_max_days > 0 then least(base_days, v_max_days) else base_days end as auto_days_eff,
                   v_max_days > 0 and base_days > v_max_days as days_capped
            from (select case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end as base_days) bd
          ) dd) r) x) y) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'prorate', v_prorate, 'auto_deduction', case when v_auto_on then v_mode else 'disabled' end), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  perform app.advance_apply_to_export(v_id, m);
  return v_id;
end$$;

-- عند اعتماد المالية للشهر: تُسجَّل الأقساط فعلياً على السلف (مرة واحدة لكل سلفة/شهر)
create or replace function app.advance_post_installments(p_export uuid) returns int
language plpgsql security definer set search_path = public, app as $$
declare x record; r record; a public.advances; left_amt numeric; take numeric; n int := 0;
begin
  select * into x from public.hr_month_exports where id = p_export;
  if x.id is null then return 0; end if;
  for r in select * from public.hr_month_export_rows where export_id = p_export and advance_installment > 0 loop
    left_amt := r.advance_installment;
    for a in select * from public.advances where employee_id = r.employee_id and status = 'delivered' and start_month <= x.period_month and amount > repaid_total order by created_at loop
      exit when left_amt <= 0;
      take := least(left_amt, a.amount - a.repaid_total, app.advance_installment_amount(a, r.gross_amount));
      if take <= 0 then take := least(left_amt, a.amount - a.repaid_total); end if;
      if take <= 0 then continue; end if;
      if exists (select 1 from public.advance_installments i where i.advance_id = a.id and i.period_month = x.period_month and i.source = 'payroll') then continue; end if;
      insert into public.advance_installments (advance_id, period_month, amount, source, export_id, created_by) values (a.id, x.period_month, take, 'payroll', p_export, auth.uid());
      update public.advances set repaid_total = repaid_total + take,
             status = case when repaid_total + take >= amount then 'settled' else status end,
             settled_at = case when repaid_total + take >= amount then now() else settled_at end, updated_at = now() where id = a.id;
      perform app.advance_log(a.id, 'payroll_installment', take, 'قسط شهر ' || to_char(x.period_month, 'YYYY-MM'));
      if (select status from public.advances where id = a.id) = 'settled' then perform app.advance_log(a.id, 'settled', a.amount, null); end if;
      left_amt := left_amt - take; n := n + 1;
    end loop;
  end loop;
  return n;
end$$;

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
  perform app.advance_post_installments(p_export);
end$$;

-- كشف المالية: عمود قسط السلفة (تغيير نوع الإرجاع ⇒ drop ثم create)
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
  auto_deduction_basis text, auto_deduction_days_capped boolean, advance_installment numeric)
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
         r.auto_deduction_basis, r.auto_deduction_days_capped, r.advance_installment
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin'])
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;

-- ═══════════════ ⑪ القاصة: الرصيد يشمل السلف ═══════════════
create or replace function public.treasury_summary(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['executive_director','finance_officer','super_admin']) then raise exception 'EXEC_FORBIDDEN'; end if;
  return (
    with r as (select * from public.treasury_transactions x
               where (p_from is null or (x.created_at at time zone 'Asia/Baghdad')::date >= p_from) and (p_to is null or (x.created_at at time zone 'Asia/Baghdad')::date <= p_to))
    select jsonb_build_object(
      -- الرصيد الكلي: المستلَم المؤكَّد + تسديدات السلف النقدية − المكافآت النقدية − تسديدات GPS − السلف المسلَّمة
      'balance', (select coalesce(sum(case when kind in ('receipt','advance_repayment') then amount else -amount end), 0) from public.treasury_transactions where status = 'confirmed' and affects_balance),
      'frozen', (select coalesce(sum(amount), 0) from public.treasury_transactions where status = 'pending' and kind = 'receipt'),
      'pending_out', (select coalesce(sum(amount), 0) from public.treasury_transactions where status = 'pending' and kind <> 'receipt'),
      'pending_count', (select count(*) from public.treasury_transactions where status = 'pending'),
      'range', jsonb_build_object(
        'receipts_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'receipt' and status = 'confirmed'),
        'receipts_pending', (select coalesce(sum(amount), 0) from r where kind = 'receipt' and status = 'pending'),
        'rewards_cash_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'reward' and reward_type = 'cash' and status = 'confirmed'),
        'rewards_count', (select count(*) from r where kind = 'reward' and status <> 'cancelled'),
        'gps_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'gps_payment' and status = 'confirmed'),
        'gps_pending', (select coalesce(sum(amount), 0) from r where kind = 'gps_payment' and status = 'pending'),
        'advances_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'advance' and status = 'confirmed'),
        'advance_repayments', (select coalesce(sum(amount), 0) from r where kind = 'advance_repayment' and status = 'confirmed'),
        'count', (select count(*) from r)),
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type_id', type_id, 'name', type_name, 'confirmed', c, 'pending', p, 'count', n) order by c desc), '[]'::jsonb)
                  from (select type_id, type_name, coalesce(sum(amount) filter (where status = 'confirmed'), 0) c, coalesce(sum(amount) filter (where status = 'pending'), 0) p, count(*) n from r where kind = 'receipt' group by type_id, type_name) q),
      'rewards_by_type', (select coalesce(jsonb_object_agg(reward_type, n), '{}'::jsonb) from (select reward_type, count(*) n from r where kind = 'reward' and status <> 'cancelled' group by reward_type) q),
      'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'receipts', rc, 'rewards', rw, 'gps', g, 'advances', adv) order by m), '[]'::jsonb)
                   from (select to_char(created_at at time zone 'Asia/Baghdad', 'YYYY-MM') m,
                                coalesce(sum(amount) filter (where kind = 'receipt' and status = 'confirmed'), 0) rc,
                                coalesce(sum(amount) filter (where kind = 'reward' and status = 'confirmed'), 0) rw,
                                coalesce(sum(amount) filter (where kind = 'gps_payment' and status = 'confirmed'), 0) g,
                                coalesce(sum(amount) filter (where kind = 'advance' and status = 'confirmed'), 0) adv
                         from r group by 1) q)));
end$$;

-- ═══════════════ ⑫ الصلاحيات ═══════════════
revoke all on function public.advance_types_list(boolean), public.advance_type_save(uuid, text, numeric, int, boolean, int), public.advance_policy(), public.advance_employee_lookup(text),
  public.advance_request_create(uuid, uuid, numeric, text, int, numeric, numeric, text), public.advance_decide(uuid, boolean, text, numeric, int),
  public.advance_deliver(uuid, text), public.advance_settle_cash(uuid, numeric, text), public.advance_cancel(uuid, text),
  public.advances_list(text, date, date, text, int), public.advance_get(uuid), public.advances_summary(), public.finance_payroll_sheet(date), public.treasury_summary(date, date) from public, anon;
grant execute on function public.advance_types_list(boolean), public.advance_type_save(uuid, text, numeric, int, boolean, int), public.advance_policy(), public.advance_employee_lookup(text),
  public.advance_request_create(uuid, uuid, numeric, text, int, numeric, numeric, text), public.advance_decide(uuid, boolean, text, numeric, int),
  public.advance_deliver(uuid, text), public.advance_settle_cash(uuid, numeric, text), public.advance_cancel(uuid, text),
  public.advances_list(text, date, date, text, int), public.advance_get(uuid), public.advances_summary(), public.finance_payroll_sheet(date), public.treasury_summary(date, date) to authenticated;
