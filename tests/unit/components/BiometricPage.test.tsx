/** بوابة التطوير المركزية · أجهزة البصمة ومصادرها: الأنماط الأربعة + اختبار/سحب + معالجة ADMS + سجل العمليات */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockCreate = vi.fn()
const mockToggle = vi.fn()
const mockDevices = vi.fn()
const mockPulls = vi.fn()
const mockUpdate = vi.fn()
const mockTest = vi.fn()
const mockPull = vi.fn()
const mockProcess = vi.fn()

vi.mock('@features/branches', () => ({
  useBranches: () => ({ data: [{ id: 'b1', name: 'المركز' }], isLoading: false }),
}))

vi.mock('@features/integrations', async () => {
  const types = await import('@features/integrations/types')
  return {
    BIOMETRIC_MODES: types.BIOMETRIC_MODES,
    BIOMETRIC_MODE_LABELS: types.BIOMETRIC_MODE_LABELS,
    useDevices: () => mockDevices(),
    useCreateDevice: () => ({ mutateAsync: mockCreate, isPending: false }),
    useToggleDevice: () => ({ mutate: mockToggle, isPending: false }),
    useBiometricPulls: () => mockPulls(),
    useUpdateBiometricDevice: () => ({ mutateAsync: mockUpdate, isPending: false }),
    useTestBiometricSource: () => ({ mutate: mockTest, isPending: false }),
    usePullBiometric: () => ({ mutate: mockPull, isPending: false }),
    useProcessBiometricPushes: () => ({ mutate: mockProcess, isPending: false }),
  }
})

vi.mock('@sdk/integrations.sdk', () => ({
  integrations: { getAdmsServerUrl: () => 'https://proj.supabase.co/functions/v1/adms-receiver' },
}))

import BiometricPage from '@portals/it/pages/Integrations/BiometricPage'

const DEVICES = [
  { id: 'd1', serial_number: 'ZK-001', name: 'بصمة المدخل', branch_id: 'b1', is_active: true,
    last_seen_at: new Date().toISOString(), firmware: null, location_hint: null, mode: 'adms_push', config: {}, timezone_offset: '+03:00' },
  { id: 'd2', serial_number: 'API-01', name: 'تطبيق البصمة المشترك', branch_id: null, is_active: true,
    last_seen_at: '2026-01-01T00:00:00Z', firmware: null, location_hint: null, mode: 'app_api_pull',
    config: { base_url: 'https://vendor.example/api', api_key: 'k' }, timezone_offset: '+03:00' },
  { id: 'd3', serial_number: 'LAN-01', name: 'جهاز المخزن', branch_id: null, is_active: true,
    last_seen_at: null, firmware: null, location_hint: null, mode: 'lan_pull', config: { base_url: 'http://192.168.1.50' }, timezone_offset: '+04:00' },
]
const PULLS = [
  { id: 'p1', device_id: 'd2', device_name: 'تطبيق البصمة المشترك', mode: 'app_api_pull', status: 'success',
    received: 40, inserted: 38, duplicates: 2, unmatched: 1, error: null, triggered_by: 'u', started_at: '2026-09-24T08:00:00Z', finished_at: '2026-09-24T08:00:03Z' },
  { id: 'p2', device_id: 'd3', device_name: 'جهاز المخزن', mode: 'lan_pull', status: 'failed',
    received: 0, inserted: 0, duplicates: 0, unmatched: 0, error: 'BIO_SOURCE_UNREACHABLE: timeout', triggered_by: 'u', started_at: '2026-09-24T07:00:00Z', finished_at: null },
]

