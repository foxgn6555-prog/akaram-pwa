-- 00195 · وحدة «الاستقطاعات التلقائية» في التطوير المركزية
--   قواعد متعددة (افتراضية + مخصصة) بكل تفاصيل الاستقطاع (غياب/بصمة ناقصة/شرائح نقص/سماحية/من الراتب أو مبالغ ثابتة/سقوف)،
--   نطاق تطبيق (فرع / قسم أو مسمى / موظف — الأخص يغلب الأعم)، استثناءات بسبب ومدة، محاكاة، سجل تغييرات،
--   وإعادة احتساب الشهر الجاري فوراً. المحرّك والتصدير يقرآن القاعدة الفعّالة لكل موظف. الكشف المُصدَّر يذكر اسم القاعدة.

create table if not exists public.hr_deduction_rules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  settings    jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
create unique index if not exists hr_deduction_rules_default_uq on public.hr_deduction_rules ((true)) where is_default;
alter table public.hr_deduction_rules enable row level security;
drop policy if exists "hr_deduction_rules: قراءة" on public.hr_deduction_rules;
create policy "hr_deduction_rules: قراءة" on public.hr_deduction_rules for select to authenticated using (app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'finance_officer', 'super_admin']));

create table if not exists public.hr_deduction_rule_targets (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references public.hr_deduction_rules (id) on delete cascade,
  target_type text not null check (target_type in ('branch', 'department', 'employee')),
  target_id   uuid not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (target_type, target_id)
);
alter table public.hr_deduction_rule_targets enable row level security;
drop policy if exists "hr_deduction_rule_targets: قراءة" on public.hr_deduction_rule_targets;
create policy "hr_deduction_rule_targets: قراءة" on public.hr_deduction_rule_targets for select to authenticated using (app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin']));

create table if not exists public.hr_deduction_exemptions (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('branch', 'department', 'employee')),
  target_id   uuid not null,
  reason      text not null,
  from_date   date not null default current_date,
  to_date     date,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists hr_deduction_exemptions_target_idx on public.hr_deduction_exemptions (target_type, target_id);
alter table public.hr_deduction_exemptions enable row level security;
drop policy if exists "hr_deduction_exemptions: قراءة" on public.hr_deduction_exemptions;
create policy "hr_deduction_exemptions: قراءة" on public.hr_deduction_exemptions for select to authenticated using (app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin']));

create table if not exists public.hr_deduction_rule_audit (
  id         bigserial primary key,
  action     text not null,          -- rule_save | rule_delete | target_set | exemption_add | exemption_remove
  rule_id    uuid,
  before     jsonb,
  after      jsonb,
  actor      uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.hr_deduction_rule_audit enable row level security;
drop policy if exists "hr_deduction_rule_audit: قراءة" on public.hr_deduction_rule_audit;
create policy "hr_deduction_rule_audit: قراءة" on public.hr_deduction_rule_audit for select to authenticated using (app.has_role(array['it_admin', 'super_admin']));

alter table public.hr_month_export_rows add column if not exists auto_deduction_rule text;

-- مفاتيح الاستقطاع (تُنسخ من سياسة HR الحالية إلى القاعدة الافتراضية حتى لا يتغيّر أي سلوك عند الترقية)
create or replace function app.hr_deduction_keys() returns text[] language sql immutable as $$
  select array['auto_deduction_enabled','deduct_absence_enabled','deduct_shortfall_enabled','deduct_unpaid_leave_enabled','deduction_tiers','absent_day_deduction_days',
               'incomplete_punch_as_absent','grace_minutes_default','auto_deduction_amount_mode','fixed_absent_day_amount','fixed_shortfall_minute_amount',
               'max_auto_deduction_days_per_month','auto_deduction_cap_ratio']
$$;
create or replace function app.hr_deduction_defaults() returns jsonb language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'auto_deduction_enabled', true, 'deduct_absence_enabled', true, 'deduct_shortfall_enabled', true, 'deduct_unpaid_leave_enabled', true,
    'deduction_tiers', '[{"from":1,"to":15,"minutes":0},{"from":16,"to":30,"minutes":30},{"from":31,"to":60,"minutes":60},{"from":61,"to":120,"minutes":120},{"from":121,"to":null,"day_fraction":0.5}]'::jsonb,
    'absent_day_deduction_days', 1, 'incomplete_punch_as_absent', false, 'grace_minutes_default', 15, 'auto_deduction_amount_mode', 'salary',
    'fixed_absent_day_amount', 0, 'fixed_shortfall_minute_amount', 0, 'max_auto_deduction_days_per_month', 0, 'auto_deduction_cap_ratio', 1)
  || coalesce((select jsonb_object_agg(k, v) from jsonb_each(app.hr_policy()) kv(k, v) where k = any (app.hr_deduction_keys())), '{}'::jsonb)
$$;
insert into public.hr_deduction_rules (name, description, is_default, settings)
select 'القاعدة الافتراضية', 'تُطبَّق على كل موظف لا تشمله قاعدة أخص (موظف ← قسم ← فرع)', true, app.hr_deduction_defaults()
where not exists (select 1 from public.hr_deduction_rules where is_default);

-- التحقق من صحة إعدادات قاعدة (شرائح متصلة تبدأ من 1 وآخرها مفتوح، نسب وسقوف ضمن الحدود)
create or replace function app.hr_deduction_validate(s jsonb) returns void language plpgsql immutable as $$
declare t jsonb; i int := 0; prev_to int := 0; n int;
begin
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'HR_RULE_INVALID'; end if;
  if jsonb_typeof(s -> 'deduction_tiers') <> 'array' or jsonb_array_length(s -> 'deduction_tiers') = 0 then raise exception 'HR_TIERS_INVALID'; end if;
  n := jsonb_array_length(s -> 'deduction_tiers');
  for t in select * from jsonb_array_elements(s -> 'deduction_tiers') loop
    i := i + 1;
    if (t ->> 'from')::int <> prev_to + 1 then raise exception 'HR_TIERS_INVALID'; end if;
    if (t ->> 'to') is not null then
      if (t ->> 'to')::int < (t ->> 'from')::int then raise exception 'HR_TIERS_INVALID'; end if;
      prev_to := (t ->> 'to')::int;
    elsif i <> n then raise exception 'HR_TIERS_INVALID'; end if;
    if coalesce((t ->> 'minutes')::int, 0) < 0 or coalesce((t ->> 'day_fraction')::numeric, 0) < 0 or coalesce((t ->> 'day_fraction')::numeric, 0) > 1 then raise exception 'HR_TIERS_INVALID'; end if;
  end loop;
  if (select (x ->> 'to') is not null from jsonb_array_elements(s -> 'deduction_tiers') x offset (n - 1) limit 1) then raise exception 'HR_TIERS_INVALID'; end if;
  if coalesce((s ->> 'absent_day_deduction_days')::numeric, 1) not between 0 and 3 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'grace_minutes_default')::int, 15) not between 0 and 120 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce(s ->> 'auto_deduction_amount_mode', 'salary') not in ('salary', 'fixed') then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) < 0 or coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0) < 0 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'max_auto_deduction_days_per_month')::numeric, 0) not between 0 and 31 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'auto_deduction_cap_ratio')::numeric, 1) not between 0 and 1 then raise exception 'HR_RULE_INVALID'; end if;
