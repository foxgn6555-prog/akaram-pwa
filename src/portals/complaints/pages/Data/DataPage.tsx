import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight, CalendarDays, Database, FileText, Folder, FolderOpen, MapPin,
  SearchX,
} from 'lucide-react'
import {
  useComplaintItems,
  type ComplaintItem,
  type ComplaintItemStatus,
  type ComplaintSector,
} from '@features/complaints'
import {
  ComplaintEmpty, ComplaintPageHeader, ComplaintSearch, ComplaintStatusBadge,
} from '../../components/ComplaintUi'

const statusFilters: Array<{ value: 'all' | ComplaintItemStatus; label: string }> = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'under_review', label: 'بانتظار الإسناد' },
  { value: 'assigned', label: 'مسندة' },
  { value: 'in_progress', label: 'قيد التنفيذ' },
  { value: 'processed', label: 'بانتظار التدقيق' },
  { value: 'quality_review', label: 'قيد التدقيق' },
  { value: 'approved', label: 'معتمدة' },
  { value: 'returned', label: 'معادة للمسؤول' },
]

const EMPTY_ITEMS: ComplaintItem[] = []
const sectors: Array<{ value: ComplaintSector; label: string; description: string }> = [
  { value: 'karrada', label: 'قاطع الكرادة', description: 'رسائل ومواقع بلدية الكرادة' },
  { value: 'zaafaraniya', label: 'قاطع الزعفرانية', description: 'رسائل ومواقع بلدية الزعفرانية' },
]

