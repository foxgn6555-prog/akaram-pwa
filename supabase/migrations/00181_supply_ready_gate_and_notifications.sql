-- 00181 · طلبات مسؤولي الأقسام (المستلزمات): بوابة «جاهز للتسليم» من غرفة العمليات + إشعارات الطرفين
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- قبل: اكتمال الموافقات = «جاهز للتسليم» فوراً. الآن:
--   pending (قيد الموافقة) → approved (موافَق عليه — غير جاهز للتسليم) → ready (أعلنته غرفة العمليات جاهزاً) → delivered
-- • غرفة العمليات لا تستطيع إعلان الجاهزية وفي الطلب موافقات معلّقة (SUPPLY_APPROVAL_PENDING).
-- • التسليم لا يتم إلا لطلب ready (SUPPLY_NOT_READY).
-- • إشعارات: المسؤول يُبلَّغ بإرسال طلبه، وبتقدم كل خطوة، وباكتمال الموافقات (غير جاهز بعد)، وبالجاهزية، وبالتسليم/الرفض/الإلغاء.
--   غرفة العمليات تُبلَّغ بطلب جديد دخل الموافقات، وباكتمال الموافقات (بانتظار التجهيز)، وبإعلان الجاهزية (من زميل)، وبانخفاض مخزون مادة تحت الحدّ الأدنى بعد التسليم.

alter table public.sector_supply_requests drop constraint if exists sector_supply_requests_approval_status_check;
alter table public.sector_supply_requests add constraint sector_supply_requests_approval_status_check check (approval_status in ('pending','approved','ready','rejected','delivered','cancelled'));
alter table public.sector_supply_requests
  add column if not exists ready_at timestamptz,
  add column if not exists ready_by uuid references auth.users(id) on delete set null,
  add column if not exists ready_note text;

-- إشعار غرفة العمليات (نص وعنوان متغيّران)
create or replace function app.supply_notify_ops(p_id uuid, p_title text default null, p_type text default 'info') returns void language plpgsql security definer set search_path = public, app as $$
declare r record; u uuid; k text;
begin
  select * into r from public.sector_supply_requests where id = p_id;
  k := left(md5(coalesce(p_title, 'ready')), 10);
  foreach u in array app.ops_room_users() loop
    if u = auth.uid() then continue; end if;
    perform app.hr_notify(u, coalesce(p_title, 'اكتملت موافقات طلب مستلزمات — بانتظار التجهيز') || ': ' || coalesce(r.ref_no, ''), r.manager_name || ' · ' || coalesce(app.supply_summary(r.items), r.supply_type), '/ops-room/store', 'supply:' || k || ':' || p_id::text || ':' || u::text, p_type);
  end loop;
end$$;

