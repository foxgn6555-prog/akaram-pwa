-- ═══════════════════════════════════════════════════════════════
-- 00279 · محرك سلاسل الموافقات v2 (00334)
--   ① نوع فرعي اختياري للسلسلة (نوع الإجازة التفصيلي) — الأولوية: الفرعي ← العام ← الافتراضي
--   ② خصائص الخطوة: شرط (مبلغ/أيام/دقائق ≥ أو ≤ قيمة) · نمط «أي واحد» أو «الجميع» · مهلة بالأيام مع تذكير وتصعيد
--   ③ سجل إصدارات لكل تعديل على السلاسل (من/متى/ماذا)
--   ④ التفويض المؤقت: المهام تنتقل تلقائياً للمفوَّض إليه خلال الفترة وتعود بعدها؛ يُسجَّل «بالتفويض عن»
--   ⑤ محاكاة: من سيوافق لو طلب فلان كذا؟
--   الافتراضي بلا أي ضبط = السلوك الحالي تماماً.
-- ═══════════════════════════════════════════════════════════════

-- ── ① المخطط ──
alter table public.approval_chains add column if not exists subtype text;
alter table public.approval_chains drop constraint if exists approval_chains_requester_role_request_type_key;
create unique index if not exists approval_chains_scope_uq on public.approval_chains (requester_role, request_type, coalesce(subtype, ''));

alter table public.approval_tasks
  add column if not exists mode         text not null default 'any' check (mode in ('any','all')),
  add column if not exists approved_by  uuid[] not null default '{}',
  add column if not exists sla_days     int,
  add column if not exists escalate     text not null default 'none' check (escalate in ('none','next')),
  add column if not exists due_at       timestamptz,
  add column if not exists reminded_at  timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists delegates    jsonb not null default '{}'::jsonb,   -- {"<to_user>": "<from_user>"}
  add column if not exists decided_for  uuid references auth.users(id);       -- عند القرار بالتفويض: الأصيل

create table if not exists public.approval_chain_versions (
  id             uuid primary key default gen_random_uuid(),
  chain_id       uuid not null,
  version_no     int  not null,
  action         text not null check (action in ('created','updated','deleted')),
  requester_role text not null,
  request_type   text not null,
  subtype        text,
  steps          jsonb not null,
  is_active      boolean not null,
  changed_by     uuid references auth.users(id),
  changed_at     timestamptz not null default now(),
  unique (chain_id, version_no)
);
alter table public.approval_chain_versions enable row level security;
drop policy if exists "approval_chain_versions: it read" on public.approval_chain_versions;
create policy "approval_chain_versions: it read" on public.approval_chain_versions for select to authenticated using (app.has_role(array['it_admin','super_admin']));

create or replace function app.approval_chain_version_trg() returns trigger language plpgsql security definer set search_path = public, app as $$
declare v int; r public.approval_chains;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select coalesce(max(version_no), 0) + 1 into v from public.approval_chain_versions where chain_id = r.id;
  insert into public.approval_chain_versions (chain_id, version_no, action, requester_role, request_type, subtype, steps, is_active, changed_by)
  values (r.id, v, case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end, r.requester_role, r.request_type, r.subtype, r.steps, r.is_active, coalesce(auth.uid(), r.updated_by));
  return coalesce(new, old);
end$$;
drop trigger if exists trg_approval_chain_version on public.approval_chains;
create trigger trg_approval_chain_version after insert or update or delete on public.approval_chains for each row execute function app.approval_chain_version_trg();

create table if not exists public.approval_delegations (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references auth.users(id),
  to_user     uuid not null references auth.users(id),
  starts_on   date not null default current_date,
  ends_on     date not null,
  note        text,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_on >= starts_on), check (from_user <> to_user)
);
alter table public.approval_delegations enable row level security;
drop policy if exists "approval_delegations: own or it" on public.approval_delegations;
create policy "approval_delegations: own or it" on public.approval_delegations for select to authenticated
  using (auth.uid() in (from_user, to_user) or app.has_role(array['it_admin','super_admin']));

