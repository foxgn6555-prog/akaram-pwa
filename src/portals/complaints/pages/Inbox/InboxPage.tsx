import { useState } from 'react'
import {
  useComplaintInbox,
  useComplaintInboxMedia,
  useCreateComplaintItem,
  useExtractComplaintPdf,
  useComplaintOcr,
  type ComplaintSector,
} from '@features/complaints'

const sectorNames: Record<ComplaintSector, string> = { karrada: 'قاطع الكرادة', zaafaraniya: 'قاطع الزعفرانية' }

export default function InboxPage({ sector }: { sector: ComplaintSector }) {
  const { data = [], isLoading, error, refetch, isFetching } = useComplaintInbox(sector)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [neighborhood, setNeighborhood] = useState('')
  const [alley, setAlley] = useState('')
  const [ocrText, setOcrText] = useState('')
  const media = useComplaintInboxMedia(activeId)
  const createItem = useCreateComplaintItem()
  const extractPdf = useExtractComplaintPdf()
  const ocr = useComplaintOcr()

  const create = () => {
    if (!activeId || selected.length === 0) return
    createItem.mutate(
      { messageId: activeId, mediaIds: selected, fields: { neighborhood, alley, ocrText } },
      { onSuccess: () => { setSelected([]); setNeighborhood(''); setAlley(''); setOcrText('') } },
    )
  }

  return <section className="space-y-5" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">{sectorNames[sector]}</h1><p className="mt-1 text-sm text-slate-500">البريد الوارد والمرفقات المصنفة لهذا القاطع</p></div><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'جارٍ التحديث…' : 'تحديث الوارد'}</button></header>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[1fr_1.4fr_.8fr_.6fr] gap-3 bg-slate-100 px-4 py-3 text-xs font-bold text-slate-600"><span>المرسل</span><span>الموضوع</span><span>وقت الوصول</span><span>المرفقات</span></div>
      {isLoading && <p className="p-6 text-center text-slate-500">جارٍ تحميل البريد…</p>}
      {error && <p className="p-6 text-center text-red-700">تعذر تحميل البريد الوارد</p>}
      {!isLoading && !error && data.length === 0 && <p className="p-8 text-center text-slate-500">لا توجد رسائل مستوردة لهذا القاطع حالياً</p>}
      {data.map((message) => <button type="button" key={message.id} onClick={() => { setActiveId(message.id); setSelected([]) }} className={`grid w-full grid-cols-[1fr_1.4fr_.8fr_.6fr] gap-3 border-t px-4 py-3 text-right text-sm ${activeId === message.id ? 'bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}><span className="truncate">{message.senderName || message.senderEmail}</span><span className="truncate">{message.subject || 'دون موضوع'}</span><time>{new Date(message.receivedAt).toLocaleString('ar-IQ')}</time><span>{message.attachmentCount} ملف</span></button>)}
    </div>
    {activeId && <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">اختيار صور موقع واحد</h2><p className="mt-1 text-xs text-slate-500">حدد صورة أو عدة صور تخص الموقع نفسه. كرر العملية لبقية المواقع في الرسالة.</p>
      {media.isLoading && <p className="py-6 text-center">تحميل المرفقات…</p>}
      {!media.isLoading && (media.data ?? []).length === 0 && <p className="py-6 text-center text-slate-500">لا توجد مرفقات مكتملة لهذه الرسالة بعد</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(media.data ?? []).map((file) => <label key={file.id} className={`relative block rounded-lg border p-2 ${selected.includes(file.id) ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200'}`}>
        <input className="absolute right-3 top-3 z-10 size-5 cursor-pointer" type="checkbox" aria-label={`تحديد ${file.name}`} disabled={!file.mimeType.startsWith('image/')} checked={selected.includes(file.id)} onChange={(e) => setSelected((old) => e.target.checked ? [...old, file.id] : old.filter((id) => id !== file.id))} />
        {file.mimeType.startsWith('image/')
          ? <a href={file.url} target="_blank" rel="noreferrer" aria-label={`فتح ${file.name} في نافذة جديدة`} className="block"><img src={file.url} alt={file.name} loading="lazy" className="h-44 w-full rounded bg-slate-100 object-contain" /><span className="mt-2 block text-center text-xs font-bold text-blue-700">فتح الصورة</span></a>
          : <div className="flex h-44 flex-col items-center justify-center gap-2 rounded bg-slate-100 p-2 text-center text-sm font-bold text-blue-700"><a href={file.url} target="_blank" rel="noreferrer" className="break-all">{file.name}</a>{file.mimeType==='application/pdf'&&<button type="button" disabled={extractPdf.isPending} onClick={()=>activeId&&extractPdf.mutate({messageId:activeId,sourceId:file.id,url:file.url,name:file.name})} className="rounded bg-blue-700 px-3 py-2 text-xs text-white disabled:opacity-50">{extractPdf.isPending?'جارٍ التحويل…':'تحويل الصفحات إلى صور'}</button>}</div>}
        <span className="mt-2 block truncate text-xs">{file.name}</span>{file.duplicate && <span className="text-xs font-bold text-amber-700">صورة مكررة محتملة</span>}
      </label>)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={!selected.length||ocr.isPending} onClick={()=>{const file=(media.data??[]).find(m=>selected.includes(m.id)&&m.mimeType.startsWith('image/'));if(file)ocr.mutate(file.url,{onSuccess:r=>{setOcrText(r.text);if(r.neighborhood)setNeighborhood(r.neighborhood);if(r.alley)setAlley(r.alley)}})}} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{ocr.isPending?'تحليل الصورة…':'OCR واقتراح الموقع'}</button>{ocr.data&&<span className="text-xs text-slate-500">ثقة تقريبية {Math.round(ocr.data.confidence)}% — راجع القيم يدوياً</span>}</div>{ocrText&&<textarea value={ocrText} onChange={e=>setOcrText(e.target.value)} className="mt-3 min-h-20 w-full rounded-lg border p-2 text-sm" aria-label="النص المستخرج"/>}<div className="mt-4 grid gap-3 sm:grid-cols-3"><input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="المحلة (قابل للتعديل)" className="rounded-lg border px-3 py-2 text-sm" /><input value={alley} onChange={(e) => setAlley(e.target.value)} placeholder="الزقاق (قابل للتعديل)" className="rounded-lg border px-3 py-2 text-sm" /><button disabled={!selected.length || createItem.isPending} onClick={create} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">إنشاء موقع للفرز</button></div>
    </div>}
  </section>
}
