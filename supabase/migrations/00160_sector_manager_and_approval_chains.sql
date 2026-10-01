-- 00160 — مسؤول القاطع (الدور admin_ops) + محرك سلاسل الموافقات القابلة للتخصيص
-- ① sector_manager_profiles: القواطع الأم (الكرادة/الزعفرانية — متعددة) تُسند من التطوير المركزية عند إنشاء الحساب
-- ② approval_chains: لكل (دور طالب × نوع طلب) سلسلة خطوات مرتبة، كل خطوة إمّا «حسب التسلسل» (مسؤول قسمه/مسؤول قاطعه/العمليات الميدانية/…)
--    أو «حساب محدد». تُضبط من التطوير المركزية فقط. الإجازات/الزمنيات تمر بالسلسلة إن وُجدت، وإلا تبقى على «المدير المباشر».
-- ③ بوابة مسؤول القاطع: الرئيسية، طلبات فريقي (مهام الموافقة)، التقارير (المتعهدون + مسؤولو الأقسام)، التبليغ (مسؤولو أقسامه فقط)، طلباتي.
-- لا بيانات مالية في أي دالة هنا.

-- ═══════════════ ① ملف مسؤول القاطع ═══════════════
create table if not exists public.sector_manager_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  parent_sectors text[] not null check (cardinality(parent_sectors) >= 1 and parent_sectors <@ array['karrada','zaafaraniya']),
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.sector_manager_profiles enable row level security;
drop policy if exists "sector_manager_profiles: self or it" on public.sector_manager_profiles;
create policy "sector_manager_profiles: self or it" on public.sector_manager_profiles for select to authenticated
  using (user_id = auth.uid() or app.has_role(array['it_admin','super_admin']));

create or replace function app.parent_sector_name(p text) returns text language sql immutable as
$$ select case p when 'karrada' then 'الكرادة' when 'zaafaraniya' then 'الزعفرانية' else coalesce(p, '—') end $$;

create or replace function app.require_it() returns void language plpgsql stable security definer set search_path = public, app as $$
begin if auth.uid() is null or not app.has_role(array['it_admin','super_admin']) then raise exception 'IT_FORBIDDEN'; end if; end$$;

create or replace function app.require_parent_sector_manager() returns public.sector_manager_profiles
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles;
begin
  if auth.uid() is null or not app.has_role(array['admin_ops','super_admin']) then raise exception 'PARENT_SECTOR_MANAGER_FORBIDDEN'; end if;
  select * into p from public.sector_manager_profiles where user_id = auth.uid();
  if not found then raise exception 'SECTOR_MANAGER_NOT_ASSIGNED'; end if;
  return p;
end$$;

