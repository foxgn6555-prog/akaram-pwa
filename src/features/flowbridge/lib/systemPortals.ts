/**
 * مزامنة بوابات المنظومة الحقيقية إلى مصمم التدفقات (FlowBridge):
 *  · الكتالوج: البوابات الثابتة الـ13 (PORTAL_DEFINITIONS + portalThemes) + نظاما
 *    التكامل الخارجيان (بصمة ZKTeco · مزودو GPS) + البوابات الديناميكية النشطة (00024)
 *  · المخطط: عقدة لكل بوابة + تدفقات حقيقية معروفة في المنظومة (بصمة→HR · GPS→ميدان
 *    · طلب→اعتماد→رواتب) — بلا أي بيانات وهمية
 *  · الدمج غير مدمّر: ما ينشئه المستخدم يبقى، وما يزامَن يُحدَّث بمعرّفات ثابتة (idempotent)
 * دوال نقية بلا شبكة — قابلة للاختبار مباشرة (قانون 4).
 */
import { PORTAL_DEFINITIONS, PORTALS } from '@lib/constants/portals.constants'
import { portalThemes } from '@config/portals.config'
import type { DynamicPortal } from '@features/portals/types'
import type {
  CreateEventBindingInput,
  FlowBridgeFlow,
  FlowBridgeGraph,
  FlowBridgeNode,
  FlowBridgePortal,
} from '../types'

/** ألوان البوابات الحقيقية — mirror حرفي لـ src/styles/portals.css (--portal-color) */
const PORTAL_HEX: Readonly<Record<string, string>> = {
  [PORTALS.EMPLOYEE]: '#0f7cb0',
  [PORTALS.HR]: '#7c3aed',
  [PORTALS.MANAGER]: '#d97706',
  [PORTALS.FINANCE]: '#059669',
  [PORTALS.IT]: '#4f46e5',
  [PORTALS.ADMIN]: '#dc2626',
  [PORTALS.FIELD_OPS]: '#0d9488',
  [PORTALS.ADMIN_OPS]: '#475569',
  [PORTALS.MAINTENANCE]: '#ca8a04',
  [PORTALS.TRANSFER_STATION]: '#0891b2',
  [PORTALS.EXECUTIVE]: '#1e293b',
  [PORTALS.DEPUTY]: '#9f1239',
  [PORTALS.OPS_ROOM]: '#1d4ed8',
  [PORTALS.DISCLOSURES]: '#c2410c',
}

/** أيقونات البوابات — قريبة من روح أيقونات الشريط الجانبي لكل بوابة */
const PORTAL_EMOJI: Readonly<Record<string, string>> = {
  [PORTALS.EMPLOYEE]: '👤',
  [PORTALS.HR]: '👥',
  [PORTALS.MANAGER]: '🧭',
  [PORTALS.FINANCE]: '💰',
  [PORTALS.IT]: '🛟',
  [PORTALS.ADMIN]: '🛡️',
  [PORTALS.FIELD_OPS]: '🚚',
  [PORTALS.ADMIN_OPS]: '📋',
  [PORTALS.MAINTENANCE]: '🛠️',
  [PORTALS.TRANSFER_STATION]: '📍',
  [PORTALS.EXECUTIVE]: '💼',
  [PORTALS.DEPUTY]: '🤝',
  [PORTALS.OPS_ROOM]: '🖥️',
  [PORTALS.DISCLOSURES]: '📄',
}

/** أحداث/حقول حقيقية تعرفها كل بوابة (تظهر في بطاقة العقدة داخل المصمم) */
const PORTAL_EVENTS: Readonly<Record<string, readonly string[]>> = {
  [PORTALS.EMPLOYEE]: ['request.created', 'payslip.viewed'],
  [PORTALS.HR]: ['attendance.synced', 'payroll.created'],
  [PORTALS.MANAGER]: ['request.approved', 'request.rejected'],
  [PORTALS.FINANCE]: ['payroll.finalized', 'budget.updated'],
  [PORTALS.IT]: ['user.created', 'device.registered', 'branch.created'],
  [PORTALS.ADMIN]: ['audit.reviewed'],
}

export const SYSTEM_CATEGORY = 'بوابات المنظومة'
export const EXT_CATEGORY = 'تكاملات خارجية'
export const DYNAMIC_CATEGORY = 'بوابات ديناميكية'

/** نظاما التكامل الخارجيان — مصادر البيانات الحقيقية الدافعة للتدفقات */
const EXTERNAL_PORTALS: readonly FlowBridgePortal[] = [
  {
    id: 'sys:ext-biometric',
    label: 'ZKTeco ADMS',
    labelAr: 'أجهزة البصمة (ZKTeco)',
    icon: '🔐',
    color: '#0ea5e9',
    category: EXT_CATEGORY,
    enabled: true,
    events: ['attendance.push'],
    fields: ['attendance.employee_sn', 'attendance.timestamp'],
    endpoint: '/functions/v1/adms-receiver',
  },
  {
    id: 'sys:ext-gps',
    label: 'GPS Providers',
    labelAr: 'مزودو التتبع GPS',
    icon: '🛰️',
    color: '#f59e0b',
    category: EXT_CATEGORY,
    enabled: true,
    events: ['position.push'],
    fields: ['position.vehicle_id', 'position.lat', 'position.lng'],
    endpoint: '/functions/v1/gps-receiver',
  },
]

