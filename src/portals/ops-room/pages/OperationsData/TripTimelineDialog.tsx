/**
 * تسلسل الرحلة الكامل لانطلاقية واحدة (غرفة العمليات):
 * كراج → موقع العمل (بدء العمل الفعلي) → المحطة/الوزن → عطل → صيانة → موقع → كراج.
 * المصدر: operational_departure_timeline (00148). لا علاقة له بالبصمة إطلاقاً.
 */
import { Route, X } from 'lucide-react'
import { useOpsDepartureTimeline } from '@features/vehicle-operations/hooks'
import type { TripTimelineEvent } from '@sdk/vehicle-operations.sdk'

const dt = (value: string) =>
  new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(
    new Date(value),
  )
const gap = (m: number) => (m <= 0 ? '' : m < 60 ? `+${m} د` : `+${Math.floor(m / 60)} س ${m % 60} د`)

const typeMeta: Record<TripTimelineEvent['event_type'], { label: string; dot: string; chip: string }> = {
  departure: { label: 'الكراج', dot: 'bg-slate-900', chip: 'bg-slate-100 text-slate-800' },
  work_start: { label: 'بدء العمل', dot: 'bg-emerald-600', chip: 'bg-emerald-50 text-emerald-800' },
  movement: { label: 'حركة', dot: 'bg-cyan-600', chip: 'bg-cyan-50 text-cyan-800' },
  weighing: { label: 'المحطة', dot: 'bg-indigo-600', chip: 'bg-indigo-50 text-indigo-800' },
  breakdown: { label: 'عطل', dot: 'bg-rose-600', chip: 'bg-rose-50 text-rose-800' },
  maintenance: { label: 'صيانة', dot: 'bg-violet-600', chip: 'bg-violet-50 text-violet-800' },
}

export function TripTimelineDialog({
  departureId,
  title,
  onClose,
}: {
  departureId: string
  title: string
  onClose: () => void
}) {
  const { data = [], isLoading, isError } = useOpsDepartureTimeline(departureId)
  const first = data[0]?.happened_at
  const last = data[data.length - 1]?.happened_at
  const span = first && last ? Math.floor((new Date(last).getTime() - new Date(first).getTime()) / 60000) : 0
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4" role="dialog" aria-modal="true" data-testid="trip-timeline-dialog">
      <section className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl" dir="rtl">
        <header className="flex items-center gap-3 bg-slate-950 p-5 text-white">
          <span className="grid size-10 place-items-center rounded-xl bg-cyan-500/20">
            <Route />
          </span>
          <div className="flex-1">
            <h2 className="font-black">تسلسل الرحلة الكامل</h2>
            <p className="mt-1 text-xs text-slate-300">{title}</p>
          </div>
          {data.length > 0 && (
            <span className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-black" data-testid="trip-timeline-span">
              {data.length} حدثاً · {span < 60 ? `${span} د` : `${Math.floor(span / 60)} س ${span % 60} د`}
            </span>
          )}
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-xl bg-white/10 p-2 hover:bg-white/20">
            <X size={16} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {isLoading && <p className="text-xs text-slate-500">جارٍ تحميل التسلسل…</p>}
          {isError && <p className="text-xs font-bold text-rose-700">تعذر تحميل تسلسل الرحلة</p>}
          {!isLoading && !isError && data.length === 0 && (
            <p className="text-xs text-slate-500">لا أحداث مسجلة لهذه الانطلاقية</p>
          )}
          <ol className="relative space-y-3 border-r-2 border-slate-200 pr-5">
            {data.map((e) => {
              const meta = typeMeta[e.event_type] ?? typeMeta.movement
              return (
                <li key={e.event_key} className="relative" data-testid={`trip-event-${e.event_key}`}>
                  <span className={`absolute -right-[1.55rem] top-1.5 size-3 rounded-full ring-4 ring-white ${meta.dot}`} />
                  <div className="rounded-2xl border bg-white p-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${meta.chip}`}>{meta.label}</span>
                      <b className="text-sm text-slate-900">{e.title}</b>
                      {e.minutes_since_prev > 0 && (
                        <span className="text-[10px] font-black text-slate-400">{gap(e.minutes_since_prev)}</span>
                      )}
                      <span className="mr-auto text-[11px] font-bold text-slate-500">{dt(e.happened_at)}</span>
                    </div>
                    {e.details && <p className="mt-1 text-xs leading-6 text-slate-600">{e.details}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </section>
    </div>
  )
}
