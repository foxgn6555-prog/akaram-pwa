/** اختبارات سلوكية لوحدات القوالب والإعدادات/التواصل ومحرر التقرير. */
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplatesPage from '../../../src/portals/complaints/pages/Templates/TemplatesPage'
import ReportEditorPage from '../../../src/portals/complaints/pages/Templates/ReportEditorPage'
import SettingsPage from '../../../src/portals/complaints/pages/Settings/SettingsPage'

const h = vi.hoisted(() => {
  const mk = () => ({ mutate: vi.fn((_vars?: unknown, _opts?: unknown) => {}), isPending: false })
  return {
    templates: [] as unknown[],
    reports: [] as unknown[],
    contacts: [] as unknown[],
    settings: [] as unknown[],
    report: null as unknown,
    muts: {
      saveTemplate: mk(), prepare: mk(), generate: mk(), setStatus: mk(),
      send: mk(), download: mk(), saveContact: mk(), saveSetting: mk(), saveDraft: mk(),
    },
  }
})

const LABELS: Record<string, string> = {
  draft: 'مسودة', quality_review: 'قيد التدقيق', approved: 'معتمد',
  sending: 'قيد الإرسال', sent: 'مُرسل', failed: 'فشل الإرسال', archived: 'مؤرشف',
}

vi.mock('@features/complaints', () => ({
  useComplaintTemplates: () => ({ data: h.templates, isLoading: false }),
  useComplaintReports: () => ({ data: h.reports, isLoading: false }),
  useSaveComplaintTemplate: () => h.muts.saveTemplate,
  usePrepareComplaintReport: () => h.muts.prepare,
  useGenerateComplaintReport: () => h.muts.generate,
  useSetComplaintReportStatus: () => h.muts.setStatus,
  useSendComplaintEmail: () => h.muts.send,
  useComplaintReportDownload: () => h.muts.download,
  useComplaintContacts: () => ({ data: h.contacts, isLoading: false }),
  useComplaintSettings: () => ({ data: h.settings, isLoading: false }),
  useSaveComplaintContact: () => h.muts.saveContact,
  useSaveComplaintSetting: () => h.muts.saveSetting,
  useComplaintReport: () => (h.report ? { data: h.report, isLoading: false } : { data: undefined, isLoading: true }),
  useSaveComplaintReportDraft: () => h.muts.saveDraft,
  reportStatusLabel: (status: string) => LABELS[status] ?? status,
}))

type Opts = { onSuccess?: (v?: unknown) => void; onError?: () => void }
type Mutation = { mutate: ReturnType<typeof vi.fn> }

function succeed(m: Mutation, result?: unknown) {
  m.mutate.mockImplementation((_vars: unknown, opts?: Opts) => { opts?.onSuccess?.(result) })
}
function fail(m: Mutation) {
  m.mutate.mockImplementation((_vars: unknown, opts?: Opts) => { opts?.onError?.() })
}

function view(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}
function editorView() {
  return render(
    <MemoryRouter initialEntries={['/complaints/reports/r1']}>
      <Routes><Route path="/complaints/reports/:id" element={<ReportEditorPage />} /></Routes>
    </MemoryRouter>,
  )
}

const item = {
  id: 'i1', complaintId: 'c1', sequenceNo: 1, referenceNo: 'CMP-2026-9', complaintStatus: 'new', sector: 'karrada',
  title: null, municipalCenter: null, neighborhood: '901', alley: '12', locationText: null, ocrText: null,
  assignedTo: null, status: 'processed', managerNotes: null, reviewerNotes: null, receivedAt: '2026-09-03T08:00:00Z',
}
const template = {
  id: 't1', name: 'قالب قائم', description: 'وصف', sector: 'karrada',
  layout: { accent: '#123456', title: 'غلاف قائم', beforeLabel: 'قبل قائم', afterLabel: 'بعد قائم' },
  isDefault: true, isActive: true, version: 3,
}
const contact = { id: 'c1', sector: 'karrada', name: 'م. علي', email: 'ali@test.iq', kind: 'recipient', isActive: true }
const setting = { key: 'reports.cc', value: { enabled: true }, description: 'نسخة موظف' }
const reportDetail = {
  id: 'r1', reportDate: '2026-09-03', sector: 'karrada', title: 'تقرير يومي', status: 'approved',
  pptxPath: 'reports/r1/x.pptx', recipients: ['foxgn6555@gmail.com'], deliveryId: null, createdAt: '2026-09-03T18:00:00Z',
  layout: { accent: '#cf63c6', title: 'غلاف' }, approvedAt: null, sentAt: null, archivedAt: null,
  deliveries: [{ id: 'd1', recipients: ['foxgn6555@gmail.com'], subject: 'تقرير يومي', status: 'delivered', errorMessage: null, createdAt: '2026-09-03T19:00:00Z', deliveredAt: '2026-09-03T19:01:00Z' }],
  items: [{ itemId: 'i1', displayOrder: 1, included: true, slideLayout: {}, item }],
}

