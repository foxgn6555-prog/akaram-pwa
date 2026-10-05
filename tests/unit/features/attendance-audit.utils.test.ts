import { describe, it, expect } from 'vitest'
import { auditDiff, auditValue, AUDIT_ACTION_LABELS } from '@portals/it/pages/Integrations/biometric/attendance-audit.utils'

describe('attendance audit utils (00178)', () => {
  it('values: Baghdad time with Latin digits, Arabic statuses, booleans', () => {
    expect(auditValue('check_in', '2026-10-05T12:53:00+00:00')).toBe('15:53')
    expect(auditValue('status', 'early_leave')).toBe('خروج مبكر')
    expect(auditValue('source', 'manual')).toBe('يدوي')
    expect(auditValue('waived', true)).toBe('نعم')
    expect(auditValue('late_minutes', null)).toBe('—')
  })
  it('diff: only tracked fields that changed, ignores timestamps/ids', () => {
    const before = { id: 'a', status: 'absent', check_in: null, check_out: null, late_minutes: 0, updated_at: '1', source: 'auto' }
    const after = { id: 'a', status: 'late', check_in: '2026-10-05T05:40:00+00:00', check_out: null, late_minutes: 25, updated_at: '2', source: 'manual' }
    const d = auditDiff(before, after)
    expect(d.map((x) => x.key)).toEqual(['check_in', 'status', 'late_minutes', 'source'])
    expect(d[0]).toMatchObject({ label: 'الدخول', from: '—', to: '08:40' })
    expect(d[1]).toMatchObject({ from: 'غائب', to: 'متأخر' })
  })
  it('diff: new row (no before) lists present fields; no after → empty', () => {
    expect(auditDiff(null, { status: 'present', check_in: null }).map((x) => x.key)).toEqual(['status'])
    expect(auditDiff({ status: 'present' }, null)).toEqual([])
  })
  it('every action has an Arabic label', () => {
    for (const k of ['edit', 'reset_auto', 'deduction_add', 'deduction_delete', 'waive', 'unwaive', 'export', 'approve'] as const) expect(AUDIT_ACTION_LABELS[k]).toBeTruthy()
  })
})
