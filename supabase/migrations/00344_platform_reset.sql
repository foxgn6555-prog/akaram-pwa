-- 00398-أ: وحدة «التصفير» — تصفير بيانات المنصة بالكامل أو بالفئات (IT) عبر سلسلة موافقات «تصفير المنصة»
-- ① الجدول + الكتالوج  ② المعاينة  ③ الطلب (كلمة سر «تصفير»)  ④ الاعتماد (كلمة سر «اعتماد تصفير») أو الرفض
-- ⑤ التنفيذ: حذف فعلي بترتيب الاعتماديات + تصفير الحسابات مع إبقاء المنفِّذ والمدير المفوض + استرداد المساحة + سجل + إشعار
-- ⑥ تكامل محرك الموافقات: نوع platform_reset (بلا زر اعتماد مباشر — الاعتماد من صفحة التفاصيل فقط)

-- ───────────── ① الجدول ─────────────
create table if not exists public.platform_reset_requests (
  id                uuid primary key default gen_random_uuid(),
  status            text not null default 'pending_approval' check (status in ('pending_approval','approved','executing','done','rejected','cancelled','failed')),
  categories        text[] not null,
  requested_cats    text[] not null,                      -- ما اختاره الطالب قبل إغلاق الاعتماديات
  snapshot          jsonb not null default '{}'::jsonb,   -- أعداد الصفوف لكل فئة عند الطلب
  requested_by      uuid not null,
  requested_by_name text,
  chain_id          uuid references public.approval_chains(id) on delete set null,
  approved_at       timestamptz,
  approved_by       uuid,
  executed_by       uuid,
  executed_at       timestamptz,
  result            jsonb,
  storage_buckets   text[] not null default '{}',
  storage_done_at   timestamptz,
  storage_deleted   int not null default 0,
  rejected_note     text,
  error_text        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.platform_reset_requests enable row level security;
drop policy if exists "platform_reset: IT reads" on public.platform_reset_requests;
create policy "platform_reset: IT reads" on public.platform_reset_requests for select to authenticated
  using (app.has_role(array['it_admin','super_admin']) or requested_by = auth.uid()
         or exists (select 1 from public.approval_tasks t where t.request_kind = 'platform_reset' and t.request_id = id and auth.uid() = any(t.approvers)));

-- ───────────── الكتالوج: كل جدول عام ينتمي لفئة واحدة بالضبط (يُثبت بالاختبار) ─────────────
create or replace function app.platform_reset_catalog()
returns table(key text, label text, grp text, sort int, tables text[], buckets text[])
language sql immutable as $$
  values
  ('employees',        'الموظفون وملفاتهم ووثائقهم',               'الموارد البشرية', 10,
     array['employees','employee_documents','documents','employee_salary_profiles','employee_shift_assignments','requests','hire_requests','termination_requests',
           'it_assets','finance_hr_notices','hr_alerts','hr_settlements','hr_settlement_events','rented_vehicle_tax_overrides','rented_vehicle_tax_audit'],
     array['employees','employee-documents','avatars']),
  ('attendance',       'الحضور والبصمة والخصومات التلقائية',       'الموارد البشرية', 20,
     array['attendance_records','hr_attendance_days','hr_attendance_audit','hr_attendance_confirmations','hr_attendance_pending_auto','hr_attendance_deductions',
           'attendance_edit_requests','attendance_edit_items','biometric_punches','biometric_pulls','biometric_pushes','biometric_device_users','biometric_device_commands',
           'hr_deduction_review_audit','hr_deduction_exemptions'], '{}'),
  ('payroll',          'الرواتب والسلف والكشوف والخزينة',          'المالية',          30,
     array['payrolls','payslips','hr_month_exports','hr_month_export_rows','hr_overtime_members','hr_overtime_member_events','hr_overtime_payouts','hr_overtime_rates',
           'advances','advance_events','advance_installments','treasury_transactions','budget_allocations','disclosures','disclosure_events'],
     array['payroll','disclosures']),
  ('leaves',           'الإجازات والزمنيات وأرصدتها',              'الموارد البشرية', 40, array['hr_leaves','hr_leave_ledger'], '{}'),
  ('approvals',        'مهام الموافقات الجارية والتفويضات',         'الطلبات',          50, array['approval_tasks','approval_delegations'], '{}'),
  ('letters',          'الكتب الرسمية والتعاميم والتقارير اليومية',  'الطلبات',          60,
     array['official_letters','deputy_daily_reports','announcements','announcement_receipts','sector_notices','it_tickets'], '{}'),
  ('complaints',       'الشكاوى الرسمية والبريد وتقارير الشكاوى',    'الشكاوى',          70,
     array['complaints','complaint_items','complaint_media','complaint_media_revisions','complaint_status_history','complaint_inbox_messages','complaint_archive_folders',
           'complaint_deletion_requests','complaint_reports','complaint_report_items','complaint_email_deliveries','complaint_email_events'],
     array['complaint-media','complaints']),
  ('citizen',          'شكاوى المواطنين وحساباتهم ومحادثاتهم',      'الشكاوى',          80,
     array['citizen_accounts','citizen_complaints','citizen_complaint_events','citizen_complaint_photos','citizen_chat_sessions','citizen_chat_messages'],
     array['citizen-complaints']),
  ('media',            'الإعلام: الصور والتصاميم والأغلفة',          'الإعلام',          90,
     array['media_submissions','media_submission_photos','media_designs','media_design_photos','media_design_sheets','media_covers'], array['media-photos']),
  ('fleet',            'الآليات والسواق والخروجات والرحلات',         'الأسطول',         100,
     array['garage_vehicles','garage_departures','garage_driver_assignments','garage_vehicle_shift_assignments','station_external_drivers','vehicles','vehicle_positions',
           'sector_vehicles','sector_breakdowns','trip_routes','trip_route_points','trip_route_gaps','trip_route_stops','vehicle_trip_legs','sector_support_requests','sector_support_assignments'],
     array['garage-vehicles','vehicles']),
  ('fuel',             'الكراج: الوقود والخزانات والحركات',           'الأسطول',         110, array['garage_tanks','garage_inventory_movements','garage_tank_zero_requests'], '{}'),
  ('transfer_station', 'محطة التحويل: الوزن والزيارات والمخالفات',    'الأسطول',         120,
     array['ts_attendance_records','ts_carrier_records','ts_saksat_records','ts_trips_records','ts_visit_weighing_steps','ts_violations','ts_weight_records','station_destinations'], '{}'),
  ('maintenance',      'الصيانة: الحالات والقطع والمشتريات',          'الأسطول',         130,
     array['vehicle_maintenance_cases','vehicle_maintenance_attachments','vehicle_maintenance_case_technicians','vehicle_maintenance_parts','vehicle_maintenance_stages',
           'vehicle_maintenance_updates','maintenance_inventory_items','maintenance_inventory_movements','maintenance_purchase_items','maintenance_purchase_orders'],
     array['maintenance-attachments']),
  ('containers',       'الحاويات وتحديثاتها',                        'الميدان',         140, array['gbs_containers','gbs_container_updates'], array['gbs-containers']),
  ('warehouse',        'مخزن العمليات والمستلزمات',                   'الميدان',         150, array['ops_store_items','ops_store_movements','sector_supply_requests'], '{}'),
  ('contractors',      'المتعهدون والعمال والحضور الميداني والصور',    'الميدان',         160,
     array['contractor_profiles','contractor_checkins','contractor_daily_counts','contractor_month_approvals','contractor_rates','contractor_worker_attendance',
           'contractor_worker_wages','contractor_workers','contractor_audit_log','sector_workers','sector_attendance','sector_photos'],
     array['contractor-photos','sector-photos']),
  ('gps',              'أجهزة التتبع والربط والمواقع والتنبيهات',      'التتبع',          170,
     array['gps_devices','gps_vehicle_bindings','gps_device_positions','gps_device_position_history','gps_events','gps_operational_alerts','gps_zone_events','gps_zone_presence_state',
           'gps_route_presence_state','gps_trip_investigations','gps_vendor_events','gps_sync_runs','gps_history_import_runs','gps_vehicle_geofences',
           'live_track_sessions','live_track_points','connection_samples'], '{}'),
  ('gps_hotspots',     'بؤر التوقف وإحصاءاتها (المشروع الأول)',        'التتبع',          180, array['gps_hotspots','gps_hotspots_month_stats','gps_hotspots_sync'], '{}'),
  ('org_departments',  'الأقسام والعناوين الوظيفية والفروع',           'الهيكل',          190, array['departments','branches'], array['departments','branches']),
  ('org_sectors',      'القواطع والمناطق والمناطق الجغرافية والمعالم',  'الهيكل',          200,
     array['parent_sectors','sectors','complaint_neighborhoods','gps_geofences','gps_map_landmarks'], array['sectors']),
  ('hr_settings',      'إعدادات الموارد البشرية والمالية (شفتات، أنواع، قواعد خصم)', 'الإعدادات', 210,
     array['hr_shifts','hr_leave_types','hr_policy','hr_settings','hr_deduction_rules','hr_deduction_rule_targets','hr_deduction_rule_audit','advance_types','disclosure_types',
           'treasury_expense_types','treasury_receivable_types','rented_vehicle_tax_settings'], '{}'),
  ('fleet_settings',   'إعدادات الأسطول والتتبع (فئات، مزودون LVN، ورش، سياسات)', 'الإعدادات', 220,
     array['vehicle_categories','gps_providers','maintenance_workshops','ts_unit_capacities','trip_route_settings','gps_route_deviation_settings','gps_alert_notification_policies',
           'gps_history_purge_settings','gps_warehouse_link','notification_workflow_policies'], '{}'),
  ('system_settings',  'إعدادات النظام (بصمة، شكاوى، إعلام، أرشيف، بوابات، سلاسل موافقات، صلاحيات)', 'الإعدادات', 230,
     array['system_settings','biometric_devices','biometric_adms_endpoints','complaint_settings','complaint_templates','complaint_contacts','complaint_sender_rules','media_design_templates',
           'citizen_portal_settings','cold_archive_settings','data_retention_policies','space_settings','live_track_settings','dynamic_portals','portal_units','portal_hidden_units',
           'role_page_permissions','permission_templates','permission_template_rules','approval_chains','approval_chain_versions'], '{}'),
  ('archive_logs',     'الأرشيف البارد وسجلات التدقيق والأخطاء والإشعارات', 'السجلات',       240,
     array['cold_archive_packages','cold_archive_copies','cold_archive_events','cold_archive_items','data_retention_requests','data_retention_events','audit_logs','app_errors',
           'integration_logs','login_attempts','permission_audit','space_reclaim_log','notifications','notification_push_deliveries','notification_push_admin_actions'], '{}'),
  ('accounts',         'الحسابات والأدوار والصلاحيات (يبقى حسابك وحسابات المدير المفوض)', 'الحسابات', 250,
     array['user_roles','manager_profiles','sector_manager_profiles','garage_user_profiles','follow_up_profiles','maintenance_workshop_accounts','user_permission_overrides',
           'user_permission_template','user_page_overrides','notification_preferences','notification_push_subscriptions'], '{}')
$$;

-- جداول لا تُصفَّر أبداً (بنية الصلاحيات المولَّدة من الكود + سجل التصفير نفسه)
create or replace function app.platform_reset_never_tables() returns text[] language sql immutable as
$$ select array['permission_units','permission_write_bindings','permission_portal_roles','platform_reset_requests'] $$;

create or replace function app.platform_reset_category_of(p_table text) returns text language sql immutable as
$$ select c.key from app.platform_reset_catalog() c where p_table = any(c.tables) limit 1 $$;

create or replace function app.platform_reset_tables(p_categories text[]) returns text[] language sql immutable as
$$ select coalesce(array_agg(distinct t), '{}') from app.platform_reset_catalog() c, unnest(c.tables) t where c.key = any(p_categories) $$;

-- الاعتماديات الصلبة: جدول خارج الاختيار يشير بمفتاح أجنبي غير قابل للإفراغ إلى جدول داخل الاختيار ⇒ لا بد من ضمّ فئته
create or replace function app.platform_reset_hard_children(p_tables text[])
returns table(child text, parent text, category text) language sql stable as $$
  select distinct c.relname, p.relname, app.platform_reset_category_of(c.relname)
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
  join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
  where k.contype = 'f' and cn.nspname = 'public' and pn.nspname = 'public'
    and p.relname = any(p_tables) and not (c.relname = any(p_tables))
    and exists (select 1 from unnest(k.conkey) ck join pg_attribute a on a.attrelid = c.oid and a.attnum = ck where a.attnotnull)
$$;

-- عند تصفير الحسابات: جداول خارج الاختيار تشير إلى auth.users بعمود إلزامي بلا حذف تتابعي ⇒ لا بد من ضمّها
create or replace function app.platform_reset_hard_auth_children(p_tables text[])
returns table(child text, parent text, category text) language sql stable as $$
  select distinct c.relname, 'auth.users', app.platform_reset_category_of(c.relname)
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
  join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
  where k.contype = 'f' and cn.nspname = 'public' and pn.nspname = 'auth' and p.relname = 'users' and k.confdeltype <> 'c'
    and not (c.relname = any(p_tables)) and not (c.relname = any(app.platform_reset_never_tables()))
    and exists (select 1 from unnest(k.conkey) ck join pg_attribute a on a.attrelid = c.oid and a.attnum = ck where a.attnotnull)
$$;

-- إغلاق الاعتماديات: يضيف الفئات اللازمة تلقائياً (وفئة الحسابات تستلزم كل شيء لأن كل الجداول تشير إلى المستخدمين)
create or replace function public.platform_reset_closure(p_categories text[]) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare cats text[] := coalesce(p_categories, '{}'); added text[] := '{}'; r record; grew boolean := true; bad text;
begin
  select key into bad from unnest(cats) key where key not in (select c.key from app.platform_reset_catalog() c) limit 1;
  if bad is not null then raise exception 'RESET_CATEGORY_INVALID: %', bad; end if;
  while grew loop
    grew := false;
    for r in select * from app.platform_reset_hard_children(app.platform_reset_tables(cats))
             union all select * from app.platform_reset_hard_auth_children(app.platform_reset_tables(cats)) where 'accounts' = any(cats) loop
      if r.category is null then raise exception 'RESET_TABLE_UNMAPPED: %', r.child; end if;
      if not (r.category = any(cats)) then cats := cats || r.category; added := added || r.category; grew := true; end if;
    end loop;
  end loop;
  return jsonb_build_object('categories', to_jsonb(cats), 'added', to_jsonb(coalesce(added, '{}')));
end$$;
grant execute on function public.platform_reset_closure(text[]) to authenticated;

-- ───────────── ② المعاينة: الفئات مع أعداد الصفوف الحقيقية ─────────────
create or replace function app.platform_reset_table_count(p_table text) returns bigint language plpgsql stable security definer set search_path = public, app as $$
declare n bigint; begin execute format('select count(*) from public.%I', p_table) into n; return n; end$$;

create or replace function public.platform_reset_counts() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare out jsonb; prot int;
begin
  perform app.require_it();
  select count(*) into prot from (select auth.uid() u union select ur.user_id from public.user_roles ur where ur.role = 'super_admin') x;
  select jsonb_agg(jsonb_build_object('key', c.key, 'label', c.label, 'grp', c.grp, 'sort', c.sort, 'tables', to_jsonb(c.tables), 'buckets', to_jsonb(c.buckets),
           'rows', (select coalesce(sum(app.platform_reset_table_count(t)), 0) from unnest(c.tables) t
                      where exists (select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace where n.nspname = 'public' and k.relname = t))
                   + case when c.key = 'accounts' then (select count(*) from auth.users) else 0 end,
           'files', (select count(*) from storage.objects o where o.bucket_id = any(c.buckets)),
           'protected_users', case when c.key = 'accounts' then prot else null end) order by c.sort)
    into out from app.platform_reset_catalog() c;
  return jsonb_build_object('categories', coalesce(out, '[]'::jsonb), 'pending', (select to_jsonb(r) from (select q.id, q.status, q.created_at from public.platform_reset_requests q where q.status in ('pending_approval','approved','executing') order by q.created_at desc limit 1) r),
                            'generated_at', now());
end$$;
grant execute on function public.platform_reset_counts() to authenticated;

-- ───────────── ⑤ التنفيذ ─────────────
create or replace function app.platform_reset_execute(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare q public.platform_reset_requests; tabs text[]; remaining text[]; nxt text[]; t text; r record; n bigint; deleted jsonb := '{}'::jsonb; total bigint := 0;
        protected uuid[]; pass int := 0; t0 timestamptz := clock_timestamp(); acct boolean; cols text; users_deleted int := 0; me uuid := auth.uid(); u uuid;
begin
  select * into q from public.platform_reset_requests where id = p_id for update;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  if q.status not in ('approved') then raise exception 'RESET_NOT_APPROVED'; end if;
  update public.platform_reset_requests set status = 'executing', executed_by = me, updated_at = now() where id = p_id;
  tabs := app.platform_reset_tables(q.categories);
  acct := 'accounts' = any(q.categories);
  select array_agg(distinct x) into protected from (select me x union select ur.user_id from public.user_roles ur where ur.role = 'super_admin') s where x is not null;
  -- الجداول الموجودة فعلاً فقط
  select array_agg(x) into tabs from unnest(tabs) x where exists (select 1 from pg_class k join pg_namespace ns on ns.oid = k.relnamespace where ns.nspname = 'public' and k.relname = x and k.relkind = 'r');
  if tabs is null then raise exception 'RESET_NOTHING_SELECTED'; end if;
  -- حراسة أخيرة: لا اعتمادية صلبة خارج الاختيار
  select string_agg(child || '→' || parent, '، ') into cols from app.platform_reset_hard_children(tabs);
  if cols is not null then raise exception 'RESET_DEPENDENCY: %', cols; end if;
  -- ① تعطيل المحفزات المخصصة (قفل الشهر، التدقيق…) أثناء التصفير فقط
  foreach t in array tabs loop execute format('alter table public.%I disable trigger user', t); end loop;
  -- ② إفراغ المراجع القابلة للإفراغ من الجداول الباقية إلى الجداول المحذوفة
  for r in select distinct c.relname child, a.attname col
           from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
           join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
           cross join lateral unnest(k.conkey) ck join pg_attribute a on a.attrelid = c.oid and a.attnum = ck
           where k.contype = 'f' and cn.nspname = 'public' and pn.nspname = 'public' and p.relname = any(tabs) and not (c.relname = any(tabs)) loop
    execute format('alter table public.%I disable trigger user', r.child);
    execute format('update public.%I set %I = null where %I is not null', r.child, r.col, r.col);
    execute format('alter table public.%I enable trigger user', r.child);
  end loop;
  -- ③ الحذف الفعلي بتمريرات حتى تفرغ كل الجداول (الأبناء أولاً تلقائياً عبر إعادة المحاولة)
  remaining := tabs;
  while cardinality(remaining) > 0 and pass < 30 loop
    pass := pass + 1; nxt := '{}';
    foreach t in array remaining loop
      begin
        if acct and t = any(app.platform_reset_tables(array['accounts'])) and exists (select 1 from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attname = 'user_id' and a.attnum > 0) then
          execute format('delete from public.%I where user_id is null or not (user_id = any($1))', t) using protected;
        else
          execute format('delete from public.%I where true', t);
        end if;
        get diagnostics n = row_count;
        deleted := deleted || jsonb_build_object(t, coalesce((deleted ->> t)::bigint, 0) + n); total := total + n;
      exception when foreign_key_violation then nxt := nxt || t;
      end;
    end loop;
    if nxt = remaining then
      foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
      raise exception 'RESET_CYCLE: %', array_to_string(nxt, '، ');
    end if;
    remaining := nxt;
  end loop;
  -- ④ حسابات الدخول: يبقى المنفِّذ والمدير المفوض فقط (وتبقى أدوارهم)
  if acct then
    for r in select distinct c.relname child, a.attname col, a.attnotnull nn
             from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
             join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
             cross join lateral unnest(k.conkey) ck join pg_attribute a on a.attrelid = c.oid and a.attnum = ck
             where k.contype = 'f' and cn.nspname = 'public' and pn.nspname = 'auth' and p.relname = 'users' and not (c.relname = any(tabs))
               and not (c.relname = any(app.platform_reset_never_tables())) and k.confdeltype not in ('c') loop
      if r.nn then raise exception 'RESET_ACCOUNTS_IN_USE: %.%', r.child, r.col; end if;
      execute format('update public.%I set %I = null where %I is not null and not (%I = any($1))', r.child, r.col, r.col, r.col) using protected;
    end loop;
    delete from auth.users where not (id = any(protected));
    get diagnostics users_deleted = row_count;
    total := total + users_deleted;
  end if;
  foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
  -- ⑤ استرداد المساحة فعلياً (طابور الضغط 00370 — VACUUM FULL مجدول خلال دقيقة إن توفر pg_cron)
  begin
    perform app.space_reclaim_enqueue(tabs, 'platform_reset');
    perform app.space_reclaim_plan(now() + interval '1 minute');
  exception when others then null;
  end;
  update public.platform_reset_requests
     set status = 'done', executed_at = now(), updated_at = now(),
         result = jsonb_build_object('tables', cardinality(tabs), 'rows_deleted', total, 'users_deleted', users_deleted, 'protected_users', cardinality(protected),
                                     'passes', pass, 'per_table', deleted, 'duration_ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int,
                                     'buckets', to_jsonb(q.storage_buckets), 'warehouse_wipe', 'gps_hotspots' = any(q.categories))
   where id = p_id;
  -- ⑥ السجل والإشعار (بعد الحذف كي يبقيا)
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('platform_reset_requests', p_id::text, 'DELETE', jsonb_build_object('categories', q.categories, 'rows_deleted', total, 'users_deleted', users_deleted), me, 'it_admin');
  for u in select distinct ur.user_id from public.user_roles ur where ur.role in ('it_admin', 'super_admin') loop
    perform app.hr_notify(u, 'نُفِّذ تصفير المنصة', 'حُذف ' || total || ' سجل من ' || cardinality(tabs) || ' جدول (' || cardinality(q.categories) || ' فئة) · نفّذه ' || coalesce(app.user_display_name(me), 'IT'),
                          '/it/platform-reset', 'platform_reset_done:' || p_id::text, 'warning');
  end loop;
  return (select x.result from public.platform_reset_requests x where x.id = p_id);
end$$;
revoke all on function app.platform_reset_execute(uuid) from public, anon, authenticated;

-- ───────────── ③ الطلب ─────────────
create or replace function public.platform_reset_request(p_categories text[], p_password text) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v_id uuid; cl jsonb; cats text[]; snap jsonb; v_chain uuid; cnt jsonb; bks text[]; res jsonb;
begin
  perform app.require_it();
  if coalesce(trim(p_password), '') <> 'تصفير' then raise exception 'RESET_PASSWORD_WRONG'; end if;
  if coalesce(cardinality(p_categories), 0) = 0 then raise exception 'RESET_NOTHING_SELECTED'; end if;
  if exists (select 1 from public.platform_reset_requests where status in ('pending_approval','approved','executing')) then raise exception 'RESET_ALREADY_PENDING'; end if;
  cl := public.platform_reset_closure(p_categories);
  select array_agg(x) into cats from jsonb_array_elements_text(cl -> 'categories') x;
  cnt := public.platform_reset_counts();
  select jsonb_object_agg(c ->> 'key', jsonb_build_object('rows', (c ->> 'rows')::bigint, 'files', (c ->> 'files')::bigint)) into snap
    from jsonb_array_elements(cnt -> 'categories') c where (c ->> 'key') = any(cats);
  select coalesce(array_agg(distinct b), '{}') into bks from app.platform_reset_catalog() c, unnest(c.buckets) b where c.key = any(cats);
  insert into public.platform_reset_requests (categories, requested_cats, snapshot, requested_by, requested_by_name, storage_buckets)
  values (cats, p_categories, coalesce(snap, '{}'::jsonb), auth.uid(), coalesce(app.user_display_name(auth.uid()), 'IT'), bks) returning id into v_id;
  v_chain := app.approval_open('platform_reset', v_id, auth.uid());
  if v_chain is not null then
    update public.platform_reset_requests set chain_id = v_chain where id = v_id;
    return jsonb_build_object('id', v_id, 'status', 'pending_approval', 'via_chain', true, 'categories', to_jsonb(cats), 'added', cl -> 'added');
  end if;
  -- بلا سلسلة مضبوطة: التنفيذ مباشرة
  update public.platform_reset_requests set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = v_id;
  res := app.platform_reset_execute(v_id);
  return jsonb_build_object('id', v_id, 'status', 'done', 'via_chain', false, 'categories', to_jsonb(cats), 'added', cl -> 'added', 'result', res);
end$$;
grant execute on function public.platform_reset_request(text[], text) to authenticated;

create or replace function public.platform_reset_cancel(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare q public.platform_reset_requests;
begin
  perform app.require_it();
  select * into q from public.platform_reset_requests where id = p_id for update;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  if q.status <> 'pending_approval' then raise exception 'RESET_NOT_PENDING'; end if;
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الطلب' where request_kind = 'platform_reset' and request_id = p_id and status in ('pending','waiting');
  update public.platform_reset_requests set status = 'cancelled', updated_at = now() where id = p_id;
end$$;
grant execute on function public.platform_reset_cancel(uuid) to authenticated;

-- ───────────── ④ القرار: الرفض عبر المحرك، والاعتماد فقط بكلمة السر من صفحة التفاصيل ─────────────
create or replace function public.platform_reset_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare q public.platform_reset_requests; fin boolean;
begin
  select * into q from public.platform_reset_requests where id = p_id for update;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  if q.status <> 'pending_approval' then raise exception 'RESET_NOT_PENDING'; end if;
  if p_approve then raise exception 'RESET_APPROVE_PASSWORD_REQUIRED'; end if;   -- الاعتماد لا يمرّ من زر المهمة المباشر
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'HR_REASON_REQUIRED'; end if;
  fin := app.approval_decide('platform_reset', p_id, false, p_note);
  update public.platform_reset_requests set status = 'rejected', rejected_note = trim(p_note), updated_at = now() where id = p_id;
  perform app.hr_notify(q.requested_by, 'رُفض طلب تصفير المنصة', 'السبب: ' || trim(p_note), '/it/platform-reset', 'platform_reset_rej:' || q.id::text, 'warning');
end$$;
grant execute on function public.platform_reset_decide(uuid, boolean, text) to authenticated;

create or replace function public.platform_reset_approve(p_id uuid, p_password text) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare q public.platform_reset_requests; fin boolean; res jsonb;
begin
  select * into q from public.platform_reset_requests where id = p_id for update;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  if q.status <> 'pending_approval' then raise exception 'RESET_NOT_PENDING'; end if;
  if coalesce(trim(p_password), '') <> 'اعتماد تصفير' then raise exception 'RESET_APPROVE_PASSWORD_WRONG'; end if;
  fin := app.approval_decide('platform_reset', p_id, true, null);
  if not fin then return jsonb_build_object('id', p_id, 'status', 'pending_approval', 'final', false); end if;
  update public.platform_reset_requests set status = 'approved', approved_at = now(), approved_by = auth.uid(), updated_at = now() where id = p_id;
  res := app.platform_reset_execute(p_id);
  return jsonb_build_object('id', p_id, 'status', 'done', 'final', true, 'result', res);
end$$;
grant execute on function public.platform_reset_approve(uuid, text) to authenticated;

-- التفاصيل: للطالب، IT، ومعتمِدي السلسلة
create or replace function public.platform_reset_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare q public.platform_reset_requests; cats jsonb; tl jsonb;
begin
  select * into q from public.platform_reset_requests where id = p_id;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  if not (q.requested_by = auth.uid() or app.has_role(array['it_admin','super_admin'])
          or exists (select 1 from public.approval_tasks t where t.request_kind = 'platform_reset' and t.request_id = p_id and auth.uid() = any(t.approvers))) then
    raise exception 'RESET_FORBIDDEN';
  end if;
  select jsonb_agg(jsonb_build_object('key', c.key, 'label', c.label, 'grp', c.grp, 'tables', to_jsonb(c.tables), 'buckets', to_jsonb(c.buckets),
                                      'rows', (q.snapshot -> c.key ->> 'rows')::bigint, 'files', (q.snapshot -> c.key ->> 'files')::bigint,
                                      'auto_added', not (c.key = any(q.requested_cats))) order by c.sort)
    into cats from app.platform_reset_catalog() c where c.key = any(q.categories);
  select coalesce(jsonb_agg(jsonb_build_object('step_no', t.step_no, 'label', t.step_label, 'status', t.status, 'decided_by', app.manager_display_name(t.decided_by), 'decided_at', t.decided_at, 'note', t.note) order by t.step_no), '[]'::jsonb)
    into tl from public.approval_tasks t where t.request_kind = 'platform_reset' and t.request_id = p_id;
  return jsonb_build_object('id', q.id, 'status', q.status, 'status_label', app.platform_reset_status_label(q.status), 'categories', coalesce(cats, '[]'::jsonb),
    'total_rows', (select coalesce(sum((v ->> 'rows')::bigint), 0) from jsonb_each(q.snapshot) e(k, v) where k = any(q.categories)),
    'total_files', (select coalesce(sum((v ->> 'files')::bigint), 0) from jsonb_each(q.snapshot) e(k, v) where k = any(q.categories)),
    'requested_by', q.requested_by, 'requested_by_name', q.requested_by_name, 'created_at', q.created_at, 'approved_at', q.approved_at, 'executed_at', q.executed_at,
    'result', q.result, 'rejected_note', q.rejected_note, 'storage_buckets', to_jsonb(q.storage_buckets), 'storage_done_at', q.storage_done_at, 'storage_deleted', q.storage_deleted,
    'via_chain', q.chain_id is not null, 'timeline', tl,
    'can_approve', q.status = 'pending_approval' and auth.uid() = any(coalesce(app.approval_current_approvers('platform_reset', p_id), '{}')),
    'includes_accounts', 'accounts' = any(q.categories));
end$$;
grant execute on function public.platform_reset_detail(uuid) to authenticated;

create or replace function app.platform_reset_status_label(p text) returns text language sql immutable as $$
  select case p when 'pending_approval' then 'بانتظار الموافقات' when 'approved' then 'معتمد' when 'executing' then 'قيد التنفيذ' when 'done' then 'نُفِّذ'
                when 'rejected' then 'مرفوض' when 'cancelled' then 'ملغى' when 'failed' then 'فشل' else coalesce(p, '—') end $$;

create or replace function public.platform_reset_list(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'status_label', app.platform_reset_status_label(q.status), 'categories', to_jsonb(q.categories),
                     'categories_count', cardinality(q.categories), 'requested_by_name', q.requested_by_name, 'created_at', q.created_at, 'executed_at', q.executed_at,
                     'rows_deleted', (q.result ->> 'rows_deleted')::bigint, 'users_deleted', (q.result ->> 'users_deleted')::int, 'rejected_note', q.rejected_note,
                     'via_chain', q.chain_id is not null, 'storage_pending', q.status = 'done' and cardinality(q.storage_buckets) > 0 and q.storage_done_at is null,
                     'current_step', (select t.step_label from public.approval_tasks t where t.request_kind = 'platform_reset' and t.request_id = q.id and t.status = 'pending' order by t.step_no limit 1)) order by q.created_at desc)
                   from (select * from public.platform_reset_requests order by created_at desc limit greatest(1, least(coalesce(p_limit, 50), 500))) q), '[]'::jsonb);
