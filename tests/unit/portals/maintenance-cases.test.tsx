import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  update: vi.fn(),
  part: vi.fn(),
  approve: vi.fn(),
  upload: vi.fn(),
  rows: [] as Record<string, unknown>[],
}))
const base = {
  case_id: 'c1',
  departure_id: 'd1',
  breakdown_id: 'b1',
  vehicle_id: 'v1',
  vehicle_name: 'كابسة',
  db_number: 'DB-1',
  driver_name: 'علي',
  shift: 'morning',
  area_name: 'أرخيته',
  manager_name: 'مسؤول',
  status: 'in_repair',
  fault_type: 'محرك',
  priority: 'urgent',
  reported_at: '2026-09-09T08:00:00Z',
  arrived_at: '2026-09-09T09:00:00Z',
  diagnosis: 'عطل',
  work_notes: 'إصلاح',
  parts_notes: null,
  progress: 40,
  expected_completion_at: null,
  ready_at: null,
  departed_maintenance_at: null,
  completed_at: null,
  assigned_technician: 'فني',
  assigned_technician_id: 't1',
  estimated_cost: 100,
  actual_cost: 0,
  service_cost: 0,
  parts_actual_cost: 0,
  delay_reason: null,
  ready_declared_by: null,
  readiness_approved_at: null,
  readiness_approved_by: null,
  readiness_approval_notes: null,
}
vi.mock('@features/vehicle-operations/hooks', () => ({
  useMaintenanceDays: () => ({ data: [{ case_day: '2026-09-09', total_count: 1, open_count: 1 }] }),
  useMaintenanceForDay: () => ({ data: h.rows }),
  useMaintenanceConfirmArrival: () => ({ mutate: vi.fn() }),
  useMaintenanceDispatch: () => ({ mutate: vi.fn() }),
  useMaintenanceUpdate: () => ({ mutate: h.update }),
  useMaintenanceTechnicians: () => ({
    data: [
      { user_id: 't1', display_name: 'الفني الأول', email: 't@x.iq' },
      { user_id: 't2', display_name: 'الفني الثاني', email: 't2@x.iq' },
    ],
  }),
  useMaintenanceApproveReadiness: () => ({ mutate: h.approve }),
  useMaintenanceUploadAttachment: () => ({ mutate: h.upload, isPending: false }),
  useMaintenanceInventory: () => ({
    data: [{ id: 'i1', item_name: 'مضخة', current_quantity: 5, unit: 'قطعة' }],
  }),
  useMaintenanceIssueInventory: () => ({ mutate: vi.fn() }),
  useMaintenanceInstallPart: () => ({ mutate: vi.fn() }),
  useMaintenanceReturnPart: () => ({ mutate: vi.fn() }),
  useMaintenanceEvents: () => ({
    data: [
      {
        event_key: 'case:reported',
        event_type: 'case',
        title: 'تسجيل العطل وإرسال الآلية',
        details: 'عطل المحرك',
        happened_at: '2026-09-09T08:00:00Z',
        progress: 0,
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useMaintenanceTimeline: () => ({
    data: {
      case: {},
      updates: [
        {
          id: 'u1',
          status: 'in_repair',
          progress: 40,
          created_at: '2026-09-09T10:00:00Z',
          diagnosis: 'عطل',
        },
      ],
      parts: [],
      attachments: [
        {
          id: 'a1',
          original_name: 'صورة المحرك.jpg',
          caption: 'قبل الإصلاح',
          mime_type: 'image/jpeg',
          size_bytes: 1000,
          signedUrl: 'signed',
        },
      ],
      legs: [],
    },
    refetch: vi.fn(),
  }),
  useMaintenanceAddPart: () => ({ mutate: h.part }),
}))
import Page from '@portals/maintenance/pages/VehicleCases/MaintenanceCasesPage'
describe('تفاصيل الصيانة متعددة الأيام', () => {
  beforeEach(() => {
    h.rows = [base]
    h.update.mockReset()
    h.approve.mockReset()
  })
  it('يعرض المرفقات ويسند الفني بحساب مرجعي', () => {
    render(<Page />)
    fireEvent.click(screen.getByText('التفاصيل والسجل الكامل'))
    expect(screen.getByText('صورة المحرك.jpg')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'التسلسل الزمني لدورة الصيانة' })).toBeInTheDocument()
    expect(screen.getByText('تسجيل العطل وإرسال الآلية')).toBeInTheDocument()
    fireEvent.click(screen.getByText('إغلاق'))
    fireEvent.click(screen.getByText('إضافة تحديث جديد'))
    fireEvent.change(screen.getByTestId('maintenance-technician'), { target: { value: 't2' } })
    fireEvent.click(screen.getByText('حفظ كتحديث جديد'))
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'c1', technicianId: 't2' }),
      expect.any(Object),
    )
  })
  it('يطلب اعتماد الجاهزية قبل إظهار أزرار المغادرة', () => {
    h.rows = [{ ...base, status: 'ready', progress: 100, ready_declared_by: 't1' }]
    render(<Page />)
    expect(screen.queryByText('إعادتها إلى موقع العمل')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('approve-readiness-c1'))
    expect(h.approve).toHaveBeenCalledWith({ caseId: 'c1' })
  })
})
