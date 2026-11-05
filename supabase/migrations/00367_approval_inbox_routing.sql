-- الوارد يعرض المهام الفعلية بالإضافة إلى المسار المباشر القائم للإجازات، دون تغيير الاعتماد.
-- تُحفظ الدالة الأصلية كما هي ويُستخدم الغلاف لإظهار الطلبات بلا سلسلة فقط لمن يملك قرارها.
alter function public.approval_my_tasks() set schema app;
alter function app.approval_my_tasks() rename to approval_my_tasks_chain_00367;
revoke all on function app.approval_my_tasks_chain_00367() from public, anon, authenticated;

create function public.approval_my_tasks()
returns table(task_id uuid, request_kind text, request_id uuid, step_no int, total_steps int, step_label text, requester_user_id uuid, requester_name text, requester_role text, requester_role_label text,
              area_name text, parent_sector text, type_name text, start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, notes text, attachment_path text, created_at timestamptz, previous_steps jsonb, items jsonb, ref_no text, details jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  select x.* from app.approval_my_tasks_chain_00367() x
  where not exists (
    select 1 from public.approval_tasks t where t.id=x.task_id and t.mode='all'
      and coalesce(nullif(t.delegates ->> auth.uid()::text,'')::uuid, auth.uid())=any(t.approved_by)
  )
  union all
  -- الكشوفات تحتفظ بدرجها وقرارها الخاصين؛ يظهر فقط الكشف المُسنَد للمعتمد الحالي.
  select t.id, 'disclosure'::text, d.id, t.step_no,
    (select count(*)::int from public.approval_tasks z where z.request_kind='disclosure' and z.request_id=d.id and z.status <> 'skipped'),
    t.step_label, d.prepared_by, coalesce(d.prepared_by_name,app.manager_display_name(d.prepared_by)), 'ops_room'::text, app.approval_role_label('ops_room'),
    null::text, null::text, coalesce(ty.label,'كشف'), d.log_date, d.log_date, null::time, null::time, null::numeric, null::int, d.details, null::text, d.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('step_no',p.step_no,'label',p.step_label,'status',p.status,'decided_by',app.manager_display_name(p.decided_by),'decided_at',p.decided_at,'note',p.note) order by p.step_no) from public.approval_tasks p where p.request_kind='disclosure' and p.request_id=d.id and p.step_no<t.step_no),'[]'::jsonb),
    null::jsonb, d.ref_no, jsonb_build_object('target_label',app.disclosure_target_label(d),'amount',d.amount)
  from public.approval_tasks t join public.disclosures d on d.id=t.request_id and t.request_kind='disclosure'
  left join public.disclosure_types ty on ty.key=d.violation_type
  where t.status='pending' and d.status='pending' and auth.uid()=any(t.approvers)
    and not (t.mode='all' and coalesce(nullif(t.delegates ->> auth.uid()::text,'')::uuid,auth.uid())=any(t.approved_by))
  union all
  select l.id, l.kind, l.id, 1, 1,
    case when app.current_employee_id() = l.manager_id then 'المدير المباشر'
         when app.has_role(array['hr_officer']) and (l.manager_id is null or mgr.id is null or mgr.user_id is null or mgr.archived_at is not null or coalesce(mgr.employment_status,'')='terminated') then 'الموارد البشرية'
         else 'المدير بالنيابة' end,
    e.user_id, e.full_name, null::text, null::text, null::text, null::text,
    lt.name, l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.notes, l.attachment_path, l.created_at,
    '[]'::jsonb, null::jsonb, null::text,
    jsonb_build_object('approval_fallback',true) || case when l.is_backdated then jsonb_build_object('backdated',true,'reason',l.backdated_reason,'days_late',l.backdated_days,'prior_status',l.backdated_prior_status,
       'month_count',(select count(*) from public.hr_leaves x where x.employee_id=l.employee_id and x.is_backdated and x.status in ('pending','approved') and date_trunc('month',x.created_at at time zone 'UTC')=date_trunc('month',l.created_at at time zone 'UTC')),
       'alert_threshold',app.hr_policy_int('backdated_alert_per_month',3)) else '{}'::jsonb end
  from public.hr_leaves l join public.employees e on e.id=l.employee_id left join public.hr_leave_types lt on lt.id=l.leave_type_id
  left join public.employees mgr on mgr.id=l.manager_id
  where auth.uid() is not null and l.status='pending' and l.chain_id is null
    and not exists(select 1 from public.approval_tasks t where t.request_kind=l.kind and t.request_id=l.id)
    and app.hr_can_decide(l.id)
    and (
      (app.has_role(array['hr_officer']) and (l.manager_id is null or mgr.id is null or mgr.user_id is null or mgr.archived_at is not null or coalesce(mgr.employment_status,'')='terminated'))
      or (app.current_employee_id() is not null and l.manager_id=app.current_employee_id())
      or (app.current_employee_id() is not null and mgr.manager_id=app.current_employee_id() and (mgr.user_id is null or mgr.employment_status='terminated' or exists(select 1 from public.hr_leaves ml where ml.employee_id=mgr.id and ml.status='approved' and ml.kind='leave' and current_date between ml.start_date and ml.end_date)))
    )
  order by created_at;
end$$;
revoke all on function public.approval_my_tasks() from public, anon;
grant execute on function public.approval_my_tasks() to authenticated;

