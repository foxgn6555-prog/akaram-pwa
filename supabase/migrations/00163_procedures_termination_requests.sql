-- 00163 · وحدة «الإجراءات»: طلبات إنهاء الخدمة بصلاحيات متدرجة + سلاسل موافقات (الجولة 4)
-- النطاقات:
--   مسؤول القاطع      → مسؤولو أقسام قواطعه، متعهدو قواطعه، عمال متعهديه.
--   العمليات الميدانية → ما سبق في كل القواطع + مسؤولو القواطع + موظفو الكراج المركزي والصيانة.
--   معاون المدير المفوض → كل الموظفين والعمال عدا المدير المفوض والمدير التنفيذي.
--   المدير المفوض     → الجميع بلا استثناء.
-- التدفق: طلب (الهدف، نوع الإنهاء، آخر يوم، السبب) → سلسلة الموافقات المضبوطة من التطوير المركزية (دور الطالب × termination)؛
-- بلا سلسلة → موافقة الموارد البشرية (مسؤولو HR) خطوةً وحيدة. عند الموافقة النهائية يُنفَّذ الإنهاء فعلياً (موظف: كما تفعل HR؛ عامل: إيقاف من قائمة متعهده)
-- وتُبلَّغ HR والتطوير المركزية (لتعطيل الحساب). الرفض بسبب يُنهي الطلب. لا بيانات مالية في المخرجات.

create table if not exists public.termination_requests (
  id                 uuid primary key default gen_random_uuid(),
  requester_user_id  uuid not null references auth.users(id),
  requester_role     text not null,
  target_kind        text not null check (target_kind in ('employee','worker')),
  target_employee_id uuid references public.employees(id),
  target_worker_id   uuid references public.contractor_workers(id),
  target_user_id     uuid,
  target_name        text not null,
  target_label       text not null,                      -- وصف الهدف (مسؤول قسم · الكرادة …)
  termination_type   text not null check (termination_type in ('resignation','dismissal','contract_end','retirement','death')),
  last_day           date not null,
  reason             text not null,
  attachment_path    text,
  chain_id           uuid references public.approval_chains(id) on delete set null,
  status             text not null default 'pending' check (status in ('pending','executed','rejected','cancelled')),
  decided_at         timestamptz,
  executed_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists termination_requests_req_idx on public.termination_requests (requester_user_id, created_at desc);
alter table public.termination_requests enable row level security;
drop policy if exists "termination: requester or hr/it" on public.termination_requests;
create policy "termination: requester or hr/it" on public.termination_requests for select to authenticated
  using (requester_user_id = auth.uid() or app.has_role(array['hr_officer','it_admin','super_admin']));

alter table public.approval_chains drop constraint if exists approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check check (request_type in ('leave','time_permit','supplies','termination'));
alter table public.approval_tasks drop constraint if exists approval_tasks_request_kind_check;
alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (request_kind in ('leave','time_permit','supplies','termination'));

create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
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

-- رابط صفحة «الإجراءات» حسب دور الطالب
create or replace function app.procedures_link_for(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role in ('executive_director','super_admin')) then '/executive/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'deputy_director') then '/deputy/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'field_ops') then '/field-ops/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then '/admin-ops/procedures'
    else '/notifications' end $$;

create or replace function app.termination_type_label(p text) returns text language sql immutable as
$$ select case p when 'resignation' then 'استقالة' when 'dismissal' then 'فصل' when 'contract_end' then 'انتهاء عقد' when 'retirement' then 'تقاعد' when 'death' then 'وفاة' else p end $$;

-- الدور «الإجرائي» للمستخدم الحالي (الأعلى أولاً)
create or replace function app.procedure_role() returns text language sql stable security definer set search_path = public, app as $$
  select case
    when app.has_role(array['super_admin','executive_director']) then 'executive_director'
    when app.has_role(array['deputy_director']) then 'deputy_director'
    when app.has_role(array['field_ops']) then 'field_ops'
    when app.has_role(array['admin_ops']) then 'admin_ops'
    else null end $$;

