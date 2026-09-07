import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Database, Filter, MapPin } from 'lucide-react'
import { useComplaintItems, type ComplaintItemStatus, type ComplaintSector } from '@features/complaints'
import { ComplaintEmpty, ComplaintPageHeader, ComplaintSearch, ComplaintStatusBadge } from '../../components/ComplaintUi'

const filters: Array<{ value: 'all' | ComplaintItemStatus; label: string }> = [
  { value: 'all', label: 'كل الحالات' }, { value: 'under_review', label: 'بانتظار الإسناد' },
  { value: 'assigned', label: 'مسندة' }, { value: 'in_progress', label: 'قيد التنفيذ' },
  { value: 'processed', label: 'بانتظار التدقيق' }, { value: 'quality_review', label: 'قيد التدقيق' },
  { value: 'approved', label: 'معتمدة' }, { value: 'returned', label: 'معادة للمسؤول' },
]

function formatReceivedDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-IQ')
}

export default function DataPage() {
  const { data = [], isLoading } = useComplaintItems(false)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState<'all' | ComplaintSector>('all')
  const [status, setStatus] = useState<'all' | ComplaintItemStatus>('all')
  const rows = useMemo(() => {
    const term = query.trim().toLowerCase()
    return data.filter(item => (sector === 'all' || item.sector === sector) && (status === 'all' || item.status === status) && `${item.referenceNo} ${item.ticketName} ${item.neighborhood} ${item.alley} ${item.title} ${item.municipalCenter}`.toLowerCase().includes(term))
  }, [data, query, sector, status])
  const stateCounts = useMemo(() => new Map(filters.map(filter => [filter.value, filter.value === 'all' ? data.length : data.filter(item => item.status === filter.value).length])), [data])

  return <section className="min-h-full space-y-5 pb-8" dir="rtl">
    <ComplaintPageHeader icon={Database} eyebrow="السجل التشغيلي" title="بيانات الشكاوى" description="ابحث في جميع المواقع وراقب حالتها الحالية دون خلط مراحل دورة العمل." tone="slate" />
    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      {filters.map(filter => <button key={filter.value} type="button" aria-pressed={status === filter.value} onClick={() => setStatus(filter.value)} className={`rounded-xl px-3 py-3 text-xs font-bold transition ${status === filter.value ? 'bg-slate-900 text-white shadow' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
        {filter.label}<span className={`mr-1.5 rounded-full px-1.5 tabular-nums ${status === filter.value ? 'bg-white/20' : 'bg-slate-200'}`}>{stateCounts.get(filter.value) ?? 0}</span>
      </button>)}
    </div>
    <ComplaintSearch value={query} onChange={setQuery} placeholder="بحث بالمرجع، اسم البريد، المركز، المحلة أو الزقاق">
      <label className="flex items-center gap-2 text-sm font-bold text-slate-600"><Filter size={16} />
        <select aria-label="تصفية القاطع" value={sector} onChange={event => setSector(event.target.value as 'all' | ComplaintSector)} className="rounded-xl border border-slate-200 px-3 py-2.5">
          <option value="all">كل القواطع</option><option value="karrada">الكرادة</option><option value="zaafaraniya">الزعفرانية</option>
        </select>
      </label>
      <span className="rounded-xl bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-800 tabular-nums">النتائج: {rows.length}</span>
    </ComplaintSearch>

    {isLoading ? <div className="h-64 animate-pulse rounded-3xl bg-slate-100" aria-busy="true" /> : !rows.length ? <ComplaintEmpty icon={Database} title="لا توجد نتائج مطابقة" description="غيّر كلمات البحث أو مرشح الحالة أو القاطع لعرض سجلات أخرى." /> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600"><tr>{['التذكرة والموقع', 'اسم البريد', 'القاطع', 'المركز والموقع', 'نوع التلكؤ', 'الحالة', 'تاريخ الاستلام'].map(header => <th key={header} className="p-3 text-right font-black">{header}</th>)}</tr></thead>
          <tbody>{rows.map(item => <tr key={item.id} className="border-t border-slate-100 transition hover:bg-sky-50/50">
            <td className="p-3"><Link className="font-black text-blue-700 hover:underline" to={`/complaints/items/${item.id}`}>{item.referenceNo}/{item.sequenceNo}<span className="sr-only"> — الموقع {item.sequenceNo}</span></Link></td>
            <td className="max-w-56 p-3"><span className="block truncate font-bold text-slate-700" title={item.ticketName || undefined}>{item.ticketName || '—'}</span></td>
            <td className="whitespace-nowrap p-3">{item.sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'}</td>
            <td className="p-3"><span className="font-bold">{item.municipalCenter || '—'}</span><span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />محلة {item.neighborhood || '—'} · زقاق {item.alley || '—'}</span></td>
            <td className="max-w-52 p-3"><span className="block truncate" title={item.title || undefined}>{item.title || '—'}</span></td><td className="whitespace-nowrap p-3"><ComplaintStatusBadge status={item.status} /></td>
            <td className="whitespace-nowrap p-3 text-slate-600 tabular-nums">{formatReceivedDate(item.receivedAt)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
  </section>
}
