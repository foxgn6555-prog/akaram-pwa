-- 00170 · الكشوفات: وحدة داخل غرفة العمليات بدل البوابة المستقلة
--   · أنواع كشف تُدار من التطوير المركزية · الكشف على آلية (من قاعدة الآليات) أو موظف (من النظام)
--   · سلسلة موافقات «كشف» عبر سلاسل IT (الافتراضي: المعاون ← المدير المفوض) مع إعادة بسبب وتعديل المبلغ
--   · عند الاعتماد النهائي: مبلغ الكشف ← استقطاع تلقائي في حضورية غرفة العمليات لشهر المخالفة (أو أول شهر مفتوح)
--   · إخفاء وحدات بوابة لحساب محدد (التطوير المركزية) · تحويل حسابات disclosures_officer إلى ops_room

-- ═══════════════ ① أنواع الكشف ═══════════════
create table if not exists public.disclosure_types (
  key               text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label             text not null check (length(trim(label)) between 2 and 80),
  description       text,
  allowed_penalties text[] not null default array['warning','reprimand','termination'],
  default_amount    numeric(14,2) check (default_amount is null or default_amount >= 0),
  is_active         boolean not null default true,
  sort_order        int not null default 100,
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now()
);
alter table public.disclosure_types enable row level security;
drop policy if exists "disclosure_types: read" on public.disclosure_types;
create policy "disclosure_types: read" on public.disclosure_types for select to authenticated using (true);

insert into public.disclosure_types (key, label, description, sort_order) values
  ('delay',            'تأخير',                    'تأخر الآلية/الموظف عن موعد الانطلاق أو الدوام', 10),
  ('absence',          'غياب',                     'غياب بلا عذر مقبول', 20),
  ('collection',       'عدم رفع النفايات',         'ترك نقاط/شوارع دون رفع', 30),
  ('evasion',          'تهرّب من العمل',            'مغادرة موقع العمل أو التلكؤ', 40),
  ('early_withdrawal', 'انسحاب مبكر',               'إنهاء الشفت قبل الوقت المقرر', 50),
  ('load_deficiency',  'نقص حمولة',                 'حمولة دون الحد الأدنى في المحطة التحويلية', 60),
  ('route_deviation',  'انحراف عن المسار',          'خروج الآلية عن مسار/منطقة العمل المحددة', 70),
  ('vehicle_damage',   'إتلاف/إهمال آلية',          'ضرر أو إهمال في صيانة الآلية', 80),
  ('safety',           'مخالفة سلامة',              'قيادة خطرة أو عدم الالتزام بإجراءات السلامة', 90),
  ('misconduct',       'سلوك غير لائق',             'إساءة للمواطنين أو الزملاء', 100),
  ('unauthorized_use', 'استخدام غير مصرّح للآلية',  'استخدام الآلية خارج العمل أو نقل غير مصرّح', 110),
  ('phone_unreachable','عدم الاستجابة للاتصال',     'انقطاع التواصل مع غرفة العمليات أثناء الشفت', 120),
  ('uniform',          'مخالفة الزي/الهوية',        'عدم ارتداء الزي الرسمي أو حمل الهوية', 130),
  ('negligence',       'إهمال وظيفي',               'تقصير عام في أداء الواجب', 140),
  ('other',            'أخرى',                      'نوع لا يندرج ضمن الأنواع أعلاه (يُوضَّح في التفاصيل)', 900)
on conflict (key) do nothing;

alter table public.disclosures drop constraint if exists disclosures_violation_type_check;
alter table public.disclosures drop constraint if exists disclosures_violation_type_fkey;
alter table public.disclosures add constraint disclosures_violation_type_fkey foreign key (violation_type) references public.disclosure_types(key);

create or replace function public.disclosure_types_list() returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'description', description, 'allowed_penalties', allowed_penalties, 'default_amount', default_amount,
    'is_active', is_active, 'sort_order', sort_order, 'updated_at', updated_at, 'updated_by_name', app.manager_display_name(updated_by),
    'used', (select count(*) from public.disclosures d where d.violation_type = t.key)) order by sort_order, label), '[]'::jsonb)
  from public.disclosure_types t $$;

