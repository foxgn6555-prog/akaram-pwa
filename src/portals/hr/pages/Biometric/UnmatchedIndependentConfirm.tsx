import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { biometric } from '@sdk/biometric.sdk'
import type { UnmatchedIndependentCandidate } from '@features/integrations/types'

const input = 'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40'
function message(e: unknown) {
  const s = e instanceof Error ? e.message : ''
  if (s.includes('BIO_LEDGER_BUSY')) return 'دفتر البصمة مشغول حالياً؛ حاول مرة أخرى بعد قليل.'
  if (s.includes('BIO_DEVICE_NOT_FOUND')) return 'الجهاز غير موجود. تحقق من الرقم التسلسلي.'
  if (s.includes('BIO_ARCHIVE_PERSON_NOT_FOUND')) return 'هذا الرقم غير موجود على الجهاز أو في بصماته المستلمة.'
  if (s.includes('BIO_PIN_NOT_LINKED')) return 'الرقم غير مرتبط بموظف؛ لا يحتاج إلى تأكيد التكرار.'
  if (s.includes('BIO_FORBIDDEN')) return 'لا تملك صلاحية التعديل أو تم سحبها.'
  return 'تعذر تنفيذ العملية؛ تحقق من البيانات وحاول مجدداً.'
}
export default function UnmatchedIndependentConfirm({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient()
  const [device, setDevice] = useState('')
  const [pin, setPin] = useState('')
  const [found, setFound] = useState<UnmatchedIndependentCandidate | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const find = async () => {
    setError(''); setFound(null); setDone(false); setBusy(true)
    try { setFound(await biometric.unmatchedIndependentCandidate(device.trim(), pin.trim())) }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!found || found.already_confirmed) return
    setError(''); setBusy(true)
    try {
      await biometric.unmatchedConfirmIndependent(found.device_serial, found.pin)
      await Promise.all([qc.invalidateQueries({ queryKey: ['unmatched-unit-report'] }), qc.invalidateQueries({ queryKey: ['unmatched-archive-people'] }), qc.invalidateQueries({ queryKey: ['unmatched-unit-devices'] })])
      setDone(true)
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <section className="space-y-4" data-testid="unit-independent-confirm"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">تأكيد شخص مستقل برقم مكرر</h2><button type="button" className={button} onClick={onBack}>العودة للتقرير</button></div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">استخدم هذا فقط إذا تأكدت أن صاحب الرقم على هذا الجهاز شخص آخر غير الموظف المرتبط به رسمياً. سيُحفظ سجل مستقل لهذا الجهاز والرقم، بينما يبقى الربط والحضور الرسمي كما هما.</p>
    <form className="grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); void find() }}>
      <label className="text-xs text-slate-600">الرقم التسلسلي للجهاز<input className={input} dir="ltr" value={device} onChange={e => { setDevice(e.target.value); setFound(null); setDone(false) }} data-testid="independent-device" /></label>
      <label className="text-xs text-slate-600">رقم البصمة PIN<input className={input} dir="ltr" value={pin} onChange={e => { setPin(e.target.value); setFound(null); setDone(false) }} data-testid="independent-pin" /></label>
      <button className={button} disabled={busy || !device.trim() || !pin.trim()} type="submit">معاينة الرقم</button>
    </form>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {found && <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" data-testid="independent-preview">
      <p className="text-sm">الجهاز: <strong>{found.device_name}</strong> · <span dir="ltr">{found.device_serial} / {found.pin}</span></p>
      <p className="text-sm">اسم الجهاز: <strong>{found.device_user_name || 'غير متوفر'}</strong></p>
      <p className="text-sm">الرقم مرتبط رسمياً بالموظف: <strong>{found.employee_name}</strong></p>
      <p className="text-sm">البصمات الموجودة لهذا الجهاز والرقم: <strong>{found.source_punch_count}</strong></p>
      <p className="text-sm leading-6 text-amber-800">سيُنسخ كل ما هو موجود لهذا الجهاز والرقم إلى السجل المستقل، وتُحفظ بصماته الجديدة فيه. تأكد أنه ليس الموظف نفسه؛ لن يتغير تسجيل الحضور الرسمي.</p>
      {done || found.already_confirmed ? <p className="font-bold text-emerald-700">تم تأكيد هذا الجهاز والرقم كشخص مستقل.</p> : <button type="button" className={button} disabled={busy} onClick={() => void confirm()}>تأكيد أنه شخص مختلف</button>}
    </div>}
  </section>
}