function baghdadDateKey(value: string | null | undefined): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function folderDateLabel(key: string): string {
  if (key === 'unknown') return 'تاريخ غير محدد'
  const date = new Date(`${key}T12:00:00+03:00`)
  return new Intl.DateTimeFormat('ar-IQ', {
    timeZone: 'Asia/Baghdad', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(date)
}

function shortDateLabel(key: string): string {
  if (key === 'unknown') return 'غير محدد'
  const date = new Date(`${key}T12:00:00+03:00`)
  return new Intl.DateTimeFormat('ar-IQ', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function matches(item: ComplaintItem, term: string): boolean {
  if (!term) return true
  return `${item.referenceNo} ${item.ticketName} ${item.neighborhood} ${item.alley} ${item.title} ${item.municipalCenter}`
    .toLowerCase()
    .includes(term)
}

export default function DataPage() {
  const { data = [], isLoading, isError } = useComplaintItems(false)
  const [sector, setSector] = useState<ComplaintSector | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | ComplaintItemStatus>('all')

  const sectorRows = useMemo(
    () => sector ? data.filter(item => item.sector === sector) : [],
    [data, sector],
  )
  const folders = useMemo(() => {
    const grouped = new Map<string, ComplaintItem[]>()
    for (const item of sectorRows) {
      const key = baghdadDateKey(item.receivedAt)
      grouped.set(key, [...(grouped.get(key) ?? []), item])
    }
    return [...grouped.entries()]
      .map(([key, items]) => ({
        key,
        items,
        emailCount: new Set(items.map(item => item.inboxMessageId ?? item.complaintId)).size,
        approved: items.filter(item => item.status === 'approved').length,
        active: items.filter(item => item.status !== 'approved').length,
      }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [sectorRows])
  const selectedFolder = folders.find(entry => entry.key === folder)
  const folderRows = selectedFolder?.items ?? EMPTY_ITEMS
  const rows = useMemo(() => {
    const term = query.trim().toLowerCase()
    return folderRows.filter(item => (status === 'all' || item.status === status) && matches(item, term))
  }, [folderRows, query, status])
  const stateCounts = useMemo(
    () => new Map(statusFilters.map(filter => [
      filter.value,
      filter.value === 'all' ? folderRows.length : folderRows.filter(item => item.status === filter.value).length,
    ])),
    [folderRows],
  )
  const sectorCount = (value: ComplaintSector) => data.filter(item => item.sector === value).length
  const sectorFolderCount = (value: ComplaintSector) => new Set(
    data.filter(item => item.sector === value).map(item => baghdadDateKey(item.receivedAt)),
  ).size

  const chooseSector = (value: ComplaintSector) => {
    setSector(value)
    setFolder(null)
    setQuery('')
    setStatus('all')
  }
  const chooseFolder = (value: string) => {
    setFolder(value)
    setQuery('')
    setStatus('all')
  }

  return <section className="min-h-full space-y-5 pb-8" dir="rtl">
    <ComplaintPageHeader
      icon={Database}
      eyebrow="السجل التشغيلي المنظم"
      title="بيانات الشكاوى"
      description="اختر القاطع أولاً، ثم افتح مجلد اليوم لعرض بياناته فقط دون خلط البلديات أو الأيام."
      tone="slate"
    />

    <nav aria-label="مسار تصفح بيانات الشكاوى" className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold shadow-sm">
      <button type="button" onClick={() => { setSector(null); setFolder(null) }} className={sector ? 'text-sky-700' : 'rounded-lg bg-slate-900 px-3 py-2 text-white'}>القواطع</button>
      {sector && <><ArrowRight size={14} className="text-slate-300" /><button type="button" onClick={() => setFolder(null)} className={folder ? 'text-sky-700' : 'rounded-lg bg-slate-900 px-3 py-2 text-white'}>{sectors.find(item => item.value === sector)?.label}</button></>}
      {folder && <><ArrowRight size={14} className="text-slate-300" /><span className="rounded-lg bg-slate-900 px-3 py-2 text-white">{folderDateLabel(folder)}</span></>}
    </nav>

    {isLoading ? <div className="grid gap-4 md:grid-cols-2"><div className="h-40 animate-pulse rounded-3xl bg-slate-100" /><div className="h-40 animate-pulse rounded-3xl bg-slate-100" /></div>
      : isError ? <ComplaintEmpty icon={SearchX} title="تعذر تحميل بيانات الشكاوى" description="تحقق من الاتصال ثم أعد تحميل الصفحة. لم يتم عرض بيانات ناقصة." />
      : !sector ? <div>
        <div className="mb-3"><h2 className="text-lg font-black text-slate-900">١. اختر القاطع</h2><p className="mt-1 text-sm text-slate-500">تبقى بيانات كل بلدية منفصلة طوال عملية التصفح.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          {sectors.map(entry => <button key={entry.value} type="button" onClick={() => chooseSector(entry.value)} className="group rounded-3xl border border-slate-200 bg-white p-6 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg">
            <div className="flex items-start justify-between gap-4"><span className="flex size-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 transition group-hover:bg-sky-700 group-hover:text-white"><Folder size={27} /></span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{sectorCount(entry.value)} موقع</span></div>
            <h3 className="mt-5 text-xl font-black text-slate-900">{entry.label}</h3><p className="mt-1 text-sm text-slate-500">{entry.description}</p>
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-bold"><span className="text-slate-500">{sectorFolderCount(entry.value)} مجلد يومي</span><span className="text-sky-700">فتح القاطع ←</span></div>
          </button>)}
        </div>
      </div>
      : !folder ? <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">٢. اختر مجلد اليوم</h2><p className="mt-1 text-sm text-slate-500">يعرض كل مجلد رسائل ومواقع يوم واحد من {sectors.find(item => item.value === sector)?.label}.</p></div><span className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-800">{folders.length} مجلد · {sectorRows.length} موقع</span></div>
        {!folders.length ? <ComplaintEmpty icon={Folder} title="لا توجد مجلدات في هذا القاطع" description="ستظهر هنا المجلدات اليومية بعد ورود الشكاوى وفرز مواقعها." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {folders.map(entry => <button key={entry.key} type="button" onClick={() => chooseFolder(entry.key)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:border-sky-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 group-hover:bg-amber-100"><Folder size={22} fill="currentColor" /></span><span className="text-xs font-black text-slate-400">{shortDateLabel(entry.key)}</span></div>
            <h3 className="mt-4 font-black text-slate-900">{folderDateLabel(entry.key)}</h3>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]"><span className="rounded-lg bg-slate-50 p-2"><b className="block text-sm text-slate-900">{entry.items.length}</b>موقع</span><span className="rounded-lg bg-slate-50 p-2"><b className="block text-sm text-slate-900">{entry.emailCount}</b>بريد</span><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><b className="block text-sm">{entry.approved}</b>معتمد</span></div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-bold"><span className="text-slate-500">{entry.active} قيد المتابعة</span><span className="text-sky-700">عرض البيانات ←</span></div>
          </button>)}
        </div>}
      </div>
      : <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><FolderOpen className="text-amber-600" />{folderDateLabel(folder)}</h2><p className="mt-1 text-sm text-slate-500">بيانات {sectors.find(item => item.value === sector)?.label} لهذا اليوم فقط.</p></div><button type="button" onClick={() => setFolder(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">العودة إلى المجلدات</button></div>

        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {statusFilters.map(filter => <button key={filter.value} type="button" aria-pressed={status === filter.value} onClick={() => setStatus(filter.value)} className={`rounded-xl px-3 py-3 text-xs font-bold transition ${status === filter.value ? 'bg-slate-900 text-white shadow' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
            {filter.label}<span className={`mr-1.5 rounded-full px-1.5 tabular-nums ${status === filter.value ? 'bg-white/20' : 'bg-slate-200'}`}>{stateCounts.get(filter.value) ?? 0}</span>
          </button>)}
        </div>
        <ComplaintSearch value={query} onChange={setQuery} placeholder="بحث داخل هذا المجلد بالمرجع، اسم البريد، المركز، المحلة أو الزقاق">
          <span className="rounded-xl bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-800 tabular-nums">النتائج: {rows.length}</span>
        </ComplaintSearch>

        {!rows.length ? <ComplaintEmpty icon={FileText} title="لا توجد نتائج مطابقة داخل المجلد" description="غيّر البحث أو مرشح الحالة، أو ارجع إلى مجلد يوم آخر." /> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-100 text-xs text-slate-600"><tr>{['التذكرة والموقع', 'اسم البريد', 'المركز والموقع', 'نوع التلكؤ', 'الحالة', 'تاريخ الاستلام'].map(header => <th key={header} className="p-3 text-right font-black">{header}</th>)}</tr></thead>
              <tbody>{rows.map(item => <tr key={item.id} className="border-t border-slate-100 transition hover:bg-sky-50/50">
                <td className="p-3"><Link className="font-black text-blue-700 hover:underline" to={`/complaints/items/${item.id}`}>{item.referenceNo}/{item.sequenceNo}<span className="sr-only"> — الموقع {item.sequenceNo}</span></Link></td>
                <td className="max-w-64 p-3"><span className="block truncate font-bold text-slate-700" title={item.ticketName || undefined}>{item.ticketName || '—'}</span></td>
                <td className="p-3"><span className="font-bold">{item.municipalCenter || '—'}</span><span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />محلة {item.neighborhood || '—'} · زقاق {item.alley || '—'}</span></td>
                <td className="max-w-52 p-3"><span className="block truncate" title={item.title || undefined}>{item.title || '—'}</span></td>
                <td className="whitespace-nowrap p-3"><ComplaintStatusBadge status={item.status} /></td>
                <td className="whitespace-nowrap p-3 text-slate-600 tabular-nums"><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{shortDateLabel(baghdadDateKey(item.receivedAt))}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>}
      </div>}
  </section>
}
