/** بوابة المتابعة — متابعة العمال (00259): لكل متعهد في نطاقي: رقمه اليومي (يشمله) + أكتب رقمي أنا (قد يختلف). التعديل لليوم نفسه فقط. */
import { useMemo, useState } from 'react'
import { Camera, MapPin, Users } from 'lucide-react'
import { useFollowUpContractors, useFollowUpSetHeadcount } from '@features/follow-up/hooks'
import type { FollowUpContractorRow } from '@sdk/follow-up.sdk'
import { PARENT_AR, SHIFT_AR, timeAr, zoneLabel } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

const todayBaghdad = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())

export default function FollowUpWorkersPage() {
  const [date, setDate] = useState(todayBaghdad())
  const [parent, setParent] = useState<string>('all')
  const rows = useFollowUpContractors(date)
  const list = useMemo(() => (rows.data ?? []).filter((r) => parent === 'all' || r.parent_sector === parent), [rows.data, parent])
  const parents = useMemo(() => Array.from(new Set((rows.data ?? []).map((r) => r.parent_sector))), [rows.data])
  const counted = list.filter((r) => r.my_headcount != null).length
  return (
    <div className="space-y-4" data-testid="follow-up-workers">
      <ExecPageHeader icon="users" title="متابعة العمال" subtitle="لكل متعهد: العدد الذي سجّله هو (يشمله) — واكتب أنت العدد الذي شاهدته فعلاً (يشمل المتعهد). يُقبل التسجيل لليوم نفسه فقط ثم يُقفل؛ التصحيح لاحقاً من غرفة العمليات بسبب موثّق." />
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <label className="text-xs font-bold text-slate-600">اليوم</label>
        <input type="date" value={date} max={todayBaghdad()} onChange={(e) => setDate(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" data-testid="date-filter" />
        {parents.length > 1 && (
          <div className="flex gap-1" data-testid="parent-filter">
            {(['all', ...parents] as string[]).map((p) => (
              <button key={p} type="button" onClick={() => setParent(p)} className={`rounded-full px-3 py-1 text-xs font-bold ${parent === p ? 'bg-[var(--portal-color)] text-white' : 'border bg-white text-slate-700'}`}>{p === 'all' ? 'الكل' : PARENT_AR[p] ?? p}</button>
            ))}
          </div>
        )}
        <span className="ms-auto text-xs font-bold text-slate-600" data-testid="counted-summary">سجّلت {counted} من {list.length}</span>
      </section>
      {rows.isLoading ? <LoadingSpinner /> : !list.length ? <EmptyState title="لا متعهدين في نطاقك" hint="تأكد من تحديد نطاق متابعتك من التطوير المركزية" /> : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="contractors-list">
          {list.map((r) => <ContractorCard key={r.contractor_user_id} r={r} />)}
        </ul>
      )}
    </div>
  )
}

function ContractorCard({ r }: { r: FollowUpContractorRow }) {
  const save = useFollowUpSetHeadcount()
  const [val, setVal] = useState<string>(r.my_headcount != null ? String(r.my_headcount) : '')
  const n = Number(val)
  const valid = val !== '' && Number.isInteger(n) && n >= 1 && n <= 500
  const differs = r.my_headcount != null && r.contractor_headcount != null && r.my_headcount !== r.contractor_headcount
  return (
    <li className="rounded-2xl border bg-white p-4 shadow-sm" data-testid={`contractor-${r.contractor_user_id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-black">{r.contractor_name}</h3>
          <p className="text-xs text-slate-600">{r.area_name} · {PARENT_AR[r.parent_sector] ?? r.parent_sector}{r.shift ? ` · شفت ${SHIFT_AR[r.shift] ?? r.shift}` : ''}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.checked_in ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`} data-testid="checkin-badge">
          {r.checked_in ? <><Camera size={11} className="inline" /> تواجد {timeAr(r.checkin_at)}</> : 'لم يُثبت التواجد'}
        </span>
      </div>
      {r.checked_in && <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-600"><MapPin size={11} />{zoneLabel(r.in_zone)}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 p-2 text-center">
          <div className="text-[11px] font-bold text-slate-500">عدد المتعهد</div>
          <div className="text-xl font-black" data-testid="contractor-headcount">{r.contractor_headcount ?? '—'}</div>
          {r.contractor_headcount != null && <div className="text-[10px] text-slate-500">عمال: {Math.max(0, r.contractor_headcount - 1)}</div>}
        </div>
        <div className={`rounded-xl p-2 text-center ${differs ? 'bg-amber-50' : 'bg-emerald-50'}`}>
          <div className="text-[11px] font-bold text-slate-500">عددي</div>
          <div className="text-xl font-black" data-testid="my-headcount">{r.my_headcount ?? '—'}</div>
          {differs && <div className="text-[10px] font-bold text-amber-700">يختلف عن عدد المتعهد</div>}
        </div>
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
    </li>
  )
}
