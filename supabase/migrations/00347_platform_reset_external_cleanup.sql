-- 00398-د: نطاق ملفات التخزين يقتصر على طلب نُفذ فعلاً وعلى الملفات القديمة منه.
-- الملفات الجديدة أو المعدلة بعد التنفيذ تبقى، وإعادة المحاولة لا تنتهي بمهلة ست ساعات.
create or replace function app.platform_reset_storage_allowed(p_bucket text, p_created timestamptz, p_updated timestamptz)
returns boolean language sql stable security definer set search_path = public, app, storage as $$
 select exists (
   select 1 from public.platform_reset_requests q
   where (app.has_role(array['it_admin','super_admin']) or coalesce(q.executed_by=auth.uid(),false)) and q.status='done' and q.storage_done_at is null and q.executed_at is not null
     and p_bucket=any(q.storage_buckets)
     and p_created is not null and p_created <= q.executed_at
     and (p_updated is null or p_updated <= q.executed_at)
 )
$$;
revoke all on function app.platform_reset_storage_allowed(text,timestamptz,timestamptz) from public, anon;
grant execute on function app.platform_reset_storage_allowed(text,timestamptz,timestamptz) to authenticated;
drop policy if exists "platform-reset: IT reads bucket files while resetting" on storage.objects;
create policy "platform-reset: IT reads bucket files while resetting" on storage.objects for select to authenticated
 using (app.platform_reset_storage_allowed(bucket_id,created_at,updated_at));
drop policy if exists "platform-reset: IT removes bucket files while resetting" on storage.objects;
create policy "platform-reset: IT removes bucket files while resetting" on storage.objects for delete to authenticated
 using (app.platform_reset_storage_allowed(bucket_id,created_at,updated_at));

create or replace function public.platform_reset_storage_objects(p_id uuid,p_limit int default 500)
returns table(bucket_id text,name text) language plpgsql stable security definer set search_path=public,app,storage as $$
declare q public.platform_reset_requests;
begin
 select * into q from public.platform_reset_requests where id=p_id;
 if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
 if not (app.has_role(array['it_admin','super_admin']) or coalesce(q.executed_by=auth.uid(),false)) then raise exception 'IT_FORBIDDEN'; end if;
 if q.status <> 'done' or q.executed_at is null then raise exception 'RESET_NOT_EXECUTED'; end if;
 if q.storage_done_at is not null then return; end if;
 return query select o.bucket_id,o.name from storage.objects o
  where o.bucket_id=any(q.storage_buckets) and o.created_at <= q.executed_at
   and (o.updated_at is null or o.updated_at <= q.executed_at)
  order by o.bucket_id,o.name limit greatest(1,least(coalesce(p_limit,500),1000));
end $$;

create or replace function public.platform_reset_storage_finish(p_id uuid,p_deleted int default 0) returns jsonb
language plpgsql volatile security definer set search_path=public,app,storage as $$
declare q public.platform_reset_requests; left_n bigint;
begin
 select * into q from public.platform_reset_requests where id=p_id for update;
 if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
 if not (app.has_role(array['it_admin','super_admin']) or coalesce(q.executed_by=auth.uid(),false)) then raise exception 'IT_FORBIDDEN'; end if;
 if q.status <> 'done' or q.executed_at is null then raise exception 'RESET_NOT_EXECUTED'; end if;
 if q.storage_done_at is not null then return jsonb_build_object('id',p_id,'remaining',0,'done',true); end if;
 select count(*) into left_n from storage.objects o where o.bucket_id=any(q.storage_buckets)
  and o.created_at <= q.executed_at and (o.updated_at is null or o.updated_at <= q.executed_at);
 update public.platform_reset_requests set storage_deleted=storage_deleted+greatest(coalesce(p_deleted,0),0),
  storage_done_at=case when left_n=0 then now() else null end,updated_at=now() where id=p_id;
 return jsonb_build_object('id',p_id,'remaining',left_n,'done',left_n=0);
end $$;