-- أهداف إنهاء الخدمة المسموح بها للمستخدم الحالي (موظفون + عمال) حسب نطاقه
create or replace function public.termination_targets()
returns table(target_kind text, employee_id uuid, worker_id uuid, user_id uuid, full_name text, label text, scope text, employee_number text)
language plpgsql stable security definer set search_path = public, app as $$
declare r text := app.procedure_role(); parents text[];
begin
  if r is null then raise exception 'PROCEDURE_FORBIDDEN'; end if;
  parents := case when r = 'admin_ops' then coalesce((select p.parent_sectors from public.sector_manager_profiles p where p.user_id = auth.uid()), '{}')
                  else (select coalesce(array_agg(distinct s.parent_sector), '{}') from public.sectors s where s.parent_sector is not null) end;
  if r = 'admin_ops' and cardinality(parents) = 0 then raise exception 'SECTOR_MANAGER_NOT_ASSIGNED'; end if;
  return query
  with emp as (
    select e.id, e.user_id, e.full_name, e.employee_number, e.job_title,
      (select array_agg(ur.role) from public.user_roles ur where ur.user_id = e.user_id) as roles
    from public.employees e where e.employment_status <> 'terminated' and e.archived_at is null and e.user_id is distinct from auth.uid()
  ),
  dm as (  -- مسؤولو الأقسام في النطاق
    select distinct mp.user_id, s.parent_sector from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(parents)
  ),
  ct as (  -- المتعهدون في النطاق
    select cp.user_id, s.parent_sector, s.name as area from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(parents)
  )
  -- موظفون
  select 'employee', e.id, null::uuid, e.user_id, e.full_name,
    case when exists (select 1 from dm where dm.user_id = e.user_id) then 'مسؤول قسم · ' || (select string_agg(distinct app.parent_sector_name(dm.parent_sector), '، ') from dm where dm.user_id = e.user_id)
         when exists (select 1 from ct where ct.user_id = e.user_id) then 'متعهد · ' || (select string_agg(ct.area, '، ') from ct where ct.user_id = e.user_id)
         when 'admin_ops' = any(e.roles) then 'مسؤول قاطع · ' || coalesce((select string_agg(app.parent_sector_name(x), '، ') from public.sector_manager_profiles p, unnest(p.parent_sectors) x where p.user_id = e.user_id), '')
         when 'central_garage_officer' = any(e.roles) then 'الكراج المركزي' || coalesce(' · ' || e.job_title, '')
         when 'maintenance' = any(e.roles) then 'الصيانة' || coalesce(' · ' || e.job_title, '')
         else coalesce(e.job_title, 'موظف') end,
    case when exists (select 1 from dm where dm.user_id = e.user_id) then 'department_manager'
         when exists (select 1 from ct where ct.user_id = e.user_id) then 'contractor'
         when 'admin_ops' = any(e.roles) then 'admin_ops'
         when 'central_garage_officer' = any(e.roles) then 'garage'
         when 'maintenance' = any(e.roles) then 'maintenance' else 'other' end,
    e.employee_number
  from emp e
  where case r
    when 'admin_ops' then exists (select 1 from dm where dm.user_id = e.user_id) or exists (select 1 from ct where ct.user_id = e.user_id)
    when 'field_ops' then exists (select 1 from dm where dm.user_id = e.user_id) or exists (select 1 from ct where ct.user_id = e.user_id)
                          or e.roles && array['admin_ops','central_garage_officer','maintenance']
    when 'deputy_director' then not (coalesce(e.roles, '{}') && array['executive_director','super_admin'])
    else true end
  union all
  -- عمال المتعهدين
  select 'worker', null::uuid, w.id, null::uuid, w.full_name, 'عامل · ' || app.manager_display_name(w.contractor_user_id) || ' · ' || s.name, 'worker', null
  from public.contractor_workers w join public.contractor_profiles cp on cp.user_id = w.contractor_user_id and cp.is_active join public.sectors s on s.id = cp.sector_id
  where w.is_active and s.parent_sector = any(parents)
  order by 7, 5;