beforeEach(() => {
  h.templates = []
  h.reports = []
  h.contacts = []
  h.settings = []
  h.report = null
  for (const m of Object.values(h.muts)) {
    m.mutate.mockReset()
    m.mutate.mockImplementation(() => {})
    m.isPending = false
  }
})

describe('وحدة القوالب — TemplatesPage', () => {
  it('يعرض القوالب مع الشارات ويمنع الحفظ بلا اسم', () => {
    h.templates = [template]
    view(<TemplatesPage />)
    expect(screen.getByText('القوالب والتقارير اليومية')).toBeInTheDocument()
    expect(screen.getByText('قالب قائم')).toBeInTheDocument()
    expect(screen.getByText('الافتراضي')).toBeInTheDocument()
    fireEvent.click(screen.getByText('حفظ القالب'))
    expect(screen.getByText('اسم القالب مطلوب.')).toBeInTheDocument()
    expect(h.muts.saveTemplate.mutate).not.toHaveBeenCalled()
  })

  it('يحفظ قالباً جديداً باسم مقصوص وتخطيط كامل ثم يصفّي النموذج', () => {
    succeed(h.muts.saveTemplate)
    view(<TemplatesPage />)
    fireEvent.change(screen.getByLabelText('اسم القالب'), { target: { value: '  قالب جديد  ' } })
    fireEvent.click(screen.getByText('حفظ القالب'))
    expect(h.muts.saveTemplate.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: undefined, name: 'قالب جديد', description: null, sector: null,
        isDefault: false, isActive: true,
        layout: expect.objectContaining({
          accent: '#cf63c6', title: 'تقرير معالجة الشكاوى ليوم',
          beforeLabel: 'صورة التلكؤ / الشكوى', afterLabel: 'صورة المعالجة',
        }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(screen.getByText('تمت إضافة القالب.')).toBeInTheDocument()
    expect((screen.getByLabelText('اسم القالب') as HTMLInputElement).value).toBe('')
  })

  it('يعرض رسالة خطأ عند فشل الحفظ ويحافظ على المدخلات', () => {
    fail(h.muts.saveTemplate)
    view(<TemplatesPage />)
    fireEvent.change(screen.getByLabelText('اسم القالب'), { target: { value: 'قالب' } })
    fireEvent.click(screen.getByText('حفظ القالب'))
    expect(screen.getByText('تعذر حفظ القالب؛ تحقق من الصلاحية وأعد المحاولة.')).toBeInTheDocument()
    expect((screen.getByLabelText('اسم القالب') as HTMLInputElement).value).toBe('قالب')
  })

  it('يعبّئ النموذج عند التعديل ويحفظ بالمعرّف', () => {
    h.templates = [template]
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText('تعديل'))
    expect((screen.getByLabelText('اسم القالب') as HTMLInputElement).value).toBe('قالب قائم')
    fireEvent.click(screen.getByText('حفظ التعديل'))
    expect(h.muts.saveTemplate.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', name: 'قالب قائم', layout: expect.objectContaining({ title: 'غلاف قائم' }) }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })
})

describe('وحدة القوالب — الإسناد والمسودات', () => {
  it('يعيّن الافتراضي ويقلب التفعيل دون حذف', () => {
    h.templates = [{ ...template, isDefault: false }]
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText('تعيين كافتراضي'))
    expect(h.muts.saveTemplate.mutate).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 't1', isDefault: true }))
    fireEvent.click(screen.getByText('تعطيل'))
    expect(h.muts.saveTemplate.mutate).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 't1', isActive: false }))
  })

  it('ينشئ المسودة بالقالب الافتراضي ويعالج فشل الإعداد', () => {
    h.templates = [template]
    succeed(h.muts.prepare)
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText('إنشاء/تحديث المسودة'))
    expect(h.muts.prepare.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ sector: 'karrada', templateId: 't1', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(screen.getByText('تم إنشاء/تحديث المسودة؛ افتحها من قائمة المسودات أدناه.')).toBeInTheDocument()
    fail(h.muts.prepare)
    fireEvent.click(screen.getByText('إنشاء/تحديث المسودة'))
    expect(screen.getByText('تعذر إعداد المسودة؛ تأكد من وجود مواقع معتمدة لهذا القاطع في هذا التاريخ.')).toBeInTheDocument()
  })

  it('يعرض أزرار المسودة حسب الحالة بتسمية عربية ويولّد مع تغذية راجعة', () => {
    h.reports = [{ id: 'r2', reportDate: '2026-09-03', sector: 'zaafaraniya', title: 'تقرير الزعفرانية', status: 'quality_review', pptxPath: 'reports/r2/a.pptx', recipients: [], deliveryId: null, createdAt: '2026-09-03T18:00:00Z' }]
    view(<TemplatesPage />)
    expect(screen.getByText('قيد التدقيق')).toBeInTheDocument()
    expect(screen.getByText('توليد PowerPoint')).toBeInTheDocument()
    expect(screen.getByText('تنزيل للمراجعة')).toBeInTheDocument()
    expect(screen.getByText('اعتماد التقرير')).toBeInTheDocument()
    expect(screen.queryByText('إرسال عبر البريد')).toBeNull()
    succeed(h.muts.generate)
    fireEvent.click(screen.getByText('توليد PowerPoint'))
    expect(h.muts.generate.mutate).toHaveBeenCalledWith('r2', expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(screen.getByText('تم توليد PowerPoint وأصبح جاهزاً للمراجعة.')).toBeInTheDocument()
    fail(h.muts.generate)
    fireEvent.click(screen.getByText('توليد PowerPoint'))
    expect(screen.getByText('تعذر توليد PowerPoint؛ افتح المحرر وتأكد من حفظ التصميم وتضمين المواقع.')).toBeInTheDocument()
  })

  it('يرسل التقرير المعتمد بالمرفق مع حماية التكرار', () => {
    h.reports = [{ id: 'r3', reportDate: '2026-09-03', sector: 'karrada', title: 'تقرير كرادة', status: 'approved', pptxPath: 'reports/r2/a.pptx', recipients: ['foxgn6555@gmail.com'], deliveryId: null, createdAt: '2026-09-03T18:00:00Z' }]
    succeed(h.muts.send)
    view(<TemplatesPage />)
    const sendButton = screen.getByText('إرسال عبر البريد')
    expect(sendButton).not.toBeDisabled()
    fireEvent.click(sendButton)
    expect(h.muts.send.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: 'r3', to: ['foxgn6555@gmail.com'], attachmentPaths: ['reports/r2/a.pptx'] }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
    expect(screen.getByText('قُبل طلب الإرسال؛ ستتحدث حالة التسليم تلقائياً عبر أحداث Mailgun.')).toBeInTheDocument()
  })
})

