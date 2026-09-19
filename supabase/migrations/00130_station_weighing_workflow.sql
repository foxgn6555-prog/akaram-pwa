-- ═══════════════════════════════════════════════════════════════
-- 00130 · المحطة التحويلية — سير العمل بالخطوات للآلية الواردة
--   الخطوات: وصول الآلية ← تأكيد الوصول ← كتابة الوزن ← اختيار
--   الوجهة (مكبس / محطة تحويلية) ونوع الآلية ← اكتمال العملية.
--   · ts_vehicle_kinds: مرجع الأنواع مع الحد الأدنى المسموح:
--     كابسة صغيرة 2–3 · وسط 4–6 · كبيرة 6–8 (مكبس+محطة)
--     كيا 2 · كنتر 5 · تك 7 · سكس 10 (محطة تحويلية) — الأكثر مسموح والأقل مخالفة
--   · المخالفة: وزن أقل من الحد الأدنى فقط — تُسجل على السائق بلا مبلغ
--     ويصل تنبيه فوري لغرفة العمليات.
--   · عند الاكتمال: صف دفتر تلقائي في ts_weight_records (السير هو المصدر
--     الوحيد للأوزان — أُلغي الإدخال اليدوي) وكل الأوقات تُحسب.
--   · ts_carrier_records: ناقلة حاويات مكبسية (بنفس فكرة السكسات/النسافات)
--     + عمود وزن للسكسات والنسافات (الوقت تلقائي والوزن يُدخله المسؤول).
--   · ops_station_workflow: جدول غرفة العمليات الاحترافي بكل الأزمنة.
-- ═══════════════════════════════════════════════════════════════

-- ── ① مرجع أنواع الآليات والأوزان المسموحة ──
create table if not exists public.ts_vehicle_kinds (
  kind        text primary key,
  label       text not null,
  min_tons    numeric(6,2) not null check (min_tons > 0),
  max_tons    numeric(6,2) check (max_tons is null or max_tons >= min_tons),
  destination text not null check (destination in ('press','transfer_station','both')),
  sort        smallint not null default 0
);

insert into public.ts_vehicle_kinds (kind, label, min_tons, max_tons, destination, sort) values
  ('compactor_small',  'كابسة صغيرة', 2,  3,    'both',             1),
  ('compactor_medium', 'كابسة وسط',   4,  6,    'both',             2),
  ('compactor_large',  'كابسة كبيرة', 6,  8,    'both',             3),
  ('kia',              'كيا',         2,  null, 'transfer_station', 4),
  ('canter',           'كنتر',        5,  null, 'transfer_station', 5),
  ('tak',              'تك',          7,  null, 'transfer_station', 6),
  ('six',              'سكس',         10, null, 'transfer_station', 7)
on conflict (kind) do update
  set label = excluded.label, min_tons = excluded.min_tons,
      max_tons = excluded.max_tons, destination = excluded.destination,
      sort = excluded.sort;

alter table public.ts_vehicle_kinds enable row level security;
drop policy if exists "ts_kinds: قراءة للعموم المصادق" on public.ts_vehicle_kinds;
create policy "ts_kinds: قراءة للعموم المصادق" on public.ts_vehicle_kinds
  for select to authenticated using (true);
drop policy if exists "ts_kinds: منع الكتابة" on public.ts_vehicle_kinds;
create policy "ts_kinds: منع الكتابة" on public.ts_vehicle_kinds
  for insert to authenticated with check (false);

-- ── ② خطوة الوزن لكل زيارة (الزيارة = ضلع الدخول للمحطة) ──
create table if not exists public.ts_visit_weighing_steps (
  id           uuid primary key default gen_random_uuid(),
  visit_leg_id uuid not null references public.vehicle_trip_legs (id) on delete cascade,
  weight_tons  numeric(6,2) not null check (weight_tons > 0 and weight_tons < 100),
  destination  text check (destination in ('press','transfer_station')),
  vehicle_kind text references public.ts_vehicle_kinds (kind),
  weighed_at   timestamptz not null default now(),   -- وقت الوزن — تلقائي
  completed_at timestamptz,                          -- وقت اكتمال العملية — تلقائي
  violation    boolean not null default false,
  deficit_tons numeric(6,2),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ts_step_kind_pair_chk check ((destination is null) = (vehicle_kind is null)),
  unique (visit_leg_id)
);

