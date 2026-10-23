-- 00339: اعتماد تقارير الشكاوى عبر محرك الموافقات (نوع طلب جديد complaint_report).
-- الافتراضي بلا تغيير: لا سلسلة لدور موظف الشكاوى ⇒ «اعتماد التقرير» يعتمده فوراً كما اليوم.
-- مع سلسلة: تأكيد المراجعة + «اعتماد التقرير» يفتح السلسلة؛ الموافقة الأخيرة فيها تعتمد التقرير (approved)؛ الرفض يعيده للمراجعة مع السبب.
-- أي ملف PowerPoint جديد أثناء السلسلة يُلغيها (كما يُلغي إقرار المراجعة). الموافقون يستطيعون تنزيل ملف العرض أثناء مهمتهم فقط.

alter table public.approval_chains drop constraint if exists approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check check (request_type in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report'));
alter table public.approval_tasks drop constraint if exists approval_tasks_request_kind_check;
alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (request_kind in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report'));
create or replace function app.approval_kind_label(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'leave' then 'إجازة' when 'time_permit' then 'زمنية' when 'advance' then 'سلفة' when 'termination' then 'إنهاء خدمة'
                     when 'supplies' then 'مستلزمات' when 'disclosure' then 'إفصاح' when 'cold_archive_purge' then 'حذف أرشيف بارد' when 'complaint_report' then 'تقرير شكاوى' else coalesce(p_kind, '—') end
$$;

create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true, p_subtype text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb; st text := nullif(trim(coalesce(p_subtype, '')), '');
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if coalesce(p_requester_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
  if not (p_requester_role = any(app.approval_requester_roles())) then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  if p_request_type = 'cold_archive_purge' and p_requester_role not in ('it_admin','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  if p_request_type = 'complaint_report' and p_requester_role not in ('complaints_officer','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;   -- الطالب موظف الشكاوى
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

-- ① أعمدة السلسلة على التقرير
alter table public.complaint_reports
  add column if not exists approval_chain_id uuid references public.approval_chains(id) on delete set null,
  add column if not exists approval_requested_by uuid references auth.users(id),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_rejected_note text;

-- الحارس: الأعمدة الجديدة لا تُكتب إلا عبر دوال الاعتماد (security definer) — الحارس يسمح لها لأنها تعمل بمالك الجدول
create or replace function app.complaint_report_guard()
returns trigger language plpgsql set search_path=public,app as $$
begin
  if auth.role()='service_role' or current_user not in ('authenticated','anon') then return new; end if;
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  if new.status is distinct from old.status and not (old.status='quality_review' and new.status='approved'
    and new.approved_by=auth.uid() and new.approved_at is not null
    and new.review_confirmed_at is not null and new.reviewed_pptx_path=old.pptx_path) then
    raise exception 'COMPLAINT_REPORT_TRANSITION_INVALID';
  end if;
  if new.status is not distinct from old.status and (new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.review_confirmed_at is distinct from old.review_confirmed_at
    or new.reviewed_pptx_path is distinct from old.reviewed_pptx_path
    or new.approval_chain_id is distinct from old.approval_chain_id
    or new.approval_requested_by is distinct from old.approval_requested_by
    or new.approval_requested_at is distinct from old.approval_requested_at)
    then raise exception 'COMPLAINT_REPORT_APPROVAL_IMMUTABLE'; end if;
  if new.report_date is distinct from old.report_date or new.sector is distinct from old.sector
    or new.created_by is distinct from old.created_by or new.delivery_id is distinct from old.delivery_id
    or new.pptx_path is distinct from old.pptx_path or new.sent_at is distinct from old.sent_at
    or new.archived_at is distinct from old.archived_at then raise exception 'COMPLAINT_REPORT_IMMUTABLE_FIELDS'; end if;
  return new;
end $$;

-- ملف جديد أو عودة للمسودة ⇒ تُلغى السلسلة المفتوحة أيضاً
create or replace function app.complaint_report_clear_stale_review()
returns trigger language plpgsql security definer set search_path=public,app as $$
begin
  if new.pptx_path is distinct from old.pptx_path or
     (new.status in ('draft','quality_review') and old.status is distinct from new.status) then
    new.review_confirmed_at:=null;
    new.reviewed_pptx_path:=null;
    if old.approval_chain_id is not null then
      update public.approval_tasks set status='skipped', note='أُلغيت: تغيّر ملف العرض أو حالة التقرير قبل اكتمال الموافقات'
       where request_kind='complaint_report' and request_id=old.id and status in ('waiting','pending');
      new.approval_chain_id:=null; new.approval_requested_by:=null; new.approval_requested_at:=null;
    end if;
  end if;
  return new;
end $$;

-- ② الاعتماد: بلا سلسلة كما اليوم؛ مع سلسلة يفتحها
create or replace function public.complaint_approve_report(p_report_id uuid, p_reviewed_pptx_path text, p_review_confirmed boolean)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_report public.complaint_reports%rowtype; cid uuid;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  if p_review_confirmed is distinct from true then raise exception 'COMPLAINT_REPORT_REVIEW_CONFIRMATION_REQUIRED'; end if;
  select * into v_report from public.complaint_reports where id=p_report_id for update;
  if not found or v_report.status<>'quality_review' or v_report.pptx_path is null then raise exception 'COMPLAINT_REPORT_NOT_REVIEWABLE'; end if;
  if nullif(trim(p_reviewed_pptx_path),'') is null or p_reviewed_pptx_path<>v_report.pptx_path then raise exception 'COMPLAINT_REPORT_REVIEWED_FILE_MISMATCH'; end if;
  if v_report.approval_chain_id is not null then raise exception 'COMPLAINT_REPORT_CHAIN_ACTIVE'; end if;

  if (app.approval_chain_for(auth.uid(), 'complaint_report')).id is not null then
    delete from public.approval_tasks where request_kind='complaint_report' and request_id=p_report_id;   -- بقايا سلسلة سابقة (مرفوضة/ملغاة)
    cid := app.approval_open('complaint_report', p_report_id, auth.uid());
    if cid is not null then
      update public.complaint_reports
         set review_confirmed_at=now(), reviewed_pptx_path=p_reviewed_pptx_path,
             approval_chain_id=cid, approval_requested_by=auth.uid(), approval_requested_at=now(), approval_rejected_note=null
       where id=p_report_id;
      insert into public.audit_logs(table_name,record_id,operation,old_row,new_row,changed_fields,actor_id,actor_role)
      values('complaint_reports',p_report_id::text,'UPDATE', jsonb_build_object('status',v_report.status),
        jsonb_build_object('status','quality_review','approvalChainId',cid,'reviewConfirmed',true), jsonb_build_object('approvalChainId',cid), auth.uid(),'complaints_officer');
      return;
    end if;
  end if;

  update public.complaint_reports
    set status='approved',approved_by=auth.uid(),approved_at=now(), review_confirmed_at=now(),reviewed_pptx_path=p_reviewed_pptx_path
    where id=p_report_id;
  insert into public.audit_logs(table_name,record_id,operation,old_row,new_row,changed_fields,actor_id,actor_role)
  values('complaint_reports',p_report_id::text,'UPDATE',
    jsonb_build_object('status',v_report.status,'pptxPath',v_report.pptx_path),
    jsonb_build_object('status','approved','reviewConfirmed',true,'reviewedPptxPath',p_reviewed_pptx_path),
    jsonb_build_object('status','approved','reviewConfirmed',true,'reviewedPptxPath',p_reviewed_pptx_path),
    auth.uid(),'complaints_officer');
end $$;

-- ③ قرار السلسلة
create or replace function public.complaint_report_decide(p_report_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path=public,app as $$
declare r public.complaint_reports%rowtype; final boolean;
begin
  select * into r from public.complaint_reports where id=p_report_id for update;
  if not found then raise exception 'COMPLAINT_REPORT_NOT_FOUND'; end if;
  if r.approval_chain_id is null or r.status<>'quality_review' then raise exception 'COMPLAINT_REPORT_NOT_REVIEWABLE'; end if;
  if r.reviewed_pptx_path is distinct from r.pptx_path then raise exception 'COMPLAINT_REPORT_REVIEWED_FILE_MISMATCH'; end if;
  if not p_approve and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'HR_REASON_REQUIRED'; end if;
  final := app.approval_decide('complaint_report', p_report_id, p_approve, p_note);
  if not final then return; end if;
  if p_approve then
    update public.complaint_reports set status='approved', approved_by=auth.uid(), approved_at=now() where id=p_report_id;
    insert into public.audit_logs(table_name,record_id,operation,old_row,new_row,changed_fields,actor_id,actor_role)
    values('complaint_reports',p_report_id::text,'UPDATE', jsonb_build_object('status','quality_review'),
      jsonb_build_object('status','approved','viaChain',true,'note',p_note), jsonb_build_object('status','approved'), auth.uid(), 'approver');
    perform app.hr_notify(r.approval_requested_by, 'اعتُمد تقرير الشكاوى: ' || r.title, 'اكتملت سلسلة الموافقات — يمكنك إرسال التقرير إلى الجهة المرسلة.', '/complaints/templates/reports/' || r.id::text, 'cr-ok:' || r.id::text || ':' || extract(epoch from now())::bigint::text, 'success');
  else
    update public.complaint_reports set approval_chain_id=null, approval_requested_by=null, approval_requested_at=null, approval_rejected_note=trim(p_note),
           review_confirmed_at=null, reviewed_pptx_path=null where id=p_report_id;
    insert into public.audit_logs(table_name,record_id,operation,old_row,new_row,changed_fields,actor_id,actor_role)
    values('complaint_reports',p_report_id::text,'UPDATE', jsonb_build_object('status','quality_review','approvalChainId',r.approval_chain_id),
      jsonb_build_object('status','quality_review','rejected',true,'note',p_note), jsonb_build_object('approvalRejectedNote',p_note), auth.uid(), 'approver');
    perform app.hr_notify(r.approval_requested_by, 'أُعيد تقرير الشكاوى للمراجعة: ' || r.title, 'السبب: ' || trim(p_note), '/complaints/templates/reports/' || r.id::text, 'cr-rej:' || r.id::text || ':' || extract(epoch from now())::bigint::text, 'warning');
  end if;
end $$;
grant execute on function public.complaint_report_decide(uuid, boolean, text) to authenticated;

-- ④ التوجيه الموحّد
create or replace function public.approval_decide_request(p_kind text, p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_kind = 'supplies' then perform public.supply_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'termination' then perform public.termination_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'disclosure' then perform public.disclosure_decide(p_request, p_approve, p_note, null);
  elsif p_kind = 'advance' then perform public.advance_decide(p_request, p_approve, p_note, null, null);
  elsif p_kind = 'cold_archive_purge' then perform public.cold_archive_purge_decide(p_request, p_approve, p_note);
  elsif p_kind = 'complaint_report' then perform public.complaint_report_decide(p_request, p_approve, p_note);
  elsif p_kind in ('leave','time_permit') then perform public.hr_leave_decide(p_request, p_approve, p_note);
  else raise exception 'APPROVAL_TYPE_INVALID'; end if;
end$$;

-- ⑤ إشعار الخطوة
create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text; link text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if t.id is null then return; end if;
  if p_kind = 'complaint_report' then
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

-- ⑥ مهامي
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

-- ⑦ المسار الزمني
create or replace function public.approval_timeline(p_kind text, p_request uuid)
returns table(step_no int, step_label text, status text, approvers jsonb, decided_by_name text, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = public, app as $$
declare requester uuid;
begin
  if p_kind = 'supplies' then select r.manager_id into requester from public.sector_supply_requests r where r.id = p_request;
  elsif p_kind = 'termination' then select r.requester_user_id into requester from public.termination_requests r where r.id = p_request;
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

-- ⑧ الموافق يقرأ ملف العرض أثناء مهمته (سياسة تخزين للقراءة فقط)
create or replace function app.complaint_report_pptx_readable(p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.complaint_reports r join public.approval_tasks t on t.request_kind = 'complaint_report' and t.request_id = r.id
    where r.pptx_path = p_name and t.status = 'pending' and auth.uid() = any(t.approvers))
$$;
drop policy if exists "complaint-media: approver reads report pptx" on storage.objects;
create policy "complaint-media: approver reads report pptx" on storage.objects for select to authenticated
  using (bucket_id = 'complaint-media' and app.complaint_report_pptx_readable(name));