end$$;
grant execute on function public.platform_reset_list(int) to authenticated;

-- ───────────── ملفات التخزين: تُحذف من المتصفح عبر واجهة التخزين (كما في 00368) بسياسة مؤقتة أثناء تصفير جارٍ ─────────────
create or replace function app.platform_reset_storage_active_buckets() returns text[]
language sql stable security definer set search_path = public, app as $$
  select coalesce((select q.storage_buckets from public.platform_reset_requests q where q.status = 'done' and q.storage_done_at is null and cardinality(q.storage_buckets) > 0
                     and q.executed_at > now() - interval '6 hours' order by q.executed_at desc limit 1), '{}')
$$;
drop policy if exists "platform-reset: IT reads bucket files while resetting" on storage.objects;
create policy "platform-reset: IT reads bucket files while resetting" on storage.objects for select to authenticated
  using (app.has_role(array['it_admin', 'super_admin']) and bucket_id = any(app.platform_reset_storage_active_buckets()));
drop policy if exists "platform-reset: IT removes bucket files while resetting" on storage.objects;
create policy "platform-reset: IT removes bucket files while resetting" on storage.objects for delete to authenticated
  using (app.has_role(array['it_admin', 'super_admin']) and bucket_id = any(app.platform_reset_storage_active_buckets()));

