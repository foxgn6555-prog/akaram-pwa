/**
 * طلب مستلزمات القاطع (00162) — من قائمة مخزن غرفة العمليات:
 * اسم المسؤول تلقائي · اختيار المواد (مادة + كمية) · ملاحظة · إقرار التوقيع الإلكتروني · إرسال.
 * يمر الطلب بسلسلة الموافقات المضبوطة من التطوير المركزية (وبلا سلسلة يصل غرفة العمليات مباشرة)،
 * ثم يبقى معلّقاً في مخزن غرفة العمليات حتى يستلمه أحد. الكتاب يبقى قابلاً للطباعة/Word.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import { useManagerProfile, useSectors, useSupplies } from '@features/sector'
import { SHIFT_LABELS, type SupplyRequest } from '@features/sector/types'
import { toSupplyWord, printSupplyBook } from '@features/sector/lib/supply-book'
import { useCreateSupplyRequest, useStoreItems, useSupplyRequests } from '@features/ops-store/hooks'
import { useApprovalTimeline } from '@features/sector-manager/hooks'
import { STATUS_AR, dateAr } from '@features/sector-manager/format'
import type { SupplyRequestRow } from '@sdk/ops-store.sdk'
import { Icon } from '@components/ui/Icon/Icon'
import { EmptyState } from '@components/feedback/EmptyState'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const SUPPLY_STATUS_AR: Record<string, string> = { pending: 'قيد الموافقة', approved: 'غير جاهز للتسليم — بانتظار تجهيز غرفة العمليات', ready: 'جاهز للتسليم في غرفة العمليات', delivered: 'سُلّم', rejected: 'مرفوض', cancelled: 'مُلغى' }
const STATUS_CLS: Record<string, string> = { pending: 'bg-amber-100 text-amber-800', approved: 'bg-orange-100 text-orange-800', ready: 'bg-sky-100 text-sky-800', delivered: 'bg-emerald-100 text-emerald-800', rejected: 'bg-rose-100 text-rose-800', cancelled: 'bg-slate-200 text-slate-700' }

export default function NewRequestPage() {
  const navigate = useNavigate()
  const profile = useManagerProfile(), sectors = useSectors()
  const items = useStoreItems(), create = useCreateSupplyRequest()
  const mine = useSupplyRequests('all'), books = useSupplies('active')
  const [lines, setLines] = useState<Record<string, string>>({})   // item_id → qty
  const [notes, setNotes] = useState(''), [signed, setSigned] = useState(false), [pick, setPick] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)

  const sectorNames = useMemo(() => { const m: Record<number, string> = {}; for (const s of sectors.data ?? []) m[s.id] = s.name; return m }, [sectors.data])
  const mySectorNames = (profile.data?.sectors ?? []).map((id) => sectorNames[id] ?? `قاطع ${id}`).join('، ')
  const catalog = items.data ?? []
  const chosen = Object.keys(lines)
  const valid = chosen.length > 0 && chosen.every((id) => Number(lines[id]) > 0) && signed && !create.isPending
  const addLine = (id: string) => { if (!id || lines[id] !== undefined) return; setLines((l) => ({ ...l, [id]: '1' })); setPick('') }
  const send = () => {
    if (!valid) return
    create.mutate({ items: chosen.map((id) => ({ item_id: id, qty: Number(lines[id]) })), notes: notes.trim() || null }, { onSuccess: (id) => { setCreatedId(id); setLines({}); setNotes(''); setSigned(false) } })
  }
  const createdBook: SupplyRequest | undefined = createdId ? (books.data ?? []).find((b) => b.id === createdId) : undefined

  return (
    <div className="space-y-5 pb-4" data-testid="request-page">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/manager')} aria-label="رجوع" className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><Icon name="chevron-right" size={18} /></button>
        <div>
          <h1 className="text-lg font-bold text-slate-800">طلب مستلزمات القاطع</h1>
          <p className="text-sm text-slate-500">من مخزن غرفة العمليات · يمر بسلسلة الموافقات ثم يُسلَّم من غرفة العمليات</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send() }} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" data-testid="supply-form">
        <div className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
          <div><span className="text-slate-500">مقدّم الطلب: </span><b className="text-slate-800">مسؤول القسم</b></div>
          <div><span className="text-slate-500">الشفت: </span><b className="text-slate-800">{profile.data ? SHIFT_LABELS[profile.data.shift] : '—'}</b></div>
          <div><span className="text-slate-500">المناطق: </span><b className="text-slate-800">{mySectorNames || '—'}</b></div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">أضف مادة من المخزن <span className="text-red-500">*</span>
            {items.isLoading ? <LoadingSpinner /> : catalog.length === 0 ? (
              <p className="mt-1 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800" data-testid="catalog-empty">مخزن غرفة العمليات فارغ — لا يمكن الطلب حتى تضيف غرفة العمليات المواد.</p>
            ) : (
              <select data-testid="f-item-pick" value={pick} onChange={(e) => addLine(e.target.value)} className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-normal">
                <option value="">— اختر مادة —</option>
                {catalog.filter((c) => lines[c.id] === undefined).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
              </select>
            )}
          </label>
          {chosen.length > 0 && (
            <ul className="mt-2 divide-y rounded-xl border" data-testid="f-lines">
              {chosen.map((id) => { const c = catalog.find((x) => x.id === id); return (
                <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`f-line-${id}`}>
                  <span className="flex-1">{c?.name ?? id}</span>
                  <input type="number" min={1} step="any" inputMode="numeric" data-testid={`f-qty-${id}`} value={lines[id]} onChange={(e) => setLines((l) => ({ ...l, [id]: e.target.value }))} className="h-10 w-24 rounded-lg border px-2 text-center" />
                  <span className="w-12 text-xs text-slate-500">{c?.unit}</span>
                  <button type="button" aria-label="حذف" data-testid={`f-del-${id}`} onClick={() => setLines((l) => { const n = { ...l }; delete n[id]; return n })} className="text-rose-600"><Icon name="x" size={16} /></button>
                </li>
              ) })}
            </ul>
          )}
        </div>

        <label className="block text-xs font-medium text-slate-600">ملاحظات (اختياري)
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="f-supply-notes" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal outline-none focus:border-brand-500" />
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} data-testid="f-supply-sign" className="mt-0.5 size-5 accent-brand-600" />
          <span className="text-sm leading-6 text-slate-700">أُقرّ بصفتي مسؤول القسم أن هذه المستلزمات لازمة لعمل مناطقي وأتحمّل مسؤولية الطلب (التوقيع الإلكتروني).</span>
        </label>
        <button type="submit" disabled={!valid} data-testid="supply-send" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm disabled:opacity-50 sm:w-auto sm:px-6">
          <Icon name="send" size={16} /> {create.isPending ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
        </button>
        {createdId && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" data-testid="supply-created">
            <p className="text-sm font-bold text-emerald-800">✓ أُرسل الطلب{createdBook?.ref_no ? ` رقم ${createdBook.ref_no}` : ''} — سيمر بالموافقات ثم يُسلَّم من غرفة العمليات.</p>
            {createdBook && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => printSupplyBook(createdBook, sectorNames)} data-testid="supply-print" className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700"><Icon name="printer" size={15} /> طباعة / PDF</button>
                <button type="button" onClick={() => toSupplyWord(createdBook, sectorNames)} data-testid="supply-word" className="flex h-10 items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-4 text-sm font-bold text-brand-700"><Icon name="download" size={15} /> تصدير Word</button>
              </div>
            )}
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">طلباتي</h2>
        {mine.isLoading ? <LoadingSpinner /> : (mine.data ?? []).length === 0 ? <EmptyState title="لا توجد طلبات بعد" hint="أنشئ أول طلب مستلزمات من الأعلى" /> : (
          <ul className="space-y-2" data-testid="supply-list">
            {(mine.data ?? []).map((r) => <MyRequest key={r.id} r={r} book={(books.data ?? []).find((b) => b.id === r.id)} sectorNames={sectorNames} />)}
          </ul>
        )}
      </div>
    </div>
  )
}

function MyRequest({ r, book, sectorNames }: { r: SupplyRequestRow; book?: SupplyRequest; sectorNames: Record<number, string> }) {
  const [open, setOpen] = useState(false)
  const tl = useApprovalTimeline(open ? 'supplies' : undefined, open ? r.id : undefined)
  return (
    <li className="rounded-xl border p-3 text-sm" data-testid={`my-supply-${r.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-emerald-700">{r.ref_no ?? '—'} <span className="font-normal text-slate-500">· {dateAr(r.created_at)}</span></div>
        <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', STATUS_CLS[r.approval_status])} data-testid={`my-supply-status-${r.id}`}>{SUPPLY_STATUS_AR[r.approval_status]}{r.approval_status === 'pending' && r.current_step ? ` · عند: ${r.current_step}` : ''}</span>
      </div>
      <div className="mt-1 text-slate-800">{r.items.map((i) => `${i.name} × ${i.qty} ${i.unit}${i.delivered_qty !== null && i.delivered_qty !== i.qty ? ` (سُلّم ${i.delivered_qty})` : ''}`).join('، ')}</div>
      {r.approval_status === 'ready' && <div className="text-[11px] text-sky-700">جُهّز {dateAr(r.ready_at)}{r.ready_note ? ` · ${r.ready_note}` : ''} — راجع غرفة العمليات لاستلامه</div>}
      {r.approval_status === 'delivered' && <div className="text-[11px] text-slate-500">استلمها {r.receiver_name} · {dateAr(r.delivered_at)}</div>}
      {r.cancel_reason && <div className="text-[11px] text-rose-700">سبب الإلغاء: {r.cancel_reason}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" data-testid={`my-supply-path-${r.id}`} onClick={() => setOpen((v) => !v)} className="rounded-lg px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50">{open ? 'إخفاء المسار' : 'مسار الموافقات'}</button>
        {book && <>
          <button type="button" onClick={() => printSupplyBook(book, sectorNames)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"><Icon name="printer" size={13} /> طباعة</button>
          <button type="button" onClick={() => toSupplyWord(book, sectorNames)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50"><Icon name="download" size={13} /> Word</button>
        </>}
      </div>
      {open && (
        <ol className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 text-[11px]" data-testid={`my-supply-timeline-${r.id}`}>
          {(tl.data ?? []).length === 0 ? <li className="text-slate-500">بلا سلسلة موافقات — وصل مباشرة إلى غرفة العمليات.</li> : (tl.data ?? []).map((s) => (
            <li key={s.step_no}><b>{s.step_no}.</b> {s.step_label} — <span className={s.status === 'approved' ? 'text-emerald-700' : s.status === 'rejected' ? 'text-rose-700' : s.status === 'pending' ? 'text-amber-700' : 'text-slate-500'}>{STATUS_AR[s.status]}</span>{s.decided_by_name ? ` (${s.decided_by_name})` : ''}{s.note ? ` «${s.note}»` : ''}</li>
          ))}
        </ol>
      )}
    </li>
  )
}
