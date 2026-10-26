-- 00348 (الجولة B) · الموارد البشرية تُكمل طلبات التعيين المعتمدة
-- القاعدة: الطلب المعتمد (status = approved) لا يُصبح موظفاً إلا عندما تكتب الموارد البشرية الرقم الوظيفي يدوياً (فحص التكرار HR_NUMBER_TAKEN)
-- وتُكمل البيانات وتحفظ. الإنشاء يمرّ عبر public.hr_employee_create نفسها (ملف راتب «بانتظار المالية» + إشعار المالية + البصمة عبر المحفّز
-- trg_employee_biometric_autopush) — لا مسار إنشاء ثانٍ. ثم يُبلَّغ الطالب. غير المعتمد (معلّق/مرفوض/ملغى) لا يُكمَل إطلاقاً.

-- ① قائمة الموارد البشرية: المعتمدون بانتظار الإكمال + المكتملون مؤخراً (للمتابعة)
create or replace function public.hire_requests_for_hr(p_status text default 'approved')
returns table(id uuid, full_name text, phone text, job_title_id uuid, job_title text, department_id uuid, department text, hire_date date, contract_type text, shift_id uuid, shift_name text,
              source text, source_label text, requester_name text, note text, status text, created_at timestamptz, decided_at timestamptz, completed_at timestamptz, employee_id uuid, employee_number text, days_waiting int)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_status not in ('approved','completed','pending','rejected','all') then raise exception 'HR_STATUS_INVALID'; end if;
  return query
  select q.id, q.full_name, q.phone, q.job_title_id, t.name, q.department_id, d.name, q.hire_date, q.contract_type, q.shift_id, s.name,
    q.source, app.hire_source_label(q.source), coalesce(app.manager_display_name(q.requester_user_id), ''), q.note, q.status, q.created_at, q.decided_at, q.completed_at, q.employee_id, e.employee_number,
    case when q.status = 'approved' then greatest(0, (current_date - q.decided_at::date))::int else 0 end
  from public.hire_requests q
  join public.departments t on t.id = q.job_title_id
  left join public.departments d on d.id = q.department_id
  left join public.hr_shifts s on s.id = q.shift_id
  left join public.employees e on e.id = q.employee_id
  where (p_status = 'all' or q.status = p_status)
  order by case q.status when 'approved' then 0 when 'pending' then 1 else 2 end, coalesce(q.decided_at, q.created_at) asc;
end$$;

-- ② فحص الرقم الوظيفي قبل الحفظ (للنموذج) — الرقم يدوي 100%
create or replace function public.hr_employee_number_available(p_number text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.has_role(array['hr_officer','super_admin']) and nullif(trim(coalesce(p_number, '')), '') is not null
     and not exists (select 1 from public.employees where employee_number = trim(p_number))
$$;

-- ③ الإكمال: الموظف يُنشأ هنا فقط
create or replace function public.hire_request_complete(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare r public.hire_requests; v_emp uuid; merged jsonb; v_no text; t_name text;
begin
  if not app.has_role(array['hr_officer','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into r from public.hire_requests where id = p_id for update;
  if r.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if r.status = 'completed' then raise exception 'HIRE_ALREADY_COMPLETED'; end if;
  if r.status <> 'approved' then raise exception 'HIRE_NOT_APPROVED'; end if;
  v_no := trim(coalesce(p ->> 'employee_number', ''));
  if v_no = '' then raise exception 'HR_NUMBER_REQUIRED'; end if;
  if exists (select 1 from public.employees where employee_number = v_no) then raise exception 'HR_NUMBER_TAKEN'; end if;
  -- بيانات الطلب أساساً، وما تكتبه الموارد البشرية يغلبها (الاسم/المسمى/المباشرة/العقد/الشفت/الهاتف قابلة للتصحيح من HR)
  merged := jsonb_strip_nulls(jsonb_build_object('full_name', r.full_name, 'phone', r.phone, 'job_title_id', r.job_title_id, 'department_id', r.department_id,
                              'hire_date', r.hire_date, 'contract_type', r.contract_type, 'shift_id', r.shift_id))
            || (p - 'job_title');
  merged := merged || jsonb_build_object('employee_number', v_no);
  v_emp := public.hr_employee_create(merged);
  update public.hire_requests set status = 'completed', employee_id = v_emp, completed_at = now(), completed_by = auth.uid(), updated_at = now() where id = p_id;
  select d.name into t_name from public.departments d where d.id = coalesce(nullif(merged ->> 'job_title_id', '')::uuid, r.job_title_id);
  -- الطالب: الموظف نزل للنظام
  perform app.hr_notify(r.requester_user_id, 'نزل الموظف ' || (merged ->> 'full_name') || ' للنظام برقم ' || v_no, coalesce(t_name, '') || ' · مباشرة ' || (merged ->> 'hire_date') || ' — أكملت الموارد البشرية الملف؛ الراتب بانتظار المالية', app.procedures_link_for(r.requester_user_id), 'hire_done:' || r.id::text, 'success');
  return v_emp;
end$$;

revoke all on function public.hire_requests_for_hr(text), public.hr_employee_number_available(text), public.hire_request_complete(uuid, jsonb) from public, anon;
grant execute on function public.hire_requests_for_hr(text), public.hr_employee_number_available(text), public.hire_request_complete(uuid, jsonb) to authenticated;
