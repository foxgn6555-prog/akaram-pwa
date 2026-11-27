/**
 * المالية — رواتب الآليات المؤجرة (20261203000100–000400)
 *
 * ① تحديد راتب كل سائق: شهري (يُحتسب بالأيام) أو يومي (أجر × أيام الحضور).
 * ② الكشف: الأساسي · خصم الغياب · الضريبة (من اعتماد المعاون) · الصافي.
 * ③ الصرف بعد اعتماد معاون المدير المفوض — ولا صرف لمن له حضور بلا راتب محدَّد.
 * ④ تصدير Excel احترافي.
 *
 * الحساب:
 *   شهري ⇒ الأساسي = الراتب × (أيام الحضور ÷ أيام الشهر)   ·  اليومي = الراتب ÷ أيام الشهر
 *   يومي ⇒ الأساسي = الأجر اليومي × أيام الحضور
 *   الضريبة: مبلغ ثابت أو نسبة من الأساسي ⇒ تُخصم من الصافي.
 */
import { useMemo, useState } from 'react'
import { CheckCircle2, Download, Wallet } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { Button } from '@components/ui'
import {
  usePayRentedMonth,
  useRentedPayroll,
  useSaveRentedSalary,
} from '@features/rented-vehicles/hooks'
import { downloadRentedPayrollExcel } from '@features/rented-vehicles/excel'
import { useCanCall } from '@features/permissions/my-permissions'
import type { RentedSalaryMode, RentedSettlementRow } from '@sdk/rented-vehicles.sdk'

const input =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none'
const btnLight =
  'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-50'
