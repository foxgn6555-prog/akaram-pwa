-- 00389-أ — وثائق الموظفين: تاريخ إصدار/انتهاء + أنواع جديدة + لوحة «تنتهي قريبًا» + تنبيه HR يومي
-- لا حذف لأي وثيقة هنا (قاعدة الأرشيف: وثائق الموظفين لا تُحذف تلقائيًا).

-- ① أعمدة التواريخ
alter table public.employee_documents
  add column if not exists issued_on  date,
  add column if not exists expires_on date;
alter table public.employee_documents drop constraint if exists employee_documents_dates_chk;
alter table public.employee_documents add constraint employee_documents_dates_chk
  check (issued_on is null or expires_on is null or expires_on >= issued_on);
create index if not exists idx_emp_docs_expires on public.employee_documents (expires_on) where expires_on is not null;

-- ② أنواع جديدة (إجازة سوق، عقد، شهادة صحية، جواز)
alter table public.employee_documents drop constraint if exists employee_documents_doc_type_check;
alter table public.employee_documents add constraint employee_documents_doc_type_check
  check (doc_type in ('photo', 'national_id_front', 'national_id_back', 'residence_front', 'residence_back',
                      'driving_license', 'contract', 'health_cert', 'passport', 'other'));

-- ③ إعداد مدة التنبيه (أيام) في سياسة HR — يُدار من بوابة IT؛ التحقق عبر trigger حتى لا نعيد تعريف hr_policy_set
create or replace function app.hr_policy_validate_docs() returns trigger
language plpgsql as $$
begin
  if coalesce((new.settings ->> 'doc_expiry_alert_days')::int, 30) not between 1 and 365 then
    raise exception 'HR_POLICY_INVALID';
  end if;
  return new;
end $$;
drop trigger if exists trg_hr_policy_validate_docs on public.hr_policy;
create trigger trg_hr_policy_validate_docs before insert or update on public.hr_policy
  for each row execute function app.hr_policy_validate_docs();
update public.hr_policy set settings = settings || jsonb_build_object('doc_expiry_alert_days', 30)
  where id = 1 and not (settings ? 'doc_expiry_alert_days');

-- ④ تحديث تواريخ وثيقة (HR فقط)
create or replace function public.hr_document_set_dates(p_id uuid, p_issued_on date, p_expires_on date)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_issued_on is not null and p_expires_on is not null and p_expires_on < p_issued_on then raise exception 'HR_DOC_DATES_INVALID'; end if;
  update public.employee_documents set issued_on = p_issued_on, expires_on = p_expires_on where id = p_id;
  if not found then raise exception 'HR_DOC_NOT_FOUND'; end if;
end $$;

-- ⑤ قائمة الوثائق المنتهية/القريبة من الانتهاء
drop function if exists public.hr_documents_expiring(int, uuid, text);
create or replace function public.hr_documents_expiring(p_within_days int default null, p_department uuid default null, p_search text default null)
returns table (
  id uuid, employee_id uuid, employee_number text, full_name text, department_id uuid, department_name text,
  doc_type text, title text, issued_on date, expires_on date, days_left int, status text
)
language sql stable security definer set search_path = public, app as $$
  select d.id, e.id, e.employee_number, e.full_name, e.department_id, dp.name,
         d.doc_type, d.title, d.issued_on, d.expires_on,
         (d.expires_on - app.hr_local_date(now()))::int,
         case when d.expires_on < app.hr_local_date(now()) then 'expired'
              when d.expires_on <= app.hr_local_date(now()) + app.hr_policy_int('doc_expiry_alert_days', 30) then 'soon'
              else 'ok' end
  from public.employee_documents d
  join public.employees e on e.id = d.employee_id
  left join public.departments dp on dp.id = e.department_id
  where app.has_role(array['hr_officer', 'super_admin'])
    and e.employment_status <> 'terminated'
    and d.expires_on is not null
    and d.expires_on <= app.hr_local_date(now()) + coalesce(p_within_days, app.hr_policy_int('doc_expiry_alert_days', 30))
    and (p_department is null or e.department_id in (select app.hr_department_tree(p_department)))
    and (p_search is null or p_search = '' or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by d.expires_on, e.full_name
$$;

-- ⑥ ملخص للوحة HR
create or replace function public.hr_documents_expiry_summary() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'expired', count(*) filter (where d.expires_on < app.hr_local_date(now())),
    'soon',    count(*) filter (where d.expires_on >= app.hr_local_date(now()) and d.expires_on <= app.hr_local_date(now()) + app.hr_policy_int('doc_expiry_alert_days', 30)),
    'd60',     count(*) filter (where d.expires_on >= app.hr_local_date(now()) and d.expires_on <= app.hr_local_date(now()) + 60),
    'd90',     count(*) filter (where d.expires_on >= app.hr_local_date(now()) and d.expires_on <= app.hr_local_date(now()) + 90),
    'alert_days', app.hr_policy_int('doc_expiry_alert_days', 30))
  from public.employee_documents d join public.employees e on e.id = d.employee_id
  where app.has_role(array['hr_officer', 'super_admin']) and e.employment_status <> 'terminated' and d.expires_on is not null
$$;

create or replace function app.hr_doc_type_label(p text) returns text language sql immutable as $$
  select case p
    when 'photo' then 'الصورة الشخصية' when 'national_id_front' then 'البطاقة الموحدة — وجه' when 'national_id_back' then 'البطاقة الموحدة — ظهر'
    when 'residence_front' then 'بطاقة السكن — وجه' when 'residence_back' then 'بطاقة السكن — ظهر'
    when 'driving_license' then 'إجازة السوق' when 'contract' then 'العقد' when 'health_cert' then 'الشهادة الصحية' when 'passport' then 'جواز السفر'
    else 'مستمسك آخر' end