-- الوصول لتفاصيل كشف مُسنَد لمشارك في سلسلته فقط، مع بقاء صلاحيات الشاشات الأخرى دون تغيير.
alter function public.disclosure_get(uuid) set schema app;
alter function app.disclosure_get(uuid) rename to disclosure_get_scoped_00367;
revoke all on function app.disclosure_get_scoped_00367(uuid) from public, anon, authenticated;
create function public.disclosure_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare d public.disclosures;
begin
  if auth.uid() is not null and exists(select 1 from public.approval_tasks t
    where t.request_kind='disclosure' and t.request_id=p_id and
      ((t.status='pending' and auth.uid()=any(t.approvers)) or t.decided_by=auth.uid() or auth.uid()=any(t.approved_by))) then
    select * into d from public.disclosures where id=p_id;
    if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
    return app.disclosure_json(d) || jsonb_build_object(
      'events', coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actor_name',e.actor_name,'note',e.note,'amount',e.amount,'at',e.created_at) order by e.id) from public.disclosure_events e where e.disclosure_id=p_id),'[]'::jsonb),
      'timeline', coalesce((select jsonb_agg(jsonb_build_object('step_no',t.step_no,'label',t.step_label,'status',t.status,'decided_by',app.manager_display_name(t.decided_by),'decided_at',t.decided_at,'note',t.note,'approvers',(select coalesce(jsonb_agg(app.manager_display_name(a)),'[]'::jsonb) from unnest(t.approvers) a)) order by t.step_no) from public.approval_tasks t where t.request_kind='disclosure' and t.request_id=p_id),'[]'::jsonb));
  end if;
  return app.disclosure_get_scoped_00367(p_id);
end$$;
revoke all on function public.disclosure_get(uuid) from public, anon;
grant execute on function public.disclosure_get(uuid) to authenticated;

-- رابط لكل دور يملك بوابة، بما فيه الحساب المحدد أو المفوض له.
create or replace function app.approval_link_for(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id=p_user and role='admin_ops') then '/admin-ops/requests'
    when exists (select 1 from public.user_roles where user_id=p_user and role='department_manager') then '/manager/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='field_ops') then '/field-ops/requests'
    when exists (select 1 from public.user_roles where user_id=p_user and role='hr_officer') then '/hr/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='deputy_director') then '/deputy/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='super_admin') then '/admin/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='it_admin') then '/it/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='executive_director') then '/executive/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='ops_room') then '/ops-room/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='finance_officer') then '/finance/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='follow_up') then '/follow-up/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='maintenance') then '/maintenance/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='transfer_station') then '/transfer-station/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='complaints_officer') then '/complaints/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='media_officer') then '/media/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='central_garage_officer') then '/central-garage/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='employee') then '/employee/approvals'
    else '/' end $$;

create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text; link text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if t.id is null then return; end if;
  if p_kind = 'platform_reset' then   -- 00398
    select q.* into l from public.platform_reset_requests q where q.id = p_request;
    title := 'طلب تصفير المنصة بانتظار قرارك (خطوة ' || p_step || ')';
    body := cardinality(l.categories) || ' فئة بيانات · ' || (select coalesce(sum((v ->> 'rows')::bigint), 0) from jsonb_each(l.snapshot) e(k, v)) || ' سجل · طلبه ' || coalesce(l.requested_by_name, 'IT') || ' · الاعتماد من صفحة التفاصيل فقط';
  elsif p_kind = 'attendance_edit' then   -- 00397
    select q.* into l from public.attendance_edit_requests q where q.id = p_request;
    title := 'طلب تعديل حضور بانتظار موافقتك (خطوة ' || p_step || ') — ' || l.scope_label;
    body := app.attendance_action_label(l.action) || ' · ' || l.employees_count || ' موظف × ' || l.days_count || ' يوم · ' || array_to_string((select array_agg(to_char(d, 'YYYY-MM-DD')) from unnest(l.dates) d), '، ')
            || ' · السبب: ' || l.reason || ' · طلبه ' || coalesce(app.manager_display_name(l.requested_by), 'غرفة العمليات');
  elsif p_kind = 'hire' then
    select q.*, d.name as title_name, p.name as dept_name into l from public.hire_requests q join public.departments d on d.id = q.job_title_id left join public.departments p on p.id = q.department_id where q.id = p_request;
    title := 'طلب تعيين موظف بانتظار موافقتك (خطوة ' || p_step || ') — ' || l.full_name;
    body := app.hire_source_label(l.source) || ' · ' || l.title_name || coalesce(' · ' || l.dept_name, '') || ' · مباشرة ' || l.hire_date::text || ' · ' || case l.contract_type when 'daily' then 'يومي' else 'شهري' end || ' · طلبه ' || coalesce(app.user_display_name(l.requester_user_id), '');
  elsif p_kind = 'complaint_report' then
    select r.* into l from public.complaint_reports r where r.id = p_request;
    title := 'تقرير شكاوى بانتظار اعتمادك (خطوة ' || p_step || ') — ' || l.title;
    body := case l.sector when 'karrada' then 'الكرادة' else 'الزعفرانية' end || ' · ' || l.report_date::text || ' · ' || (select count(*) from public.complaint_report_items i where i.report_id = l.id and i.included) || ' موقعاً · أعدّه ' || coalesce(app.user_display_name(l.approval_requested_by), '');
  elsif p_kind = 'cold_archive_purge' then
    select p.* into l from public.cold_archive_packages p where p.id = p_request;
    title := 'طلب حذف أرشيف بارد بانتظار قرارك (خطوة ' || p_step || ') — ' || l.code;
    body := 'الفترة ' || l.period_from::text || ' → ' || l.period_to::text || ' · ' || l.file_count || ' ملف · نسخ متحقَّقة ' || l.verified_copies || '/' || l.required_copies || ' · طلبه ' || coalesce(app.user_display_name(l.purge_requested_by), '');
  elsif p_kind = 'advance' then
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
    -- في خطوة «الجميع» لا يُعاد طلب القرار ممن صوّت بنفسه أو عبر مفوَّضه.
    if t.mode = 'all' and coalesce(nullif(t.delegates ->> u::text,'')::uuid,u)=any(t.approved_by) then continue; end if;
    link := case when p_kind = 'disclosure' then (case when exists (select 1 from public.user_roles where user_id = u and role = 'deputy_director') then '/deputy/statements' when exists (select 1 from public.user_roles where user_id = u and role = 'super_admin') then '/admin/disclosures' else app.approval_link_for(u) end) else app.approval_link_for(u) end;
    perform app.hr_notify(u, title, body, link, 'approval:' || t.id::text, 'info');
  end loop;
