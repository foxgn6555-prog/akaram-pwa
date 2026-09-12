import { Download, History, X } from 'lucide-react'
import { useMaintenanceEvents } from '../hooks'

const dt = (value: string) =>
  new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(value))

export function MaintenanceTimelineDialog({
  caseId,
  title,
  onClose,
}: {
  caseId: string
  title: string
  onClose: () => void
}) {
  const events = useMaintenanceEvents(caseId)
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <section
        className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
        dir="rtl"
      >
        <header className="flex items-center gap-3 bg-slate-950 p-5 text-white">
          <span className="grid size-10 place-items-center rounded-xl bg-cyan-500/20">
            <History />
          </span>
          <div>
            <h2 className="font-black">التسلسل الزمني للصيانة</h2>
            <p className="mt-1 text-xs text-slate-300">{title}</p>
          </div>
          <button
            onClick={() =>
              void import('../export-maintenance').then(({ exportMaintenanceTimeline }) =>
                exportMaintenanceTimeline(title, events.data ?? []),
              )
            }
            disabled={!(events.data ?? []).length}
            className="mr-auto flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            <Download size={14} /> Excel
          </button>
          <button
            onClick={onClose}
            aria-label="إغلاق التسلسل الزمني"
            className="rounded-xl p-2 hover:bg-white/10"
          >
            <X />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {events.isLoading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
          ) : (events.data ?? []).length ? (
            <div className="space-y-1" aria-label="أحداث دورة الصيانة">
              {(events.data ?? []).map((event, index) => (
                <article key={event.event_key} className="relative flex gap-3 pb-5">
                  <span
                    className={`mt-1 size-3 shrink-0 rounded-full ring-4 ring-slate-100 ${event.event_type === 'completion' ? 'bg-emerald-500' : event.event_type === 'movement' ? 'bg-cyan-500' : event.event_type === 'part' ? 'bg-amber-500' : 'bg-violet-500'}`}
                  />
                  {index < (events.data?.length ?? 0) - 1 && (
                    <i className="absolute right-[5px] top-4 h-full w-px bg-slate-200" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm">{event.title}</b>
                      <time className="text-[11px] text-slate-400">{dt(event.happened_at)}</time>
                    </div>
                    {event.details && (
                      <p className="mt-1 text-xs leading-5 text-slate-600">{event.details}</p>
                    )}
                    {event.progress !== null && (
                      <span className="mt-2 inline-block rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold">
                        الإنجاز {event.progress}%
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">
              لا توجد أحداث صيانة مسجلة لهذه الانطلاقية.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