create index if not exists idx_ts_steps_completed
  on public.ts_visit_weighing_steps (completed_at) where completed_at is not null;

-- ── ③ سجل المخالفات على السائقين (بلا مبالغ — تنبيه وتدقيق) ──
create table if not exists public.ts_violations (
  id           uuid primary key default gen_random_uuid(),
  step_id      uuid not null references public.ts_visit_weighing_steps (id) on delete cascade,
  visit_leg_id uuid not null,
  driver_name  text not null,
  db_number    text not null,
  vehicle_kind text not null,
  weight_tons  numeric(6,2) not null,
  min_tons     numeric(6,2) not null,
  deficit_tons numeric(6,2) not null,
  violated_at  timestamptz not null default now(),
  created_by   uuid references auth.users (id),
  unique (step_id)
);

alter table public.ts_visit_weighing_steps enable row level security;
alter table public.ts_violations            enable row level security;

drop policy if exists "ts_steps: قراءة المحطة والعمليات" on public.ts_visit_weighing_steps;
create policy "ts_steps: قراءة المحطة والعمليات" on public.ts_visit_weighing_steps
  for select to authenticated
  using (app.has_role(array['transfer_station','ops_room','super_admin']));
drop policy if exists "ts_steps: منع الكتابة المباشرة" on public.ts_visit_weighing_steps;
create policy "ts_steps: منع الكتابة المباشرة" on public.ts_visit_weighing_steps
  for insert to authenticated with check (false);
drop policy if exists "ts_steps: منع التعديل المباشر" on public.ts_visit_weighing_steps;
create policy "ts_steps: منع التعديل المباشر" on public.ts_visit_weighing_steps
  for update to authenticated using (false);
drop policy if exists "ts_steps: منع الحذف" on public.ts_visit_weighing_steps;
create policy "ts_steps: منع الحذف" on public.ts_visit_weighing_steps
  for delete to authenticated using (false);

drop policy if exists "ts_violations: قراءة المحطة والعمليات" on public.ts_violations;
create policy "ts_violations: قراءة المحطة والعمليات" on public.ts_violations
  for select to authenticated
  using (app.has_role(array['transfer_station','ops_room','super_admin']));
drop policy if exists "ts_violations: منع الكتابة المباشرة" on public.ts_violations;
create policy "ts_violations: منع الكتابة المباشرة" on public.ts_violations
  for insert to authenticated with check (false);
drop policy if exists "ts_violations: منع الحذف" on public.ts_violations;
create policy "ts_violations: منع الحذف" on public.ts_violations
  for delete to authenticated using (false);

-- ── ④ الوزن في السكسات/النسافات + ناقلة الحاويات المكبسية ──
alter table public.ts_saksat_records
  add column if not exists weight_tons numeric(6,2) check (weight_tons is null or weight_tons > 0);
alter table public.ts_trips_records
  add column if not exists weight_tons numeric(6,2) check (weight_tons is null or weight_tons > 0);

create table if not exists public.ts_carrier_records (
  id             uuid primary key default gen_random_uuid(),
  driver_name    text not null,
  vehicle_type   text,
  weight_tons    numeric(6,2) not null check (weight_tons > 0),  -- الوزن يُدخله المسؤول
  exit_time      timestamptz not null default now(),             -- وقت الخروج — تلقائي
  log_date       date not null default current_date,

  status         text not null default 'draft'
                   check (status in ('draft','submitted_to_deputy')),
  submitted_at   timestamptz,

  archived_at    timestamptz,
  archived_by    uuid references auth.users (id),
  archive_reason text,

  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_ts_carrier_touch on public.ts_carrier_records;
create trigger trg_ts_carrier_touch before update on public.ts_carrier_records
  for each row execute function app.ts_station_touch();

alter table public.ts_carrier_records enable row level security;

drop policy if exists "ts_carrier: قراءة النشط" on public.ts_carrier_records;
create policy "ts_carrier: قراءة النشط" on public.ts_carrier_records
  for select to authenticated
  using (
    archived_at is null
    and app.has_role(array['transfer_station','deputy_director',
                            'executive_director','super_admin'])
  );
drop policy if exists "ts_carrier: قراءة المؤرشف" on public.ts_carrier_records;
create policy "ts_carrier: قراءة المؤرشف" on public.ts_carrier_records
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));
drop policy if exists "ts_carrier: كتابة المحطة" on public.ts_carrier_records;
create policy "ts_carrier: كتابة المحطة" on public.ts_carrier_records
  for insert to authenticated
  with check (app.has_role(array['transfer_station','super_admin']));
