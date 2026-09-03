import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useComplaintItems, type ComplaintItemStatus } from '@features/complaints'

const statusLabel: Record<ComplaintItemStatus, string> = {
  under_review: 'قيد المراجعة', assigned: 'مسندة', in_progress: 'قيد التنفيذ',
  processed: 'بانتظار التدقيق', quality_review: 'قيد التدقيق', approved: 'معتمدة', returned: 'معادة للمسؤول',
}

export default function DataPage() {
  const { data=[] } = useComplaintItems(false); const [q,setQ]=useState(''); const [sector,setSector]=useState('all')
  const rows=useMemo(()=>data.filter((x)=>(sector==='all'||x.sector===sector)&&`${x.referenceNo} ${x.neighborhood} ${x.alley} ${x.title}`.includes(q)),[data,q,sector])
  return <section className="space-y-5" dir="rtl"><header><h1 className="text-2xl font-bold">بيانات الشكاوى</h1><p className="text-sm text-slate-500">بحث وتصفية لجميع المواقع مع حالتها الحالية.</p></header><div className="flex gap-2"><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="بحث بالرقم أو المحلة أو الزقاق" className="flex-1 rounded-lg border px-3 py-2"/><select value={sector} onChange={(e)=>setSector(e.target.value)} className="rounded-lg border px-3"><option value="all">كل القواطع</option><option value="karrada">الكرادة</option><option value="zaafaraniya">الزعفرانية</option></select></div><div className="overflow-auto rounded-xl border bg-white"><table className="w-full min-w-[800px] text-sm"><thead className="bg-slate-100"><tr>{['المرجع','القاطع','المركز','المحلة','الزقاق','الحالة','تاريخ الاستلام'].map(h=><th key={h} className="p-3 text-right">{h}</th>)}</tr></thead><tbody>{rows.map(x=><tr key={x.id} className="border-t"><td className="p-3 font-bold"><Link className="text-blue-700 hover:underline" to={`/complaints/items/${x.id}`}>{x.referenceNo}/{x.sequenceNo}</Link></td><td className="p-3">{x.sector==='karrada'?'الكرادة':'الزعفرانية'}</td><td className="p-3">{x.municipalCenter||'—'}</td><td className="p-3">{x.neighborhood||'—'}</td><td className="p-3">{x.alley||'—'}</td><td className="p-3">{statusLabel[x.status] ?? x.status}</td><td className="p-3">{new Date(x.receivedAt).toLocaleDateString('ar-IQ')}</td></tr>)}</tbody></table></div></section>
}
