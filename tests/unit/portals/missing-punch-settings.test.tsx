import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const m = vi.hoisted(() => ({ policy: {} as Record<string, unknown>, save: vi.fn(), schedule: vi.fn() }))
vi.mock('@features/hr', () => ({ useHrPolicy: () => ({ data: m.policy, isLoading: false }) }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { setMissingPunchSettings: m.save, repairMissingPunchSchedule: m.schedule }, hrErrorMessage: () => 'فشل الحفظ' }))
import { MissingPunchSettingsCard } from '@portals/it/pages/Integrations/MissingPunchSettingsCard'

const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MissingPunchSettingsCard /></QueryClientProvider>)
beforeEach(() => { m.policy = {}; m.save.mockReset(); m.schedule.mockReset() })
describe('إعدادات كشف البصمات الناقصة', () => {
  it('بلا قيم مفترضة، يتحقق من المدخلات ويؤكد أن الربط المالي غير مفعّل', async () => {
    m.save.mockResolvedValue({ missing_punch_threshold: 3, missing_punch_fixed_amount: 5000 })
    open()
    expect(screen.getByText(/اعتماد المعاون والربط بالراتب غير مفعّلين/)).toBeInTheDocument()
    expect(screen.getByTestId('missing-punch-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('missing-punch-threshold'), { target: { value: '32' } })
    fireEvent.change(screen.getByTestId('missing-punch-amount'), { target: { value: '5000' } })
    expect(screen.getByTestId('missing-punch-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('missing-punch-threshold'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('missing-punch-amount'), { target: { value: '5000.001' } })
    expect(screen.getByTestId('missing-punch-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('missing-punch-amount'), { target: { value: '5000' } })
    fireEvent.click(screen.getByTestId('missing-punch-save'))
    await waitFor(() => expect(m.save).toHaveBeenCalledWith(3, 5000))
    expect(await screen.findByRole('status')).toHaveTextContent('لم يُفعّل أي استقطاع')
  })
  it('يعيد تسجيل الجدولة من التطوير بلا إرسال فوري', async () => {
    m.schedule.mockResolvedValue(undefined); open()
    fireEvent.click(screen.getByTestId('missing-punch-schedule'))
    await waitFor(() => expect(m.schedule).toHaveBeenCalledOnce())
    expect(await screen.findByRole('status')).toHaveTextContent('سُجّلت مهمة الجدولة')
  })
  it('يظهر خطأ الحفظ ولا يعلن النجاح', async () => {
    m.policy = { missing_punch_threshold: 3, missing_punch_fixed_amount: 5000 }
    m.save.mockRejectedValue(new Error('denied'))
    open()
    fireEvent.change(screen.getByTestId('missing-punch-amount'), { target: { value: '6000' } })
    fireEvent.click(screen.getByTestId('missing-punch-save'))
    expect(await screen.findByRole('alert')).toHaveTextContent('فشل الحفظ')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