end$$;

-- القاعدة الفعّالة لموظف في تاريخ: استثناء ⇒ متوقف؛ وإلا الأخص: موظف ← سلسلة القسم/المسمى صعوداً ← الفرع ← الافتراضية
create or replace function app.hr_deduction_rule_for(p_employee uuid, p_date date default current_date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare e record; r record; v_rule uuid; v_source text; v_level uuid; ex record;
begin
  select id, branch_id, department_id, job_title_id into e from public.employees where id = p_employee;
  if not found then return app.hr_deduction_defaults() || jsonb_build_object('_source', 'default', '_rule_name', 'القاعدة الافتراضية'); end if;
  -- الاستثناءات (أي مستوى)
  select x.* into ex from public.hr_deduction_exemptions x
  where x.from_date <= p_date and (x.to_date is null or x.to_date >= p_date)
    and ((x.target_type = 'employee' and x.target_id = e.id)
      or (x.target_type = 'branch' and x.target_id = e.branch_id)
      or (x.target_type = 'department' and x.target_id in (
            with recursive up as (select d.id, d.parent_id from public.departments d where d.id in (e.job_title_id, e.department_id)
                                  union select d.id, d.parent_id from public.departments d join up on d.id = up.parent_id)
            select id from up)))
  order by case x.target_type when 'employee' then 0 when 'department' then 1 else 2 end limit 1;
  if found then
    return app.hr_deduction_defaults() || jsonb_build_object('auto_deduction_enabled', false, '_exempt', true, '_exempt_reason', ex.reason, '_exempt_level', ex.target_type, '_exempt_until', ex.to_date, '_source', 'exempt', '_rule_id', null, '_rule_name', 'مستثنى');
  end if;
  -- موظف
  select t.rule_id into v_rule from public.hr_deduction_rule_targets t join public.hr_deduction_rules dr on dr.id = t.rule_id and dr.is_active where t.target_type = 'employee' and t.target_id = e.id;
  if v_rule is not null then v_source := 'employee'; v_level := e.id; end if;
  -- أقرب قسم/مسمى في السلسلة الصاعدة
  if v_rule is null then
    with recursive up as (select d.id, d.parent_id, 0 as depth from public.departments d where d.id = coalesce(e.job_title_id, e.department_id)
                          union all select d.id, d.parent_id, up.depth + 1 from public.departments d join up on d.id = up.parent_id)
    select t.rule_id, up.id into v_rule, v_level from up join public.hr_deduction_rule_targets t on t.target_type = 'department' and t.target_id = up.id
    join public.hr_deduction_rules dr on dr.id = t.rule_id and dr.is_active order by up.depth limit 1;
    if v_rule is not null then v_source := 'department'; end if;
  end if;
  -- فرع
  if v_rule is null and e.branch_id is not null then
    select t.rule_id into v_rule from public.hr_deduction_rule_targets t join public.hr_deduction_rules dr on dr.id = t.rule_id and dr.is_active where t.target_type = 'branch' and t.target_id = e.branch_id;
    if v_rule is not null then v_source := 'branch'; v_level := e.branch_id; end if;
  end if;
  if v_rule is null then
    select id into v_rule from public.hr_deduction_rules where is_default;
    v_source := 'default'; v_level := null;
  end if;
  select * into r from public.hr_deduction_rules where id = v_rule;
  return app.hr_deduction_defaults() || coalesce(r.settings, '{}'::jsonb) || jsonb_build_object('_source', v_source, '_level_id', v_level, '_rule_id', r.id, '_rule_name', r.name, '_exempt', false);
end$$;

-- الشريحة من إعدادات قاعدة معيّنة (بديل hr_tier_for المرتبط بالسياسة العامة)
create or replace function app.hr_tier_for_rule(p_rule jsonb, p_shortfall int, p_shift_minutes int, out o_minutes int, out o_days numeric)
language plpgsql immutable as $$
declare t jsonb;
begin
  o_minutes := 0; o_days := 0;
  if coalesce(p_shortfall, 0) <= 0 then return; end if;
  for t in select * from jsonb_array_elements(coalesce(p_rule -> 'deduction_tiers', '[]'::jsonb)) loop
    if p_shortfall >= (t ->> 'from')::int and ((t ->> 'to') is null or p_shortfall <= (t ->> 'to')::int) then
      o_minutes := coalesce((t ->> 'minutes')::int, 0); o_days := coalesce((t ->> 'day_fraction')::numeric, 0); return;
    end if;
  end loop;
end$$;

-- مشتقات اليوم بقاعدة الموظف الفعّالة (بديل 00188)
create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int; rl jsonb;
        v_on boolean; v_abs boolean; v_sf boolean; v_ul boolean;
begin
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then return; end if;
  rl := app.hr_deduction_rule_for(p_employee, p_date);
  v_on := coalesce((rl ->> 'auto_deduction_enabled')::boolean, true); v_abs := coalesce((rl ->> 'deduct_absence_enabled')::boolean, true);
  v_sf := coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true); v_ul := coalesce((rl ->> 'deduct_unpaid_leave_enabled')::boolean, true);
  if a.expected_in is not null and a.expected_out is not null then v_req := floor(extract(epoch from (a.expected_out - a.expected_in)) / 60)::int; end if;
  select coalesce(sum(l.minutes), 0) into v_permit from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'time_permit' and l.start_date = p_date and t.is_paid;
  select t.* into lt from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'leave' and p_date between l.start_date and l.end_date limit 1;

  if a.status = 'leave' then
    v_short := 0; v_permit := 0;
    if lt.id is not null and not lt.is_paid and not a.is_rest_day and v_req > 0 and v_on and v_ul then v_days := lt.deduction_days_per_day; v_reason := lt.name; end if;
  elsif a.is_rest_day or v_req = 0 then
    v_short := 0;
  elsif a.status = 'absent' then
    v_short := v_req;
    if v_on and v_abs then v_days := coalesce((rl ->> 'absent_day_deduction_days')::numeric, 1); v_reason := 'غياب بلا إجازة معتمدة'; end if;
  elsif a.status = 'incomplete' then
    v_short := 0;
    if v_on and v_abs and coalesce((rl ->> 'incomplete_punch_as_absent')::boolean, false) then v_days := coalesce((rl ->> 'absent_day_deduction_days')::numeric, 1); v_reason := 'بصمة ناقصة تُعامل كغياب'; end if;
  else
    v_short := greatest(0, v_req - a.worked_minutes - v_permit);
    if v_short > 0 and v_on and v_sf then
      select o_minutes, o_days into v_min, v_days from app.hr_tier_for_rule(rl, v_short, v_req);
      if v_min > 0 or v_days > 0 then v_reason := 'نقص ' || v_short || ' دقيقة عن ساعات الشفت'; end if;
    end if;
    if app.hr_policy_bool('overtime_enabled', true) and a.check_out is not null and a.expected_out is not null and v_short = 0 then
      v_ot := greatest(0, a.worked_minutes + v_permit - v_req);
      if v_ot < v_ot_block then v_ot := 0; end if;
    end if;
  end if;
  v_grace := coalesce((rl ->> 'grace_minutes_default')::int, 15);
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and v_short <= v_grace then v_min := 0; v_days := 0; v_reason := null; end if;
  if v_reason is not null and (rl ->> '_source') <> 'default' then v_reason := v_reason || ' (' || (rl ->> '_rule_name') || ')'; end if;

  update public.hr_attendance_days set required_minutes = v_req, permit_minutes = v_permit, shortfall_minutes = v_short, overtime_minutes = v_ot,
    proposed_deduction_minutes = v_min, proposed_deduction_days = v_days, deduction_reason = v_reason
  where employee_id = p_employee and work_date = p_date;
