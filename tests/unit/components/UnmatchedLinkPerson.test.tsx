import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const h = vi.hoisted(() => ({ link: vi.fn(), employees: vi.fn(), toast: vi.fn(), close: vi.fn() }))
vi.mock('@sdk/biometric.sdk', () => ({ biometric: { linkPin: h.link }, biometricErrorMessage: (e: unknown) => e instanceof Error ? e.message : String(e) }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (f: (x: { addToast: typeof h.toast }) => unknown) => f({ addToast: h.toast }) }))
vi.mock('@features/hr', () => ({ useHrEmployees: () => ({ data: h.employees(), isLoading: false, isError: false, refetch: async () => ({ data: h.employees(), isError: false }) }) }))
import UnmatchedLinkPerson from '@portals/hr/pages/Biometric/UnmatchedLinkPerson'
function setup() { const c = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={c}><UnmatchedLinkPerson pin="901" personName="سالم" device="D1" onClose={h.close} /></QueryClientProvider>); return c }
describe('الربط الرسمي من التقرير', () => {
  beforeEach(() => { vi.resetAllMocks(); h.employees.mockReturnValue([{ id: 'e1', full_name: 'سالم الرسمي', employee_number: 'E1', biometric_pin: null }]); h.link.mockResolvedValue(undefined) })
  it('يربط عبر الـ API الرسمي ويغلق النموذج بعد نجاح العملية', async () => {
    setup(); fireEvent.change(screen.getByTestId('unmatched-link-employee'), { target: { value: 'e1' } }); fireEvent.click(screen.getByRole('button', { name: 'تأكيد الربط' }))
    await waitFor(() => expect(h.link).toHaveBeenCalledWith('901', 'e1'))
    await waitFor(() => expect(h.close).toHaveBeenCalledOnce())
  })
  it('يظهر رفض الربط ولا يغلق النموذج', async () => {
    h.link.mockRejectedValue(new Error('BIO_PIN_TAKEN')); setup()
    fireEvent.change(screen.getByTestId('unmatched-link-employee'), { target: { value: 'e1' } }); fireEvent.click(screen.getByRole('button', { name: 'تأكيد الربط' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('BIO_PIN_TAKEN'); expect(h.close).not.toHaveBeenCalled()
  })
  it('يعيد التحقق من رقم الموظف الحالي قبل الاستبدال', async () => {
    h.employees.mockReturnValueOnce([{ id: 'e1', full_name: 'سالم الرسمي', employee_number: 'E1', biometric_pin: null }]).mockReturnValue([{ id: 'e1', full_name: 'سالم الرسمي', employee_number: 'E1', biometric_pin: 'NEW-OTHER' }])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    setup(); fireEvent.change(screen.getByTestId('unmatched-link-employee'), { target: { value: 'e1' } }); fireEvent.click(screen.getByRole('button', { name: 'تأكيد الربط' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('NEW-OTHER')))
    expect(h.link).not.toHaveBeenCalled(); confirm.mockRestore()
  })
  it('لا يستبدل رقم الموظف السابق إذا ألغى المستخدم التأكيد', async () => {
    h.employees.mockReturnValue([{ id: 'e1', full_name: 'سالم الرسمي', employee_number: 'E1', biometric_pin: 'OLD' }]); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    setup(); fireEvent.change(screen.getByTestId('unmatched-link-employee'), { target: { value: 'e1' } }); fireEvent.click(screen.getByRole('button', { name: 'تأكيد الربط' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce()); expect(h.link).not.toHaveBeenCalled(); confirm.mockRestore()
  })
})