create or replace function public.disclosure_type_save(p_key text, p_label text, p_description text default null, p_allowed_penalties text[] default null, p_default_amount numeric default null, p_is_active boolean default true, p_sort_order int default 100)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare v_key text := lower(trim(coalesce(p_key, ''))); pen text[] := coalesce(p_allowed_penalties, array['warning','reprimand','termination']);
begin
  perform app.require_it();
  if v_key !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'DISCLOSURE_TYPE_KEY_INVALID'; end if;
  if length(trim(coalesce(p_label, ''))) < 2 then raise exception 'DISCLOSURE_TYPE_LABEL_INVALID'; end if;
  if exists (select 1 from unnest(pen) x where x not in ('warning','reprimand','termination')) then raise exception 'DISCLOSURE_PENALTY_INVALID'; end if;
  if p_default_amount is not null and p_default_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  insert into public.disclosure_types (key, label, description, allowed_penalties, default_amount, is_active, sort_order, updated_by, updated_at)
  values (v_key, trim(p_label), nullif(trim(coalesce(p_description, '')), ''), pen, p_default_amount, coalesce(p_is_active, true), coalesce(p_sort_order, 100), auth.uid(), now())
  on conflict (key) do update set label = excluded.label, description = excluded.description, allowed_penalties = excluded.allowed_penalties, default_amount = excluded.default_amount,
    is_active = excluded.is_active, sort_order = excluded.sort_order, updated_by = excluded.updated_by, updated_at = now();
  return public.disclosure_types_list();
end$$;

-- ═══════════════ ② بنية الكشف الجديدة ═══════════════
alter table public.disclosures
  add column if not exists target_kind     text not null default 'vehicle' check (target_kind in ('vehicle','employee')),
  add column if not exists vehicle_id      uuid references public.garage_vehicles(id),
  add column if not exists employee_id     uuid references public.employees(id),
  add column if not exists employee_number text,
  add column if not exists department_name text,
  add column if not exists job_title       text,
  add column if not exists period_month    date,
  add column if not exists amount          numeric(14,2) check (amount is null or amount >= 0),   -- المبلغ الحالي (المعاون يحدده، المدير المفوض قد يعدّله)
  add column if not exists amount_by       uuid references auth.users(id),
  add column if not exists amount_note     text,
  add column if not exists prepared_by     uuid references auth.users(id),
  add column if not exists chain_id        uuid references public.approval_chains(id) on delete set null,
  add column if not exists return_reason   text,
  add column if not exists returned_by     uuid references auth.users(id),
  add column if not exists returned_at     timestamptz,
  add column if not exists resubmit_count  int not null default 0,
  add column if not exists approved_by     uuid references auth.users(id),
  add column if not exists approved_at     timestamptz,
  add column if not exists cancelled_by    uuid references auth.users(id),
  add column if not exists cancelled_at    timestamptz,
  add column if not exists cancel_reason   text,
  add column if not exists deduction_id    uuid,
  add column if not exists deduction_month date,
  add column if not exists deduction_note  text;

alter table public.disclosures drop constraint if exists disclosures_status_check;
update public.disclosures set status = 'pending' where status = 'submitted_to_deputy';
alter table public.disclosures add constraint disclosures_status_check check (status in ('draft','pending','returned','approved','cancelled'));
update public.disclosures set period_month = date_trunc('month', log_date)::date where period_month is null;
update public.disclosures set prepared_by = created_by where prepared_by is null;
create index if not exists idx_disclosures_period on public.disclosures (period_month, status);
create index if not exists idx_disclosures_target on public.disclosures (employee_id, vehicle_id);

-- الاستقطاع المرتبط بكشف: مرة واحدة فقط
alter table public.hr_attendance_deductions add column if not exists source_disclosure_id uuid references public.disclosures(id) on delete set null;
create unique index if not exists uq_hr_ded_disclosure on public.hr_attendance_deductions (source_disclosure_id) where source_disclosure_id is not null;

