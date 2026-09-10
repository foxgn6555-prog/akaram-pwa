/**
 * تعريف البوابات: الألوان + العنوان + وحدات الشريط الجانبي لكل بوابة.
 * القاعدة: كل بوابة تعرض وحداتها هي فقط — والصلاحية النهائية دائماً RLS في DB.
 * التسميات عبر i18n (sidebar namespace) — المنصة عربية 100%.
 */
import { PORTAL_DEFINITIONS, PORTALS, type PortalDefinition, type PortalId } from '@lib/constants/portals.constants'
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
  [PORTALS.PUBLIC]:   { label: 'البوابة العامة', icon: 'home', colorVar: '--portal-public', themeClass: 'portal-public' },
  [PORTALS.EMPLOYEE]: { label: 'بوابة الموظف', icon: 'user', colorVar: '--portal-employee', themeClass: 'portal-employee' },
  [PORTALS.HR]:       { label: 'الموارد البشرية', icon: 'users', colorVar: '--portal-hr', themeClass: 'portal-hr' },
  [PORTALS.MANAGER]:  { label: 'مسؤول قسم', icon: 'layout-grid', colorVar: '--portal-manager', themeClass: 'portal-manager' },
  [PORTALS.FINANCE]:  { label: 'الشؤون المالية', icon: 'wallet', colorVar: '--portal-finance', themeClass: 'portal-finance' },
  [PORTALS.IT]:       { label: 'التطوير المركزية', icon: 'life-buoy', colorVar: '--portal-it', themeClass: 'portal-it' },
  [PORTALS.ADMIN]:    { label: 'مدير مفوض', icon: 'shield', colorVar: '--portal-admin', themeClass: 'portal-admin' },
  // ── البوابات السبع الجديدة (فارغة — الوحدات تُضاف لاحقاً في PORTAL_UNITS) ──
  [PORTALS.FIELD_OPS]:        { label: 'العمليات الميدانية', icon: 'truck', colorVar: '--portal-field-ops', themeClass: 'portal-field-ops' },
  [PORTALS.ADMIN_OPS]:        { label: 'العمليات الإدارية', icon: 'clipboard', colorVar: '--portal-admin-ops', themeClass: 'portal-admin-ops' },
  [PORTALS.MAINTENANCE]:      { label: 'الصيانة', icon: 'check-square', colorVar: '--portal-maintenance', themeClass: 'portal-maintenance' },
  [PORTALS.TRANSFER_STATION]: { label: 'المحطة التحويلية', icon: 'map-pin', colorVar: '--portal-transfer-station', themeClass: 'portal-transfer-station' },
  [PORTALS.EXECUTIVE]:        { label: 'المدير التنفيذي', icon: 'shield', colorVar: '--portal-executive', themeClass: 'portal-executive' },
  [PORTALS.DEPUTY]:           { label: 'معاون المدير المفوض', icon: 'user', colorVar: '--portal-deputy', themeClass: 'portal-deputy' },
  [PORTALS.OPS_ROOM]:         { label: 'غرفة العمليات', icon: 'activity', colorVar: '--portal-ops-room', themeClass: 'portal-ops-room' },
  [PORTALS.DISCLOSURES]:      { label: 'وحدة الكشوفات', icon: 'file-text', colorVar: '--portal-disclosures', themeClass: 'portal-disclosures' },
  [PORTALS.COMPLAINTS]:       { label: 'بوابة الشكاوى', icon: 'clipboard', colorVar: '--portal-complaints', themeClass: 'portal-complaints' },
  [PORTALS.MEDIA]:            { label: 'بوابة الإعلام', icon: 'camera', colorVar: '--portal-media', themeClass: 'portal-media' },
  [PORTALS.CENTRAL_GARAGE]:   { label: 'بوابة الكراج المركزي', icon: 'truck', colorVar: '--portal-central-garage', themeClass: 'portal-central-garage' },
}

