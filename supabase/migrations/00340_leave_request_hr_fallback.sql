-- ═══════════════════════════════════════════════════════════════
-- 00340 · الجولة 00396 — طلب الإجازة لا يُرفض بـ«لا سلسلة/لا مدير» — يُحال إلى الموارد البشرية
--   العيب: غرفة العمليات (وكذلك الموظف/مديره/الكراج) كانت ترى HR_NO_MANAGER عند طلب إجازة لموظف بلا سلسلة موافقات
--          وبلا مدير مباشر (أو مديره بلا حساب) — فيُرفض الطلب ولا يُسجَّل أصلاً.
--   الإصلاح الجذري:
--   ① app.hr_leave_manager_can_act(emp): هل يوجد من يستطيع البتّ بلا سلسلة؟ (مدير مباشر له حساب وغير منتهي الخدمة، أو مدير أعلى بالنيابة).
--   ② hr_leave_request: بلا سلسلة وبلا من يبتّ ⇒ يُقبل الطلب من أي جهة مخوّلة، يُوسم hr_fallback بسبب نصّي، ويُبلَّغ كل موظفي الموارد البشرية
--      (والمدير الأعلى إن وُجد). لا HR_NO_MANAGER بعد الآن.
--   ③ hr_can_decide: الموارد البشرية تبتّ في كل طلب بلا سلسلة لا يستطيع مديره البتّ فيه (ليس فقط manager_id = null).
--   ④ approval_diagnose: hr_only صار مساراً مقبولاً (ok=true) بسبب واضح «يُحال إلى الموارد البشرية» + تلميحات لتفعيل موافقة المدير.
--   ⑤ hr_leaves_list يعرض hr_fallback/hr_fallback_reason ليظهر في قوائم HR وغرفة العمليات.
-- ═══════════════════════════════════════════════════════════════

alter table public.hr_leaves add column if not exists hr_fallback boolean not null default false;
alter table public.hr_leaves add column if not exists hr_fallback_reason text;
create index if not exists hr_leaves_hr_fallback_pending_idx on public.hr_leaves (status) where hr_fallback;

-- ① هل يستطيع أحد البتّ بلا سلسلة؟
create or replace function app.hr_leave_manager_can_act(p_employee uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.employees e
    join public.employees m on m.id = e.manager_id
    where e.id = p_employee and m.archived_at is null
      and ((m.user_id is not null and coalesce(m.employment_status, '') <> 'terminated')
        or exists (select 1 from public.employees g where g.id = m.manager_id and g.archived_at is null and g.user_id is not null and coalesce(g.employment_status, '') <> 'terminated')))
$$;
revoke all on function app.hr_leave_manager_can_act(uuid) from public, anon;