$$;

-- ⑦ التنبيه اليومي لـ HR: مرة واحدة لكل وثيقة لكل مرحلة (قريبة/منتهية) عبر dedupe_key
create or replace function app.hr_documents_expiry_notify() returns int
language plpgsql security definer set search_path = public, app as $$
declare r record; n int := 0; v_today date := app.hr_local_date(now()); v_days int := app.hr_policy_int('doc_expiry_alert_days', 30); v_stage text;
begin
  for r in
    select d.id, d.doc_type, d.title, d.expires_on, e.full_name, e.employee_number, e.id as employee_id
    from public.employee_documents d join public.employees e on e.id = d.employee_id
    where e.employment_status <> 'terminated' and d.expires_on is not null and d.expires_on <= v_today + v_days
  loop
    v_stage := case when r.expires_on < v_today then 'expired' else 'soon' end;
    insert into public.notifications (user_id, title, body, type, category, priority, link, entity_type, entity_id, dedupe_key)
    select distinct ur.user_id,
      case v_stage when 'expired' then 'وثيقة موظف منتهية الصلاحية' else 'وثيقة موظف تنتهي قريبًا' end,
      format('%s (%s) — %s · تاريخ الانتهاء %s', r.full_name, coalesce(r.employee_number, '—'),
             coalesce(nullif(r.title, ''), app.hr_doc_type_label(r.doc_type)), to_char(r.expires_on, 'YYYY-MM-DD')),
      case v_stage when 'expired' then 'error' else 'warning' end, 'hr',
      case v_stage when 'expired' then 'high' else 'normal' end,
      '/hr/documents', 'employee_document', r.id, 'emp_doc_expiry:' || r.id::text || ':' || v_stage
    from public.user_roles ur where ur.role in ('hr_officer')
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.hr_documents_expiry_run_now() returns int
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  return app.hr_documents_expiry_notify();
end $$;

revoke all on function public.hr_document_set_dates(uuid, date, date), public.hr_documents_expiring(int, uuid, text),
  public.hr_documents_expiry_summary(), public.hr_documents_expiry_run_now(), app.hr_documents_expiry_notify() from public, anon;
grant execute on function public.hr_document_set_dates(uuid, date, date), public.hr_documents_expiring(int, uuid, text),
  public.hr_documents_expiry_summary(), public.hr_documents_expiry_run_now() to authenticated;

-- المجدول: 05:00 UTC = 08:00 بغداد
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'hr-documents-expiry-daily';
    perform cron.schedule('hr-documents-expiry-daily', '0 5 * * *', $job$ select app.hr_documents_expiry_notify() $job$);
  else
    raise notice 'pg_cron غير متاح — تنبيه انتهاء الوثائق يتطلب تفعيله';
  end if;
end $$;

