-- ═══════════════════════════════════════════════════════════════
-- 00337 · الجولة 00391 — سلاسل الموافقات حسب القسم/القسم الفرعي + تشخيص «لماذا لا توجد سلسلة»
--   ① نطاق جديد للسلسلة: قسم من الشجرة التنظيمية (مع/بدون أقسامه الفرعية) — يُطبَّق على كل موظفي القسم
--      بصرف النظر عن الدور وحتى لمن لا حساب له (غرفة العمليات/HR تطلب نيابةً عنه).
--   ② أولوية الاختيار: قسم الموظف ← القسم الأب ← ... ← سلسلة الدور. وداخل كل مستوى: النوع الفرعي ثم العام.
--   ③ حلّ خطوة «مسؤول قسمه» من الموظف مباشرةً (لا من الحساب) — طلبات من لا حساب له كانت تُتخطّى.
--   ④ hr_leave_request: يبحث عن السلسلة بالموظف لا بالحساب (كان null لمن لا حساب ⇒ HR_NO_MANAGER دائماً).
--   ⑤ عيب: طلب قدّمته HR لموظف بلا مدير وبلا سلسلة كان يبقى يتيماً لا يقرّره أحد — الآن تقرّره الموارد البشرية.
--   ⑥ approval_diagnose: معاينة السلسلة + سبب غيابها بالتفصيل (للتطوير المركزية/HR/غرفة العمليات/الموظف نفسه/مديره).
-- ═══════════════════════════════════════════════════════════════

