-- 00162 · مخزن غرفة العمليات + طلبات مستلزمات القواطع عبر سلاسل الموافقات (الجولة 3)
-- التدفق: مسؤول القسم يطلب مواد من قائمة مخزن غرفة العمليات (مادة + كمية) → سلسلة الموافقات المضبوطة من التطوير المركزية
-- (دور department_manager × نوع supplies؛ بلا سلسلة → يصل غرفة العمليات مباشرة) → عند اكتمال الموافقات يبقى الطلب «معلّقاً للتسليم»
-- في وحدة المخزن لدى غرفة العمليات → عند التسليم تُسجَّل الكميات المسلَّمة واسم المستلم ويُنقَص المخزن بحركة مسجّلة.
-- بلا أي بيانات مالية (لا أسعار ولا تكاليف).

-- ═══════════════ ① المخزن ═══════════════
create table if not exists public.ops_store_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  unit        text not null default 'قطعة',
  qty_on_hand numeric(12,2) not null default 0 check (qty_on_hand >= 0),
  min_qty     numeric(12,2) not null default 0 check (min_qty >= 0),
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists ops_store_items_name_uidx on public.ops_store_items (lower(trim(name)));
alter table public.ops_store_items enable row level security;
drop policy if exists "ops_store_items: read" on public.ops_store_items;
create policy "ops_store_items: read" on public.ops_store_items for select to authenticated using (true);