drop policy if exists "ts_carrier: تعديل المحطة" on public.ts_carrier_records;
create policy "ts_carrier: تعديل المحطة" on public.ts_carrier_records
  for update to authenticated
  using (app.has_role(array['transfer_station','super_admin']))
  with check (app.has_role(array['transfer_station','super_admin']));
drop policy if exists "ts_carrier: منع الحذف" on public.ts_carrier_records;
create policy "ts_carrier: منع الحذف" on public.ts_carrier_records
  for delete to authenticated using (false);

-- ── ④‌ب توسيع قيد عمليات التدقيق (إصلاح كامن: فولدرات 00043 لم تُمرَّر SQL من قبل) ──
alter table public.audit_logs drop constraint audit_logs_operation_check;
alter table public.audit_logs add constraint audit_logs_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','ARCHIVE','RESTORE',
                       'SEND_FOLDER_TO_DEPUTY','RECORD_WEIGHING','COMPLETE_WEIGHING'));

-- ──  أدوات مشتركة ──
create or replace function app.ts_require_station_actor()
returns uuid language plpgsql stable security definer set search_path = public, app as $$
declare u uuid := auth.uid();
begin
  if u is null or not app.has_role(array['transfer_station','super_admin']) then
    raise exception 'STATION_FORBIDDEN';
  end if;
  return u;
end$$;

-- زيارة مفتوحة: ضلع دخول وصلت الآلية فيه ولم يغادر بعد
create or replace function app.ts_visit_open_leg(p_visit_leg_id uuid)
returns public.vehicle_trip_legs
language plpgsql stable security definer set search_path = public, app as $$
declare l public.vehicle_trip_legs;
begin
  select * into l from public.vehicle_trip_legs
  where id = p_visit_leg_id and destination_type = 'transfer_station';
  if not found then raise exception 'STATION_VISIT_NOT_FOUND'; end if;
  if l.arrived_at is null then raise exception 'STATION_VISIT_NOT_ARRIVED'; end if;
  if exists (select 1 from public.vehicle_trip_legs o
             where o.departure_id = l.departure_id
               and o.sequence_no = l.sequence_no + 1
               and o.origin_type = 'transfer_station') then
    raise exception 'STATION_VISIT_DISPATCHED';
  end if;
  return l;
end$$;

-- ── ⑥ الخطوة الأولى: كتابة الوزن (وقت تلقائي) ──
create or replace function app.ts_record_weighing(p_visit_leg_id uuid, p_weight_tons numeric)
returns public.ts_visit_weighing_steps
language plpgsql security definer set search_path = public, app as $$
declare u uuid; l public.vehicle_trip_legs; s public.ts_visit_weighing_steps;
begin
  u := app.ts_require_station_actor();
  l := app.ts_visit_open_leg(p_visit_leg_id);
  if p_weight_tons is null or p_weight_tons <= 0 or p_weight_tons >= 100 then
    raise exception 'STATION_WEIGHT_INVALID';
  end if;
  insert into public.ts_visit_weighing_steps (visit_leg_id, weight_tons, weighed_at, created_by)
  values (l.id, round(p_weight_tons, 2), now(), u)
  on conflict (visit_leg_id) do update
    set weight_tons = excluded.weight_tons, weighed_at = now(), updated_at = now()
    where public.ts_visit_weighing_steps.completed_at is null
  returning * into s;
  if s.id is null then raise exception 'STATION_WEIGHING_COMPLETED'; end if;
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_visit_weighing_steps', s.id::text, 'RECORD_WEIGHING',
          jsonb_build_object('weight_tons', round(p_weight_tons, 2)), u, app.current_role());
  return s;
end$$;

