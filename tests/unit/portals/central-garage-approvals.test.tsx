import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ assign: vi.fn(), decide: vi.fn(), refetchTanks: vi.fn(), refetchRequests: vi.fn(), tankError: false, requestError: false, tanks: [] as Record<string, unknown>[], requests: [] as Record<string, unknown>[] }))
vi.mock('@features/central-garage/hooks', () => ({
  useGarageTanks: () => ({ data: h.tanks, isLoading: false, isError: h.tankError, refetch: h.refetchTanks }),
  useGarageZeroRequests: () => ({ data: h.requests, isLoading: false, isError: h.requestError, refetch: h.refetchRequests }),
  useAssignGarageTankSector: () => ({ mutate: h.assign, isPending: false }),
  useDecideGarageTankZero: () => ({ mutate: h.decide, isPending: false }),
}))
import CentralGarageApprovalsPage from '@portals/it/pages/CentralGarage/CentralGarageApprovalsPage'

const tank = { id: 't1', fuelType: 'gas_oil', tankName: 'الخزان القديم', unit: 'liter', capacity: 500, currentQuantity: 120, lowStockThreshold: 20, createdAt: '2026-09-01', updatedAt: '2026-09-01', archivedAt: null, parentSector: null }
const request = { id: 'r1', tankId: 't1', requestedQuantity: 120, reason: 'مطابقة الجرد الفعلي', status: 'pending', requestedBy: 'g1', requestedAt: '2026-09-14T08:00:00Z', decidedBy: null, decidedAt: null, decisionNote: null }

describe('موافقات وإعداد خزانات الكراج', () => {
  beforeEach(() => { vi.clearAllMocks(); h.tanks = []; h.requests = []; h.tankError = false; h.requestError = false })

  it('يعرض حالة سليمة عندما تكون كل الخزانات مرتبطة', () => {
    h.tanks = [{ ...tank, parentSector: 'karrada' }]
    render(<CentralGarageApprovalsPage />)
    expect(screen.getByTestId('all-tanks-assigned')).toBeInTheDocument()
  })

  it('يربط الخزان القديم بالقاطع المختار', () => {
    h.tanks = [tank]
    render(<CentralGarageApprovalsPage />)
    fireEvent.change(screen.getByTestId('tank-sector-t1'), { target: { value: 'zaafaraniya' } })
    fireEvent.click(screen.getByRole('button', { name: 'ربط الخزان' }))
    expect(h.assign).toHaveBeenCalledWith({ tankId: 't1', parentSector: 'zaafaraniya' })
  })

  it('يعرض قاطع الخزان في طلب التصفير وينفذ الموافقة', async () => {
    h.tanks = [{ ...tank, parentSector: 'karrada' }]
    h.requests = [request]
    render(<CentralGarageApprovalsPage />)
    expect(screen.getByText('كراج الكرادة')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('approve-zero-r1'))
    await userEvent.click(screen.getByTestId('decision-submit'))
    expect(h.decide).toHaveBeenCalledWith({ requestId: 'r1', approved: true, note: undefined }, expect.any(Object))
  })

  it('يعرض فشل الشبكة بوضوح ويعيد تحميل الاستعلامين', async () => {
    h.tankError = true
    render(<CentralGarageApprovalsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('تعذر تحميل بيانات الخزانات والموافقات')
    expect(screen.queryByTestId('all-tanks-assigned')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(h.refetchTanks).toHaveBeenCalledOnce()
    expect(h.refetchRequests).toHaveBeenCalledOnce()
  })

  it('يفرض سبباً عند رفض طلب التصفير ويعمل على عرض الهاتف', async () => {
    h.tanks = [{ ...tank, parentSector: 'zaafaraniya' }]
    h.requests = [request]
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    render(<CentralGarageApprovalsPage />)
    await userEvent.click(screen.getByTestId('reject-zero-r1'))
    const note = screen.getByPlaceholderText('سبب الرفض')
    expect(note).toHaveFocus()
    expect(note).toBeRequired()
    expect(screen.getByTestId('decision-submit')).toBeDisabled()
    await userEvent.type(note, 'الرصيد غير مطابق')
    await userEvent.click(screen.getByTestId('decision-submit'))
    expect(h.decide).toHaveBeenCalledWith({ requestId: 'r1', approved: false, note: 'الرصيد غير مطابق' }, expect.any(Object))
  })
})