describe('وحدة الإعدادات والتواصل — SettingsPage', () => {
  it('يعرض جدول الجهات وبطاقات الإعدادات', () => {
    h.contacts = [contact]
    h.settings = [setting]
    view(<SettingsPage />)
    expect(screen.getByText('إعدادات الصفحات والتواصل')).toBeInTheDocument()
    expect(screen.getByText('م. علي')).toBeInTheDocument()
    expect(screen.getByText('ali@test.iq')).toBeInTheDocument()
    expect(screen.getByText('To')).toBeInTheDocument()
    expect(screen.getByText('مفعّل')).toBeInTheDocument()
    expect(screen.getByText('reports.cc')).toBeInTheDocument()
    expect(screen.getByText('حفظ الإعداد')).toBeInTheDocument()
  })

  it('يمنع الحفظ ببيانات ناقصة أو بريد غير صالح', () => {
    view(<SettingsPage />)
    fireEvent.click(screen.getByText('إضافة جهة'))
    expect(screen.getByText('الاسم والبريد مطلوبان.')).toBeInTheDocument()
    expect(h.muts.saveContact.mutate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('اسم الجهة'), { target: { value: 'م. زينب' } })
    fireEvent.change(screen.getByLabelText('بريد الجهة'), { target: { value: 'bad-email' } })
    fireEvent.click(screen.getByText('إضافة جهة'))
    expect(screen.getByText('صيغة البريد غير صحيحة.')).toBeInTheDocument()
    expect(h.muts.saveContact.mutate).not.toHaveBeenCalled()
  })

  it('يضيف جهة تواصل بنوع محدد ويعرض نجاحاً ويصفّي النموذج', () => {
    succeed(h.muts.saveContact)
    view(<SettingsPage />)
    fireEvent.change(screen.getByLabelText('اسم الجهة'), { target: { value: ' م. زينب ' } })
    fireEvent.change(screen.getByLabelText('بريد الجهة'), { target: { value: 'z@test.iq' } })
    fireEvent.change(screen.getByLabelText('استخدام الجهة'), { target: { value: 'cc' } })
    fireEvent.click(screen.getByText('إضافة جهة'))
    expect(h.muts.saveContact.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'م. زينب', email: 'z@test.iq', kind: 'cc', isActive: true }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
    expect(screen.getByText('تمت إضافة جهة التواصل.')).toBeInTheDocument()
    expect((screen.getByLabelText('اسم الجهة') as HTMLInputElement).value).toBe('')
  })

  it('يعطّل الجهة دون حذف ويعالج فشل التحديث', () => {
    h.contacts = [contact]
    succeed(h.muts.saveContact)
    view(<SettingsPage />)
    fireEvent.click(screen.getByText('تعطيل'))
    expect(h.muts.saveContact.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', isActive: false }),
      expect.objectContaining({ onError: expect.any(Function) }),
    )
    expect(screen.getByText('تم تعطيل الجهة دون حذفها.')).toBeInTheDocument()
    fail(h.muts.saveContact)
    fireEvent.click(screen.getByText('تعطيل'))
    expect(screen.getByText('تعذر تحديث حالة الجهة؛ أعد المحاولة.')).toBeInTheDocument()
  })
})