-- مستودع GPS فئة مستقلة؛ لا تُمسّ باختيار بؤر المشروع الأول وحدها.
alter table public.platform_reset_requests add column if not exists warehouse_done_at timestamptz;
alter table public.platform_reset_requests add column if not exists warehouse_lease uuid;
alter table public.platform_reset_requests add column if not exists warehouse_lease_until timestamptz;
alter table public.platform_reset_requests add column if not exists warehouse_result jsonb;
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
  ('gps_warehouse',    'مستودع GPS التحليلي وأرشيفه (المشروع الثاني)', 'التتبع',          185, '{}'::text[], '{}'::text[]),
  ('org_departments',  'الأقسام والعناوين الوظيفية والفروع',           'الهيكل',          190, array['departments','branches'], array['departments','branches']),
  ('org_sectors',      'القواطع والمناطق والمناطق الجغرافية والمعالم',  'الهيكل',          200,
     array['parent_sectors','sectors','complaint_neighborhoods','gps_geofences','gps_map_landmarks'], array['sectors']),
  ('hr_settings',      'إعدادات الموارد البشرية والمالية (شفتات، أنواع، قواعد خصم)', 'الإعدادات', 210,
     array['hr_shifts','hr_leave_types','hr_policy','hr_settings','hr_deduction_rules','hr_deduction_rule_targets','hr_deduction_rule_audit','advance_types','disclosure_types',
           'treasury_expense_types','treasury_receivable_types','rented_vehicle_tax_settings'], '{}'),
  ('fleet_settings',   'إعدادات الأسطول والتتبع (فئات، مزودون LVN، ورش، سياسات)', 'الإعدادات', 220,
     array['vehicle_categories','gps_providers','maintenance_workshops','ts_unit_capacities','trip_route_settings','gps_route_deviation_settings','gps_alert_notification_policies',
           'gps_history_purge_settings','gps_warehouse_link','notification_workflow_policies'], '{}'),
  ('gps_warehouse_settings', 'إعدادات مستودع GPS التحليلي (المشروع الثاني)', 'الإعدادات', 225, '{}'::text[], '{}'::text[]),
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

create or replace function public.platform_reset_counts() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare out jsonb; prot int;
begin
  perform app.require_it();
  select count(*) into prot from (select auth.uid() u union select ur.user_id from public.user_roles ur where ur.role = 'super_admin') x;
  select jsonb_agg(jsonb_build_object('key', c.key, 'label', c.label, 'grp', c.grp, 'sort', c.sort, 'tables', to_jsonb(c.tables), 'buckets', to_jsonb(c.buckets),
           'rows', case when c.key='gps_warehouse' then
                    (select (ping->>'reset_rows')::bigint from public.gps_warehouse_link where id=1 and last_ping_ok and last_ping_at>now()-interval '10 minutes')
                   when c.key='gps_warehouse_settings' then (select (ping->>'reset_settings_rows')::bigint from public.gps_warehouse_link where id=1 and last_ping_ok and last_ping_at>now()-interval '10 minutes')
                   else (select coalesce(sum(app.platform_reset_table_count(t)),0) from unnest(c.tables) t
                      where exists (select 1 from pg_class k join pg_namespace n on n.oid=k.relnamespace where n.nspname='public' and k.relname=t))
                    + case when c.key='accounts' then (select count(*) from auth.users) else 0 end end,
           'files', case when c.key='gps_warehouse' then (select (ping->>'reset_files')::bigint from public.gps_warehouse_link where id=1 and last_ping_ok and last_ping_at>now()-interval '10 minutes')
                         else (select count(*) from storage.objects o where o.bucket_id=any(c.buckets)) end,
           'protected_users', case when c.key = 'accounts' then prot else null end) order by c.sort)
    into out from app.platform_reset_catalog() c;
  return jsonb_build_object('categories', coalesce(out, '[]'::jsonb), 'pending', (select to_jsonb(r) from (select q.id, q.status, q.created_at from public.platform_reset_requests q where q.status in ('pending_approval','approved','executing') order by q.created_at desc limit 1) r),
                            'generated_at', now());
