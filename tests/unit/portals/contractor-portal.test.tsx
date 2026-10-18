import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  checkin: vi.fn(), setCount: vi.fn(),
  me: {} as Record<string, unknown>,
}))
const baseMe = {
  user_id: 'u1', full_name: 'متعهد أرخيته', manager_user_id: 'm1', manager_name: 'مسؤول الكرادة', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning',
  today: '2026-09-29', checked_in_today: false, checkin_at: null, in_zone: null, selfie_path: null, team_photo_path: null,
  today_headcount: null, month_days: 20, month_headcount_total: 300, month_locked: false, zone_defined: true,
}
vi.mock('@features/live-tracking/LiveShareCard', () => ({ LiveShareCard: () => <div data-testid="live-share-card" /> }))
vi.mock('@features/contractors/hooks', () => ({
  useContractorMe: () => ({ data: h.me, isLoading: false }),
  useContractorMyMonth: () => ({ data: [{ log_date: '2026-09-28', checked_in: true, checkin_at: '2026-09-28T04:00:00Z', in_zone: true, headcount: 16 }, { log_date: '2026-09-29', checked_in: false, checkin_at: null, in_zone: null, headcount: null }] }),
  useContractorPhotoUrl: () => ({ data: 'https://signed/x.jpg' }),
  useContractorCheckin: () => ({ mutate: h.checkin, isPending: false }),
  useSetHeadcount: () => ({ mutate: h.setCount, isPending: false }),
}))
import Dashboard from '@portals/employee/pages/Dashboard/ContractorDashboard'
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

describe('بوابة المتعهد (00158 → 00258: العدد بدل قائمة العمال)', () => {
  beforeEach(() => { h.me = { ...baseMe }; h.checkin.mockReset(); h.setCount.mockReset(); geoOk() })

  it('الرئيسية: هويتي ومنطقتي، العدد اليوم وأيام الشهر، تنبيه عدم إثبات التواجد (وليس حضوراً بديلاً عن البصمة)، وسجل الشهر بالأعداد', () => {
    wrap(<Dashboard />)
    expect(screen.getByTestId('my-area')).toHaveTextContent('أرخيته')
    expect(screen.getByTestId('my-manager')).toHaveTextContent('مسؤول الكرادة')
    expect(screen.getByTestId('stat-headcount')).toHaveTextContent('—')
    expect(screen.getByTestId('stat-month-days')).toHaveTextContent('20')
    expect(screen.getByTestId('stat-month-total')).toHaveTextContent('300')
    expect(screen.getByTestId('checkin-status')).toHaveTextContent('لم تُثبت تواجدك في موقع عملك اليوم بعد')
    expect(screen.getByTestId('checkin-status')).toHaveTextContent('حضورك الرسمي يُحتسب بالبصمة')
    expect(screen.getByTestId('day-2026-09-28')).toHaveTextContent('16')
    expect(screen.getByTestId('day-2026-09-28')).toHaveTextContent('15') // العمال = العدد − 1
    expect(screen.queryByText('حاضر')).toBeNull()
    expect(screen.queryByText('غائب')).toBeNull()
  })

  it('الرئيسية بعد الحضور: الوقت وحالة النطاق', () => {
    h.me = { ...baseMe, checked_in_today: true, checkin_at: '2026-09-29T04:05:00Z', in_zone: false, today_headcount: 12 }
    wrap(<Dashboard />)
    expect(screen.getByTestId('checkin-status')).toHaveTextContent('أثبتَّ تواجدك في الموقع اليوم')
    expect(screen.getByTestId('checkin-status')).toHaveTextContent('خارج نطاق المنطقة')
    expect(screen.getByTestId('stat-headcount')).toHaveTextContent('12')
  })

  it('قبل الإثبات: الخطوات الأربع (موقع، سلفي، العمال، العدد)، الملاحظة أن العدد يشمل المتعهد، والزر معطل حتى اكتمالها ثم يُرسل العدد', async () => {
    wrap(<Attendance />)
    expect(screen.getByTestId('headcount-note')).toHaveTextContent('العدد الذي تكتبه يشملك أنت')
    expect(screen.getByTestId('headcount-note')).toHaveTextContent('ليس حضورك الوظيفي')
    await waitFor(() => expect(screen.getByTestId('geo-text')).toHaveTextContent('تم التقاط الموقع'))
    expect(screen.getByTestId('checkin-submit')).toBeDisabled()
    expect(screen.getByTestId('checkin-missing')).toHaveTextContent('يلزم: صورتك، صورة العمال، العدد (1 فأكثر)')
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.queryByText('إضافة عامل')).toBeNull()
    expect(screen.queryByText('تعليم الجميع حاضرين')).toBeNull()
    await snapVia('selfie-input')
    await snapVia('team-input')
    expect(screen.getByTestId('checkin-missing')).toHaveTextContent('يلزم: العدد (1 فأكثر)')
    fireEvent.change(screen.getByTestId('headcount-input'), { target: { value: '0' } })
    expect(screen.getByTestId('checkin-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('headcount-input'), { target: { value: '15' } })
    expect(screen.getByTestId('count-hint')).toHaveTextContent('= أنت + 14 عاملاً')
    expect(screen.getByTestId('checkin-submit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('checkin-submit'))
    expect(h.checkin).toHaveBeenCalledWith({ latitude: 33.3, longitude: 44.4, accuracy: 7, selfie: expect.any(File), teamPhoto: expect.any(File), headcount: 15 }, expect.any(Object))
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

  it('بعد الإثبات: الصور والنطاق والعدد المسجّل، وتعديل العدد اليوم نفسه', () => {
    h.me = { ...baseMe, checked_in_today: true, checkin_at: '2026-09-29T04:05:00Z', in_zone: true, selfie_path: 'u/s.jpg', team_photo_path: 'u/t.jpg', today_headcount: 16 }
    wrap(<Attendance />)
    expect(screen.queryByTestId('checkin-form')).toBeNull()
    expect(screen.getByTestId('zone-label')).toHaveTextContent('داخل نطاق المنطقة')
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByTestId('today-headcount')).toHaveTextContent('16')
    expect(screen.getByTestId('today-count')).toHaveTextContent('عمال: 15')
    expect(screen.getByTestId('headcount-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('headcount-edit'), { target: { value: '17' } })
    fireEvent.click(screen.getByTestId('headcount-save'))
    expect(h.setCount).toHaveBeenCalledWith({ headcount: 17 }, expect.any(Object))
  })

  it('الشهر معتمد (مقفل): رسالة ولا تعديل', () => {
    h.me = { ...baseMe, checked_in_today: true, checkin_at: '2026-09-29T04:05:00Z', in_zone: true, selfie_path: 'u/s.jpg', team_photo_path: 'u/t.jpg', today_headcount: 16, month_locked: true }
    wrap(<Attendance />)
    expect(screen.getByTestId('month-locked')).toBeInTheDocument()
    expect(screen.queryByTestId('headcount-edit')).toBeNull()
  })

  it('بلا تعيين: رسالة واضحة', () => {
    h.me = null as never
    wrap(<Dashboard />); expect(screen.getByText('لم تُعيَّن بعد متعهداً على منطقة')).toBeInTheDocument()
  })
})
