-- 00389-ب — «من في الدوام الآن»: لوحة لحظية للموارد البشرية (قراءة فقط) — لا تغيير في محرّك الحضور أو الخصومات أو البصمة.
-- الحالة لكل موظف اليوم بحسب شفته الفعلي (app.hr_effective_shift) وسجل اليوم (hr_attendance_days) والإجازات المعتمدة (hr_leaves):
--   off      = بلا شفت مُسنَد        rest     = يوم راحة في الشفت        leave  = إجازة معتمدة اليوم
--   upcoming = الشفت لم يبدأ بعد     present  = حضر (بصمة دخول)          late   = حضر متأخرًا
--   missing  = الشفت بدأ ومرّت السماحية ولا بصمة دخول (قبل نهاية الشفت)   absent = انتهى الشفت بلا حضور (أو مُحتسب غائبًا)
--   done     = أكمل الدوام (بصمة خروج)   incomplete = مُحتسب ناقص البصمات
-- p_at: لحظة التقييم (افتراضيًا الآن) — تُمرَّر صراحةً في الاختبارات فقط.
drop function if exists public.hr_now_board(uuid, uuid, text, timestamptz);
create or replace function public.hr_now_board(p_branch uuid default null, p_department uuid default null, p_search text default null, p_at timestamptz default now())
returns table (
  employee_id uuid, employee_number text, full_name text, job_title text, department_id uuid, department_name text, branch_name text,
  shift_name text, expected_in time, expected_out time, check_in timestamptz, check_out timestamptz,
  late_minutes int, state text, leave_type text
)
language sql stable security definer set search_path = public, app as $$
  with ctx as (select app.hr_local_date(p_at) as today, (p_at + app.hr_tz())::time as lt),
  emp as (
    select e.id, e.employee_number, e.full_name, e.job_title, e.department_id, d.name as department_name, b.name as branch_name
    from public.employees e
    left join public.departments d on d.id = e.department_id
    left join public.branches b on b.id = e.branch_id
    where e.archived_at is null and e.employment_status <> 'terminated' and e.hire_date <= (select today from ctx)
      and (p_branch is null or e.branch_id = p_branch)
      and (p_department is null or e.department_id in (select app.hr_department_tree(p_department)))
      and (p_search is null or p_search = '' or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
      and app.has_role(array['hr_officer', 'ops_room', 'it_admin', 'super_admin'])),
  x as (
    select e.*, sh.shift_name, sh.start_time, sh.end_time, sh.grace_minutes, sh.work_days,
           a.status as att_status, a.check_in, a.check_out, coalesce(a.late_minutes, 0) as late_minutes, a.is_rest_day,
           lv.leave_type,
           (sh.shift_name is not null and not (extract(dow from c.today)::smallint = any (sh.work_days))) as rest_by_shift,
           -- بدأ الشفت؟ انتهى؟ (الشفت العابر لمنتصف الليل: end <= start)
           case when sh.start_time is null then false
                when sh.end_time > sh.start_time then c.lt >= sh.start_time
                else true end as started,
           case when sh.start_time is null then false
                when sh.end_time > sh.start_time then c.lt >= sh.end_time
                else false end as ended,
           case when sh.start_time is null then false
                when sh.end_time > sh.start_time then c.lt >= sh.start_time + make_interval(mins => coalesce(sh.grace_minutes, 0))
                else true end as grace_passed
    from emp e cross join ctx c
    left join lateral app.hr_effective_shift(e.id, c.today) sh on true
    left join public.hr_attendance_days a on a.employee_id = e.id and a.work_date = c.today
    left join lateral (select l.leave_type from public.hr_leaves l where l.employee_id = e.id and l.kind = 'leave' and l.status = 'approved' and c.today between l.start_date and l.end_date limit 1) lv on true)
  select y.* from (
    select x.id, x.employee_number, x.full_name, x.job_title, x.department_id, x.department_name, x.branch_name,
           x.shift_name, x.start_time, x.end_time, x.check_in, x.check_out, x.late_minutes,
           case
             when x.leave_type is not null or x.att_status = 'leave' then 'leave'
             when x.shift_name is null then 'off'
             when coalesce(x.is_rest_day, false) or x.rest_by_shift then 'rest'
             when x.check_out is not null then 'done'
             when x.att_status = 'incomplete' then 'incomplete'
             when x.check_in is not null then case when x.att_status = 'late' or x.late_minutes > 0 then 'late' else 'present' end
             when x.att_status = 'absent' or x.ended then 'absent'
             when x.grace_passed then 'missing'
             else 'upcoming' end as state,
           x.leave_type
    from x) y
  -- الترتيب: من لم يحضر بعد أولًا (يحتاج متابعة فورية)، ثم الغائب، ثم المتأخر، ثم البقية
  order by case y.state when 'missing' then 0 when 'absent' then 1 when 'late' then 2 when 'incomplete' then 3 else 4 end, y.department_name, y.full_name
$$;
revoke all on function public.hr_now_board(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.hr_now_board(uuid, uuid, text, timestamptz) to authenticated;

-- كتالوج الصلاحيات: وحدتا «من في الدوام الآن» (hr.now) و«تقرير الحضور الشهري» (hr.attendance-monthly: export)
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
  ('hr.now', 'hr', '/hr/now', 'من في الدوام الآن', null, '{view}', 8),
  ('hr.attendance-monthly', 'hr', '/hr/attendance-monthly', 'تقرير الحضور الشهري', null, '{view,export}', 9),
  ('hr.leaves', 'hr', '/hr/leaves', 'الإجازات والزمنيات', null, '{view,create,decide,export}', 10),
  ('hr.documents', 'hr', '/hr/documents', 'وثائق الموظفين', null, '{view,edit,export}', 11),
  ('hr.biometric', 'hr', '/hr/biometric', 'دفتر البصمة', null, '{view,export}', 12),
  ('hr.org', 'hr', '/hr/org', 'الهيكل التنظيمي', null, '{view,create,edit,delete}', 13),
  ('hr.behavior', 'hr', '/hr/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 14),
  ('manager', 'manager', '/manager', 'الرئيسية', null, '{view}', 15),
  ('manager.team', 'manager', '/manager/team', 'فريقي', null, '{view}', 16),
  ('manager.request', 'manager', '/manager/request', 'إنشاء طلب', null, '{view,create}', 17),
  ('manager.leaves', 'manager', '/manager/leaves', 'إجازات فريقي', null, '{view,create,decide}', 18),
  ('manager.breakdown', 'manager', '/manager/breakdown', 'عطل آلية', null, '{view,create}', 19),
  ('manager.vehicle-trips', 'manager', '/manager/vehicle-trips', 'حركة آليات الوردية', null, '{view,execute}', 20),
  ('manager.support', 'manager', '/manager/support', 'طلبات الدعم', null, '{view,create}', 21),
  ('manager.gbs-containers', 'manager', '/manager/gbs-containers', 'حاويات GBS', null, '{view}', 22),
  ('manager.complaints', 'manager', '/manager/complaints', 'الشكاوى المسندة', null, '{view,create,execute}', 23),
  ('manager.citizen-complaints', 'manager', '/manager/citizen-complaints', 'شكاوى المواطنين', null, '{view,execute}', 24),
  ('manager.photos', 'manager', '/manager/photos', 'إرسال صور', null, '{view,create}', 25),
  ('manager.archive', 'manager', '/manager/archive', 'الأرشيف', null, '{view}', 26),
  ('finance', 'finance', '/finance', 'الرئيسية', null, '{view}', 27),
  ('finance.reports', 'finance', '/finance/reports', 'التقارير', null, '{view,export}', 28),
  ('finance.payroll', 'finance', '/finance/payroll', 'الرواتب', null, '{view,edit,decide,execute,export}', 29),
  ('finance.contractor-wages', 'finance', '/finance/contractor-wages', 'أجور المتعهدين', null, '{view,edit,decide,export}', 30),
  ('finance.advances', 'finance', '/finance/advances', 'السلف', null, '{view,execute,export}', 31),
  ('finance.settlements', 'finance', '/finance/settlements', 'المنتهية خدماتهم والتصفية', null, '{view,decide,execute,export}', 32),
  ('finance.letters', 'finance', '/finance/letters', 'سجل الكتب الرسمية', null, '{view,export}', 33),
  ('finance.purchases', 'finance', '/finance/purchases', 'مشتريات قطع الصيانة', null, '{view,decide}', 34),
  ('finance.budget', 'finance', '/finance/budget', 'القاصة', null, '{view,create,edit,decide}', 35),
  ('finance.expenses', 'finance', '/finance/expenses', 'المصاريف', null, '{view,create,edit,export}', 36),
  ('finance.announcements', 'finance', '/finance/announcements', 'التبليغات', null, '{view,create}', 37),
  ('it', 'it', '/it', 'الرئيسية', null, '{view}', 38),
  ('it.user-management', 'it', '/it/user-management', 'إدارة المستخدمين', null, '{view}', 39),
  ('it.user-management.list', 'it', '/it/user-management/list', 'المستخدمون', 'it.user-management', '{view,edit}', 40),
  ('it.user-management.create', 'it', '/it/user-management/create', 'إنشاء مستخدم', 'it.user-management', '{view,create}', 41),
  ('it.user-management.approval-chains', 'it', '/it/user-management/approval-chains', 'سلاسل الموافقات', 'it.user-management', '{view,edit,delete}', 42),
  ('it.user-management.approval-performance', 'it', '/it/user-management/approval-performance', 'أداء الموافقات', 'it.user-management', '{view}', 43),
  ('it.approvals', 'it', '/it/approvals', 'طلبات الموافقة', 'it.user-management', '{view,decide}', 44),
  ('it.user-management.disclosure-types', 'it', '/it/user-management/disclosure-types', 'أنواع الكشوفات', 'it.user-management', '{view,edit}', 45),
  ('it.user-management.maintenance-workshops', 'it', '/it/user-management/maintenance-workshops', 'ورش الصيانة', 'it.user-management', '{view,edit}', 46),
  ('it.database', 'it', '/it/database', 'قاعدة البيانات', null, '{view}', 47),
  ('it.database.tables', 'it', '/it/database/tables', 'الجداول والأعمدة', 'it.database', '{view}', 48),
  ('it.branches', 'it', '/it/branches', 'فروع الشركة', null, '{view,create,edit}', 49),
  ('it.permissions', 'it', '/it/permissions', 'قوالب الصلاحيات', null, '{view,edit}', 50),
  ('it.integrations', 'it', '/it/integrations', 'التكاملات', null, '{view}', 51),
  ('it.integrations.biometric', 'it', '/it/integrations/biometric', 'أجهزة البصمة', 'it.integrations', '{view,edit,execute}', 52),
  ('it.integrations.biometric.unmatched', 'it', '/it/integrations/biometric/unmatched', 'الأشخاص غير المطابقين', 'it.integrations', '{view}', 53),
  ('it.integrations.biometric.attendance-audit', 'it', '/it/integrations/biometric/attendance-audit', 'سجل تعديلات الحضور', 'it.integrations', '{view}', 54),
  ('it.integrations.gps', 'it', '/it/integrations/gps', 'تتبع الشاحنات', 'it.integrations', '{view,edit,execute}', 55),
  ('it.integrations.gps-health', 'it', '/it/integrations/gps-health', 'سلامة تكامل GPS', 'it.integrations', '{view}', 56),
  ('it.integrations.hr-policy', 'it', '/it/integrations/hr-policy', 'سياسة الحضور والإجازات', 'it.integrations', '{view,edit}', 57),
  ('it.integrations.auto-deductions', 'it', '/it/integrations/auto-deductions', 'الاستقطاعات التلقائية', 'it.integrations', '{view,edit}', 58),
  ('it.integrations.advances', 'it', '/it/integrations/advances', 'السلف — الأنواع والسياسة', 'it.integrations', '{view,edit}', 59),
  ('it.integrations.live-tracking', 'it', '/it/integrations/live-tracking', 'البث المباشر — الإعدادات', 'it.integrations', '{view,edit}', 60),
  ('it.notification-policies', 'it', '/it/notification-policies', 'سياسات الإشعارات والانطلاقات', null, '{view,edit,delete}', 61),
  ('it.updates', 'it', '/it/updates', 'التحديثات والمراقبة', null, '{view,execute}', 62),
  ('it.archive', 'it', '/it/archive', 'الأرشيف', null, '{view,delete}', 63),
  ('it.central-garage-approvals', 'it', '/it/central-garage-approvals', 'موافقات تصفير خزانات الكراج', 'it.archive', '{view,decide}', 64),
  ('it.cold-archive', 'it', '/it/cold-archive', 'الأرشيف البارد', 'it.archive', '{view,create,decide,delete}', 65),
  ('it.data-retention', 'it', '/it/data-retention', 'الاحتفاظ بالبيانات', 'it.archive', '{view,edit,delete}', 66),
  ('it.console', 'it', '/it/console', 'Console — رصد الأخطاء', null, '{view}', 67),
  ('it.devops', 'it', '/it/devops', 'دليل التشغيل التقني', null, '{view}', 68),
  ('it.devops.git', 'it', '/it/devops/git', 'Git ورفع التحديثات', 'it.devops', '{view}', 69),
  ('it.devops.database', 'it', '/it/devops/database', 'قاعدة البيانات والترحيلات', 'it.devops', '{view}', 70),
  ('it.devops.tests', 'it', '/it/devops/tests', 'الاختبارات', 'it.devops', '{view}', 71),
  ('it.devops.hosting', 'it', '/it/devops/hosting', 'الاستضافة والبصمة في الإنتاج', 'it.devops', '{view}', 72),
  ('it.devops.status', 'it', '/it/devops/status', 'لوحة الحالة الحية', 'it.devops', '{view}', 73),
  ('admin', 'admin', '/admin', 'الرئيسية', null, '{view}', 74),
  ('admin.reports', 'admin', '/admin/reports', 'التقارير', null, '{view}', 75),
  ('admin.announcements', 'admin', '/admin/announcements', 'التبليغات', null, '{view,create}', 76),
  ('admin.approvals', 'admin', '/admin/approvals', 'طلبات الموافقة', null, '{view,decide}', 77),
  ('admin.approval-performance', 'admin', '/admin/approval-performance', 'أداء الموافقات', null, '{view}', 78),
  ('admin.procedures', 'admin', '/admin/procedures', 'الإجراءات', null, '{view,execute}', 79),
  ('admin.disclosures', 'admin', '/admin/disclosures', 'الكشوفات', null, '{view,decide}', 80),
  ('field-ops', 'field-ops', '/field-ops', 'الرئيسية', null, '{view}', 81),
  ('field-ops.requests', 'field-ops', '/field-ops/requests', 'طلبات فريقي', null, '{view,decide}', 82),
  ('field-ops.sectors', 'field-ops', '/field-ops/sectors', 'القواطع والمسؤولون', null, '{view}', 83),
  ('field-ops.reports', 'field-ops', '/field-ops/reports', 'التقارير', null, '{view}', 84),
  ('field-ops.notify', 'field-ops', '/field-ops/notify', 'التبليغ', null, '{view,create}', 85),
  ('field-ops.procedures', 'field-ops', '/field-ops/procedures', 'الإجراءات', null, '{view,execute}', 86),
  ('field-ops.my-requests', 'field-ops', '/field-ops/my-requests', 'طلباتي', null, '{view,create}', 87),
  ('admin-ops', 'admin-ops', '/admin-ops', 'الرئيسية', null, '{view}', 88),
  ('admin-ops.requests', 'admin-ops', '/admin-ops/requests', 'طلبات فريقي', null, '{view,create,decide}', 89),
  ('admin-ops.reports', 'admin-ops', '/admin-ops/reports', 'التقارير', null, '{view}', 90),
  ('admin-ops.notify', 'admin-ops', '/admin-ops/notify', 'التبليغ', null, '{view,create}', 91),
  ('admin-ops.procedures', 'admin-ops', '/admin-ops/procedures', 'الإجراءات', null, '{view,create,execute}', 92),
  ('admin-ops.disclosures', 'admin-ops', '/admin-ops/disclosures', 'الكشوفات', null, '{view,create,decide}', 93),
  ('admin-ops.contractors', 'admin-ops', '/admin-ops/contractors', 'متابعة المتعهدين والعمال', null, '{view,decide}', 94),
  ('admin-ops.my-requests', 'admin-ops', '/admin-ops/my-requests', 'طلباتي', null, '{view,create}', 95),
  ('maintenance', 'maintenance', '/maintenance', 'الرئيسية', null, '{view}', 96),
  ('maintenance.purchases', 'maintenance', '/maintenance/purchases', 'مشتريات قطع الصيانة', null, '{view,create}', 97),
  ('maintenance.inventory', 'maintenance', '/maintenance/inventory', 'مخزون قطع الصيانة', null, '{view,create,edit}', 98),
  ('maintenance.vehicle-cases', 'maintenance', '/maintenance/vehicle-cases', 'صيانة الآليات', null, '{view,create,decide,execute}', 99),
  ('maintenance.employees', 'maintenance', '/maintenance/employees', 'الموظفون', null, '{view,edit}', 100),
  ('maintenance.requests', 'maintenance', '/maintenance/requests', 'الطلبات', null, '{view,create}', 101),
  ('maintenance.procedures', 'maintenance', '/maintenance/procedures', 'الإجراءات', null, '{view,create,execute}', 102),
  ('maintenance.archive', 'maintenance', '/maintenance/archive', 'أرشيف الصيانة', null, '{view,delete}', 103),
  ('transfer-station', 'transfer-station', '/transfer-station', 'الرئيسية', null, '{view}', 104),
  ('transfer-station.weights', 'transfer-station', '/transfer-station/weights', 'الأوزان', null, '{view,create,execute}', 105),
  ('transfer-station.weights.log', 'transfer-station', '/transfer-station/weights/log', 'تسجيل الأوزان', 'transfer-station.weights', '{view,export}', 106),
  ('transfer-station.saksat', 'transfer-station', '/transfer-station/saksat', 'السكسات والنسافات الخارجة', null, '{view,create,export}', 107),
  ('transfer-station.carrier', 'transfer-station', '/transfer-station/carrier', 'ناقلات الحاويات المكبسية', null, '{view,create,export}', 108),
  ('transfer-station.vehicle-movements', 'transfer-station', '/transfer-station/vehicle-movements', 'حركة آليات المواقع', null, '{view,execute}', 109),
  ('transfer-station.employees', 'transfer-station', '/transfer-station/employees', 'الموظفون', null, '{view,edit}', 110),
  ('transfer-station.requests', 'transfer-station', '/transfer-station/requests', 'الطلبات', null, '{view,create}', 111),
  ('transfer-station.procedures', 'transfer-station', '/transfer-station/procedures', 'الإجراءات', null, '{view,create,execute}', 112),
  ('transfer-station.disclosures', 'transfer-station', '/transfer-station/disclosures', 'الكشوفات', null, '{view,create}', 113),
  ('transfer-station.fines', 'transfer-station', '/transfer-station/fines', 'الغرامات', null, '{view,create}', 114),
  ('transfer-station.archive', 'transfer-station', '/transfer-station/archive', 'أرشيف المحطة', null, '{view,delete}', 115),
  ('executive', 'executive', '/executive', 'الرئيسية', null, '{view}', 116),
  ('executive.reports', 'executive', '/executive/reports', 'التقارير', null, '{view,export}', 117),
  ('executive.announcements', 'executive', '/executive/announcements', 'التبليغات', null, '{view,create}', 118),
  ('executive.approvals', 'executive', '/executive/approvals', 'طلبات الموافقة', null, '{view,decide}', 119),
  ('executive.procedures', 'executive', '/executive/procedures', 'الإجراءات', null, '{view,execute}', 120),
  ('executive.receivables', 'executive', '/executive/receivables', 'مستحقات الشركة', null, '{view,create,edit,execute}', 121),
  ('executive.gps-payments', 'executive', '/executive/gps-payments', 'تسديد مستحقات GPS', null, '{view,create,edit}', 122),
  ('executive.rewards', 'executive', '/executive/rewards', 'المكافآت', null, '{view,create}', 123),
  ('executive.letters', 'executive', '/executive/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 124),
  ('executive.events', 'executive', '/executive/events', 'فعاليات الشركة', null, '{view,create}', 125),
  ('executive.behavior', 'executive', '/executive/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 126),
  ('executive.stop-hotspots', 'executive', '/executive/stop-hotspots', 'خريطة النفايات (بقع التوقف)', null, '{view}', 127),
  ('deputy', 'deputy', '/deputy', 'الرئيسية', null, '{view}', 128),
  ('deputy.reports', 'deputy', '/deputy/reports', 'التقارير', null, '{view,export}', 129),
  ('deputy.announcements', 'deputy', '/deputy/announcements', 'التبليغات', null, '{view,create}', 130),
  ('deputy.statements', 'deputy', '/deputy/statements', 'الكشوفات', null, '{view,decide}', 131),
  ('deputy.deductions', 'deputy', '/deputy/deductions', 'مراجعة الاستقطاعات', null, '{view,decide,edit}', 132),
  ('deputy.rented-tax', 'deputy', '/deputy/rented-tax', 'ضريبة الآليات المؤجرة', null, '{view,edit}', 133),
  ('deputy.overtime', 'deputy', '/deputy/overtime', 'الساعات الإضافية المدفوعة', null, '{view,decide,edit}', 134),
  ('deputy.sector-supplies', 'deputy', '/deputy/sector-supplies', 'كتب مستلزمات القواطع', null, '{view,decide}', 135),
  ('deputy.station-folders', 'deputy', '/deputy/station-folders', 'فولدرات المحطة', null, '{view}', 136),
  ('deputy.data-analysis', 'deputy', '/deputy/data-analysis', 'تحليل البيانات', null, '{view}', 137),
  ('deputy.rewards', 'deputy', '/deputy/rewards', 'المكافآت', null, '{view,create}', 138),
  ('deputy.letters', 'deputy', '/deputy/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 139),
  ('deputy.approvals', 'deputy', '/deputy/approvals', 'طلبات الموافقة', null, '{view,decide}', 140),
  ('deputy.procedures', 'deputy', '/deputy/procedures', 'الإجراءات', null, '{view,execute}', 141),
  ('deputy.behavior', 'deputy', '/deputy/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 142),
  ('deputy.stop-hotspots', 'deputy', '/deputy/stop-hotspots', 'خريطة النفايات (بقع التوقف)', null, '{view}', 143),
  ('ops-room', 'ops-room', '/ops-room', 'الرئيسية', null, '{view}', 144),
  ('ops-room.operations-data', 'ops-room', '/ops-room/operations-data', 'بيانات وتقارير العمليات', null, '{view,edit,export}', 145),
  ('ops-room.station-daily', 'ops-room', '/ops-room/station-daily', 'التقرير اليومي للمحطة', null, '{view,create,export}', 146),
  ('ops-room.station-fleet', 'ops-room', '/ops-room/station-fleet', 'أسطول المحطة التحويلية', null, '{view,create,edit}', 147),
  ('ops-room.station-outbound', 'ops-room', '/ops-room/station-outbound', 'متابعة خروج آليات المحطة', null, '{view,execute}', 148),
  ('ops-room.vehicles-database', 'ops-room', '/ops-room/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit,export}', 149),
  ('ops-room.vehicles-archive', 'ops-room', '/ops-room/vehicles-archive', 'أرشيف الآليات', null, '{view,delete}', 150),
  ('ops-room.gps', 'ops-room', '/ops-room/gps', 'بيانات أجهزة GPS', null, '{view,edit,execute,export}', 151),
  ('ops-room.gbs-containers', 'ops-room', '/ops-room/gbs-containers', 'GBS الحاويات', null, '{view,edit}', 152),
  ('ops-room.attendance', 'ops-room', '/ops-room/attendance', 'الحضوريات', null, '{view,edit,decide,export}', 153),
  ('ops-room.store', 'ops-room', '/ops-room/store', 'المخزن', null, '{view,create,edit,execute}', 154),
  ('ops-room.campaigns', 'ops-room', '/ops-room/campaigns', 'متابعة الحملات', null, '{view,create,export}', 155),
  ('ops-room.citizen-complaints', 'ops-room', '/ops-room/citizen-complaints', 'استقبال الشكاوى', null, '{view,execute,delete}', 156),
  ('ops-room.disclosures', 'ops-room', '/ops-room/disclosures', 'الكشوفات', null, '{view,create,decide}', 157),
  ('ops-room.advances', 'ops-room', '/ops-room/advances', 'السلف', null, '{view,create}', 158),
  ('ops-room.contractor-headcounts', 'ops-room', '/ops-room/contractor-headcounts', 'حضوريات العمال', null, '{view,decide}', 159),
  ('ops-room.leaves', 'ops-room', '/ops-room/leaves', 'طلبات الإجازة', null, '{view,decide}', 160),
  ('ops-room.live-tracking', 'ops-room', '/ops-room/live-tracking', 'البث المباشر', null, '{view}', 161),
  ('ops-room.live-tracking.data', 'ops-room', '/ops-room/live-tracking/data', 'بيانات البث المباشر', null, '{view}', 162),
  ('ops-room.waste-map', 'ops-room', '/ops-room/waste-map', 'خريطة النفايات (بقع التوقف)', null, '{view,export}', 163),
  ('complaints', 'complaints', '/complaints', 'الرئيسية', null, '{view}', 164),
  ('complaints.karrada-sector', 'complaints', '/complaints/karrada-sector', 'قاطع الكرادة', null, '{view,create,edit}', 165),
  ('complaints.zaafaraniya-sector', 'complaints', '/complaints/zaafaraniya-sector', 'قاطع الزعفرانية', null, '{view,create,edit}', 166),
  ('complaints.assignment', 'complaints', '/complaints/assignment', 'فرز وإسناد الشكاوى', null, '{view,create,edit}', 167),
  ('complaints.processing', 'complaints', '/complaints/processing', 'معالجة الشكاوى', null, '{view,decide,execute}', 168),
  ('complaints.templates', 'complaints', '/complaints/templates', 'القوالب', null, '{view,edit}', 169),
  ('complaints.data', 'complaints', '/complaints/data', 'بيانات الشكاوى', null, '{view,export}', 170),
  ('complaints.database', 'complaints', '/complaints/database', 'قاعدة بيانات الشكاوى', null, '{view,export}', 171),
  ('complaints.pages-contact-settings', 'complaints', '/complaints/pages-contact-settings', 'إعدادات الصفحات والتواصل', null, '{view,edit}', 172),
  ('complaints.archive', 'complaints', '/complaints/archive', 'أرشيف الشكاوى', null, '{view,execute,delete}', 173),
  ('complaints.technical-support', 'complaints', '/complaints/technical-support', 'الدعم الفني', null, '{view,create}', 174),
  ('media', 'media', '/media', 'الرئيسية', null, '{view}', 175),
  ('media.karrada-sector', 'media', '/media/karrada-sector', 'قاطع الكرادة', null, '{view,create}', 176),
  ('media.zaafaraniya-sector', 'media', '/media/zaafaraniya-sector', 'الزعفرانية', null, '{view,create}', 177),
  ('media.zaafaraniya-folder', 'media', '/media/zaafaraniya-folder', 'فولدر الزعفرانية', null, '{view,create,export}', 178),
  ('media.karrada-folder', 'media', '/media/karrada-folder', 'فولدر الكرادة', null, '{view,create,export}', 179),
  ('media.design-templates', 'media', '/media/design-templates', 'قوالب التصميم', null, '{view,create,edit,delete}', 180),
  ('media.archive', 'media', '/media/archive', 'الأرشيف', null, '{view,delete}', 181),
  ('central-garage', 'central-garage', '/central-garage', 'الرئيسية', null, '{view}', 182),
  ('central-garage.drivers-dispatch', 'central-garage', '/central-garage/drivers-dispatch', 'انطلاقية السائقين', null, '{view,create,execute}', 183),
  ('central-garage.maintenance-coordination', 'central-garage', '/central-garage/maintenance-coordination', 'تنسيق حركات الصيانة', null, '{view,create,decide,execute}', 184),
  ('central-garage.vehicles-database', 'central-garage', '/central-garage/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit}', 185),
  ('central-garage.fuel', 'central-garage', '/central-garage/fuel', 'الوقود', null, '{view,create}', 186),
  ('central-garage.fuel.gas-oil', 'central-garage', '/central-garage/fuel/gas-oil', 'الكاز', 'central-garage.fuel', '{view,create}', 187),
  ('central-garage.fuel.hydraulic', 'central-garage', '/central-garage/fuel/hydraulic', 'الهيدروليك', 'central-garage.fuel', '{view,create}', 188),
  ('central-garage.fuel.grease', 'central-garage', '/central-garage/fuel/grease', 'الدهن', 'central-garage.fuel', '{view,create}', 189),
  ('central-garage.fuel.c-oil', 'central-garage', '/central-garage/fuel/c-oil', 'C-Oil', 'central-garage.fuel', '{view,create}', 190),
  ('central-garage.employees', 'central-garage', '/central-garage/employees', 'الموظفون', null, '{view,edit}', 191),
  ('central-garage.requests', 'central-garage', '/central-garage/requests', 'الطلبات', null, '{view,create}', 192),
  ('central-garage.procedures', 'central-garage', '/central-garage/procedures', 'الإجراءات', null, '{view,create,execute}', 193),
  ('central-garage.disclosures', 'central-garage', '/central-garage/disclosures', 'الكشوفات', null, '{view,create}', 194),
  ('central-garage.reports', 'central-garage', '/central-garage/reports', 'تقارير الكراج', null, '{view,export}', 195),
  ('central-garage.archive', 'central-garage', '/central-garage/archive', 'الأرشيف', null, '{view,delete}', 196),
  ('follow-up', 'follow-up', '/follow-up', 'الرئيسية', null, '{view}', 197),
  ('follow-up.containers', 'follow-up', '/follow-up/containers', 'متابعة الحاويات', null, '{view,edit}', 198),
  ('follow-up.workers', 'follow-up', '/follow-up/workers', 'متابعة العمال', null, '{view,edit}', 199)
on conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;
delete from public.permission_units where key not in ('employee', 'employee.attendance', 'employee.photos', 'hr', 'hr.recruitment', 'hr.hire-requests', 'hr.employees', 'hr.attendance', 'hr.now', 'hr.attendance-monthly', 'hr.leaves', 'hr.documents', 'hr.biometric', 'hr.org', 'hr.behavior', 'manager', 'manager.team', 'manager.request', 'manager.leaves', 'manager.breakdown', 'manager.vehicle-trips', 'manager.support', 'manager.gbs-containers', 'manager.complaints', 'manager.citizen-complaints', 'manager.photos', 'manager.archive', 'finance', 'finance.reports', 'finance.payroll', 'finance.contractor-wages', 'finance.advances', 'finance.settlements', 'finance.letters', 'finance.purchases', 'finance.budget', 'finance.expenses', 'finance.announcements', 'it', 'it.user-management', 'it.user-management.list', 'it.user-management.create', 'it.user-management.approval-chains', 'it.user-management.approval-performance', 'it.approvals', 'it.user-management.disclosure-types', 'it.user-management.maintenance-workshops', 'it.database', 'it.database.tables', 'it.branches', 'it.permissions', 'it.integrations', 'it.integrations.biometric', 'it.integrations.biometric.unmatched', 'it.integrations.biometric.attendance-audit', 'it.integrations.gps', 'it.integrations.gps-health', 'it.integrations.hr-policy', 'it.integrations.auto-deductions', 'it.integrations.advances', 'it.integrations.live-tracking', 'it.notification-policies', 'it.updates', 'it.archive', 'it.central-garage-approvals', 'it.cold-archive', 'it.data-retention', 'it.console', 'it.devops', 'it.devops.git', 'it.devops.database', 'it.devops.tests', 'it.devops.hosting', 'it.devops.status', 'admin', 'admin.reports', 'admin.announcements', 'admin.approvals', 'admin.approval-performance', 'admin.procedures', 'admin.disclosures', 'field-ops', 'field-ops.requests', 'field-ops.sectors', 'field-ops.reports', 'field-ops.notify', 'field-ops.procedures', 'field-ops.my-requests', 'admin-ops', 'admin-ops.requests', 'admin-ops.reports', 'admin-ops.notify', 'admin-ops.procedures', 'admin-ops.disclosures', 'admin-ops.contractors', 'admin-ops.my-requests', 'maintenance', 'maintenance.purchases', 'maintenance.inventory', 'maintenance.vehicle-cases', 'maintenance.employees', 'maintenance.requests', 'maintenance.procedures', 'maintenance.archive', 'transfer-station', 'transfer-station.weights', 'transfer-station.weights.log', 'transfer-station.saksat', 'transfer-station.carrier', 'transfer-station.vehicle-movements', 'transfer-station.employees', 'transfer-station.requests', 'transfer-station.procedures', 'transfer-station.disclosures', 'transfer-station.fines', 'transfer-station.archive', 'executive', 'executive.reports', 'executive.announcements', 'executive.approvals', 'executive.procedures', 'executive.receivables', 'executive.gps-payments', 'executive.rewards', 'executive.letters', 'executive.events', 'executive.behavior', 'executive.stop-hotspots', 'deputy', 'deputy.reports', 'deputy.announcements', 'deputy.statements', 'deputy.deductions', 'deputy.rented-tax', 'deputy.overtime', 'deputy.sector-supplies', 'deputy.station-folders', 'deputy.data-analysis', 'deputy.rewards', 'deputy.letters', 'deputy.approvals', 'deputy.procedures', 'deputy.behavior', 'deputy.stop-hotspots', 'ops-room', 'ops-room.operations-data', 'ops-room.station-daily', 'ops-room.station-fleet', 'ops-room.station-outbound', 'ops-room.vehicles-database', 'ops-room.vehicles-archive', 'ops-room.gps', 'ops-room.gbs-containers', 'ops-room.attendance', 'ops-room.store', 'ops-room.campaigns', 'ops-room.citizen-complaints', 'ops-room.disclosures', 'ops-room.advances', 'ops-room.contractor-headcounts', 'ops-room.leaves', 'ops-room.live-tracking', 'ops-room.live-tracking.data', 'ops-room.waste-map', 'complaints', 'complaints.karrada-sector', 'complaints.zaafaraniya-sector', 'complaints.assignment', 'complaints.processing', 'complaints.templates', 'complaints.data', 'complaints.database', 'complaints.pages-contact-settings', 'complaints.archive', 'complaints.technical-support', 'media', 'media.karrada-sector', 'media.zaafaraniya-sector', 'media.zaafaraniya-folder', 'media.karrada-folder', 'media.design-templates', 'media.archive', 'central-garage', 'central-garage.drivers-dispatch', 'central-garage.maintenance-coordination', 'central-garage.vehicles-database', 'central-garage.fuel', 'central-garage.fuel.gas-oil', 'central-garage.fuel.hydraulic', 'central-garage.fuel.grease', 'central-garage.fuel.c-oil', 'central-garage.employees', 'central-garage.requests', 'central-garage.procedures', 'central-garage.disclosures', 'central-garage.reports', 'central-garage.archive', 'follow-up', 'follow-up.containers', 'follow-up.workers');
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