end$$;

-- تنبيهات الإجازات المباشرة القديمة كانت تفتح قائمة بتاريخ محدود أو بوابة لا يملكها المعتمد.
create or replace function app.hr_notify(p_user uuid, p_title text, p_body text, p_link text, p_key text, p_type text default 'info') returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_user is null then return; end if;
  if p_key like 'leave_req:%' or p_key like 'leave_hr_fallback:%' then p_link := app.approval_link_for(p_user); end if;
  insert into public.notifications (user_id,title,body,type,category,priority,link,dedupe_key)
  values (p_user,p_title,p_body,p_type,'system','normal',p_link,p_key)
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
exception when others then null;
end$$;

-- إصلاح الروابط القائمة فقط للمهام المعلقة؛ لا يُحذف إشعار أو طلب.
update public.notifications n set link=app.approval_link_for(n.user_id)
where (n.dedupe_key like 'leave_req:%' or n.dedupe_key like 'leave_hr_fallback:%')
  and exists (select 1 from public.hr_leaves l where l.status='pending' and n.dedupe_key in ('leave_req:'||l.id::text,'leave_hr_fallback:'||l.id::text));
update public.notifications n set link=app.approval_link_for(n.user_id)
where n.dedupe_key like 'approval:%'
  and exists (select 1 from public.approval_tasks t where t.status='pending' and t.request_kind <> 'disclosure' and n.dedupe_key='approval:'||t.id::text and n.user_id=any(t.approvers));

update public.notifications n set link=app.approval_link_for(n.user_id)
where n.dedupe_key like 'approval:%' and n.link not in ('/deputy/statements','/admin/disclosures')
  and exists (select 1 from public.approval_tasks t where t.status='pending' and t.request_kind='disclosure' and n.dedupe_key='approval:'||t.id::text and n.user_id=any(t.approvers));

-- الرابط القديم «/» كان يخرق قيد الإشعارات؛ يعاد تبليغ المهام المعلقة التي لم يُحفظ تبليغها، دون تكرار أو حذف.
do $$ declare task record;
begin
  for task in
    select distinct t.request_kind,t.request_id,t.step_no
    from public.approval_tasks t cross join lateral unnest(t.approvers) u(user_id)
    where t.status='pending' and app.approval_link_for(u.user_id) <> '/'
      and not (t.mode='all' and coalesce(nullif(t.delegates ->> u.user_id::text,'')::uuid,u.user_id)=any(t.approved_by))
      and not exists(select 1 from public.notifications n where n.user_id=u.user_id and n.dedupe_key='approval:'||t.id::text)
  loop
    begin
      perform app.approval_notify_step(task.request_kind,task.request_id,task.step_no);
    exception when others then
      raise warning 'تعذر إعادة إشعار مهمة موافقة % % خطوة %: %',task.request_kind,task.request_id,task.step_no,sqlerrm;
    end;
  end loop;
end$$;