-- خيارات القواطع الأم مع من يشغلها حالياً (للتطوير المركزية)
create or replace function public.sector_manager_options()
returns table(parent_sector text, name text, areas int, department_managers int, sector_managers jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return query
  select ps.code, app.parent_sector_name(ps.code),
    (select count(*)::int from public.sectors s where s.parent_sector = ps.code),
    (select count(distinct mp.user_id)::int from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = ps.code),
    coalesce((select jsonb_agg(jsonb_build_object('user_id', smp.user_id, 'name', app.manager_display_name(smp.user_id)) order by smp.created_at)
              from public.sector_manager_profiles smp where ps.code = any(smp.parent_sectors)), '[]'::jsonb)
  from (values ('karrada'), ('zaafaraniya')) ps(code);
end$$;

create or replace function public.sector_manager_profile_save(p_user_id uuid, p_parent_sectors text[], p_notes text default null)
returns public.sector_manager_profiles language plpgsql security definer set search_path = public, app as $$
declare p public.sector_manager_profiles;
begin
  perform app.require_it();
  if not exists (select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role = 'admin_ops') then raise exception 'SECTOR_MANAGER_ROLE_REQUIRED'; end if;
  if p_parent_sectors is null or cardinality(p_parent_sectors) = 0 then raise exception 'SECTOR_MANAGER_SECTORS_REQUIRED'; end if;
  insert into public.sector_manager_profiles (user_id, parent_sectors, notes, created_by)
  values (p_user_id, (select array_agg(distinct x order by x) from unnest(p_parent_sectors) x), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  on conflict (user_id) do update set parent_sectors = excluded.parent_sectors, notes = excluded.notes, updated_at = now()
  returning * into p;
  return p;
end$$;

create or replace function public.sector_manager_profile_for_user(p_user_id uuid)
returns table(user_id uuid, parent_sectors text[], parent_names text[], notes text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not (auth.uid() = p_user_id or app.has_role(array['it_admin','super_admin'])) then raise exception 'IT_FORBIDDEN'; end if;
  return query select smp.user_id, smp.parent_sectors, (select array_agg(app.parent_sector_name(x) order by x) from unnest(smp.parent_sectors) x), smp.notes, smp.updated_at
  from public.sector_manager_profiles smp where smp.user_id = p_user_id;
end$$;

-- مسؤولو القاطع المسؤولون عن قاطع أم معيّن
create or replace function app.sector_managers_for_parent(p_parent text) returns uuid[] language sql stable security definer set search_path = public as
$$ select coalesce(array_agg(user_id), '{}') from public.sector_manager_profiles where p_parent = any(parent_sectors) $$;

-- القواطع الأم التي يتبع لها مستخدم (متعهد → منطقته؛ مسؤول قسم → مناطقه؛ مسؤول قاطع → قواطعه؛ مسؤول كراج → قاطعه)
create or replace function app.user_parent_sectors(p_user uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((
    select array_agg(distinct ps) from (
      select s.parent_sector ps from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.user_id = p_user and cp.is_active
      union all
      select s.parent_sector from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where mp.user_id = p_user
      union all
      select unnest(parent_sectors) from public.sector_manager_profiles where user_id = p_user
      union all
      select parent_sector from public.garage_user_profiles where user_id = p_user
    ) x where ps is not null), '{}') $$;

-- ═══════════════ ② سلاسل الموافقات ═══════════════
create table if not exists public.approval_chains (
  id             uuid primary key default gen_random_uuid(),
  requester_role text not null,
  request_type   text not null check (request_type in ('leave','time_permit')),
  steps          jsonb not null default '[]'::jsonb,   -- [{kind:'hierarchy', role:'department_manager'} | {kind:'account', user_id:'…'}]
  is_active      boolean not null default true,
  updated_by     uuid references auth.users(id),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (requester_role, request_type)
);
alter table public.approval_chains enable row level security;
drop policy if exists "approval_chains: it read" on public.approval_chains;
create policy "approval_chains: it read" on public.approval_chains for select to authenticated using (app.has_role(array['it_admin','super_admin']));

create table if not exists public.approval_tasks (
  id            uuid primary key default gen_random_uuid(),
  request_kind  text not null check (request_kind in ('leave','time_permit')),
  request_id    uuid not null,
  chain_id      uuid references public.approval_chains(id) on delete set null,
  step_no       int  not null,
  step_label    text not null,
  approvers     uuid[] not null default '{}',
  status        text not null default 'waiting' check (status in ('waiting','pending','approved','rejected','skipped')),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  unique (request_kind, request_id, step_no)
);
create index if not exists approval_tasks_pending_idx on public.approval_tasks using gin (approvers) where status = 'pending';
alter table public.approval_tasks enable row level security;
drop policy if exists "approval_tasks: approver or it" on public.approval_tasks;
create policy "approval_tasks: approver or it" on public.approval_tasks for select to authenticated
  using (auth.uid() = any(approvers) or app.has_role(array['it_admin','hr_officer','super_admin']));

alter table public.hr_leaves add column if not exists chain_id uuid references public.approval_chains(id) on delete set null;

create or replace function app.approval_role_label(p_role text) returns text language sql immutable as $$
  select case p_role
    when 'employee' then 'متعهد' when 'department_manager' then 'مسؤول قسم' when 'admin_ops' then 'مسؤول قاطع' when 'field_ops' then 'العمليات الميدانية'
    when 'maintenance' then 'الصيانة' when 'central_garage_officer' then 'الكراج المركزي' when 'transfer_station' then 'المحطة التحويلية'
    when 'ops_room' then 'غرفة العمليات' when 'hr_officer' then 'الموارد البشرية' when 'finance_officer' then 'المالية' when 'it_admin' then 'التطوير المركزية'
    when 'deputy_director' then 'معاون المدير المفوض' when 'executive_director' then 'المدير التنفيذي' when 'super_admin' then 'المدير المفوض'
    when 'media' then 'الإعلام' when 'complaints' then 'الشكاوى' when 'disclosures' then 'الكشوفات' else coalesce(p_role, '—') end $$;

-- الأدوار المسموح بها كخطوة «حسب التسلسل»
create or replace function app.approval_hierarchy_roles() returns text[] language sql immutable as
$$ select array['department_manager','admin_ops','field_ops','deputy_director','executive_director','super_admin','hr_officer'] $$;

create or replace function app.approval_step_label(p_step jsonb) returns text language sql stable security definer set search_path = public, app as $$
  select case p_step ->> 'kind'
    when 'hierarchy' then app.approval_role_label(p_step ->> 'role') || ' (حسب التسلسل)'
    when 'account' then coalesce(app.manager_display_name((p_step ->> 'user_id')::uuid), 'حساب محذوف')
    else '؟' end $$;

create or replace function app.approval_validate_steps(p_steps jsonb) returns void language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb;
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then raise exception 'APPROVAL_STEPS_REQUIRED'; end if;
  for s in select * from jsonb_array_elements(p_steps) loop
    if s ->> 'kind' = 'hierarchy' then
      if not ((s ->> 'role') = any(app.approval_hierarchy_roles())) then raise exception 'APPROVAL_STEP_ROLE_INVALID'; end if;
    elsif s ->> 'kind' = 'account' then
      if (s ->> 'user_id') is null or not exists (select 1 from auth.users u where u.id = (s ->> 'user_id')::uuid) then raise exception 'APPROVAL_STEP_ACCOUNT_INVALID'; end if;
    else raise exception 'APPROVAL_STEP_KIND_INVALID'; end if;
  end loop;
end$$;

create or replace function public.approval_chains_list()
returns table(id uuid, requester_role text, requester_label text, request_type text, steps jsonb, is_active boolean, updated_at timestamptz, updated_by_name text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return query
  select c.id, c.requester_role, app.approval_role_label(c.requester_role), c.request_type,
    (select coalesce(jsonb_agg(s || jsonb_build_object('label', app.approval_step_label(s)) order by o), '[]'::jsonb) from jsonb_array_elements(c.steps) with ordinality t(s, o)),
    c.is_active, c.updated_at, app.manager_display_name(c.updated_by)
  from public.approval_chains c order by c.requester_role, c.request_type;
end$$;

create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
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

create or replace function public.approval_chain_delete(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
begin perform app.require_it(); delete from public.approval_chains where id = p_id; end$$;

-- السلسلة الفعّالة لمستخدم ونوع طلب (أول دور له سلسلة فعّالة بترتيب أولوية ثابت)
create or replace function app.approval_chain_for(p_user uuid, p_type text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select c.* from public.approval_chains c
  join public.user_roles ur on ur.user_id = p_user and ur.role = c.requester_role
  where c.request_type = p_type and c.is_active
  order by array_position(array['employee','department_manager','admin_ops','field_ops','maintenance','central_garage_officer','transfer_station','ops_room','hr_officer','finance_officer','it_admin','media','complaints','disclosures','deputy_director','executive_director','super_admin'], c.requester_role) nulls last
  limit 1 $$;

-- تحويل خطوة إلى حسابات فعلية بحسب الطالب
create or replace function app.approval_resolve_step(p_step jsonb, p_requester uuid) returns uuid[]
language plpgsql stable security definer set search_path = public, app as $$
declare r text := p_step ->> 'role'; out uuid[] := '{}'; parents text[]; emp uuid;
begin
  if p_step ->> 'kind' = 'account' then
    out := array[(p_step ->> 'user_id')::uuid];
  elsif r = 'department_manager' then
    select array_remove(array[cp.manager_user_id], null) into out from public.contractor_profiles cp where cp.user_id = p_requester and cp.is_active;
    if coalesce(cardinality(out), 0) = 0 then
      select e.id into emp from public.employees e where e.user_id = p_requester and e.archived_at is null limit 1;
      if emp is not null then out := array_remove(array[app.hr_manager_user(emp)], null); end if;
    end if;
  elsif r = 'admin_ops' then
    parents := app.user_parent_sectors(p_requester);
    select coalesce(array_agg(distinct smp.user_id), '{}') into out from public.sector_manager_profiles smp where smp.parent_sectors && parents;
  else
    -- field_ops / deputy_director / executive_director / super_admin / hr_officer: كل أصحاب الدور (نطاق العمليات الميدانية يُدقَّق في جولتها)
    select coalesce(array_agg(distinct ur.user_id), '{}') into out from public.user_roles ur where ur.role = r;
  end if;
  return coalesce(array_remove(out, p_requester), '{}');   -- لا يوافق أحد على طلب نفسه
end$$;

create or replace function app.approval_link_for(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then '/admin-ops/requests'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'department_manager') then '/manager/leaves'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'field_ops') then '/field-ops/requests'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'hr_officer') then '/hr/leaves'
    else '/' end $$;

create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  select l1.*, e.full_name, lt.name as type_name into l from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id left join public.hr_leave_types lt on lt.id = l1.leave_type_id where l1.id = p_request;
  title := 'طلب ' || coalesce(l.type_name, 'إجازة') || ' بانتظار موافقتك (خطوة ' || p_step || ')';
  body := l.full_name || ' · ' || l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end
          || case when l.kind = 'time_permit' then ' · ' || to_char(l.start_time, 'HH24:MI') || '–' || to_char(l.end_time, 'HH24:MI') else '' end;
  foreach u in array t.approvers loop
    perform app.hr_notify(u, title, body, app.approval_link_for(u), 'approval:' || t.id::text, 'info');
  end loop;
end$$;

-- فتح السلسلة لطلب: يحوّل الخطوات، يتخطى ما لا يُحلّ إلى أحد، ويُفعّل أول خطوة ويُشعر أصحابها. يعيد chain_id أو null إن لم توجد سلسلة.
create or replace function app.approval_open(p_kind text, p_request uuid, p_requester uuid) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare c public.approval_chains; s jsonb; i int := 0; who uuid[]; first_step int;
begin
  c := app.approval_chain_for(p_requester, p_kind);
  if c.id is null then return null; end if;
  for s in select * from jsonb_array_elements(c.steps) loop
    i := i + 1;
    who := app.approval_resolve_step(s, p_requester);
    insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note)
    values (p_kind, p_request, c.id, i, app.approval_step_label(s), who,
            case when cardinality(who) = 0 then 'skipped' else 'waiting' end,
            case when cardinality(who) = 0 then 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً' end);
  end loop;
  select min(step_no) into first_step from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'waiting';
  if first_step is null then
    delete from public.approval_tasks where request_kind = p_kind and request_id = p_request;
    raise exception 'APPROVAL_NO_APPROVER';
  end if;
  update public.approval_tasks set status = 'pending' where request_kind = p_kind and request_id = p_request and step_no = first_step;
  perform app.approval_notify_step(p_kind, p_request, first_step);
  return c.id;
end$$;

create or replace function app.approval_current_approvers(p_kind text, p_request uuid) returns uuid[] language sql stable security definer set search_path = public as
$$ select coalesce((select approvers from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'pending' order by step_no limit 1), '{}') $$;

-- يسجّل قرار الخطوة الحالية. يعيد true إن كانت هذه الخطوة الأخيرة (أي يجب تنفيذ القرار النهائي)
create or replace function app.approval_decide(p_kind text, p_request uuid, p_approve boolean, p_note text) returns boolean
language plpgsql security definer set search_path = public, app as $$
declare cur record; nxt int;
begin
  select * into cur from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'pending' order by step_no limit 1;
  if not found then raise exception 'APPROVAL_NO_PENDING_STEP'; end if;
  if not (auth.uid() = any(cur.approvers) or app.has_role(array['super_admin'])) then raise exception 'HR_FORBIDDEN'; end if;
  update public.approval_tasks set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), note = nullif(trim(coalesce(p_note, '')), '')
  where id = cur.id;
  if not p_approve then
    update public.approval_tasks set status = 'skipped', note = 'أُلغيت بسبب الرفض في خطوة سابقة' where request_kind = p_kind and request_id = p_request and status = 'waiting';
    return true;
  end if;
  select min(step_no) into nxt from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'waiting';
  if nxt is null then return true; end if;
  update public.approval_tasks set status = 'pending' where request_kind = p_kind and request_id = p_request and step_no = nxt;
  perform app.approval_notify_step(p_kind, p_request, nxt);
  return false;
end$$;

-- ═══ ربط الإجازات بالسلسلة ═══
create or replace function app.hr_can_decide(p_leave uuid) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare l record; me uuid := app.current_employee_id(); mgr record;
begin
  if app.has_role(array['super_admin']) then return true; end if;
  select * into l from public.hr_leaves where id = p_leave;
  if l.chain_id is not null then
    return auth.uid() = any(app.approval_current_approvers(l.kind, l.id));
  end if;
  if me is null then return false; end if;
  if l.manager_id is null then return false; end if;
  if l.manager_id = me then return true; end if;
  select * into mgr from public.employees where id = l.manager_id;
  if mgr.manager_id = me and (mgr.user_id is null or mgr.employment_status = 'terminated'
     or exists (select 1 from public.hr_leaves x where x.employee_id = mgr.id and x.status = 'approved' and x.kind = 'leave' and current_date between x.start_date and x.end_date)) then
    return true;
  end if;
  return false;
end$$;

create or replace function public.hr_leave_request(p_employee uuid, p_type uuid, p_start date, p_end date, p_start_time time default null, p_end_time time default null,
                                                   p_notes text default null, p_attachment text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare lt record; e record; me uuid := app.current_employee_id(); v_days numeric; v_minutes int := 0; v_id uuid; bal jsonb; v_cost numeric; v_max_min int; v_month_permits int;
        chain public.approval_chains; v_chain uuid;
begin
  select * into lt from public.hr_leave_types where id = p_type and is_active;
  if not found then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null;
  if not found or e.employment_status = 'terminated' then raise exception 'HR_NOT_FOUND'; end if;
  if not (app.has_role(array['hr_officer', 'super_admin']) or p_employee = me or (me is not null and e.manager_id = me)) then raise exception 'HR_FORBIDDEN'; end if;
  if e.biometric_pin is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_BIOMETRIC'; end if;
  chain := app.approval_chain_for(e.user_id, lt.kind);
  if e.manager_id is null and chain.id is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_MANAGER'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'HR_DATE_INVALID'; end if;
  if lt.requires_attachment and coalesce(p_attachment, '') = '' then raise exception 'HR_ATTACHMENT_REQUIRED'; end if;

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
  if lt.consumes_balance then
    bal := app.hr_balance_of(p_employee, extract(year from p_start)::int);
    v_cost := case when lt.kind = 'leave' then v_days else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end;
    if (bal ->> 'remaining')::numeric < v_cost then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
  end if;

  insert into public.hr_leaves (employee_id, kind, leave_type, leave_type_id, start_date, end_date, start_time, end_time, status, notes, created_by, requested_by, manager_id, days, minutes, attachment_path)
  values (p_employee, lt.kind, lt.code, lt.id, p_start, p_end, p_start_time, p_end_time, 'pending', nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid(), e.manager_id, v_days, v_minutes, p_attachment)
  returning id into v_id;

  if chain.id is not null then
    v_chain := app.approval_open(lt.kind, v_id, e.user_id);
    update public.hr_leaves set chain_id = v_chain where id = v_id;
  else
    perform app.hr_notify(app.hr_manager_user(p_employee), 'طلب ' || lt.name || ' بانتظار موافقتك',
      e.full_name || ' · ' || p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end
        || case when lt.kind = 'time_permit' then ' · ' || to_char(p_start_time, 'HH24:MI') || '–' || to_char(p_end_time, 'HH24:MI') else '' end,
      '/manager/leaves', 'leave_req:' || v_id::text, 'info');
  end if;
  return v_id;
end$$;

create or replace function public.hr_leave_decide(p_leave uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; lt record; e record; v_cost numeric; bal jsonb; d date; final boolean := true; step_no int;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status <> 'pending' then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not app.hr_can_decide(p_leave) then raise exception 'HR_FORBIDDEN'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into lt from public.hr_leave_types where id = l.leave_type_id;
  select * into e from public.employees where id = l.employee_id;

  if l.chain_id is not null then
    select t.step_no into step_no from public.approval_tasks t where t.request_kind = l.kind and t.request_id = l.id and t.status = 'pending' order by t.step_no limit 1;
    final := app.approval_decide(l.kind, l.id, p_approve, p_note);
    if p_approve and not final then
      perform app.hr_notify(e.user_id, 'وافقت خطوة ' || step_no || ' على طلب ' || lt.name, 'الطلب انتقل إلى الخطوة التالية في سلسلة الموافقات', '/employee/requests', 'approval_step:' || l.id::text || ':' || step_no, 'info');
      return;   -- الطلب يبقى معلّقاً حتى الخطوة الأخيرة
    end if;
  end if;

  if p_approve then
    if app.hr_month_locked(l.start_date) or app.hr_month_locked(l.end_date) then raise exception 'HR_MONTH_LOCKED'; end if;
    if lt.consumes_balance then
      bal := app.hr_balance_of(l.employee_id, extract(year from l.start_date)::int);
      v_cost := case when lt.kind = 'leave' then l.days else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end;
      if (bal ->> 'remaining')::numeric < v_cost then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
      insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
      values (l.employee_id, extract(year from l.start_date)::int, case when lt.kind = 'leave' then 'consume' else 'permit' end, -v_cost, l.id, lt.name || ' ' || l.start_date::text, auth.uid());
    end if;
    update public.hr_leaves set status = 'approved', approved_by = auth.uid(), approved_at = now(), decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_leave;
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
    perform app.hr_notify(e.user_id, 'تمت الموافقة على ' || lt.name, l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end, '/employee/requests', 'leave_dec:' || l.id::text, 'success');
  else
    update public.hr_leaves set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note) where id = p_leave;
    perform app.hr_notify(e.user_id, 'رُفض طلب ' || lt.name, trim(p_note), '/employee/requests', 'leave_dec:' || l.id::text, 'warning');
  end if;
end$$;

-- مهام الموافقة المعلّقة لديّ (أي دور)
create or replace function public.approval_my_tasks()
returns table(task_id uuid, request_kind text, request_id uuid, step_no int, total_steps int, step_label text, requester_user_id uuid, requester_name text, requester_role text, requester_role_label text,
              area_name text, parent_sector text, type_name text, start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, notes text, attachment_path text, created_at timestamptz, previous_steps jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  select t.id, t.request_kind, t.request_id, t.step_no,
    (select count(*)::int from public.approval_tasks x where x.request_kind = t.request_kind and x.request_id = t.request_id and x.status <> 'skipped'),
    t.step_label, e.user_id, e.full_name, c.requester_role, app.approval_role_label(c.requester_role),
    (select string_agg(s.name, '، ') from public.sectors s where s.parent_sector = any(app.user_parent_sectors(e.user_id))
       and (s.id in (select cp.sector_id from public.contractor_profiles cp where cp.user_id = e.user_id and cp.is_active)
            or s.id in (select unnest(mp.sectors) from public.manager_profiles mp where mp.user_id = e.user_id))),
    (select string_agg(app.parent_sector_name(x), '، ') from unnest(app.user_parent_sectors(e.user_id)) x),
    lt.name, l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.notes, l.attachment_path, l.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('step_no', p.step_no, 'label', p.step_label, 'status', p.status, 'decided_by', app.manager_display_name(p.decided_by), 'decided_at', p.decided_at, 'note', p.note) order by p.step_no)
              from public.approval_tasks p where p.request_kind = t.request_kind and p.request_id = t.request_id and p.step_no < t.step_no), '[]'::jsonb)
  from public.approval_tasks t
  join public.hr_leaves l on l.id = t.request_id
  join public.employees e on e.id = l.employee_id
  left join public.approval_chains c on c.id = t.chain_id
  left join public.hr_leave_types lt on lt.id = l.leave_type_id
  where t.status = 'pending' and auth.uid() = any(t.approvers) and l.status = 'pending'
  order by l.created_at;
end$$;

-- مسار طلب (للطالب، والمُعتمِدين، وIT/HR)
create or replace function public.approval_timeline(p_kind text, p_request uuid)
returns table(step_no int, step_label text, status text, approvers jsonb, decided_by_name text, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = public, app as $$
declare l record;
begin
  select l1.*, e.user_id as requester into l from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id where l1.id = p_request;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if not (auth.uid() = l.requester or app.has_role(array['it_admin','hr_officer','super_admin'])
          or exists (select 1 from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request and auth.uid() = any(t.approvers))) then
    raise exception 'HR_FORBIDDEN';
  end if;
  return query
  select t.step_no, t.step_label, t.status,
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', a, 'name', app.manager_display_name(a))), '[]'::jsonb) from unnest(t.approvers) a),
    app.manager_display_name(t.decided_by), t.decided_at, t.note
  from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request order by t.step_no;
end$$;

-- ═══════════════ ③ بوابة مسؤول القاطع ═══════════════
create or replace function public.sector_manager_me()
returns table(user_id uuid, full_name text, parent_sectors text[], parent_names text[], areas int, department_managers int, contractors int, employee_id uuid, has_employee boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles := app.require_parent_sector_manager();
begin
  return query
  select p.user_id, app.manager_display_name(p.user_id), p.parent_sectors, (select array_agg(app.parent_sector_name(x) order by x) from unnest(p.parent_sectors) x),
    (select count(*)::int from public.sectors s where s.parent_sector = any(p.parent_sectors)),
    (select count(distinct mp.user_id)::int from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)),
    (select count(*)::int from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(p.parent_sectors)),
    (select e.id from public.employees e where e.user_id = p.user_id and e.archived_at is null limit 1),
    exists (select 1 from public.employees e where e.user_id = p.user_id and e.archived_at is null);
end$$;

-- فريقي: مسؤولو الأقسام في قواطعي مع مناطقهم ومتعهديهم وحالة اليوم
create or replace function public.sector_manager_team()
returns table(manager_user_id uuid, manager_name text, manager_phone text, shift text, parent_sector text, areas jsonb,
              contractors int, workers int, present_today int, absent_today int, presence_proved int, out_of_zone int, vehicles_now int, on_leave_today boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles := app.require_parent_sector_manager(); d date := app.baghdad_today();
begin
  return query
  with mgrs as (
    select distinct mp.user_id, mp.shift, mp.sectors, s.parent_sector
    from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)
  )
  select m.user_id, app.manager_display_name(m.user_id), (select e.phone from public.employees e where e.user_id = m.user_id limit 1), m.shift, m.parent_sector,
    coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'contractor_user_id', cp.user_id, 'contractor_name', app.manager_display_name(cp.user_id),
                 'checked_in', c.id is not null, 'in_zone', c.in_zone,
                 'workers', (select count(*) from public.contractor_workers w where w.contractor_user_id = cp.user_id and w.is_active),
                 'present', (select count(*) from public.contractor_worker_attendance a where a.contractor_user_id = cp.user_id and a.log_date = d and a.status = 'present'),
                 'absent', (select count(*) from public.contractor_worker_attendance a where a.contractor_user_id = cp.user_id and a.log_date = d and a.status = 'absent')) order by s.id)
      from public.sectors s left join public.contractor_profiles cp on cp.sector_id = s.id and cp.manager_user_id = m.user_id and cp.is_active
      left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
      where s.id = any(m.sectors) and s.parent_sector = m.parent_sector), '[]'::jsonb),
    (select count(*)::int from public.contractor_profiles cp where cp.manager_user_id = m.user_id and cp.is_active),
    (select count(*)::int from public.contractor_workers w join public.contractor_profiles cp on cp.user_id = w.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and w.is_active),
    (select count(*)::int from public.contractor_worker_attendance a join public.contractor_profiles cp on cp.user_id = a.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and a.log_date = d and a.status = 'present'),
    (select count(*)::int from public.contractor_worker_attendance a join public.contractor_profiles cp on cp.user_id = a.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and a.log_date = d and a.status = 'absent'),
    (select count(*)::int from public.contractor_checkins c join public.contractor_profiles cp on cp.user_id = c.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and c.log_date = d),
    (select count(*)::int from public.contractor_checkins c join public.contractor_profiles cp on cp.user_id = c.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and c.log_date = d and c.in_zone = false),
    (select count(*)::int from public.garage_departures gd where gd.sector_id = any(m.sectors) and gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null),
    exists (select 1 from public.hr_leaves x join public.employees e on e.id = x.employee_id where e.user_id = m.user_id and x.status = 'approved' and x.kind = 'leave' and d between x.start_date and x.end_date)
  from mgrs m
  order by m.parent_sector, app.manager_display_name(m.user_id);