create table if not exists public.disclosure_events (
  id            bigserial primary key,
  disclosure_id uuid not null references public.disclosures(id) on delete cascade,
  action        text not null,  -- created | updated | submitted | step_approved | returned | approved | cancelled | amount_set | deduction_posted | resubmitted
  actor         uuid references auth.users(id),
  actor_name    text,
  note          text,
  amount        numeric(14,2),
  created_at    timestamptz not null default now()
);
create index if not exists idx_disclosure_events_d on public.disclosure_events (disclosure_id, id);
alter table public.disclosure_events enable row level security;
drop policy if exists "disclosure_events: staff read" on public.disclosure_events;
create policy "disclosure_events: staff read" on public.disclosure_events for select to authenticated
  using (app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']));

-- سياسات الجدول: القراءة لغرفة العمليات والإدارة؛ الكتابة عبر الدوال فقط
drop policy if exists "disclosures: قراءة النشط" on public.disclosures;
drop policy if exists "disclosures: قراءة المؤرشف" on public.disclosures;
drop policy if exists "disclosures: كتابة الوحدة" on public.disclosures;
drop policy if exists "disclosures: تعديل الوحدة" on public.disclosures;
create policy "disclosures: قراءة النشط" on public.disclosures for select to authenticated
  using (app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']));

create or replace function app.disclosure_event(p_id uuid, p_action text, p_note text default null, p_amount numeric default null) returns void
language sql security definer set search_path = public, app as $$
  insert into public.disclosure_events (disclosure_id, action, actor, actor_name, note, amount)
  values (p_id, p_action, auth.uid(), app.manager_display_name(auth.uid()), nullif(trim(coalesce(p_note, '')), ''), p_amount) $$;

create or replace function app.disclosure_ref_no() returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) + 1 into n from public.disclosures where created_at >= date_trunc('year', now());
  return 'ك/' || to_char(now(), 'YYYY') || '/' || lpad(n::text, 4, '0');
end$$;

create or replace function app.disclosure_is_ops() returns boolean language sql stable security definer set search_path = public, app as
$$ select app.has_role(array['ops_room','super_admin']) $$;

-- ═══════════════ ③ البحث عن الآلية/الموظف ═══════════════
create or replace function public.disclosure_vehicle_lookup(p_q text default null, p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'db_number', v.db_number, 'plate_number', v.plate_number, 'vehicle_name', v.vehicle_name, 'driver_name', v.driver_name, 'shift', v.shift,
      'sector', s.name, 'parent_sector', coalesce(v.garage_parent_sector, s.parent_sector), 'driver_employee_id', v.driver_employee_id,
      'driver_employee_name', e.full_name, 'driver_employee_number', e.employee_number) order by v.db_number), '[]'::jsonb)
  from (select * from public.garage_vehicles gv where gv.archived_at is null
          and (nullif(trim(coalesce(p_q, '')), '') is null or gv.db_number ilike '%' || trim(p_q) || '%' or gv.driver_name ilike '%' || trim(p_q) || '%' or gv.plate_number ilike '%' || trim(p_q) || '%')
        order by gv.db_number limit greatest(1, least(coalesce(p_limit, 20), 100))) v
  left join public.sectors s on s.id = v.sector_id
  left join public.employees e on e.id = v.driver_employee_id
  where app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) $$;

create or replace function public.disclosure_employee_lookup(p_q text default null, p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title, 'department_name', d.name) order by e.full_name), '[]'::jsonb)
  from (select * from public.employees x where x.archived_at is null and x.employment_status <> 'terminated'
          and (nullif(trim(coalesce(p_q, '')), '') is null or x.full_name ilike '%' || trim(p_q) || '%' or x.employee_number ilike '%' || trim(p_q) || '%')
        order by x.full_name limit greatest(1, least(coalesce(p_limit, 20), 100))) e
  left join public.departments d on d.id = e.department_id
  where app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) $$;