-- ── ⑦ الخطوة الثانية: الوجهة والنوع ثم الاكتمال (دفتر + مخالفة + تنبيه) ──
create or replace function app.ts_complete_weighing(p_visit_leg_id uuid, p_destination text, p_vehicle_kind text)
returns public.ts_visit_weighing_steps
language plpgsql security definer set search_path = public, app as $$
declare
  u uuid; l public.vehicle_trip_legs; s public.ts_visit_weighing_steps;
  k public.ts_vehicle_kinds; d public.garage_departures; gv public.garage_vehicles;
  v boolean; deficit numeric(6,2);
begin
  u := app.ts_require_station_actor();
  l := app.ts_visit_open_leg(p_visit_leg_id);
  if p_destination not in ('press','transfer_station') then
    raise exception 'STATION_DESTINATION_INVALID';
  end if;
  select * into k from public.ts_vehicle_kinds where kind = p_vehicle_kind;
  if not found then raise exception 'STATION_KIND_INVALID'; end if;
  if k.destination not in ('both', p_destination) then
    raise exception 'STATION_KIND_DESTINATION_INVALID';
  end if;
  select * into s from public.ts_visit_weighing_steps where visit_leg_id = l.id for update;
  if not found then raise exception 'STATION_WEIGHING_REQUIRED'; end if;
  if s.completed_at is not null then raise exception 'STATION_WEIGHING_COMPLETED'; end if;
  select * into d from public.garage_departures where id = l.departure_id;
  select * into gv from public.garage_vehicles where id = d.vehicle_id;

  v := s.weight_tons < k.min_tons;                      -- الأقل غير مسموح · الأكثر مسموح
  deficit := case when v then round(k.min_tons - s.weight_tons, 2) end;

  update public.ts_visit_weighing_steps
     set destination = p_destination, vehicle_kind = k.kind,
         completed_at = now(), violation = v, deficit_tons = deficit, updated_at = now()
   where id = s.id returning * into s;

  if v then
    insert into public.ts_violations
      (step_id, visit_leg_id, driver_name, db_number, vehicle_kind, weight_tons, min_tons, deficit_tons, created_by)
    values (s.id, l.id, d.driver_name, gv.db_number, k.kind, s.weight_tons, k.min_tons, deficit, u);
    perform app.notify_by_role(
      array['ops_room','super_admin'],
      'مخالفة وزن في المحطة التحويلية',
      format('DB %s — السائق %s: الوزن %s طن أقل من الحد المسموح لـ%s (%s طن). سُجلت مخالفة ووصل التنبيه للتدقيق.',
             gv.db_number, d.driver_name, s.weight_tons, k.label, k.min_tons),
      'warning', '/ops-room/operations-data');
  end if;

  -- صف الدفتر التلقائي — سير العمل هو المصدر الوحيد للأوزان
  insert into public.ts_weight_records
    (db_number, driver_name, vehicle_type, gross_weight, tare_weight, net_weight,
     entry_time, log_date, shift, status, created_by)
  values (gv.db_number, d.driver_name,
          k.label || ' → ' || case p_destination when 'press' then 'المكبس' else 'المحطة التحويلية' end,
          s.weight_tons, null, s.weight_tons,
          (s.weighed_at at time zone 'Asia/Baghdad')::time,
          (s.completed_at at time zone 'Asia/Baghdad')::date,
          case d.shift when 'night' then 'evening' else d.shift end,
          'draft', u);

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_visit_weighing_steps', s.id::text, 'COMPLETE_WEIGHING',
          jsonb_build_object('destination', p_destination, 'kind', k.kind, 'violation', v),
          u, app.current_role());
  return s;
end$$;

-- ── ⑧ سجل المخالفات ──
create or replace function app.ts_violations_list(p_day date default null)
returns table (
  id uuid, driver_name text, db_number text, vehicle_kind text, kind_label text,
  weight_tons numeric, min_tons numeric, deficit_tons numeric, violated_at timestamptz,
  visit_leg_id uuid
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['transfer_station','ops_room','super_admin']) then
    raise exception 'STATION_FORBIDDEN';
  end if;
  return query
  select v.id, v.driver_name, v.db_number, v.vehicle_kind, k.label,
         v.weight_tons, v.min_tons, v.deficit_tons, v.violated_at, v.visit_leg_id
  from public.ts_violations v
  left join public.ts_vehicle_kinds k on k.kind = v.vehicle_kind
  where (p_day is null or (v.violated_at at time zone 'Asia/Baghdad')::date = p_day)
  order by v.violated_at desc
  limit 1000;
