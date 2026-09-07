import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowRight, CheckCircle2, Clock3, FileText, History, Image as ImageIcon, Mail, MapPin, PencilLine, ShieldCheck } from 'lucide-react'
import {
  useComplaintDeliveries, useComplaintItemDetail, useReplaceComplaintItemMedia,
  useReviewComplaintItem, useUpdateComplaintItemDuringReview,
  type ComplaintItemDetail,
} from '@features/complaints'
import { ComplaintStatusBadge } from '../../components/ComplaintUi'

const statusLabel: Record<string, string> = {
  under_review: 'بانتظار الإسناد', assigned: 'مسندة إلى المسؤول', in_progress: 'قيد التنفيذ',
  processed: 'بانتظار تدقيق موظف الشكاوى', quality_review: 'قيد التدقيق', approved: 'معتمدة',
  returned: 'معادة إلى المسؤول', queued: 'في قائمة الإرسال', accepted: 'قبلها مزود البريد',
  delivered: 'تم التسليم', temporary_failure: 'فشل مؤقت', permanent_failure: 'فشل نهائي', rejected: 'مرفوضة',
}

function cleanMailBody(value: string | null) {
  if (!value) return ''
  return value.split(/\r?\n/).filter(line => !/^\s*\[(?:image|صورة)\s*:/i.test(line)).join('\n').trim()
}

export default function ComplaintDetailPage() {
  const { id } = useParams()
  const detail = useComplaintItemDetail(id ?? null)
  if (detail.isLoading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!detail.data) return <div className="rounded-3xl border border-rose-200 bg-rose-50 p-12 text-center text-rose-800"><b>تعذر العثور على الموقع المطلوب</b><Link to="/complaints/data" className="mt-3 block text-sm underline">العودة إلى بيانات الشكاوى</Link></div>
  return <DetailContent detail={detail.data} />
}

function DetailContent({ detail }: { detail: ComplaintItemDetail }) {
  const review = useReviewComplaintItem()
  const updateLocation = useUpdateComplaintItemDuringReview()
  const replaceMedia = useReplaceComplaintItemMedia()
  const { data: deliveries = [] } = useComplaintDeliveries(detail.item.complaintId)
  const item = detail.item
  const [note, setNote] = useState('')
  const [edit, setEdit] = useState({ neighborhood: item.neighborhood ?? '', alley: item.alley ?? '', municipalCenter: item.municipalCenter ?? '', locationText: item.locationText ?? '' })
  const [editReason, setEditReason] = useState('')
  const [replaceReason, setReplaceReason] = useState('')
  const [message, setMessage] = useState('')
  const canReview = ['processed', 'quality_review'].includes(item.status)
  const mailBody = useMemo(() => cleanMailBody(detail.bodyText), [detail.bodyText])
  const beforeMedia = detail.media.filter(media => media.kind === 'before' && media.mimeType.startsWith('image/'))
  const afterMedia = detail.media.filter(media => media.kind === 'after' && media.mimeType.startsWith('image/'))
  const hasActiveAfter = afterMedia.some(media => media.isActive)

  return <section className="min-h-full space-y-5 pb-8" dir="rtl">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-sky-950 to-indigo-950 p-6 text-white shadow-xl sm:p-7">
      <div className="absolute -left-12 -top-16 size-56 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="relative"><Link to="/complaints/data" className="inline-flex items-center gap-2 text-sm font-bold text-sky-100"><ArrowRight size={17} />العودة إلى بيانات الشكاوى</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-bold text-sky-200">بطاقة موقع الشكوى</span><h1 className="mt-1 text-2xl font-black sm:text-3xl">الموقع {item.sequenceNo} — {item.referenceNo}</h1><p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-200"><MapPin size={15} />{item.sector === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية'}<span>•</span>محلة {item.neighborhood || 'غير محددة'}<span>•</span>زقاق {item.alley || 'غير محدد'}</p></div><ComplaintStatusBadge status={item.status} /></div>
      </div>
    </header>

    {message && <p aria-live="polite" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900">{message}</p>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.7fr)]">
      <main className="space-y-5">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><MapPin size={20} /></span><div><h2 className="font-black text-slate-900">بيانات الموقع</h2><p className="text-xs text-slate-500">البيانات المعتمدة التي ستظهر في التقرير.</p></div></div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="المركز البلدي" value={item.municipalCenter} />
            <Info label="المحلة" value={item.neighborhood} />
            <Info label="الزقاق" value={item.alley} />
            <Info label="نوع التلكؤ" value={item.title} />
            <Info label="وصف الموقع" value={item.locationText} wide />
            <Info label="البريد المرسل" value={detail.senderEmail} ltr />
          </dl>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Mail size={20} /></span><div><h2 className="font-black">الرسالة الأصلية</h2><p className="text-xs text-slate-500">تُخفى أسماء ملفات الصور من النص لأنها معروضة في قسم الصور.</p></div></div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">موضوع الرسالة</p><h3 className="mt-1 font-black text-slate-900">{detail.subject || 'دون موضوع'}</h3>{mailBody ? <p className="mt-3 whitespace-pre-wrap break-words border-t border-slate-200 pt-3 text-sm leading-7 text-slate-700">{mailBody}</p> : <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-500">لا يوجد نص إضافي؛ المرفقات والصور معروضة أدناه.</p>}</div>
        </article>

        <MediaSection title="صور قبل المعالجة" hint="الصور الواردة من البريد" media={beforeMedia} kind="before" canEdit={canReview} replaceReason={replaceReason} setReplaceReason={setReplaceReason} pending={replaceMedia.isPending} onReplace={(oldMediaId, kind, file) => replaceMedia.mutate({ itemId: item.id, oldMediaId, kind, file, reason: replaceReason }, { onSuccess: () => setMessage('تم استبدال الصورة مع الاحتفاظ بالنسخة السابقة وسجل التدقيق.') })} />
        <MediaSection title="صور بعد المعالجة" hint="الصور المرفوعة من مسؤول القسم" media={afterMedia} kind="after" canEdit={canReview} replaceReason={replaceReason} setReplaceReason={setReplaceReason} pending={replaceMedia.isPending} onReplace={(oldMediaId, kind, file) => replaceMedia.mutate({ itemId: item.id, oldMediaId, kind, file, reason: replaceReason }, { onSuccess: () => setMessage('تم استبدال الصورة مع الاحتفاظ بالنسخة السابقة وسجل التدقيق.') })} />

        {canReview && <article className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><ShieldCheck className="text-emerald-700" /><div><h2 className="font-black text-emerald-950">قرار التدقيق النهائي</h2><p className="text-xs text-emerald-800">تأكد من تطابق الموقع وصور قبل وبعد قبل اتخاذ القرار.</p></div></div>{!hasActiveAfter && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-white p-3 text-sm font-bold text-red-800">لا يمكن الاعتماد قبل وجود صورة معالجة فعالة لهذا الموقع.</p>}<textarea aria-label="ملاحظة التدقيق" value={note} onChange={event => setNote(event.target.value)} placeholder="اكتب الملاحظة؛ وهي إلزامية عند إعادة التذكرة" className="mt-4 min-h-24 w-full rounded-xl border border-emerald-200 bg-white p-3" /><div className="mt-3 flex flex-wrap gap-2"><button disabled={review.isPending || !hasActiveAfter} onClick={() => review.mutate({ itemId: item.id, approved: true, note }, { onSuccess: () => setMessage('تم اعتماد الموقع بنجاح.') })} className="rounded-xl bg-emerald-700 px-5 py-2.5 font-bold text-white disabled:opacity-50">اعتماد الموقع</button><button disabled={!note.trim() || review.isPending} onClick={() => review.mutate({ itemId: item.id, approved: false, note }, { onSuccess: () => setMessage('أُعيد الموقع إلى المسؤول مع الملاحظة.') })} className="rounded-xl bg-amber-600 px-5 py-2.5 font-bold text-white disabled:opacity-50">إعادة إلى المسؤول</button></div></article>}
      </main>

      <aside className="space-y-5">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><History className="text-violet-700" size={20} /><h2 className="font-black">سجل الحالات</h2></div><ol className="mt-5 space-y-4">{detail.history.length === 0 ? <li className="text-sm text-slate-500">لا توجد حركات مسجلة.</li> : detail.history.map((event, index) => <li key={event.id} className="relative border-r-2 border-violet-200 pr-4"><span className="absolute -right-[7px] top-1 size-3 rounded-full border-2 border-white bg-violet-500" /><p className="text-sm font-black text-slate-800">{event.fromStatus ? `${statusLabel[event.fromStatus] ?? event.fromStatus} ← ` : ''}{statusLabel[event.toStatus] ?? event.toStatus}</p><time className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 size={12} />{new Date(event.createdAt).toLocaleString('ar-IQ')}</time>{event.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs leading-6 text-slate-600">{event.note}</p>}{index === 0 && !event.fromStatus && <span className="mt-1 block text-[10px] text-violet-600">بداية السجل</span>}</li>)}</ol></article>

        {canReview && <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><PencilLine className="text-slate-700" size={19} /><h2 className="font-black">تصحيح بيانات الموقع</h2></div><p className="mt-2 text-xs leading-6 text-slate-500">المركز البلدي محدد آلياً حسب القاطع ولا يُدخل يدوياً.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Field label="المحلة" value={edit.neighborhood} onChange={value => setEdit({ ...edit, neighborhood: value })} /><Field label="الزقاق" value={edit.alley} onChange={value => setEdit({ ...edit, alley: value })} /><Field label="وصف الموقع" value={edit.locationText} onChange={value => setEdit({ ...edit, locationText: value })} /></div><Field label="سبب التصحيح" value={editReason} onChange={setEditReason} className="mt-3" /><button disabled={!edit.neighborhood.trim() || !edit.alley.trim() || editReason.trim().length < 3 || updateLocation.isPending} onClick={() => updateLocation.mutate({ itemId: item.id, fields: edit, reason: editReason }, { onSuccess: () => setMessage('تم تصحيح بيانات الموقع وتسجيل السبب في السجل.') })} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white disabled:opacity-40">حفظ التصحيح</button></article>}

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><FileText className="text-sky-700" size={19} /><h2 className="font-black">محاولات الإرسال</h2></div>{deliveries.length === 0 ? <p className="mt-3 text-sm text-slate-500">لا توجد محاولات مرتبطة بهذا الموقع.</p> : <div className="mt-3 space-y-3">{deliveries.map(delivery => <div key={delivery.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-2"><b>{statusLabel[delivery.status] ?? delivery.status}</b><time className="text-xs text-slate-500">{new Date(delivery.createdAt).toLocaleDateString('ar-IQ')}</time></div><p className="mt-1 break-all text-xs text-slate-600" dir="ltr">{delivery.recipients.join('، ')}</p>{delivery.errorMessage && <p className="mt-2 text-xs font-bold text-rose-700">{delivery.errorMessage}</p>}</div>)}</div>}</article>
      </aside>
    </div>
  </section>
}

function Info({ label, value, wide, ltr }: { label: string; value: string | null; wide?: boolean; ltr?: boolean }) { return <div className={`rounded-2xl border border-slate-100 bg-slate-50 p-4 ${wide ? 'lg:col-span-2' : ''}`}><dt className="text-xs font-bold text-slate-500">{label}</dt><dd dir={ltr ? 'ltr' : undefined} className={`mt-1 break-words font-black text-slate-900 ${ltr ? 'text-right' : ''}`}>{value || '—'}</dd></div> }
function Field({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (value: string) => void; className?: string }) { return <label className={`block text-xs font-bold text-slate-600 ${className}`}>{label}<input value={value} onChange={event => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-sky-500" /></label> }

function MediaSection({ title, hint, media, kind, canEdit, replaceReason, setReplaceReason, pending, onReplace }: { title: string; hint: string; media: ComplaintItemDetail['media']; kind: 'before' | 'after'; canEdit: boolean; replaceReason: string; setReplaceReason: (value: string) => void; pending: boolean; onReplace: (oldMediaId: string, kind: 'before' | 'after', file: File) => void }) {
  const active = media.filter(value => value.isActive)
  const previous = media.filter(value => !value.isActive)
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`flex size-10 items-center justify-center rounded-xl ${kind === 'before' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><ImageIcon size={20} /></span><div><h2 className="font-black">{title}</h2><p className="text-xs text-slate-500">{hint}</p></div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{active.length} صورة</span></div>
    {canEdit && active.length > 0 && <label className="mt-4 block text-xs font-bold text-slate-600">سبب استبدال الصورة<input value={replaceReason} onChange={event => setReplaceReason(event.target.value)} placeholder="يُحفظ السبب في سجل التدقيق" className="mt-1.5 w-full rounded-xl border p-2.5" /></label>}
    {active.length === 0 ? <div className="mt-4 flex min-h-36 items-center justify-center rounded-2xl border border-dashed bg-slate-50 text-sm text-slate-500"><ImageIcon className="ml-2" size={20} />لا توجد صورة {kind === 'before' ? 'قبل' : 'بعد'} متاحة</div> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{active.map(value => <figure key={value.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><a href={value.url} target="_blank" rel="noreferrer"><img src={value.url} alt={kind === 'before' ? 'صورة قبل المعالجة' : 'صورة بعد المعالجة'} className="aspect-[4/3] w-full bg-slate-100 object-contain" /></a><figcaption className="space-y-1 p-3 text-xs text-slate-600"><p className="flex items-center gap-1 font-bold"><CheckCircle2 size={13} className="text-emerald-600" />صورة فعالة</p><p className="break-all font-mono" dir="ltr">{value.mediaCode}</p><p>{value.capturedAt ? new Date(value.capturedAt).toLocaleString('ar-IQ') : value.name}</p>{canEdit && <label className="mt-2 block cursor-pointer rounded-lg border bg-white p-2 text-center font-bold text-sky-700">اختيار صورة بديلة<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={replaceReason.trim().length < 3 || pending} onChange={event => { const file = event.target.files?.[0]; if (file) onReplace(value.id, kind, file) }} /></label>}</figcaption></figure>)}</div>}
    {previous.length > 0 && <details className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-700"><span>النسخ السابقة</span> ({previous.length})</summary><div className="mt-3 space-y-2">{previous.map(value => <a key={value.id} href={value.url} target="_blank" rel="noreferrer" className="block rounded-lg bg-white p-2 text-xs text-slate-600"><code className="break-all" dir="ltr">{value.mediaCode}</code><span className="mt-1 block">{value.replacementReason || 'تم استبدال الصورة'}{value.supersededAt ? ` — ${new Date(value.supersededAt).toLocaleString('ar-IQ')}` : ''}</span></a>)}</div></details>}
  </article>
}
