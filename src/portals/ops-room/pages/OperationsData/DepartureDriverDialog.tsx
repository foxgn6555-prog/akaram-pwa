/**
 * تغيير سائق انطلاقية معيّنة — حصراً من غرفة العمليات.
 * يستدعي ops_set_departure_driver (يتطلب سبباً، ويرفض الرحلات الأقدم من النافذة المسموحة) ويُسجَّل في audit_logs بعملية SET_DRIVER.
 * الرحلة التاريخية تحتفظ باسم السائق الجديد وهويته الوظيفية معاً حتى تتطابق تقارير البصمة مع الواقع.
 */
import { useState } from 'react'
import { UserCog, X } from 'lucide-react'
import { DriverPicker } from '@portals/central-garage/components/DriverPicker'
import { useSetDepartureDriver } from '@features/central-garage/hooks'

export interface DepartureDriverTarget {
  departureId: string
  vehicleLabel: string
  currentDriver: string | null
}

export function DepartureDriverDialog({
  target,
  onClose,
}: {
  target: DepartureDriverTarget
  onClose: () => void
}) {
  const [driverEmployeeId, setDriverEmployeeId] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ driver?: string; reason?: string }>({})
  const mutation = useSetDepartureDriver()

  const submit = () => {
    const next: typeof errors = {}
    if (!driverEmployeeId) next.driver = 'اختر السائق من قائمة الموظفين'
    if (reason.trim().length < 3) next.reason = 'سبب التغيير مطلوب (3 أحرف على الأقل)'
    setErrors(next)
    if (Object.keys(next).length) return
    mutation.mutate(
      { departureId: target.departureId, driverEmployeeId, reason: reason.trim() },
      { onSuccess: onClose },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"
      data-testid="departure-driver-dialog"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <b className="flex items-center gap-2 text-base text-slate-900">
              <UserCog size={18} className="text-cyan-700" /> تغيير سائق الانطلاقية
            </b>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              {target.vehicleLabel} · السائق المسجل حالياً:{' '}
              <span className="font-black text-slate-700" data-testid="departure-driver-current">
                {target.currentDriver ?? '—'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-xl border p-2 text-slate-500 hover:bg-slate-50"
          >
            <X size={16} />
          </button>
        </div>
        <DriverPicker
          value={driverEmployeeId}
          onChange={(id) => setDriverEmployeeId(id)}
          testId="departure-driver"
          error={errors.driver}
        />
        <label className="block space-y-1.5 text-xs font-bold text-slate-600">
          <span>سبب التغيير (إلزامي — يُحفظ في سجل التدقيق)</span>
          <textarea
            data-testid="departure-driver-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            placeholder="مثال: السائق الفعلي مختلف عن المسجل حسب البصمة"
          />
          {errors.reason && <span className="block text-[11px] text-rose-600">{errors.reason}</span>}
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-xs font-black">
            إلغاء
          </button>
          <button
            type="button"
            data-testid="departure-driver-submit"
            onClick={submit}
            disabled={mutation.isPending}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
          >
            {mutation.isPending ? 'جارٍ الحفظ…' : 'حفظ التغيير'}
          </button>
        </div>
      </div>
    </div>
  )
}
