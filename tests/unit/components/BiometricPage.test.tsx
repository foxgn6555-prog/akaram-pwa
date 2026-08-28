/** وحدة البصمة: دليل الربط + رابط ADMS + الأجهزة المتصلة */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockCreate = vi.fn()
const mockToggle = vi.fn()
const mockDevices = vi.fn()

vi.mock('@features/branches', () => ({
  useBranches: () => ({ data: [{ id: 'b1', name: 'المركز' }], isLoading: false }),
}))

vi.mock('@features/integrations', () => ({
  useDevices: () => mockDevices(),
  useCreateDevice: () => ({ mutateAsync: mockCreate, isPending: false }),
  useToggleDevice: () => ({ mutate: mockToggle, isPending: false }),
}))

vi.mock('@sdk/integrations.sdk', () => ({
  integrations: { getAdmsServerUrl: () => 'https://proj.supabase.co/functions/v1/adms-receiver' },
}))

import BiometricPage from '@portals/it/pages/Integrations/BiometricPage'

const DEVICES = [
  { id: 'd1', serial_number: 'ZK-001', name: 'بصمة المدخل', branch_id: 'b1', is_active: true,
    last_seen_at: new Date().toISOString(), firmware: null, location_hint: null },
  { id: 'd2', serial_number: 'ZK-002', name: 'بصمة المخزن', branch_id: null, is_active: true,
    last_seen_at: '2026-01-01T00:00:00Z', firmware: null, location_hint: null },
]

describe('BiometricPage — أجهزة البصمة', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ id: 'd9', serial_number: 'NEW' })
    mockDevices.mockReturnValue({ data: DEVICES, isLoading: false })
  })

  it('يعرض رابط ADMS الجاهز للنسخ', () => {
    render(<BiometricPage />)
    expect(screen.getByTestId('adms-url')).toHaveTextContent(
      'https://proj.supabase.co/functions/v1/adms-receiver',
    )
  })

  it('يعرض الأجهزة مع حالة الاتصال الحية', () => {
    render(<BiometricPage />)
    const grid = screen.getByTestId('devices-grid')
    expect(grid).toHaveTextContent('بصمة المدخل')
    expect(grid).toHaveTextContent('متصل')       // آخر اتصال الآن
    expect(grid).toHaveTextContent('غير متصل')   // قديم
  })

  it('تسجيل جهاز يرسل SN والاسم', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('toggle-device-form'))
    await user.type(screen.getByTestId('device-sn'), 'CL-999')
    await user.type(screen.getByTestId('device-name'), 'جهاز جديد')
    await user.click(screen.getByTestId('device-submit'))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ serial_number: 'CL-999', name: 'جهاز جديد' }),
      )
    })
  })
})