describe('BiometricPage — أجهزة البصمة ومصادرها (IT)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ id: 'd9', serial_number: 'NEW' })
    mockUpdate.mockResolvedValue({})
    mockDevices.mockReturnValue({ data: DEVICES, isLoading: false })
    mockPulls.mockReturnValue({ data: PULLS, isLoading: false })
  })

  it('يعرض رابط ADMS الجاهز للنسخ', () => {
    render(<BiometricPage />)
    expect(screen.getByTestId('adms-url')).toHaveTextContent('https://proj.supabase.co/functions/v1/adms-receiver')
  })

  it('يعرض الأجهزة مع حالة الاتصال الحية وشارة النمط لكل مصدر', () => {
    render(<BiometricPage />)
    const grid = screen.getByTestId('devices-grid')
    expect(grid).toHaveTextContent('بصمة المدخل')
    expect(grid).toHaveTextContent('متصل')
    expect(grid).toHaveTextContent('غير متصل')
    expect(within(screen.getByTestId('source-card-ZK-001')).getByTestId('source-mode-badge')).toHaveTextContent('دفع ADMS')
    expect(within(screen.getByTestId('source-card-API-01')).getByTestId('source-mode-badge')).toHaveTextContent('API تطبيق مشترك')
    expect(within(screen.getByTestId('source-card-LAN-01')).getByTestId('source-mode-badge')).toHaveTextContent('شبكة داخلية')
  })

  it('تسجيل جهاز ADMS يرسل SN والاسم بنمط الدفع وبلا حقول رابط', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('toggle-device-form'))
    expect(screen.queryByTestId('source-config-fields')).not.toBeInTheDocument()
    await user.type(screen.getByTestId('device-sn'), 'CL-999')
    await user.type(screen.getByTestId('device-name'), 'جهاز جديد')
    await user.click(screen.getByTestId('device-submit'))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ serial_number: 'CL-999', name: 'جهاز جديد', mode: 'adms_push', config: {}, timezone_offset: '+03:00' }),
      )
    })
  })

  it('الطريقة 1: تسجيل مصدر API تطبيق يتطلب رابطاً صالحاً ويحفظ المفتاح في التهيئة', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('toggle-device-form'))
    await user.selectOptions(screen.getByTestId('device-mode'), 'app_api_pull')
    expect(screen.getByTestId('source-config-fields')).toHaveAttribute('data-mode', 'app_api_pull')
    expect(screen.getByTestId('mode-hint')).toHaveTextContent('API التطبيق المشترك')
    await user.type(screen.getByTestId('device-sn'), 'API-VENDOR')
    await user.type(screen.getByTestId('device-name'), 'تطبيق البصمة')
    await user.click(screen.getByTestId('device-submit'))
    expect(await screen.findByTestId('device-form-error')).toHaveTextContent('رابط المصدر غير صالح')
    expect(mockCreate).not.toHaveBeenCalled()

    await user.type(screen.getByTestId('cfg-base-url'), 'https://vendor.example/api/')
    await user.type(screen.getByTestId('cfg-api-key'), 'SECRET')
    await user.type(screen.getByTestId('cfg-tz'), '+03:00')
    await user.click(screen.getByTestId('device-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      serial_number: 'API-VENDOR', mode: 'app_api_pull',
      config: { base_url: 'https://vendor.example/api/', api_key: 'SECRET', timezone_offset: '+03:00' },
    })))
  })

  it('الطريقة 2: مصدر الشبكة الداخلية يعرض حقول Basic ويحفظها', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('toggle-device-form'))
    await user.selectOptions(screen.getByTestId('device-mode'), 'lan_pull')
    expect(screen.getByTestId('cfg-basic-user')).toBeInTheDocument()
    expect(screen.queryByTestId('cfg-bearer')).not.toBeInTheDocument()
    await user.type(screen.getByTestId('device-sn'), 'LAN-9')
    await user.type(screen.getByTestId('device-name'), 'جهاز الباب')
    await user.type(screen.getByTestId('cfg-base-url'), 'http://10.0.0.5')
    await user.type(screen.getByTestId('cfg-basic-user'), 'admin')
    await user.type(screen.getByTestId('cfg-basic-pass'), '1234')
    await user.click(screen.getByTestId('device-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'lan_pull', config: { base_url: 'http://10.0.0.5', basic_user: 'admin', basic_pass: '1234' },
    })))
  })

  it('النمط العام يشترط خريطة حقول (PIN + وقت) قبل التسجيل', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('toggle-device-form'))
    await user.selectOptions(screen.getByTestId('device-mode'), 'generic_pull')
    expect(screen.getByTestId('cfg-mapping')).toBeInTheDocument()
    await user.type(screen.getByTestId('device-sn'), 'GEN-1')
    await user.type(screen.getByTestId('device-name'), 'مصدر عام')
    await user.type(screen.getByTestId('cfg-base-url'), 'https://other.example')
    await user.type(screen.getByTestId('cfg-map-pin'), 'emp.code')
    await user.click(screen.getByTestId('device-submit'))
    expect(await screen.findByTestId('device-form-error')).toHaveTextContent('خريطة الحقول ناقصة')
    await user.type(screen.getByTestId('cfg-records-path'), 'payload.rows')
    await user.type(screen.getByTestId('cfg-map-date'), 'd')
    await user.type(screen.getByTestId('cfg-map-time'), 't')
    await user.type(screen.getByTestId('cfg-in-values'), 'ENTER, 0')
    await user.click(screen.getByTestId('device-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'generic_pull',
      config: { base_url: 'https://other.example', records_path: 'payload.rows', in_values: ['ENTER', '0'], mapping: { pin: 'emp.code', date: 'd', time: 't' } },
    })))
  })

  it('«اختبار الاتصال» و«اسحب الآن» يظهران فقط لمصادر السحب ويمرران المصدر والنافذة', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    expect(screen.queryByTestId('pull-now-ZK-001')).not.toBeInTheDocument() // ADMS لا يُسحب منه
    expect(screen.getByTestId('pull-now-API-01')).toBeInTheDocument()
    const panel = screen.getByTestId('pull-panel-API-01')
    const from = within(panel).getByTestId('pull-from') as HTMLInputElement
    const to = within(panel).getByTestId('pull-to') as HTMLInputElement
    await user.clear(from); await user.type(from, '2026-09-01')
    await user.clear(to); await user.type(to, '2026-09-07')
    await user.click(screen.getByTestId('test-source-API-01'))
    expect(mockTest).toHaveBeenCalledWith(
      { deviceId: 'd2', from: '2026-09-01T00:00:00.000Z', to: '2026-09-07T23:59:59.999Z' }, expect.anything(),
    )
    await user.click(screen.getByTestId('pull-now-API-01'))
    expect(mockPull).toHaveBeenCalledWith({ deviceId: 'd2', from: '2026-09-01T00:00:00.000Z', to: '2026-09-07T23:59:59.999Z' })
  })

  it('نتيجة اختبار الاتصال تُعرض بعدد السجلات والعينة', async () => {
    const user = userEvent.setup()
    mockTest.mockImplementation((_v, opts) => opts.onSuccess({
      ok: true, mode: 'lan_pull', available: 12, window: { from: 'a', to: 'b' },
      sample: [{ pin: '7001', at: '2026-09-20T05:00:00.000Z', direction: 'in' }],
    }))
    render(<BiometricPage />)
    await user.click(screen.getByTestId('test-source-LAN-01'))
    expect(await screen.findByTestId('test-result')).toHaveTextContent('12 سجلاً')
    expect(screen.getByTestId('test-result')).toHaveTextContent('7001@')
  })

  it('زر معالجة دفعات ADMS يستدعي المعالجة', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('process-pushes'))
    expect(mockProcess).toHaveBeenCalledWith(500)
  })

  it('تعديل إعدادات مصدر قائم يحفظ النمط والتهيئة المنظّفة', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('device-edit-LAN-01'))
    const panel = screen.getByTestId('edit-panel-LAN-01')
    await user.clear(within(panel).getByTestId('cfg-base-url'))
    await user.type(within(panel).getByTestId('cfg-base-url'), 'http://10.1.1.9/')
    await user.type(within(panel).getByTestId('cfg-path'), 'cgi-bin/attlog')
    await user.click(within(panel).getByTestId('edit-save'))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({
      id: 'd3', name: 'جهاز المخزن', mode: 'lan_pull', config: { base_url: 'http://10.1.1.9/', path: 'cgi-bin/attlog' }, timezone_offset: '+04:00',
    }))
  })

  it('فلتر الأنماط يحصر البطاقات ويعرض العدادات', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    expect(screen.getByTestId('mode-filter-all')).toHaveTextContent('(3)')
    expect(screen.getByTestId('mode-filter-app_api_pull')).toHaveTextContent('(1)')
    await user.click(screen.getByTestId('mode-filter-lan_pull'))
    expect(screen.getByTestId('devices-grid').querySelectorAll('[data-testid^="source-card-"]')).toHaveLength(1)
    expect(screen.getByTestId('source-card-LAN-01')).toBeInTheDocument()
  })

  it('سجل العمليات يعرض العدادات والحالة والخطأ لكل عملية', () => {
    render(<BiometricPage />)
    const log = screen.getByTestId('pull-log')
    const ok = within(log).getByTestId('pull-row-p1')
    expect(ok).toHaveTextContent('ناجح')
    expect(ok).toHaveTextContent('40')
    expect(ok).toHaveTextContent('38')
    const failed = within(log).getByTestId('pull-row-p2')
    expect(failed).toHaveTextContent('فاشل')
    expect(failed).toHaveTextContent('BIO_SOURCE_UNREACHABLE')
  })

  it('يعرض حالة فارغة للسجل عند غياب العمليات', () => {
    mockPulls.mockReturnValue({ data: [], isLoading: false })
    render(<BiometricPage />)
    expect(screen.getByTestId('pull-log-empty')).toBeInTheDocument()
  })

  it('منطقة وقت الجهاز: افتراضي بغداد +03:00، تُعرض على البطاقة، وتُرفض الصيغة الخاطئة', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    expect(within(screen.getByTestId('source-card-LAN-01')).getByTestId('source-tz-badge')).toHaveTextContent('UTC+04:00')
    await user.click(screen.getByTestId('toggle-device-form'))
    expect(screen.getByTestId('device-tz')).toHaveValue('+03:00')
    await user.type(screen.getByTestId('device-sn'), 'CL-1')
    await user.type(screen.getByTestId('device-name'), 'جهاز')
    await user.clear(screen.getByTestId('device-tz'))
    await user.type(screen.getByTestId('device-tz'), '3')
    await user.click(screen.getByTestId('device-submit'))
    expect(await screen.findByTestId('device-form-error')).toHaveTextContent('±HH:MM')
    expect(mockCreate).not.toHaveBeenCalled()
    await user.clear(screen.getByTestId('device-tz'))
    await user.type(screen.getByTestId('device-tz'), '+04:30')
    await user.click(screen.getByTestId('device-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ timezone_offset: '+04:30' })))
  })

  it('تعديل منطقة وقت جهاز ADMS قائم يُحفظ', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('device-edit-ZK-001'))
    const panel = screen.getByTestId('edit-panel-ZK-001')
    const tz = within(panel).getByTestId('edit-tz')
    expect(tz).toHaveValue('+03:00')
    await user.clear(tz); await user.type(tz, '+02:00')
    await user.click(within(panel).getByTestId('edit-save'))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1', mode: 'adms_push', config: {}, timezone_offset: '+02:00' })))
  })

  it('تعطيل/تفعيل المصدر ما زال يعمل', async () => {
    const user = userEvent.setup()
    render(<BiometricPage />)
    await user.click(screen.getByTestId('device-toggle-ZK-001'))
    expect(mockToggle).toHaveBeenCalledWith({ id: 'd1', active: false })
  })
})
