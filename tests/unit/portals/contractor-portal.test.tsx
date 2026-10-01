import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  add: vi.fn(), remove: vi.fn(), checkin: vi.fn(), mark: vi.fn(), markAll: vi.fn(),
  me: {} as Record<string, unknown>, workers: [] as Record<string, unknown>[],
}))
const baseMe = {
  user_id: 'u1', full_name: 'متعهد أرخيته', manager_user_id: 'm1', manager_name: 'مسؤول الكرادة', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning',
  workers_count: 2, today: '2026-09-29', checked_in_today: false, checkin_at: null, in_zone: null, selfie_path: null, team_photo_path: null,
  today_present: 0, today_absent: 0, today_unmarked: 2, month_present: 20, month_absent: 3, zone_defined: true,
}
const baseWorkers = [
  { id: 'w1', full_name: 'عامل أول', phone: '0781', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', created_at: '2026-09-01T00:00:00Z', status: null, marked_at: null, month_present: 10, month_absent: 1 },
  { id: 'w2', full_name: 'عامل ثانٍ', phone: null, sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', created_at: '2026-09-01T00:00:00Z', status: null, marked_at: null, month_present: 10, month_absent: 2 },
]
vi.mock('@features/contractors/hooks', () => ({
  useContractorMe: () => ({ data: h.me, isLoading: false }),
  useContractorWorkers: () => ({ data: h.workers, isLoading: false }),
  useContractorMonthGrid: () => ({ data: [{ worker_id: 'w1', full_name: 'عامل أول', days: { '1': 'present', '2': 'absent' }, present_days: 10, absent_days: 1 }] }),
  useContractorPhotoUrl: () => ({ data: 'https://signed/x.jpg' }),
  useAddWorker: () => ({ mutate: h.add, isPending: false }),
  useRemoveWorker: () => ({ mutate: h.remove, isPending: false }),
  useContractorCheckin: () => ({ mutate: h.checkin, isPending: false }),
  useMarkAttendance: () => ({ mutate: h.mark, isPending: false }),
  useMarkAll: () => ({ mutate: h.markAll, isPending: false }),
}))
import Dashboard from '@portals/employee/pages/Dashboard/ContractorDashboard'
import Team from '@portals/employee/pages/Team/ContractorTeamPage'
import Attendance from '@portals/employee/pages/Attendance/ContractorAttendancePage'
URL.createObjectURL = () => 'blob:preview'
const gumMock = vi.fn((_c: MediaStreamConstraints) => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream))
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gumMock } })
Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() })
function mockCanvas() {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() })) as never
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['x'], { type: 'image/jpeg' })) }
}
async function snapVia(testId: string) {
  mockCanvas()
  fireEvent.click(screen.getByTestId(`${testId}-open`))
  await waitFor(() => expect(screen.getByTestId(`${testId}-snap`)).toBeEnabled())
  await act(async () => { fireEvent.click(screen.getByTestId(`${testId}-snap`)) })
  await waitFor(() => expect(screen.queryByTestId(`${testId}-camera`)).toBeNull())
}
URL.revokeObjectURL = () => undefined
const wrap = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)
const geoOk = (lat = 33.3, lng = 44.4) => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
  getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void) => ok({ coords: { latitude: lat, longitude: lng, accuracy: 7 } }),
} })

