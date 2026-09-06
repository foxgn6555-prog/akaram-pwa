import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowRight, CheckCircle2, Download, Eye, FileCheck2, GripVertical, Image as ImageIcon, LayoutTemplate, Mail, Save, Send, ShieldCheck, Sparkles } from 'lucide-react'
import {
  useComplaintItemsMedia, useComplaintReport, useComplaintReportDownload, useGenerateComplaintReport,
  useSaveComplaintReportDraft, useSendComplaintEmail, useSetComplaintReportStatus,
  reportStatusLabel,
  type ComplaintReportDetail,
} from '@features/complaints'
import { ComplaintEmpty, ComplaintStatusBadge, ComplaintWorkflow } from '../../components/ComplaintUi'

const deliveryLabels: Record<string, string> = {
  queued: 'في قائمة الإرسال', accepted: 'قبله مزود البريد', delivered: 'مُسلّم',
  temporary_failure: 'فشل مؤقت', permanent_failure: 'فشل نهائي', rejected: 'مرفوض',
}
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export default function ReportEditorPage() {
  const { id } = useParams()
  const query = useComplaintReport(id ?? null)
  if (query.isLoading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!query.data) return <ComplaintEmpty icon={LayoutTemplate} title="التقرير غير موجود" description="قد يكون التقرير مؤرشفاً أو أن الرابط غير صحيح." />
  return <Editor key={`${query.data.id}-${query.data.createdAt}-${query.data.status}`} initial={query.data} />
}