-- ═══════════════ ④ إنشاء/تعديل كشف (غرفة العمليات) ═══════════════
-- p: {target_kind, vehicle_id, employee_id, db_number, driver_name, vehicle_type, contractor_name, sector, shift, log_date, violation_type, penalty_type, details, amount}
create or replace function public.disclosure_save(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; t public.disclosure_types; v record; e record; v_id uuid; v_kind text := coalesce(p ->> 'target_kind', 'vehicle');
        v_db text; v_driver text; v_sector text; v_shift text; v_vehicle uuid; v_emp uuid; v_empno text; v_dept text; v_job text; v_amount numeric;
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if v_kind not in ('vehicle','employee') then raise exception 'DISCLOSURE_TARGET_INVALID'; end if;
  select * into t from public.disclosure_types where key = p ->> 'violation_type';
  if t.key is null or not t.is_active then raise exception 'DISCLOSURE_TYPE_INVALID'; end if;
  if (p ->> 'penalty_type') is not null and not ((p ->> 'penalty_type') = any(t.allowed_penalties)) then raise exception 'DISCLOSURE_PENALTY_NOT_ALLOWED'; end if;
  if length(trim(coalesce(p ->> 'details', ''))) < 5 then raise exception 'DISCLOSURE_DETAILS_REQUIRED'; end if;
  if (p ->> 'log_date') is null or (p ->> 'log_date')::date > current_date then raise exception 'DISCLOSURE_DATE_INVALID'; end if;
  v_amount := nullif(p ->> 'amount', '')::numeric;
  if v_amount is not null and v_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;

  if v_kind = 'vehicle' then
    v_vehicle := nullif(p ->> 'vehicle_id', '')::uuid;
    if v_vehicle is null then raise exception 'DISCLOSURE_VEHICLE_REQUIRED'; end if;
    select gv.*, s.name as sector_name into v from public.garage_vehicles gv left join public.sectors s on s.id = gv.sector_id where gv.id = v_vehicle and gv.archived_at is null;
    if v.id is null then raise exception 'DISCLOSURE_VEHICLE_NOT_FOUND'; end if;
    v_db := v.db_number; v_driver := coalesce(nullif(trim(coalesce(p ->> 'driver_name', '')), ''), v.driver_name); v_sector := coalesce(nullif(p ->> 'sector', ''), v.sector_name); v_shift := coalesce(nullif(p ->> 'shift', ''), v.shift);
    v_emp := v.driver_employee_id;
  else
    v_emp := nullif(p ->> 'employee_id', '')::uuid;
    if v_emp is null then raise exception 'DISCLOSURE_EMPLOYEE_REQUIRED'; end if;
    v_db := coalesce(nullif(p ->> 'db_number', ''), '—'); v_sector := nullif(p ->> 'sector', ''); v_shift := coalesce(nullif(p ->> 'shift', ''), 'morning');
  end if;
  if v_emp is not null then
    select x.full_name, x.employee_number, x.job_title, dp.name as dept into e from public.employees x left join public.departments dp on dp.id = x.department_id where x.id = v_emp and x.archived_at is null;
    if e.full_name is null then raise exception 'DISCLOSURE_EMPLOYEE_NOT_FOUND'; end if;
    v_empno := e.employee_number; v_dept := e.dept; v_job := e.job_title;
    if v_kind = 'employee' then v_driver := e.full_name; end if;
  end if;
  if v_shift not in ('morning','evening','night') then v_shift := 'morning'; end if;

  if p_id is null then
    insert into public.disclosures (ref_no, target_kind, vehicle_id, employee_id, employee_number, department_name, job_title, db_number, driver_name, vehicle_type, contractor_name, sector, shift, log_date, period_month,
      violation_type, penalty_type, details, amount, status, prepared_by, prepared_by_name, created_by)
    values (app.disclosure_ref_no(), v_kind, v_vehicle, v_emp, v_empno, v_dept, v_job, v_db, v_driver, nullif(p ->> 'vehicle_type', ''), nullif(p ->> 'contractor_name', ''), v_sector, v_shift, (p ->> 'log_date')::date, date_trunc('month', (p ->> 'log_date')::date)::date,
      t.key, nullif(p ->> 'penalty_type', ''), trim(p ->> 'details'), v_amount, 'draft', auth.uid(), app.manager_display_name(auth.uid()), auth.uid()) returning id into v_id;
    perform app.disclosure_event(v_id, 'created', null, v_amount);
  else
    select * into d from public.disclosures where id = p_id;
    if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
    if d.status not in ('draft','returned') then raise exception 'DISCLOSURE_NOT_EDITABLE'; end if;
    update public.disclosures set target_kind = v_kind, vehicle_id = v_vehicle, employee_id = v_emp, employee_number = v_empno, department_name = v_dept, job_title = v_job, db_number = v_db, driver_name = v_driver,
      vehicle_type = nullif(p ->> 'vehicle_type', ''), contractor_name = nullif(p ->> 'contractor_name', ''), sector = v_sector, shift = v_shift, log_date = (p ->> 'log_date')::date, period_month = date_trunc('month', (p ->> 'log_date')::date)::date,
      violation_type = t.key, penalty_type = nullif(p ->> 'penalty_type', ''), details = trim(p ->> 'details'), amount = v_amount
    where id = p_id;
    v_id := p_id;
    perform app.disclosure_event(v_id, 'updated', null, v_amount);
  end if;
  return public.disclosure_get(v_id);
end$$;

-- ═══════════════ ⑤ السلسلة: رفع · قرار (موافقة/إعادة بسبب + مبلغ) · إلغاء ═══════════════
alter table public.approval_chains drop constraint if exists approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check check (request_type in ('leave','time_permit','supplies','termination','disclosure'));
alter table public.approval_tasks drop constraint if exists approval_tasks_request_kind_check;
alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (request_kind in ('leave','time_permit','supplies','termination','disclosure'));

create or replace function app.disclosure_target_label(d public.disclosures) returns text language sql immutable as $$
  select case when d.target_kind = 'employee' then d.driver_name || coalesce(' (' || d.employee_number || ')', '') else 'DB ' || d.db_number || ' — ' || d.driver_name end $$;

create or replace function public.disclosure_submit(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; v_chain uuid; who uuid[]; who2 uuid[];
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  if d.status not in ('draft','returned') then raise exception 'DISCLOSURE_NOT_SUBMITTABLE'; end if;
  delete from public.approval_tasks where request_kind = 'disclosure' and request_id = p_id;  -- سلسلة جديدة عند إعادة الرفع
  v_chain := app.approval_open('disclosure', p_id, auth.uid());
  if v_chain is null then
    -- بلا سلسلة مضبوطة: المعاون ثم المدير المفوض (الافتراضي)
    select coalesce(array_agg(distinct ur.user_id), '{}') into who  from public.user_roles ur where ur.role = 'deputy_director' and ur.user_id <> auth.uid();
    select coalesce(array_agg(distinct ur.user_id), '{}') into who2 from public.user_roles ur where ur.role = 'super_admin' and ur.user_id <> auth.uid();
    if cardinality(who) = 0 and cardinality(who2) = 0 then raise exception 'APPROVAL_NO_APPROVER'; end if;
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status, note) values
      ('disclosure', p_id, 1, 'معاون المدير المفوض (افتراضي)', who, case when cardinality(who) = 0 then 'skipped' else 'pending' end, case when cardinality(who) = 0 then 'لا يوجد معاون — تُخطّيت' end),
      ('disclosure', p_id, 2, 'المدير المفوض (افتراضي)', who2, case when cardinality(who2) = 0 then 'skipped' when cardinality(who) = 0 then 'pending' else 'waiting' end, case when cardinality(who2) = 0 then 'لا يوجد مدير مفوض — تُخطّيت' end);
    perform app.approval_notify_step('disclosure', p_id, (select min(step_no) from public.approval_tasks where request_kind = 'disclosure' and request_id = p_id and status = 'pending'));
  end if;
  update public.disclosures set status = 'pending', submitted_at = now(), chain_id = v_chain, return_reason = null, returned_by = null, returned_at = null,
    resubmit_count = case when d.status = 'returned' then resubmit_count + 1 else resubmit_count end where id = p_id;
  perform app.disclosure_event(p_id, case when d.status = 'returned' then 'resubmitted' else 'submitted' end, null, d.amount);
  return public.disclosure_get(p_id);
end$$;

-- قرار الخطوة الحالية: موافقة (مع تحديد/تعديل المبلغ اختيارياً) أو إعادة بسبب (إلزامي)
create or replace function public.disclosure_decide(p_id uuid, p_approve boolean, p_note text default null, p_amount numeric default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; fin boolean; t public.disclosure_types; m date; v_ded uuid; tries int := 0; u uuid; ops uuid[];
begin
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  if d.status <> 'pending' then raise exception 'DISCLOSURE_NOT_PENDING'; end if;
  if not (auth.uid() = any(app.approval_current_approvers('disclosure', p_id)) or app.has_role(array['super_admin'])) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'DISCLOSURE_RETURN_REASON_REQUIRED'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if p_approve and p_amount is not null and p_amount is distinct from d.amount then
    update public.disclosures set amount = p_amount, amount_by = auth.uid(), amount_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
    perform app.disclosure_event(p_id, 'amount_set', p_note, p_amount);
    d.amount := p_amount;
  end if;
  fin := app.approval_decide('disclosure', p_id, p_approve, p_note);
  select coalesce(array_agg(distinct ur.user_id), '{}') into ops from public.user_roles ur where ur.role = 'ops_room';
  if not p_approve then
    update public.disclosures set status = 'returned', return_reason = trim(p_note), returned_by = auth.uid(), returned_at = now() where id = p_id;
    perform app.disclosure_event(p_id, 'returned', p_note, d.amount);
    foreach u in array (ops || coalesce(array[d.prepared_by], '{}')) loop
      perform app.hr_notify(u, 'أُعيد الكشف ' || coalesce(d.ref_no, '') || ' — ' || app.disclosure_target_label(d), trim(p_note) || ' · أعاده ' || coalesce(app.manager_display_name(auth.uid()), ''), '/ops-room/disclosures?tab=returned', 'disclosure_returned:' || p_id::text || ':' || now()::text, 'warning');
    end loop;
    return public.disclosure_get(p_id);
  end if;
  perform app.disclosure_event(p_id, 'step_approved', p_note, d.amount);
  if not fin then return public.disclosure_get(p_id); end if;

  -- ── الاعتماد النهائي ──
  update public.disclosures set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
  perform app.disclosure_event(p_id, 'approved', p_note, d.amount);
  select * into t from public.disclosure_types where key = d.violation_type;
  if coalesce(d.amount, 0) > 0 and d.employee_id is not null then
    -- شهر المخالفة؛ وإن كان مقفلاً من المالية ← أول شهر مفتوح بعده (لا يُخلط بين الأشهر، ويُسجَّل الشهر في الكشف)
    m := d.period_month;
    while app.hr_month_locked(m) and tries < 24 loop m := (m + interval '1 month')::date; tries := tries + 1; end loop;
    if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
    insert into public.hr_attendance_deductions (employee_id, period_month, amount, days, reason, created_by, source_disclosure_id)
    values (d.employee_id, m, d.amount, 0, 'كشف ' || coalesce(d.ref_no, '') || ' — ' || t.label || ' (' || d.log_date::text || ')', auth.uid(), p_id) returning id into v_ded;
    insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
    values (d.employee_id, m, 'deduction_add', jsonb_build_object('id', v_ded, 'amount', d.amount, 'days', 0, 'disclosure', p_id), 'كشف ' || coalesce(d.ref_no, ''), auth.uid());
    update public.disclosures set deduction_id = v_ded, deduction_month = m,
      deduction_note = case when m <> d.period_month then 'شهر المخالفة مقفل من المالية — رُحّل الاستقطاع إلى ' || to_char(m, 'YYYY-MM') end where id = p_id;
    perform app.disclosure_event(p_id, 'deduction_posted', case when m <> d.period_month then 'رُحّل إلى ' || to_char(m, 'YYYY-MM') else to_char(m, 'YYYY-MM') end, d.amount);
  elsif coalesce(d.amount, 0) > 0 then
    update public.disclosures set deduction_note = 'المكشوف عليه غير مرتبط بموظف في النظام — المبلغ مسجَّل على الكشف فقط' where id = p_id;
  end if;
  foreach u in array (ops || coalesce(array[d.prepared_by], '{}')) loop
    perform app.hr_notify(u, 'اعتُمد الكشف ' || coalesce(d.ref_no, '') || ' — ' || app.disclosure_target_label(d),
      case when coalesce(d.amount, 0) > 0 then 'المبلغ ' || to_char(d.amount, 'FM999,999,999') || ' د.ع' || case when v_ded is not null then ' · أُضيف للاستقطاعات (' || to_char(m, 'YYYY-MM') || ')' else '' end else 'بلا مبلغ' end,
      '/ops-room/disclosures?tab=archive', 'disclosure_approved:' || p_id::text, 'success');
  end loop;
  return public.disclosure_get(p_id);
end$$;

create or replace function public.disclosure_cancel(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; u uuid;
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'DISCLOSURE_CANCEL_REASON_REQUIRED'; end if;
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  if d.status not in ('draft','returned','pending') then raise exception 'DISCLOSURE_NOT_CANCELLABLE'; end if;
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الكشف من غرفة العمليات' where request_kind = 'disclosure' and request_id = p_id and status in ('pending','waiting');
  update public.disclosures set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(p_reason) where id = p_id;
  perform app.disclosure_event(p_id, 'cancelled', p_reason, d.amount);
  -- تبليغ المدير المفوض بالكشوفات الملغاة
  for u in select ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
    perform app.hr_notify(u, 'أُلغي الكشف ' || coalesce(d.ref_no, '') || ' — ' || app.disclosure_target_label(d), trim(p_reason) || ' · ألغاه ' || coalesce(app.manager_display_name(auth.uid()), ''), '/admin/disclosures?tab=cancelled', 'disclosure_cancelled:' || p_id::text, 'warning');
  end loop;
  return public.disclosure_get(p_id);
end$$;

-- سلاسل IT: نوع الطلب «كشف» (الطالب الافتراضي: غرفة العمليات)
create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
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

-- توجيه القرار العام + إشعار الخطوة
create or replace function public.approval_decide_request(p_kind text, p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_kind = 'supplies' then perform public.supply_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'termination' then perform public.termination_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'disclosure' then perform public.disclosure_decide(p_request, p_approve, p_note, null);
  elsif p_kind in ('leave','time_permit') then perform public.hr_leave_decide(p_request, p_approve, p_note);
  else raise exception 'APPROVAL_TYPE_INVALID'; end if;
end$$;

create or replace function app.approval_link_for(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then '/admin-ops/requests'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'department_manager') then '/manager/leaves'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'field_ops') then '/field-ops/requests'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'hr_officer') then '/hr/leaves'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'deputy_director') then '/deputy/approvals'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then '/admin/approvals'
    else '/' end $$;

create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text; link text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if t.id is null then return; end if;
  if p_kind = 'disclosure' then
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

-- ═══════════════ ⑥ القراءة: كشف واحد · القائمة · صندوق الوارد · إحصاءات ═══════════════
create or replace function app.disclosure_json(d public.disclosures) returns jsonb language sql stable security definer set search_path = public, app as $$
  select to_jsonb(d) - 'created_by' || jsonb_build_object(
    'type_label', (select label from public.disclosure_types where key = d.violation_type),
    'target_label', app.disclosure_target_label(d),
    'amount_by_name', app.manager_display_name(d.amount_by),
    'returned_by_name', app.manager_display_name(d.returned_by),
    'approved_by_name', app.manager_display_name(d.approved_by),
    'cancelled_by_name', app.manager_display_name(d.cancelled_by),
    'current_step', (select t.step_label from public.approval_tasks t where t.request_kind = 'disclosure' and t.request_id = d.id and t.status = 'pending' order by t.step_no limit 1),
    'current_approvers', (select coalesce(jsonb_agg(app.manager_display_name(a)), '[]'::jsonb) from public.approval_tasks t, unnest(t.approvers) a where t.request_kind = 'disclosure' and t.request_id = d.id and t.status = 'pending'),
    'can_decide', (auth.uid() = any(app.approval_current_approvers('disclosure', d.id))),
    'employee_name', (select full_name from public.employees where id = d.employee_id),
    'deduction_posted', d.deduction_id is not null) $$;

create or replace function public.disclosure_get(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare d public.disclosures;
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  return app.disclosure_json(d) || jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'actor_name', e.actor_name, 'note', e.note, 'amount', e.amount, 'at', e.created_at) order by e.id) from public.disclosure_events e where e.disclosure_id = p_id), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('step_no', t.step_no, 'label', t.step_label, 'status', t.status, 'decided_by', app.manager_display_name(t.decided_by), 'decided_at', t.decided_at, 'note', t.note,
        'approvers', (select coalesce(jsonb_agg(app.manager_display_name(a)), '[]'::jsonb) from unnest(t.approvers) a)) order by t.step_no) from public.approval_tasks t where t.request_kind = 'disclosure' and t.request_id = p_id), '[]'::jsonb));
