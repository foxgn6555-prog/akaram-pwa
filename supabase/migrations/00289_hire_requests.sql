-- 00348 · «طلب تعيين موظف جديد» بدل التعيين المباشر من وحدة الإجراءات (الكراج المركزي، المحطة التحويلية، الصيانة)
-- القاعدة: لا أحد يكتب الرقم الوظيفي من هذه البوابات. النموذج يُنشئ طلباً فقط (بلا موظف)، يمرّ بسلسلة موافقات تُضبط من التطوير المركزية
-- (نوع request_type = 'hire'، الطالب: central_garage_officer / transfer_station / maintenance). بلا سلسلة ⇒ المدير المفوض (super_admin) خطوةً وحيدة.
-- عند الموافقة النهائية: status = approved وتُبلَّغ الموارد البشرية لإكمال الملف وكتابة الرقم الوظيفي يدوياً (الجولة التالية: hire_request_complete) — عندها فقط يُنشأ الموظف.
-- الرفض بسبب ⇒ rejected ويُبلَّغ الطالب. التعيين المباشر garage_employee_hire معطَّل نهائياً (HIRE_DIRECT_DISABLED).

-- ① الجدول
create table if not exists public.hire_requests (
  id                 uuid primary key default gen_random_uuid(),
  requester_user_id  uuid not null references auth.users(id),
  requester_role     text not null check (requester_role in ('central_garage_officer','transfer_station','maintenance','super_admin')),
  source             text not null check (source in ('garage','station','maintenance')),
  full_name          text not null,
  phone              text,
  job_title_id       uuid not null references public.departments(id),
  department_id      uuid references public.departments(id),
  hire_date          date not null,
  contract_type      text not null check (contract_type in ('monthly','daily')),
  shift_id           uuid references public.hr_shifts(id),
  note               text,
  chain_id           uuid references public.approval_chains(id) on delete set null,
  status             text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','completed')),
  decided_at         timestamptz,
  decided_by         uuid,
  rejected_note      text,
  employee_id        uuid references public.employees(id),
  completed_at       timestamptz,
  completed_by       uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists hire_requests_req_idx on public.hire_requests (requester_user_id, created_at desc);
create index if not exists hire_requests_status_idx on public.hire_requests (status, created_at desc);
alter table public.hire_requests enable row level security;
drop policy if exists "hire_requests: requester or hr/it" on public.hire_requests;
create policy "hire_requests: requester or hr/it" on public.hire_requests for select to authenticated
  using (requester_user_id = auth.uid() or app.has_role(array['hr_officer','it_admin','super_admin']));
comment on table public.hire_requests is 'طلبات تعيين موظف جديد من وحدات الإجراءات — تمرّ بسلسلة موافقات؛ الموظف يُنشأ لاحقاً من الموارد البشرية برقم يدوي';

-- ② نوع الطلب الجديد في محرك الموافقات
alter table public.approval_chains drop constraint if exists approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check check (request_type in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire'));
alter table public.approval_tasks drop constraint if exists approval_tasks_request_kind_check;
alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (request_kind in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire'));
create or replace function app.approval_kind_label(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'leave' then 'إجازة' when 'time_permit' then 'زمنية' when 'advance' then 'سلفة' when 'termination' then 'إنهاء خدمة'
                     when 'supplies' then 'مستلزمات' when 'disclosure' then 'إفصاح' when 'cold_archive_purge' then 'حذف أرشيف بارد' when 'complaint_report' then 'تقرير شكاوى'
                     when 'hire' then 'تعيين موظف' else coalesce(p_kind, '—') end
$$;

create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true, p_subtype text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb; st text := nullif(trim(coalesce(p_subtype, '')), '');
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if coalesce(p_requester_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
  if not (p_requester_role = any(app.approval_requester_roles())) then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  if p_request_type = 'cold_archive_purge' and p_requester_role not in ('it_admin','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  if p_request_type = 'complaint_report' and p_requester_role not in ('complaints_officer','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  if p_request_type = 'hire' and p_requester_role not in ('central_garage_officer','transfer_station','maintenance','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;   -- 00348: طالبو التعيين
  if st is not null then
    if p_request_type not in ('leave','time_permit') then raise exception 'APPROVAL_SUBTYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.hr_leave_types t where t.code = st and t.kind = p_request_type) then raise exception 'APPROVAL_SUBTYPE_INVALID'; end if;
  end if;
  perform app.approval_validate_steps(p_steps);
  select jsonb_agg(app.approval_clean_step(s) order by o) into clean from jsonb_array_elements(p_steps) with ordinality t(s, o);
  select c.id into v_id from public.approval_chains c where c.requester_role = p_requester_role and c.request_type = p_request_type and coalesce(c.subtype, '') = coalesce(st, '');
  if v_id is null then
    insert into public.approval_chains (requester_role, request_type, subtype, steps, is_active, updated_by)
    values (p_requester_role, p_request_type, st, clean, coalesce(p_active, true), auth.uid()) returning id into v_id;
  else
    update public.approval_chains set steps = clean, is_active = coalesce(p_active, true), updated_by = auth.uid(), updated_at = now() where id = v_id;
  end if;
  return v_id;
end$$;

-- ③ مصدر الطالب ودوره
create or replace function app.hire_requester_role() returns text language sql stable security definer set search_path = public, app as $$
  select case
    when app.has_role(array['central_garage_officer']) then 'central_garage_officer'
    when app.has_role(array['transfer_station']) then 'transfer_station'
    when app.has_role(array['maintenance']) then 'maintenance'
    when app.has_role(array['super_admin']) then 'super_admin'
    else null end $$;
create or replace function app.hire_source_for_role(p_role text) returns text language sql immutable as $$
  select case p_role when 'transfer_station' then 'station' when 'maintenance' then 'maintenance' else 'garage' end $$;
create or replace function app.hire_source_label(p_source text) returns text language sql immutable as $$
  select case p_source when 'station' then 'المحطة التحويلية' when 'maintenance' then 'الصيانة' else 'الكراج المركزي' end $$;

-- ④ خيارات النموذج: بلا اقتراح رقم وظيفي (00348)
create or replace function public.garage_hire_options() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare g_scope uuid[];
begin
  if not app.has_role(array['central_garage_officer','transfer_station','maintenance','ops_room','hr_officer','it_admin','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  return jsonb_build_object(
    'job_titles', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'department_id', p.id, 'department', p.name, 'drives_vehicles', t.drives_vehicles) order by p.name, t.name)
                            from public.departments t join public.departments p on p.id = t.parent_id
                            where t.is_job_title and t.is_active and t.archived_at is null and (g_scope is null or p.id = any(g_scope))), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'start_time', to_char(s.start_time, 'HH24:MI'), 'end_time', to_char(s.end_time, 'HH24:MI')) order by s.start_time)
                        from public.hr_shifts s where s.is_active), '[]'::jsonb),
    'scoped', g_scope is not null,
    'chain', (select jsonb_build_object('steps', jsonb_array_length(c.steps), 'labels', (select jsonb_agg(app.approval_step_label(s)) from jsonb_array_elements(c.steps) s))
              from app.approval_chain_for(auth.uid(), 'hire') c where c.id is not null));
end$$;
grant execute on function public.garage_hire_options() to authenticated;

-- ⑤ التعيين المباشر معطَّل نهائياً — أي استدعاء قديم يفشل بوضوح
create or replace function public.garage_employee_hire(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  raise exception 'HIRE_DIRECT_DISABLED';
end$$;
revoke all on function public.garage_employee_hire(jsonb) from public, anon, authenticated;

-- ⑥ إنشاء طلب التعيين
create or replace function public.hire_request_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare r text := app.hire_requester_role(); g_scope uuid[]; v_title public.departments; v_id uuid; v_chain uuid; v_shift uuid; approvers uuid[];
        v_contract text := coalesce(nullif(p ->> 'contract_type', ''), 'monthly'); v_hire date := coalesce(nullif(p ->> 'hire_date', '')::date, current_date); v_src text;
begin
  if r is null then raise exception 'GARAGE_FORBIDDEN'; end if;
  v_src := app.hire_source_for_role(r);
  g_scope := app.disclosure_scope_depts();
  -- الرقم الوظيفي لا يُكتب من هذه البوابات إطلاقاً، والحقول الحساسة للموارد البشرية فقط
  if p ? 'employee_number' then raise exception 'HIRE_NUMBER_NOT_ALLOWED'; end if;
  if p ?| array['biometric_pin','national_id_number','residence_card_number','mother_name','birth_date','address','base_salary','salary','allowances','email','manager_id'] then raise exception 'GARAGE_SENSITIVE_FIELD_FORBIDDEN'; end if;
  if length(trim(coalesce(p ->> 'full_name', ''))) < 3 then raise exception 'HR_NAME_REQUIRED'; end if;
  if v_contract not in ('monthly', 'daily') then raise exception 'HR_CONTRACT_TYPE_INVALID'; end if;
  select * into v_title from public.departments where id = nullif(p ->> 'job_title_id', '')::uuid and is_job_title and is_active and archived_at is null;
  if v_title.id is null then raise exception 'HR_JOB_TITLE_INVALID'; end if;
  if g_scope is not null and not (v_title.parent_id = any(g_scope)) then raise exception 'GARAGE_JOB_TITLE_OUT_OF_SCOPE'; end if;
  v_shift := nullif(p ->> 'shift_id', '')::uuid;
  if v_shift is not null and not exists (select 1 from public.hr_shifts where id = v_shift and is_active) then raise exception 'HR_SHIFT_INVALID'; end if;
  -- لا طلبين معلّقين بالاسم نفسه للمسمى نفسه
  if exists (select 1 from public.hire_requests q where q.status in ('pending','approved') and lower(q.full_name) = lower(trim(p ->> 'full_name')) and q.job_title_id = v_title.id) then raise exception 'HIRE_ALREADY_PENDING'; end if;

  insert into public.hire_requests (requester_user_id, requester_role, source, full_name, phone, job_title_id, department_id, hire_date, contract_type, shift_id, note)
  values (auth.uid(), r, v_src, trim(p ->> 'full_name'), nullif(trim(coalesce(p ->> 'phone', '')), ''), v_title.id, v_title.parent_id, v_hire, v_contract, v_shift, nullif(trim(coalesce(p ->> 'note', '')), ''))
  returning id into v_id;

  v_chain := app.approval_open('hire', v_id, auth.uid());
  if v_chain is null then
    -- بلا سلسلة مضبوطة: المدير المفوض خطوةً وحيدة
    select coalesce(array_agg(distinct ur.user_id), '{}') into approvers from public.user_roles ur where ur.role = 'super_admin' and ur.user_id <> auth.uid();
    if cardinality(approvers) = 0 then delete from public.hire_requests where id = v_id; raise exception 'APPROVAL_NO_APPROVER'; end if;
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status) values ('hire', v_id, 1, 'المدير المفوض (افتراضي — بلا سلسلة مضبوطة)', approvers, 'pending');
    perform app.approval_notify_step('hire', v_id, 1);
  else
    update public.hire_requests set chain_id = v_chain where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'full_name', trim(p ->> 'full_name'), 'job_title', v_title.name, 'department', (select d.name from public.departments d where d.id = v_title.parent_id),
                            'hire_date', v_hire, 'contract_type', v_contract, 'status', 'pending', 'via_chain', v_chain is not null);
