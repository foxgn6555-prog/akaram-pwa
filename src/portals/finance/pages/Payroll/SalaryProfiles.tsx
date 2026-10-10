/**
 * 00206 — ملفات الرواتب (المالية فقط): واجهة تعريف الراتب
 *   يسار/يمين: قائمة الموظفين بعدّادات (مُعرَّف / بانتظار) وبحث وترشيح · نموذج تعريف واضح: نوع التعاقد، المبلغ، المخصصات، الاستقطاعات الثابتة
 *   · ملخص الملف بالأرقام · محاكاة الاستحقاق بنموذج «الأيام المستحقة»: (الأساسي ÷ أيام الشهر) × (حضور + إجازة مدفوعة)
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { CONTRACT_LABELS, useHrEmployees, useSalaryProfile, useSetSalary } from '@features/hr'
import type { ContractType, HrEmployeeRow, SalaryProfile } from '@features/hr'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { field, fmtMoney } from '@portals/hr/components/hr-format'

type KV = Array<{ k: string; v: string }>
const toKV = (o: Record<string, number> | undefined): KV => Object.entries(o ?? {}).map(([k, v]) => ({ k, v: String(v) }))
const fromKV = (kv: KV) => Object.fromEntries(kv.filter((x) => x.k.trim() && Number(x.v) > 0).map((x) => [x.k.trim(), Number(x.v)]))
const ALLOW_SUGGEST = ['نقل', 'سكن', 'خطورة', 'هاتف', 'إعالة']
const DED_SUGGEST = ['ضمان اجتماعي', 'تأمين صحي', 'نقابة']
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('')
const daysIn = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y!, m!, 0).getDate() }

/** 00201 — محاكاة نقية لنموذج الأيام المستحقة (نفس معادلة قاعدة البيانات) */
export function simulateEarned(p: { payType: ContractType; base: number; daily: number; allowances: number; fixed: number; daysInMonth: number; present: number; paidLeave: number }) {
  const payable = Math.max(0, p.present + p.paidLeave)
  const dayRate = p.payType === 'daily' ? p.daily : p.daysInMonth > 0 ? Math.round((p.base / p.daysInMonth) * 10000) / 10000 : 0
  const baseDue = p.payType === 'daily' ? Math.round(dayRate * payable * 100) / 100 : Math.min(p.base, Math.round(dayRate * payable * 100) / 100)
  const ratio = p.payType === 'daily' ? 1 : p.daysInMonth > 0 ? Math.min(1, payable / p.daysInMonth) : 0
  const allow = Math.round(p.allowances * ratio * 100) / 100
  const gross = Math.round((baseDue + allow) * 100) / 100
  const net = Math.max(0, Math.round((gross - p.fixed) * 100) / 100)
  return { payable, dayRate, baseDue, allow, gross, net, ratio }
}