end$$;

-- القائمة: p_scope = active (مسودة+قيد الموافقة+معادة) | returned | pending | archive (معتمد+ملغى) | approved | cancelled | all
create or replace function public.disclosures_list(p_scope text default 'active', p_from date default null, p_to date default null, p_type text default null, p_q text default null, p_month date default null, p_limit int default 500) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(app.disclosure_json(d) order by d.log_date desc, d.created_at desc) from (
    select * from public.disclosures x
    where x.archived_at is null
      and case coalesce(p_scope, 'active') when 'active' then x.status in ('draft','pending','returned') when 'returned' then x.status = 'returned' when 'pending' then x.status = 'pending'
          when 'archive' then x.status in ('approved','cancelled') when 'approved' then x.status = 'approved' when 'cancelled' then x.status = 'cancelled' when 'draft' then x.status = 'draft' else true end
      and (p_from is null or x.log_date >= p_from) and (p_to is null or x.log_date <= p_to)
      and (p_month is null or x.period_month = date_trunc('month', p_month)::date)
      and (nullif(trim(coalesce(p_type, '')), '') is null or x.violation_type = p_type)
      and (nullif(trim(coalesce(p_q, '')), '') is null or x.ref_no ilike '%' || trim(p_q) || '%' or x.db_number ilike '%' || trim(p_q) || '%' or x.driver_name ilike '%' || trim(p_q) || '%' or x.details ilike '%' || trim(p_q) || '%' or coalesce(x.prepared_by_name, '') ilike '%' || trim(p_q) || '%')
    order by x.log_date desc, x.created_at desc limit greatest(1, least(coalesce(p_limit, 500), 5000))) d), '[]'::jsonb);