-- ⑧ كتالوج الصلاحيات: وحدة «وثائق الموظفين» hr.documents (edit + export)
-- <<catalog>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
-- upsert (لا حذف+إدراج) كي لا تُفقد قواعد القوالب والاستثناءات المرتبطة بالوحدات الباقية
insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values
  ('employee', 'employee', '/employee', 'الرئيسية', null, '{view}', 0),
  ('employee.attendance', 'employee', '/employee/attendance', 'إثبات التواجد والعدد', null, '{view,create}', 1),
  ('employee.photos', 'employee', '/employee/photos', 'إرسال الصور', null, '{view,create}', 2),
  ('hr', 'hr', '/hr', 'الرئيسية', null, '{view}', 3),
  ('hr.recruitment', 'hr', '/hr/recruitment', 'التوظيف وإنهاء الخدمات', null, '{view,create,execute}', 4),
  ('hr.hire-requests', 'hr', '/hr/hire-requests', 'تعيينات بانتظار الإكمال', null, '{view,execute}', 5),
  ('hr.employees', 'hr', '/hr/employees', 'الموظفون', null, '{view,create,edit,export,execute}', 6),
  ('hr.attendance', 'hr', '/hr/attendance', 'الحضور والانصراف', null, '{view,edit,export}', 7),
  ('hr.leaves', 'hr', '/hr/leaves', 'الإجازات والزمنيات', null, '{view,create,decide,export}', 8),
  ('hr.documents', 'hr', '/hr/documents', 'وثائق الموظفين', null, '{view,edit,export}', 9),
  ('hr.biometric', 'hr', '/hr/biometric', 'دفتر البصمة', null, '{view,export}', 10),
  ('hr.org', 'hr', '/hr/org', 'الهيكل التنظيمي', null, '{view,create,edit,delete}', 11),
  ('hr.behavior', 'hr', '/hr/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 12),
  ('manager', 'manager', '/manager', 'الرئيسية', null, '{view}', 13),
  ('manager.team', 'manager', '/manager/team', 'فريقي', null, '{view}', 14),
  ('manager.request', 'manager', '/manager/request', 'إنشاء طلب', null, '{view,create}', 15),
  ('manager.leaves', 'manager', '/manager/leaves', 'إجازات فريقي', null, '{view,create,decide}', 16),
  ('manager.breakdown', 'manager', '/manager/breakdown', 'عطل آلية', null, '{view,create}', 17),
  ('manager.vehicle-trips', 'manager', '/manager/vehicle-trips', 'حركة آليات الوردية', null, '{view,execute}', 18),
  ('manager.support', 'manager', '/manager/support', 'طلبات الدعم', null, '{view,create}', 19),
  ('manager.gbs-containers', 'manager', '/manager/gbs-containers', 'حاويات GBS', null, '{view}', 20),
  ('manager.complaints', 'manager', '/manager/complaints', 'الشكاوى المسندة', null, '{view,create,execute}', 21),
  ('manager.citizen-complaints', 'manager', '/manager/citizen-complaints', 'شكاوى المواطنين', null, '{view,execute}', 22),
  ('manager.photos', 'manager', '/manager/photos', 'إرسال صور', null, '{view,create}', 23),
  ('manager.archive', 'manager', '/manager/archive', 'الأرشيف', null, '{view}', 24),
  ('finance', 'finance', '/finance', 'الرئيسية', null, '{view}', 25),
  ('finance.reports', 'finance', '/finance/reports', 'التقارير', null, '{view,export}', 26),
  ('finance.payroll', 'finance', '/finance/payroll', 'الرواتب', null, '{view,edit,decide,execute,export}', 27),
  ('finance.contractor-wages', 'finance', '/finance/contractor-wages', 'أجور المتعهدين', null, '{view,edit,decide,export}', 28),
  ('finance.advances', 'finance', '/finance/advances', 'السلف', null, '{view,execute,export}', 29),
  ('finance.settlements', 'finance', '/finance/settlements', 'المنتهية خدماتهم والتصفية', null, '{view,decide,execute,export}', 30),
  ('finance.letters', 'finance', '/finance/letters', 'سجل الكتب الرسمية', null, '{view,export}', 31),
  ('finance.purchases', 'finance', '/finance/purchases', 'مشتريات قطع الصيانة', null, '{view,decide}', 32),
  ('finance.budget', 'finance', '/finance/budget', 'القاصة', null, '{view,create,edit,decide}', 33),
  ('finance.expenses', 'finance', '/finance/expenses', 'المصاريف', null, '{view,create,edit,export}', 34),
  ('finance.announcements', 'finance', '/finance/announcements', 'التبليغات', null, '{view,create}', 35),
  ('it', 'it', '/it', 'الرئيسية', null, '{view}', 36),
  ('it.user-management', 'it', '/it/user-management', 'إدارة المستخدمين', null, '{view}', 37),
  ('it.user-management.list', 'it', '/it/user-management/list', 'المستخدمون', 'it.user-management', '{view,edit}', 38),
  ('it.user-management.create', 'it', '/it/user-management/create', 'إنشاء مستخدم', 'it.user-management', '{view,create}', 39),
  ('it.user-management.approval-chains', 'it', '/it/user-management/approval-chains', 'سلاسل الموافقات', 'it.user-management', '{view,edit,delete}', 40),
  ('it.user-management.approval-performance', 'it', '/it/user-management/approval-performance', 'أداء الموافقات', 'it.user-management', '{view}', 41),
  ('it.approvals', 'it', '/it/approvals', 'طلبات الموافقة', 'it.user-management', '{view,decide}', 42),
  ('it.user-management.disclosure-types', 'it', '/it/user-management/disclosure-types', 'أنواع الكشوفات', 'it.user-management', '{view,edit}', 43),
  ('it.user-management.maintenance-workshops', 'it', '/it/user-management/maintenance-workshops', 'ورش الصيانة', 'it.user-management', '{view,edit}', 44),
  ('it.database', 'it', '/it/database', 'قاعدة البيانات', null, '{view}', 45),
  ('it.database.tables', 'it', '/it/database/tables', 'الجداول والأعمدة', 'it.database', '{view}', 46),
  ('it.branches', 'it', '/it/branches', 'فروع الشركة', null, '{view,create,edit}', 47),
  ('it.permissions', 'it', '/it/permissions', 'قوالب الصلاحيات', null, '{view,edit}', 48),
  ('it.integrations', 'it', '/it/integrations', 'التكاملات', null, '{view}', 49),
  ('it.integrations.biometric', 'it', '/it/integrations/biometric', 'أجهزة البصمة', 'it.integrations', '{view,edit,execute}', 50),
  ('it.integrations.biometric.unmatched', 'it', '/it/integrations/biometric/unmatched', 'الأشخاص غير المطابقين', 'it.integrations', '{view}', 51),
  ('it.integrations.biometric.attendance-audit', 'it', '/it/integrations/biometric/attendance-audit', 'سجل تعديلات الحضور', 'it.integrations', '{view}', 52),
  ('it.integrations.gps', 'it', '/it/integrations/gps', 'تتبع الشاحنات', 'it.integrations', '{view,edit,execute}', 53),
  ('it.integrations.gps-health', 'it', '/it/integrations/gps-health', 'سلامة تكامل GPS', 'it.integrations', '{view}', 54),
  ('it.integrations.hr-policy', 'it', '/it/integrations/hr-policy', 'سياسة الحضور والإجازات', 'it.integrations', '{view,edit}', 55),
  ('it.integrations.auto-deductions', 'it', '/it/integrations/auto-deductions', 'الاستقطاعات التلقائية', 'it.integrations', '{view,edit}', 56),
  ('it.integrations.advances', 'it', '/it/integrations/advances', 'السلف — الأنواع والسياسة', 'it.integrations', '{view,edit}', 57),
  ('it.integrations.live-tracking', 'it', '/it/integrations/live-tracking', 'البث المباشر — الإعدادات', 'it.integrations', '{view,edit}', 58),
  ('it.notification-policies', 'it', '/it/notification-policies', 'سياسات الإشعارات والانطلاقات', null, '{view,edit,delete}', 59),
  ('it.updates', 'it', '/it/updates', 'التحديثات والمراقبة', null, '{view,execute}', 60),
  ('it.archive', 'it', '/it/archive', 'الأرشيف', null, '{view,delete}', 61),
  ('it.central-garage-approvals', 'it', '/it/central-garage-approvals', 'موافقات تصفير خزانات الكراج', 'it.archive', '{view,decide}', 62),
  ('it.cold-archive', 'it', '/it/cold-archive', 'الأرشيف البارد', 'it.archive', '{view,create,decide,delete}', 63),
  ('it.data-retention', 'it', '/it/data-retention', 'الاحتفاظ بالبيانات', 'it.archive', '{view,edit,delete}', 64),
  ('it.console', 'it', '/it/console', 'Console — رصد الأخطاء', null, '{view}', 65),
  ('it.devops', 'it', '/it/devops', 'دليل التشغيل التقني', null, '{view}', 66),
  ('it.devops.git', 'it', '/it/devops/git', 'Git ورفع التحديثات', 'it.devops', '{view}', 67),
  ('it.devops.database', 'it', '/it/devops/database', 'قاعدة البيانات والترحيلات', 'it.devops', '{view}', 68),
  ('it.devops.tests', 'it', '/it/devops/tests', 'الاختبارات', 'it.devops', '{view}', 69),
  ('it.devops.hosting', 'it', '/it/devops/hosting', 'الاستضافة والبصمة في الإنتاج', 'it.devops', '{view}', 70),
  ('it.devops.status', 'it', '/it/devops/status', 'لوحة الحالة الحية', 'it.devops', '{view}', 71),
  ('admin', 'admin', '/admin', 'الرئيسية', null, '{view}', 72),
  ('admin.reports', 'admin', '/admin/reports', 'التقارير', null, '{view}', 73),
  ('admin.announcements', 'admin', '/admin/announcements', 'التبليغات', null, '{view,create}', 74),
  ('admin.approvals', 'admin', '/admin/approvals', 'طلبات الموافقة', null, '{view,decide}', 75),
  ('admin.approval-performance', 'admin', '/admin/approval-performance', 'أداء الموافقات', null, '{view}', 76),
  ('admin.procedures', 'admin', '/admin/procedures', 'الإجراءات', null, '{view,execute}', 77),
  ('admin.disclosures', 'admin', '/admin/disclosures', 'الكشوفات', null, '{view,decide}', 78),
  ('field-ops', 'field-ops', '/field-ops', 'الرئيسية', null, '{view}', 79),
  ('field-ops.requests', 'field-ops', '/field-ops/requests', 'طلبات فريقي', null, '{view,decide}', 80),
  ('field-ops.sectors', 'field-ops', '/field-ops/sectors', 'القواطع والمسؤولون', null, '{view}', 81),
  ('field-ops.reports', 'field-ops', '/field-ops/reports', 'التقارير', null, '{view}', 82),
  ('field-ops.notify', 'field-ops', '/field-ops/notify', 'التبليغ', null, '{view,create}', 83),
  ('field-ops.procedures', 'field-ops', '/field-ops/procedures', 'الإجراءات', null, '{view,execute}', 84),
  ('field-ops.my-requests', 'field-ops', '/field-ops/my-requests', 'طلباتي', null, '{view,create}', 85),
  ('admin-ops', 'admin-ops', '/admin-ops', 'الرئيسية', null, '{view}', 86),
  ('admin-ops.requests', 'admin-ops', '/admin-ops/requests', 'طلبات فريقي', null, '{view,create,decide}', 87),
  ('admin-ops.reports', 'admin-ops', '/admin-ops/reports', 'التقارير', null, '{view}', 88),
  ('admin-ops.notify', 'admin-ops', '/admin-ops/notify', 'التبليغ', null, '{view,create}', 89),
  ('admin-ops.procedures', 'admin-ops', '/admin-ops/procedures', 'الإجراءات', null, '{view,create,execute}', 90),
  ('admin-ops.disclosures', 'admin-ops', '/admin-ops/disclosures', 'الكشوفات', null, '{view,create,decide}', 91),
  ('admin-ops.contractors', 'admin-ops', '/admin-ops/contractors', 'متابعة المتعهدين والعمال', null, '{view,decide}', 92),
  ('admin-ops.my-requests', 'admin-ops', '/admin-ops/my-requests', 'طلباتي', null, '{view,create}', 93),
  ('maintenance', 'maintenance', '/maintenance', 'الرئيسية', null, '{view}', 94),
  ('maintenance.purchases', 'maintenance', '/maintenance/purchases', 'مشتريات قطع الصيانة', null, '{view,create}', 95),
  ('maintenance.inventory', 'maintenance', '/maintenance/inventory', 'مخزون قطع الصيانة', null, '{view,create,edit}', 96),
  ('maintenance.vehicle-cases', 'maintenance', '/maintenance/vehicle-cases', 'صيانة الآليات', null, '{view,create,decide,execute}', 97),
  ('maintenance.employees', 'maintenance', '/maintenance/employees', 'الموظفون', null, '{view,edit}', 98),
  ('maintenance.requests', 'maintenance', '/maintenance/requests', 'الطلبات', null, '{view,create}', 99),
  ('maintenance.procedures', 'maintenance', '/maintenance/procedures', 'الإجراءات', null, '{view,create,execute}', 100),
  ('maintenance.archive', 'maintenance', '/maintenance/archive', 'أرشيف الصيانة', null, '{view,delete}', 101),
  ('transfer-station', 'transfer-station', '/transfer-station', 'الرئيسية', null, '{view}', 102),
  ('transfer-station.weights', 'transfer-station', '/transfer-station/weights', 'الأوزان', null, '{view,create,execute}', 103),
  ('transfer-station.weights.log', 'transfer-station', '/transfer-station/weights/log', 'تسجيل الأوزان', 'transfer-station.weights', '{view,export}', 104),
  ('transfer-station.saksat', 'transfer-station', '/transfer-station/saksat', 'السكسات والنسافات الخارجة', null, '{view,create,export}', 105),
  ('transfer-station.carrier', 'transfer-station', '/transfer-station/carrier', 'ناقلات الحاويات المكبسية', null, '{view,create,export}', 106),
  ('transfer-station.vehicle-movements', 'transfer-station', '/transfer-station/vehicle-movements', 'حركة آليات المواقع', null, '{view,execute}', 107),
  ('transfer-station.employees', 'transfer-station', '/transfer-station/employees', 'الموظفون', null, '{view,edit}', 108),
  ('transfer-station.requests', 'transfer-station', '/transfer-station/requests', 'الطلبات', null, '{view,create}', 109),
  ('transfer-station.procedures', 'transfer-station', '/transfer-station/procedures', 'الإجراءات', null, '{view,create,execute}', 110),
  ('transfer-station.disclosures', 'transfer-station', '/transfer-station/disclosures', 'الكشوفات', null, '{view,create}', 111),
  ('transfer-station.fines', 'transfer-station', '/transfer-station/fines', 'الغرامات', null, '{view,create}', 112),
  ('transfer-station.archive', 'transfer-station', '/transfer-station/archive', 'أرشيف المحطة', null, '{view,delete}', 113),
  ('executive', 'executive', '/executive', 'الرئيسية', null, '{view}', 114),
  ('executive.reports', 'executive', '/executive/reports', 'التقارير', null, '{view,export}', 115),
  ('executive.announcements', 'executive', '/executive/announcements', 'التبليغات', null, '{view,create}', 116),
  ('executive.approvals', 'executive', '/executive/approvals', 'طلبات الموافقة', null, '{view,decide}', 117),
  ('executive.procedures', 'executive', '/executive/procedures', 'الإجراءات', null, '{view,execute}', 118),
  ('executive.receivables', 'executive', '/executive/receivables', 'مستحقات الشركة', null, '{view,create,edit,execute}', 119),
  ('executive.gps-payments', 'executive', '/executive/gps-payments', 'تسديد مستحقات GPS', null, '{view,create,edit}', 120),
  ('executive.rewards', 'executive', '/executive/rewards', 'المكافآت', null, '{view,create}', 121),
  ('executive.letters', 'executive', '/executive/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 122),
  ('executive.events', 'executive', '/executive/events', 'فعاليات الشركة', null, '{view,create}', 123),
  ('executive.behavior', 'executive', '/executive/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 124),
  ('executive.stop-hotspots', 'executive', '/executive/stop-hotspots', 'خريطة النفايات (بقع التوقف)', null, '{view}', 125),
  ('deputy', 'deputy', '/deputy', 'الرئيسية', null, '{view}', 126),
  ('deputy.reports', 'deputy', '/deputy/reports', 'التقارير', null, '{view,export}', 127),
  ('deputy.announcements', 'deputy', '/deputy/announcements', 'التبليغات', null, '{view,create}', 128),
  ('deputy.statements', 'deputy', '/deputy/statements', 'الكشوفات', null, '{view,decide}', 129),
  ('deputy.deductions', 'deputy', '/deputy/deductions', 'مراجعة الاستقطاعات', null, '{view,decide,edit}', 130),
  ('deputy.rented-tax', 'deputy', '/deputy/rented-tax', 'ضريبة الآليات المؤجرة', null, '{view,edit}', 131),
  ('deputy.overtime', 'deputy', '/deputy/overtime', 'الساعات الإضافية المدفوعة', null, '{view,decide,edit}', 132),
  ('deputy.sector-supplies', 'deputy', '/deputy/sector-supplies', 'كتب مستلزمات القواطع', null, '{view,decide}', 133),
  ('deputy.station-folders', 'deputy', '/deputy/station-folders', 'فولدرات المحطة', null, '{view}', 134),
  ('deputy.data-analysis', 'deputy', '/deputy/data-analysis', 'تحليل البيانات', null, '{view}', 135),
  ('deputy.rewards', 'deputy', '/deputy/rewards', 'المكافآت', null, '{view,create}', 136),
  ('deputy.letters', 'deputy', '/deputy/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 137),
  ('deputy.approvals', 'deputy', '/deputy/approvals', 'طلبات الموافقة', null, '{view,decide}', 138),
  ('deputy.procedures', 'deputy', '/deputy/procedures', 'الإجراءات', null, '{view,execute}', 139),
  ('deputy.behavior', 'deputy', '/deputy/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 140),
  ('deputy.stop-hotspots', 'deputy', '/deputy/stop-hotspots', 'خريطة النفايات (بقع التوقف)', null, '{view}', 141),
  ('ops-room', 'ops-room', '/ops-room', 'الرئيسية', null, '{view}', 142),
  ('ops-room.operations-data', 'ops-room', '/ops-room/operations-data', 'بيانات وتقارير العمليات', null, '{view,edit,export}', 143),
  ('ops-room.station-daily', 'ops-room', '/ops-room/station-daily', 'التقرير اليومي للمحطة', null, '{view,create,export}', 144),
  ('ops-room.station-fleet', 'ops-room', '/ops-room/station-fleet', 'أسطول المحطة التحويلية', null, '{view,create,edit}', 145),
  ('ops-room.station-outbound', 'ops-room', '/ops-room/station-outbound', 'متابعة خروج آليات المحطة', null, '{view,execute}', 146),
  ('ops-room.vehicles-database', 'ops-room', '/ops-room/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit,export}', 147),
  ('ops-room.vehicles-archive', 'ops-room', '/ops-room/vehicles-archive', 'أرشيف الآليات', null, '{view,delete}', 148),
  ('ops-room.gps', 'ops-room', '/ops-room/gps', 'بيانات أجهزة GPS', null, '{view,edit,execute,export}', 149),
  ('ops-room.gbs-containers', 'ops-room', '/ops-room/gbs-containers', 'GBS الحاويات', null, '{view,edit}', 150),
  ('ops-room.attendance', 'ops-room', '/ops-room/attendance', 'الحضوريات', null, '{view,edit,decide,export}', 151),
  ('ops-room.store', 'ops-room', '/ops-room/store', 'المخزن', null, '{view,create,edit,execute}', 152),
  ('ops-room.campaigns', 'ops-room', '/ops-room/campaigns', 'متابعة الحملات', null, '{view,create,export}', 153),
  ('ops-room.citizen-complaints', 'ops-room', '/ops-room/citizen-complaints', 'استقبال الشكاوى', null, '{view,execute,delete}', 154),
  ('ops-room.disclosures', 'ops-room', '/ops-room/disclosures', 'الكشوفات', null, '{view,create,decide}', 155),
  ('ops-room.advances', 'ops-room', '/ops-room/advances', 'السلف', null, '{view,create}', 156),
  ('ops-room.contractor-headcounts', 'ops-room', '/ops-room/contractor-headcounts', 'حضوريات العمال', null, '{view,decide}', 157),
  ('ops-room.leaves', 'ops-room', '/ops-room/leaves', 'طلبات الإجازة', null, '{view,decide}', 158),
  ('ops-room.live-tracking', 'ops-room', '/ops-room/live-tracking', 'البث المباشر', null, '{view}', 159),
  ('ops-room.live-tracking.data', 'ops-room', '/ops-room/live-tracking/data', 'بيانات البث المباشر', null, '{view}', 160),
  ('ops-room.waste-map', 'ops-room', '/ops-room/waste-map', 'خريطة النفايات (بقع التوقف)', null, '{view,export}', 161),
  ('complaints', 'complaints', '/complaints', 'الرئيسية', null, '{view}', 162),
  ('complaints.karrada-sector', 'complaints', '/complaints/karrada-sector', 'قاطع الكرادة', null, '{view,create,edit}', 163),
  ('complaints.zaafaraniya-sector', 'complaints', '/complaints/zaafaraniya-sector', 'قاطع الزعفرانية', null, '{view,create,edit}', 164),
  ('complaints.assignment', 'complaints', '/complaints/assignment', 'فرز وإسناد الشكاوى', null, '{view,create,edit}', 165),
  ('complaints.processing', 'complaints', '/complaints/processing', 'معالجة الشكاوى', null, '{view,decide,execute}', 166),
  ('complaints.templates', 'complaints', '/complaints/templates', 'القوالب', null, '{view,edit}', 167),
  ('complaints.data', 'complaints', '/complaints/data', 'بيانات الشكاوى', null, '{view,export}', 168),
  ('complaints.database', 'complaints', '/complaints/database', 'قاعدة بيانات الشكاوى', null, '{view,export}', 169),
  ('complaints.pages-contact-settings', 'complaints', '/complaints/pages-contact-settings', 'إعدادات الصفحات والتواصل', null, '{view,edit}', 170),
  ('complaints.archive', 'complaints', '/complaints/archive', 'أرشيف الشكاوى', null, '{view,execute,delete}', 171),
  ('complaints.technical-support', 'complaints', '/complaints/technical-support', 'الدعم الفني', null, '{view,create}', 172),
  ('media', 'media', '/media', 'الرئيسية', null, '{view}', 173),
  ('media.karrada-sector', 'media', '/media/karrada-sector', 'قاطع الكرادة', null, '{view,create}', 174),
  ('media.zaafaraniya-sector', 'media', '/media/zaafaraniya-sector', 'الزعفرانية', null, '{view,create}', 175),
  ('media.zaafaraniya-folder', 'media', '/media/zaafaraniya-folder', 'فولدر الزعفرانية', null, '{view,create,export}', 176),
  ('media.karrada-folder', 'media', '/media/karrada-folder', 'فولدر الكرادة', null, '{view,create,export}', 177),
  ('media.design-templates', 'media', '/media/design-templates', 'قوالب التصميم', null, '{view,create,edit,delete}', 178),
  ('media.archive', 'media', '/media/archive', 'الأرشيف', null, '{view,delete}', 179),
  ('central-garage', 'central-garage', '/central-garage', 'الرئيسية', null, '{view}', 180),
  ('central-garage.drivers-dispatch', 'central-garage', '/central-garage/drivers-dispatch', 'انطلاقية السائقين', null, '{view,create,execute}', 181),
  ('central-garage.maintenance-coordination', 'central-garage', '/central-garage/maintenance-coordination', 'تنسيق حركات الصيانة', null, '{view,create,decide,execute}', 182),
  ('central-garage.vehicles-database', 'central-garage', '/central-garage/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit}', 183),
  ('central-garage.fuel', 'central-garage', '/central-garage/fuel', 'الوقود', null, '{view,create}', 184),
  ('central-garage.fuel.gas-oil', 'central-garage', '/central-garage/fuel/gas-oil', 'الكاز', 'central-garage.fuel', '{view,create}', 185),
  ('central-garage.fuel.hydraulic', 'central-garage', '/central-garage/fuel/hydraulic', 'الهيدروليك', 'central-garage.fuel', '{view,create}', 186),
  ('central-garage.fuel.grease', 'central-garage', '/central-garage/fuel/grease', 'الدهن', 'central-garage.fuel', '{view,create}', 187),
  ('central-garage.fuel.c-oil', 'central-garage', '/central-garage/fuel/c-oil', 'C-Oil', 'central-garage.fuel', '{view,create}', 188),
  ('central-garage.employees', 'central-garage', '/central-garage/employees', 'الموظفون', null, '{view,edit}', 189),
  ('central-garage.requests', 'central-garage', '/central-garage/requests', 'الطلبات', null, '{view,create}', 190),
  ('central-garage.procedures', 'central-garage', '/central-garage/procedures', 'الإجراءات', null, '{view,create,execute}', 191),
  ('central-garage.disclosures', 'central-garage', '/central-garage/disclosures', 'الكشوفات', null, '{view,create}', 192),
  ('central-garage.reports', 'central-garage', '/central-garage/reports', 'تقارير الكراج', null, '{view,export}', 193),
  ('central-garage.archive', 'central-garage', '/central-garage/archive', 'الأرشيف', null, '{view,delete}', 194),
  ('follow-up', 'follow-up', '/follow-up', 'الرئيسية', null, '{view}', 195),
  ('follow-up.containers', 'follow-up', '/follow-up/containers', 'متابعة الحاويات', null, '{view,edit}', 196),
  ('follow-up.workers', 'follow-up', '/follow-up/workers', 'متابعة العمال', null, '{view,edit}', 197)
on conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;
delete from public.permission_units where key not in ('employee', 'employee.attendance', 'employee.photos', 'hr', 'hr.recruitment', 'hr.hire-requests', 'hr.employees', 'hr.attendance', 'hr.leaves', 'hr.documents', 'hr.biometric', 'hr.org', 'hr.behavior', 'manager', 'manager.team', 'manager.request', 'manager.leaves', 'manager.breakdown', 'manager.vehicle-trips', 'manager.support', 'manager.gbs-containers', 'manager.complaints', 'manager.citizen-complaints', 'manager.photos', 'manager.archive', 'finance', 'finance.reports', 'finance.payroll', 'finance.contractor-wages', 'finance.advances', 'finance.settlements', 'finance.letters', 'finance.purchases', 'finance.budget', 'finance.expenses', 'finance.announcements', 'it', 'it.user-management', 'it.user-management.list', 'it.user-management.create', 'it.user-management.approval-chains', 'it.user-management.approval-performance', 'it.approvals', 'it.user-management.disclosure-types', 'it.user-management.maintenance-workshops', 'it.database', 'it.database.tables', 'it.branches', 'it.permissions', 'it.integrations', 'it.integrations.biometric', 'it.integrations.biometric.unmatched', 'it.integrations.biometric.attendance-audit', 'it.integrations.gps', 'it.integrations.gps-health', 'it.integrations.hr-policy', 'it.integrations.auto-deductions', 'it.integrations.advances', 'it.integrations.live-tracking', 'it.notification-policies', 'it.updates', 'it.archive', 'it.central-garage-approvals', 'it.cold-archive', 'it.data-retention', 'it.console', 'it.devops', 'it.devops.git', 'it.devops.database', 'it.devops.tests', 'it.devops.hosting', 'it.devops.status', 'admin', 'admin.reports', 'admin.announcements', 'admin.approvals', 'admin.approval-performance', 'admin.procedures', 'admin.disclosures', 'field-ops', 'field-ops.requests', 'field-ops.sectors', 'field-ops.reports', 'field-ops.notify', 'field-ops.procedures', 'field-ops.my-requests', 'admin-ops', 'admin-ops.requests', 'admin-ops.reports', 'admin-ops.notify', 'admin-ops.procedures', 'admin-ops.disclosures', 'admin-ops.contractors', 'admin-ops.my-requests', 'maintenance', 'maintenance.purchases', 'maintenance.inventory', 'maintenance.vehicle-cases', 'maintenance.employees', 'maintenance.requests', 'maintenance.procedures', 'maintenance.archive', 'transfer-station', 'transfer-station.weights', 'transfer-station.weights.log', 'transfer-station.saksat', 'transfer-station.carrier', 'transfer-station.vehicle-movements', 'transfer-station.employees', 'transfer-station.requests', 'transfer-station.procedures', 'transfer-station.disclosures', 'transfer-station.fines', 'transfer-station.archive', 'executive', 'executive.reports', 'executive.announcements', 'executive.approvals', 'executive.procedures', 'executive.receivables', 'executive.gps-payments', 'executive.rewards', 'executive.letters', 'executive.events', 'executive.behavior', 'executive.stop-hotspots', 'deputy', 'deputy.reports', 'deputy.announcements', 'deputy.statements', 'deputy.deductions', 'deputy.rented-tax', 'deputy.overtime', 'deputy.sector-supplies', 'deputy.station-folders', 'deputy.data-analysis', 'deputy.rewards', 'deputy.letters', 'deputy.approvals', 'deputy.procedures', 'deputy.behavior', 'deputy.stop-hotspots', 'ops-room', 'ops-room.operations-data', 'ops-room.station-daily', 'ops-room.station-fleet', 'ops-room.station-outbound', 'ops-room.vehicles-database', 'ops-room.vehicles-archive', 'ops-room.gps', 'ops-room.gbs-containers', 'ops-room.attendance', 'ops-room.store', 'ops-room.campaigns', 'ops-room.citizen-complaints', 'ops-room.disclosures', 'ops-room.advances', 'ops-room.contractor-headcounts', 'ops-room.leaves', 'ops-room.live-tracking', 'ops-room.live-tracking.data', 'ops-room.waste-map', 'complaints', 'complaints.karrada-sector', 'complaints.zaafaraniya-sector', 'complaints.assignment', 'complaints.processing', 'complaints.templates', 'complaints.data', 'complaints.database', 'complaints.pages-contact-settings', 'complaints.archive', 'complaints.technical-support', 'media', 'media.karrada-sector', 'media.zaafaraniya-sector', 'media.zaafaraniya-folder', 'media.karrada-folder', 'media.design-templates', 'media.archive', 'central-garage', 'central-garage.drivers-dispatch', 'central-garage.maintenance-coordination', 'central-garage.vehicles-database', 'central-garage.fuel', 'central-garage.fuel.gas-oil', 'central-garage.fuel.hydraulic', 'central-garage.fuel.grease', 'central-garage.fuel.c-oil', 'central-garage.employees', 'central-garage.requests', 'central-garage.procedures', 'central-garage.disclosures', 'central-garage.reports', 'central-garage.archive', 'follow-up', 'follow-up.containers', 'follow-up.workers');
insert into public.permission_portal_roles (portal, role) values
  ('employee', 'employee'),
  ('hr', 'hr_officer'),
  ('manager', 'department_manager'),
  ('finance', 'finance_officer'),
  ('it', 'it_admin'),
  ('admin', 'super_admin'),
  ('field-ops', 'field_ops'),
  ('admin-ops', 'admin_ops'),
  ('maintenance', 'maintenance'),
  ('transfer-station', 'transfer_station'),
  ('executive', 'executive_director'),
  ('deputy', 'deputy_director'),
  ('ops-room', 'ops_room'),
  ('complaints', 'complaints_officer'),
  ('media', 'media_officer'),
  ('central-garage', 'central_garage_officer'),
  ('follow-up', 'follow_up')
on conflict (portal) do update set role = excluded.role;
delete from public.permission_portal_roles where portal not in ('employee', 'hr', 'manager', 'finance', 'it', 'admin', 'field-ops', 'admin-ops', 'maintenance', 'transfer-station', 'executive', 'deputy', 'ops-room', 'complaints', 'media', 'central-garage', 'follow-up');
-- <<catalog/>>

-- <<bindings>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
delete from public.permission_write_bindings;
insert into public.permission_write_bindings (fn, unit_key, action) values
  ('hr_employee_create', 'hr.employees', 'create'),
  ('hr_employee_terminate', 'hr.recruitment', 'execute'),
  ('hire_request_complete', 'hr.hire-requests', 'execute'),
  ('supply_request_deliver', 'ops-room.store', 'execute'),
  ('advance_request_create', 'ops-room.advances', 'create'),
  ('ops_attendance_confirm', 'ops-room.attendance', 'decide'),
  ('ops_contractor_month_approve', 'ops-room.contractor-headcounts', 'decide'),
  ('advance_deliver', 'finance.advances', 'execute'),
  ('advance_settle_cash', 'finance.advances', 'execute'),
  ('finance_payroll_approve', 'finance.payroll', 'decide'),
  ('finance_payroll_adjust', 'finance.payroll', 'edit'),
  ('finance_payroll_reconcile', 'finance.payroll', 'execute'),
  ('finance_treasury_confirm', 'finance.budget', 'decide'),
  ('cold_archive_package_create', 'it.cold-archive', 'create'),
  ('cold_archive_purge_request', 'it.cold-archive', 'delete'),
  ('cold_archive_purge_approve', 'it.cold-archive', 'decide'),
  ('cold_archive_purge_confirm', 'it.cold-archive', 'delete'),
  ('it_deduction_exemption_add', 'it.integrations.auto-deductions', 'edit'),
  ('garage_decide_tank_zero', 'it.central-garage-approvals', 'decide'),
  ('complaint_approve_report', 'complaints.processing', 'decide'),
  ('complaint_create_item_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_batch_create_items_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_start_assignment_ticket', 'manager.complaints', 'execute'),
  ('complaint_complete_assignment_ticket', 'manager.complaints', 'execute'),
  ('sector_confirm_vehicle_arrival', 'manager.vehicle-trips', 'execute'),
  ('sector_confirm_vehicle_site_return', 'manager.vehicle-trips', 'execute'),
  ('sector_submit_breakdown', 'manager.breakdown', 'create'),
  ('sector_support_request_create', 'manager.support', 'create'),
  ('garage_record_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_return', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_shift_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_decide_maintenance_dispatch', 'central-garage.maintenance-coordination', 'decide'),
  ('station_confirm_vehicle_arrival', 'transfer-station.vehicle-movements', 'execute'),
  ('station_record_exit', 'transfer-station.vehicle-movements', 'execute'),
  ('maintenance_approve_readiness', 'maintenance.vehicle-cases', 'decide'),
  ('maintenance_complete_case', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_confirm_arrival', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_inventory_create', 'maintenance.inventory', 'create'),
  ('maintenance_purchase_create', 'maintenance.purchases', 'create'),
  ('media_template_create', 'media.design-templates', 'create');
-- <<bindings/>>
