/**
 * وحدة الأوزان — المحطة التحويلية:
 *  · نموذج إدخال سجل وزن (مطابق لدفتر الشفت الورقي): DB · السائق · الصنف · الكلي · الفارغ · الوقت
 *  · الصافي يُحسب آلياً = الكلي − الفارغ
 *  · قائمة سجلات التاريخ/الشفت المختار
 *  · تصدير: Excel · PDF (طباعة) · إرسال إلى غرفة العمليات للتدقيق
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  useWeightList,
  useCreateWeight,
  useSendToOps,
} from '@features/transfer-station'
import type { Shift } from '@features/transfer-station/types'
import { weightRecordSchema, type WeightFormInput } from '@features/transfer-station/schemas/weight.schema'
import { toExcel, printPdf, netOf, sheetTitle } from '@features/transfer-station/lib/export'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm = (): WeightFormInput => ({
  db_number: '',
  driver_name: '',
  vehicle_type: '',
  gross_weight: '',
  tare_weight: '',
  entry_time: '',
  log_date: todayISO(),
  shift: 'morning',
})

export default function WeightsPage() {
  const [form, setForm] = useState<WeightFormInput>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [filterDate, setFilterDate] = useState(todayISO())
  const [filterShift, setFilterShift] = useState<Shift>('morning')
  const [exportOpen, setExportOpen] = useState(false)

  const list = useWeightList({ date: filterDate, shift: filterShift })
  const create = useCreateWeight()
  const sendOps = useSendToOps()

  const records = list.data ?? []

  const netPreview = useMemo(() => {
    const g = Number(form.gross_weight)
    const t = Number(form.tare_weight)
    if (form.gross_weight !== '' && form.tare_weight !== '' && g >= t) return (g - t).toFixed(2)
    return null
  }, [form.gross_weight, form.tare_weight])

  const set = (key: keyof WeightFormInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ): void => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((er) => ({ ...er, [key]: '' }))
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const parsed = weightRecordSchema.safeParse(form)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key && !fieldErrors[key as string]) fieldErrors[key as string] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    const v = parsed.data
    create.mutate(
      {
        db_number: v.db_number.trim(),
        driver_name: v.driver_name.trim(),
        vehicle_type: v.vehicle_type?.trim() || null,
        gross_weight: v.gross_weight === '' || v.gross_weight == null ? null : Number(v.gross_weight),
        tare_weight: v.tare_weight === '' || v.tare_weight == null ? null : Number(v.tare_weight),
        entry_time: v.entry_time || null,
        log_date: v.log_date,
        shift: v.shift,
      },
      {
        onSuccess: () => {
          // يبقى التاريخ/الشفت لتسهيل الإدخال المتتالي، ويُمسح باقي الحقول
          setForm((f) => ({ ...emptyForm(), log_date: f.log_date, shift: f.shift }))
        },
      },
    )
  }

  const handleExportExcel = async (): Promise<void> => {
    await toExcel(records, filterDate, filterShift)
    setExportOpen(false)
  }
  const handleExportPdf = (): void => {
    printPdf(records, filterDate, filterShift)
    setExportOpen(false)
  }
  const handleSendOps = (): void => {
    sendOps.mutate({ date: filterDate, shift: filterShift }, { onSettled: () => setExportOpen(false) })
  }

  const inputBase =
    'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

  return (
    <div className="space-y-5" data-testid="weights-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">سجل الأوزان</h1>
          <p className="text-sm text-slate-500">دفتر أوزان الشفت — مطابق للسجل الورقي</p>
        </div>
      </div>

      {/* ── فلاتر التاريخ/الشفت + التصدير ── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          التاريخ
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className={inputBase}
            data-testid="filter-date"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          الشفت
          <select
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value as Shift)}
            className={inputBase}
            data-testid="filter-shift"
          >
            <option value="morning">الصباحي</option>
            <option value="evening">المسائي</option>
          </select>
        </label>

        <div className="relative ms-auto">
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            data-testid="export-menu-btn"
            className="flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
          >
            <Icon name="download" size={16} />
            تصدير
          </button>
          {exportOpen && (
            <div
              data-testid="export-menu"
              className="absolute end-0 top-12 z-30 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            >
              <ExportItem icon="file-spreadsheet" label="تصدير إلى ملف Excel" onClick={() => void handleExportExcel()} testId="export-excel" />
              <ExportItem icon="printer" label="تصدير إلى ملف PDF" onClick={handleExportPdf} testId="export-pdf" />
              <div className="border-t border-slate-100" />
              <ExportItem icon="send" label="إرسال إلى غرفة العمليات (تدقيق)" onClick={handleSendOps} testId="export-ops" highlight />
            </div>
          )}
        </div>
      </div>

      {/* ── نموذج الإدخال ── */}
      <form
        onSubmit={handleSubmit}
        data-testid="weight-form"
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <Icon name="scale" size={16} className="text-brand-600" />
          إدخال سجل جديد
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="DB (رقم الآلية)" error={errors.db_number} required>
            <input value={form.db_number} onChange={set('db_number')} data-testid="f-db"
              className={clsx(inputBase, errors.db_number && 'border-red-400')} placeholder="مثال: 12345" />
          </Field>
          <Field label="اسم السائق" error={errors.driver_name} required>
            <input value={form.driver_name} onChange={set('driver_name')} data-testid="f-driver"
              className={clsx(inputBase, errors.driver_name && 'border-red-400')} placeholder="اسم السائق" />
          </Field>
          <Field label="صنف الآلية" error={errors.vehicle_type}>
            <input value={form.vehicle_type ?? ''} onChange={set('vehicle_type')} data-testid="f-type"
              className={inputBase} placeholder="نوع الآلية" />
          </Field>
          <Field label="وقت الدخول" error={errors.entry_time}>
            <input type="time" value={form.entry_time ?? ''} onChange={set('entry_time')} data-testid="f-time"
              className={clsx(inputBase, 'dir-ltr text-center')} />
          </Field>
          <Field label="الوزن الكلي (طن)" error={errors.gross_weight}>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={form.gross_weight ?? ''}
              onChange={set('gross_weight')} data-testid="f-gross"
              className={clsx(inputBase, 'dir-ltr')} placeholder="0.00" />
          </Field>
          <Field label="الوزن الفارغ (طن)" error={errors.tare_weight}>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={form.tare_weight ?? ''}
              onChange={set('tare_weight')} data-testid="f-tare"
              className={clsx(inputBase, 'dir-ltr', errors.tare_weight && 'border-red-400')} placeholder="0.00" />
          </Field>
          <Field label="الوزن الصافي (طن)" hint="يُحسب آلياً">
            <div className="flex h-11 items-center rounded-xl border border-dashed border-brand-200 bg-brand-50/60 px-3 text-sm font-bold text-brand-700 dir-ltr">
              {netPreview ?? '—'}
            </div>
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={create.isPending}
              data-testid="weight-submit"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {create.isPending ? <LoadingSpinner label="" /> : <Icon name="check-square" size={16} />}
              حفظ السجل
            </button>
          </div>
        </div>
      </form>

      {/* ── جدول سجلات الدفتر ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-700">
            {sheetTitle(filterDate, filterShift)}
          </h2>
          <span className="text-xs text-slate-400">{records.length} سجل</span>
        </div>

        {list.isLoading ? (
          <div className="p-8"><LoadingSpinner label="جارٍ جلب السجلات…" /></div>
        ) : records.length === 0 ? (
          <div className="p-4">
            <EmptyState title="لا توجد سجلات في هذا الدفتر" hint="أضِف سجلاً من النموذج أعلاه" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm sm:min-w-[760px]" data-testid="weights-table">
              <thead>
                <tr className="bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">ت</th>
                  <th className="px-3 py-2.5 font-semibold">DB</th>
                  <th className="px-3 py-2.5 font-semibold">اسم السائق</th>
                  <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">صنف الآلية</th>
                  <th className="px-3 py-2.5 font-semibold">الكلي</th>
                  <th className="px-3 py-2.5 font-semibold">الفارغ</th>
                  <th className="px-3 py-2.5 font-semibold">الصافي</th>
                  <th className="hidden px-3 py-2.5 font-semibold md:table-cell">وقت الدخول</th>
                  <th className="px-3 py-2.5 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium dir-ltr">{r.db_number}</td>
                    <td className="px-3 py-2.5">{r.driver_name}</td>
                    <td className="hidden px-3 py-2.5 text-slate-500 sm:table-cell">{r.vehicle_type ?? '—'}</td>
                    <td className="px-3 py-2.5 dir-ltr">{r.gross_weight ?? '—'}</td>
                    <td className="px-3 py-2.5 dir-ltr">{r.tare_weight ?? '—'}</td>
                    <td className="px-3 py-2.5 font-bold text-brand-700 dir-ltr">{netOf(r) ?? '—'}</td>
                    <td className="hidden px-3 py-2.5 text-slate-500 dir-ltr md:table-cell">{r.entry_time ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {r.status === 'submitted_to_ops' ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          أُرسل للتدقيق
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          مسودة
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label, error, hint, required, children,
}: {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      <span>
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="font-normal text-slate-400"> ({hint})</span>}
      </span>
      {children}
      {error && <span className="text-[11px] font-normal text-red-600">{error}</span>}
    </label>
  )
}

function ExportItem({
  icon, label, onClick, testId, highlight,
}: {
  icon: Parameters<typeof Icon>[0]['name']
  label: string
  onClick: () => void
  testId: string
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={clsx(
        'flex min-h-11 w-full items-center gap-3 px-4 text-start text-sm font-medium transition-colors',
        highlight ? 'text-brand-700 hover:bg-brand-50' : 'text-slate-700 hover:bg-slate-50',
      )}
    >
      <Icon name={icon} size={16} />
      {label}
    </button>
  )
}
