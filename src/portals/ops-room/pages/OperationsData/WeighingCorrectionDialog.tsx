/**
 * تصحيح بيانات وزن مكتمل — حصراً من غرفة العمليات (00149).
 * سبب إلزامي، تدقيق قبل/بعد، إعادة احتساب المخالفة، تحديث الدفتر، وإبلاغ المحطة.
 */
import { useState } from 'react'
import { AlertTriangle, Scale, X } from 'lucide-react'
import {
  DESTINATION_LABELS,
  kindRangeLabel,
  kindsForDestination,
  useCorrectWeighing,
  useVehicleKinds,
  weighingViolation,
  type WeighingDestination,
} from '@features/transfer-station'

export interface WeighingCorrectionTarget {
  visitLegId: string
  dbNumber: string
  driverName: string
  weightTons: number | null
  destination: WeighingDestination | null
  vehicleKind: string | null
}

export function WeighingCorrectionDialog({ target, onClose }: { target: WeighingCorrectionTarget; onClose: () => void }) {
  const { kinds } = useVehicleKinds(true)
  const correct = useCorrectWeighing()
  const [weight, setWeight] = useState(target.weightTons?.toString() ?? '')
  const [destination, setDestination] = useState<WeighingDestination>(target.destination ?? 'press')
  const [kind, setKind] = useState(target.vehicleKind ?? kindsForDestination(target.destination ?? 'press', kinds)[0]?.kind ?? '')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ weight?: string; reason?: string }>({})
  const weightValue = Number(weight)
  const hasWeight = weight.trim() !== '' && Number.isFinite(weightValue) && weightValue > 0 && weightValue < 100
  const preview = weighingViolation(kind, hasWeight ? weightValue : null, kinds)
  const options = kindsForDestination(destination, kinds)
  const changed = hasWeight && (weightValue !== target.weightTons || destination !== target.destination || kind !== target.vehicleKind)

  const submit = () => {
    const next: typeof errors = {}
    if (!hasWeight) next.weight = 'أدخل وزناً صحيحاً بين 0.1 و99.9 طن'
    if (reason.trim().length < 3) next.reason = 'سبب التصحيح إلزامي (3 أحرف على الأقل)'
    setErrors(next)
    if (Object.keys(next).length) return
    correct.mutate(
      { visitLegId: target.visitLegId, weightTons: +weightValue.toFixed(2), destination, vehicleKind: kind, reason: reason.trim() },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="weighing-correction-dialog">
      <div className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-5 shadow-2xl md:p-6" dir="rtl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <b className="flex items-center gap-2 text-base text-slate-900">
              <Scale size={18} className="text-orange-600" /> تصحيح بيانات الوزن — DB {target.dbNumber}
            </b>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              السائق {target.driverName} · المسجل حالياً:{' '}
              <span className="font-black text-slate-700" data-testid="weighing-correction-current">
                {target.weightTons ?? '—'} طن
              </span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-xl border p-2 text-slate-500 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>
        <label className="block text-xs font-black text-slate-600">
          الوزن الصافي (طن)
          <input
            data-testid="weighing-correction-weight"
            type="number"
            min={0.1}
            max={99.9}
            step={0.1}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold"
          />
          {errors.weight && <span className="mt-1 block text-[11px] text-rose-600">{errors.weight}</span>}
        </label>
        <fieldset>
          <legend className="text-xs font-black text-slate-600">الوجهة</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(DESTINATION_LABELS) as WeighingDestination[]).map((dest) => (
              <label
                key={dest}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-black ${destination === dest ? 'border-orange-600 bg-orange-50 text-orange-800' : 'text-slate-600'}`}
              >
                <input
                  type="radio"
                  name="weighing-correction-destination"
                  data-testid={`weighing-correction-dest-${dest}`}
                  checked={destination === dest}
                  onChange={() => {
                    setDestination(dest)
                    const next = kindsForDestination(dest, kinds)
                    if (!next.some((k) => k.kind === kind)) setKind(next[0]?.kind ?? '')
                  }}
                  className="sr-only"
                />
                {DESTINATION_LABELS[dest]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-xs font-black text-slate-600">
          نوع الآلية
          <select data-testid="weighing-correction-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold">
            {options.map((entry) => (
              <option key={entry.kind} value={entry.kind}>
                {entry.label} — {kindRangeLabel(entry)}
              </option>
            ))}
          </select>
        </label>
        {preview.violates ? (
          <p data-testid="weighing-correction-violation" className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-black text-red-700">
            <AlertTriangle size={15} /> بعد التصحيح: الوزن أقل من الحد الأدنى ({preview.minTons} طن) ⇒ ستُسجَّل/تُحدَّث مخالفة (فرق {preview.deficit} طن).
          </p>
        ) : (
          hasWeight && (
            <p data-testid="weighing-correction-ok" className="rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
              بعد التصحيح: الوزن ضمن المسموح — تُرفع أي مخالفة سابقة لهذه الزيارة.
            </p>
          )
        )}
        <label className="block text-xs font-black text-slate-600">
          سبب التصحيح (إلزامي — يُحفظ في سجل التدقيق ويُبلَّغ للمحطة)
          <textarea
            data-testid="weighing-correction-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border p-3 text-sm outline-none focus:border-orange-600"
            placeholder="مثال: خطأ إدخال — الميزان أظهر 6.5 طن"
          />
          {errors.reason && <span className="mt-1 block text-[11px] text-rose-600">{errors.reason}</span>}
        </label>
        {correct.error && <p className="rounded-xl bg-red-50 p-3 text-xs font-black text-red-700">{(correct.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-xs font-black">
            إلغاء
          </button>
          <button
            type="button"
            data-testid="weighing-correction-submit"
            onClick={submit}
            disabled={correct.isPending || !changed}
            title={!changed ? 'لا يوجد تغيير عن البيانات المسجلة' : undefined}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
          >
            {correct.isPending ? 'جارٍ الحفظ…' : 'حفظ التصحيح'}
          </button>
        </div>
      </div>
    </div>
  )
}
