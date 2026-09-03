import { useState } from 'react'
import { Link } from 'react-router'
import {
  useComplaintReports, useComplaintTemplates, useGenerateComplaintReport,
  usePrepareComplaintReport, useSaveComplaintTemplate, useSendComplaintEmail,
  useSetComplaintReportStatus, useComplaintReportDownload,
  type ComplaintSector, type ComplaintTemplate,
} from '@features/complaints'

interface TemplateFormState {
  id?: string
  name: string
  description: string
  sector: ComplaintSector | ''
  accent: string
  coverTitle: string
  beforeLabel: string
  afterLabel: string
}

const emptyForm: TemplateFormState = {
  name: '', description: '', sector: '', accent: '#cf63c6',
  coverTitle: 'تقرير معالجة الشكاوى ليوم', beforeLabel: 'صورة التلكؤ / الشكوى', afterLabel: 'صورة المعالجة',
}

function layoutValue(layout: Record<string, unknown>, key: string, fallback: string): string {
  return typeof layout[key] === 'string' && (layout[key] as string).length > 0 ? (layout[key] as string) : fallback
}

export default function TemplatesPage() {
  const { data: templates = [] } = useComplaintTemplates()
  const { data: reports = [] } = useComplaintReports()
  const save = useSaveComplaintTemplate()
  const prepare = usePrepareComplaintReport()
  const generate = useGenerateComplaintReport()
  const setStatus = useSetComplaintReportStatus()
  const send = useSendComplaintEmail()
  const download = useComplaintReportDownload()
  const [form, setForm] = useState<TemplateFormState>(emptyForm)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [sectorPick, setSectorPick] = useState<ComplaintSector>('karrada')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const set = <K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) =>
    setForm((old) => ({ ...old, [key]: value }))

  const layout = (): Record<string, unknown> => ({
    accent: form.accent, title: form.coverTitle, beforeLabel: form.beforeLabel, afterLabel: form.afterLabel,
  })

  const submitTemplate = () => {
    if (!form.name.trim()) { setNotice({ kind: 'err', text: 'اسم القالب مطلوب.' }); return }
    save.mutate({
      id: form.id, name: form.name.trim(), description: form.description.trim() || null,
      sector: form.sector || null, layout: layout(), isDefault: false, isActive: true,
    }, {
      onSuccess: () => { setNotice({ kind: 'ok', text: form.id ? 'تم تحديث القالب.' : 'تمت إضافة القالب.' }); setForm(emptyForm) },
      onError: () => setNotice({ kind: 'err', text: 'تعذر حفظ القالب؛ تحقق من الصلاحية وأعد المحاولة.' }),
    })
  }

  const startEdit = (t: ComplaintTemplate) => {
    const l = t.layout as Record<string, unknown>
    setForm({
      id: t.id, name: t.name, description: t.description ?? '', sector: t.sector ?? '',
      accent: layoutValue(l, 'accent', '#cf63c6'), coverTitle: layoutValue(l, 'title', 'تقرير معالجة الشكاوى ليوم'),
      beforeLabel: layoutValue(l, 'beforeLabel', 'صورة التلكؤ / الشكوى'), afterLabel: layoutValue(l, 'afterLabel', 'صورة المعالجة'),
    })
    setNotice(null)
  }
