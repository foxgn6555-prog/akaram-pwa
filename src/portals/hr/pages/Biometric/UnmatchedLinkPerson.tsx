import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { hrKeys } from '@lib/query-keys/hr.keys'
import { useHrEmployees } from '@features/hr'
import { useLinkBiometricPin } from '@features/integrations'
import { biometricErrorMessage } from '@sdk/biometric.sdk'

const input = 'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40'

/** يستخدم الربط الرسمي القائم نفسه، ولا يشترط وجود بصمة اليوم في الدفتر. */
export default function UnmatchedLinkPerson({ pin, personName, device, onClose }: { pin: string; personName: string | null; device: string; onClose: () => void }) {
  const [search, setSearch] = useState(personName ?? '')
  const [employeeId, setEmployeeId] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const qc = useQueryClient()
  const employees = useHrEmployees({ search: search.trim() || undefined, status: 'active' })
  const link = useLinkBiometricPin()
  const candidates = employees.data?.slice(0, 50) ?? []
  const selected = candidates.find(e => e.id === employeeId)
  const save = async () => {
    if (!selected || checking || link.isPending) return
    setChecking(true); setError('')
    try {
      // إعادة جلب الموظف قبل الربط حتى لا نعتمد على رقم قديم محفوظ في الواجهة.
      const fresh = await employees.refetch()
      if (fresh.isError) { setError('تعذر التحقق من بيانات الموظف؛ حاول مجدداً.'); return }
      const current = fresh.data?.find(e => e.id === selected.id)
      if (!current) { setError('الموظف لم يعد متاحاً. حدّث البحث واختره مجدداً.'); return }
      if (current.biometric_pin && current.biometric_pin !== pin && !window.confirm(`لدى الموظف رقم بصمة ${current.biometric_pin}. ربط الرقم ${pin} سيستبدله. هل تريد المتابعة؟`)) return
      link.mutate({ pin, employeeId: current.id }, {
        onSuccess: () => { void qc.invalidateQueries({ queryKey: ['unmatched-unit-report'] }); void qc.invalidateQueries({ queryKey: ['unmatched-archive-people'] }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'employees'] }); void qc.invalidateQueries({ queryKey: hrKeys.employee(current.id) }); onClose() },
        onError: e => setError(biometricErrorMessage(e)),
      })
    } catch { setError('تعذر التحقق من بيانات الموظف؛ حاول مجدداً.') }
    finally { setChecking(false) }
  }
  return <section className="space-y-3 rounded-xl border border-sky-200 bg-white p-4 shadow-sm" data-testid="unmatched-link-form">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">ربط بموظف · {personName || 'بلا اسم'} <span dir="ltr">{pin}</span></h2><button className={button} type="button" disabled={checking || link.isPending} onClick={onClose}>إغلاق</button></div>
    <p className="text-sm text-slate-600">الجهاز <span dir="ltr">{device}</span>. الربط الرسمي يشمل الرقم على جميع الأجهزة وينقل بصماته السابقة؛ تأكد من أن الرقم يخص الموظف نفسه.</p>
    <div className="grid items-end gap-3 sm:grid-cols-3"><label className="text-xs text-slate-600">البحث عن موظف<input className={input} value={search} disabled={checking || link.isPending} onChange={e => { setSearch(e.target.value); setEmployeeId('') }} data-testid="unmatched-link-search" /></label>
      <label className="text-xs text-slate-600">الموظف<select className={input} value={employeeId} disabled={checking || link.isPending} onChange={e => setEmployeeId(e.target.value)} data-testid="unmatched-link-employee"><option value="">اختر الموظف</option>{candidates.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_number}){e.biometric_pin ? ` · رقم البصمة ${e.biometric_pin}` : ''}</option>)}</select></label>
      <button type="button" className={button} disabled={!selected || checking || link.isPending} onClick={() => void save()}>تأكيد الربط</button></div>
    {employees.isLoading && <p className="text-sm text-slate-500">جارٍ تحميل الموظفين…</p>}
    {employees.isError && <p role="alert" className="text-sm text-red-700">تعذر تحميل الموظفين.</p>}
    {!employees.isLoading && !employees.isError && !candidates.length && <p className="text-sm text-slate-500">لا يوجد موظف مطابق للبحث؛ جرّب جزءاً من الاسم أو امسح البحث.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>
}
