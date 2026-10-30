/**
 * كتالوج الصلاحيات (00350) — المصدر الوحيد للحقيقة للواجهة وقاعدة البيانات معاً.
 *  · الوحدات تُشتق تلقائياً من PORTAL_UNITS (الشريط الجانبي): كل مسار = وحدة بمفتاح ثابت `portal.segment.segment`
 *    (مثال: '/hr/employees' ⇒ 'hr.employees'، والرئيسية '/hr' ⇒ 'hr'). لا قائمة يدوية تتقادم.
 *  · لكل وحدة إجراءاتها المنطبقة: «عرض» دائماً + ما يُعلن هنا في UNIT_ACTIONS.
 *  · الدور الثابت لكل بوابة (PORTAL_ROLE) = مرآة routes.config (اختبار عقد يضمن التطابق).
 *  · قاعدة البيانات تُزرع من هذا الملف عبر scripts/gen-permission-catalog.ts ⇒ جدول permission_units
 *    (اختبار عقد يضمن أن آخر ترحيل للكتالوج مطابق لهذا الملف).
 */
import { PORTALS, type PortalId } from '@lib/constants/portals.constants'
import { PORTAL_UNITS, type SidebarUnit } from './portals.config'
import type { Role } from '@lib/constants/roles.constants'

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'decide', 'execute', 'export', 'delete'] as const
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export const PERMISSION_ACTION_LABELS: Readonly<Record<PermissionAction, string>> = {
  view: 'عرض',
  create: 'إنشاء/إرسال',
  edit: 'تعديل',
  decide: 'اعتماد/قرار',
  execute: 'تنفيذ/تسليم',
  export: 'تصدير/طباعة',
  delete: 'حذف/أرشفة',
}

/** الدور الثابت الذي يفتح كل بوابة (super_admin يفتح الكل دائماً) — مرآة routes.config */
export const PORTAL_ROLE: Readonly<Record<Exclude<PortalId, 'public'>, Role>> = {
  [PORTALS.EMPLOYEE]: 'employee',
  [PORTALS.HR]: 'hr_officer',
  [PORTALS.MANAGER]: 'department_manager',
  [PORTALS.FINANCE]: 'finance_officer',
  [PORTALS.IT]: 'it_admin',
  [PORTALS.ADMIN]: 'super_admin',
  [PORTALS.FIELD_OPS]: 'field_ops',
  [PORTALS.ADMIN_OPS]: 'admin_ops',
  [PORTALS.MAINTENANCE]: 'maintenance',
  [PORTALS.TRANSFER_STATION]: 'transfer_station',
  [PORTALS.EXECUTIVE]: 'executive_director',
  [PORTALS.DEPUTY]: 'deputy_director',
  [PORTALS.OPS_ROOM]: 'ops_room',
  [PORTALS.COMPLAINTS]: 'complaints_officer',
  [PORTALS.MEDIA]: 'media_officer',
  [PORTALS.CENTRAL_GARAGE]: 'central_garage_officer',
  [PORTALS.FOLLOW_UP]: 'follow_up',
}

/**
 * الإجراءات الإضافية لكل وحدة (غير «عرض»). ما ليس هنا = وحدة عرض فقط.
 * المفاتيح يجب أن تطابق وحدات PORTAL_UNITS (اختبار عقد يرفض مفتاحاً يتيماً).
 */
