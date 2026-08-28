/** mirror لـ 00024_dynamic_portals.sql */
export interface DynamicPortal {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string
  color: string
  is_active: boolean
}

export interface PortalUnit {
  id: string
  portal_id: string
  unit_key: string
  label: string
  icon: string
  page_keys: string[]
  sort_order: number
}

export interface CreatePortalInput {
  name: string
  slug: string
  icon?: string
  color?: string
  description?: string
}

export interface AddUnitInput {
  portal_id: string
  unit_key: string
  label: string
  icon?: string
  page_keys?: string[]
  sort_order?: number
}

/** مكتبة الوحدات الجاهزة للتركيب في بوابة جديدة */
export interface UnitLibraryItem {
  unit_key: string
  label: string
  icon: string
  description: string
  page_keys: readonly string[]
}

/** المكتبة المرجعية — الوحدات الجاهزة للتركيب في أي بوابة ديناميكية */
export const UNIT_LIBRARY: readonly UnitLibraryItem[] = [
  { unit_key: 'tracking',  label: 'التتبع الميداني', icon: 'activity',  description: 'متابعة الشاحنات والمواقع الحية',        page_keys: ['p_ops.map', 'p_ops.routes'] },
  { unit_key: 'attendance', label: 'الحضور والانصراف', icon: 'calendar', description: 'سجلات البصمة والتأخير',              page_keys: ['p_x.attendance.log', 'p_x.attendance.report'] },
  { unit_key: 'reports',   label: 'التقارير',       icon: 'bar-chart', description: 'تقارير الوحدة المجمعة',               page_keys: ['p_x.reports.main'] },
  { unit_key: 'announcements', label: 'الإعلانات',  icon: 'bell',      description: 'تبليغات البوابة',                     page_keys: ['p_x.news.list'] },
] as const
