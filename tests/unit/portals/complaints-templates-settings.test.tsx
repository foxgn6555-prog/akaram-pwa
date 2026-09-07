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
    inbox: [] as unknown[],
    contacts: [] as unknown[],
    settings: [] as unknown[],
    report: null as unknown,
    media: [] as unknown[],
    muts: {
      saveTemplate: mk(), prepare: mk(), prepareEmail: mk(), generate: mk(), setStatus: mk(),
      send: mk(), download: mk(), archiveReport: mk(), saveContact: mk(), saveSetting: mk(), saveDraft: mk(),
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
  useComplaintInbox: (sector: string) => ({ data: h.inbox.filter((item: unknown)=>(item as {sector:string}).sector===sector), isLoading: false }),
  useSaveComplaintTemplate: () => h.muts.saveTemplate,
  usePrepareComplaintReport: () => h.muts.prepare,
  usePrepareComplaintEmailReport: () => h.muts.prepareEmail,
  useGenerateComplaintReport: () => h.muts.generate,
  useSetComplaintReportStatus: () => h.muts.setStatus,
  useSendComplaintEmail: () => h.muts.send,
  useComplaintReportDownload: () => h.muts.download,
  useArchiveComplaintReport: () => h.muts.archiveReport,
  useComplaintContacts: () => ({ data: h.contacts, isLoading: false }),
  useComplaintSettings: () => ({ data: h.settings, isLoading: false }),
  useSaveComplaintContact: () => h.muts.saveContact,
  useSaveComplaintSetting: () => h.muts.saveSetting,
  useComplaintReport: () => (h.report ? { data: h.report, isLoading: false } : { data: undefined, isLoading: true }),
  useComplaintItemsMedia: () => ({ data: h.media, isLoading: false }),
  useComplaintManagers: () => ({ data: [{ userId: 'mgr1', fullName: 'المهندس علي', jobTitle: 'مسؤول قسم' }], isLoading: false }),
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
  h.inbox = []
  h.contacts = []
  h.settings = []
  h.report = null
  h.media = []
  for (const m of Object.values(h.muts)) {
    m.mutate.mockReset()
    m.mutate.mockImplementation(() => {})
    m.isPending = false
  }
})

