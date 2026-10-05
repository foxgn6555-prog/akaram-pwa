/**
 * تعريف البوابات: الألوان + العنوان + وحدات الشريط الجانبي لكل بوابة.
 * القاعدة: كل بوابة تعرض وحداتها هي فقط — والصلاحية النهائية دائماً RLS في DB.
 * التسميات عبر i18n (sidebar namespace) — المنصة عربية 100%.
 */
import {
  PORTAL_DEFINITIONS,
  PORTALS,
  type PortalDefinition,
  type PortalId,
} from '@lib/constants/portals.constants'
import type { IconName } from '@components/ui/Icon/Icon'

export interface PortalTheme {
  label: string
  icon: IconName
  colorVar: string
  /** CSS class للحاوية (ألوان البوابة من portals.css) */
  themeClass: string
}

export interface SidebarUnit {
  path: string
  labelKey: string
  icon: IconName
  /** مطابقة تامة للمسار (بدون بادئة) — للصفحة الرئيسية للوحدة */
  exact?: boolean
  /** صفحات الوحدة — تظهر متداخلة تحت الوحدة في الشريط */
  children?: readonly SidebarUnit[]
}

export const portalThemes: Record<PortalId, PortalTheme> = {
  [PORTALS.PUBLIC]: {
    label: 'البوابة العامة',
    icon: 'home',
    colorVar: '--portal-public',
    themeClass: 'portal-public',
  },
  [PORTALS.EMPLOYEE]: {
    label: 'بوابة المتعهد',
    icon: 'users',
    colorVar: '--portal-employee',
    themeClass: 'portal-employee',
  },
  [PORTALS.HR]: {
    label: 'الموارد البشرية',
    icon: 'users',
    colorVar: '--portal-hr',
    themeClass: 'portal-hr',
  },
  [PORTALS.MANAGER]: {
    label: 'مسؤول قسم',
    icon: 'layout-grid',
    colorVar: '--portal-manager',
    themeClass: 'portal-manager',
  },
  [PORTALS.FINANCE]: {
    label: 'الشؤون المالية',
    icon: 'wallet',
    colorVar: '--portal-finance',
    themeClass: 'portal-finance',
  },
  [PORTALS.IT]: {
    label: 'التطوير المركزية',
    icon: 'life-buoy',
    colorVar: '--portal-it',
    themeClass: 'portal-it',
  },
  [PORTALS.ADMIN]: {
    label: 'مدير مفوض',
    icon: 'shield',
    colorVar: '--portal-admin',
    themeClass: 'portal-admin',
  },
  // ── البوابات السبع الجديدة (فارغة — الوحدات تُضاف لاحقاً في PORTAL_UNITS) ──
  [PORTALS.FIELD_OPS]: {
    label: 'العمليات الميدانية',
    icon: 'truck',
    colorVar: '--portal-field-ops',
    themeClass: 'portal-field-ops',
  },
  [PORTALS.ADMIN_OPS]: {
    label: 'مسؤول القاطع',
    icon: 'clipboard',
    colorVar: '--portal-admin-ops',
    themeClass: 'portal-admin-ops',
  },
  [PORTALS.MAINTENANCE]: {
    label: 'الصيانة',
    icon: 'check-square',
    colorVar: '--portal-maintenance',
    themeClass: 'portal-maintenance',
  },
  [PORTALS.TRANSFER_STATION]: {
    label: 'المحطة التحويلية',
    icon: 'map-pin',
    colorVar: '--portal-transfer-station',
    themeClass: 'portal-transfer-station',
  },
  [PORTALS.EXECUTIVE]: {
    label: 'المدير التنفيذي',
    icon: 'shield',
    colorVar: '--portal-executive',
    themeClass: 'portal-executive',
  },
  [PORTALS.DEPUTY]: {
    label: 'معاون المدير المفوض',
    icon: 'user',
    colorVar: '--portal-deputy',
    themeClass: 'portal-deputy',
  },
  [PORTALS.OPS_ROOM]: {
    label: 'غرفة العمليات',
    icon: 'activity',
    colorVar: '--portal-ops-room',
    themeClass: 'portal-ops-room',
  },
  [PORTALS.COMPLAINTS]: {
    label: 'بوابة الشكاوى',
    icon: 'clipboard',
    colorVar: '--portal-complaints',
    themeClass: 'portal-complaints',
  },
  [PORTALS.MEDIA]: {
    label: 'بوابة الإعلام',
    icon: 'camera',
    colorVar: '--portal-media',
    themeClass: 'portal-media',
  },
  [PORTALS.CENTRAL_GARAGE]: {
    label: 'بوابة الكراج المركزي',
    icon: 'truck',
    colorVar: '--portal-central-garage',
    themeClass: 'portal-central-garage',
  },
}

