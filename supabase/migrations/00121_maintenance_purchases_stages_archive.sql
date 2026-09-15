-- ═══════════════════════════════════════════════════════════════════
-- 00121 · مشتريات الصيانة + المخزون الأقسام + مراحل الصيانة الخمس + الأرشيف
--
--  · تصنيف القطعة: mechanical (ميكانيكي) · electrical (كهرباء) ·
--    bodywork (سمكرة) · metalwork (حدادة) · other (أخرى)
--  · أوامر شراء يكتبها أصحاب الصيانة — السعر بالدينار العراقي،
--    المادة تدخل المخزون مباشرة والمبلغ يصل بوابة الشؤون المالية
--  · خمس مراحل لصيانة الآلية: الاستلام → تشخيص العطل → الإصلاح
--    (وبانتظار القطع) → الفحص واعتماد الجاهزية → التسليم
--  · استعلامات الأرشيف والمشتريات المالية
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) قسم القطعة في أصناف المخزون ───
alter table public.maintenance_inventory_items
  add column if not exists part_category text not null default 'other'
  check (part_category in ('mechanical', 'electrical', 'bodywork', 'metalwork', 'other'));

create index if not exists maintenance_inventory_items_category
  on public.maintenance_inventory_items (part_category);

comment on column public.maintenance_inventory_items.part_category is
  'قسم المخزن: mechanical ميكانيكي · electrical كهرباء · bodywork سمكرة · metalwork حدادة · other أخرى';

-- ─── 2) أوامر مشتريات الصيانة ───
create sequence if not exists public.maintenance_purchase_order_seq;

create table public.maintenance_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  supplier_name text,
  notes text,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create index if not exists maintenance_purchase_orders_time
  on public.maintenance_purchase_orders (created_at desc);

comment on table public.maintenance_purchase_orders is
  'أوامر شراء قطع الصيانة — يملأها أصحاب الصيانة والمبالغ بالدينار العراقي وتصل الشؤون المالية';

alter table public.maintenance_purchase_orders enable row level security;
create policy "maintenance purchases: قراءة" on public.maintenance_purchase_orders
  for select to authenticated
  using (app.has_role(array['maintenance', 'ops_room', 'super_admin', 'finance_officer']));

create table public.maintenance_purchase_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.maintenance_purchase_orders(id) on delete cascade,
  part_category text not null
    check (part_category in ('mechanical', 'electrical', 'bodywork', 'metalwork', 'other')),
  item_name text not null check (length(trim(item_name)) between 2 and 200),
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null default 'قطعة',
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  inventory_item_id uuid references public.maintenance_inventory_items(id),
  movement_id uuid references public.maintenance_inventory_movements(id),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create index if not exists maintenance_purchase_items_order
  on public.maintenance_purchase_items (order_id);

comment on table public.maintenance_purchase_items is
  'أصناف أمر الشراء — كل صنف له قسمه (ميكانيكا/كهرباء/سمكرة/حدادة/أخرى) وثمن بالدينار العراقي';

alter table public.maintenance_purchase_items enable row level security;
create policy "maintenance purchase items: قراءة" on public.maintenance_purchase_items
  for select to authenticated
  using (app.has_role(array['maintenance', 'ops_room', 'super_admin', 'finance_officer']));

create trigger trg_audit_maintenance_purchase_orders
  after insert or update or delete on public.maintenance_purchase_orders
  for each row execute function app.audit_trigger();

create trigger trg_audit_maintenance_purchase_items
  after insert or update or delete on public.maintenance_purchase_items
  for each row execute function app.audit_trigger();

-- ─── 3) مراحل صيانة الآلية (خمسة) ───
create table public.vehicle_maintenance_stages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vehicle_maintenance_cases(id) on delete cascade,
  stage_key text not null
    check (stage_key in ('arrival', 'diagnosis', 'repair', 'inspection', 'handover')),
  stage_no smallint not null check (stage_no between 1 and 5),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'completed')),
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  started_by uuid references auth.users(id),
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (case_id, stage_key)
);

create index if not exists vehicle_maintenance_stages_case
  on public.vehicle_maintenance_stages (case_id, stage_no);

