/**
 * عطل آلية — تسجيل بلاغ عطل برقم DB ونوع العطل.
 * البلاغات تُحفظ وتنتقل للأرشيف (لا توجد جهة استلام بعد حالياً).
 */
import { useState } from 'react'
import clsx from 'clsx'
import { useVehicles, useBreakdowns, useSubmitBreakdown, useManagerProfile } from '@features/sector'
import { breakdownSchema, type BreakdownFormInput } from '@features/sector'
import { SHIFT_LABELS } from '@features/sector/types'
import { Icon } from '@components/ui/Icon/Icon'
import { EmptyState } from '@components/feedback/EmptyState'

const inputBase =
  'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

const QUICK_FAULTS = ['عطل ميكانيكي', 'عطل كهربائي', 'عطل هيدروليك', 'إطار/كوشوك', 'وقود/زيوت', 'حادث', 'أخرى']

export default function BreakdownPage() {
  const vehicles = useVehicles(true)
  const breakdowns = useBreakdowns('active')
  const submit = useSubmitBreakdown()
  const profile = useManagerProfile()

  const dbList = vehicles.data ?? []

  const [form, setForm] = useState<BreakdownFormInput>({ db_number: '', fault_type: '', notes: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (k: keyof BreakdownFormInput, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const parsed = breakdownSchema.safeParse(form)
    if (!parsed.success) {
      const er: Record<string, string> = {}
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? '')
        if (k && !er[k]) er[k] = i.message
      }
      setErrors(er)
      return
    }
    submit.mutate(
      {
        db_number: parsed.data.db_number.trim(),
        fault_type: parsed.data.fault_type.trim(),
        notes: parsed.data.notes?.trim() || null,
      },
      { onSuccess: () => setForm({ db_number: '', fault_type: '', notes: '' }) },
    )
  }

  const list = breakdowns.data ?? []

  return (
    <div className="space-y-5" data-testid="breakdown-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">عطل آلية</h1>
        <p className="text-sm text-slate-500">
          بلاغ عطل عن آلية برقم DB — يُحفظ في الأرشيف. شفتك: {profile.data ? SHIFT_LABELS[profile.data.shift] : '—'}
        </p>
      </div>

      <form onSubmit={onSubmit} data-testid="breakdown-form"
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">
            رقم DB للآلية المعطّلة <span className="text-red-500">*</span>
            <input
              value={form.db_number}
              list="db-list"
              onChange={(e) => set('db_number', e.target.value)}
              placeholder={dbList.length > 0 ? 'اختر من آلياتي أو اكتب رقم DB' : 'اكتب رقم DB'}
              dir="ltr"
              className={clsx(inputBase, 'mt-1 text-end', errors.db_number && 'border-red-400')}
              data-testid="f-bd-db"
            />
            <datalist id="db-list">
              {dbList.map((v) => (
                <option key={v.id} value={v.db_number}>
                  {v.vehicle_type ? `${v.vehicle_type}` : v.db_number}
                </option>
              ))}
            </datalist>
            {errors.db_number && <span className="mt-1 block text-[11px] text-red-600">{errors.db_number}</span>}
          </label>

          <label className="block text-xs font-medium text-slate-600">
            نوع العطل <span className="text-red-500">*</span>
            <input value={form.fault_type} onChange={(e) => set('fault_type', e.target.value)}
              placeholder="مثال: تعطل المكبس الهيدروليكي"
              list="fault-list"
              className={clsx(inputBase, 'mt-1 h-auto py-2.5', errors.fault_type && 'border-red-400')}
              data-testid="f-bd-fault" />
            <datalist id="fault-list">
              {QUICK_FAULTS.map((f) => <option key={f} value={f} />)}
            </datalist>
            {errors.fault_type && <span className="mt-1 block text-[11px] text-red-600">{errors.fault_type}</span>}
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_FAULTS.map((q) => (
            <button key={q} type="button" onClick={() => set('fault_type', q)}
              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700">
              {q}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-slate-600">
          ملاحظات (اختياري)
          <textarea rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-brand-500"
            data-testid="f-bd-notes" />
        </label>

        <button type="submit" disabled={submit.isPending} data-testid="bd-submit"
          className="flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-60">
          <Icon name="alert-triangle" size={16} /> {submit.isPending ? 'جارٍ التسجيل…' : 'تسجيل بلاغ العطل'}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">بلاغات العطل المسجّلة</h2>
        {list.length === 0 ? (
          <EmptyState title="لا توجد بلاغات" hint="سجّل أول بلاغ عطل من النموذج" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="bd-list">
              <thead>
                <tr className="bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">DB</th>
                  <th className="px-3 py-2.5 font-semibold">نوع العطل</th>
                  <th className="px-3 py-2.5 font-semibold">الحالة</th>
                  <th className="px-3 py-2.5 font-semibold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className="border-t border-slate-50">
                    <td className="px-3 py-2.5 font-bold text-orange-700 dir-ltr">{b.db_number}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{b.fault_type}</div>
                      {b.notes && <div className="text-[11px] text-slate-500">{b.notes}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                        {b.status === 'logged' ? 'مسجّل' : b.status === 'resolved' ? 'تمت المعالجة' : 'مؤرشف'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{(b.created_at ?? '').slice(0, 10)}</td>
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
