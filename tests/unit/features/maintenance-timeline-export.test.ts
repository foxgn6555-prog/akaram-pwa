import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ excel: vi.fn() }))
vi.mock('@lib/export/excel-report', () => ({ buildExcelReport: h.excel }))
import { exportMaintenanceTimeline } from '@features/vehicle-operations/export-maintenance'

describe('Excel التسلسل الزمني للصيانة', () => {
  beforeEach(() => h.excel.mockReset())
  it('يصدر أحداثاً عربية ومدة كل مرحلة حتى الحدث التالي', async () => {
    await exportMaintenanceTimeline('كابسة · DB-1', [
      {
        event_key: 'a',
        sequence_no: 1,
        actor_id: null,
        event_type: 'case',
        title: 'البلاغ',
        details: 'عطل',
        happened_at: '2026-09-12T08:00:00Z',
        status: 'diagnosing',
        progress: 10,
      },
      {
        event_key: 'b',
        sequence_no: 2,
        actor_id: null,
        event_type: 'maintenance_update',
        title: 'الإصلاح',
        details: null,
        happened_at: '2026-09-12T09:30:00Z',
        status: 'in_repair',
        progress: 40,
      },
    ])
    const report = h.excel.mock.calls[0]![0] as { rows: Record<string, unknown>[] }
    expect(report.rows[0]).toEqual(
      expect.objectContaining({
        type: 'بلاغ الصيانة',
        duration_minutes: 90,
        status: 'قيد التشخيص',
        progress: '10%',
      }),
    )
    expect(report.rows[1]).toEqual(
      expect.objectContaining({
        type: 'تحديث الصيانة',
        duration_minutes: 0,
        status: 'قيد الإصلاح',
        details: 'لا توجد تفاصيل إضافية',
      }),
    )
  })
})