describe('وحدة الإعدادات — بطاقة الإعداد', () => {
  it('يرفض JSON غير صالح أو غير الكائني دون استدعاء الحفظ', () => {
    h.settings = [setting]
    view(<SettingsPage />)
    const textarea = screen.getByLabelText('قيمة الإعداد reports.cc')
    fireEvent.change(textarea, { target: { value: '{ bad' } })
    fireEvent.click(screen.getByText('حفظ الإعداد'))
    expect(screen.getByText('صيغة JSON غير صحيحة.')).toBeInTheDocument()
    expect(h.muts.saveSetting.mutate).not.toHaveBeenCalled()
    fireEvent.change(textarea, { target: { value: '[1,2]' } })
    fireEvent.click(screen.getByText('حفظ الإعداد'))
    expect(screen.getByText('يجب أن تكون قيمة الإعداد كائن JSON.')).toBeInTheDocument()
    expect(h.muts.saveSetting.mutate).not.toHaveBeenCalled()
  })

  it('يحفظ الإعداد بقيمة محللة ويعرض نجاحاً ويعالج الفشل', () => {
    h.settings = [setting]
    succeed(h.muts.saveSetting)
    view(<SettingsPage />)
    fireEvent.change(screen.getByLabelText('قيمة الإعداد reports.cc'), { target: { value: '{"enabled":false}' } })
    fireEvent.click(screen.getByText('حفظ الإعداد'))
    expect(h.muts.saveSetting.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'reports.cc', value: { enabled: false }, description: 'نسخة موظف' }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
    expect(screen.getByText('تم حفظ الإعداد.')).toBeInTheDocument()
    fail(h.muts.saveSetting)
    fireEvent.click(screen.getByText('حفظ الإعداد'))
    expect(screen.getByText('تعذر حفظ الإعداد؛ تحقق من الصلاحية ثم أعد المحاولة.')).toBeInTheDocument()
  })
})

describe('محرر التقرير — ReportEditorPage', () => {
  it('يعطل الإرسال النهائي بلا مستلمين بعد الاعتماد', () => {
    h.report = { ...reportDetail, recipients: [] }
    editorView()
    expect(screen.getByText(/معتمد/)).toBeInTheDocument()
    expect(screen.getByText('إرسال نهائي')).toBeDisabled()
    expect(screen.queryByText('توليد PowerPoint')).toBeNull()
  })

  it('يولّد في حالة قيد التدقيق ويمنع الإرسال قبل الاعتماد', () => {
    h.report = { ...reportDetail, status: 'quality_review', recipients: [] }
    editorView()
    expect(screen.getByText(/قيد التدقيق/)).toBeInTheDocument()
    expect(screen.queryByText('إرسال نهائي')).toBeNull()
    expect(screen.getByText('حفظ التصميم')).toBeDisabled()
    succeed(h.muts.generate)
    fireEvent.click(screen.getByText('توليد PowerPoint'))
    expect(h.muts.generate.mutate).toHaveBeenCalledWith('r1', expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(screen.getByText('تم توليد PowerPoint وأصبح جاهزاً للمراجعة.')).toBeInTheDocument()
  })

  it('يرسل التقرير المعتمد إلى المستلمين مع مرفق PPTX', () => {
    h.report = reportDetail
    succeed(h.muts.send)
    editorView()
    const sendButton = screen.getByText('إرسال نهائي')
    expect(sendButton).not.toBeDisabled()
    fireEvent.click(sendButton)
    expect(h.muts.send.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'r1', to: ['foxgn6555@gmail.com'], subject: 'تقرير يومي',
        attachmentPaths: ['reports/r1/x.pptx'],
      }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
    expect(screen.getByText('قُبل طلب الإرسال، وسيتم تحديث حالة التسليم تلقائياً.')).toBeInTheDocument()
  })

  it('يعرض سجل التسليم مع نتيجة التسليم', () => {
    h.report = reportDetail
    editorView()
    expect(screen.getByText('سجل محاولات التسليم')).toBeInTheDocument()
    expect(screen.getByText(/تم التسليم/)).toBeInTheDocument()
    expect(screen.getAllByText('foxgn6555@gmail.com').length).toBeGreaterThan(0)
  })
})