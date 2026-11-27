/**
 * معاون المدير المفوض — الآليات المؤجرة (20261203000100–000400)
 *
 * ① ضريبة كل آلية: مبلغ شهري ثابت **أو** نسبة من المستحق — يتحكم بها المعاون حصراً.
 * ② اعتماد حضوريات الشهر بعد إرسالها من غرفة العمليات (أو رفضها بسبب).
 *
 * ملاحظة: هذه الضريبة تعمل على مستوى **الآلية** وتُخصم من مستحق سائقها في وحدة
 * «رواتب الآليات المؤجرة» بالمالية. وحدة «ضريبة الآليات المؤجرة» القديمة (00251)
 * تعمل على نسبة من راتب الموظف وتبقى مستقلة.
 */
import { useMemo, useState } from 'react'
import { BadgeCheck, Download, Percent, Wallet, XCircle } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { Button } from '@components/ui'
import {
  useClearRentedTax,
  useDecideRentedDeputy,
  useRentedPayroll,
  useRentedTaxes,
  useSaveRentedTax,
} from '@features/rented-vehicles/hooks'
import { downloadRentedPayrollExcel } from '@features/rented-vehicles/excel'
import { useCanCall } from '@features/permissions/my-permissions'
import type { RentedTaxMode, RentedTaxRow } from '@sdk/rented-vehicles.sdk'

const input =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none'
const btnLight =
  'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-50'
