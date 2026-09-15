/**
 * فولدر القاطع — كل تذكرات القاطع بجميع صورها (تصفح قراءًة)
 * التذكرة كاملة تدخل الفولدر، حتى لو دخلت صور محددة منها إلى التصميم
 */
import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { MODE_LABEL, SECTOR_LABEL, WORK_TYPES, type MediaMode, type SectorParent } from '@features/media/constants'
import { useSubmissionPhotos, useSubmissions } from '@features/media/hooks'
import PhotoGrid from '../../components/PhotoGrid'
import { DayFilter } from '../../components/DayFilter'
import { baghdadDay } from '@features/media/constants'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))

export default function MediaFolderPage({ sector }: { sector: SectorParent }) {
  const [workType, setWorkType] = useState('')
  const [day, setDay] = useState('')
  const tickets = useSubmissions(sector, 'all', workType || null)
  const rows = (tickets.data ?? []).filter(
    (t) => !day || (t.event_date ?? t.created_at).slice(0, 10) === day,
  )
  const photoTotal = rows.reduce((sum, t) => sum + t.photo_count, 0)

  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-indigo-900 p-6 text-white">
        <p className="flex items-center gap-2 text-xs">
          <FolderOpen size={17} />
          المجلد الدائم لصور القاطع
        </p>
        <h1 className="mt-2 text-2xl font-black">{SECTOR_LABEL[sector]} — فولدر الصور</h1>
        <p className="mt-1 text-sm text-indigo-100">
          كل التذاكر بجميع صورها (النشطة والمؤرشفة) — تصفح كامل دون تحديد.
        </p>
      </header>

      <div className="space-y-3 rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="تصفية حسب النوع"
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            className="h-11 rounded-xl border px-3 text-sm"
          >
            <option value="">كل الأنواع</option>
            {WORK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <DayFilter value={day} onChange={setDay} />
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-black">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{rows.length} تذكرة</span>
          <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-800">{photoTotal} صورة</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">
            {rows.filter((t) => (t.event_date ?? t.created_at).slice(0, 10) === baghdadDay()).length} تذكرة اليوم
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((t) => (
          <FolderTicket key={t.id} ticketId={t.id} title={t.title} mode={t.mode} workType={t.work_type}
            date={t.event_date ?? t.created_at} archived={t.status === 'archived'} />
        ))}
        {!tickets.isLoading && rows.length === 0 && (
          <p className="rounded-2xl border bg-white p-12 text-center text-slate-500">
            <FolderOpen className="mx-auto mb-2 text-slate-300" size={32} />
            لا توجد تذكرات في هذا الفولدر.
          </p>
        )}
      </div>
    </section>
  )
}

function FolderTicket({
  ticketId,
  title,
  mode,
  workType,
  date,
  archived,
}: {
  ticketId: string
  title: string
  mode: string
  workType: string | null
  date: string
  archived: boolean
}) {
  const [open, setOpen] = useState(false)
  const photos = useSubmissionPhotos(open ? ticketId : null)
  const items = (photos.data ?? []).map((p) => ({ id: p.id, path: p.storage_path, caption: p.caption }))

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${archived ? 'opacity-70' : ''}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-3 text-right">
        <span
          className={`rounded-lg px-2 py-1 text-[11px] font-black text-white ${
            mode === 'campaign' ? 'bg-emerald-700' : mode === 'school' ? 'bg-violet-700' : 'bg-slate-700'
          }`}
        >
          {MODE_LABEL[mode as MediaMode] ?? mode}
        </span>
        <b className="text-sm">{title}</b>
        {workType && (
          <span className="rounded-full bg-cyan-50 px-2 py-1 text-[11px] font-bold text-cyan-800">{workType}</span>
        )}
        {archived && (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">مؤرشفة</span>
        )}
        <span className="mr-auto text-xs text-slate-400">
          {dt(date)} · {photos.data?.length ?? '…'} صورة
        </span>
      </button>
      {open && (
        <div className="mt-3">
          {photos.isLoading ? (
            <LoadingSpinner label="جارٍ تحميل الصور…" />
          ) : (
            <PhotoGrid items={items} />
          )}
        </div>
      )}
    </article>
  )
}
