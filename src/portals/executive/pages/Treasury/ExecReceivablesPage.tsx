/**
 * المدير التنفيذي — وحدة «مستحقات الشركة» (00189)
 *  · عند الدخول: زرّان «استلام مبالغ» و«إضافة مستحقات» (إدارة أنواع المستحقات)
 *  · الاستلام: المبلغ (د.ع) + اسم الحركة من الأنواع؛ التاريخ/الوقت/المنفّذ تلقائياً من الحساب
 *  · المبلغ يذهب إلى «القاصة» (المالية) مجمّداً حتى تؤكد المالية الاستلام — وتُبلَّغ المالية فوراً
 *  · كل الحركات محفوظة ومرئية مع فلتر تاريخ وبحث + Excel
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { useReceivableTypes, useSaveReceivableType, useTreasuryCancel, useTreasuryList, useTreasuryRecord, useTreasurySummary } from '@features/treasury/hooks'
import { DateRangeFilter, ReasonPrompt, TxList, defaultRange, downloadTreasuryExcel, type DateRange } from '@features/treasury/components/TreasuryShared'
import type { TreasuryStatus } from '@sdk/treasury.sdk'

type Panel = 'receive' | 'types' | null

export default function ExecReceivablesPage() {
  const [panel, setPanel] = useState<Panel>(null)
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [status, setStatus] = useState<TreasuryStatus | ''>('')
  const [typeId, setTypeId] = useState('')
  const [search, setSearch] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const types = useReceivableTypes()
  const summary = useTreasurySummary(range.from || null, range.to || null)
  const list = useTreasuryList({ from: range.from || null, to: range.to || null, kind: 'receipt', status: status || null, typeId: typeId || null, search: search || null })
  const cancel = useTreasuryCancel()
  const rows = list.data ?? []
  const s = summary.data

  return (
    <div className="space-y-4" data-testid="exec-receivables-page">
      <header>
        <h1 className="text-lg font-black text-slate-800">مستحقات الشركة</h1>
        <p className="text-xs text-slate-500">المبالغ المستلمة تذهب إلى قاصة الشؤون المالية وتبقى مجمّدة حتى يؤكد موظف المالية استلامها</p>
      </header>

      {/* الزرّان الرئيسيان */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setPanel(panel === 'receive' ? null : 'receive')} data-testid="btn-receive"
          className={clsx('rounded-2xl border-2 p-4 text-right transition', panel === 'receive' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-400')}>
          <p className="text-base font-black text-emerald-800">استلام مبالغ</p>
          <p className="mt-1 text-xs text-slate-600">تسجيل مبلغ مستلَم باسم حركة محددة — يُبلَّغ قسم المالية فوراً</p>
        </button>
        <button type="button" onClick={() => setPanel(panel === 'types' ? null : 'types')} data-testid="btn-types"
          className={clsx('rounded-2xl border-2 p-4 text-right transition', panel === 'types' ? 'border-sky-600 bg-sky-50' : 'border-slate-200 bg-white hover:border-sky-400')}>
          <p className="text-base font-black text-sky-800">إضافة مستحقات</p>
          <p className="mt-1 text-xs text-slate-600">إدارة أنواع المستحقات (أسماء الحركات) التي تُستلم باسمها المبالغ</p>
        </button>
      </div>

      {panel === 'receive' && <ReceiveForm types={(types.data ?? []).filter((t) => t.is_active)} onDone={() => setPanel(null)} />}
      {panel === 'types' && <TypesManager />}

      {/* الملخص */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard title="مؤكَّد في النطاق" value={fmtMoney(s?.range.receipts_confirmed ?? 0)} hint="د.ع" tone="emerald" testId="rc-stat-confirmed" />
        <StatCard title="بانتظار تأكيد المالية" value={fmtMoney(s?.range.receipts_pending ?? 0)} hint="د.ع مجمّد" tone="amber" testId="rc-stat-pending" />
        <StatCard title="رصيد القاصة الحالي" value={fmtMoney(s?.balance ?? 0)} hint="د.ع" tone="sky" testId="rc-stat-balance" />
        <StatCard title="إجمالي المجمّد" value={fmtMoney(s?.frozen ?? 0)} hint="كل الفترات" tone="slate" testId="rc-stat-frozen" />
      </div>
      {s && s.by_type.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-3" data-testid="rc-by-type">
          <h2 className="mb-2 text-sm font-black text-slate-800">حسب اسم الحركة (ضمن النطاق)</h2>
          <ul className="divide-y divide-slate-100 text-xs">
            {s.by_type.map((t) => (
              <li key={t.type_id ?? t.name ?? '-'} className="flex items-center justify-between gap-2 py-1.5">
                <span className="font-semibold text-slate-700">{t.name ?? '—'} <span className="text-slate-400">({t.count})</span></span>
                <span className="tabular-nums" dir="ltr"><span className="font-black text-emerald-700">{fmtMoney(t.confirmed)}</span>{t.pending > 0 && <span className="text-amber-700"> +{fmtMoney(t.pending)} معلّق</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* الفلاتر والقائمة */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <select className={clsx(field, 'w-full sm:w-40')} value={status} onChange={(e) => setStatus(e.target.value as TreasuryStatus | '')} data-testid="rc-filter-status" aria-label="الحالة">
              <option value="">كل الحالات</option><option value="pending">بانتظار المالية</option><option value="confirmed">مؤكَّدة</option><option value="cancelled">ملغاة</option>
            </select>
            <select className={clsx(field, 'w-full sm:w-48')} value={typeId} onChange={(e) => setTypeId(e.target.value)} data-testid="rc-filter-type" aria-label="اسم الحركة">
              <option value="">كل الأنواع</option>{(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className={clsx(field, 'w-full sm:w-44')} placeholder="بحث: رقم الحركة / تفاصيل" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="rc-search" />
            <Button variant="secondary" size="sm" disabled={exporting || rows.length === 0} data-testid="rc-excel"
              onClick={async () => { setExporting(true); try { await downloadTreasuryExcel(rows, { title: `مستحقات الشركة ${range.from || ''} → ${range.to || ''}`, sub: 'المدير التنفيذي — مستحقات الشركة', fileName: `مستحقات-الشركة-${range.from || 'all'}.xlsx` }) } finally { setExporting(false) } }}>Excel</Button>
          </div>
        </div>
        <TxList rows={rows} isLoading={list.isLoading} renderActions={(t) => t.status === 'pending' ? <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setCancelId(t.id)} data-testid={`rc-cancel-${t.id}`}>إلغاء (سُجّل بالخطأ)</Button> : null} />
      </section>
      {cancelId && <ReasonPrompt title="إلغاء الحركة المعلّقة — اكتب السبب" confirmLabel="تأكيد الإلغاء" busy={cancel.isPending} onClose={() => setCancelId(null)} onConfirm={(reason) => cancel.mutate({ id: cancelId, reason }, { onSuccess: () => setCancelId(null) })} />}
    </div>
  )
}

function ReceiveForm({ types, onDone }: { types: { id: string; name: string }[]; onDone: () => void }) {
  const record = useTreasuryRecord()
  const [amount, setAmount] = useState('')
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [details, setDetails] = useState('')
  const n = Number(amount.replace(/,/g, ''))
  const valid = Number.isFinite(n) && n > 0 && Boolean(typeId || types[0]?.id)
  return (
    <form className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-4" data-testid="receive-form"
      onSubmit={(e) => { e.preventDefault(); if (!valid) return; record.mutate({ kind: 'receipt', amount: n, typeId: typeId || types[0]!.id, details: details.trim() || null }, { onSuccess: () => { setAmount(''); setDetails(''); onDone() } }) }}>
      <h2 className="text-sm font-black text-emerald-800">استلام مبلغ</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">المبلغ (دينار عراقي)
          <input inputMode="numeric" dir="ltr" className={clsx(field, 'mt-1 text-left font-black tabular-nums')} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0" data-testid="receive-amount" />
          {n > 0 && <span className="mt-1 block text-[11px] text-slate-500" dir="ltr">{fmtMoney(n)} د.ع</span>}
        </label>
        <label className="text-xs font-semibold text-slate-600">اسم الحركة
          <select className={clsx(field, 'mt-1')} value={typeId || types[0]?.id || ''} onChange={(e) => setTypeId(e.target.value)} data-testid="receive-type">
            {types.length === 0 && <option value="">لا توجد أنواع فعّالة — أضف من «إضافة مستحقات»</option>}
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">تفاصيل (اختياري)
          <input className={clsx(field, 'mt-1')} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="رقم الوصل، الجهة الدافعة…" data-testid="receive-details" />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">التاريخ والوقت والمنفّذ يُسجَّلون تلقائياً من حسابك · سيُبلَّغ قسم المالية ويبقى المبلغ مجمّداً حتى «تأكيد الاستلام»</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>إغلاق</Button>
        <Button type="submit" size="sm" disabled={!valid || record.isPending} data-testid="receive-submit">تسجيل الاستلام وإبلاغ المالية</Button>
      </div>
    </form>
  )
}

function TypesManager() {
  const types = useReceivableTypes()
  const save = useSaveReceivableType()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const sorted = useMemo(() => [...(types.data ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ar')), [types.data])
  return (
    <section className="space-y-3 rounded-2xl border border-sky-200 bg-white p-4" data-testid="types-manager">
      <h2 className="text-sm font-black text-sky-800">أنواع المستحقات (أسماء الحركات)</h2>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim().length < 2) return; save.mutate({ name: name.trim(), sortOrder: (sorted.at(-1)?.sort_order ?? 0) + 10 }, { onSuccess: () => setName('') }) }}>
        <input className={clsx(field, 'min-w-0 flex-1')} placeholder="اسم نوع جديد، مثال: مستحقات دائرة بلدية الزعفرانية" value={name} onChange={(e) => setName(e.target.value)} data-testid="type-name" />
        <Button type="submit" size="sm" disabled={name.trim().length < 2 || save.isPending} data-testid="type-add">إضافة</Button>
      </form>
      <ul className="divide-y divide-slate-100">
        {sorted.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid={`type-${t.id}`}>
            {editing?.id === t.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate({ id: t.id, name: editing.name, isActive: t.is_active, sortOrder: t.sort_order }, { onSuccess: () => setEditing(null) }) }}>
                <input className={clsx(field, 'h-9 flex-1')} value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} data-testid={`type-edit-input-${t.id}`} />
                <Button type="submit" size="sm" disabled={save.isPending}>حفظ</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>إلغاء</Button>
              </form>
            ) : (
              <>
                <span className={clsx('font-semibold', t.is_active ? 'text-slate-800' : 'text-slate-400 line-through')}>{t.name}</span>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ id: t.id, name: t.name })} data-testid={`type-edit-${t.id}`}>تعديل</Button>
                  <Button variant="ghost" size="sm" onClick={() => save.mutate({ id: t.id, name: t.name, isActive: !t.is_active, sortOrder: t.sort_order })} data-testid={`type-toggle-${t.id}`}>{t.is_active ? 'إيقاف' : 'تفعيل'}</Button>
                </span>
              </>
            )}
          </li>
        ))}
        {sorted.length === 0 && <li className="py-3 text-center text-xs text-slate-500">لا توجد أنواع بعد</li>}
      </ul>
    </section>
  )
}