/**
 * بوابات المنظومة الثابتة الـ13 — mirror لـ PORTAL_DEFINITIONS + portalThemes.
 * id بالبادئة sys: لتفادي أي تصادم مع بوابات ينشئها المستخدم يدوياً.
 */
export const SYSTEM_PORTALS: readonly FlowBridgePortal[] = PORTAL_DEFINITIONS.map((def) => ({
  id: `sys:${def.id}`,
  label: def.id,
  labelAr: portalThemes[def.id].label,
  icon: PORTAL_EMOJI[def.id] ?? '🏢',
  color: PORTAL_HEX[def.id] ?? '#005f8d',
  category: SYSTEM_CATEGORY,
  enabled: true,
  events: [...(PORTAL_EVENTS[def.id] ?? [])],
  fields: [],
  endpoint: def.path,
}))

/** يبني الكتالوج الكامل: الخارجي + الثابت + الديناميكي النشط فقط */
export function buildSystemCatalog(dynamics: readonly DynamicPortal[]): FlowBridgePortal[] {
  const dynamicPortals: FlowBridgePortal[] = dynamics
    .filter((d) => d.is_active)
    .map((d) => ({
      id: `sys:dynamic:${d.slug}`,
      label: d.slug,
      labelAr: d.name,
      icon: '🗂️',
      color: d.color || '#005f8d',
      category: DYNAMIC_CATEGORY,
      enabled: true,
      events: [],
      fields: [],
      endpoint: `/dynamic/${d.slug}`,
    }))
  return [...EXTERNAL_PORTALS, ...SYSTEM_PORTALS, ...dynamicPortals]
}
/** عقدة المخطط لبوابة — id ثابت مشتق من معرف البوابة */
const nodeIdOf = (portalId: string): string => `node:${portalId}`

/** تخطيط شبكي حتمي: 4 أعمدة × صفوف 300px — بلا تداخل ولا عشوائية */
function layoutNode(portal: FlowBridgePortal, index: number): FlowBridgeNode {
  return {
    id: nodeIdOf(portal.id),
    portalId: portal.id,
    x: 140 + (index % 4) * 480,
    y: 140 + Math.floor(index / 4) * 300,
    isEnabled: true,
  }
}

/** تعريف تدفق حقيقي + ربطه بالحدث الفعلي الذي يحرّكه (00038) */
export interface SystemFlowDef {
  flow: FlowBridgeFlow
  binding: CreateEventBindingInput
}

/** التدفقات الحقيقية المعروفة في المنظومة (من بنية المشروع نفسها — لا تخمين) */
export const SYSTEM_FLOWS: readonly SystemFlowDef[] = [
  {
    flow: {
      id: 'flow:biometric-hr',
      name: 'مزامنة البصمة والحضور',
      direction: 'forward',
      sourceId: nodeIdOf('sys:ext-biometric'),
      targetId: nodeIdOf('sys:hr'),
      isActive: true,
      triggerEvent: 'attendance.push',
      actionEvent: 'attendance.synced',
      mappingRules: [],
      conditions: [],
      logic: 'AND',
      logs: [],
    },
    binding: { flow_id: 'flow:biometric-hr', source: 'integration', match_provider: 'biometric' },
  },
  {
    flow: {
      id: 'flow:gps-fieldops',
      name: 'مواقع الشاحنات الحية',
      direction: 'forward',
      sourceId: nodeIdOf('sys:ext-gps'),
      targetId: nodeIdOf('sys:field-ops'),
      isActive: true,
      triggerEvent: 'position.push',
      actionEvent: 'position.tracked',
      mappingRules: [],
      conditions: [],
      logic: 'AND',
      logs: [],
    },
    binding: { flow_id: 'flow:gps-fieldops', source: 'integration', match_provider: 'gps' },
  },
  {
    flow: {
      id: 'flow:requests-manager',
      name: 'تقديم طلبات الموظفين',
      direction: 'forward',
      sourceId: nodeIdOf('sys:employee'),
      targetId: nodeIdOf('sys:manager'),
      isActive: true,
      triggerEvent: 'request.created',
      actionEvent: 'request.review',
      mappingRules: [],
      conditions: [],
      logic: 'AND',
      logs: [],
    },
    binding: { flow_id: 'flow:requests-manager', source: 'audit', match_table: 'requests', match_operation: 'INSERT' },
  },
  {
    flow: {
      id: 'flow:approvals-hr',
      name: 'اعتماد الطلبات في الموارد البشرية',
      direction: 'forward',
      sourceId: nodeIdOf('sys:manager'),
      targetId: nodeIdOf('sys:hr'),
      isActive: true,
      triggerEvent: 'request.approved',
      actionEvent: 'request.processed',
      mappingRules: [],
      conditions: [],
      logic: 'AND',
      logs: [],
    },
    binding: { flow_id: 'flow:approvals-hr', source: 'audit', match_table: 'requests', match_operation: 'UPDATE' },
  },
  {
    flow: {
      id: 'flow:payroll-finance',
      name: 'اعتماد كشوف الرواتب',
      direction: 'forward',
      sourceId: nodeIdOf('sys:hr'),
      targetId: nodeIdOf('sys:finance'),
      isActive: true,
      triggerEvent: 'payroll.created',
      actionEvent: 'payroll.finalized',
      mappingRules: [],
      conditions: [],
      logic: 'AND',
      logs: [],
    },
    binding: { flow_id: 'flow:payroll-finance', source: 'audit', match_table: 'payrolls', match_operation: 'INSERT' },
  },
]

