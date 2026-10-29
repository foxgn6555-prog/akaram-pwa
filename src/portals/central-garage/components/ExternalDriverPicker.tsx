/**
 * 00375: سائق متعهد عند إضافة الآلية — اختيار من سجل سائقي المتعهدين (station_external_drivers)
 * مع إضافة سريعة لسائق جديد مرتبط بحساب متعهد موجود في النظام (لا نص حر).
 */
import { useState } from 'react'
import { Plus, UserCheck, X } from 'lucide-react'
import { useContractorOptions, useSaveExternalDriver, useStationExternalDrivers } from '@features/station-fleet/hooks'

const inputClass =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100'

export function ExternalDriverPicker({
  value, onChange, testId = 'vehicle-ext-driver', error,
}: { value: string; onChange: (id: string) => void; testId?: string; error?: string }) {
  const drivers = useStationExternalDrivers()
  const contractors = useContractorOptions()
  const save = useSaveExternalDriver()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ fullName: '', contractorUserId: '', phone: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const active = (drivers.data ?? []).filter((d) => d.active)
  const selected = active.find((d) => d.id === value) ?? null

  const quickAdd = () => {
    if (draft.fullName.trim().length < 2) return setFormError('اسم السائق مطلوب')
    if (!draft.contractorUserId) return setFormError('اختر المتعهد من حسابات المتعهدين في النظام')
    if (draft.phone.trim() && !/^[0-9+]{7,20}$/.test(draft.phone.trim())) return setFormError('رقم الهاتف: أرقام فقط (7–20)')
    setFormError(null)
    save.mutate(
      { id: null, fullName: draft.fullName.trim(), contractorUserId: draft.contractorUserId, phone: draft.phone.trim() || null, licenseNo: null, licenseImagePath: null, notes: null, active: true },
      { onSuccess: (d) => { onChange(d.id); setAdding(false); setDraft({ fullName: '', contractorUserId: '', phone: '' }) } },
    )
  }

  return (
    <div className="space-y-1.5 text-xs font-bold text-slate-600" data-testid={testId}>
      <span className="flex items-center justify-between">
        <span>سائق المتعهد</span>
        <button type="button" className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-200" onClick={() => { setAdding((v) => !v); setFormError(null) }} data-testid={`${testId}-add`}>
          {adding ? <><X size={12} /> إغلاق</> : <><Plus size={12} /> إضافة سائق متعهد</>}
        </button>
      </span>
      {selected ? (
        <div className="flex h-11 items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-3" data-testid={`${testId}-selected`}>
          <span className="flex items-center gap-2 text-sm font-black text-emerald-800"><UserCheck size={16} /> {selected.full_name} · {selected.contractor_name}</span>
          <button type="button" onClick={() => onChange('')} aria-label="تغيير السائق" data-testid={`${testId}-clear`} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"><X size={16} /></button>
        </div>
      ) : (
        <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} data-testid={`${testId}-select`}>
          <option value="">— اختر سائق المتعهد من السجل —</option>
          {active.map((d) => <option key={d.id} value={d.id}>{d.full_name} · {d.contractor_name}{d.vehicles?.length ? ` (DB ${d.vehicles.join('، ')})` : ''}</option>)}
        </select>
      )}
      {!drivers.isLoading && active.length === 0 && !adding && <p className="text-[11px] text-amber-700">لا سائقي متعهدين في السجل — أضف سائقاً مرتبطاً بحساب متعهد.</p>}
      {adding && (
        <div className="grid gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 md:grid-cols-3" data-testid={`${testId}-form`}>
          <label>الاسم الكامل<input className={inputClass} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} data-testid={`${testId}-name`} /></label>
          <label>المتعهد (حساب في النظام)
            <select className={inputClass} value={draft.contractorUserId} onChange={(e) => setDraft({ ...draft, contractorUserId: e.target.value })} data-testid={`${testId}-contractor`}>
              <option value="">— اختر المتعهد —</option>
              {(contractors.data ?? []).map((c) => <option key={c.user_id} value={c.user_id}>{c.full_name}{c.area_name ? ` · ${c.area_name}` : ''}</option>)}
            </select>
          </label>
          <label>الهاتف<input className={inputClass} dir="ltr" inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} data-testid={`${testId}-phone`} /></label>
          {contractors.data && contractors.data.length === 0 && <p className="text-[11px] text-amber-700 md:col-span-3">لا حسابات متعهدين نشطة — تُنشأ من بوابة تقنية المعلومات.</p>}
          {formError && <p className="text-xs text-rose-600 md:col-span-3" role="alert">{formError}</p>}
          <div className="md:col-span-3">
            <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50" onClick={quickAdd} disabled={save.isPending} data-testid={`${testId}-save`}>حفظ السائق واختياره</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-600" role="alert" data-testid={`${testId}-error`}>{error}</p>}
    </div>
  )
}