create table if not exists public.ops_store_movements (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.ops_store_items(id) on delete cascade,
  kind          text not null check (kind in ('in','out','adjust')),
  qty           numeric(12,2) not null,            -- موجبة للإدخال، سالبة للإخراج، الفرق للتسوية
  balance_after numeric(12,2) not null,
  request_id    uuid,                              -- طلب المستلزمات عند الإخراج
  note          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists ops_store_movements_item_idx on public.ops_store_movements (item_id, created_at desc);
alter table public.ops_store_movements enable row level security;
drop policy if exists "ops_store_movements: ops" on public.ops_store_movements;
create policy "ops_store_movements: ops" on public.ops_store_movements for select to authenticated using (app.has_role(array['ops_room','super_admin','it_admin']));

create or replace function app.require_ops_room() returns void language plpgsql stable security definer set search_path = public, app as $$
begin if auth.uid() is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if; end$$;

create or replace function app.ops_room_users() returns uuid[] language sql stable security definer set search_path = public as
$$ select coalesce(array_agg(distinct user_id), '{}') from public.user_roles where role = 'ops_room' $$;

create or replace function public.ops_store_item_save(p_id uuid, p_name text, p_unit text default 'قطعة', p_min_qty numeric default 0, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid;
begin
  perform app.require_ops_room();
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'STORE_ITEM_NAME_REQUIRED'; end if;
  if p_id is null then
    insert into public.ops_store_items (name, unit, min_qty, is_active, created_by) values (trim(p_name), coalesce(nullif(trim(p_unit), ''), 'قطعة'), coalesce(p_min_qty, 0), coalesce(p_active, true), auth.uid()) returning id into v_id;
  else
    update public.ops_store_items set name = trim(p_name), unit = coalesce(nullif(trim(p_unit), ''), 'قطعة'), min_qty = coalesce(p_min_qty, 0), is_active = coalesce(p_active, true), updated_at = now() where id = p_id returning id into v_id;
    if v_id is null then raise exception 'STORE_ITEM_NOT_FOUND'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'STORE_ITEM_DUPLICATE';
end$$;

-- إدخال كمية للمخزن
create or replace function public.ops_store_receive(p_item uuid, p_qty numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public, app as $$
declare bal numeric;
begin
  perform app.require_ops_room();
  if p_qty is null or p_qty <= 0 then raise exception 'STORE_QTY_INVALID'; end if;
  update public.ops_store_items set qty_on_hand = qty_on_hand + p_qty, updated_at = now() where id = p_item returning qty_on_hand into bal;
  if bal is null then raise exception 'STORE_ITEM_NOT_FOUND'; end if;
  insert into public.ops_store_movements (item_id, kind, qty, balance_after, note, created_by) values (p_item, 'in', p_qty, bal, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  return bal;
end$$;

-- تسوية جرد (سبب إلزامي)
create or replace function public.ops_store_adjust(p_item uuid, p_new_qty numeric, p_reason text) returns numeric
language plpgsql security definer set search_path = public, app as $$
declare old numeric;
begin
  perform app.require_ops_room();
  if p_new_qty is null or p_new_qty < 0 then raise exception 'STORE_QTY_INVALID'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'STORE_REASON_REQUIRED'; end if;
  select qty_on_hand into old from public.ops_store_items where id = p_item for update;
  if old is null then raise exception 'STORE_ITEM_NOT_FOUND'; end if;
  update public.ops_store_items set qty_on_hand = p_new_qty, updated_at = now() where id = p_item;
  insert into public.ops_store_movements (item_id, kind, qty, balance_after, note, created_by) values (p_item, 'adjust', p_new_qty - old, p_new_qty, trim(p_reason), auth.uid());
  return p_new_qty;
end$$;

-- ═══════════════ ② طلبات المستلزمات (توسعة الجدول القائم 00044) ═══════════════
alter table public.sector_supply_requests
  add column if not exists items           jsonb not null default '[]'::jsonb,   -- [{item_id,name,unit,qty,delivered_qty}]
  add column if not exists chain_id        uuid references public.approval_chains(id) on delete set null,
  add column if not exists approval_status text not null default 'approved' check (approval_status in ('pending','approved','rejected','delivered','cancelled')),
  add column if not exists decided_at      timestamptz,
  add column if not exists delivered_at    timestamptz,
  add column if not exists delivered_by    uuid references auth.users(id),
  add column if not exists receiver_name   text,
  add column if not exists delivery_note   text,
  add column if not exists cancel_reason   text;
alter table public.sector_supply_requests drop constraint if exists sector_supply_requests_status_check;
alter table public.sector_supply_requests add constraint sector_supply_requests_status_check check (status in ('draft','submitted_to_deputy','in_approval','archived'));
create index if not exists sector_supply_requests_approval_idx on public.sector_supply_requests (approval_status, created_at desc);
drop policy if exists "supply: ops room read" on public.sector_supply_requests;
create policy "supply: ops room read" on public.sector_supply_requests for select to authenticated using (app.has_role(array['ops_room','super_admin','admin_ops','field_ops']));

create or replace function public.ops_store_items_list(p_include_inactive boolean default false)
returns table(id uuid, name text, unit text, qty_on_hand numeric, min_qty numeric, is_active boolean, low_stock boolean, reserved numeric, updated_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select i.id, i.name, i.unit, i.qty_on_hand, i.min_qty, i.is_active, i.qty_on_hand <= i.min_qty,
    coalesce((select sum((x ->> 'qty')::numeric) from public.sector_supply_requests r, jsonb_array_elements(r.items) x
              where r.approval_status = 'approved' and (x ->> 'item_id')::uuid = i.id), 0),
    i.updated_at
  from public.ops_store_items i
  where auth.uid() is not null and (p_include_inactive or i.is_active)
  order by i.name $$;

create or replace function public.ops_store_movements_list(p_item uuid default null, p_limit int default 100)
returns table(id uuid, item_id uuid, item_name text, unit text, kind text, qty numeric, balance_after numeric, request_id uuid, request_ref text, note text, by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_ops_room();
  return query
  select m.id, m.item_id, i.name, i.unit, m.kind, m.qty, m.balance_after, m.request_id, (select r.ref_no from public.sector_supply_requests r where r.id = m.request_id), m.note, app.manager_display_name(m.created_by), m.created_at
  from public.ops_store_movements m join public.ops_store_items i on i.id = m.item_id
  where p_item is null or m.item_id = p_item
  order by m.created_at desc limit p_limit;
end$$;

-- ═══ توسعة سلاسل الموافقات لنوع «مستلزمات» ═══
alter table public.approval_chains drop constraint if exists approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check check (request_type in ('leave','time_permit','supplies'));
alter table public.approval_tasks drop constraint if exists approval_tasks_request_kind_check;
alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (request_kind in ('leave','time_permit','supplies'));

create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
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

-- رابط صفحة الموافقات لكل دور (المعاون والمدير المفوض صار لهما صفحة طلبات الموافقة)
create or replace function app.approval_link_for(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then '/admin-ops/requests'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'department_manager') then '/manager/leaves'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'field_ops') then '/field-ops/requests'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'deputy_director') then '/deputy/approvals'
    when exists (select 1 from public.user_roles where user_id = p_user and role in ('executive_director','super_admin')) then '/executive/approvals'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'hr_officer') then '/hr/leaves'
    else '/' end $$;

-- ملخص نصي لطلب مستلزمات
create or replace function app.supply_summary(p_items jsonb) returns text language sql immutable as
$$ select string_agg((x ->> 'name') || ' × ' || (x ->> 'qty') || ' ' || coalesce(x ->> 'unit', ''), '، ') from jsonb_array_elements(p_items) x $$;

-- إشعار الخطوة: يدعم الإجازات/الزمنيات والمستلزمات
create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if p_kind = 'supplies' then
    select r.* into l from public.sector_supply_requests r where r.id = p_request;
    title := 'طلب مستلزمات بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.manager_name || ' · ' || coalesce(l.ref_no, '') || ' · ' || coalesce(app.supply_summary(l.items), l.supply_type);
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

-- إشعار غرفة العمليات بطلب جاهز للتسليم
create or replace function app.supply_notify_ops(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare r record; u uuid;
begin
  select * into r from public.sector_supply_requests where id = p_id;
  foreach u in array app.ops_room_users() loop
    perform app.hr_notify(u, 'طلب مستلزمات جاهز للتسليم: ' || coalesce(r.ref_no, ''), r.manager_name || ' · ' || coalesce(app.supply_summary(r.items), r.supply_type), '/ops-room/store', 'supply_ready:' || p_id::text || ':' || u::text, 'info');
  end loop;
end$$;

-- إنشاء طلب مستلزمات من قائمة المخزن (مسؤول القسم)
create or replace function public.supply_request_create(p_items jsonb, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid := auth.uid(); prof public.manager_profiles; x jsonb; it public.ops_store_items; clean jsonb := '[]'::jsonb; total numeric := 0; v_name text; v_ref text; v_num int; v_id uuid; v_chain uuid; q numeric;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  select * into prof from public.manager_profiles where user_id = v_uid;
  if prof.user_id is null then raise exception 'SUPPLY_MANAGER_ONLY'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'SUPPLY_ITEMS_REQUIRED'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    q := (x ->> 'qty')::numeric;
    if q is null or q <= 0 then raise exception 'SUPPLY_QTY_INVALID'; end if;
    select * into it from public.ops_store_items where id = (x ->> 'item_id')::uuid and is_active;
    if it.id is null then raise exception 'SUPPLY_ITEM_INVALID'; end if;
    if clean @> jsonb_build_array(jsonb_build_object('item_id', it.id)) then raise exception 'SUPPLY_ITEM_DUPLICATE'; end if;
    clean := clean || jsonb_build_object('item_id', it.id, 'name', it.name, 'unit', it.unit, 'qty', q, 'delivered_qty', null);
    total := total + q;
  end loop;
  select coalesce(full_name, '') into v_name from public.employees where user_id = v_uid limit 1;
  if v_name = '' then v_name := app.manager_display_name(v_uid); end if;
  select count(*) + 1 into v_num from public.sector_supply_requests where extract(year from created_at) = extract(year from now());
  v_ref := 'كتاب/مستلزمات/' || extract(year from now())::text || '/' || lpad(v_num::text, 4, '0');
  insert into public.sector_supply_requests (manager_id, manager_name, shift, sectors, supply_type, quantity, notes, signed, status, ref_no, submitted_at, items, approval_status)
  values (v_uid, v_name, prof.shift, prof.sectors, app.supply_summary(clean), greatest(1, round(total))::int, nullif(trim(coalesce(p_notes, '')), ''), true, 'in_approval', v_ref, now(), clean, 'pending')
  returning id into v_id;
  v_chain := app.approval_open('supplies', v_id, v_uid);
  if v_chain is null then
    -- بلا سلسلة مضبوطة: يصل غرفة العمليات مباشرة
    update public.sector_supply_requests set approval_status = 'approved', decided_at = now() where id = v_id;
    perform app.supply_notify_ops(v_id);
  else
    update public.sector_supply_requests set chain_id = v_chain where id = v_id;
  end if;
  return v_id;
end$$;

-- قرار خطوة في طلب مستلزمات
create or replace function public.supply_request_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare r record; fin boolean;
begin
  select * into r from public.sector_supply_requests where id = p_id;
  if r.id is null then raise exception 'SUPPLY_NOT_FOUND'; end if;
  if r.approval_status <> 'pending' then raise exception 'SUPPLY_NOT_PENDING'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 2 then raise exception 'APPROVAL_REASON_REQUIRED'; end if;
  fin := app.approval_decide('supplies', p_id, p_approve, p_note);
  if not fin then return; end if;
  if p_approve then
    update public.sector_supply_requests set approval_status = 'approved', decided_at = now() where id = p_id;
    perform app.hr_notify(r.manager_id, 'تمت الموافقة على طلب المستلزمات ' || coalesce(r.ref_no, ''), 'ينتظر التسليم من غرفة العمليات', '/manager/request', 'supply_approved:' || p_id::text, 'success');
    perform app.supply_notify_ops(p_id);
  else
    update public.sector_supply_requests set approval_status = 'rejected', decided_at = now() where id = p_id;
    perform app.hr_notify(r.manager_id, 'رُفض طلب المستلزمات ' || coalesce(r.ref_no, ''), coalesce(trim(p_note), ''), '/manager/request', 'supply_rejected:' || p_id::text, 'warning');
  end if;
end$$;

-- قرار موحّد حسب نوع الطلب (للواجهات)
create or replace function public.approval_decide_request(p_kind text, p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_kind = 'supplies' then perform public.supply_request_decide(p_request, p_approve, p_note);
  elsif p_kind in ('leave','time_permit') then perform public.hr_leave_decide(p_request, p_approve, p_note);
  else raise exception 'APPROVAL_TYPE_INVALID'; end if;
end$$;

-- التسليم من غرفة العمليات: كميات مسلَّمة ≤ المطلوب و≤ المخزون، اسم المستلم إلزامي، إنقاص المخزن بحركة
create or replace function public.supply_request_deliver(p_id uuid, p_receiver_name text, p_items jsonb default null, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare r record; x jsonb; req numeric; dq numeric; stock numeric; newitems jsonb := '[]'::jsonb; bal numeric;
begin
  perform app.require_ops_room();
  select * into r from public.sector_supply_requests where id = p_id for update;
  if r.id is null then raise exception 'SUPPLY_NOT_FOUND'; end if;
  if r.approval_status <> 'approved' then raise exception 'SUPPLY_NOT_READY'; end if;
  if length(trim(coalesce(p_receiver_name, ''))) < 2 then raise exception 'SUPPLY_RECEIVER_REQUIRED'; end if;
  for x in select * from jsonb_array_elements(r.items) loop
    req := (x ->> 'qty')::numeric;
    dq := coalesce((select (y ->> 'delivered_qty')::numeric from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) y where (y ->> 'item_id') = (x ->> 'item_id')), req);
    if dq < 0 or dq > req then raise exception 'SUPPLY_DELIVERED_QTY_INVALID'; end if;
    select qty_on_hand into stock from public.ops_store_items where id = (x ->> 'item_id')::uuid for update;
    if stock is null then raise exception 'STORE_ITEM_NOT_FOUND'; end if;
    if dq > stock then raise exception 'SUPPLY_STOCK_INSUFFICIENT: % (متوفر %)', x ->> 'name', stock; end if;
    if dq > 0 then
      update public.ops_store_items set qty_on_hand = qty_on_hand - dq, updated_at = now() where id = (x ->> 'item_id')::uuid returning qty_on_hand into bal;
      insert into public.ops_store_movements (item_id, kind, qty, balance_after, request_id, note, created_by) values ((x ->> 'item_id')::uuid, 'out', -dq, bal, p_id, 'تسليم ' || coalesce(r.ref_no, '') || ' إلى ' || trim(p_receiver_name), auth.uid());
    end if;
    newitems := newitems || (x || jsonb_build_object('delivered_qty', dq));
  end loop;
  update public.sector_supply_requests set approval_status = 'delivered', items = newitems, delivered_at = now(), delivered_by = auth.uid(), receiver_name = trim(p_receiver_name), delivery_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  perform app.hr_notify(r.manager_id, 'تم تسليم طلب المستلزمات ' || coalesce(r.ref_no, ''), 'استلمها: ' || trim(p_receiver_name), '/manager/request', 'supply_delivered:' || p_id::text, 'success');
end$$;

create or replace function public.supply_request_cancel(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
declare r record;
begin
  perform app.require_ops_room();
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'STORE_REASON_REQUIRED'; end if;
  select * into r from public.sector_supply_requests where id = p_id;
  if r.id is null then raise exception 'SUPPLY_NOT_FOUND'; end if;
  if r.approval_status not in ('pending','approved') then raise exception 'SUPPLY_NOT_PENDING'; end if;
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الطلب من غرفة العمليات' where request_kind = 'supplies' and request_id = p_id and status in ('pending','waiting');
  update public.sector_supply_requests set approval_status = 'cancelled', cancel_reason = trim(p_reason), decided_at = coalesce(decided_at, now()) where id = p_id;
  perform app.hr_notify(r.manager_id, 'أُلغي طلب المستلزمات ' || coalesce(r.ref_no, ''), trim(p_reason), '/manager/request', 'supply_cancelled:' || p_id::text, 'warning');
end$$;

-- قوائم: لغرفة العمليات ولمسؤول القسم
create or replace function public.supply_requests_list(p_scope text default 'open')
returns table(id uuid, ref_no text, manager_id uuid, manager_name text, shift text, areas text, parent_sector text, items jsonb, notes text, approval_status text, current_step text,
              created_at timestamptz, decided_at timestamptz, delivered_at timestamptz, receiver_name text, delivery_note text, cancel_reason text, delivered_by_name text)
language plpgsql stable security definer set search_path = public, app as $$
declare mine boolean := not app.has_role(array['ops_room','super_admin','admin_ops','field_ops','deputy_director','executive_director']);
begin
  return query
  select r.id, r.ref_no, r.manager_id, r.manager_name, r.shift,
    (select string_agg(s.name, '، ' order by s.id) from public.sectors s where s.id = any(r.sectors)),
    (select string_agg(distinct app.parent_sector_name(s.parent_sector), '، ') from public.sectors s where s.id = any(r.sectors)),
    r.items, r.notes, r.approval_status,
    (select t.step_label from public.approval_tasks t where t.request_kind = 'supplies' and t.request_id = r.id and t.status = 'pending' order by t.step_no limit 1),
    r.created_at, r.decided_at, r.delivered_at, r.receiver_name, r.delivery_note, r.cancel_reason, app.manager_display_name(r.delivered_by)
  from public.sector_supply_requests r
  where r.items <> '[]'::jsonb
    and (not mine or r.manager_id = auth.uid())
    and (mine and app.has_role(array['department_manager']) or not mine)
    and case p_scope when 'open' then r.approval_status in ('pending','approved') when 'ready' then r.approval_status = 'approved' when 'done' then r.approval_status in ('delivered','rejected','cancelled') else true end
  order by case r.approval_status when 'approved' then 0 when 'pending' then 1 else 2 end, r.created_at desc;
end$$;

-- ═══ مهام الموافقة: تشمل المستلزمات (عمود items جديد) ═══
drop function if exists public.approval_my_tasks();
create or replace function public.approval_my_tasks()
returns table(task_id uuid, request_kind text, request_id uuid, step_no int, total_steps int, step_label text, requester_user_id uuid, requester_name text, requester_role text, requester_role_label text,
              area_name text, parent_sector text, type_name text, start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, notes text, attachment_path text, created_at timestamptz, previous_steps jsonb, items jsonb, ref_no text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  with base as (
    select t.*, l.employee_id, e.user_id as req_user, e.full_name as req_name, lt.name as type_name, l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.notes, l.attachment_path, l.created_at as req_created, null::jsonb as items, null::text as ref_no
    from public.approval_tasks t join public.hr_leaves l on l.id = t.request_id and t.request_kind in ('leave','time_permit') join public.employees e on e.id = l.employee_id left join public.hr_leave_types lt on lt.id = l.leave_type_id
    where t.status = 'pending' and auth.uid() = any(t.approvers) and l.status = 'pending'
    union all
    select t.*, null, r.manager_id, r.manager_name, 'مستلزمات القواطع', null, null, null, null, null, null, r.notes, null, r.created_at, r.items, r.ref_no
    from public.approval_tasks t join public.sector_supply_requests r on r.id = t.request_id and t.request_kind = 'supplies'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and r.approval_status = 'pending'
  )
  select b.id, b.request_kind, b.request_id, b.step_no,
    (select count(*)::int from public.approval_tasks x where x.request_kind = b.request_kind and x.request_id = b.request_id and x.status <> 'skipped'),
    b.step_label, b.req_user, b.req_name, c.requester_role, app.approval_role_label(c.requester_role),
    (select string_agg(s.name, '، ') from public.sectors s where s.parent_sector = any(app.user_parent_sectors(b.req_user))
       and (s.id in (select cp.sector_id from public.contractor_profiles cp where cp.user_id = b.req_user and cp.is_active)
            or s.id in (select unnest(mp.sectors) from public.manager_profiles mp where mp.user_id = b.req_user))),
    (select string_agg(app.parent_sector_name(x), '، ') from unnest(app.user_parent_sectors(b.req_user)) x),
    b.type_name, b.start_date, b.end_date, b.start_time, b.end_time, b.days, b.minutes, b.notes, b.attachment_path, b.req_created,
    coalesce((select jsonb_agg(jsonb_build_object('step_no', p.step_no, 'label', p.step_label, 'status', p.status, 'decided_by', app.manager_display_name(p.decided_by), 'decided_at', p.decided_at, 'note', p.note) order by p.step_no)
              from public.approval_tasks p where p.request_kind = b.request_kind and p.request_id = b.request_id and p.step_no < b.step_no), '[]'::jsonb),
    b.items, b.ref_no
  from base b left join public.approval_chains c on c.id = b.chain_id
  order by b.req_created;
end$$;

-- المسار: يدعم المستلزمات
create or replace function public.approval_timeline(p_kind text, p_request uuid)
returns table(step_no int, step_label text, status text, approvers jsonb, decided_by_name text, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = public, app as $$
declare requester uuid;
begin
  if p_kind = 'supplies' then
    select r.manager_id into requester from public.sector_supply_requests r where r.id = p_request;
  else
    select e.user_id into requester from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id where l1.id = p_request;
  end if;
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

-- ═══ الصلاحيات ═══
revoke all on function public.ops_store_item_save(uuid, text, text, numeric, boolean) from public, anon;
revoke all on function public.ops_store_receive(uuid, numeric, text) from public, anon;
revoke all on function public.ops_store_adjust(uuid, numeric, text) from public, anon;
revoke all on function public.ops_store_items_list(boolean) from public, anon;
revoke all on function public.ops_store_movements_list(uuid, int) from public, anon;
revoke all on function public.supply_request_create(jsonb, text) from public, anon;
revoke all on function public.supply_request_decide(uuid, boolean, text) from public, anon;
revoke all on function public.approval_decide_request(text, uuid, boolean, text) from public, anon;
revoke all on function public.supply_request_deliver(uuid, text, jsonb, text) from public, anon;
revoke all on function public.supply_request_cancel(uuid, text) from public, anon;
revoke all on function public.supply_requests_list(text) from public, anon;
revoke all on function public.approval_my_tasks() from public, anon;
grant execute on function public.ops_store_item_save(uuid, text, text, numeric, boolean), public.ops_store_receive(uuid, numeric, text), public.ops_store_adjust(uuid, numeric, text),
  public.ops_store_items_list(boolean), public.ops_store_movements_list(uuid, int), public.supply_request_create(jsonb, text), public.supply_request_decide(uuid, boolean, text),
  public.approval_decide_request(text, uuid, boolean, text), public.supply_request_deliver(uuid, text, jsonb, text), public.supply_request_cancel(uuid, text),
  public.supply_requests_list(text), public.approval_my_tasks() to authenticated;
