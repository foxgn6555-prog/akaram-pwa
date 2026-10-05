/**
 * تصحيح بيانات حالة صيانة مكتملة — حصراً من غرفة العمليات (00150)، نفس نمط تصحيح الوزن:
 * سبب إلزامي، تدقيق قبل/بعد، إبلاغ الصيانة. كلفة القطع تبقى محسوبة من القطع المصروفة.
 */
import { useState } from 'react'
import { Wrench, X } from 'lucide-react'
import { useCorrectMaintenanceCase } from '@features/vehicle-operations/hooks'

export interface MaintenanceCorrectionTarget {
  caseId: string
  dbNumber: string
  faultType: string
  priority: 'normal' | 'urgent' | 'critical'
  diagnosis: string | null
  workNotes: string | null
  partsNotes: string | null
  assignedTechnician: string | null
  estimatedCost: number | null
  serviceCost: number | null
  partsActualCost: number | null
}

const priorities = { normal: 'عادية', urgent: 'عاجلة', critical: 'حرجة' } as const
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

export function MaintenanceCorrectionDialog({ target, onClose }: { target: MaintenanceCorrectionTarget; onClose: () => void }) {
  const correct = useCorrectMaintenanceCase()
  const [form, setForm] = useState({
    faultType: target.faultType,
    priority: target.priority,
    diagnosis: target.diagnosis ?? '',
    workNotes: target.workNotes ?? '',
    partsNotes: target.partsNotes ?? '',
    assignedTechnician: target.assignedTechnician ?? '',
    estimatedCost: target.estimatedCost?.toString() ?? '',
    serviceCost: target.serviceCost?.toString() ?? '',
    reason: '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const changes = {
    faultType: form.faultType.trim() !== target.faultType ? form.faultType.trim() : null,
    priority: form.priority !== target.priority ? form.priority : null,
    diagnosis: form.diagnosis.trim() !== (target.diagnosis ?? '') ? form.diagnosis.trim() : null,
    workNotes: form.workNotes.trim() !== (target.workNotes ?? '') ? form.workNotes.trim() : null,
    partsNotes: form.partsNotes.trim() !== (target.partsNotes ?? '') ? form.partsNotes.trim() : null,
    assignedTechnician: form.assignedTechnician.trim() !== (target.assignedTechnician ?? '') ? form.assignedTechnician.trim() : null,
    estimatedCost: numOrNull(form.estimatedCost) !== target.estimatedCost ? numOrNull(form.estimatedCost) : null,
    serviceCost: numOrNull(form.serviceCost) !== target.serviceCost ? numOrNull(form.serviceCost) : null,
  }
  const changed = Object.values(changes).some((v) => v !== null && v !== '')
  const projectedActual = (numOrNull(form.serviceCost) ?? target.serviceCost ?? 0) + (target.partsActualCost ?? 0)

  const submit = () => {
    if (!changed) return setError('لا يوجد تغيير عن البيانات المسجلة')
    if (form.faultType.trim().length < 2) return setError('نوع العطل مطلوب')
    const est = numOrNull(form.estimatedCost), svc = numOrNull(form.serviceCost)
    if ((est !== null && (!Number.isFinite(est) || est < 0)) || (svc !== null && (!Number.isFinite(svc) || svc < 0))) return setError('الكلفة يجب أن تكون رقماً غير سالب')
    if (form.reason.trim().length < 3) return setError('سبب التصحيح إلزامي (3 أحرف على الأقل)')
    setError(null)
    correct.mutate(
      { caseId: target.caseId, reason: form.reason.trim(), ...changes },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="maintenance-correction-dialog">
      <div className="mx-auto my-6 w-full max-w-2xl space-y-4 rounded-3xl bg-white p-5 shadow-2xl md:p-6" dir="rtl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <b className="flex items-center gap-2 text-base text-slate-900">
              <Wrench size={18} className="text-violet-700" /> تصحيح بيانات حالة صيانة — DB {target.dbNumber}
            </b>
            <p className="mt-1 text-xs leading-6 text-slate-500">حالة مكتملة · التعديل يُسجَّل في التدقيق (قبل/بعد) ويُبلَّغ لقسم الصيانة.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-xl border p-2 text-slate-500 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs font-black text-slate-600">
            نوع العطل
            <input data-testid="mc-fault" value={form.faultType} onChange={set('faultType')} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm" />
          </label>
          <label className="text-xs font-black text-slate-600">
            الأولوية
            <select data-testid="mc-priority" value={form.priority} onChange={set('priority')} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm">
              {(Object.keys(priorities) as (keyof typeof priorities)[]).map((p) => (
                <option key={p} value={p}>
                  {priorities[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-slate-600">
            الفني المسؤول
            <input data-testid="mc-technician" value={form.assignedTechnician} onChange={set('assignedTechnician')} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm" />
          </label>
          <label className="text-xs font-black text-slate-600">
            الكلفة التقديرية
            <input data-testid="mc-estimated" type="number" min={0} step="0.01" value={form.estimatedCost} onChange={set('estimatedCost')} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm" />
          </label>
          <label className="text-xs font-black text-slate-600">
            كلفة الخدمة (بلا قطع)
            <input data-testid="mc-service" type="number" min={0} step="0.01" value={form.serviceCost} onChange={set('serviceCost')} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm" />
            <span className="mt-1 block text-[10px] font-bold text-slate-400" data-testid="mc-projected">
              الكلفة الفعلية بعد التصحيح = {projectedActual.toLocaleString('ar-IQ-u-nu-latn')} (خدمة + قطع {(target.partsActualCost ?? 0).toLocaleString('ar-IQ-u-nu-latn')})
            </span>
          </label>
          <label className="text-xs font-black text-slate-600 md:col-span-2">
            التشخيص
            <textarea data-testid="mc-diagnosis" rows={2} value={form.diagnosis} onChange={set('diagnosis')} className="mt-1 w-full rounded-xl border p-3 text-sm" />
          </label>
          <label className="text-xs font-black text-slate-600">
            ملاحظات العمل
            <textarea data-testid="mc-work" rows={2} value={form.workNotes} onChange={set('workNotes')} className="mt-1 w-full rounded-xl border p-3 text-sm" />
          </label>
          <label className="text-xs font-black text-slate-600">
            ملاحظات القطع
            <textarea data-testid="mc-parts" rows={2} value={form.partsNotes} onChange={set('partsNotes')} className="mt-1 w-full rounded-xl border p-3 text-sm" />
          </label>
          <label className="text-xs font-black text-slate-600 md:col-span-2">
            سبب التصحيح (إلزامي)
            <textarea data-testid="mc-reason" rows={2} value={form.reason} onChange={set('reason')} className="mt-1 w-full rounded-xl border border-violet-300 p-3 text-sm outline-none focus:border-violet-600" placeholder="مثال: فاتورة الورشة النهائية اختلفت عن المسجل" />
          </label>
        </div>
        {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-black text-red-700" data-testid="mc-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-xs font-black">
            إلغاء
          </button>
          <button type="button" data-testid="mc-submit" onClick={submit} disabled={correct.isPending} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
            {correct.isPending ? 'جارٍ الحفظ…' : 'حفظ التصحيح'}
          </button>
        </div>
      </div>
    </div>
  )
}
