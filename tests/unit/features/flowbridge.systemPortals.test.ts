/**
 * مزامنة بوابات المنظومة إلى FlowBridge:
 * الكتالوج الحقيقي · المخطط والتدفقات · الدمج غير المدمّر (idempotent) · الروابط الناقصة
 */
import { describe, it, expect } from 'vitest'
import { PORTAL_DEFINITIONS } from '@lib/constants/portals.constants'
import {
  buildSystemCatalog,
  buildSystemGraph,
  mergeCatalog,
  mergeGraph,
  mergeCategories,
  missingBindings,
  systemDefaultBindings,
  SYSTEM_PORTALS,
  SYSTEM_FLOWS,
} from '@features/flowbridge/lib/systemPortals'
import type { FlowBridgePortal, FlowBridgeGraph, FlowBridgeNode } from '@features/flowbridge/types'
import type { DynamicPortal } from '@features/portals/types'

function dynamicPortal(overrides: Partial<DynamicPortal> = {}): DynamicPortal {
  return {
    id: 'dp-1',
    slug: 'warehouse',
    name: 'بوابة المستودع',
    description: null,
    icon: 'layout-grid',
    color: '#123456',
    is_active: true,
    ...overrides,
  }
}

describe('كتالوج بوابات المنظومة', () => {
  it('المدخل الثابت يطابق كل البوابات الحقيقية بمعرّفات sys: وبألوانها', () => {
    expect(SYSTEM_PORTALS).toHaveLength(PORTAL_DEFINITIONS.length)
    expect(SYSTEM_PORTALS.map((p) => p.id)).toContain('sys:it')
    expect(SYSTEM_PORTALS.map((p) => p.id)).toContain('sys:field-ops')
    const itPortal = SYSTEM_PORTALS.find((p) => p.id === 'sys:it')
    expect(itPortal?.labelAr).toBe('التطوير المركزية')
    expect(itPortal?.color).toBe('#4f46e5')
  })

  it('buildSystemCatalog يشمل نظامي التكامل الخارجيين + الديناميكي النشط فقط', () => {
    const catalog = buildSystemCatalog([
      dynamicPortal(),
      dynamicPortal({ id: 'dp-2', slug: 'closed', name: 'موقوفة', is_active: false }),
    ])
    const ids = catalog.map((p) => p.id)
    expect(ids).toContain('sys:ext-biometric')
    expect(ids).toContain('sys:ext-gps')
    expect(ids).toContain('sys:dynamic:warehouse')
    expect(ids).not.toContain('sys:dynamic:closed')
    // بوابات ثابتة + نظاما التكامل الخارجيان + بوابة ديناميكية نشطة
    expect(catalog).toHaveLength(PORTAL_DEFINITIONS.length + 3)
  })

  it('البوابة الديناميكية تحمل اسمها ولونها الحقيقيين', () => {
    const catalog = buildSystemCatalog([dynamicPortal()])
    const dyn = catalog.find((p) => p.id === 'sys:dynamic:warehouse')
    expect(dyn?.labelAr).toBe('بوابة المستودع')
    expect(dyn?.color).toBe('#123456')
  })
})

