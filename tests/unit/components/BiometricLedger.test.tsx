/** بوابة الموارد البشرية · دفتر البصمة: الفلاتر + الإحصاءات + غير المطابَقين + الربط + اشتقاق الحضور */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockPunches = vi.fn()
const mockLink = vi.fn()
const mockDerive = vi.fn()
const lastFilters: { value?: unknown } = {}

vi.mock('@features/integrations', async () => {
  const types = await import('@features/integrations/types')
  return {
    BIOMETRIC_MODE_LABELS: types.BIOMETRIC_MODE_LABELS,
    useDevices: () => ({ data: [
      { id: 'd1', serial_number: 'ZK-001', name: 'بصمة المدخل', mode: 'adms_push' },
      { id: 'd2', serial_number: 'API-01', name: 'تطبيق البصمة', mode: 'app_api_pull' },
    ] }),
    useBiometricPunches: (filters: unknown) => { lastFilters.value = filters; return mockPunches() },
    useLinkBiometricPin: () => ({ mutate: mockLink, isPending: false }),
    useDeriveAttendance: () => ({ mutate: mockDerive, isPending: false }),
  }
})
vi.mock('@features/employees', () => ({
  useEmployees: () => ({ data: [
    { id: 'e1', full_name: 'أحمد علي', employee_number: '7001' },
    { id: 'e2', full_name: 'سارة حسن', employee_number: '7002' },
  ] }),
}))

import BiometricLedger from '@portals/hr/pages/Biometric/BiometricLedger'

const PUNCHES = [
  { id: 'p1', device_serial: 'ZK-001', pin: '7001', employee_id: 'e1', employee_name: 'أحمد علي', employee_number: '7001',
    punched_at: '2026-09-24T05:02:00Z', direction: 'in', person_name: null, method: 'adms_push' },
  { id: 'p2', device_serial: 'ZK-001', pin: '7001', employee_id: 'e1', employee_name: 'أحمد علي', employee_number: '7001',
    punched_at: '2026-09-24T12:31:00Z', direction: 'out', person_name: null, method: 'adms_push' },
  { id: 'p3', device_serial: 'API-01', pin: '9999', employee_id: null, employee_name: null, employee_number: null,
    punched_at: '2026-09-24T05:11:00Z', direction: 'in', person_name: 'مجهول', method: 'app_api_pull' },
  { id: 'p4', device_serial: 'API-01', pin: '555', employee_id: 'e2', employee_name: 'سارة حسن', employee_number: '7002',
    punched_at: '2026-09-24T05:20:00Z', direction: 'unknown', person_name: null, method: 'lan_pull' },
]

describe('BiometricLedger — دفتر البصمة (HR)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPunches.mockReturnValue({ data: PUNCHES, isLoading: false })
  })

  it('يعرض الإحصاءات المشتقة من البصمات المعروضة', () => {
    render(<BiometricLedger />)
    expect(screen.getByTestId('ledger-stat-total')).toHaveTextContent('4')
    expect(screen.getByTestId('ledger-stat-people')).toHaveTextContent('3')
    expect(screen.getByTestId('ledger-stat-in')).toHaveTextContent('2')
    expect(screen.getByTestId('ledger-stat-out')).toHaveTextContent('1')
    expect(screen.getByTestId('ledger-stat-unmatched')).toHaveTextContent('1')
  })

  it('يعرض كل بصمة بالاتجاه والموظف والطريقة ويميّز غير المطابَق', () => {
    render(<BiometricLedger />)
    const table = screen.getByTestId('ledger-table')
    expect(within(table).getByTestId('punch-row-p1')).toHaveTextContent('دخول')
    expect(within(table).getByTestId('punch-row-p1')).toHaveTextContent('أحمد علي')
    expect(within(table).getByTestId('punch-row-p2')).toHaveTextContent('خروج')
    expect(within(table).getByTestId('punch-row-p4')).toHaveTextContent('غير محدد')
    expect(within(table).getByTestId('punch-row-p4')).toHaveTextContent('شبكة داخلية')
    expect(within(table).getByTestId('punch-unmatched-p3')).toHaveTextContent('غير مطابَق · مجهول')
    expect(within(table).queryByTestId('punch-link-p1')).not.toBeInTheDocument()
    expect(within(table).getByTestId('punch-link-p3')).toBeInTheDocument()
  })

  it('الفلاتر تُمرَّر إلى الاستعلام (اليوم افتراضياً، PIN، المصدر، غير المطابَقين فقط)', async () => {
    const user = userEvent.setup()
    render(<BiometricLedger />)
    const today = new Date().toISOString().slice(0, 10)
    expect(lastFilters.value).toMatchObject({ from: today, to: today, pin: null, deviceId: null, unmatchedOnly: false })
    await user.type(screen.getByTestId('ledger-pin'), '7001')
    await user.selectOptions(screen.getByTestId('ledger-device'), 'd2')
    await user.click(screen.getByTestId('ledger-unmatched-only'))
    expect(lastFilters.value).toMatchObject({ pin: '7001', deviceId: 'd2', unmatchedOnly: true })
  })

  it('ربط PIN غير مطابَق بموظف يستدعي الربط بالقيم الصحيحة', async () => {
    const user = userEvent.setup()
    render(<BiometricLedger />)
    await user.click(screen.getByTestId('punch-link-p3'))
    const form = screen.getByTestId('link-form-9999')
    expect(within(form).getByTestId('link-save')).toBeDisabled()
    await user.selectOptions(within(form).getByTestId('link-employee'), 'e2')
    await user.click(within(form).getByTestId('link-save'))
    expect(mockLink).toHaveBeenCalledWith({ pin: '9999', employeeId: 'e2' }, expect.anything())
  })

  it('اشتقاق الحضور يستدعي الدالة بالتاريخ المختار', async () => {
    const user = userEvent.setup()
    render(<BiometricLedger />)
    const date = screen.getByTestId('derive-date') as HTMLInputElement
    await user.clear(date)
    await user.type(date, '2026-09-20')
    await user.click(screen.getByTestId('derive-run'))
    expect(mockDerive).toHaveBeenCalledWith('2026-09-20')
  })

  it('حالة فارغة عند غياب البصمات', () => {
    mockPunches.mockReturnValue({ data: [], isLoading: false })
    render(<BiometricLedger />)
    expect(screen.getByText('لا بصمات في هذا النطاق')).toBeInTheDocument()
  })
})