end$$;

create or replace function public.sector_manager_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles := app.require_parent_sector_manager(); d date := app.baghdad_today(); r jsonb;
begin
  select jsonb_build_object(
    'parent_sectors', (select jsonb_agg(jsonb_build_object('code', x, 'name', app.parent_sector_name(x))) from unnest(p.parent_sectors) x),
    'areas', (select count(*) from public.sectors s where s.parent_sector = any(p.parent_sectors)),
    'department_managers', (select count(distinct mp.user_id) from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)),
    'contractors', (select count(*) from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(p.parent_sectors)),
    'areas_without_contractor', (select count(*) from public.sectors s where s.parent_sector = any(p.parent_sectors) and not exists (select 1 from public.contractor_profiles cp where cp.sector_id = s.id and cp.is_active)),
    'workers', (select count(*) from public.contractor_workers w join public.contractor_profiles cp on cp.user_id = w.contractor_user_id and cp.is_active join public.sectors s on s.id = cp.sector_id where w.is_active and s.parent_sector = any(p.parent_sectors)),
    'present_today', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = d and a.status = 'present' and s.parent_sector = any(p.parent_sectors)),
    'absent_today', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = d and a.status = 'absent' and s.parent_sector = any(p.parent_sectors)),
    'presence_proved', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = d and s.parent_sector = any(p.parent_sectors)),
    'out_of_zone', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = d and c.in_zone = false and s.parent_sector = any(p.parent_sectors)),
    'vehicles_now', (select count(*) from public.garage_departures gd join public.sectors s on s.id = gd.sector_id where gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null and s.parent_sector = any(p.parent_sectors)),
    'pending_requests', (select count(*) from public.approval_tasks t join public.hr_leaves l on l.id = t.request_id where t.status = 'pending' and auth.uid() = any(t.approvers) and l.status = 'pending'),
    'managers_on_leave', (select count(distinct e.user_id) from public.hr_leaves x join public.employees e on e.id = x.employee_id join public.manager_profiles mp on mp.user_id = e.user_id join public.sectors s on s.id = any(mp.sectors)
                           where s.parent_sector = any(p.parent_sectors) and x.status = 'approved' and x.kind = 'leave' and d between x.start_date and x.end_date),
    'notices_sent', (select count(*) from public.sector_notices n where n.sender_user_id = auth.uid()),
    'areas_detail', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'parent_sector', s.parent_sector, 'manager_name', app.manager_display_name(cp.manager_user_id),
                        'contractor_name', app.manager_display_name(cp.user_id), 'checked_in', c.id is not null, 'in_zone', c.in_zone,
                        'present', (select count(*) from public.contractor_worker_attendance a where a.sector_id = s.id and a.log_date = d and a.status = 'present'),
                        'absent', (select count(*) from public.contractor_worker_attendance a where a.sector_id = s.id and a.log_date = d and a.status = 'absent'),
                        'vehicles_now', (select count(*) from public.garage_departures gd where gd.sector_id = s.id and gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null)) order by s.parent_sector, s.id), '[]'::jsonb)
                      from public.sectors s left join public.contractor_profiles cp on cp.sector_id = s.id and cp.is_active left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
                      where s.parent_sector = any(p.parent_sectors))
  ) into r;
  return r;
