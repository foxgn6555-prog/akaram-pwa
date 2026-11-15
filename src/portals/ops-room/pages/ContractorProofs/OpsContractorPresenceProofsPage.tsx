/**
 * غرفة العمليات — إثباتات تواجد المتعهدين (قراءة فقط).
 * يعرض ما سجّله المتعهد/الجهات الأخرى: الوقت، الموقع، الدقة، حالة الزون، السيلفي وصورة العمال، والأعداد الثلاثة.
 * لا تصحيح ولا اعتماد هنا — التصحيح/الاعتماد من وحدة «حضوريات العمال» بسبب موثّق.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Camera, ExternalLink, MapPin, Phone, X } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { useContractorPresenceProofs } from '@features/ops-contractor-headcounts/hooks'
import { useContractorPhotoUrl } from '@features/contractors/hooks'
import { ArchiveAwarePhoto } from '@features/cold-archive/ArchivedFile'
import { PARENT_AR, SHIFT_AR, timeAr, zoneLabel } from '@features/contractors/format'
import { useParentSectors } from '@features/sectors'
import type { ContractorPresenceProofRow } from '@sdk/ops-contractor-headcounts.sdk'
import { handleAppError } from '@lib/errors/error.handler'

const todayBaghdad = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export default function OpsContractorPresenceProofsPage() {
  const [date, setDate] = useState(todayBaghdad())
  const [parent, setParent] = useState('')
  const [contractor, setContractor] = useState('')
  const { parents } = useParentSectors()
  const all = useContractorPresenceProofs(date, parent || null)
  const rows = useMemo(() => (all.data ?? []).filter((r) => !contractor || r.contractor_user_id === contractor), [all.data, contractor])
  const proved = rows.filter((r) => r.checked_in).length
  const withPhotos = rows.filter((r) => r.checked_in && r.selfie_path && r.team_photo_path).length

  return (
    <div className="space-y-4 pb-4" data-testid="ops-contractor-proofs">
      <ExecPageHeader icon="camera" title="إثباتات تواجد المتعهدين"
        subtitle="عرض فقط لإثباتات التواجد كما سجّلتها الجهات: الوقت والموقع والدقة وحالة الزون والسيلفي وصورة العمال والأعداد. أي تصحيح أو اعتماد من وحدة حضوريات العمال بسبب موثّق."
        stats={[
          { label: 'متعهدون', value: rows.length, tone: 'plain', testId: 'proof-st-contractors' },
          { label: 'أثبتوا التواجد', value: `${proved}/${rows.length}`, tone: proved === rows.length && rows.length > 0 ? 'green' : 'gold', testId: 'proof-st-proved' },
          { label: 'صور كاملة', value: `${withPhotos}/${rows.length}`, tone: withPhotos === rows.length && rows.length > 0 ? 'green' : 'plain', testId: 'proof-st-photos' },
        ]}
        links={[{ to: '/ops-room/contractor-headcounts', label: 'حضوريات العمال والتصحيح', icon: 'users' }]}
      />

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <label className="text-xs font-bold text-slate-600" htmlFor="proof-date">اليوم</label>
        <input id="proof-date" type="date" value={date} max={todayBaghdad()} onChange={(e) => setDate(e.target.value || todayBaghdad())} className="rounded-xl border px-3 py-2 text-sm" data-testid="proof-date-filter" aria-label="تاريخ الإثبات" />
        <select value={parent} onChange={(e) => { setParent(e.target.value); setContractor('') }} className="rounded-xl border px-3 py-2 text-sm" data-testid="proof-parent-filter" aria-label="القاطع">
          <option value="">كل القواطع</option>
          {parents.map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}
        </select>
        <select value={contractor} onChange={(e) => setContractor(e.target.value)} className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" data-testid="proof-contractor-filter" aria-label="المتعهد">
          <option value="">كل المتعهدين</option>
          {(all.data ?? []).map((r) => <option key={r.contractor_user_id} value={r.contractor_user_id}>{r.contractor_name} — {r.area_name}</option>)}
        </select>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600" data-testid="proof-readonly-badge">قراءة فقط</span>
      </section>

      {all.error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800" data-testid="proof-error">{handleAppError(all.error, { scope: 'ops-contractor-proofs' }).message}</div>}
      {all.isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا إثباتات بهذا الفلتر" hint="لا متعهدين مطابقين لليوم/القاطع/المتعهد المختار، أو لم تُسجّل إثباتات بعد." /> : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="proofs-list">
          {rows.map((r) => <ProofCard key={r.contractor_user_id} r={r} />)}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">
        الصور تُعرض بروابط موقّعة قصيرة الصلاحية. عند غياب صورة من المنصة تظهر بطاقة الأرشيف الخارجي إن كانت مؤرشفة. التصحيح والاعتماد ليسا من هذه الصفحة.
        <Link to="/ops-room/contractor-headcounts" className="ms-1 font-bold text-[var(--portal-color)] underline">فتح حضوريات العمال</Link>
      </p>
    </div>
  )
}

function ProofCard({ r }: { r: ContractorPresenceProofRow }) {
  return (
    <li className="rounded-2xl border bg-white p-4 shadow-sm" data-testid={`proof-${r.contractor_user_id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-black">{r.contractor_name}</h3>
          <p className="text-xs text-slate-600">{r.area_name} · {PARENT_AR[r.parent_sector] ?? r.parent_sector}{r.shift ? ` · شفت ${SHIFT_AR[r.shift] ?? r.shift}` : ''}</p>
          <p className="text-[11px] text-slate-500">مسؤول القسم: {r.department_manager_name ?? '—'}{r.contractor_phone ? <> · <a href={`tel:${r.contractor_phone}`} className="inline-flex items-center gap-0.5 font-bold text-[var(--portal-color)]"><Phone size={10} />{r.contractor_phone}</a></> : null}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.checked_in ? (r.in_zone === false ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800') : 'bg-rose-50 text-rose-700'}`} data-testid="proof-checkin-badge">
          {r.checked_in ? <><Camera size={11} className="inline" /> تواجد {timeAr(r.checkin_at)}</> : 'لم يُثبت التواجد'}
        </span>
      </div>

      {r.checked_in && (
        <div className="mt-2 space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700" data-testid="proof-location">
            <span className={`inline-flex items-center gap-1 font-bold ${r.in_zone === false ? 'text-rose-700' : 'text-emerald-800'}`}><MapPin size={11} />{zoneLabel(r.in_zone)}</span>
            {r.accuracy_m != null && <span>دقة ±{Math.round(r.accuracy_m)} م</span>}
            {r.latitude != null && r.longitude != null && (
              <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-700 underline" data-testid="proof-map-link"><ExternalLink size={10} />فتح الموقع في الخرائط</a>
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ProofPhoto path={r.selfie_path} label="صورة المتعهد" testId="proof-photo-selfie" />
            <ProofPhoto path={r.team_photo_path} label="صورة العمال" testId="proof-photo-team" />
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="proof-headcounts">
        <ReadOnlyCount label="عدد المتعهد" value={r.contractor_headcount} testId="proof-contractor-headcount" />
        <ReadOnlyCount label="عدد المتابعة" value={r.follow_up_headcount} testId="proof-follow-up-headcount" />
        <ReadOnlyCount label="عدد القاطع" value={r.sector_manager_headcount} testId="proof-sector-manager-headcount" />
      </div>
    </li>
  )
}

function ReadOnlyCount({ label, value, testId }: { label: string; value: number | null; testId: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div className="text-xl font-black" data-testid={testId}>{value ?? '—'}</div>
      {value != null && <div className="text-[10px] text-slate-500">عمال: {Math.max(0, value - 1)}</div>}
    </div>
  )
}

function ProofPhoto({ path, label, testId }: { path: string | null; label: string; testId: string }) {
  const url = useContractorPhotoUrl(path)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!path) return <div className="flex h-24 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-bold text-slate-400" data-testid={`${testId}-none`}>لا {label}</div>
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative block h-24 w-full overflow-hidden rounded-xl bg-slate-100" data-testid={testId} aria-label={`تكبير ${label}`}>
        <ArchiveAwarePhoto bucket="contractor-photos" path={path} url={url.data} missing={url.isError} alt={label} className="h-full w-full object-cover" fallback={<span className="absolute inset-0 grid place-items-center text-[11px] text-slate-400">{url.isError ? 'تعذّر تحميل الصورة' : 'جارٍ التحميل…'}</span>} />
        <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
      </button>
      {open && url.data && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label={label} data-testid={`${testId}-lightbox`} onClick={() => setOpen(false)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white" aria-label="إغلاق الصورة" onClick={() => setOpen(false)}><X size={18} /></button>
          <img src={url.data} alt={label} className="max-h-[90vh] max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}
