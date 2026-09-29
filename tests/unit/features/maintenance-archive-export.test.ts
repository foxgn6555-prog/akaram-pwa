import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ excel: vi.fn() }))
vi.mock('@lib/export/excel-report', () => ({ buildExcelReport: h.excel }))
import { archiveSummary, exportMaintenanceArchive } from '@features/vehicle-operations/export-archive'
import type { MaintenanceArchiveEntry } from '@sdk/vehicle-operations.sdk'

const row = (over: Partial<MaintenanceArchiveEntry> = {}): MaintenanceArchiveEntry => ({
  case_id: 'c1', vehicle_name: 'كابسة', db_number: 'DB-1', driver_name: 'علي', shift: 'morning', area_name: 'الجادرية', sector_id: 4, manager_name: 'مسؤول',
  fault_type: 'هيدروليك', priority: 'urgent', reported_at: '2026-09-09T08:00:00Z', arrived_at: '2026-09-09T08:10:00Z', ready_at: '2026-09-09T09:00:00Z',
  readiness_approved_at: '2026-09-09T09:05:00Z', departed_maintenance_at: '2026-09-09T09:10:00Z', completed_at: '2026-09-09T09:30:00Z', final_status: 'returned_to_work',
  diagnosis: 'تلف خرطوم', work_notes: 'استبدال', delay_reason: null, progress: 100, technicians: 'فني (هيدروليك)', technician_count: 1, parts_count: 2,
  parts_summary: 'خرطوم ×2 قطعة', estimated_cost: 100000, service_cost: 20000, parts_actual_cost: 50000, actual_cost: 70000, wait_minutes: 10, maintenance_minutes: 60,
  duration_days: 0.1, corrected_at: null, correction_reason: null, ...over,
})

describe('تصدير أرشيف الصيانة (00156)', () => {
  beforeEach(() => h.excel.mockReset())
  it('الملخص يحسب الكلف والمتوسطات والتوزيع', () => {
    const s = archiveSummary([row(), row({ case_id: 'c2', fault_type: 'فرامل', actual_cost: 30000, parts_actual_cost: 0, service_cost: 30000, maintenance_minutes: 120, final_status: 'closed_at_garage', technician_count: 0 })])
    expect(s).toMatchObject({ count: 2, totalCost: 100000, partsCost: 50000, serviceCost: 50000, partsCount: 4, avgMaintenanceMinutes: 90, avgWaitMinutes: 10, returnedToWork: 1, closedAtGarage: 1, withTechnicians: 1 })
    expect(s.topFault).toMatch(/هيدروليك \(1\)|فرامل \(1\)/)
  })
  it('يبني مصنفاً بقالب المنصة: السجل + الملخص + التفاصيل الفنية + رسم الأعطال وصف إجمالي', async () => {
    await exportMaintenanceArchive([row()], { from: '2026-09-01', to: '2026-09-30' })
    const opts = h.excel.mock.calls[0]![0] as {
      sheetName: string; title: string; meta: string; orientation: string; fileName: string
      columns: { key: string; header: string }[]; rows: Record<string, unknown>[]; totalRow: Record<string, unknown>
      extraSheets: { sheetName: string; rows: Record<string, unknown>[]; columns: { key: string }[] }[]; charts: { title: string }[]
    }
    expect(opts.sheetName).toBe('أرشيف الصيانة')
    expect(opts.orientation).toBe('landscape')
    expect(opts.meta).toContain('2026-09-01')
    expect(opts.columns.map((c) => c.header)).toEqual(expect.arrayContaining(['الفنيون (التخصص)', 'انتظار الوصول', 'وقت الصيانة', 'كلفة القطع', 'كلفة الخدمة', 'الكلفة الفعلية', 'اعتماد الجاهزية']))
    expect(opts.rows[0]).toMatchObject({ db_number: 'DB-1', technicians: 'فني (هيدروليك)', wait_minutes: '10 د', maintenance_minutes: '1 س 0 د', actual_cost: 70000, priority: 'عاجلة', final_status: 'عادت إلى العمل' })
    expect(opts.totalRow).toMatchObject({ actual_cost: 70000, parts_actual_cost: 50000, service_cost: 20000, parts_count: 2 })
    expect(opts.extraSheets.map((s) => s.sheetName)).toEqual(['الملخص', 'التفاصيل الفنية'])
    expect(opts.extraSheets[1]!.rows[0]).toMatchObject({ diagnosis: 'تلف خرطوم', work_notes: 'استبدال', parts_summary: 'خرطوم ×2 قطعة' })
    expect(opts.extraSheets[0]!.rows.map((r) => r.metric)).toContain('إجمالي الكلفة الفعلية (د.ع)')
    expect(opts.charts[0]!.title).toBe('توزيع الأعطال')
    expect(opts.fileName).toMatch(/^أرشيف-الصيانة-2026-09-01-2026-09-30\.xlsx$/)
  })
})