create or replace function app.hr_leave_fallback_reason(p_employee uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select case
    when e.manager_id is null then 'لا سلسلة موافقات ولا مدير مباشر مسجّل في ملف الموظف'
    when m.id is null or m.archived_at is not null then 'لا سلسلة موافقات والمدير المباشر مؤرشف'
    when coalesce(m.employment_status, '') = 'terminated' then 'لا سلسلة موافقات والمدير المباشر (' || m.full_name || ') منتهي الخدمة'
    when m.user_id is null then 'لا سلسلة موافقات والمدير المباشر (' || m.full_name || ') بلا حساب دخول'
    else 'لا سلسلة موافقات' end
  from public.employees e left join public.employees m on m.id = e.manager_id where e.id = p_employee
$$;
revoke all on function app.hr_leave_fallback_reason(uuid) from public, anon;

-- ③ الموارد البشرية تبتّ في كل ما لا يستطيع المدير البتّ فيه
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
  select * into mgr from public.employees where id = l.manager_id;
  -- 00396: المدير المباشر بلا حساب/منتهي الخدمة/مؤرشف ⇒ الموارد البشرية تبتّ (إضافةً إلى المدير الأعلى)
  if (mgr.id is null or mgr.user_id is null or mgr.archived_at is not null or coalesce(mgr.employment_status, '') = 'terminated') and app.has_role(array['hr_officer']) then return true; end if;
  if me is null then return false; end if;
  if l.manager_id = me then return true; end if;
  if mgr.manager_id = me and (mgr.user_id is null or mgr.employment_status = 'terminated'
     or exists (select 1 from public.hr_leaves x where x.employee_id = mgr.id and x.status = 'approved' and x.kind = 'leave' and current_date between x.start_date and x.end_date)) then
    return true;
  end if;
  return false;
end$$;

-- ② طلب الإجازة (الأصل __raw — الغلاف العام من حارس 00291 يبقى كما هو)
create or replace function app.hr_leave_request__raw(p_employee uuid, p_type uuid, p_start date, p_end date, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_notes text DEFAULT NULL::text, p_attachment text DEFAULT NULL::text, p_backdated_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare lt record; e record; me uuid := app.current_employee_id(); v_days numeric; v_minutes int := 0; v_id uuid; bal jsonb; v_cost numeric; v_max_min int; v_month_permits int;
        chain public.approval_chains; v_chain uuid; v_today date := app.hr_local_date(now()); v_back int := 0; v_prior text; v_hr boolean := app.has_role(array['hr_officer', 'super_admin']);
        v_bd_max int := app.hr_policy_int('backdated_max_days', 7); v_bd_count int := 0; v_bd_alert int := app.hr_policy_int('backdated_alert_per_month', 3); v_mgr uuid; v_title text; u uuid;
        v_ops boolean := app.has_role(array['ops_room']); v_via text; v_hr_fallback boolean := false; v_desc text;
begin
  select * into lt from public.hr_leave_types where id = p_type and is_active;
  if not found then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null;
  if not found or e.employment_status = 'terminated' then raise exception 'HR_NOT_FOUND'; end if;
  -- 00208: الكراج يقدّم الطلب نيابةً عن موظفي قسمه (سلسلة الموافقات كما هي)
  if not (app.has_role(array['hr_officer', 'super_admin']) or p_employee = me or (me is not null and e.manager_id is not distinct from me) or app.garage_can_act_on(p_employee) or v_ops) then raise exception 'HR_FORBIDDEN'; end if;   -- 00239: غرفة العمليات لأي موظف في الملاك   -- is not distinct from: مدير فارغ لا يُسقط الفحص
  if e.biometric_pin is null and not (app.has_role(array['hr_officer', 'super_admin']) or v_ops) then raise exception 'HR_NO_BIOMETRIC'; end if;   -- 00239: كـHR، غرفة العمليات تطلب لمن بلا بصمة أيضاً
  chain := app.approval_chain_for_employee(e.id, lt.kind, lt.code);   -- 00391: سلسلة القسم/القسم الفرعي ثم الدور — تعمل حتى لمن لا حساب له
  -- 00396: لا رفض بـ HR_NO_MANAGER بعد الآن — بلا سلسلة وبلا مدير مباشر قادر على البتّ (غير مسجّل أو بلا حساب أو منتهي الخدمة)
  --        يُقبل الطلب من أي جهة مخوّلة ويُحال إلى الموارد البشرية لتقرّره (كما كان يحدث لطلبات HR نفسها منذ 00391).
  v_hr_fallback := chain.id is null and app.hr_leave_manager_can_act(p_employee) is false;
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

  v_desc := case when v_back > 0 then 'ليوم سابق قبل ' || v_back || ' يوم — السبب: ' || trim(p_backdated_reason) || ' · ' else '' end || e.full_name || ' · ' || p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end
            || case when lt.kind = 'time_permit' then ' · ' || to_char(p_start_time, 'HH24:MI') || '–' || to_char(p_end_time, 'HH24:MI') else '' end || app.leave_via_suffix(v_via);
  if chain.id is not null then
    v_chain := app.approval_open(lt.kind, v_id, e.user_id);
    update public.hr_leaves set chain_id = v_chain where id = v_id;
  elsif v_hr_fallback then
    -- 00396: إحالة إلى الموارد البشرية — تبليغ كل موظفي HR مع السبب الدقيق
    update public.hr_leaves set hr_fallback = true, hr_fallback_reason = app.hr_leave_fallback_reason(p_employee) where id = v_id;
    for u in select ur.user_id from public.user_roles ur where ur.role = 'hr_officer' loop
      perform app.hr_notify(u, case when v_back > 0 then '⚠ طلب بأثر رجعي محال إليكم: ' else 'طلب محال إلى الموارد البشرية: ' end || lt.name,
        v_desc || ' · ' || app.hr_leave_fallback_reason(p_employee), '/hr/leaves', 'leave_hr_fallback:' || v_id::text, 'warning');
    end loop;
    -- المدير الأعلى (إن وُجد وله حساب) يُعلَم أيضاً لأنه يستطيع البتّ بالنيابة
    if e.manager_id is not null then
      select m2.user_id into u from public.employees m1 join public.employees m2 on m2.id = m1.manager_id where m1.id = e.manager_id and m2.user_id is not null and coalesce(m2.employment_status, '') <> 'terminated';
      if u is not null then perform app.hr_notify(u, 'طلب ' || lt.name || ' بانتظار موافقتك (بالنيابة)', v_desc, '/manager/leaves', 'leave_req:' || v_id::text, 'info'); end if;
    end if;
  else
    perform app.hr_notify(app.hr_manager_user(p_employee), case when v_back > 0 then '⚠ طلب بأثر رجعي: ' else 'طلب ' end || lt.name || ' بانتظار موافقتك', v_desc,
      '/manager/leaves', 'leave_req:' || v_id::text, 'info');
  end if;
  -- 00239: إعلام الموظف نفسه عندما يُقدَّم الطلب نيابةً عنه من غرفة العمليات
  if v_via = 'ops_room' and e.user_id is not null then
    perform app.hr_notify(e.user_id, 'قُدِّم طلب ' || lt.name || ' باسمك من غرفة العمليات', p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end || ' · سيمرّ بمسار الموافقة المحدد له', '/employee/requests', 'leave_via_ops:' || v_id::text, 'info');
  end if;
  return v_id;
end$function$;

-- ④ التشخيص: hr_only مسار مقبول
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


-- ⑤ القائمة تعرض الإحالة إلى الموارد البشرية وسببها
drop function if exists public.hr_leaves_list(text, date, date, text, uuid, text, int);
CREATE OR REPLACE FUNCTION public.hr_leaves_list(p_scope text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_department uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, kind text, type_code text, type_name text, is_paid boolean, consumes_balance boolean, start_date date, end_date date, start_time time without time zone, end_time time without time zone, days numeric, minutes integer, status text, notes text, attachment_path text, manager_id uuid, manager_name text, requested_by uuid, decided_at timestamp with time zone, decision_note text, cancelled_reason text, created_at timestamp with time zone, can_decide boolean, is_backdated boolean, backdated_reason text, backdated_days integer, can_cancel boolean, requested_via text, requester_name text, hr_fallback boolean, hr_fallback_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare me uuid := app.current_employee_id(); g_scope uuid[];
begin
  if p_scope = 'garage' then
    if not app.has_role(array['central_garage_officer','transfer_station','maintenance','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
    g_scope := app.disclosure_scope_depts();
  end if;
  return query
  select l.id, l.employee_id, e.employee_number, e.full_name, d.name, l.kind, lt.code, lt.name, lt.is_paid, lt.consumes_balance,
         l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.status, l.notes, l.attachment_path,
         l.manager_id, m.full_name, l.requested_by, l.decided_at, l.decision_note, l.cancelled_reason, l.created_at,
         (l.status = 'pending' and app.hr_can_decide(l.id)), l.is_backdated, l.backdated_reason, l.backdated_days,
         (l.status = 'pending' and (l.requested_by = auth.uid() or app.has_role(array['hr_officer', 'super_admin']) or app.hr_can_decide(l.id))),
         l.requested_via, case when l.requested_by is not null and l.requested_by is distinct from e.user_id then app.manager_display_name(l.requested_by) end,
         l.hr_fallback, l.hr_fallback_reason
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
end$function$;
grant execute on function public.hr_leaves_list(text, date, date, text, uuid, text, int) to authenticated;
