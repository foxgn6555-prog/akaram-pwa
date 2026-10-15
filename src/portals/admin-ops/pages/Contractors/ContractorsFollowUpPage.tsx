/**
 * بوابة مسؤول القاطع — متابعة المتعهدين والعمال (00261)
 * لكل متعهد في قواطعي: إثبات التواجد (الوقت/الموقع/الدقة/داخل النطاق/السيلفي/صورة العمال)، عدد المتعهد وعدد المتابعة،
 * وأكتب أنا «عدد القاطع» (يشمل المتعهد) — لليوم نفسه فقط ثم يُقفل؛ التصحيح من غرفة العمليات بسبب موثّق.
 * فلاتر: اليوم، المتعهد، القاطع الأم. سجل شهري لكل متعهد. لا بيانات مالية.
 */
import { useMemo, useState } from 'react'
import { Camera, ExternalLink, MapPin, Phone, Users, X } from 'lucide-react'
import { useSectorManagerMe, useSmContractorMonth, useSmContractors, useSmSetContractorHeadcount } from '@features/sector-manager/hooks'
import { useContractorPhotoUrl } from '@features/contractors/hooks'
import type { ParentSector, SmContractorRow } from '@sdk/sector-manager.sdk'
import { PARENT_AR, SHIFT_AR, timeAr, zoneLabel } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

const todayBaghdad = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())

export default function ContractorsFollowUpPage() {
  const me = useSectorManagerMe()
  const [date, setDate] = useState(todayBaghdad())
  const [parent, setParent] = useState<ParentSector | ''>('')
  const [contractor, setContractor] = useState('')
  const [monthFor, setMonthFor] = useState<SmContractorRow | null>(null)
  const all = useSmContractors(date, null, parent || null)
  const rows = useMemo(() => (all.data ?? []).filter((r) => !contractor || r.contractor_user_id === contractor), [all.data, contractor])
  const parents = me.data?.parent_sectors ?? []
  const counted = rows.filter((r) => r.my_headcount != null).length
  const proved = rows.filter((r) => r.checked_in).length
  return (
    <div className="space-y-4 pb-4" data-testid="sm-contractors">
      <ExecPageHeader icon="users" title="متابعة المتعهدين والعمال"
        subtitle="إثبات تواجد كل متعهد (موقع + صور) وأعداده: عدد المتعهد، عدد المتابعة، وعددك أنت «عدد القاطع» (يشمل المتعهد). التسجيل لليوم نفسه فقط ثم يُقفل؛ التصحيح لاحقاً من غرفة العمليات بسبب موثّق."
        stats={[
          { label: 'متعهدون', value: rows.length, tone: 'plain', testId: 'st-contractors' },
          { label: 'أثبتوا التواجد', value: `${proved}/${rows.length}`, tone: proved === rows.length ? 'green' : 'gold', testId: 'st-proved' },
          { label: 'سجّلت عددهم', value: `${counted}/${rows.length}`, tone: counted === rows.length ? 'green' : 'red', testId: 'st-counted' },
        ]} />
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <label className="text-xs font-bold text-slate-600">اليوم</label>
        <input type="date" value={date} max={todayBaghdad()} onChange={(e) => { setDate(e.target.value) }} className="rounded-xl border px-3 py-2 text-sm" data-testid="date-filter" />
        {parents.length > 1 && (
          <select value={parent} onChange={(e) => setParent(e.target.value as ParentSector | '')} className="rounded-xl border px-3 py-2 text-sm" data-testid="parent-filter">
            <option value="">كل قواطعي</option>
            {parents.map((p) => <option key={p} value={p}>{PARENT_AR[p] ?? p}</option>)}
          </select>
        )}
        <select value={contractor} onChange={(e) => setContractor(e.target.value)} className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" data-testid="contractor-filter">
          <option value="">كل المتعهدين</option>
          {(all.data ?? []).map((r) => <option key={r.contractor_user_id} value={r.contractor_user_id}>{r.contractor_name} — {r.area_name}</option>)}
        </select>
      </section>
      {all.isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا متعهدين" hint="لا متعهدين فعّالين في قواطعك بهذا الفلتر" /> : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="contractors-list">
          {rows.map((r) => <ContractorCard key={r.contractor_user_id} r={r} onMonth={() => setMonthFor(r)} />)}
        </ul>
      )}
      {monthFor && <MonthDrawer r={monthFor} onClose={() => setMonthFor(null)} />}
    </div>
  )
}

