-- 00240 — ورش الصيانة: المركزية (الحالية) + ورشة قاطع الزعفرانية الفرعية — نفس البوابة، حسابات ومستخدمون مختلفون.
-- • حساب الصيانة يُسند إلى ورشة من التطوير المركزية (الافتراضي: المركزية). الحسابات الحالية = مركزية تلقائياً.
-- • توجيه تلقائي: آلية قاطع الزعفرانية ⇒ ورشة الزعفرانية؛ باقي القواطع ⇒ المركزية.
-- • الفنيون/المخزن/المشتريات/الحالات لكل ورشة على حدة. فنيو الورشة الفرعية = موظفو قسم حسابها في الهيكل (كما 00223).
-- • origin_workshop_key يُجهَّز للتحويل إلى المركزية (الجولة التالية) — الورشة المحوِّلة ترى الحالة للقراءة فقط.
-- • الأدوار غير المقيَّدة (غرفة العمليات، مدير النظام، الكراج، مسؤول القاطع…) ترى كل الورش كما قبل.

create table if not exists public.maintenance_workshops (
  key text primary key,
  name text not null,
  parent_sector text null,           -- null = الورشة المركزية (كل القواطع غير المسندة لورشة أخرى)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.maintenance_workshops (key, name, parent_sector) values
  ('central', 'الصيانة المركزية', null),
  ('zaafaraniya', 'صيانة قاطع الزعفرانية', 'zaafaraniya')
on conflict (key) do nothing;

create table if not exists public.maintenance_workshop_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workshop_key text not null references public.maintenance_workshops(key),
  assigned_by uuid null,
  assigned_at timestamptz not null default now(),
  notes text null
);
alter table public.maintenance_workshop_accounts enable row level security;

alter table public.vehicle_maintenance_cases add column if not exists workshop_key text not null default 'central' references public.maintenance_workshops(key);
alter table public.vehicle_maintenance_cases add column if not exists origin_workshop_key text null references public.maintenance_workshops(key);
alter table public.vehicle_maintenance_cases add column if not exists forwarded_at timestamptz null;
alter table public.vehicle_maintenance_cases add column if not exists forward_reason text null;
create index if not exists vehicle_maintenance_cases_workshop_idx on public.vehicle_maintenance_cases (workshop_key, completed_at);

-- ورشة الحساب الحالي: null = غير مقيَّد (كل الورش)؛ حساب صيانة بلا إسناد = المركزية
create or replace function app.maintenance_workshop() returns text language plpgsql stable security definer set search_path = public, app as $$
declare w text;
begin
  if app.has_role(array['ops_room','super_admin','it_admin','deputy_director','executive_director','central_garage_officer','department_manager','transfer_station']) then return null; end if;
  if not app.has_role(array['maintenance']) then return null; end if;
  select workshop_key into w from public.maintenance_workshop_accounts where user_id = auth.uid();
  return coalesce(w, 'central');
end$$;
create or replace function app.maintenance_ws_mine() returns text language sql stable security definer set search_path = public, app as $$
  select coalesce(app.maintenance_workshop(), 'central') $$;
create or replace function app.maintenance_ws_can_edit(p_workshop text) returns boolean language sql stable security definer set search_path = public, app as $$
  select app.maintenance_workshop() is null or p_workshop = app.maintenance_workshop() $$;
create or replace function app.maintenance_ws_visible(p_workshop text, p_origin text) returns boolean language sql stable security definer set search_path = public, app as $$
  select app.maintenance_ws_can_edit(p_workshop) or (p_origin is not null and p_origin = app.maintenance_workshop()) $$;
create or replace function app.maintenance_workshop_for_sector(p_sector_id smallint) returns text language sql stable security definer set search_path = public, app as $$
  select coalesce((select w.key from public.maintenance_workshops w join public.sectors s on s.parent_sector = w.parent_sector where s.id = p_sector_id and w.is_active limit 1), 'central') $$;


-- أقسام الورش الفرعية (قسم كل حساب مسند لورشة غير مركزية + فروعه): فنيوها لا يظهرون للمركزية
create or replace function app.maintenance_subworkshop_depts() returns uuid[] language sql stable security definer set search_path = public, app as $$
  with recursive roots as (
    select distinct e.department_id as id from public.maintenance_workshop_accounts a join public.employees e on e.user_id = a.user_id
     where a.workshop_key <> 'central' and e.department_id is not null
  ), tree as (
    select id from roots
    union select d.id from public.departments d join tree t on d.parent_id = t.id
  ) select coalesce(array_agg(id), '{}') from tree $$;
-- هل يظهر فني قسمه p_dept لحساب الصيانة الحالي؟ غير مقيَّد ⇒ نعم؛ ورشة فرعية ⇒ أقسامها فقط؛ المركزية ⇒ كل ما ليس لورشة فرعية
create or replace function app.maintenance_ws_tech_visible(p_dept uuid) returns boolean language plpgsql stable security definer set search_path = public, app as $$
declare w text := app.maintenance_workshop();
begin
  if w is null then return true; end if;
  if w = 'central' then return p_dept is null or not (p_dept = any(app.maintenance_subworkshop_depts())); end if;
  return p_dept = any(coalesce(app.disclosure_scope_depts(), '{}'));
end$$;

-- المخزن والمشتريات لكل ورشة (الافتراضي = ورشة الحساب الذي ينشئ)
alter table public.maintenance_inventory_items add column if not exists workshop_key text not null default app.maintenance_ws_mine() references public.maintenance_workshops(key);
alter table public.maintenance_purchase_orders add column if not exists workshop_key text not null default app.maintenance_ws_mine() references public.maintenance_workshops(key);
alter table public.maintenance_inventory_items drop constraint if exists maintenance_inventory_items_sku_key;
create unique index if not exists maintenance_inventory_items_ws_sku_key on public.maintenance_inventory_items (workshop_key, sku);
create index if not exists maintenance_inventory_items_workshop_idx on public.maintenance_inventory_items (workshop_key, is_active);

-- ── التطوير المركزية: إسناد حساب الصيانة إلى ورشة ──
create or replace function public.maintenance_workshops_list() returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', w.key, 'name', w.name, 'parent_sector', w.parent_sector, 'is_active', w.is_active,
           'accounts', (select count(*) from public.maintenance_workshop_accounts a where a.workshop_key = w.key)
                     + case when w.key = 'central' then (select count(*) from public.user_roles ur where ur.role = 'maintenance' and not exists (select 1 from public.maintenance_workshop_accounts a where a.user_id = ur.user_id)) else 0 end,
           'open_cases', (select count(*) from public.vehicle_maintenance_cases c where c.workshop_key = w.key and c.completed_at is null)) order by w.parent_sector nulls first, w.name), '[]'::jsonb)
  from public.maintenance_workshops w
  where app.has_role(array['it_admin','super_admin','ops_room','maintenance']) $$;

