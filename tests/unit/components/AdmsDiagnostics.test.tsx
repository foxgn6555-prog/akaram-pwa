/** تشخيص ADMS (00173): مساعدات الفحص + اللوحة (فحوصات DB، اختبار المسار من المتصفح، حفظ عنوان الجهاز) */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdmsDiagnosticsPanel } from '@portals/it/pages/Integrations/biometric/AdmsDiagnosticsPanel'
import { normalizeProbeBase, probeAdmsEndpoint } from '@portals/it/pages/Integrations/biometric/adms-probe'

const mockDiag = vi.fn()
const mockUpdate = vi.fn(async () => undefined)
const mockRefetch = vi.fn()
vi.mock('@features/integrations', () => ({
  useBiometricDiagnostics: () => mockDiag(),
  useUpdateBiometricDevice: () => ({ mutateAsync: mockUpdate, isPending: false }),
}))

const device = { id: 'd1', serial_number: 'SFAA1', name: 'المدخل', mode: 'adms_push', is_active: true, public_url: null } as never
const DIAG = {
  device_id: 'd1', serial_number: 'SFAA1', name: 'المدخل', mode: 'adms_push', is_active: true, public_url: null, timezone_offset: '+03:00',
  last_seen_at: '2026-10-04T15:00:00Z', last_registered_at: '2026-10-04T14:00:00Z', last_heartbeat_at: null, heartbeat_count: 0,
  last_punch_at: '2026-10-04T15:17:00Z', last_received_at: '2026-10-04T15:17:05Z', punches_total: 3, punches_24h: 3,
  unmatched_pins: 1, users_named: 0, users_query_pending: true, server_time: '2026-10-04T16:00:00Z',
  checks: [
    { key: 'registered', label: 'الجهاز سجّل نفسه', status: 'ok', at: '2026-10-04T14:00:00Z', hint: null },
    { key: 'heartbeat', label: 'نبض دوري', status: 'fail', at: null, count: 0, hint: 'سجّل لكنه لا ينبض' },
    { key: 'push', label: 'بصمات وصلت', status: 'ok', at: '2026-10-04T15:17:05Z', count: 3, count_24h: 3, last_punch_at: '2026-10-04T15:17:00Z', hint: null },
    { key: 'users', label: 'أسماء المستخدمين', status: 'warn', count: 0, pending: true, hint: 'الطلب معلّق' },
    { key: 'unmatched', label: 'PIN بلا موظف', status: 'warn', count: 1, hint: 'اربطها' },
  ],
  events: [{ at: '2026-10-04T14:00:00Z', endpoint: 'adms/register', status: 'success', payload: { sn: 'SFAA1', known: true }, error: null },
           { at: '2026-10-04T14:00:10Z', endpoint: 'adms/command', status: 'success', payload: { sn: 'SFAA1', cmd: 'DATA QUERY USERINFO' }, error: null }],
}

describe('normalizeProbeBase', () => {
  it('يقبل مضيفاً فقط أو رابطاً كاملاً ويزيل الشرطة الأخيرة', () => {
    expect(normalizeProbeBase('akaram-bio.x.workers.dev')).toBe('https://akaram-bio.x.workers.dev')
    expect(normalizeProbeBase('https://a.b.co/functions/v1/adms-receiver/')).toBe('https://a.b.co/functions/v1/adms-receiver')
    expect(normalizeProbeBase('   ')).toBeNull()
    expect(normalizeProbeBase('http://[bad')).toBeNull()
  })
})

describe('probeAdmsEndpoint', () => {
  const resp = (body: string, status = 200) => Promise.resolve(new Response(body, { status }))
  it('ناجح عند رد ADMS الصحيح، ويميّز «OK» العام كفشل مسار', async () => {
    const f = vi.fn(() => resp('GET OPTION FROM: PLATFORM-TEST\nATTLOGStamp=0'))
    const r = await probeAdmsEndpoint('https://x.y', f as never)
    expect(r.status).toBe('ok')
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/x\.y\/iclock\/cdata\?SN=PLATFORM-TEST&options=all/)
    expect((await probeAdmsEndpoint('https://x.y', (() => resp('OK')) as never)).detail).toMatch(/مسار \/iclock لا يصل/)
    expect((await probeAdmsEndpoint('https://x.y', (() => resp('nope', 404)) as never)).status).toBe('fail')
    expect((await probeAdmsEndpoint('https://x.y', (() => Promise.reject(new TypeError('Failed to fetch'))) as never))).toMatchObject({ status: 'warn', detail: expect.stringContaining('CSP') })
    expect((await probeAdmsEndpoint('https://a.akaram.deno.net', (() => Promise.reject(new TypeError('Failed to fetch'))) as never)).status).toBe('fail')
  })
})

describe('AdmsDiagnosticsPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); mockDiag.mockReturnValue({ data: DIAG, isLoading: false, error: null, refetch: mockRefetch, isFetching: false }) })

  it('يعرض الفحوصات الخمسة بحالاتها وتلميحاتها وآخر الأحداث', () => {
    render(<AdmsDiagnosticsPanel device={device} functionUrl="https://p.supabase.co/functions/v1/adms-receiver" />)
    expect(screen.getByTestId('diag-check-registered')).toHaveAttribute('data-status', 'ok')
    expect(screen.getByTestId('diag-check-heartbeat')).toHaveAttribute('data-status', 'fail')
    expect(screen.getByTestId('diag-check-heartbeat')).toHaveTextContent('سجّل لكنه لا ينبض')
    expect(screen.getByTestId('diag-check-push')).toHaveTextContent('3')
    expect(screen.getByTestId('diag-check-unmatched')).toHaveAttribute('data-status', 'warn')
    expect(within(screen.getByTestId('diag-events')).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByTestId('diag-events')).toHaveTextContent('DATA QUERY USERINFO')
  })

  it('«اختبر الآن» يفحص المنصة ثم العنوان المُدخل في الجهاز ويعرض النتيجتين، و«حفظ» يخزّن public_url', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) =>
      Promise.resolve(new Response(String(url).includes('workers.dev') ? 'OK' : 'GET OPTION FROM: PLATFORM-TEST'))) as never)
    render(<AdmsDiagnosticsPanel device={device} functionUrl="https://p.supabase.co/functions/v1/adms-receiver" />)
    await user.type(screen.getByTestId('diag-public-url'), 'akaram-bio.foxgn.workers.dev')
    await user.click(screen.getByTestId('diag-save-url'))
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'd1', public_url: 'akaram-bio.foxgn.workers.dev' })
    await user.click(screen.getByTestId('diag-run-probes'))
    await waitFor(() => expect(screen.getByTestId('probe-proxy')).toBeInTheDocument())
    expect(screen.getByTestId('probe-platform')).toHaveAttribute('data-status', 'ok')
    expect(screen.getByTestId('probe-proxy')).toHaveAttribute('data-status', 'fail')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(mockRefetch).toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('يعرض خطأ التحميل بوضوح', () => {
    mockDiag.mockReturnValue({ data: undefined, isLoading: false, error: new Error('BIO_FORBIDDEN'), refetch: mockRefetch, isFetching: false })
    render(<AdmsDiagnosticsPanel device={device} functionUrl="https://p" />)
    expect(screen.getByTestId('diag-error')).toHaveTextContent('BIO_FORBIDDEN')
  })
})