export const UNIT_ACTIONS: Readonly<Record<string, readonly PermissionAction[]>> = {
  // المتعهد
  'employee.attendance': ['create'],
  'employee.photos': ['create'],
  // الموارد البشرية
  'hr.recruitment': ['create', 'execute'],
  'hr.hire-requests': ['execute'],
  'hr.employees': ['create', 'edit', 'export', 'execute'],
  'hr.attendance': ['edit', 'export'],
  'hr.attendance-monthly': ['export'],   // 00389-ب
  'hr.leaves': ['create', 'decide', 'export'],
  'hr.documents': ['edit', 'export'],   // 00389-أ
  'hr.biometric': ['export'],
  'hr.org': ['create', 'edit', 'delete'],
  'hr.behavior': ['export'],
  // مسؤول القسم
  'manager.request': ['create'],
  'manager.leaves': ['create', 'decide'],
  'manager.breakdown': ['create'],
  'manager.vehicle-trips': ['execute'],
  'manager.support': ['create'],
  'manager.complaints': ['create', 'execute'],
  'manager.citizen-complaints': ['execute'],
  'manager.photos': ['create'],
  // المالية
  'finance.reports': ['export'],
  'finance.payroll': ['edit', 'decide', 'execute', 'export'],
  'finance.contractor-wages': ['edit', 'decide', 'export'],
  'finance.advances': ['execute', 'export'],
  'finance.settlements': ['decide', 'execute', 'export'],
  'finance.letters': ['export'],
  'finance.expenses': ['create', 'edit', 'export'],
  'finance.purchases': ['decide'],
  'finance.budget': ['create', 'edit', 'decide'],
  'finance.announcements': ['create'],
  // التطوير المركزية
  'it.user-management.list': ['edit'],
  'it.user-management.create': ['create'],
  'it.user-management.approval-chains': ['edit', 'delete'],
  'it.user-management.disclosure-types': ['edit'],
  'it.user-management.maintenance-workshops': ['edit'],
  'it.approvals': ['decide'],
  'it.branches': ['create', 'edit'],
  'it.sectors': ['create', 'edit'],
  'it.permissions': ['edit'],
  'it.integrations.biometric': ['edit', 'execute'],
  'it.integrations.gps': ['edit', 'execute'],
  'it.integrations.hr-policy': ['edit'],
  'it.integrations.auto-deductions': ['edit'],
  'it.integrations.advances': ['edit'],
  'it.integrations.live-tracking': ['edit'],
  'it.notification-policies': ['edit', 'delete'],
  'it.updates': ['execute'],
  'it.archive': ['delete'],
  'it.central-garage-approvals': ['decide'],
  'it.cold-archive': ['create', 'decide', 'delete'],
  'it.data-retention': ['edit', 'delete'],
  // المدير المفوض
  'admin.announcements': ['create'],
  'admin.approvals': ['decide'],
  'admin.procedures': ['execute'],
  'admin.disclosures': ['decide'],
  // العمليات الميدانية
  'field-ops.requests': ['decide'],
  'field-ops.notify': ['create'],
  'field-ops.procedures': ['execute'],
  'field-ops.my-requests': ['create'],
  // مسؤول القاطع
  'admin-ops.requests': ['create', 'decide'],
  'admin-ops.notify': ['create'],
  'admin-ops.procedures': ['create', 'execute'],
  'admin-ops.disclosures': ['create', 'decide'],
  'admin-ops.contractors': ['decide'],
  'admin-ops.my-requests': ['create'],
  // الصيانة
  'maintenance.purchases': ['create'],
  'maintenance.inventory': ['create', 'edit'],
  'maintenance.vehicle-cases': ['create', 'decide', 'execute'],
  'maintenance.employees': ['edit'],
  'maintenance.requests': ['create'],
  'maintenance.procedures': ['create', 'execute'],
  'maintenance.archive': ['delete'],
  // المحطة التحويلية
  'transfer-station.weights': ['create', 'execute'],
  'transfer-station.weights.log': ['export'],
  'transfer-station.saksat': ['create', 'export'],
  'transfer-station.carrier': ['create', 'export'],
  'transfer-station.vehicle-movements': ['execute'],
  'transfer-station.employees': ['edit'],
  'transfer-station.requests': ['create'],
  'transfer-station.procedures': ['create', 'execute'],
  'transfer-station.disclosures': ['create'],
  'transfer-station.fines': ['create'],
  'transfer-station.archive': ['delete'],
  // المدير التنفيذي
  'executive.reports': ['export'],
  'executive.announcements': ['create'],
  'executive.approvals': ['decide'],
  'executive.procedures': ['execute'],
  'executive.receivables': ['create', 'edit', 'execute'],
  'executive.gps-payments': ['create', 'edit'],
  'executive.rewards': ['create'],
  'executive.letters': ['create'],
  'executive.events': ['create'],
  'executive.behavior': ['export'],
  // معاون المدير المفوض
  'deputy.reports': ['export'],
  'deputy.announcements': ['create'],
  'deputy.statements': ['decide'],
  'deputy.deductions': ['decide', 'edit'],
  'deputy.rented-tax': ['edit'],
  'deputy.overtime': ['decide', 'edit'],
  'deputy.sector-supplies': ['decide'],
  'deputy.rewards': ['create'],
  'deputy.letters': ['create'],
  'deputy.approvals': ['decide'],
  'deputy.procedures': ['execute'],
  'deputy.behavior': ['export'],
  // غرفة العمليات
  'ops-room.operations-data': ['edit', 'export'],
  'ops-room.station-daily': ['create', 'export'],
  'ops-room.station-fleet': ['create', 'edit'],
  'ops-room.station-outbound': ['execute'],
  'ops-room.vehicles-database': ['create', 'edit', 'export'],
  'ops-room.vehicles-archive': ['delete'],
  'ops-room.gps': ['edit', 'execute', 'export'],
  'ops-room.gbs-containers': ['edit'],
  'ops-room.attendance': ['edit', 'decide', 'export'],
  'ops-room.store': ['create', 'edit', 'execute'],
  'ops-room.campaigns': ['create', 'export'],
  'ops-room.citizen-complaints': ['execute', 'delete'],
  'ops-room.disclosures': ['create', 'decide'],
  'ops-room.advances': ['create'],
  'ops-room.contractor-headcounts': ['decide'],
  'ops-room.leaves': ['decide'],
  'ops-room.waste-map': ['export'],   // 00384/00385
  // الشكاوى
  'complaints.karrada-sector': ['create', 'edit'],
  'complaints.zaafaraniya-sector': ['create', 'edit'],
  'complaints.assignment': ['create', 'edit'],
  'complaints.processing': ['decide', 'execute'],
  'complaints.templates': ['edit'],
  'complaints.data': ['export'],
  'complaints.database': ['export'],
  'complaints.pages-contact-settings': ['edit'],
  'complaints.archive': ['execute', 'delete'],
  'complaints.technical-support': ['create'],
  // الإعلام
  'media.karrada-sector': ['create'],
  'media.zaafaraniya-sector': ['create'],
  'media.zaafaraniya-folder': ['create', 'export'],
  'media.karrada-folder': ['create', 'export'],
  'media.design-templates': ['create', 'edit', 'delete'],
  'media.archive': ['delete'],
  // الكراج المركزي
  'central-garage.drivers-dispatch': ['create', 'execute'],
  'central-garage.maintenance-coordination': ['create', 'decide', 'execute'],
  'central-garage.vehicles-database': ['create', 'edit'],
  'central-garage.fuel': ['create'],
  'central-garage.fuel.gas-oil': ['create'],
  'central-garage.fuel.hydraulic': ['create'],
  'central-garage.fuel.grease': ['create'],
  'central-garage.fuel.c-oil': ['create'],
  'central-garage.employees': ['edit'],
  'central-garage.requests': ['create'],
  'central-garage.procedures': ['create', 'execute'],
  'central-garage.disclosures': ['create'],
  'central-garage.reports': ['export'],
  'central-garage.archive': ['delete'],
  // المتابعة
  'follow-up.containers': ['edit'],
  'follow-up.workers': ['edit'],
}

