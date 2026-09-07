import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  CalendarDays, CheckCircle2, FileText, FolderOpen, Mail, Palette, Search,
  Send, Settings2, Sparkles, Trash2,
} from 'lucide-react'
import { ComplaintWorkflow } from '../../components/ComplaintUi'
import {
  useArchiveComplaintReport, useComplaintInbox, useComplaintReportDownload, useComplaintReports,
  useComplaintTemplates, useGenerateComplaintReport, usePrepareComplaintEmailReport,
  usePrepareComplaintReport, useSaveComplaintTemplate, reportStatusLabel,
  type ComplaintReport, type ComplaintSector, type ComplaintTemplate,
} from '@features/complaints'

type Tab = 'templates' | 'prepare' | 'reports'
type ReportFilter = 'all' | ComplaintReport['status']
type Form = {
  id?: string
  name: string
  description: string
  sector: ComplaintSector | ''
  accent: string
  coverTitle: string
  authorityLine: string
  contractorLine: string
  beforeLabel: string
  afterLabel: string
  isDefault: boolean
  isActive: boolean
}

const emptyForm: Form = {
  name: '', description: '', sector: '', accent: '#d269c8',
  coverTitle: 'تقرير معالجة التلكؤات ليوم',
  authorityLine: 'أمانة بغداد / دائرة بلدية الكرادة',
  contractorLine: 'تحالف شركات جزيرة الأكرام وفيرست ترايد',
  beforeLabel: 'صورة التلكؤ', afterLabel: 'صورة المعالجة',
  isDefault: false, isActive: true,
}
const EMPTY_TEMPLATES: ComplaintTemplate[] = []
const EMPTY_REPORTS: ComplaintReport[] = []
const reportFilters: Array<{ value: ReportFilter; label: string }> = [
  { value: 'all', label: 'الكل' }, { value: 'draft', label: 'المسودات' },
  { value: 'quality_review', label: 'قيد التدقيق' }, { value: 'approved', label: 'المعتمدة' },
  { value: 'sent', label: 'المرسلة' }, { value: 'failed', label: 'المتعثرة' },
  { value: 'archived', label: 'المؤرشفة' },
]
const value = (layout: Record<string, unknown>, key: string, fallback: string) =>
  typeof layout[key] === 'string' && layout[key] ? String(layout[key]) : fallback
const sectorLabel = (sector: ComplaintSector) => sector === 'karrada' ? 'بلدية الكرادة' : 'بلدية الزعفرانية'

function friendlyError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : String(error ?? '')
  if (raw.includes('COMPLAINT_REPORT_NO_APPROVED_ITEMS')) return 'لا توجد مواقع معتمدة جاهزة لإضافتها إلى هذا التقرير.'
  if (raw.includes('COMPLAINT_REPORT_LOCKED')) return 'هذا التقرير معتمد أو مُرسل ولا يمكن استبدال مسودته. افتحه من قائمة التقارير.'
  if (raw.includes('COMPLAINT_TEMPLATE_INACTIVE')) return 'القالب المختار معطل. اختر قالباً نشطاً أو فعّله أولاً.'
  if (raw.includes('COMPLAINT_TEMPLATE_SECTOR_MISMATCH')) return 'القالب المختار لا يطابق قاطع التقرير.'
  if (raw.includes('COMPLAINT_TEMPLATE_NOT_FOUND')) return 'القالب المختار غير موجود أو لم يعد متاحاً.'
  return fallback
}

function suitableTemplates(templates: ComplaintTemplate[], sector: ComplaintSector | null | undefined) {
  return templates.filter(template => template.isActive && (!template.sector || !sector || template.sector === sector))
}

function bestTemplate(templates: ComplaintTemplate[], sector: ComplaintSector | null | undefined) {
  const suitable = suitableTemplates(templates, sector)
  return suitable.find(template => template.isDefault && template.sector === sector)
    ?? suitable.find(template => template.isDefault && !template.sector)
    ?? suitable.find(template => template.sector === sector)
    ?? suitable[0]
}