end$$;

-- التقارير: المتعهدون ومسؤولو الأقسام في فترة (بلا أي بيانات مالية)
create or replace function public.sector_manager_reports(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles := app.require_parent_sector_manager(); f date := coalesce(p_from, app.baghdad_today() - 29); t date := coalesce(p_to, app.baghdad_today()); r jsonb;
begin
  if t < f then raise exception 'HR_DATE_INVALID'; end if;
  select jsonb_build_object(
    'from', f, 'to', t, 'days', (t - f) + 1,
    'totals', jsonb_build_object(
      'present', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date between f and t and a.status = 'present' and s.parent_sector = any(p.parent_sectors)),
      'absent', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date between f and t and a.status = 'absent' and s.parent_sector = any(p.parent_sectors)),
      'presence_proofs', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date between f and t and s.parent_sector = any(p.parent_sectors)),
      'out_of_zone', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date between f and t and c.in_zone = false and s.parent_sector = any(p.parent_sectors)),
      'trips', (select count(*) from public.garage_departures gd join public.sectors s on s.id = gd.sector_id where gd.departed_at::date between f and t and s.parent_sector = any(p.parent_sectors)),
      'manager_leaves', (select count(*) from public.hr_leaves x join public.employees e on e.id = x.employee_id join public.manager_profiles mp on mp.user_id = e.user_id
                          where x.status = 'approved' and x.start_date <= t and x.end_date >= f and exists (select 1 from public.sectors s where s.id = any(mp.sectors) and s.parent_sector = any(p.parent_sectors)))),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('d', dd, 'present', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = dd and a.status = 'present' and s.parent_sector = any(p.parent_sectors)),
                 'absent', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = dd and a.status = 'absent' and s.parent_sector = any(p.parent_sectors)),
                 'proofs', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = dd and s.parent_sector = any(p.parent_sectors))) order by dd), '[]'::jsonb)
               from generate_series(f, t, interval '1 day') g(dd)),
    'contractors', (select coalesce(jsonb_agg(jsonb_build_object('user_id', cp.user_id, 'name', app.manager_display_name(cp.user_id), 'area', s.name, 'parent_sector', s.parent_sector, 'manager_name', app.manager_display_name(cp.manager_user_id), 'shift', cp.shift,
                       'workers', (select count(*) from public.contractor_workers w where w.contractor_user_id = cp.user_id and w.is_active),
                       'present', (select count(*) from public.contractor_worker_attendance a where a.contractor_user_id = cp.user_id and a.log_date between f and t and a.status = 'present'),
                       'absent', (select count(*) from public.contractor_worker_attendance a where a.contractor_user_id = cp.user_id and a.log_date between f and t and a.status = 'absent'),
                       'proof_days', (select count(*) from public.contractor_checkins c where c.contractor_user_id = cp.user_id and c.log_date between f and t),
                       'out_of_zone_days', (select count(*) from public.contractor_checkins c where c.contractor_user_id = cp.user_id and c.log_date between f and t and c.in_zone = false)) order by s.parent_sector, s.id), '[]'::jsonb)
                    from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(p.parent_sectors)),
    'managers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', app.manager_display_name(m.user_id), 'shift', m.shift, 'parent_sector', m.parent_sector,
                    'areas', (select string_agg(s.name, '، ' order by s.id) from public.sectors s where s.id = any(m.sectors) and s.parent_sector = m.parent_sector),
                    'contractors', (select count(*) from public.contractor_profiles cp where cp.manager_user_id = m.user_id and cp.is_active),
                    'present', (select count(*) from public.contractor_worker_attendance a join public.contractor_profiles cp on cp.user_id = a.contractor_user_id where cp.manager_user_id = m.user_id and a.log_date between f and t and a.status = 'present'),
                    'absent', (select count(*) from public.contractor_worker_attendance a join public.contractor_profiles cp on cp.user_id = a.contractor_user_id where cp.manager_user_id = m.user_id and a.log_date between f and t and a.status = 'absent'),
                    'trips', (select count(*) from public.garage_departures gd where gd.sector_id = any(m.sectors) and gd.departed_at::date between f and t),
                    'leave_days', (select coalesce(sum(least(x.end_date, t) - greatest(x.start_date, f) + 1), 0) from public.hr_leaves x join public.employees e on e.id = x.employee_id where e.user_id = m.user_id and x.status = 'approved' and x.kind = 'leave' and x.start_date <= t and x.end_date >= f),
                    'permits', (select count(*) from public.hr_leaves x join public.employees e on e.id = x.employee_id where e.user_id = m.user_id and x.status = 'approved' and x.kind = 'time_permit' and x.start_date between f and t)) order by m.parent_sector, app.manager_display_name(m.user_id)), '[]'::jsonb)
                 from (select distinct mp.user_id, mp.shift, mp.sectors, s.parent_sector from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)) m)
  ) into r;
  return r;