function Photo({ path, label, testId }: { path: string | null; label: string; testId: string }) {
  const url = useContractorPhotoUrl(path)
  const [open, setOpen] = useState(false)
  if (!path) return <div className="flex h-24 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-bold text-slate-400" data-testid={`${testId}-none`}>لا {label}</div>
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative block h-24 w-full overflow-hidden rounded-xl bg-slate-100" data-testid={testId} aria-label={`تكبير ${label}`}>
        {url.data ? <img src={url.data} alt={label} className="h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center text-[11px] text-slate-400">جارٍ التحميل…</span>}
        <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
      </button>
      {open && url.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label={label} onClick={() => setOpen(false)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white" aria-label="إغلاق" onClick={() => setOpen(false)}><X size={18} /></button>
          <img src={url.data} alt={label} className="max-h-[90vh] max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </>
  )
}

function ContractorCard({ r, onMonth }: { r: SmContractorRow; onMonth: () => void }) {
  const save = useSmSetContractorHeadcount()
  const [val, setVal] = useState(r.my_headcount != null ? String(r.my_headcount) : '')
  const n = Number(val)
  const valid = val !== '' && Number.isInteger(n) && n >= 1 && n <= 500
  const others = [r.contractor_headcount, r.follow_up_headcount].filter((x): x is number => x != null)
  const differs = r.my_headcount != null && others.some((x) => x !== r.my_headcount)
  return (
    <li className="rounded-2xl border bg-white p-4 shadow-sm" data-testid={`contractor-${r.contractor_user_id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-black">{r.contractor_name}</h3>
          <p className="text-xs text-slate-600">{r.area_name} · {PARENT_AR[r.parent_sector] ?? r.parent_sector}{r.shift ? ` · شفت ${SHIFT_AR[r.shift] ?? r.shift}` : ''}</p>
          <p className="text-[11px] text-slate-500">مسؤول القسم: {r.department_manager_name ?? '—'}{r.contractor_phone ? <> · <a href={`tel:${r.contractor_phone}`} className="inline-flex items-center gap-0.5 font-bold text-[var(--portal-color)]"><Phone size={10} />{r.contractor_phone}</a></> : null}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.checked_in ? (r.in_zone === false ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800') : 'bg-rose-50 text-rose-700'}`} data-testid="checkin-badge">
          {r.checked_in ? <><Camera size={11} className="inline" /> تواجد {timeAr(r.checkin_at)}</> : 'لم يُثبت التواجد'}
        </span>
      </div>
      {r.checked_in && (
        <div className="mt-2 space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700" data-testid="checkin-location">
            <span className={`inline-flex items-center gap-1 font-bold ${r.in_zone === false ? 'text-rose-700' : 'text-emerald-800'}`}><MapPin size={11} />{zoneLabel(r.in_zone)}</span>
            {r.accuracy_m != null && <span>دقة ±{Math.round(r.accuracy_m)} م</span>}
            {r.latitude != null && r.longitude != null && (
              <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-700 underline" data-testid="map-link"><ExternalLink size={10} />فتح الموقع في الخرائط</a>
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Photo path={r.selfie_path} label="صورة المتعهد" testId="photo-selfie" />
            <Photo path={r.team_photo_path} label="صورة العمال" testId="photo-team" />
          </div>
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Count label="عدد المتعهد" value={r.contractor_headcount} testId="contractor-headcount" />
        <Count label="عدد المتابعة" value={r.follow_up_headcount} testId="follow-up-headcount" />
        <Count label="عدد القاطع (أنا)" value={r.my_headcount} testId="my-headcount" tone={differs ? 'amber' : 'emerald'} note={differs ? 'يختلف عن الأعداد الأخرى' : undefined} />
      </div>
      {r.editable ? (
        <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate({ contractorUserId: r.contractor_user_id, headcount: n }) }}>
          <Users size={16} className="text-slate-500" />
          <input type="number" inputMode="numeric" min={1} max={500} value={val} onChange={(e) => setVal(e.target.value)} placeholder="العدد الذي شاهدته (يشمل المتعهد)" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" data-testid="headcount-input" />
          <button type="submit" disabled={!valid || save.isPending} className="rounded-xl bg-[var(--portal-color)] px-4 py-2 text-sm font-black text-white disabled:opacity-50" data-testid="headcount-save">{r.my_headcount != null ? 'تعديل' : 'حفظ'}</button>
        </form>
      ) : (
        <p className="mt-3 text-[11px] font-bold text-slate-500" data-testid="locked-note">مقفل — التسجيل متاح لليوم الحالي فقط؛ أي تصحيح من غرفة العمليات بسبب موثّق.</p>
      )}
      <button type="button" onClick={onMonth} className="mt-2 text-xs font-bold text-[var(--portal-color)] underline" data-testid="month-btn">سجل الشهر لهذا المتعهد</button>
    </li>
  )
}

function Count({ label, value, testId, tone = 'slate', note }: { label: string; value: number | null; testId: string; tone?: 'slate' | 'emerald' | 'amber'; note?: string }) {
  const tones = { slate: 'bg-slate-50', emerald: 'bg-emerald-50', amber: 'bg-amber-50' }
  return (
    <div className={`rounded-xl p-2 ${tones[tone]}`}>
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div className="text-xl font-black" data-testid={testId}>{value ?? '—'}</div>
      {value != null && <div className="text-[10px] text-slate-500">عمال: {Math.max(0, value - 1)}</div>}
      {note && <div className="text-[10px] font-bold text-amber-700">{note}</div>}
    </div>
  )
}

function MonthDrawer({ r, onClose }: { r: SmContractorRow; onClose: () => void }) {
  const [month, setMonth] = useState(todayBaghdad().slice(0, 7))
  const days = useSmContractorMonth(r.contractor_user_id, `${month}-01`)
  const sum = (k: 'contractor_headcount' | 'follow_up_headcount' | 'admin_ops_headcount') => (days.data ?? []).reduce((a, d) => a + (d[k] ?? 0), 0)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal="true" aria-label={`سجل شهر ${r.contractor_name}`} data-testid="month-drawer">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black">{r.contractor_name} · {r.area_name}</h3>
          <div className="flex items-center gap-2">
            <input type="month" value={month} max={todayBaghdad().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border px-2 py-1 text-sm" data-testid="month-input" />
            <button type="button" onClick={onClose} className="rounded-full border p-1.5" aria-label="إغلاق"><X size={16} /></button>
          </div>
        </div>
        {days.isLoading ? <LoadingSpinner /> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px]" data-testid="month-table">
              <thead><tr className="bg-slate-50 text-slate-600"><th className="px-2 py-1 text-right">اليوم</th><th className="px-2 py-1">التواجد</th><th className="px-2 py-1">النطاق</th><th className="px-2 py-1">المتعهد</th><th className="px-2 py-1">المتابعة</th><th className="px-2 py-1">القاطع</th></tr></thead>
              <tbody>
                {(days.data ?? []).map((d) => (
                  <tr key={d.log_date} className="border-t" data-testid={`day-${d.log_date}`}>
                    <td className="px-2 py-1 font-bold">{d.log_date}</td>
                    <td className="px-2 py-1 text-center">{d.checked_in ? <span className="font-bold text-emerald-700">✓ {timeAr(d.checkin_at)}</span> : <span className="text-rose-600">—</span>}</td>
                    <td className="px-2 py-1 text-center text-slate-600">{d.checked_in ? zoneLabel(d.in_zone) : '—'}</td>
                    <td className="px-2 py-1 text-center font-black">{d.contractor_headcount ?? '—'}</td>
                    <td className="px-2 py-1 text-center font-black">{d.follow_up_headcount ?? '—'}</td>
                    <td className="px-2 py-1 text-center font-black">{d.admin_ops_headcount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t bg-slate-50 font-black"><td className="px-2 py-1" colSpan={3}>المجموع</td><td className="px-2 py-1 text-center" data-testid="sum-contractor">{sum('contractor_headcount')}</td><td className="px-2 py-1 text-center" data-testid="sum-follow-up">{sum('follow_up_headcount')}</td><td className="px-2 py-1 text-center" data-testid="sum-admin-ops">{sum('admin_ops_headcount')}</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