export default function TemplatesPage() {
  const navigate = useNavigate()
  const [date, setDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date()))
  const templatesQuery = useComplaintTemplates()
  const reportsQuery = useComplaintReports(date)
  const karradaQuery = useComplaintInbox('karrada',date)
  const zaafaraniyaQuery = useComplaintInbox('zaafaraniya',date)
  const templates = templatesQuery.data ?? EMPTY_TEMPLATES
  const reports = reportsQuery.data ?? EMPTY_REPORTS
  const messages = [...(karradaQuery.data ?? []), ...(zaafaraniyaQuery.data ?? [])]
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  const save = useSaveComplaintTemplate()
  const prepareDaily = usePrepareComplaintReport()
  const prepareEmail = usePrepareComplaintEmailReport()
  const generate = useGenerateComplaintReport()
  const download = useComplaintReportDownload()
  const archiveReport = useArchiveComplaintReport()

  const [tab, setTab] = useState<Tab>('prepare')
  const [form, setForm] = useState<Form>(emptyForm)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [sector, setSector] = useState<ComplaintSector>('karrada')
  const [messageId, setMessageId] = useState('')
  const [emailTemplateId, setEmailTemplateId] = useState('')
  const [dailyTemplateId, setDailyTemplateId] = useState('')
  const [reportSector, setReportSector] = useState<'all' | ComplaintSector>('all')
  const [reportStatus, setReportStatus] = useState<ReportFilter>('all')
  const [reportQuery, setReportQuery] = useState('')
  const [archiveTarget,setArchiveTarget]=useState<ComplaintReport|null>(null)
  const [archiveReason,setArchiveReason]=useState('')

  const selectedMessage = messages.find(message => message.id === messageId)
  const emailTemplates = suitableTemplates(templates, selectedMessage?.sector)
  const dailyTemplates = suitableTemplates(templates, sector)
  const existingEmailReport = reports.find(report => report.scope === 'email' && report.inboxMessageId === messageId)
  const existingDailyReport = reports.find(report => report.scope === 'daily' && report.sector === sector && report.reportDate === date)
  const visibleReports = useMemo(() => {
    const term = reportQuery.trim().toLowerCase()
    return reports.filter(report =>
      (reportSector === 'all' || report.sector === reportSector)
      && (reportStatus === 'all' || report.status === reportStatus)
      && `${report.title} ${report.reportDate} ${reportStatusLabel(report.status)}`.toLowerCase().includes(term))
  }, [reports, reportQuery, reportSector, reportStatus])

  const patch = <K extends keyof Form>(key: K, next: Form[K]) => setForm(old => ({ ...old, [key]: next }))
  const layout = () => ({
    accent: form.accent, title: form.coverTitle, authorityLine: form.authorityLine,
    contractorLine: form.contractorLine, beforeLabel: form.beforeLabel, afterLabel: form.afterLabel,
  })
  const resetForm = () => { setForm(emptyForm); setNotice(null) }
  const submit = () => {
    if (!form.name.trim()) { setNotice({ ok: false, text: 'اسم القالب مطلوب.' }); return }
    if (!/^#[0-9a-f]{6}$/i.test(form.accent)) { setNotice({ ok: false, text: 'لون الهوية غير صالح.' }); return }
    save.mutate({
      id: form.id, name: form.name.trim(), description: form.description.trim() || null,
      sector: form.sector || null, layout: layout(), isDefault: form.isDefault,
      isActive: form.isActive,
    }, {
      onSuccess: () => { setNotice({ ok: true, text: 'تم حفظ القالب وتحديث قائمة القوالب.' }); setForm(emptyForm) },
      onError: error => setNotice({ ok: false, text: friendlyError(error, 'تعذر حفظ القالب. لم تُفقد المدخلات.') }),
    })
  }
  const edit = (item: ComplaintTemplate) => {
    setForm({
      id: item.id, name: item.name, description: item.description ?? '', sector: item.sector ?? '',
      accent: value(item.layout, 'accent', '#2563eb'),
      coverTitle: value(item.layout, 'title', 'تقرير معالجة التلكؤات ليوم'),
      authorityLine: value(item.layout, 'authorityLine', 'أمانة بغداد / دائرة بلدية الكرادة'),
      contractorLine: value(item.layout, 'contractorLine', 'تحالف شركات جزيرة الأكرام وفيرست ترايد'),
      beforeLabel: value(item.layout, 'beforeLabel', 'صورة التلكؤ'),
      afterLabel: value(item.layout, 'afterLabel', 'صورة المعالجة'),
      isDefault: item.isDefault, isActive: item.isActive,
    })
    setNotice(null)
  }
  const saveTemplateState = (item: ComplaintTemplate, changes: Partial<ComplaintTemplate>, successText: string) => {
    save.mutate({ ...item, ...changes }, {
      onSuccess: () => setNotice({ ok: true, text: successText }),
      onError: error => setNotice({ ok: false, text: friendlyError(error, 'تعذر تحديث حالة القالب.') }),
    })
  }
  const createEmailDraft = () => {
    if (!selectedMessage) { setNotice({ ok: false, text: 'اختر رسالة البريد أولاً.' }); return }
    if (existingEmailReport) { navigate(`/complaints/reports/${existingEmailReport.id}`); return }
    const chosen = emailTemplateId || bestTemplate(templates, selectedMessage.sector)?.id
    prepareEmail.mutate({ messageId: selectedMessage.id, templateId: chosen || undefined }, {
      onSuccess: reportId => navigate(`/complaints/reports/${String(reportId)}`),
      onError: error => setNotice({ ok: false, text: friendlyError(error, 'تعذر إنشاء مسودة البريد.') }),
    })
  }
  const createDailyDraft = () => {
    if (existingDailyReport) { navigate(`/complaints/reports/${existingDailyReport.id}`); return }
    const chosen = dailyTemplateId || bestTemplate(templates, sector)?.id
    prepareDaily.mutate({ sector, date, templateId: chosen || undefined }, {
      onSuccess: reportId => navigate(`/complaints/reports/${String(reportId)}`),
      onError: error => setNotice({ ok: false, text: friendlyError(error, 'تعذر إنشاء المسودة اليومية.') }),
    })
  }

  return <section className="min-h-full space-y-6 pb-8" dir="rtl">
    <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-indigo-950 to-fuchsia-900 p-6 text-white shadow-xl sm:p-7">
      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">استديو التقارير</span>
      <h1 className="mt-3 text-2xl font-black sm:text-3xl">صمّم، أنشئ المسودة، ثم راجع وأرسل</h1>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-indigo-100">مسار واضح يمنع استبدال المسودات القائمة أو استخدام قالب لا يطابق البلدية.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-3"><Step number="1" text="اختر أو صمّم القالب" /><Step number="2" text="أنشئ مسودة البريد أو اليوم" /><Step number="3" text="ولّد، راجع، اعتمد ثم أرسل" /></div>
    </header>
    <ComplaintWorkflow current="report" />
    {notice && <p role="status" className={`rounded-2xl p-4 text-sm font-bold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{notice.text}</p>}

    <nav className="grid rounded-2xl border bg-white p-2 shadow-sm sm:grid-cols-3">
      {([
        { id: 'prepare', label: 'إنشاء مسودة', icon: FileText },
        { id: 'templates', label: `تصميم القوالب (${templates.length})`, icon: Palette },
        { id: 'reports', label: `المسودات والتقارير (${reports.length})`, icon: Send },
      ] as const).map(item => <button key={item.id} type="button" onClick={() => { setTab(item.id); setNotice(null) }} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold ${tab === item.id ? 'bg-indigo-700 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}><item.icon size={18} />{item.label}</button>)}
    </nav>

    {tab === 'prepare' && <div className="grid items-start gap-5 xl:grid-cols-2">
      <ReportChoice icon={<Mail />} title="تقرير مستقل لبريد واحد" description="اختر تاريخ البريد أولاً، ثم البريد والقالب المناسب. إذا كانت له مسودة سابقة فسيُفتح التقرير الموجود دون مسح تصميمه.">
        <label className="mt-4 block text-sm font-bold">تاريخ البريد<input aria-label="تاريخ بريد التقرير" type="date" value={date} onChange={event=>{setDate(event.target.value);setMessageId('');setEmailTemplateId('');setNotice(null)}} className="mt-2 w-full rounded-xl border bg-white p-3"/></label>
        <label className="mt-3 block text-sm font-bold">رسالة البريد
          <select aria-label="اختر البريد" value={messageId} onChange={event => { setMessageId(event.target.value); setEmailTemplateId(''); setNotice(null) }} className="mt-2 w-full rounded-xl border bg-white p-3">
            <option value="">اختر رسالة واردة</option>
            {messages.map(message => <option key={message.id} value={message.id}>{message.subject || 'دون موضوع'} — {message.sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'} — {new Date(message.receivedAt).toLocaleDateString('ar-IQ')}</option>)}
          </select>
        </label>
        <TemplatePicker templates={emailTemplates} value={emailTemplateId} onChange={setEmailTemplateId} disabled={!selectedMessage} suggested={bestTemplate(templates, selectedMessage?.sector)} />
        {existingEmailReport && <ExistingReportNotice report={existingEmailReport} />}
        <button disabled={!messageId || prepareEmail.isPending} onClick={createEmailDraft} className="mt-4 w-full rounded-xl bg-indigo-700 p-3 font-black text-white disabled:opacity-40">{prepareEmail.isPending ? 'جارٍ إعداد المسودة…' : existingEmailReport ? 'فتح مسودة/تقرير البريد الموجود' : 'إنشاء مسودة هذا البريد'}</button>
      </ReportChoice>

      <ReportChoice icon={<CalendarDays />} title="التقرير اليومي الجامع" description="يجمع المواقع المعتمدة في قاطع ويوم واحد. المسودة القائمة تُفتح ولا يعاد ضبطها تلقائياً.">
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">البلدية
          <select value={sector} onChange={event => { setSector(event.target.value as ComplaintSector); setDailyTemplateId(''); setNotice(null) }} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="karrada">بلدية الكرادة</option><option value="zaafaraniya">بلدية الزعفرانية</option></select>
        </label><label className="text-sm font-bold">التاريخ<input type="date" value={date} onChange={event => { setDate(event.target.value); setNotice(null) }} className="mt-2 w-full rounded-xl border bg-white p-3" /></label></div>
        <TemplatePicker templates={dailyTemplates} value={dailyTemplateId} onChange={setDailyTemplateId} suggested={bestTemplate(templates, sector)} />
        {existingDailyReport && <ExistingReportNotice report={existingDailyReport} />}
        <button disabled={prepareDaily.isPending || !date} onClick={createDailyDraft} className="mt-4 w-full rounded-xl bg-slate-900 p-3 font-black text-white disabled:opacity-40">{prepareDaily.isPending ? 'جارٍ الإعداد…' : existingDailyReport ? 'فتح التقرير اليومي الموجود' : 'إنشاء مسودة التقرير اليومي'}</button>
      </ReportChoice>
    </div>}

    {tab === 'templates' && <div className="grid items-start gap-5 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={event => { event.preventDefault(); submit() }} className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Settings2 className="text-indigo-700" /><h2 className="text-lg font-black">{form.id ? 'تعديل القالب' : 'إنشاء قالب جديد'}</h2></div>{form.id && <button type="button" onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-slate-900">إلغاء التعديل</button>}</div>
        <div className="mt-4 grid gap-3">
          <label className="text-xs font-bold text-slate-600">اسم القالب<input aria-label="اسم القالب" value={form.name} onChange={event => patch('name', event.target.value)} placeholder="مثال: قالب الزعفرانية الرسمي" className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="text-xs font-bold text-slate-600">وصف الاستخدام<input aria-label="وصف القالب" value={form.description} onChange={event => patch('description', event.target.value)} placeholder="متى يستخدم هذا القالب؟" className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="text-xs font-bold text-slate-600">نطاق القالب<select aria-label="قاطع القالب" value={form.sector} onChange={event => patch('sector', event.target.value as Form['sector'])} className="mt-1 w-full rounded-xl border p-3"><option value="">جميع البلديات</option><option value="karrada">الكرادة فقط</option><option value="zaafaraniya">الزعفرانية فقط</option></select></label>
          <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-bold">لون الهوية<input aria-label="لون الهوية" type="color" value={form.accent} onChange={event => patch('accent', event.target.value)} /></label>
          <input aria-label="الجهة الحكومية على الغلاف" value={form.authorityLine} onChange={event => patch('authorityLine', event.target.value)} className="rounded-xl border p-3" />
          <input aria-label="الجهة المنفذة على الغلاف" value={form.contractorLine} onChange={event => patch('contractorLine', event.target.value)} className="rounded-xl border p-3" />
          <input aria-label="عنوان الغلاف" value={form.coverTitle} onChange={event => patch('coverTitle', event.target.value)} className="rounded-xl border p-3" />
          <div className="grid grid-cols-2 gap-2"><input aria-label="عنوان قبل" value={form.beforeLabel} onChange={event => patch('beforeLabel', event.target.value)} className="rounded-xl border p-3" /><input aria-label="عنوان بعد" value={form.afterLabel} onChange={event => patch('afterLabel', event.target.value)} className="rounded-xl border p-3" /></div>
          <div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 rounded-xl border p-3 text-xs font-bold"><input type="checkbox" checked={form.isActive} onChange={event => patch('isActive', event.target.checked)} />قالب نشط وقابل للاستخدام</label><label className="flex items-center gap-2 rounded-xl border p-3 text-xs font-bold"><input type="checkbox" checked={form.isDefault} onChange={event => patch('isDefault', event.target.checked)} />القالب الافتراضي لهذا النطاق</label></div>
        </div>
        <TemplatePreview form={form} />
        <button disabled={save.isPending} className="mt-4 w-full rounded-xl bg-indigo-700 px-5 py-3 font-bold text-white disabled:opacity-50">{save.isPending ? 'جارٍ الحفظ…' : form.id ? 'حفظ تعديلات القالب' : 'إنشاء القالب'}</button>
      </form>

      <div className="space-y-3">
        <div><h2 className="text-lg font-black">القوالب المحفوظة</h2><p className="mt-1 text-sm text-slate-500">يمكن أن يوجد قالب افتراضي واحد لكل نطاق: عام، الكرادة، أو الزعفرانية.</p></div>
        {templatesQuery.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-100" /> : templatesQuery.isError ? <p className="rounded-2xl bg-red-50 p-5 text-sm font-bold text-red-800">تعذر تحميل القوالب.</p> : templates.map(item => <article key={item.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${item.isActive ? '' : 'opacity-65'}`} style={{ borderRightColor: value(item.layout, 'accent', '#2563eb'), borderRightWidth: 6 }}>
          <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{item.name}</h3>{item.isDefault && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">الافتراضي</span>}</div><p className="mt-1 text-xs text-slate-500">{item.description || 'قالب تقارير الشكاوى'}</p><p className="mt-2 text-[11px] font-bold text-slate-400">{item.sector ? sectorLabel(item.sector) : 'صالح لجميع البلديات'} · الإصدار {item.version}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.isActive ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{item.isActive ? 'نشط' : 'معطل'}</span></div>
          <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => edit(item)} className="rounded-lg border px-3 py-2 text-xs font-bold text-blue-700">تعديل التصميم</button>{!item.isDefault && item.isActive && <button onClick={() => saveTemplateState(item, { isDefault: true }, 'تم تعيين القالب افتراضياً لنطاقه.')} className="rounded-lg border px-3 py-2 text-xs font-bold text-emerald-700">تعيين افتراضياً</button>}<button onClick={() => saveTemplateState(item, { isActive: !item.isActive, isDefault: item.isActive ? false : item.isDefault }, item.isActive ? 'تم تعطيل القالب.' : 'تم تفعيل القالب.')} className="rounded-lg border px-3 py-2 text-xs font-bold">{item.isActive ? 'تعطيل' : 'تفعيل'}</button></div>
        </article>)}
        {!templatesQuery.isLoading && !templates.length && <p className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-500">لا توجد قوالب بعد. أنشئ أول قالب من النموذج.</p>}
      </div>
    </div>}

    {tab === 'reports' && <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black">المسودات والتقارير</h2><p className="text-sm text-slate-500">افتح التقرير لإدارة التصميم والمراجعة والإرسال من مكان واحد.</p></div><button onClick={() => setTab('prepare')} className="rounded-xl bg-indigo-700 px-4 py-2.5 font-bold text-white">مسودة جديدة</button></div>
      <div className="grid gap-3 rounded-2xl border bg-white p-3 shadow-sm lg:grid-cols-[1fr_auto_auto_auto]">
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3"><Search size={17} className="text-slate-400" /><input aria-label="بحث التقارير" value={reportQuery} onChange={event => setReportQuery(event.target.value)} placeholder="ابحث بعنوان التقرير أو التاريخ" className="min-h-11 w-full bg-transparent text-sm outline-none" /></label>
        <input aria-label="تاريخ التقارير" type="date" value={date} onChange={event=>setDate(event.target.value)} className="rounded-xl border px-3 py-2 text-sm font-bold"/>
        <select aria-label="قاطع التقارير" value={reportSector} onChange={event => setReportSector(event.target.value as 'all' | ComplaintSector)} className="rounded-xl border px-3 py-2 text-sm font-bold"><option value="all">كل القواطع</option><option value="karrada">الكرادة</option><option value="zaafaraniya">الزعفرانية</option></select>
        <select aria-label="حالة التقارير" value={reportStatus} onChange={event => setReportStatus(event.target.value as ReportFilter)} className="rounded-xl border px-3 py-2 text-sm font-bold">{reportFilters.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select>
      </div>
      {reportsQuery.isLoading ? <div className="h-48 animate-pulse rounded-3xl bg-slate-100" /> : reportsQuery.isError ? <p className="rounded-2xl bg-red-50 p-5 text-sm font-bold text-red-800">تعذر تحميل المسودات والتقارير.</p> : visibleReports.map(report => <article key={report.id} className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${report.scope === 'email' ? 'bg-fuchsia-50 text-fuchsia-700' : 'bg-blue-50 text-blue-700'}`}>{report.scope === 'email' ? <Mail /> : <CalendarDays />}</span><div className="min-w-0"><span className="text-xs font-bold text-slate-500">{report.scope === 'email' ? 'تقرير بريد مستقل' : 'تقرير يومي جامع'}</span><h3 className="mt-1 break-words font-black">{report.title}</h3><p className="mt-1 text-xs text-slate-500">{sectorLabel(report.sector)} · {reportStatusLabel(report.status)} · {report.reportDate}</p></div></div><div className="flex flex-wrap gap-2"><Link to={`/complaints/reports/${report.id}`} className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm font-bold text-blue-700"><FolderOpen size={15} />فتح المحرر</Link>{['draft', 'quality_review', 'failed'].includes(report.status) && <button disabled={generate.isPending} onClick={() => generate.mutate(report.id, { onSuccess: () => setNotice({ ok: true, text: 'تم توليد PowerPoint. افتح المحرر لتنزيله واعتماده.' }), onError: error => setNotice({ ok: false, text: friendlyError(error, 'تعذر توليد التقرير.') }) })} className="inline-flex items-center gap-1 rounded-xl bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Sparkles size={15} />توليد PowerPoint</button>}{report.pptxPath && <button disabled={download.isPending} onClick={() => download.mutate(report.pptxPath!, { onSuccess: url => { const link = document.createElement('a'); link.href = url; link.click() }, onError: () => setNotice({ ok: false, text: 'تعذر تجهيز رابط تنزيل الملف.' }) })} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">تنزيل الملف</button>}{report.status === 'approved' && <Link to={`/complaints/reports/${report.id}`} className="rounded-xl bg-rose-700 px-3 py-2 text-sm font-bold text-white"><Send className="inline" size={15} /> الإرسال النهائي</Link>}{report.status!=='archived'&&report.status!=='sending'&&<button type="button" onClick={()=>{setArchiveTarget(report);setArchiveReason('')}} className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><Trash2 size={15}/>حذف إلى الأرشيف</button>}</div></div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600"><span className="rounded-lg bg-slate-100 px-3 py-2">المستلمون: {report.recipients.length}</span>{report.pptxPath && <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800"><CheckCircle2 size={14} />ملف PowerPoint جاهز</span>}</div>
      </article>)}
      {!reportsQuery.isLoading && !visibleReports.length && <p className="rounded-3xl border border-dashed bg-white p-12 text-center text-slate-500">لا توجد مسودات أو تقارير تطابق المرشحات الحالية.</p>}
    </div>}
    {archiveTarget&&<div role="dialog" aria-modal="true" aria-labelledby="archive-report-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><h2 id="archive-report-title" className="text-lg font-black">حذف التقرير إلى الأرشيف</h2><p className="mt-2 text-sm text-slate-600">سيختفي «{archiveTarget.title}» من العمل النشط مع بقاء سجل التدقيق والملف محفوظين.</p><label className="mt-4 block text-sm font-bold">سبب الحذف<textarea aria-label="سبب حذف التقرير" value={archiveReason} onChange={event=>setArchiveReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border p-3" placeholder="اكتب سبباً واضحاً"/></label><div className="mt-4 flex gap-2"><button disabled={archiveReason.trim().length<3||archiveReport.isPending} onClick={()=>archiveReport.mutate({reportId:archiveTarget.id,reason:archiveReason},{onSuccess:()=>{setArchiveTarget(null);setArchiveReason('');setNotice({ok:true,text:'تم نقل التقرير إلى الأرشيف.'})},onError:error=>setNotice({ok:false,text:friendlyError(error,'تعذر أرشفة التقرير.')})})} className="rounded-xl bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-40">تأكيد الحذف</button><button onClick={()=>setArchiveTarget(null)} className="rounded-xl border px-4 py-2 font-bold">إلغاء</button></div></div></div>}
  </section>
}

function Step({ number, text }: { number: string; text: string }) { return <div className="rounded-2xl bg-white/10 p-3"><b className="ml-2 inline-flex size-7 items-center justify-center rounded-full bg-white text-indigo-900">{number}</b><span className="text-sm font-bold">{text}</span></div> }
function ReportChoice({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) { return <article className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><span className="rounded-2xl bg-indigo-50 p-3 text-indigo-700">{icon}</span><div><h2 className="text-lg font-black">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div></div>{children}</article> }

function TemplatePicker({ templates, value: selected, onChange, disabled, suggested }: { templates: ComplaintTemplate[]; value: string; onChange: (value: string) => void; disabled?: boolean; suggested?: ComplaintTemplate }) {
  return <label className="mt-3 block text-sm font-bold">قالب التقرير
    <select aria-label="قالب التقرير" disabled={disabled} value={selected} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3 disabled:bg-slate-100">
      <option value="">اختيار تلقائي{suggested ? ` — ${suggested.name}` : ''}</option>
      {templates.map(template => <option key={template.id} value={template.id}>{template.name}{template.isDefault ? ' — افتراضي' : ''}</option>)}
    </select>
    {!templates.length && !disabled && <span className="mt-2 block rounded-lg bg-amber-50 p-2 text-xs text-amber-800">لا يوجد قالب نشط مناسب؛ ستُنشأ المسودة بالتصميم الأساسي حتى تضيف قالباً.</span>}
  </label>
}

function ExistingReportNotice({ report }: { report: ComplaintReport }) {
  return <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900"><b>يوجد تقرير سابق لهذا المصدر:</b> {reportStatusLabel(report.status)}. لن نعيد إنشاءه أو نمسح تصميمه؛ الزر سيفتح النسخة الموجودة.</div>
}

function TemplatePreview({ form }: { form: Form }) {
  const authority = form.sector === 'zaafaraniya' && form.authorityLine === 'أمانة بغداد / دائرة بلدية الكرادة'
    ? 'أمانة بغداد / دائرة بلدية الزعفرانية' : form.authorityLine
  return <div className="mt-4 rounded-[2rem] border-4 bg-white p-5 text-center" style={{ borderColor: form.accent }}><div className="mx-auto flex items-center justify-center gap-2"><img src="/icons/baghdad-municipality.png" alt="شعار أمانة بغداد" className="size-12 object-contain" /><img src="/icons/alliance.png" alt="شعار التحالف" className="size-14 object-contain" /><img src="/icons/logo.png" alt="شعار جزيرة الأكرام" className="size-14 object-contain" /></div><p className="mt-3 text-xs font-bold">{authority}</p><p className="mt-1 text-xs font-bold">{form.contractorLine}</p><div className="mt-3 text-lg font-black" style={{ color: form.accent }}>{form.coverTitle}</div><div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs"><div className="rounded-lg bg-slate-100 p-8">{form.afterLabel}</div><div className="rounded-lg bg-slate-100 p-8">{form.beforeLabel}</div></div></div>
}