end$$;

-- ── ⑩ جدول غرفة العمليات الاحترافي بكل الأزمنة ──
create or replace function app.ops_station_workflow(p_day date default null, p_search text default null)
returns table (
  visit_id uuid, departure_id uuid, trip_day date, db_number text, vehicle_name text,
  driver_name text, shift text, area_name text, manager_name text,
  inbound_departed_at timestamptz, arrived_at timestamptz, weighed_at timestamptz,
  completed_at timestamptz, dispatched_at timestamptz,
  weight_tons numeric, destination text, destination_label text,
  vehicle_kind text, kind_label text, min_tons numeric,
  violation boolean, deficit_tons numeric,
  transit_minutes integer, weigh_wait_minutes integer, process_minutes integer, stay_minutes integer
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','transfer_station','super_admin']) then
    raise exception 'OPS_WORKFLOW_FORBIDDEN';
  end if;
  return query
  select i.id, i.departure_id, (i.departed_at at time zone 'Asia/Baghdad')::date,
         gv.db_number, gv.vehicle_name, d.driver_name, d.shift, s.name, d.recipient_manager_name,
         i.departed_at, i.arrived_at, st.weighed_at, st.completed_at, o.departed_at,
         st.weight_tons, st.destination,
         case st.destination when 'press' then 'المكبس' when 'transfer_station' then 'المحطة التحويلية' end,
         st.vehicle_kind, k.label, k.min_tons,
         coalesce(st.violation, false), st.deficit_tons,
         floor(extract(epoch from (i.arrived_at - i.departed_at)) / 60)::int,
         case when st.weighed_at is null or st.weighed_at < i.arrived_at then null
              else floor(extract(epoch from (st.weighed_at - i.arrived_at)) / 60)::int end,
         case when st.completed_at is null then null
              else floor(extract(epoch from (st.completed_at - i.arrived_at)) / 60)::int end,
         floor(extract(epoch from (coalesce(o.departed_at, now()) - i.arrived_at)) / 60)::int
  from public.vehicle_trip_legs i
  join public.garage_departures d on d.id = i.departure_id
  join public.garage_vehicles gv on gv.id = d.vehicle_id
  join public.sectors s on s.id = d.sector_id
  left join public.ts_visit_weighing_steps st on st.visit_leg_id = i.id
  left join public.ts_vehicle_kinds k on k.kind = st.vehicle_kind
  left join public.vehicle_trip_legs o
         on o.departure_id = i.departure_id and o.sequence_no = i.sequence_no + 1
        and o.origin_type = 'transfer_station'
  where i.destination_type = 'transfer_station'
    and (p_day is null or (i.departed_at at time zone 'Asia/Baghdad')::date = p_day)
    and (p_search is null or trim(p_search) = ''
         or gv.db_number ilike '%' || trim(p_search) || '%'
         or gv.vehicle_name ilike '%' || trim(p_search) || '%'
         or d.driver_name ilike '%' || trim(p_search) || '%')
  order by i.departed_at desc
  limit 500;
end$$;

-- ── ⑩ فولدر ناقلة الحاويات المكبسية الشهري ──
create or replace function app.ts_carrier_send_folder(p_month text)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare v_count integer;
begin
  if not app.has_role(array['transfer_station','super_admin']) then
    raise exception 'SEND_FORBIDDEN: الإرسال من المحطة التحويلية حصراً';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'INVALID_MONTH: الشهر بصيغة YYYY-MM';
  end if;
  update public.ts_carrier_records
     set status = 'submitted_to_deputy', submitted_at = now()
   where to_char(log_date, 'YYYY-MM') = p_month
     and status = 'draft' and archived_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'FOLDER_EMPTY: لا توجد سجلات مسودة في فولدر هذا الشهر';
  end if;
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_carrier_records', p_month, 'SEND_FOLDER_TO_DEPUTY',
          jsonb_build_object('month', p_month, 'count', v_count),
          auth.uid(), app.current_role());
  perform app.notify_by_role(
    array['deputy_director','super_admin'],
    'فولدر ناقلات الحاويات المكبسية — المحطة التحويلية',
    format('وصل فولدر ناقلات الحاويات المكبسية لشهر %s (%s سجل) للاطلاع.', p_month, v_count),
    'info', '/deputy/station-folders');
  return v_count;
