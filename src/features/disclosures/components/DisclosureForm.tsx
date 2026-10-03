/**
 * نموذج إنشاء/تعديل كشف (00170) — غرفة العمليات
 *  · الهدف: آلية (بحث في قاعدة الآليات بالرقم DB/السائق/اللوحة → تعبئة تلقائية) أو موظف (بحث بالاسم/الرقم الوظيفي من الموارد البشرية)
 *  · لا كتابة حرة للأسماء — الاختيار من النظام فقط
 *  · النوع من أنواع الكشوفات (IT) → العقوبات المسموحة + المبلغ الافتراضي
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { PENALTY_LABEL, SHIFT_LABEL, type DisclosureInput, type DisclosureTargetKind, type DisclosureV2, type EmployeeOption, type PenaltyKey, type VehicleOption } from '@sdk/disclosures-unit.sdk'
import { useDisclosureActions, useDisclosureTypes, useEmployeeLookup, useVehicleLookup } from '../unit'
import { Field } from './shared'
import { btnGhost, btnPrimary, inputCls } from './ui'

export interface DisclosureFormProps {
  /** عند التعديل */
  initial?: DisclosureV2 | null
  onSaved: (d: DisclosureV2, submitted: boolean) => void
  onCancel?: () => void
}

const today = () => new Date().toISOString().slice(0, 10)
function useDebounced(v: string, ms = 250) { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms]); return d }

