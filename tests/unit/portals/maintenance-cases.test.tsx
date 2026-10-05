import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  complete: vi.fn(),
  arrival: vi.fn(),
  dispatch: vi.fn(),
  upload: vi.fn(),
  rows: [] as Record<string, unknown>[],
}))
const base = {
  case_id: 'c1', departure_id: 'd1', breakdown_id: 'b1', vehicle_id: 'v1', vehicle_name: 'كابسة', db_number: 'DB-1', driver_name: 'علي', shift: 'morning',
  area_name: 'أرخيته', manager_name: 'مسؤول', status: 'diagnosing', fault_type: 'محرك', priority: 'urgent',
  reported_at: '2026-09-09T08:00:00Z', arrived_at: '2026-09-09T09:00:00Z', diagnosis: null, work_notes: null, parts_notes: null, progress: 0,
  expected_completion_at: null, ready_at: null, departed_maintenance_at: null, completed_at: null, assigned_technician: null, assigned_technician_id: null,
  estimated_cost: null, actual_cost: 0, service_cost: 0, parts_actual_cost: 0, delay_reason: null, ready_declared_by: null, readiness_approved_at: null,
  readiness_approved_by: null, readiness_approval_notes: null, technicians: null, technician_count: 0, parts_summary: null, wait_minutes: 60, maintenance_minutes: 130,
}
vi.mock('@features/vehicle-operations/hooks', () => ({
  useMaintenanceDays: () => ({ data: [{ case_day: '2026-09-09', total_count: 1, open_count: 1 }] }),
  useMaintenanceForDay: () => ({ data: h.rows }),
  useMaintenanceConfirmArrival: () => ({ mutate: h.arrival }),
  useMaintenanceDispatch: () => ({ mutate: h.dispatch }),
  useMaintenanceCompleteCase: () => ({ mutate: h.complete, isPending: false }),
  useMaintenanceTechnicianOptions: () => ({
    data: [
      { employee_id: 'e1', full_name: 'حسن', employee_number: 'E1', job_title: 'فني كهرباء', specialty: 'electrical', specialty_label: 'كهرباء', employment_status: 'active', open_cases: 0 },
      { employee_id: 'e2', full_name: 'كريم', employee_number: 'E2', job_title: 'فني ميكانيك', specialty: 'mechanical', specialty_label: 'ميكانيك', employment_status: 'active', open_cases: 1 },
    ],
    isLoading: false,
  }),
  useMaintenanceInventory: () => ({
    data: [
      { id: 'i1', item_name: 'مضخة', current_quantity: 5, unit: 'قطعة', average_unit_cost: 25000 },
      { id: 'i2', item_name: 'زيت', current_quantity: 40, unit: 'لتر', average_unit_cost: 5000 },
    ],
  }),
  useMaintenanceUploadAttachment: () => ({ mutate: h.upload, isPending: false }),
  useMaintenanceEvents: () => ({ data: [{ event_key: 'k', event_type: 'case', title: 'تسجيل العطل وإرسال الآلية', details: null, happened_at: '2026-09-09T08:00:00Z', progress: null }], isLoading: false, refetch: vi.fn() }),
  useMaintenanceTimeline: () => ({ data: { case: {}, updates: [], parts: [{ id: 'p1', part_name: 'مضخة', quantity: 1, unit: 'قطعة', unit_cost: 25000, part_status: 'installed' }], attachments: [{ id: 'a1', original_name: 'صورة.jpg', caption: null, mime_type: 'image/jpeg', size_bytes: 1000, signedUrl: 's' }], legs: [] }, refetch: vi.fn() }),
}))
import { MemoryRouter } from 'react-router'
import RawPage from '@portals/maintenance/pages/VehicleCases/MaintenanceCasesPage'
const Page = () => (<MemoryRouter><RawPage /></MemoryRouter>)