end$$;

-- ── ⑪ امتداد station_visits_for_day بأعمدة خطوة الوزن ──
drop function if exists public.station_visits_for_day(date, text, text, smallint);
create or replace function public.station_visits_for_day(p_day date, p_search text default null, p_status text default null, p_sector_id smallint default null)
returns table(visit_id uuid, departure_id uuid, visit_number bigint, inbound_sequence integer, vehicle_id uuid, vehicle_name text, db_number text, driver_name text, shift text, sector_id smallint, area_name text, manager_name text, inbound_departed_at timestamptz, arrived_at timestamptz, dispatched_at timestamptz, outbound_destination text, status text, transit_minutes integer, stay_minutes integer, inbound_notes text, arrival_notes text, dispatch_notes text, step_weight_tons numeric, step_destination text, step_vehicle_kind text, step_weighed_at timestamptz, step_completed_at timestamptz, step_violation boolean)
language plpgsql stable security definer set search_path = public, app as $$
begin
 if not app.has_role(array['transfer_station']) then raise exception 'STATION_FORBIDDEN';end if;
 if p_day is null then raise exception 'STATION_DAY_REQUIRED';end if;
 if p_status is not null and p_status not in('in_transit','at_station','dispatched') then raise exception 'STATION_STATUS_INVALID';end if;
 return query
 with inbound as(
  select i.*,row_number() over(partition by i.departure_id order by i.sequence_no) as visit_no
  from public.vehicle_trip_legs i where i.destination_type='transfer_station'
 ),visits as(
  select i.id visit_id,i.departure_id,i.visit_no,i.sequence_no,d.vehicle_id,gv.vehicle_name,gv.db_number,d.driver_name,d.shift,d.sector_id,s.name area_name,d.recipient_manager_name,
   i.departed_at,i.arrived_at,o.departed_at dispatched_at,o.destination_type outbound_destination,
   case when i.arrived_at is null then 'in_transit' when o.id is null then 'at_station' else 'dispatched' end visit_status,
   case when i.arrived_at is null then null else floor(extract(epoch from(i.arrived_at-i.departed_at))/60)::int end transit_minutes,
   case when i.arrived_at is null then null else floor(extract(epoch from(coalesce(o.departed_at,now())-i.arrived_at))/60)::int end stay_minutes,
   i.departure_notes,i.arrival_notes,o.departure_notes dispatch_notes
  from inbound i join public.garage_departures d on d.id=i.departure_id join public.garage_vehicles gv on gv.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  left join public.vehicle_trip_legs o on o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station'
  where(i.departed_at at time zone 'Asia/Baghdad')::date=p_day
 )
 select v.visit_id,v.departure_id,v.visit_no,v.sequence_no,v.vehicle_id,v.vehicle_name,v.db_number,v.driver_name,v.shift,v.sector_id,v.area_name,v.recipient_manager_name,v.departed_at,v.arrived_at,v.dispatched_at,v.outbound_destination,v.visit_status,v.transit_minutes,v.stay_minutes,v.departure_notes,v.arrival_notes,v.dispatch_notes,
  st.weight_tons,st.destination,st.vehicle_kind,st.weighed_at,st.completed_at,coalesce(st.violation,false)
 from visits v
 left join public.ts_visit_weighing_steps st on st.visit_leg_id=v.visit_id
 where(p_search is null or trim(p_search)='' or v.db_number ilike '%'||trim(p_search)||'%' or v.vehicle_name ilike '%'||trim(p_search)||'%' or v.driver_name ilike '%'||trim(p_search)||'%')
 and(p_status is null or v.visit_status=p_status) and(p_sector_id is null or v.sector_id=p_sector_id)
 order by case v.visit_status when 'in_transit' then 0 when 'at_station' then 1 else 2 end,v.departed_at desc;
end$$;

