/** 00168 واجهات: صفحة المواطن العامة (دخول → شكوى ثلاثية الاسم + موقع → شكاواي → دعم مباشر) · غرفة العمليات (قائمة/إسناد/طابور/رابط النشر) · مسؤول القسم · عقود المسارات والتقارير */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => ({
  signIn: vi.fn(async () => ({ token: 'tok-1', full_name: 'علي حسين كاظم', phone: '07701234567' })),
  submit: vi.fn(async () => ({ id: 'c1', ref_no: 'CC-2026-00001', status: 'new', status_label: 'جديدة', photos: [], events: [] })),
  upload: vi.fn(async (token: string, _b: Blob, i: number) => `${token}/${i}.jpg`),
  mine: vi.fn(async () => [] as unknown[]),
  chatRequest: vi.fn(async () => ({ id: 's1', status: 'waiting', queue_position: 1, messages: [{ id: 1, sender: 'system', body: 'تم استلام طلبك', at: '2026-10-02T10:00:00Z' }], agent_name: null, rating: null })),
  chatState: vi.fn(async () => null as unknown),
  chatSend: vi.fn(async () => 2),
  opsList: vi.fn(async () => [] as unknown[]),
  opsAssign: vi.fn(async () => ({})),
  setStatus: vi.fn(async () => ({})),
  opsQueue: vi.fn(async () => [] as unknown[]),
  opsMessages: vi.fn(async () => ({ id: 's1', status: 'waiting', citizen_name: 'علي', phone: '0770', messages: [] })),
  opsAccept: vi.fn(async () => ({})),
  mineMgr: vi.fn(async () => [] as unknown[]),
  report: vi.fn(async () => ({
    period: { from: '2026-10-01', to: '2026-10-02', days: 2 },
    complaints: { total: 5, new: 4, in_progress: 0, on_hold: 0, resolved: 1, unassigned_over_24h: 2, avg_resolution_hours: 3.5, avg_assign_hours: 1, avg_rating: 5, rated: 1, with_location: 1, with_photos: 1, by_assignee: [{ name: 'مسؤول الكرادة', total: 1, resolved: 1, on_hold: 0 }], series: [], oldest_open: [{ ref_no: 'CC-2026-00002', name: 'س', status: 'new', status_label: 'جديدة', age_hours: 30, assignee: null }] },
    support: { sessions: 2, answered: 1, abandoned: 0, waiting_now: 1, avg_wait_minutes: 2, avg_first_reply_minutes: 3, avg_rating: 4, rated: 1, messages: 6, by_agent: [{ name: 'موظف', sessions: 1, avg_rating: 4 }] },
    generated_at: '2026-10-02T10:00:00Z',
  })),
}))
vi.mock('@sdk/citizen.sdk', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    citizen: {
      info: async () => ({ org_name: 'شركة جزيرة الأكارم', about: 'نبذة', phones: [{ label: 'الخط الساخن', number: '07700000000' }], hours: 'من 8 إلى 8', address: 'بغداد', support_online: true }),
      signIn: h.signIn, submitComplaint: h.submit, uploadPhoto: h.upload, myComplaints: h.mine, rateComplaint: vi.fn(),
      chatRequest: h.chatRequest, chatState: h.chatState, chatSend: h.chatSend, chatClose: vi.fn(async () => undefined), chatRate: vi.fn(),
      opsList: h.opsList, opsManagers: async () => [{ user_id: 'm1', full_name: 'مسؤول الكرادة', department_name: 'الكرادة' }], opsAssign: h.opsAssign, setStatus: h.setStatus, addNote: vi.fn(),
      photoUrls: async () => ({}), opsQueue: h.opsQueue, opsAccept: h.opsAccept, opsMessages: h.opsMessages, opsSend: vi.fn(), opsClose: vi.fn(), opsSaveSettings: vi.fn(),
      mine: h.mineMgr, report: h.report,
    },
    compressImage: async (f: File) => f,
  }
})

import CitizenPortalPage from '@portals/public/pages/Citizen/CitizenPortalPage'
import OpsCitizenComplaintsPage from '@portals/ops-room/pages/CitizenComplaints/OpsCitizenComplaintsPage'
import ManagerCitizenComplaintsPage from '@portals/manager/pages/CitizenComplaints/ManagerCitizenComplaintsPage'
import { CitizenReportPanel } from '@components/citizen/CitizenReportPanel'
import { CITIZEN_SESSION_KEY, citizenErrorMessage } from '@sdk/citizen.sdk'
import { PUBLIC_ROUTES } from '@router/routes.config'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { REPORT_SECTIONS } from '@features/executive/lib/portal'

