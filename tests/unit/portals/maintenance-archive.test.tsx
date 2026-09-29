import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ excel: vi.fn(async () => undefined), upload: vi.fn() }))
vi.mock('@features/vehicle-operations/export-archive', async (orig) => ({ ...(await orig<object>()), exportMaintenanceArchive: h.excel }))
vi.mock('@features/vehicle-operations/hooks', () => ({
  useMaintenanceArchive: () => ({
    data: [{
      case_id: 'c1', vehicle_name: 'هيونداي', db_number: 'DB-13', driver_name: 'علي', shift: 'morning', area_name: 'الواثق', sector_id: 4, manager_name: 'مسؤول قسم',
      fault_type: 'كلجات', priority: 'normal', reported_at: '2026-09-29T13:26:00Z', arrived_at: '2026-09-29T13:27:00Z', ready_at: '2026-09-29T15:00:00Z', readiness_approved_at: '2026-09-29T15:00:00Z',
      departed_maintenance_at: '2026-09-29T15:16:00Z', completed_at: '2026-09-29T15:30:00Z', final_status: 'closed_at_garage', diagnosis: 'كلجات', work_notes: 'اكمال التصليح', delay_reason: null, progress: 100,
      technicians: 'علي ادهم (ميكانيك)', technician_count: 1, parts_count: 1, parts_summary: 'كلجات ×1 قطعة', estimated_cost: null, service_cost: 0, parts_actual_cost: 1000, actual_cost: 1000,
      wait_minutes: 1, maintenance_minutes: 109, duration_days: 0.1, corrected_at: null, correction_reason: null,
    }],
    isLoading: false,
  }),
  useMaintenanceEvents: () => ({ data: [{ event_key: 'k', event_type: 'completion', title: 'تأكيد الوصول الفعلي إلى الكراج', details: null, happened_at: '2026-09-29T15:30:00Z', progress: null }], isLoading: false, refetch: vi.fn() }),
  useMaintenanceTimeline: () => ({ data: { case: {}, updates: [], parts: [{ id: 'p1', part_name: 'كلجات', quantity: 1, unit: 'قطعة', unit_cost: 1000, part_status: 'installed' }], attachments: [{ id: 'a1', original_name: 'قبل.jpg', caption: null, mime_type: 'image/jpeg', size_bytes: 2048, signedUrl: 's' }], legs: [] }, refetch: vi.fn() }),
  useMaintenanceUploadAttachment: () => ({ mutate: h.upload, isPending: false }),
}))
import Page from '@portals/maintenance/pages/Archive/MaintenanceArchivePage'

describe('أرشيف الصيانة', () => {
  it('يعرض الحالة المكتملة بكل التفاصيل ويفتح السجل والمرفقات للعرض فقط (بلا رفع)', () => {
    render(<Page />)
    const row = screen.getByTestId('archive-row-c1')
    expect(row).toHaveTextContent('علي ادهم (ميكانيك)')
    expect(row).toHaveTextContent('كلجات ×1 قطعة')
    expect(row).toHaveTextContent('1 س 49 د')
    expect(row).toHaveTextContent('أُغلقت في الكراج')
    fireEvent.click(screen.getByTestId('archive-history-c1'))
    expect(screen.getByRole('region', { name: 'التسلسل الزمني لدورة الصيانة' })).toHaveTextContent('تأكيد الوصول الفعلي إلى الكراج')
    expect(screen.getByText('قبل.jpg')).toBeInTheDocument()
    expect(screen.getByText(/كلجات · 1 قطعة/)).toBeInTheDocument()
    expect(screen.queryByTestId('maintenance-attachment-file')).toBeNull()
    fireEvent.click(screen.getByText('إغلاق'))
    fireEvent.click(screen.getByTestId('archive-expand-c1'))
    expect(screen.getByText('اكمال التصليح')).toBeInTheDocument()
  })
  it('زر التصدير يستدعي مصدّر Excel بالمرشحات', () => {
    render(<Page />)
    fireEvent.change(screen.getByLabelText('بحث الأرشيف'), { target: { value: 'DB-13' } })
    fireEvent.click(screen.getByTestId('archive-export-excel'))
    expect(h.excel).toHaveBeenCalledWith(expect.any(Array), { search: 'DB-13', from: '', to: '' })
  })
})