export interface PermissionUnit {
  key: string
  portal: Exclude<PortalId, 'public'>
  path: string
  labelKey: string
  /** مفتاح الوحدة الأم (للصفحات المتداخلة) */
  parentKey: string | null
  actions: readonly PermissionAction[]
  sort: number
}

/** '/hr/employees' ⇒ 'hr.employees' · '/hr' ⇒ 'hr' */
export function unitKeyFromPath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean).join('.')
}

/** مفتاح الوحدة الأقرب لمسار فعلي (يدعم المسارات الفرعية مثل /hr/employees/123) */
export function unitKeyForRoute(pathname: string, keys: ReadonlySet<string>): string | null {
  const segs = pathname.replace(/^\/+/, '').split('/').filter(Boolean)
  for (let n = segs.length; n >= 1; n--) {
    const k = segs.slice(0, n).join('.')
    if (keys.has(k)) return k
  }
  return null
}

/** الكتالوج المسطّح بترتيب الشريط الجانبي */
export function buildPermissionCatalog(): PermissionUnit[] {
  const out: PermissionUnit[] = []
  let sort = 0
  const walk = (portal: Exclude<PortalId, 'public'>, units: readonly SidebarUnit[], parentKey: string | null): void => {
    for (const u of units) {
      const key = unitKeyFromPath(u.path)
      out.push({ key, portal, path: u.path, labelKey: u.labelKey, parentKey, actions: ['view', ...(UNIT_ACTIONS[key] ?? [])], sort: sort++ })
      if (u.children) walk(portal, u.children, key)
    }
  }
  for (const [portal, units] of Object.entries(PORTAL_UNITS) as [PortalId, readonly SidebarUnit[]][]) {
    if (portal === PORTALS.PUBLIC) continue
    walk(portal, units, null)
  }
  return out
}

