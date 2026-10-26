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
  'hr.recruitment': ['create'],
  'hr.hire-requests': ['execute'],
  'hr.employees': ['edit', 'export', 'execute'],
  'hr.attendance': ['edit', 'export'],
  'hr.leaves': ['create', 'decide', 'export'],
  'hr.biometric': ['export'],
  'hr.org': ['create', 'edit', 'delete'],
  'hr.behavior': ['export'],
  // مسؤول القسم
  'manager.request': ['create'],
  'manager.leaves': ['create', 'decide'],
  'manager.breakdown': ['create'],
  'manager.vehicle-trips': ['execute'],
  'manager.support': ['create'],
  'manager.complaints': ['create'],
  'manager.citizen-complaints': ['execute'],
  'manager.photos': ['create'],
  // المالية
  'finance.reports': ['export'],
  'finance.payroll': ['edit', 'decide', 'export'],
  'finance.contractor-wages': ['edit', 'decide', 'export'],
  'finance.advances': ['execute', 'export'],
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
  'maintenance.vehicle-cases': ['create', 'execute'],
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
  'executive.events': ['create'],
  'executive.behavior': ['export'],
  // معاون المدير المفوض
  'deputy.reports': ['export'],
  'deputy.announcements': ['create'],
  'deputy.statements': ['decide'],
  'deputy.deductions': ['decide', 'edit'],
  'deputy.rented-tax': ['edit'],
  'deputy.sector-supplies': ['decide'],
  'deputy.rewards': ['create'],
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
  // الشكاوى
  'complaints.karrada-sector': ['create', 'edit'],
  'complaints.zaafaraniya-sector': ['create', 'edit'],
  'complaints.assignment': ['edit'],
  'complaints.processing': ['execute'],
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
  'central-garage.maintenance-coordination': ['create', 'execute'],
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
