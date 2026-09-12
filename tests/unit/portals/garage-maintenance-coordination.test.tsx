import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@features/vehicle-operations/hooks', () => ({
  useMaintenanceEvents: () => ({
    data: [
      {
        event_key: 'case:reported',
        event_type: 'case',
        title: 'تسجيل العطل وإرسال الآلية',
        details: 'عطل فرامل',
        happened_at: '2026-09-12T10:00:00Z',
        progress: 0,
      },
    ],
    isLoading: false,
  }),
  useGarageMaintenanceCoordination: () => ({
    isLoading: false,
    data: [
      {
        case_id: 'c1',
        departure_id: 'd1',
        vehicle_name: 'كابسة',
        db_number: '100',
        vehicle_category: 'compactor_large',
        driver_name: 'أحمد',
        sector_name: 'الرياض',
        manager_name: 'مسؤول الرياض',
        fault_type: 'عطل فرامل',
        priority: 'urgent',
        dispatch_policy: 'approval_required',
        decision_status: 'awaiting_approval',
        reported_at: '2026-09-12T10:00:00Z',
        decision_notes: null,
      },
    ],
  }),
  useGarageMaintenanceDecision: () => ({ mutate: h.mutate, isPending: false }),
}))
import MaintenanceCoordinationPage from '@portals/central-garage/pages/MaintenanceCoordinationPage'
describe('تنسيق الكراج لحركات الصيانة', () => {
  it('يعرض طلب الموافقة ولا يحرر الحركة إلا بعد قرار صريح', async () => {
    render(<MaintenanceCoordinationPage />)
    expect(screen.getByText('عطل فرامل')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'موافقة وتحريك الآلية' }))
    await userEvent.type(screen.getByPlaceholderText('ملاحظات التنسيق (اختيارية)'), 'تم التنسيق')
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد القرار' }))
    expect(h.mutate).toHaveBeenCalledWith(
      { caseId: 'c1', decision: 'approve', notes: 'تم التنسيق' },
      expect.any(Object),
    )
  })
  it('يعرض للكراج التسلسل الزمني الكامل للحالة', async () => {
    render(<MaintenanceCoordinationPage />)
    await userEvent.click(screen.getByRole('button', { name: /عرض التسلسل الزمني/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('تسجيل العطل وإرسال الآلية')).toBeInTheDocument()
  })
  it('يفرض سبباً عند الرفض', async () => {
    render(<MaintenanceCoordinationPage />)
    await userEvent.click(screen.getByRole('button', { name: 'رفض مع السبب' }))
    expect(screen.getByPlaceholderText('سبب الرفض إلزامي')).toBeRequired()
  })
})