export const PERMISSION_CATALOG: readonly PermissionUnit[] = buildPermissionCatalog()
export const PERMISSION_UNIT_KEYS: ReadonlySet<string> = new Set(PERMISSION_CATALOG.map((u) => u.key))

/**
 * 00350-B — ربط دوال الكتابة المحمية (00291) بوحدة+إجراء: الخادم يرفض الاستدعاء (PERMISSION_DENIED) إن لم يملك المستخدم الإجراء.
 * تُربط فقط الدوال التي يستدعيها دور واحد من وحدة واحدة؛ الدوال المشتركة بين أدوار (سلاسل الموافقات، المواطن، المتعهد…) تبقى على
 * فحوصاتها الأصلية وتُدرج في WRITE_BINDINGS_EXEMPT مع السبب — اختبار عقد يضمن أن كل دالة محمية إمّا مربوطة أو معفاة بسبب.
 */
export const WRITE_BINDINGS: Readonly<Record<string, readonly [unit: string, action: PermissionAction]>> = {
  // الموارد البشرية
  hr_employee_create: ['hr.employees', 'create'],
  hr_employee_terminate: ['hr.recruitment', 'execute'],
  hire_request_complete: ['hr.hire-requests', 'execute'],
  // غرفة العمليات
  supply_request_deliver: ['ops-room.store', 'execute'],
  advance_request_create: ['ops-room.advances', 'create'],
  ops_attendance_confirm: ['ops-room.attendance', 'decide'],
  ops_contractor_month_approve: ['ops-room.contractor-headcounts', 'decide'],
  // المالية
  advance_deliver: ['finance.advances', 'execute'],
  advance_settle_cash: ['finance.advances', 'execute'],
  finance_payroll_approve: ['finance.payroll', 'decide'],
  finance_payroll_adjust: ['finance.payroll', 'edit'],
  finance_payroll_reconcile: ['finance.payroll', 'execute'],
  finance_treasury_confirm: ['finance.budget', 'decide'],
  // التطوير المركزية
  cold_archive_package_create: ['it.cold-archive', 'create'],
  cold_archive_purge_request: ['it.cold-archive', 'delete'],
  cold_archive_purge_approve: ['it.cold-archive', 'decide'],
  cold_archive_purge_confirm: ['it.cold-archive', 'delete'],
  it_deduction_exemption_add: ['it.integrations.auto-deductions', 'edit'],
  garage_decide_tank_zero: ['it.central-garage-approvals', 'decide'],
  // الشكاوى
  complaint_approve_report: ['complaints.processing', 'decide'],
  complaint_create_item_from_inbox: ['complaints.assignment', 'create'],
  complaint_batch_create_items_from_inbox: ['complaints.assignment', 'create'],
  // مدير القاطع
  complaint_start_assignment_ticket: ['manager.complaints', 'execute'],
  complaint_complete_assignment_ticket: ['manager.complaints', 'execute'],
  sector_confirm_vehicle_arrival: ['manager.vehicle-trips', 'execute'],
  sector_confirm_vehicle_site_return: ['manager.vehicle-trips', 'execute'],
  sector_submit_breakdown: ['manager.breakdown', 'create'],
  sector_support_request_create: ['manager.support', 'create'],
  // الكراج المركزي
  garage_record_departure: ['central-garage.drivers-dispatch', 'execute'],
  garage_record_return: ['central-garage.drivers-dispatch', 'execute'],
  garage_record_shift_departure: ['central-garage.drivers-dispatch', 'execute'],
  garage_decide_maintenance_dispatch: ['central-garage.maintenance-coordination', 'decide'],
  // المحطة التحويلية
  station_confirm_vehicle_arrival: ['transfer-station.vehicle-movements', 'execute'],
  station_record_exit: ['transfer-station.vehicle-movements', 'execute'],
  // الصيانة
  maintenance_approve_readiness: ['maintenance.vehicle-cases', 'decide'],
  maintenance_complete_case: ['maintenance.vehicle-cases', 'execute'],
  maintenance_confirm_arrival: ['maintenance.vehicle-cases', 'execute'],
  maintenance_inventory_create: ['maintenance.inventory', 'create'],
  maintenance_purchase_create: ['maintenance.purchases', 'create'],
  // الإعلام
  media_template_create: ['media.design-templates', 'create'],
}