create or replace function public.platform_reset_storage_objects(p_id uuid, p_limit int default 500)
returns table(bucket_id text, name text) language plpgsql stable security definer set search_path = public, app as $$
declare q public.platform_reset_requests;
begin
  perform app.require_it();
  select * into q from public.platform_reset_requests where id = p_id;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  return query select o.bucket_id, o.name from storage.objects o where o.bucket_id = any(q.storage_buckets) order by o.bucket_id, o.name limit greatest(1, least(coalesce(p_limit, 500), 1000));
end$$;
grant execute on function public.platform_reset_storage_objects(uuid, int) to authenticated;

create or replace function public.platform_reset_storage_finish(p_id uuid, p_deleted int default 0) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare q public.platform_reset_requests; left_n bigint;
begin
  perform app.require_it();
  select * into q from public.platform_reset_requests where id = p_id for update;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  select count(*) into left_n from storage.objects o where o.bucket_id = any(q.storage_buckets);
  update public.platform_reset_requests set storage_deleted = storage_deleted + greatest(coalesce(p_deleted, 0), 0), storage_done_at = case when left_n = 0 then now() else storage_done_at end, updated_at = now() where id = p_id;
  return jsonb_build_object('id', p_id, 'remaining', left_n, 'done', left_n = 0);
end$$;
grant execute on function public.platform_reset_storage_finish(uuid, int) to authenticated;