describe('الصيانة المبسّطة (00157): وصول → تشخيص وإصلاح → إنهاء → إرسال', () => {
  beforeEach(() => {
    h.rows = [base]
    h.complete.mockReset(); h.arrival.mockReset(); h.dispatch.mockReset()
    vi.useFakeTimers({ now: new Date('2026-09-09T11:10:00Z'), toFake: ['Date', 'setInterval', 'clearInterval'] })
  })
  it('قبل الوصول: زر تأكيد الوصول فقط؛ بعده الحالة «قيد التشخيص والإصلاح» مع عدّاد الوقت وزر الإنهاء', () => {
    h.rows = [{ ...base, status: 'to_maintenance', arrived_at: null }]
    const { unmount } = render(<Page />)
    fireEvent.click(screen.getByText('تأكيد وصول الآلية إلى الصيانة'))
    expect(h.arrival).toHaveBeenCalledWith({ caseId: 'c1' })
    expect(screen.queryByTestId('finish-c1')).toBeNull()
    unmount()
    h.rows = [base]
    render(<Page />)
    expect(screen.getByText('قيد التشخيص والإصلاح')).toBeInTheDocument()
    expect(screen.getByTestId('elapsed-c1')).toHaveTextContent('2 س 10 د (مستمر)')
    expect(screen.getByTestId('finish-c1')).toBeInTheDocument()
    // لا نسبة إنجاز ولا موعد متوقع ولا اعتماد منفصل
    expect(screen.queryByText(/نسبة الإنجاز/)).toBeNull()
    expect(screen.queryByText(/اعتماد جاهزية/)).toBeNull()
  })
  it('نموذج الإنهاء الواحد: فنيون (أكثر من واحد) + مواد متعددة من المخزن بكلفة تلقائية + تشخيص/أعمال + أجور اختيارية', () => {
    render(<Page />)
    fireEvent.click(screen.getByTestId('finish-c1'))
    expect(screen.getByTestId('finish-missing')).toHaveTextContent('اختيار فني، التشخيص، الأعمال المنفذة')
    fireEvent.click(screen.getByTestId('tech-e1'))
    fireEvent.click(screen.getByTestId('tech-e2'))
    fireEvent.click(screen.getByTestId('add-part'))
    fireEvent.change(screen.getByTestId('part-item-0'), { target: { value: 'i1' } })
    fireEvent.click(screen.getByTestId('add-part'))
    fireEvent.change(screen.getByTestId('part-item-1'), { target: { value: 'i2' } })
    fireEvent.change(screen.getByTestId('part-qty-1'), { target: { value: '4' } })
    fireEvent.change(screen.getByTestId('finish-diagnosis'), { target: { value: 'تلف المضخة' } })
    fireEvent.change(screen.getByTestId('finish-work-notes'), { target: { value: 'استبدال وتعبئة زيت' } })
    fireEvent.change(screen.getByTestId('finish-service-cost'), { target: { value: '10000' } })
    // 25000 + 4×5000 = 45000 مواد + 10000 أجور = 55000
    expect(screen.getByTestId('finish-cost')).toHaveTextContent('45,000')
    expect(screen.getByTestId('finish-cost')).toHaveTextContent('55,000')
    expect(screen.queryByTestId('finish-missing')).toBeNull()
    fireEvent.click(screen.getByText('إنهاء الصيانة', { selector: 'button' }))
    expect(h.complete).toHaveBeenCalledWith(
      { caseId: 'c1', diagnosis: 'تلف المضخة', workNotes: 'استبدال وتعبئة زيت', technicianIds: ['e1', 'e2'], parts: [{ itemId: 'i1', quantity: 1 }, { itemId: 'i2', quantity: 4 }], serviceCost: 10000 },
      expect.any(Object),
    )
  })
  it('سطر مادة غير مكتمل يمنع الإنهاء؛ وبلا مواد وبلا أجور يُرسل 0', () => {
    render(<Page />)
    fireEvent.click(screen.getByTestId('finish-c1'))
    fireEvent.click(screen.getByTestId('tech-e1'))
    fireEvent.change(screen.getByTestId('finish-diagnosis'), { target: { value: 'x' } })
    fireEvent.change(screen.getByTestId('finish-work-notes'), { target: { value: 'y' } })
    fireEvent.click(screen.getByTestId('add-part'))
    expect(screen.getByTestId('finish-missing')).toHaveTextContent('إكمال سطور القطع')
    fireEvent.click(screen.getByText('حذف'))
    fireEvent.click(screen.getByText('إنهاء الصيانة', { selector: 'button' }))
    expect(h.complete).toHaveBeenCalledWith(expect.objectContaining({ parts: [], serviceCost: 0, technicianIds: ['e1'] }), expect.any(Object))
  })
  it('بعد الإنهاء: البطاقة تعرض الفنيين والمواد والكلفة والوقت النهائي وأزرار الإرسال فقط', () => {
    h.rows = [{ ...base, status: 'ready', readiness_approved_at: '2026-09-09T10:30:00Z', ready_at: '2026-09-09T10:30:00Z', diagnosis: 'تلف', work_notes: 'استبدال', technicians: 'حسن (كهرباء)، كريم (ميكانيك)', technician_count: 2, parts_summary: 'مضخة ×1 قطعة', parts_actual_cost: 25000, service_cost: 10000, actual_cost: 35000 }]
    render(<Page />)
    const card = screen.getByTestId('case-summary-c1')
    expect(card).toHaveTextContent('حسن (كهرباء)، كريم (ميكانيك)')
    expect(card).toHaveTextContent('مضخة ×1 قطعة')
    expect(card).toHaveTextContent('قطع 25,000 + أجور 10,000 = 35,000')
    expect(screen.queryByTestId('finish-c1')).toBeNull()
    fireEvent.click(screen.getByText('إعادتها إلى موقع العمل'))
    expect(h.dispatch).toHaveBeenCalledWith({ caseId: 'c1', destination: 'work_site' })
    fireEvent.click(screen.getByText('إرسالها إلى الكراج'))
    expect(h.dispatch).toHaveBeenCalledWith({ caseId: 'c1', destination: 'garage' })
  })
  it('السجل والمرفقات: للقراءة مع المواد المستخدمة، بلا نماذج صرف', () => {
    render(<Page />)
    fireEvent.click(screen.getByText('السجل والمرفقات'))
    expect(screen.getByText('تسجيل العطل وإرسال الآلية')).toBeInTheDocument()
    expect(screen.getByText('صورة.jpg')).toBeInTheDocument()
    expect(screen.getByText(/مضخة · 1 قطعة/)).toBeInTheDocument()
    expect(screen.queryByText('صرف للحالة')).toBeNull()
  })
  it('المكتملة (استلمها الكراج/الموقع) تختفي من الحالات وتبقى في الأرشيف مع إشعار ورابط', () => {
    h.rows = [base, { ...base, case_id: 'c9', status: 'closed_at_garage', completed_at: '2026-09-09T12:00:00Z', readiness_approved_at: '2026-09-09T10:00:00Z' }]
    render(<Page />)
    expect(screen.getByTestId('case-c1')).toBeInTheDocument()
    expect(screen.queryByTestId('case-c9')).toBeNull()
    expect(screen.getByTestId('archived-note')).toHaveTextContent('1 حالة اكتملت هذا اليوم')
    expect(screen.getByRole('link', { name: 'فتح الأرشيف' })).toHaveAttribute('href', '/maintenance/archive')
    expect(screen.getByText('1 مفتوحة · 0 في الأرشيف')).toBeInTheDocument()
  })
})