/** دوال محمية غير مربوطة بوحدة واحدة — السبب موثّق (تبقى على فحوصات الدور/السلسلة الأصلية) */
export const WRITE_BINDINGS_EXEMPT: Readonly<Record<string, string>> = {
  approval_decide_request: 'سلسلة موافقات — المعتمد يتحدد من السلسلة لا من وحدة',
  hr_leave_decide: 'سلسلة موافقات الإجازات (مدير/عمليات/موارد)',
  hr_leave_request: 'يستدعيها الموارد البشرية وغرفة العمليات ومدير القاطع',
  hr_leave_cancel: 'يستدعيها الموارد البشرية وغرفة العمليات ومسؤولو الكراج/المحطة/الصيانة',
  supply_request_decide: 'سلسلة موافقات',
  supply_request_create: 'يستدعيها مسؤولو عدة أقسام',
  termination_request_create: 'سلسلة موافقات — طلب من عدة بوابات',
  termination_request_decide: 'سلسلة موافقات',
  disclosure_submit: 'كشوفات من غرفة العمليات والكراج والمحطة ومديري القواطع (وحدة لكل بوابة)',
  disclosure_decide: 'سلسلة موافقات الكشوفات (المعاون)',
  advance_decide: 'سلسلة موافقات السلف',
  hire_request_create: 'طلب تعيين من الكراج/المحطة/الصيانة (00348)',
  hire_request_decide: 'سلسلة موافقات التعيين',
  hire_request_cancel: 'صاحب الطلب أو super_admin',
  cold_archive_purge_decide: 'سلسلة موافقات اختيارية',
  complaint_report_decide: 'سلسلة موافقات التقارير',
  complaint_decide_deletion: 'سلسلة موافقات الحذف',
  complaint_start_item: 'منفّذ الشكوى (عدة أدوار ميدانية)',
  complaint_complete_item: 'منفّذ الشكوى (عدة أدوار ميدانية)',
  exec_treasury_record: 'المعاون أو المدير المفوض',
  deputy_payroll_approve: 'سلسلة اعتماد الرواتب',
  ops_deduction_add: 'معطّلة (super_admin فقط)',
  contractor_checkin: 'حساب متعهد (ليس دوراً من بوابات الموظفين)',
  sector_submit_supply: 'يستدعيها مدير القاطع وغرفة العمليات',
  sector_supply_submit: 'مسار قديم (it_admin)',
  ts_record_weighing: 'المحطة أو غرفة العمليات',
  ts_complete_weighing: 'المحطة أو غرفة العمليات',
  media_design_create: 'يُنشأ من فولدر قاطع (وحدتان)',
  media_design_complete: 'يُنشأ من فولدر قاطع (وحدتان)',
  citizen_complaint_submit: 'مواطن',
  citizen_chat_request: 'مواطن',
}
