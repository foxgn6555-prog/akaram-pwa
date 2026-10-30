#!/usr/bin/env python3
"""00340 — مولّد كتالوج الاحتفاظ بالبيانات النصية (كل جداول public، مجمّعة حسب البوابة).
يطبع جزء `values` الخاص بـ app.data_retention_catalog(). يُشغَّل يدوياً عند تعديل الكتالوج:
    python3 scripts/gen-retention-catalog.py > /tmp/catalog.sql
ثم يُلصق داخل الهجرة. المصدر الوحيد للحقيقة هو الهجرة نفسها؛ هذا الملف للمساعدة فقط.
"""
REF = 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني'
CFG = 'إعدادات — لا تخضع للحذف الزمني'
FIN = 'سجلات مالية/رواتب/خصومات — تبقى للأبد'
REC = 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد'
PROOF = 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد'
ARCH = 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى'
STATE = 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً'
IDENT = 'حسابات/هويات مستخدمين — لا تُحذف زمنياً'

rows = []
def L(portal, table, label, reason):
    rows.append(dict(key=table, portal=portal, label=label, desc='', table=table, tcol=None, keep=None, lock=reason, deletable=False, months=0, export=False))
def D(portal, table, label, desc, tcol, months, export=False, keep=None, lock=None, key=None):
    rows.append(dict(key=key or table, portal=portal, label=label, desc=desc, table=table, tcol=tcol, keep=keep, lock=lock or 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', deletable=True, months=months, export=export))

# ───── it: التطوير المركزية
D('it', 'audit_logs', 'سجل التدقيق العام', 'كل تعديل على الجداول (قبل/بعد). يُستثنى ما يخص الرواتب والمالية.', 'created_at', 36, True,
  keep="table_name in ('payrolls','payslips','employee_salary_profiles','hr_month_exports','hr_month_export_rows','treasury_transactions','advances','advance_installments','hr_attendance_deductions','disclosures')",
  lock='سجلات التدقيق المتعلقة بالرواتب والمالية والخصومات محمية دائماً')
D('it', 'app_errors', 'أخطاء التطبيق', 'أخطاء الواجهة والخادم المسجَّلة تلقائياً.', 'created_at', 6, False, keep='resolved is not true and archived_at is null', lock='الأخطاء غير المحلولة وغير المؤرشفة محمية')
D('it', 'integration_logs', 'سجل التكاملات الخارجية', 'طلبات/ردود مزوّدي GPS والبريد وغيرها.', 'created_at', 6)
D('it', 'login_attempts', 'محاولات تسجيل الدخول', 'ناجحة وفاشلة، مع العنوان والوقت.', 'attempted_at', 12)
D('it', 'connection_samples', 'عينات جودة الاتصال', 'قياسات زمن الاستجابة من أجهزة المستخدمين.', 'sampled_at', 3)
D('it', 'biometric_pulls', 'سجل سحب البصمات من الأجهزة', 'كل عملية سحب يدوية/آلية ونتيجتها. البصمات نفسها نوع مستقل.', 'started_at', 6)
D('it', 'biometric_pushes', 'سجل دفع الموظفين إلى الأجهزة', 'كل عملية إرسال موظف لجهاز بصمة.', 'received_at', 6)
D('it', 'biometric_device_commands', 'أوامر أجهزة البصمة', 'الأوامر المرسلة للأجهزة (ADMS).', 'created_at', 3, False, keep='acked_at is null', lock='الأوامر التي لم يؤكدها الجهاز بعد محمية')
D('it', 'biometric_punches', 'البصمات الخام من الأجهزة', 'كل لمسة إصبع كما وصلت من الجهاز. سجل الحضور المحسوب والخصومات لا يُمسّان.', 'punched_at', 6, True, key='biometric_raw_punches',
  lock='لا تُحذف بصمات شهر لم تعتمده المالية (راتب معتمد أو مدفوع)')
L('it', 'biometric_devices', 'أجهزة البصمة', REF)
L('it', 'biometric_device_users', 'موظفو أجهزة البصمة (المسجَّلون على كل جهاز)', STATE)
L('it', 'biometric_adms_endpoints', 'نقاط ADMS', CFG)
L('it', 'it_assets', 'أصول تقنية المعلومات', REF)
L('it', 'it_tickets', 'تذاكر الدعم الفني', REC)
L('it', 'system_settings', 'إعدادات النظام', CFG)
L('it', 'dynamic_portals', 'البوابات الديناميكية', CFG)
L('it', 'portal_units', 'وحدات البوابات', CFG)
L('it', 'portal_hidden_units', 'الوحدات المخفية لكل مستخدم', CFG)
L('it', 'role_page_permissions', 'صلاحيات الصفحات حسب الدور', CFG)
L('it', 'user_page_overrides', 'استثناءات صلاحيات المستخدمين', CFG)
L('it', 'permission_units', 'وحدات الصلاحيات (كتالوج 00350)', CFG)
L('it', 'permission_portal_roles', 'دور كل بوابة (صلاحيات 00350)', CFG)
L('it', 'permission_templates', 'قوالب الصلاحيات', CFG)
L('it', 'permission_template_rules', 'قواعد قوالب الصلاحيات', CFG)
L('it', 'user_permission_template', 'قالب الصلاحيات لكل مستخدم', CFG)
L('it', 'user_permission_overrides', 'استثناءات الصلاحيات الفردية', CFG)
L('it', 'permission_audit', 'سجل تدقيق الصلاحيات', PROOF)
L('it', 'permission_write_bindings', 'ربط دوال الكتابة بالصلاحيات (00350-B)', CFG)
L('it', 'user_roles', 'أدوار المستخدمين', IDENT)
L('it', 'manager_profiles', 'ملفات المديرين', IDENT)
L('it', 'documents', 'المستندات العامة', ARCH)
L('it', 'space_settings', 'إعدادات المساحة (حدود الخطة)', CFG)
L('it', 'space_reclaim_log', 'سجل استرداد المساحة (الضغط)', PROOF)
L('it', 'gps_warehouse_link', 'حالة ربط مستودع GPS التحليلي', STATE)
L('gps', 'gps_history_purge_settings', 'إعداد التفريغ اليومي لنقاط GPS التفصيلية', CFG)
L('gps', 'gps_hotspots', 'بقع التوقف الشهرية (ملخص منسوخ من المستودع)', STATE)
L('gps', 'gps_hotspots_sync', 'حالة نسخ بقع التوقف لكل شهر', STATE)
L('gps', 'gps_hotspots_month_stats', 'إحصاء بقع التوقف الشهري (للمقارنة بين الأشهر)', REC)

# ───── notifications
D('notifications', 'notifications', 'الإشعارات', 'إشعارات الجرس لكل مستخدم.', 'created_at', 6, False, keep='is_read is not true and read_at is null and dismissed_at is null', lock='الإشعارات غير المقروءة محمية')
D('notifications', 'notification_push_deliveries', 'سجل تسليم إشعارات الدفع', 'محاولات إرسال Push لكل اشتراك ونتيجتها.', 'created_at', 3)
D('notifications', 'notification_push_admin_actions', 'إجراءات IT على إشعارات الدفع', 'إعادة إرسال/إيقاف من بوابة IT.', 'created_at', 12)
L('notifications', 'notification_push_subscriptions', 'اشتراكات Push للأجهزة', STATE)
L('notifications', 'notification_preferences', 'تفضيلات الإشعارات', CFG)
L('notifications', 'notification_workflow_policies', 'سياسات إشعارات سير العمل', CFG)
L('notifications', 'announcements', 'التعميمات', REC)
L('notifications', 'announcement_receipts', 'إيصالات قراءة التعميمات', REC)

# ───── gps
D('gps', 'gps_device_position_history', 'نقاط GPS التفصيلية للآليات', 'إحداثيات كل آلية كل ثوانٍ. ملخصات الرحلات والتنبيهات تبقى.', 'fix_time', 3, False, key='gps_position_history',
  lock='لا تُحذف نقاط رحلة عليها تحقيق مفتوح')
D('gps', 'vehicle_positions', 'مواقع المركبات (النظام القديم)', 'نقاط موقع من التكامل الأول قبل مزوّدي GPS.', 'fix_time', 3)
D('gps', 'gps_events', 'أحداث GPS العامة', 'تشغيل/إطفاء/سرعة وغيرها كما وصلت.', 'occurred_at', 6)
D('gps', 'gps_vendor_events', 'أحداث مزوّد GPS الخام', 'الأحداث كما أرسلها المزوّد.', 'occurred_at', 6)
D('gps', 'gps_zone_events', 'أحداث دخول/خروج المناطق', 'دخول وخروج الآليات من المناطق الجغرافية.', 'occurred_at', 6, False,
  keep="departure_id in (select ti.departure_id from public.gps_trip_investigations ti where ti.status <> 'resolved')", lock='أحداث رحلة عليها تحقيق مفتوح محمية')
D('gps', 'gps_sync_runs', 'سجل مزامنات GPS', 'كل دورة مزامنة مع المزوّد ونتيجتها.', 'started_at', 3)
D('gps', 'gps_history_import_runs', 'سجل استيراد تاريخ GPS', 'عمليات استيراد المسارات القديمة.', 'started_at', 6)
D('gps', 'gps_operational_alerts', 'تنبيهات GPS التشغيلية', 'توقف طويل، خروج عن المسار… المحلولة فقط.', 'opened_at', 12, False, keep='resolved_at is null', lock='التنبيهات غير المحلولة محمية')
D('gps', 'live_track_points', 'نقاط المشاركة الحية للموظفين', 'إحداثيات مشاركة الموقع من هواتف الميدان.', 'recorded_at', 3)
D('gps', 'live_track_sessions', 'جلسات المشاركة الحية', 'كل جلسة مشاركة موقع (بداية/نهاية/عدد النقاط).', 'started_at', 12, False, keep='ended_at is null', lock='الجلسات الجارية محمية')
D('gps', 'trip_route_points', 'نقاط مسارات الانطلاقيات', 'النقاط المنظَّفة لكل انطلاقية (00342). ملخص المسار والتوقفات تبقى.', 'fix_time', 12, False,
  keep="departure_id in (select ti.departure_id from public.gps_trip_investigations ti where ti.status <> 'resolved')", lock='نقاط انطلاقية عليها تحقيق مفتوح محمية')
D('gps', 'trip_route_gaps', 'فجوات GPS في مسارات الانطلاقيات', 'فترات انقطاع الإشارة لكل انطلاقية.', 'started_at', 24)
L('gps', 'trip_routes', 'ملخصات مسارات الانطلاقيات', REC)
L('gps', 'trip_route_stops', 'توقفات مسارات الانطلاقيات', REC)
L('gps', 'trip_route_settings', 'إعدادات محرّك المسار', CFG)
L('gps', 'gps_devices', 'أجهزة GPS', REF)
L('gps', 'gps_providers', 'مزوّدو GPS', CFG)
L('gps', 'gps_device_positions', 'آخر موقع لكل جهاز', STATE)
L('gps', 'gps_geofences', 'المناطق الجغرافية', REF)
L('gps', 'gps_vehicle_geofences', 'ربط الآليات بالمناطق', CFG)
L('gps', 'gps_vehicle_bindings', 'ربط الأجهزة بالآليات', CFG)
L('gps', 'gps_map_landmarks', 'معالم الخريطة', REF)
L('gps', 'gps_route_deviation_settings', 'إعدادات الانحراف عن المسار', CFG)
L('gps', 'gps_route_presence_state', 'حالة التواجد على المسار', STATE)
L('gps', 'gps_zone_presence_state', 'حالة التواجد في المناطق', STATE)
L('gps', 'gps_alert_notification_policies', 'سياسات إشعارات تنبيهات GPS', CFG)
L('gps', 'gps_trip_investigations', 'تحقيقات الرحلات', REC)
L('gps', 'live_track_settings', 'إعدادات المشاركة الحية', CFG)

# ───── hr
D('hr', 'hr_attendance_audit', 'سجل تدقيق تعديلات الحضور', 'من عدّل ماذا ولماذا في أيام الحضور.', 'created_at', 36, True)
D('hr', 'hr_deduction_review_audit', 'سجل مراجعة الخصومات', 'قرارات نائب المدير على الخصومات.', 'created_at', 36, True)
D('hr', 'hr_deduction_rule_audit', 'سجل تعديل قواعد الخصم', 'تاريخ تغيير قواعد الخصم.', 'created_at', 36, True)
D('hr', 'rented_vehicle_tax_audit', 'سجل تدقيق ضريبة المركبات المستأجرة', 'تعديلات إعدادات/استثناءات الضريبة.', 'created_at', 36, True)
D('hr', 'hr_alerts', 'تنبيهات الموارد البشرية', 'تنبيهات تجاوز العتبات (غياب/تأخير). المؤكَّدة فقط.', 'created_at', 24, False, keep='acknowledged_at is null', lock='التنبيهات غير المؤكَّدة محمية')
D('hr', 'finance_hr_notices', 'إشعارات HR إلى المالية', 'تبليغات تغيّر الراتب/الإنهاء. المنجَزة فقط.', 'created_at', 24, False, keep='is_done is not true', lock='الإشعارات غير المنجَزة محمية')
for t, lbl in [('employees', 'الموظفون'), ('departments', 'الأقسام'), ('branches', 'الفروع'), ('employee_documents', 'وثائق الموظفين'), ('hr_shifts', 'الورديات'), ('employee_shift_assignments', 'تعيين الورديات'),
               ('hr_leave_types', 'أنواع الإجازات'), ('hr_leaves', 'الإجازات'), ('hr_leave_ledger', 'رصيد الإجازات'), ('termination_requests', 'طلبات إنهاء الخدمة'), ('hire_requests', 'طلبات تعيين الموظفين (00348)'), ('requests', 'الطلبات العامة للموظفين')]:
    L('hr', t, lbl, REF if t in ('employees', 'departments', 'branches', 'hr_shifts', 'hr_leave_types') else (ARCH if t == 'employee_documents' else REC))
for t, lbl in [('attendance_records', 'سجلات الحضور (القديمة)'), ('hr_attendance_days', 'أيام الحضور المحسوبة'), ('hr_attendance_confirmations', 'تأكيدات شهر الحضور'), ('hr_attendance_pending_auto', 'الخصومات الآلية بانتظار التأكيد'),
               ('hr_attendance_deductions', 'خصومات الحضور'), ('hr_deduction_rules', 'قواعد الخصم'), ('hr_deduction_rule_targets', 'نطاق قواعد الخصم'), ('hr_deduction_exemptions', 'إعفاءات الخصم'),
               ('hr_month_exports', 'تصدير الشهر إلى المالية'), ('hr_month_export_rows', 'صفوف تصدير الشهر'), ('hr_policy', 'سياسة الموارد البشرية'), ('hr_settings', 'إعدادات الموارد البشرية'),
               ('rented_vehicle_tax_settings', 'إعدادات ضريبة المركبات المستأجرة'), ('rented_vehicle_tax_overrides', 'استثناءات ضريبة المركبات المستأجرة')]:
    L('hr', t, lbl, CFG if t in ('hr_policy', 'hr_settings', 'rented_vehicle_tax_settings', 'hr_deduction_rules', 'hr_deduction_rule_targets') else FIN)
# 00353: الساعات الإضافية المدفوعة
for t, lbl in [('hr_overtime_rates', 'أجر الساعة الثابت للإضافي المدفوع'), ('hr_overtime_payouts', 'صرف الساعات الإضافية'), ('hr_overtime_members', 'الموظفون المشمولون بالإضافي المدفوع'), ('hr_overtime_member_events', 'سجل إدراج/إزالة المشمولين بالإضافي المدفوع')]:
    L('hr', t, lbl, FIN)

# ───── finance
# 00355: التصفية النهائية للمنتهية خدماتهم
for t, lbl in [('hr_settlements', 'تصفيات نهاية الخدمة'), ('hr_settlement_events', 'سجل أحداث تصفيات نهاية الخدمة')]:
    L('finance', t, lbl, FIN)
# 00356: الكتب الرسمية
L('finance', 'official_letters', 'الكتب الرسمية (إنهاء خدمة/تصفية)', FIN)
D('finance', 'advance_events', 'سجل أحداث السلف', 'مسار كل سلفة (طلب/موافقة/تسليم/تسديد). السلف غير المسدَّدة محمية.', 'created_at', 36, True,
  keep='advance_id in (select a.id from public.advances a where a.settled_at is null and a.cancelled_at is null)', lock='أحداث السلف غير المسدَّدة محمية')
D('finance', 'disclosure_events', 'سجل أحداث الكشوفات', 'مسار كل كشف (إرسال/موافقة/إرجاع). الكشوفات غير المنتهية محمية.', 'created_at', 36, True,
  keep='disclosure_id in (select d.id from public.disclosures d where d.approved_at is null and d.cancelled_at is null)', lock='أحداث الكشوفات غير المنتهية محمية')
for t, lbl in [('payrolls', 'الرواتب الشهرية'), ('payslips', 'قسائم الرواتب'), ('employee_salary_profiles', 'ملفات الرواتب'), ('advances', 'السلف'), ('advance_installments', 'أقساط السلف'), ('advance_types', 'أنواع السلف'),
               ('budget_allocations', 'مخصصات الموازنة'), ('treasury_transactions', 'حركات الخزينة'), ('treasury_receivable_types', 'أنواع المقبوضات'), ('treasury_expense_types', 'أنواع المصاريف'), ('disclosures', 'الكشوفات'), ('disclosure_types', 'أنواع الكشوفات')]:
    L('finance', t, lbl, CFG if t in ('advance_types', 'treasury_receivable_types', 'treasury_expense_types', 'disclosure_types') else FIN)

# ───── approvals
D('approvals', 'approval_delegations', 'تفويضات الموافقة', 'تفويض مؤقت لصلاحية الموافقة. السارية محمية.', 'created_at', 24, False, keep='cancelled_at is null and ends_on >= current_date', lock='التفويضات السارية محمية')
L('approvals', 'approval_chains', 'سلاسل الموافقات', CFG)
L('approvals', 'approval_chain_versions', 'تاريخ تعديل سلاسل الموافقات', PROOF)
L('approvals', 'approval_tasks', 'مهام الموافقة', PROOF)

# ───── ops (غرفة العمليات / الكراج / الأسطول)
D('ops', 'sector_notices', 'بلاغات غرفة العمليات للقطاعات', 'رسائل مرسلة من غرفة العمليات إلى مديري القطاعات.', 'created_at', 12)
D('ops', 'deputy_daily_reports', 'التقارير اليومية لنائب المدير', 'لقطة التقرير اليومي المرسَل.', 'sent_at', 24, True)
D('ops', 'gbs_container_updates', 'طلبات تحديث الحاويات', 'طلبات تغيير حالة/موقع حاوية. غير المراجَعة محمية.', 'created_at', 12, False, keep='reviewed_at is null', lock='الطلبات غير المراجَعة محمية')
for t, lbl, r in [('vehicles', 'المركبات (الأسطول)', REF), ('vehicle_categories', 'فئات المركبات', REF), ('garage_vehicles', 'آليات الكراج', REF), ('garage_departures', 'خروج ورجوع الآليات', REC), ('garage_driver_assignments', 'تعيين السائقين', REC),
                  ('garage_vehicle_shift_assignments', 'ورديات الآليات', REC), ('garage_tanks', 'خزانات الوقود', REF), ('garage_inventory_movements', 'حركات الوقود والمخزون', FIN), ('garage_tank_zero_requests', 'طلبات تصفير الخزان', FIN),
                  ('garage_user_profiles', 'حسابات الكراج', IDENT), ('vehicle_trip_legs', 'أرجل الرحلات', REC), ('ops_store_items', 'مواد مخزن العمليات', REF), ('ops_store_movements', 'حركات مخزن العمليات', FIN),
                  ('gbs_containers', 'الحاويات', REF), ('follow_up_profiles', 'حسابات المتابعة الميدانية', IDENT), ('sectors', 'القطاعات', REF)]:
    L('ops', t, lbl, r)

# ───── maintenance
D('maintenance', 'vehicle_maintenance_updates', 'تحديثات حالات الصيانة', 'التحديثات التفصيلية (تشخيص/عمل). الحالات غير المكتملة محمية.', 'created_at', 24, False,
  keep='case_id in (select c.id from public.vehicle_maintenance_cases c where c.completed_at is null)', lock='تحديثات الحالات غير المكتملة محمية')
D('maintenance', 'vehicle_maintenance_stages', 'مراحل حالات الصيانة', 'مراحل الوصول/التشخيص/الإصلاح/الفحص/التسليم. الحالات غير المكتملة محمية.', 'created_at', 24, False,
  keep='case_id in (select c.id from public.vehicle_maintenance_cases c where c.completed_at is null)', lock='مراحل الحالات غير المكتملة محمية')
for t, lbl, r in [('vehicle_maintenance_cases', 'حالات الصيانة', REC), ('vehicle_maintenance_parts', 'قطع الغيار المستخدمة', FIN), ('vehicle_maintenance_attachments', 'مرفقات الصيانة', ARCH), ('vehicle_maintenance_case_technicians', 'فنيو الحالات', REC),
                  ('maintenance_workshops', 'الورش', REF), ('maintenance_workshop_accounts', 'حسابات الورش', IDENT), ('maintenance_inventory_items', 'مواد مخزن الصيانة', REF), ('maintenance_inventory_movements', 'حركات مخزن الصيانة', FIN),
                  ('maintenance_purchase_orders', 'أوامر الشراء', FIN), ('maintenance_purchase_items', 'بنود أوامر الشراء', FIN)]:
    L('maintenance', t, lbl, r)

# ───── complaints
D('complaints', 'complaint_email_events', 'أحداث البريد الإلكتروني للشكاوى', 'إشعارات المزوّد (تسليم/فتح/ارتداد).', 'event_at', 12)
D('complaints', 'complaint_media_revisions', 'سجل استبدال صور الشكاوى', 'من استبدل أي صورة ولماذا.', 'created_at', 24)
D('complaints', 'complaint_inbox_messages', 'رسائل صندوق وارد الشكاوى', 'الرسائل الواردة بالبريد. المؤرشفة فقط.', 'received_at', 12, False, keep='archived_at is null', lock='الرسائل غير المؤرشفة محمية')
for t, lbl, r in [('complaints', 'الشكاوى', REC), ('complaint_items', 'بنود الشكاوى', REC), ('complaint_status_history', 'تاريخ حالات الشكاوى', REC), ('complaint_media', 'صور الشكاوى', ARCH), ('complaint_reports', 'تقارير الشكاوى', REC),
                  ('complaint_report_items', 'بنود تقارير الشكاوى', REC), ('complaint_templates', 'قوالب الشكاوى', CFG), ('complaint_settings', 'إعدادات الشكاوى', CFG), ('complaint_contacts', 'جهات اتصال الشكاوى', REF),
                  ('complaint_neighborhoods', 'الأحياء', REF), ('complaint_sender_rules', 'قواعد المرسلين', CFG), ('complaint_archive_folders', 'مجلدات أرشيف الشكاوى', REC), ('complaint_deletion_requests', 'طلبات حذف الشكاوى', PROOF),
                  ('complaint_email_deliveries', 'إرسالات البريد للتقارير', REC)]:
    L('complaints', t, lbl, r)

# ───── citizen
D('citizen', 'citizen_complaint_events', 'أحداث شكاوى المواطنين', 'مسار كل شكوى مواطن. الشكاوى غير المحلولة محمية.', 'created_at', 24, False,
  keep='complaint_id in (select c.id from public.citizen_complaints c where c.resolved_at is null)', lock='أحداث الشكاوى غير المحلولة محمية')
D('citizen', 'citizen_chat_messages', 'رسائل محادثات المواطنين', 'نصوص المحادثة. الجلسات المفتوحة محمية.', 'created_at', 12, False,
  keep='session_id in (select s.id from public.citizen_chat_sessions s where s.closed_at is null)', lock='رسائل الجلسات المفتوحة محمية')
D('citizen', 'citizen_chat_sessions', 'جلسات محادثات المواطنين', 'جلسة المحادثة (طلب/قبول/إغلاق/تقييم). المفتوحة محمية.', 'requested_at', 12, False, keep='closed_at is null', lock='الجلسات المفتوحة محمية')
L('citizen', 'citizen_accounts', 'حسابات المواطنين', IDENT)
L('citizen', 'citizen_complaints', 'شكاوى المواطنين', REC)
L('citizen', 'citizen_complaint_photos', 'صور شكاوى المواطنين', ARCH)
L('citizen', 'citizen_portal_settings', 'إعدادات بوابة المواطن', CFG)

# ───── contractors
D('contractors', 'contractor_audit_log', 'سجل تدقيق المقاولين', 'تعديلات العمال/الأعداد وأسبابها.', 'created_at', 36, True)
D('contractors', 'contractor_checkins', 'تسجيلات حضور المقاولين الميدانية', 'موقع + سيلفي + صورة الفريق عند الحضور. الأشهر غير المعتمدة مالياً محمية.', 'checked_at', 24, True,
  keep="not exists (select 1 from public.contractor_month_approvals a where a.month = date_trunc('month', log_date)::date and a.approved_at is not null)", lock='تسجيلات شهر لم تعتمده المالية محمية')
for t, lbl, r in [('contractor_profiles', 'حسابات المقاولين', IDENT), ('contractor_workers', 'عمال المقاولين', REF), ('contractor_worker_attendance', 'حضور عمال المقاولين', FIN), ('contractor_daily_counts', 'الأعداد اليومية', FIN),
                  ('contractor_rates', 'أجور المقاولين', FIN), ('contractor_worker_wages', 'أجور العمال', FIN), ('contractor_month_approvals', 'اعتماد أشهر المقاولين', FIN)]:
    L('contractors', t, lbl, r)

# ───── sectors (مديرو القطاعات / الميدان)
for t, lbl, r in [('sector_manager_profiles', 'حسابات مديري القطاعات', IDENT), ('sector_workers', 'عمال القطاعات', REF), ('sector_vehicles', 'آليات القطاعات', REF), ('sector_attendance', 'حضور عمال القطاعات', FIN),
                  ('sector_photos', 'صور القطاعات', ARCH), ('sector_breakdowns', 'أعطال القطاعات', REC), ('sector_supply_requests', 'طلبات التجهيز', REC), ('sector_support_requests', 'طلبات الإسناد', REC), ('sector_support_assignments', 'تعيينات الإسناد', REC)]:
    L('sectors', t, lbl, r)

# ───── station
for t, lbl, r in [('ts_attendance_records', 'حضور المحطة التحويلية', FIN), ('ts_carrier_records', 'سجلات الناقلات', REC), ('ts_saksat_records', 'سجلات السكسات', REC), ('ts_trips_records', 'سجلات رحلات المحطة', REC),
                  ('ts_weight_records', 'سجلات الوزن', REC), ('ts_visit_weighing_steps', 'خطوات الوزن', REC), ('ts_violations', 'مخالفات الحد الأدنى', REC), ('ts_unit_capacities', 'سعات الوحدات', CFG),
                  ('station_destinations', 'وجهات المحطة', REF), ('station_external_drivers', 'السائقون الخارجيون', REF)]:
    L('station', t, lbl, r)

# ───── media
for t, lbl, r in [('media_submissions', 'إرسالات الإعلام', REC), ('media_submission_photos', 'صور الإرسالات', ARCH), ('media_designs', 'تصاميم التقارير', REC), ('media_design_sheets', 'صفحات التصاميم', REC),
                  ('media_design_photos', 'صور التصاميم', ARCH), ('media_design_templates', 'قوالب التصاميم', CFG), ('media_covers', 'أغلفة التقارير', CFG)]:
    L('media', t, lbl, r)

# ───── archive (الأرشيف البارد والاحتفاظ)
for t, lbl, r in [('cold_archive_settings', 'إعدادات الأرشيف البارد', CFG), ('cold_archive_packages', 'حزم الأرشيف البارد', PROOF), ('cold_archive_items', 'عناصر الأرشيف البارد', PROOF), ('cold_archive_copies', 'النسخ الموثَّقة', PROOF),
                  ('cold_archive_events', 'سجل أحداث الأرشيف البارد', PROOF), ('data_retention_policies', 'سياسات الاحتفاظ', CFG), ('data_retention_requests', 'طلبات حذف الاحتفاظ', PROOF), ('data_retention_events', 'سجل أحداث الاحتفاظ', PROOF)]:
    L('archive', t, lbl, r)

def q(s):
    return 'null' if s is None else "'" + s.replace("'", "''") + "'"

if __name__ == '__main__':
    keys = [r['key'] for r in rows]
    assert len(keys) == len(set(keys)), 'duplicate key'
    tables = [r['table'] for r in rows]
    assert len(tables) == len(set(tables)), 'duplicate table'
    out = []
    for r in rows:
        out.append(f"    ({q(r['key'])}, {q(r['portal'])}, {q(r['label'])}, {q(r['desc'])}, {q(r['table'])}, {q(r['tcol'])}, {q(r['keep'])}, {q(r['lock'])}, {'true' if r['deletable'] else 'false'}, {r['months']}, {'true' if r['export'] else 'false'})")
    print(',\n'.join(out))
    import sys
    print(f'-- {len(rows)} rows, {sum(1 for r in rows if r["deletable"])} deletable', file=sys.stderr)