-- ───────────── ⑥ محرك الموافقات: نوع «تصفير المنصة» ─────────────
alter table public.approval_chains drop constraint if exists approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check check (request_type in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire','attendance_edit','platform_reset'));
alter table public.approval_tasks drop constraint if exists approval_tasks_request_kind_check;
alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (request_kind in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire','attendance_edit','platform_reset'));
create or replace function app.approval_kind_label(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'leave' then 'إجازة' when 'time_permit' then 'زمنية' when 'advance' then 'سلفة' when 'termination' then 'إنهاء خدمة'
                     when 'supplies' then 'مستلزمات' when 'disclosure' then 'كشف' when 'cold_archive_purge' then 'حذف أرشيف بارد' when 'complaint_report' then 'تقرير شكاوى'
                     when 'hire' then 'تعيين موظف' when 'attendance_edit' then 'تعديل حضور' when 'platform_reset' then 'تصفير المنصة' else coalesce(p_kind, '—') end
$$;

-- التوجيه
create or replace function app.approval_decide_request__raw(p_kind text, p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_kind = 'supplies' then perform public.supply_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'termination' then perform public.termination_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'disclosure' then perform public.disclosure_decide(p_request, p_approve, p_note, null);
  elsif p_kind = 'advance' then perform public.advance_decide(p_request, p_approve, p_note, null, null);
  elsif p_kind = 'cold_archive_purge' then perform public.cold_archive_purge_decide(p_request, p_approve, p_note);
  elsif p_kind = 'complaint_report' then perform public.complaint_report_decide(p_request, p_approve, p_note);
  elsif p_kind = 'hire' then perform public.hire_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'attendance_edit' then perform public.attendance_edit_decide(p_request, p_approve, p_note);   -- 00397
  elsif p_kind = 'platform_reset' then perform public.platform_reset_decide(p_request, p_approve, p_note);   -- 00398
  elsif p_kind in ('leave','time_permit') then perform public.hr_leave_decide(p_request, p_approve, p_note);
  else raise exception 'APPROVAL_TYPE_INVALID'; end if;
end$$;

-- إشعار الخطوة
create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text; link text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if t.id is null then return; end if;
  if p_kind = 'platform_reset' then   -- 00398
    select q.* into l from public.platform_reset_requests q where q.id = p_request;
    title := 'طلب تصفير المنصة بانتظار قرارك (خطوة ' || p_step || ')';
    body := cardinality(l.categories) || ' فئة بيانات · ' || (select coalesce(sum((v ->> 'rows')::bigint), 0) from jsonb_each(l.snapshot) e(k, v)) || ' سجل · طلبه ' || coalesce(l.requested_by_name, 'IT') || ' · الاعتماد من صفحة التفاصيل فقط';
  elsif p_kind = 'attendance_edit' then   -- 00397
    select q.* into l from public.attendance_edit_requests q where q.id = p_request;
    title := 'طلب تعديل حضور بانتظار موافقتك (خطوة ' || p_step || ') — ' || l.scope_label;
    body := app.attendance_action_label(l.action) || ' · ' || l.employees_count || ' موظف × ' || l.days_count || ' يوم · ' || array_to_string((select array_agg(to_char(d, 'YYYY-MM-DD')) from unnest(l.dates) d), '، ')
            || ' · السبب: ' || l.reason || ' · طلبه ' || coalesce(app.manager_display_name(l.requested_by), 'غرفة العمليات');
  elsif p_kind = 'hire' then
    select q.*, d.name as title_name, p.name as dept_name into l from public.hire_requests q join public.departments d on d.id = q.job_title_id left join public.departments p on p.id = q.department_id where q.id = p_request;
    title := 'طلب تعيين موظف بانتظار موافقتك (خطوة ' || p_step || ') — ' || l.full_name;
    body := app.hire_source_label(l.source) || ' · ' || l.title_name || coalesce(' · ' || l.dept_name, '') || ' · مباشرة ' || l.hire_date::text || ' · ' || case l.contract_type when 'daily' then 'يومي' else 'شهري' end || ' · طلبه ' || coalesce(app.user_display_name(l.requester_user_id), '');
  elsif p_kind = 'complaint_report' then
    select r.* into l from public.complaint_reports r where r.id = p_request;
    title := 'تقرير شكاوى بانتظار اعتمادك (خطوة ' || p_step || ') — ' || l.title;
    body := case l.sector when 'karrada' then 'الكرادة' else 'الزعفرانية' end || ' · ' || l.report_date::text || ' · ' || (select count(*) from public.complaint_report_items i where i.report_id = l.id and i.included) || ' موقعاً · أعدّه ' || coalesce(app.user_display_name(l.approval_requested_by), '');
  elsif p_kind = 'cold_archive_purge' then
    select p.* into l from public.cold_archive_packages p where p.id = p_request;
    title := 'طلب حذف أرشيف بارد بانتظار قرارك (خطوة ' || p_step || ') — ' || l.code;
    body := 'الفترة ' || l.period_from::text || ' → ' || l.period_to::text || ' · ' || l.file_count || ' ملف · نسخ متحقَّقة ' || l.verified_copies || '/' || l.required_copies || ' · طلبه ' || coalesce(app.user_display_name(l.purge_requested_by), '');
  elsif p_kind = 'advance' then
    select a.* into l from public.advances a where a.id = p_request;
    title := 'طلب سلفة بانتظار قرارك (خطوة ' || p_step || ') — ' || l.type_name;
    body := l.employee_name || ' · ' || to_char(l.amount, 'FM999,999,999') || ' د.ع · ' || app.advance_method_label(l.repayment_method) || ' · ' || l.ref_no;
  elsif p_kind = 'disclosure' then
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

-- مهامي
drop function if exists public.approval_my_tasks();
create or replace function public.approval_my_tasks()
returns table(task_id uuid, request_kind text, request_id uuid, step_no int, total_steps int, step_label text, requester_user_id uuid, requester_name text, requester_role text, requester_role_label text,
              area_name text, parent_sector text, type_name text, start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, notes text, attachment_path text, created_at timestamptz, previous_steps jsonb, items jsonb, ref_no text, details jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  with base as (
    select t.*, e.user_id as req_user, e.full_name as req_name, lt.name as type_name, l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.notes, l.attachment_path, l.created_at as req_created, null::jsonb as items, null::text as ref_no,
      case when l.is_backdated then jsonb_build_object('backdated', true, 'reason', l.backdated_reason, 'days_late', l.backdated_days, 'prior_status', l.backdated_prior_status,
        'month_count', (select count(*) from public.hr_leaves x where x.employee_id = l.employee_id and x.is_backdated and x.status in ('pending', 'approved') and date_trunc('month', x.created_at at time zone 'UTC') = date_trunc('month', l.created_at at time zone 'UTC')),
        'alert_threshold', app.hr_policy_int('backdated_alert_per_month', 3)) end as details, null::text as fixed_role
    from public.approval_tasks t join public.hr_leaves l on l.id = t.request_id and t.request_kind in ('leave','time_permit') join public.employees e on e.id = l.employee_id left join public.hr_leave_types lt on lt.id = l.leave_type_id
    where t.status = 'pending' and auth.uid() = any(t.approvers) and l.status = 'pending'
    union all
    select t.*, r.manager_id, r.manager_name, 'مستلزمات القواطع', null, null, null, null, null, null, r.notes, null, r.created_at, r.items, r.ref_no, null, null
    from public.approval_tasks t join public.sector_supply_requests r on r.id = t.request_id and t.request_kind = 'supplies'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and r.approval_status = 'pending'
    union all
    select t.*, q.requester_user_id, app.manager_display_name(q.requester_user_id), 'إنهاء خدمة', q.last_day, q.last_day, null, null, null, null, q.reason, q.attachment_path, q.created_at, null, null,
      jsonb_build_object('target_name', q.target_name, 'target_label', q.target_label, 'target_kind', q.target_kind, 'type', q.termination_type, 'type_label', app.termination_type_label(q.termination_type), 'last_day', q.last_day), q.requester_role
    from public.approval_tasks t join public.termination_requests q on q.id = t.request_id and t.request_kind = 'termination'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending'
    union all
    -- 00348: طلبات التعيين
    select t.*, q.requester_user_id, app.manager_display_name(q.requester_user_id), 'تعيين موظف', q.hire_date, q.hire_date, null, null, null, null, q.note, null, q.created_at, null, null,
      jsonb_build_object('full_name', q.full_name, 'phone', q.phone, 'job_title', jt.name, 'department', dp.name, 'hire_date', q.hire_date, 'contract_type', q.contract_type,
                         'contract_label', case q.contract_type when 'daily' then 'يومي' else 'شهري' end, 'shift_name', sh.name, 'source', q.source, 'source_label', app.hire_source_label(q.source)), q.requester_role
    from public.approval_tasks t join public.hire_requests q on q.id = t.request_id and t.request_kind = 'hire'
    join public.departments jt on jt.id = q.job_title_id left join public.departments dp on dp.id = q.department_id left join public.hr_shifts sh on sh.id = q.shift_id
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending'
    union all
    -- 00398: طلبات تصفير المنصة (بلا اعتماد مباشر — التفاصيل فقط)
    select t.*, q.requested_by, coalesce(q.requested_by_name, app.manager_display_name(q.requested_by)), 'تصفير المنصة', q.created_at::date, q.created_at::date, null, null, null, null, null, null, q.created_at, null, null,
      jsonb_build_object('categories', to_jsonb(q.categories), 'categories_count', cardinality(q.categories), 'includes_accounts', 'accounts' = any(q.categories),
                         'labels', (select jsonb_agg(c.label order by c.sort) from app.platform_reset_catalog() c where c.key = any(q.categories)),
                         'total_rows', (select coalesce(sum((v ->> 'rows')::bigint), 0) from jsonb_each(q.snapshot) e(k, v)), 'detail_only', true), 'it_admin'
    from public.approval_tasks t join public.platform_reset_requests q on q.id = t.request_id and t.request_kind = 'platform_reset'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending_approval'
    union all
    -- 00397: طلبات تعديل الحضور
    select t.*, q.requested_by, app.manager_display_name(q.requested_by), 'تعديل حضور', q.dates[1], q.dates[cardinality(q.dates)], null, null, null, null, q.reason, null, q.created_at, null, null,
      jsonb_build_object('scope_label', q.scope_label, 'scope_kind', q.scope_kind, 'action', q.action, 'action_label', app.attendance_action_label(q.action), 'payload', q.payload,
                         'employees', q.employees_count, 'days', q.days_count, 'items', q.items_count, 'dates', to_jsonb(q.dates), 'reason', q.reason), q.requester_role
    from public.approval_tasks t join public.attendance_edit_requests q on q.id = t.request_id and t.request_kind = 'attendance_edit'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending_approval'
    union all
    select t.*, a.requested_by, coalesce(a.requested_by_name, app.manager_display_name(a.requested_by)), 'سلفة', null, null, null, null, null, null, a.notes, null, a.created_at, null, a.ref_no,
      jsonb_build_object('employee_name', a.employee_name, 'employee_number', a.employee_number, 'type_name', a.type_name, 'amount', a.amount, 'requested_amount', a.requested_amount,
        'method', a.repayment_method, 'method_label', app.advance_method_label(a.repayment_method), 'installments', a.installments, 'monthly_amount', a.monthly_amount, 'percent', a.percent,
        'estimated_installment', app.advance_installment_amount(a, app.advance_monthly_salary(a.employee_id))), 'ops_room'
    from public.approval_tasks t join public.advances a on a.id = t.request_id and t.request_kind = 'advance'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and a.status = 'pending'
    union all
    select t.*, p.purge_requested_by, app.user_display_name(p.purge_requested_by), 'حذف أرشيف بارد', p.period_from, p.period_to, null, null, null, null, p.note, null, p.purge_requested_at, null, p.code,
      jsonb_build_object('code', p.code, 'period_from', p.period_from, 'period_to', p.period_to, 'file_count', p.file_count, 'total_bytes', p.total_bytes, 'verified_copies', p.verified_copies, 'required_copies', p.required_copies,
        'purge_available_at', p.purge_available_at, 'copies', (select string_agg(c.disk_label, '، ') from public.cold_archive_copies c where c.package_id = p.id),
        'by_source', coalesce((select jsonb_agg(jsonb_build_object('source_key', i.source_key, 'files', i.n) order by i.n desc) from (select source_key, count(*) n from public.cold_archive_items where package_id = p.id group by source_key) i), '[]'::jsonb)), 'it_admin'
    from public.approval_tasks t join public.cold_archive_packages p on p.id = t.request_id and t.request_kind = 'cold_archive_purge'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and p.status = 'verified' and p.purge_chain_id is not null and p.purge_approved_at is null
    union all
    select t.*, r.approval_requested_by, app.user_display_name(r.approval_requested_by), 'تقرير شكاوى', r.report_date, r.report_date, null, null, null, null, null, r.pptx_path, r.approval_requested_at, null, null,
      jsonb_build_object('title', r.title, 'sector', r.sector, 'sector_label', case r.sector when 'karrada' then 'الكرادة' else 'الزعفرانية' end, 'report_date', r.report_date, 'scope', r.report_scope,
        'items', (select count(*) from public.complaint_report_items i where i.report_id = r.id and i.included), 'recipients', r.recipients, 'pptx_path', r.pptx_path, 'review_confirmed_at', r.review_confirmed_at), 'complaints_officer'
    from public.approval_tasks t join public.complaint_reports r on r.id = t.request_id and t.request_kind = 'complaint_report'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and r.status = 'quality_review' and r.approval_chain_id is not null
  )
  select b.id, b.request_kind, b.request_id, b.step_no,
    (select count(*)::int from public.approval_tasks x where x.request_kind = b.request_kind and x.request_id = b.request_id and x.status <> 'skipped'),
    b.step_label, b.req_user, b.req_name, coalesce(c.requester_role, b.fixed_role), app.approval_role_label(coalesce(c.requester_role, b.fixed_role)),
    (select string_agg(s.name, '، ') from public.sectors s where s.parent_sector = any(app.user_parent_sectors(b.req_user))
       and (s.id in (select cp.sector_id from public.contractor_profiles cp where cp.user_id = b.req_user and cp.is_active)
            or s.id in (select unnest(mp.sectors) from public.manager_profiles mp where mp.user_id = b.req_user))),
    (select string_agg(app.parent_sector_name(x), '، ') from unnest(app.user_parent_sectors(b.req_user)) x),
    b.type_name, b.start_date, b.end_date, b.start_time, b.end_time, b.days, b.minutes, b.notes, b.attachment_path, b.req_created,
    coalesce((select jsonb_agg(jsonb_build_object('step_no', p.step_no, 'label', p.step_label, 'status', p.status, 'decided_by', app.manager_display_name(p.decided_by), 'decided_at', p.decided_at, 'note', p.note) order by p.step_no)
              from public.approval_tasks p where p.request_kind = b.request_kind and p.request_id = b.request_id and p.step_no < b.step_no), '[]'::jsonb),
    b.items, b.ref_no, b.details
  from base b left join public.approval_chains c on c.id = b.chain_id
  order by b.req_created;
end$$;
grant execute on function public.approval_my_tasks() to authenticated;

-- المسار الزمني
create or replace function public.approval_timeline(p_kind text, p_request uuid)
returns table(step_no int, step_label text, status text, approvers jsonb, decided_by_name text, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = public, app as $$
declare requester uuid;
begin
  if p_kind = 'supplies' then select r.manager_id into requester from public.sector_supply_requests r where r.id = p_request;
  elsif p_kind = 'termination' then select r.requester_user_id into requester from public.termination_requests r where r.id = p_request;
  elsif p_kind = 'hire' then select r.requester_user_id into requester from public.hire_requests r where r.id = p_request;
  elsif p_kind = 'attendance_edit' then select r.requested_by into requester from public.attendance_edit_requests r where r.id = p_request;   -- 00397
  elsif p_kind = 'platform_reset' then select r.requested_by into requester from public.platform_reset_requests r where r.id = p_request;   -- 00398
  elsif p_kind = 'advance' then select a.requested_by into requester from public.advances a where a.id = p_request;
  elsif p_kind = 'cold_archive_purge' then select p.purge_requested_by into requester from public.cold_archive_packages p where p.id = p_request;
  elsif p_kind = 'complaint_report' then select coalesce(r.approval_requested_by, r.created_by) into requester from public.complaint_reports r where r.id = p_request;
  else select e.user_id into requester from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id where l1.id = p_request; end if;
  if requester is null and not found then raise exception 'HR_NOT_FOUND'; end if;
  if not (auth.uid() = requester or app.has_role(array['it_admin','hr_officer','super_admin','ops_room'])
          or (p_kind = 'advance' and app.has_role(array['finance_officer']))
          or (p_kind = 'complaint_report' and app.has_role(array['complaints_officer']))
          or (p_kind = 'attendance_edit' and app.has_role(array['deputy_director','executive_director']))
          or exists (select 1 from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request and auth.uid() = any(t.approvers))) then
    raise exception 'HR_FORBIDDEN';
  end if;
  return query
  select t.step_no, t.step_label, t.status,
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', a, 'name', app.manager_display_name(a))), '[]'::jsonb) from unnest(t.approvers) a),
    app.manager_display_name(t.decided_by), t.decided_at, t.note
  from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request order by t.step_no;
end$$;


-- حفظ السلاسل
create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true, p_subtype text default null,
                                                      p_department uuid default null, p_include_children boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb; st text := nullif(trim(coalesce(p_subtype, '')), ''); v_role text := p_requester_role;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire','attendance_edit','platform_reset') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if p_department is not null then
    -- 00391: سلسلة قسم — تنطبق على كل موظفي القسم (والفرعية اختيارياً) أياً كان دورهم
    if p_request_type not in ('leave','time_permit','advance') then raise exception 'APPROVAL_DEPT_TYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.departments d where d.id = p_department) then raise exception 'APPROVAL_DEPT_INVALID'; end if;
    v_role := 'department';
  else
    if coalesce(v_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
    if not (v_role = any(app.approval_requester_roles())) then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'cold_archive_purge' and v_role not in ('it_admin','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'complaint_report' and v_role not in ('complaints_officer','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'attendance_edit' and v_role not in ('ops_room','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;   -- 00397
    if p_request_type = 'platform_reset' and v_role not in ('it_admin','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;   -- 00398
    if p_request_type = 'hire' and v_role not in ('central_garage_officer','transfer_station','maintenance','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  end if;
  if st is not null then
    if p_request_type not in ('leave','time_permit') then raise exception 'APPROVAL_SUBTYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.hr_leave_types t where t.code = st and t.kind = p_request_type) then raise exception 'APPROVAL_SUBTYPE_INVALID'; end if;
  end if;
  perform app.approval_validate_steps(p_steps);
  select jsonb_agg(app.approval_clean_step(s) order by o) into clean from jsonb_array_elements(p_steps) with ordinality t(s, o);
  select c.id into v_id from public.approval_chains c where c.requester_role = v_role and c.request_type = p_request_type and coalesce(c.subtype, '') = coalesce(st, '')
    and c.department_id is not distinct from p_department;
  if v_id is null then
    insert into public.approval_chains (requester_role, request_type, subtype, steps, is_active, updated_by, department_id, include_children)
    values (v_role, p_request_type, st, clean, coalesce(p_active, true), auth.uid(), p_department, coalesce(p_include_children, true)) returning id into v_id;
  else
    update public.approval_chains set steps = clean, is_active = coalesce(p_active, true), include_children = coalesce(p_include_children, true), updated_by = auth.uid(), updated_at = now() where id = v_id;
  end if;
  return v_id;
end$$;

-- الحارس
create or replace function app.guarded_write_functions() returns text[] language sql immutable as $$
  select array[
    'approval_decide_request','hr_leave_decide','hr_leave_request','hr_leave_cancel','supply_request_decide','supply_request_deliver','supply_request_create',
    'termination_request_create','termination_request_decide','disclosure_submit','disclosure_decide','advance_request_create','advance_decide','advance_deliver','advance_settle_cash',
    'hire_request_create','hire_request_decide','hire_request_cancel','hire_request_complete','hr_employee_create','hr_employee_terminate',
    'cold_archive_package_create','cold_archive_purge_request','cold_archive_purge_decide','cold_archive_purge_approve','cold_archive_purge_confirm',
    'complaint_report_decide','complaint_approve_report','complaint_decide_deletion','complaint_create_item_from_inbox','complaint_batch_create_items_from_inbox',
    'complaint_start_item','complaint_complete_item','complaint_start_assignment_ticket','complaint_complete_assignment_ticket',
    'finance_payroll_approve','finance_payroll_adjust','finance_payroll_reconcile','finance_treasury_confirm','exec_treasury_record','deputy_payroll_approve',
    'ops_attendance_confirm','ops_contractor_month_approve','ops_deduction_add','it_deduction_exemption_add','contractor_checkin',
    'garage_record_departure','garage_record_return','garage_record_shift_departure','garage_decide_maintenance_dispatch','garage_decide_tank_zero',
    'sector_confirm_vehicle_arrival','sector_confirm_vehicle_site_return','sector_submit_breakdown','sector_submit_supply','sector_supply_submit','sector_support_request_create',
    'station_confirm_vehicle_arrival','station_record_exit','ts_record_weighing','ts_complete_weighing',
    'maintenance_approve_readiness','maintenance_complete_case','maintenance_confirm_arrival','maintenance_inventory_create','maintenance_purchase_create',
    'media_design_create','media_design_complete','media_template_create','citizen_complaint_submit','citizen_chat_request',
    'attendance_edit_create','attendance_edit_decide','attendance_edit_hr_apply','attendance_edit_revert',   -- 00397
    'platform_reset_request','platform_reset_approve','platform_reset_decide','platform_reset_cancel'   -- 00398
  ]
$$;
do $$ declare f text; begin
  foreach f in array array['platform_reset_request','platform_reset_approve','platform_reset_decide','platform_reset_cancel'] loop perform app.wrap_write_guard(f); end loop;
end $$;