end$$;

-- التنفيذ الفعلي (داخلي): موظف أو عامل
create or replace function app.termination_execute(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare r public.termination_requests; u uuid;
begin
  select * into r from public.termination_requests where id = p_id;
  if r.target_kind = 'employee' then
    update public.employees set employment_status = 'terminated', terminated_at = r.last_day, termination_type = r.termination_type,
      termination_reason = r.reason, termination_attachment_path = r.attachment_path, terminated_by = r.requester_user_id, updated_at = now()
    where id = r.target_employee_id and employment_status <> 'terminated';
    if not found then raise exception 'HR_ALREADY_TERMINATED'; end if;
    insert into public.finance_hr_notices (employee_id, kind, payload)
    values (r.target_employee_id, 'termination_settlement', jsonb_build_object('type', r.termination_type, 'last_day', r.last_day, 'reason', r.reason, 'via', 'procedure', 'request_id', r.id));
    -- متعهد: إيقاف ملفه؛ مسؤول قاطع: إزالة إسناده
    update public.contractor_profiles set is_active = false, notes = left('إنهاء خدمة: ' || r.reason, 500) where user_id = r.target_user_id and is_active;
    delete from public.sector_manager_profiles where user_id = r.target_user_id;
    foreach u in array (select coalesce(array_agg(distinct ur.user_id), '{}') from public.user_roles ur where ur.role in ('hr_officer','it_admin')) loop
      perform app.hr_notify(u, 'أُنهيت خدمة ' || r.target_name, app.termination_type_label(r.termination_type) || ' · آخر يوم ' || r.last_day::text || ' · عطّلوا الحساب وأكملوا الإجراءات', '/hr/employees', 'termination_done:' || r.id::text || ':' || u::text, 'warning');
    end loop;
  else
    update public.contractor_workers set is_active = false, removed_at = now(), removed_by = r.requester_user_id, remove_reason = 'إنهاء خدمة: ' || r.reason where id = r.target_worker_id and is_active;
    if not found then raise exception 'CONTRACTOR_WORKER_NOT_FOUND'; end if;
    insert into public.contractor_audit_log(actor_id, action, contractor_user_id, worker_id, reason)
    select r.requester_user_id, 'worker_terminated', w.contractor_user_id, w.id, r.reason from public.contractor_workers w where w.id = r.target_worker_id;
  end if;
  update public.termination_requests set status = 'executed', executed_at = now(), decided_at = coalesce(decided_at, now()) where id = p_id;
  perform app.hr_notify(r.requester_user_id, 'نُفّذ إنهاء خدمة ' || r.target_name, 'اكتملت الموافقات ونُفّذ الإجراء', app.procedures_link_for(r.requester_user_id), 'termination_exec:' || r.id::text, 'success');
end$$;

-- إنشاء طلب إنهاء خدمة
create or replace function public.termination_request_create(p_target_kind text, p_target_id uuid, p_type text, p_last_day date, p_reason text, p_attachment text default null) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare r text := app.procedure_role(); t record; v_id uuid; v_chain uuid; hr uuid[]; n int;
begin
  if r is null then raise exception 'PROCEDURE_FORBIDDEN'; end if;
  if p_type not in ('resignation','dismissal','contract_end','retirement','death') then raise exception 'HR_TERMINATION_TYPE_INVALID'; end if;
  if p_last_day is null then raise exception 'HR_DATE_INVALID'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'PROCEDURE_REASON_REQUIRED'; end if;
  select * into t from public.termination_targets() x where x.target_kind = p_target_kind and coalesce(x.employee_id, x.worker_id) = p_target_id;
  if t.full_name is null then raise exception 'PROCEDURE_TARGET_FORBIDDEN'; end if;
  if exists (select 1 from public.termination_requests q where q.status = 'pending' and q.target_kind = p_target_kind and coalesce(q.target_employee_id, q.target_worker_id) = p_target_id) then raise exception 'PROCEDURE_ALREADY_PENDING'; end if;
  insert into public.termination_requests (requester_user_id, requester_role, target_kind, target_employee_id, target_worker_id, target_user_id, target_name, target_label, termination_type, last_day, reason, attachment_path)
  values (auth.uid(), r, p_target_kind, t.employee_id, t.worker_id, t.user_id, t.full_name, t.label, p_type, p_last_day, trim(p_reason), p_attachment) returning id into v_id;
  v_chain := app.approval_open('termination', v_id, auth.uid());
  if v_chain is null then
    -- بلا سلسلة: موافقة الموارد البشرية خطوةً وحيدة
    select coalesce(array_agg(distinct ur.user_id), '{}') into hr from public.user_roles ur where ur.role = 'hr_officer' and ur.user_id <> auth.uid();
    if cardinality(hr) = 0 then delete from public.termination_requests where id = v_id; raise exception 'APPROVAL_NO_APPROVER'; end if;
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status) values ('termination', v_id, 1, 'الموارد البشرية (افتراضي — بلا سلسلة مضبوطة)', hr, 'pending');
    perform app.approval_notify_step('termination', v_id, 1);
  else
    update public.termination_requests set chain_id = v_chain where id = v_id;
  end if;
  return v_id;