export function ProfilesTab() {
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState<'all' | 'pending' | 'monthly' | 'daily'>('all')
  const { data: employees = [], isLoading } = useHrEmployees({ search, status: 'active' })
  const [sel, setSel] = useState<string | null>(null)
  const counts = useMemo(() => ({ defined: employees.filter((e) => e.salary_status === 'defined').length, pending: employees.filter((e) => e.salary_status !== 'defined').length }), [employees])
  const list = employees.filter((e) => filter === 'all' || (filter === 'pending' ? e.salary_status !== 'defined' : e.contract_type === filter))
  const selected = employees.find((e) => e.id === sel) ?? null
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]" data-testid="profiles-tab">
      <aside className="flex max-h-[calc(100vh-14rem)] min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-2 border-b border-slate-100 p-3">
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-xl bg-emerald-50 px-2 py-1.5 text-emerald-900 ring-1 ring-emerald-100"><b className="block text-lg tabular-nums" data-testid="pr-count-defined">{counts.defined}</b>مُعرَّف</div>
            <div className={clsx('rounded-xl px-2 py-1.5 ring-1', counts.pending ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-slate-50 text-slate-500 ring-slate-100')}><b className="block text-lg tabular-nums" data-testid="pr-count-pending">{counts.pending}</b>بانتظار التعريف</div>
          </div>
          <input className={clsx(field, 'w-full')} placeholder="بحث بالاسم أو الرقم الوظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="pr-search" />
          <div className="flex flex-wrap gap-1 text-[11px] font-bold">
            {([['all', 'الكل'], ['pending', 'بانتظار التعريف'], ['monthly', 'شهري'], ['daily', 'أجر يومي']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={clsx('rounded-full border px-2.5 py-1', filter === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600')} data-testid={`pr-filter-${k}`} aria-pressed={filter === k}>{l}</button>
            ))}
            <label className="ms-auto flex items-center gap-1 text-slate-500"><input type="checkbox" checked={filter === 'pending'} onChange={(e) => setFilter(e.target.checked ? 'pending' : 'all')} data-testid="pr-only-pending" /> بانتظار فقط</label>
          </div>
        </div>
        {isLoading ? <LoadingSpinner /> : (
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto text-sm" data-testid="pr-list">
            {list.map((e) => <EmployeeItem key={e.id} e={e} active={sel === e.id} onClick={() => setSel(e.id)} />)}
            {list.length === 0 && <li className="p-8 text-center text-xs text-slate-400">لا موظفين مطابقين</li>}
          </ul>
        )}
      </aside>
      {selected ? <SalaryForm key={selected.id} employee={selected} /> : (
        <div className="grid place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-10 text-center" data-testid="pr-empty">
          <div>
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-xl font-black text-brand-700">د.ع</div>
            <p className="text-sm font-black text-slate-800">اختر موظفاً لعرض ملف راتبه أو تعريفه</p>
            <p className="mt-1 text-xs text-slate-500">الراتب يُعرَّف هنا حصراً ولا يظهر لأي بوابة أخرى · الاستحقاق الشهري = (الأساسي ÷ أيام الشهر) × (أيام الحضور + الإجازة المدفوعة)</p>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeeItem({ e, active, onClick }: { e: HrEmployeeRow; active: boolean; onClick: () => void }) {
  const defined = e.salary_status === 'defined'
  return (
    <li>
      <button type="button" onClick={onClick} className={clsx('flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-slate-50', active && 'bg-brand-50/70 shadow-[inset_3px_0_0_#005f8d]')} data-testid={`pr-emp-${e.employee_number}`} aria-current={active || undefined}>
        <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-black ring-1', defined ? 'bg-emerald-50 text-emerald-800 ring-emerald-100' : 'bg-amber-50 text-amber-800 ring-amber-100')} aria-hidden>{initials(e.full_name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-slate-900">{e.full_name}</span>
          <span className="block truncate text-[11px] text-slate-500"><span dir="ltr">{e.employee_number}</span> · {e.department_name ?? 'بلا قسم'} · {CONTRACT_LABELS[e.contract_type]}</span>
        </span>
        <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', defined ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{defined ? 'مُعرَّف' : 'بانتظار'}</span>
      </button>
    </li>
  )
}

export function SalaryForm({ employee }: { employee: HrEmployeeRow }) {
  const { data: p, isLoading } = useSalaryProfile(employee.id)
  if (isLoading) return <LoadingSpinner />
  return <SalaryFormInner key={p?.set_at ?? 'new'} employee={employee} profile={p ?? null} />
}

function SalaryFormInner({ employee, profile }: { employee: HrEmployeeRow; profile: SalaryProfile | null }) {
  const set = useSetSalary()
  const defined = profile?.status === 'defined'
  const [payType, setPayType] = useState<ContractType>(profile?.pay_type ?? employee.contract_type)
  const [base, setBase] = useState(profile?.base_salary ? String(profile.base_salary) : ''); const [daily, setDaily] = useState(profile?.daily_rate ? String(profile.daily_rate) : '')
  const [allow, setAllow] = useState<KV>(toKV(profile?.allowances)); const [ded, setDed] = useState<KV>(toKV(profile?.fixed_deductions)); const [notes, setNotes] = useState(profile?.notes ?? '')
  const [err, setErr] = useState<string | null>(null)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [sim, setSim] = useState({ month: thisMonth, present: 22, paidLeave: 0 })
  const sumA = Object.values(fromKV(allow)).reduce((a, b) => a + b, 0); const sumD = Object.values(fromKV(ded)).reduce((a, b) => a + b, 0)
  const b = Number(base) || 0, d = Number(daily) || 0
  const dim = daysIn(sim.month)
  const full = simulateEarned({ payType, base: b, daily: d, allowances: sumA, fixed: sumD, daysInMonth: dim, present: dim, paidLeave: 0 })
  const s = simulateEarned({ payType, base: b, daily: d, allowances: sumA, fixed: sumD, daysInMonth: dim, present: sim.present, paidLeave: sim.paidLeave })
  const dirty = payType !== (profile?.pay_type ?? employee.contract_type) || b !== (profile?.base_salary ?? 0) || d !== (profile?.daily_rate ?? 0) || JSON.stringify(fromKV(allow)) !== JSON.stringify(profile?.allowances ?? {}) || JSON.stringify(fromKV(ded)) !== JSON.stringify(profile?.fixed_deductions ?? {}) || notes !== (profile?.notes ?? '')
  const save = async () => {
    if (payType === 'monthly' && b <= 0) { setErr('الراتب الأساسي مطلوب للتعاقد الشهري'); return }
    if (payType === 'daily' && d <= 0) { setErr('أجر اليوم مطلوب للأجر اليومي'); return }
    setErr(null)
    try { await set.mutateAsync({ employeeId: employee.id, payType, base: payType === 'monthly' ? b : 0, daily: payType === 'daily' ? d : 0, allowances: fromKV(allow), fixedDeductions: fromKV(ded), notes }) } catch { /* toast */ }
  }
  const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="salary-form">
      {/* رأس الموظف */}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-800 ring-1 ring-brand-100" aria-hidden>{initials(employee.full_name)}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-black text-slate-900">{employee.full_name}</h3>
          <p className="text-[11px] text-slate-500"><span dir="ltr">{employee.employee_number}</span> · {employee.department_name ?? 'بلا قسم'}{employee.job_title ? ` · ${employee.job_title}` : ''} · تعيين {employee.hire_date}</p>
        </div>
        <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-bold', defined ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')} data-testid="sf-status">
          {defined ? `مُعرَّف منذ ${profile?.set_at ? new Date(profile.set_at).toLocaleDateString('ar-IQ-u-nu-latn') : ''}` : 'بانتظار التعريف'}
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* يسار: المدخلات */}
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">نوع التعاقد
              <select className={clsx(field, 'mt-1 w-full')} value={payType} onChange={(e) => setPayType(e.target.value as ContractType)} data-testid="sf-type">
                <option value="monthly">شهري — راتب أساسي ثابت</option>
                <option value="daily">أجر يومي — يُدفع عن كل يوم حضور</option>
              </select>
              <span className="mt-1 block text-[10px] font-normal text-slate-500">{payType === 'monthly' ? 'الاستحقاق = (الأساسي ÷ أيام الشهر) × (الحضور + الإجازة المدفوعة)' : 'الاستحقاق = أجر اليوم × (الحضور + الإجازة المدفوعة)'}</span>
            </label>
            {payType === 'monthly' ? (
              <label className="block text-xs font-bold text-slate-700">الراتب الأساسي الشهري (د.ع) *
                <input type="number" min={0} step={1000} inputMode="numeric" className={clsx(field, 'mt-1 w-full text-base font-black tabular-nums')} value={base} onChange={(e) => setBase(e.target.value)} data-testid="sf-base" placeholder="مثال: 500000" />
                <span className="mt-1 block text-[10px] font-normal text-slate-500" data-testid="sf-base-words">{b > 0 ? `${money(b)} د.ع · أجر اليوم في شهر ${dim} يوماً = ${money(Math.round(b / dim))}` : 'أدخل المبلغ بالدينار العراقي'}</span>
              </label>
            ) : (
              <label className="block text-xs font-bold text-slate-700">أجر اليوم (د.ع) *
                <input type="number" min={0} step={500} inputMode="numeric" className={clsx(field, 'mt-1 w-full text-base font-black tabular-nums')} value={daily} onChange={(e) => setDaily(e.target.value)} data-testid="sf-daily" placeholder="مثال: 25000" />
                <span className="mt-1 block text-[10px] font-normal text-slate-500">{d > 0 ? `${money(d)} د.ع لليوم · ${dim} يوماً كاملاً = ${money(d * dim)}` : 'أدخل أجر اليوم بالدينار العراقي'}</span>
              </label>
            )}
          </div>
          <KVEditor title="المخصصات الشهرية" hint="تُضاف إلى الراتب وتتناسب مع الأيام المستحقة" items={allow} onChange={setAllow} total={sumA} testId="sf-allow" suggestions={ALLOW_SUGGEST} tone="emerald" />
          <KVEditor title="الاستقطاعات الثابتة" hint="تُخصم كل شهر بغضّ النظر عن الحضور" items={ded} onChange={setDed} total={sumD} testId="sf-ded" suggestions={DED_SUGGEST} tone="rose" />
          <label className="block text-xs font-bold text-slate-700">ملاحظات<input className={clsx(field, 'mt-1 w-full')} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="sf-notes" placeholder="اختياري" /></label>
        </div>

        {/* يمين: الملخص والمحاكاة */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs" data-testid="sf-preview">
            <p className="mb-2 font-black text-slate-800">ملخص الملف (شهر كامل {dim} يوماً)</p>
            <dl className="space-y-1">
              <Row k={payType === 'monthly' ? 'الراتب الأساسي' : `أجر اليوم × ${dim}`} v={money(full.baseDue)} />
              <Row k="+ المخصصات" v={money(sumA)} tone="emerald" />
              <Row k="− الاستقطاعات الثابتة" v={money(sumD)} tone="rose" />
              <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1.5 text-sm font-black text-slate-900"><dt>الصافي عند الحضور الكامل</dt><dd className="tabular-nums" data-testid="sf-full-net">{money(full.net)}</dd></div>
            </dl>
            <p className="mt-1 text-[10px] text-slate-500">قبل استقطاعات غرفة العمليات والتأخير والسلف.</p>
          </div>

          <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-3 text-xs" data-testid="sf-sim">
            <p className="mb-2 font-black text-brand-900">محاكاة الاستحقاق — كم يستلم لو…</p>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-[10px] font-bold text-slate-600">الشهر<input type="month" className={clsx(field, 'mt-0.5 w-full px-1 text-[11px]')} value={sim.month} onChange={(e) => e.target.value && setSim({ ...sim, month: e.target.value })} data-testid="sf-sim-month" /></label>
              <label className="block text-[10px] font-bold text-slate-600">أيام الحضور<input type="number" min={0} max={31} className={clsx(field, 'mt-0.5 w-full px-1 text-[11px]')} value={sim.present} onChange={(e) => setSim({ ...sim, present: Math.max(0, Math.min(31, Number(e.target.value) || 0)) })} data-testid="sf-sim-present" /></label>
              <label className="block text-[10px] font-bold text-slate-600">إجازة مدفوعة<input type="number" min={0} max={31} className={clsx(field, 'mt-0.5 w-full px-1 text-[11px]')} value={sim.paidLeave} onChange={(e) => setSim({ ...sim, paidLeave: Math.max(0, Math.min(31, Number(e.target.value) || 0)) })} data-testid="sf-sim-leave" /></label>
            </div>
            <div className="mt-2 space-y-1 rounded-xl bg-white p-2 ring-1 ring-brand-100">
              <p className="text-[11px] text-slate-600" data-testid="sf-sim-formula">
                {payType === 'monthly'
                  ? <>أجر اليوم = {money(b)} ÷ {dim} = <b className="tabular-nums">{s.dayRate.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b> · الأيام المستحقة = {sim.present} + {sim.paidLeave} = <b>{s.payable}</b></>
                  : <>أجر اليوم <b className="tabular-nums">{money(d)}</b> · الأيام المستحقة = {sim.present} + {sim.paidLeave} = <b>{s.payable}</b></>}
              </p>
              <Row k="الأساس المستحق" v={money(s.baseDue)} />
              {sumA > 0 && <Row k={`+ مخصصات${payType === 'monthly' && s.ratio < 1 ? ` (${Math.round(s.ratio * 100)}%)` : ''}`} v={money(s.allow)} tone="emerald" />}
              {sumD > 0 && <Row k="− ثابتة" v={money(sumD)} tone="rose" />}
              <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-sm font-black text-brand-900"><span>الصافي التقديري</span><span className="tabular-nums" data-testid="sf-sim-net">{money(s.net)}</span></div>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">اليوم بلا بصمة وبلا إجازة معتمدة لا يُدفع · التأخير يُخصم وفق قواعد الاستقطاعات التلقائية.</p>
          </div>
        </div>
      </div>

      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-100" role="alert" data-testid="sf-error">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-[11px] text-slate-500">{dirty ? <span className="font-bold text-amber-700" data-testid="sf-dirty">تعديلات غير محفوظة</span> : defined ? 'لا تعديلات' : 'لم يُعرَّف بعد'}</p>
        <Button size="sm" onClick={() => void save()} isLoading={set.isPending} data-testid="sf-save">{defined ? 'حفظ التعديلات' : 'تعريف الراتب'}</Button>
      </div>
    </section>
  )
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'emerald' | 'rose' }) {
  return <div className="flex items-center justify-between"><dt className="text-slate-600">{k}</dt><dd className={clsx('font-bold tabular-nums', tone === 'emerald' && 'text-emerald-700', tone === 'rose' && 'text-rose-700')}>{v}</dd></div>
}

function KVEditor({ title, hint, items, onChange, total, testId, suggestions, tone }: { title: string; hint: string; items: KV; onChange: (v: KV) => void; total: number; testId: string; suggestions: string[]; tone: 'emerald' | 'rose' }) {
  const used = new Set(items.map((i) => i.k.trim()))
  return (
    <div className="rounded-2xl border border-slate-200 p-3" data-testid={testId}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-800">{title} <span className={clsx('ms-1 rounded-full px-2 py-0.5 text-[10px] tabular-nums', tone === 'emerald' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>{fmtMoney(total)}</span></p>
        <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200" onClick={() => onChange([...items, { k: '', v: '' }])} data-testid={`${testId}-add`}>+ بند</button>
      </div>
      <p className="mb-2 text-[10px] text-slate-500">{hint}</p>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex gap-1.5">
            <input className={clsx(field, 'flex-1')} placeholder="اسم البند" value={it.k} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} data-testid={`${testId}-k-${i}`} />
            <input type="number" min={0} inputMode="numeric" className={clsx(field, 'w-32 tabular-nums')} placeholder="المبلغ" value={it.v} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} data-testid={`${testId}-v-${i}`} />
            <button type="button" className="rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="حذف البند">✕</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-[11px] text-slate-400">لا بنود</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {suggestions.filter((sg) => !used.has(sg)).map((sg) => (
          <button key={sg} type="button" className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:border-brand-400 hover:text-brand-700" onClick={() => onChange([...items, { k: sg, v: '' }])} data-testid={`${testId}-suggest-${sg}`}>+ {sg}</button>
        ))}
      </div>
    </div>
  )
}
