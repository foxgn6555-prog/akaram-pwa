import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@components/ui'
import { useHrPolicy } from '@features/hr'
import { hrKeys } from '@lib/query-keys/hr.keys'
import { field } from '@portals/hr/components/hr-format'
import { hr, hrErrorMessage } from '@sdk/hr.sdk'

type Draft = { threshold: string; amount: string }

/** إعداد مستقل لا ينشئ كشفاً ولا يخصم من الراتب. */
export function MissingPunchSettingsCard() {
  const policy = useHrPolicy()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: (v: { threshold: number; amount: number }) => hr.setMissingPunchSettings(v.threshold, v.amount),
    onSuccess: (p) => {
      qc.setQueryData(hrKeys.policy(), p)
      void qc.invalidateQueries({ queryKey: hrKeys.all })
      setDraft(null)
      setSaved(true)
    },
  })
  if (policy.isLoading) return <section className="rounded-2xl border p-4 text-xs">جارٍ تحميل إعداد البصمات الناقصة…</section>
  if (!policy.data) return <section className="rounded-2xl border p-4 text-xs text-rose-700">تعذر تحميل إعداد البصمات الناقصة. أعد فتح الصفحة.</section>
  const current: Draft = {
    threshold: policy.data.missing_punch_threshold?.toString() ?? '',
    amount: policy.data.missing_punch_fixed_amount?.toString() ?? '',
  }
  const v = draft ?? current
  const threshold = Number(v.threshold)
  const amount = Number(v.amount)
  const valid = /^\d+$/.test(v.threshold) && threshold >= 1 && threshold <= 31
    && /^\d+(?:\.\d{1,2})?$/.test(v.amount) && amount <= 999999999999.99
  const dirty = v.threshold !== current.threshold || v.amount !== current.amount
  const change = (patch: Partial<Draft>) => { setDraft({ ...v, ...patch }); setSaved(false) }
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm" data-testid="missing-punch-settings">
      <h2 className="text-sm font-black">إعداد كشف البصمات الناقصة</h2>
      <p className="mt-1 text-xs text-slate-700">حدّ شهري ومبلغ ثابت لكل بلوغ للحد. مثال: إذا كان الحد 3، يتكرر المبلغ عند 3 و6 و9 بصمات ناقصة.</p>
      <p className="mt-1 text-xs font-bold text-amber-800">هذه الجولة تحفظ الإعداد فقط؛ الكشف والاحتساب واعتماد المعاون وربطه بالراتب لم تُفعّل بعد.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">الحد الشهري (عدد البصمات)
          <input className={field} type="number" min="1" max="31" step="1" dir="ltr" value={v.threshold} onChange={(e) => change({ threshold: e.target.value })} data-testid="missing-punch-threshold" />
        </label>
        <label className="text-xs font-bold">المبلغ الثابت لكل بلوغ (د.ع)
          <input className={field} type="number" min="0" max="999999999999.99" step="0.01" dir="ltr" value={v.amount} onChange={(e) => change({ amount: e.target.value })} data-testid="missing-punch-amount" />
        </label>
      </div>
      {!valid && <p className="mt-2 text-xs text-slate-600">أدخل حداً صحيحاً من 1 إلى 31 ومبلغاً غير سالب بمنزلتين عشريتين كحد أقصى.</p>}
      {save.isError && <p role="alert" className="mt-2 text-xs text-rose-700">تعذر حفظ الإعداد: {hrErrorMessage(save.error)}</p>}
      {saved && <p role="status" className="mt-2 text-xs text-green-700">حُفظ الإعداد. لم يُفعّل أي استقطاع.</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={!valid || !dirty || save.isPending} onClick={() => save.mutate({ threshold, amount })} data-testid="missing-punch-save">حفظ الإعداد</Button>
        {draft && <Button size="sm" variant="secondary" disabled={save.isPending} onClick={() => { setDraft(null); setSaved(false) }}>تراجع</Button>}
      </div>
    </section>
  )
}