-- ── ② التحقق من الخطوات (الحقول الجديدة اختيارية) ──
create or replace function app.approval_validate_steps(p_steps jsonb) returns void language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb; prev text := null; cur text; c jsonb;
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then raise exception 'APPROVAL_STEPS_REQUIRED'; end if;
  for s in select * from jsonb_array_elements(p_steps) loop
    if s ->> 'kind' = 'hierarchy' then
      if not ((s ->> 'role') = any(app.approval_hierarchy_roles())) then raise exception 'APPROVAL_STEP_ROLE_INVALID'; end if;
      cur := 'h:' || (s ->> 'role');
    elsif s ->> 'kind' = 'account' then
      if (s ->> 'user_id') is null or not exists (select 1 from auth.users u where u.id = (s ->> 'user_id')::uuid) then raise exception 'APPROVAL_STEP_ACCOUNT_INVALID'; end if;
      cur := 'a:' || (s ->> 'user_id');
    else raise exception 'APPROVAL_STEP_KIND_INVALID'; end if;
    if cur = prev then raise exception 'APPROVAL_STEPS_DUPLICATE'; end if;
    prev := cur;
    if coalesce(s ->> 'mode', 'any') not in ('any','all') then raise exception 'APPROVAL_STEP_MODE_INVALID'; end if;
    if coalesce(s ->> 'escalate', 'none') not in ('none','next') then raise exception 'APPROVAL_STEP_ESCALATE_INVALID'; end if;
    if s ? 'sla_days' and (s ->> 'sla_days') is not null and not ((s ->> 'sla_days') ~ '^[0-9]+$' and (s ->> 'sla_days')::int between 1 and 60) then raise exception 'APPROVAL_STEP_SLA_INVALID'; end if;
    c := s -> 'condition';
    if c is not null and jsonb_typeof(c) = 'object' then
      if coalesce(c ->> 'field', '') not in ('amount','days','minutes') or coalesce(c ->> 'op', '') not in ('gte','lte')
         or (c ->> 'value') is null or not ((c ->> 'value') ~ '^[0-9]+(\.[0-9]+)?$') then raise exception 'APPROVAL_STEP_CONDITION_INVALID'; end if;
    end if;
  end loop;
end$$;

create or replace function app.approval_clean_step(s jsonb) returns jsonb language sql immutable as $$
  select (case when s ->> 'kind' = 'hierarchy' then jsonb_build_object('kind', 'hierarchy', 'role', s ->> 'role') else jsonb_build_object('kind', 'account', 'user_id', s ->> 'user_id') end)
       || case when coalesce(s ->> 'mode', 'any') = 'all' then '{"mode":"all"}'::jsonb else '{}'::jsonb end
       || case when (s ->> 'sla_days') is not null then jsonb_build_object('sla_days', (s ->> 'sla_days')::int) else '{}'::jsonb end
       || case when coalesce(s ->> 'escalate', 'none') = 'next' then '{"escalate":"next"}'::jsonb else '{}'::jsonb end
       || case when jsonb_typeof(s -> 'condition') = 'object' then jsonb_build_object('condition', jsonb_build_object('field', s -> 'condition' ->> 'field', 'op', s -> 'condition' ->> 'op', 'value', (s -> 'condition' ->> 'value')::numeric)) else '{}'::jsonb end $$;

