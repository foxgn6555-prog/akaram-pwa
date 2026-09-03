import { useState } from 'react'
import {
  useCompleteComplaintItem, useComplaintItemMedia, useComplaintItems,
  useStartComplaintItem, compareImageContext, type ComplaintItem,
} from '@features/complaints'

export default function AssignedComplaintsPage() {
  const { data: items = [], isLoading } = useComplaintItems(true)
  return <section className="space-y-5" dir="rtl">
    <header><h1 className="text-2xl font-bold text-slate-900">الشكاوى المسندة إليّ</h1><p className="mt-1 text-sm text-slate-500">لا تظهر هنا إلا المواقع التي أسندها موظف الشكاوى إلى حسابك.</p></header>
    {isLoading && <p className="rounded-xl bg-white p-8 text-center">جارٍ التحميل…</p>}
    {!isLoading && items.length === 0 && <p className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-500">لا توجد شكاوى مسندة إليك</p>}
    <div className="grid gap-4 lg:grid-cols-2">{items.map((item) => <AssignedCard key={item.id} item={item} />)}</div>
  </section>
}

function AssignedCard({ item }: { item: ComplaintItem }) {
  const start = useStartComplaintItem(); const complete = useCompleteComplaintItem()
  const { data: media=[] } = useComplaintItemMedia(item.id)
  const [file,setFile]=useState<File>(); const [preview,setPreview]=useState(''); const [confirmed,setConfirmed]=useState(false); const [similarity,setSimilarity]=useState<number|null>(null)
  const before=media.filter(m=>m.kind==='before'&&m.mimeType.startsWith('image/'))
  return <article className="rounded-xl border bg-white p-5 shadow-sm">
    <div className="flex justify-between"><strong>{item.referenceNo} — موقع {item.sequenceNo}</strong><span className="text-xs font-bold text-blue-700">{item.status}</span></div>
    <p className="mt-2 text-sm text-slate-600">{[item.municipalCenter,item.neighborhood&&`محلة ${item.neighborhood}`,item.alley&&`زقاق ${item.alley}`].filter(Boolean).join(' — ')||item.locationText||'الموقع يحتاج تدقيقاً'}</p>
    <div className="mt-3 grid grid-cols-2 gap-2">{before.map(m=><img key={m.id} src={m.url} alt="صورة الموقع قبل المعالجة" className="h-44 w-full rounded-lg bg-slate-100 object-contain"/>)}</div>
    {item.status==='assigned'&&<button onClick={()=>start.mutate(item.id)} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">بدء المعالجة</button>}
    {item.status==='in_progress'&&<div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3">
      <label className="block text-sm font-bold">التقط أو اختر صورة بعد المعالجة<input className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png" capture="environment" onChange={e=>{const f=e.target.files?.[0];setFile(f);setConfirmed(false);setSimilarity(null);if(!f){setPreview('');return}const url=URL.createObjectURL(f);setPreview(url);if(before[0])void compareImageContext(before[0].url,url).then(setSimilarity)}}/></label>
      {preview&&<div className="grid grid-cols-2 gap-2"><div><b className="text-xs">قبل</b>{before[0]&&<img src={before[0].url} alt="قبل" className="h-40 w-full rounded object-contain"/>}</div><div><b className="text-xs">بعد</b><img src={preview} alt="بعد" className="h-40 w-full rounded object-contain"/></div></div>}
      {similarity!==null&&<p className={`rounded p-2 text-xs font-bold ${similarity<35?'bg-amber-100 text-amber-900':'bg-blue-50 text-blue-800'}`}>تشابه سياق بصري تقريبي: {similarity}%{similarity<35?' — تحذير: راجع أن الصورتين للموقع نفسه.':' — يبقى التأكيد البشري إلزامياً.'}</p>}{preview&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/><span>أؤكد أن صورة «بعد» تخص الموقع والصورة المعروضة في هذه البطاقة.</span></label>}
      <button disabled={!file||!confirmed||complete.isPending} onClick={()=>complete.mutate({itemId:item.id,file:file!})} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تمت معالجة الموقع</button>
      <p className="text-xs text-slate-500">يسجل النظام المستخدم والوقت وGPS عند السماح به، ثم يرسل الموقع إلى تدقيق موظف الشكاوى.</p>
    </div>}
    {item.status==='returned'&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">أعيدت المعالجة: {item.reviewerNotes||'راجع ملاحظة موظف الشكاوى ثم ابدأ من جديد.'}</p>}
  </article>
}
