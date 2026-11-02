-- 00400-د: سلسلة واحدة لجميع أنواع الإجازات والزمنيات، دون بقية طلبات المنصة.
-- لا نغيّر محرك طلب الإجازة؛ حل السلسلة الموجود يختار النطاق المشترك عند الطلب فقط.
alter table public.approval_chains drop constraint approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check
 check (request_type in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire','attendance_edit','platform_reset','leave_time_all'));
alter table public.approval_chains add constraint approval_chains_all_subtype_check
 check (request_type <> 'leave_time_all' or subtype is null);

-- في نفس الدور أو القسم فقط: منع تفعيل العام المشترك مع أي سلسلة إجازة أو زمنية.
-- السلاسل التاريخية لا تُعدّل، وأولوية القسم الفرعي ثم الأب ثم الدور تبقى كما هي.
-- عدّاد النطاق يفرض تسلسل الكتابات، حتى أن لقطة REPEATABLE READ القديمة تفشل بتعارض تسلسلي بدلاً من السماح بالتداخل.
create table app.approval_leave_scope_guard(scope_key text primary key, generation bigint not null default 1);
revoke all on app.approval_leave_scope_guard from public,anon,authenticated;
create or replace function app.approval_chain_no_all_overlap() returns trigger
language plpgsql security definer set search_path=public,app as $$
declare v_scope_key text;
begin
 if new.request_type not in ('leave','time_permit','leave_time_all') then return new; end if;
 if new.request_type='leave_time_all' and exists(select 1 from jsonb_array_elements(new.steps) s where s ? 'condition' and s->'condition' <> 'null'::jsonb) then
   raise exception 'APPROVAL_ALL_CONDITION_NOT_ALLOWED';
 end if;
 v_scope_key:=case when new.department_id is null then 'role:'||new.requester_role else 'department:'||new.department_id::text end;
 insert into app.approval_leave_scope_guard as g(scope_key,generation) values(v_scope_key,1)
 on conflict(scope_key) do update set generation=g.generation+1;
 if new.is_active and exists (
   select 1 from public.approval_chains c where c.id<>new.id and c.is_active
     and c.department_id is not distinct from new.department_id
     and (new.department_id is not null or c.requester_role=new.requester_role)
     and ((new.request_type='leave_time_all' and c.request_type in ('leave','time_permit'))
       or (new.request_type in ('leave','time_permit') and c.request_type='leave_time_all'))
 ) then raise exception 'APPROVAL_ALL_OVERLAP'; end if;
 return new;
end$$;
revoke all on function app.approval_chain_no_all_overlap() from public,anon,authenticated;
create trigger trg_approval_chain_no_all_overlap before insert or update on public.approval_chains
 for each row execute function app.approval_chain_no_all_overlap();

create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true, p_subtype text default null,
                                                      p_department uuid default null, p_include_children boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb; st text := nullif(trim(coalesce(p_subtype, '')), ''); v_role text := p_requester_role;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire','attendance_edit','platform_reset','leave_time_all') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if p_department is not null then
    -- 00391: سلسلة قسم — تنطبق على كل موظفي القسم (والفرعية اختيارياً) أياً كان دورهم
    if p_request_type not in ('leave','time_permit','advance','leave_time_all') then raise exception 'APPROVAL_DEPT_TYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.departments d where d.id = p_department) then raise exception 'APPROVAL_DEPT_INVALID'; end if;
    v_role := 'department';
  else
    if coalesce(v_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
    if not (v_role = any(app.approval_requester_roles())) then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'cold_archive_purge' and v_role not in ('it_admin','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'complaint_report' and v_role not in ('complaints_officer','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'attendance_edit' and v_role not in ('ops_room','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;   -- 00397
    if p_request_type = 'platform_reset' and v_role not in ('it_admin','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;   -- 00398
    if p_request_type = 'hire' and v_role not in ('central_garage_officer','transfer_station','maintenance','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  end if;
  if st is not null then
    if p_request_type not in ('leave','time_permit') then raise exception 'APPROVAL_SUBTYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.hr_leave_types t where t.code = st and t.kind = p_request_type) then raise exception 'APPROVAL_SUBTYPE_INVALID'; end if;
  end if;
  perform app.approval_validate_steps(p_steps);
  if p_request_type='leave_time_all' and exists(select 1 from jsonb_array_elements(p_steps) s where s ? 'condition' and s->'condition' <> 'null'::jsonb) then raise exception 'APPROVAL_ALL_CONDITION_NOT_ALLOWED'; end if;
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

create or replace function app.approval_dept_chain_for_employee(p_employee uuid, p_type text, p_subtype text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select c.* from public.employees e
  cross join lateral app.approval_dept_path(e.department_id) dp
  join public.approval_chains c on c.department_id = dp.dept
  where e.id = p_employee and e.archived_at is null
    and (c.request_type = p_type or (p_type in ('leave','time_permit') and c.request_type = 'leave_time_all')) and c.is_active
    and (dp.depth = 0 or c.include_children)
    and (c.subtype is null or (p_subtype is not null and c.subtype = p_subtype))
  order by dp.depth, (c.subtype is not null) desc
  limit 1 $$;

-- سلسلة الدور (بلا قسم) للحساب
create or replace function app.approval_role_chain_for(p_user uuid, p_type text, p_subtype text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select c.* from public.approval_chains c
  join public.user_roles ur on ur.user_id = p_user and ur.role = c.requester_role
  where c.department_id is null and (c.request_type = p_type or (p_type in ('leave','time_permit') and c.request_type = 'leave_time_all')) and c.is_active
    and (c.subtype is null or (p_subtype is not null and c.subtype = p_subtype))
  order by (c.subtype is not null) desc, array_position(app.approval_requester_roles(), c.requester_role) nulls last
  limit 1 $$;


-- يعرض مسار التشخيص السلسلة المشتركة عند فحص إجازة أو زمنية.
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
            'chains', (select coalesce(jsonb_agg(jsonb_build_object('id', ch.id, 'request_type', ch.request_type, 'subtype', ch.subtype, 'is_active', ch.is_active, 'include_children', ch.include_children,
                                'applies', ch.is_active and (dp.depth = 0 or ch.include_children) and (ch.subtype is null or ch.subtype = p_subtype)) order by ch.subtype nulls first), '[]'::jsonb)
                       from public.approval_chains ch where ch.department_id = dp.dept and (ch.request_type = p_type or (p_type in ('leave','time_permit') and ch.request_type='leave_time_all')))) order by dp.depth), '[]'::jsonb)
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
    -- 00396: يُقبل الطلب ويُحال إلى الموارد البشرية (والمدير الأعلى إن وُجد) — لا رفض
    fallback := 'hr_only'; reason := 'لا سلسلة والمدير المباشر (' || mgr_name || ') بلا حساب — يُقبل الطلب ويُحال إلى الموارد البشرية لتقرّره (ويستطيع المدير الأعلى البتّ بالنيابة)';
    hints := hints || to_jsonb('لتفعيل الموافقة من المدير: أنشئ حساباً للمدير المباشر أو اضبط سلسلة لقسم «' || coalesce(e.dept_name, '—') || '» من سلاسل الموافقات'::text);
  else
    fallback := 'hr_only'; reason := 'لا سلسلة ولا مدير مباشر مسجّل — يُقبل الطلب ويُحال إلى الموارد البشرية لتقرّره';
    hints := hints || to_jsonb('لتفعيل الموافقة من المدير: حدّد المدير المباشر من ملف الموظف (الموارد البشرية ← الموظفون ← البيانات)'::text);
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
    'ok', fallback in ('chain', 'manager', 'hr_only'), 'fallback', fallback, 'reason', reason, 'hints', hints);
end$$;