/** وحدات كل بوابة — تظهر في شريطها الجانبي حصراً */
export const PORTAL_UNITS: Record<PortalId, readonly SidebarUnit[]> = {
  [PORTALS.PUBLIC]: [],

  // بوابة الموظف
  [PORTALS.EMPLOYEE]: [
    { path: '/employee',             labelKey: 'nav.dashboard',    icon: 'home' },
    { path: '/employee/profile',     labelKey: 'nav.profile',      icon: 'user' },
    { path: '/employee/requests',    labelKey: 'nav.my_requests',  icon: 'file-text' },
    { path: '/employee/payslips',    labelKey: 'nav.my_payslips',  icon: 'wallet' },
    { path: '/employee/documents',   labelKey: 'nav.my_documents', icon: 'folder' },
    { path: '/employee/my-assets',   labelKey: 'nav.my_assets',    icon: 'box' },
  ],

  // بوابة الموارد البشرية
  [PORTALS.HR]: [
    { path: '/hr',            labelKey: 'nav.dashboard',  icon: 'home' },
    { path: '/hr/employees',  labelKey: 'nav.employees',  icon: 'users' },
    { path: '/hr/requests',   labelKey: 'nav.requests',   icon: 'clipboard' },
    { path: '/hr/attendance', labelKey: 'nav.attendance', icon: 'calendar' },
    { path: '/hr/payroll',    labelKey: 'nav.payroll',    icon: 'wallet' },
    { path: '/hr/reports',    labelKey: 'nav.reports',    icon: 'bar-chart' },
  ],

  // بوابة مسؤول القسم (قواطع/شفتات)
  [PORTALS.MANAGER]: [
    { path: '/manager',            labelKey: 'nav.dashboard',      icon: 'home' },
    { path: '/manager/team',       labelKey: 'nav.team',           icon: 'users' },
    { path: '/manager/request',    labelKey: 'nav.mgr_request',    icon: 'send' },
    { path: '/manager/attendance', labelKey: 'nav.mgr_attendance', icon: 'calendar' },
    { path: '/manager/breakdown',  labelKey: 'nav.mgr_breakdown',  icon: 'alert-triangle' },
    { path: '/manager/vehicle-trips', labelKey: 'nav.mgr_vehicle_trips', icon: 'truck' },
    { path: '/manager/complaints', labelKey: 'nav.mgr_complaints', icon: 'clipboard' },
    { path: '/manager/photos',     labelKey: 'nav.mgr_photos',     icon: 'photo' },
    { path: '/manager/archive',    labelKey: 'nav.mgr_archive',    icon: 'archive-box' },
  ],

  // بوابة المالية
  [PORTALS.FINANCE]: [
    { path: '/finance',                  labelKey: 'nav.dashboard',          icon: 'home' },
    { path: '/finance/budget',           labelKey: 'nav.budget',             icon: 'pie-chart' },
    { path: '/finance/payroll',          labelKey: 'nav.payroll',            icon: 'wallet' },
    { path: '/finance/reports',          labelKey: 'nav.financial_reports',  icon: 'bar-chart' },
    { path: '/finance/audit-report',     labelKey: 'nav.audit',              icon: 'file-text' },
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
        { path: '/it/user-management/list',        labelKey: 'nav.users_list',    icon: 'users' },
        { path: '/it/user-management/create',      labelKey: 'nav.create_user',   icon: 'user-plus' },
        { path: '/it/user-management/departments', labelKey: 'nav.org_structure', icon: 'layout-grid' },
      ],
    },
    {
      path: '/it/database',
      labelKey: 'nav.database',
      icon: 'database',
      children: [
        { path: '/it/database/tables',  labelKey: 'nav.tables',     icon: 'list' },
        { path: '/it/database/errors',  labelKey: 'nav.errors_log', icon: 'activity' },
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
        { path: '/it/integrations/biometric', labelKey: 'nav.biometric',    icon: 'fingerprint' },
        { path: '/it/integrations/gps',       labelKey: 'nav.gps_tracking', icon: 'map-pin' },
      ],
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
        { path: '/it/central-garage-approvals', labelKey: 'nav.garage_zero_approvals', icon: 'droplet' },
      ],
    },
    {
      // الجولة 5 — مصمم التدفقات (FlowBridge): عرض بصري حي لتكاملات المنظومة
      path: '/it/flowbridge',
      labelKey: 'nav.flowbridge',
      icon: 'flow',
      exact: true,
    },
  ],

  // بوابة الإدارة العليا
  [PORTALS.ADMIN]: [
    { path: '/admin',           labelKey: 'nav.dashboard', icon: 'home' },
    { path: '/admin/portals',   labelKey: 'nav.portals',   icon: 'layout-grid' },
    { path: '/admin/roles',     labelKey: 'nav.roles',     icon: 'shield' },
    { path: '/admin/settings',  labelKey: 'nav.settings',  icon: 'settings' },
    { path: '/admin/audit-logs', labelKey: 'nav.audit',    icon: 'file-text' },
    { path: '/admin/backup',    labelKey: 'nav.backup',    icon: 'database' },
  ],

  // ═══ البوابات السبع الجديدة — فارغة (صفحة رئيسية Placeholder فقط،
  //     والوحدات الفعلية تُضاف هنا عند بنائها) ═══
  [PORTALS.FIELD_OPS]: [
    { path: '/field-ops', labelKey: 'nav.dashboard', icon: 'home', exact: true },
  ],
  [PORTALS.ADMIN_OPS]: [
    { path: '/admin-ops', labelKey: 'nav.dashboard', icon: 'home', exact: true },
  ],
  [PORTALS.MAINTENANCE]: [
    { path: '/maintenance', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/maintenance/vehicle-cases', labelKey: 'nav.maintenance_cases', icon: 'settings' },
    { path: '/maintenance/inventory', labelKey: 'nav.maintenance_inventory', icon: 'box' },
  ],
  [PORTALS.TRANSFER_STATION]: [
    { path: '/transfer-station', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/transfer-station/weights', labelKey: 'nav.ts_weights', icon: 'scale',
      children: [
        { path: '/transfer-station/weights/log', labelKey: 'nav.ts_weights_log', icon: 'clipboard' },
      ] },
    { path: '/transfer-station/saksat', labelKey: 'nav.ts_saksat', icon: 'send' },
    { path: '/transfer-station/trips', labelKey: 'nav.ts_trips', icon: 'truck' },
    { path:'/transfer-station/vehicle-movements',labelKey:'nav.ts_vehicle_movements',icon:'truck' },
    { path: '/transfer-station/fines', labelKey: 'nav.ts_fines', icon: 'alert-triangle' },
    { path: '/transfer-station/archive', labelKey: 'nav.ts_archive', icon: 'archive-box' },
  ],
  [PORTALS.EXECUTIVE]: [
    { path: '/executive', labelKey: 'nav.dashboard', icon: 'home', exact: true },
  ],
  [PORTALS.DEPUTY]: [
    { path: '/deputy', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/deputy/statements', labelKey: 'nav.disc_statements', icon: 'file-text' },
    { path: '/deputy/sector-supplies', labelKey: 'nav.deputy_sector_supplies', icon: 'send' },
    { path: '/deputy/station-folders', labelKey: 'nav.deputy_station_folders', icon: 'folder' },
  ],
  [PORTALS.OPS_ROOM]: [
    { path: '/ops-room', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path:'/ops-room/operations-data',labelKey:'nav.ops_operations_data',icon:'bar-chart' },
  ],

  // ═══ وحدة الكشوفات ═══
  [PORTALS.COMPLAINTS]: [
    { path: '/complaints', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/complaints/karrada-sector', labelKey: 'nav.complaints_karrada', icon: 'map-pin', exact: true },
    { path: '/complaints/zaafaraniya-sector', labelKey: 'nav.complaints_zaafaraniya', icon: 'map-pin', exact: true },
    { path: '/complaints/assignment', labelKey: 'nav.complaints_assignment', icon: 'send', exact: true },
    { path: '/complaints/processing', labelKey: 'nav.complaints_processing', icon: 'check-square', exact: true },
    { path: '/complaints/templates', labelKey: 'nav.complaints_templates', icon: 'file-text', exact: true },
    { path: '/complaints/data', labelKey: 'nav.complaints_data', icon: 'database', exact: true },
    { path: '/complaints/pages-contact-settings', labelKey: 'nav.complaints_pages_contact', icon: 'settings', exact: true },
    { path: '/complaints/archive', labelKey: 'nav.complaints_archive', icon: 'archive-box', exact: true },
    { path: '/complaints/technical-support', labelKey: 'nav.complaints_support', icon: 'life-buoy', exact: true },
  ],

  // ═══ بوابة الإعلام ═══
  [PORTALS.MEDIA]: [
    { path: '/media', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/media/karrada-sector', labelKey: 'nav.media_karrada_sector', icon: 'map-pin', exact: true },
    { path: '/media/zaafaraniya-sector', labelKey: 'nav.media_zaafaraniya_sector', icon: 'map-pin', exact: true },
    { path: '/media/zaafaraniya-folder', labelKey: 'nav.media_zaafaraniya_folder', icon: 'folder', exact: true },
    { path: '/media/karrada-folder', labelKey: 'nav.media_karrada_folder', icon: 'folder', exact: true },
    { path: '/media/design-templates', labelKey: 'nav.media_design_templates', icon: 'layout-grid', exact: true },
    { path: '/media/archive', labelKey: 'nav.archive', icon: 'archive-box', exact: true },
  ],

  // ═══ بوابة الكراج المركزي ═══
  [PORTALS.CENTRAL_GARAGE]: [
    { path: '/central-garage', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    { path: '/central-garage/drivers-dispatch', labelKey: 'nav.garage_drivers_dispatch', icon: 'truck', exact: true },
    { path: '/central-garage/vehicles-database', labelKey: 'nav.garage_vehicles_database', icon: 'database', exact: true },
    {
      path: '/central-garage/fuel', labelKey: 'nav.garage_fuel', icon: 'droplet', exact: true,
      children: [
        { path: '/central-garage/fuel/gas-oil', labelKey: 'nav.garage_gas_oil', icon: 'droplet' },
        { path: '/central-garage/fuel/hydraulic', labelKey: 'nav.garage_hydraulic', icon: 'droplet' },
        { path: '/central-garage/fuel/grease', labelKey: 'nav.garage_grease', icon: 'droplet' },
        { path: '/central-garage/fuel/c-oil', labelKey: 'nav.garage_c_oil', icon: 'droplet' },
      ],
    },
    { path: '/central-garage/reports', labelKey: 'nav.garage_reports', icon: 'bar-chart', exact: true },
    { path: '/central-garage/archive', labelKey: 'nav.archive', icon: 'archive-box', exact: true },
  ],

  [PORTALS.DISCLOSURES]: [
    { path: '/disclosures', labelKey: 'nav.dashboard', icon: 'home', exact: true },
    {
      path: '/disclosures/statements', labelKey: 'nav.disc_statements', icon: 'file-text',
      children: [
        { path: '/disclosures/statements/new', labelKey: 'nav.disc_new', icon: 'clipboard' },
      ],
    },
    { path: '/disclosures/reports', labelKey: 'nav.disc_reports', icon: 'bar-chart' },
    { path: '/disclosures/archive', labelKey: 'nav.disc_archive', icon: 'archive-box' },
  ],
}

export const portalsConfig = {
  definitions: PORTAL_DEFINITIONS,
  themes: portalThemes,
  units: PORTAL_UNITS,
} as const

export type { PortalDefinition, PortalId }