const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const baghdadYm = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }).slice(0, 7)
/** الشهر المنتهي الأخير — الحضوريات تُعتمد بعد انتهاء الشهر */
const lastClosedYm = () => {
  const parts = baghdadYm().split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export default function DeputyRentedVehiclesPage() {
  const taxes = useRentedTaxes()
  const [month, setMonth] = useState(lastClosedYm())
  const payroll = useRentedPayroll(month)
  const decide = useDecideRentedDeputy()

  const [editing, setEditing] = useState<RentedTaxRow | null>(null)
  const [mode, setMode] = useState<RentedTaxMode>('fixed')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const saveTax = useSaveRentedTax()
  const clearTax = useClearRentedTax()

  // 00350-D: تعطيل أزرار الكتابة حسب الصلاحية قبل النقر
  const canTax = useCanCall('rented_tax_save')
  const canClearTax = useCanCall('rented_tax_clear')
  const canDecide = useCanCall('rented_month_decide_deputy')

  const [rejectNote, setRejectNote] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const rows = taxes.data ?? []
  const setCount = rows.filter((r) => r.is_set).length
  const pay = payroll.data
  const status = pay?.status ?? 'draft'

  const open = (r: RentedTaxRow) => {
    setEditing(r)
    setMode(r.mode ?? 'fixed')
    setAmount(String(r.fixed_amount ?? r.pct ?? ''))
    setReason('')
  }

  const submitTax = async () => {
    if (!editing) return
    const v = Number(amount)
    if (!Number.isFinite(v) || v < 0) {
      window.alert('المبلغ غير صالح')
      return
    }
    if (mode === 'percent' && v > 100) {
      window.alert('النسبة يجب أن تكون بين ٠ و١٠٠')
      return
    }
    if (reason.trim().length < 3) {
      window.alert('السبب إلزامي (٣ أحرف على الأقل)')
      return
    }
    try {
      await saveTax.mutateAsync({
        vehicleId: editing.vehicle_id,
        mode,
        amount: v,
        reason: reason.trim(),
      })
      setEditing(null)
      setReason('')
    } catch {
      /* toast */
    }
  }

  const totals = useMemo(
    () => pay?.totals ?? { base: 0, absence: 0, tax: 0, net: 0, drivers: 0, rows_with_salary: 0 },
    [pay],
  )

  return (
    <section dir="rtl" className="space-y-4" data-testid="deputy-rented-vehicles-page">
      <ExecPageHeader
        icon="truck"
        title="الآليات المؤجرة — الضريبة والاعتماد"
        subtitle="تحدّد ضريبة كل آلية (مبلغ ثابت أو نسبة)، وتعتمد حضوريات الشهر بعد إرسالها من غرفة العمليات لتنتقل إلى المالية للصرف."
        stats={[
          { label: 'آليات مؤجرة', value: rows.length, tone: 'plain', testId: 'drv-st-vehicles' },
          { label: 'ضريبة محدَّدة', value: setCount, tone: 'green', testId: 'drv-st-set' },
          {
            label: 'إجمالي الضرائب',
            value: money(totals.tax),
            tone: 'plain',
            testId: 'drv-st-tax',
          },
          { label: 'صافي الشهر', value: money(totals.net), tone: 'plain', testId: 'drv-st-net' },
        ]}
      />

      {/* ══ ① الضريبة لكل آلية ══ */}
      <div className="flex flex-wrap items-end gap-2">
        <h2 className="grow text-sm font-black text-slate-800">① ضريبة كل آلية</h2>
      </div>

      {taxes.isLoading && <LoadingSpinner />}
      {!taxes.isLoading && rows.length === 0 && (
        <EmptyState
          title="لا توجد آليات مؤجرة بعد"
          hint="عند إضافة آلية مؤجرة في قاعدة بيانات الكراج ستظهر هنا لتحديد ضريبتها."
        />
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-xs" data-testid="drv-tax-table">
            <thead>
              <tr className="bg-slate-950 text-white">
                {['الآلية', 'السائق / المتعهد', 'الكراج', 'الضريبة', 'القيمة', 'السبب', ''].map(
                  (h) => (
                    <th key={h} className="px-2 py-2 font-black">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vehicle_id} className="border-t border-slate-100 text-center">
                  <td className="px-2 py-1.5 text-right">
                    <div className="font-black text-slate-900">{r.db_number}</div>
                    <div className="text-[10px] text-slate-500">{r.vehicle_name}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="font-bold text-slate-800">
                      {r.driver_name ?? '— بلا سائق —'}
                    </div>
                    <div className="text-[10px] text-slate-500">{r.contractor_name ?? ''}</div>
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">{r.garage_parent_sector ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    {r.is_set ? (
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                          r.mode === 'fixed'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.mode === 'fixed' ? (
                          <>
                            <Wallet size={10} className="inline" /> مبلغ ثابت
                          </>
                        ) : (
                          <>
                            <Percent size={10} className="inline" /> نسبة
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400">غير محدَّدة</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-black tabular-nums text-slate-800">
                    {r.is_set
                      ? r.mode === 'fixed'
                        ? money(r.fixed_amount)
                        : `${Number(r.pct ?? 0)}٪`
                      : '—'}
                  </td>
                  <td
                    className="max-w-56 truncate px-2 py-1.5 text-right text-[10px] text-slate-500"
                    title={r.reason ?? ''}
                  >
                    {r.reason ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <button
                      type="button"
                      className={btnLight}
                      data-testid={`drv-tax-edit-${r.vehicle_id}`}
                      disabled={!canTax.allowed}
                      title={canTax.title}
                      onClick={() => open(r)}
                    >
                      {r.is_set ? 'تعديل' : 'تحديد'}
                    </button>
                    {r.is_set && (
                      <button
                        type="button"
                        className={`${btnLight} mr-1`}
                        data-testid={`drv-tax-clear-${r.vehicle_id}`}
                        disabled={clearTax.isPending || !canClearTax.allowed}
                        title={canClearTax.title}
                        onClick={() => {
                          const why = window.prompt('سبب إلغاء الضريبة:')
                          if (why && why.trim().length >= 3)
                            void clearTax.mutateAsync({
                              vehicleId: r.vehicle_id,
                              reason: why.trim(),
                            })
                        }}
                      >
                        إلغاء
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div
          className="rounded-2xl border border-sky-200 bg-sky-50 p-3"
          data-testid="drv-tax-panel"
        >
          <p className="mb-2 text-xs font-black text-slate-800">
            ضريبة {editing.db_number} — {editing.vehicle_name}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              aria-label="نوع الضريبة"
              className={`${input} max-w-48`}
              value={mode}
              data-testid="drv-tax-mode"
              onChange={(e) => setMode(e.target.value as RentedTaxMode)}
            >
              <option value="fixed">مبلغ شهري ثابت</option>
              <option value="percent">نسبة من المستحق</option>
            </select>
            <label className="text-[11px] font-bold text-slate-600">
              {mode === 'fixed' ? 'المبلغ (د.ع)' : 'النسبة %'}
              <input
                aria-label="قيمة الضريبة"
                className={input}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="drv-tax-amount"
              />
            </label>
            <label className="text-[11px] font-bold text-slate-600">
              السبب (إلزامي)
              <input
                aria-label="سبب الضريبة"
                className={`${input} max-w-md`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                data-testid="drv-tax-reason"
              />
            </label>
            <Button
              onClick={submitTax}
              disabled={saveTax.isPending || !canTax.allowed}
              title={canTax.title}
              data-testid="drv-tax-save"
            >
              حفظ
            </Button>
            <button type="button" className={btnLight} onClick={() => setEditing(null)}>
              إلغاء
            </button>
          </div>
          <p className="mt-2 text-[10px] font-bold text-slate-500">
            «المبلغ الثابت» يُخصم كاملاً كل شهر · «النسبة» تُحسب من المستحق الأساسي (راتب × أيام
            الحضور) فتنقص تلقائياً مع الغياب.
          </p>
        </div>
      )}

      {/* ══ ② اعتماد الشهر ══ */}
      <div className="flex flex-wrap items-end gap-2 pt-2">
        <h2 className="grow text-sm font-black text-slate-800">② اعتماد حضوريات الشهر</h2>
        <input
          aria-label="الشهر"
          type="month"
          className={`${input} max-w-44`}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          data-testid="drv-month"
        />
      </div>

      {payroll.isLoading && <LoadingSpinner />}
      {pay && (
        <div className="space-y-3" data-testid="drv-approval">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs">
            <span className="font-black text-slate-800">حالة الشهر:</span>
            <span
              className={`rounded-lg px-2 py-0.5 font-black ${
                status === 'draft'
                  ? 'bg-slate-100 text-slate-700'
                  : status === 'deputy_approved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : status === 'finance_paid'
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-rose-100 text-rose-800'
              }`}
              data-testid="drv-status"
            >
              {status === 'draft'
                ? 'بانتظار اعتمادك'
                : status === 'deputy_approved'
                  ? 'معتمد — عند المالية'
                  : status === 'finance_paid'
                    ? 'مدفوع'
                    : 'مرفوض'}
            </span>
            <span className="text-slate-500">
              سائقون: {pay.rows.length} · بلا راتب:{' '}
              {pay.rows.filter((r) => !r.has_salary && r.present_days > 0).length}
            </span>
            <span className="grow" />
            {status === 'draft' && (
              <>
                <Button
                  data-testid="drv-approve"
                  disabled={decide.isPending || !canDecide.allowed}
                  title={canDecide.title}
                  onClick={() => decide.mutate({ month: pay.month, approve: true, note: null })}
                >
                  <BadgeCheck size={14} /> اعتماد
                </Button>
                <button
                  type="button"
                  className={btnLight}
                  data-testid="drv-reject-toggle"
                  disabled={!canDecide.allowed}
                  title={canDecide.title}
                  onClick={() => setRejecting((v) => !v)}
                >
                  <XCircle size={14} /> رفض
                </button>
              </>
            )}
            <button
              type="button"
              className={btnLight}
              data-testid="drv-export"
              disabled={pay.rows.length === 0}
              onClick={() => void downloadRentedPayrollExcel(pay)}
            >
              <Download size={14} /> تصدير Excel
            </button>
          </div>

          {rejecting && status === 'draft' && (
            <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <input
                aria-label="سبب الرفض"
                className={`${input} max-w-md`}
                placeholder="سبب الرفض"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                data-testid="drv-reject-note"
              />
              <Button
                data-testid="drv-reject"
                disabled={decide.isPending || !canDecide.allowed}
                title={canDecide.title}
                onClick={() => {
                  if (rejectNote.trim().length < 3) {
                    window.alert('سبب الرفض إلزامي')
                    return
                  }
                  decide.mutate({ month: pay.month, approve: false, note: rejectNote.trim() })
                  setRejecting(false)
                  setRejectNote('')
                }}
              >
                تأكيد الرفض
              </Button>
            </div>
          )}

          {pay.rows.length === 0 ? (
            <EmptyState
              title="لا حضوريات لهذا الشهر"
              hint="لم تُسجَّل انطلاقات لآليات مؤجرة في هذا الشهر، أو لم يُرسَل الشهر من غرفة العمليات بعد."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[900px] text-xs" data-testid="drv-settlement-table">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    {[
                      'السائق',
                      'الآلية',
                      'حاضر',
                      'غائب',
                      'الأساسي',
                      'خصم الغياب',
                      'الضريبة',
                      'الصافي',
                    ].map((h) => (
                      <th key={h} className="px-2 py-2 font-black">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pay.rows.map((r) => (
                    <tr
                      key={`${r.driver_external_id}:${r.vehicle_id}`}
                      className="border-t border-slate-100 text-center"
                    >
                      <td className="px-2 py-1.5 text-right font-bold text-slate-800">
                        {r.driver_name}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-[11px] text-slate-600">
                        {r.db_number}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-emerald-700">
                        {r.present_days}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-rose-700">{r.absent_days}</td>
                      <td className="px-2 py-1.5 tabular-nums">{money(r.base_amount)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-rose-700">
                        {money(r.absence_deduction)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-amber-700">
                        {money(r.tax_amount)}
                      </td>
                      <td className="px-2 py-1.5 font-black tabular-nums text-slate-900">
                        {money(r.net_amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-black">
                    <td className="px-2 py-2 text-right" colSpan={4}>
                      المجموع
                    </td>
                    <td className="px-2 py-2 tabular-nums">{money(totals.base)}</td>
                    <td className="px-2 py-2 tabular-nums text-rose-700">
                      {money(totals.absence)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-amber-700">{money(totals.tax)}</td>
                    <td className="px-2 py-2 tabular-nums">{money(totals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