end$$;

-- صندوق وارد المُعتمِد الحالي (المعاون/المدير المفوض/أي حساب في السلسلة)
create or replace function public.disclosure_inbox() returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(app.disclosure_json(d) order by d.submitted_at), '[]'::jsonb)
  from public.disclosures d
  where d.status = 'pending' and exists (select 1 from public.approval_tasks t where t.request_kind = 'disclosure' and t.request_id = d.id and t.status = 'pending' and auth.uid() = any(t.approvers)) $$;

-- إحصاءات الشهر (لوحة الوحدة): حسب الحالة والنوع والمبالغ
create or replace function public.disclosure_stats(p_month date default null) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, current_date))::date;
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  return jsonb_build_object(
    'month', to_char(m, 'YYYY-MM'),
    'total', (select count(*) from public.disclosures where period_month = m and archived_at is null),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.disclosures where period_month = m and archived_at is null group by status) s),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'label', t.label, 'count', n) order by n desc), '[]'::jsonb) from (select violation_type, count(*) n from public.disclosures where period_month = m and archived_at is null group by violation_type) x join public.disclosure_types t on t.key = x.violation_type),
    'by_preparer', (select coalesce(jsonb_agg(jsonb_build_object('name', prepared_by_name, 'count', n) order by n desc), '[]'::jsonb) from (select prepared_by_name, count(*) n from public.disclosures where period_month = m and archived_at is null group by prepared_by_name) x),
    'amount_approved', (select coalesce(sum(amount), 0) from public.disclosures where period_month = m and status = 'approved'),
    'amount_pending', (select coalesce(sum(amount), 0) from public.disclosures where period_month = m and status = 'pending'),
    'deductions_posted', (select count(*) from public.disclosures where period_month = m and deduction_id is not null),
    'inbox', (select count(*) from public.disclosures d where d.status = 'pending' and exists (select 1 from public.approval_tasks t where t.request_kind = 'disclosure' and t.request_id = d.id and t.status = 'pending' and auth.uid() = any(t.approvers))),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(pm, 'YYYY-MM'), 'count', n) order by pm desc), '[]'::jsonb) from (select period_month pm, count(*) n from public.disclosures where archived_at is null group by period_month order by pm desc limit 24) y));
