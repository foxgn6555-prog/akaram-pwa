/** خريطة الأدوار → البوابات — mirror لـ docs/portals.md */
export const PORTALS = {
  PUBLIC: 'public',
  EMPLOYEE: 'employee',
  HR: 'hr',
  MANAGER: 'manager',
  FINANCE: 'finance',
  IT: 'it',
  ADMIN: 'admin',
  FIELD_OPS: 'field-ops',
  ADMIN_OPS: 'admin-ops',
  MAINTENANCE: 'maintenance',
  TRANSFER_STATION: 'transfer-station',
  EXECUTIVE: 'executive',
  DEPUTY: 'deputy',
  OPS_ROOM: 'ops-room',
  DISCLOSURES: 'disclosures',
} as const

export type PortalId = (typeof PORTALS)[keyof typeof PORTALS]

export interface PortalDefinition {
  id: PortalId
  path: string
  /** الأدوار المخوّلة بدخول هذه البوابة */
  allowedRoles: readonly string[]
  /** لون البوابة (متغير CSS في styles/portals.css) */
  colorVar: string
}

export const PORTAL_DEFINITIONS: readonly PortalDefinition[] = [
  { id: PORTALS.EMPLOYEE, path: '/employee', allowedRoles: ['employee'], colorVar: '--portal-employee' },
  { id: PORTALS.HR,       path: '/hr',       allowedRoles: ['hr_officer'], colorVar: '--portal-hr' },
  { id: PORTALS.MANAGER,  path: '/manager',  allowedRoles: ['department_manager'], colorVar: '--portal-manager' },
  { id: PORTALS.FINANCE,  path: '/finance',  allowedRoles: ['finance_officer'], colorVar: '--portal-finance' },
  { id: PORTALS.IT,       path: '/it',       allowedRoles: ['it_admin'], colorVar: '--portal-it' },
  { id: PORTALS.ADMIN,    path: '/admin',    allowedRoles: ['super_admin'], colorVar: '--portal-admin' },
  // ── البوابات السبع الجديدة (هيكل جاهز — الوحدات تُبنى لاحقاً) ──
  { id: PORTALS.FIELD_OPS,       path: '/field-ops',       allowedRoles: ['field_ops'], colorVar: '--portal-field-ops' },
  { id: PORTALS.ADMIN_OPS,       path: '/admin-ops',       allowedRoles: ['admin_ops'], colorVar: '--portal-admin-ops' },
  { id: PORTALS.MAINTENANCE,     path: '/maintenance',     allowedRoles: ['maintenance'], colorVar: '--portal-maintenance' },
  { id: PORTALS.TRANSFER_STATION, path: '/transfer-station', allowedRoles: ['transfer_station'], colorVar: '--portal-transfer-station' },
  { id: PORTALS.EXECUTIVE,       path: '/executive',       allowedRoles: ['executive_director'], colorVar: '--portal-executive' },
  { id: PORTALS.DEPUTY,          path: '/deputy',          allowedRoles: ['deputy_director'], colorVar: '--portal-deputy' },
  { id: PORTALS.OPS_ROOM,        path: '/ops-room',        allowedRoles: ['ops_room'], colorVar: '--portal-ops-room' },
  { id: PORTALS.DISCLOSURES, path: '/disclosures', allowedRoles: ['disclosures_officer'], colorVar: '--portal-disclosures' },
] as const

/** كل البوابات التي يملك المستخدم صلاحية الدخول إليها بحسب أدواره */
export function accessiblePortals(roles: readonly string[]): PortalDefinition[] {
  // مدير النظام (super_admin) يصل لكل البوابات — يراها كلها في المبدّل
  if (roles.includes('super_admin')) {
    return [...PORTAL_DEFINITIONS]
  }
  return PORTAL_DEFINITIONS.filter((p) => p.allowedRoles.some((r) => roles.includes(r)))
}