-- اختيار مفوَّض دون منح قائمة إدارة المستخدمين أو بيانات الهاتف والبريد والأدوار.
create function public.approval_delegate_candidates(p_query text)
returns table(id uuid,label text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not exists(select 1 from public.user_roles r where r.user_id=auth.uid()) then raise exception 'APPROVAL_FORBIDDEN'; end if;
  if length(trim(coalesce(p_query,'')))<2 then return; end if;
  return query
  select u.id, coalesce(v.name,trim(p_query)) from auth.users u
  cross join lateral (select coalesce((select min(nullif(trim(e.full_name),'')) from public.employees e where e.user_id=u.id and e.archived_at is null), nullif(trim(u.raw_user_meta_data->>'full_name'),'')) as name) v
  where u.id<>auth.uid() and ((v.name is not null and position(lower(trim(p_query)) in lower(v.name))>0)
       or (position('@' in p_query)>0 and lower(trim(p_query))=lower(u.email)))
    and app.approval_link_for(u.id)<>'/'
  order by coalesce(v.name,trim(p_query)),u.id limit 30;
end$$;
revoke all on function public.approval_delegate_candidates(text) from public,anon;
grant execute on function public.approval_delegate_candidates(text) to authenticated;

-- إضافة وحدات الوارد للكتالوج مع الحفاظ على قواعد الصلاحيات القائمة.
-- <<catalog>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
-- upsert (لا حذف+إدراج) كي لا تُفقد قواعد القوالب والاستثناءات المرتبطة بالوحدات الباقية
insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values
  ('employee', 'employee', '/employee', 'الرئيسية', null, '{view}', 0),
  ('employee.attendance', 'employee', '/employee/attendance', 'إثبات التواجد والعدد', null, '{view,create}', 1),
  ('employee.photos', 'employee', '/employee/photos', 'إرسال الصور', null, '{view,create}', 2),
  ('employee.approvals', 'employee', '/employee/approvals', 'طلبات الموافقة', null, '{view}', 3),
  ('hr', 'hr', '/hr', 'الرئيسية', null, '{view}', 4),
  ('hr.recruitment', 'hr', '/hr/recruitment', 'التوظيف وإنهاء الخدمات', null, '{view,create,execute}', 5),
  ('hr.hire-requests', 'hr', '/hr/hire-requests', 'تعيينات بانتظار الإكمال', null, '{view,execute}', 6),
  ('hr.employees', 'hr', '/hr/employees', 'الموظفون', null, '{view,create,edit,export,execute}', 7),
  ('hr.attendance', 'hr', '/hr/attendance', 'الحضور والانصراف', null, '{view,edit,export}', 8),
  ('hr.now', 'hr', '/hr/now', 'من في الدوام الآن', null, '{view}', 9),
  ('hr.attendance-monthly', 'hr', '/hr/attendance-monthly', 'تقرير الحضور الشهري', null, '{view,export}', 10),
  ('hr.attendance-edits', 'hr', '/hr/attendance-edits', 'طلبات تعديل الحضور', null, '{view,edit,decide}', 11),
  ('hr.leaves', 'hr', '/hr/leaves', 'الإجازات والزمنيات', null, '{view,create,decide,export}', 12),
  ('hr.documents', 'hr', '/hr/documents', 'وثائق الموظفين', null, '{view,edit,export}', 13),
  ('hr.biometric', 'hr', '/hr/biometric', 'دفتر البصمة', null, '{view,export}', 14),
  ('hr.org', 'hr', '/hr/org', 'الهيكل التنظيمي', null, '{view,create,edit,delete}', 15),
  ('hr.behavior', 'hr', '/hr/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 16),
  ('hr.approvals', 'hr', '/hr/approvals', 'طلبات الموافقة', null, '{view}', 17),
  ('manager', 'manager', '/manager', 'الرئيسية', null, '{view}', 18),
  ('manager.team', 'manager', '/manager/team', 'فريقي', null, '{view}', 19),
  ('manager.request', 'manager', '/manager/request', 'إنشاء طلب', null, '{view,create}', 20),
  ('manager.leaves', 'manager', '/manager/leaves', 'إجازات فريقي', null, '{view,create,decide}', 21),
  ('manager.breakdown', 'manager', '/manager/breakdown', 'عطل آلية', null, '{view,create}', 22),
  ('manager.vehicle-trips', 'manager', '/manager/vehicle-trips', 'حركة آليات الوردية', null, '{view,execute}', 23),
  ('manager.support', 'manager', '/manager/support', 'طلبات الدعم', null, '{view,create}', 24),
  ('manager.gbs-containers', 'manager', '/manager/gbs-containers', 'حاويات GBS', null, '{view}', 25),
  ('manager.complaints', 'manager', '/manager/complaints', 'الشكاوى المسندة', null, '{view,create,execute}', 26),
  ('manager.citizen-complaints', 'manager', '/manager/citizen-complaints', 'شكاوى المواطنين', null, '{view,execute}', 27),
  ('manager.photos', 'manager', '/manager/photos', 'إرسال صور', null, '{view,create}', 28),
  ('manager.archive', 'manager', '/manager/archive', 'الأرشيف', null, '{view}', 29),
  ('manager.approvals', 'manager', '/manager/approvals', 'طلبات الموافقة', null, '{view}', 30),
  ('finance', 'finance', '/finance', 'الرئيسية', null, '{view}', 31),
  ('finance.reports', 'finance', '/finance/reports', 'التقارير', null, '{view,export}', 32),
  ('finance.payroll', 'finance', '/finance/payroll', 'الرواتب', null, '{view,edit,decide,execute,export}', 33),
  ('finance.contractor-wages', 'finance', '/finance/contractor-wages', 'أجور المتعهدين', null, '{view,edit,decide,export}', 34),
  ('finance.advances', 'finance', '/finance/advances', 'السلف', null, '{view,execute,export}', 35),
  ('finance.settlements', 'finance', '/finance/settlements', 'المنتهية خدماتهم والتصفية', null, '{view,decide,execute,export}', 36),
  ('finance.letters', 'finance', '/finance/letters', 'سجل الكتب الرسمية', null, '{view,export}', 37),
  ('finance.purchases', 'finance', '/finance/purchases', 'مشتريات قطع الصيانة', null, '{view,decide}', 38),
  ('finance.budget', 'finance', '/finance/budget', 'القاصة', null, '{view,create,edit,decide}', 39),
  ('finance.expenses', 'finance', '/finance/expenses', 'المصاريف', null, '{view,create,edit,export}', 40),
  ('finance.announcements', 'finance', '/finance/announcements', 'التبليغات', null, '{view,create}', 41),
  ('finance.approvals', 'finance', '/finance/approvals', 'طلبات الموافقة', null, '{view}', 42),
  ('it', 'it', '/it', 'الرئيسية', null, '{view}', 43),
  ('it.user-management', 'it', '/it/user-management', 'إدارة المستخدمين', null, '{view}', 44),
  ('it.user-management.list', 'it', '/it/user-management/list', 'المستخدمون', 'it.user-management', '{view,edit}', 45),
  ('it.user-management.create', 'it', '/it/user-management/create', 'إنشاء مستخدم', 'it.user-management', '{view,create}', 46),
  ('it.user-management.approval-chains', 'it', '/it/user-management/approval-chains', 'سلاسل الموافقات', 'it.user-management', '{view,edit,delete}', 47),
  ('it.user-management.approval-performance', 'it', '/it/user-management/approval-performance', 'أداء الموافقات', 'it.user-management', '{view}', 48),
  ('it.approvals', 'it', '/it/approvals', 'طلبات الموافقة', 'it.user-management', '{view,decide}', 49),
  ('it.user-management.disclosure-types', 'it', '/it/user-management/disclosure-types', 'أنواع الكشوفات', 'it.user-management', '{view,edit}', 50),
  ('it.user-management.maintenance-workshops', 'it', '/it/user-management/maintenance-workshops', 'ورش الصيانة', 'it.user-management', '{view,edit}', 51),
  ('it.database', 'it', '/it/database', 'قاعدة البيانات', null, '{view}', 52),
  ('it.database.tables', 'it', '/it/database/tables', 'الجداول والأعمدة', 'it.database', '{view}', 53),
  ('it.branches', 'it', '/it/branches', 'فروع الشركة', null, '{view,create,edit}', 54),
  ('it.sectors', 'it', '/it/sectors', 'القطاعات والمناطق', null, '{view,create,edit}', 55),
  ('it.permissions', 'it', '/it/permissions', 'قوالب الصلاحيات', null, '{view,edit}', 56),
  ('it.integrations', 'it', '/it/integrations', 'التكاملات', null, '{view}', 57),
  ('it.integrations.biometric', 'it', '/it/integrations/biometric', 'أجهزة البصمة', 'it.integrations', '{view,edit,execute}', 58),
  ('it.integrations.biometric.unmatched', 'it', '/it/integrations/biometric/unmatched', 'الأشخاص غير المطابقين', 'it.integrations', '{view}', 59),
  ('it.integrations.biometric.attendance-audit', 'it', '/it/integrations/biometric/attendance-audit', 'سجل تعديلات الحضور', 'it.integrations', '{view}', 60),
  ('it.integrations.gps', 'it', '/it/integrations/gps', 'تتبع الشاحنات', 'it.integrations', '{view,edit,execute}', 61),
  ('it.integrations.gps-health', 'it', '/it/integrations/gps-health', 'سلامة تكامل GPS', 'it.integrations', '{view}', 62),
  ('it.integrations.hr-policy', 'it', '/it/integrations/hr-policy', 'سياسة الحضور والإجازات', 'it.integrations', '{view,edit}', 63),
  ('it.integrations.auto-deductions', 'it', '/it/integrations/auto-deductions', 'الاستقطاعات التلقائية', 'it.integrations', '{view,edit}', 64),
  ('it.integrations.advances', 'it', '/it/integrations/advances', 'السلف — الأنواع والسياسة', 'it.integrations', '{view,edit}', 65),
  ('it.integrations.live-tracking', 'it', '/it/integrations/live-tracking', 'البث المباشر — الإعدادات', 'it.integrations', '{view,edit}', 66),
  ('it.notification-policies', 'it', '/it/notification-policies', 'سياسات الإشعارات والانطلاقات', null, '{view,edit,delete}', 67),
  ('it.updates', 'it', '/it/updates', 'التحديثات والمراقبة', null, '{view,execute}', 68),
  ('it.archive', 'it', '/it/archive', 'الأرشيف', null, '{view,delete}', 69),
  ('it.central-garage-approvals', 'it', '/it/central-garage-approvals', 'موافقات تصفير خزانات الكراج', 'it.archive', '{view,decide}', 70),
  ('it.cold-archive', 'it', '/it/cold-archive', 'الأرشيف البارد', 'it.archive', '{view,create,decide,delete}', 71),
  ('it.data-retention', 'it', '/it/data-retention', 'الاحتفاظ بالبيانات', 'it.archive', '{view,edit,delete}', 72),
  ('it.console', 'it', '/it/console', 'Console — رصد الأخطاء', null, '{view}', 73),
  ('it.devops', 'it', '/it/devops', 'دليل التشغيل التقني', null, '{view}', 74),
  ('it.devops.git', 'it', '/it/devops/git', 'Git ورفع التحديثات', 'it.devops', '{view}', 75),
  ('it.devops.database', 'it', '/it/devops/database', 'قاعدة البيانات والترحيلات', 'it.devops', '{view}', 76),
  ('it.devops.tests', 'it', '/it/devops/tests', 'الاختبارات', 'it.devops', '{view}', 77),
  ('it.devops.hosting', 'it', '/it/devops/hosting', 'الاستضافة والبصمة في الإنتاج', 'it.devops', '{view}', 78),
  ('it.devops.status', 'it', '/it/devops/status', 'لوحة الحالة الحية', 'it.devops', '{view}', 79),
  ('it.platform-reset', 'it', '/it/platform-reset', 'التصفير', null, '{view,execute}', 80),
  ('admin', 'admin', '/admin', 'الرئيسية', null, '{view}', 81),
  ('admin.reports', 'admin', '/admin/reports', 'التقارير', null, '{view}', 82),
  ('admin.announcements', 'admin', '/admin/announcements', 'التبليغات', null, '{view,create}', 83),
  ('admin.approvals', 'admin', '/admin/approvals', 'طلبات الموافقة', null, '{view,decide}', 84),
  ('admin.approval-performance', 'admin', '/admin/approval-performance', 'أداء الموافقات', null, '{view}', 85),
  ('admin.procedures', 'admin', '/admin/procedures', 'الإجراءات', null, '{view,execute}', 86),
  ('admin.disclosures', 'admin', '/admin/disclosures', 'الكشوفات', null, '{view,decide}', 87),
  ('field-ops', 'field-ops', '/field-ops', 'الرئيسية', null, '{view}', 88),
  ('field-ops.requests', 'field-ops', '/field-ops/requests', 'طلبات فريقي', null, '{view,decide}', 89),
  ('field-ops.sectors', 'field-ops', '/field-ops/sectors', 'القواطع والمسؤولون', null, '{view}', 90),
  ('field-ops.reports', 'field-ops', '/field-ops/reports', 'التقارير', null, '{view}', 91),
  ('field-ops.notify', 'field-ops', '/field-ops/notify', 'التبليغ', null, '{view,create}', 92),
  ('field-ops.procedures', 'field-ops', '/field-ops/procedures', 'الإجراءات', null, '{view,execute}', 93),
  ('field-ops.my-requests', 'field-ops', '/field-ops/my-requests', 'طلباتي', null, '{view,create}', 94),
  ('admin-ops', 'admin-ops', '/admin-ops', 'الرئيسية', null, '{view}', 95),
  ('admin-ops.requests', 'admin-ops', '/admin-ops/requests', 'طلبات فريقي', null, '{view,create,decide}', 96),
  ('admin-ops.reports', 'admin-ops', '/admin-ops/reports', 'التقارير', null, '{view}', 97),
  ('admin-ops.notify', 'admin-ops', '/admin-ops/notify', 'التبليغ', null, '{view,create}', 98),
  ('admin-ops.procedures', 'admin-ops', '/admin-ops/procedures', 'الإجراءات', null, '{view,create,execute}', 99),
  ('admin-ops.disclosures', 'admin-ops', '/admin-ops/disclosures', 'الكشوفات', null, '{view,create,decide}', 100),
  ('admin-ops.contractors', 'admin-ops', '/admin-ops/contractors', 'متابعة المتعهدين والعمال', null, '{view,decide}', 101),
  ('admin-ops.my-requests', 'admin-ops', '/admin-ops/my-requests', 'طلباتي', null, '{view,create}', 102),
  ('maintenance', 'maintenance', '/maintenance', 'الرئيسية', null, '{view}', 103),
  ('maintenance.purchases', 'maintenance', '/maintenance/purchases', 'مشتريات قطع الصيانة', null, '{view,create}', 104),
  ('maintenance.inventory', 'maintenance', '/maintenance/inventory', 'مخزون قطع الصيانة', null, '{view,create,edit}', 105),
  ('maintenance.vehicle-cases', 'maintenance', '/maintenance/vehicle-cases', 'صيانة الآليات', null, '{view,create,decide,execute}', 106),
  ('maintenance.employees', 'maintenance', '/maintenance/employees', 'الموظفون', null, '{view,edit}', 107),
  ('maintenance.requests', 'maintenance', '/maintenance/requests', 'الطلبات', null, '{view,create}', 108),
  ('maintenance.procedures', 'maintenance', '/maintenance/procedures', 'الإجراءات', null, '{view,create,execute}', 109),
  ('maintenance.archive', 'maintenance', '/maintenance/archive', 'أرشيف الصيانة', null, '{view,delete}', 110),
  ('maintenance.approvals', 'maintenance', '/maintenance/approvals', 'طلبات الموافقة', null, '{view}', 111),
  ('transfer-station', 'transfer-station', '/transfer-station', 'الرئيسية', null, '{view}', 112),
  ('transfer-station.weights', 'transfer-station', '/transfer-station/weights', 'الأوزان', null, '{view,create,execute}', 113),
  ('transfer-station.weights.log', 'transfer-station', '/transfer-station/weights/log', 'تسجيل الأوزان', 'transfer-station.weights', '{view,export}', 114),
  ('transfer-station.saksat', 'transfer-station', '/transfer-station/saksat', 'السكسات والنسافات الخارجة', null, '{view,create,export}', 115),
  ('transfer-station.carrier', 'transfer-station', '/transfer-station/carrier', 'ناقلات الحاويات المكبسية', null, '{view,create,export}', 116),
  ('transfer-station.vehicle-movements', 'transfer-station', '/transfer-station/vehicle-movements', 'حركة آليات المواقع', null, '{view,execute}', 117),
  ('transfer-station.employees', 'transfer-station', '/transfer-station/employees', 'الموظفون', null, '{view,edit}', 118),
  ('transfer-station.requests', 'transfer-station', '/transfer-station/requests', 'الطلبات', null, '{view,create}', 119),
  ('transfer-station.procedures', 'transfer-station', '/transfer-station/procedures', 'الإجراءات', null, '{view,create,execute}', 120),
  ('transfer-station.disclosures', 'transfer-station', '/transfer-station/disclosures', 'الكشوفات', null, '{view,create}', 121),
  ('transfer-station.fines', 'transfer-station', '/transfer-station/fines', 'الغرامات', null, '{view,create}', 122),
  ('transfer-station.archive', 'transfer-station', '/transfer-station/archive', 'أرشيف المحطة', null, '{view,delete}', 123),
  ('transfer-station.approvals', 'transfer-station', '/transfer-station/approvals', 'طلبات الموافقة', null, '{view}', 124),
  ('executive', 'executive', '/executive', 'الرئيسية', null, '{view}', 125),
  ('executive.reports', 'executive', '/executive/reports', 'التقارير', null, '{view,export}', 126),
  ('executive.announcements', 'executive', '/executive/announcements', 'التبليغات', null, '{view,create}', 127),
  ('executive.approvals', 'executive', '/executive/approvals', 'طلبات الموافقة', null, '{view,decide}', 128),
  ('executive.procedures', 'executive', '/executive/procedures', 'الإجراءات', null, '{view,execute}', 129),
  ('executive.receivables', 'executive', '/executive/receivables', 'مستحقات الشركة', null, '{view,create,edit,execute}', 130),
  ('executive.gps-payments', 'executive', '/executive/gps-payments', 'تسديد مستحقات GPS', null, '{view,create,edit}', 131),
  ('executive.rewards', 'executive', '/executive/rewards', 'المكافآت', null, '{view,create}', 132),
  ('executive.letters', 'executive', '/executive/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 133),
  ('executive.events', 'executive', '/executive/events', 'فعاليات الشركة', null, '{view,create}', 134),
  ('executive.behavior', 'executive', '/executive/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 135),
  ('executive.stop-hotspots', 'executive', '/executive/stop-hotspots', 'خريطة النفايات (بقع التوقف)', null, '{view}', 136),
  ('executive.attendance-edits', 'executive', '/executive/attendance-edits', 'تعديلات الحضور', null, '{view}', 137),
  ('deputy', 'deputy', '/deputy', 'الرئيسية', null, '{view}', 138),
  ('deputy.reports', 'deputy', '/deputy/reports', 'التقارير', null, '{view,export}', 139),
  ('deputy.announcements', 'deputy', '/deputy/announcements', 'التبليغات', null, '{view,create}', 140),
  ('deputy.statements', 'deputy', '/deputy/statements', 'الكشوفات', null, '{view,decide}', 141),
  ('deputy.deductions', 'deputy', '/deputy/deductions', 'مراجعة الاستقطاعات', null, '{view,decide,edit}', 142),
  ('deputy.rented-tax', 'deputy', '/deputy/rented-tax', 'ضريبة الآليات المؤجرة', null, '{view,edit}', 143),
  ('deputy.overtime', 'deputy', '/deputy/overtime', 'الساعات الإضافية المدفوعة', null, '{view,decide,edit}', 144),
  ('deputy.attendance-edits', 'deputy', '/deputy/attendance-edits', 'تعديلات الحضور', null, '{view,create,execute}', 145),
  ('deputy.sector-supplies', 'deputy', '/deputy/sector-supplies', 'كتب مستلزمات القواطع', null, '{view,decide}', 146),
  ('deputy.station-folders', 'deputy', '/deputy/station-folders', 'فولدرات المحطة', null, '{view}', 147),
  ('deputy.data-analysis', 'deputy', '/deputy/data-analysis', 'تحليل البيانات', null, '{view}', 148),
  ('deputy.rewards', 'deputy', '/deputy/rewards', 'المكافآت', null, '{view,create}', 149),
  ('deputy.letters', 'deputy', '/deputy/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 150),
  ('deputy.approvals', 'deputy', '/deputy/approvals', 'طلبات الموافقة', null, '{view,decide}', 151),
  ('deputy.procedures', 'deputy', '/deputy/procedures', 'الإجراءات', null, '{view,execute}', 152),
  ('deputy.behavior', 'deputy', '/deputy/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 153),
  ('deputy.stop-hotspots', 'deputy', '/deputy/stop-hotspots', 'خريطة النفايات (بقع التوقف)', null, '{view}', 154),
  ('ops-room', 'ops-room', '/ops-room', 'الرئيسية', null, '{view}', 155),
  ('ops-room.operations-data', 'ops-room', '/ops-room/operations-data', 'بيانات وتقارير العمليات', null, '{view,edit,export}', 156),
  ('ops-room.station-daily', 'ops-room', '/ops-room/station-daily', 'التقرير اليومي للمحطة', null, '{view,create,export}', 157),
  ('ops-room.station-fleet', 'ops-room', '/ops-room/station-fleet', 'أسطول المحطة التحويلية', null, '{view,create,edit}', 158),
  ('ops-room.station-outbound', 'ops-room', '/ops-room/station-outbound', 'متابعة خروج آليات المحطة', null, '{view,execute}', 159),
  ('ops-room.vehicles-database', 'ops-room', '/ops-room/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit,export}', 160),
  ('ops-room.vehicles-archive', 'ops-room', '/ops-room/vehicles-archive', 'أرشيف الآليات', null, '{view,delete}', 161),
  ('ops-room.gps', 'ops-room', '/ops-room/gps', 'بيانات أجهزة GPS', null, '{view,edit,execute,export}', 162),
  ('ops-room.gbs-containers', 'ops-room', '/ops-room/gbs-containers', 'GBS الحاويات', null, '{view,edit}', 163),
  ('ops-room.attendance', 'ops-room', '/ops-room/attendance', 'الحضوريات', null, '{view,edit,decide,export}', 164),
  ('ops-room.store', 'ops-room', '/ops-room/store', 'المخزن', null, '{view,create,edit,execute}', 165),
  ('ops-room.campaigns', 'ops-room', '/ops-room/campaigns', 'متابعة الحملات', null, '{view,create,export}', 166),
  ('ops-room.citizen-complaints', 'ops-room', '/ops-room/citizen-complaints', 'استقبال الشكاوى', null, '{view,execute,delete}', 167),
  ('ops-room.disclosures', 'ops-room', '/ops-room/disclosures', 'الكشوفات', null, '{view,create,decide}', 168),
  ('ops-room.advances', 'ops-room', '/ops-room/advances', 'السلف', null, '{view,create}', 169),
  ('ops-room.contractor-headcounts', 'ops-room', '/ops-room/contractor-headcounts', 'حضوريات العمال', null, '{view,decide}', 170),
  ('ops-room.leaves', 'ops-room', '/ops-room/leaves', 'طلبات الإجازة', null, '{view,decide}', 171),
  ('ops-room.live-tracking', 'ops-room', '/ops-room/live-tracking', 'البث المباشر', null, '{view}', 172),
  ('ops-room.live-tracking.data', 'ops-room', '/ops-room/live-tracking/data', 'بيانات البث المباشر', null, '{view}', 173),
  ('ops-room.waste-map', 'ops-room', '/ops-room/waste-map', 'خريطة النفايات (بقع التوقف)', null, '{view,export}', 174),
  ('ops-room.approvals', 'ops-room', '/ops-room/approvals', 'طلبات الموافقة', null, '{view}', 175),
  ('complaints', 'complaints', '/complaints', 'الرئيسية', null, '{view}', 176),
  ('complaints.karrada-sector', 'complaints', '/complaints/karrada-sector', 'قاطع الكرادة', null, '{view,create,edit}', 177),
  ('complaints.zaafaraniya-sector', 'complaints', '/complaints/zaafaraniya-sector', 'قاطع الزعفرانية', null, '{view,create,edit}', 178),
  ('complaints.assignment', 'complaints', '/complaints/assignment', 'فرز وإسناد الشكاوى', null, '{view,create,edit}', 179),
  ('complaints.processing', 'complaints', '/complaints/processing', 'معالجة الشكاوى', null, '{view,decide,execute}', 180),
  ('complaints.templates', 'complaints', '/complaints/templates', 'القوالب', null, '{view,edit}', 181),
  ('complaints.data', 'complaints', '/complaints/data', 'بيانات الشكاوى', null, '{view,export}', 182),
  ('complaints.database', 'complaints', '/complaints/database', 'قاعدة بيانات الشكاوى', null, '{view,export}', 183),
  ('complaints.pages-contact-settings', 'complaints', '/complaints/pages-contact-settings', 'إعدادات الصفحات والتواصل', null, '{view,edit}', 184),
  ('complaints.archive', 'complaints', '/complaints/archive', 'أرشيف الشكاوى', null, '{view,execute,delete}', 185),
  ('complaints.technical-support', 'complaints', '/complaints/technical-support', 'الدعم الفني', null, '{view,create}', 186),
  ('complaints.approvals', 'complaints', '/complaints/approvals', 'طلبات الموافقة', null, '{view}', 187),
  ('media', 'media', '/media', 'الرئيسية', null, '{view}', 188),
  ('media.karrada-sector', 'media', '/media/karrada-sector', 'قاطع الكرادة', null, '{view,create}', 189),
  ('media.zaafaraniya-sector', 'media', '/media/zaafaraniya-sector', 'الزعفرانية', null, '{view,create}', 190),
  ('media.zaafaraniya-folder', 'media', '/media/zaafaraniya-folder', 'فولدر الزعفرانية', null, '{view,create,export}', 191),
  ('media.karrada-folder', 'media', '/media/karrada-folder', 'فولدر الكرادة', null, '{view,create,export}', 192),
  ('media.design-templates', 'media', '/media/design-templates', 'قوالب التصميم', null, '{view,create,edit,delete}', 193),
  ('media.archive', 'media', '/media/archive', 'الأرشيف', null, '{view,delete}', 194),
  ('media.approvals', 'media', '/media/approvals', 'طلبات الموافقة', null, '{view}', 195),
  ('central-garage', 'central-garage', '/central-garage', 'الرئيسية', null, '{view}', 196),
  ('central-garage.drivers-dispatch', 'central-garage', '/central-garage/drivers-dispatch', 'انطلاقية السائقين', null, '{view,create,execute}', 197),
  ('central-garage.maintenance-coordination', 'central-garage', '/central-garage/maintenance-coordination', 'تنسيق حركات الصيانة', null, '{view,create,decide,execute}', 198),
  ('central-garage.vehicles-database', 'central-garage', '/central-garage/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit}', 199),
  ('central-garage.fuel', 'central-garage', '/central-garage/fuel', 'الوقود', null, '{view,create}', 200),
  ('central-garage.fuel.gas-oil', 'central-garage', '/central-garage/fuel/gas-oil', 'الكاز', 'central-garage.fuel', '{view,create}', 201),
  ('central-garage.fuel.hydraulic', 'central-garage', '/central-garage/fuel/hydraulic', 'الهيدروليك', 'central-garage.fuel', '{view,create}', 202),
  ('central-garage.fuel.grease', 'central-garage', '/central-garage/fuel/grease', 'الدهن', 'central-garage.fuel', '{view,create}', 203),
  ('central-garage.fuel.c-oil', 'central-garage', '/central-garage/fuel/c-oil', 'C-Oil', 'central-garage.fuel', '{view,create}', 204),
  ('central-garage.employees', 'central-garage', '/central-garage/employees', 'الموظفون', null, '{view,edit}', 205),
  ('central-garage.requests', 'central-garage', '/central-garage/requests', 'الطلبات', null, '{view,create}', 206),
  ('central-garage.procedures', 'central-garage', '/central-garage/procedures', 'الإجراءات', null, '{view,create,execute}', 207),
  ('central-garage.disclosures', 'central-garage', '/central-garage/disclosures', 'الكشوفات', null, '{view,create}', 208),
  ('central-garage.reports', 'central-garage', '/central-garage/reports', 'تقارير الكراج', null, '{view,export}', 209),
  ('central-garage.archive', 'central-garage', '/central-garage/archive', 'الأرشيف', null, '{view,delete}', 210),
  ('central-garage.approvals', 'central-garage', '/central-garage/approvals', 'طلبات الموافقة', null, '{view}', 211),
  ('follow-up', 'follow-up', '/follow-up', 'الرئيسية', null, '{view}', 212),
  ('follow-up.containers', 'follow-up', '/follow-up/containers', 'متابعة الحاويات', null, '{view,edit}', 213),
  ('follow-up.workers', 'follow-up', '/follow-up/workers', 'متابعة العمال', null, '{view,edit}', 214),
  ('follow-up.approvals', 'follow-up', '/follow-up/approvals', 'طلبات الموافقة', null, '{view}', 215)
on conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;
-- لا تُحذف الوحدات الأخرى أو قواعدها أثناء تحديث الكتالوج.
insert into public.permission_portal_roles (portal, role) values
  ('employee', 'employee'),
  ('hr', 'hr_officer'),
  ('manager', 'department_manager'),
  ('finance', 'finance_officer'),
  ('it', 'it_admin'),
  ('admin', 'super_admin'),
  ('field-ops', 'field_ops'),
  ('admin-ops', 'admin_ops'),
  ('maintenance', 'maintenance'),
  ('transfer-station', 'transfer_station'),
  ('executive', 'executive_director'),
  ('deputy', 'deputy_director'),
  ('ops-room', 'ops_room'),
  ('complaints', 'complaints_officer'),
  ('media', 'media_officer'),
  ('central-garage', 'central_garage_officer'),
  ('follow-up', 'follow_up')
on conflict (portal) do update set role = excluded.role;
-- <<catalog/>>
