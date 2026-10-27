/**
 * 00358 — وحدة «المصاريف» في الشؤون المالية:
 *   · أي مبلغ يُؤخذ من القاصة يُسجَّل هنا: المبلغ بالدينار + نوع المصروف (+ بيان اختياري) ⇒ يُخصم فوراً من رصيد القاصة، بلا موافقات.
 *   · الرصيد غير الكافي يمنع التسجيل. المسجَّل بالخطأ يُلغى بسبب مكتوب فيعود المبلغ ويبقى الأثر «ملغى».
 *   · أنواع المصاريف تديرها المالية من الصفحة نفسها (إضافة/تعديل/إيقاف)؛ «مشتريات صيانة» نوع نظامي تُولَّد حركاته من أوامر الشراء.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader, HeaderButton } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { useExpenseCancel, useExpenseRecord, useExpenseTypes, useSaveExpenseType, useTreasuryList, useTreasurySummary } from '@features/treasury/hooks'
import { DateRangeFilter, ReasonPrompt, TxList, defaultRange, downloadTreasuryExcel, type DateRange } from '@features/treasury/components/TreasuryShared'
import type { ExpenseType, TreasuryStatus } from '@sdk/treasury.sdk'

export default function FinanceExpensesPage() {
  const [open, setOpen] = useState(false)
  const [typesOpen, setTypesOpen] = useState(false)
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [status, setStatus] = useState<TreasuryStatus | ''>('')
  const [typeId, setTypeId] = useState('')
  const [search, setSearch] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const summary = useTreasurySummary(range.from || null, range.to || null)
  const types = useExpenseTypes()
  const list = useTreasuryList({ from: range.from || null, to: range.to || null, kind: 'expense', status: status || null, search: search || null })
  const cancel = useExpenseCancel()
  const rows = useMemo(() => (list.data ?? []).filter((r) => !typeId || r.expense_type_id === typeId), [list.data, typeId])
  const s = summary.data
  const confirmedTotal = rows.filter((r) => r.status === 'confirmed').reduce((a, r) => a + r.amount, 0)

  return (
    <div className="space-y-4 pb-6" data-testid="finance-expenses-page">
      <ExecPageHeader icon="wallet" title="المصاريف" subtitle="كل مبلغ يُؤخذ من القاصة يُسجَّل هنا بنوعه ويُخصم فوراً من الرصيد — بلا موافقات · المسجَّل بالخطأ يُلغى بسبب فيعود المبلغ · مشتريات الصيانة تصل من وحدتها وتُخصم عند «تم التسليم»"
        stats={[
          { label: 'رصيد القاصة الحالي (د.ع)', value: fmtMoney(s?.balance ?? 0), tone: (s?.balance ?? 0) < 0 ? 'red' : 'green', testId: 'xp-stat-balance' },
          { label: 'مصاريف النطاق (د.ع)', value: fmtMoney(s?.range.expenses_confirmed ?? 0), tone: 'gold', testId: 'xp-stat-range' },
          { label: 'مشتريات صيانة مسلَّمة (د.ع)', value: fmtMoney(s?.range.purchases_confirmed ?? 0), tone: 'plain', testId: 'xp-stat-purchases' },
          { label: 'حركات معروضة', value: rows.length, tone: 'plain', testId: 'xp-stat-count' },
        ]}
        actions={<>
          <HeaderButton onClick={() => { setTypesOpen(!typesOpen); setOpen(false) }} icon="settings" testId="btn-expense-types">{typesOpen ? 'إغلاق الأنواع' : 'أنواع المصاريف'}</HeaderButton>
          <HeaderButton onClick={() => { setOpen(!open); setTypesOpen(false) }} icon={open ? 'x' : 'wallet'} testId="btn-new-expense">{open ? 'إغلاق' : 'مصروف جديد'}</HeaderButton>
        </>} />

      {open && <ExpenseForm types={(types.data ?? []).filter((t) => t.is_active && !t.is_system)} balance={s?.balance ?? 0} onDone={() => setOpen(false)} />}
      {typesOpen && <ExpenseTypesPanel types={types.data ?? []} />}

      {s && (s.expenses_by_type ?? []).length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-3" data-testid="xp-by-type">
          <h2 className="mb-2 text-sm font-black text-slate-800">مصاريف النطاق حسب النوع</h2>
          <ul className="grid grid-cols-1 gap-x-6 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {(s.expenses_by_type ?? []).map((t) => <li key={t.type_id ?? t.name ?? '-'} className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-slate-700">{t.name ?? '—'} <span className="text-[10px] text-slate-400">({t.count})</span></span><b className="tabular-nums text-rose-700" dir="ltr">{fmtMoney(t.confirmed)}</b></li>)}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <h2 className="text-sm font-black text-slate-800">سجل المصاريف <span className="text-xs font-normal text-slate-500">— مجموع المسجَّل المعروض: <b className="tabular-nums text-rose-700" dir="ltr" data-testid="xp-list-total">{fmtMoney(confirmedTotal)}</b> د.ع</span></h2>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <select className={clsx(field, 'w-full sm:w-44')} value={typeId} onChange={(e) => setTypeId(e.target.value)} data-testid="xp-filter-type" aria-label="نوع المصروف">
              <option value="">كل الأنواع</option>{(types.data ?? []).filter((t) => !t.is_system).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className={clsx(field, 'w-full sm:w-36')} value={status} onChange={(e) => setStatus(e.target.value as TreasuryStatus | '')} data-testid="xp-filter-status" aria-label="الحالة">
              <option value="">كل الحالات</option><option value="confirmed">مسجَّلة</option><option value="cancelled">ملغاة</option>
            </select>
            <input className={clsx(field, 'w-full sm:w-44')} placeholder="بحث: بيان / رقم حركة / نوع" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="xp-search" />
            <Button variant="secondary" size="sm" disabled={exporting || rows.length === 0} data-testid="xp-excel"
              onClick={async () => { setExporting(true); try { await downloadTreasuryExcel(rows, { title: `المصاريف ${range.from || ''} → ${range.to || ''}`, sub: 'الشؤون المالية — المصاريف', fileName: `المصاريف-${range.from || 'all'}.xlsx` }) } finally { setExporting(false) } }}>Excel</Button>
          </div>
        </div>
        <TxList rows={rows} isLoading={list.isLoading} empty="لا مصاريف في هذا النطاق" testId="xp-list"
          renderActions={(t) => t.status === 'confirmed' ? <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setCancelId(t.id)} data-testid={`xp-cancel-${t.id}`}>إلغاء (خطأ)</Button> : null} />
      </section>
      {cancelId && <ReasonPrompt title="إلغاء المصروف — اكتب السبب (يعود المبلغ إلى الرصيد ويبقى الأثر في السجل)" confirmLabel="تأكيد الإلغاء" busy={cancel.isPending} onClose={() => setCancelId(null)} onConfirm={(reason) => cancel.mutate({ id: cancelId, reason }, { onSuccess: () => setCancelId(null) })} />}
    </div>
  )
}

function ExpenseForm({ types, balance, onDone }: { types: ExpenseType[]; balance: number; onDone: () => void }) {
  const record = useExpenseRecord()
  const [typeId, setTypeId] = useState('')
  const [amount, setAmount] = useState('')
  const [details, setDetails] = useState('')
  const n = Number(amount.replace(/,/g, ''))
  const amountOk = Number.isFinite(n) && n > 0 && Number.isInteger(n)
  const over = amountOk && n > balance
  const valid = Boolean(typeId) && amountOk && !over
  return (
    <form className="space-y-3 rounded-2xl border border-rose-200 bg-white p-4" data-testid="expense-form"
      onSubmit={(e) => { e.preventDefault(); if (!valid) return; record.mutate({ typeId, amount: n, details: details.trim() || null }, { onSuccess: () => { setTypeId(''); setAmount(''); setDetails(''); onDone() } }) }}>
      <h2 className="text-sm font-black text-rose-800">مصروف جديد من القاصة</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="expense-types">
        {types.map((t) => (
          <button key={t.id} type="button" onClick={() => setTypeId(t.id)} data-testid={`expense-type-${t.id}`}
            className={clsx('h-11 rounded-xl border-2 px-2 text-xs font-bold', typeId === t.id ? 'border-rose-600 bg-rose-50 text-rose-900' : 'border-slate-200 bg-white text-slate-700')}>{t.name}</button>
        ))}
      </div>
      {types.length === 0 && <p className="text-xs text-amber-700">لا أنواع فعّالة — أضف نوعاً من «أنواع المصاريف».</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">المبلغ (دينار عراقي)
          <input inputMode="numeric" dir="ltr" className={clsx(field, 'mt-1 text-left font-black tabular-nums')} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))} placeholder="0" data-testid="expense-amount" />
          {amountOk && <span className={clsx('mt-1 block text-[11px]', over ? 'font-bold text-red-700' : 'text-slate-500')} dir="ltr" data-testid="expense-amount-hint">{over ? `يتجاوز رصيد القاصة (${fmtMoney(balance)})` : `${fmtMoney(n)} د.ع`}</span>}
        </label>
        <label className="text-xs font-semibold text-slate-600">البيان (اختياري)
          <input className={clsx(field, 'mt-1')} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="مثال: شراء أوراق A4 — 10 رزم" maxLength={300} data-testid="expense-details" />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">يُخصم المبلغ فوراً من رصيد القاصة ({fmtMoney(balance)} د.ع حالياً) ويُبلَّغ المدير التنفيذي — بلا موافقات.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>إلغاء</Button>
        <Button type="submit" variant="primary" size="sm" disabled={!valid || record.isPending} data-testid="expense-submit">تسجيل المصروف</Button>
      </div>
    </form>
  )
}

function ExpenseTypesPanel({ types }: { types: ExpenseType[] }) {
  const save = useSaveExpenseType()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid="expense-types-panel">
      <h2 className="text-sm font-black text-slate-800">أنواع المصاريف</h2>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim().length < 2) return; save.mutate({ name: name.trim() }, { onSuccess: () => setName('') }) }}>
        <label className="flex-1 text-xs font-semibold text-slate-600">نوع جديد<input className={clsx(field, 'mt-1')} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مصاريف إنترنت" maxLength={80} data-testid="xt-new-name" /></label>
        <Button type="submit" size="sm" disabled={name.trim().length < 2 || save.isPending} data-testid="xt-new-submit">إضافة</Button>
      </form>
      <ul className="divide-y divide-slate-100 text-xs" data-testid="xt-list">
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2" data-testid={`xt-row-${t.id}`}>
            {editing?.id === t.id ? (
              <>
                <input className={clsx(field, 'h-9 flex-1')} value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} data-testid={`xt-edit-${t.id}`} />
                <Button size="sm" disabled={editing.name.trim().length < 2 || save.isPending} onClick={() => save.mutate({ id: t.id, name: editing.name.trim(), isActive: t.is_active, sortOrder: t.sort_order }, { onSuccess: () => setEditing(null) })} data-testid={`xt-save-${t.id}`}>حفظ</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>إلغاء</Button>
              </>
            ) : (
              <>
                <span className={clsx('flex-1 font-bold', !t.is_active && 'text-slate-400 line-through')}>{t.name}{t.is_system && <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-600">نظامي — من أوامر الشراء</span>}</span>
                <span className="text-[11px] text-slate-500">{t.used} حركة · <b className="tabular-nums" dir="ltr">{fmtMoney(t.total_confirmed)}</b> د.ع</span>
                {!t.is_system && <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: t.id, name: t.name })} data-testid={`xt-rename-${t.id}`}>تعديل الاسم</Button>
                  <Button size="sm" variant={t.is_active ? 'ghost' : 'secondary'} className={t.is_active ? 'text-red-700' : ''} disabled={save.isPending} onClick={() => save.mutate({ id: t.id, name: t.name, isActive: !t.is_active, sortOrder: t.sort_order })} data-testid={`xt-toggle-${t.id}`}>{t.is_active ? 'إيقاف' : 'تفعيل'}</Button>
                </>}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
