/** mapEventToPulses (00038): تحويل حدث حقيقي إلى نبضات مطابقة عبر الروابط */
import { describe, it, expect } from 'vitest'
import { mapEventToPulses } from '@features/flowbridge/lib/mapEventToPulses'
import type { FlowBridgeEventBinding, FlowBridgeEventRow } from '@features/flowbridge/types'

function auditEvent(overrides: Partial<FlowBridgeEventRow> = {}): FlowBridgeEventRow {
  return {
    id: 1,
    source: 'audit',
    table_name: 'requests',
    operation: 'INSERT',
    provider: null,
    status: null,
    actor_role: 'employee',
    occurred_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function integrationEvent(overrides: Partial<FlowBridgeEventRow> = {}): FlowBridgeEventRow {
  return {
    id: 2,
    source: 'integration',
    table_name: null,
    operation: null,
    provider: 'biometric',
    status: 'success',
    actor_role: null,
    occurred_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function auditBinding(overrides: Partial<FlowBridgeEventBinding> = {}): FlowBridgeEventBinding {
  return {
    id: 'b-1',
    flow_id: 'f-1',
    source: 'audit',
    match_table: 'requests',
    match_operation: null,
    match_provider: null,
    match_status: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('mapEventToPulses', () => {
  it('يطابق حدث audit بربط بلا شرط عملية محدد', () => {
    const pulses = mapEventToPulses(auditEvent(), [auditBinding()])
    expect(pulses).toEqual([{ flowId: 'f-1', status: 'success', at: '2026-01-01T00:00:00Z', source: 'audit' }])
  })

  it('لا يطابق حدث audit إن اختلف اسم الجدول', () => {
    const pulses = mapEventToPulses(auditEvent({ table_name: 'employees' }), [auditBinding()])
    expect(pulses).toEqual([])
  })

  it('لا يطابق حدث audit إن حُدد match_operation ولم يطابق', () => {
    const pulses = mapEventToPulses(
      auditEvent({ operation: 'DELETE' }),
      [auditBinding({ match_operation: 'INSERT' })],
    )
    expect(pulses).toEqual([])
  })

  it('يطابق حدث audit عند تطابق match_operation', () => {
    const pulses = mapEventToPulses(
      auditEvent({ operation: 'UPDATE' }),
      [auditBinding({ match_operation: 'UPDATE' })],
    )
    expect(pulses).toHaveLength(1)
  })

  it('يطابق حدث integration بربط المزود والحالة', () => {
    const pulses = mapEventToPulses(integrationEvent(), [
      { id: 'b-2', flow_id: 'f-2', source: 'integration', match_table: null, match_operation: null, match_provider: 'biometric', match_status: null, created_at: 'x' },
    ])
    expect(pulses).toEqual([{ flowId: 'f-2', status: 'success', at: '2026-01-01T00:00:00Z', source: 'integration' }])
  })

  it('يحوّل status=error إلى pulse status=failed', () => {
    const pulses = mapEventToPulses(integrationEvent({ status: 'error' }), [
      { id: 'b-3', flow_id: 'f-3', source: 'integration', match_table: null, match_operation: null, match_provider: 'biometric', match_status: null, created_at: 'x' },
    ])
    expect(pulses[0]?.status).toBe('failed')
  })

  it('يحوّل status=rejected إلى pulse status=skipped', () => {
    const pulses = mapEventToPulses(integrationEvent({ status: 'rejected' }), [
      { id: 'b-4', flow_id: 'f-4', source: 'integration', match_table: null, match_operation: null, match_provider: 'biometric', match_status: null, created_at: 'x' },
    ])
    expect(pulses[0]?.status).toBe('skipped')
  })

  it('لا يخلط بين مصدري audit و integration', () => {
    const pulses = mapEventToPulses(auditEvent(), [
      { id: 'b-5', flow_id: 'f-5', source: 'integration', match_table: null, match_operation: null, match_provider: 'biometric', match_status: null, created_at: 'x' },
    ])
    expect(pulses).toEqual([])
  })

  it('يعيد عدة نبضات إن طابق أكثر من ربط نفس الحدث', () => {
    const pulses = mapEventToPulses(auditEvent(), [
      auditBinding({ id: 'b-1', flow_id: 'f-1' }),
      auditBinding({ id: 'b-2', flow_id: 'f-2' }),
    ])
    expect(pulses.map((p) => p.flowId).sort()).toEqual(['f-1', 'f-2'])
  })

  it('لا شيء يطابق عند قائمة روابط فارغة', () => {
    expect(mapEventToPulses(auditEvent(), [])).toEqual([])
  })
})