create or replace function public.maintenance_workshop_account_get(p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare v_key text; v_name text; v_at timestamptz; v_by uuid; v_notes text;
begin
  if not app.has_role(array['it_admin','super_admin']) then raise exception 'IT_FORBIDDEN'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and role = 'maintenance') then return jsonb_build_object('is_maintenance', false); end if;
  select a.workshop_key, w.name, a.assigned_at, a.assigned_by, a.notes into v_key, v_name, v_at, v_by, v_notes
    from public.maintenance_workshop_accounts a join public.maintenance_workshops w on w.key = a.workshop_key where a.user_id = p_user_id;
  return jsonb_build_object('is_maintenance', true, 'workshop_key', coalesce(v_key, 'central'), 'workshop_name', coalesce(v_name, 'الصيانة المركزية'),
                            'explicit', v_key is not null, 'assigned_at', v_at, 'assigned_by_name', case when v_by is not null then app.manager_display_name(v_by) end, 'notes', v_notes);
end$$;

create or replace function public.maintenance_workshop_assign(p_user_id uuid, p_workshop_key text, p_notes text default null) returns jsonb language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['it_admin','super_admin']) then raise exception 'IT_FORBIDDEN'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and role = 'maintenance') then raise exception 'MAINTENANCE_WORKSHOP_NOT_MAINTENANCE_ACCOUNT'; end if;
  if not exists (select 1 from public.maintenance_workshops where key = p_workshop_key and is_active) then raise exception 'MAINTENANCE_WORKSHOP_INVALID'; end if;
  insert into public.maintenance_workshop_accounts (user_id, workshop_key, assigned_by, notes) values (p_user_id, p_workshop_key, auth.uid(), nullif(trim(coalesce(p_notes, '')), ''))
  on conflict (user_id) do update set workshop_key = excluded.workshop_key, assigned_by = excluded.assigned_by, assigned_at = now(), notes = excluded.notes;
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('maintenance_workshop_accounts', p_user_id::text, 'UPDATE', jsonb_build_object('workshop_key', p_workshop_key, 'notes', p_notes), auth.uid(), 'it_admin');
  return public.maintenance_workshop_account_get(p_user_id);
end$$;

-- الصيانة ترى ورشتها (للعنوان/الشارة في البوابة)
create or replace function public.maintenance_my_workshop() returns jsonb language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object('key', app.maintenance_workshop(), 'name', (select name from public.maintenance_workshops where key = app.maintenance_workshop()), 'scoped', app.maintenance_workshop() is not null) $$;

revoke all on function public.maintenance_workshops_list(), public.maintenance_workshop_account_get(uuid), public.maintenance_workshop_assign(uuid, text, text), public.maintenance_my_workshop() from public, anon;
grant execute on function public.maintenance_workshops_list(), public.maintenance_workshop_account_get(uuid), public.maintenance_workshop_assign(uuid, text, text), public.maintenance_my_workshop() to authenticated;