-- ──  ملخص اللوحة + عداد مخالفات اليوم ──
create or replace function app.ts_weight_summary(p_days integer default 7)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when not app.has_role(array['transfer_station','ops_room','super_admin',
                                'executive_director','deputy_director']) then '{}'::jsonb
    else (
      select jsonb_build_object(
        'total_records',  count(*) filter (where archived_at is null),
        'today_records',  count(*) filter (where log_date = current_date and archived_at is null),
        'pending_ops',    count(*) filter (where status = 'draft' and archived_at is null),
        'submitted_ops',  count(*) filter (where status = 'submitted_to_ops' and archived_at is null),
        'archived',       count(*) filter (where archived_at is not null),
        'total_net_tons', coalesce(sum(net_weight) filter (where archived_at is null),0),
        'today_net_tons', coalesce(sum(net_weight) filter (where log_date = current_date and archived_at is null),0),
        'today_violations', (select count(*) from public.ts_violations
                              where (violated_at at time zone 'Asia/Baghdad')::date = current_date),
        'total_violations', (select count(*) from public.ts_violations)
      )
      from public.ts_weight_records
      where log_date >= current_date - (p_days * interval '1 day') or archived_at is not null
    )
  end;
$$;

-- ──  أغلفة public (PostgREST يعرض public فقط) ──
create or replace function public.ts_record_weighing(p_visit_leg_id uuid, p_weight_tons numeric)
returns public.ts_visit_weighing_steps
language sql security invoker set search_path = public, app as $$
  select app.ts_record_weighing(p_visit_leg_id, p_weight_tons)
$$;
create or replace function public.ts_complete_weighing(p_visit_leg_id uuid, p_destination text, p_vehicle_kind text)
returns public.ts_visit_weighing_steps
language sql security invoker set search_path = public, app as $$
  select app.ts_complete_weighing(p_visit_leg_id, p_destination, p_vehicle_kind)
$$;
create or replace function public.ts_violations_list(p_day date default null)
returns table (
  id uuid, driver_name text, db_number text, vehicle_kind text, kind_label text,
  weight_tons numeric, min_tons numeric, deficit_tons numeric, violated_at timestamptz,
  visit_leg_id uuid
)
language sql stable security invoker set search_path = public, app as $$
  select * from app.ts_violations_list(p_day)
$$;
create or replace function public.ops_station_workflow(p_day date default null, p_search text default null)
returns table (
  visit_id uuid, departure_id uuid, trip_day date, db_number text, vehicle_name text,
  driver_name text, shift text, area_name text, manager_name text,
  inbound_departed_at timestamptz, arrived_at timestamptz, weighed_at timestamptz,
  completed_at timestamptz, dispatched_at timestamptz,
  weight_tons numeric, destination text, destination_label text,
  vehicle_kind text, kind_label text, min_tons numeric,
  violation boolean, deficit_tons numeric,
  transit_minutes integer, weigh_wait_minutes integer, process_minutes integer, stay_minutes integer
)
language sql stable security invoker set search_path = public, app as $$
  select * from app.ops_station_workflow(p_day, p_search)
$$;
create or replace function public.ts_carrier_send_folder(p_month text)
returns integer
language sql security invoker set search_path = public, app as $$
  select app.ts_carrier_send_folder(p_month)
$$;

-- ── ⑭ الصلاحيات ──
revoke all on function public.station_visits_for_day(date, text, text, smallint) from public, anon;
grant execute on function public.station_visits_for_day(date, text, text, smallint) to authenticated;

revoke all on function
  app.ts_require_station_actor(), app.ts_visit_open_leg(uuid),
  app.ts_record_weighing(uuid, numeric), app.ts_complete_weighing(uuid, text, text),
  app.ts_violations_list(date), app.ops_station_workflow(date, text),
  app.ts_carrier_send_folder(text),
  public.ts_record_weighing(uuid, numeric), public.ts_complete_weighing(uuid, text, text),
  public.ts_violations_list(date), public.ops_station_workflow(date, text),
  public.ts_carrier_send_folder(text)
  from public, anon, authenticated;
grant execute on function
  app.ts_require_station_actor(), app.ts_visit_open_leg(uuid),
  app.ts_record_weighing(uuid, numeric), app.ts_complete_weighing(uuid, text, text),
  app.ts_violations_list(date), app.ops_station_workflow(date, text),
  app.ts_carrier_send_folder(text),
  public.ts_record_weighing(uuid, numeric), public.ts_complete_weighing(uuid, text, text),
  public.ts_violations_list(date), public.ops_station_workflow(date, text),
  public.ts_carrier_send_folder(text)
  to authenticated;