comment on table public.vehicle_maintenance_stages is
  'مراحل الصيانة: arrival الاستلام · diagnosis تشخيص العطل · repair الإصلاح وبانتظار القطع · inspection الفحص واعتماد الجاهزية · handover التسليم';

alter table public.vehicle_maintenance_stages enable row level security;
create policy "maintenance stages: قراءة" on public.vehicle_maintenance_stages
  for select to authenticated
  using (app.has_role(array['maintenance', 'ops_room', 'super_admin']));

-- بذرة: خمس مراحل لكل حالة صيانة جديدة (الاستلام نشط من البداية)
create or replace function app.seed_maintenance_stages()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.vehicle_maintenance_stages
    (case_id, stage_key, stage_no, status, started_at, started_by)
  values
    (new.id, 'arrival',    1, 'active',  now(),    auth.uid()),
    (new.id, 'diagnosis',  2, 'pending', null,     null),
    (new.id, 'repair',     3, 'pending', null,     null),
    (new.id, 'inspection', 4, 'pending', null,     null),
    (new.id, 'handover',   5, 'pending', null,     null);
  return new;
end;
$$;

create trigger trg_maintenance_case_stages
  after insert on public.vehicle_maintenance_cases
  for each row execute function app.seed_maintenance_stages();

-- ترحيل الحالات القائمة إلى المراحل حسب وضعها الحالي
do $$
declare
  c record;
  cs integer;
begin
  for c in
    select v.id, v.status, v.arrived_at, v.completed_at, v.readiness_approved_at
    from public.vehicle_maintenance_cases v
    where not exists (
      select 1 from public.vehicle_maintenance_stages s where s.case_id = v.id
    )
  loop
    cs := case
      when c.completed_at is not null then 6
      when c.readiness_approved_at is not null then 5
      when c.status in ('waiting_parts', 'in_repair') then 3
      when c.status = 'diagnosing' then 2
      when c.arrived_at is not null then 2
      else 1
    end;
    insert into public.vehicle_maintenance_stages
      (case_id, stage_key, stage_no, status, started_at, completed_at)
    select c.id, k.key, k.no,
           case
             when k.no < cs then 'completed'
             when k.no = cs and cs <= 5 then 'active'
             else 'pending'
           end,
           case when k.no = cs and cs <= 5 then now() end,
           case when k.no < cs then coalesce(c.completed_at, now()) end
    from (values
      ('arrival', 1), ('diagnosis', 2), ('repair', 3),
      ('inspection', 4), ('handover', 5)
    ) as k(key, no);
  end loop;
end;
$$;

-- ─── 4) دوال الأعمال ───

