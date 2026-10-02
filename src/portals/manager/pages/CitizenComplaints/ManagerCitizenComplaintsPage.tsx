/** مسؤول القسم — شكاوى المواطنين المسندة إليّ من غرفة العمليات (00168): متابعة، تعليق بسبب، إنجاز بنتيجة تظهر للمواطن */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import { CheckCircle2, MessageSquareText } from 'lucide-react'
import { CITIZEN_STATUS_LABEL, useAssignedCitizenComplaints, type CitizenStatus } from '@features/citizen'
import { ComplaintDetail, STATUS_TONE } from '@portals/ops-room/pages/CitizenComplaints/OpsCitizenComplaintsPage'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

export default function ManagerCitizenComplaintsPage() {
  const { data = [], isLoading } = useAssignedCitizenComplaints()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const shown = useMemo(() => data.filter((c) => filter === 'all' || (filter === 'open' ? c.status !== 'resolved' : c.status === 'resolved')), [data, filter])
  const selected = data.find((c) => c.id === params.get('c')) ?? null
  const counts = (s: CitizenStatus) => data.filter((c) => c.status === s).length
  return (
    <section className="space-y-5" dir="rtl" data-testid="mgr-citizen-page">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-blue-950 to-teal-900 p-6 text-white shadow-xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs"><MessageSquareText size={14} />من غرفة العمليات</span>
        <h1 className="mt-3 text-2xl font-black">شكاوى المواطنين المسندة إليّ</h1>
        <p className="mt-2 text-sm leading-7 text-blue-100">شكاوى وردت من المواطنين مباشرة عبر صفحة الشركة وأسندتها غرفة العمليات إليك. عند الإنجاز اكتب نتيجة المعالجة — تظهر للمواطن.</p>
        <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
          {(['in_progress', 'on_hold', 'resolved'] as const).map((s) => <div key={s} className="rounded-2xl bg-white/10 p-3 text-center"><strong className="text-2xl">{counts(s)}</strong><p className="text-[11px] text-blue-100">{CITIZEN_STATUS_LABEL[s]}</p></div>)}
        </div>
      </header>
      <div className="flex flex-wrap gap-2">{([['open', 'تحتاج إجراء'], ['resolved', 'المنجزة'], ['all', 'الكل']] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={clsx('rounded-xl px-3 py-2 text-xs font-bold', filter === v ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600')}>{l}</button>)}</div>
      {isLoading && <LoadingSpinner />}
      {!isLoading && !shown.length && <div className="rounded-3xl border border-dashed bg-white p-14 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={40} /><h2 className="mt-3 font-black">لا توجد شكاوى في هذا القسم</h2></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.id}><button type="button" onClick={() => setParams({ c: c.id })} className={clsx('w-full rounded-2xl bg-white p-4 text-right ring-1', selected?.id === c.id ? 'ring-2 ring-blue-500' : 'ring-slate-200')}>
              <div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-black tracking-wider text-blue-700" dir="ltr">{c.ref_no}</p><p className="text-sm font-black">{c.full_name}</p></div><span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-black', STATUS_TONE[c.status])}>{c.status_label}</span></div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{c.details}</p>
            </button></li>
          ))}
        </ul>
        <div className="lg:sticky lg:top-2 lg:self-start">{selected && <ComplaintDetail c={selected} managerMode onClose={() => setParams({})} />}</div>
      </div>
    </section>
  )
}