describe('مخطط المنظومة والتدفقات الحقيقية', () => {
  const catalog = buildSystemCatalog([])
  const graph = buildSystemGraph(catalog)

  it('عقدة لكل بوابة في الكتالوج بلا مواضع متداخلة', () => {
    expect(graph.nodes).toHaveLength(catalog.length)
    const positions = new Set(graph.nodes.map((n) => `${n.x},${n.y}`))
    expect(positions.size).toBe(graph.nodes.length)
  })

  it('كل تدفق حقيقي عقدتاه موجودتان في المخطط', () => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    expect(SYSTEM_FLOWS.length).toBeGreaterThanOrEqual(5)
    for (const def of SYSTEM_FLOWS) {
      expect(nodeIds.has(def.flow.sourceId), def.flow.id).toBe(true)
      expect(nodeIds.has(def.flow.targetId), def.flow.id).toBe(true)
    }
  })

  it('التدفقات تشمل الخطوط الحقيقية: بصمة→HR · GPS→الميدان · طلب→اعتماد→رواتب', () => {
    const ids = graph.flows.map((f) => f.id)
    expect(ids).toContain('flow:biometric-hr')
    expect(ids).toContain('flow:gps-fieldops')
    expect(ids).toContain('flow:requests-manager')
    expect(ids).toContain('flow:approvals-hr')
    expect(ids).toContain('flow:payroll-finance')
  })

  it('لكل تدفق حقيقي ربط حدث مطابق بنفس المعرّف', () => {
    for (const def of SYSTEM_FLOWS) {
      expect(def.binding.flow_id).toBe(def.flow.id)
    }
    expect(systemDefaultBindings()).toHaveLength(SYSTEM_FLOWS.length)
  })
})
describe('الدمج غير المدمّر', () => {
  const system = buildSystemCatalog([])
  const systemGraph = buildSystemGraph(system)

  it('mergeCatalog يضيف بوابات المنظومة ويحفظ بوابة المستخدم', () => {
    const userPortal: FlowBridgePortal = { id: 'p-mine', label: 'مخصص', labelAr: 'بوابتي' }
    const merged = mergeCatalog([userPortal], system)
    expect(merged.find((p) => p.id === 'p-mine')).toEqual(userPortal)
    expect(merged.find((p) => p.id === 'sys:it')).toBeTruthy()
    expect(merged).toHaveLength(system.length + 1)
  })

  it('mergeCatalog idempotent: المزامنة مرتين لا تكرر شيئاً', () => {
    const once = mergeCatalog([], system)
    const twice = mergeCatalog(once, system)
    expect(twice).toHaveLength(system.length)
    expect(new Set(twice.map((p) => p.id)).size).toBe(system.length)
  })

  it('mergeGraph يضيف العقد الناقصة ويحفظ موضع العقدة التي حرّكها المستخدم', () => {
    const base = systemGraph.nodes[0]!
    const movedNode: FlowBridgeNode = { ...base, x: 999, y: 888 }
    const userGraph: FlowBridgeGraph = { nodes: [movedNode], flows: [] }
    const merged = mergeGraph(userGraph, systemGraph)
    expect(merged.nodes.find((n) => n.id === movedNode.id)?.x).toBe(999)
    expect(merged.nodes).toHaveLength(systemGraph.nodes.length)
    expect(merged.flows).toHaveLength(systemGraph.flows.length)
  })

  it('mergeGraph idempotent: مزامنة على مخطط مكتمل لا تغير شيئاً', () => {
    const once = mergeGraph(undefined, systemGraph)
    const twice = mergeGraph(once, systemGraph)
    expect(twice.nodes).toHaveLength(once.nodes.length)
    expect(twice.flows).toHaveLength(once.flows.length)
  })

  it('mergeCategories يضيف فئات المنظومة ويحفظ فئات المستخدم', () => {
    const merged = mergeCategories(['عام', 'مخصص'])
    expect(merged).toContain('عام')
    expect(merged).toContain('مخصص')
    expect(merged).toContain('بوابات المنظومة')
    expect(mergeCategories(['بوابات المنظومة'])).toHaveLength(3)
  })
})

describe('روابط الأحداث الافتراضية', () => {
  const defaults = systemDefaultBindings()

  it('قائمة روابط فارغة → كل الروابط الافتراضية ناقصة', () => {
    expect(missingBindings([], defaults)).toHaveLength(defaults.length)
  })

  it('رابط موجود مطابق → لا يُنشأ ثانية (idempotent)', () => {
    const existing = defaults.map((b, i) => ({
      id: `b-${i}`,
      flow_id: b.flow_id,
      source: b.source,
      match_table: b.source === 'audit' ? b.match_table : null,
      match_operation: b.source === 'audit' ? (b.match_operation ?? null) : null,
      match_provider: b.source === 'integration' ? b.match_provider : null,
      match_status: b.source === 'integration' ? (b.match_status ?? null) : null,
      created_at: '2026-01-01',
    }))
    expect(missingBindings(existing, defaults)).toHaveLength(0)
  })

  it('رابط بنفس المفتاح لكن flow_id مختلف → يُعد موجوداً (المطابقة بالحدث لا بالتدفق)', () => {
    const existing = [
      {
        id: 'b-x',
        flow_id: 'user-flow-1',
        source: 'audit',
        match_table: 'requests',
        match_operation: 'INSERT',
        match_provider: null,
        match_status: null,
        created_at: '2026-01-01',
      },
    ]
    const todo = missingBindings(existing, defaults)
    expect(todo.map((b) => b.flow_id)).not.toContain('flow:requests-manager')
    // والبقية ما زالت ناقصة
    expect(todo).toHaveLength(defaults.length - 1)
  })
})
