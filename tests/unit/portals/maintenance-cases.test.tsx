import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  update: vi.fn(),
  part: vi.fn(),
  approve: vi.fn(),
  upload: vi.fn(),
  assign: vi.fn(),
  release: vi.fn(),
  issue: vi.fn(),
  rows: [] as Record<string, unknown>[],
  caseTechs: [] as Record<string, unknown>[],
  parts: [] as Record<string, unknown>[],
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
  technicians: 'فني (ميكانيك)',
  technician_count: 1,
  parts_summary: null,
  wait_minutes: 60,
  maintenance_minutes: 130,
}
vi.mock('@features/vehicle-operations/hooks', () => ({
  useMaintenanceDays: () => ({ data: [{ case_day: '2026-09-09', total_count: 1, open_count: 1 }] }),
  useMaintenanceForDay: () => ({ data: h.rows }),
  useMaintenanceConfirmArrival: () => ({ mutate: vi.fn() }),
  useMaintenanceDispatch: () => ({ mutate: vi.fn() }),
  useMaintenanceUpdate: () => ({ mutate: h.update }),
  useMaintenanceTechnicianOptions: () => ({
    data: [
      { employee_id: 'e1', full_name: 'حسن الكهربائي', employee_number: 'E1', job_title: 'فني كهرباء', specialty: 'electrical', specialty_label: 'كهرباء', employment_status: 'active', open_cases: 0 },
      { employee_id: 'e2', full_name: 'كريم الميكانيكي', employee_number: 'E2', job_title: 'فني ميكانيك', specialty: 'mechanical', specialty_label: 'ميكانيك', employment_status: 'active', open_cases: 2 },
    ],
    isLoading: false,
  }),
  useMaintenanceCaseTechnicians: () => ({ data: h.caseTechs, isLoading: false, refetch: vi.fn() }),
  useMaintenanceAssignTechnician: () => ({ mutate: h.assign, isPending: false }),
  useMaintenanceReleaseTechnician: () => ({ mutate: h.release, isPending: false }),
  useMaintenanceIssueAndInstall: () => ({ mutate: h.issue, isPending: false }),
  useMaintenanceApproveReadiness: () => ({ mutate: h.approve }),
  useMaintenanceUploadAttachment: () => ({ mutate: h.upload, isPending: false }),
  useMaintenanceInventory: () => ({
    data: [{ id: 'i1', item_name: 'مضخة', current_quantity: 5, unit: 'قطعة', average_unit_cost: 25000 }],
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
      parts: h.parts,
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
  useMaintenanceCaseStages: () => ({
    data: [
      { id: 's1', case_id: 'c1', stage_key: 'arrival', stage_no: 1, status: 'completed', notes: null, started_at: null, completed_at: '2026-09-09T09:00:00Z' },
      { id: 's2', case_id: 'c1', stage_key: 'diagnosis', stage_no: 2, status: 'completed', notes: null, started_at: null, completed_at: '2026-09-09T10:00:00Z' },
      { id: 's3', case_id: 'c1', stage_key: 'repair', stage_no: 3, status: 'active', notes: null, started_at: '2026-09-09T10:00:00Z', completed_at: null },
      { id: 's4', case_id: 'c1', stage_key: 'inspection', stage_no: 4, status: 'pending', notes: null, started_at: null, completed_at: null },
      { id: 's5', case_id: 'c1', stage_key: 'handover', stage_no: 5, status: 'pending', notes: null, started_at: null, completed_at: null },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useMaintenanceAdvanceStage: () => ({ mutate: vi.fn(), isPending: false }),
}))
import Page from '@portals/maintenance/pages/VehicleCases/MaintenanceCasesPage'
describe('تفاصيل الصيانة متعددة الأيام', () => {
  beforeEach(() => {
    h.rows = [base]
    h.caseTechs = [{ id: 'ct1', case_id: 'c1', employee_id: 'e2', technician_name: 'كريم الميكانيكي', employee_number: 'E2', specialty: 'mechanical', specialty_label: 'ميكانيك', active: true, assigned_at: '2026-09-09T09:30:00Z', released_at: null }]
    h.parts = []
    h.update.mockReset()
    h.approve.mockReset()
    h.assign.mockReset()
    h.release.mockReset()
    h.issue.mockReset()
  })
  it('يعرض المرفقات والسجل، وحوار التحديث يحمل الحقول المعنونة ويحفظ كلفة الخدمة والتشخيص', () => {
    render(<Page />)
    fireEvent.click(screen.getByText('التفاصيل والسجل الكامل'))
    expect(screen.getByText('صورة المحرك.jpg')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'التسلسل الزمني لدورة الصيانة' })).toBeInTheDocument()
    expect(screen.getByText('تسجيل العطل وإرسال الآلية')).toBeInTheDocument()
    fireEvent.click(screen.getByText('إغلاق'))
    fireEvent.click(screen.getByText('إضافة تحديث جديد'))
    // حقول معنونة (لا مربعات أرقام غامضة)
    expect(screen.getByText('نسبة الإنجاز (%)')).toBeInTheDocument()
    expect(screen.getByText('كلفة خدمة/أجور خارجية')).toBeInTheDocument()
    expect(screen.getByText('كلفة القطع (تلقائية من المخزن)')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('maintenance-service-cost'), { target: { value: '15000' } })
    fireEvent.change(screen.getByTestId('maintenance-diagnosis'), { target: { value: 'تلف المضخة' } })
    fireEvent.click(screen.getByText('حفظ كتحديث جديد'))
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'c1', actualCost: 15000, diagnosis: 'تلف المضخة' }),
      expect.any(Object),
    )
  })
  it('00156: الفنيون من الهيكل — تعيين فني ثانٍ وإنهاء عمل فني، مجمّعين بالتخصص', () => {
    render(<Page />)
    fireEvent.click(screen.getByText('إضافة تحديث جديد'))
    expect(screen.getByTestId('case-tech-e2')).toHaveTextContent('كريم الميكانيكي · ميكانيك')
    const picker = screen.getByTestId('technician-picker') as HTMLSelectElement
    // الفني المعيَّن لا يظهر في قائمة الإضافة؛ الباقي مجمّع بالتخصص
    expect([...picker.options].map((o) => o.value)).toEqual(['', 'e1'])
    expect(picker.querySelector('optgroup')?.label).toBe('كهرباء')
    fireEvent.change(picker, { target: { value: 'e1' } })
    fireEvent.click(screen.getByTestId('assign-technician'))
    expect(h.assign).toHaveBeenCalledWith({ caseId: 'c1', employeeId: 'e1' }, expect.any(Object))
    fireEvent.click(screen.getByLabelText('إنهاء عمل كريم الميكانيكي'))
    expect(h.release).toHaveBeenCalledWith({ caseId: 'c1', employeeId: 'e2' }, expect.any(Object))
  })
  it('00156: صرف قطعة من المخزن داخل التحديث بتركيب فوري وكلفة تلقائية', () => {
    h.parts = [{ id: 'p1', part_name: 'مضخة', quantity: 1, unit: 'قطعة', unit_cost: 25000, part_status: 'installed' }]
    render(<Page />)
    fireEvent.click(screen.getByText('إضافة تحديث جديد'))
    expect(screen.getByTestId('maintenance-parts-cost')).toHaveTextContent('٢٥٬٠٠٠')
    fireEvent.change(screen.getByTestId('issue-inventory-item'), { target: { value: 'i1' } })
    fireEvent.change(screen.getByLabelText('كمية الصرف'), { target: { value: '2' } })
    expect(screen.getByText(/الكلفة المتوقعة: ٥٠٬٠٠٠/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('issue-part'))
    expect(h.issue).toHaveBeenCalledWith({ caseId: 'c1', itemId: 'i1', quantity: 2, installNow: true }, expect.any(Object))
  })
  it('00156: اختيار «جاهزة» بلا فني أو بقطعة غير مركّبة يعطّل الحفظ ويسرد النواقص', () => {
    h.caseTechs = []
    h.parts = [{ id: 'p1', part_name: 'مضخة', quantity: 1, unit: 'قطعة', unit_cost: 25000, part_status: 'issued' }]
    render(<Page />)
    fireEvent.click(screen.getByText('إضافة تحديث جديد'))
    fireEvent.change(screen.getByTestId('maintenance-status'), { target: { value: 'ready' } })
    fireEvent.change(screen.getByTestId('maintenance-progress'), { target: { value: '100' } })
    expect(screen.getByTestId('ready-blockers')).toHaveTextContent('تعيين فني، تأكيد تركيب القطع المصروفة')
    fireEvent.click(screen.getByText('حفظ كتحديث جديد'))
    expect(h.update).not.toHaveBeenCalled()
  })
  it('00156: بطاقة الحالة تعرض الفنيين والقطع والأوقات والكلف', () => {
    h.rows = [{ ...base, parts_summary: 'مضخة ×1 قطعة', parts_actual_cost: 25000, service_cost: 5000, actual_cost: 30000 }]
    render(<Page />)
    const card = screen.getByTestId('case-summary-c1')
    expect(card).toHaveTextContent('فني (ميكانيك)')
    expect(card).toHaveTextContent('مضخة ×1 قطعة')
    expect(card).toHaveTextContent('1 س 0 د / 2 س 10 د')
    expect(card).toHaveTextContent('٢٥٬٠٠٠ + ٥٬٠٠٠ = ٣٠٬٠٠٠')
  })
  it('يطلب اعتماد الجاهزية قبل إظهار أزرار المغادرة', () => {
    h.rows = [{ ...base, status: 'ready', progress: 100, ready_declared_by: 't1', diagnosis: 'تلف خرطوم', work_notes: 'استُبدل' }]
    render(<Page />)
    expect(screen.queryByText('إعادتها إلى موقع العمل')).not.toBeInTheDocument()
    expect(screen.queryByTestId('readiness-missing-c1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('approve-readiness-c1'))
    expect(h.approve).toHaveBeenCalledWith({ caseId: 'c1' })
  })
  it('00155: جاهزة بلا تشخيص/ملاحظات → يعطّل الاعتماد ويُظهر النواقص ويُبقي «إضافة تحديث» متاحاً', () => {
    h.rows = [{ ...base, status: 'ready', progress: 100, ready_declared_by: 't1', diagnosis: null, work_notes: null, technician_count: 0, assigned_technician: null }]
    render(<Page />)
    expect(screen.getByTestId('readiness-missing-c1')).toHaveTextContent('التشخيص (وصف العطل)، ملاحظات العمل المنجز، تعيين فني واحد على الأقل')
    expect(screen.getByTestId('approve-readiness-c1')).toBeDisabled()
    fireEvent.click(screen.getByTestId('approve-readiness-c1'))
    expect(h.approve).not.toHaveBeenCalled()
    expect(screen.getByText('إضافة تحديث جديد')).toBeInTheDocument()
  })
  it('00155: بعد الاعتماد لا يظهر زر التحديث ولا الاعتماد', () => {
    h.rows = [{ ...base, status: 'ready', progress: 100, diagnosis: 'x', work_notes: 'y', readiness_approved_at: '2026-09-28T08:00:00Z' }]
    render(<Page />)
    expect(screen.queryByText('إضافة تحديث جديد')).not.toBeInTheDocument()
    expect(screen.queryByTestId('approve-readiness-c1')).not.toBeInTheDocument()
    expect(screen.getByText('إعادتها إلى موقع العمل')).toBeInTheDocument()
  })
})