const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const baghdadYm = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }).slice(0, 7)
const lastClosedYm = () => {
  const parts = baghdadYm().split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export default function FinanceRentedSalariesPage() {
  const [month, setMonth] = useState(lastClosedYm())
  const q = useRentedPayroll(month)
  const saveSalary = useSaveRentedSalary()
  const payMonth = usePayRentedMonth()

  // 00350-D: تعطيل أزرار الكتابة حسب الصلاحية قبل النقر
  const canSaveSalary = useCanCall('rented_salary_save')
  const canPay = useCanCall('rented_month_pay')

  const [editing, setEditing] = useState<RentedSettlementRow | null>(null)
  const [mode, setMode] = useState<RentedSalaryMode>('monthly')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const d = q.data
  const rows = d?.rows ?? []
  const status = d?.status ?? 'draft'
  const totals = useMemo(
    () => d?.totals ?? { base: 0, absence: 0, tax: 0, net: 0, drivers: 0, rows_with_salary: 0 },
    [d],
  )
  const missingSalary = rows.filter((r) => !r.has_salary && r.present_days > 0).length
  const noTax = rows.filter((r) => r.has_salary && !r.tax_set).length

  const open = (r: RentedSettlementRow) => {
    setEditing(r)
    setMode(r.salary_mode ?? 'monthly')
    setAmount(String(r.monthly_amount || r.daily_amount || ''))
    setNote('')
  }

  const submit = async () => {
    if (!editing) return
    const v = Number(amount)
    if (!Number.isFinite(v) || v <= 0) {
      window.alert('المبلغ يجب أن يكون أكبر من صفر')
      return
    }
    try {
      await saveSalary.mutateAsync({
        driverId: editing.driver_external_id,
        vehicleId: editing.vehicle_id,
        month: `${month}-01`,
        mode,
        amount: v,
        note: note.trim() || null,
      })
      setEditing(null)
    } catch {
      /* toast */
    }
  }

  const pay = async () => {
    if (status !== 'deputy_approved') {
      window.alert('لا صرف قبل اعتماد معاون المدير المفوض')
      return
    }
    if (missingSalary > 0) {
      window.alert(`سائقون لهم حضور بلا راتب: ${missingSalary}`)
      return
    }
    const why = window.prompt('ملاحظة الصرف (اختياري):') ?? ''
    try {
      await payMonth.mutateAsync({ month: d?.month ?? `${month}-01`, note: why.trim() || null })
    } catch {
      /* toast */
    }
  }

  return (
    <section dir="rtl" className="space-y-4" data-testid="finance-rented-salaries-page">
      <ExecPageHeader
        icon="wallet"
        title="رواتب الآليات المؤجرة"
        subtitle="تحدّد راتب كل سائق (شهري أو يومي)، ويُخصم الغياب والضريبة المعتمدة من معاون المدير المفوض. الصرف بعد الاعتماد فقط."
        stats={[
          { label: 'سائقون', value: rows.length, tone: 'plain', testId: 'frs-st-drivers' },
          {
            label: 'بلا راتب',
            value: missingSalary,
            tone: missingSalary > 0 ? 'red' : 'plain',
            testId: 'frs-st-missing',
          },
          {
            label: 'إجمالي الضريبة',
            value: money(totals.tax),
            tone: 'plain',
            testId: 'frs-st-tax',
          },
          { label: 'صافي المستحق', value: money(totals.net), tone: 'green', testId: 'frs-st-net' },
        ]}
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-bold text-slate-600">
          الشهر
          <input
            aria-label="الشهر"
            type="month"
            className={`${input} max-w-44`}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            data-testid="frs-month"
          />
        </label>
        <span className="grow" />
        {d && (
          <span
            className={`rounded-lg px-2 py-1 text-[11px] font-black ${
              status === 'deputy_approved'
                ? 'bg-emerald-100 text-emerald-800'
                : status === 'finance_paid'
                  ? 'bg-sky-100 text-sky-800'
                  : status === 'rejected'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-600'
            }`}
            data-testid="frs-status"
          >
            {status === 'deputy_approved'
              ? 'معتمد — جاهز للصرف'
              : status === 'finance_paid'
                ? 'مدفوع'
                : status === 'rejected'
                  ? 'مرفوض من المعاون'
                  : 'بانتظار إرسال غرفة العمليات واعتماد المعاون'}
          </span>
        )}
        <button
          type="button"
          className={btnLight}
          data-testid="frs-export"
          disabled={!d || rows.length === 0}
          onClick={() => d && void downloadRentedPayrollExcel(d)}
        >
          <Download size={14} /> تصدير Excel
        </button>
        <Button
          data-testid="frs-pay"
          disabled={
            !d ||
            rows.length === 0 ||
            status !== 'deputy_approved' ||
            payMonth.isPending ||
            !canPay.allowed
          }
          title={canPay.title}
          onClick={() => void pay()}
        >
          <CheckCircle2 size={14} /> صرف وإغلاق الشهر
        </Button>
      </div>

      {q.isLoading && <LoadingSpinner />}
      {!q.isLoading && rows.length === 0 && (
        <EmptyState
          title="لا مستحقات لهذا الشهر"
          hint="تظهر المستحقات بعد تسجيل انطلاقات لآليات مؤجرة في هذا الشهر."
        />
      )}

      {missingSalary > 0 && (
        <p
          className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700"
          data-testid="frs-warn-missing"
        >
          {missingSalary} سائقاً لهم حضور بلا راتب محدَّد — حدّد رواتبهم كي يُسمح بالصرف.
        </p>
      )}
      {noTax > 0 && (
        <p
          className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800"
          data-testid="frs-warn-tax"
        >
          {noTax} آلية بلا ضريبة محدَّدة من معاون المدير المفوض — ستُصرف بلا خصم ضريبة.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1000px] text-xs" data-testid="frs-table">
            <thead>
              <tr className="bg-slate-950 text-white">
                {[
                  'السائق',
                  'الآلية',
                  'حاضر',
                  'غائب',
                  'نوع الأجر',
                  'الأساسي',
                  'خصم الغياب',
                  'الضريبة',
                  'الصافي',
                  '',
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-2 font-black">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.driver_external_id}:${r.vehicle_id}`}
                  className={`border-t border-slate-100 text-center ${!r.has_salary ? 'bg-rose-50' : ''}`}
                >
                  <td className="px-2 py-1.5 text-right">
                    <div className="font-black text-slate-900">{r.driver_name}</div>
                    <div className="text-[10px] text-slate-500">{r.contractor_name}</div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-[11px] text-slate-600">
                    {r.db_number}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-emerald-700">{r.present_days}</td>
                  <td className="px-2 py-1.5 tabular-nums text-rose-700">{r.absent_days}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-[11px] font-bold text-slate-600">
                    {r.salary_mode === 'monthly'
                      ? `شهري (${money(r.monthly_amount)})`
                      : r.salary_mode === 'daily'
                        ? `يومي (${money(r.daily_amount)})`
                        : '— بلا راتب —'}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{money(r.base_amount)}</td>
                  <td className="px-2 py-1.5 tabular-nums text-rose-700">
                    {money(r.absence_deduction)}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-amber-700">{money(r.tax_amount)}</td>
                  <td className="px-2 py-1.5 font-black tabular-nums text-slate-900">
                    {money(r.net_amount)}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      className={btnLight}
                      data-testid={`frs-edit-${r.driver_external_id}`}
                      disabled={status === 'finance_paid' || !canSaveSalary.allowed}
                      title={canSaveSalary.title}
                      onClick={() => open(r)}
                    >
                      <Wallet size={12} /> {r.has_salary ? 'تعديل' : 'تحديد'}
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-black">
                <td className="px-2 py-2 text-right" colSpan={5}>
                  المجموع
                </td>
                <td className="px-2 py-2 tabular-nums">{money(totals.base)}</td>
                <td className="px-2 py-2 tabular-nums text-rose-700">{money(totals.absence)}</td>
                <td className="px-2 py-2 tabular-nums text-amber-700">{money(totals.tax)}</td>
                <td className="px-2 py-2 tabular-nums">{money(totals.net)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3" data-testid="frs-panel">
          <p className="mb-2 text-xs font-black text-slate-800">
            راتب {editing.driver_name} — {editing.db_number}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              aria-label="نوع الأجر"
              className={`${input} max-w-48`}
              value={mode}
              data-testid="frs-mode"
              onChange={(e) => setMode(e.target.value as RentedSalaryMode)}
            >
              <option value="monthly">أجر شهري</option>
              <option value="daily">أجر يومي</option>
            </select>
            <label className="text-[11px] font-bold text-slate-600">
              {mode === 'monthly' ? 'الراتب الشهري (د.ع)' : 'الأجر اليومي (د.ع)'}
              <input
                aria-label="المبلغ"
                className={input}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="frs-amount"
              />
            </label>
            <label className="text-[11px] font-bold text-slate-600">
              ملاحظة
              <input
                aria-label="ملاحظة"
                className={`${input} max-w-sm`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <Button
              onClick={submit}
              disabled={saveSalary.isPending || !canSaveSalary.allowed}
              title={canSaveSalary.title}
              data-testid="frs-save"
            >
              حفظ
            </Button>
            <button type="button" className={btnLight} onClick={() => setEditing(null)}>
              إلغاء
            </button>
          </div>
          <p className="mt-2 text-[10px] font-bold text-slate-500">
            شهري: يُحتسب الراتب × (أيام الحضور ÷ أيام الشهر) ويُخصم الباقي كغياب · يومي: الأجر ×
            أيام الحضور فقط.
          </p>
        </div>
      )}
    </section>
  )
}