-- إنشاء أمر شراء: أصناف متعددة، كل صنف يدخل قسمه في المخزون مباشرة
create or replace function public.maintenance_purchase_create(
  p_supplier_name text default null,
  p_notes text default null,
  p_items jsonb default null
)
returns public.maintenance_purchase_orders
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  o public.maintenance_purchase_orders;
  it jsonb;
  v_category text;
  v_name text;
  v_qty numeric;
  v_unit text;
  v_price numeric;
  v_total numeric;
  inv public.maintenance_inventory_items;
  mv public.maintenance_inventory_movements;
  new_qty numeric;
  new_cost numeric;
  v_total_amount numeric := 0;
  v_count integer := 0;
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'MAINTENANCE_PURCHASE_ITEMS_INVALID';
  end if;

  insert into public.maintenance_purchase_orders
    (order_number, supplier_name, notes, created_by)
  values (
    'MP-' || to_char(now() at time zone 'Asia/Baghdad', 'YYYY') || '-'
      || lpad(nextval('public.maintenance_purchase_order_seq')::text, 4, '0'),
    nullif(trim(coalesce(p_supplier_name, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  ) returning * into o;

  for it in select * from jsonb_array_elements(p_items) loop
    v_category := it->>'part_category';
    v_name := it->>'item_name';
    v_qty := (it->>'quantity')::numeric;
    v_unit := coalesce(nullif(trim(coalesce(it->>'unit', '')), ''), 'قطعة');
    v_price := (it->>'unit_price')::numeric;

    if v_category not in ('mechanical', 'electrical', 'bodywork', 'metalwork', 'other')
       or length(coalesce(trim(v_name), '')) < 2
       or length(v_name) > 200
       or v_qty <= 0
       or v_price < 0 then
      raise exception 'MAINTENANCE_PURCHASE_ITEM_INVALID';
    end if;

    v_total := round(v_qty * v_price, 2);
    v_total_amount := v_total_amount + v_total;
    v_count := v_count + 1;

    -- البحث عن الصنف في قسمه (نفس الاسم والقسم) أو إنشاؤه
    select * into inv
    from public.maintenance_inventory_items
    where is_active and part_category = v_category and item_name = trim(v_name)
    order by created_at
    limit 1
    for update;

    if found then
      new_qty := inv.current_quantity + v_qty;
      new_cost := case
        when new_qty = 0 then 0
        else round(((inv.current_quantity * inv.average_unit_cost) + (v_qty * v_price)) / new_qty, 2)
      end;
      update public.maintenance_inventory_items
         set current_quantity = new_qty,
             average_unit_cost = new_cost,
             updated_at = now()
       where id = inv.id;
    else
      insert into public.maintenance_inventory_items
        (sku, item_name, unit, part_category, current_quantity, average_unit_cost, created_by)
      values (
        'MP' || lpad(nextval('public.maintenance_purchase_order_seq')::text, 6, '0'),
        trim(v_name), v_unit, v_category, v_qty, v_price, auth.uid()
      ) returning * into inv;
      new_qty := v_qty;
    end if;

    insert into public.maintenance_inventory_movements
      (item_id, movement_type, quantity, unit_cost, balance_after, notes, created_by)
    values (
      inv.id, 'receipt', v_qty, v_price, new_qty,
      'أمر شراء ' || o.order_number, auth.uid()
    ) returning * into mv;

    insert into public.maintenance_purchase_items
      (order_id, part_category, item_name, quantity, unit, unit_price,
       total_amount, inventory_item_id, movement_id, created_by)
    values (
      o.id, v_category, trim(v_name), v_qty, v_unit, v_price,
      v_total, inv.id, mv.id, auth.uid()
    );
  end loop;

  update public.maintenance_purchase_orders
     set total_amount = v_total_amount, item_count = v_count
   where id = o.id
   returning * into o;

  return o;
end;
$$;

-- سجل المشتريات لبوابة الصيانة (أحدث أوامر)
create or replace function public.maintenance_purchases_list(
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.maintenance_purchase_orders
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  return query
  select * from public.maintenance_purchase_orders
  order by created_at desc
  limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- تفاصيل أمر شراء (جدول الأصناف)
create or replace function public.maintenance_purchase_detail(p_order_id uuid)
returns table(
  order_number text,
  supplier_name text,
  notes text,
  created_at timestamptz,
  total_amount numeric,
  part_category text,
  item_name text,
  quantity numeric,
  unit text,
  unit_price numeric,
  line_total numeric
)
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  return query
  select o.order_number, o.supplier_name, o.notes, o.created_at, o.total_amount,
         i.part_category, i.item_name, i.quantity, i.unit, i.unit_price, i.total_amount
    from public.maintenance_purchase_items i
    join public.maintenance_purchase_orders o on o.id = i.order_id
   where o.id = p_order_id
   order by i.created_at;
end;
$$;

-- سجل المشتريات المالي (يغذي قسم «مشتريات الصيانة» في بوابة الشؤون المالية)
create or replace function public.maintenance_purchases_finance(
  p_from date default null,
  p_to date default null,
  p_search text default null
)
returns table(
  order_id uuid,
  order_number text,
  supplier_name text,
  notes text,
  order_date timestamptz,
  part_category text,
  item_name text,
  quantity numeric,
  unit text,
  unit_price numeric,
  line_total numeric
)
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then
    raise exception 'FINANCE_FORBIDDEN';
  end if;
  return query
  select o.id, o.order_number, o.supplier_name, o.notes, o.created_at,
         i.part_category, i.item_name, i.quantity, i.unit, i.unit_price, i.total_amount
    from public.maintenance_purchase_items i
    join public.maintenance_purchase_orders o on o.id = i.order_id
   where (p_from is null or (o.created_at at time zone 'Asia/Baghdad')::date >= p_from)
     and (p_to is null or (o.created_at at time zone 'Asia/Baghdad')::date <= p_to)
     and (p_search is null
          or trim(p_search) = ''
          or i.item_name ilike '%' || trim(p_search) || '%'
          or coalesce(o.supplier_name, '') ilike '%' || trim(p_search) || '%'
          or o.order_number ilike '%' || trim(p_search) || '%')
   order by o.created_at desc, i.created_at;
end;
$$;

-- أرشيف الصيانة: الحالات المكتملة مع الملخصات
create or replace function public.maintenance_archive_list(
  p_search text default null,
  p_from date default null,
  p_to date default null
)
returns table(
  case_id uuid,
  vehicle_name text,
  db_number text,
  driver_name text,
  shift text,
  area_name text,
  manager_name text,
  fault_type text,
  priority text,
  reported_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  final_status text,
  diagnosis text,
  progress smallint,
  service_cost numeric,
  parts_actual_cost numeric,
  actual_cost numeric,
  parts_count integer,
  duration_days numeric
)
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  return query
  select c.id, v.vehicle_name, v.db_number, d.driver_name, d.shift,
         s.name, d.recipient_manager_name, c.fault_type, c.priority,
         c.reported_at, c.arrived_at, c.completed_at, c.status,
         c.diagnosis, c.progress,
         c.service_cost, c.parts_actual_cost, coalesce(c.actual_cost, 0),
         (select count(*)::int from public.vehicle_maintenance_parts p
           where p.case_id = c.id and p.part_status in ('issued', 'installed')),
         round(extract(epoch from (c.completed_at - c.reported_at)) / 86400.0, 1)
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
   where c.completed_at is not null
     and (p_from is null or (c.completed_at at time zone 'Asia/Baghdad')::date >= p_from)
     and (p_to is null or (c.completed_at at time zone 'Asia/Baghdad')::date <= p_to)
     and (p_search is null
          or trim(p_search) = ''
          or v.vehicle_name ilike '%' || trim(p_search) || '%'
          or v.db_number ilike '%' || trim(p_search) || '%'
          or d.driver_name ilike '%' || trim(p_search) || '%')
   order by c.completed_at desc
   limit 200;
end;
$$;

-- تدرّج المرحلة النشطة (المراحل 1-3؛ الرابعة تُغلق بالاعتماد والخامسة بالتسليم)
create or replace function public.maintenance_advance_stage(
  p_case_id uuid,
  p_diagnosis text default null,
  p_notes text default null
)
returns public.vehicle_maintenance_cases
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  cur public.vehicle_maintenance_stages;
  nxt public.vehicle_maintenance_stages;
  c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;

  select * into c from public.vehicle_maintenance_cases
   where id = p_case_id
   for update;
  if not found then
    raise exception 'MAINTENANCE_CASE_NOT_FOUND';
  end if;
  if c.completed_at is not null then
    raise exception 'MAINTENANCE_CASE_CLOSED';
  end if;
  if c.arrived_at is null then
    raise exception 'MAINTENANCE_ARRIVAL_REQUIRED';
  end if;

  select * into cur from public.vehicle_maintenance_stages
   where case_id = p_case_id and status = 'active'
   for update;
  if not found then
    raise exception 'MAINTENANCE_STAGE_NOT_ACTIVE';
  end if;

  -- تشخيص العطل إلزامي لإكمال المرحلة الثانية
  if cur.stage_key = 'diagnosis' and length(coalesce(trim(p_diagnosis), '')) < 5 then
    raise exception 'MAINTENANCE_DIAGNOSIS_REQUIRED';
  end if;
  -- الفحص واعتماد الجاهزية تُغلق بزر الاعتماد فقط
  if cur.stage_key = 'inspection' then
    raise exception 'MAINTENANCE_STAGE_REQUIRES_APPROVAL';
  end if;
  -- التسليم يُغلق بإرسال الآلية
  if cur.stage_key = 'handover' then
    raise exception 'MAINTENANCE_STAGE_REQUIRES_DISPATCH';
  end if;

  update public.vehicle_maintenance_stages
     set status = 'completed',
         completed_at = now(),
         completed_by = u,
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
   where id = cur.id;

  if cur.stage_key = 'diagnosis' then
    update public.vehicle_maintenance_cases
       set diagnosis = trim(p_diagnosis),
           status = 'in_repair',
           progress = greatest(coalesce(progress, 0), 30),
           updated_at = now()
     where id = p_case_id;
  elsif cur.stage_key = 'repair' then
    update public.vehicle_maintenance_cases
       set progress = greatest(coalesce(progress, 0), 70),
           updated_at = now()
     where id = p_case_id;
  end if;

  select * into nxt from public.vehicle_maintenance_stages
   where case_id = p_case_id and status = 'pending'
   order by stage_no
   limit 1;
  if found then
    update public.vehicle_maintenance_stages
       set status = 'active',
           started_at = now(),
           started_by = u
     where id = nxt.id;
  end if;

  -- إعادة قراءة الحالة بعد التحديثات (الإرجاع يعكس الوضع الجديد)
  select * into c from public.vehicle_maintenance_cases where id = p_case_id;
  return c;
end;
$$;

-- ─── 5) تحديثات الدوال القائمة (تزامن المراحل + قسم القطعة) ───

-- تأكيد الوصول = إكمال مرحلة الاستلام وبدء مرحلة التشخيص
create or replace function public.maintenance_confirm_arrival(p_case_id uuid, p_notes text default null)
returns public.vehicle_maintenance_cases
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  c public.vehicle_maintenance_cases;
  l public.vehicle_trip_legs;
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  update public.vehicle_maintenance_cases
     set status = 'diagnosing',
         arrived_at = now(),
         updated_at = now()
   where id = p_case_id and status = 'to_maintenance'
   returning * into c;
  if not found then
    raise exception 'MAINTENANCE_ARRIVAL_NOT_ALLOWED';
  end if;

  update public.vehicle_maintenance_stages
     set status = 'completed',
         completed_at = now(),
         completed_by = u,
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
   where case_id = c.id and stage_key = 'arrival';
  update public.vehicle_maintenance_stages
     set status = 'active',
         started_at = now(),
         started_by = u
   where case_id = c.id and stage_key = 'diagnosis';

  update public.vehicle_trip_legs
     set arrived_at = now(),
         arrived_by = u,
         arrival_notes = nullif(trim(coalesce(p_notes, '')), '')
   where departure_id = c.departure_id
     and destination_type = 'maintenance'
     and arrived_at is null
   returning * into l;

  insert into public.notifications (user_id, title, body, type, link)
  values (c.manager_id, 'وصلت الآلية إلى الصيانة',
          'أكدت الصيانة استلام الآلية وبدأت مرحلة تشخيص العطل',
          'success', '/manager/vehicle-trips');

  return c;
end;
$$;

-- اعتماد الجاهزية = إكمال مرحلة الفحص وبدء مرحلة التسليم
create or replace function public.maintenance_approve_readiness(p_case_id uuid, p_notes text default null)
returns public.vehicle_maintenance_cases
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  update public.vehicle_maintenance_cases
     set readiness_approved_at = now(),
         readiness_approved_by = u,
         readiness_approval_notes = nullif(trim(coalesce(p_notes, '')), ''),
         updated_at = now()
   where id = p_case_id
     and status = 'ready'
     and progress = 100
     and diagnosis is not null
     and work_notes is not null
     and completed_at is null
     and readiness_approved_at is null
   returning * into c;
  if not found then
    raise exception 'MAINTENANCE_READINESS_NOT_APPROVABLE';
  end if;

  update public.vehicle_maintenance_stages
     set status = 'completed',
         completed_at = now(),
         completed_by = u,
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
   where case_id = c.id and stage_key = 'inspection';
  update public.vehicle_maintenance_stages
     set status = 'active',
         started_at = now(),
         started_by = u
   where case_id = c.id and stage_key = 'handover';

  return c;
end;
$$;

-- تسليم الآلية = إكمال مرحلة التسليم
create or replace function public.maintenance_dispatch_vehicle(
  p_case_id uuid,
  p_destination text,
  p_notes text default null
)
returns public.vehicle_maintenance_cases
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  c public.vehicle_maintenance_cases;
  d public.garage_departures;
  l public.vehicle_trip_legs;
  dest text;
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  dest := case p_destination
            when 'work_site' then 'work_site'
            when 'garage' then 'garage'
            else null
          end;
  if dest is null then
    raise exception 'MAINTENANCE_DESTINATION_INVALID';
  end if;
  update public.vehicle_maintenance_cases
     set status = case when dest = 'work_site' then 'to_work' else 'to_garage' end,
         departed_maintenance_at = now(),
         updated_at = now()
   where id = p_case_id
     and status = 'ready'
     and readiness_approved_at is not null
     and completed_at is null
   returning * into c;
  if not found then
    raise exception 'MAINTENANCE_READINESS_APPROVAL_REQUIRED';
  end if;

  update public.vehicle_maintenance_stages
     set status = 'completed',
         completed_at = now(),
         completed_by = u,
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
   where case_id = c.id and stage_key = 'handover';

  select * into d from public.garage_departures where id = c.departure_id;
  insert into public.vehicle_trip_legs
    (departure_id, sequence_no, origin_type, destination_type, departed_by, departure_notes)
  values (
    d.id, app.next_trip_leg_sequence(d.id), 'maintenance', dest, u,
    nullif(trim(coalesce(p_notes, '')), '')
  ) returning * into l;

  if dest = 'work_site' then
    insert into public.notifications (user_id, title, body, type, link)
    values (c.manager_id, 'الآلية عائدة من الصيانة إلى العمل',
            'اعتمدت جاهزية الآلية وغادرت الصيانة إلى موقع العمل',
            'success', '/manager/vehicle-trips');
  else
    insert into public.notifications (user_id, title, body, type, link)
    values (c.manager_id, 'الآلية غادرت الصيانة إلى الكراج',
            'اعتمدت جاهزية الآلية وغادرت الصيانة إلى الكراج',
            'warning', '/manager/vehicle-trips');
    insert into public.notifications (user_id, title, body, type, link)
    values (d.departed_by, 'آلية عائدة من الصيانة إلى الكراج',
            'غادرت الآلية الصيانة وهي في الطريق إلى الكراج',
            'info', '/central-garage/drivers-dispatch');
  end if;

  return c;
end;
$$;

-- قائمة المخزون: إضافة قسم القطعة إلى الفلاتر والنتيجة
drop function if exists public.maintenance_inventory_list(text);
create or replace function public.maintenance_inventory_list(
  p_search text default null,
  p_category text default null
)
returns setof public.maintenance_inventory_items
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_INVENTORY_FORBIDDEN';
  end if;
  return query
  select * from public.maintenance_inventory_items i
   where i.is_active
     and (p_search is null
          or trim(p_search) = ''
          or i.sku ilike '%' || trim(p_search) || '%'
          or i.item_name ilike '%' || trim(p_search) || '%')
     and (p_category is null or i.part_category = p_category)
   order by (i.current_quantity <= i.low_stock_threshold) desc, i.item_name;
end;
$$;

-- إنشاء صنف مخزون: مع قسم القطعة
drop function if exists public.maintenance_inventory_create(text, text, text, numeric);
create or replace function public.maintenance_inventory_create(
  p_sku text,
  p_item_name text,
  p_unit text default null,
  p_low_stock_threshold numeric default 0,
  p_part_category text default 'other'
)
returns public.maintenance_inventory_items
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  r public.maintenance_inventory_items;
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  if length(trim(coalesce(p_sku, ''))) < 1
     or length(trim(coalesce(p_item_name, ''))) < 2
     or p_low_stock_threshold < 0
     or p_part_category not in ('mechanical', 'electrical', 'bodywork', 'metalwork', 'other') then
    raise exception 'MAINTENANCE_INVENTORY_INPUT_INVALID';
  end if;
  insert into public.maintenance_inventory_items
    (sku, item_name, unit, low_stock_threshold, part_category, created_by)
  values (
    upper(trim(p_sku)), trim(p_item_name),
    coalesce(nullif(trim(p_unit), ''), 'قطعة'),
    p_low_stock_threshold, p_part_category, auth.uid()
  ) returning * into r;
  return r;
end;
$$;

-- قائمة الحالات: إضافة بيانات المراحل والفني والكلف
-- (نوع الإرجاع تغيّر — يجب إسقاط الدالة القديمة أولاً)
drop function if exists public.maintenance_vehicle_cases();
create or replace function public.maintenance_vehicle_cases()
returns table(
  case_id uuid,
  departure_id uuid,
  breakdown_id uuid,
  vehicle_id uuid,
  vehicle_name text,
  db_number text,
  driver_name text,
  shift text,
  area_name text,
  manager_name text,
  status text,
  fault_type text,
  priority text,
  reported_at timestamptz,
  arrived_at timestamptz,
  diagnosis text,
  work_notes text,
  parts_notes text,
  progress smallint,
  expected_completion_at timestamptz,
  ready_at timestamptz,
  departed_maintenance_at timestamptz,
  completed_at timestamptz,
  assigned_technician text,
  service_cost numeric,
  parts_actual_cost numeric,
  actual_cost numeric,
  readiness_approved_at timestamptz,
  stage_key text,
  stage_no smallint
)
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['maintenance']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  return query
  select c.id, c.departure_id, c.breakdown_id, c.vehicle_id,
         v.vehicle_name, v.db_number, d.driver_name, d.shift, s.name,
         d.recipient_manager_name, c.status, c.fault_type, c.priority,
         c.reported_at, c.arrived_at, c.diagnosis, c.work_notes, c.parts_notes,
         c.progress, c.expected_completion_at, c.ready_at,
         c.departed_maintenance_at, c.completed_at,
         c.assigned_technician, c.service_cost, c.parts_actual_cost, c.actual_cost,
         c.readiness_approved_at,
         coalesce(st.stage_key,
                  case
                    when c.completed_at is not null then 'handover'
                    else null
                  end),
         coalesce(st.stage_no, 0)
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
    left join public.vehicle_maintenance_stages st
      on st.case_id = c.id and st.status = 'active'
   where c.garage_decision_status not in ('awaiting_approval', 'rejected')
     and (c.completed_at is null
          or (c.completed_at at time zone 'Asia/Baghdad')::date
             >= (now() at time zone 'Asia/Baghdad')::date - 30)
   order by (c.completed_at is null) desc, c.reported_at desc;
end;
$$;

-- تفاصيل مراحل حالة (للواجهة)
create or replace function public.maintenance_case_stages(p_case_id uuid)
returns setof public.vehicle_maintenance_stages
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  return query
  select * from public.vehicle_maintenance_stages
   where case_id = p_case_id
   order by stage_no;
end;
$$;

-- ─── 6) الصلاحيات ───
revoke all on function
  public.maintenance_purchase_create(text, text, jsonb),
  public.maintenance_purchases_list(integer, integer),
  public.maintenance_purchase_detail(uuid),
  public.maintenance_purchases_finance(date, date, text),
  public.maintenance_archive_list(text, date, date),
  public.maintenance_advance_stage(uuid, text, text),
  public.maintenance_confirm_arrival(uuid, text),
  public.maintenance_approve_readiness(uuid, text),
  public.maintenance_dispatch_vehicle(uuid, text, text),
  public.maintenance_inventory_list(text, text),
  public.maintenance_inventory_create(text, text, text, numeric, text),
  public.maintenance_vehicle_cases(),
  public.maintenance_case_stages(uuid)
  from public, anon;

grant execute on function
  public.maintenance_purchase_create(text, text, jsonb),
  public.maintenance_purchases_list(integer, integer),
  public.maintenance_purchase_detail(uuid),
  public.maintenance_purchases_finance(date, date, text),
  public.maintenance_archive_list(text, date, date),
  public.maintenance_advance_stage(uuid, text, text),
  public.maintenance_confirm_arrival(uuid, text),
  public.maintenance_approve_readiness(uuid, text),
  public.maintenance_dispatch_vehicle(uuid, text, text),
  public.maintenance_inventory_list(text, text),
  public.maintenance_inventory_create(text, text, text, numeric, text),
  public.maintenance_vehicle_cases(),
  public.maintenance_case_stages(uuid)
  to authenticated;