end$$;
grant execute on function public.platform_reset_counts() to authenticated;

create or replace function app.platform_reset_execute(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare q public.platform_reset_requests; tabs text[]; remaining text[]; nxt text[]; t text; r record; n bigint; deleted jsonb := '{}'::jsonb; total bigint := 0;
        protected uuid[]; pass int := 0; before_counts jsonb := '{}'::jsonb; changed bigint; k bigint; t0 timestamptz := clock_timestamp(); acct boolean; cols text; users_deleted int := 0; me uuid := auth.uid(); u uuid;
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
  if tabs is null and not (q.categories && array['gps_warehouse','gps_warehouse_settings']) then raise exception 'RESET_NOTHING_SELECTED'; end if;
  tabs := coalesce(tabs, '{}'::text[]);
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
  -- إحصاء قبل الحذف لضمان احتساب الصفوف التي تحذفها المفاتيح الأجنبية تتابعياً أيضاً.
  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into n;
    before_counts := before_counts || jsonb_build_object(t,n);
  end loop;
  -- ③ الحذف الفعلي، بلا TRUNCATE CASCADE: لا يجوز حذف جدول خارج الاختيار.
  remaining := tabs;
  while cardinality(remaining) > 0 loop
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
      exception when foreign_key_violation or restrict_violation then nxt := nxt || t;
      end;
    end loop;
    if nxt = remaining then
      -- لا تقدم: فك المراجع الاختيارية بين الجداول المتعذرة فقط.
      -- عمود واحد قابل للإفراغ يكفي للمفتاح المركب. لا تغيّر صفوف الحسابات المحمية.
      changed := 0;
      for r in
        select distinct c.relname child, a.attname col
        from pg_constraint fk
        join pg_class c on c.oid=fk.conrelid join pg_namespace cn on cn.oid=c.relnamespace
        join pg_class p on p.oid=fk.confrelid join pg_namespace pn on pn.oid=p.relnamespace
        cross join lateral unnest(fk.conkey) ck
        join pg_attribute a on a.attrelid=c.oid and a.attnum=ck
        where fk.contype='f' and cn.nspname='public' and pn.nspname='public'
          and c.relname=any(nxt) and p.relname=any(nxt) and not a.attnotnull
      loop
        begin
          if acct and r.child=any(app.platform_reset_tables(array['accounts'])) and exists
            (select 1 from pg_attribute a where a.attrelid=('public.' || quote_ident(r.child))::regclass and a.attname='user_id' and a.attnum>0 and not a.attisdropped) then
            execute format('update public.%I set %I=null where %I is not null and (user_id is null or not (user_id=any($1)))', r.child,r.col,r.col) using protected;
          else
            execute format('update public.%I set %I=null where %I is not null', r.child,r.col,r.col);
          end if;
          get diagnostics k = row_count;
          changed := changed + k;
        exception when check_violation or not_null_violation or foreign_key_violation or restrict_violation then
          -- بعض الأعمدة الاختيارية تحكمها قيود أخرى؛ لا نخالفها ولا نحذف خارج الاختيار.
          null;
        end;
      end loop;
      if changed = 0 then
        raise exception 'RESET_CYCLE: %', array_to_string(nxt, '، ');
      end if;
    end if;
    remaining := nxt;
  end loop;
  -- الفرق قبل/بعد يشمل الحذف التتابعي ويستثني السجلات المحمية.
  deleted := '{}'::jsonb; total := 0;
  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into n;
    k := (before_counts->>t)::bigint - n;
    if k < 0 then raise exception 'RESET_COUNT_INVALID: %', t; end if;
    deleted := deleted || jsonb_build_object(t,k); total := total + k;
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
                                     'buckets', to_jsonb(q.storage_buckets), 'warehouse_wipe', q.categories && array['gps_warehouse','gps_warehouse_settings'])
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
create or replace function app.platform_reset_request__raw(p_categories text[], p_password text) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v_id uuid; cl jsonb; cats text[]; snap jsonb; v_chain uuid; cnt jsonb; bks text[]; res jsonb;
begin
  perform app.require_it();
  -- طلبات متزامنة من مستخدمين مختلفين لا تتجاوز اختبار وجود طلب معلّق.
  perform pg_advisory_xact_lock(hashtextextended('platform_reset_request_global',0));
  if coalesce(trim(p_password), '') <> 'تصفير' then raise exception 'RESET_PASSWORD_WRONG'; end if;
  if coalesce(cardinality(p_categories), 0) = 0 then raise exception 'RESET_NOTHING_SELECTED'; end if;
  if p_categories && array['gps_warehouse','gps_warehouse_settings'] then
    if exists(select 1 from public.platform_reset_requests where status='done' and categories && array['gps_warehouse','gps_warehouse_settings'] and warehouse_done_at is null) then raise exception 'RESET_WAREHOUSE_PENDING'; end if;
    if not exists(select 1 from public.gps_warehouse_link where id=1 and last_ping_ok and last_ping_at>now()-interval '10 minutes' and ping ?& array['reset_rows','reset_files','reset_settings_rows']) then raise exception 'RESET_WAREHOUSE_COUNTS_UNAVAILABLE'; end if;
  end if;
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
create or replace function public.platform_reset_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare q public.platform_reset_requests; cats jsonb; tl jsonb;
begin
  select * into q from public.platform_reset_requests where id = p_id;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  if not (coalesce(q.requested_by = auth.uid(),false) or coalesce(q.executed_by = auth.uid(),false) or app.has_role(array['it_admin','super_admin'])
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
    'result', q.result, 'rejected_note', q.rejected_note, 'storage_buckets', to_jsonb(q.storage_buckets), 'storage_done_at', q.storage_done_at, 'storage_deleted', q.storage_deleted, 'warehouse_done_at', q.warehouse_done_at, 'can_cleanup', q.status='done' and (coalesce(q.executed_by=auth.uid(),false) or app.has_role(array['it_admin','super_admin'])),
    'via_chain', q.chain_id is not null, 'timeline', tl,
    'can_approve', q.status = 'pending_approval' and auth.uid() = any(coalesce(app.approval_current_approvers('platform_reset', p_id), '{}')),
    'includes_accounts', 'accounts' = any(q.categories));