function wrap(ui: ReactNode, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>)
}
const COMPLAINT = (o: Record<string, unknown> = {}) => ({
  id: 'c1', ref_no: 'CC-2026-00001', full_name: 'علي حسين كاظم', phone: '07701234567', details: 'نفايات متراكمة منذ أسبوع قرب المدرسة', lat: 33.3, lng: 44.4, address_text: 'الكرادة',
  status: 'new', status_label: 'جديدة', assigned_to: null, assignee_name: null, assigned_at: null, hold_reason: null, resolution_note: null, resolved_at: null, citizen_rating: null,
  created_at: new Date(Date.now() - 30 * 36e5).toISOString(), updated_at: '2026-10-02T10:00:00Z', photos: [{ id: 'p1', path: 'tok-1/a.jpg' }], events: [{ kind: 'created', from: null, to: 'new', to_label: 'جديدة', note: null, actor: 'علي', at: '2026-10-02T09:00:00Z' }], ...o,
})

beforeEach(() => { if (!URL.createObjectURL) { URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => undefined }
  localStorage.clear(); vi.clearAllMocks(); h.opsList.mockResolvedValue([]); h.mine.mockResolvedValue([]); h.chatState.mockResolvedValue(null) })

describe('صفحة المواطن العامة /citizen', () => {
  it('مسار عام بلا دخول + شعار الشركة + الدخول بالاسم والهاتف يحفظ الجلسة ويفتح الرئيسية بأربع بطاقات', async () => {
    expect(PUBLIC_ROUTES.some((r) => r.path === '/citizen')).toBe(true)
    wrap(<CitizenPortalPage />, '/citizen')
    expect(screen.getAllByAltText(/شعار شركة جزيرة الأكارم|^$/).length).toBeGreaterThan(0)
    const form = screen.getByTestId('citizen-signin')
    fireEvent.change(within(form).getByPlaceholderText('مثال: علي حسين كاظم'), { target: { value: 'علي حسين كاظم' } })
    fireEvent.change(within(form).getByPlaceholderText('07XX XXX XXXX'), { target: { value: '0770 123 4567' } })
    fireEvent.submit(form)
    await waitFor(() => expect(screen.getByTestId('citizen-home')).toBeInTheDocument())
    expect(h.signIn).toHaveBeenCalledWith('علي حسين كاظم', '0770 123 4567')
    expect(JSON.parse(localStorage.getItem(CITIZEN_SESSION_KEY) ?? '{}').token).toBe('tok-1')
    for (const v of ['complaint', 'support', 'mine', 'about']) expect(screen.getByTestId(`citizen-card-${v}`)).toBeInTheDocument()
    expect(screen.getByText('علي حسين كاظم')).toBeInTheDocument()
  })

  it('خطأ الخادم يُعرض بالعربية (هاتف غير صحيح)', async () => {
    h.signIn.mockRejectedValueOnce(new Error('CITIZEN_PHONE_INVALID'))
    wrap(<CitizenPortalPage />, '/citizen')
    const form = screen.getByTestId('citizen-signin')
    fireEvent.change(within(form).getByPlaceholderText('مثال: علي حسين كاظم'), { target: { value: 'علي حسين' } })
    fireEvent.change(within(form).getByPlaceholderText('07XX XXX XXXX'), { target: { value: '123' } })
    fireEvent.submit(form)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('07XXXXXXXXX'))
    expect(citizenErrorMessage(new Error('x CITIZEN_ASSIGNEE_REQUIRED y'))).toContain('قيد المعالجة')
  })

  it('نموذج الشكوى: زر الإرسال معطّل حتى اسم ثلاثي + تفاصيل؛ الموقع من GPS؛ الصور تُرفع إلى مجلد الرمز ثم تُرسل؛ شاشة رقم المتابعة', async () => {
    localStorage.setItem(CITIZEN_SESSION_KEY, JSON.stringify({ token: 'tok-1', full_name: 'علي حسين', phone: '07701234567' }))
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 33.3152, longitude: 44.3661, accuracy: 12 } }) } })
    wrap(<CitizenPortalPage />, '/citizen?v=complaint')
    const submit = screen.getByTestId('cc-submit')
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('cc-details'), { target: { value: 'نفايات متراكمة منذ أسبوع قرب المدرسة' } })
    expect(submit).toBeDisabled() // الاسم ثنائي
    fireEvent.change(screen.getByTestId('cc-name'), { target: { value: 'علي حسين كاظم' } })
    expect(submit).toBeEnabled()
    fireEvent.click(screen.getByTestId('cc-locate'))
    await waitFor(() => expect(screen.getByText(/33\.3152, 44\.3661/)).toBeInTheDocument())
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('cc-files'), { target: { files: [file] } })
    fireEvent.change(screen.getByTestId('cc-address'), { target: { value: 'شارع 62' } })
    fireEvent.click(submit)
    await waitFor(() => expect(screen.getByTestId('citizen-complaint-done')).toBeInTheDocument())
    expect(h.upload).toHaveBeenCalledWith('tok-1', expect.anything(), 0)
    expect(h.submit).toHaveBeenCalledWith('tok-1', { fullName: 'علي حسين كاظم', details: 'نفايات متراكمة منذ أسبوع قرب المدرسة', lat: 33.3152, lng: 44.3661, address: 'شارع 62', photos: ['tok-1/0.jpg'] })
    expect(screen.getByText('CC-2026-00001')).toBeInTheDocument()
  })

  it('شكاواي: الحالة بالعربية + سبب التعليق + تقييم بعد المعالجة فقط', async () => {
    localStorage.setItem(CITIZEN_SESSION_KEY, JSON.stringify({ token: 'tok-1', full_name: 'علي', phone: '07701234567' }))
    h.mine.mockResolvedValue([COMPLAINT({ status: 'on_hold', status_label: 'معلقة', hold_reason: 'بانتظار آلية' }), COMPLAINT({ id: 'c2', ref_no: 'CC-2026-00002', status: 'resolved', status_label: 'تمت المعالجة', resolution_note: 'رُفعت النفايات' })])
    wrap(<CitizenPortalPage />, '/citizen?v=mine')
    await waitFor(() => expect(screen.getAllByTestId('citizen-complaint-card')).toHaveLength(2))
    expect(screen.getByText('بانتظار آلية')).toBeInTheDocument()
    expect(screen.getByText('رُفعت النفايات')).toBeInTheDocument()
    expect(screen.getAllByTestId('stars')).toHaveLength(1) // التقييم للمنجزة فقط
  })

  it('الدعم الفني: زر طلب المحادثة → نافذة انتظار بدورك في الطابور → إرسال رسالة', async () => {
    localStorage.setItem(CITIZEN_SESSION_KEY, JSON.stringify({ token: 'tok-1', full_name: 'علي', phone: '07701234567' }))
    wrap(<CitizenPortalPage />, '/citizen?v=support')
    const btn = await screen.findByTestId('chat-request')
    expect(btn).toHaveTextContent('طلب المحادثة مع فريق الدعم الفني')
    h.chatState.mockResolvedValue({ id: 's1', status: 'waiting', queue_position: 2, messages: [{ id: 1, sender: 'system', body: 'تم استلام طلبك', at: '2026-10-02T10:00:00Z' }], agent_name: null, rating: null })
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByTestId('chat-window')).toBeInTheDocument())
    expect(screen.getByText(/دورك 2/)).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'الحاوية ممتلئة' } })
    fireEvent.click(screen.getByTestId('chat-send'))
    await waitFor(() => expect(h.chatSend).toHaveBeenCalledWith('tok-1', 'الحاوية ممتلئة'))
  })
})