end$$;

-- إعادة احتساب الشهر الجاري (غير المقفل) بعد أي تغيير في القواعد/النطاق/الاستثناءات
create or replace function app.hr_deduction_reevaluate() returns void language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', app.hr_local_date(now()))::date;
begin
  if not app.hr_month_locked(m) then perform app.hr_evaluate_month(m); end if;
end$$;

-- ── RPCs (التطوير المركزية تكتب؛ غرفة العمليات وHR يقرآن) ──
create or replace function public.it_deduction_rules() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', r.name, 'description', r.description, 'is_default', r.is_default, 'is_active', r.is_active,
    'settings', app.hr_deduction_defaults() || r.settings, 'updated_at', r.updated_at,
    'targets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'target_type', t.target_type, 'target_id', t.target_id,
        'name', case t.target_type when 'branch' then (select b.name from public.branches b where b.id = t.target_id)
                                   when 'department' then (select d.name from public.departments d where d.id = t.target_id)
                                   else (select e.full_name || ' (' || e.employee_number || ')' from public.employees e where e.id = t.target_id) end) order by t.target_type, t.created_at)
        from public.hr_deduction_rule_targets t where t.rule_id = r.id), '[]'::jsonb),
    'employees_count', (select count(*) from public.employees e where e.archived_at is null and e.employment_status <> 'terminated' and (app.hr_deduction_rule_for(e.id, current_date) ->> '_rule_id')::uuid = r.id)
  ) order by r.is_default desc, r.name), '[]'::jsonb)
  from public.hr_deduction_rules r
  where app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin'])