end$$;

-- التبليغ: إشعار داخل التطبيق لمسؤولي أقسامه فقط
create table if not exists public.sector_notices (
  id             uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  body           text not null,
  recipients     uuid[] not null,
  created_at     timestamptz not null default now()
);
alter table public.sector_notices enable row level security;
drop policy if exists "sector_notices: sender" on public.sector_notices;
create policy "sector_notices: sender" on public.sector_notices for select to authenticated using (sender_user_id = auth.uid() or app.has_role(array['super_admin']));

create or replace function public.sector_manager_notify_targets()
returns table(user_id uuid, full_name text, parent_sector text, areas text, shift text)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles := app.require_parent_sector_manager();
begin
  return query
  select m.user_id, app.manager_display_name(m.user_id), m.parent_sector, (select string_agg(s.name, '، ' order by s.id) from public.sectors s where s.id = any(m.sectors) and s.parent_sector = m.parent_sector), m.shift
  from (select distinct mp.user_id, mp.shift, mp.sectors, s.parent_sector from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)) m
  order by m.parent_sector, 2;
end$$;

create or replace function public.sector_manager_notify(p_title text, p_body text, p_targets uuid[] default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare p public.sector_manager_profiles := app.require_parent_sector_manager(); allowed uuid[]; rec uuid[]; u uuid; v_id uuid;
begin
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'NOTICE_TITLE_REQUIRED'; end if;
  if length(trim(coalesce(p_body, ''))) < 3 then raise exception 'NOTICE_BODY_REQUIRED'; end if;
  select coalesce(array_agg(t.user_id), '{}') into allowed from public.sector_manager_notify_targets() t;
  if p_targets is not null and cardinality(p_targets) > 0 and exists (select 1 from unnest(p_targets) x where not (x = any(allowed))) then raise exception 'NOTICE_TARGET_FORBIDDEN'; end if;
  rec := case when p_targets is null or cardinality(p_targets) = 0 then allowed else (select coalesce(array_agg(x), '{}') from unnest(p_targets) x where x = any(allowed)) end;
  if cardinality(rec) = 0 then raise exception 'NOTICE_NO_RECIPIENTS'; end if;
  insert into public.sector_notices (sender_user_id, title, body, recipients) values (auth.uid(), trim(p_title), trim(p_body), rec) returning id into v_id;
  foreach u in array rec loop
    perform app.hr_notify(u, 'تبليغ من مسؤول القاطع: ' || trim(p_title), trim(p_body), '/manager', 'sector_notice:' || v_id::text || ':' || u::text, 'warning');
  end loop;
  return cardinality(rec);
end$$;

create or replace function public.sector_manager_notices(p_limit int default 50)
returns table(id uuid, title text, body text, recipients_count int, recipient_names text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_parent_sector_manager();
  return query select n.id, n.title, n.body, cardinality(n.recipients), (select string_agg(app.manager_display_name(x), '، ') from unnest(n.recipients) x), n.created_at
  from public.sector_notices n where n.sender_user_id = auth.uid() order by n.created_at desc limit p_limit;
end$$;

-- ═══ الصلاحيات ═══
revoke all on function public.sector_manager_options() from public, anon;
revoke all on function public.sector_manager_profile_save(uuid, text[], text) from public, anon;
revoke all on function public.sector_manager_profile_for_user(uuid) from public, anon;
revoke all on function public.approval_chains_list() from public, anon;
revoke all on function public.approval_chain_save(text, text, jsonb, boolean) from public, anon;
revoke all on function public.approval_chain_delete(uuid) from public, anon;
revoke all on function public.approval_my_tasks() from public, anon;
revoke all on function public.approval_timeline(text, uuid) from public, anon;
revoke all on function public.sector_manager_me() from public, anon;
revoke all on function public.sector_manager_team() from public, anon;
revoke all on function public.sector_manager_dashboard() from public, anon;
revoke all on function public.sector_manager_reports(date, date) from public, anon;
revoke all on function public.sector_manager_notify_targets() from public, anon;
revoke all on function public.sector_manager_notify(text, text, uuid[]) from public, anon;
revoke all on function public.sector_manager_notices(int) from public, anon;
grant execute on function public.sector_manager_options() to authenticated;
grant execute on function public.sector_manager_profile_save(uuid, text[], text) to authenticated;
grant execute on function public.sector_manager_profile_for_user(uuid) to authenticated;
grant execute on function public.approval_chains_list() to authenticated;
grant execute on function public.approval_chain_save(text, text, jsonb, boolean) to authenticated;
grant execute on function public.approval_chain_delete(uuid) to authenticated;
grant execute on function public.approval_my_tasks() to authenticated;
grant execute on function public.approval_timeline(text, uuid) to authenticated;
grant execute on function public.sector_manager_me() to authenticated;
grant execute on function public.sector_manager_team() to authenticated;
grant execute on function public.sector_manager_dashboard() to authenticated;
grant execute on function public.sector_manager_reports(date, date) to authenticated;
grant execute on function public.sector_manager_notify_targets() to authenticated;
grant execute on function public.sector_manager_notify(text, text, uuid[]) to authenticated;
grant execute on function public.sector_manager_notices(int) to authenticated;