end$$;
create or replace function public.platform_reset_list(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'status_label', app.platform_reset_status_label(q.status), 'categories', to_jsonb(q.categories),
                     'categories_count', cardinality(q.categories), 'requested_by_name', q.requested_by_name, 'created_at', q.created_at, 'executed_at', q.executed_at,
                     'rows_deleted', (q.result ->> 'rows_deleted')::bigint, 'users_deleted', (q.result ->> 'users_deleted')::int, 'rejected_note', q.rejected_note,
                     'via_chain', q.chain_id is not null, 'storage_pending', q.status = 'done' and ((cardinality(q.storage_buckets)>0 and q.storage_done_at is null) or (q.categories && array['gps_warehouse','gps_warehouse_settings'] and q.warehouse_done_at is null)),
                     'current_step', (select t.step_label from public.approval_tasks t where t.request_kind = 'platform_reset' and t.request_id = q.id and t.status = 'pending' order by t.step_no limit 1)) order by q.created_at desc)
                   from (select * from public.platform_reset_requests order by created_at desc limit greatest(1, least(coalesce(p_limit, 50), 500))) q), '[]'::jsonb);
end$$;

-- دالتا الخدمة لا تُتاحان للعميل، وتربطان العملية بطلب منفّذ يحتوي فئة المستودع.
create or replace function public.platform_reset_warehouse_claim(p_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public,app as $$
declare q public.platform_reset_requests; tok uuid:=gen_random_uuid();
begin
 select * into q from public.platform_reset_requests where id=p_id for update;
 if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
 if q.status<>'done' or not (q.categories && array['gps_warehouse','gps_warehouse_settings']) then raise exception 'RESET_WAREHOUSE_NOT_APPROVED'; end if;
 if p_actor is null or not (coalesce(q.executed_by=p_actor,false) or exists(select 1 from public.user_roles u where u.user_id=p_actor and u.role in ('it_admin','super_admin'))) then raise exception 'RESET_WAREHOUSE_FORBIDDEN'; end if;
 if q.warehouse_done_at is not null then return jsonb_build_object('done',true,'result',q.warehouse_result); end if;
 if q.warehouse_lease_until>now() then raise exception 'RESET_WAREHOUSE_BUSY'; end if;
 update public.platform_reset_requests set warehouse_lease=tok,warehouse_lease_until=now()+interval '5 minutes' where id=p_id;
 return jsonb_build_object('done',false,'token',tok,'wipe_data','gps_warehouse'=any(q.categories),'reset_settings','gps_warehouse_settings'=any(q.categories));
end $$;
create or replace function public.platform_reset_warehouse_finish(p_id uuid,p_token uuid,p_success boolean,p_result jsonb default null) returns void
language plpgsql security definer set search_path=public,app as $$
begin
 update public.platform_reset_requests set warehouse_lease=null,warehouse_lease_until=null,
  warehouse_done_at=case when p_success then now() else null end,
  warehouse_result=case when p_success then p_result else warehouse_result end
 where id=p_id and warehouse_lease=p_token and warehouse_done_at is null and status='done' and categories && array['gps_warehouse','gps_warehouse_settings'];
 if not found then raise exception 'RESET_WAREHOUSE_LEASE_INVALID'; end if;
end $$;
revoke all on function public.platform_reset_warehouse_claim(uuid,uuid),public.platform_reset_warehouse_finish(uuid,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.platform_reset_warehouse_claim(uuid,uuid),public.platform_reset_warehouse_finish(uuid,uuid,boolean,jsonb) to service_role;

-- إعادة صف الربط بعد تصفير الإعدادات؛ لا يُعاد أي سر أو إعداد محذوف.
create or replace function public.gps_warehouse_link_record(p_kind text, p_ok boolean, p_payload jsonb default '{}'::jsonb, p_host text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_FORBIDDEN'; end if;
  if p_kind not in ('ping', 'registry', 'hotspots') then raise exception 'GPS_WAREHOUSE_KIND_INVALID'; end if;
  insert into public.gps_warehouse_link(id) values(1) on conflict(id) do nothing;
  update public.gps_warehouse_link set
    warehouse_host = coalesce(p_host, warehouse_host),
    last_ping_at = case when p_kind = 'ping' then now() else last_ping_at end,
    last_ping_ok = case when p_kind = 'ping' then p_ok else last_ping_ok end,
    schema_version = case when p_kind = 'ping' and p_ok then nullif(p_payload ->> 'schema_version', '')::int else schema_version end,
    ping = case when p_kind = 'ping' and p_ok then p_payload else ping end,
    last_registry_sync_at = case when p_kind = 'registry' and p_ok then now() else last_registry_sync_at end,
    registry_active = case when p_kind = 'registry' and p_ok then nullif(p_payload ->> 'active', '')::int else registry_active end,
    last_hotspots_sync_at = case when p_kind = 'hotspots' and p_ok then now() else last_hotspots_sync_at end,
    hotspots_rows = case when p_kind = 'hotspots' and p_ok then nullif(p_payload ->> 'rows', '')::int else hotspots_rows end,
    hotspots_by_month = case when p_kind = 'hotspots' and p_ok then p_payload -> 'by_month' else hotspots_by_month end,
    last_error_code = case when p_ok then null else coalesce(p_error, 'GPS_WAREHOUSE_FAILED') end,
    last_error_at = case when p_ok then last_error_at else now() end,
    updated_at = now()
  where id = 1;
end $$;
revoke all on function public.gps_warehouse_link_record(text, boolean, jsonb, text, text) from public, anon, authenticated;

