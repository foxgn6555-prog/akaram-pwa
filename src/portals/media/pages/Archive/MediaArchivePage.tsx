/**
 * أرشيف الإعلام — التذكرات المؤرشفة + التصاميم المكتملة
 */
import { Archive, LayoutTemplate } from 'lucide-react'
import { Link } from 'react-router'
import { MODE_LABEL, PERIOD_LABEL, SECTOR_LABEL, type MediaMode, type PeriodType, type SectorParent } from '@features/media/constants'
import { useDesigns, useSubmissions } from '@features/media/hooks'

const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))

export default function MediaArchivePage() {
  const archived = useSubmissions(null, 'archived')
  const designs = useDesigns(null)
  const completed = (designs.data ?? []).filter((d) => d.status === 'completed')

  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-slate-800 p-6 text-white">
        <p className="flex items-center gap-2 text-xs">
          <Archive size={17} />
          المحتوى المؤرشف
        </p>
        <h1 className="mt-2 text-2xl font-black">أرشيف الإعلام</h1>
        <p className="mt-1 text-sm text-slate-300">
          التذكرات المؤرشفة بعد المتابعة + التصاميم المكتملة لكل القواطع.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-black">التصاميم المكتملة ({completed.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {completed.map((d) => (
            <Link
              key={d.id}
              to={`/media/designs?open=${d.id}`}
              className="rounded-2xl border bg-white p-4 shadow-sm transition hover:border-fuchsia-400"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-fuchsia-700 px-2 py-1 text-[11px] font-black text-white">
                  {SECTOR_LABEL[d.sector_parent as SectorParent] ?? d.sector_parent}
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-700">
                  مكتمل
                </span>
                <span className="mr-auto text-[11px] text-slate-400">{d.photo_count} صورة</span>
              </div>
              <h3 className="mt-2 text-sm font-black">{d.title}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {PERIOD_LABEL[d.period_type as PeriodType] ?? d.period_type} · {d.period_start} ← {d.period_end} ·{' '}
                {d.completed_at ? dt(d.completed_at) : ''}
              </p>
            </Link>
          ))}
          {!completed.length && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-xs text-slate-400 sm:col-span-2">
              <LayoutTemplate className="mx-auto mb-2 text-slate-300" size={26} />
              لا توجد تصاميم مكتملة بعد.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-black">التذكرات المؤرشفة ({(archived.data ?? []).length})</h2>
        <div className="space-y-2">
          {(archived.data ?? []).map((t) => (
            <article key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4">
              <span className="rounded-lg bg-slate-700 px-2 py-1 text-[11px] font-black text-white">
                {MODE_LABEL[t.mode as MediaMode] ?? t.mode}
              </span>
              <b className="text-sm">{t.title}</b>
              {t.work_type && (
                <span className="rounded-full bg-cyan-50 px-2 py-1 text-[11px] font-bold text-cyan-800">
                  {t.work_type}
                </span>
              )}
              <span className="text-xs text-slate-500">{t.photo_count} صورة</span>
              <span className="mr-auto text-xs text-slate-400">
                {SECTOR_LABEL[t.sector_parent as SectorParent] ?? t.sector_parent} · {dt(t.created_at)}
                {t.archive_reason ? ` · ${t.archive_reason}` : ''}
              </span>
            </article>
          ))}
          {!archived.isLoading && (archived.data ?? []).length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-xs text-slate-400">
              لا توجد تذكرات مؤرشفة.
            </p>
          )}
        </div>
      </section>
    </section>
  )
}
