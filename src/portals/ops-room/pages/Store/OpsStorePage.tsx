/** غرفة العمليات — المخزن (00162): طلبات المستلزمات الجاهزة للتسليم (الفاتورة المعلّقة حتى يستلمها أحد)، المواد والأرصدة، والحركات.
 * التسليم يُنقص المخزن بحركة مسجّلة؛ التسوية بسبب إلزامي. بلا أي بيانات مالية. */
import { useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ClipboardList, History, Package, PackageCheck, Plus } from 'lucide-react'
import { useCancelSupply, useDeliverSupply, useSaveStoreItem, useStoreAdjust, useStoreItems, useStoreMovements, useStoreReceive, useSupplyRequests } from '@features/ops-store/hooks'
import type { StoreItem, SupplyRequestRow } from '@sdk/ops-store.sdk'
import { useApprovalTimeline } from '@features/sector-manager/hooks'
import { STATUS_AR, dateAr, timeAr } from '@features/sector-manager/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

export const SUPPLY_STATUS_AR: Record<string, string> = { pending: 'قيد الموافقة', approved: 'جاهز للتسليم', delivered: 'سُلّم', rejected: 'مرفوض', cancelled: 'مُلغى' }
const SHIFT: Record<string, string> = { morning: 'صباحي', evening: 'مسائي', night: 'ليلي' }
type Tab = 'ready' | 'items' | 'movements' | 'done'