$$;
grant execute on function public.it_deduction_rules() to authenticated;

create or replace function public.it_deduction_rule_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; v_set jsonb; old record;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'HR_RULE_INVALID'; end if;
  v_set := app.hr_deduction_defaults() || coalesce(p -> 'settings', '{}'::jsonb);
  v_set := (select jsonb_object_agg(k, v) from jsonb_each(v_set) kv(k, v) where k = any (app.hr_deduction_keys()));
  perform app.hr_deduction_validate(v_set);
  if v_id is null then
    insert into public.hr_deduction_rules (name, description, settings, is_active, created_by, updated_by)
    values (trim(p ->> 'name'), nullif(trim(coalesce(p ->> 'description', '')), ''), v_set, coalesce((p ->> 'is_active')::boolean, true), auth.uid(), auth.uid()) returning id into v_id;
    insert into public.hr_deduction_rule_audit (action, rule_id, after, actor) values ('rule_save', v_id, jsonb_build_object('name', p ->> 'name', 'settings', v_set), auth.uid());
  else
    select * into old from public.hr_deduction_rules where id = v_id;
    if not found then raise exception 'HR_NOT_FOUND'; end if;
    if old.is_default and coalesce((p ->> 'is_active')::boolean, true) = false then raise exception 'HR_RULE_DEFAULT_REQUIRED'; end if;
    update public.hr_deduction_rules set name = trim(p ->> 'name'), description = nullif(trim(coalesce(p ->> 'description', '')), ''), settings = v_set,
      is_active = case when is_default then true else coalesce((p ->> 'is_active')::boolean, is_active) end, updated_by = auth.uid(), updated_at = now() where id = v_id;
    insert into public.hr_deduction_rule_audit (action, rule_id, before, after, actor) values ('rule_save', v_id, jsonb_build_object('name', old.name, 'settings', old.settings, 'is_active', old.is_active), jsonb_build_object('name', p ->> 'name', 'settings', v_set, 'is_active', coalesce((p ->> 'is_active')::boolean, old.is_active)), auth.uid());
  end if;
  -- مزامنة القاعدة الافتراضية مع سياسة HR (للتوافق مع الشاشات القديمة والتقارير)
  if (select is_default from public.hr_deduction_rules where id = v_id) then update public.hr_policy set settings = settings || v_set, updated_by = auth.uid(), updated_at = now() where id = 1; end if;
  perform app.hr_deduction_reevaluate();
  return v_id;
