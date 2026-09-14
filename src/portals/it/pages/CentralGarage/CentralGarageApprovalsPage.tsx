import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Droplets, Link2, RefreshCw, ShieldCheck, X, XCircle } from 'lucide-react'
import { EmptyState } from '@components/feedback/EmptyState'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import {
  useAssignGarageTankSector,
  useDecideGarageTankZero,
  useGarageTanks,
  useGarageZeroRequests,
} from '@features/central-garage/hooks'
import { garageUnitLabel } from '@features/central-garage/fuel-units'
import type { GarageTank, GarageTankZeroRequest } from '@features/central-garage/types'

type Decision = { request: GarageTankZeroRequest; approved: boolean } | null
type ParentSector = 'karrada' | 'zaafaraniya'

const sectorLabel: Record<ParentSector, string> = {
  karrada: 'كراج الكرادة',
  zaafaraniya: 'كراج الزعفرانية',
}

export default function CentralGarageApprovalsPage() {
  const requests = useGarageZeroRequests('pending')
  const tanks = useGarageTanks()
  const [decision, setDecision] = useState<Decision>(null)
  const unassigned = (tanks.data ?? []).filter((tank) => tank.parentSector === null)
  const hasError = tanks.isError || requests.isError

  return (
    <section className="space-y-5" dir="rtl" data-testid="garage-approvals-page">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-indigo-950 to-blue-800 p-5 text-white shadow-xl sm:p-6">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-blue-200">
          <ShieldCheck size={16} /> إجراء محمي
        </span>
        <h1 className="mt-2 text-2xl font-black">موافقات وإعداد خزانات الكراج</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-blue-100">
          راجع طلبات التصفير واربط الخزانات القديمة بقاطعها الصحيح. جميع القرارات تسجل خادمياً.
        </p>
      </header>

      {hasError ? (
        <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          <AlertTriangle className="mx-auto" aria-hidden="true" />
          <h2 className="mt-2 font-black">تعذر تحميل بيانات الخزانات والموافقات</h2>
          <p className="mt-1 text-sm">تحقق من الاتصال ثم أعد المحاولة. لم تُعرض أي حالة افتراضية مضللة.</p>
          <button type="button" onClick={() => void Promise.all([tanks.refetch(), requests.refetch()])} className="mx-auto mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-red-700 px-4 text-xs font-black text-white">
            <RefreshCw size={16} aria-hidden="true" />إعادة المحاولة
          </button>
        </div>
      ) : <>
      <UnassignedTanks tanks={unassigned} isLoading={tanks.isLoading} />

      <section aria-labelledby="zero-requests-title" className="space-y-4">
        <div>
          <h2 id="zero-requests-title" className="text-lg font-black text-slate-900">طلبات تصفير الخزانات</h2>
          <p className="text-sm text-slate-500">الموافقة تنفذ التصفير فوراً، والرفض يرسل السبب إلى الكراج.</p>
        </div>
        {requests.isLoading || tanks.isLoading ? (
          <div className="rounded-2xl bg-white p-12"><LoadingSpinner label="جارٍ تحميل الطلبات…" /></div>
        ) : (requests.data?.length ?? 0) === 0 ? (
          <EmptyState title="لا توجد طلبات تصفير معلقة" hint="ستظهر هنا الطلبات الواردة من بوابتي الكراج" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {requests.data?.map((request) => {
              const tank = tanks.data?.find((item) => item.id === request.tankId)
              return (
                <article key={request.id} className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm" data-testid={`zero-request-${request.id}`}>
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-amber-700">طلب معلق</p>
                      <h3 className="mt-1 text-lg font-black">{tank?.tankName ?? 'خزان الكراج'}</h3>
                      {tank?.parentSector && <p className="mt-1 text-xs font-bold text-indigo-700">{sectorLabel[tank.parentSector]}</p>}
                    </div>
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Droplets /></span>
                  </div>
                  <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Info label="الرصيد المطلوب تصفيره" value={`${request.requestedQuantity} ${garageUnitLabel(tank?.unit)}`} />
                    <Info label="الرصيد الحالي" value={`${tank?.currentQuantity ?? '—'} ${garageUnitLabel(tank?.unit)}`} />
                  </dl>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-400">سبب الطلب</p>
                    <p className="mt-1 text-sm font-bold text-slate-700">{request.reason}</p>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400">أُرسل: {new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(request.requestedAt))}</p>
                  {tank && tank.currentQuantity !== request.requestedQuantity && <p className="mt-3 rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700">تغير الرصيد بعد الطلب؛ سيمنع الخادم الموافقة القديمة.</p>}
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button data-testid={`approve-zero-${request.id}`} onClick={() => setDecision({ request, approved: true })} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-black text-white"><CheckCircle2 size={16} />موافقة</button>
                    <button data-testid={`reject-zero-${request.id}`} onClick={() => setDecision({ request, approved: false })} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-50 text-xs font-black text-red-700"><XCircle size={16} />رفض</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      </>}
      {decision && <DecisionDialog decision={decision} onClose={() => setDecision(null)} />}
    </section>
  )
}

function UnassignedTanks({ tanks, isLoading }: { tanks: GarageTank[]; isLoading: boolean }) {
  const assign = useAssignGarageTankSector()
  const [selections, setSelections] = useState<Record<string, ParentSector>>({})
  if (isLoading) return null
  if (tanks.length === 0) return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800" data-testid="all-tanks-assigned">
      <CheckCircle2 className="shrink-0" size={20} />جميع الخزانات مرتبطة بكراجاتها.
    </div>
  )
  return (
    <section className="rounded-3xl border border-orange-200 bg-orange-50/60 p-4 sm:p-5" aria-labelledby="unassigned-tanks-title">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-orange-700" />
        <div><h2 id="unassigned-tanks-title" className="font-black text-orange-950">خزانات قديمة تحتاج تحديد الكراج</h2><p className="mt-1 text-xs leading-5 text-orange-800">لن تظهر هذه الخزانات لأي كراج قبل ربطها. تحقق من السجلات ثم اختر القاطع الصحيح.</p></div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {tanks.map((tank) => {
          const selected = selections[tank.id] ?? 'karrada'
          return (
            <article key={tank.id} className="rounded-2xl border border-orange-200 bg-white p-4" data-testid={`unassigned-tank-${tank.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-black text-slate-900">{tank.tankName}</h3><p className="text-xs text-slate-500">{tank.currentQuantity.toLocaleString('ar-IQ')} {garageUnitLabel(tank.unit)}</p></div><Link2 className="text-orange-600" size={20} /></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="sr-only" htmlFor={`tank-sector-${tank.id}`}>كراج الخزان {tank.tankName}</label>
                <select id={`tank-sector-${tank.id}`} data-testid={`tank-sector-${tank.id}`} value={selected} onChange={(event) => setSelections((current) => ({ ...current, [tank.id]: event.target.value as ParentSector }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
                  <option value="karrada">كراج الكرادة</option><option value="zaafaraniya">كراج الزعفرانية</option>
                </select>
                <button type="button" disabled={assign.isPending} onClick={() => assign.mutate({ tankId: tank.id, parentSector: selected })} className="h-10 rounded-xl bg-orange-700 px-4 text-xs font-black text-white disabled:opacity-50">ربط الخزان</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function DecisionDialog({ decision, onClose }: { decision: NonNullable<Decision>; onClose: () => void }) {
  const [note, setNote] = useState('')
  const decide = useDecideGarageTankZero()
  const valid = decision.approved || note.trim().length >= 3
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!valid) return
    decide.mutate({ requestId: decision.request.id, approved: decision.approved, note: note.trim() || undefined }, { onSuccess: onClose })
  }
  return (
    <div onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="قرار طلب التصفير">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex justify-between gap-3"><h2 className="text-xl font-black">{decision.approved ? 'تأكيد الموافقة والتصفير' : 'رفض طلب التصفير'}</h2><button type="button" aria-label="إغلاق" onClick={onClose}><X /></button></div>
        <p className={`mt-4 rounded-xl p-3 text-sm ${decision.approved ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>{decision.approved ? 'سيُصفّر الخزان فوراً بعد التأكيد، ولن يمكن التراجع عن حركة المخزون.' : 'اكتب سبب الرفض ليصل إلى مسؤول الكراج.'}</p>
        <textarea autoFocus data-testid="decision-note" required={!decision.approved} value={note} onChange={(event) => setNote(event.target.value)} className="mt-4 min-h-24 w-full rounded-xl border p-3 text-sm" placeholder={decision.approved ? 'ملاحظة الموافقة (اختيارية)' : 'سبب الرفض'} />
        <button data-testid="decision-submit" disabled={!valid || decide.isPending} className={`mt-4 h-11 w-full rounded-xl font-black text-white disabled:opacity-40 ${decision.approved ? 'bg-emerald-600' : 'bg-red-600'}`}>{decide.isPending ? 'جارٍ التنفيذ…' : decision.approved ? 'موافقة وتنفيذ التصفير' : 'تأكيد الرفض'}</button>
      </form>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-amber-50 p-3"><dt className="text-[11px] text-amber-700">{label}</dt><dd className="mt-1 font-black text-amber-950">{value}</dd></div>
}