const defaultTemplate = templates.find((t) => t.isDefault)

  return <section className="space-y-6" dir="rtl">
    <header><h1 className="text-2xl font-bold">القوالب والتقارير اليومية</h1><p className="text-sm text-slate-500">إعداد هوية التقرير وإنشاء مسودة يومية لكل قاطع.</p></header>
    {notice && <p aria-live="polite" className={`rounded-lg p-3 text-sm font-bold ${notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{notice.text}</p>}

    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); submitTemplate() }} className="rounded-xl border bg-white p-5">
        <h2 className="font-bold">{form.id ? 'تعديل القالب' : 'قالب جديد'}</h2>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="اسم القالب (مطلوب)" className="mt-3 w-full rounded-lg border p-2" aria-label="اسم القالب" />
        <input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="وصف اختياري" className="mt-2 w-full rounded-lg border p-2" aria-label="وصف القالب" />
        <select value={form.sector} onChange={(e) => set('sector', e.target.value as ComplaintSector | '')} className="mt-2 w-full rounded-lg border p-2" aria-label="قاطع القالب">
          <option value="">كل القواطع</option><option value="karrada">الكرادة</option><option value="zaafaraniya">الزعفرانية</option>
        </select>
        <label className="mt-3 flex items-center gap-3 text-sm">لون القالب<input type="color" value={form.accent} onChange={(e) => set('accent', e.target.value)} /></label>
        <input value={form.coverTitle} onChange={(e) => set('coverTitle', e.target.value)} placeholder="عنوان الغلاف" className="mt-3 w-full rounded-lg border p-2" aria-label="عنوان الغلاف" />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.beforeLabel} onChange={(e) => set('beforeLabel', e.target.value)} placeholder="عنوان قبل" className="mt-3 rounded-lg border p-2" aria-label="عنوان قبل" />
          <input value={form.afterLabel} onChange={(e) => set('afterLabel', e.target.value)} placeholder="عنوان بعد" className="mt-3 rounded-lg border p-2" aria-label="عنوان بعد" />
        </div>
        <div className="mt-4 rounded-lg border p-3" style={{ borderColor: form.accent }}>
          <div className="rounded p-2 text-center font-bold text-white" style={{ backgroundColor: form.accent }}>{form.coverTitle || 'معاينة'}</div>
          <div className="mt-2 grid grid-cols-2 gap-2"><div className="h-20 rounded bg-slate-100 p-2 text-center text-xs">{form.afterLabel}</div><div className="h-20 rounded bg-slate-100 p-2 text-center text-xs">{form.beforeLabel}</div></div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="rounded-lg bg-rose-700 px-4 py-2 font-bold text-white disabled:opacity-50" disabled={save.isPending}>{save.isPending ? 'جارٍ الحفظ…' : form.id ? 'حفظ التعديل' : 'حفظ القالب'}</button>
          {form.id && <button type="button" onClick={() => { setForm(emptyForm); setNotice(null) }} className="rounded-lg border px-4 py-2 font-bold">إلغاء</button>}
        </div>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); prepare.mutate({ sector: sectorPick, date, templateId: defaultTemplate?.id }) }} className="rounded-xl border bg-white p-5">
        <h2 className="font-bold">إعداد تقرير يومي</h2>
        <p className="mt-1 text-xs text-slate-500">القالب الافتراضي الحالي: {defaultTemplate?.name ?? 'لا يوجد — سيُختار أول قالب نشط تلقائياً'}</p>
        <select value={sectorPick} onChange={(e) => setSectorPick(e.target.value as typeof sectorPick)} className="mt-3 w-full rounded-lg border p-2" aria-label="قاطع التقرير"><option value="karrada">الكرادة</option><option value="zaafaraniya">الزعفرانية</option></select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-3 w-full rounded-lg border p-2" aria-label="تاريخ التقرير" />
        <button className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50" disabled={prepare.isPending}>{prepare.isPending ? 'جارٍ الإعداد…' : 'إنشاء/تحديث المسودة'}</button>
      </form>
    </div>
<div className="grid gap-3 md:grid-cols-2">
      {templates.map((t) => {
        const l = t.layout as Record<string, unknown>
        const accent = layoutValue(l, 'accent', '#cf63c6')
        return <article key={t.id} className="rounded-xl border bg-white p-4" style={{ borderRightColor: accent, borderRightWidth: 6 }}>
          <div className="flex items-center justify-between gap-2">
            <strong>{t.name}</strong>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${t.isDefault ? 'bg-blue-100 text-blue-800' : t.isActive ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-700'}`}>{t.isDefault ? 'الافتراضي' : t.isActive ? 'نشط' : 'معطّل'}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{t.description || (t.sector ? (t.sector === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية') : 'عام لجميع القواطع')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => startEdit(t)} className="rounded border px-3 py-1 text-xs font-bold text-blue-700">تعديل</button>
            {!t.isDefault && <button type="button" onClick={() => save.mutate({ ...t, isDefault: true })} className="rounded border px-3 py-1 text-xs font-bold text-emerald-700">تعيين كافتراضي</button>}
            <button type="button" onClick={() => save.mutate({ ...t, isActive: !t.isActive })} className="rounded border px-3 py-1 text-xs font-bold text-slate-700">{t.isActive ? 'تعطيل' : 'تفعيل'}</button>
          </div>
        </article>
      })}
      {templates.length === 0 && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500 md:col-span-2">لا توجد قوالب بعد — أنشئ أول قالب ثم عيّنه كافتراضياً.</p>}
    </div>

    <div className="rounded-xl border bg-white p-5">
      <h2 className="mb-3 font-bold">مسودات وتقارير</h2>
      {reports.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm">
        <span>{r.title} — {r.sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'} — <b>{r.status}</b></span>
        <div className="flex flex-wrap gap-2">
          <Link to={`/complaints/reports/${r.id}`} className="rounded border px-3 py-1.5 font-bold text-blue-700">فتح المحرر والتفاصيل</Link>
          {['draft', 'quality_review', 'failed'].includes(r.status) && <button onClick={() => generate.mutate(r.id)} className="rounded bg-blue-700 px-3 py-1.5 font-bold text-white">توليد PowerPoint</button>}
          {r.status === 'quality_review' && r.pptxPath && <button onClick={() => download.mutate(r.pptxPath!, { onSuccess: (url) => window.open(url, '_blank', 'noopener,noreferrer') })} className="rounded bg-slate-700 px-3 py-1.5 font-bold text-white">تنزيل للمراجعة</button>}
          {r.status === 'quality_review' && <button onClick={() => setStatus.mutate({ reportId: r.id, status: 'approved' })} className="rounded bg-emerald-700 px-3 py-1.5 font-bold text-white">اعتماد التقرير</button>}
          {r.status === 'approved' && r.pptxPath && <button disabled={!r.recipients.length} onClick={() => send.mutate({ reportId: r.id, to: r.recipients, subject: r.title, text: `مرفق ${r.title}`, attachmentPaths: [r.pptxPath!] })} className="rounded bg-rose-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">إرسال عبر البريد</button>}
        </div>
      </div>)}
      {reports.length === 0 && <p className="py-6 text-center text-slate-500">لا توجد مسودات بعد.</p>}
    </div>
  </section>
}