describe('وحدة القوالب — TemplatesPage', () => {
  it('يحذف التقرير إلى الأرشيف بسبب إلزامي دون حذف فعلي',()=>{h.reports=[{...reportDetail,status:'draft'}];succeed(h.muts.archiveReport);view(<TemplatesPage/>);fireEvent.click(screen.getByText(/المسودات والتقارير \(/));fireEvent.click(screen.getByRole('button',{name:'حذف إلى الأرشيف'}));const confirm=screen.getByRole('button',{name:'تأكيد الحذف'});expect(confirm).toBeDisabled();fireEvent.change(screen.getByLabelText('سبب حذف التقرير'),{target:{value:'مسودة مكررة'}});fireEvent.click(confirm);expect(h.muts.archiveReport.mutate).toHaveBeenCalledWith({reportId:'r1',reason:'مسودة مكررة'},expect.any(Object))})
  it('ينشئ تقريراً مستقلاً للبريد المحدد بالقالب الافتراضي',()=>{h.templates=[template];h.inbox=[{id:'m1',subject:'موضوع البريد',sector:'karrada',receivedAt:'2026-09-06T08:00:00Z'}];succeed(h.muts.prepareEmail,'r-email');view(<TemplatesPage/>);fireEvent.change(screen.getByLabelText('اختر البريد'),{target:{value:'m1'}});fireEvent.click(screen.getByText('إنشاء مسودة هذا البريد'));expect(h.muts.prepareEmail.mutate).toHaveBeenCalledWith({messageId:'m1',templateId:'t1'},expect.objectContaining({onSuccess:expect.any(Function)}));expect(h.muts.prepareEmail.mutate).toHaveBeenCalledTimes(1)})

  it('يعرض القوالب مع الشارات ويمنع الحفظ بلا اسم', () => {
    h.templates = [template]
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText(/تصميم القوالب/))
    expect(screen.getByText('صمّم، أنشئ المسودة، ثم راجع وأرسل')).toBeInTheDocument()
    expect(screen.getByText('قالب قائم')).toBeInTheDocument()
    expect(screen.getByText('الافتراضي')).toBeInTheDocument()
    fireEvent.click(screen.getByText('إنشاء القالب'))
    expect(screen.getByText('اسم القالب مطلوب.')).toBeInTheDocument()
    expect(h.muts.saveTemplate.mutate).not.toHaveBeenCalled()
  })

  it('يحفظ قالباً جديداً باسم مقصوص وتخطيط كامل ثم يصفّي النموذج', () => {
    succeed(h.muts.saveTemplate)
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText(/تصميم القوالب/))
    fireEvent.change(screen.getByLabelText('اسم القالب'), { target: { value: '  قالب جديد  ' } })
    fireEvent.click(screen.getByText('إنشاء القالب'))
    expect(h.muts.saveTemplate.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: undefined, name: 'قالب جديد', description: null, sector: null,
        isDefault: false, isActive: true,
        layout: expect.objectContaining({
          accent: '#d269c8', title: 'تقرير معالجة التلكؤات ليوم',
          authorityLine: 'أمانة بغداد / دائرة بلدية الكرادة', contractorLine: 'تحالف شركات جزيرة الأكرام وفيرست ترايد',
          beforeLabel: 'صورة التلكؤ', afterLabel: 'صورة المعالجة',
        }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(screen.getByText('تم حفظ القالب وتحديث قائمة القوالب.')).toBeInTheDocument()
    expect((screen.getByLabelText('اسم القالب') as HTMLInputElement).value).toBe('')
  })

  it('يعرض رسالة خطأ عند فشل الحفظ ويحافظ على المدخلات', () => {
    fail(h.muts.saveTemplate)
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText(/تصميم القوالب/))
    fireEvent.change(screen.getByLabelText('اسم القالب'), { target: { value: 'قالب' } })
    fireEvent.click(screen.getByText('إنشاء القالب'))
    expect(screen.getByText('تعذر حفظ القالب. لم تُفقد المدخلات.')).toBeInTheDocument()
    expect((screen.getByLabelText('اسم القالب') as HTMLInputElement).value).toBe('قالب')
  })

  it('يعبّئ النموذج عند التعديل ويحفظ بالمعرّف', () => {
    h.templates = [template]
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText(/تصميم القوالب/))
    fireEvent.click(screen.getByText('تعديل التصميم'))
    expect((screen.getByLabelText('اسم القالب') as HTMLInputElement).value).toBe('قالب قائم')
    fireEvent.click(screen.getByText('حفظ تعديلات القالب'))
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
    fireEvent.click(screen.getByText(/تصميم القوالب/))
    fireEvent.click(screen.getByText('تعيين افتراضياً'))
    expect(h.muts.saveTemplate.mutate).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 't1', isDefault: true }), expect.any(Object))
    fireEvent.click(screen.getByText('تعطيل'))
    expect(h.muts.saveTemplate.mutate).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 't1', isActive: false }), expect.any(Object))
  })

  it('ينشئ المسودة بالقالب الافتراضي ويعالج فشل الإعداد', () => {
    h.templates = [template]
    succeed(h.muts.prepare)
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText('إنشاء مسودة التقرير اليومي'))
    expect(h.muts.prepare.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ sector: 'karrada', templateId: 't1', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(h.muts.prepare.mutate).toHaveBeenCalledTimes(1)
    fail(h.muts.prepare)
    fireEvent.click(screen.getByText('إنشاء مسودة التقرير اليومي'))
    expect(screen.getByText('تعذر إنشاء المسودة اليومية.')).toBeInTheDocument()
  })

  it('يختار القالب الافتراضي المطابق لقاطع البريد ولا يستخدم قالب قاطع آخر', () => {
    h.templates = [
      { ...template, id: 'tk', sector: 'karrada', isDefault: true },
      { ...template, id: 'tz', sector: 'zaafaraniya', name: 'قالب الزعفرانية', isDefault: true },
    ]
    h.inbox = [{ id: 'mz', subject: 'بريد الزعفرانية', sector: 'zaafaraniya', receivedAt: '2026-09-06T08:00:00Z' }]
    view(<TemplatesPage />)
    fireEvent.change(screen.getByLabelText('اختر البريد'), { target: { value: 'mz' } })
    fireEvent.click(screen.getByText('إنشاء مسودة هذا البريد'))
    expect(h.muts.prepareEmail.mutate).toHaveBeenCalledWith(
      { messageId: 'mz', templateId: 'tz' },
      expect.any(Object),
    )
  })

  it('يفتح تقرير البريد الموجود دون إعادة إنشائه أو مسح تصميمه', () => {
    h.inbox = [{ id: 'm1', subject: 'موضوع البريد', sector: 'karrada', receivedAt: '2026-09-06T08:00:00Z' }]
    h.reports = [{ id: 'existing', reportDate: '2026-09-06', sector: 'karrada', title: 'مسودة محفوظة', status: 'draft', pptxPath: null, recipients: [], deliveryId: null, createdAt: '2026-09-06T09:00:00Z', scope: 'email', inboxMessageId: 'm1' }]
    view(<TemplatesPage />)
    fireEvent.change(screen.getByLabelText('اختر البريد'), { target: { value: 'm1' } })
    expect(screen.getByText(/يوجد تقرير سابق لهذا المصدر/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('فتح مسودة/تقرير البريد الموجود'))
    expect(h.muts.prepareEmail.mutate).not.toHaveBeenCalled()
  })

  it('يعرض أزرار المسودة حسب الحالة بتسمية عربية ويولّد مع تغذية راجعة', () => {
    h.reports = [{ id: 'r2', reportDate: '2026-09-03', sector: 'zaafaraniya', title: 'تقرير الزعفرانية', status: 'quality_review', pptxPath: 'reports/r2/a.pptx', recipients: [], deliveryId: null, createdAt: '2026-09-03T18:00:00Z' }]
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText(/المسودات والتقارير/))
    expect(screen.getAllByText(/قيد التدقيق/).length).toBeGreaterThan(0)
    expect(screen.getByText('توليد PowerPoint')).toBeInTheDocument()
    expect(screen.getByText('تنزيل الملف')).toBeInTheDocument()
    expect(screen.queryByText('اعتماد')).toBeNull()
    expect(screen.getByRole('link', { name: 'فتح المحرر' })).toHaveAttribute('href', '/complaints/reports/r2')
    expect(screen.queryByText('إرسال إلى الجهة المرسلة')).toBeNull()
    succeed(h.muts.generate)
    fireEvent.click(screen.getByText('توليد PowerPoint'))
    expect(h.muts.generate.mutate).toHaveBeenCalledWith('r2', expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(screen.getByText('تم توليد PowerPoint. افتح المحرر لتنزيله واعتماده.')).toBeInTheDocument()
    fail(h.muts.generate)
    fireEvent.click(screen.getByText('توليد PowerPoint'))
    expect(screen.getByText('تعذر توليد التقرير.')).toBeInTheDocument()
  })

  it('يمرر التقرير المعتمد إلى المحرر للمراجعة والإرسال النهائي ولا يرسل من البطاقة', () => {
    h.reports = [{ id: 'r3', reportDate: '2026-09-03', sector: 'karrada', title: 'تقرير كرادة', status: 'approved', pptxPath: 'reports/r2/a.pptx', recipients: ['foxgn6555@gmail.com'], deliveryId: null, createdAt: '2026-09-03T18:00:00Z' }]
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText(/المسودات والتقارير/))
    const finalLink = screen.getByRole('link', { name: /الإرسال النهائي/ })
    expect(finalLink).toHaveAttribute('href', '/complaints/reports/r3')
    expect(h.muts.send.mutate).not.toHaveBeenCalled()
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

describe('وحدة الإعدادات — البطاقات المرئية', () => {
  it('يعرض مفتاحاً منطقياً مفهوماً بدلاً من محرر JSON خام', () => {
    h.settings = [setting]
    view(<SettingsPage />)
    expect(screen.getByText('نسخ التقارير الإضافية')).toBeInTheDocument()
    expect(screen.getByLabelText('تفعيل النسخة الإضافية')).toBeChecked()
    expect(screen.queryByLabelText('قيمة الإعداد reports.cc')).not.toBeInTheDocument()
  })

  it('يحفظ التغييرات المرئية ويعرض نجاح وفشل الحفظ', () => {
    h.settings = [setting]
    succeed(h.muts.saveSetting)
    view(<SettingsPage />)
    fireEvent.click(screen.getByLabelText('تفعيل النسخة الإضافية'))
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

  it('يضبط حد مرفقات Mailgun دون كشف الأسرار ويتحقق من حد 24MB',()=>{
    h.settings=[{key:'mailgun',value:{provider:'mailgun',maxAttachmentMb:24},description:'عام'}]
    succeed(h.muts.saveSetting);view(<SettingsPage/>);expect(screen.getByLabelText('مزود البريد')).toBeDisabled();const limit=screen.getByLabelText('الحد الأقصى للمرفقات (MB)');expect(limit).toHaveAttribute('max','24');fireEvent.change(limit,{target:{value:'20'}});fireEvent.click(screen.getByText('حفظ الإعداد'));expect(h.muts.saveSetting.mutate).toHaveBeenCalledWith(expect.objectContaining({value:{provider:'mailgun',maxAttachmentMb:20}}),expect.any(Object))
  })
})

describe('محرر التقرير — ReportEditorPage', () => {
  it('يعطل الإرسال النهائي بلا مستلمين بعد الاعتماد', () => {
    h.report = { ...reportDetail, recipients: [] }
    editorView()
    expect(screen.getByText(/معتمد/)).toBeInTheDocument()
    expect(screen.getByText('إرسال إلى الجهة المرسلة')).toBeDisabled()
    expect(screen.queryByText('توليد PowerPoint')).toBeNull()
  })

  it('يولّد في حالة قيد التدقيق ويمنع الإرسال قبل الاعتماد', () => {
    h.report = { ...reportDetail, status: 'quality_review', recipients: [] }
    editorView()
    expect(screen.getAllByText(/قيد التدقيق/).length).toBeGreaterThan(0)
    expect(screen.queryByText('إرسال إلى الجهة المرسلة')).toBeNull()
    expect(screen.getByText('حفظ التصميم')).toBeDisabled()
    succeed(h.muts.generate)
    fireEvent.click(screen.getByText('توليد PowerPoint'))
    expect(h.muts.generate.mutate).toHaveBeenCalledWith('r1', expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(screen.getByText('تم توليد PowerPoint وأصبح جاهزاً للمراجعة.')).toBeInTheDocument()
  })

  it('يعرض تجميع البريد مع مسؤول القسم ويتيح تحرير هوية الغلاف',()=>{h.report={...reportDetail,status:'draft',items:[{...reportDetail.items[0],item:{...item,assignedTo:'mgr1',inboxMessageId:'m1',ticketName:'موضوع البريد'}}]};editorView();expect(screen.getAllByText('موضوع البريد').length).toBeGreaterThan(0);expect(screen.getByText('المهندس علي · 1 موقع')).toBeInTheDocument();expect(screen.getByText(/سيضيف PowerPoint فاصلاً مستقلاً لكل مجموعة/)).toBeInTheDocument();fireEvent.change(screen.getByLabelText('الجهة الحكومية'),{target:{value:'أمانة بغداد / دائرة بلدية الكرادة'}});fireEvent.change(screen.getByLabelText('الجهة المنفذة'),{target:{value:'تحالف جزيرة الأكرام'}});expect(screen.getByText('تحالف جزيرة الأكرام')).toBeInTheDocument()})

  it('يرسل التقرير المعتمد إلى المستلمين مع مرفق PPTX', () => {
    h.report = reportDetail
    succeed(h.muts.send)
    editorView()
    const sendButton = screen.getByText('إرسال إلى الجهة المرسلة')
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

  it('يسمح بإعادة محاولة تقرير فشل إرساله ويسجل رسالة واضحة',()=>{h.report={...reportDetail,status:'failed',deliveries:[{...reportDetail.deliveries[0],status:'permanent_failure',errorMessage:'Mailbox unavailable',deliveredAt:null}]};succeed(h.muts.send);editorView();fireEvent.click(screen.getByRole('button',{name:'إعادة محاولة الإرسال'}));expect(h.muts.send.mutate).toHaveBeenCalledTimes(1);expect(screen.getByText('قُبلت إعادة محاولة الإرسال، وستظهر نتيجتها في سجل التسليم.')).toBeInTheDocument();expect(screen.getByText('Mailbox unavailable')).toBeInTheDocument()})

  it('يفرض تأكيد المراجعة البصرية قبل اعتماد التقرير', () => {
    h.report = { ...reportDetail, status: 'quality_review' }
    succeed(h.muts.setStatus)
    editorView()
    const approve = screen.getByRole('button', { name: 'اعتماد التقرير' })
    expect(approve).toBeDisabled()
    fireEvent.click(screen.getByText(/نزّلت ملف PowerPoint وراجعت الغلاف/))
    expect(approve).toBeEnabled()
    fireEvent.click(approve)
    expect(h.muts.setStatus.mutate).toHaveBeenCalledWith({ reportId: 'r1', status: 'approved', reviewedPptxPath: 'reports/r1/x.pptx' }, expect.any(Object))
  })

  it('يعرض صور قبل وبعد الفعلية في المعاينة البصرية', () => {
    h.report = reportDetail
    h.media = [
      { id: 'before', itemId: 'i1', kind: 'before', url: 'https://test/before.jpg' },
      { id: 'after', itemId: 'i1', kind: 'after', url: 'https://test/after.jpg' },
    ]
    editorView()
    fireEvent.click(screen.getByRole('button', { name: 'قبل / بعد' }))
    expect(screen.getByAltText('صورة التلكؤ')).toHaveAttribute('src', 'https://test/before.jpg')
    expect(screen.getByAltText('صورة المعالجة')).toHaveAttribute('src', 'https://test/after.jpg')
  })

  it('يحفظ التعديلات قبل توليد PowerPoint كي لا يولد نسخة قديمة', () => {
    h.report = { ...reportDetail, status: 'quality_review' }
    succeed(h.muts.saveDraft); succeed(h.muts.generate)
    editorView()
    fireEvent.change(screen.getByLabelText('عنوان التقرير'), { target: { value: 'تقرير معدل' } })
    fireEvent.click(screen.getByRole('button', { name: 'توليد PowerPoint' }))
    expect(h.muts.saveDraft.mutate).toHaveBeenCalledWith(expect.objectContaining({ title: 'تقرير معدل' }), expect.any(Object))
    expect(h.muts.generate.mutate).toHaveBeenCalledWith('r1', expect.any(Object))
  })

  it('يعرض سجل التسليم مع نتيجة التسليم', () => {
    h.report = reportDetail
    editorView()
    expect(screen.getByText('سجل محاولات التسليم')).toBeInTheDocument()
    expect(screen.getByText(/تم التسليم/)).toBeInTheDocument()
    expect(screen.getAllByText('foxgn6555@gmail.com').length).toBeGreaterThan(0)
  })
})