export default function OpsStorePage() {
  const [tab, setTab] = useState<Tab>('ready')
  const ready = useSupplyRequests('open')
  const readyCount = (ready.data ?? []).filter((r) => r.approval_status === 'approved').length
  return (
    <div className="space-y-4 pb-4" data-testid="ops-store">
      <header>
        <h1 className="text-lg font-black">المخزن</h1>
        <p className="text-xs text-slate-600">طلبات مستلزمات القواطع بعد اكتمال موافقاتها تبقى هنا معلّقة حتى يستلمها أحد، وعندها يُنقص المخزن.</p>
      </header>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
        {([['ready', 'للتسليم', readyCount], ['items', 'المواد', null], ['movements', 'الحركات', null], ['done', 'المنجزة', null]] as const).map(([k, l, n]) => (
          <button key={k} type="button" data-testid={`store-tab-${k}`} onClick={() => setTab(k)} className={clsx('relative h-10 rounded-lg text-xs font-black', tab === k ? 'bg-white shadow' : 'text-slate-600')}>
            {l}{n ? <span className="absolute -top-1 -left-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{n}</span> : null}
          </button>
        ))}
      </div>
      {tab === 'ready' && <ReadyTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'movements' && <MovementsTab />}
      {tab === 'done' && <DoneTab />}
    </div>
  )
}

function ReadyTab() {
  const q = useSupplyRequests('open')
  if (q.isLoading) return <LoadingSpinner />
  const rows = q.data ?? []
  if (rows.length === 0) return <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500" data-testid="store-ready-empty">لا طلبات مفتوحة.</div>
  return <ul className="space-y-3" data-testid="store-ready-list">{rows.map((r) => <RequestCard key={r.id} r={r} />)}</ul>
}

function RequestCard({ r }: { r: SupplyRequestRow }) {
  const deliver = useDeliverSupply(), cancel = useCancelSupply()
  const [mode, setMode] = useState<'idle' | 'deliver' | 'cancel' | 'path'>('idle')
  const [receiver, setReceiver] = useState(''), [note, setNote] = useState(''), [reason, setReason] = useState('')
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(r.items.map((i) => [i.item_id, String(i.qty)])))
  const timeline = useApprovalTimeline(mode === 'path' ? 'supplies' : undefined, mode === 'path' ? r.id : undefined)
  const ready = r.approval_status === 'approved'
  const qtyValid = r.items.every((i) => { const v = Number(qty[i.item_id]); return Number.isFinite(v) && v >= 0 && v <= i.qty })
  return (
    <li className={clsx('rounded-2xl border bg-white p-4 shadow-sm', ready && 'border-emerald-300')} data-testid={`supply-${r.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-black">{r.manager_name} <span className="text-[11px] font-normal text-slate-500">· {SHIFT[r.shift] ?? r.shift}</span></div>
          <div className="text-[11px] text-slate-500">{[r.parent_sector, r.areas].filter(Boolean).join(' · ')} · {r.ref_no}</div>
        </div>
        <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')} data-testid={`supply-status-${r.id}`}>
          {SUPPLY_STATUS_AR[r.approval_status]}{!ready && r.current_step ? ` · ${r.current_step}` : ''}
        </span>
      </div>
      <ul className="mt-3 divide-y rounded-xl border text-sm" data-testid={`supply-items-${r.id}`}>
        {r.items.map((i) => (
          <li key={i.item_id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>{i.name}</span>
            {mode === 'deliver' ? (
              <label className="flex items-center gap-1 text-xs">يُسلَّم
                <input type="number" min={0} max={i.qty} step="any" data-testid={`deliver-qty-${i.item_id}`} value={qty[i.item_id] ?? ''} onChange={(e) => setQty((s) => ({ ...s, [i.item_id]: e.target.value }))} className="h-9 w-20 rounded-lg border px-2 text-center" />
                <span className="text-slate-500">/ {i.qty} {i.unit}</span>
              </label>
            ) : <b>{i.qty} {i.unit}</b>}
          </li>
        ))}
      </ul>
      {r.notes && <div className="mt-1 text-xs text-slate-600">«{r.notes}»</div>}
      <div className="mt-1 text-[11px] text-slate-500">قُدّم {dateAr(r.created_at)} {timeAr(r.created_at)}{r.decided_at ? ` · اكتملت الموافقات ${dateAr(r.decided_at)}` : ''}</div>

      {mode === 'idle' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ready && <button type="button" data-testid={`deliver-${r.id}`} onClick={() => setMode('deliver')} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 text-sm font-black text-white"><PackageCheck size={16} /> تسليم</button>}
          <button type="button" data-testid={`cancel-${r.id}`} onClick={() => setMode('cancel')} className="h-11 rounded-xl border border-rose-300 bg-rose-50 px-4 text-sm font-bold text-rose-800">إلغاء</button>
          <button type="button" data-testid={`path-${r.id}`} onClick={() => setMode('path')} className="h-11 rounded-xl border px-4 text-sm font-bold">المسار</button>
        </div>
      )}
      {mode === 'deliver' && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <label className="text-xs font-bold">اسم المستلم (إلزامي)
            <input data-testid={`receiver-${r.id}`} value={receiver} onChange={(e) => setReceiver(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal" placeholder="مثال: سائق المنطقة علي" />
          </label>
          <label className="mt-2 block text-xs font-bold">ملاحظة (اختياري)
            <input data-testid={`deliver-note-${r.id}`} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 text-sm font-normal" />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" data-testid={`deliver-confirm-${r.id}`} disabled={receiver.trim().length < 2 || !qtyValid || deliver.isPending}
              onClick={() => deliver.mutate({ id: r.id, receiverName: receiver.trim(), items: r.items.map((i) => ({ item_id: i.item_id, delivered_qty: Number(qty[i.item_id]) })), note: note.trim() || null }, { onSuccess: () => setMode('idle') })}
              className="h-11 rounded-xl bg-emerald-700 text-sm font-black text-white disabled:opacity-40">تأكيد التسليم وإنقاص المخزن</button>
            <button type="button" onClick={() => setMode('idle')} className="h-11 rounded-xl border bg-white text-sm font-bold">رجوع</button>
          </div>
        </div>
      )}
      {mode === 'cancel' && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <label className="text-xs font-bold text-rose-900">سبب الإلغاء (إلزامي)
            <textarea data-testid={`cancel-reason-${r.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" data-testid={`cancel-confirm-${r.id}`} disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate({ id: r.id, reason: reason.trim() }, { onSuccess: () => setMode('idle') })} className="h-10 rounded-xl bg-rose-600 text-sm font-black text-white disabled:opacity-40">تأكيد الإلغاء</button>
            <button type="button" onClick={() => setMode('idle')} className="h-10 rounded-xl border bg-white text-sm font-bold">رجوع</button>
          </div>
        </div>
      )}
      {mode === 'path' && (
        <div className="mt-3 rounded-xl border p-2 text-[11px]" data-testid={`path-list-${r.id}`}>
          {(timeline.data ?? []).length === 0 ? <div className="text-slate-500">بلا سلسلة موافقات — وصل مباشرة إلى غرفة العمليات.</div> : (
            <ol className="space-y-1">{(timeline.data ?? []).map((s) => <li key={s.step_no}><b>{s.step_no}.</b> {s.step_label} — <span className={s.status === 'approved' ? 'text-emerald-700' : s.status === 'rejected' ? 'text-rose-700' : 'text-amber-700'}>{STATUS_AR[s.status]}</span>{s.decided_by_name ? ` (${s.decided_by_name})` : ''}</li>)}</ol>
          )}
          <button type="button" onClick={() => setMode('idle')} className="mt-2 text-indigo-700 underline">إغلاق</button>
        </div>
      )}
    </li>
  )
}