describe('بوابة المتعهد (00158)', () => {
  beforeEach(() => { h.me = { ...baseMe }; h.workers = baseWorkers.map((w) => ({ ...w })); h.add.mockReset(); h.remove.mockReset(); h.checkin.mockReset(); h.mark.mockReset(); h.markAll.mockReset(); geoOk() })

  it('الرئيسية: هويتي ومنطقتي، عدّادات اليوم، تنبيه عدم إثبات التواجد (وليس حضوراً بديلاً عن البصمة)، وشبكة الشهر', () => {
    wrap(<Dashboard />)
    expect(screen.getByTestId('my-area')).toHaveTextContent('أرخيته')
    expect(screen.getByTestId('my-manager')).toHaveTextContent('مسؤول الكرادة')
    expect(screen.getByTestId('stat-workers')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-unmarked')).toHaveTextContent('2')
    expect(screen.getByTestId('checkin-status')).toHaveTextContent('لم تُثبت تواجدك في موقع عملك اليوم بعد')
    expect(screen.getByTestId('checkin-status')).toHaveTextContent('حضورك الرسمي يُحتسب بالبصمة')
    expect(screen.getByTestId('checkin-status')).not.toHaveTextContent('سجّل حضورك')
    expect(screen.getByTestId('grid-w1').querySelectorAll('[title="حاضر"]')).toHaveLength(1)
    expect(screen.getByTestId('grid-w1').querySelectorAll('[title="غائب"]')).toHaveLength(1)
  })

  it('الرئيسية بعد الحضور: الوقت وحالة النطاق', () => {
    h.me = { ...baseMe, checked_in_today: true, checkin_at: '2026-09-29T04:05:00Z', in_zone: false }
    wrap(<Dashboard />)
    expect(screen.getByTestId('checkin-status')).toHaveTextContent('أثبتَّ تواجدك في الموقع اليوم')
    expect(screen.getByTestId('checkin-status')).toHaveTextContent('خارج نطاق المنطقة')
  })

  it('فريقي: العدد، الإضافة بالقاطع/المنطقة التلقائيين، الإزالة بتأكيد', () => {
    wrap(<Team />)
    expect(screen.getByTestId('team-count')).toHaveTextContent('2')
    expect(screen.getByTestId('add-worker-form')).toHaveTextContent('قاطع الكرادة / أرخيته')
    expect(screen.getByTestId('add-worker')).toBeDisabled()
    fireEvent.change(screen.getByTestId('worker-name'), { target: { value: 'عامل جديد' } })
    fireEvent.change(screen.getByTestId('worker-phone'), { target: { value: '0790' } })
    fireEvent.click(screen.getByTestId('add-worker'))
    expect(h.add).toHaveBeenCalledWith({ fullName: 'عامل جديد', phone: '0790' }, expect.any(Object))
    fireEvent.click(screen.getByTestId('remove-w1'))
    fireEvent.change(screen.getByTestId('remove-reason'), { target: { value: 'ترك العمل' } })
    fireEvent.click(screen.getByTestId('confirm-remove'))
    expect(h.remove).toHaveBeenCalledWith({ workerId: 'w1', reason: 'ترك العمل' }, expect.any(Object))
  })

  it('الحضورية قبل تسجيل المتعهد: الخطوات الثلاث، الزر معطل حتى اكتمالها، وأزرار العمال مقفلة', async () => {
    wrap(<Attendance />)
    await waitFor(() => expect(screen.getByTestId('geo-text')).toHaveTextContent('تم التقاط الموقع'))
    expect(screen.getByTestId('checkin-submit')).toBeDisabled()
    expect(screen.getByTestId('checkin-missing')).toHaveTextContent('يلزم: صورتك، صورة العمال')
    expect(screen.getByTestId('present-w1')).toBeDisabled()
    expect(screen.getByTestId('locked-note')).toBeInTheDocument()
    // لا يوجد أي input لاختيار ملف — الالتقاط حصراً عبر الكاميرا داخل التطبيق
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByTestId('selfie-input-open')).toBeInTheDocument()
    expect(screen.getByTestId('team-input-open')).toBeInTheDocument()
    await snapVia('selfie-input')
    expect(screen.getByTestId('checkin-missing')).toHaveTextContent('يلزم: صورة العمال')
    await snapVia('team-input')
    expect(screen.getByTestId('checkin-submit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('checkin-submit'))
    expect(h.checkin).toHaveBeenCalledWith({ latitude: 33.3, longitude: 44.4, accuracy: 7, selfie: expect.any(File), teamPhoto: expect.any(File) }, expect.any(Object))
  })

  it('السلفي يفتح الكاميرا الأمامية وصورة العمال الخلفية', async () => {
    gumMock.mockClear()
    wrap(<Attendance />)
    await waitFor(() => expect(screen.getByTestId('geo-text')).toHaveTextContent('تم التقاط الموقع'))
    fireEvent.click(screen.getByTestId('selfie-input-open'))
    await waitFor(() => expect(gumMock).toHaveBeenCalled())
    expect(JSON.stringify(gumMock.mock.calls[0]?.[0])).toContain('"facingMode":{"exact":"user"}')
    fireEvent.click(screen.getByTestId('selfie-input-camera-close'))
    fireEvent.click(screen.getByTestId('team-input-open'))
    await waitFor(() => expect(gumMock).toHaveBeenCalledTimes(2))
    expect(JSON.stringify(gumMock.mock.calls[1]?.[0])).toContain('"facingMode":{"exact":"environment"}')
  })

  it('رفض إذن الموقع يظهر رسالة واضحة وزر إعادة المحاولة، ويبقى الزر معطلاً', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok: unknown, err: (e: { code: number }) => void) => err({ code: 1 }) } })
    wrap(<Attendance />)
    await waitFor(() => expect(screen.getByTestId('geo-text')).toHaveTextContent('رفضت إذن الموقع'))
    expect(screen.getByTestId('geo-retry')).toBeInTheDocument()
    expect(screen.getByTestId('checkin-missing')).toHaveTextContent('الموقع')
  })

  it('بعد تسجيل المتعهد: الصور والنطاق، حاضر/غائب لكل عامل، وتعليم الجميع حاضرين', () => {
    h.me = { ...baseMe, checked_in_today: true, checkin_at: '2026-09-29T04:05:00Z', in_zone: true, selfie_path: 'u/s.jpg', team_photo_path: 'u/t.jpg' }
    h.workers = [{ ...baseWorkers[0], status: 'present', marked_at: '2026-09-29T04:10:00Z' }, { ...baseWorkers[1] }]
    wrap(<Attendance />)
    expect(screen.queryByTestId('checkin-form')).toBeNull()
    expect(screen.getByTestId('zone-label')).toHaveTextContent('داخل نطاق المنطقة')
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByTestId('unmarked-badge')).toHaveTextContent('1 بلا تسجيل')
    expect(screen.getByTestId('att-w1')).toHaveTextContent('حاضر ·')
    fireEvent.click(screen.getByTestId('absent-w2'))
    expect(h.mark).toHaveBeenCalledWith({ workerId: 'w2', status: 'absent' })
    fireEvent.click(screen.getByTestId('mark-all-present'))
    expect(h.markAll).toHaveBeenCalledWith({ status: 'present' })
  })

  it('بلا تعيين: رسالة واضحة في الوحدات الثلاث', () => {
    h.me = null as never
    wrap(<Dashboard />); expect(screen.getByText('لم تُعيَّن بعد متعهداً على منطقة')).toBeInTheDocument()
  })
})