-- الإنشاء: إشعار المسؤول بالتأكيد + إشعار غرفة العمليات
create or replace function public.supply_request_create(p_items jsonb, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid := auth.uid(); prof public.manager_profiles; x jsonb; it public.ops_store_items; clean jsonb := '[]'::jsonb; total numeric := 0; v_name text; v_ref text; v_num int; v_id uuid; v_chain uuid; q numeric; v_step text;
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
    -- بلا سلسلة مضبوطة: موافَق عليه مباشرة لكنه غير جاهز حتى تجهّزه غرفة العمليات
    update public.sector_supply_requests set approval_status = 'approved', decided_at = now() where id = v_id;
    perform app.hr_notify(v_uid, 'أُرسل طلب المستلزمات ' || v_ref, 'لا يحتاج موافقات · غير جاهز للتسليم حتى تجهّزه غرفة العمليات', '/manager/request', 'supply_sent:' || v_id::text, 'info');
    perform app.supply_notify_ops(v_id, 'طلب مستلزمات جديد بانتظار التجهيز', 'info');
  else
    update public.sector_supply_requests set chain_id = v_chain where id = v_id;
    select t.step_label into v_step from public.approval_tasks t where t.request_kind = 'supplies' and t.request_id = v_id and t.status = 'pending' order by t.step_no limit 1;
    perform app.hr_notify(v_uid, 'أُرسل طلب المستلزمات ' || v_ref, 'بانتظار موافقة: ' || coalesce(v_step, '—') || ' · غير جاهز للتسليم', '/manager/request', 'supply_sent:' || v_id::text, 'info');
    perform app.supply_notify_ops(v_id, 'طلب مستلزمات جديد دخل الموافقات', 'info');
  end if;
  return v_id;
end$$;

-- القرار: تقدّم الخطوات يُبلَّغ به المسؤول؛ اكتمال الموافقات ≠ جاهز
create or replace function public.supply_request_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare r record; fin boolean; v_step text; v_done int;
begin
  select * into r from public.sector_supply_requests where id = p_id;
  if r.id is null then raise exception 'SUPPLY_NOT_FOUND'; end if;
  if r.approval_status <> 'pending' then raise exception 'SUPPLY_NOT_PENDING'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 2 then raise exception 'APPROVAL_REASON_REQUIRED'; end if;
  fin := app.approval_decide('supplies', p_id, p_approve, p_note);
  if not fin then
    if p_approve then
      select count(*) into v_done from public.approval_tasks t where t.request_kind = 'supplies' and t.request_id = p_id and t.status = 'approved';
      select t.step_label into v_step from public.approval_tasks t where t.request_kind = 'supplies' and t.request_id = p_id and t.status = 'pending' order by t.step_no limit 1;
      perform app.hr_notify(r.manager_id, 'وافقت خطوة ' || v_done || ' على طلب المستلزمات ' || coalesce(r.ref_no, ''), 'انتقل إلى: ' || coalesce(v_step, '—'), '/manager/request', 'supply_step:' || p_id::text || ':' || v_done, 'info');
    end if;
    return;
  end if;
  if p_approve then
    update public.sector_supply_requests set approval_status = 'approved', decided_at = now() where id = p_id;
    perform app.hr_notify(r.manager_id, 'اكتملت موافقات طلب المستلزمات ' || coalesce(r.ref_no, ''), 'غير جاهز للتسليم بعد — ستبلغك غرفة العمليات عند تجهيزه', '/manager/request', 'supply_approved:' || p_id::text, 'success');
    perform app.supply_notify_ops(p_id, 'اكتملت موافقات طلب مستلزمات — بانتظار التجهيز', 'info');
  else
    update public.sector_supply_requests set approval_status = 'rejected', decided_at = now() where id = p_id;
    perform app.hr_notify(r.manager_id, 'رُفض طلب المستلزمات ' || coalesce(r.ref_no, ''), coalesce(trim(p_note), ''), '/manager/request', 'supply_rejected:' || p_id::text, 'warning');
  end if;
end$$;

-- إعلان الجاهزية من غرفة العمليات: ممنوع مع موافقات معلّقة
create or replace function public.supply_request_mark_ready(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare r record; n int;
begin
  perform app.require_ops_room();
  select * into r from public.sector_supply_requests where id = p_id for update;
  if r.id is null then raise exception 'SUPPLY_NOT_FOUND'; end if;
  select count(*) into n from public.approval_tasks t where t.request_kind = 'supplies' and t.request_id = p_id and t.status in ('pending','waiting');
  if r.approval_status = 'pending' or n > 0 then raise exception 'SUPPLY_APPROVAL_PENDING'; end if;
  if r.approval_status <> 'approved' then raise exception 'SUPPLY_NOT_APPROVED'; end if;
  update public.sector_supply_requests set approval_status = 'ready', ready_at = now(), ready_by = auth.uid(), ready_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  perform app.hr_notify(r.manager_id, 'طلب المستلزمات ' || coalesce(r.ref_no, '') || ' جاهز للتسليم', 'راجع غرفة العمليات لاستلامه' || case when nullif(trim(coalesce(p_note, '')), '') is not null then ' · ' || trim(p_note) else '' end, '/manager/request', 'supply_ready_mgr:' || p_id::text, 'success');
  perform app.supply_notify_ops(p_id, 'أُعلن طلب مستلزمات جاهزاً للتسليم (' || app.manager_display_name(auth.uid()) || ')', 'info');
end$$;
revoke all on function public.supply_request_mark_ready(uuid, text) from public, anon;
grant execute on function public.supply_request_mark_ready(uuid, text) to authenticated;

-- التسليم: لطلب ready فقط + تنبيه انخفاض المخزون
create or replace function public.supply_request_deliver(p_id uuid, p_receiver_name text, p_items jsonb default null, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare r record; x jsonb; req numeric; dq numeric; stock numeric; newitems jsonb := '[]'::jsonb; bal numeric; v_min numeric; u uuid; low text := '';
begin
  perform app.require_ops_room();
  select * into r from public.sector_supply_requests where id = p_id for update;
  if r.id is null then raise exception 'SUPPLY_NOT_FOUND'; end if;
  if r.approval_status <> 'ready' then raise exception 'SUPPLY_NOT_READY'; end if;
  if length(trim(coalesce(p_receiver_name, ''))) < 2 then raise exception 'SUPPLY_RECEIVER_REQUIRED'; end if;
  for x in select * from jsonb_array_elements(r.items) loop
    req := (x ->> 'qty')::numeric;
    dq := coalesce((select (y ->> 'delivered_qty')::numeric from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) y where (y ->> 'item_id') = (x ->> 'item_id')), req);
    if dq < 0 or dq > req then raise exception 'SUPPLY_DELIVERED_QTY_INVALID'; end if;
    select qty_on_hand, min_qty into stock, v_min from public.ops_store_items where id = (x ->> 'item_id')::uuid for update;
    if stock is null then raise exception 'STORE_ITEM_NOT_FOUND'; end if;
    if dq > stock then raise exception 'SUPPLY_STOCK_INSUFFICIENT: % (متوفر %)', x ->> 'name', stock; end if;
    if dq > 0 then
      update public.ops_store_items set qty_on_hand = qty_on_hand - dq, updated_at = now() where id = (x ->> 'item_id')::uuid returning qty_on_hand into bal;
      insert into public.ops_store_movements (item_id, kind, qty, balance_after, request_id, note, created_by) values ((x ->> 'item_id')::uuid, 'out', -dq, bal, p_id, 'تسليم ' || coalesce(r.ref_no, '') || ' إلى ' || trim(p_receiver_name), auth.uid());
      if bal < v_min and stock >= v_min then low := low || case when low = '' then '' else '، ' end || (x ->> 'name') || ' (' || bal || ')'; end if;
    end if;
    newitems := newitems || (x || jsonb_build_object('delivered_qty', dq));
  end loop;
  update public.sector_supply_requests set approval_status = 'delivered', items = newitems, delivered_at = now(), delivered_by = auth.uid(), receiver_name = trim(p_receiver_name), delivery_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  perform app.hr_notify(r.manager_id, 'تم تسليم طلب المستلزمات ' || coalesce(r.ref_no, ''), 'استلمها: ' || trim(p_receiver_name), '/manager/request', 'supply_delivered:' || p_id::text, 'success');
  if low <> '' then
    foreach u in array app.ops_room_users() loop
      perform app.hr_notify(u, 'مواد نزلت تحت الحدّ الأدنى في المخزن', low, '/ops-room/store', 'store_low:' || p_id::text || ':' || u::text, 'warning');
    end loop;
  end if;
end$$;

-- الإلغاء: يشمل الحالة ready
create or replace function public.supply_request_cancel(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
declare r record;
begin
  perform app.require_ops_room();
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'STORE_REASON_REQUIRED'; end if;
  select * into r from public.sector_supply_requests where id = p_id;
  if r.id is null then raise exception 'SUPPLY_NOT_FOUND'; end if;
  if r.approval_status not in ('pending','approved','ready') then raise exception 'SUPPLY_NOT_PENDING'; end if;
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الطلب من غرفة العمليات' where request_kind = 'supplies' and request_id = p_id and status in ('pending','waiting');
  update public.sector_supply_requests set approval_status = 'cancelled', cancel_reason = trim(p_reason), decided_at = coalesce(decided_at, now()) where id = p_id;
  perform app.hr_notify(r.manager_id, 'أُلغي طلب المستلزمات ' || coalesce(r.ref_no, ''), trim(p_reason), '/manager/request', 'supply_cancelled:' || p_id::text, 'warning');
end$$;

-- المحجوز على المادة = الطلبات الموافَق عليها أو الجاهزة ولم تُسلَّم بعد
create or replace function public.ops_store_items_list(p_include_inactive boolean default false)
returns table(id uuid, name text, unit text, qty_on_hand numeric, min_qty numeric, is_active boolean, low_stock boolean, reserved numeric, updated_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select i.id, i.name, i.unit, i.qty_on_hand, i.min_qty, i.is_active, i.qty_on_hand <= i.min_qty,
    coalesce((select sum((x ->> 'qty')::numeric) from public.sector_supply_requests r, jsonb_array_elements(r.items) x
              where r.approval_status in ('approved','ready') and (x ->> 'item_id')::uuid = i.id), 0),
    i.updated_at
  from public.ops_store_items i
  where auth.uid() is not null and (p_include_inactive or i.is_active)
  order by i.name $$;

-- القوائم: أعمدة الجاهزية + ترتيب ready أولاً
drop function if exists public.supply_requests_list(text);
create or replace function public.supply_requests_list(p_scope text default 'open')
returns table(id uuid, ref_no text, manager_id uuid, manager_name text, shift text, areas text, parent_sector text, items jsonb, notes text, approval_status text, current_step text,
              created_at timestamptz, decided_at timestamptz, delivered_at timestamptz, receiver_name text, delivery_note text, cancel_reason text, delivered_by_name text,
              ready_at timestamptz, ready_by_name text, ready_note text, pending_steps int)
language plpgsql stable security definer set search_path = public, app as $$
declare mine boolean := not app.has_role(array['ops_room','super_admin','admin_ops','field_ops','deputy_director','executive_director']);
begin
  return query
  select r.id, r.ref_no, r.manager_id, r.manager_name, r.shift,
    (select string_agg(s.name, '، ' order by s.id) from public.sectors s where s.id = any(r.sectors)),
    (select string_agg(distinct app.parent_sector_name(s.parent_sector), '، ') from public.sectors s where s.id = any(r.sectors)),
    r.items, r.notes, r.approval_status,
    (select t.step_label from public.approval_tasks t where t.request_kind = 'supplies' and t.request_id = r.id and t.status = 'pending' order by t.step_no limit 1),
    r.created_at, r.decided_at, r.delivered_at, r.receiver_name, r.delivery_note, r.cancel_reason, app.manager_display_name(r.delivered_by),
    r.ready_at, app.manager_display_name(r.ready_by), r.ready_note,
    (select count(*)::int from public.approval_tasks t where t.request_kind = 'supplies' and t.request_id = r.id and t.status in ('pending','waiting'))
  from public.sector_supply_requests r
  where r.items <> '[]'::jsonb
    and (not mine or r.manager_id = auth.uid())
    and (mine and app.has_role(array['department_manager']) or not mine)
    and case p_scope when 'open' then r.approval_status in ('pending','approved','ready') when 'ready' then r.approval_status = 'ready' when 'done' then r.approval_status in ('delivered','rejected','cancelled') else true end
  order by case r.approval_status when 'ready' then 0 when 'approved' then 1 when 'pending' then 2 else 3 end, r.created_at desc;
end$$;
revoke all on function public.supply_requests_list(text) from public, anon;
grant execute on function public.supply_requests_list(text) to authenticated;