end$$;

create or replace function public.termination_request_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare r public.termination_requests; fin boolean;
begin
  select * into r from public.termination_requests where id = p_id;
  if r.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if r.status <> 'pending' then raise exception 'PROCEDURE_NOT_PENDING'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 2 then raise exception 'APPROVAL_REASON_REQUIRED'; end if;
  fin := app.approval_decide('termination', p_id, p_approve, p_note);
  if not fin then return; end if;
  if p_approve then
    update public.termination_requests set decided_at = now() where id = p_id;
    perform app.termination_execute(p_id);
  else
    update public.termination_requests set status = 'rejected', decided_at = now() where id = p_id;
    perform app.hr_notify(r.requester_user_id, 'رُفض طلب إنهاء خدمة ' || r.target_name, coalesce(trim(p_note), ''), app.procedures_link_for(r.requester_user_id), 'termination_rejected:' || p_id::text, 'warning');
  end if;
end$$;

create or replace function public.termination_request_cancel(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare r public.termination_requests;
begin
  select * into r from public.termination_requests where id = p_id;
  if r.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if r.requester_user_id <> auth.uid() and not app.has_role(array['super_admin']) then raise exception 'PROCEDURE_FORBIDDEN'; end if;
  if r.status <> 'pending' then raise exception 'PROCEDURE_NOT_PENDING'; end if;
  update public.approval_tasks set status = 'skipped', note = 'سحب الطالب طلبه' where request_kind = 'termination' and request_id = p_id and status in ('pending','waiting');
  update public.termination_requests set status = 'cancelled', decided_at = now() where id = p_id;
end$$;

create or replace function public.termination_requests_mine()
returns table(id uuid, target_kind text, target_name text, target_label text, termination_type text, termination_type_label text, last_day date, reason text, status text, current_step text, chain_id uuid, created_at timestamptz, decided_at timestamptz, executed_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if app.procedure_role() is null and not app.has_role(array['hr_officer','it_admin']) then raise exception 'PROCEDURE_FORBIDDEN'; end if;
  return query
  select r.id, r.target_kind, r.target_name, r.target_label, r.termination_type, app.termination_type_label(r.termination_type), r.last_day, r.reason, r.status,
    (select t.step_label from public.approval_tasks t where t.request_kind = 'termination' and t.request_id = r.id and t.status = 'pending' order by t.step_no limit 1),
    r.chain_id, r.created_at, r.decided_at, r.executed_at
  from public.termination_requests r
  where r.requester_user_id = auth.uid() or app.has_role(array['hr_officer','it_admin','super_admin'])
  order by r.status = 'pending' desc, r.created_at desc;
end$$;

-- القرار الموحّد يشمل إنهاء الخدمة
create or replace function public.approval_decide_request(p_kind text, p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_kind = 'supplies' then perform public.supply_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'termination' then perform public.termination_request_decide(p_request, p_approve, p_note);
  elsif p_kind in ('leave','time_permit') then perform public.hr_leave_decide(p_request, p_approve, p_note);
  else raise exception 'APPROVAL_TYPE_INVALID'; end if;
end$$;

-- إشعار الخطوة: يشمل إنهاء الخدمة
create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if p_kind = 'supplies' then
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
    perform app.hr_notify(u, title, body, app.approval_link_for(u), 'approval:' || t.id::text, 'info');
  end loop;
end$$;

-- مهام الموافقة: تشمل إنهاء الخدمة (details jsonb)
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

create or replace function public.approval_timeline(p_kind text, p_request uuid)
returns table(step_no int, step_label text, status text, approvers jsonb, decided_by_name text, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = public, app as $$
declare requester uuid;
begin
  if p_kind = 'supplies' then select r.manager_id into requester from public.sector_supply_requests r where r.id = p_request;
  elsif p_kind = 'termination' then select r.requester_user_id into requester from public.termination_requests r where r.id = p_request;
  else select e.user_id into requester from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id where l1.id = p_request; end if;
  if requester is null and not found then raise exception 'HR_NOT_FOUND'; end if;
  if not (auth.uid() = requester or app.has_role(array['it_admin','hr_officer','super_admin','ops_room'])
          or exists (select 1 from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request and auth.uid() = any(t.approvers))) then
    raise exception 'HR_FORBIDDEN';
  end if;
  return query
  select t.step_no, t.step_label, t.status,
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', a, 'name', app.manager_display_name(a))), '[]'::jsonb) from unnest(t.approvers) a),
    app.manager_display_name(t.decided_by), t.decided_at, t.note
  from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request order by t.step_no;
end$$;

-- الدور الموافِق hr_officer متاح في خطوات «حسب التسلسل» أصلاً (00160). الرابط لـ HR موجود.
revoke all on function public.termination_targets() from public, anon;
revoke all on function public.termination_request_create(text, uuid, text, date, text, text) from public, anon;
revoke all on function public.termination_request_decide(uuid, boolean, text) from public, anon;
revoke all on function public.termination_request_cancel(uuid) from public, anon;
revoke all on function public.termination_requests_mine() from public, anon;
revoke all on function public.approval_my_tasks() from public, anon;
grant execute on function public.termination_targets(), public.termination_request_create(text, uuid, text, date, text, text), public.termination_request_decide(uuid, boolean, text),
  public.termination_request_cancel(uuid), public.termination_requests_mine(), public.approval_my_tasks() to authenticated;

-- المدير المفوض (super_admin) بوابته /admin لا /executive — روابط الإشعارات تذهب إلى بوابته الفعلية
create or replace function app.approval_link_for(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then '/admin/approvals'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then '/admin-ops/requests'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'department_manager') then '/manager/leaves'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'field_ops') then '/field-ops/requests'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'deputy_director') then '/deputy/approvals'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'executive_director') then '/executive/approvals'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'hr_officer') then '/hr/leaves'
    else '/notifications' end $$;
create or replace function app.procedures_link_for(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then '/admin/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'executive_director') then '/executive/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'deputy_director') then '/deputy/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'field_ops') then '/field-ops/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then '/admin-ops/procedures'
    else '/notifications' end $$;