function ItemsTab() {
  const items = useStoreItems(true), save = useSaveStoreItem(), receive = useStoreReceive(), adjust = useStoreAdjust()
  const [newName, setNewName] = useState(''), [newUnit, setNewUnit] = useState('قطعة'), [newMin, setNewMin] = useState('0')
  const [act, setAct] = useState<{ id: string; kind: 'in' | 'adjust' } | null>(null), [val, setVal] = useState(''), [txt, setTxt] = useState('')
  if (items.isLoading) return <LoadingSpinner />
  const rows = items.data ?? []
  const submitAct = (it: StoreItem) => {
    if (!act) return
    if (act.kind === 'in') receive.mutate({ itemId: it.id, qty: Number(val), note: txt.trim() || null }, { onSuccess: () => { setAct(null); setVal(''); setTxt('') } })
    else adjust.mutate({ itemId: it.id, newQty: Number(val), reason: txt.trim() }, { onSuccess: () => { setAct(null); setVal(''); setTxt('') } })
  }
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate({ name: newName.trim(), unit: newUnit.trim() || 'قطعة', minQty: Number(newMin) || 0 }, { onSuccess: () => { setNewName(''); setNewMin('0') } }) }} className="rounded-2xl border bg-white p-3 shadow-sm" data-testid="item-form">
        <div className="text-xs font-black">إضافة مادة</div>
        <div className="mt-2 grid grid-cols-6 gap-2">
          <input data-testid="item-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم المادة" className="col-span-3 h-11 rounded-xl border px-3 text-sm" />
          <input data-testid="item-unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="الوحدة" className="col-span-1 h-11 rounded-xl border px-2 text-sm" />
          <input data-testid="item-min" type="number" min={0} value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="حد أدنى" className="col-span-1 h-11 rounded-xl border px-2 text-sm" />
          <button type="submit" data-testid="item-save" disabled={newName.trim().length < 2 || save.isPending} className="col-span-1 flex h-11 items-center justify-center rounded-xl bg-slate-900 text-white disabled:opacity-40"><Plus size={18} /></button>
        </div>
      </form>
      {rows.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-slate-500" data-testid="items-empty">المخزن فارغ — أضف المواد التي يطلبها مسؤولو الأقسام.</div> : (
        <ul className="space-y-2" data-testid="items-list">
          {rows.map((it) => (
            <li key={it.id} className={clsx('rounded-2xl border bg-white p-3 shadow-sm', !it.is_active && 'opacity-60')} data-testid={`item-${it.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-black"><Package size={14} className="inline" /> {it.name} {!it.is_active && <span className="text-[10px] text-slate-500">(موقوفة)</span>}</div>
                  <div className="text-[11px] text-slate-500">الوحدة: {it.unit} · الحد الأدنى {it.min_qty}{it.reserved > 0 ? ` · محجوز لطلبات جاهزة: ${it.reserved}` : ''}</div>
                </div>
                <div className="text-left">
                  <div className={clsx('text-xl font-black', it.low_stock ? 'text-rose-700' : 'text-slate-900')} data-testid={`item-qty-${it.id}`}>{it.qty_on_hand}</div>
                  {it.low_stock && <div className="flex items-center gap-1 text-[10px] font-bold text-rose-700"><AlertTriangle size={10} /> دون الحد الأدنى</div>}
                </div>
              </div>
              {act?.id === it.id ? (
                <div className="mt-2 rounded-xl bg-slate-50 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input data-testid={`act-val-${it.id}`} type="number" min={0} step="any" value={val} onChange={(e) => setVal(e.target.value)} placeholder={act.kind === 'in' ? 'الكمية الداخلة' : 'الرصيد الفعلي بعد الجرد'} className="h-10 rounded-xl border px-2 text-sm" />
                    <input data-testid={`act-txt-${it.id}`} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={act.kind === 'in' ? 'ملاحظة (اختياري)' : 'سبب التسوية (إلزامي)'} className="h-10 rounded-xl border px-2 text-sm" />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" data-testid={`act-confirm-${it.id}`} disabled={!(Number(val) >= 0) || val === '' || (act.kind === 'adjust' && txt.trim().length < 3) || (act.kind === 'in' && Number(val) <= 0)} onClick={() => submitAct(it)} className="h-10 rounded-xl bg-slate-900 text-xs font-black text-white disabled:opacity-40">{act.kind === 'in' ? 'تأكيد الإدخال' : 'تأكيد التسوية'}</button>
                    <button type="button" onClick={() => setAct(null)} className="h-10 rounded-xl border bg-white text-xs font-bold">إلغاء</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <button type="button" data-testid={`act-in-${it.id}`} onClick={() => { setAct({ id: it.id, kind: 'in' }); setVal(''); setTxt('') }} className="h-9 rounded-lg bg-emerald-50 px-3 font-bold text-emerald-800">+ إدخال كمية</button>
                  <button type="button" data-testid={`act-adjust-${it.id}`} onClick={() => { setAct({ id: it.id, kind: 'adjust' }); setVal(String(it.qty_on_hand)); setTxt('') }} className="h-9 rounded-lg bg-amber-50 px-3 font-bold text-amber-800">تسوية جرد</button>
                  <button type="button" data-testid={`act-toggle-${it.id}`} onClick={() => save.mutate({ id: it.id, name: it.name, unit: it.unit, minQty: it.min_qty, active: !it.is_active })} className="h-9 rounded-lg border px-3 font-bold">{it.is_active ? 'إيقاف' : 'تفعيل'}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MovementsTab() {
  const q = useStoreMovements()
  if (q.isLoading) return <LoadingSpinner />
  const KIND: Record<string, string> = { in: 'إدخال', out: 'إخراج', adjust: 'تسوية' }
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-black"><History size={16} /> آخر الحركات</div>
      {(q.data ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-500" data-testid="movements-empty">لا حركات بعد.</p> : (
        <ul className="mt-2 divide-y text-xs" data-testid="movements-list">
          {(q.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <div><b>{m.item_name}</b> · <span className={m.kind === 'in' ? 'text-emerald-700' : m.kind === 'out' ? 'text-rose-700' : 'text-amber-700'}>{KIND[m.kind]} {m.qty > 0 ? `+${m.qty}` : m.qty}</span> → الرصيد {m.balance_after}{m.request_ref ? ` · ${m.request_ref}` : ''}{m.note ? ` · ${m.note}` : ''}</div>
              <div className="shrink-0 text-left text-[10px] text-slate-500">{m.by_name}<br />{dateAr(m.created_at)} {timeAr(m.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DoneTab() {
  const q = useSupplyRequests('done')
  if (q.isLoading) return <LoadingSpinner />
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-black"><ClipboardList size={16} /> الطلبات المنجزة</div>
      {(q.data ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-500">لا شيء بعد.</p> : (
        <ul className="mt-2 divide-y text-xs" data-testid="done-list">
          {(q.data ?? []).map((r) => (
            <li key={r.id} className="py-2" data-testid={`done-${r.id}`}>
              <div className="flex items-center justify-between"><b>{r.manager_name} · {r.ref_no}</b><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', r.approval_status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>{SUPPLY_STATUS_AR[r.approval_status]}</span></div>
              <div className="text-slate-600">{r.items.map((i) => `${i.name} ${i.delivered_qty ?? 0}/${i.qty} ${i.unit}`).join('، ')}</div>
              <div className="text-[10px] text-slate-500">{r.approval_status === 'delivered' ? `استلمها ${r.receiver_name} · ${dateAr(r.delivered_at)} · سلّمها ${r.delivered_by_name ?? ''}` : r.cancel_reason ? `سبب الإلغاء: ${r.cancel_reason}` : `قُرر ${dateAr(r.decided_at)}`}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