end$$;
grant execute on function public.it_deduction_rule_save(jsonb) to authenticated;

create or replace function public.it_deduction_rule_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare old record;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into old from public.hr_deduction_rules where id = p_id;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if old.is_default then raise exception 'HR_RULE_DEFAULT_REQUIRED'; end if;
  delete from public.hr_deduction_rules where id = p_id;
  insert into public.hr_deduction_rule_audit (action, rule_id, before, actor) values ('rule_delete', p_id, jsonb_build_object('name', old.name, 'settings', old.settings), auth.uid());
  perform app.hr_deduction_reevaluate();
end$$;
grant execute on function public.it_deduction_rule_delete(uuid) to authenticated;

-- تعيين نطاق قاعدة: يستبدل أهداف القاعدة كاملة؛ الهدف الواحد لا يكون إلا لقاعدة واحدة (يُنقل إن كان لقاعدة أخرى)
create or replace function public.it_deduction_targets_set(p_rule uuid, p_targets jsonb) returns int
language plpgsql security definer set search_path = public, app as $$
declare t jsonb; n int := 0; before_j jsonb;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if not exists (select 1 from public.hr_deduction_rules where id = p_rule) then raise exception 'HR_NOT_FOUND'; end if;
  if (select is_default from public.hr_deduction_rules where id = p_rule) and jsonb_array_length(coalesce(p_targets, '[]'::jsonb)) > 0 then raise exception 'HR_RULE_DEFAULT_NO_TARGETS'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('target_type', target_type, 'target_id', target_id)), '[]'::jsonb) into before_j from public.hr_deduction_rule_targets where rule_id = p_rule;
  delete from public.hr_deduction_rule_targets where rule_id = p_rule;
  for t in select * from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) loop
    if (t ->> 'target_type') not in ('branch', 'department', 'employee') or (t ->> 'target_id') is null then raise exception 'HR_RULE_INVALID'; end if;
    if (t ->> 'target_type') = 'branch' and not exists (select 1 from public.branches where id = (t ->> 'target_id')::uuid) then raise exception 'HR_NOT_FOUND'; end if;
    if (t ->> 'target_type') = 'department' and not exists (select 1 from public.departments where id = (t ->> 'target_id')::uuid) then raise exception 'HR_NOT_FOUND'; end if;
    if (t ->> 'target_type') = 'employee' and not exists (select 1 from public.employees where id = (t ->> 'target_id')::uuid) then raise exception 'HR_NOT_FOUND'; end if;
    insert into public.hr_deduction_rule_targets (rule_id, target_type, target_id, created_by) values (p_rule, t ->> 'target_type', (t ->> 'target_id')::uuid, auth.uid())
    on conflict (target_type, target_id) do update set rule_id = excluded.rule_id, created_by = auth.uid(), created_at = now();
    n := n + 1;
  end loop;
  insert into public.hr_deduction_rule_audit (action, rule_id, before, after, actor) values ('target_set', p_rule, before_j, coalesce(p_targets, '[]'::jsonb), auth.uid());
  perform app.hr_deduction_reevaluate();
  return n;