/** وحدات كل بوابة — تظهر في شريطها الجانبي حصراً */
export const PORTAL_UNITS: Record<PortalId, readonly SidebarUnit[]> = {
  [PORTALS.PUBLIC]: [],

  // بوابة المتعهد (00158): ثلاث وحدات فقط
  [PORTALS.EMPLOYEE]: [
    { path: '/employee', labelKey: 'nav.dashboard', icon: 'home' },
    { path: '/employee/team', labelKey: 'nav.contractor_team', icon: 'users' },
    { path: '/employee/attendance', labelKey: 'nav.contractor_attendance', icon: 'check-square' },
  ],

  // بوابة الموارد البشرية
  // بوابة الموارد البشرية — الوحدات الست المعتمدة (البيانات فقط؛ التقني في بوابة التطوير المركزية)
  [PORTALS.HR]: [
    { path: '/hr', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/hr/recruitment', labelKey: 'nav.hr_recruitment', icon: 'user-plus' },
    { path: '/hr/employees', labelKey: 'nav.employees', icon: 'users' },
    { path: '/hr/attendance', labelKey: 'nav.attendance', icon: 'calendar' },
    { path: '/hr/leaves', labelKey: 'nav.hr_leaves', icon: 'clipboard' },
    { path: '/hr/biometric', labelKey: 'nav.hr_biometric_ledger', icon: 'fingerprint' },
    { path: '/hr/org', labelKey: 'nav.hr_org', icon: 'folder' },
  ],

  // بوابة مسؤول القسم (قواطع/شفتات)
  [PORTALS.MANAGER]: [
    { path: '/manager', labelKey: 'nav.dashboard', icon: 'home' },
    { path: '/manager/team', labelKey: 'nav.team', icon: 'users' },
    { path: '/manager/request', labelKey: 'nav.mgr_request', icon: 'send' },
    { path: '/manager/leaves', labelKey: 'nav.mgr_leaves', icon: 'clipboard' },
    { path: '/manager/breakdown', labelKey: 'nav.mgr_breakdown', icon: 'alert-triangle' },
    { path: '/manager/vehicle-trips', labelKey: 'nav.mgr_vehicle_trips', icon: 'truck' },
    { path: '/manager/support', labelKey: 'nav.mgr_support', icon: 'send' },
    { path: '/manager/gbs-containers', labelKey: 'nav.mgr_gbs_containers', icon: 'box' },
    { path: '/manager/complaints', labelKey: 'nav.mgr_complaints', icon: 'clipboard' },
    { path: '/manager/citizen-complaints', labelKey: 'nav.mgr_citizen_complaints', icon: 'life-buoy' },
    { path: '/manager/photos', labelKey: 'nav.mgr_photos', icon: 'photo' },
    { path: '/manager/archive', labelKey: 'nav.mgr_archive', icon: 'archive-box' },
  ],

  // بوابة المالية
  [PORTALS.FINANCE]: [
    { path: '/finance', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/finance/reports', labelKey: 'nav.exec_reports', icon: 'bar-chart' },
    { path: '/finance/payroll', labelKey: 'nav.payroll', icon: 'wallet' },
    { path: '/finance/purchases', labelKey: 'nav.maintenance_purchases', icon: 'shopping-cart' },
    { path: '/finance/budget', labelKey: 'nav.budget', icon: 'pie-chart' },
    { path: '/finance/announcements', labelKey: 'nav.announcements', icon: 'send' },
  ],

  // بوابة التطوير المركزية (تقنية المعلومات سابقاً) — مركز التحكم الكامل:
  // ① الرئيسية: إحصائيات حية وروابط سريعة
  // ② إدارة المستخدمين: حسابات + أدوار + هيكل تنظيمي
  // ③ قاعدة البيانات: مراقبة الجداول وتفاصيلها + أخطاء التطبيق
  [PORTALS.IT]: [
    {
      path: '/it',
      labelKey: 'nav.dashboard',
      icon: 'home',
      exact: true,
    },
    {
      // الوحدة → صفحتها المركزية (Hub): أيقونات صفحاتها + تقاريرها
      path: '/it/user-management',
      labelKey: 'nav.user_management',
      icon: 'users',
      children: [
        { path: '/it/user-management/list', labelKey: 'nav.users_list', icon: 'users' },
        { path: '/it/user-management/create', labelKey: 'nav.create_user', icon: 'user-plus' },
        { path: '/it/user-management/approval-chains', labelKey: 'nav.approval_chains', icon: 'flow' },
        { path: '/it/user-management/disclosure-types', labelKey: 'nav.disclosure_types', icon: 'file-text' },
        // الهيكل التنظيمي (الأقسام) يُدار حصراً من بوابة الموارد البشرية /hr/org — لا نسخة هنا لتفادي التداخل
      ],
    },
    {
      path: '/it/database',
      labelKey: 'nav.database',
      icon: 'database',
      children: [
        { path: '/it/database/tables', labelKey: 'nav.tables', icon: 'list' },
      ],
    },
    // ── الوحدات الجديدة (الجولة 4) ──
    {
      path: '/it/branches',
      labelKey: 'nav.branches',
      icon: 'layout-grid',
      exact: true,
    },
    {
      path: '/it/permissions',
      labelKey: 'nav.page_permissions',
      icon: 'shield',
      exact: true,
    },
    {
      path: '/it/integrations',
      labelKey: 'nav.integrations',
      icon: 'wifi-off',
      children: [
        { path: '/it/integrations/biometric', labelKey: 'nav.biometric', icon: 'fingerprint' },
        { path: '/it/integrations/biometric/unmatched', labelKey: 'nav.hr_unmatched_people', icon: 'alert-triangle' },
        { path: '/it/integrations/biometric/attendance-audit', labelKey: 'nav.hr_attendance_audit', icon: 'clipboard' },
        { path: '/it/integrations/gps', labelKey: 'nav.gps_tracking', icon: 'map-pin' },
        { path: '/it/integrations/hr-policy', labelKey: 'nav.hr_policy', icon: 'calendar' },
      ],
    },
    {
      path: '/it/notification-policies',
      labelKey: 'nav.notification_policies',
      icon: 'bell',
      exact: true,
    },
    {
      path: '/it/updates',
      labelKey: 'nav.updates',
      icon: 'refresh',
      exact: true,
    },
    {
      path: '/it/archive',
      labelKey: 'nav.archive',
      icon: 'database',
      exact: true,
      children: [
        {
          path: '/it/central-garage-approvals',
          labelKey: 'nav.garage_zero_approvals',
          icon: 'droplet',
        },
      ],
    },
    {
      path: '/it/console',
      labelKey: 'nav.console',
      icon: 'activity',
      exact: true,
    },
  ],

  // بوابة المدير المفوض — أعمال صافية (لا شيء تقني؛ التقني كله في /it)
  [PORTALS.ADMIN]: [
    { path: '/admin', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/admin/reports', labelKey: 'nav.exec_reports', icon: 'bar-chart' },
    { path: '/admin/announcements', labelKey: 'nav.announcements', icon: 'send' },
    { path: '/admin/approvals', labelKey: 'nav.approval_tasks', icon: 'check-square' },
    { path: '/admin/procedures', labelKey: 'nav.procedures', icon: 'clipboard' },
    { path: '/admin/disclosures', labelKey: 'nav.admin_disclosures', icon: 'file-text' },
  ],

  // ═══ البوابات السبع الجديدة — فارغة (صفحة رئيسية Placeholder فقط،
  //     والوحدات الفعلية تُضاف هنا عند بنائها) ═══
  // العمليات الميدانية (00161): تعلو مسؤولي القواطع — نطاقها كل القواطع، بلا أي بيانات مالية — 6 وحدات ثابتة
  [PORTALS.FIELD_OPS]: [
    { path: '/field-ops', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/field-ops/requests', labelKey: 'nav.sm_team_requests', icon: 'check-square' },
    { path: '/field-ops/sectors', labelKey: 'nav.fo_sectors', icon: 'users' },
    { path: '/field-ops/reports', labelKey: 'nav.sm_reports', icon: 'bar-chart' },
    { path: '/field-ops/notify', labelKey: 'nav.sm_notify', icon: 'send' },
    { path: '/field-ops/procedures', labelKey: 'nav.procedures', icon: 'clipboard' },
    { path: '/field-ops/my-requests', labelKey: 'nav.my_requests', icon: 'calendar' },
  ],
  // مسؤول القاطع (00160): مصمم للهاتف أولاً — 5 وحدات ثابتة
  [PORTALS.ADMIN_OPS]: [
    { path: '/admin-ops', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/admin-ops/requests', labelKey: 'nav.sm_team_requests', icon: 'check-square' },
    { path: '/admin-ops/reports', labelKey: 'nav.sm_reports', icon: 'bar-chart' },
    { path: '/admin-ops/notify', labelKey: 'nav.sm_notify', icon: 'send' },
    { path: '/admin-ops/procedures', labelKey: 'nav.procedures', icon: 'clipboard' },
    { path: '/admin-ops/my-requests', labelKey: 'nav.my_requests', icon: 'calendar' },
  ],
  [PORTALS.MAINTENANCE]: [
    { path: '/maintenance', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/maintenance/purchases', labelKey: 'nav.maintenance_purchases', icon: 'shopping-cart' },
    { path: '/maintenance/inventory', labelKey: 'nav.maintenance_inventory', icon: 'box' },
    { path: '/maintenance/vehicle-cases', labelKey: 'nav.maintenance_cases', icon: 'settings' },
    { path: '/maintenance/archive', labelKey: 'nav.maintenance_archive', icon: 'archive-box' },
  ],
  [PORTALS.TRANSFER_STATION]: [
    { path: '/transfer-station', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    {
      path: '/transfer-station/weights',
      labelKey: 'nav.ts_weights',
      icon: 'scale',
      children: [
        {
          path: '/transfer-station/weights/log',
          labelKey: 'nav.ts_weights_log',
          icon: 'clipboard',
        },
      ],
    },
    { path: '/transfer-station/saksat', labelKey: 'nav.ts_saksat', icon: 'send' },
    { path: '/transfer-station/trips', labelKey: 'nav.ts_trips', icon: 'truck' },
    { path: '/transfer-station/carrier', labelKey: 'nav.ts_carrier', icon: 'truck' },
    {
      path: '/transfer-station/vehicle-movements',
      labelKey: 'nav.ts_vehicle_movements',
      icon: 'truck',
    },
    { path: '/transfer-station/fines', labelKey: 'nav.ts_fines', icon: 'alert-triangle' },
    { path: '/transfer-station/archive', labelKey: 'nav.ts_archive', icon: 'archive-box' },
  ],
  [PORTALS.EXECUTIVE]: [
    { path: '/executive', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/executive/reports', labelKey: 'nav.exec_reports', icon: 'bar-chart' },
    { path: '/executive/announcements', labelKey: 'nav.announcements', icon: 'send' },
    { path: '/executive/approvals', labelKey: 'nav.approval_tasks', icon: 'check-square' },
    { path: '/executive/procedures', labelKey: 'nav.procedures', icon: 'clipboard' },
  ],
  [PORTALS.DEPUTY]: [
    { path: '/deputy', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/deputy/reports', labelKey: 'nav.exec_reports', icon: 'bar-chart' },
    { path: '/deputy/announcements', labelKey: 'nav.announcements', icon: 'send' },
    { path: '/deputy/statements', labelKey: 'nav.disc_statements', icon: 'file-text' },
    { path: '/deputy/sector-supplies', labelKey: 'nav.deputy_sector_supplies', icon: 'send' },
    { path: '/deputy/station-folders', labelKey: 'nav.deputy_station_folders', icon: 'folder' },
    { path: '/deputy/data-analysis', labelKey: 'nav.dep_data_analysis', icon: 'bar-chart' },
    { path: '/deputy/approvals', labelKey: 'nav.approval_tasks', icon: 'check-square' },
    { path: '/deputy/procedures', labelKey: 'nav.procedures', icon: 'clipboard' },
  ],
  [PORTALS.OPS_ROOM]: [
    { path: '/ops-room', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/ops-room/operations-data', labelKey: 'nav.ops_operations_data', icon: 'bar-chart' },
    { path: '/ops-room/station-daily', labelKey: 'nav.ops_station_daily', icon: 'scale' },
    {
      path: '/ops-room/vehicles-database',
      labelKey: 'nav.ops_vehicles_database',
      icon: 'database',
    },
    {
      path: '/ops-room/vehicles-archive',
      labelKey: 'nav.ops_vehicles_archive',
      icon: 'archive-box',
    },
    { path: '/ops-room/gps', labelKey: 'nav.ops_gps_data', icon: 'map-pin' },
    { path: '/ops-room/gbs-containers', labelKey: 'nav.ops_gbs_containers', icon: 'box' },
    { path: '/ops-room/attendance', labelKey: 'nav.ops_attendance', icon: 'check-square' },
    { path: '/ops-room/store', labelKey: 'nav.ops_store', icon: 'box' },
    { path: '/ops-room/campaigns', labelKey: 'nav.ops_campaigns', icon: 'camera' },
    { path: '/ops-room/citizen-complaints', labelKey: 'nav.ops_citizen_complaints', icon: 'life-buoy' },
    { path: '/ops-room/disclosures', labelKey: 'nav.ops_disclosures', icon: 'file-text' },
  ],

  // ═══ وحدة الكشوفات ═══
  [PORTALS.COMPLAINTS]: [
    { path: '/complaints', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    {
      path: '/complaints/karrada-sector',
      labelKey: 'nav.complaints_karrada',
      icon: 'map-pin',
      exact: true,
    },
    {
      path: '/complaints/zaafaraniya-sector',
      labelKey: 'nav.complaints_zaafaraniya',
      icon: 'map-pin',
      exact: true,
    },
    {
      path: '/complaints/assignment',
      labelKey: 'nav.complaints_assignment',
      icon: 'send',
      exact: true,
    },
    {
      path: '/complaints/processing',
      labelKey: 'nav.complaints_processing',
      icon: 'check-square',
      exact: true,
    },
    {
      path: '/complaints/templates',
      labelKey: 'nav.complaints_templates',
      icon: 'file-text',
      exact: true,
    },
    { path: '/complaints/data', labelKey: 'nav.complaints_data', icon: 'database', exact: true },
    {
      path: '/complaints/pages-contact-settings',
      labelKey: 'nav.complaints_pages_contact',
      icon: 'settings',
      exact: true,
    },
    {
      path: '/complaints/archive',
      labelKey: 'nav.complaints_archive',
      icon: 'archive-box',
      exact: true,
    },
    {
      path: '/complaints/technical-support',
      labelKey: 'nav.complaints_support',
      icon: 'life-buoy',
      exact: true,
    },
  ],

  // ═══ بوابة الإعلام ═══
  [PORTALS.MEDIA]: [
    { path: '/media', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    {
      path: '/media/karrada-sector',
      labelKey: 'nav.media_karrada_sector',
      icon: 'map-pin',
      exact: true,
    },
    {
      path: '/media/zaafaraniya-sector',
      labelKey: 'nav.media_zaafaraniya_sector',
      icon: 'map-pin',
      exact: true,
    },
    {
      path: '/media/zaafaraniya-folder',
      labelKey: 'nav.media_zaafaraniya_folder',
      icon: 'folder',
      exact: true,
    },
    {
      path: '/media/karrada-folder',
      labelKey: 'nav.media_karrada_folder',
      icon: 'folder',
      exact: true,
    },
    {
      path: '/media/design-templates',
      labelKey: 'nav.media_design_templates',
      icon: 'layout-grid',
      exact: true,
    },
    { path: '/media/archive', labelKey: 'nav.archive', icon: 'archive-box', exact: true },
  ],

  // ═══ بوابة الكراج المركزي ═══
  [PORTALS.CENTRAL_GARAGE]: [
    { path: '/central-garage', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    {
      path: '/central-garage/drivers-dispatch',
      labelKey: 'nav.garage_drivers_dispatch',
      icon: 'truck',
      exact: true,
    },
    {
      path: '/central-garage/maintenance-coordination',
      labelKey: 'nav.garage_maintenance_coordination',
      icon: 'settings',
      exact: true,
    },
    {
      path: '/central-garage/vehicles-database',
      labelKey: 'nav.garage_vehicles_database',
      icon: 'database',
      exact: true,
    },
    {
      path: '/central-garage/fuel',
      labelKey: 'nav.garage_fuel',
      icon: 'droplet',
      exact: true,
      children: [
        { path: '/central-garage/fuel/gas-oil', labelKey: 'nav.garage_gas_oil', icon: 'droplet' },
        {
          path: '/central-garage/fuel/hydraulic',
          labelKey: 'nav.garage_hydraulic',
          icon: 'droplet',
        },
        { path: '/central-garage/fuel/grease', labelKey: 'nav.garage_grease', icon: 'droplet' },
        { path: '/central-garage/fuel/c-oil', labelKey: 'nav.garage_c_oil', icon: 'droplet' },
      ],
    },
    {
      path: '/central-garage/reports',
      labelKey: 'nav.garage_reports',
      icon: 'bar-chart',
      exact: true,
    },
    { path: '/central-garage/archive', labelKey: 'nav.archive', icon: 'archive-box', exact: true },
  ],

}

export const portalsConfig = {
  definitions: PORTAL_DEFINITIONS,
  themes: portalThemes,
  units: PORTAL_UNITS,
} as const

export type { PortalDefinition, PortalId }
