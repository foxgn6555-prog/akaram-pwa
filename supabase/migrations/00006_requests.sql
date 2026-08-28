-- ═══════════════════════════════════════════════════════════════
-- 00006 · طلبات الموظفين + Workflow Trigger + RLS
--  · payload jsonb: مرونة حسب نوع الطلب — التحقق الصارم عبر Zod في الواجهة
--  · version + trigger: أساس سياسة تعارض Offline (ADR 006)
-- ═══════════════════════════════════════════════════════════════

create table public.requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees (id) on delete cascade,
  type             text not null default 'leave'
                   check (type in ('leave', 'expense_advance', 'document_request', 'correction', 'other')),
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled')),
  payload          jsonb not null default '{}',
  approver_id      uuid references public.employees (id) on delete set null,
  decided_at       timestamptz,
  rejection_reason text,
  version          integer not null default 1,     -- Optimistic Concurrency (ADR 006)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.requests.payload is 'تفاصيل الطلب بحسب النوع — العقد المفروض في src/features/requests/schemas';

alter table public.requests enable row level security;

-- ── SELECT ──
create policy "requests: قراءة طلباتي" on public.requests
  for select to authenticated
  using (employee_id = (select app.current_employee_id()));

create policy "requests: مدير يرى طلبات قسمه" on public.requests
  for select to authenticated
  using ((app.has_role(array['department_manager']))
        and exists (
          select 1 from public.employees e
          where e.id = requests.employee_id
            and e.department_id = (select app.current_department_id())
        ));

create policy "requests: قراءة للإدارات" on public.requests
  for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'super_admin']));

-- ── INSERT: الموظف ينشئ طلباته هو فقط ──
create policy "requests: إنشاء طلبي" on public.requests
  for insert to authenticated
  with check (employee_id = (select app.current_employee_id()));

-- ── UPDATE ──
-- الموظف يعدّل طلبه وهو pending فقط (تعديل الموطن — ليس الحالة)
create policy "requests: تعديل طلبي المعلق" on public.requests
  for update to authenticated
  using      (employee_id = (select app.current_employee_id()) and status = 'pending')
  with check (employee_id = (select app.current_employee_id()) and status = 'pending');

-- HR / Super Admin: تعديل كامل
create policy "requests: تعديل بواسطة HR" on public.requests
  for update to authenticated
  using      (app.has_role(array['hr_officer', 'super_admin']))
  with check (app.has_role(array['hr_officer', 'super_admin']));

-- المدير: قرار الاعتماد فقط (status/approver/decided_at) — يفرضه workflow trigger
create policy "requests: اعتماد بواسطة المدير" on public.requests
  for update to authenticated
  using ((app.has_role(array['department_manager']))
        and exists (
          select 1 from public.employees e
          where e.id = requests.employee_id
            and e.department_id = (select app.current_department_id())
        ));

-- ── DELETE ──
create policy "requests: حذف بواسطة Super Admin" on public.requests
  for delete to authenticated
  using (app.has_role(array['super_admin']));

-- ── فهارس ──
create index idx_requests_employee    on public.requests (employee_id);
create index idx_requests_status      on public.requests (status);
create index idx_requests_type        on public.requests (type);
create index idx_requests_created     on public.requests (created_at desc);
create index idx_requests_approver    on public.requests (approver_id) where approver_id is not null;

-- ═══════════════════════════════════════════════════════════════
-- Workflow Trigger: فرض انتقالات الحالة المشروعة (State Machine)
-- employee → pending → approved/rejected → in_progress → completed
-- الإلغاء مسموح من الموظف وهو pending.
-- ═══════════════════════════════════════════════════════════════
create or replace function app.validate_request_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;   -- لا تغيير حالة — تعديل بيانات عادي
  end if;

  if (old.status, new.status) in (
       ('pending',    'approved'),
       ('pending',    'rejected'),
       ('pending',    'cancelled'),
       ('approved',   'in_progress'),
       ('in_progress','completed'),
       ('approved',   'cancelled')
     ) then
    -- من يجوز له اتخاذ القرار؟
    if new.status in ('approved', 'rejected') then
      if not app.has_role(array['hr_officer', 'department_manager', 'super_admin']) then
        raise exception 'REQUEST_FORBIDDEN: الاعتماد متاح لمدير القسم أو HR فقط';
      end if;
      new.approver_id = app.current_employee_id();
      new.decided_at  = now();
    elsif not app.has_role(array['hr_officer', 'super_admin'])
          and not (old.status = 'pending' and employee_id = app.current_employee_id()) then
      raise exception 'REQUEST_FORBIDDEN: الإلغاء متاح للمالك وهو pending أو لـ HR';
    end if;
    return new;
  end if;

  raise exception 'REQUEST_INVALID_TRANSITION: انتقال غير مشروع من % إلى %', old.status, new.status;
end;
$$;

create trigger trg_requests_workflow
  before update of status on public.requests
  for each row execute function app.validate_request_transition();

create trigger trg_requests_updated_at
  before update on public.requests
  for each row execute function app.set_updated_at();

create trigger trg_requests_version
  before update on public.requests
  for each row execute function app.bump_version();