export function DisclosureForm({ initial, onSaved, onCancel }: DisclosureFormProps) {
  const types = useDisclosureTypes()
  const { save, submit } = useDisclosureActions()
  const [kind, setKind] = useState<DisclosureTargetKind>(initial?.target_kind ?? 'vehicle')
  const [vehicle, setVehicle] = useState<VehicleOption | null>(initial?.vehicle_id ? { id: initial.vehicle_id, db_number: initial.db_number, plate_number: '', vehicle_name: initial.vehicle_type ?? '', driver_name: initial.driver_name, shift: initial.shift, sector: initial.sector, parent_sector: null, driver_employee_id: initial.employee_id, driver_employee_name: initial.employee_name, driver_employee_number: initial.employee_number } : null)
  const [employee, setEmployee] = useState<EmployeeOption | null>(initial?.target_kind === 'employee' && initial.employee_id ? { id: initial.employee_id, full_name: initial.employee_name ?? '', employee_number: initial.employee_number ?? '', job_title: initial.job_title, department_name: initial.department_name } : null)
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [type, setType] = useState(initial?.violation_type ?? '')
  const [penalty, setPenalty] = useState<PenaltyKey | ''>(initial?.penalty_type ?? '')
  const [logDate, setLogDate] = useState(initial?.log_date?.slice(0, 10) ?? today())
  const [shift, setShift] = useState(initial?.shift ?? 'morning')
  const [details, setDetails] = useState(initial?.details ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [contractor, setContractor] = useState(initial?.contractor_name ?? '')
  const [open, setOpen] = useState(false)

  const vq = useVehicleLookup(dq, kind === 'vehicle' && open)
  const eq = useEmployeeLookup(dq, kind === 'employee' && open)
  const activeTypes = useMemo(() => (types.data ?? []).filter((t) => t.is_active || t.key === initial?.violation_type), [types.data, initial?.violation_type])
  const selType = activeTypes.find((t) => t.key === type) ?? null
  useEffect(() => {
    if (!selType) return
    if (penalty && !selType.allowed_penalties.includes(penalty)) setPenalty('')
    if (!initial && amount === '' && selType.default_amount != null) setAmount(String(selType.default_amount))
  }, [selType, penalty, amount, initial])

  const amountNum = amount.trim() === '' ? null : Number(amount)
  const errors: string[] = []
  if (kind === 'vehicle' && !vehicle) errors.push('اختر الآلية من القائمة')
  if (kind === 'employee' && !employee) errors.push('اختر الموظف من القائمة')
  if (!type) errors.push('اختر نوع الكشف')
  if (details.trim().length < 5) errors.push('اكتب التفاصيل (5 أحرف على الأقل)')
  if (!logDate || logDate > today()) errors.push('تاريخ المخالفة غير صالح')
  if (amountNum != null && (!Number.isFinite(amountNum) || amountNum < 0)) errors.push('المبلغ غير صالح')
  const busy = save.isPending || submit.isPending

  const build = (): DisclosureInput => ({
    target_kind: kind, vehicle_id: kind === 'vehicle' ? vehicle?.id ?? null : null, employee_id: kind === 'employee' ? employee?.id ?? null : null,
    driver_name: kind === 'vehicle' ? vehicle?.driver_name ?? null : null, vehicle_type: vehicle?.vehicle_name || null, contractor_name: contractor.trim() || null,
    sector: kind === 'vehicle' ? vehicle?.sector ?? null : employee?.department_name ?? null, shift, log_date: logDate, violation_type: type, penalty_type: penalty || null, details: details.trim(), amount: amountNum,
  })
  const doSave = (thenSubmit: boolean) => {
    if (errors.length) return
    save.mutate({ id: initial?.id ?? null, input: build() }, {
      onSuccess: (d) => { if (thenSubmit) submit.mutate(d.id, { onSuccess: (s) => onSaved(s, true) }); else onSaved(d, false) },
    })
  }
  const pick = (o: VehicleOption | EmployeeOption) => {
    if ('db_number' in o) { setVehicle(o); if (o.shift) setShift(o.shift) } else setEmployee(o)
    setQ(''); setOpen(false)
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); doSave(false) }} data-testid="disc-form" noValidate>
      {/* الهدف */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-black text-slate-800">على مَن الكشف؟</h3>
          <div className="ms-auto inline-flex rounded-xl border border-slate-200 p-0.5" role="tablist">
            {(['vehicle', 'employee'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} data-testid={`target-${k}`} onClick={() => { if (!initial) { setKind(k); setQ(''); setOpen(false) } }} disabled={!!initial}
                className={clsx('h-8 rounded-lg px-3 text-xs font-black', kind === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>{k === 'vehicle' ? 'آلية (رقم DB)' : 'موظف'}</button>
            ))}
          </div>
        </div>
        {(kind === 'vehicle' ? vehicle : employee) ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm" data-testid="target-selected">
            {kind === 'vehicle' && vehicle ? (
              <>
                <div><div className="text-[10px] font-bold text-slate-400">رقم DB</div><div className="font-black" dir="ltr">{vehicle.db_number}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">السائق</div><div className="font-bold">{vehicle.driver_name}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">نوع الآلية</div><div>{vehicle.vehicle_name || '—'}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">القاطع</div><div>{vehicle.sector ?? '—'}{vehicle.parent_sector ? ` (${vehicle.parent_sector})` : ''}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">سجل الموظف</div><div className={clsx(!vehicle.driver_employee_id && 'text-amber-700')}>{vehicle.driver_employee_id ? `${vehicle.driver_employee_name} #${vehicle.driver_employee_number}` : 'غير مرتبط (مؤجّرة) — المبلغ يُسجَّل فقط'}</div></div>
              </>
            ) : employee ? (
              <>
                <div><div className="text-[10px] font-bold text-slate-400">الموظف</div><div className="font-black">{employee.full_name}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">الرقم الوظيفي</div><div dir="ltr">{employee.employee_number}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">القسم</div><div>{employee.department_name ?? '—'}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">العنوان الوظيفي</div><div>{employee.job_title ?? '—'}</div></div>
              </>
            ) : null}
            {!initial && <button type="button" className={clsx(btnGhost, 'ms-auto h-8')} data-testid="target-change" onClick={() => { setVehicle(null); setEmployee(null); setOpen(true) }}>تغيير</button>}
          </div>
        ) : (
          <div className="relative">
            <input className={inputCls} autoFocus value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }} data-testid="target-search"
              placeholder={kind === 'vehicle' ? 'ابحث برقم DB أو اسم السائق أو رقم اللوحة…' : 'ابحث باسم الموظف أو رقمه الوظيفي…'} />
            {open && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl" data-testid="target-options">
                {(kind === 'vehicle' ? vq.isLoading : eq.isLoading) ? <li className="p-3 text-xs text-slate-500">جارٍ البحث…</li> : null}
                {kind === 'vehicle' && (vq.data ?? []).map((v) => (
                  <li key={v.id}><button type="button" className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-right text-sm hover:bg-brand-50" onClick={() => pick(v)} data-testid={`opt-${v.id}`}>
                    <span className="rounded-md bg-sky-50 px-1.5 font-black text-sky-700" dir="ltr">{v.db_number}</span><span className="font-bold">{v.driver_name}</span><span className="text-xs text-slate-500">{v.vehicle_name} · {v.sector ?? '—'} · {SHIFT_LABEL[v.shift] ?? v.shift}</span>
                    {!v.driver_employee_id && <span className="ms-auto rounded bg-amber-50 px-1 text-[10px] font-bold text-amber-700">مؤجّرة</span>}
                  </button></li>
                ))}
                {kind === 'employee' && (eq.data ?? []).map((e) => (
                  <li key={e.id}><button type="button" className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-right text-sm hover:bg-brand-50" onClick={() => pick(e)} data-testid={`opt-${e.id}`}>
                    <span className="font-bold">{e.full_name}</span><span className="text-xs text-slate-500" dir="ltr">#{e.employee_number}</span><span className="text-xs text-slate-500">{e.department_name ?? '—'} · {e.job_title ?? '—'}</span>
                  </button></li>
                ))}
                {!(kind === 'vehicle' ? vq.isLoading : eq.isLoading) && (kind === 'vehicle' ? vq.data : eq.data)?.length === 0 ? <li className="p-3 text-xs text-slate-500">لا نتائج — الأهداف تُختار من النظام فقط (قاعدة الآليات / الموارد البشرية)</li> : null}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* تفاصيل المخالفة */}
      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <Field label="نوع الكشف" testId="f-type">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)} data-testid="type-select">
            <option value="">— اختر —</option>
            {activeTypes.map((t) => <option key={t.key} value={t.key}>{t.label}{t.default_amount ? ` (افتراضي ${t.default_amount})` : ''}</option>)}
          </select>
          {selType?.description ? <span className="mt-1 block text-[11px] text-slate-500">{selType.description}</span> : null}
        </Field>
        <Field label="العقوبة المقترحة (اختياري)" testId="f-penalty">
          <select className={inputCls} value={penalty} onChange={(e) => setPenalty(e.target.value as PenaltyKey | '')} data-testid="penalty-select" disabled={!selType}>
            <option value="">— بدون —</option>
            {(selType?.allowed_penalties ?? []).map((p) => <option key={p} value={p}>{PENALTY_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="تاريخ المخالفة" hint="يُحدَّد شهر الاستقطاع من هذا التاريخ"><input type="date" className={inputCls} value={logDate} max={today()} onChange={(e) => setLogDate(e.target.value)} data-testid="log-date" dir="ltr" /></Field>
        <Field label="الشفت">
          <select className={inputCls} value={shift} onChange={(e) => setShift(e.target.value)} data-testid="shift-select">{Object.entries(SHIFT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="المبلغ المقترح (د.ع — اختياري)" hint="يحدده المعاون/المدير المفوض نهائياً"><input className={inputCls} inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="بدون" data-testid="amount" /></Field>
        {kind === 'vehicle' && <Field label="المتعهد (اختياري)"><input className={inputCls} value={contractor} onChange={(e) => setContractor(e.target.value)} data-testid="contractor" /></Field>}
        <div className="sm:col-span-2">
          <Field label="تفاصيل الكشف"><textarea className={clsx(inputCls, 'h-28 py-2')} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="ماذا حدث؟ أين؟ ومتى؟ مع أي ملاحظات تساعد المعاون على القرار" data-testid="details" /></Field>
        </div>
      </section>

      {errors.length > 0 && (details || type || vehicle || employee) ? <ul className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800" data-testid="form-errors">{errors.map((e) => <li key={e}>• {e}</li>)}</ul> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={busy || errors.length > 0} data-testid="save-submit" onClick={() => doSave(true)}>{initial?.status === 'returned' ? 'حفظ وإعادة الرفع' : 'حفظ ورفع للموافقة'}</button>
        <button type="submit" className={btnGhost} disabled={busy || errors.length > 0} data-testid="save-draft">{initial ? 'حفظ التعديلات' : 'حفظ كمسودة'}</button>
        {onCancel ? <button type="button" className={btnGhost} onClick={onCancel} data-testid="form-cancel">رجوع</button> : null}
      </div>
    </form>
  )
}