end$$;

-- ⑦ القرار (عبر approval_decide_request)
create or replace function public.hire_request_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare r public.hire_requests; fin boolean; u uuid; title_name text;
begin
  select * into r from public.hire_requests where id = p_id for update;
  if r.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if r.status <> 'pending' then raise exception 'PROCEDURE_NOT_PENDING'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'HR_REASON_REQUIRED'; end if;
  fin := app.approval_decide('hire', p_id, p_approve, p_note);
  if not fin then return; end if;
  select d.name into title_name from public.departments d where d.id = r.job_title_id;
  if p_approve then
    update public.hire_requests set status = 'approved', decided_at = now(), decided_by = auth.uid(), updated_at = now() where id = p_id;
    for u in select ur.user_id from public.user_roles ur where ur.role = 'hr_officer' loop
      perform app.hr_notify(u, 'طلب تعيين معتمد — أكملوا ملف ' || r.full_name, app.hire_source_label(r.source) || ' · ' || coalesce(title_name, '') || ' · مباشرة ' || r.hire_date::text || ' — اكتبوا الرقم الوظيفي وأكملوا البيانات لينزل الموظف للنظام', '/hr/hire-requests', 'hire_approved:' || r.id::text || ':' || u::text, 'info');
    end loop;
    perform app.hr_notify(r.requester_user_id, 'اعتُمد طلب تعيين ' || r.full_name, 'اكتملت الموافقات — الموارد البشرية ستكتب الرقم الوظيفي وتُكمل الملف ثم ينزل للنظام', app.procedures_link_for(r.requester_user_id), 'hire_ok:' || r.id::text, 'success');
  else
    update public.hire_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid(), rejected_note = trim(p_note), updated_at = now() where id = p_id;
    perform app.hr_notify(r.requester_user_id, 'رُفض طلب تعيين ' || r.full_name, 'السبب: ' || trim(p_note), app.procedures_link_for(r.requester_user_id), 'hire_rej:' || r.id::text, 'warning');
  end if;