describe('غرفة العمليات — استقبال الشكاوى', () => {
  it('الوحدة في الشريط الجانبي + القائمة بعدّادات الحالات + تفاصيل مع الخريطة + الإسناد لمسؤول قسم فقط', async () => {
    expect(PORTAL_UNITS[PORTALS.OPS_ROOM].some((u) => u.path === '/ops-room/citizen-complaints')).toBe(true)
    h.opsList.mockResolvedValue([COMPLAINT(), COMPLAINT({ id: 'c2', ref_no: 'CC-2026-00002', status: 'resolved', status_label: 'تمت المعالجة', assigned_to: 'm1', assignee_name: 'مسؤول الكرادة' })])
    wrap(<OpsCitizenComplaintsPage />, '/ops-room/citizen-complaints')
    await waitFor(() => expect(screen.getByTestId('count-new')).toHaveTextContent('1'))
    expect(screen.getByTestId('count-resolved')).toHaveTextContent('1')
    expect(screen.getByText(/بلا إسناد منذ 30 س/)).toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId('cc-list')).getByText('CC-2026-00001'))
    const detail = await screen.findByTestId('cc-detail')
    expect(within(detail).getByTestId('cc-map-link')).toHaveAttribute('href', 'https://www.google.com/maps?q=33.3,44.4')
    expect(within(detail).queryByText('تمت المعالجة')).toBeNull() // لا إنجاز قبل الإسناد
    const assignBtn = within(detail).getByTestId('cc-assign-btn')
    expect(assignBtn).toBeDisabled()
    await waitFor(() => expect(within(detail).getByRole('combobox', { name: 'مسؤول القسم' }).querySelectorAll('option')).toHaveLength(2))
    fireEvent.change(within(detail).getByRole('combobox', { name: 'مسؤول القسم' }), { target: { value: 'm1' } })
    fireEvent.click(assignBtn)
    await waitFor(() => expect(h.opsAssign).toHaveBeenCalledWith('c1', 'm1', undefined))
  })

  it('تعليق الشكوى يتطلب سبباً يظهر للمواطن', async () => {
    h.opsList.mockResolvedValue([COMPLAINT({ status: 'in_progress', status_label: 'قيد المعالجة', assigned_to: 'm1', assignee_name: 'مسؤول الكرادة' })])
    wrap(<OpsCitizenComplaintsPage />, '/ops-room/citizen-complaints?c=c1')
    const detail = await screen.findByTestId('cc-detail')
    fireEvent.click(within(detail).getByText('تعليق'))
    const form = within(detail).getByTestId('cc-action-form')
    expect(form).toHaveTextContent('سبب التعليق (يظهر للمواطن)')
    fireEvent.change(within(form).getByTestId('cc-action-note'), { target: { value: 'بانتظار آلية' } })
    fireEvent.submit(form)
    await waitFor(() => expect(h.setStatus).toHaveBeenCalledWith('c1', 'on_hold', 'بانتظار آلية'))
  })

  it('الدعم المباشر: شارة عدد المنتظرين، الطابور، استلام المحادثة', async () => {
    h.opsQueue.mockResolvedValue([{ id: 's1', status: 'waiting', citizen_name: 'علي حسين كاظم', phone: '07701234567', requested_at: '2026-10-02T10:00:00Z', accepted_at: null, agent_id: null, agent_name: null, mine: false, last_message: 'الحاوية ممتلئة', last_at: '2026-10-02T10:01:00Z', unread: 1 }])
    wrap(<OpsCitizenComplaintsPage />, '/ops-room/citizen-complaints?tab=support')
    await waitFor(() => expect(screen.getByTestId('tab-support')).toHaveTextContent('1'))
    fireEvent.click(await screen.findByTestId('queue-item'))
    const acceptBtn = await screen.findByTestId('chat-accept')
    fireEvent.click(acceptBtn)
    await waitFor(() => expect(h.opsAccept).toHaveBeenCalledWith('s1'))
  })

  it('إعدادات الصفحة: رابط النشر /citizen', async () => {
    wrap(<OpsCitizenComplaintsPage />, '/ops-room/citizen-complaints?tab=settings')
    await waitFor(() => expect(screen.getByTestId('public-url')).toHaveTextContent('/citizen'))
    expect(await screen.findByDisplayValue('من 8 إلى 8')).toBeInTheDocument()
  })
})

