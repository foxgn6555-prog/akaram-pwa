/**
 * المدير التنفيذي — وحدة «المكافآت» (00189)
 *  · مكافأة لموظف من النظام: مبلغ نقدي / هدية / كتاب شكر / إجازة تشجيعية — رقم حركة ومنفّذ تلقائيان
 *  · النقدية والهدية: تُبلَّغ المالية وتضغط «تم التسليم» (النقدية تُخصم من القاصة عند التسليم)
 *  · كتاب الشكر والإجازة التشجيعية: تُسجَّل فوراً ويُبلَّغ الموظف — بلا مرور بالمالية
 *  · غير مرتبطة بالراتب إطلاقاً — تُسلَّم بشكل مستقل
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { useEmployeeLookup, useTreasuryCancel, useTreasuryList, useTreasuryRecord, useTreasurySummary } from '@features/treasury/hooks'
import { DateRangeFilter, ReasonPrompt, TxList, defaultRange, downloadTreasuryExcel, type DateRange } from '@features/treasury/components/TreasuryShared'
import { REWARD_TYPE_LABEL, type EmployeeLookupRow, type RewardType, type TreasuryStatus } from '@sdk/treasury.sdk'

const REWARD_TYPES = Object.keys(REWARD_TYPE_LABEL) as RewardType[]
const NEEDS_FINANCE: Record<RewardType, boolean> = { cash: true, gift: true, thanks_letter: false, incentive_leave: false }

export default function ExecRewardsPage() {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [status, setStatus] = useState<TreasuryStatus | ''>('')
  const [rtype, setRtype] = useState<RewardType | ''>('')
  const [search, setSearch] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const summary = useTreasurySummary(range.from || null, range.to || null)
  const list = useTreasuryList({ from: range.from || null, to: range.to || null, kind: 'reward', status: status || null, search: search || null })
  const cancel = useTreasuryCancel()
  const rows = (list.data ?? []).filter((r) => !rtype || r.reward_type === rtype)
  const s = summary.data

  return (
    <div className="space-y-4" data-testid="exec-rewards-page">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-800">المكافآت</h1>
          <p className="text-xs text-slate-500">مكافآت مستقلة عن الراتب · النقدية والهدايا تُسلَّم عبر المالية («تم التسليم») · كتاب الشكر والإجازة التشجيعية تُسجَّل فوراً</p>
        </div>
        <Button size="sm" onClick={() => setOpen(!open)} data-testid="btn-new-reward">{open ? 'إغلاق' : 'مكافأة جديدة'}</Button>
      </header>
      {open && <RewardForm onDone={() => setOpen(false)} />}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard title="مكافآت في النطاق" value={s?.range.rewards_count ?? 0} tone="violet" testId="rw-stat-count" />
        <StatCard title="نقدية مسلَّمة" value={fmtMoney(s?.range.rewards_cash_confirmed ?? 0)} hint="د.ع" tone="emerald" testId="rw-stat-cash" />
        <StatCard title="هدايا" value={s?.rewards_by_type.gift ?? 0} tone="sky" testId="rw-stat-gift" />
        <StatCard title="كتب شكر / إجازات" value={(s?.rewards_by_type.thanks_letter ?? 0) + (s?.rewards_by_type.incentive_leave ?? 0)} tone="slate" testId="rw-stat-letters" />
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <select className={clsx(field, 'w-full sm:w-40')} value={status} onChange={(e) => setStatus(e.target.value as TreasuryStatus | '')} data-testid="rw-filter-status" aria-label="الحالة">
              <option value="">كل الحالات</option><option value="pending">بانتظار التسليم</option><option value="confirmed">مسلَّمة / مسجَّلة</option><option value="cancelled">ملغاة</option>
            </select>
            <select className={clsx(field, 'w-full sm:w-40')} value={rtype} onChange={(e) => setRtype(e.target.value as RewardType | '')} data-testid="rw-filter-type" aria-label="نوع المكافأة">
              <option value="">كل الأنواع</option>{REWARD_TYPES.map((k) => <option key={k} value={k}>{REWARD_TYPE_LABEL[k]}</option>)}
            </select>
            <input className={clsx(field, 'w-full sm:w-44')} placeholder="بحث: موظف / رقم حركة" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="rw-search" />
            <Button variant="secondary" size="sm" disabled={exporting || rows.length === 0} data-testid="rw-excel"
              onClick={async () => { setExporting(true); try { await downloadTreasuryExcel(rows, { title: `المكافآت ${range.from || ''} → ${range.to || ''}`, sub: 'المدير التنفيذي — المكافآت', fileName: `المكافآت-${range.from || 'all'}.xlsx` }) } finally { setExporting(false) } }}>Excel</Button>
          </div>
        </div>
        <TxList rows={rows} isLoading={list.isLoading} renderActions={(t) => t.status === 'pending' ? <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setCancelId(t.id)} data-testid={`rw-cancel-${t.id}`}>إلغاء</Button> : null} />
      </section>
      {cancelId && <ReasonPrompt title="إلغاء المكافأة المعلّقة — اكتب السبب" confirmLabel="تأكيد الإلغاء" busy={cancel.isPending} onClose={() => setCancelId(null)} onConfirm={(reason) => cancel.mutate({ id: cancelId, reason }, { onSuccess: () => setCancelId(null) })} />}
    </div>
  )
}

export function EmployeePicker({ value, onChange, testId = 'emp-picker' }: { value: EmployeeLookupRow | null; onChange: (e: EmployeeLookupRow | null) => void; testId?: string }) {
  const [q, setQ] = useState('')
  const lookup = useEmployeeLookup(q, !value)
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm" data-testid={`${testId}-selected`}>
        <span><b>{value.full_name}</b> <span className="text-xs text-slate-500" dir="ltr">{value.employee_number ?? ''}</span> {value.job_title && <span className="text-xs text-slate-500">· {value.job_title}</span>}</span>
        <button type="button" className="text-xs font-bold text-red-700" onClick={() => onChange(null)} data-testid={`${testId}-clear`}>تغيير</button>
      </div>
    )
  }
  return (
    <div className="relative">
      <input className={field} placeholder="ابحث بالاسم أو الرقم الوظيفي…" value={q} onChange={(e) => setQ(e.target.value)} data-testid={`${testId}-input`} />
      {(lookup.data?.length ?? 0) > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg" data-testid={`${testId}-results`}>
          {lookup.data!.map((e) => (
            <li key={e.id}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-slate-50" onClick={() => onChange(e)} data-testid={`${testId}-opt-${e.id}`}>
              <span>{e.full_name}{e.department_name && <span className="text-xs text-slate-500"> · {e.department_name}</span>}</span><span className="text-xs text-slate-500" dir="ltr">{e.employee_number ?? ''}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RewardForm({ onDone }: { onDone: () => void }) {
  const record = useTreasuryRecord()
  const [emp, setEmp] = useState<EmployeeLookupRow | null>(null)
  const [rt, setRt] = useState<RewardType>('cash')
  const [amount, setAmount] = useState('')
  const [details, setDetails] = useState('')
  const n = Number(amount.replace(/,/g, ''))
  const valid = Boolean(emp) && (rt !== 'cash' || (Number.isFinite(n) && n > 0)) && (rt === 'cash' || details.trim().length >= 2)
  return (
    <form className="space-y-3 rounded-2xl border border-violet-200 bg-white p-4" data-testid="reward-form"
      onSubmit={(e) => { e.preventDefault(); if (!valid || !emp) return; record.mutate({ kind: 'reward', employeeId: emp.id, rewardType: rt, amount: rt === 'cash' ? n : null, details: details.trim() || null }, { onSuccess: () => { setEmp(null); setAmount(''); setDetails(''); onDone() } }) }}>
      <h2 className="text-sm font-black text-violet-800">مكافأة جديدة</h2>
      <label className="block text-xs font-semibold text-slate-600">الموظف<div className="mt-1"><EmployeePicker value={emp} onChange={setEmp} /></div></label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {REWARD_TYPES.map((k) => (
          <button key={k} type="button" onClick={() => setRt(k)} data-testid={`reward-type-${k}`}
            className={clsx('h-11 rounded-xl border-2 text-sm font-bold', rt === k ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-200 bg-white text-slate-700')}>{REWARD_TYPE_LABEL[k]}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rt === 'cash' && (
          <label className="text-xs font-semibold text-slate-600">المبلغ (دينار عراقي)
            <input inputMode="numeric" dir="ltr" className={clsx(field, 'mt-1 text-left font-black tabular-nums')} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0" data-testid="reward-amount" />
            {n > 0 && <span className="mt-1 block text-[11px] text-slate-500" dir="ltr">{fmtMoney(n)} د.ع</span>}
          </label>
        )}
        <label className={clsx('text-xs font-semibold text-slate-600', rt !== 'cash' && 'sm:col-span-2')}>{rt === 'cash' ? 'سبب المكافأة (اختياري)' : rt === 'gift' ? 'وصف الهدية' : rt === 'thanks_letter' ? 'نص / سبب كتاب الشكر' : 'مدة الإجازة وسببها'}
          <input className={clsx(field, 'mt-1')} value={details} onChange={(e) => setDetails(e.target.value)} data-testid="reward-details" />
        </label>
      </div>
      <p className="text-[11px] text-slate-500" data-testid="reward-hint">{NEEDS_FINANCE[rt] ? 'ستُبلَّغ الشؤون المالية لتسليمها وتضغط «تم التسليم»' + (rt === 'cash' ? ' — ويُخصم المبلغ من القاصة عند التسليم' : '') : 'تُسجَّل فوراً ويُبلَّغ الموظف — لا تمرّ بالمالية'} · غير مرتبطة بالراتب</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>إغلاق</Button>
        <Button type="submit" size="sm" disabled={!valid || record.isPending} data-testid="reward-submit">تسجيل المكافأة</Button>
      </div>
    </form>
  )
}