end$$;
grant execute on function public.it_deduction_targets_set(uuid, jsonb) to authenticated;

create or replace function public.it_deduction_exemptions() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'target_type', x.target_type, 'target_id', x.target_id, 'reason', x.reason, 'from_date', x.from_date, 'to_date', x.to_date, 'created_at', x.created_at,
    'active', x.from_date <= current_date and (x.to_date is null or x.to_date >= current_date),
    'name', case x.target_type when 'branch' then (select b.name from public.branches b where b.id = x.target_id)
                               when 'department' then (select d.name from public.departments d where d.id = x.target_id)
                               else (select e.full_name || ' (' || e.employee_number || ')' from public.employees e where e.id = x.target_id) end) order by x.created_at desc), '[]'::jsonb)
  from public.hr_deduction_exemptions x where app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin'])
$$;
grant execute on function public.it_deduction_exemptions() to authenticated;

create or replace function public.it_deduction_exemption_add(p_type text, p_target uuid, p_reason text, p_from date default current_date, p_to date default null) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_id uuid;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_type not in ('branch', 'department', 'employee') or p_target is null then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if p_to is not null and p_to < coalesce(p_from, current_date) then raise exception 'HR_DATE_INVALID'; end if;
  insert into public.hr_deduction_exemptions (target_type, target_id, reason, from_date, to_date, created_by) values (p_type, p_target, trim(p_reason), coalesce(p_from, current_date), p_to, auth.uid()) returning id into v_id;
  insert into public.hr_deduction_rule_audit (action, after, actor) values ('exemption_add', jsonb_build_object('id', v_id, 'target_type', p_type, 'target_id', p_target, 'reason', trim(p_reason), 'from', coalesce(p_from, current_date), 'to', p_to), auth.uid());
  perform app.hr_deduction_reevaluate();
  return v_id;
end$$;
grant execute on function public.it_deduction_exemption_add(text, uuid, text, date, date) to authenticated;

create or replace function public.it_deduction_exemption_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare old record;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into old from public.hr_deduction_exemptions where id = p_id;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  delete from public.hr_deduction_exemptions where id = p_id;
  insert into public.hr_deduction_rule_audit (action, before, actor) values ('exemption_remove', to_jsonb(old), auth.uid());
  perform app.hr_deduction_reevaluate();
end$$;
grant execute on function public.it_deduction_exemption_remove(uuid) to authenticated;

-- الموظفون: القاعدة الفعّالة ومصدرها + مجموع الاستقطاع المقترح في الشهر (غير الملغى)
create or replace function public.it_deduction_employees(p_month date default null, p_branch uuid default null, p_department uuid default null, p_search text default null)
returns table(employee_id uuid, employee_number text, full_name text, job_title text, department_id uuid, department_name text, branch_id uuid, branch_name text, contract_type text,
  rule_id uuid, rule_name text, source text, exempt boolean, exempt_reason text, exempt_until date, enabled boolean, amount_mode text,
  month_minutes int, month_days numeric, month_absent int, month_shortfall int, month_waived int)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', coalesce(p_month, app.hr_local_date(now())))::date as f),
  att as (select a.employee_id, coalesce(sum(a.proposed_deduction_minutes) filter (where not a.deduction_waived), 0)::int as mins, coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived), 0) as dys,
                 count(*) filter (where a.status = 'absent')::int as abs, coalesce(sum(a.shortfall_minutes), 0)::int as sf, count(*) filter (where a.deduction_waived)::int as wv
          from public.hr_attendance_days a, m where a.work_date >= m.f and a.work_date < m.f + interval '1 month' group by a.employee_id)
  select e.id, e.employee_number, e.full_name, e.job_title, e.department_id, d.name, e.branch_id, b.name, e.contract_type,
         (rl.j ->> '_rule_id')::uuid, rl.j ->> '_rule_name', rl.j ->> '_source', coalesce((rl.j ->> '_exempt')::boolean, false), rl.j ->> '_exempt_reason', (rl.j ->> '_exempt_until')::date,
         coalesce((rl.j ->> 'auto_deduction_enabled')::boolean, true), coalesce(rl.j ->> 'auto_deduction_amount_mode', 'salary'),
         coalesce(att.mins, 0), coalesce(att.dys, 0), coalesce(att.abs, 0), coalesce(att.sf, 0), coalesce(att.wv, 0)
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  cross join lateral (select app.hr_deduction_rule_for(e.id, (select f from m)) as j) rl
  left join att on att.employee_id = e.id
  where app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin'])
    and e.archived_at is null and e.employment_status <> 'terminated'
    and (p_branch is null or e.branch_id = p_branch)
    and (p_department is null or e.department_id in (select app.hr_department_tree(p_department)) or e.job_title_id in (select app.hr_department_tree(p_department)))
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by b.name nulls last, d.name nulls last, app.hr_employee_sort_key(e.employee_number)
$$;
grant execute on function public.it_deduction_employees(date, uuid, uuid, text) to authenticated;

