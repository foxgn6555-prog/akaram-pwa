import { useState } from 'react'
import { Link } from 'react-router'
import { useComplaintItemMedia, useComplaintItems, useReviewComplaintItem } from '@features/complaints'

export default function ProcessingPage() {
  const { data: all = [], isLoading } = useComplaintItems(false)
  const items = all.filter((item) => ['processed','quality_review'].includes(item.status))
  const [active, setActive] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const media = useComplaintItemMedia(active)
  const review = useReviewComplaintItem()
  return <section className="space-y-5" dir="rtl">
    <header><h1 className="text-2xl font-bold">معالجة الشكاوى والتدقيق</h1><p className="text-sm text-slate-500">مقارنة صور قبل وبعد وتصحيح البيانات قبل اعتماد التقرير.</p></header>
    {isLoading && <p>جارٍ التحميل…</p>}
    {!isLoading && items.length === 0 && <p className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-500">لا توجد شكاوى بانتظار التدقيق حالياً — ستظهر هنا المواقع المكتملة من المسؤولين.</p>}
    <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
      <div className="space-y-2">{items.map((item) => <div key={item.id} className={`rounded-xl border p-4 ${active===item.id?'border-rose-500 bg-rose-50':'bg-white'}`}><button onClick={() => setActive(item.id)} className="w-full text-right"><strong>{item.referenceNo} — موقع {item.sequenceNo}</strong><p className="text-sm text-slate-500">{item.neighborhood ? `محلة ${item.neighborhood}` : 'المحلة غير مكتملة'} · {item.alley ? `زقاق ${item.alley}` : 'الزقاق غير مكتمل'}</p></button><Link to={`/complaints/items/${item.id}`} className="mt-2 inline-block text-xs font-bold text-blue-700">فتح كل التفاصيل والسجل</Link></div>)}</div>
      <div className="rounded-xl border bg-white p-5">{!active ? <p className="py-16 text-center text-slate-500">اختر شكوى للتدقيق</p> : <>
        <div className="grid gap-3 sm:grid-cols-2">{['before','after'].map((kind) => <div key={kind}><h3 className="mb-2 font-bold">{kind==='before'?'قبل المعالجة':'بعد المعالجة'}</h3>{(media.data??[]).filter((m)=>m.kind===kind&&m.mimeType.startsWith('image/')).map((m)=><img key={m.id} src={m.url} alt={m.name} className="mb-2 h-64 w-full rounded-lg object-contain bg-slate-100" />)}</div>)}</div>
        <textarea value={note} onChange={(e)=>setNote(e.target.value)} placeholder="ملاحظات التدقيق أو سبب الإرجاع" className="mt-4 min-h-24 w-full rounded-lg border p-3" />
        <div className="mt-3 flex gap-2"><button onClick={()=>review.mutate({itemId:active,approved:true,note})} className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white">اعتماد</button><button disabled={!note.trim()} onClick={()=>review.mutate({itemId:active,approved:false,note})} className="rounded-lg bg-amber-600 px-4 py-2 font-bold text-white disabled:opacity-50">إرجاع للمسؤول</button></div>
      </>}</div>
    </div>
  </section>
}