-- ── ① المخطط ──
alter table public.approval_chains add column if not exists department_id uuid references public.departments(id) on delete cascade;
alter table public.approval_chains add column if not exists include_children boolean not null default true;
drop index if exists public.approval_chains_scope_uq;
create unique index if not exists approval_chains_scope_uq on public.approval_chains
  (requester_role, request_type, coalesce(subtype, ''), coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists approval_chains_department_idx on public.approval_chains (department_id) where department_id is not null;
alter table public.approval_chains drop constraint if exists approval_chains_requester_role_check;
alter table public.approval_chains add constraint approval_chains_requester_role_check
  check ((department_id is null and requester_role = any(app.approval_requester_roles())) or (department_id is not null and requester_role = 'department'));
alter table public.approval_chain_versions add column if not exists department_id uuid;
alter table public.approval_chain_versions add column if not exists include_children boolean;

create or replace function app.approval_chain_version_trg() returns trigger language plpgsql security definer set search_path = public, app as $$
declare v int; r public.approval_chains;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select coalesce(max(version_no), 0) + 1 into v from public.approval_chain_versions where chain_id = r.id;
  insert into public.approval_chain_versions (chain_id, version_no, action, requester_role, request_type, subtype, steps, is_active, changed_by, department_id, include_children)
  values (r.id, v, case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end, r.requester_role, r.request_type, r.subtype, r.steps, r.is_active, coalesce(auth.uid(), r.updated_by), r.department_id, r.include_children);
  return coalesce(new, old);
end$$;

create or replace function app.approval_role_label(p_role text) returns text language sql immutable as $$
  select case p_role
    when 'department' then 'موظفو القسم'
    when 'employee' then 'متعهد' when 'department_manager' then 'مسؤول قسم' when 'admin_ops' then 'مسؤول قاطع' when 'field_ops' then 'العمليات الميدانية'
    when 'maintenance' then 'الصيانة' when 'central_garage_officer' then 'الكراج المركزي' when 'transfer_station' then 'المحطة التحويلية'
    when 'ops_room' then 'غرفة العمليات' when 'hr_officer' then 'الموارد البشرية' when 'finance_officer' then 'المالية' when 'it_admin' then 'التطوير المركزية'
    when 'deputy_director' then 'معاون المدير المفوض' when 'executive_director' then 'المدير التنفيذي' when 'super_admin' then 'المدير المفوض'
    when 'media_officer' then 'مسؤول الإعلام' when 'complaints_officer' then 'مسؤول الشكاوى' when 'disclosures_officer' then 'مسؤول الكشوفات' when 'follow_up' then 'المتابعة'
    else coalesce(p_role, '—') end $$;

-- ── ② مسار القسم صعوداً (0 = قسم الموظف نفسه) ──
create or replace function app.approval_dept_path(p_dept uuid) returns table(dept uuid, depth int)
language sql stable security definer set search_path = public as $$
  with recursive up as (
    select d.id, d.parent_id, 0 as depth from public.departments d where d.id = p_dept
    union all
    select d.id, d.parent_id, up.depth + 1 from public.departments d join up on d.id = up.parent_id where up.depth < 50
  )
  select id, depth from up $$;

-- سلسلة القسم للموظف (الأقرب أولاً؛ داخل المستوى: النوع الفرعي ثم العام)
create or replace function app.approval_dept_chain_for_employee(p_employee uuid, p_type text, p_subtype text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select c.* from public.employees e
  cross join lateral app.approval_dept_path(e.department_id) dp
  join public.approval_chains c on c.department_id = dp.dept
  where e.id = p_employee and e.archived_at is null
    and c.request_type = p_type and c.is_active
    and (dp.depth = 0 or c.include_children)
    and (c.subtype is null or (p_subtype is not null and c.subtype = p_subtype))
  order by dp.depth, (c.subtype is not null) desc
  limit 1 $$;

-- سلسلة الدور (بلا قسم) للحساب
create or replace function app.approval_role_chain_for(p_user uuid, p_type text, p_subtype text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select c.* from public.approval_chains c
  join public.user_roles ur on ur.user_id = p_user and ur.role = c.requester_role
  where c.department_id is null and c.request_type = p_type and c.is_active
    and (c.subtype is null or (p_subtype is not null and c.subtype = p_subtype))
  order by (c.subtype is not null) desc, array_position(app.approval_requester_roles(), c.requester_role) nulls last
  limit 1 $$;

-- الاختيار الموحّد: قسم الموظف ← الدور
create or replace function app.approval_chain_pick(p_user uuid, p_employee uuid, p_type text, p_subtype text) returns public.approval_chains
language plpgsql stable security definer set search_path = public, app as $$
declare c public.approval_chains; emp uuid := p_employee;
begin
  if emp is null and p_user is not null then
    select e.id into emp from public.employees e where e.user_id = p_user and e.archived_at is null order by (e.employment_status = 'terminated'), e.created_at limit 1;
  end if;
  if emp is not null then
    c := app.approval_dept_chain_for_employee(emp, p_type, p_subtype);
    if c.id is not null then return c; end if;
  end if;
  if p_user is not null then return app.approval_role_chain_for(p_user, p_type, p_subtype); end if;
  return null;
end$$;

create or replace function app.approval_chain_for_employee(p_employee uuid, p_type text, p_subtype text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select (app.approval_chain_pick((select e.user_id from public.employees e where e.id = p_employee), p_employee, p_type, p_subtype)).* $$;
create or replace function app.approval_chain_for_employee(p_employee uuid, p_type text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select (app.approval_chain_pick((select e.user_id from public.employees e where e.id = p_employee), p_employee, p_type, null)).* $$;

-- الأغلفة القديمة (بالحساب) تمرّ عبر الاختيار الموحّد كي تستفيد سلاسل الأقسام منها كل الوحدات
create or replace function app.approval_chain_for(p_user uuid, p_type text, p_subtype text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select (app.approval_chain_pick(p_user, null, p_type, p_subtype)).* $$;
create or replace function app.approval_chain_for(p_user uuid, p_type text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select (app.approval_chain_pick(p_user, null, p_type, null)).* $$;

-- ── ③ حلّ الخطوة من الموظف (مسؤول قسمه = المدير المباشر في HR حتى بلا حساب) ──
create or replace function app.approval_resolve_step(p_step jsonb, p_requester uuid, p_employee uuid) returns uuid[]
language plpgsql stable security definer set search_path = public, app as $$
declare r text := p_step ->> 'role'; out uuid[] := '{}'; parents text[]; emp uuid := p_employee; emp_user uuid;
begin
  if p_step ->> 'kind' = 'account' then
    select coalesce(array_agg(u.id), '{}') into out from auth.users u where u.id = (p_step ->> 'user_id')::uuid;
  elsif r = 'department_manager' then
    if p_requester is not null then
      select array_remove(array[cp.manager_user_id], null) into out from public.contractor_profiles cp where cp.user_id = p_requester and cp.is_active;
    end if;
    if coalesce(cardinality(out), 0) = 0 then
      if emp is null and p_requester is not null then select e.id into emp from public.employees e where e.user_id = p_requester and e.archived_at is null limit 1; end if;
      if emp is not null then out := array_remove(array[app.hr_manager_user(emp)], null); end if;
    end if;
  elsif r = 'admin_ops' then
    parents := case when p_requester is null then '{}'::text[] else app.user_parent_sectors(p_requester) end;
    select coalesce(array_agg(distinct smp.user_id), '{}') into out from public.sector_manager_profiles smp where smp.parent_sectors && parents;
  else
    select coalesce(array_agg(distinct ur.user_id), '{}') into out from public.user_roles ur where ur.role = r;
  end if;
  out := coalesce(out, '{}');
  if p_requester is not null then out := array_remove(out, p_requester); end if;
  if p_employee is not null then
    select e.user_id into emp_user from public.employees e where e.id = p_employee;
    if emp_user is not null then out := array_remove(out, emp_user); end if;   -- لا يوافق أحد على طلب نفسه
  end if;
  return out;
end$$;
create or replace function app.approval_resolve_step(p_step jsonb, p_requester uuid) returns uuid[]
language sql stable security definer set search_path = public, app as $$ select app.approval_resolve_step(p_step, p_requester, null) $$;

-- السياق يحمل الموظف صاحب الطلب (إجازات/زمنيات/سلف)
create or replace function app.approval_request_context(p_kind text, p_request uuid) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare r record;
begin
  if p_kind in ('leave','time_permit') then
    select l.days, l.minutes, lt.code, l.employee_id into r from public.hr_leaves l left join public.hr_leave_types lt on lt.id = l.leave_type_id where l.id = p_request;
    return jsonb_strip_nulls(jsonb_build_object('days', r.days, 'minutes', r.minutes, 'subtype', r.code, 'employee_id', r.employee_id));
  elsif p_kind = 'advance' then
    select a.amount, a.employee_id into r from public.advances a where a.id = p_request; return jsonb_strip_nulls(jsonb_build_object('amount', r.amount, 'employee_id', r.employee_id));
  elsif p_kind = 'disclosure' then
    select d.amount into r from public.disclosures d where d.id = p_request; return jsonb_strip_nulls(jsonb_build_object('amount', r.amount));
  end if;
  return '{}'::jsonb;
exception when others then return '{}'::jsonb;
end$$;

create or replace function app.approval_build_tasks(p_kind text, p_request uuid, p_chain public.approval_chains, p_requester uuid, p_exclude uuid[], p_context jsonb) returns void
language plpgsql security definer set search_path = public, app as $$
declare s jsonb; i int := 0; who uuid[]; x uuid; cond boolean; dmap jsonb; v_status text; v_note text; emp uuid := nullif(p_context ->> 'employee_id', '')::uuid;
begin
  for s in select * from jsonb_array_elements(p_chain.steps) loop
    i := i + 1;
    who := app.approval_resolve_step(s, p_requester, emp);
    foreach x in array coalesce(p_exclude, '{}') loop who := array_remove(who, x); end loop;
    cond := app.approval_condition_ok(s, p_context);
    if not cond then v_status := 'skipped'; v_note := 'الشرط غير متحقق (' || app.approval_condition_label(s) || ') — تُخطّيت';
    elsif cardinality(who) = 0 then v_status := 'skipped'; v_note := 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً';
    else v_status := 'waiting'; v_note := null; end if;
    dmap := case when v_status = 'waiting' then app.approval_delegates_for(who) else '{}'::jsonb end;
    insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note, mode, sla_days, escalate, delegates)
    values (p_kind, p_request, p_chain.id, i, app.approval_step_label(s) || coalesce(' · ' || app.approval_condition_label(s), ''),
            who || coalesce((select array_agg(k::uuid) from jsonb_object_keys(dmap) k), '{}'), v_status, v_note,
            coalesce(s ->> 'mode', 'any'), (s ->> 'sla_days')::int, coalesce(s ->> 'escalate', 'none'), dmap);
  end loop;
end$$;

create or replace function app.approval_open(p_kind text, p_request uuid, p_requester uuid, p_subtype text, p_context jsonb) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare c public.approval_chains; first_step int; emp uuid := nullif(coalesce(p_context, '{}'::jsonb) ->> 'employee_id', '')::uuid; excl uuid[] := '{}';
begin
  c := app.approval_chain_pick(p_requester, emp, p_kind, p_subtype);
  if c.id is null then return null; end if;
  if p_requester is not null then excl := array[p_requester]; end if;
  perform app.approval_build_tasks(p_kind, p_request, c, p_requester, excl, coalesce(p_context, '{}'::jsonb));
  select min(step_no) into first_step from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'waiting';
  if first_step is null then
    delete from public.approval_tasks where request_kind = p_kind and request_id = p_request;
    if p_requester is not null and exists (select 1 from public.user_roles ur where ur.user_id = p_requester and ur.role = 'super_admin') then
      insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note)
      values (p_kind, p_request, c.id, 1, 'المدير المفوض', array[p_requester], 'pending', 'لا يوجد مُعتمِد آخر في السلسلة — المدير المفوض يعتمد بنفسه');
      perform app.approval_notify_step(p_kind, p_request, 1);
      return c.id;
    end if;
    raise exception 'APPROVAL_NO_APPROVER';
  end if;
  perform app.approval_activate_step(p_kind, p_request, first_step);
  return c.id;
end$$;

-- ── ⑤ طلب بلا مدير وبلا سلسلة قدّمته HR: تقرّره الموارد البشرية بدل أن يبقى يتيماً ──
create or replace function app.hr_can_decide(p_leave uuid) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare l record; me uuid := app.current_employee_id(); mgr record;
begin
  if app.has_role(array['super_admin']) then return true; end if;
  select * into l from public.hr_leaves where id = p_leave;
  if l.chain_id is not null then
    return auth.uid() = any(app.approval_current_approvers(l.kind, l.id));
  end if;
  if l.manager_id is null then return app.has_role(array['hr_officer']); end if;   -- 00391
  if me is null then return false; end if;
  if l.manager_id = me then return true; end if;
  select * into mgr from public.employees where id = l.manager_id;
  if mgr.manager_id = me and (mgr.user_id is null or mgr.employment_status = 'terminated'
     or exists (select 1 from public.hr_leaves x where x.employee_id = mgr.id and x.status = 'approved' and x.kind = 'leave' and current_date between x.start_date and x.end_date)) then
    return true;
  end if;
  return false;
end$$;

-- ── حفظ/قائمة السلاسل مع نطاق القسم ──
drop function if exists public.approval_chain_save(text, text, jsonb, boolean, text);
create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true, p_subtype text default null,
                                                      p_department uuid default null, p_include_children boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb; st text := nullif(trim(coalesce(p_subtype, '')), ''); v_role text := p_requester_role;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if p_department is not null then
    -- 00391: سلسلة قسم — تنطبق على كل موظفي القسم (والفرعية اختيارياً) أياً كان دورهم
    if p_request_type not in ('leave','time_permit','advance') then raise exception 'APPROVAL_DEPT_TYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.departments d where d.id = p_department) then raise exception 'APPROVAL_DEPT_INVALID'; end if;
    v_role := 'department';
  else
    if coalesce(v_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
    if not (v_role = any(app.approval_requester_roles())) then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'cold_archive_purge' and v_role not in ('it_admin','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'complaint_report' and v_role not in ('complaints_officer','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'hire' and v_role not in ('central_garage_officer','transfer_station','maintenance','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  end if;
  if st is not null then
    if p_request_type not in ('leave','time_permit') then raise exception 'APPROVAL_SUBTYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.hr_leave_types t where t.code = st and t.kind = p_request_type) then raise exception 'APPROVAL_SUBTYPE_INVALID'; end if;
  end if;
  perform app.approval_validate_steps(p_steps);
  select jsonb_agg(app.approval_clean_step(s) order by o) into clean from jsonb_array_elements(p_steps) with ordinality t(s, o);
  select c.id into v_id from public.approval_chains c where c.requester_role = v_role and c.request_type = p_request_type and coalesce(c.subtype, '') = coalesce(st, '')
    and c.department_id is not distinct from p_department;
  if v_id is null then
    insert into public.approval_chains (requester_role, request_type, subtype, steps, is_active, updated_by, department_id, include_children)
    values (v_role, p_request_type, st, clean, coalesce(p_active, true), auth.uid(), p_department, coalesce(p_include_children, true)) returning id into v_id;
  else
    update public.approval_chains set steps = clean, is_active = coalesce(p_active, true), include_children = coalesce(p_include_children, true), updated_by = auth.uid(), updated_at = now() where id = v_id;
  end if;
  return v_id;
end$$;
revoke all on function public.approval_chain_save(text, text, jsonb, boolean, text, uuid, boolean) from public, anon;
grant execute on function public.approval_chain_save(text, text, jsonb, boolean, text, uuid, boolean) to authenticated;

drop function if exists public.approval_chains_list();
create or replace function public.approval_chains_list()
returns table(id uuid, requester_role text, requester_label text, request_type text, subtype text, subtype_label text, steps jsonb, is_active boolean, updated_at timestamptz, updated_by_name text, version_no int,
              department_id uuid, department_name text, include_children boolean, department_path text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return query
  select c.id, c.requester_role, app.approval_role_label(c.requester_role), c.request_type, c.subtype, (select t.name from public.hr_leave_types t where t.code = c.subtype),
    (select coalesce(jsonb_agg(s || jsonb_build_object('label', app.approval_step_label(s)) order by o), '[]'::jsonb) from jsonb_array_elements(c.steps) with ordinality t(s, o)),
    c.is_active, c.updated_at, app.manager_display_name(c.updated_by),
    (select coalesce(max(v.version_no), 1) from public.approval_chain_versions v where v.chain_id = c.id)::int,
    c.department_id, d.name, c.include_children,
    (select string_agg(dd.name, ' ← ' order by dp.depth) from app.approval_dept_path(c.department_id) dp join public.departments dd on dd.id = dp.dept)
  from public.approval_chains c left join public.departments d on d.id = c.department_id
  order by (c.department_id is null), d.name nulls last, c.requester_role, c.request_type, c.subtype nulls first;
end$$;
revoke all on function public.approval_chains_list() from public, anon;
grant execute on function public.approval_chains_list() to authenticated;

-- ── معاينة الخطوات (مشترك بين المحاكاة والتشخيص) ──
create or replace function app.approval_steps_preview(p_chain public.approval_chains, p_user uuid, p_employee uuid, p_context jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb; i int := 0; who uuid[]; steps jsonb := '[]'::jsonb; cond boolean; dmap jsonb;
begin
  for s in select * from jsonb_array_elements(p_chain.steps) loop
    i := i + 1;
    who := app.approval_resolve_step(s, p_user, p_employee);
    cond := app.approval_condition_ok(s, coalesce(p_context, '{}'::jsonb));
    dmap := app.approval_delegates_for(who);
    steps := steps || jsonb_build_object('step_no', i, 'label', app.approval_step_label(s), 'mode', coalesce(s ->> 'mode', 'any'), 'sla_days', s -> 'sla_days', 'escalate', coalesce(s ->> 'escalate', 'none'),
      'condition', app.approval_condition_label(s),
      'status', case when not cond then 'skipped_condition' when cardinality(who) = 0 then 'skipped_nobody' else 'active' end,
      'approvers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a, 'name', app.user_display_name(a))), '[]'::jsonb) from unnest(who) a),
      'delegates', (select coalesce(jsonb_agg(jsonb_build_object('to_name', app.user_display_name(k::uuid), 'from_name', app.user_display_name((dmap ->> k)::uuid))), '[]'::jsonb) from jsonb_object_keys(dmap) k));
  end loop;
  return steps;
end$$;

create or replace function public.approval_simulate(p_user uuid, p_type text, p_subtype text default null, p_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare c public.approval_chains; emp uuid;
begin
  perform app.require_it();
  select e.id into emp from public.employees e where e.user_id = p_user and e.archived_at is null order by (e.employment_status = 'terminated'), e.created_at limit 1;
  c := app.approval_chain_pick(p_user, emp, p_type, p_subtype);
  if c.id is null then return jsonb_build_object('chain_id', null, 'steps', '[]'::jsonb, 'note', 'لا سلسلة مضبوطة لهذا المستخدم/النوع — يعمل الافتراضي'); end if;
  return jsonb_build_object('chain_id', c.id, 'requester_role', c.requester_role, 'requester_label', app.approval_role_label(c.requester_role), 'subtype', c.subtype,
    'department_id', c.department_id, 'department_name', (select d.name from public.departments d where d.id = c.department_id),
    'steps', app.approval_steps_preview(c, p_user, emp, coalesce(p_context, '{}'::jsonb)));
end$$;

-- ── ⑥ التشخيص: ما السلسلة التي ستُطبَّق على هذا الموظف؟ وإن لم توجد — لماذا؟ ──
create or replace function public.approval_diagnose(p_employee uuid, p_type text, p_subtype text default null, p_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare e record; c public.approval_chains; me uuid := app.current_employee_id(); roles text[]; path jsonb; checks jsonb := '[]'::jsonb; mgr_name text; mgr_user uuid;
        fallback text; reason text; hints jsonb := '[]'::jsonb; steps jsonb := '[]'::jsonb; active_steps int := 0; dept_chain public.approval_chains; role_chain public.approval_chains;
begin
  select x.*, d.name as dept_name into e from public.employees x left join public.departments d on d.id = x.department_id where x.id = p_employee and x.archived_at is null;
  if e.id is null then raise exception 'HR_NOT_FOUND'; end if;
  if not (app.has_role(array['it_admin','hr_officer','ops_room','super_admin']) or p_employee = me or (me is not null and e.manager_id = me) or app.garage_can_act_on(p_employee)) then raise exception 'HR_FORBIDDEN'; end if;
  if p_type not in ('leave','time_permit','advance') then raise exception 'APPROVAL_TYPE_INVALID'; end if;

  select coalesce(array_agg(ur.role order by ur.role), '{}') into roles from public.user_roles ur where ur.user_id = e.user_id;
  select m.full_name, m.user_id into mgr_name, mgr_user from public.employees m where m.id = e.manager_id;
  -- مسار القسم مع السلاسل الموجودة في كل مستوى
  select coalesce(jsonb_agg(jsonb_build_object('department_id', dp.dept, 'name', d.name, 'depth', dp.depth,
            'chains', (select coalesce(jsonb_agg(jsonb_build_object('id', ch.id, 'subtype', ch.subtype, 'is_active', ch.is_active, 'include_children', ch.include_children,
                                'applies', ch.is_active and (dp.depth = 0 or ch.include_children) and (ch.subtype is null or ch.subtype = p_subtype)) order by ch.subtype nulls first), '[]'::jsonb)
                       from public.approval_chains ch where ch.department_id = dp.dept and ch.request_type = p_type)) order by dp.depth), '[]'::jsonb)
    into path from app.approval_dept_path(e.department_id) dp join public.departments d on d.id = dp.dept;

  dept_chain := app.approval_dept_chain_for_employee(e.id, p_type, p_subtype);
  role_chain := case when e.user_id is null then null else app.approval_role_chain_for(e.user_id, p_type, p_subtype) end;
  if dept_chain.id is not null then c := dept_chain; else c := role_chain; end if;

  checks := checks || jsonb_build_object('key', 'department', 'label', 'الموظف منسوب إلى قسم', 'ok', e.department_id is not null, 'detail', coalesce(e.dept_name, 'بلا قسم — سلاسل الأقسام لا تنطبق'));
  checks := checks || jsonb_build_object('key', 'dept_chain', 'label', 'سلسلة لقسمه أو لقسم أعلى', 'ok', dept_chain.id is not null,
              'detail', case when dept_chain.id is not null then 'سلسلة قسم «' || (select d.name from public.departments d where d.id = dept_chain.department_id) || '»' || coalesce(' (النوع الفرعي: ' || dept_chain.subtype || ')', '')
                             when e.department_id is null then '—' else 'لا سلسلة فعّالة لقسمه ولا لأي قسم أعلى يشمل الأقسام الفرعية' end);
  checks := checks || jsonb_build_object('key', 'account', 'label', 'له حساب دخول (لسلاسل الأدوار)', 'ok', e.user_id is not null,
              'detail', case when e.user_id is null then 'بلا حساب — سلاسل الأدوار لا تنطبق؛ تبقى سلسلة القسم أو المدير المباشر' else 'الأدوار: ' || coalesce(array_to_string((select array_agg(app.approval_role_label(r)) from unnest(roles) r), '، '), 'بلا دور') end);
  checks := checks || jsonb_build_object('key', 'role_chain', 'label', 'سلسلة لأحد أدواره', 'ok', role_chain.id is not null,
              'detail', case when role_chain.id is not null then 'سلسلة دور «' || app.approval_role_label(role_chain.requester_role) || '»' || coalesce(' (النوع الفرعي: ' || role_chain.subtype || ')', '')
                             when e.user_id is null then '—' else 'لا سلسلة فعّالة لأي من أدواره لهذا النوع' end);
  checks := checks || jsonb_build_object('key', 'manager', 'label', 'مدير مباشر مسجّل في HR', 'ok', e.manager_id is not null,
              'detail', case when e.manager_id is null then 'غير محدد' else mgr_name || case when mgr_user is null then ' (بلا حساب — لا يستطيع الموافقة من النظام)' else '' end end);

  if c.id is not null then
    steps := app.approval_steps_preview(c, e.user_id, e.id, coalesce(p_context, '{}'::jsonb));
    select count(*) into active_steps from jsonb_array_elements(steps) s where s ->> 'status' = 'active';
    if active_steps = 0 then
      fallback := 'none'; reason := 'توجد سلسلة لكن لا أحد من خطواتها يُحلّ إلى شخص فعلي — سيُرفض الطلب (APPROVAL_NO_APPROVER)';
      hints := hints || to_jsonb('راجع خطوات السلسلة: «مسؤول قسمه» يحتاج مديراً مباشراً له حساب، و«حساب محدد» يجب أن يكون فعّالاً'::text);
    else
      fallback := 'chain'; reason := null;
    end if;
  elsif e.manager_id is not null and mgr_user is not null then
    fallback := 'manager'; reason := 'لا سلسلة — يعتمد الطلب المدير المباشر (' || mgr_name || ')';
  elsif e.manager_id is not null then
    fallback := 'hr_only'; reason := 'لا سلسلة والمدير المباشر (' || mgr_name || ') بلا حساب — لا يُقبل الطلب من الموظف؛ تقدّمه الموارد البشرية وتقرّره';
    hints := hints || to_jsonb('أنشئ حساباً للمدير المباشر أو اضبط سلسلة لقسم «' || coalesce(e.dept_name, '—') || '» من سلاسل الموافقات'::text);
  else
    fallback := 'hr_only'; reason := 'لا سلسلة ولا مدير مباشر — لا يُقبل الطلب من الموظف أو غرفة العمليات (HR_NO_MANAGER)؛ الموارد البشرية فقط تقدّمه وتقرّره';
    hints := hints || to_jsonb('حدّد المدير المباشر من ملف الموظف (الموارد البشرية ← الموظفون ← البيانات)'::text);
    if e.department_id is not null then hints := hints || to_jsonb('أو اضبط سلسلة لقسم «' || e.dept_name || '» (أو قسمه الأعلى مع «يشمل الأقسام الفرعية») من التطوير المركزية ← سلاسل الموافقات'::text);
    else hints := hints || to_jsonb('انسب الموظف إلى قسم ثم اضبط سلسلة لذلك القسم'::text); end if;
  end if;

  return jsonb_build_object(
    'employee', jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'department_id', e.department_id, 'department_name', e.dept_name,
                                   'has_account', e.user_id is not null, 'roles', to_jsonb(roles), 'manager_id', e.manager_id, 'manager_name', mgr_name, 'manager_has_account', mgr_user is not null),
    'type', p_type, 'subtype', p_subtype,
    'chain', case when c.id is null then null else jsonb_build_object('id', c.id, 'scope', case when c.department_id is null then 'role' else 'department' end,
                 'requester_role', c.requester_role, 'requester_label', app.approval_role_label(c.requester_role), 'subtype', c.subtype,
                 'department_id', c.department_id, 'department_name', (select d.name from public.departments d where d.id = c.department_id), 'include_children', c.include_children) end,
    'steps', steps, 'active_steps', active_steps, 'department_path', path, 'checks', checks,
    'ok', fallback in ('chain', 'manager'), 'fallback', fallback, 'reason', reason, 'hints', hints);
end$$;
revoke all on function public.approval_diagnose(uuid, text, text, jsonb) from public, anon;
grant execute on function public.approval_diagnose(uuid, text, text, jsonb) to authenticated;

-- بحث موظف للتشخيص (التطوير المركزية/HR/غرفة العمليات) — بيانات تعريفية فقط
create or replace function public.approval_employee_lookup(p_q text) returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title, 'department_name', d.name,
           'has_account', e.user_id is not null, 'manager_name', m.full_name) order by e.full_name), '[]'::jsonb)
  from (select * from public.employees e where e.archived_at is null and (e.employment_status is null or e.employment_status <> 'terminated')
          and (trim(coalesce(p_q, '')) = '' or e.full_name ilike '%' || trim(p_q) || '%' or e.employee_number ilike '%' || trim(p_q) || '%') order by e.full_name limit 30) e
  left join public.departments d on d.id = e.department_id
  left join public.employees m on m.id = e.manager_id
  where app.has_role(array['it_admin','hr_officer','ops_room','super_admin']) $$;
revoke all on function public.approval_employee_lookup(text) from public, anon;
grant execute on function public.approval_employee_lookup(text) to authenticated;

-- بحث غرفة العمليات: معرّفات إضافية للمعاينة
create or replace function public.ops_leave_employee_lookup(p_q text) returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title, 'department_name', d.name,
           'has_account', e.user_id is not null, 'has_biometric', e.biometric_pin is not null, 'manager_name', m.full_name, 'manager_id', e.manager_id, 'department_id', e.department_id) order by e.full_name), '[]'::jsonb)
  from (select * from public.employees e where e.archived_at is null and (e.employment_status is null or e.employment_status <> 'terminated')
          and (trim(coalesce(p_q, '')) = '' or e.full_name ilike '%' || trim(p_q) || '%' or e.employee_number ilike '%' || trim(p_q) || '%') order by e.full_name limit 20) e
  left join public.departments d on d.id = e.department_id
  left join public.employees m on m.id = e.manager_id
  where app.has_role(array['ops_room','super_admin']) $$;

-- ── ④ طلب الإجازة: البحث عن السلسلة بالموظف (الأصل __raw — مغلّف بحارس 00291) ──
create or replace function app.hr_leave_request__raw(p_employee uuid, p_type uuid, p_start date, p_end date, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_notes text DEFAULT NULL::text, p_attachment text DEFAULT NULL::text, p_backdated_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare lt record; e record; me uuid := app.current_employee_id(); v_days numeric; v_minutes int := 0; v_id uuid; bal jsonb; v_cost numeric; v_max_min int; v_month_permits int;
        chain public.approval_chains; v_chain uuid; v_today date := app.hr_local_date(now()); v_back int := 0; v_prior text; v_hr boolean := app.has_role(array['hr_officer', 'super_admin']);
        v_bd_max int := app.hr_policy_int('backdated_max_days', 7); v_bd_count int := 0; v_bd_alert int := app.hr_policy_int('backdated_alert_per_month', 3); v_mgr uuid; v_title text; u uuid;
        v_ops boolean := app.has_role(array['ops_room']); v_via text;
begin
  select * into lt from public.hr_leave_types where id = p_type and is_active;
  if not found then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null;
  if not found or e.employment_status = 'terminated' then raise exception 'HR_NOT_FOUND'; end if;
  -- 00208: الكراج يقدّم الطلب نيابةً عن موظفي قسمه (سلسلة الموافقات كما هي)
  if not (app.has_role(array['hr_officer', 'super_admin']) or p_employee = me or (me is not null and e.manager_id is not distinct from me) or app.garage_can_act_on(p_employee) or v_ops) then raise exception 'HR_FORBIDDEN'; end if;   -- 00239: غرفة العمليات لأي موظف في الملاك   -- is not distinct from: مدير فارغ لا يُسقط الفحص
  if e.biometric_pin is null and not (app.has_role(array['hr_officer', 'super_admin']) or v_ops) then raise exception 'HR_NO_BIOMETRIC'; end if;   -- 00239: كـHR، غرفة العمليات تطلب لمن بلا بصمة أيضاً
  chain := app.approval_chain_for_employee(e.id, lt.kind, lt.code);   -- 00391: سلسلة القسم/القسم الفرعي ثم الدور — تعمل حتى لمن لا حساب له
  if e.manager_id is null and chain.id is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_MANAGER'; end if;
  -- 00239: جهة التقديم (تظهر لكل من في السلسلة وفي القوائم)
  v_via := case when p_employee = me then 'self'
                when app.has_role(array['hr_officer']) then 'hr'
                when me is not null and e.manager_id is not distinct from me then 'manager'
                when app.garage_can_act_on(p_employee) then 'garage'
                when v_ops then 'ops_room'
                else 'admin' end;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'HR_DATE_INVALID'; end if;
  if lt.requires_attachment and coalesce(p_attachment, '') = '' then raise exception 'HR_ATTACHMENT_REQUIRED'; end if;
  -- 00197 · طلب بأثر رجعي (ليوم سابق): مسموح بشروط — مفعَّل من التطوير المركزية، ضمن المهلة (HR بلا مهلة)، بسبب إلزامي، والشهر غير مقفل
  if p_start < v_today then
    v_back := v_today - p_start;
    if not app.hr_policy_bool('backdated_requests_enabled', true) then raise exception 'HR_BACKDATED_DISABLED'; end if;
    if not v_hr and v_back > v_bd_max then raise exception 'HR_BACKDATED_TOO_OLD'; end if;
    if length(trim(coalesce(p_backdated_reason, ''))) < 5 then raise exception 'HR_BACKDATED_REASON_REQUIRED'; end if;
    if app.hr_month_locked(p_start) or app.hr_month_locked(p_end) then raise exception 'HR_MONTH_LOCKED'; end if;
    select a.status into v_prior from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date = p_start;
    select count(*) into v_bd_count from public.hr_leaves x where x.employee_id = p_employee and x.is_backdated and x.status in ('pending', 'approved')
      and date_trunc('month', x.created_at at time zone 'UTC') = date_trunc('month', now() at time zone 'UTC');
    v_bd_count := v_bd_count + 1;
  end if;

  if lt.kind = 'time_permit' then
    if p_start <> p_end or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then raise exception 'HR_PERMIT_TIME_INVALID'; end if;
    v_minutes := extract(epoch from (p_end_time - p_start_time))::int / 60;
    v_max_min := coalesce(lt.max_minutes, app.hr_policy_int('permit_max_minutes', 180));
    if v_minutes > v_max_min then raise exception 'HR_PERMIT_TOO_LONG'; end if;
    if (app.hr_policy() ->> 'permits_max_per_month') is not null then
      select count(*) into v_month_permits from public.hr_leaves where employee_id = p_employee and kind = 'time_permit' and status in ('pending', 'approved')
        and date_trunc('month', start_date) = date_trunc('month', p_start);
      if v_month_permits >= app.hr_policy_int('permits_max_per_month', 999) then raise exception 'HR_PERMIT_MONTH_LIMIT'; end if;
    end if;
    v_days := 0;
  else
    v_days := (p_end - p_start) + 1;
    if lt.max_days_per_request is not null and v_days > lt.max_days_per_request then raise exception 'HR_LEAVE_TOO_LONG'; end if;
  end if;
  if exists (select 1 from public.hr_leaves x where x.employee_id = p_employee and x.status in ('pending', 'approved') and x.start_date <= p_end and x.end_date >= p_start
             and (x.kind = 'leave' or lt.kind = 'leave' or (x.start_time < p_end_time and x.end_time > p_start_time))) then
    raise exception 'HR_LEAVE_OVERLAP';
  end if;
  if lt.consumes_balance then perform app.hr_leave_check_balance(p_employee, p_start, p_end, lt.kind, null); end if;   -- 00305: يحسب الطلبات المعلّقة ويقسم على السنوات

  insert into public.hr_leaves (employee_id, kind, leave_type, leave_type_id, start_date, end_date, start_time, end_time, status, notes, created_by, requested_by, manager_id, days, minutes, attachment_path,
                                is_backdated, backdated_reason, backdated_days, backdated_prior_status, requested_via)
  values (p_employee, lt.kind, lt.code, lt.id, p_start, p_end, p_start_time, p_end_time, 'pending', nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid(), e.manager_id, v_days, v_minutes, p_attachment,
          v_back > 0, case when v_back > 0 then trim(p_backdated_reason) end, v_back, case when v_back > 0 then v_prior end, v_via)
  returning id into v_id;
  if v_back > 0 then
    -- تنبيه HR عند تكرار الطلبات بأثر رجعي في الشهر (حد من التطوير المركزية)
    if v_bd_count >= v_bd_alert then
      for u in select ur.user_id from public.user_roles ur where ur.role = 'hr_officer' loop
        perform app.hr_notify(u, 'تكرار طلبات بأثر رجعي: ' || e.full_name, 'الطلب رقم ' || v_bd_count || ' بأثر رجعي هذا الشهر (الحد ' || v_bd_alert || ') — ' || lt.name || ' ليوم ' || p_start::text || ' · السبب: ' || trim(p_backdated_reason), '/hr/leaves', 'backdated_alert:' || v_id::text, 'warning');
      end loop;
    end if;
  end if;

  if chain.id is not null then
    v_chain := app.approval_open(lt.kind, v_id, e.user_id);
    update public.hr_leaves set chain_id = v_chain where id = v_id;
  else
    perform app.hr_notify(app.hr_manager_user(p_employee), case when v_back > 0 then '⚠ طلب بأثر رجعي: ' else 'طلب ' end || lt.name || ' بانتظار موافقتك',
      case when v_back > 0 then 'ليوم سابق قبل ' || v_back || ' يوم — السبب: ' || trim(p_backdated_reason) || ' · ' else '' end || e.full_name || ' · ' || p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end
        || case when lt.kind = 'time_permit' then ' · ' || to_char(p_start_time, 'HH24:MI') || '–' || to_char(p_end_time, 'HH24:MI') else '' end || app.leave_via_suffix(v_via),
      '/manager/leaves', 'leave_req:' || v_id::text, 'info');
  end if;
  -- 00239: إعلام الموظف نفسه عندما يُقدَّم الطلب نيابةً عنه من غرفة العمليات
  if v_via = 'ops_room' and e.user_id is not null then
    perform app.hr_notify(e.user_id, 'قُدِّم طلب ' || lt.name || ' باسمك من غرفة العمليات', p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end || ' · سيمرّ بسلسلة الموافقات المعتادة', '/employee/requests', 'leave_via_ops:' || v_id::text, 'info');
  end if;
  return v_id;
end$function$;