/** الروابط الافتراضية (تدفق ↔ حدث حقيقي) المشتقة من تعريفات التدفقات */
export function systemDefaultBindings(): CreateEventBindingInput[] {
  return SYSTEM_FLOWS.map((f) => f.binding)
}

/** يبني المخطط: عقدة لكل بوابة في الكتالوج + التدفقات التي عقدتاها موجودتان */
export function buildSystemGraph(catalog: readonly FlowBridgePortal[]): FlowBridgeGraph {
  const nodes = catalog.map((portal, i) => layoutNode(portal, i))
  const nodeIds = new Set(nodes.map((n) => n.id))
  const flows = SYSTEM_FLOWS.map((f) => f.flow).filter(
    (f) => nodeIds.has(f.sourceId) && nodeIds.has(f.targetId),
  )
  return { nodes, flows }
}
/** دمج غير مدمّر للكتالوج: بوابات المنظومة تُحدَّث بمكانها، وبوابات المستخدم تبقى */
export function mergeCatalog(
  existing: readonly FlowBridgePortal[],
  system: readonly FlowBridgePortal[],
): FlowBridgePortal[] {
  const systemById = new Map(system.map((p) => [p.id, p]))
  const merged = existing.map((p) => systemById.get(p.id) ?? p)
  const existingIds = new Set(existing.map((p) => p.id))
  for (const p of system) {
    if (!existingIds.has(p.id)) merged.push(p)
  }
  return merged
}

/** دمج غير مدمّر للمخطط: يضيف العقد/التدفقات الناقصة فقط — مواضع المستخدم محفوظة */
export function mergeGraph(existing: FlowBridgeGraph | undefined, system: FlowBridgeGraph): FlowBridgeGraph {
  const current: FlowBridgeGraph = {
    nodes: existing?.nodes ?? [],
    flows: existing?.flows ?? [],
  }
  const nodeIds = new Set(current.nodes.map((n) => n.id))
  const flowIds = new Set(current.flows.map((f) => f.id))
  return {
    nodes: [...current.nodes, ...system.nodes.filter((n) => !nodeIds.has(n.id))],
    flows: [...current.flows, ...system.flows.filter((f) => !flowIds.has(f.id))],
  }
}

/** فئات المزامنة — تُدمج في settings.categories لتظهر في صفحة البوابات داخل المصمم */
export const SYSTEM_CATEGORIES: readonly string[] = [SYSTEM_CATEGORY, EXT_CATEGORY, DYNAMIC_CATEGORY]

export function mergeCategories(existing: readonly string[] | undefined): string[] {
  const set = new Set(existing ?? [])
  for (const c of SYSTEM_CATEGORIES) set.add(c)
  return [...set]
}

/** مفتاح ربط للمقارنة (بدون id/created_at) — يمنع تكرار الروابط عند كل مزامنة */
function bindingKeyOf(b: {
  source: string
  match_table?: string | null
  match_operation?: string | null
  match_provider?: string | null
  match_status?: string | null
}): string {
  return b.source === 'audit'
    ? `audit|${b.match_table ?? ''}|${b.match_operation ?? ''}`
    : `integration|${b.match_provider ?? ''}|${b.match_status ?? ''}`
}

/** الروابط الافتراضية غير الموجودة بعد — تُنشأ مرة واحدة (idempotent) */
export function missingBindings(
  existing: readonly {
    flow_id: string
    source: string
    match_table: string | null
    match_operation: string | null
    match_provider: string | null
    match_status: string | null
  }[],
  defaults: readonly CreateEventBindingInput[],
): CreateEventBindingInput[] {
  const existingKeys = new Set(existing.map((b) => bindingKeyOf(b)))
  return defaults.filter((b) => !existingKeys.has(bindingKeyOf(b)))
}