-- ── الدوال الحالية بنطاق الورشة (آخر نسخها + شرط الورشة فقط) ──
CREATE OR REPLACE FUNCTION public.maintenance_vehicle_cases()
 RETURNS TABLE(case_id uuid, departure_id uuid, breakdown_id uuid, vehicle_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text, manager_name text, status text, fault_type text, priority text, reported_at timestamp with time zone, arrived_at timestamp with time zone, diagnosis text, work_notes text, parts_notes text, progress smallint, expected_completion_at timestamp with time zone, ready_at timestamp with time zone, departed_maintenance_at timestamp with time zone, completed_at timestamp with time zone, assigned_technician text, service_cost numeric, parts_actual_cost numeric, actual_cost numeric, readiness_approved_at timestamp with time zone, stage_key text, stage_no smallint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  return query
  select c.id, c.departure_id, c.breakdown_id, c.vehicle_id,
         v.vehicle_name::text, v.db_number::text, d.driver_name::text, d.shift::text, s.name::text,
         d.recipient_manager_name::text, c.status::text, c.fault_type::text, c.priority::text,
         c.reported_at, c.arrived_at, c.diagnosis::text, c.work_notes::text, c.parts_notes::text,
         c.progress::smallint, c.expected_completion_at, c.ready_at, c.departed_maintenance_at, c.completed_at,
         c.assigned_technician::text, c.service_cost, c.parts_actual_cost, c.actual_cost, c.readiness_approved_at,
         coalesce(st.stage_key, case when c.completed_at is not null then 'handover' else null end)::text,
         coalesce(st.stage_no, 0)::smallint
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
    left join public.vehicle_maintenance_stages st on st.case_id = c.id and st.status = 'active'
   where c.garage_decision_status not in ('awaiting_approval', 'rejected') and app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key)
     and (c.completed_at is null or (c.completed_at at time zone 'Asia/Baghdad')::date >= (now() at time zone 'Asia/Baghdad')::date - 30)
   order by (c.completed_at is null) desc, c.reported_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_cases_for_day(p_day date)
 RETURNS TABLE(case_id uuid, departure_id uuid, breakdown_id uuid, vehicle_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text, sector_id integer, manager_name text, status text, fault_type text, priority text, reported_at timestamp with time zone, arrived_at timestamp with time zone, diagnosis text, work_notes text, parts_notes text, progress smallint, expected_completion_at timestamp with time zone, ready_at timestamp with time zone, departed_maintenance_at timestamp with time zone, completed_at timestamp with time zone, assigned_technician text, estimated_cost numeric, actual_cost numeric, service_cost numeric, parts_actual_cost numeric, delay_reason text, assigned_technician_id uuid, ready_declared_by uuid, readiness_approved_at timestamp with time zone, readiness_approved_by uuid, readiness_approval_notes text, stage_key text, stage_no smallint, technicians text, technician_count integer, parts_count integer, parts_summary text, wait_minutes integer, maintenance_minutes integer, corrected_at timestamp with time zone, correction_reason text, correction_count integer, updates_count integer, last_update_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;
  return query
  select c.id,c.departure_id,c.breakdown_id,c.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,se.name,d.sector_id::int,d.recipient_manager_name,
         c.status,c.fault_type,c.priority,c.reported_at,c.arrived_at,c.diagnosis,c.work_notes,c.parts_notes,c.progress,
         c.expected_completion_at,c.ready_at,c.departed_maintenance_at,c.completed_at,c.assigned_technician,
         c.estimated_cost,c.actual_cost,c.service_cost,c.parts_actual_cost,c.delay_reason,c.assigned_technician_id,c.ready_declared_by,
         c.readiness_approved_at,c.readiness_approved_by,c.readiness_approval_notes,
         coalesce(st.stage_key, case when c.completed_at is not null then 'handover' end), coalesce(st.stage_no,0)::smallint,
         app.maintenance_technicians_text(c.id),
         (select count(*)::int from public.vehicle_maintenance_case_technicians ct where ct.case_id=c.id and ct.released_at is null),
         (select count(*)::int from public.vehicle_maintenance_parts p where p.case_id=c.id and p.part_status in('issued','installed')),
         app.maintenance_parts_summary(c.id),
         case when c.arrived_at is null then null else greatest(0,round(extract(epoch from (c.arrived_at-c.reported_at))/60))::int end,
         case when c.arrived_at is null then null else greatest(0,round(extract(epoch from (coalesce(c.departed_maintenance_at,c.completed_at,now())-c.arrived_at))/60))::int end,
         c.corrected_at,c.correction_reason,c.correction_count,
         (select count(*)::int from public.vehicle_maintenance_updates mu where mu.case_id=c.id),
         (select max(mu.created_at) from public.vehicle_maintenance_updates mu where mu.case_id=c.id)
  from public.vehicle_maintenance_cases c
  join public.garage_departures d on d.id=c.departure_id
  join public.garage_vehicles v on v.id=c.vehicle_id
  join public.sectors se on se.id=d.sector_id
  left join public.vehicle_maintenance_stages st on st.case_id=c.id and st.status='active'
  where c.reported_at<p_day+1 and(c.completed_at is null or c.completed_at>=p_day) and app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key)
  order by(c.completed_at is null)desc,c.reported_at desc;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_case_days(p_limit integer DEFAULT 60)
 RETURNS TABLE(case_day date, total_count bigint, open_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$begin if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;if p_limit not between 1 and 365 then raise exception 'MAINTENANCE_DAY_LIMIT_INVALID';end if;return query with days as(select(current_date-g)::date as case_date from generate_series(0,p_limit-1)g) select x.case_date,count(c.id),count(c.id)filter(where c.completed_at is null) from days x join public.vehicle_maintenance_cases c on c.reported_at<x.case_date+1 and(c.completed_at is null or c.completed_at>=x.case_date) and app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key) group by x.case_date order by x.case_date desc;end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_archive_list(p_search text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(case_id uuid, vehicle_name text, db_number text, driver_name text, shift text, area_name text, sector_id integer, manager_name text, fault_type text, priority text, reported_at timestamp with time zone, arrived_at timestamp with time zone, ready_at timestamp with time zone, readiness_approved_at timestamp with time zone, departed_maintenance_at timestamp with time zone, completed_at timestamp with time zone, final_status text, diagnosis text, work_notes text, delay_reason text, progress smallint, technicians text, technician_count integer, parts_count integer, parts_summary text, estimated_cost numeric, service_cost numeric, parts_actual_cost numeric, actual_cost numeric, wait_minutes integer, maintenance_minutes integer, duration_days numeric, corrected_at timestamp with time zone, correction_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  return query
  select c.id, v.vehicle_name, v.db_number, d.driver_name, d.shift, s.name, d.sector_id::int, d.recipient_manager_name, c.fault_type, c.priority,
         c.reported_at, c.arrived_at, c.ready_at, c.readiness_approved_at, c.departed_maintenance_at, c.completed_at,
         c.status, c.diagnosis, c.work_notes, c.delay_reason, c.progress,
         app.maintenance_technicians_text(c.id),
         (select count(*)::int from public.vehicle_maintenance_case_technicians ct where ct.case_id = c.id and ct.released_at is null),
         (select count(*)::int from public.vehicle_maintenance_parts p where p.case_id = c.id and p.part_status in ('issued', 'installed')),
         app.maintenance_parts_summary(c.id),
         c.estimated_cost, c.service_cost, c.parts_actual_cost, coalesce(c.actual_cost, 0),
         case when c.arrived_at is null then null else greatest(0, round(extract(epoch from (c.arrived_at - c.reported_at)) / 60))::int end,
         case when c.arrived_at is null then null else greatest(0, round(extract(epoch from (coalesce(c.departed_maintenance_at, c.completed_at) - c.arrived_at)) / 60))::int end,
         round(extract(epoch from (c.completed_at - c.reported_at)) / 86400.0, 1),
         c.corrected_at, c.correction_reason
    from public.vehicle_maintenance_cases c
    join public.garage_departures d on d.id = c.departure_id
    join public.garage_vehicles v on v.id = c.vehicle_id
    join public.sectors s on s.id = d.sector_id
   where c.completed_at is not null and app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key)
     and (p_from is null or (c.completed_at at time zone 'Asia/Baghdad')::date >= p_from)
     and (p_to is null or (c.completed_at at time zone 'Asia/Baghdad')::date <= p_to)
     and (p_search is null or trim(p_search) = '' or v.vehicle_name ilike '%' || trim(p_search) || '%' or v.db_number ilike '%' || trim(p_search) || '%'
          or d.driver_name ilike '%' || trim(p_search) || '%' or coalesce(c.assigned_technician, '') ilike '%' || trim(p_search) || '%')
   order by c.completed_at desc limit 500;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_case_events_unscoped(p_case_id uuid)
 RETURNS TABLE(event_key text, event_type text, title text, details text, happened_at timestamp with time zone, actor_id uuid, status text, progress integer, sequence_no integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare c public.vehicle_maintenance_cases;begin
 select*into c from public.vehicle_maintenance_cases where id=p_case_id;
 if not found or not(app.has_role(array['maintenance','central_garage_officer','ops_room','super_admin'])or c.manager_id=auth.uid())then raise exception'MAINTENANCE_CASE_FORBIDDEN';end if;
 if not app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
 return query
 with events as(
  select'case:reported'::text k,'case'::text t,'تسجيل العطل وإرسال الآلية'::text ttl,c.fault_type::text det,c.reported_at at,c.manager_id actor,'to_maintenance'::text st,0::int prog,0::int seq
  union all select'garage:decision','decision',case c.garage_decision_status when'acknowledged'then'أكد الكراج استلام البلاغ'when'approved'then'اعتمد الكراج حركة الصيانة'when'rejected'then'رفض الكراج حركة الصيانة'else'بانتظار إجراء الكراج'end,coalesce(c.garage_decision_notes,c.dispatch_policy),coalesce(c.garage_decided_at,c.reported_at),c.garage_decided_by,c.garage_decision_status,null,1 where c.garage_decision_status<>'not_required'
  union all select'leg:'||l.id::text||':departed','movement','غادرت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.departure_notes,l.departed_at,l.departed_by,'in_transit',null,l.sequence_no*10 from public.vehicle_trip_legs l where l.departure_id=c.departure_id
  union all select'leg:'||l.id::text||':arrived','movement','وصلت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.arrival_notes,l.arrived_at,l.arrived_by,'arrived',null,l.sequence_no*10+1 from public.vehicle_trip_legs l where l.departure_id=c.departure_id and l.arrived_at is not null
  union all select'update:'||u.id::text,'maintenance_update','تحديث الصيانة: '||u.status,coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason,'تحديث حالة'),u.created_at,u.created_by,u.status,u.progress,1000+row_number()over(order by u.created_at)::int from public.vehicle_maintenance_updates u where u.case_id=c.id
  union all select'part:'||p.id::text,'part',case p.part_status when'installed'then'تم تركيب قطعة'when'returned'then'أعيدت قطعة للمخزون'else'صُرفت قطعة للصيانة'end,p.part_name||' · '||p.quantity||' '||p.unit,coalesce(p.installed_at,p.returned_at,p.created_at),p.created_by,p.part_status,null,2000+row_number()over(order by p.created_at)::int from public.vehicle_maintenance_parts p where p.case_id=c.id
  union all select'case:ready','readiness','إعلان جاهزية الآلية',coalesce(c.readiness_approval_notes,'اكتملت أعمال الصيانة'),c.ready_at,c.ready_declared_by,'ready',100,3000 where c.ready_at is not null
  union all select'case:approved-ready','readiness','اعتماد الجاهزية للمغادرة',coalesce(c.readiness_approval_notes,'تم اعتماد الجاهزية'),c.readiness_approved_at,c.readiness_approved_by,'ready',100,3001 where c.readiness_approved_at is not null
  union all select'case:completed','completion',case c.status when'returned_to_work'then'تأكيد العودة الفعلية إلى العمل'when'closed_at_garage'then'تأكيد الوصول الفعلي إلى الكراج'else'إغلاق حالة الصيانة'end,coalesce(c.work_notes,c.diagnosis,'اكتملت الدورة'),c.completed_at,null,c.status,100,4000 where c.completed_at is not null
 )select e.k,e.t,e.ttl,e.det,e.at,e.actor,e.st,e.prog,e.seq from events e order by e.at,e.seq;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_case_events_v150(p_case_id uuid)
 RETURNS TABLE(event_key text, event_type text, title text, details text, happened_at timestamp with time zone, actor_id uuid, status text, progress integer, sequence_no integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare c public.vehicle_maintenance_cases;begin
 select*into c from public.vehicle_maintenance_cases where id=p_case_id;
 if not found or not(app.has_role(array['maintenance','central_garage_officer','ops_room','super_admin'])or c.manager_id=auth.uid())then raise exception'MAINTENANCE_CASE_FORBIDDEN';end if;
 if not app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
 return query
 with events as(
  select'case:reported'::text k,'case'::text t,'تسجيل العطل وإرسال الآلية'::text ttl,c.fault_type::text det,c.reported_at at,c.manager_id actor,'to_maintenance'::text st,0::int prog,0::int seq
  union all select'garage:decision','decision',case c.garage_decision_status when'acknowledged'then'أكد الكراج استلام البلاغ'when'approved'then'اعتمد الكراج حركة الصيانة'when'rejected'then'رفض الكراج حركة الصيانة'else'بانتظار إجراء الكراج'end,coalesce(c.garage_decision_notes,c.dispatch_policy),coalesce(c.garage_decided_at,c.reported_at),c.garage_decided_by,c.garage_decision_status,null,1 where c.garage_decision_status<>'not_required'
  union all select'leg:'||l.id::text||':departed','movement','غادرت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.departure_notes,l.departed_at,l.departed_by,'in_transit',null,l.sequence_no*10 from public.vehicle_trip_legs l where l.departure_id=c.departure_id
  union all select'leg:'||l.id::text||':arrived','movement','وصلت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.arrival_notes,l.arrived_at,l.arrived_by,'arrived',null,l.sequence_no*10+1 from public.vehicle_trip_legs l where l.departure_id=c.departure_id and l.arrived_at is not null
  union all select'update:'||u.id::text,'maintenance_update','تحديث الصيانة: '||u.status,coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason,'تحديث حالة'),u.created_at,u.created_by,u.status,u.progress,1000+row_number()over(order by u.created_at)::int from public.vehicle_maintenance_updates u where u.case_id=c.id
  union all select'part:'||p.id::text,'part',case p.part_status when'installed'then'تم تركيب قطعة'when'returned'then'أعيدت قطعة للمخزون'else'صُرفت قطعة للصيانة'end,p.part_name||' · '||p.quantity||' '||p.unit,coalesce(p.installed_at,p.returned_at,p.created_at),p.created_by,p.part_status,null,2000+row_number()over(order by p.created_at)::int from public.vehicle_maintenance_parts p where p.case_id=c.id
  union all select'case:ready','readiness','إعلان جاهزية الآلية',coalesce(c.readiness_approval_notes,'اكتملت أعمال الصيانة'),c.ready_at,c.ready_declared_by,'ready',100,3000 where c.ready_at is not null
  union all select'case:approved-ready','readiness','اعتماد الجاهزية للمغادرة',coalesce(c.readiness_approval_notes,'تم اعتماد الجاهزية'),c.readiness_approved_at,c.readiness_approved_by,'ready',100,3001 where c.readiness_approved_at is not null
  union all select'correction:'||a.id::text,'correction','تصحيح من غرفة العمليات',coalesce(a.new_row->>'reason','تصحيح بيانات الحالة'),a.created_at,a.actor_id,'corrected',null,5000+row_number()over(order by a.created_at)::int from public.audit_logs a where a.table_name='vehicle_maintenance_cases' and a.record_id=c.id::text and a.operation='CORRECT_MAINTENANCE'
  union all select'case:completed','completion',case c.status when'returned_to_work'then'تأكيد العودة الفعلية إلى العمل'when'closed_at_garage'then'تأكيد الوصول الفعلي إلى الكراج'else'إغلاق حالة الصيانة'end,coalesce(c.work_notes,c.diagnosis,'اكتملت الدورة'),c.completed_at,null,c.status,100,4000 where c.completed_at is not null
 )select e.k,e.t,e.ttl,e.det,e.at,e.actor,e.st,e.prog,e.seq from events e order by e.at,e.seq;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_case_timeline(p_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare c public.vehicle_maintenance_cases;begin select * into c from public.vehicle_maintenance_cases where id=p_case_id;if not found or not(app.has_role(array['maintenance','central_garage_officer','ops_room','super_admin']) or c.manager_id=auth.uid()) then raise exception 'MAINTENANCE_CASE_FORBIDDEN';end if;
 if not app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;return jsonb_build_object('case',to_jsonb(c),'updates',coalesce((select jsonb_agg(to_jsonb(u) order by u.created_at desc) from public.vehicle_maintenance_updates u where u.case_id=c.id),'[]'::jsonb),'parts',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.vehicle_maintenance_parts p where p.case_id=c.id),'[]'::jsonb),'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.vehicle_maintenance_attachments a where a.case_id=c.id),'[]'::jsonb),'legs',coalesce((select jsonb_agg(to_jsonb(l) order by l.sequence_no) from public.vehicle_trip_legs l where l.departure_id=c.departure_id),'[]'::jsonb));end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_case_technicians(p_case_id uuid)
 RETURNS TABLE(id uuid, case_id uuid, employee_id uuid, technician_name text, employee_number text, specialty text, specialty_label text, notes text, assigned_at timestamp with time zone, released_at timestamp with time zone, release_notes text, active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare c public.vehicle_maintenance_cases;
begin
  select * into c from public.vehicle_maintenance_cases vmc where vmc.id = p_case_id;
  if not found or not (app.has_role(array['maintenance', 'central_garage_officer', 'ops_room', 'super_admin']) or c.manager_id = auth.uid()) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
  if not app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
  return query
  select ct.id, ct.case_id, ct.employee_id, ct.technician_name, e.employee_number, ct.specialty, app.maintenance_specialty_label(ct.specialty), ct.notes,
         ct.assigned_at, ct.released_at, ct.release_notes, ct.released_at is null
  from public.vehicle_maintenance_case_technicians ct join public.employees e on e.id = ct.employee_id
  where ct.case_id = p_case_id order by ct.released_at is not null, ct.assigned_at;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_case_stages(p_case_id uuid)
 RETURNS SETOF vehicle_maintenance_stages
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  if not exists (select 1 from public.vehicle_maintenance_cases c where c.id = p_case_id and app.maintenance_ws_visible(c.workshop_key, c.origin_workshop_key)) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
  return query
  select * from public.vehicle_maintenance_stages
   where case_id = p_case_id
   order by stage_no;
end;
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_advance_stage(p_case_id uuid, p_diagnosis text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  u uuid := auth.uid();
  cur public.vehicle_maintenance_stages;
  nxt public.vehicle_maintenance_stages;
  c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['maintenance','super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;

  select * into c from public.vehicle_maintenance_cases
   where id = p_case_id and app.maintenance_ws_can_edit(workshop_key)
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
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_approve_readiness(p_case_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare u uuid := auth.uid(); c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id and app.maintenance_ws_can_edit(workshop_key) for update;
  if not found or c.completed_at is not null or c.arrived_at is null then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  if c.readiness_approved_at is not null then raise exception 'MAINTENANCE_READINESS_ALREADY_APPROVED'; end if;
  if c.status <> 'ready' or c.progress <> 100 then raise exception 'MAINTENANCE_READINESS_NOT_READY'; end if;
  if c.diagnosis is null then raise exception 'MAINTENANCE_READY_REQUIRES_DIAGNOSIS'; end if;
  if c.work_notes is null then raise exception 'MAINTENANCE_READY_REQUIRES_WORK_NOTES'; end if;
  if not exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c.id and released_at is null) then raise exception 'MAINTENANCE_READY_REQUIRES_TECHNICIAN'; end if;
  if exists (select 1 from public.vehicle_maintenance_parts p where p.case_id = c.id and p.part_status = 'issued') then raise exception 'MAINTENANCE_READY_REQUIRES_INSTALLED_PARTS'; end if;
  update public.vehicle_maintenance_cases
     set readiness_approved_at = now(), readiness_approved_by = u, readiness_approval_notes = nullif(trim(coalesce(p_notes, '')), ''), updated_at = now()
   where id = c.id returning * into c;
  update public.vehicle_maintenance_stages set status = 'completed', completed_at = now(), completed_by = u, notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
   where case_id = c.id and stage_key = 'inspection';
  update public.vehicle_maintenance_stages set status = 'active', started_at = now(), started_by = u where case_id = c.id and stage_key = 'handover';
  return c;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_assign_technician(p_case_id uuid, p_employee_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_case_technicians
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare u uuid := auth.uid(); c public.vehicle_maintenance_cases; e public.employees; t public.departments; r public.vehicle_maintenance_case_technicians;
begin
  if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id and app.maintenance_ws_can_edit(workshop_key) for update;
  if not found or c.arrived_at is null or c.completed_at is not null then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  select * into e from public.employees where id = p_employee_id;
  if not found or e.employment_status = 'terminated' or e.archived_at is not null then raise exception 'MAINTENANCE_TECHNICIAN_INVALID'; end if;
  select * into t from public.departments where id = e.job_title_id and maintenance_specialty is not null;
  if not found then raise exception 'MAINTENANCE_TECHNICIAN_NOT_TECHNICIAN_TITLE'; end if;
  if exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c.id and employee_id = e.id and released_at is null) then raise exception 'MAINTENANCE_TECHNICIAN_ALREADY_ASSIGNED'; end if;
  insert into public.vehicle_maintenance_case_technicians(case_id, employee_id, specialty, technician_name, notes, assigned_by)
  values (c.id, e.id, t.maintenance_specialty, e.full_name, nullif(trim(coalesce(p_notes, '')), ''), u) returning * into r;
  perform app.maintenance_sync_technicians(c.id);
  return r;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_complete_case(p_case_id uuid, p_diagnosis text, p_work_notes text, p_technician_ids uuid[], p_parts jsonb DEFAULT '[]'::jsonb, p_service_cost numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  u uuid := auth.uid(); c public.vehicle_maintenance_cases; t uuid; part jsonb; v_item uuid; v_qty numeric;
  v_diag text := nullif(trim(coalesce(p_diagnosis, '')), ''); v_work text := nullif(trim(coalesce(p_work_notes, '')), '');
begin
  if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id and app.maintenance_ws_can_edit(workshop_key) for update;
  if not found or c.arrived_at is null or c.completed_at is not null then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  if c.readiness_approved_at is not null then raise exception 'MAINTENANCE_READINESS_ALREADY_APPROVED'; end if;
  if v_diag is null then raise exception 'MAINTENANCE_READY_REQUIRES_DIAGNOSIS'; end if;
  if v_work is null then raise exception 'MAINTENANCE_READY_REQUIRES_WORK_NOTES'; end if;
  if coalesce(p_service_cost, 0) < 0 then raise exception 'MAINTENANCE_COST_INVALID'; end if;

  -- الفنيون: تعيين من لم يُعيَّن بعد (يتحقق أنهم على مسمى فني)
  foreach t in array coalesce(p_technician_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c.id and employee_id = t and released_at is null) then
      perform public.maintenance_assign_technician(c.id, t, null);
    end if;
  end loop;
  if not exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c.id and released_at is null) then raise exception 'MAINTENANCE_READY_REQUIRES_TECHNICIAN'; end if;

  -- القطع: صرف من المخزن + تركيب فوري (الكلفة بسعر المخزن)
  if p_parts is not null and jsonb_typeof(p_parts) = 'array' then
    for part in select * from jsonb_array_elements(p_parts) loop
      v_item := nullif(part->>'item_id', '')::uuid; v_qty := coalesce((part->>'quantity')::numeric, 0);
      if v_item is null or v_qty <= 0 then raise exception 'MAINTENANCE_ISSUE_INVALID'; end if;
      perform public.maintenance_issue_and_install(c.id, v_item, v_qty, null, true);
    end loop;
  end if;
  -- أي قطعة مصروفة سابقاً وغير مركّبة تُعدّ مركّبة الآن (إنهاء الصيانة يعني تركيبها)
  update public.vehicle_maintenance_parts set part_status = 'installed', installed_at = now(), installed_by = u where case_id = c.id and part_status = 'issued';

  update public.vehicle_maintenance_cases set
    status = 'ready', progress = 100, diagnosis = v_diag, work_notes = v_work,
    assigned_technician = app.maintenance_technicians_text(c.id),
    service_cost = coalesce(p_service_cost, 0), actual_cost = coalesce(p_service_cost, 0) + parts_actual_cost,
    ready_at = coalesce(ready_at, now()), ready_declared_by = u,
    readiness_approved_at = now(), readiness_approved_by = u, readiness_approval_notes = nullif(trim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where id = c.id returning * into c;

  insert into public.vehicle_maintenance_updates(case_id, status, progress, diagnosis, work_notes, parts_notes, assigned_technician, estimated_cost, actual_cost, delay_reason, expected_completion_at, created_by)
  values (c.id, 'ready', 100, c.diagnosis, c.work_notes, app.maintenance_parts_summary(c.id), c.assigned_technician, c.estimated_cost, c.actual_cost, null, null, u);

  -- المراحل تُغلق تلقائياً: تشخيص/إصلاح/فحص مكتملة، التسليم نشط
  update public.vehicle_maintenance_stages set status = 'completed', completed_at = now(), completed_by = u, started_at = coalesce(started_at, now()), started_by = coalesce(started_by, u)
   where case_id = c.id and stage_key in ('arrival', 'diagnosis', 'repair', 'inspection') and status <> 'completed';
  update public.vehicle_maintenance_stages set status = 'active', started_at = coalesce(started_at, now()), started_by = coalesce(started_by, u)
   where case_id = c.id and stage_key = 'handover' and status <> 'completed';
  return c;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_update_case(p_case_id uuid, p_status text, p_progress integer, p_diagnosis text DEFAULT NULL::text, p_work_notes text DEFAULT NULL::text, p_parts_notes text DEFAULT NULL::text, p_expected_completion_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_assigned_technician text DEFAULT NULL::text, p_estimated_cost numeric DEFAULT NULL::numeric, p_actual_cost numeric DEFAULT NULL::numeric, p_delay_reason text DEFAULT NULL::text, p_assigned_technician_id uuid DEFAULT NULL::uuid)
 RETURNS vehicle_maintenance_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare u uuid:=auth.uid();c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['maintenance','super_admin'])then raise exception 'MAINTENANCE_FORBIDDEN';end if;
  if p_status not in('at_maintenance','diagnosing','waiting_parts','in_repair','paused','ready')or p_progress not between 0 and 100 then raise exception 'MAINTENANCE_UPDATE_INVALID';end if;
  if p_actual_cost<0 or p_estimated_cost<0 then raise exception 'MAINTENANCE_COST_INVALID';end if;
  select * into c from public.vehicle_maintenance_cases where id=p_case_id and app.maintenance_ws_can_edit(workshop_key) for update;
  if not found or c.arrived_at is null or c.completed_at is not null then raise exception 'MAINTENANCE_CASE_NOT_OPEN';end if;
  if p_status='ready' then
    if p_progress<>100 then raise exception 'MAINTENANCE_READINESS_NOT_READY';end if;
    if coalesce(nullif(trim(coalesce(p_diagnosis,'')),''),c.diagnosis) is null then raise exception 'MAINTENANCE_READY_REQUIRES_DIAGNOSIS';end if;
    if coalesce(nullif(trim(coalesce(p_work_notes,'')),''),c.work_notes) is null then raise exception 'MAINTENANCE_READY_REQUIRES_WORK_NOTES';end if;
    if not exists(select 1 from public.vehicle_maintenance_case_technicians where case_id=c.id and released_at is null) then raise exception 'MAINTENANCE_READY_REQUIRES_TECHNICIAN';end if;
    if exists(select 1 from public.vehicle_maintenance_parts where case_id=c.id and part_status='issued') then raise exception 'MAINTENANCE_READY_REQUIRES_INSTALLED_PARTS';end if;
  end if;
  update public.vehicle_maintenance_cases set
    status=p_status,progress=p_progress,
    diagnosis=case when p_diagnosis is null then diagnosis else nullif(trim(p_diagnosis),'') end,
    work_notes=case when p_work_notes is null then work_notes else nullif(trim(p_work_notes),'') end,
    parts_notes=case when p_parts_notes is null then parts_notes else nullif(trim(p_parts_notes),'') end,
    expected_completion_at=coalesce(p_expected_completion_at,expected_completion_at),
    assigned_technician=coalesce(app.maintenance_technicians_text(c.id),assigned_technician),
    estimated_cost=coalesce(p_estimated_cost,estimated_cost),
    service_cost=coalesce(p_actual_cost,service_cost),actual_cost=coalesce(p_actual_cost,service_cost)+parts_actual_cost,
    delay_reason=case when p_delay_reason is null then delay_reason else nullif(trim(p_delay_reason),'') end,
    ready_at=case when p_status='ready'then coalesce(ready_at,now())else ready_at end,
    ready_declared_by=case when p_status='ready'then u else ready_declared_by end,
    readiness_approved_at=case when p_status='ready'then null else readiness_approved_at end,
    readiness_approved_by=case when p_status='ready'then null else readiness_approved_by end,
    readiness_approval_notes=case when p_status='ready'then null else readiness_approval_notes end,
    updated_at=now()
  where id=c.id returning * into c;
  insert into public.vehicle_maintenance_updates(case_id,status,progress,diagnosis,work_notes,parts_notes,assigned_technician,assigned_technician_id,estimated_cost,actual_cost,delay_reason,expected_completion_at,created_by)
  values(c.id,c.status,c.progress,c.diagnosis,c.work_notes,c.parts_notes,c.assigned_technician,c.assigned_technician_id,c.estimated_cost,c.actual_cost,c.delay_reason,c.expected_completion_at,u);
  return c;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_confirm_arrival(p_case_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  u uuid := auth.uid();
  c public.vehicle_maintenance_cases;
  l public.vehicle_trip_legs;
begin
  if not app.has_role(array['maintenance','super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  update public.vehicle_maintenance_cases
     set status = 'diagnosing',
         arrived_at = now(),
         updated_at = now()
   where id = p_case_id and status = 'to_maintenance' and app.maintenance_ws_can_edit(workshop_key)
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
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_dispatch_vehicle(p_case_id uuid, p_destination text, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  u uuid := auth.uid();
  c public.vehicle_maintenance_cases;
  d public.garage_departures;
  l public.vehicle_trip_legs;
  dest text;
begin
  if not app.has_role(array['maintenance','super_admin']) then
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
  if not exists (select 1 from public.vehicle_maintenance_cases x where x.id = p_case_id and app.maintenance_ws_can_edit(x.workshop_key)) then raise exception 'MAINTENANCE_CASE_FORBIDDEN'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_add_part(p_case_id uuid, p_part_name text, p_quantity numeric, p_unit text DEFAULT 'قطعة'::text, p_unit_cost numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_parts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare u uuid:=auth.uid();r public.vehicle_maintenance_parts;begin if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;if length(trim(coalesce(p_part_name,'')))<2 or p_quantity<=0 or p_unit_cost<0 then raise exception 'MAINTENANCE_PART_INVALID';end if;if not exists(select 1 from public.vehicle_maintenance_cases where id=p_case_id and completed_at is null and app.maintenance_ws_can_edit(workshop_key)) then raise exception 'MAINTENANCE_CASE_NOT_OPEN';end if;insert into public.vehicle_maintenance_parts(case_id,part_name,quantity,unit,unit_cost,notes,created_by) values(p_case_id,trim(p_part_name),p_quantity,coalesce(nullif(trim(p_unit),''),'قطعة'),p_unit_cost,nullif(trim(coalesce(p_notes,'')),''),u) returning * into r;return r;end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_register_attachment(p_case_id uuid, p_storage_path text, p_original_name text, p_mime_type text, p_size_bytes bigint, p_sha256 text, p_caption text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_attachments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare u uuid:=auth.uid();r public.vehicle_maintenance_attachments;begin
 if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;
 if not exists(select 1 from public.vehicle_maintenance_cases where id=p_case_id and completed_at is null and app.maintenance_ws_can_edit(workshop_key)) then raise exception 'MAINTENANCE_CASE_NOT_OPEN';end if;
 if p_storage_path not like p_case_id::text||'/%' or p_mime_type not in('image/jpeg','image/png','image/webp','application/pdf') or p_size_bytes not between 1 and 26214400 or p_sha256!~'^[0-9a-f]{64}$' then raise exception 'MAINTENANCE_ATTACHMENT_INVALID';end if;
 if(select count(*) from public.vehicle_maintenance_attachments where case_id=p_case_id)>=50 then raise exception 'MAINTENANCE_ATTACHMENT_LIMIT';end if;
 insert into public.vehicle_maintenance_attachments(case_id,storage_path,original_name,mime_type,size_bytes,sha256,caption,created_by) values(p_case_id,p_storage_path,trim(p_original_name),p_mime_type,p_size_bytes,lower(p_sha256),nullif(trim(coalesce(p_caption,'')),''),u) returning * into r;return r;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_release_technician(p_case_id uuid, p_employee_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_case_technicians
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare u uuid := auth.uid(); r public.vehicle_maintenance_case_technicians;
begin
  if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  if not exists (select 1 from public.vehicle_maintenance_cases where id = p_case_id and completed_at is null and app.maintenance_ws_can_edit(workshop_key)) then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  update public.vehicle_maintenance_case_technicians set released_at = now(), released_by = u, release_notes = nullif(trim(coalesce(p_notes, '')), '')
   where case_id = p_case_id and employee_id = p_employee_id and released_at is null returning * into r;
  if not found then raise exception 'MAINTENANCE_TECHNICIAN_NOT_ASSIGNED'; end if;
  perform app.maintenance_sync_technicians(p_case_id);
  return r;
end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_issue_inventory(p_case_id uuid, p_item_id uuid, p_quantity numeric, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_parts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare i public.maintenance_inventory_items;m public.maintenance_inventory_movements;p public.vehicle_maintenance_parts;new_balance numeric;parts_total numeric;begin if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;if p_quantity<=0 then raise exception 'MAINTENANCE_ISSUE_INVALID';end if;if not exists(select 1 from public.vehicle_maintenance_cases where id=p_case_id and arrived_at is not null and completed_at is null and app.maintenance_ws_can_edit(workshop_key))then raise exception 'MAINTENANCE_CASE_NOT_OPEN';end if;select * into i from public.maintenance_inventory_items where id=p_item_id and is_active and app.maintenance_ws_can_edit(workshop_key) for update;if not found then raise exception 'MAINTENANCE_ITEM_NOT_FOUND';end if;if i.current_quantity<p_quantity then raise exception 'MAINTENANCE_INVENTORY_INSUFFICIENT';end if;new_balance:=i.current_quantity-p_quantity;update public.maintenance_inventory_items set current_quantity=new_balance,updated_at=now()where id=i.id;insert into public.maintenance_inventory_movements(item_id,case_id,movement_type,quantity,unit_cost,balance_after,notes,created_by)values(i.id,p_case_id,'issue',p_quantity,i.average_unit_cost,new_balance,nullif(trim(coalesce(p_notes,'')),''),auth.uid())returning * into m;insert into public.vehicle_maintenance_parts(case_id,part_name,quantity,unit,unit_cost,notes,created_by,inventory_item_id,issue_movement_id,part_status)values(p_case_id,i.item_name,p_quantity,i.unit,i.average_unit_cost,nullif(trim(coalesce(p_notes,'')),''),auth.uid(),i.id,m.id,'issued')returning * into p;select coalesce(sum(quantity*coalesce(unit_cost,0))filter(where part_status in('issued','installed')),0)into parts_total from public.vehicle_maintenance_parts where case_id=p_case_id;update public.vehicle_maintenance_cases set parts_actual_cost=parts_total,actual_cost=service_cost+parts_total,updated_at=now()where id=p_case_id;return p;end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_inventory_receive(p_item_id uuid, p_quantity numeric, p_unit_cost numeric, p_notes text DEFAULT NULL::text)
 RETURNS maintenance_inventory_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$declare i public.maintenance_inventory_items;m public.maintenance_inventory_movements;new_qty numeric;new_cost numeric;begin if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;if p_quantity<=0 or p_unit_cost<0 then raise exception 'MAINTENANCE_RECEIPT_INVALID';end if;select * into i from public.maintenance_inventory_items where id=p_item_id and is_active and app.maintenance_ws_can_edit(workshop_key) for update;if not found then raise exception 'MAINTENANCE_ITEM_NOT_FOUND';end if;new_qty:=i.current_quantity+p_quantity;new_cost:=case when new_qty=0 then 0 else round(((i.current_quantity*i.average_unit_cost)+(p_quantity*p_unit_cost))/new_qty,2)end;update public.maintenance_inventory_items set current_quantity=new_qty,average_unit_cost=new_cost,updated_at=now()where id=i.id;insert into public.maintenance_inventory_movements(item_id,movement_type,quantity,unit_cost,balance_after,notes,created_by)values(i.id,'receipt',p_quantity,p_unit_cost,new_qty,nullif(trim(coalesce(p_notes,'')),''),auth.uid())returning * into m;return m;end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_inventory_list(p_search text DEFAULT NULL::text, p_category text DEFAULT NULL::text)
 RETURNS SETOF maintenance_inventory_items
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_INVENTORY_FORBIDDEN';
  end if;
  return query
  select * from public.maintenance_inventory_items i
   where i.is_active and app.maintenance_ws_can_edit(i.workshop_key)
     and (p_search is null
          or trim(p_search) = ''
          or i.sku ilike '%' || trim(p_search) || '%'
          or i.item_name ilike '%' || trim(p_search) || '%')
     and (p_category is null or i.part_category = p_category)
   order by (i.current_quantity <= i.low_stock_threshold) desc, i.item_name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_purchases_list(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS SETOF maintenance_purchase_orders
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  return query
  select * from public.maintenance_purchase_orders o where app.maintenance_ws_can_edit(o.workshop_key)
  order by created_at desc
  limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_purchase_detail(p_order_id uuid)
 RETURNS TABLE(order_number text, supplier_name text, notes text, created_at timestamp with time zone, total_amount numeric, part_category text, item_name text, quantity numeric, unit text, unit_price numeric, line_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then
    raise exception 'MAINTENANCE_FORBIDDEN';
  end if;
  return query
  select o.order_number, o.supplier_name, o.notes, o.created_at, o.total_amount,
         i.part_category, i.item_name, i.quantity, i.unit, i.unit_price, i.total_amount
    from public.maintenance_purchase_items i
    join public.maintenance_purchase_orders o on o.id = i.order_id
   where o.id = p_order_id and app.maintenance_ws_can_edit(o.workshop_key)
   order by i.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_purchase_create(p_supplier_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS maintenance_purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
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
  if not app.has_role(array['maintenance','super_admin']) then
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
    where is_active and part_category = v_category and item_name = trim(v_name) and workshop_key = app.maintenance_ws_mine()
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
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_technicians()
 RETURNS TABLE(user_id uuid, display_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin if not app.has_role(array['maintenance','super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN';end if;
return query select ur.user_id,coalesce(nullif(trim(e.full_name),''),u.email::text,ur.user_id::text),u.email::text from public.user_roles ur join auth.users u on u.id=ur.user_id left join public.employees e on e.user_id=ur.user_id left join public.maintenance_workshop_accounts wa on wa.user_id=ur.user_id where ur.role='maintenance' and app.maintenance_ws_can_edit(coalesce(wa.workshop_key,'central')) order by 2;end$function$;

CREATE OR REPLACE FUNCTION public.maintenance_technician_options(p_search text DEFAULT NULL::text)
 RETURNS TABLE(employee_id uuid, full_name text, employee_number text, job_title text, specialty text, specialty_label text, employment_status text, open_cases integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare q text := trim(coalesce(p_search, ''));
begin
  if not app.has_role(array['maintenance', 'ops_room', 'super_admin']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  return query
  select e.id, e.full_name, e.employee_number, t.name, t.maintenance_specialty, app.maintenance_specialty_label(t.maintenance_specialty), e.employment_status,
         (select count(*)::int from public.vehicle_maintenance_case_technicians ct join public.vehicle_maintenance_cases c on c.id = ct.case_id
           where ct.employee_id = e.id and ct.released_at is null and c.completed_at is null)
  from public.employees e join public.departments t on t.id = e.job_title_id
  where e.employment_status <> 'terminated' and e.archived_at is null and t.maintenance_specialty is not null and t.is_active
    and app.maintenance_ws_tech_visible(e.department_id)   -- 00240: فنيو الورشة الفرعية = موظفو قسم حسابها
    and (q = '' or e.full_name ilike '%' || q || '%' or e.employee_number ilike '%' || q || '%' or t.name ilike '%' || q || '%')
  order by t.maintenance_specialty, e.full_name limit 300;
end$function$;

CREATE OR REPLACE FUNCTION public.sector_send_vehicle_to_maintenance(p_departure_id uuid, p_fault_type text, p_priority text DEFAULT 'normal'::text, p_notes text DEFAULT NULL::text)
 RETURNS vehicle_maintenance_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare u uuid := auth.uid(); d public.garage_departures; v public.garage_vehicles;
        b public.sector_breakdowns; c public.vehicle_maintenance_cases; l public.vehicle_trip_legs;
        nm text; pol public.notification_workflow_policies; effective_mode text;
begin
  if not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(trim(coalesce(p_fault_type,''))) < 3 or p_priority not in ('normal','urgent','critical')
  then raise exception 'MAINTENANCE_INPUT_INVALID'; end if;
  select * into d from public.garage_departures
   where id = p_departure_id and arrived_at is not null and returned_at is null
     and (recipient_manager_id = u or app.sector_stage_eligible(u, sector_id))
   for update;
  if not found or exists(select 1 from public.vehicle_trip_legs where departure_id = d.id and arrived_at is null)
  then raise exception 'TRIP_NOT_AT_MANAGER_SITE'; end if;
  if exists(select 1 from public.vehicle_trip_legs where departure_id = d.id order by sequence_no desc limit 1)
     and (select destination_type from public.vehicle_trip_legs where departure_id = d.id order by sequence_no desc limit 1) <> 'work_site'
  then raise exception 'TRIP_NOT_AT_MANAGER_SITE'; end if;
  if exists(select 1 from public.vehicle_maintenance_cases where departure_id = d.id and completed_at is null)
  then raise exception 'MAINTENANCE_CASE_ALREADY_OPEN'; end if;
  select * into v from public.garage_vehicles where id = d.vehicle_id;
  pol := app.effective_notification_policy('maintenance_dispatch', d.sector_id, v.vehicle_category);
  effective_mode := coalesce(pol.mode, 'notify_only');
  if p_priority = 'critical' and coalesce(pol.emergency_bypass, true) then effective_mode := 'notify_only'; end if;
  select * into b from public.sector_breakdowns
   where manager_id = u and lower(trim(db_number)) = lower(trim(v.db_number))
     and status = 'logged' and archived_at is null
   order by created_at desc limit 1 for update;
  if found then
    if b.departure_id is not null and b.departure_id <> d.id then raise exception 'BREAKDOWN_ALREADY_OPEN'; end if;
    update public.sector_breakdowns
       set departure_id = d.id, vehicle_id = v.id, fault_type = trim(p_fault_type),
           notes = coalesce(nullif(trim(coalesce(p_notes,'')),''), notes)
     where id = b.id returning * into b;
  else
    select coalesce(nullif(trim(e.full_name),''), au.email, u::text) into nm
    from auth.users au left join public.employees e on e.user_id = au.id where au.id = u;
    insert into public.sector_breakdowns(manager_id, manager_name, shift, sectors, db_number, fault_type, notes, status, departure_id, vehicle_id)
    values(u, nm, d.shift, array[d.sector_id]::smallint[], v.db_number, trim(p_fault_type), nullif(trim(coalesce(p_notes,'')),''), 'logged', d.id, v.id)
    returning * into b;
  end if;
  insert into public.vehicle_maintenance_cases(departure_id, breakdown_id, vehicle_id, manager_id, fault_type, priority, dispatch_policy, garage_decision_status, workshop_key)
  values(d.id, b.id, v.id, u, trim(p_fault_type), p_priority, effective_mode,
         case effective_mode when 'ack_required' then 'awaiting_ack'
                             when 'approval_required' then 'awaiting_approval'
                             else 'not_required' end, app.maintenance_workshop_for_sector(d.sector_id))
  returning * into c;
  if effective_mode <> 'approval_required' then
    insert into public.vehicle_trip_legs(departure_id, sequence_no, origin_type, destination_type, departed_by, departure_notes)
    values(d.id, app.next_trip_leg_sequence(d.id), 'work_site', 'maintenance', u, nullif(trim(coalesce(p_notes,'')),''))
    returning * into l;
    insert into public.notifications(user_id, title, body, type, category, priority, link, entity_type, entity_id, dedupe_key)
    select ur.user_id, 'آلية في الطريق إلى الصيانة',
           format('الآلية DB %s غادرت موقع العمل إلى الصيانة', v.db_number),
           'error', 'maintenance',
           case when p_priority = 'critical' then 'critical' else 'high' end,
           '/maintenance/vehicle-cases', 'maintenance_case', c.id,
           'maintenance_case:' || c.id::text || ':maintenance'
    from public.user_roles ur where ur.role = 'maintenance'
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return c;
end$function$;
