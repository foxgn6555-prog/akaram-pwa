import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, ChevronDown, ChevronUp, Inbox, MapPin, Send, Users } from 'lucide-react'
import { useAssignComplaintItems, useComplaintItems, useComplaintManagers, type ComplaintItem, type ComplaintSector } from '@features/complaints'
import { baghdadDateKey } from '@features/complaints/lib/baghdad-date'
import { ComplaintEmpty, ComplaintPageHeader, ComplaintSearch, ComplaintStatusBadge, ComplaintWorkflow } from '../../components/ComplaintUi'

type MailFolder = { complaintId: string; referenceNo: string; name: string; sector: ComplaintSector; receivedAt: string; items: ComplaintItem[] }

export default function AssignmentPage() {
  const [date, setDate] = useState(baghdadDateKey())
  const { data: items = [], isLoading } = useComplaintItems(false,date)
  const { data: managers = [] } = useComplaintManagers()
  const assign = useAssignComplaintItems()
  const [selected, setSelected] = useState<string[]>([])
  const [managerId, setManagerId] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [sector, setSector] = useState<'all' | ComplaintSector>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const pending = useMemo(() => items.filter(item => item.status === 'under_review' || item.status === 'returned'), [items])
  const folders = useMemo(() => {
    const groups = new Map<string, ComplaintItem[]>()
    pending.forEach(item => groups.set(item.complaintId, [...(groups.get(item.complaintId) ?? []), item]))
    return [...groups.values()].map((group): MailFolder => {
      const first = group[0]!
      return {
        complaintId: first.complaintId,
        referenceNo: first.referenceNo,
        name: first.ticketName || first.referenceNo,
        sector: first.sector,
        receivedAt: first.receivedAt,
        items: group.sort((a, b) => a.sequenceNo - b.sequenceNo),
      }
    }).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }, [pending])
  const shown = folders.filter(folder => (sector === 'all' || folder.sector === sector) && `${folder.name} ${folder.referenceNo}`.toLowerCase().includes(search.trim().toLowerCase()))
  const shownItemIds = shown.flatMap(folder => folder.items.map(item => item.id))
  const allShownSelected = shownItemIds.length > 0 && shownItemIds.every(id => selected.includes(id))
  const workloads = useMemo(() => new Map(managers.map(manager => [manager.userId, items.filter(item => item.assignedTo === manager.userId && item.status !== 'approved').length])), [items, managers])

  const toggleItem = (id: string, checked: boolean) => setSelected(old => checked ? [...new Set([...old, id])] : old.filter(value => value !== id))
  const toggleFolder = (folder: MailFolder) => {
    const ids = folder.items.map(item => item.id)
    const fullySelected = ids.every(id => selected.includes(id))
    setSelected(old => fullySelected ? old.filter(id => !ids.includes(id)) : [...new Set([...old, ...ids])])
  }
  const submit = () => assign.mutate({ itemIds: selected, managerId }, {
    onSuccess: count => {
      setMessage(`تم إسناد ${count} تذكرة بنجاح دون نجاح جزئي.`)
      setSelected([])
      setManagerId('')
    },
    onError: () => setMessage('فشل الإسناد؛ لم يتغير أي عنصر من الدفعة.'),
  })

  return <section className="min-h-full space-y-5 pb-8" dir="rtl">
    <ComplaintPageHeader icon={Send} eyebrow="مرحلة الإسناد" title="فرز وإسناد الشكاوى" description="اعمل من مستوى مجلد البريد، ثم اختر المواقع داخله وأسندها لمسؤول واحد. العملية ذرية ولا تسمح بنجاح جزئي." tone="emerald" />
    <ComplaintWorkflow current="assign" />
    {message && <p aria-live="polite" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">{message}</p>}

    <ComplaintSearch value={search} onChange={setSearch} placeholder="ابحث باسم البريد أو الرقم المرجعي">
      <label className="flex items-center gap-2 rounded-xl border bg-white px-3 text-xs font-bold"><CalendarDays size={15}/><input aria-label="تاريخ الإسناد" type="date" value={date} onChange={event=>{setDate(event.target.value);setSelected([]);setExpanded(null)}} className="py-2.5 outline-none"/></label>
      <select aria-label="تصفية القاطع" value={sector} onChange={event => setSector(event.target.value as 'all' | ComplaintSector)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold">
        <option value="all">كل القواطع</option><option value="karrada">الكرادة</option><option value="zaafaraniya">الزعفرانية</option>
      </select>
      <span className="rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-600">{shown.length} مجلد · {shownItemIds.length} تذكرة</span>
    </ComplaintSearch>

    <div className="sticky top-2 z-10 grid gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:grid-cols-[auto_1fr_auto]">
      <button onClick={() => setSelected(allShownSelected ? selected.filter(id => !shownItemIds.includes(id)) : [...new Set([...selected, ...shownItemIds])])} disabled={!shownItemIds.length} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold disabled:opacity-40">{allShownSelected ? 'إلغاء تحديد الكل' : 'تحديد كل المنتظر'}</button>
      <select aria-label="مسؤول القسم للدفعة" value={managerId} onChange={event => setManagerId(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
        <option value="">اختر مسؤول القسم للدفعة</option>
        {managers.map(manager => <option key={manager.userId} value={manager.userId}>{manager.fullName} — لديه {workloads.get(manager.userId) ?? 0} قيد العمل</option>)}
      </select>
      <button onClick={submit} disabled={!selected.length || !managerId || assign.isPending} className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">{assign.isPending ? 'جارٍ الإسناد…' : `إسناد ${selected.length} تذكرة`}</button>
    </div>

    {isLoading ? <div className="h-64 animate-pulse rounded-3xl bg-slate-100" /> : !shown.length ? <ComplaintEmpty icon={Inbox} title="لا توجد تذاكر بانتظار الإسناد" description="ستظهر هنا مجلدات البريد بعد اعتماد بيانات الصور في شاشة الوارد." /> : <div className="space-y-4">
      {shown.map(folder => {
        const open = expanded === folder.complaintId
        const selectedCount = folder.items.filter(item => selected.includes(item.id)).length
        return <article key={folder.complaintId} className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${selectedCount ? 'border-emerald-400 ring-2 ring-emerald-50' : 'border-slate-200'}`}>
          <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-emerald-50">
              <input aria-label={`تحديد مجلد ${folder.referenceNo}`} type="checkbox" checked={selectedCount === folder.items.length} ref={input => { if (input) input.indeterminate = selectedCount > 0 && selectedCount < folder.items.length }} onChange={() => toggleFolder(folder)} className="size-5" />
            </label>
            <button type="button" aria-label={`فتح مجلد ${folder.referenceNo}`} onClick={() => setExpanded(open ? null : folder.complaintId)} className="flex min-w-0 flex-1 items-center gap-3 text-right">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Inbox size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-emerald-700">{folder.referenceNo}</span><strong className="block truncate text-base text-slate-900">{folder.name}</strong><span className="mt-1 block text-xs text-slate-500">{folder.sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'} · {new Date(folder.receivedAt).toLocaleDateString('ar-IQ')}</span></span>
              <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">{selectedCount}/{folder.items.length} محددة</span>
              {open ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
            </button>
          </div>
          {open && <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{folder.items.map(item => <label key={item.id} className={`cursor-pointer rounded-2xl border p-4 transition ${selected.includes(item.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
            <div className="flex items-start gap-3"><input type="checkbox" aria-label={`تحديد ${item.referenceNo}/${item.sequenceNo}`} checked={selected.includes(item.id)} onChange={event => toggleItem(item.id, event.target.checked)} className="mt-1 size-5" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><Link onClick={event => event.stopPropagation()} to={`/complaints/items/${item.id}`} className="font-black text-blue-700">الموقع {item.sequenceNo}</Link><ComplaintStatusBadge status={item.status} /></div><p className="mt-2 truncate text-sm font-bold text-slate-800">{item.title || 'نوع التلكؤ غير محدد'}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} />محلة {item.neighborhood || '—'} · زقاق {item.alley || '—'}</p></div></div>
          </label>)}</div></div>}
        </article>
      })}
    </div>}

    <aside className="flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900"><Users className="mt-0.5 shrink-0" size={19} /><p><b>قاعدة العمل:</b> يمكن توزيع مواقع البريد نفسه على عدة مسؤولين. نفّذ كل مجموعة كدفعة مستقلة، وسيجمع النظام المعالجة لاحقاً حسب «البريد + المسؤول».</p></aside>
  </section>
}