-- محاكاة: نقص دقائق / غياب / بصمة ناقصة بقاعدة معيّنة (أو إعدادات غير محفوظة) وراتب تقديري ⇒ الدقائق/الأيام والمبلغ
create or replace function public.it_deduction_simulate(p_settings jsonb, p_shortfall int, p_shift_minutes int default 480, p_base_salary numeric default 0, p_absent_days int default 0, p_incomplete_days int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb := app.hr_deduction_defaults() || coalesce(p_settings, '{}'::jsonb); mins int := 0; dys numeric := 0; v_abs numeric := 0; v_inc numeric := 0;
        day_rate numeric; minute_rate numeric; amount numeric; v_mode text := coalesce(s ->> 'auto_deduction_amount_mode', 'salary'); on_ boolean := coalesce((s ->> 'auto_deduction_enabled')::boolean, true);
begin
  if not app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if on_ and coalesce((s ->> 'deduct_shortfall_enabled')::boolean, true) and coalesce(p_shortfall, 0) > coalesce((s ->> 'grace_minutes_default')::int, 15) then
    select o_minutes, o_days into mins, dys from app.hr_tier_for_rule(s, p_shortfall, p_shift_minutes);
  end if;
  if on_ and coalesce((s ->> 'deduct_absence_enabled')::boolean, true) then
    v_abs := coalesce(p_absent_days, 0) * coalesce((s ->> 'absent_day_deduction_days')::numeric, 1);
    if coalesce((s ->> 'incomplete_punch_as_absent')::boolean, false) then v_inc := coalesce(p_incomplete_days, 0) * coalesce((s ->> 'absent_day_deduction_days')::numeric, 1); end if;
  end if;
  day_rate := round(coalesce(p_base_salary, 0) / 30, 4); minute_rate := round(day_rate / greatest(p_shift_minutes, 1), 4);
  amount := case when not on_ then 0 when v_mode = 'fixed' then round(coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0) * mins + coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) * (dys + v_abs + v_inc), 2)
                 else round(minute_rate * mins + day_rate * (dys + v_abs + v_inc), 2) end;
  return jsonb_build_object('enabled', on_, 'minutes', mins, 'days', dys + v_abs + v_inc, 'shortfall_days', dys, 'absent_days', v_abs, 'incomplete_days', v_inc,
    'amount_mode', v_mode, 'day_rate', day_rate, 'minute_rate', minute_rate, 'amount', amount);
end$$;
grant execute on function public.it_deduction_simulate(jsonb, int, int, numeric, int, int) to authenticated;

create or replace function public.it_deduction_audit(p_limit int default 200) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'rule_id', a.rule_id, 'rule_name', r.name, 'before', a.before, 'after', a.after, 'actor', a.actor,
    'actor_name', coalesce((select e.full_name from public.employees e where e.user_id = a.actor), (select u.email from auth.users u where u.id = a.actor)), 'created_at', a.created_at) order by a.id desc), '[]'::jsonb)
  from (select * from public.hr_deduction_rule_audit order by id desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) a
  left join public.hr_deduction_rules r on r.id = a.rule_id
  where app.has_role(array['it_admin', 'super_admin'])
$$;
grant execute on function public.it_deduction_audit(int) to authenticated;

-- سياسة HR القديمة: مفاتيح الاستقطاع تُحدَّث القاعدة الافتراضية معها (مسار توافق لمن ما زال يستعمل hr_policy_set)
create or replace function app.trg_hr_policy_sync_default_rule() returns trigger language plpgsql security definer set search_path = public, app as $$
declare patch jsonb;
begin
  select jsonb_object_agg(k, v) into patch from jsonb_each(new.settings) kv(k, v) where k = any (app.hr_deduction_keys()) and (old.settings -> k) is distinct from v;
  if patch is not null then update public.hr_deduction_rules set settings = settings || patch, updated_at = now() where is_default; end if;
  return new;