function Editor({ initial }: { initial: ComplaintReportDetail }) {
  const [title, setTitle] = useState(initial.title)
  const [layout, setLayout] = useState(initial.layout)
  const [recipients, setRecipients] = useState(initial.recipients.join('\n'))
  const [items, setItems] = useState(initial.items)
  const [dragged, setDragged] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState<'cover' | 'table' | 'slides'>('cover')
  const [previewItem, setPreviewItem] = useState(0)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)

  const save = useSaveComplaintReportDraft()
  const generate = useGenerateComplaintReport()
  const approve = useSetComplaintReportStatus()
  const download = useComplaintReportDownload()
  const send = useSendComplaintEmail()
  const includedItems = items.filter(item => item.included)
  const media = useComplaintItemsMedia(includedItems.map(item => item.itemId))

  useEffect(() => {
    setTitle(initial.title); setLayout(initial.layout); setRecipients(initial.recipients.join('\n')); setItems(initial.items); setDirty(false)
  }, [initial])

  const emails = useMemo(() => [...new Set(recipients.split(/[\n,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean))], [recipients])
  const invalidEmails = emails.filter(email => !validEmail(email))
  const editable = ['draft', 'quality_review', 'failed'].includes(initial.status)
  const accent = String(layout.accent ?? '#cf63c6')
  const payload = { id: initial.id, title: title.trim(), layout, recipients: emails, items }
  const canSave = editable && Boolean(title.trim()) && emails.length > 0 && invalidEmails.length === 0 && includedItems.length > 0
  const canGenerate = editable && Boolean(title.trim()) && includedItems.length > 0

  const changeLayout = (key: string, value: unknown) => { setLayout(old => ({ ...old, [key]: value })); setDirty(true) }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    setItems(old => {
      const next = [...old]; const [picked] = next.splice(from, 1); if (!picked) return old
      next.splice(to, 0, picked); return next.map((value, index) => ({ ...value, displayOrder: index + 1 }))
    }); setDirty(true)
  }
  const saveNow = () => {
    if (!canSave) { setMessage('أكمل عنوان التقرير والمستلمين الصحيحين واختر موقعاً واحداً على الأقل.'); return }
    save.mutate(payload, { onSuccess: () => { setDirty(false); setMessage('تم حفظ تصميم التقرير وترتيب المواقع.') }, onError: () => setMessage('تعذر حفظ التعديلات؛ راجع العنوان والمستلمين.') })
  }
  const runGenerate = () => generate.mutate(initial.id, {
    onSuccess: () => { setDirty(false); setMessage('تم توليد PowerPoint وأصبح جاهزاً للمراجعة.') },
    onError: () => setMessage('تعذر توليد PowerPoint؛ تأكد من تضمين موقع واحد على الأقل.'),
  })
  const generateNow = () => {
    if (!canGenerate) { setMessage('لا يمكن التوليد دون عنوان وموقع واحد مضمن على الأقل.'); return }
    if (dirty && canSave) save.mutate(payload, { onSuccess: runGenerate, onError: () => setMessage('تعذر حفظ التعديلات، لذلك لم يُولّد ملف قديم.') })
    else if (dirty) setMessage('احفظ بيانات المستلمين الصحيحة قبل توليد النسخة المعدلة.')
    else runGenerate()
  }

  const slideEntry = includedItems[Math.min(previewItem, Math.max(0, includedItems.length - 1))]
  const before = media.data?.find(value => value.itemId === slideEntry?.itemId && value.kind === 'before')
  const after = media.data?.find(value => value.itemId === slideEntry?.itemId && value.kind === 'after')
  const readyChecks = [
    { label: 'عنوان التقرير', ok: Boolean(title.trim()) },
    { label: 'موقع واحد على الأقل', ok: includedItems.length > 0 },
    { label: 'المستلمون صالحون', ok: emails.length > 0 && invalidEmails.length === 0 },
    { label: 'ملف PowerPoint مولّد', ok: Boolean(initial.pptxPath) },
  ]

  return <section className="min-h-full space-y-5 pb-8" dir="rtl">
    <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-indigo-950 to-fuchsia-900 p-6 text-white shadow-xl">
      <Link to="/complaints/templates" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-100"><ArrowRight size={17} />العودة إلى التقارير</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-bold text-fuchsia-200">{initial.scope === 'email' ? 'تقرير بريد مستقل' : 'تقرير يومي جامع'}</span><h1 className="mt-1 text-2xl font-black sm:text-3xl">محرر التقرير والمراجعة</h1><p className="mt-2 text-sm text-indigo-100">{initial.reportDate} · {initial.sector === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية'} · {reportStatusLabel(initial.status)}</p></div><span className={`rounded-full px-4 py-2 text-xs font-black ${dirty ? 'bg-amber-400 text-amber-950' : 'bg-white/10 text-white'}`}>{dirty ? 'تعديلات غير محفوظة' : 'النسخة محفوظة'}</span></div>
    </header>
    <ComplaintWorkflow current="report" />

    <div className="grid gap-2 rounded-2xl border bg-white p-2 shadow-sm sm:grid-cols-4">{[
      ['1', 'التصميم والترتيب', editable], ['2', 'إنشاء ملف العرض', Boolean(initial.pptxPath)], ['3', 'المراجعة والاعتماد', ['approved', 'sending', 'sent', 'archived'].includes(initial.status)], ['4', 'الإرسال والتسليم', ['sent', 'archived'].includes(initial.status)],
    ].map(([number, label, complete]) => <div key={String(number)} className={`rounded-xl p-3 text-xs font-bold ${complete ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-500'}`}><span className="ml-2 inline-flex size-6 items-center justify-center rounded-full bg-white">{complete ? <CheckCircle2 size={14} /> : number}</span>{label}</div>)}</div>

    {message && <p aria-live="polite" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">{message}</p>}

    <div className="sticky top-2 z-20 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      {editable && <button onClick={saveNow} disabled={save.isPending || !canSave} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Save size={17} />حفظ التصميم</button>}
      {editable && <button disabled={generate.isPending || save.isPending || !canGenerate} onClick={generateNow} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Sparkles size={17} />توليد PowerPoint</button>}
      {initial.pptxPath && <button disabled={download.isPending} onClick={() => download.mutate(initial.pptxPath!, { onSuccess: url => window.open(url, '_blank', 'noopener,noreferrer') })} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-40"><Download size={17} />تنزيل ومراجعة</button>}
      {initial.status === 'quality_review' && <button disabled={approve.isPending || !reviewConfirmed || !initial.pptxPath} onClick={() => approve.mutate({ reportId: initial.id, status: 'approved', reviewedPptxPath: initial.pptxPath ?? undefined }, { onSuccess: () => setMessage('تم اعتماد التقرير.'), onError: () => setMessage('تعذر الاعتماد؛ يشترط ملف PowerPoint مولّد وتأكيد المراجعة.') })} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><ShieldCheck size={17} />اعتماد التقرير</button>}
      {initial.status === 'approved' && initial.pptxPath && <button disabled={!emails.length || invalidEmails.length > 0 || send.isPending} onClick={() => send.mutate({ reportId: initial.id, to: emails, subject: title, text: `السلام عليكم، مرفق ${title}`, attachmentPaths: [initial.pptxPath!] }, { onSuccess: () => setMessage('قُبل طلب الإرسال، وسيتم تحديث حالة التسليم تلقائياً.'), onError: () => setMessage('تعذر الإرسال؛ تحقق من إعداد Mailgun والمستلمين المعتمدين.') })} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Send size={17} />إرسال إلى الجهة المرسلة</button>}
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-24">
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><LayoutTemplate className="text-indigo-700" size={19} /><h2 className="font-black">هوية الشرائح</h2></div>
          <label className="mt-4 block text-xs font-bold">عنوان التقرير<input disabled={!editable} value={title} onChange={event => { setTitle(event.target.value); setDirty(true) }} className="mt-1 w-full rounded-xl border p-2.5 text-sm" /></label>
          <label className="mt-3 flex items-center justify-between text-xs font-bold">اللون الرئيسي<input disabled={!editable} type="color" value={accent} onChange={event => changeLayout('accent', event.target.value)} /></label>
          <label className="mt-3 block text-xs font-bold">عنوان الغلاف<input disabled={!editable} value={String(layout.title ?? 'تقرير معالجة الشكاوى ليوم')} onChange={event => changeLayout('title', event.target.value)} className="mt-1 w-full rounded-xl border p-2.5" /></label>
          <div className="grid grid-cols-2 gap-2"><label className="mt-3 text-xs font-bold">عنوان قبل<input disabled={!editable} value={String(layout.beforeLabel ?? 'صورة التلكؤ / الشكوى')} onChange={event => changeLayout('beforeLabel', event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label><label className="mt-3 text-xs font-bold">عنوان بعد<input disabled={!editable} value={String(layout.afterLabel ?? 'صورة المعالجة')} onChange={event => changeLayout('afterLabel', event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label></div>
          <label className="mt-3 block text-xs font-bold">الخط<select disabled={!editable} value={String(layout.fontFamily ?? 'Arial')} onChange={event => changeLayout('fontFamily', event.target.value)} className="mt-1 w-full rounded-xl border p-2.5"><option>Arial</option><option>Tahoma</option><option>Calibri</option></select></label>
          <label className="mt-3 block text-xs font-bold">حجم عنوان الغلاف: {Number(layout.coverFontSize ?? 30)}<input disabled={!editable} type="range" min="20" max="42" value={Number(layout.coverFontSize ?? 30)} onChange={event => changeLayout('coverFontSize', Number(event.target.value))} className="mt-2 w-full" /></label>
          <label className="mt-3 block text-xs font-bold">ارتفاع الصور: {Number(layout.imageHeight ?? 4.8).toFixed(1)}<input disabled={!editable} type="range" min="3" max="4.8" step="0.1" value={Number(layout.imageHeight ?? 4.8)} onChange={event => changeLayout('imageHeight', Number(event.target.value))} className="mt-2 w-full" /></label>
        </article>
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Mail className="text-indigo-700" size={19} /><h2 className="font-black">المستلمون</h2></div><label className="mt-3 block text-xs font-bold">البريد الأصلي وأي بريد إضافي<textarea disabled={!editable} value={recipients} onChange={event => { setRecipients(event.target.value); setDirty(true) }} placeholder="سطر مستقل لكل بريد" className="mt-2 min-h-28 w-full rounded-xl border p-3" /></label>{invalidEmails.length > 0 && <p className="mt-2 text-xs font-bold text-red-700">عناوين غير صحيحة: {invalidEmails.join('، ')}</p>}</article>
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-black">جاهزية التقرير</h2><ul className="mt-3 space-y-2">{readyChecks.map(check => <li key={check.label} className={`flex items-center gap-2 text-xs font-bold ${check.ok ? 'text-emerald-700' : 'text-slate-400'}`}>{check.ok ? <CheckCircle2 size={16} /> : <FileCheck2 size={16} />}{check.label}</li>)}</ul></article>
      </aside>

      <main className="space-y-5">
        <article className="rounded-3xl border bg-slate-100 p-4 shadow-inner sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Eye className="text-indigo-700" /><div><h2 className="font-black">المعاينة البصرية</h2><p className="text-xs text-slate-500">تمثيل قريب من شرائح PowerPoint قبل التوليد.</p></div></div><div className="flex rounded-xl bg-white p-1">{(['cover', 'table', 'slides'] as const).map(value => <button key={value} onClick={() => setPreview(value)} className={`rounded-lg px-3 py-2 text-xs font-bold ${preview === value ? 'bg-indigo-700 text-white' : 'text-slate-600'}`}>{value === 'cover' ? 'الغلاف' : value === 'table' ? 'الجدول' : 'قبل / بعد'}</button>)}</div></div>
          <div className="mx-auto mt-5 aspect-video w-full max-w-4xl overflow-hidden rounded-xl border bg-white shadow-xl" style={{ borderColor: accent }}>
            {preview === 'cover' && <CoverPreview layout={layout} title={title} accent={accent} initial={initial} />}
            {preview === 'table' && <TablePreview items={includedItems} accent={accent} />}
            {preview === 'slides' && <SlidePreview entry={slideEntry} before={before?.url} after={after?.url} accent={accent} layout={layout} />}
          </div>
          {preview === 'slides' && includedItems.length > 1 && <div className="mt-4 flex items-center justify-center gap-3"><button onClick={() => setPreviewItem(Math.max(0, previewItem - 1))} disabled={previewItem === 0} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold disabled:opacity-40">السابق</button><span className="text-xs font-bold">الموقع {previewItem + 1} من {includedItems.length}</span><button onClick={() => setPreviewItem(Math.min(includedItems.length - 1, previewItem + 1))} disabled={previewItem >= includedItems.length - 1} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold disabled:opacity-40">التالي</button></div>}
        </article>

        <article className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-black">ترتيب ومحتوى التقرير</h2><p className="mt-1 text-xs text-slate-500">السحب أو الأسهم يعيدان ترتيب الشرائح. الاستبعاد لا يحذف بيانات الموقع.</p></div><span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">{includedItems.length} من {items.length} موقع</span></div>
          <div className="mt-4 space-y-2">{items.map((entry, index) => <div key={entry.itemId} draggable={editable} onDragStart={() => setDragged(index)} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragged !== null) move(dragged, index); setDragged(null) }} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${entry.included ? 'bg-white' : 'bg-slate-100 opacity-60'}`}>
            <GripVertical className="cursor-grab text-slate-400" size={18} /><input aria-label={`تضمين الموقع ${entry.item.sequenceNo}`} disabled={!editable} type="checkbox" checked={entry.included} onChange={event => { setItems(old => old.map(value => value.itemId === entry.itemId ? { ...value, included: event.target.checked } : value)); setDirty(true) }} />
            <div className="min-w-0 flex-1"><Link to={`/complaints/items/${entry.itemId}`} className="font-black text-blue-700">{entry.item.referenceNo} / {entry.item.sequenceNo}</Link><p className="truncate text-xs text-slate-500">محلة {entry.item.neighborhood || '—'} · زقاق {entry.item.alley || '—'} · {entry.item.title || 'نوع غير محدد'}</p></div><ComplaintStatusBadge status={entry.item.status} />
            <button disabled={!editable || index === 0} onClick={() => move(index, index - 1)} aria-label="تحريك للأعلى" className="rounded-lg border px-2 py-1">↑</button><button disabled={!editable || index === items.length - 1} onClick={() => move(index, index + 1)} aria-label="تحريك للأسفل" className="rounded-lg border px-2 py-1">↓</button>
          </div>)}</div>
        </article>

        {initial.status === 'quality_review' && <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"><input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} className="mt-1 size-5" /><span>نزّلت ملف PowerPoint وراجعت الغلاف والجدول وكل صور قبل/بعد والمستلمين. أفهم أن الاعتماد يقفل التصميم للإرسال.</span></label>}
      </main>
    </div>

    <article className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black">سجل محاولات التسليم</h2>{!initial.deliveries.length ? <p className="mt-3 text-sm text-slate-500">لم تبدأ أي محاولة إرسال لهذا التقرير.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="bg-slate-50"><th className="p-3 text-right">الوقت</th><th className="p-3 text-right">المستلمون</th><th className="p-3">الحالة</th><th className="p-3 text-right">النتيجة</th></tr></thead><tbody>{initial.deliveries.map(delivery => <tr key={delivery.id} className="border-t"><td className="p-3">{new Date(delivery.createdAt).toLocaleString('ar-IQ')}</td><td className="p-3" dir="ltr">{delivery.recipients.join(', ')}</td><td className="p-3 text-center font-bold">{deliveryLabels[delivery.status] ?? delivery.status}</td><td className="p-3">{delivery.errorMessage ?? (delivery.deliveredAt ? `تم التسليم ${new Date(delivery.deliveredAt).toLocaleString('ar-IQ')}` : 'بانتظار تحديث مزود البريد')}</td></tr>)}</tbody></table></div>}</article>
  </section>
}

function CoverPreview({ layout, title, accent, initial }: { layout: Record<string, unknown>; title: string; accent: string; initial: ComplaintReportDetail }) {
  const configuredAuthority = String(layout.authorityLine ?? '')
  const authority = !configuredAuthority || configuredAuthority === 'أمانة بغداد / دائرة بلدية الكرادة' ? `أمانة بغداد / دائرة بلدية ${initial.sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'}` : configuredAuthority
  return <div className="flex h-full flex-col items-center justify-center p-5 text-center"><div className="flex items-center gap-3"><img src="/icons/baghdad-municipality.png" alt="شعار أمانة بغداد" className="size-12 object-contain sm:size-16" /><img src="/icons/alliance.png" alt="شعار التحالف" className="size-14 object-contain sm:size-20" /><img src="/icons/logo.png" alt="شعار جزيرة الأكرام" className="size-14 object-contain sm:size-20" /></div><p className="mt-3 text-[9px] font-bold sm:text-xs">{authority}</p><p className="mt-1 text-[8px] font-bold sm:text-[11px]">{String(layout.contractorLine ?? 'تحالف شركات جزيرة الأكرام وفيرست ترايد')}</p><h3 className="mt-4 max-w-2xl text-base font-black sm:text-2xl" style={{ color: accent }}>{String(layout.title ?? title)}</h3><p className="mt-3 text-[10px] sm:text-sm">{initial.reportDate} · {initial.sector === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية'}</p></div>
}
function TablePreview({ items, accent }: { items: ComplaintReportDetail['items']; accent: string }) {
  return <div className="h-full p-3 sm:p-5"><h3 className="text-center text-xs font-black sm:text-lg" style={{ color: accent }}>جدول بيانات التلكؤات</h3><table className="mt-3 w-full table-fixed text-[7px] sm:text-xs"><thead style={{ background: accent, color: 'white' }}><tr><th className="p-1">ت</th><th>نوع التلكؤ</th><th>المركز</th><th>المحلة</th><th>الزقاق</th></tr></thead><tbody>{items.slice(0, 8).map((entry, index) => <tr key={entry.itemId} className="border-b odd:bg-slate-50"><td className="p-1 text-center">{index + 1}</td><td>{entry.item.title || '—'}</td><td>{entry.item.municipalCenter || '—'}</td><td>{entry.item.neighborhood || '—'}</td><td>{entry.item.alley || '—'}</td></tr>)}</tbody></table>{items.length > 8 && <p className="mt-2 text-center text-[8px] text-slate-500">+ {items.length - 8} موقع في الصفحات التالية</p>}</div>
}
function SlidePreview({ entry, before, after, accent, layout }: { entry?: ComplaintReportDetail['items'][number]; before?: string; after?: string; accent: string; layout: Record<string, unknown> }) {
  if (!entry) return <div className="flex h-full items-center justify-center text-sm text-slate-400">لا توجد مواقع مضمنة</div>
  return <div className="flex h-full flex-col p-3"><div className="grid grid-cols-2 gap-3"><PreviewImage title={String(layout.afterLabel ?? 'صورة المعالجة')} src={after} accent={accent} /><PreviewImage title={String(layout.beforeLabel ?? 'صورة التلكؤ')} src={before} accent={accent} /></div><p className="mt-auto rounded-lg bg-slate-100 p-2 text-center text-[8px] font-bold sm:text-xs">محلة {entry.item.neighborhood || '—'} · زقاق {entry.item.alley || '—'} · {entry.item.title || 'نوع غير محدد'}</p></div>
}
function PreviewImage({ title, src, accent }: { title: string; src?: string; accent: string }) { return <div className="overflow-hidden rounded-lg border"><div className="p-1 text-center text-[8px] font-bold text-white sm:text-xs" style={{ background: accent }}>{title}</div>{src ? <img src={src} alt={title} className="aspect-[4/3] w-full bg-slate-100 object-contain" /> : <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-[8px] text-slate-400 sm:text-xs"><ImageIcon size={18} className="ml-1" />غير متاحة</div>}</div> }