describe('مسؤول القسم + التقارير التنفيذية', () => {
  it('مسؤول القسم يرى المسندة إليه بلا خانة إسناد، ويستطيع الإنجاز بنتيجة', async () => {
    expect(PORTAL_UNITS[PORTALS.MANAGER].some((u) => u.path === '/manager/citizen-complaints')).toBe(true)
    h.mineMgr.mockResolvedValue([COMPLAINT({ status: 'in_progress', status_label: 'قيد المعالجة', assigned_to: 'm1', assignee_name: 'أنا' })])
    wrap(<ManagerCitizenComplaintsPage />, '/manager/citizen-complaints?c=c1')
    const detail = await screen.findByTestId('cc-detail')
    expect(within(detail).queryByTestId('cc-assign')).toBeNull()
    fireEvent.click(within(detail).getByText('تمت المعالجة'))
    fireEvent.change(within(detail).getByTestId('cc-action-note'), { target: { value: 'رُفعت النفايات وغُسل الموقع' } })
    fireEvent.submit(within(detail).getByTestId('cc-action-form'))
    await waitFor(() => expect(h.setStatus).toHaveBeenCalledWith('c1', 'resolved', 'رُفعت النفايات وغُسل الموقع'))
  })

  it('قسم «شكاوى المواطنين والدعم» في تقارير المدير المفوض ومعاونه (وليس التنفيذي) + لوحة المؤشرات', async () => {
    expect(REPORT_SECTIONS.admin.some((s) => s.key === 'citizen')).toBe(true)
    expect(REPORT_SECTIONS.deputy.some((s) => s.key === 'citizen')).toBe(true)
    expect(REPORT_SECTIONS.executive.some((s) => s.key === 'citizen')).toBe(false)
    expect(REPORT_SECTIONS.finance.some((s) => s.key === 'citizen')).toBe(false)
    wrap(<CitizenReportPanel from="2026-10-01" to="2026-10-02" />)
    await waitFor(() => expect(screen.getByTestId('citizen-report')).toBeInTheDocument())
    expect(h.report).toHaveBeenCalledWith('2026-10-01', '2026-10-02')
    expect(screen.getByTestId('citizen-report-complaints')).toHaveTextContent('2 تجاوزت 24 ساعة')
    expect(screen.getByTestId('citizen-by-assignee')).toHaveTextContent('مسؤول الكرادة')
    expect(screen.getByTestId('citizen-report-support')).toHaveTextContent('1 مواطن بانتظار الرد الآن')
  })
})