end$$;

-- ═══════════════ ⑦ إخفاء وحدات بوابة لحساب محدد (التطوير المركزية) ═══════════════
create table if not exists public.portal_hidden_units (
  user_id      uuid not null references auth.users(id) on delete cascade,
  portal       text not null,
  hidden_paths text[] not null default '{}',
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  primary key (user_id, portal)
);
alter table public.portal_hidden_units enable row level security;
drop policy if exists "hidden_units: own or it" on public.portal_hidden_units;
create policy "hidden_units: own or it" on public.portal_hidden_units for select to authenticated using (user_id = auth.uid() or app.has_role(array['it_admin','super_admin']));

create or replace function public.it_hidden_units_set(p_user uuid, p_portal text, p_paths text[]) returns text[]
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.require_it();
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'IT_USER_NOT_FOUND'; end if;
  if nullif(trim(coalesce(p_portal, '')), '') is null then raise exception 'IT_PORTAL_INVALID'; end if;
  insert into public.portal_hidden_units (user_id, portal, hidden_paths, updated_by, updated_at) values (p_user, p_portal, coalesce(p_paths, '{}'), auth.uid(), now())
  on conflict (user_id, portal) do update set hidden_paths = excluded.hidden_paths, updated_by = excluded.updated_by, updated_at = now();
  return coalesce(p_paths, '{}');