-- ── حفظ/قائمة بالنوع الفرعي ──
drop function if exists public.approval_chain_save(text, text, jsonb, boolean);
create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true, p_subtype text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb; st text := nullif(trim(coalesce(p_subtype, '')), '');
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if coalesce(p_requester_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
  if not (p_requester_role = any(app.approval_requester_roles())) then raise exception 'APPROVAL_ROLE_INVALID'; end if;
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

drop function if exists public.approval_chains_list();
create or replace function public.approval_chains_list()
returns table(id uuid, requester_role text, requester_label text, request_type text, subtype text, subtype_label text, steps jsonb, is_active boolean, updated_at timestamptz, updated_by_name text, version_no int)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return query
  select c.id, c.requester_role, app.approval_role_label(c.requester_role), c.request_type, c.subtype, (select t.name from public.hr_leave_types t where t.code = c.subtype),
    (select coalesce(jsonb_agg(s || jsonb_build_object('label', app.approval_step_label(s)) order by o), '[]'::jsonb) from jsonb_array_elements(c.steps) with ordinality t(s, o)),
    c.is_active, c.updated_at, app.manager_display_name(c.updated_by),
    (select coalesce(max(v.version_no), 1) from public.approval_chain_versions v where v.chain_id = c.id)::int
  from public.approval_chains c order by c.requester_role, c.request_type, c.subtype nulls first;
end$$;

create or replace function public.approval_chain_versions_list(p_chain uuid)
returns table(id uuid, version_no int, action text, steps jsonb, is_active boolean, changed_by_name text, changed_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return query
  select v.id, v.version_no, v.action,
    (select coalesce(jsonb_agg(s || jsonb_build_object('label', app.approval_step_label(s)) order by o), '[]'::jsonb) from jsonb_array_elements(v.steps) with ordinality t(s, o)),
    v.is_active, app.manager_display_name(v.changed_by), v.changed_at
  from public.approval_chain_versions v where v.chain_id = p_chain order by v.version_no desc;
end$$;

-- ── اختيار السلسلة: الفرعي أولاً ثم العام ──
create or replace function app.approval_chain_for(p_user uuid, p_type text, p_subtype text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select c.* from public.approval_chains c
  join public.user_roles ur on ur.user_id = p_user and ur.role = c.requester_role
  where c.request_type = p_type and c.is_active and (c.subtype is null or c.subtype = p_subtype)
  order by (c.subtype is not null) desc, array_position(app.approval_requester_roles(), c.requester_role) nulls last
  limit 1 $$;
-- الغلاف القديم (وسيطان): يُستخدم في فحوص «هل توجد سلسلة؟» — يعيد العامة أولاً وإلا أي سلسلة فرعية للنوع
create or replace function app.approval_chain_for(p_user uuid, p_type text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select c.* from public.approval_chains c
  join public.user_roles ur on ur.user_id = p_user and ur.role = c.requester_role
  where c.request_type = p_type and c.is_active
  order by (c.subtype is null) desc, array_position(app.approval_requester_roles(), c.requester_role) nulls last
  limit 1 $$;

-- ── ④ التفويض ──
create or replace function app.approval_delegates_for(p_users uuid[]) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(d.to_user::text, d.from_user::text), '{}'::jsonb)
  from (select distinct on (d.to_user) d.to_user, d.from_user from public.approval_delegations d
        where d.is_active and current_date between d.starts_on and d.ends_on and d.from_user = any(p_users) and not (d.to_user = any(p_users))
        order by d.to_user, d.created_at desc) d $$;

create or replace function app.approval_apply_delegations_to(p_task uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare t public.approval_tasks; originals uuid[]; dmap jsonb; k text;
begin
  select * into t from public.approval_tasks where id = p_task;
  if t.id is null or t.status not in ('waiting','pending') then return; end if;
  -- الأصلاء = المعتمدون بدون المفوَّض إليهم الحاليين
  originals := t.approvers;
  for k in select jsonb_object_keys(t.delegates) loop originals := array_remove(originals, k::uuid); end loop;
  dmap := app.approval_delegates_for(originals);
  update public.approval_tasks set approvers = originals || coalesce((select array_agg(x::uuid) from jsonb_object_keys(dmap) x), '{}'), delegates = dmap where id = p_task;
end$$;

create or replace function app.approval_delegations_apply() returns void language plpgsql security definer set search_path = public, app as $$
declare t record;
begin
  for t in select id from public.approval_tasks where status in ('waiting','pending') loop perform app.approval_apply_delegations_to(t.id); end loop;
end$$;

create or replace function public.approval_delegation_set(p_to_user uuid, p_starts_on date, p_ends_on date, p_note text default null, p_from_user uuid default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_from uuid := coalesce(p_from_user, auth.uid()); v_id uuid; t record;
begin
  if v_from <> auth.uid() and not app.has_role(array['it_admin','super_admin']) then raise exception 'APPROVAL_DELEGATION_FORBIDDEN'; end if;
  if p_to_user is null or p_to_user = v_from then raise exception 'APPROVAL_DELEGATION_INVALID'; end if;
  if not exists (select 1 from auth.users u where u.id = p_to_user) then raise exception 'APPROVAL_STEP_ACCOUNT_INVALID'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on or p_ends_on < current_date then raise exception 'APPROVAL_DELEGATION_DATES_INVALID'; end if;
  if p_ends_on - p_starts_on > 90 then raise exception 'APPROVAL_DELEGATION_TOO_LONG'; end if;
  if exists (select 1 from public.approval_delegations d where d.from_user = p_to_user and d.to_user = v_from and d.is_active and d.ends_on >= p_starts_on and d.starts_on <= p_ends_on) then raise exception 'APPROVAL_DELEGATION_CIRCULAR'; end if;
  update public.approval_delegations set is_active = false, cancelled_at = now() where from_user = v_from and is_active and ends_on >= p_starts_on and starts_on <= p_ends_on;   -- تفويض واحد نافذ في الفترة
  insert into public.approval_delegations (from_user, to_user, starts_on, ends_on, note, created_by) values (v_from, p_to_user, p_starts_on, p_ends_on, nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning id into v_id;
  for t in select id from public.approval_tasks where status in ('waiting','pending') and v_from = any(approvers) loop perform app.approval_apply_delegations_to(t.id); end loop;
  perform app.hr_notify(p_to_user, 'تفويض موافقات إليك', app.user_display_name(v_from) || ' فوّضك بمهام الموافقة من ' || p_starts_on::text || ' إلى ' || p_ends_on::text, app.approval_link_for(p_to_user), 'delegation:' || v_id::text, 'info');
  return v_id;
end$$;

create or replace function public.approval_delegation_cancel(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare d public.approval_delegations; t record;
begin
  select * into d from public.approval_delegations where id = p_id;
  if d.id is null then raise exception 'APPROVAL_DELEGATION_NOT_FOUND'; end if;
  if d.from_user <> auth.uid() and not app.has_role(array['it_admin','super_admin']) then raise exception 'APPROVAL_DELEGATION_FORBIDDEN'; end if;
  update public.approval_delegations set is_active = false, cancelled_at = now() where id = p_id;
  for t in select id from public.approval_tasks where status in ('waiting','pending') and d.to_user = any(approvers) loop perform app.approval_apply_delegations_to(t.id); end loop;
end$$;

create or replace function public.approval_delegations_list(p_all boolean default false)
returns table(id uuid, from_user uuid, from_name text, to_user uuid, to_name text, starts_on date, ends_on date, note text, is_active boolean, is_current boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if p_all and not app.has_role(array['it_admin','super_admin']) then raise exception 'APPROVAL_DELEGATION_FORBIDDEN'; end if;
  return query
  select d.id, d.from_user, app.user_display_name(d.from_user), d.to_user, app.user_display_name(d.to_user), d.starts_on, d.ends_on, d.note, d.is_active,
         (d.is_active and current_date between d.starts_on and d.ends_on), d.created_at
  from public.approval_delegations d
  where p_all or auth.uid() in (d.from_user, d.to_user)
  order by d.is_active desc, d.starts_on desc;
end$$;

-- ── الشرط ──
create or replace function app.approval_condition_ok(p_step jsonb, p_context jsonb) returns boolean language sql immutable as $$
  select case when jsonb_typeof(p_step -> 'condition') <> 'object' then true
              when (p_context ->> (p_step -> 'condition' ->> 'field')) is null then true   -- لا قيمة في السياق ⇒ الخطوة تُطبَّق (الأمان أولاً)
              when (p_step -> 'condition' ->> 'op') = 'gte' then (p_context ->> (p_step -> 'condition' ->> 'field'))::numeric >= (p_step -> 'condition' ->> 'value')::numeric
              else (p_context ->> (p_step -> 'condition' ->> 'field'))::numeric <= (p_step -> 'condition' ->> 'value')::numeric end $$;

create or replace function app.approval_condition_label(p_step jsonb) returns text language sql immutable as $$
  select case when jsonb_typeof(p_step -> 'condition') <> 'object' then null
    else 'إذا ' || case p_step -> 'condition' ->> 'field' when 'amount' then 'المبلغ' when 'days' then 'الأيام' else 'الدقائق' end
         || case p_step -> 'condition' ->> 'op' when 'gte' then ' ≥ ' else ' ≤ ' end || (p_step -> 'condition' ->> 'value') end $$;

-- ── السياق التلقائي لكل نوع (المبلغ/الأيام/الدقائق + النوع الفرعي) ──
create or replace function app.approval_request_context(p_kind text, p_request uuid) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare r record;
begin
  if p_kind in ('leave','time_permit') then
    select l.days, l.minutes, lt.code into r from public.hr_leaves l left join public.hr_leave_types lt on lt.id = l.leave_type_id where l.id = p_request;
    return jsonb_strip_nulls(jsonb_build_object('days', r.days, 'minutes', r.minutes, 'subtype', r.code));
  elsif p_kind = 'advance' then
    select a.amount into r from public.advances a where a.id = p_request; return jsonb_strip_nulls(jsonb_build_object('amount', r.amount));
  elsif p_kind = 'disclosure' then
    select d.amount into r from public.disclosures d where d.id = p_request; return jsonb_strip_nulls(jsonb_build_object('amount', r.amount));
  end if;
  return '{}'::jsonb;
exception when others then return '{}'::jsonb;
end$$;

-- ── بناء المهام من سلسلة (مشترك) ──
create or replace function app.approval_build_tasks(p_kind text, p_request uuid, p_chain public.approval_chains, p_requester uuid, p_exclude uuid[], p_context jsonb) returns void
language plpgsql security definer set search_path = public, app as $$
declare s jsonb; i int := 0; who uuid[]; x uuid; cond boolean; dmap jsonb; v_status text; v_note text;
begin
  for s in select * from jsonb_array_elements(p_chain.steps) loop
    i := i + 1;
    who := app.approval_resolve_step(s, p_requester);
    foreach x in array coalesce(p_exclude, '{}') loop who := array_remove(who, x); end loop;
    cond := app.approval_condition_ok(s, p_context);
    if not cond then v_status := 'skipped'; v_note := 'الشرط غير متحقق (' || app.approval_condition_label(s) || ') — تُخطّيت';
    elsif cardinality(who) = 0 then v_status := 'skipped'; v_note := 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً';
    else v_status := 'waiting'; v_note := null; end if;
    dmap := case when v_status = 'waiting' then app.approval_delegates_for(who) else '{}'::jsonb end;
    insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note, mode, sla_days, escalate, delegates)
    values (p_kind, p_request, p_chain.id, i, app.approval_step_label(s) || coalesce(' · ' || app.approval_condition_label(s), ''),
            who || coalesce((select array_agg(k::uuid) from jsonb_object_keys(dmap) k), '{}'), v_status, v_note,
            coalesce(s ->> 'mode', 'any'), (s ->> 'sla_days')::int, coalesce(s ->> 'escalate', 'none'), dmap);
  end loop;
end$$;

create or replace function app.approval_activate_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
begin
  update public.approval_tasks set status = 'pending', due_at = case when sla_days is not null then now() + make_interval(days => sla_days) end
  where request_kind = p_kind and request_id = p_request and step_no = p_step;
  perform app.approval_notify_step(p_kind, p_request, p_step);
end$$;

-- ── فتح السلسلة (5 وسائط) + غلاف التوافق (3 وسائط يشتق السياق تلقائياً) ──
create or replace function app.approval_open(p_kind text, p_request uuid, p_requester uuid, p_subtype text, p_context jsonb) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare c public.approval_chains; first_step int;
begin
  c := app.approval_chain_for(p_requester, p_kind, p_subtype);
  if c.id is null then return null; end if;
  perform app.approval_build_tasks(p_kind, p_request, c, p_requester, array[p_requester], coalesce(p_context, '{}'::jsonb));
  select min(step_no) into first_step from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'waiting';
  if first_step is null then
    delete from public.approval_tasks where request_kind = p_kind and request_id = p_request;
    if exists (select 1 from public.user_roles ur where ur.user_id = p_requester and ur.role = 'super_admin') then
      insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note)
      values (p_kind, p_request, c.id, 1, 'المدير المفوض', array[p_requester], 'pending', 'لا يوجد مُعتمِد آخر في السلسلة — المدير المفوض يعتمد بنفسه');
      perform app.approval_notify_step(p_kind, p_request, 1);
      return c.id;
    end if;
    raise exception 'APPROVAL_NO_APPROVER';
  end if;
  perform app.approval_activate_step(p_kind, p_request, first_step);
  return c.id;
end$$;

create or replace function app.approval_open(p_kind text, p_request uuid, p_requester uuid) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare ctx jsonb := app.approval_request_context(p_kind, p_request);
begin
  return app.approval_open(p_kind, p_request, p_requester, ctx ->> 'subtype', ctx - 'subtype');
end$$;

-- ── القرار: نمط «الجميع» + التفويض ──
create or replace function app.approval_decide(p_kind text, p_request uuid, p_approve boolean, p_note text) returns boolean
language plpgsql security definer set search_path = public, app as $$
declare cur record; nxt int; me uuid := auth.uid(); principal uuid; originals uuid[]; k text; done boolean;
begin
  select * into cur from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'pending' order by step_no limit 1;
  if not found then raise exception 'APPROVAL_NO_PENDING_STEP'; end if;
  if not (me = any(cur.approvers) or app.has_role(array['super_admin'])) then raise exception 'HR_FORBIDDEN'; end if;
  principal := case when cur.delegates ? me::text then (cur.delegates ->> me::text)::uuid end;
  if not p_approve then
    update public.approval_tasks set status = 'rejected', decided_by = me, decided_for = principal, decided_at = now(), note = nullif(trim(coalesce(p_note, '')), '') where id = cur.id;
    update public.approval_tasks set status = 'skipped', note = 'أُلغيت بسبب الرفض في خطوة سابقة' where request_kind = p_kind and request_id = p_request and status = 'waiting';
    return true;
  end if;
  if cur.mode = 'all' and not app.has_role(array['super_admin']) then
    originals := cur.approvers;
    for k in select jsonb_object_keys(cur.delegates) loop originals := array_remove(originals, k::uuid); end loop;
    if coalesce(principal, me) = any(cur.approved_by) then raise exception 'APPROVAL_ALREADY_DECIDED'; end if;
    update public.approval_tasks set approved_by = array_append(array_remove(approved_by, coalesce(principal, me)), coalesce(principal, me)) where id = cur.id returning approved_by into cur.approved_by;
    done := not exists (select 1 from unnest(originals) o where not (o = any(cur.approved_by)));
    if not done then
      update public.approval_tasks set note = 'وافق ' || cardinality(cur.approved_by) || ' من ' || cardinality(originals) || ' — بانتظار البقية' where id = cur.id;
      return false;
    end if;
  end if;
  update public.approval_tasks set status = 'approved', decided_by = me, decided_for = principal, decided_at = now(),
    note = coalesce(nullif(trim(coalesce(p_note, '')), ''), case when principal is not null then 'بالتفويض عن ' || app.user_display_name(principal) end) where id = cur.id;
  select min(step_no) into nxt from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'waiting';
  if nxt is null then return true; end if;
  perform app.approval_activate_step(p_kind, p_request, nxt);
  return false;
end$$;

-- ── المهل: تذكير عند الاستحقاق، تصعيد بعد ضعف المهلة ──
create or replace function app.approval_escalate_overdue() returns int language plpgsql security definer set search_path = public, app as $$
declare t record; u uuid; n int := 0; nxt int;
begin
  perform app.approval_delegations_apply();
  for t in select * from public.approval_tasks where status = 'pending' and due_at is not null and due_at <= now() and reminded_at is null loop
    foreach u in array t.approvers loop
      perform app.hr_notify(u, 'تذكير: موافقة متأخرة (خطوة ' || t.step_no || ')', 'انقضت مهلة ' || t.sla_days || ' يوم لهذه الخطوة — ' || t.step_label, app.approval_link_for(u), 'approval-remind:' || t.id::text, 'warning');
    end loop;
    update public.approval_tasks set reminded_at = now() where id = t.id; n := n + 1;
  end loop;
  for t in select * from public.approval_tasks where status = 'pending' and escalate = 'next' and due_at is not null and due_at + make_interval(days => sla_days) <= now() and escalated_at is null loop
    select min(step_no) into nxt from public.approval_tasks where request_kind = t.request_kind and request_id = t.request_id and status = 'waiting';
    if nxt is null then
      for u in select ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
        perform app.hr_notify(u, 'موافقة متعثرة بلا خطوة تالية', t.step_label || ' — متأخرة ' || (2 * t.sla_days) || ' يوم ولا خطوة بعدها', app.approval_link_for(u), 'approval-stuck:' || t.id::text, 'warning');
      end loop;
      update public.approval_tasks set escalated_at = now() where id = t.id;
    else
      update public.approval_tasks set status = 'skipped', escalated_at = now(), note = 'تصعيد تلقائي: انقضت المهلة (' || t.sla_days || ' يوم) دون قرار' where id = t.id;
      perform app.approval_activate_step(t.request_kind, t.request_id, nxt);
    end if;
    n := n + 1;
  end loop;
  return n;
end$$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'approval_escalate_hourly';
    perform cron.schedule('approval_escalate_hourly', '15 * * * *', $job$ select app.approval_escalate_overdue() $job$);
  end if;
end $$;

-- ── ⑤ المحاكاة (التطوير المركزية) ──
create or replace function public.approval_simulate(p_user uuid, p_type text, p_subtype text default null, p_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare c public.approval_chains; s jsonb; i int := 0; who uuid[]; steps jsonb := '[]'::jsonb; cond boolean; dmap jsonb;
begin
  perform app.require_it();
  c := app.approval_chain_for(p_user, p_type, p_subtype);
  if c.id is null then return jsonb_build_object('chain_id', null, 'steps', '[]'::jsonb, 'note', 'لا سلسلة مضبوطة لهذا المستخدم/النوع — يعمل الافتراضي'); end if;
  for s in select * from jsonb_array_elements(c.steps) loop
    i := i + 1;
    who := array_remove(app.approval_resolve_step(s, p_user), p_user);
    cond := app.approval_condition_ok(s, coalesce(p_context, '{}'::jsonb));
    dmap := app.approval_delegates_for(who);
    steps := steps || jsonb_build_object('step_no', i, 'label', app.approval_step_label(s), 'mode', coalesce(s ->> 'mode', 'any'), 'sla_days', s -> 'sla_days', 'escalate', coalesce(s ->> 'escalate', 'none'),
      'condition', app.approval_condition_label(s),
      'status', case when not cond then 'skipped_condition' when cardinality(who) = 0 then 'skipped_nobody' else 'active' end,
      'approvers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a, 'name', app.user_display_name(a))), '[]'::jsonb) from unnest(who) a),
      'delegates', (select coalesce(jsonb_agg(jsonb_build_object('to_name', app.user_display_name(k::uuid), 'from_name', app.user_display_name((dmap ->> k)::uuid))), '[]'::jsonb) from jsonb_object_keys(dmap) k));
  end loop;
  return jsonb_build_object('chain_id', c.id, 'requester_role', c.requester_role, 'requester_label', app.approval_role_label(c.requester_role), 'subtype', c.subtype, 'steps', steps);
end$$;

-- ── السلف: تستخدم الباني المشترك (الشروط على المبلغ تعمل) ──
create or replace function public.advance_request_create(p_employee uuid, p_type uuid, p_amount numeric, p_method text, p_installments int default null, p_monthly numeric default null, p_percent numeric default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare e record; t public.advance_types; v_id uuid; v_chain uuid; who uuid[]; borrower uuid; c public.approval_chains; first_step int; a public.advances;
begin
  perform app.require_ops_room();
  select * into e from public.employees x where x.id = p_employee and x.archived_at is null and (x.employment_status is null or x.employment_status <> 'terminated');
  if e.id is null then raise exception 'ADVANCE_EMPLOYEE_NOT_FOUND'; end if;
  select * into t from public.advance_types x where x.id = p_type and x.is_active;
  if t.id is null then raise exception 'ADVANCE_TYPE_NOT_FOUND'; end if;
  if app.hr_policy_bool('advance_block_if_open', true) and exists (select 1 from public.advances x where x.employee_id = p_employee and x.status in ('pending','approved','delivered')) then
    raise exception 'ADVANCE_ALREADY_OPEN';
  end if;
  perform app.advance_validate(t, p_employee, p_amount, p_method, p_installments, p_monthly, p_percent);
  insert into public.advances (ref_no, employee_id, employee_name, employee_number, type_id, type_name, amount, requested_amount, repayment_method, installments, monthly_amount, percent, notes, requested_by, requested_by_name)
  values ('ADV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.advance_ref_seq')::text, 5, '0'), e.id, e.full_name, e.employee_number, t.id, t.name, round(p_amount), round(p_amount), p_method,
          case when p_method = 'equal' then p_installments end, case when p_method = 'fixed' then round(p_monthly) end, case when p_method = 'percent' then p_percent end,
          nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), app.user_display_name(auth.uid()))
  returning id into v_id;
  borrower := e.user_id;
  if borrower is not null then c := app.approval_chain_for(borrower, 'advance'); end if;
  if c.id is null then c := app.approval_chain_for(auth.uid(), 'advance'); borrower := null; end if;
  if c.id is not null then
    perform app.approval_build_tasks('advance', v_id, c, coalesce(borrower, auth.uid()), array[auth.uid(), e.user_id], jsonb_build_object('amount', round(p_amount)));
    v_chain := c.id;
  else
    select coalesce(array_agg(distinct ur.user_id), '{}') into who from public.user_roles ur where ur.role = 'deputy_director' and ur.user_id not in (auth.uid(), coalesce(e.user_id, auth.uid()));
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status, note, delegates)
    values ('advance', v_id, 1, 'معاون المدير (افتراضي — بلا سلسلة مضبوطة)', who || coalesce((select array_agg(k::uuid) from jsonb_object_keys(app.approval_delegates_for(who)) k), '{}'), case when cardinality(who) = 0 then 'skipped' else 'waiting' end, case when cardinality(who) = 0 then 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً' end, app.approval_delegates_for(who));
    select coalesce(array_agg(distinct ur.user_id), '{}') into who from public.user_roles ur where ur.role = 'super_admin' and ur.user_id not in (auth.uid(), coalesce(e.user_id, auth.uid()));
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status, note, delegates)
    values ('advance', v_id, 2, 'المدير المفوض (افتراضي — بلا سلسلة مضبوطة)', who || coalesce((select array_agg(k::uuid) from jsonb_object_keys(app.approval_delegates_for(who)) k), '{}'), case when cardinality(who) = 0 then 'skipped' else 'waiting' end, case when cardinality(who) = 0 then 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً' end, app.approval_delegates_for(who));
  end if;
  select min(step_no) into first_step from public.approval_tasks where request_kind = 'advance' and request_id = v_id and status = 'waiting';
  if first_step is null then
    delete from public.approval_tasks where request_kind = 'advance' and request_id = v_id;
    delete from public.advances where id = v_id;
    raise exception 'APPROVAL_NO_APPROVER';
  end if;
  update public.advances set chain_id = v_chain where id = v_id;
  perform app.advance_log(v_id, 'created', round(p_amount), p_notes);
  perform app.approval_activate_step('advance', v_id, first_step);
  select * into a from public.advances where id = v_id;
  return app.advance_json(a);
end$$;