end$$;
drop trigger if exists trg_hr_policy_sync_default_rule on public.hr_policy;
create trigger trg_hr_policy_sync_default_rule after update of settings on public.hr_policy for each row execute function app.trg_hr_policy_sync_default_rule();

-- كشف المالية: اسم القاعدة لكل صف (تغيير نوع الإرجاع ⇒ drop ثم create)
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
  auto_deduction_basis text, auto_deduction_days_capped boolean, advance_installment numeric, auto_deduction_rule text)
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
         r.auto_deduction_basis, r.auto_deduction_days_capped, r.advance_installment, r.auto_deduction_rule
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin'])
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;

-- التصدير: مبلغ الاستقطاع التلقائي بقاعدة كل موظف (بديل 00193)
create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_prorate_allow boolean := app.hr_policy_bool('prorate_allowances', true);
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  if not coalesce((app.hr_attendance_confirmation(m) ->> 'can_export')::boolean, false) then raise exception 'HR_ATTENDANCE_NOT_CONFIRMED'; end if;
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
    auto_deduction_basis, auto_deduction_days_capped, auto_deduction_rule,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days, per.period_from, per.period_to, per.covered_days, per.days_in_month, calc.day_rate, calc.ratio, calc.capped,
    case when not rl.auto_on then 'disabled' else rl.mode end, calc.days_capped, rl.rule_name,
    sp.pay_type, sp.base_salary, sp.daily_rate, calc.allow, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  join app.hr_month_period(m) per on per.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  -- 00195: قاعدة الاستقطاع الفعّالة لكل موظف (وحدة الاستقطاعات التلقائية في التطوير المركزية: نطاق فرع/قسم/موظف + استثناءات)
  cross join lateral (
    select coalesce((j ->> 'auto_deduction_enabled')::boolean, true) as auto_on, coalesce(j ->> 'auto_deduction_amount_mode', 'salary') as mode,
           coalesce((j ->> 'fixed_absent_day_amount')::numeric, 0) as fix_day, coalesce((j ->> 'fixed_shortfall_minute_amount')::numeric, 0) as fix_min,
           coalesce((j ->> 'max_auto_deduction_days_per_month')::numeric, 0) as max_days, coalesce((j ->> 'auto_deduction_cap_ratio')::numeric, 1) as cap,
           j ->> '_rule_name' as rule_name
    from app.hr_deduction_rule_for(e.id, m) j) rl
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
               when sp.pay_type = 'daily' then round(rl.cap * (sp.daily_rate * r.payable_days + r.allow), 2)
               else round(rl.cap * (r.base_due + r.allow), 2) end as auto_cap
        from (
          select rates.day_rate, rates.ratio, dd.auto_days_eff, dd.days_capped,
            case when sp.pay_type = 'daily' then (s.days_present + s.days_leave_paid)::numeric else null end as payable_days,
            case when sp.pay_type = 'daily' then 0
                 when per.full_month or not v_prorate then sp.base_salary
                 else least(sp.base_salary, round(rates.day_rate * per.covered_days, 2)) end as base_due,
            case when sp.pay_type = 'monthly' and v_prorate and v_prorate_allow and not per.full_month then round(al.total * rates.ratio, 2) else al.total end as allow,
            -- مبلغ الاستقطاع التلقائي: متوقف ⇒ 0 · salary ⇒ أجر الدقيقة/اليوم من الراتب · fixed ⇒ مبالغ ثابتة من السياسة
            case when not rl.auto_on then 0
                 when rl.mode = 'fixed' then round(rl.fix_min * s.auto_minutes + rl.fix_day * dd.auto_days_eff, 2)
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
            select case when rl.max_days > 0 then least(base_days, rl.max_days) else base_days end as auto_days_eff,
                   rl.max_days > 0 and base_days > rl.max_days as days_capped
            from (select case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end as base_days) bd
          ) dd) r) x) y) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'prorate', v_prorate, 'auto_deduction', coalesce(e.auto_deduction_basis, 'salary'), 'auto_deduction_rule', e.auto_deduction_rule), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  perform app.advance_apply_to_export(v_id, m);
  return v_id;
end$$;