end$$;

create or replace function public.it_hidden_units_get(p_user uuid, p_portal text) returns text[] language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return coalesce((select hidden_paths from public.portal_hidden_units where user_id = p_user and portal = p_portal), '{}');
end$$;

-- للحساب نفسه: {portal: [paths]}
create or replace function public.my_hidden_units() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(portal, to_jsonb(hidden_paths)), '{}'::jsonb) from public.portal_hidden_units where user_id = auth.uid() $$;

-- ═══════════════ ⑧ تحويل حسابات بوابة الكشوفات القديمة إلى غرفة العمليات ═══════════════
insert into public.user_roles (user_id, role)
  select ur.user_id, 'ops_room' from public.user_roles ur where ur.role = 'disclosures_officer'
    and not exists (select 1 from public.user_roles x where x.user_id = ur.user_id and x.role = 'ops_room')
on conflict do nothing;
delete from public.user_roles where role = 'disclosures_officer';

-- ═══════════════ ⑨ الصلاحيات ═══════════════
revoke all on function public.disclosure_type_save(text, text, text, text[], numeric, boolean, int), public.disclosure_save(uuid, jsonb), public.disclosure_submit(uuid), public.disclosure_decide(uuid, boolean, text, numeric),
  public.disclosure_cancel(uuid, text), public.disclosure_get(uuid), public.disclosures_list(text, date, date, text, text, date, int), public.disclosure_inbox(), public.disclosure_stats(date),
  public.disclosure_vehicle_lookup(text, int), public.disclosure_employee_lookup(text, int), public.disclosure_types_list(),
  public.it_hidden_units_set(uuid, text, text[]), public.it_hidden_units_get(uuid, text), public.my_hidden_units() from public, anon;
grant execute on function public.disclosure_type_save(text, text, text, text[], numeric, boolean, int), public.disclosure_save(uuid, jsonb), public.disclosure_submit(uuid), public.disclosure_decide(uuid, boolean, text, numeric),
  public.disclosure_cancel(uuid, text), public.disclosure_get(uuid), public.disclosures_list(text, date, date, text, text, date, int), public.disclosure_inbox(), public.disclosure_stats(date),
  public.disclosure_vehicle_lookup(text, int), public.disclosure_employee_lookup(text, int), public.disclosure_types_list(),
  public.it_hidden_units_set(uuid, text, text[]), public.it_hidden_units_get(uuid, text), public.my_hidden_units() to authenticated;