end$$;

-- ⑧ إلغاء من الطالب أثناء الانتظار
create or replace function public.hire_request_cancel(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare r public.hire_requests;
begin
  select * into r from public.hire_requests where id = p_id for update;
  if r.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if r.requester_user_id <> auth.uid() and not app.has_role(array['super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if r.status <> 'pending' then raise exception 'PROCEDURE_NOT_PENDING'; end if;
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الطلب من مقدّمه' where request_kind = 'hire' and request_id = p_id and status in ('waiting','pending');
  update public.hire_requests set status = 'cancelled', decided_at = now(), updated_at = now() where id = p_id;
end$$;

-- ⑨ طلباتي (الطالب) — بلا حقول حساسة
create or replace function public.hire_requests_mine()
returns table(id uuid, full_name text, phone text, job_title text, department text, hire_date date, contract_type text, shift_name text, status text, current_step text, rejected_note text, created_at timestamptz, decided_at timestamptz, completed_at timestamptz, employee_number text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  select q.id, q.full_name, q.phone, t.name, d.name, q.hire_date, q.contract_type, s.name, q.status,
    (select x.step_label from public.approval_tasks x where x.request_kind = 'hire' and x.request_id = q.id and x.status = 'pending' order by x.step_no limit 1),
    q.rejected_note, q.created_at, q.decided_at, q.completed_at, e.employee_number
  from public.hire_requests q
  join public.departments t on t.id = q.job_title_id
  left join public.departments d on d.id = q.department_id
  left join public.hr_shifts s on s.id = q.shift_id
  left join public.employees e on e.id = q.employee_id
  where q.requester_user_id = auth.uid() or app.has_role(array['super_admin'])
  order by q.created_at desc;
end$$;

-- ⑩ التوجيه الموحّد + إشعار الخطوة + مهامي + المسار الزمني
create or replace function public.approval_decide_request(p_kind text, p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_kind = 'supplies' then perform public.supply_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'termination' then perform public.termination_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'disclosure' then perform public.disclosure_decide(p_request, p_approve, p_note, null);
  elsif p_kind = 'advance' then perform public.advance_decide(p_request, p_approve, p_note, null, null);
  elsif p_kind = 'cold_archive_purge' then perform public.cold_archive_purge_decide(p_request, p_approve, p_note);
  elsif p_kind = 'complaint_report' then perform public.complaint_report_decide(p_request, p_approve, p_note);
  elsif p_kind = 'hire' then perform public.hire_request_decide(p_request, p_approve, p_note);
  elsif p_kind in ('leave','time_permit') then perform public.hr_leave_decide(p_request, p_approve, p_note);
  else raise exception 'APPROVAL_TYPE_INVALID'; end if;
end$$;

create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text; link text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if t.id is null then return; end if;
  if p_kind = 'hire' then
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
    link := case when p_kind = 'disclosure' then (case when exists (select 1 from public.user_roles where user_id = u and role = 'deputy_director') then '/deputy/statements' when exists (select 1 from public.user_roles where user_id = u and role = 'super_admin') then '/admin/disclosures' else app.approval_link_for(u) end) else app.approval_link_for(u) end;
    perform app.hr_notify(u, title, body, link, 'approval:' || t.id::text, 'info');
  end loop;
end$$;

drop function if exists public.approval_my_tasks();
create or replace function public.approval_my_tasks()
returns table(task_id uuid, request_kind text, request_id uuid, step_no int, total_steps int, step_label text, requester_user_id uuid, requester_name text, requester_role text, requester_role_label text,
              area_name text, parent_sector text, type_name text, start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, notes text, attachment_path text, created_at timestamptz, previous_steps jsonb, items jsonb, ref_no text, details jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  with base as (
    select t.*, e.user_id as req_user, e.full_name as req_name, lt.name as type_name, l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.notes, l.attachment_path, l.created_at as req_created, null::jsonb as items, null::text as ref_no,
      case when l.is_backdated then jsonb_build_object('backdated', true, 'reason', l.backdated_reason, 'days_late', l.backdated_days, 'prior_status', l.backdated_prior_status,
        'month_count', (select count(*) from public.hr_leaves x where x.employee_id = l.employee_id and x.is_backdated and x.status in ('pending', 'approved') and date_trunc('month', x.created_at at time zone 'UTC') = date_trunc('month', l.created_at at time zone 'UTC')),
        'alert_threshold', app.hr_policy_int('backdated_alert_per_month', 3)) end as details, null::text as fixed_role
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
    -- 00348: طلبات التعيين
    select t.*, q.requester_user_id, app.manager_display_name(q.requester_user_id), 'تعيين موظف', q.hire_date, q.hire_date, null, null, null, null, q.note, null, q.created_at, null, null,
      jsonb_build_object('full_name', q.full_name, 'phone', q.phone, 'job_title', jt.name, 'department', dp.name, 'hire_date', q.hire_date, 'contract_type', q.contract_type,
                         'contract_label', case q.contract_type when 'daily' then 'يومي' else 'شهري' end, 'shift_name', sh.name, 'source', q.source, 'source_label', app.hire_source_label(q.source)), q.requester_role
    from public.approval_tasks t join public.hire_requests q on q.id = t.request_id and t.request_kind = 'hire'
    join public.departments jt on jt.id = q.job_title_id left join public.departments dp on dp.id = q.department_id left join public.hr_shifts sh on sh.id = q.shift_id
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending'
    union all
    select t.*, a.requested_by, coalesce(a.requested_by_name, app.manager_display_name(a.requested_by)), 'سلفة', null, null, null, null, null, null, a.notes, null, a.created_at, null, a.ref_no,
      jsonb_build_object('employee_name', a.employee_name, 'employee_number', a.employee_number, 'type_name', a.type_name, 'amount', a.amount, 'requested_amount', a.requested_amount,
        'method', a.repayment_method, 'method_label', app.advance_method_label(a.repayment_method), 'installments', a.installments, 'monthly_amount', a.monthly_amount, 'percent', a.percent,
        'estimated_installment', app.advance_installment_amount(a, app.advance_monthly_salary(a.employee_id))), 'ops_room'
    from public.approval_tasks t join public.advances a on a.id = t.request_id and t.request_kind = 'advance'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and a.status = 'pending'
    union all
    select t.*, p.purge_requested_by, app.user_display_name(p.purge_requested_by), 'حذف أرشيف بارد', p.period_from, p.period_to, null, null, null, null, p.note, null, p.purge_requested_at, null, p.code,
      jsonb_build_object('code', p.code, 'period_from', p.period_from, 'period_to', p.period_to, 'file_count', p.file_count, 'total_bytes', p.total_bytes, 'verified_copies', p.verified_copies, 'required_copies', p.required_copies,
        'purge_available_at', p.purge_available_at, 'copies', (select string_agg(c.disk_label, '، ') from public.cold_archive_copies c where c.package_id = p.id),
        'by_source', coalesce((select jsonb_agg(jsonb_build_object('source_key', i.source_key, 'files', i.n) order by i.n desc) from (select source_key, count(*) n from public.cold_archive_items where package_id = p.id group by source_key) i), '[]'::jsonb)), 'it_admin'
    from public.approval_tasks t join public.cold_archive_packages p on p.id = t.request_id and t.request_kind = 'cold_archive_purge'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and p.status = 'verified' and p.purge_chain_id is not null and p.purge_approved_at is null
    union all
    select t.*, r.approval_requested_by, app.user_display_name(r.approval_requested_by), 'تقرير شكاوى', r.report_date, r.report_date, null, null, null, null, null, r.pptx_path, r.approval_requested_at, null, null,
      jsonb_build_object('title', r.title, 'sector', r.sector, 'sector_label', case r.sector when 'karrada' then 'الكرادة' else 'الزعفرانية' end, 'report_date', r.report_date, 'scope', r.report_scope,
        'items', (select count(*) from public.complaint_report_items i where i.report_id = r.id and i.included), 'recipients', r.recipients, 'pptx_path', r.pptx_path, 'review_confirmed_at', r.review_confirmed_at), 'complaints_officer'
    from public.approval_tasks t join public.complaint_reports r on r.id = t.request_id and t.request_kind = 'complaint_report'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and r.status = 'quality_review' and r.approval_chain_id is not null
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
  elsif p_kind = 'hire' then select r.requester_user_id into requester from public.hire_requests r where r.id = p_request;
  elsif p_kind = 'advance' then select a.requested_by into requester from public.advances a where a.id = p_request;
  elsif p_kind = 'cold_archive_purge' then select p.purge_requested_by into requester from public.cold_archive_packages p where p.id = p_request;
  elsif p_kind = 'complaint_report' then select coalesce(r.approval_requested_by, r.created_by) into requester from public.complaint_reports r where r.id = p_request;
  else select e.user_id into requester from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id where l1.id = p_request; end if;
  if requester is null and not found then raise exception 'HR_NOT_FOUND'; end if;
  if not (auth.uid() = requester or app.has_role(array['it_admin','hr_officer','super_admin','ops_room'])
          or (p_kind = 'advance' and app.has_role(array['finance_officer']))
          or (p_kind = 'complaint_report' and app.has_role(array['complaints_officer']))
          or exists (select 1 from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request and auth.uid() = any(t.approvers))) then
    raise exception 'HR_FORBIDDEN';
  end if;
  return query
  select t.step_no, t.step_label, t.status,
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', a, 'name', app.manager_display_name(a))), '[]'::jsonb) from unnest(t.approvers) a),
    app.manager_display_name(t.decided_by), t.decided_at, t.note
  from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request order by t.step_no;
end$$;

-- ⑪ الصلاحيات
revoke all on function public.hire_request_create(jsonb), public.hire_request_decide(uuid, boolean, text), public.hire_request_cancel(uuid), public.hire_requests_mine() from public, anon;
grant execute on function public.hire_request_create(jsonb), public.hire_request_decide(uuid, boolean, text), public.hire_request_cancel(uuid), public.hire_requests_mine() to authenticated;
create trigger trg_hire_requests_updated_at before update on public.hire_requests for each row execute function app.set_updated_at();
